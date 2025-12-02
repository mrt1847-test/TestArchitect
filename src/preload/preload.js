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
   * 여러 스크립트를 임시 파일로 생성하여 실행
   * @param {Array} scripts - 스크립트 배열 [{tcId, scriptId, name, code, framework, language}, ...]
   * @param {string[]} args - pytest 인자 배열
   * @param {Object} options - 실행 옵션
   * @returns {Promise<Object>} 실행 결과
   */
  runPythonScripts: (scripts, args = [], options = {}) => {
    return ipcRenderer.invoke('run-python-scripts', scripts, args, options);
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
  },

  /**
   * 녹화 시작
   * @param {Object} options - 녹화 옵션 (browser, mobile 등)
   * @returns {Promise<Object>} 결과
   */
  startRecording: (options) => {
    return ipcRenderer.invoke('start-recording', options);
  },

  /**
   * 녹화 중지
   * @returns {Promise<Object>} 녹화된 이벤트
   */
  stopRecording: () => {
    return ipcRenderer.invoke('stop-recording');
  },

  /**
   * 이벤트 캡처
   * @param {Object} eventData - 캡처된 이벤트 데이터
   * @returns {Promise<Object>} 결과
   */
  captureEvent: (eventData) => {
    return ipcRenderer.invoke('capture-event', eventData);
  },

  /**
   * 브라우저 열기
   * @param {Object} options - 브라우저 옵션
   * @returns {Promise<Object>} 결과
   */
  openBrowser: (options) => {
    return ipcRenderer.invoke('open-browser', options);
  },

  /**
   * 서버 API 호출
   */
  /**
   * DevTools 토글
   * @returns {Promise<Object>} 실행 결과
   */
  toggleDevTools: () => {
    return ipcRenderer.invoke('toggle-devtools');
  },

  api: {
    // 프로젝트
    getProjects: () => ipcRenderer.invoke('api-get-projects'),
    getProject: (id) => ipcRenderer.invoke('api-get-project', id),
    createProject: (data) => ipcRenderer.invoke('api-create-project', data),
    updateProject: (id, data) => ipcRenderer.invoke('api-update-project', id, data),
    deleteProject: (id) => ipcRenderer.invoke('api-delete-project', id),
    
    // 테스트케이스
    getTestCases: (params) => ipcRenderer.invoke('api-get-test-cases', params),
    getTestCase: (id) => ipcRenderer.invoke('api-get-test-case', id),
    getTCTree: (projectId) => ipcRenderer.invoke('api-get-tc-tree', projectId),
    createTestCase: (data) => ipcRenderer.invoke('api-create-test-case', data),
    updateTestCase: (id, data) => ipcRenderer.invoke('api-update-test-case', id, data),
    deleteTestCase: (id) => ipcRenderer.invoke('api-delete-test-case', id),
    
    // 스크립트
    getScripts: (params) => ipcRenderer.invoke('api-get-scripts', params),
    createScript: (data) => ipcRenderer.invoke('api-create-script', data),
    updateScript: (id, data) => ipcRenderer.invoke('api-update-script', id, data),
    deleteScript: (id) => ipcRenderer.invoke('api-delete-script', id),
    getScriptsByTestCase: (testCaseId) => ipcRenderer.invoke('api-get-scripts-by-test-case', testCaseId),
    
    // 동기화
    getSyncStatus: () => ipcRenderer.invoke('api-get-sync-status'),
    getTestCaseFull: (id) => ipcRenderer.invoke('api-get-test-case-full', id),
    
    // 객체 레퍼지토리
    getObjects: (projectId) => ipcRenderer.invoke('api-get-objects', projectId),
    getObject: (id) => ipcRenderer.invoke('api-get-object', id),
    getObjectTree: (projectId) => ipcRenderer.invoke('api-get-object-tree', projectId),
    createObject: (data) => ipcRenderer.invoke('api-create-object', data),
    updateObject: (id, data) => ipcRenderer.invoke('api-update-object', id, data),
    deleteObject: (id) => ipcRenderer.invoke('api-delete-object', id),
    
    // Page Objects
    getPageObjects: (projectId) => ipcRenderer.invoke('api-get-page-objects', projectId),
    getPageObject: (id) => ipcRenderer.invoke('api-get-page-object', id),
    createPageObject: (data) => ipcRenderer.invoke('api-create-page-object', data),
    updatePageObject: (id, data) => ipcRenderer.invoke('api-update-page-object', id, data),
    deletePageObject: (id) => ipcRenderer.invoke('api-delete-page-object', id),
    findPageObjectByUrl: (url, projectId) => ipcRenderer.invoke('api-find-page-object-by-url', url, projectId),
    
    // 서버 상태
    checkServer: () => ipcRenderer.invoke('api-check-server')
  },

  /**
   * 서버 이벤트 리스너
   */
  onServerUpdate: (callback) => {
    ipcRenderer.on('server-update', (event, data) => callback(data));
  },
  onTestCaseUpdated: (callback) => {
    ipcRenderer.on('test-case-updated', (event, data) => callback(data));
  },
  onScriptUpdated: (callback) => {
    ipcRenderer.on('script-updated', (event, data) => callback(data));
  },
  
  /**
   * 녹화 데이터 수신 리스너
   * @param {Function} callback - 녹화 데이터 수신 시 호출될 콜백 함수
   */
  onRecordingData: (callback) => {
    ipcRenderer.on('recording-data', (event, data) => callback(data));
  },

  /**
   * 녹화 중지 신호 수신 리스너
   * @param {Function} callback - 녹화 중지 신호 수신 시 호출될 콜백 함수
   */
  onRecordingStop: (callback) => {
    ipcRenderer.on('recording-stop', (event, data) => callback(data));
  },

  /**
   * IPC 이벤트 리스너 등록 (recorder.js용)
   * @param {string} channel - IPC 채널 이름
   * @param {Function} callback - 이벤트 수신 시 호출될 콜백 함수 (data만 전달)
   */
  onIpcMessage: (channel, callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on(channel, handler);
    // 리스너 제거를 위해 핸들러를 반환 (필요시 사용)
    return () => ipcRenderer.removeListener(channel, handler);
  },

  /**
   * IPC 이벤트 리스너 제거
   * @param {string} channel - IPC 채널 이름
   * @param {Function} callback - 제거할 콜백 함수
   */
  removeIpcListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },

  /**
   * 녹화 중지 요청
   * @param {Object} options - 중지 옵션 (sessionId 등)
   * @returns {Promise<Object>} 결과
   */
  stopRecording: async (options = {}) => {
    try {
      const response = await fetch('http://localhost:3000/api/recording/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options)
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * IPC invoke 호출 (일반적인 IPC 통신용)
   * @param {string} channel - IPC 채널 이름
   * @param {...any} args - 전달할 인자들
   * @returns {Promise<any>} 결과
   */
  invoke: (channel, ...args) => {
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * DOM 스냅샷 저장
   * @param {string} pageUrl - 정규화된 페이지 URL
   * @param {string} domStructure - DOM 구조 문자열
   * @param {Date|string} snapshotDate - 스냅샷 날짜
   * @returns {Promise<Object>} 저장 결과
   */
  saveDomSnapshot: (pageUrl, domStructure, snapshotDate) => {
    const dateStr = snapshotDate instanceof Date 
      ? snapshotDate.toISOString() 
      : snapshotDate;
    return ipcRenderer.invoke('save-dom-snapshot', pageUrl, domStructure, dateStr);
  },

  /**
   * DOM 스냅샷 존재 여부 확인
   * @param {string} pageUrl - 정규화된 페이지 URL
   * @param {Date|string} startDate - 시작 날짜
   * @param {Date|string} endDate - 종료 날짜
   * @returns {Promise<boolean>} 존재 여부
   */
  checkDomSnapshot: (pageUrl, startDate, endDate) => {
    const startStr = startDate instanceof Date 
      ? startDate.toISOString() 
      : startDate;
    const endStr = endDate instanceof Date 
      ? endDate.toISOString() 
      : endDate;
    return ipcRenderer.invoke('check-dom-snapshot', pageUrl, startStr, endStr);
  },

  /**
   * 오래된 DOM 스냅샷 정리
   * @returns {Promise<Object>} 정리 결과
   */
  cleanupOldSnapshots: () => {
    return ipcRenderer.invoke('cleanup-old-snapshots');
  },

  /**
   * 스텝 스크린샷 조회
   * @param {number} tcId - 테스트케이스 ID
   * @param {number} stepIndex - 스텝 인덱스
   * @returns {Promise<string|null>} base64 인코딩된 스크린샷 또는 null
   */
  getStepScreenshot: (tcId, stepIndex) => {
    return ipcRenderer.invoke('get-step-screenshot', tcId, stepIndex);
  },

  /**
   * 테스트케이스의 모든 스텝 스크린샷 삭제
   * @param {number} tcId - 테스트케이스 ID
   * @returns {Promise<number>} 삭제된 레코드 수
   */
  deleteStepScreenshots: (tcId) => {
    return ipcRenderer.invoke('delete-step-screenshots', tcId);
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
