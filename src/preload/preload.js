/**
 * Preload 스크립트
 * 메인 프로세스와 렌더러 프로세스 간의 안전한 IPC 통신 브릿지
 * 
 * 보안을 위해 contextIsolation을 사용하여 Node.js API를 직접 노출하지 않고,
 * 필요한 기능만 선택적으로 노출합니다.
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * 렌더러 프로세스에 노출할 API 정의
 * window.electronAPI 객체를 통해 접근 가능
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Python 스크립트 실행
   * @param {string} scriptName - 실행할 스크립트 파일명
   * @param {string[]} args - 스크립트에 전달할 인자 배열 (선택사항)
   * @returns {Promise<Object>} 실행 결과
   * 
   * @example
   * const result = await window.electronAPI.runPythonScript('test.py');
   * if (result.success) {
   *   console.log('결과:', result.data);
   * }
   */
  runPythonScript: (scriptName, args = []) => {
    return ipcRenderer.invoke('run-python-script', scriptName, args);
  },

  /**
   * 사용 가능한 테스트 스크립트 목록 조회
   * @returns {Promise<string[]>} 스크립트 파일명 배열
   * 
   * @example
   * const scripts = await window.electronAPI.getTestScripts();
   * console.log('사용 가능한 스크립트:', scripts);
   */
  getTestScripts: () => {
    return ipcRenderer.invoke('get-test-scripts');
  },

  /**
   * 환경 검사 (Python, pytest 등 설치 여부 확인)
   * @returns {Promise<Object>} 환경 검사 결과
   * 
   * @example
   * const envCheck = await window.electronAPI.checkEnvironment();
   * if (!envCheck.allReady) {
   *   console.log('설치 필요:', envCheck.missingItems);
   *   console.log('설치 가이드:', envCheck.installGuide);
   * }
   */
  checkEnvironment: () => {
    return ipcRenderer.invoke('check-environment');
  }

  // ============================================================================
  // 확장 포인트: 향후 추가할 API들
  // ============================================================================
  
  /**
   * 향후 추가할 수 있는 API들:
   * 
   * - startRecording: () => ipcRenderer.invoke('start-recording')
   * - stopRecording: () => ipcRenderer.invoke('stop-recording')
   * - getTestCases: () => ipcRenderer.invoke('get-test-cases')
   * - saveTestCase: (testCase) => ipcRenderer.invoke('save-test-case', testCase)
   * - convertCode: (code, targetFormat) => ipcRenderer.invoke('convert-code', code, targetFormat)
   * - generateReport: (testResults) => ipcRenderer.invoke('generate-report', testResults)
   */
});
