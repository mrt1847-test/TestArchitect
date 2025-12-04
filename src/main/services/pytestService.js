/**
 * Pytest 실행 서비스
 * pytest를 사용하여 테스트를 실행하고 결과를 파싱
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const PythonRuntime = require('./pythonRuntime');

/**
 * Pytest 실행 결과 타입 정의
 * @typedef {Object} PytestExecutionResult
 * @property {boolean} success - 실행 성공 여부
 * @property {Object|null} data - 파싱된 JSON 리포트 데이터
 * @property {string} stdout - 표준 출력
 * @property {string} stderr - 표준 에러 출력
 * @property {string} error - 에러 메시지 (실패 시)
 */

class PytestService {
  /** @type {PythonRuntimeInfo|null} Python 런타임 정보 캐시 */
  static _runtimeCache = null;

  /**
   * Python 런타임 가져오기 (캐시 사용)
   * @private
   * @returns {Promise<PythonRuntimeInfo>} Python 런타임 정보
   */
  static async _getRuntime() {
    if (!this._runtimeCache) {
      this._runtimeCache = await PythonRuntime.getRuntime();
    }
    return this._runtimeCache;
  }

  /**
   * Pytest로 테스트 실행 (단일 파일 또는 여러 파일)
   * @param {string|string[]} testFiles - 실행할 테스트 파일명(들) (또는 경로)
   * @param {string[]} args - 추가 pytest 인자 배열
   * @param {Object} options - 실행 옵션
   * @param {boolean} options.parallel - 병렬 실행 여부
   * @param {string|number} options.workers - 병렬 워커 수 ('auto' 또는 숫자)
   * @param {number} options.reruns - 실패 시 재시도 횟수
   * @param {number} options.rerunsDelay - 재시도 전 대기 시간(초)
   * @param {number|null} options.maxFailures - 최대 실패 허용 수
   * @param {number} options.timeout - 테스트 타임아웃(초)
   * @param {boolean} options.captureScreenshots - 스크린샷 자동 캡처 여부
   * @param {boolean} options.htmlReport - HTML 리포트 생성 여부
   * @param {boolean} options.headless - 헤드리스 모드 여부 (기본값: false, 브라우저 표시)
   * @returns {Promise<PytestExecutionResult>} 실행 결과
   */
  static async runTests(testFiles, args = [], options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        // Python 런타임 가져오기
        const runtime = await this._getRuntime();

        // 단일 파일 또는 여러 파일 처리
        const files = Array.isArray(testFiles) ? testFiles : [testFiles];
        
        // 실행 옵션 병합 (기본값 + 사용자 옵션)
        const execOptions = {
          ...config.pytest.defaultOptions,
          ...options
        };
        
        // 실행 디렉토리 (옵션에서 지정 가능, 기본값은 scripts 디렉토리)
        const execCwd = execOptions.cwd || config.paths.scripts;
        const testPaths = files.map(file => this._getTestPath(file, execCwd));

        // 모든 테스트 파일 존재 확인
        for (const testPath of testPaths) {
          if (!this._validateTestFile(testPath)) {
            reject({
              success: false,
              error: `테스트 파일을 찾을 수 없습니다: ${testPath}`,
              stderr: ''
            });
            return;
          }
        }

        // 리포트 파일 경로 생성
        const reportFile = this._getReportFilePath(execCwd);
        const htmlReportFile = execOptions.htmlReport 
          ? this._getHtmlReportFilePath(execCwd) 
          : null;

        // 디버깅: pytest 실행 전 상태 확인
        console.log('[DEBUG] ========== pytest 실행 전 상태 확인 ==========');
        console.log('[DEBUG] execCwd:', execCwd);
        console.log('[DEBUG] testPaths:', testPaths);
        
        // conftest.py 존재 여부 확인
        if (execCwd) {
          const conftestPath = path.join(execCwd, 'conftest.py');
          const conftestExists = fs.existsSync(conftestPath);
          console.log('[DEBUG] conftest.py 경로:', conftestPath);
          console.log('[DEBUG] conftest.py 존재 여부:', conftestExists);
          
          if (conftestExists) {
            const conftestStats = fs.statSync(conftestPath);
            console.log('[DEBUG] conftest.py 크기:', conftestStats.size, 'bytes');
            console.log('[DEBUG] conftest.py 수정 시간:', conftestStats.mtime);
          }
        }
        
        // 테스트 파일 존재 여부 확인
        testPaths.forEach((testPath, index) => {
          const exists = fs.existsSync(testPath);
          console.log(`[DEBUG] 테스트 파일 ${index + 1} 경로:`, testPath);
          console.log(`[DEBUG] 테스트 파일 ${index + 1} 존재 여부:`, exists);
          if (exists) {
            const stats = fs.statSync(testPath);
            console.log(`[DEBUG] 테스트 파일 ${index + 1} 크기:`, stats.size, 'bytes');
            console.log(`[DEBUG] 테스트 파일 ${index + 1} 수정 시간:`, stats.mtime);
          }
        });
        
        // Pytest 명령어 구성 (런타임 정보 사용)
        const command = this._buildCommand(testPaths, reportFile, htmlReportFile, args, execOptions, runtime, execCwd);
        
        // 디버깅: 실행 명령어 로깅
        console.log('[DEBUG] pytest 실행 명령어:', command);
        console.log('[DEBUG] ========== pytest 실행 시작 ==========');

        // Playwright 환경 변수 설정
        const playwrightEnv = PythonRuntime.getPlaywrightEnv(runtime);
        
        // --driver 옵션을 환경 변수로 전달 (conftest.py에서 환경 변수로 읽음)
        const driver = execOptions.driver || 'playwright';
        playwrightEnv.TEST_DRIVER = driver;
        
        // 경로 확인: Python에서 실제 작업 디렉토리와 conftest.py 경로 확인
        if (execCwd) {
          // 테스트 파일의 절대 경로 사용
          const testFileAbsPath = testPaths.length > 0 ? testPaths[0] : '';
          
          // Python 경로 확인을 위한 별도 스크립트 파일 생성 (SyntaxError 방지)
          const pathCheckScript = path.join(execCwd, '_path_check.py');
          const pathCheckCode = `import os
import sys

print('=== Python 경로 확인 ===')
print('CWD:', os.getcwd())
print('CWD exists:', os.path.exists(os.getcwd()))

conftest_path = os.path.join(os.getcwd(), 'conftest.py')
print('conftest.py path:', conftest_path)
print('conftest.py exists:', os.path.exists(conftest_path))
if os.path.exists(conftest_path):
    print('conftest.py abs path:', os.path.abspath(conftest_path))
    stat = os.stat(conftest_path)
    print('conftest.py size:', stat.st_size, 'bytes')

test_file = r'${testFileAbsPath.replace(/\\/g, '/').replace(/'/g, "\\'")}'
print('test file:', test_file)
print('test file exists:', os.path.exists(test_file))
if os.path.exists(test_file):
    stat = os.stat(test_file)
    print('test file size:', stat.st_size, 'bytes')

files = os.listdir(os.getcwd()) if os.path.exists(os.getcwd()) else []
py_files = [f for f in files if f.endswith('.py')]
print('Files in CWD:', py_files)
print('===================')`;
          
          try {
            fs.writeFileSync(pathCheckScript, pathCheckCode, 'utf8');
            const pathCheckCmd = `"${runtime.pythonPath}" "${pathCheckScript}"`;
            
            console.log('[DEBUG] ========== 경로 확인 (Python) ==========');
            console.log('[DEBUG] execCwd (Node.js):', execCwd);
            console.log('[DEBUG] execCwd exists (Node.js):', fs.existsSync(execCwd));
            console.log('[DEBUG] 테스트 파일 절대 경로:', testFileAbsPath);
            
            exec(
              pathCheckCmd,
              {
                cwd: execCwd,
                timeout: 5000,
                env: playwrightEnv
              },
              (pathError, pathStdout, pathStderr) => {
                // 임시 스크립트 파일 삭제
                try {
                  if (fs.existsSync(pathCheckScript)) {
                    fs.unlinkSync(pathCheckScript);
                  }
                } catch (cleanupError) {
                  console.warn('[DEBUG] 경로 확인 스크립트 삭제 실패:', cleanupError.message);
                }
                
                if (pathError) {
                  console.error('[DEBUG] 경로 확인 실패:', pathError.message);
                  if (pathStderr) console.error('[DEBUG] 경로 확인 stderr:', pathStderr);
                } else {
                  console.log('[DEBUG] Python 경로 확인 결과:');
                  if (pathStdout) console.log(pathStdout);
                  if (pathStderr) console.warn('[DEBUG] 경로 확인 stderr:', pathStderr);
                }
                console.log('[DEBUG] ======================================');
              }
            );
          } catch (writeError) {
            console.error('[DEBUG] 경로 확인 스크립트 생성 실패:', writeError.message);
          }
        }
        
        // 테스트 실행
        // ✅ shell: false로 변경하여 cwd가 제대로 적용되도록 함
        // Windows에서 shell: true일 때 cwd가 제대로 적용되지 않을 수 있음
        exec(
          command,
          {
            cwd: execCwd,
            timeout: config.python.timeout,
            maxBuffer: 10 * 1024 * 1024, // 10MB
            encoding: 'utf8', // ✅ UTF-8 인코딩 명시
            shell: false, // ✅ shell: false로 변경 (cwd가 제대로 적용되도록)
            env: playwrightEnv // Playwright 브라우저 경로 포함
          },
          async (error, stdout, stderr) => {
            try {
              // 디버깅: pytest 실행 결과 로깅
              console.log('[DEBUG] ========== pytest exec 콜백 호출됨 ==========');
              console.log('[DEBUG] PYTEST EXEC CALLBACK CALLED AT:', new Date().toISOString());
              console.log('[DEBUG] pytest 실행 완료');
              console.log('[DEBUG] exit code:', error ? error.code : 0);
              console.log('[DEBUG] stdout 길이:', stdout?.length || 0);
              console.log('[DEBUG] stderr 길이:', stderr?.length || 0);
              if (stdout && stdout.length > 0) {
                // 전체 stdout 출력 (에러 메시지 확인을 위해)
                console.log('[DEBUG] stdout 전체:\n', stdout);
              }
              if (stderr && stderr.length > 0) {
                console.log('[DEBUG] stderr 전체:\n', stderr);
              }
              
              // 리포트 파일 읽기
              const reportData = this._readReportFile(reportFile);
              
              if (reportData) {
                console.log('[DEBUG] 리포트 데이터 summary:', reportData.summary);
                console.log('[DEBUG] 리포트 데이터 tests 개수:', reportData.tests?.length || 0);
              } else {
                console.warn('[DEBUG] 리포트 파일이 없거나 읽을 수 없음:', reportFile);
              }

              // 리포트 파일 정리
              this._cleanupReportFile(reportFile);

              // pytest는 테스트 실패 시에도 exit code 1을 반환하므로
              // error가 있어도 리포트가 있으면 성공으로 처리
              if (reportData) {
                resolve({
                  success: true,
                  data: reportData,
                  stdout: stdout,
                  stderr: stderr || ''
                });
              } else if (error) {
                // 리포트가 없고 에러가 있는 경우
                reject({
                  success: false,
                  error: error.message || '테스트 실행 실패',
                  stderr: stderr || '',
                  stdout: stdout || ''
                });
              } else {
                // 리포트가 없지만 에러도 없는 경우 (이상한 상황)
                resolve({
                  success: true,
                  data: {
                    summary: {
                      total: 0,
                      passed: 0,
                      failed: 0,
                      skipped: 0,
                      error: 0
                    },
                    note: '테스트 결과 리포트를 생성할 수 없었습니다.'
                  },
                  stdout: stdout,
                  stderr: stderr || ''
                });
              }
            } catch (parseError) {
              this._cleanupReportFile(reportFile);
              reject({
                success: false,
                error: `결과 파싱 실패: ${parseError.message}`,
                stderr: stderr || '',
                stdout: stdout || ''
              });
            }
          }
        );
      } catch (error) {
        // 런타임 가져오기 실패 등 초기화 오류 처리
        reject({
          success: false,
          error: error.message || '테스트 실행 초기화 실패',
          stderr: '',
          stdout: ''
        });
      }
    });
  }

  /**
   * 테스트 파일 경로 생성
   * @private
   * @param {string} testFile - 테스트 파일명
   * @returns {string} 전체 파일 경로
   */
  static _getTestPath(testFile, baseDir = null) {
    // 이미 전체 경로인 경우
    if (path.isAbsolute(testFile)) {
      return testFile;
    }
    // 상대 경로인 경우 baseDir 또는 scripts 디렉토리 기준
    const base = baseDir || config.paths.scripts;
    return path.join(base, testFile);
  }

  /**
   * 테스트 파일 유효성 검증
   * @private
   * @param {string} testPath - 테스트 파일 경로
   * @returns {boolean} 유효성 여부
   */
  static _validateTestFile(testPath) {
    if (!fs.existsSync(testPath)) {
      return false;
    }

    const ext = path.extname(testPath);
    if (!config.python.supportedExtensions.includes(ext)) {
      return false;
    }

    return true;
  }

  /**
   * 리포트 파일 경로 생성
   * @private
   * @returns {string} 리포트 파일 경로
   */
  static _getReportFilePath(baseDir = config.pytest.reportDir) {
    const timestamp = Date.now();
    const reportDir = path.join(baseDir, '.pytest-reports');
    
    // 리포트 디렉토리가 없으면 생성
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    return path.join(reportDir, `pytest-report-${timestamp}.json`);
  }

  /**
   * Pytest 실행 명령어 구성
   * @private
   * @param {string|string[]} testPaths - 테스트 파일 경로(들)
   * @param {string} reportFile - JSON 리포트 파일 경로
   * @param {string|null} htmlReportFile - HTML 리포트 파일 경로
   * @param {string[]} args - 추가 인자 배열
   * @param {Object} options - 실행 옵션
   * @param {PythonRuntimeInfo} runtime - Python 런타임 정보
   * @param {string} execCwd - 실행 디렉토리
   * @returns {string} 실행 명령어
   */
  static _buildCommand(testPaths, reportFile, htmlReportFile, args = [], options = {}, runtime, execCwd = null) {
    // 여러 파일을 배열로 처리
    const paths = Array.isArray(testPaths) ? testPaths : [testPaths];
    
    // ✅ 3️⃣ pytest는 항상 절대 경로로 직접 전달
    // cwd가 날아가도 pytest가 파일을 직접 잡고 실행할 수 있도록
    const testTargets = paths.map(p => {
      let absolutePath;
      if (path.isAbsolute(p)) {
        absolutePath = path.normalize(p);
      } else {
        // 상대 경로면 execCwd 또는 현재 디렉토리 기준으로 절대 경로 변환
        const base = execCwd || process.cwd();
        absolutePath = path.normalize(path.resolve(base, p));
      }
      // Windows에서 한글 경로를 안전하게 처리하기 위해 따옴표로 감싸기
      return `"${absolutePath}"`;
    });
    
    console.log('[DEBUG] 테스트 타겟 (파일명/절대 경로):', testTargets);
    
    // 경로를 그대로 사용 (이미 따옴표로 감싸져 있음)
    const escapedPaths = testTargets;
    // 리포트 파일 경로도 정규화
    const escapedReportFile = `"${path.normalize(reportFile)}"`;
    
    // 디버깅: 실행 디렉토리 상태 확인
    console.log('[DEBUG] _buildCommand 호출됨');
    console.log('[DEBUG] execCwd:', execCwd);
    if (execCwd) {
      const conftestPath = path.join(execCwd, 'conftest.py');
      const conftestExists = fs.existsSync(conftestPath);
      console.log('[DEBUG] conftest.py 경로:', conftestPath);
      console.log('[DEBUG] conftest.py 존재 여부:', conftestExists);
      
      // 실행 디렉토리 내 파일 목록 확인
      try {
        const files = fs.readdirSync(execCwd);
        console.log('[DEBUG] 실행 디렉토리 내 파일 목록:', files);
      } catch (error) {
        console.warn('[DEBUG] 실행 디렉토리 읽기 실패:', error.message);
      }
    }
    
    // 테스트 파일 경로 확인 (원본 절대 경로로 확인)
    paths.forEach((testPath, index) => {
      const exists = fs.existsSync(testPath);
      console.log(`[DEBUG] 테스트 파일 ${index + 1} (절대 경로): ${testPath}`);
      console.log(`[DEBUG] 테스트 파일 ${index + 1} 존재 여부:`, exists);
      if (exists) {
        const stats = fs.statSync(testPath);
        console.log(`[DEBUG] 테스트 파일 ${index + 1} 크기:`, stats.size, 'bytes');
      }
    });
    
    // 테스트 타겟 경로 확인
    testTargets.forEach((testTarget, index) => {
      // 따옴표 제거 후 경로 확인 (testTarget이 "경로" 형태일 수 있음)
      const cleanPath = testTarget.replace(/^["']|["']$/g, '');
      // 파일명만 있으면 execCwd와 함께 확인
      const fullPath = path.isAbsolute(cleanPath) 
        ? cleanPath 
        : (execCwd ? path.join(execCwd, cleanPath) : path.resolve(cleanPath));
      const exists = fs.existsSync(fullPath);
      console.log(`[DEBUG] 테스트 타겟 ${index + 1}: ${testTarget}`);
      console.log(`[DEBUG] 테스트 타겟 ${index + 1} (정리된 경로): ${cleanPath}`);
      console.log(`[DEBUG] 테스트 타겟 ${index + 1} (전체 경로): ${fullPath}`);
      console.log(`[DEBUG] 테스트 타겟 ${index + 1} 존재 여부:`, exists);
    });
    
    // pytest 실행 경로 (항상 python -m pytest 사용하여 번들/시스템 모두 지원)
    // 번들된 Python에도 pytest가 Scripts/에 없을 수 있으므로 python -m pytest 사용
    const pytestCmd = `"${runtime.pythonPath}" -m pytest`;
    
    // 기본 pytest 옵션
    // pytest는 자동으로 conftest.py를 찾아서 로드하므로 -p conftest 옵션이 필요 없음
    const baseOptions = [
      '--json-report',
      `--json-report-file=${escapedReportFile}`,
      '-v',
      '--tb=short',
      '-p', 'no:cacheprovider' // ✅ 4️⃣ pytest 캐시 비활성화 (Windows 락 제거)
    ];
    
    // ✅ rootdir 옵션 추가 (Windows 한글 경로 문제 해결)
    // execCwd가 있으면 명시적으로 rootdir 지정
    if (execCwd) {
      baseOptions.push('--rootdir', `"${path.normalize(execCwd)}"`);
    }
    
    // headless 옵션 추가 (pytest-playwright는 --headed 옵션 사용)
    // --headed: 브라우저 표시 (headless=False)
    // 옵션 없음: 헤드리스 모드 (headless=True, 기본값)
    const headlessValue = options.headless !== undefined ? options.headless : false;
    if (!headlessValue) {
      // 브라우저를 표시하려면 --headed 옵션 추가
      baseOptions.push('--headed');
    }
    // headless=true인 경우는 옵션을 추가하지 않음 (기본값이 headless이므로)

    // 브라우저 옵션 추가
    const browser = options.browser || 'chromium';
    baseOptions.push('--browser', browser);

    // 드라이버 옵션은 환경 변수로 전달 (--driver 옵션 제거)
    // conftest.py에서 환경 변수 TEST_DRIVER를 읽어서 사용

    // 모바일 모드 옵션 추가
    if (options.mobile) {
      baseOptions.push('--mobile', 'true');
    }

    // HTML 리포트 옵션 추가
    if (options.htmlReport && htmlReportFile) {
      baseOptions.push('--html', `"${path.normalize(htmlReportFile)}"`, '--self-contained-html');
    }

    // 병렬 실행 옵션 추가 (pytest-xdist)
    if (options.parallel) {
      const workers = options.workers === 'auto' ? 'auto' : String(options.workers || 'auto');
      baseOptions.push('-n', workers);
    }

    // 재시도 옵션 추가 (pytest-rerunfailures)
    if (options.reruns > 0) {
      baseOptions.push('--reruns', String(options.reruns));
      if (options.rerunsDelay > 0) {
        baseOptions.push('--reruns-delay', String(options.rerunsDelay));
      }
    }

    // 최대 실패 허용 수 옵션 추가
    if (options.maxFailures !== null && options.maxFailures !== undefined) {
      baseOptions.push('--maxfail', String(options.maxFailures));
    }

    // 타임아웃 옵션 추가 (pytest-timeout)
    if (options.timeout > 0) {
      baseOptions.push('--timeout', String(options.timeout));
    }

    // 추가 인자와 합치기 (여러 파일 경로 포함)
    const allArgs = [...baseOptions, ...args, ...escapedPaths];
    
    return `${pytestCmd} ${allArgs.join(' ')}`;
  }

  /**
   * HTML 리포트 파일 경로 생성
   * @private
   * @returns {string} HTML 리포트 파일 경로
   */
  static _getHtmlReportFilePath(baseDir = config.pytest.htmlReportDir) {
    const timestamp = Date.now();
    const htmlReportDir = path.join(baseDir, '.pytest-reports', 'html');
    
    // 리포트 디렉토리가 없으면 생성
    if (!fs.existsSync(htmlReportDir)) {
      fs.mkdirSync(htmlReportDir, { recursive: true });
    }

    return path.join(htmlReportDir, `pytest-report-${timestamp}.html`);
  }

  /**
   * 리포트 파일 읽기
   * @private
   * @param {string} reportFile - 리포트 파일 경로
   * @returns {Object|null} 파싱된 리포트 데이터
   */
  static _readReportFile(reportFile) {
    if (!fs.existsSync(reportFile)) {
      return null;
    }

    try {
      const content = fs.readFileSync(reportFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('리포트 파일 읽기 실패:', error);
      return null;
    }
  }

  /**
   * 리포트 파일 정리
   * @private
   * @param {string} reportFile - 리포트 파일 경로
   */
  static _cleanupReportFile(reportFile) {
    try {
      if (fs.existsSync(reportFile)) {
        fs.unlinkSync(reportFile);
      }
    } catch (error) {
      console.warn('리포트 파일 정리 실패:', error);
    }
  }

  /**
   * Pytest 설치 여부 확인
   * @returns {Promise<boolean>} 설치 여부
   */
  static async isPytestInstalled() {
    return new Promise((resolve) => {
      exec(`${config.pytest.command} --version`, (error) => {
        resolve(!error);
      });
    });
  }
}

module.exports = PytestService;

