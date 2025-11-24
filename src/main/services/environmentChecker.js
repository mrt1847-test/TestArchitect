/**
 * 환경 검사 서비스
 * Python, pytest 등 필수 환경이 준비되어 있는지 확인
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const config = require('../config/config');
const PythonRuntime = require('./pythonRuntime');

/**
 * 환경 검사 결과
 * @typedef {Object} EnvironmentCheckResult
 * @property {boolean} pythonInstalled - Python 설치 여부
 * @property {string|null} pythonVersion - Python 버전
 * @property {boolean} pytestInstalled - pytest 설치 여부
 * @property {string|null} pytestVersion - pytest 버전
 * @property {boolean} jsonReportInstalled - pytest-json-report 설치 여부
 * @property {boolean} allReady - 모든 필수 항목 준비 여부
 * @property {string[]} missingItems - 누락된 항목 목록
 */

class EnvironmentChecker {
  /**
   * 전체 환경 검사
   * @returns {Promise<EnvironmentCheckResult>} 검사 결과
   */
  static async checkEnvironment() {
    const result = {
      pythonInstalled: false,
      pythonVersion: null,
      pytestInstalled: false,
      pytestVersion: null,
      jsonReportInstalled: false,
      allReady: false,
      missingItems: [],
      isBundled: false
    };

    try {
      // Python 런타임 가져오기 (번들된 Python 우선)
      const runtime = await PythonRuntime.getRuntime();
      result.pythonInstalled = true;
      result.pythonVersion = runtime.version;
      result.isBundled = runtime.isBundled;

      // pytest 검사
      const pytestCheck = await this.checkPytestWithRuntime(runtime);
      result.pytestInstalled = pytestCheck.installed;
      result.pytestVersion = pytestCheck.version;

      if (!result.pytestInstalled) {
        result.missingItems.push('pytest');
      }

      // pytest-json-report 검사
      const jsonReportCheck = await this.checkJsonReportWithRuntime(runtime);
      result.jsonReportInstalled = jsonReportCheck.installed;

      if (!result.jsonReportInstalled) {
        result.missingItems.push('pytest-json-report');
      }

      // 전체 준비 상태 확인
      result.allReady = result.pythonInstalled && 
                        result.pytestInstalled && 
                        result.jsonReportInstalled;

    } catch (error) {
      // Python을 찾을 수 없는 경우
      result.pythonInstalled = false;
      result.missingItems.push('Python');
    }

    return result;
  }

  /**
   * Python 설치 여부 확인
   * @returns {Promise<{installed: boolean, version: string|null}>}
   */
  static async checkPython() {
    const commands = [
      config.python.command,  // 'python' 또는 'python3'
      process.platform === 'win32' ? 'python3' : 'python'  // 대체 명령어
    ];

    for (const cmd of commands) {
      try {
        const { stdout } = await execAsync(`${cmd} --version`, { timeout: 5000 });
        const version = stdout.trim();
        return { installed: true, version };
      } catch (error) {
        // 다음 명령어 시도
        continue;
      }
    }

    return { installed: false, version: null };
  }

  /**
   * pytest 설치 여부 확인 (런타임 사용)
   * @param {PythonRuntimeInfo} runtime - Python 런타임 정보
   * @returns {Promise<{installed: boolean, version: string|null}>}
   */
  static async checkPytestWithRuntime(runtime) {
    try {
      const pytestCmd = runtime.isBundled 
        ? `"${runtime.pytestPath}"`
        : config.pytest.command;
      const { stdout } = await execAsync(`${pytestCmd} --version`, { timeout: 5000 });
      const version = stdout.trim();
      return { installed: true, version };
    } catch (error) {
      return { installed: false, version: null };
    }
  }

  /**
   * pytest 설치 여부 확인 (시스템 Python 사용, 하위 호환성)
   * @returns {Promise<{installed: boolean, version: string|null}>}
   */
  static async checkPytest() {
    try {
      const { stdout } = await execAsync(`${config.pytest.command} --version`, { timeout: 5000 });
      const version = stdout.trim();
      return { installed: true, version };
    } catch (error) {
      return { installed: false, version: null };
    }
  }

  /**
   * pytest-json-report 설치 여부 확인 (런타임 사용)
   * @param {PythonRuntimeInfo} runtime - Python 런타임 정보
   * @returns {Promise<{installed: boolean}>}
   */
  static async checkJsonReportWithRuntime(runtime) {
    try {
      // pip list로 확인
      const pipCmd = runtime.isBundled
        ? `"${runtime.pipPath}"`
        : `${runtime.pythonPath} -m pip`;
      const { stdout } = await execAsync(`${pipCmd} list`, { timeout: 5000 });
      const installed = stdout.includes('pytest-json-report');
      return { installed };
    } catch (error) {
      return { installed: false };
    }
  }

  /**
   * pytest-json-report 설치 여부 확인 (시스템 Python 사용, 하위 호환성)
   * @returns {Promise<{installed: boolean}>}
   */
  static async checkJsonReport() {
    try {
      const pythonCmd = config.python.command;
      const { stdout } = await execAsync(`${pythonCmd} -m pip list`, { timeout: 5000 });
      const installed = stdout.includes('pytest-json-report');
      return { installed };
    } catch (error) {
      return { installed: false };
    }
  }

  /**
   * 설치 가이드 메시지 생성
   * @param {EnvironmentCheckResult} checkResult - 검사 결과
   * @returns {string} 설치 가이드 메시지
   */
  static generateInstallGuide(checkResult) {
    const guides = [];

    if (!checkResult.pythonInstalled) {
      guides.push('1. Python 설치 필요:\n   - https://www.python.org/downloads/ 에서 다운로드\n   - 설치 시 "Add Python to PATH" 옵션 선택');
    }

    if (checkResult.pythonInstalled && !checkResult.pytestInstalled) {
      guides.push('2. pytest 설치:\n   pip install pytest');
    }

    if (checkResult.pythonInstalled && !checkResult.jsonReportInstalled) {
      guides.push('3. pytest-json-report 설치:\n   pip install pytest-json-report');
    }

    if (guides.length === 0) {
      return '모든 필수 항목이 설치되어 있습니다.';
    }

    return guides.join('\n\n') + '\n\n또는 한 번에 설치:\n   pip install -r requirements.txt';
  }
}

module.exports = EnvironmentChecker;

