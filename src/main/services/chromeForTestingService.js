/**
 * Chrome for Testing 경로 관리 서비스
 * 번들된 Chrome for Testing 또는 시스템 Chrome을 자동으로 감지하고 사용
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Chrome for Testing 경로 정보
 * @typedef {Object} ChromeForTestingInfo
 * @property {string} chromePath - Chrome 실행 파일 경로
 * @property {boolean} isChromeForTesting - Chrome for Testing인지 여부
 * @property {boolean} canLoadExtension - --load-extension 사용 가능 여부
 */

class ChromeForTestingService {
  /**
   * Chrome 경로 가져오기
   * Chrome for Testing이 있으면 우선 사용, 없으면 시스템 Chrome 사용
   * @returns {ChromeForTestingInfo|null} Chrome 경로 정보
   */
  static getChromePath() {
    // 1. 번들된 Chrome for Testing 확인 (우선)
    const bundledChrome = this._getBundledChromeForTestingPath();
    if (bundledChrome && fs.existsSync(bundledChrome)) {
      console.log('✅ 번들된 Chrome for Testing 사용:', bundledChrome);
      return {
        chromePath: bundledChrome,
        isChromeForTesting: true,
        canLoadExtension: true
      };
    }

    // 2. 개발 모드에서 chrome-for-testing 디렉토리 확인
    const devChrome = this._getDevChromeForTestingPath();
    if (devChrome && fs.existsSync(devChrome)) {
      console.log('✅ 개발 모드 Chrome for Testing 사용:', devChrome);
      return {
        chromePath: devChrome,
        isChromeForTesting: true,
        canLoadExtension: true
      };
    }

    // 3. 시스템 Chrome 사용 (fallback)
    const systemChrome = this._findSystemChrome();
    if (systemChrome) {
      console.log('⚠️  Chrome for Testing을 찾을 수 없어 시스템 Chrome 사용:', systemChrome);
      return {
        chromePath: systemChrome,
        isChromeForTesting: false,
        canLoadExtension: false // M137+ 제한으로 인해 사용 불가
      };
    }

    return null;
  }

  /**
   * 번들된 Chrome for Testing 경로 가져오기
   * @private
   * @returns {string|null} Chrome 실행 파일 경로
   */
  static _getBundledChromeForTestingPath() {
    const platform = process.platform;
    const arch = process.arch;
    
    // 프로덕션 모드: process.resourcesPath/chrome-for-testing
    // 개발 모드: process.cwd()/chrome-for-testing
    const basePath = process.resourcesPath || process.cwd();
    const chromeForTestingDir = path.join(basePath, 'chrome-for-testing');
    
    if (!fs.existsSync(chromeForTestingDir)) {
      return null;
    }

    // 디렉토리 내부의 버전 폴더 찾기 (예: win64-120.0.6099.0)
    try {
      const dirs = fs.readdirSync(chromeForTestingDir);
      if (dirs.length === 0) {
        return null;
      }

      // 첫 번째 디렉토리 사용 (보통 하나만 있음)
      const versionDir = path.join(chromeForTestingDir, dirs[0]);

      if (platform === 'win32') {
        const chromePath = path.join(versionDir, 'chrome-win64', 'chrome.exe');
        return fs.existsSync(chromePath) ? chromePath : null;
      } else if (platform === 'darwin') {
        const archDir = arch === 'arm64' ? 'chrome-mac-arm64' : 'chrome-mac-x64';
        const chromePath = path.join(
          versionDir,
          archDir,
          'Google Chrome for Testing.app',
          'Contents',
          'MacOS',
          'Google Chrome for Testing'
        );
        return fs.existsSync(chromePath) ? chromePath : null;
      } else {
        const chromePath = path.join(versionDir, 'chrome-linux64', 'chrome');
        return fs.existsSync(chromePath) ? chromePath : null;
      }
    } catch (error) {
      console.error('❌ Chrome for Testing 디렉토리 읽기 실패:', error);
      return null;
    }
  }

  /**
   * 개발 모드 Chrome for Testing 경로 가져오기
   * @private
   * @returns {string|null} Chrome 실행 파일 경로
   */
  static _getDevChromeForTestingPath() {
    const platform = process.platform;
    const arch = process.arch;
    
    // 개발 모드: 프로젝트 루트의 chrome-for-testing 디렉토리
    const chromeForTestingDir = path.join(process.cwd(), 'chrome-for-testing');
    
    if (!fs.existsSync(chromeForTestingDir)) {
      return null;
    }

    try {
      const dirs = fs.readdirSync(chromeForTestingDir);
      if (dirs.length === 0) {
        return null;
      }

      const versionDir = path.join(chromeForTestingDir, dirs[0]);

      if (platform === 'win32') {
        const chromePath = path.join(versionDir, 'chrome-win64', 'chrome.exe');
        return fs.existsSync(chromePath) ? chromePath : null;
      } else if (platform === 'darwin') {
        const archDir = arch === 'arm64' ? 'chrome-mac-arm64' : 'chrome-mac-x64';
        const chromePath = path.join(
          versionDir,
          archDir,
          'Google Chrome for Testing.app',
          'Contents',
          'MacOS',
          'Google Chrome for Testing'
        );
        return fs.existsSync(chromePath) ? chromePath : null;
      } else {
        const chromePath = path.join(versionDir, 'chrome-linux64', 'chrome');
        return fs.existsSync(chromePath) ? chromePath : null;
      }
    } catch (error) {
      console.error('❌ 개발 모드 Chrome for Testing 디렉토리 읽기 실패:', error);
      return null;
    }
  }

  /**
   * 시스템 Chrome 경로 찾기
   * @private
   * @returns {string|null} Chrome 실행 파일 경로
   */
  static _findSystemChrome() {
    const platform = process.platform;
    
    // PATH에서 Chrome 찾기
    try {
      const { execSync } = require('child_process');
      const cmd = platform === 'win32' ? 'where chrome' : 'which google-chrome';
      const result = execSync(cmd, { encoding: 'utf8', timeout: 2000 })
        .toString()
        .trim()
        .split('\n')[0];
      
      if (result && fs.existsSync(result)) {
        return result;
      }
    } catch (error) {
      // PATH에서 찾지 못함
    }

    // 하드코딩된 경로 확인
    if (platform === 'win32') {
      const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
      ];
      
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          return possiblePath;
        }
      }
    } else if (platform === 'darwin') {
      const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      if (fs.existsSync(chromePath)) {
        return chromePath;
      }
    } else {
      // Linux: 'google-chrome' 명령어 사용 (실행 시 확인됨)
      return 'google-chrome';
    }

    return null;
  }
}

module.exports = ChromeForTestingService;

