/**
 * Python 런타임 관리 서비스
 * 번들된 Python 또는 시스템 Python을 자동으로 감지하고 사용
 */

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const config = require('../config/config');

/**
 * Python 런타임 정보
 * @typedef {Object} PythonRuntimeInfo
 * @property {string} pythonPath - Python 실행 파일 경로
 * @property {string} pipPath - pip 실행 파일 경로
 * @property {string} pytestPath - pytest 실행 파일 경로
 * @property {boolean} isBundled - 번들된 Python인지 여부
 * @property {string} version - Python 버전
 */

class PythonRuntime {
  /**
   * Python 런타임 경로 가져오기
   * 번들된 Python이 있으면 우선 사용, 없으면 시스템 Python 사용
   * @returns {Promise<PythonRuntimeInfo>} Python 런타임 정보
   */
  static async getRuntime() {
    // 프로덕션 모드에서 번들된 Python 경로 확인
    const bundledPython = this._getBundledPythonPath();
    
    if (bundledPython && fs.existsSync(bundledPython)) {
      // 번들된 Python 사용
      const runtime = await this._validateRuntime(bundledPython, true);
      if (runtime) {
        return runtime;
      }
    }

    // 시스템 Python 사용 (개발 모드 또는 번들된 Python이 없는 경우)
    return await this._findSystemPython();
  }

  /**
   * 번들된 Python 경로 가져오기
   * @private
   * @returns {string|null} Python 실행 파일 경로
   */
  static _getBundledPythonPath() {
    const appPath = process.resourcesPath || process.cwd();
    const platform = process.platform;
    
    // 개발 모드: python-bundle/python 경로 확인
    const devBundlePath = path.join(process.cwd(), 'python-bundle', 'python');
    
    if (platform === 'win32') {
      // 프로덕션: resources/python/python.exe
      const prodPath = path.join(appPath, 'python', 'python.exe');
      // 개발: python-bundle/python/Scripts/python.exe (가상환경)
      const devPath = path.join(devBundlePath, 'Scripts', 'python.exe');
      
      // 개발 모드에서 번들 경로 확인
      if (fs.existsSync(devPath)) {
        return devPath;
      }
      return prodPath;
    } else if (platform === 'darwin') {
      // 프로덕션: resources/python/bin/python3
      const prodPath = path.join(appPath, 'python', 'bin', 'python3');
      // 개발: python-bundle/python/bin/python3 (가상환경)
      const devPath = path.join(devBundlePath, 'bin', 'python3');
      
      if (fs.existsSync(devPath)) {
        return devPath;
      }
      return prodPath;
    } else {
      // Linux: resources/python/bin/python3
      const prodPath = path.join(appPath, 'python', 'bin', 'python3');
      // 개발: python-bundle/python/bin/python3 (가상환경)
      const devPath = path.join(devBundlePath, 'bin', 'python3');
      
      if (fs.existsSync(devPath)) {
        return devPath;
      }
      return prodPath;
    }
  }

  /**
   * 시스템 Python 찾기
   * @private
   * @returns {Promise<PythonRuntimeInfo>} Python 런타임 정보
   */
  static async _findSystemPython() {
    const commands = [
      process.platform === 'win32' ? 'python' : 'python3',
      process.platform === 'win32' ? 'python3' : 'python'
    ];

    for (const cmd of commands) {
      try {
        const runtime = await this._validateRuntime(cmd, false);
        if (runtime) {
          return runtime;
        }
      } catch (error) {
        continue;
      }
    }

    throw new Error('Python을 찾을 수 없습니다. Python이 설치되어 있는지 확인하세요.');
  }

  /**
   * Python 런타임 유효성 검증
   * @private
   * @param {string} pythonPath - Python 실행 파일 경로
   * @param {boolean} isBundled - 번들된 Python인지 여부
   * @returns {Promise<PythonRuntimeInfo|null>} 유효한 런타임 정보 또는 null
   */
  static async _validateRuntime(pythonPath, isBundled) {
    try {
      // Python 버전 확인
      const { stdout } = await execAsync(`"${pythonPath}" --version`, { timeout: 5000 });
      const version = stdout.trim();

      // pip 경로
      const pipPath = isBundled 
        ? this._getBundledPipPath(pythonPath)
        : `${pythonPath} -m pip`;

      // pytest 경로
      const pytestPath = isBundled
        ? this._getBundledPytestPath(pythonPath)
        : 'pytest';

      return {
        pythonPath,
        pipPath,
        pytestPath,
        isBundled,
        version
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * 번들된 pip 경로 가져오기
   * @private
   * @param {string} pythonPath - Python 실행 파일 경로
   * @returns {string} pip 실행 경로
   */
  static _getBundledPipPath(pythonPath) {
    const pythonDir = path.dirname(pythonPath);
    if (process.platform === 'win32') {
      return path.join(pythonDir, 'Scripts', 'pip.exe');
    } else {
      return path.join(pythonDir, 'bin', 'pip');
    }
  }

  /**
   * 번들된 pytest 경로 가져오기
   * @private
   * @param {string} pythonPath - Python 실행 파일 경로
   * @returns {string} pytest 실행 경로
   */
  static _getBundledPytestPath(pythonPath) {
    const pythonDir = path.dirname(pythonPath);
    if (process.platform === 'win32') {
      return path.join(pythonDir, 'Scripts', 'pytest.exe');
    } else {
      return path.join(pythonDir, 'bin', 'pytest');
    }
  }

  /**
   * Playwright 브라우저 경로 가져오기
   * @private
   * @param {boolean} isBundled - 번들된 Python인지 여부
   * @returns {string|null} Playwright 브라우저 경로
   */
  static _getPlaywrightBrowsersPath(isBundled) {
    if (!isBundled) {
      return null; // 시스템 Python 사용 시 기본 경로 사용
    }

    // 번들된 Playwright 브라우저 경로
    // 개발 모드: python-bundle/.playwright
    // 프로덕션 모드: resources/.playwright
    const appPath = process.resourcesPath || process.cwd();
    
    // 개발 모드에서는 python-bundle/.playwright 확인
    const devPlaywrightPath = path.join(process.cwd(), 'python-bundle', '.playwright');
    if (fs.existsSync(devPlaywrightPath)) {
      return devPlaywrightPath;
    }
    
    // 프로덕션 모드에서는 appPath/.playwright 확인
    const prodPlaywrightPath = path.join(appPath, '.playwright');
    if (fs.existsSync(prodPlaywrightPath)) {
      return prodPlaywrightPath;
    }
    
    return null;
  }

  /**
   * Playwright 브라우저 설치 확인 및 환경 변수 설정
   * @param {PythonRuntimeInfo} runtime - Python 런타임 정보
   * @returns {Promise<{installed: boolean, browsersPath: string|null}>} 설치 상태
   */
  static async ensurePlaywrightBrowsers(runtime) {
    try {
      // playwright가 설치되어 있는지 확인
      const checkCmd = runtime.isBundled
        ? `"${runtime.pythonPath}" -m playwright --version`
        : `python -m playwright --version`;

      try {
        await execAsync(checkCmd, { timeout: 5000 });
        
        // 번들된 브라우저 경로 확인
        const browsersPath = this._getPlaywrightBrowsersPath(runtime.isBundled);
        
        if (browsersPath && fs.existsSync(browsersPath)) {
          // 번들된 브라우저 사용
          return { installed: true, browsersPath };
        }
        
        // 브라우저가 없으면 설치 (개발 모드에서만)
        if (!runtime.isBundled) {
          const installCmd = `python -m playwright install chromium`;
          await execAsync(installCmd, { timeout: 300000 });
          return { installed: true, browsersPath: null };
        }
        
        return { installed: false, browsersPath: null };
      } catch (error) {
        console.warn('Playwright 브라우저 확인 실패:', error.message);
        return { installed: false, browsersPath: null };
      }
    } catch (error) {
      console.error('Playwright 브라우저 확인 오류:', error);
      return { installed: false, browsersPath: null };
    }
  }

  /**
   * Playwright 환경 변수 설정
   * @param {PythonRuntimeInfo} runtime - Python 런타임 정보
   * @returns {Object} 환경 변수 객체
   */
  static getPlaywrightEnv(runtime) {
    const env = { ...process.env };
    
    if (runtime.isBundled) {
      const browsersPath = this._getPlaywrightBrowsersPath(runtime.isBundled);
      if (browsersPath) {
        env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
      }
    }
    
    return env;
  }
}

module.exports = PythonRuntime;

