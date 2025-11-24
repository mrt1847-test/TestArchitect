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
   * Pytest로 테스트 실행
   * @param {string} testFile - 실행할 테스트 파일명 (또는 경로)
   * @param {string[]} args - 추가 pytest 인자 배열
   * @returns {Promise<PytestExecutionResult>} 실행 결과
   */
  static async runTests(testFile, args = []) {
    return new Promise(async (resolve, reject) => {
      try {
        // Python 런타임 가져오기
        const runtime = await this._getRuntime();

        const testPath = this._getTestPath(testFile);

        // 테스트 파일 존재 확인
        if (!this._validateTestFile(testPath)) {
          reject({
            success: false,
            error: `테스트 파일을 찾을 수 없습니다: ${testFile}`,
            stderr: ''
          });
          return;
        }

        // 리포트 파일 경로 생성
        const reportFile = this._getReportFilePath();

        // Pytest 명령어 구성 (런타임 정보 사용)
        const command = this._buildCommand(testPath, reportFile, args, runtime);

      // Playwright 환경 변수 설정
      const playwrightEnv = PythonRuntime.getPlaywrightEnv(runtime);
      
      // 테스트 실행
      exec(
        command,
        {
          cwd: config.paths.scripts,
          timeout: config.python.timeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB
          env: playwrightEnv // Playwright 브라우저 경로 포함
        },
        async (error, stdout, stderr) => {
          try {
            // 리포트 파일 읽기
            const reportData = this._readReportFile(reportFile);

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
    });
  }

  /**
   * 테스트 파일 경로 생성
   * @private
   * @param {string} testFile - 테스트 파일명
   * @returns {string} 전체 파일 경로
   */
  static _getTestPath(testFile) {
    // 이미 전체 경로인 경우
    if (path.isAbsolute(testFile)) {
      return testFile;
    }
    // 상대 경로인 경우 scripts 디렉토리 기준
    return path.join(config.paths.scripts, testFile);
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
  static _getReportFilePath() {
    const timestamp = Date.now();
    const reportDir = config.pytest.reportDir;
    
    // 리포트 디렉토리가 없으면 생성
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    return path.join(reportDir, `pytest-report-${timestamp}.json`);
  }

  /**
   * Pytest 실행 명령어 구성
   * @private
   * @param {string} testPath - 테스트 파일 경로
   * @param {string} reportFile - 리포트 파일 경로
   * @param {string[]} args - 추가 인자 배열
   * @param {PythonRuntimeInfo} runtime - Python 런타임 정보
   * @returns {string} 실행 명령어
   */
  static _buildCommand(testPath, reportFile, args = [], runtime) {
    const escapedPath = `"${testPath}"`;
    const escapedReportFile = `"${reportFile}"`;
    
    // pytest 실행 경로 (번들된 경우 전체 경로, 시스템의 경우 명령어만)
    const pytestCmd = runtime.isBundled 
      ? `"${runtime.pytestPath}"`
      : config.pytest.command;
    
    // 기본 pytest 옵션
    const baseOptions = [
      '--json-report',
      `--json-report-file=${escapedReportFile}`,
      '-v',
      '--tb=short'
    ];

    // 추가 인자와 합치기
    const allArgs = [...baseOptions, ...args, escapedPath];
    
    return `${pytestCmd} ${allArgs.join(' ')}`;
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

