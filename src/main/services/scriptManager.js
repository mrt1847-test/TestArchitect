/**
 * 테스트 스크립트 관리 서비스
 * 스크립트 목록 조회, 스크립트 디렉토리 관리 등을 담당
 */

const fs = require('fs');
const path = require('path');
const config = require('../config/config');

class ScriptManager {
  /**
   * 스크립트 디렉토리 초기화
   * 디렉토리가 없으면 생성
   * @returns {string} 스크립트 디렉토리 경로
   */
  static initializeScriptsDirectory() {
    const scriptsDir = config.paths.scripts;

    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
    }

    return scriptsDir;
  }

  /**
   * 사용 가능한 테스트 스크립트 목록 조회
   * @returns {Promise<string[]>} 스크립트 파일명 배열
   */
  static async getAvailableScripts() {
    const scriptsDir = this.initializeScriptsDirectory();

    try {
      const files = fs.readdirSync(scriptsDir);
      return files.filter(file => {
        const ext = path.extname(file);
        return config.python.supportedExtensions.includes(ext);
      });
    } catch (error) {
      console.error('스크립트 목록 조회 실패:', error);
      return [];
    }
  }

  /**
   * 스크립트 파일 정보 조회
   * @param {string} scriptName - 스크립트 파일명
   * @returns {Object|null} 스크립트 정보 (존재하지 않으면 null)
   */
  static getScriptInfo(scriptName) {
    const scriptPath = path.join(config.paths.scripts, scriptName);

    if (!fs.existsSync(scriptPath)) {
      return null;
    }

    const stats = fs.statSync(scriptPath);
    return {
      name: scriptName,
      path: scriptPath,
      size: stats.size,
      modified: stats.mtime,
      created: stats.birthtime
    };
  }

  /**
   * 스크립트 파일 존재 여부 확인
   * @param {string} scriptName - 스크립트 파일명
   * @returns {boolean} 존재 여부
   */
  static scriptExists(scriptName) {
    const scriptPath = path.join(config.paths.scripts, scriptName);
    return fs.existsSync(scriptPath);
  }
}

module.exports = ScriptManager;

