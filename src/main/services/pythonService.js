/**
 * Python 스크립트 실행 서비스
 * Python 테스트 스크립트의 실행 및 결과 파싱을 담당
 * 
 * @deprecated PytestService를 사용하는 것을 권장합니다.
 * 이 서비스는 pytest를 사용하지 않는 레거시 스크립트용으로 유지됩니다.
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

/**
 * Python 스크립트 실행 결과 타입 정의
 * @typedef {Object} PythonExecutionResult
 * @property {boolean} success - 실행 성공 여부
 * @property {Object|null} data - 파싱된 JSON 데이터 (성공 시)
 * @property {string} stdout - 표준 출력
 * @property {string} stderr - 표준 에러 출력
 * @property {string} error - 에러 메시지 (실패 시)
 */

class PythonService {
  /**
   * Python 스크립트 실행
   * @param {string} scriptName - 실행할 스크립트 파일명
   * @param {string[]} args - 스크립트에 전달할 인자 배열
   * @returns {Promise<PythonExecutionResult>} 실행 결과
   */
  static async executeScript(scriptName, args = []) {
    return new Promise((resolve, reject) => {
      const scriptPath = this._getScriptPath(scriptName);

      // 스크립트 파일 존재 확인
      if (!this._validateScript(scriptPath)) {
        reject({
          success: false,
          error: `스크립트 파일을 찾을 수 없습니다: ${scriptName}`,
          stderr: ''
        });
        return;
      }

      // Python 명령어 구성
      const command = this._buildCommand(scriptPath, args);

      // 스크립트 실행
      exec(
        command,
        {
          cwd: config.paths.scripts,
          timeout: config.python.timeout,
          maxBuffer: 10 * 1024 * 1024 // 10MB
        },
        (error, stdout, stderr) => {
          if (error) {
            reject({
              success: false,
              error: error.message,
              stderr: stderr || '',
              stdout: stdout || ''
            });
            return;
          }

          // JSON 결과 파싱
          const parsedResult = this._parseResult(stdout);
          resolve({
            success: true,
            data: parsedResult,
            stdout: stdout,
            stderr: stderr || ''
          });
        }
      );
    });
  }

  /**
   * 스크립트 파일 경로 생성
   * @private
   * @param {string} scriptName - 스크립트 파일명
   * @returns {string} 전체 파일 경로
   */
  static _getScriptPath(scriptName) {
    return path.join(config.paths.scripts, scriptName);
  }

  /**
   * 스크립트 파일 유효성 검증
   * @private
   * @param {string} scriptPath - 스크립트 파일 경로
   * @returns {boolean} 유효성 여부
   */
  static _validateScript(scriptPath) {
    if (!fs.existsSync(scriptPath)) {
      return false;
    }

    const ext = path.extname(scriptPath);
    if (!config.python.supportedExtensions.includes(ext)) {
      return false;
    }

    return true;
  }

  /**
   * Python 실행 명령어 구성
   * @private
   * @param {string} scriptPath - 스크립트 파일 경로
   * @param {string[]} args - 인자 배열
   * @returns {string} 실행 명령어
   */
  static _buildCommand(scriptPath, args) {
    const escapedPath = `"${scriptPath}"`;
    const escapedArgs = args.map(arg => `"${arg}"`).join(' ');
    return `${config.python.command} ${escapedPath} ${escapedArgs}`.trim();
  }

  /**
   * 스크립트 출력 결과 파싱
   * @private
   * @param {string} stdout - 표준 출력
   * @returns {Object} 파싱된 결과 객체
   */
  static _parseResult(stdout) {
    if (!stdout || !stdout.trim()) {
      return { output: '' };
    }

    try {
      // JSON 파싱 시도
      return JSON.parse(stdout);
    } catch (parseError) {
      // JSON이 아닌 경우 일반 출력으로 반환
      return {
        output: stdout,
        note: 'JSON 형식이 아닌 일반 출력입니다.'
      };
    }
  }
}

module.exports = PythonService;

