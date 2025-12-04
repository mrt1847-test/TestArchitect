/**
 * 렌더러 프로세스 메인 스크립트
 * TestRail 스타일 TC 관리 및 실행 (탭 기반 UI)
 */

// 즉시 실행되는 기본 테스트
console.log('=== RENDERER.JS 로드 시작 ===');
console.log('현재 시간:', new Date().toISOString());
console.log('DOM 상태:', document.readyState);
console.log('window.electronAPI:', typeof window.electronAPI);

// 키워드 라이브러리 및 객체 레퍼지토리 import (동적 로드)
let generateCodeFromSteps, getKeywordSuggestions, KEYWORDS;
let validateSteps, normalizeSteps;
let ObjectRepository, SelectorUtils;

// 초기화 함수를 안전하게 실행 (먼저 정의)
async function startApp() {
  try {
    console.log('=== startApp() 호출 ===');
    console.log('DOM 상태:', document.readyState);
    console.log('window.electronAPI:', typeof window.electronAPI);
    
    // electronAPI 확인
    if (!window.electronAPI) {
      console.error('❌ window.electronAPI가 없습니다!');
      console.error('preload 스크립트가 로드되지 않았을 수 있습니다.');
      alert('Electron API가 초기화되지 않았습니다. 앱을 재시작하세요.');
      return;
    }
    
    // DOM이 완전히 로드될 때까지 대기
    if (document.readyState === 'loading') {
      console.log('DOM 로딩 중, DOMContentLoaded 대기...');
      document.addEventListener('DOMContentLoaded', () => {
        console.log('✅ DOMContentLoaded 이벤트 발생');
        setTimeout(() => {
          init().catch(error => {
            console.error('❌ 초기화 중 오류 발생:', error);
            console.error('스택 트레이스:', error.stack);
          });
        }, 100);
      });
    } else {
      console.log('✅ DOM 이미 로드됨, 초기화 시작');
      // DOM이 이미 로드되었어도 약간의 지연을 두어 모든 스크립트가 로드되도록 함
      setTimeout(() => {
        init().catch(error => {
          console.error('❌ 초기화 중 오류 발생:', error);
          console.error('스택 트레이스:', error.stack);
        });
      }, 200);
    }
  } catch (error) {
    console.error('❌ 앱 시작 중 오류:', error);
    console.error('스택 트레이스:', error.stack);
  }
}

// 모듈 로드 함수 (비동기)
async function loadModules() {
  try {
    const keywordLib = await import('./utils/keywordLibrary.js');
    generateCodeFromSteps = keywordLib.generateCodeFromSteps;
    getKeywordSuggestions = keywordLib.getKeywordSuggestions;
    KEYWORDS = keywordLib.KEYWORDS;
    console.log('✅ keywordLibrary.js 로드 성공');
  } catch (error) {
    console.error('❌ keywordLibrary.js 로드 실패:', error);
    // 폴백 함수 정의
    generateCodeFromSteps = async () => '';
    getKeywordSuggestions = () => [];
    KEYWORDS = {};
  }

  try {
    const validator = await import('./utils/keywordValidator.js');
    validateSteps = validator.validateSteps;
    normalizeSteps = validator.normalizeSteps;
    console.log('✅ keywordValidator.js 로드 성공');
  } catch (error) {
    console.error('❌ keywordValidator.js 로드 실패:', error);
    validateSteps = () => true;
    normalizeSteps = (steps) => steps;
  }

  try {
    const objRepo = await import('./utils/objectRepository.js');
    ObjectRepository = objRepo.ObjectRepository;
    SelectorUtils = objRepo.SelectorUtils;
    console.log('✅ objectRepository.js 로드 성공');
  } catch (error) {
    console.error('❌ objectRepository.js 로드 실패:', error);
    ObjectRepository = { getObjectSuggestions: async () => [] };
    SelectorUtils = {};
  }

  console.log('=== RENDERER.JS 모듈 로드 완료 ===');
  
  // 모듈 로드 완료 후 앱 시작
  console.log('모듈 로드 완료, startApp() 호출...');
  startApp();
}

// 모듈 로드 시작
loadModules().catch(error => {
  console.error('❌ 모듈 로드 중 치명적 오류:', error);
  // 모듈 로드 실패해도 앱은 시작 시도
  console.log('모듈 로드 실패했지만 앱 시작 시도...');
  startApp();
});

// ============================================================================
// 전역 변수
// ============================================================================

let currentProject = null;
let currentTC = null;
let selectedTCs = new Set(); // 선택된 TC ID 집합
let tcTreeData = null;
let activeTab = 'detail';
let isRecording = false;
let recordedEvents = [];
let currentRecordingSessionId = null;

// ============================================================================
// DOM 요소 참조 (지연 초기화 - init 함수 내에서만 사용)
// ============================================================================

// 모든 DOM 요소 참조를 변수로 선언 (나중에 초기화)
let projectSelect, newProjectBtn, tcTree, newFolderBtn, newTCTreeBtn;
let selectedCountSpan, runSelectedBtn;
let tabButtons, tabPanels;
let tcDetailContent, editTCBtn, recordBtn, newTCBtn;
let scriptContent, createScriptBtn, editScriptBtn, saveScriptBtn;
let scriptLanguage, scriptFramework, codeEditor;
let scriptCodeView, scriptKeywordView, viewButtons;
let keywordTableBody, addKeywordBtn;
let pageObjectsList, pageObjectEditor, newPageObjectBtn;
let savePageObjectBtn, cancelPageObjectBtn;
let pageObjectNameInput, pageObjectDescriptionInput, pageObjectUrlPatternsInput;
let pageObjectFrameworkSelect, pageObjectLanguageSelect, pageObjectCodeEditor;
let pageObjectCodeMirrorEditor = null;
let currentPageObject = null;
let codeMirrorEditor = null;
let currentScript = null;
let isDirty = false;
let resultDetailContent, refreshResultsBtn;
let recorderBrowser, startRecordingBtn, stopRecordingBtn;
let recorderViewport, eventsList;
let resultsPanel, toggleResultsBtn, exportReportBtn, clearResultsBtn;
let resultsList, summaryTotal, summaryPassed, summaryFailed, summaryError;
let runCurrentBtn, profileSelect, browserSelect, searchInput, filterBtn, settingsBtn;
let bottomPanel, toggleBottomPanel, panelTabs, panelTabContents;
let logContent, resultContent, consoleContent, errorContent;
let contextMenu;
let contextMenuTarget = null;

/**
 * DOM 요소 초기화 (init 함수에서 호출)
 */
function initDOMElements() {
  console.log('=== DOM 요소 초기화 시작 ===');
  
  projectSelect = document.getElementById('project-select');
  newProjectBtn = document.getElementById('new-project-btn');
  tcTree = document.getElementById('tc-tree');
  newFolderBtn = document.getElementById('new-folder-btn');
  newTCTreeBtn = document.getElementById('new-tc-tree-btn');
  selectedCountSpan = document.getElementById('selected-count');
  runSelectedBtn = document.getElementById('run-selected-btn');
  
  tabButtons = document.querySelectorAll('.tab-btn');
  tabPanels = document.querySelectorAll('.tab-panel');
  
  tcDetailContent = document.getElementById('tc-detail-content');
  editTCBtn = document.getElementById('edit-tc-btn');
  recordBtn = document.getElementById('record-btn');
  newTCBtn = document.getElementById('new-tc-btn');
  
  scriptContent = document.getElementById('script-content');
  createScriptBtn = document.getElementById('create-script-btn');
  editScriptBtn = document.getElementById('edit-script-btn');
  saveScriptBtn = document.getElementById('save-script-btn');
  scriptLanguage = document.getElementById('script-language');
  scriptFramework = document.getElementById('script-framework');
  codeEditor = document.getElementById('code-editor');
  scriptCodeView = document.getElementById('script-code-view');
  scriptKeywordView = document.getElementById('script-keyword-view');
  viewButtons = document.querySelectorAll('.view-btn');
  keywordTableBody = document.getElementById('keyword-table-body');
  addKeywordBtn = document.getElementById('add-keyword-btn');
  
  pageObjectsList = document.getElementById('page-objects-list');
  pageObjectEditor = document.getElementById('page-object-editor');
  newPageObjectBtn = document.getElementById('new-page-object-btn');
  savePageObjectBtn = document.getElementById('save-page-object-btn');
  cancelPageObjectBtn = document.getElementById('cancel-page-object-btn');
  pageObjectNameInput = document.getElementById('page-object-name');
  pageObjectDescriptionInput = document.getElementById('page-object-description');
  pageObjectUrlPatternsInput = document.getElementById('page-object-url-patterns');
  pageObjectFrameworkSelect = document.getElementById('page-object-framework');
  pageObjectLanguageSelect = document.getElementById('page-object-language');
  pageObjectCodeEditor = document.getElementById('page-object-code-editor');
  
  resultDetailContent = document.getElementById('result-detail-content');
  refreshResultsBtn = document.getElementById('refresh-results-btn');
  
  recorderBrowser = document.getElementById('recorder-browser');
  startRecordingBtn = document.getElementById('start-recording-btn');
  stopRecordingBtn = document.getElementById('stop-recording-btn');
  recorderViewport = document.getElementById('recorder-viewport');
  eventsList = document.getElementById('events-list');
  
  resultsPanel = document.getElementById('results-panel');
  toggleResultsBtn = document.getElementById('toggle-results-btn');
  exportReportBtn = document.getElementById('export-report-btn');
  clearResultsBtn = document.getElementById('clear-results-btn');
  resultsList = document.getElementById('results-list');
  summaryTotal = document.getElementById('summary-total');
  summaryPassed = document.getElementById('summary-passed');
  summaryFailed = document.getElementById('summary-failed');
  summaryError = document.getElementById('summary-error');
  
  // 결과 오버레이
  const resultsOverlay = document.getElementById('results-overlay');
  const closeResultsOverlayBtn = document.getElementById('close-results-overlay-btn');
  
  runCurrentBtn = document.getElementById('run-current-btn');
  profileSelect = document.getElementById('profile-select');
  browserSelect = document.getElementById('browser-select');
  searchInput = document.getElementById('search-input');
  filterBtn = document.getElementById('filter-btn');
  settingsBtn = document.getElementById('settings-btn');
  
  bottomPanel = document.getElementById('bottom-panel');
  toggleBottomPanel = document.getElementById('toggle-bottom-panel');
  panelTabs = document.querySelectorAll('.panel-tab');
  panelTabContents = document.querySelectorAll('.panel-tab-content');
  logContent = document.getElementById('log-content');
  resultContent = document.getElementById('result-content');
  consoleContent = document.getElementById('console-content');
  errorContent = document.getElementById('error-content');
  
  contextMenu = document.getElementById('context-menu');
  
  console.log('=== DOM 요소 초기화 완료 ===');
  console.log('주요 요소 확인:');
  console.log('  projectSelect:', projectSelect ? '✅' : '❌', projectSelect);
  console.log('  newProjectBtn:', newProjectBtn ? '✅' : '❌', newProjectBtn);
  console.log('  runCurrentBtn:', runCurrentBtn ? '✅' : '❌', runCurrentBtn);
  console.log('  filterBtn:', filterBtn ? '✅' : '❌', filterBtn);
  console.log('  settingsBtn:', settingsBtn ? '✅' : '❌', settingsBtn);
  console.log('  tabButtons:', tabButtons ? tabButtons.length : 0);
  console.log('  tabPanels:', tabPanels ? tabPanels.length : 0);
  
  // 모든 버튼 요소 확인
  const allButtons = document.querySelectorAll('button');
  console.log('전체 버튼 개수:', allButtons.length);
  allButtons.forEach((btn, index) => {
    if (index < 10) { // 처음 10개만 출력
      console.log(`  버튼 ${index}:`, btn.id || btn.className, btn);
    }
  });
}

function getTabElements() {
  if (!tabButtons) {
    tabButtons = document.querySelectorAll('.tab-btn');
  }
  if (!tabPanels) {
    tabPanels = document.querySelectorAll('.tab-panel');
  }
  console.log('탭 요소 찾기 - 버튼:', tabButtons ? tabButtons.length : 0, '패널:', tabPanels ? tabPanels.length : 0);
  return { tabButtons, tabPanels };
}

// ============================================================================
// 유틸리티 함수
// ============================================================================

function addLog(type, message) {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  logEntry.textContent = `[${timestamp}] ${message}`;
  
  if (logContent) {
    logContent.appendChild(logEntry);
    logContent.scrollTop = logContent.scrollHeight;
  }

  // 콘솔에도 출력
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// ============================================================================
// Setup 함수들 (init() 함수에서 호출되므로 먼저 정의)
// ============================================================================

function setupEventListeners() {
  // DOM 요소 다시 확인 (초기화 시점에 DOM이 준비되었는지 확인)
  const projectSelectEl = document.getElementById('project-select');
  const newProjectBtnEl = document.getElementById('new-project-btn');
  
  if (!projectSelectEl) {
    console.error('projectSelect 요소를 찾을 수 없습니다.');
  }
  if (!newProjectBtnEl) {
    console.error('newProjectBtn 요소를 찾을 수 없습니다.');
  }
  
  // 프로젝트 선택
  if (projectSelectEl) {
    projectSelectEl.addEventListener('change', async (e) => {
    const projectId = e.target.value;
    if (projectId) {
      currentProject = { id: parseInt(projectId) };
      selectedTCs.clear();
      currentTC = null;
      updateSelectedCount();
      updateRunButton();
      await loadTCTree(projectId);
      // Page Objects 탭이 활성화되어 있으면 새로고침
      if (activeTab === 'page-objects') {
        await loadPageObjects(projectId);
      }
    } else {
      currentProject = null;
      currentTC = null;
      tcTree.innerHTML = '<div class="tree-placeholder">프로젝트를 선택하세요</div>';
      tcDetailContent.innerHTML = '<div class="placeholder">프로젝트를 선택하세요</div>';
    }
    });
  }

  // 새 프로젝트 버튼 (DOM에서 다시 찾기)
  if (newProjectBtnEl) {
    console.log('새 프로젝트 버튼 찾음:', newProjectBtnEl);
    
    newProjectBtnEl.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('새 프로젝트 버튼 클릭됨');
      
      try {
        console.log('showInputDialog 호출 전');
        const name = await showInputDialog('프로젝트 생성', '프로젝트 이름을 입력하세요:');
        console.log('showInputDialog 결과:', name);
        
        if (name && name.trim()) {
          console.log('createProject 호출:', name.trim());
          await createProject(name.trim());
        } else if (name !== null) {
          showMessageDialog('알림', '프로젝트 이름을 입력하세요.');
        }
      } catch (error) {
        console.error('프로젝트 생성 버튼 클릭 오류:', error);
        showMessageDialog('오류', '프로젝트 생성 중 오류가 발생했습니다: ' + error.message);
      }
    });
    
    // 디버깅: 버튼이 제대로 찾아졌는지 확인
    console.log('새 프로젝트 버튼 이벤트 리스너 등록 완료');
  } else {
    console.error('newProjectBtn 요소를 찾을 수 없습니다. HTML을 확인하세요.');
    console.error('현재 DOM 상태:', document.getElementById('new-project-btn'));
  }

  // 새 폴더 버튼 (트리 헤더)
  if (newFolderBtn) {
    newFolderBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        if (!currentProject) {
          showMessageDialog('알림', '먼저 프로젝트를 선택하세요.');
          return;
        }
        
        // 현재 선택된 항목 확인 (폴더면 그 하위에, 없으면 루트에)
        const parentItem = currentTC && currentTC.type === 'folder' ? currentTC : null;
        await createNewFolder(parentItem);
      } catch (error) {
        console.error('폴더 생성 버튼 클릭 오류:', error);
        showMessageDialog('오류', '폴더 생성 중 오류가 발생했습니다: ' + error.message);
      }
    });
    console.log('새 폴더 버튼 이벤트 리스너 등록 완료');
  } else {
    console.error('newFolderBtn 요소를 찾을 수 없습니다. HTML을 확인하세요.');
  }

  // 새 TC 버튼 (트리 헤더)
  if (newTCTreeBtn) {
    newTCTreeBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        if (!currentProject) {
          showMessageDialog('알림', '먼저 프로젝트를 선택하세요.');
          return;
        }

        const name = await showInputDialog('새 테스트케이스', '테스트케이스 이름을 입력하세요:');
        if (name && name.trim()) {
          // 현재 선택된 항목 확인 (폴더면 그 하위에, 없으면 루트에)
          const parentId = currentTC && currentTC.type === 'folder' ? currentTC.id : null;
          
          await createTestCase({
            project_id: currentProject.id,
            parent_id: parentId,
            name: name.trim(),
            type: 'test_case',
            status: 'draft'
          });
        }
      } catch (error) {
        console.error('TC 생성 오류:', error);
        showMessageDialog('오류', 'TC 생성 중 오류가 발생했습니다: ' + error.message);
      }
    });
    console.log('새 TC 버튼 (트리 헤더) 이벤트 리스너 등록 완료');
  } else {
    console.error('newTCTreeBtn 요소를 찾을 수 없습니다. HTML을 확인하세요.');
  }

  // 새 TC 버튼 (TC 상세 탭)
  if (newTCBtn) {
    newTCBtn.addEventListener('click', async () => {
      try {
        if (!currentProject) {
          showMessageDialog('알림', '먼저 프로젝트를 선택하세요.');
          return;
        }

        const name = await showInputDialog('새 테스트케이스', '테스트케이스 이름을 입력하세요:');
        if (name && name.trim()) {
          // 현재 선택된 항목 확인 (폴더면 그 하위에, 없으면 루트에)
          const parentId = currentTC && currentTC.type === 'folder' ? currentTC.id : null;
          
          await createTestCase({
            project_id: currentProject.id,
            parent_id: parentId,
            name: name.trim(),
            type: 'test_case',
            status: 'draft'
          });
        }
      } catch (error) {
        console.error('TC 생성 오류:', error);
        showMessageDialog('오류', 'TC 생성 중 오류가 발생했습니다: ' + error.message);
      }
    });
    console.log('새 TC 버튼 이벤트 리스너 등록 완료');
  }
  // newTCBtn이 없어도 계속 진행 (선택적 기능)

  // TC/폴더 편집 버튼
  if (editTCBtn) {
    editTCBtn.addEventListener('click', () => {
      if (currentTC) {
        if (currentTC.type === 'test_case') {
          editTestCase(currentTC);
        } else if (currentTC.type === 'folder') {
          editFolder(currentTC);
        }
      }
    });
  }

  // 녹화 버튼
  if (recordBtn) {
    recordBtn.addEventListener('click', async () => {
      // 녹화 중이면 중지
      if (isRecording) {
        await stopRecording();
        return;
      }

      // 녹화 시작
      if (!currentTC || currentTC.type === 'folder') {
        showMessageDialog('알림', '테스트케이스를 선택하거나 새 TC를 생성하세요.');
        return;
      }

      if (!currentProject) {
        showMessageDialog('알림', '먼저 프로젝트를 선택하세요.');
        return;
      }

      try {
        const sessionId = `session-${Date.now()}`;
        const result = await window.electronAPI.openBrowser({
          browser: 'chrome',
          tcId: currentTC.id,
          projectId: currentProject.id,
          sessionId: sessionId
        });

        if (result.success) {
          isRecording = true;
          currentRecordingSessionId = result.sessionId;
          addLog('info', `녹화 시작: 브라우저가 열렸습니다. 크롬 확장 프로그램에서 녹화를 시작하세요.`);
          recordBtn.disabled = false; // 중지 가능하도록 활성화
          recordBtn.innerHTML = '<span class="btn-icon">⏸️</span> 녹화 중지';
          
          // 녹화 사이드 패널 열기
          openRecorderSidePanel();
          
          // iframe에 초기화 메시지 전송
          const iframe = document.getElementById('recorder-iframe');
          if (iframe) {
            // iframe이 이미 로드되어 있으면 즉시 전송
            if (iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: 'recorder-init',
                tcId: currentTC.id,
                projectId: currentProject.id,
                sessionId: result.sessionId
              }, '*');
            } else {
              // iframe이 아직 로드되지 않았으면 로드 대기
              iframe.onload = () => {
                iframe.contentWindow.postMessage({
                  type: 'recorder-init',
                  tcId: currentTC.id,
                  projectId: currentProject.id,
                  sessionId: result.sessionId
                }, '*');
              };
            }
          }
          
          // 녹화 데이터 수신 대기
          window.electronAPI.onRecordingData((data) => {
            handleRecordingData(data);
            // iframe으로도 전달
            const iframe = document.getElementById('recorder-iframe');
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: 'recording-data',
                data: data
              }, '*');
            }
          });

          // 녹화 중지 신호 수신 대기
          window.electronAPI.onRecordingStop((data) => {
            handleRecordingStop(data);
            // iframe으로도 전달
            const iframe = document.getElementById('recorder-iframe');
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: 'recording-stop',
                data: data
              }, '*');
            }
          });
          
          // DOM 이벤트 수신 대기 (iframe으로 전달)
          window.electronAPI.onIpcMessage('dom-event', (data) => {
            const iframe = document.getElementById('recorder-iframe');
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: 'dom-event',
                event: data
              }, '*');
            }
          });
          
          // 녹화 시작/중지 신호 수신 (iframe으로 전달)
          window.electronAPI.onIpcMessage('recording-start', (data) => {
            const iframe = document.getElementById('recorder-iframe');
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: 'recording-start',
                data: data
              }, '*');
            }
          });
          
          window.electronAPI.onIpcMessage('recording-stop', (data) => {
            const iframe = document.getElementById('recorder-iframe');
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: 'recording-stop',
                data: data
              }, '*');
            }
          });
          
          window.electronAPI.onIpcMessage('element-hover', (data) => {
            const iframe = document.getElementById('recorder-iframe');
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: 'element-hover',
                data: data
              }, '*');
            }
          });
          
          window.electronAPI.onIpcMessage('element-hover-clear', (data) => {
            const iframe = document.getElementById('recorder-iframe');
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: 'element-hover-clear',
                data: data
              }, '*');
            }
          });
          
          // URL 변경 감지 (iframe으로 전달)
          window.electronAPI.onIpcMessage('url-changed', (data) => {
            const iframe = document.getElementById('recorder-iframe');
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: 'url-changed',
                url: data.url,
                tabId: data.tabId,
                timestamp: data.timestamp
              }, '*');
            }
            addLog('info', `페이지 전환: ${data.url}`);
          });
          
          // 요소 선택 결과 수신 (iframe으로 전달)
          window.electronAPI.onIpcMessage('element-selection-result', (data) => {
            const iframe = document.getElementById('recorder-iframe');
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: 'element-selection-result',
                ...data
              }, '*');
            }
          });
        } else {
          showMessageDialog('오류', `브라우저 열기 실패: ${result.error}`);
        }
      } catch (error) {
        console.error('녹화 시작 오류:', error);
        showMessageDialog('오류', `녹화 시작 실패: ${error.message}`);
      }
    });
    console.log('✅ record-btn 이벤트 리스너 등록 완료');
  } else {
    console.error('❌ record-btn 요소를 찾을 수 없습니다.');
  }

  // 실행
  if (runSelectedBtn) {
    runSelectedBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('runSelectedBtn 클릭됨');
      runSelectedTCs();
    });
    console.log('✅ runSelectedBtn 이벤트 리스너 등록 완료');
  } else {
    console.error('❌ runSelectedBtn 요소를 찾을 수 없습니다.');
  }

  // 기존 리코더 기능 (startRecordingBtn, stopRecordingBtn)은 새로운 record-btn으로 대체됨
  // HTML에 없으면 무시

  // 결과 패널 토글
  if (toggleResultsBtn && resultsPanel) {
    toggleResultsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('toggleResultsBtn 클릭됨');
      resultsPanel.classList.toggle('collapsed');
      toggleResultsBtn.textContent = resultsPanel.classList.contains('collapsed') ? '▶' : '◀';
    });
    console.log('✅ toggleResultsBtn 이벤트 리스너 등록 완료');
  }
  // 결과 패널이 없어도 계속 진행 (선택적 기능)

  // 리포트 내보내기
  if (exportReportBtn) {
    exportReportBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('exportReportBtn 클릭됨');
      alert('리포트 내보내기 기능은 향후 구현 예정입니다.');
    });
    console.log('✅ exportReportBtn 이벤트 리스너 등록 완료');
  } else {
    console.error('❌ exportReportBtn 요소를 찾을 수 없습니다.');
  }

  // 결과 지우기
  if (clearResultsBtn && resultsList) {
    clearResultsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('clearResultsBtn 클릭됨');
      resultsList.innerHTML = '<div class="placeholder">실행 결과가 여기에 표시됩니다</div>';
      updateSummary([]);
    });
    console.log('✅ clearResultsBtn 이벤트 리스너 등록 완료');
  } else {
    console.error('❌ clearResultsBtn 또는 resultsList 요소를 찾을 수 없습니다.');
  }

  // 상단 툴바
  if (runCurrentBtn) {
    runCurrentBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('runCurrentBtn 클릭됨');
      if (currentTC && currentTC.type === 'test_case') {
        runSingleTC(currentTC.id);
      } else {
        alert('테스트케이스를 선택하세요');
      }
    });
    console.log('✅ runCurrentBtn 이벤트 리스너 등록 완료');
  } else {
    console.error('❌ runCurrentBtn 요소를 찾을 수 없습니다.');
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      console.log('searchInput 입력:', e.target.value);
      filterTreeBySearch(e.target.value);
    });
    console.log('✅ searchInput 이벤트 리스너 등록 완료');
  } else {
    console.error('❌ searchInput 요소를 찾을 수 없습니다.');
  }

  // 필터 버튼 (향후 구현 예정)
  if (filterBtn) {
    filterBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('filterBtn 클릭됨');
      alert('필터 기능은 향후 구현 예정입니다.');
    });
    console.log('✅ filterBtn 이벤트 리스너 등록 완료');
  }

  // 설정 버튼 (향후 구현 예정)
  if (settingsBtn) {
    settingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('settingsBtn 클릭됨');
      alert('설정 기능은 향후 구현 예정입니다.');
    });
    console.log('✅ settingsBtn 이벤트 리스너 등록 완료');
  }

  // 스크립트 저장
  if (saveScriptBtn) {
    saveScriptBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('saveScriptBtn 클릭됨');
      saveScript();
    });
    console.log('✅ saveScriptBtn 이벤트 리스너 등록 완료');
  } else {
    console.error('❌ saveScriptBtn 요소를 찾을 수 없습니다.');
  }

  // 새 스크립트 생성
  if (createScriptBtn) {
    createScriptBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('createScriptBtn 클릭됨');
      if (!currentTC || currentTC.type === 'folder') {
        alert('테스트케이스를 선택하세요');
        return;
      }
      currentScript = null;
      if (codeMirrorEditor) {
        codeMirrorEditor.setValue(getDefaultScript());
        codeMirrorEditor.setOption('readOnly', false);
      }
      isDirty = true;
      updateSaveButton();
      createScriptBtn.disabled = true;
      addLog('info', '새 스크립트 생성 준비');
    });
    console.log('✅ createScriptBtn 이벤트 리스너 등록 완료');
  } else {
    console.error('❌ createScriptBtn 요소를 찾을 수 없습니다.');
  }

  // 결과 오버레이 닫기 버튼
  const closeResultsOverlayBtn = document.getElementById('close-results-overlay-btn');
  if (closeResultsOverlayBtn) {
    closeResultsOverlayBtn.addEventListener('click', () => {
      const resultsOverlay = document.getElementById('results-overlay');
      if (resultsOverlay) {
        resultsOverlay.classList.remove('show');
        // activity-bar의 results 항목에서 active 클래스 제거
        const resultsActivityItem = document.querySelector('.activity-bar-item[data-view="results"]');
        if (resultsActivityItem) {
          resultsActivityItem.classList.remove('active');
        }
      }
    });
    console.log('✅ close-results-overlay-btn 이벤트 리스너 등록 완료');
  }

  // 키워드 추가 버튼
  if (addKeywordBtn && keywordTableBody) {
    addKeywordBtn.addEventListener('click', () => {
      const newRow = createKeywordRow(keywordTableBody.children.length + 1, {
        action: '',
        target: '',
        value: '',
        description: ''
      });
      keywordTableBody.appendChild(newRow);
      updateKeywordTable();
    });
    console.log('✅ addKeywordBtn 이벤트 리스너 등록 완료');
  } else {
    console.error('❌ addKeywordBtn 또는 keywordTableBody 요소를 찾을 수 없습니다.');
  }

  // Activity Bar (왼쪽 사이드 메뉴) 클릭 이벤트
  const activityBarItems = document.querySelectorAll('.activity-bar-item');
  activityBarItems.forEach(item => {
    // SVG 내부 요소 클릭도 처리하기 위해 이벤트 위임 사용
    item.addEventListener('click', (e) => {
      // SVG 내부 요소(path 등)를 클릭한 경우에도 부모 요소의 이벤트 처리
      const target = e.target.closest('.activity-bar-item');
      if (!target) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const view = target.dataset.view;
      console.log('Activity Bar 클릭:', view);
      
      // 모든 activity-bar-item에서 active 클래스 제거
      activityBarItems.forEach(barItem => barItem.classList.remove('active'));
      // 클릭한 항목에 active 클래스 추가
      target.classList.add('active');
      
      // view에 따라 처리
      if (view === 'results') {
        // 결과 오버레이 표시
        const resultsOverlay = document.getElementById('results-overlay');
        if (resultsOverlay) {
          resultsOverlay.classList.add('show');
          console.log('✅ 결과 오버레이 표시');
        } else {
          console.error('❌ results-overlay 요소를 찾을 수 없습니다.');
        }
      } else if (view === 'log') {
        // 로그 오버레이 표시
        const logOverlay = document.getElementById('log-overlay');
        if (logOverlay) {
          logOverlay.classList.add('show');
          console.log('✅ 로그 오버레이 표시');
        } else {
          console.error('❌ log-overlay 요소를 찾을 수 없습니다.');
        }
      } else if (view === 'explorer') {
        // 탐색기는 기본적으로 표시되어 있음
        console.log('✅ 탐색기 뷰');
      } else if (view === 'search') {
        // 검색 기능 (향후 구현)
        console.log('✅ 검색 뷰 (향후 구현)');
      } else if (view === 'settings') {
        // 설정 기능 (향후 구현)
        console.log('✅ 설정 뷰 (향후 구현)');
      } else if (view === 'recorder') {
        // 녹화 사이드패널 토글
        const recorderPanel = document.getElementById('recorder-side-panel');
        if (recorderPanel) {
          if (recorderPanel.classList.contains('hidden')) {
            openRecorderSidePanel();
          } else {
            closeRecorderSidePanel();
          }
        }
      }
    });
  });
  console.log('✅ Activity Bar 이벤트 리스너 등록 완료');

  console.log('=== setupEventListeners() 완료 ===');
}

function setupProjectExplorer() {
  const sectionHeaders = document.querySelectorAll('.section-header');
  
  sectionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const section = header.dataset.section;
      const content = document.getElementById(`${section}-section`);
      const toggle = header.querySelector('.section-toggle');
      
      content.classList.toggle('collapsed');
      toggle.textContent = content.classList.contains('collapsed') ? '▶' : '▼';
    });
  });

  // 프로파일 선택
  const profileItems = document.querySelectorAll('.profile-item');
  profileItems.forEach(item => {
    item.addEventListener('click', () => {
      profileItems.forEach(p => p.classList.remove('active'));
      item.classList.add('active');
      profileSelect.value = item.dataset.profile;
      addLog('info', `프로파일 변경: ${item.dataset.profile}`);
    });
  });
}

function setupBottomPanel() {
  // 하단 패널이 없으면 건너뛰기
  if (!toggleBottomPanel || !bottomPanel) {
    return;
  }

  // 패널 토글
  toggleBottomPanel.addEventListener('click', () => {
    bottomPanel.classList.toggle('collapsed');
    toggleBottomPanel.textContent = bottomPanel.classList.contains('collapsed') ? '▲' : '▼';
  });
}

// 녹화 사이드 패널 관리
function openRecorderSidePanel() {
  const sidePanel = document.getElementById('recorder-side-panel');
  const mainWrapper = document.querySelector('.main-content-wrapper');
  const iframe = document.getElementById('recorder-iframe');
  
  if (sidePanel && mainWrapper) {
    sidePanel.classList.remove('hidden');
    mainWrapper.classList.add('recorder-panel-open');
    
    // iframe이 로드되지 않았으면 로드
    if (iframe && !iframe.src.includes('recorder.html')) {
      iframe.src = 'recorder.html';
    }
  }
}

function closeRecorderSidePanel() {
  const sidePanel = document.getElementById('recorder-side-panel');
  const mainWrapper = document.querySelector('.main-content-wrapper');
  
  if (sidePanel && mainWrapper) {
    sidePanel.classList.add('hidden');
    mainWrapper.classList.remove('recorder-panel-open');
  }
}

function setupRecorderSidePanel() {
  const toggleBtn = document.getElementById('recorder-panel-toggle');
  
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      closeRecorderSidePanel();
    });
  }
}

function setupContextMenu() {
  // 메뉴 항목 클릭
  const menuItems = document.querySelectorAll('.context-menu-item');
  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      handleContextMenuAction(action);
      hideContextMenu();
    });
  });

  // 외부 클릭 시 메뉴 숨김
  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target) && !e.target.closest('.tc-tree-item')) {
      hideContextMenu();
    }
  });

  // 트리 영역 빈 공간 우클릭 시 컨텍스트 메뉴 표시 (TestRail 스타일)
  if (tcTree) {
    tcTree.addEventListener('contextmenu', (e) => {
      // 트리 아이템 위에 있으면 기본 동작 사용
      if (e.target.closest('.tc-tree-item')) {
        return;
      }
      
      e.preventDefault();
      // 빈 공간 우클릭 시 루트에 폴더 생성 메뉴 표시
      showContextMenu(e.pageX, e.pageY, {
        type: 'root',
        id: null,
        name: '루트'
      });
    });
  }
}

function showContextMenu(x, y, item) {
  contextMenuTarget = item;
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  
  // 컨텍스트 메뉴 항목 표시/숨김 처리
  const menuItems = contextMenu.querySelectorAll('.context-menu-item');
  menuItems.forEach(menuItem => {
    const action = menuItem.dataset.action;
    
    // 실행: test_case만 표시
    if (action === 'run') {
      menuItem.style.display = item.type === 'test_case' ? 'block' : 'none';
    }
    // 편집: test_case와 folder만 표시
    else if (action === 'edit') {
      menuItem.style.display = (item.type === 'test_case' || item.type === 'folder') ? 'block' : 'none';
    }
    // 복제: test_case만 표시
    else if (action === 'duplicate') {
      menuItem.style.display = item.type === 'test_case' ? 'block' : 'none';
    }
    // 새 폴더: root, folder만 표시 (test_case 하위에는 생성 불가)
    else if (action === 'new-folder') {
      menuItem.style.display = (item.type === 'root' || item.type === 'folder') ? 'block' : 'none';
    }
    // 새 TC: root, folder만 표시 (test_case 하위에는 생성 불가)
    else if (action === 'new-tc') {
      menuItem.style.display = (item.type === 'root' || item.type === 'folder') ? 'block' : 'none';
    }
    // 삭제: root는 삭제 불가
    else if (action === 'delete') {
      menuItem.style.display = item.type === 'root' ? 'none' : 'block';
    }
  });
  
  contextMenu.classList.add('show');
}

function hideContextMenu() {
  contextMenu.classList.remove('show');
  contextMenuTarget = null;
}

function handleContextMenuAction(action) {
  if (!contextMenuTarget) return;

  switch (action) {
    case 'run':
      if (contextMenuTarget.type === 'test_case') {
        runSingleTC(contextMenuTarget.id);
      }
      break;
    case 'edit':
      if (contextMenuTarget.type === 'test_case') {
        selectTC(contextMenuTarget);
        editTCBtn.click();
      } else if (contextMenuTarget.type === 'folder') {
        editFolder(contextMenuTarget);
      }
      break;
    case 'duplicate':
      addLog('info', `TC 복제: ${contextMenuTarget.name}`);
      alert('복제 기능은 향후 구현 예정입니다.');
      break;
    case 'delete':
      if (contextMenuTarget.type === 'root') {
        return; // 루트는 삭제 불가
      }
      if (confirm(`'${contextMenuTarget.name}'을(를) 삭제하시겠습니까?`)) {
        deleteTC(contextMenuTarget.id);
      }
      break;
    case 'new-folder':
      // 루트 우클릭 시 또는 폴더 우클릭 시
      if (contextMenuTarget.type === 'root' || contextMenuTarget.type === 'folder') {
        createNewFolder(contextMenuTarget.type === 'root' ? null : contextMenuTarget);
      } else {
        // 테스트케이스 우클릭 시에는 부모 폴더에 생성 (또는 루트)
        createNewFolder(null);
      }
      break;
    case 'new-tc':
      // 루트 우클릭 시 또는 폴더 우클릭 시
      if (contextMenuTarget.type === 'root' || contextMenuTarget.type === 'folder') {
        createTestCaseFromContext(contextMenuTarget.type === 'root' ? null : contextMenuTarget);
      } else {
        // 테스트케이스 우클릭 시에는 부모 폴더에 생성 (또는 루트)
        createTestCaseFromContext(null);
      }
      break;
  }
}

function showInputDialog(title, message, defaultValue = '') {
  return new Promise((resolve) => {
    // 기존 다이얼로그가 있으면 제거
    const existing = document.getElementById('input-dialog');
    if (existing) {
      existing.remove();
    }

    // 다이얼로그 생성
    const dialog = document.createElement('div');
    dialog.id = 'input-dialog';
    dialog.className = 'modal-dialog';
    
    const dialogContent = document.createElement('div');
    dialogContent.className = 'modal-content';
    
    // 헤더
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<h3>${title}</h3>`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => {
      dialog.remove();
      resolve(null);
    });
    header.appendChild(closeBtn);
    
    // 바디
    const body = document.createElement('div');
    body.className = 'modal-body';
    body.innerHTML = `<p>${message}</p>`;
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'input-dialog-input';
    input.className = 'modal-input';
    input.value = defaultValue;
    input.placeholder = '이름을 입력하세요';
    body.appendChild(input);
    
    // 푸터
    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = '취소';
    cancelBtn.addEventListener('click', () => {
      dialog.remove();
      resolve(null);
    });
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = '확인';
    confirmBtn.addEventListener('click', () => {
      dialog.remove();
      resolve(input.value);
    });
    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    
    dialogContent.appendChild(header);
    dialogContent.appendChild(body);
    dialogContent.appendChild(footer);
    dialog.appendChild(dialogContent);

    // 다이얼로그 표시
    document.body.appendChild(dialog);
    
    // 다이얼로그가 제대로 추가되었는지 확인
    const addedDialog = document.getElementById('input-dialog');
    if (!addedDialog) {
      console.error('다이얼로그가 DOM에 추가되지 않았습니다.');
      resolve(null);
      return;
    }
    
    input.focus();
    input.select();

    // Enter 키로 확인
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        dialog.remove();
        resolve(input.value);
      } else if (e.key === 'Escape') {
        dialog.remove();
        resolve(null);
      }
    });
  });
}

function showMessageDialog(title, message) {
  return new Promise((resolve) => {
    // 기존 다이얼로그가 있으면 제거
    const existing = document.getElementById('message-dialog');
    if (existing) {
      existing.remove();
    }

    // 다이얼로그 생성
    const dialog = document.createElement('div');
    dialog.id = 'message-dialog';
    dialog.className = 'modal-dialog';
    
    const dialogContent = document.createElement('div');
    dialogContent.className = 'modal-content';
    
    // 헤더
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<h3>${title}</h3>`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => {
      dialog.remove();
      resolve();
    });
    header.appendChild(closeBtn);
    
    // 바디
    const body = document.createElement('div');
    body.className = 'modal-body';
    body.innerHTML = `<p>${message}</p>`;
    
    // 푸터
    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = '확인';
    confirmBtn.addEventListener('click', () => {
      dialog.remove();
      resolve();
    });
    footer.appendChild(confirmBtn);
    
    dialogContent.appendChild(header);
    dialogContent.appendChild(body);
    dialogContent.appendChild(footer);
    dialog.appendChild(dialogContent);

    // 다이얼로그 표시
    document.body.appendChild(dialog);
    confirmBtn.focus();
  });
}

function setupPageObjects() {
  if (!newPageObjectBtn) return;
  
  newPageObjectBtn.addEventListener('click', () => {
    if (!currentProject) {
      showMessageDialog('알림', '프로젝트를 먼저 선택하세요.');
      return;
    }
    createNewPageObject();
  });
  
  if (savePageObjectBtn) {
    savePageObjectBtn.addEventListener('click', savePageObject);
  }
  
  if (cancelPageObjectBtn) {
    cancelPageObjectBtn.addEventListener('click', cancelPageObjectEdit);
  }
  
  // Page Object 코드 에디터 초기화
  if (pageObjectCodeEditor) {
    pageObjectCodeMirrorEditor = CodeMirror.fromTextArea(pageObjectCodeEditor, {
      lineNumbers: true,
      mode: 'python',
      theme: 'monokai',
      indentUnit: 4,
      indentWithTabs: false,
      lineWrapping: true
    });
  }
}

function updateSelectedCount() {
  selectedCountSpan.textContent = selectedTCs.size;
}

function updateRunButton() {
  runSelectedBtn.disabled = selectedTCs.size === 0;
}

async function createTestCase(data) {
  try {
    if (!window.electronAPI?.api?.createTestCase) {
      showMessageDialog('오류', 'TC 생성 API가 없습니다.');
      return;
    }

    addLog('info', `TC 생성 중: ${data.name}`);
    
    const response = await window.electronAPI.api.createTestCase(data);
    
    if (response && response.success) {
      addLog('success', `TC 생성 완료: ${data.name}`);
      
      // TC 트리 새로고침
      if (currentProject) {
        await loadTCTree(currentProject.id);
      }
      
      // 새로 생성된 TC 선택
      if (response.data) {
        selectTC(response.data);
      }
      
      showMessageDialog('성공', `테스트케이스 '${data.name}'이(가) 생성되었습니다.`);
    } else {
      const errorMsg = response?.error || '알 수 없는 오류';
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error('TC 생성 실패:', error);
    const errorMessage = error.message || '알 수 없는 오류가 발생했습니다';
    addLog('error', `TC 생성 실패: ${errorMessage}`);
    showMessageDialog('오류', `TC 생성 실패: ${errorMessage}`);
  }
}

async function createNewFolder(parentItem = null) {
  try {
    if (!currentProject) {
      showMessageDialog('알림', '먼저 프로젝트를 선택하세요.');
      return;
    }

    // parentItem이 없으면 현재 선택된 항목 확인
    let actualParent = parentItem;
    if (!actualParent && currentTC && currentTC.type === 'folder') {
      actualParent = currentTC;
    }

    // 부모가 테스트케이스인 경우 폴더 생성 불가
    if (actualParent && actualParent.type === 'test_case') {
      showMessageDialog('오류', '테스트케이스 하위에는 폴더를 생성할 수 없습니다. 폴더는 다른 폴더나 루트에만 생성할 수 있습니다.');
      return;
    }

    const name = await showInputDialog('새 폴더', '폴더 이름을 입력하세요:');
    if (name && name.trim()) {
      const folderData = {
        project_id: currentProject.id,
        parent_id: (actualParent && actualParent.type === 'folder') ? actualParent.id : null,
        name: name.trim(),
        type: 'folder',
        status: 'active'
      };

      const response = await window.electronAPI.api.createTestCase(folderData);
      
      if (response && response.success) {
        addLog('success', `폴더 생성 완료: ${name.trim()}`);
        
        // TC 트리 새로고침
        if (currentProject) {
          await loadTCTree(currentProject.id);
        }
        
        showMessageDialog('성공', `폴더 '${name.trim()}'이(가) 생성되었습니다.`);
      } else {
        throw new Error(response?.error || '폴더 생성 실패');
      }
    }
  } catch (error) {
    console.error('폴더 생성 실패:', error);
    addLog('error', `폴더 생성 실패: ${error.message}`);
    showMessageDialog('오류', `폴더 생성 실패: ${error.message}`);
  }
}

async function savePageObject() {
  if (!currentProject) {
    showMessageDialog('알림', '프로젝트를 먼저 선택하세요.');
    return;
  }
  
  try {
    const name = pageObjectNameInput?.value?.trim();
    if (!name) {
      showMessageDialog('알림', '이름을 입력하세요.');
      return;
    }
    
    let urlPatterns = [];
    try {
      urlPatterns = JSON.parse(pageObjectUrlPatternsInput?.value || '[]');
    } catch (e) {
      showMessageDialog('오류', 'URL 패턴이 올바른 JSON 형식이 아닙니다.');
      return;
    }
    
    const code = pageObjectCodeMirrorEditor?.getValue() || '';
    if (!code.trim()) {
      showMessageDialog('알림', '코드를 입력하세요.');
      return;
    }
    
    const data = {
      project_id: currentProject.id,
      name,
      description: pageObjectDescriptionInput?.value?.trim() || null,
      url_patterns: urlPatterns,
      framework: pageObjectFrameworkSelect?.value || 'pytest',
      language: pageObjectLanguageSelect?.value || 'python',
      code,
      status: 'active'
    };
    
    let response;
    if (currentPageObject) {
      response = await window.electronAPI.api.updatePageObject(currentPageObject.id, data);
    } else {
      response = await window.electronAPI.api.createPageObject(data);
    }
    
    if (response.success) {
      showMessageDialog('성공', 'Page Object가 저장되었습니다.');
      cancelPageObjectEdit();
      await loadPageObjects(currentProject.id);
    } else {
      throw new Error(response.error || '저장 실패');
    }
  } catch (error) {
    console.error('Page Object 저장 실패:', error);
    showMessageDialog('오류', `저장 실패: ${error.message}`);
  }
}

function cancelPageObjectEdit() {
  currentPageObject = null;
  
  if (pageObjectEditor) {
    pageObjectEditor.style.display = 'none';
  }
  
  if (pageObjectsList) {
    pageObjectsList.style.display = 'block';
  }
}

function setupTabs() {
  const { tabButtons: buttons, tabPanels: panels } = getTabElements();
  tabButtons = buttons;
  tabPanels = panels;
  
  console.log('setupTabs 호출 - tabButtons 개수:', tabButtons ? tabButtons.length : 0);
  
  if (!tabButtons || tabButtons.length === 0) {
    console.error('탭 버튼을 찾을 수 없습니다.');
    // 재시도
    setTimeout(() => {
      const { tabButtons: retryButtons } = getTabElements();
      if (retryButtons && retryButtons.length > 0) {
        console.log('재시도: 탭 버튼 찾기 성공');
        setupTabs();
      }
    }, 500);
    return;
  }
  
  tabButtons.forEach((btn, index) => {
    console.log(`탭 버튼 ${index} 등록:`, btn.dataset.tab);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tabName = btn.dataset.tab;
      console.log('탭 클릭:', tabName);
      switchTab(tabName);
    });
  });
  
  console.log('탭 이벤트 리스너 등록 완료');
}

function switchTab(tabName) {
  console.log('switchTab 호출:', tabName);
  
  if (!tabName) {
    console.error('탭 이름이 없습니다.');
    return;
  }
  
  // 탭 요소 다시 찾기 (전역 변수가 없을 때만)
  if (!tabButtons || tabButtons.length === 0 || !tabPanels || tabPanels.length === 0) {
    const { tabButtons: buttons, tabPanels: panels } = getTabElements();
    if (buttons) tabButtons = buttons;
    if (panels) tabPanels = panels;
  }
  
  // 탭 버튼 활성화
  if (tabButtons && tabButtons.length > 0) {
    tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
  } else {
    console.error('탭 버튼을 찾을 수 없습니다.');
  }

  // 탭 패널 표시
  if (tabPanels && tabPanels.length > 0) {
    tabPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });
  } else {
    console.error('탭 패널을 찾을 수 없습니다.');
  }

  activeTab = tabName;
  console.log('탭 전환 완료:', tabName);

  // 탭별 초기화
  if (tabName === 'script') {
    if (currentTC) {
      loadScripts(currentTC.id);
    } else {
      showScriptPlaceholder();
    }
  } else if (tabName === 'result' && currentTC) {
    loadResultDetail(currentTC.id);
  } else if (tabName === 'page-objects') {
    if (currentProject) {
      loadPageObjects(currentProject.id);
    } else {
      showPageObjectsPlaceholder();
    }
  }
}

// ============================================================================
// 프로젝트 관리
// ============================================================================

async function loadProjects() {
  try {
    // electronAPI 확인
    if (!window.electronAPI) {
      console.error('window.electronAPI가 없습니다. preload 스크립트가 로드되지 않았습니다.');
      addLog('error', 'Electron API가 초기화되지 않았습니다. 앱을 재시작하세요.');
      return;
    }

    if (!window.electronAPI.api) {
      console.error('window.electronAPI.api가 없습니다.');
      addLog('error', 'API 서비스가 초기화되지 않았습니다.');
      return;
    }

    if (!window.electronAPI.api.getProjects) {
      console.error('getProjects API가 없습니다.');
      addLog('error', '프로젝트 조회 API가 없습니다.');
      return;
    }

    addLog('info', '프로젝트 목록을 불러오는 중...');
    const response = await window.electronAPI.api.getProjects();
    
    if (response && response.success) {
      projectSelect.innerHTML = '<option value="">프로젝트를 선택하세요</option>';
      if (response.data && Array.isArray(response.data)) {
        response.data.forEach(project => {
          const option = document.createElement('option');
          option.value = project.id;
          option.textContent = project.name;
          projectSelect.appendChild(option);
        });
        addLog('success', `프로젝트 ${response.data.length}개를 불러왔습니다.`);
      } else {
        addLog('info', '프로젝트가 없습니다.');
      }
    } else {
      const errorMsg = response?.error || '알 수 없는 오류';
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error('프로젝트 로드 실패:', error);
    const errorMessage = error.message || '알 수 없는 오류';
    addLog('error', `프로젝트 로드 실패: ${errorMessage}`);
    
    // 서버 연결 오류인 경우 안내
    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('타임아웃') || errorMessage.includes('connect')) {
      addLog('error', '서버에 연결할 수 없습니다. 서버를 실행하세요: npm run server');
    }
  }
}

async function loadTCTree(projectId) {
  try {
    if (!projectId) {
      tcTree.innerHTML = '<div class="tree-placeholder">프로젝트를 선택하세요</div>';
      return;
    }

    if (!window.electronAPI?.api?.getTCTree) {
      console.error('TC 트리 API가 없습니다.');
      addLog('error', 'TC 트리 API가 초기화되지 않았습니다.');
      tcTree.innerHTML = '<div class="tree-placeholder">TC를 불러올 수 없습니다</div>';
      return;
    }

    addLog('info', `프로젝트 #${projectId}의 TC 트리를 불러오는 중...`);
    const response = await window.electronAPI.api.getTCTree(projectId);
    
    if (response && response.success) {
      tcTreeData = response.data || [];
      renderTCTree(tcTreeData);
      // 체크박스 상태 복원
      restoreCheckboxStates();
      addLog('success', 'TC 트리를 불러왔습니다.');
    } else {
      const errorMsg = response?.error || '알 수 없는 오류';
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error('TC 트리 로드 실패:', error);
    const errorMessage = error.message || '알 수 없는 오류';
    addLog('error', `TC 트리 로드 실패: ${errorMessage}`);
    tcTree.innerHTML = `<div class="tree-placeholder">TC를 불러올 수 없습니다: ${errorMessage}</div>`;
  }
}

// ============================================================================
// TC 트리 렌더링 (TestRail 스타일)
// ============================================================================

function renderTCTree(tree, parentElement = null, level = 0) {
  if (!parentElement) {
    tcTree.innerHTML = '';
    parentElement = tcTree;
  }

  if (!tree || tree.length === 0) {
    if (level === 0) {
      tcTree.innerHTML = '<div class="tree-placeholder">테스트케이스가 없습니다</div>';
    }
    return;
  }

  tree.forEach(item => {
    // 트리 아이템을 감싸는 컨테이너 생성
    const itemWrapper = document.createElement('div');
    itemWrapper.className = 'tree-item-wrapper';
    
    const treeItem = createTreeItem(item, level);
    itemWrapper.appendChild(treeItem);

    // 자식 노드가 있으면 재귀적으로 렌더링
    if (item.children && item.children.length > 0) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';
      // TestRail 스타일: 폴더는 기본적으로 펼쳐진 상태로 표시
      childrenContainer.style.display = item.type === 'folder' ? 'block' : 'none';
      itemWrapper.appendChild(childrenContainer);
      renderTCTree(item.children, childrenContainer, level + 1);
    }
    
    parentElement.appendChild(itemWrapper);
  });
}

function createTreeItem(item, level) {
  const div = document.createElement('div');
  div.className = `tc-tree-item ${item.type}`;
  div.dataset.tcId = item.id;
  div.dataset.tcType = item.type;
  div.style.paddingLeft = `${level * 20 + 8}px`;

  // 드래그 가능 설정 (test_case와 folder 모두)
  if (item.type === 'test_case' || item.type === 'folder') {
    div.draggable = true;
    div.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({
        id: item.id,
        type: item.type,
        name: item.name
      }));
      div.classList.add('dragging');
    });
    div.addEventListener('dragend', () => {
      div.classList.remove('dragging');
      document.querySelectorAll('.tc-tree-item.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });
    });
  }

  // 드롭 영역 설정 (폴더만)
  if (item.type === 'folder') {
    div.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      div.classList.add('drag-over');
    });
    div.addEventListener('dragleave', () => {
      div.classList.remove('drag-over');
    });
    div.addEventListener('drop', async (e) => {
      e.preventDefault();
      div.classList.remove('drag-over');
      
      try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        // 폴더는 폴더나 테스트케이스를 받을 수 있음
        if (data.type === 'test_case' || data.type === 'folder') {
          await moveTCToFolder(data.id, item.id);
        }
      } catch (error) {
        console.error('드롭 처리 실패:', error);
        addLog('error', `이동 실패: ${error.message}`);
        showMessageDialog('오류', `이동 실패: ${error.message}`);
      }
    });
  }

  // 체크박스 (폴더와 test_case 모두)
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = selectedTCs.has(item.id);
  checkbox.addEventListener('change', (e) => {
    e.stopPropagation();
    if (e.target.checked) {
      // 선택: 자신과 모든 하위 항목 선택
      selectItemAndChildren(item, true);
    } else {
      // 선택 해제: 자신과 모든 하위 항목 선택 해제
      selectItemAndChildren(item, false);
    }
    updateSelectedCount();
    updateRunButton();
  });
  div.appendChild(checkbox);

  // 폴더 확장/축소 화살표 (폴더만)
  let expandIcon = null;
  if (item.type === 'folder') {
    expandIcon = document.createElement('span');
    expandIcon.className = 'tree-expand-icon';
    const hasChildren = item.children && item.children.length > 0;
    // 자식이 있으면 펼쳐진 상태(▼), 없으면 접힌 상태(▶)
    expandIcon.textContent = hasChildren ? '▼' : '▶';
    expandIcon.style.cursor = 'pointer';
    expandIcon.style.marginRight = '4px';
    expandIcon.style.width = '16px';
    expandIcon.style.display = 'inline-block';
    expandIcon.style.textAlign = 'center';
    expandIcon.title = hasChildren ? '클릭하여 접기' : '클릭하여 펼치기';
    div.appendChild(expandIcon);
  }
  
  // 아이콘
  const icon = document.createElement('span');
  icon.className = 'tc-tree-item-icon';
  // 폴더에 자식이 있으면 열린 폴더 아이콘, 없으면 닫힌 폴더 아이콘
  if (item.type === 'folder') {
    const hasChildren = item.children && item.children.length > 0;
    icon.textContent = hasChildren ? '📂' : '📁';
    icon.style.cursor = 'default';
    icon.title = '폴더';
  } else {
    icon.textContent = '📄';
    icon.style.cursor = 'default';
  }
  div.appendChild(icon);

  // 이름
  const name = document.createElement('span');
  name.className = 'tc-tree-item-name';
  name.textContent = item.name;
  div.appendChild(name);

  // 상태 배지 (Katalon 스타일)
  const status = document.createElement('div');
  status.className = 'tc-tree-item-status';
  if (item.type === 'test_case') {
    // 스크립트 상태
    if (item.hasScript) {
      const badge = document.createElement('span');
      badge.className = 'status-badge passed';
      badge.textContent = '✓';
      badge.title = '스크립트 있음';
      status.appendChild(badge);
    } else {
      const badge = document.createElement('span');
      badge.className = 'status-badge no-script';
      badge.textContent = '!';
      badge.title = '스크립트 없음';
      status.appendChild(badge);
    }
    
    // 실행 결과 상태 (최근 실행 결과)
    if (item.lastResult) {
      const resultBadge = document.createElement('span');
      resultBadge.className = `status-badge ${item.lastResult}`;
      resultBadge.textContent = item.lastResult === 'passed' ? '✓' : item.lastResult === 'failed' ? '✗' : '!';
      resultBadge.title = `최근 실행: ${item.lastResult}`;
      status.appendChild(resultBadge);
    }
  }
  div.appendChild(status);

  // 폴더 확장/축소 함수
  const toggleFolder = () => {
    // 부모 wrapper에서 children 찾기
    const wrapper = div.closest('.tree-item-wrapper');
    if (wrapper) {
      const children = wrapper.querySelector('.tree-children');
      if (children) {
        const isHidden = children.style.display === 'none' || children.style.display === '';
        children.style.display = isHidden ? 'block' : 'none';
        // 폴더 아이콘 업데이트: 열림(📂) ↔ 닫힘(📁)
        icon.textContent = isHidden ? '📂' : '📁';
        // 화살표 아이콘 업데이트: 펼침(▼) ↔ 접힘(▶)
        if (expandIcon) {
          expandIcon.textContent = isHidden ? '▼' : '▶';
          expandIcon.title = isHidden ? '클릭하여 접기' : '클릭하여 펼치기';
        }
      }
    }
  };
  
  // 폴더에 자식이 있으면 초기 상태를 열린 상태로 설정
  if (item.type === 'folder' && item.children && item.children.length > 0) {
    // 아이콘은 이미 위에서 설정됨 (📂)
  }

  // 화살표 클릭 이벤트 (폴더만)
  if (expandIcon) {
    expandIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFolder();
    });
    
    // 화살표 더블클릭 방지 (클릭만 처리)
    expandIcon.addEventListener('dblclick', (e) => {
      e.stopPropagation();
    });
  }

  // 클릭 이벤트 처리
  div.addEventListener('click', (e) => {
    // 체크박스 클릭은 무시
    if (e.target.type === 'checkbox') {
      return;
    }
    
    // 화살표 클릭은 이미 처리됨
    if (e.target === expandIcon || e.target.closest('.tree-expand-icon')) {
      return;
    }
    
    // 폴더나 테스트케이스 클릭은 선택만
    selectTC(item);
  });

  // 우클릭 이벤트 (컨텍스트 메뉴)
  div.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.pageX, e.pageY, item);
  });

  // 폴더 더블클릭은 편집 (TestRail 스타일)
  if (item.type === 'folder') {
    name.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      selectTC(item);
      editFolder(item);
    });
  }

  return div;
}

// ============================================================================
// TC 선택 및 상세 정보
// ============================================================================

async function selectTC(tc) {
  // TC를 선택할 때 DB에서 최신 데이터를 다시 로드하여 캐시 문제 방지
  if (tc && tc.id) {
    try {
      const latestTC = await window.electronAPI.api.getTestCase(tc.id);
      if (latestTC && latestTC.success && latestTC.data) {
        // DB에서 가져온 최신 데이터로 교체
        tc = latestTC.data;
        console.log(`[Renderer] selectTC: DB에서 최신 TC 데이터 로드 완료 (TC ${tc.id})`);
      } else {
        console.warn(`[Renderer] selectTC: TC ${tc.id}의 최신 데이터 로드 실패, 캐시된 데이터 사용`);
      }
    } catch (error) {
      console.error(`[Renderer] selectTC: TC ${tc.id}의 최신 데이터 로드 중 오류:`, error);
      // 오류 발생 시 캐시된 데이터 사용
    }
  }
  
  // steps 파싱 (JSON 문자열인 경우)
  if (tc && tc.steps && typeof tc.steps === 'string') {
    try {
      tc.steps = JSON.parse(tc.steps);
    } catch (e) {
      console.warn('Steps 파싱 실패:', e);
      tc.steps = null;
    }
  }
  
  // steps가 배열이 아닌 경우 빈 배열로 설정
  if (tc && tc.steps && !Array.isArray(tc.steps)) {
    tc.steps = null;
  }
  
  // steps가 null이면 빈 배열로 초기화
  if (!tc.steps) {
    tc.steps = [];
  }
  
  currentTC = tc;
  
  // 디버깅: steps 개수 확인
  console.log(`[Renderer] selectTC 호출: TC ${tc.id}, Steps ${Array.isArray(tc.steps) ? tc.steps.length : 0}개`);

  // 모든 선택 해제
  document.querySelectorAll('.tc-tree-item').forEach(item => {
    item.classList.remove('selected');
  });

  // 현재 항목 선택
  const treeItem = document.querySelector(`[data-tc-id="${tc.id}"]`);
  if (treeItem) {
    treeItem.classList.add('selected');
  }

  // 탭별 정보 표시
  if (activeTab === 'detail') {
    console.log(`[Renderer] selectTC: detail 탭 활성화, displayTCDetail 호출 (TC ${tc.id}, Steps ${Array.isArray(tc.steps) ? tc.steps.length : 0}개)`);
    displayTCDetail(tc);
  } else if (activeTab === 'script') {
    loadScripts(tc.id);
  } else if (activeTab === 'result') {
    loadResultDetail(tc.id);
  }

  // 키워드 뷰 업데이트 (스크립트 탭의 키워드 뷰)
  if (activeTab === 'script') {
    updateKeywordView();
  }

  // 버튼 활성화
  if (editTCBtn) {
    editTCBtn.disabled = false; // 폴더와 TC 모두 편집 가능
  }
  if (createScriptBtn) {
    createScriptBtn.disabled = tc.type === 'folder';
  }
  if (recordBtn) {
    // 녹화 버튼은 테스트케이스일 때만 활성화
    recordBtn.disabled = tc.type === 'folder';
  }
}

function displayTCDetail(tc) {
  if (tc.type === 'folder') {
    tcDetailContent.innerHTML = `
      <div class="tc-detail-info">
        <h4>${tc.name}</h4>
        <p>폴더</p>
        ${tc.description ? `<p>${tc.description}</p>` : ''}
      </div>
    `;
  } else {
    // steps 파싱 (JSON 문자열인 경우)
    let steps = tc.steps;
    if (typeof steps === 'string') {
      try {
        steps = JSON.parse(steps);
      } catch (e) {
        console.warn('[Renderer] displayTCDetail: Steps 파싱 실패:', e);
        steps = null;
      }
    }
    
    // steps가 배열이 아닌 경우 빈 배열로 설정
    if (steps && !Array.isArray(steps)) {
      console.warn('[Renderer] displayTCDetail: Steps가 배열이 아님:', typeof steps, steps);
      steps = null;
    }
    
    // steps가 null이면 빈 배열로 초기화
    if (!steps) {
      steps = [];
    }
    
    console.log(`[Renderer] displayTCDetail: TC ${tc.id}, Steps ${steps.length}개 표시`, steps);
    
    // tags 파싱 (JSON 문자열인 경우)
    let tags = tc.tags;
    if (typeof tags === 'string') {
      try {
        tags = JSON.parse(tags);
      } catch (e) {
        tags = [];
      }
    }
    if (!Array.isArray(tags)) {
      tags = [];
    }
    
    tcDetailContent.innerHTML = `
      <div class="tc-detail-info">
        <!-- 기본 정보 섹션 -->
        <div class="tc-detail-section">
          <h4 class="tc-detail-title">${tc.name || '(제목 없음)'}</h4>
          <div class="tc-detail-meta">
            ${tc.tc_number ? `<span class="tc-meta-item"><strong>TC 번호:</strong> ${tc.tc_number}</span>` : ''}
            <span class="tc-meta-item"><strong>상태:</strong> ${getStatusLabel(tc.status)}</span>
            <span class="tc-meta-item"><strong>버전:</strong> ${tc.version || 1}</span>
            <span class="tc-meta-item"><strong>스크립트:</strong> ${tc.hasScript ? '✅ 있음' : '❌ 없음'}</span>
          </div>
        </div>
        
        <!-- 설명 섹션 -->
        ${tc.description ? `
          <div class="tc-detail-section">
            <h5 class="tc-detail-section-title">설명</h5>
            <p class="tc-detail-text">${tc.description}</p>
          </div>
        ` : ''}
        
        <!-- 사전조건 섹션 -->
        <div class="tc-detail-section">
          <h5 class="tc-detail-section-title">사전조건</h5>
          ${tc.preconditions ? `
            <p class="tc-detail-text">${tc.preconditions}</p>
          ` : '<p class="tc-detail-placeholder">사전조건이 없습니다</p>'}
        </div>
        
        <!-- 태그 섹션 -->
        ${tags.length > 0 ? `
          <div class="tc-detail-section">
            <h5 class="tc-detail-section-title">태그</h5>
            <div class="tc-tags">
              ${tags.map(tag => `<span class="tc-tag">${tag}</span>`).join('')}
            </div>
          </div>
        ` : ''}
        
        <!-- 메타데이터 섹션 -->
        ${tc.created_by ? `
          <div class="tc-detail-section">
            <h5 class="tc-detail-section-title">메타데이터</h5>
            <div class="tc-detail-meta-list">
              <div class="tc-meta-row"><strong>생성자:</strong> ${tc.created_by}</div>
            </div>
          </div>
        ` : ''}
        
        <!-- 테스트 단계 섹션 -->
        <div class="tc-detail-section">
          <h5 class="tc-detail-section-title">테스트 단계 ${steps && Array.isArray(steps) && steps.length > 0 ? `(${steps.length}개)` : ''}</h5>
          ${steps && Array.isArray(steps) && steps.length > 0 ? `
            <div class="tc-steps">
              ${steps.map((step, idx) => {
                const action = step.action || step.type || 'unknown';
                const target = step.target || '(대상 없음)';
                const value = step.value || null;
                const description = step.description || null;
                // 스크린샷 참조 확인 (새로운 참조 형식 또는 기존 플래그 형식 모두 지원)
  const hasScreenshot = step.screenshot && (
    (typeof step.screenshot === 'string' && step.screenshot.startsWith('screenshot://')) ||
    (typeof step.screenshot === 'string' && step.screenshot.startsWith('data:')) ||
    step.screenshot === true  // 기존 플래그 형식 호환성
  );
                // 이미지 표시 로직: verifyImage는 snapshot_image_id 사용, 일반 이벤트는 screenshot 사용
                const isVerifyImage = action === 'verifyImage';
                const hasVerifyImageSnapshot = isVerifyImage && step.snapshot_image_id;
                const hasElementScreenshot = !isVerifyImage && hasScreenshot;
                const shouldShowImage = hasElementScreenshot || isVerifyImage; // verifyImage는 항상 이미지 태그 표시 (나중에 snapshot_image_id 추가될 수 있음)
                
                // 디버깅: verifyImage 액션 정보 로깅
                if (action === 'verifyImage') {
                  console.log(`[renderTCDetail] verifyImage 액션 발견: stepIndex=${idx}, snapshot_image_id=${step.snapshot_image_id}, hasVerifyImageSnapshot=${hasVerifyImageSnapshot}, shouldShowImage=${shouldShowImage}`);
                }
                
                return `
                <div class="step-item" data-step-index="${idx}">
                  ${shouldShowImage ? `<img class="step-screenshot" data-tc-id="${tc.id}" data-step-index="${idx}" data-snapshot-image-id="${hasVerifyImageSnapshot ? step.snapshot_image_id : ''}" src="" alt="${isVerifyImage ? '스냅샷 이미지' : '스크린샷'}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; margin-right: 8px; cursor: pointer;" />` : ''}
                  <div class="step-content">
                    <strong>${idx + 1}. ${action}</strong>
                    <div>대상: ${target}</div>
                    ${value ? `<div>값: ${value}</div>` : ''}
                    ${description ? `<div>설명: ${description}</div>` : ''}
                  </div>
                </div>
              `;
              }).join('')}
            </div>
          ` : '<p class="tc-detail-placeholder">테스트 단계가 없습니다</p>'}
          
          <!-- 생성일/수정일 (스텝 아래) -->
          ${(tc.created_at || tc.updated_at) ? `
            <div class="tc-detail-meta-list" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e0e0e0;">
              ${tc.created_at ? `<div class="tc-meta-row"><strong>생성일:</strong> ${formatDate(tc.created_at)}</div>` : ''}
              ${tc.updated_at ? `<div class="tc-meta-row"><strong>수정일:</strong> ${formatDate(tc.updated_at)}</div>` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;
    
    // 파싱된 steps를 currentTC에도 반영 (loadStepScreenshot에서 사용하기 위해)
    if (currentTC && currentTC.id === tc.id) {
      currentTC.steps = steps;
    }
    
    // innerHTML 삽입 후 스크린샷 로드 및 이벤트 리스너 등록
    // (script 태그는 innerHTML로 삽입 시 실행되지 않으므로 별도로 처리)
    setTimeout(() => {
      const stepItems = document.querySelectorAll('.step-item[data-step-index]');
      stepItems.forEach(item => {
        const screenshotImg = item.querySelector('.step-screenshot');
        if (screenshotImg) {
          const tcId = screenshotImg.dataset.tcId;
          const stepIndex = parseInt(screenshotImg.dataset.stepIndex);
          
          // 스크린샷 로드
          if (typeof loadStepScreenshot === 'function') {
            loadStepScreenshot(tcId, stepIndex, screenshotImg);
          }
          
          // 클릭 시 확대 보기
          screenshotImg.addEventListener('click', () => {
            if (screenshotImg.src && screenshotImg.src !== '' && typeof showScreenshotModal === 'function') {
              showScreenshotModal(screenshotImg.src);
            }
          });
        }
      });
    }, 0);
  }
}

/**
 * 상태 레이블 반환
 */
function getStatusLabel(status) {
  const labels = {
    'draft': '초안',
    'active': '활성',
    'deprecated': '사용 안 함'
  };
  return labels[status] || status;
}

/**
 * 날짜 포맷팅 (사용자 친화적 형식)
 */
function formatDate(dateString) {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch (e) {
    return dateString;
  }
}

// ============================================================================
// CodeMirror 초기화
// ============================================================================

function setupCodeEditor() {
  if (!codeEditor) return;

  // CodeMirror 초기화
  codeMirrorEditor = CodeMirror.fromTextArea(codeEditor, {
    lineNumbers: true,
    mode: 'python',
    theme: 'monokai',
    indentUnit: 4,
    indentWithTabs: false,
    lineWrapping: true,
    autofocus: false,
    extraKeys: {
      'Ctrl-S': () => saveScript(),
      'Cmd-S': () => saveScript()
    }
  });

  // 변경사항 추적
  codeMirrorEditor.on('change', () => {
    isDirty = true;
    updateSaveButton();
  });

  // 언어 변경 시 모드 업데이트
  scriptLanguage.addEventListener('change', (e) => {
    const mode = getCodeMirrorMode(e.target.value);
    codeMirrorEditor.setOption('mode', mode);
  });
}

function getCodeMirrorMode(language) {
  const modes = {
    'python': 'python',
    'javascript': 'javascript',
    'typescript': 'text/typescript'
  };
  return modes[language] || 'python';
}

// ============================================================================
// 스크립트 뷰 전환
// ============================================================================

function setupScriptViews() {
  viewButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchScriptView(view);
    });
  });
}

function switchScriptView(view) {
  // 버튼 활성화
  viewButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  // 뷰 전환
  if (view === 'code') {
    scriptCodeView.classList.add('active');
    scriptKeywordView.classList.remove('active');
    if (codeMirrorEditor) {
      setTimeout(() => codeMirrorEditor.refresh(), 100);
    }
  } else {
    scriptCodeView.classList.remove('active');
    scriptKeywordView.classList.add('active');
    updateKeywordView();
  }
}

// ============================================================================
// 스크립트 탭
// ============================================================================

function showScriptPlaceholder() {
  if (codeMirrorEditor) {
    codeMirrorEditor.setValue('');
    codeMirrorEditor.setOption('readOnly', true);
  }
  keywordTableBody.innerHTML = '<tr><td colspan="6" class="placeholder">테스트케이스를 선택하세요</td></tr>';
  createScriptBtn.disabled = true;
  saveScriptBtn.disabled = true;
  isDirty = false;
  currentScript = null;
}

async function loadScripts(tcId) {
  try {
    if (!window.electronAPI?.api?.getScriptsByTestCase) {
      showScriptPlaceholder();
      return;
    }

    const response = await window.electronAPI.api.getScriptsByTestCase(tcId);
    if (response.success && response.data.length > 0) {
      // 첫 번째 스크립트 로드
      const script = response.data[0];
      currentScript = script;
      loadScriptToEditor(script);
      updateSaveButton();
    } else {
      // 스크립트가 없으면 새로 만들 준비
      currentScript = null;
      if (codeMirrorEditor) {
        codeMirrorEditor.setValue(getDefaultScript());
        codeMirrorEditor.setOption('readOnly', false);
      }
      createScriptBtn.disabled = false;
      saveScriptBtn.disabled = true;
      isDirty = false;
    }
  } catch (error) {
    console.error('스크립트 로드 실패:', error);
    addLog('error', `스크립트 로드 실패: ${error.message}`);
    showScriptPlaceholder();
  }
}

function loadScriptToEditor(script) {
  if (!codeMirrorEditor) return;

  currentScript = script;
  codeMirrorEditor.setValue(script.code || '');
  codeMirrorEditor.setOption('readOnly', false);
  
  // 언어 및 프레임워크 설정
  scriptLanguage.value = script.language || 'python';
  scriptFramework.value = script.framework || 'playwright';
  
  const mode = getCodeMirrorMode(script.language || 'python');
  codeMirrorEditor.setOption('mode', mode);
  
  // 키워드 뷰 업데이트
  updateKeywordView();
  
  isDirty = false;
  createScriptBtn.disabled = true;
  updateSaveButton();
  
  addLog('info', `스크립트 로드: ${script.name}`);
}

function getDefaultScript() {
  const language = scriptLanguage.value;
  const framework = scriptFramework.value;
  
  if (language === 'python' && framework === 'pytest') {
    return `import pytest
from playwright.sync_api import Page

@pytest.mark.playwright
def test_example(page_playwright: Page):
    """테스트 예제 - conftest.py의 fixture 사용"""
    page_playwright.goto("https://example.com")
    assert "Example" in page_playwright.title()
`;
  } else if (language === 'python' && framework === 'playwright') {
    return `import pytest
from playwright.sync_api import Page, expect

@pytest.mark.playwright
def test_example(page_playwright: Page):
    """테스트 예제 - conftest.py의 fixture 사용"""
    page_playwright.goto("https://example.com")
    expect(page_playwright).to_have_title("Example Domain")
`;
  } else if (language === 'python' && framework === 'selenium') {
    return `import pytest
from selenium.webdriver.remote.webdriver import WebDriver

@pytest.mark.selenium
def test_example(driver_selenium: WebDriver):
    """테스트 예제 - conftest.py의 fixture 사용"""
    driver_selenium.get("https://example.com")
    assert "Example" in driver_selenium.title
`;
  } else if (language === 'python' && framework === 'appium') {
    return `from appium import webdriver
from appium.options.android import UiAutomator2Options

def test_example():
    """테스트 예제"""
    options = UiAutomator2Options()
    options.platform_name = "Android"
    options.device_name = "emulator-5554"
    
    driver = webdriver.Remote("http://localhost:4723", options=options)
    # 테스트 코드 작성
    driver.quit()
`;
  } else if (language === 'javascript' && framework === 'playwright') {
    return `const { test, expect } = require('@playwright/test');

test('example test', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example/);
});
`;
  } else if (language === 'typescript' && framework === 'playwright') {
    return `import { test, expect } from '@playwright/test';

test('example test', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example/);
});
`;
  }
  
  return `// ${framework} 테스트 예제\n`;
}

// ============================================================================
// 스크립트 저장
// ============================================================================

async function saveScript() {
  if (!currentTC || currentTC.type === 'folder') {
    alert('테스트케이스를 선택하세요');
    return;
  }

  if (!codeMirrorEditor) {
    alert('에디터가 초기화되지 않았습니다');
    return;
  }

  const code = codeMirrorEditor.getValue();
  if (!code.trim()) {
    alert('스크립트 코드를 입력하세요');
    return;
  }

  try {
    // 키워드 뷰에서 변경된 steps가 있으면 먼저 TC에 저장
    if (scriptKeywordView && scriptKeywordView.classList.contains('active')) {
      // 키워드 테이블에서 최신 steps 가져오기
      updateKeywordTable();
      
      // currentTC.steps가 변경되었으면 TC 업데이트
      if (currentTC.steps) {
        const updateData = {
          steps: JSON.stringify(currentTC.steps)
        };
        
        try {
          const tcUpdateResponse = await window.electronAPI.api.updateTestCase(currentTC.id, updateData);
          if (tcUpdateResponse && tcUpdateResponse.success) {
            addLog('info', '테스트 단계가 TC에 저장되었습니다');
            // 업데이트된 TC 정보로 currentTC 갱신
            if (tcUpdateResponse.data) {
              // steps 파싱
              if (typeof tcUpdateResponse.data.steps === 'string') {
                try {
                  tcUpdateResponse.data.steps = JSON.parse(tcUpdateResponse.data.steps);
                } catch (e) {
                  tcUpdateResponse.data.steps = null;
                }
              }
              currentTC = tcUpdateResponse.data;
            }
          }
        } catch (tcError) {
          console.warn('TC steps 저장 실패:', tcError);
          // TC 저장 실패해도 스크립트 저장은 계속 진행
        }
      }
    }
    
    // pytest 형식으로 framework 설정 (python인 경우)
    let framework = scriptFramework.value;
    if (scriptLanguage.value === 'python' && framework !== 'pytest') {
      // playwright, selenium 등은 pytest로 통일
      framework = 'pytest';
    }
    
    const scriptData = {
      test_case_id: currentTC.id,
      name: currentScript?.name || `TC_${currentTC.id}_${currentTC.name || 'test'}`,
      code: code,
      language: scriptLanguage.value,
      framework: framework,
      status: 'active'
    };

    let response;
    if (currentScript) {
      // 업데이트
      response = await window.electronAPI.api.updateScript(currentScript.id, scriptData);
      addLog('info', `스크립트 업데이트: ${scriptData.name}`);
    } else {
      // 생성
      response = await window.electronAPI.api.createScript(scriptData);
      addLog('info', `스크립트 생성: ${scriptData.name}`);
    }

    if (response.success) {
      currentScript = response.data;
      isDirty = false;
      updateSaveButton();
      addLog('success', '스크립트 저장 완료');
      
      // TC 트리 새로고침
      if (currentProject) {
        await loadTCTree(currentProject.id);
      }
    } else {
      throw new Error(response.error || '저장 실패');
    }
  } catch (error) {
    console.error('스크립트 저장 실패:', error);
    addLog('error', `스크립트 저장 실패: ${error.message}`);
    alert(`스크립트 저장 실패: ${error.message}`);
  }
}

function updateSaveButton() {
  if (saveScriptBtn) {
    saveScriptBtn.disabled = !isDirty || !currentTC || currentTC.type === 'folder';
    if (isDirty) {
      saveScriptBtn.textContent = '저장 *';
    } else {
      saveScriptBtn.textContent = '저장';
    }
  }
}

// ============================================================================
// 키워드 뷰
// ============================================================================

function updateKeywordView() {
  if (!currentTC || !currentTC.steps) {
    keywordTableBody.innerHTML = '<tr><td colspan="6" class="placeholder">키워드가 없습니다</td></tr>';
    return;
  }

  keywordTableBody.innerHTML = '';
  currentTC.steps.forEach((step, index) => {
    const row = createKeywordRow(index + 1, step);
    keywordTableBody.appendChild(row);
  });
}

function createKeywordRow(index, step) {
  const tr = document.createElement('tr');
  
  // Action 드롭다운 생성
  let actionSelect;
  try {
    actionSelect = document.createElement('select');
    actionSelect.className = 'keyword-action';
    actionSelect.innerHTML = '<option value="">선택...</option>';
    
    // 키워드 목록 추가
    if (typeof KEYWORDS !== 'undefined') {
      Object.values(KEYWORDS).forEach(keyword => {
        const option = document.createElement('option');
        option.value = keyword.name;
        option.textContent = `${keyword.name} - ${keyword.description}`;
        if (step.action === keyword.name) {
          option.selected = true;
        }
        actionSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('키워드 목록 로드 실패:', error);
    // 폴백: 일반 input
    actionSelect = document.createElement('input');
    actionSelect.type = 'text';
    actionSelect.className = 'keyword-action';
    actionSelect.value = step.action || '';
  }
  
  // 스크린샷 참조 확인 (새로운 참조 형식 또는 기존 플래그 형식 모두 지원)
  const hasScreenshot = step.screenshot && (
    (typeof step.screenshot === 'string' && step.screenshot.startsWith('screenshot://')) ||
    (typeof step.screenshot === 'string' && step.screenshot.startsWith('data:')) ||
    step.screenshot === true  // 기존 플래그 형식 호환성
  );
  const tcId = currentTC ? currentTC.id : null;
  
  tr.innerHTML = `
    <td>${index}</td>
    <td class="screenshot-cell">
      ${hasScreenshot && tcId ? `<img class="step-screenshot" data-tc-id="${tcId}" data-step-index="${index - 1}" src="" alt="스크린샷" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; cursor: pointer;" />` : ''}
    </td>
    <td></td>
    <td><input type="text" value="${step.target || ''}" class="keyword-target" placeholder="선택자 또는 객체 이름"></td>
    <td><input type="text" value="${step.value || ''}" class="keyword-value" placeholder="값"></td>
    <td><textarea class="keyword-description" placeholder="설명">${step.description || ''}</textarea></td>
    <td>
      <button class="btn-icon delete-keyword" title="삭제">🗑️</button>
    </td>
  `;
  
  // Action 셀에 드롭다운 추가
  const actionCell = tr.querySelector('td:nth-child(3)');
  actionCell.appendChild(actionSelect);
  
  // 스크린샷 로드 (있는 경우)
  if (hasScreenshot && tcId) {
    const screenshotImg = tr.querySelector('.step-screenshot');
    if (screenshotImg) {
      loadStepScreenshot(tcId, index - 1, screenshotImg);
      
      // 클릭 시 확대 보기
      screenshotImg.addEventListener('click', () => {
        if (screenshotImg.src && screenshotImg.src !== '') {
          showScreenshotModal(screenshotImg.src);
        }
      });
    }
  }

  // 삭제 버튼
  tr.querySelector('.delete-keyword').addEventListener('click', () => {
    tr.remove();
    updateKeywordTable();
  });

  // 입력 변경 감지
  tr.querySelectorAll('input, textarea, select').forEach(input => {
    input.addEventListener('change', () => {
      updateKeywordTable();
    });
  });
  
  // Target 자동완성 (객체 레퍼지토리)
  const targetInput = tr.querySelector('.keyword-target');
  if (targetInput && currentProject) {
    setupTargetAutocomplete(targetInput, currentProject.id);
  }

  return tr;
}

/**
 * 스텝 스크린샷 로드
 * @param {number} tcId - 테스트케이스 ID
 * @param {number} stepIndex - 스텝 인덱스
 * @param {HTMLImageElement} imgElement - 이미지 요소
 */
async function loadStepScreenshot(tcId, stepIndex, imgElement) {
  try {
    console.log(`[loadStepScreenshot] 시작: tcId=${tcId}, stepIndex=${stepIndex}`);
    
    // data-snapshot-image-id 속성을 먼저 확인 (verifyImage의 경우)
    // HTML에 직접 포함된 속성이므로 currentTC.steps 로드와 무관하게 동작
    const snapshotImageId = imgElement.dataset.snapshotImageId;
    console.log(`[loadStepScreenshot] snapshotImageId from dataset: "${snapshotImageId}"`);
    
    if (snapshotImageId && snapshotImageId !== '' && !isNaN(snapshotImageId) && window.electronAPI && window.electronAPI.getSnapshotImage) {
      const parsedId = parseInt(snapshotImageId, 10);
      if (!isNaN(parsedId) && parsedId > 0) {
        console.log(`[loadStepScreenshot] getSnapshotImage 호출: id=${parsedId}`);
        const imageData = await window.electronAPI.getSnapshotImage(parsedId);
        console.log(`[loadStepScreenshot] getSnapshotImage 결과:`, imageData ? `데이터 있음 (길이: ${imageData ? imageData.length : 0})` : 'null');
        if (imageData) {
          imgElement.src = imageData;
          imgElement.style.display = 'block';
          console.log(`[loadStepScreenshot] ✅ 이미지 설정 완료 (snapshot_image_id 사용)`);
          return;
        }
      } else {
        console.log(`[loadStepScreenshot] ⚠️ snapshotImageId 파싱 실패: "${snapshotImageId}" -> ${parsedId}`);
      }
    }
    
    // step 객체에서 이미지 참조 확인
    // 주의: verifyImage는 snapshot_image_id 사용, 일반 이벤트는 screenshot 사용
    if (currentTC && currentTC.steps && currentTC.steps[stepIndex]) {
      const step = currentTC.steps[stepIndex];
      console.log(`[loadStepScreenshot] step 확인: action=${step.action}, snapshot_image_id=${step.snapshot_image_id}, screenshot=${step.screenshot ? '있음' : '없음'}`);
      
      // verifyImage 액션의 경우 snapshot_image_id로 스냅샷 이미지 로드 (요소 이미지와 구분)
      if (step.action === 'verifyImage') {
        if (step.snapshot_image_id) {
          const stepSnapshotImageId = step.snapshot_image_id;
          console.log(`[loadStepScreenshot] verifyImage 액션 발견, getSnapshotImage 호출: id=${stepSnapshotImageId}`);
          if (window.electronAPI && window.electronAPI.getSnapshotImage) {
            const imageData = await window.electronAPI.getSnapshotImage(stepSnapshotImageId);
            console.log(`[loadStepScreenshot] getSnapshotImage 결과:`, imageData ? `데이터 있음 (길이: ${imageData.length})` : 'null');
            if (imageData) {
              imgElement.src = imageData;
              imgElement.style.display = 'block';
              console.log(`[loadStepScreenshot] ✅ 스냅샷 이미지 설정 완료 (snapshot_image_id 사용)`);
              return;
            }
          }
        } else {
          console.log(`[loadStepScreenshot] ⚠️ verifyImage 액션이지만 snapshot_image_id가 없습니다. stepIndex=${stepIndex}`);
        }
        // verifyImage는 screenshot 필드를 사용하지 않음 (명확한 구분)
        return;
      }
      
      // 일반 이벤트의 경우 screenshot 필드로 요소 스크린샷 로드
      if (step.screenshot) {
        // 참조 형식: "screenshot://tc_2_step_0"
        if (typeof step.screenshot === 'string' && step.screenshot.startsWith('screenshot://')) {
          // 참조에서 tcId와 stepIndex 추출
          const match = step.screenshot.match(/screenshot:\/\/tc_(\d+)_step_(\d+)/);
          if (match) {
            const refTcId = parseInt(match[1], 10);
            const refStepIndex = parseInt(match[2], 10);
            
            // 로컬 DB에서 실제 스크린샷 데이터 조회
            if (window.electronAPI && window.electronAPI.getStepScreenshot) {
              const screenshot = await window.electronAPI.getStepScreenshot(refTcId, refStepIndex);
              if (screenshot) {
                imgElement.src = screenshot;
                imgElement.style.display = 'block';
                return;
              }
            }
          }
        } else if (typeof step.screenshot === 'string' && step.screenshot.startsWith('data:')) {
          // 기존 base64 데이터 직접 포함 형식 (호환성)
          imgElement.src = step.screenshot;
          imgElement.style.display = 'block';
          return;
        }
      }
    }
    
    // 폴백: step_index로 직접 조회 (기존 방식 호환성)
    if (window.electronAPI && window.electronAPI.getStepScreenshot) {
      const screenshot = await window.electronAPI.getStepScreenshot(tcId, stepIndex);
      if (screenshot) {
        imgElement.src = screenshot;
        imgElement.style.display = 'block';
        return;
      }
    }
    
    console.log(`[loadStepScreenshot] ❌ 모든 방법 실패, 이미지 숨김`);
    imgElement.style.display = 'none';
  } catch (error) {
    console.error('[loadStepScreenshot] ❌ 스크린샷 로드 실패:', error);
    if (imgElement) {
      imgElement.style.display = 'none';
    }
  }
}

/**
 * 스크린샷 확대 보기 모달
 * @param {string} screenshotSrc - 스크린샷 이미지 src
 */
function showScreenshotModal(screenshotSrc) {
  // 기존 모달이 있으면 제거
  const existingModal = document.getElementById('screenshot-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // 모달 생성
  const modal = document.createElement('div');
  modal.id = 'screenshot-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    cursor: pointer;
  `;
  
  const img = document.createElement('img');
  img.src = screenshotSrc;
  img.style.cssText = `
    max-width: 90%;
    max-height: 90%;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  `;
  
  modal.appendChild(img);
  document.body.appendChild(modal);
  
  // 클릭 시 모달 닫기
  modal.addEventListener('click', () => {
    modal.remove();
  });
  
  // ESC 키로 닫기
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

/**
 * Target 입력 필드 자동완성 설정
 */
async function setupTargetAutocomplete(input, projectId) {
  let suggestions = [];
  let currentFocus = -1;
  
  // 자동완성 목록 생성
  const autocompleteList = document.createElement('div');
  autocompleteList.className = 'autocomplete-items';
  input.parentElement.appendChild(autocompleteList);
  
  input.addEventListener('input', async () => {
    const query = input.value;
    if (query.length < 1) {
      autocompleteList.innerHTML = '';
      return;
    }
    
    try {
      // 객체 레퍼지토리에서 검색
      suggestions = await ObjectRepository.getObjectSuggestions(projectId, query);
      
      // 키워드 제안도 추가 (선택사항)
      // const keywordSuggestions = getKeywordSuggestions(query);
      
      autocompleteList.innerHTML = '';
      suggestions.slice(0, 5).forEach(obj => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML = `<strong>${obj.name}</strong> ${obj.description || ''}`;
        item.addEventListener('click', () => {
          input.value = obj.name;
          autocompleteList.innerHTML = '';
          updateKeywordTable();
        });
        autocompleteList.appendChild(item);
      });
    } catch (error) {
      console.error('자동완성 실패:', error);
    }
  });
  
  // 외부 클릭 시 목록 숨김
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !autocompleteList.contains(e.target)) {
      autocompleteList.innerHTML = '';
    }
  });
}

function updateKeywordTable() {
  const steps = [];
  keywordTableBody.querySelectorAll('tr').forEach((row, index) => {
    const action = row.querySelector('.keyword-action')?.value || '';
    const target = row.querySelector('.keyword-target')?.value || '';
    const value = row.querySelector('.keyword-value')?.value || '';
    const description = row.querySelector('.keyword-description')?.value || '';
    
    if (action) {
      steps.push({ action, target, value, description });
    }
  });

  // TC 업데이트 (로컬)
  if (currentTC) {
    // steps가 변경되었는지 확인
    const stepsChanged = JSON.stringify(currentTC.steps) !== JSON.stringify(steps);
    currentTC.steps = steps;
    
    // 변경사항이 있으면 isDirty 플래그 설정
    if (stepsChanged) {
      isDirty = true;
      updateSaveButton();
    }
  }

  // 코드 뷰로 전환 시 코드 생성 (비동기)
  if (codeMirrorEditor && steps.length > 0) {
    generateCodeFromKeywords(steps).then(code => {
      if (code) {
        codeMirrorEditor.setValue(code);
        isDirty = true;
        updateSaveButton();
      }
    }).catch(error => {
      console.error('코드 생성 실패:', error);
    });
  }
}

async function generateCodeFromKeywords(steps) {
  // 파라미터 검증
  if (!steps || !Array.isArray(steps)) {
    console.error('generateCodeFromKeywords: steps가 배열이 아닙니다.', steps);
    return '// 스텝이 없습니다.';
  }

  // 키워드 라이브러리 사용
  try {
    // null 체크 추가
    if (!scriptLanguage || !scriptFramework) {
      throw new Error('scriptLanguage 또는 scriptFramework가 초기화되지 않았습니다.');
    }

    const language = scriptLanguage.value || 'python';
    const framework = scriptFramework.value === 'pytest' ? 'pytest' : (scriptFramework.value || 'pytest');
    
    // URL 기반 Page Object 찾기 함수
    const findPageObjectByUrl = async (url, projectId) => {
      if (window.electronAPI?.api?.findPageObjectByUrl) {
        return await window.electronAPI.api.findPageObjectByUrl(url, projectId);
      }
      return { success: false, data: null };
    };
    
    return await generateCodeFromSteps(steps, {
      language,
      framework,
      testName: `test_${currentTC?.id || 'example'}`,
      testDescription: currentTC?.name || 'Test',
      findPageObjectByUrl,
      projectId: currentProject?.id
    });
  } catch (error) {
    console.error('키워드 라이브러리 사용 실패, 기본 코드 생성:', error);
    
    // 폴백: 기본 코드 생성
    const language = (scriptLanguage?.value || 'python');
    const framework = (scriptFramework?.value || 'pytest');
  
    if (language === 'python' && framework === 'playwright') {
      return `from playwright.sync_api import Page, expect
import pytest

def test_${currentTC?.id || 'example'}(page: Page):
    """${currentTC?.name || 'Test'}"""
${steps.map(step => {
        if (step.action === 'click') {
          return `    page.click("${step.target || ''}")  # ${step.description || ''}`;
        } else if (step.action === 'type' || step.action === 'setText') {
          return `    page.fill("${step.target || ''}", "${step.value || ''}")  # ${step.description || ''}`;
        } else if (step.action === 'goto' || step.action === 'open') {
          return `    page.goto("${step.target || step.value || ''}")  # ${step.description || ''}`;
        } else {
          return `    # ${step.action}: ${step.target || ''} ${step.value || ''}  # ${step.description || ''}`;
        }
      }).join('\n')}
`;
    } else if (language === 'python' && framework === 'selenium') {
      return `from selenium import webdriver
from selenium.webdriver.common.by import By
import pytest

def test_${currentTC?.id || 'example'}():
    """${currentTC?.name || 'Test'}"""
    driver = webdriver.Chrome()
    try:
${steps.map(step => {
        if (step.action === 'click') {
          return `        driver.find_element(By.${step.target?.includes('id=') ? 'ID' : 'CSS_SELECTOR'}, "${step.target || ''}").click()  # ${step.description || ''}`;
        } else if (step.action === 'type' || step.action === 'setText') {
          return `        driver.find_element(By.${step.target?.includes('id=') ? 'ID' : 'CSS_SELECTOR'}, "${step.target || ''}").send_keys("${step.value || ''}")  # ${step.description || ''}`;
        } else if (step.action === 'goto' || step.action === 'open') {
          return `        driver.get("${step.target || step.value || ''}")  # ${step.description || ''}`;
        } else {
          return `        # ${step.action}: ${step.target || ''} ${step.value || ''}  # ${step.description || ''}`;
        }
      }).join('\n')}
    finally:
        driver.quit()
`;
    }
  
    // 기본 폴백: 단순 문자열 반환
    return steps.map(step => `${step.action || 'unknown'}(${step.target || ''}, ${step.value || ''})`).join('\n');
  }
}

// ============================================================================
// 결과 상세 탭
// ============================================================================

async function loadResultDetail(tcId) {
  try {
    // 테스트 결과 조회 (향후 구현)
    resultDetailContent.innerHTML = `
      <div class="placeholder">
        <p>테스트 결과 상세 정보</p>
        <p>TC ID: ${tcId}</p>
      </div>
    `;
  } catch (error) {
    console.error('결과 로드 실패:', error);
    resultDetailContent.innerHTML = '<div class="placeholder">결과를 불러올 수 없습니다</div>';
  }
}

// ============================================================================
// 리코더 탭
// ============================================================================

async function startRecording() {
  if (!currentTC || currentTC.type === 'folder') {
    alert('테스트케이스를 선택하거나 새 TC를 생성하세요');
    return;
  }

  try {
    const browser = recorderBrowser.value;
    const result = await window.electronAPI.startRecording({ browser });
    
    if (result.success) {
      isRecording = true;
      recordedEvents = [];
      startRecordingBtn.disabled = true;
      stopRecordingBtn.disabled = false;
      
      recorderViewport.innerHTML = `
        <div class="recorder-placeholder">
          <p>녹화 중...</p>
          <p>브라우저에서 테스트를 수행하세요</p>
        </div>
      `;
      
      eventsList.innerHTML = '<div class="placeholder">이벤트가 여기에 표시됩니다</div>';
    }
  } catch (error) {
    console.error('녹화 시작 실패:', error);
    alert('녹화 시작 실패: ' + error.message);
  }
}

// 기존 stopRecording 함수는 제거됨 (크롬 확장 프로그램용 새 함수로 대체)

function displayRecordedEvents(events) {
  if (events.length === 0) {
    eventsList.innerHTML = '<div class="placeholder">이벤트가 없습니다</div>';
    return;
  }

  eventsList.innerHTML = events.map((event, idx) => `
    <div class="event-item">
      <strong>${idx + 1}. ${event.type || event.action}</strong>
      ${event.target ? `<div>대상: ${event.target}</div>` : ''}
      ${event.value ? `<div>값: ${event.value}</div>` : ''}
    </div>
  `).join('');
}

/**
 * 녹화 중지 처리
 */
async function stopRecording() {
  try {
    if (!isRecording) {
      return;
    }

    // 크롬 확장 프로그램에 중지 신호 전송
    const result = await window.electronAPI.stopRecording({
      sessionId: currentRecordingSessionId
    });

    if (result.success) {
      isRecording = false;
      currentRecordingSessionId = null;
      addLog('info', '녹화 중지 신호를 전송했습니다.');
      
      // 녹화 버튼 상태 복원
      if (recordBtn) {
        recordBtn.disabled = false;
        recordBtn.innerHTML = '<span class="btn-icon">🔴</span> 녹화';
      }
    } else {
      showMessageDialog('오류', `녹화 중지 실패: ${result.error}`);
    }
  } catch (error) {
    console.error('녹화 중지 오류:', error);
    showMessageDialog('오류', `녹화 중지 실패: ${error.message}`);
  }
}

/**
 * 녹화 중지 신호 수신 처리
 */
function handleRecordingStop(data) {
  console.log('🛑 녹화 중지 신호 수신:', data);
  isRecording = false;
  currentRecordingSessionId = null;
  
  // 녹화 버튼 상태 복원
  if (recordBtn) {
    recordBtn.disabled = false;
    recordBtn.innerHTML = '<span class="btn-icon">🔴</span> 녹화';
  }
  
  addLog('info', '녹화가 중지되었습니다.');
}

/**
 * 크롬 확장 프로그램에서 받은 녹화 데이터 처리
 */
async function handleRecordingData(recordingData) {
  try {
    console.log('📥 녹화 데이터 수신:', recordingData);

    if (recordingData.type !== 'recording_complete') {
      console.warn('⚠️ 알 수 없는 녹화 데이터 타입:', recordingData.type);
      return;
    }

    const { tcId, events, code } = recordingData;

    // 현재 선택된 TC와 일치하는지 확인
    if (currentTC && currentTC.id === tcId) {
      // 녹화 상태 초기화
      isRecording = false;
      currentRecordingSessionId = null;
      
      // 녹화 버튼 상태 복원
      if (recordBtn) {
        recordBtn.disabled = false;
        recordBtn.innerHTML = '<span class="btn-icon">🔴</span> 녹화';
      }

      // 서버에서 이미 processRecordingData로 스텝 변환 및 저장이 완료되었으므로
      // 여기서는 UI만 갱신하면 됩니다
      if (events && events.length > 0) {
        addLog('success', `${events.length}개의 이벤트가 서버에서 처리되었습니다.`);
        
        // TC 트리 새로고침
        if (currentProject) {
          await loadTCTree(currentProject.id);
        }
        
        // 현재 TC 다시 로드 (서버에서 변환된 스텝 포함)
        if (currentTC) {
          const updatedTC = await window.electronAPI.api.getTestCase(currentTC.id);
          if (updatedTC.success) {
            console.log('✅ 업데이트된 TC 로드:', updatedTC.data);
            // steps가 제대로 있는지 확인
            if (updatedTC.data.steps) {
              try {
                const steps = typeof updatedTC.data.steps === 'string' 
                  ? JSON.parse(updatedTC.data.steps) 
                  : updatedTC.data.steps;
                console.log(`✅ TC에 ${steps.length}개의 스텝이 저장되었습니다.`);
                if (steps.length === 0) {
                  console.warn('⚠️ 스텝이 비어있습니다. 서버에서 변환이 제대로 되지 않았을 수 있습니다.');
                }
              } catch (e) {
                console.error('❌ 스텝 파싱 오류:', e);
              }
            } else {
              console.warn('⚠️ TC에 steps 필드가 없습니다.');
            }
            selectTC(updatedTC.data);
          } else {
            console.error('❌ TC 로드 실패:', updatedTC.error);
          }
        }
      } else {
        console.warn('⚠️ 이벤트가 없습니다.');
      }

      // 코드가 있으면 스크립트 생성/업데이트
      if (code) {
        for (const [language, codeData] of Object.entries(code)) {
          if (!codeData || !codeData.code) continue;

          const framework = codeData.framework || 'playwright';
          const scriptCode = codeData.code;
          const scriptName = `Generated ${language} script`;

          // 기존 스크립트 확인
          const existingScripts = await window.electronAPI.api.getScripts({
            test_case_id: tcId
          });

          const existingScript = existingScripts.data?.find(
            s => s.language === language && s.framework === framework && s.status === 'active'
          );

          if (existingScript) {
            // 기존 스크립트 업데이트
            const updateResponse = await window.electronAPI.api.updateScript(existingScript.id, {
              code: scriptCode
            });
            if (updateResponse.success) {
              addLog('success', `${language} 스크립트가 업데이트되었습니다.`);
            }
          } else {
            // 새 스크립트 생성
            const createResponse = await window.electronAPI.api.createScript({
              test_case_id: tcId,
              name: scriptName,
              framework: framework,
              language: language,
              code: scriptCode,
              status: 'active'
            });
            if (createResponse.success) {
              addLog('success', `${language} 스크립트가 생성되었습니다.`);
            }
          }
        }

        // 스크립트 탭 새로고침
        if (currentTC) {
          await loadScripts(currentTC.id);
        }
      }

      // 성공 메시지 표시
      showMessageDialog('성공', '녹화 데이터가 성공적으로 저장되었습니다.');
    } else {
      console.warn('⚠️ 수신한 녹화 데이터의 TC ID가 현재 선택된 TC와 일치하지 않습니다.');
    }
  } catch (error) {
    console.error('❌ 녹화 데이터 처리 오류:', error);
    showMessageDialog('오류', `녹화 데이터 처리 실패: ${error.message}`);
    
    // 녹화 버튼 상태 복원
    if (recordBtn) {
      recordBtn.disabled = false;
      recordBtn.innerHTML = '<span class="btn-icon">🔴</span> 녹화';
    }
  }
}

async function saveEventsToTC(events) {
  if (!currentTC) {
    alert('TC를 선택하세요');
    return;
  }

  try {
    // 이벤트를 TC 스텝으로 변환
    const steps = events.map(event => ({
      action: event.type || event.action,
      target: event.target,
      value: event.value
    }));

    // TC 업데이트
    const updateData = {
      ...currentTC,
      steps: steps
    };

    const response = await window.electronAPI.api.updateTestCase(currentTC.id, updateData);
    if (response.success) {
      alert('TC에 저장되었습니다');
      // TC 트리 새로고침
      if (currentProject) {
        await loadTCTree(currentProject.id);
      }
    }
  } catch (error) {
    console.error('TC 저장 실패:', error);
    alert('TC 저장 실패: ' + error.message);
  }
}

// ============================================================================
// 선택된 TC 관리
// ============================================================================

/**
 * 항목과 모든 하위 항목을 선택/선택 해제
 */
function selectItemAndChildren(item, select) {
  // 자신 선택/선택 해제
  if (select) {
    selectedTCs.add(item.id);
  } else {
    selectedTCs.delete(item.id);
  }
  
  // 체크박스 상태 업데이트
  const checkbox = document.querySelector(`.tc-tree-item[data-tc-id="${item.id}"] input[type="checkbox"]`);
  if (checkbox) {
    checkbox.checked = select;
  }
  
  // 하위 항목이 있으면 재귀적으로 선택/선택 해제
  if (item.children && item.children.length > 0) {
    item.children.forEach(child => {
      selectItemAndChildren(child, select);
    });
  }
}

/**
 * 체크박스 상태 복원 (트리 새로고침 후)
 */
function restoreCheckboxStates() {
  if (!tcTreeData) return;
  
  // 모든 체크박스 상태 업데이트
  document.querySelectorAll('.tc-tree-item input[type="checkbox"]').forEach(checkbox => {
    const treeItem = checkbox.closest('.tc-tree-item');
    const itemId = parseInt(treeItem.dataset.tcId);
    checkbox.checked = selectedTCs.has(itemId);
  });
}

// ============================================================================
// 실행 기능
// ============================================================================

async function runSelectedTCs() {
  if (selectedTCs.size === 0) {
    alert('실행할 테스트케이스를 선택하세요.');
    return;
  }

  // 환경 선택 값 읽기
  const browserSelect = document.getElementById('test-browser-select');
  const driverSelect = document.getElementById('test-driver-select');
  const selectedBrowser = browserSelect ? browserSelect.value : 'chromium';
  const selectedDriver = driverSelect ? driverSelect.value : 'playwright';
  const isMobile = selectedBrowser === 'mobile-chrome';

  runSelectedBtn.disabled = true;
  runSelectedBtn.innerHTML = '<span class="btn-icon">⏳</span> 실행 중...';

  resultsList.innerHTML = '<div class="placeholder">테스트 실행 중...</div>';

  try {
    const tcIds = Array.from(selectedTCs);
    const testFiles = [];
    const tcFileMap = new Map(); // TC ID와 파일명 매핑
    
    // 모든 TC의 스크립트 수집 (DB에서 코드 가져오기)
    const scriptsToRun = [];
    console.log('[DEBUG] ========== 테스트 실행 스크립트 수집 시작 ==========');
    console.log('[DEBUG] 선택된 TC IDs:', Array.from(selectedTCs));
    
    for (const tcId of tcIds) {
      try {
        console.log(`[DEBUG] TC ID ${tcId} 스크립트 조회 중...`);
        const scriptsResponse = await window.electronAPI.api.getScriptsByTestCase(tcId);
        
        if (scriptsResponse.success && scriptsResponse.data.length > 0) {
          const script = scriptsResponse.data.find(s => s.status === 'active') || scriptsResponse.data[0];
          
          // TC ID 검증: 전달한 tcId와 DB의 test_case_id가 일치해야 함
          if (script.test_case_id && script.test_case_id !== tcId) {
            console.error(`[ERROR] TC ID 불일치! 조회한 tcId: ${tcId}, 스크립트의 test_case_id: ${script.test_case_id}`);
            console.error(`[ERROR] 스크립트 정보: id=${script.id}, name=${script.name}`);
            console.error(`[ERROR] 이 스크립트는 건너뜁니다.`);
            continue; // 이 스크립트는 건너뛰기
          }
          
          console.log(`[DEBUG] TC ID ${tcId}: 스크립트 발견 - id=${script.id}, name=${script.name}, test_case_id=${script.test_case_id || 'N/A'}`);
          
          // Python + pytest/playwright/selenium만 실행
          if (script.language === 'python' && 
              (script.framework === 'pytest' || script.framework === 'playwright' || script.framework === 'selenium')) {
            // 파일명 생성 (main.js와 동일한 로직)
            const extension = script.language === 'python' ? 'py' : 
                             script.language === 'typescript' ? 'ts' : 'js';
            const sanitizedName = script.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
            const filename = `test_tc${tcId}_${sanitizedName}.${extension}`;
            
            console.log(`[DEBUG] TC ID ${tcId}: 스크립트 추가 - filename=${filename}, tcId=${tcId}, script.test_case_id=${script.test_case_id || 'N/A'}`);
            
            // tcFileMap에 파일명과 TC 정보 매핑
            tcFileMap.set(filename, {
              tcId,
              scriptId: script.id,
              name: script.name
            });
            
            scriptsToRun.push({
              tcId,
              scriptId: script.id,
              name: script.name,
              code: script.code,
              framework: script.framework,
              language: script.language
            });
          } else {
            console.log(`[DEBUG] TC ID ${tcId}: 스크립트 건너뜀 - language=${script.language}, framework=${script.framework}`);
          }
        } else {
          console.log(`[DEBUG] TC ID ${tcId}: 스크립트 없음 또는 조회 실패`);
        }
      } catch (error) {
        console.error(`[ERROR] TC #${tcId} 스크립트 조회 실패:`, error);
      }
    }
    
    console.log(`[DEBUG] 수집된 스크립트 개수: ${scriptsToRun.length}`);
    console.log('[DEBUG] 스크립트 목록:', scriptsToRun.map(s => ({ tcId: s.tcId, name: s.name })));
    console.log('[DEBUG] ===================================================');

    if (scriptsToRun.length === 0) {
      alert('실행할 pytest 테스트 스크립트가 없습니다. 테스트 케이스에 Python + pytest/playwright/selenium 스크립트가 필요합니다.');
      return;
    }

    // 여러 파일을 한번에 pytest로 실행 (병렬 실행 활성화)
    const options = {
      parallel: scriptsToRun.length > 1,  // 파일이 2개 이상이면 병렬 실행
      workers: 'auto',                 // 자동 워커 수
      htmlReport: true,                // HTML 리포트 생성
      captureScreenshots: true,        // 스크린샷 캡처
      browser: isMobile ? 'chromium' : selectedBrowser,  // 모바일은 내부적으로 chromium 사용
      driver: selectedDriver,         // 선택된 드라이버 (playwright 또는 selenium)
      mobile: isMobile                 // 모바일 모드 플래그
    };

    // 스크립트 코드를 전달하여 임시 파일 생성 후 실행
    const result = await window.electronAPI.runPythonScripts(scriptsToRun, [], options);
    
    // 디버깅: 실행 결과 로깅
    console.log('=== 테스트 실행 결과 디버깅 ===');
    console.log('result.success:', result.success);
    console.log('result.data:', result.data);
    console.log('scriptsToRun:', scriptsToRun.map(s => ({ tcId: s.tcId, name: s.name })));
    console.log('tcFileMap:', Array.from(tcFileMap.entries()));
    
    // 결과 파싱 및 매핑
    const results = [];
    const executedTcIds = new Set(); // 실행된 TC ID 추적
    
    if (result.success && result.data && result.data.tests) {
      console.log('pytest 테스트 결과 개수:', result.data.tests.length);
      console.log('pytest 테스트 목록:', result.data.tests.map(t => t.nodeid));
      // pytest JSON 리포트에서 각 테스트 결과 추출
      for (const test of result.data.tests) {
        const testName = test.nodeid; // 예: "test_tc1_login.py::test_login" 또는 "test_tc1_login::test_login"
        let fileName = testName.split('::')[0]; // 파일명 추출
        
        // 경로 제거 (basename만 추출)
        // 예: "temp/test_tc12_login.py" → "test_tc12_login.py"
        // 예: "./test_tc12_login.py" → "test_tc12_login.py"
        const pathParts = fileName.split(/[/\\]/);
        fileName = pathParts[pathParts.length - 1];
        
        // 파일명 정규화 (확장자 제거)
        const fileNameWithoutExt = fileName.replace(/\.py$/, '');
        
        // 파일명 매핑 시도 (여러 방법 시도)
        let tcInfo = null;
        
        // 1. 정확한 파일명 매칭 (확장자 포함)
        if (tcFileMap.has(fileName)) {
          tcInfo = tcFileMap.get(fileName);
        }
        
        // 2. 확장자 없이 매칭
        if (!tcInfo) {
          for (const [key, value] of tcFileMap.entries()) {
            const keyWithoutExt = key.replace(/\.py$/, '');
            if (keyWithoutExt === fileNameWithoutExt) {
              tcInfo = value;
              break;
            }
          }
        }
        
        // 3. TC ID로 매핑 시도 (파일명에서 TC ID 추출)
        // 파일명 형식: test_tc{id}_{name}.py
        if (!tcInfo) {
          const tcIdMatch = fileNameWithoutExt.match(/^test_tc(\d+)_/);
          if (tcIdMatch) {
            const extractedTcId = parseInt(tcIdMatch[1]);
            // tcFileMap에서 해당 TC ID를 가진 항목 찾기
            for (const [key, value] of tcFileMap.entries()) {
              if (value.tcId === extractedTcId) {
                tcInfo = value;
                break;
              }
            }
          }
        }
        
        // 4. 부분 매칭 시도 (파일명의 일부만 일치해도 매핑)
        if (!tcInfo) {
          for (const [key, value] of tcFileMap.entries()) {
            const keyWithoutExt = key.replace(/\.py$/, '');
            // 양쪽 모두에서 TC ID 추출하여 비교
            const keyTcIdMatch = keyWithoutExt.match(/^test_tc(\d+)_/);
            const fileTcIdMatch = fileNameWithoutExt.match(/^test_tc(\d+)_/);
            
            if (keyTcIdMatch && fileTcIdMatch && 
                keyTcIdMatch[1] === fileTcIdMatch[1]) {
              tcInfo = value;
              break;
            }
          }
        }
        
        if (tcInfo) {
          executedTcIds.add(tcInfo.tcId);
          
          // 에러 메시지 추출 (여러 소스에서 시도)
          let errorMessage = null;
          if (test.outcome === 'failed' || test.outcome === 'error') {
            // 1. test.call.longrepr (가장 상세한 에러 정보)
            if (test.call?.longrepr) {
              errorMessage = test.call.longrepr;
            }
            // 2. test.setup?.longrepr (setup 에러)
            else if (test.setup?.longrepr) {
              errorMessage = test.setup.longrepr;
            }
            // 3. test.teardown?.longrepr (teardown 에러)
            else if (test.teardown?.longrepr) {
              errorMessage = test.teardown.longrepr;
            }
            // 4. 간단한 에러 메시지
            else {
              errorMessage = `테스트가 ${test.outcome === 'failed' ? '실패' : '에러'}했습니다.`;
            }
          }
          
          results.push({
            tcId: tcInfo.tcId,
            scriptId: tcInfo.scriptId,
            name: tcInfo.name,
            result: {
              success: test.outcome === 'passed',
              outcome: test.outcome,
              duration: test.duration,
              error: errorMessage
            },
            status: test.outcome === 'passed' ? 'passed' : test.outcome === 'failed' ? 'failed' : 'error'
          });
        } else {
          console.warn(`파일명 매핑 실패: ${fileName} (test.nodeid: ${testName})`);
          console.warn(`정규화된 파일명: ${fileNameWithoutExt}`);
          console.warn(`사용 가능한 파일명:`, Array.from(tcFileMap.keys()));
          
          // TC ID 추출 시도하여 최소한의 정보라도 표시
          const tcIdMatch = fileNameWithoutExt.match(/^test_tc(\d+)_/);
          if (tcIdMatch) {
            const extractedTcId = parseInt(tcIdMatch[1]);
            executedTcIds.add(extractedTcId);
            results.push({
              tcId: extractedTcId,
              name: `TC #${extractedTcId}`,
              result: {
                success: test.outcome === 'passed',
                outcome: test.outcome,
                duration: test.duration,
                error: test.call?.longrepr || null
              },
              status: test.outcome === 'passed' ? 'passed' : test.outcome === 'failed' ? 'failed' : 'error'
            });
          }
        }
      }
      
      // 실행되지 않은 TC 처리
      // scriptsToRun에 포함된 TC는 실행 시도했지만 결과가 없는 경우
      const attemptedTcIds = new Set(scriptsToRun.map(s => s.tcId));
      
      console.log('실행된 TC IDs:', Array.from(executedTcIds));
      console.log('시도한 TC IDs:', Array.from(attemptedTcIds));
      console.log('요청한 TC IDs:', tcIds);
      
      for (const tcId of tcIds) {
        if (!results.find(r => r.tcId === tcId)) {
          if (attemptedTcIds.has(tcId)) {
            // 스크립트는 있었지만 실행 결과가 없는 경우
            const script = scriptsToRun.find(s => s.tcId === tcId);
            const expectedFileName = tcFileMap.get(Array.from(tcFileMap.keys()).find(k => tcFileMap.get(k).tcId === tcId));
            
            console.warn(`TC #${tcId} 실행 결과 없음:`, {
              scriptName: script?.name,
              expectedFileName: expectedFileName ? Array.from(tcFileMap.keys()).find(k => tcFileMap.get(k).tcId === tcId) : 'N/A',
              pytestTests: result.data.tests.map(t => t.nodeid)
            });
            
            // pytest 결과에 summary 정보가 있으면 추가 정보 제공
            let errorMsg = '테스트 실행 결과를 찾을 수 없습니다';
            
            if (result.data && result.data.summary) {
              const summary = result.data.summary;
              if (summary.total === 0) {
                // pytest 수집 에러인지 확인 (ERROR collecting 메시지)
                if (result.stdout && result.stdout.includes('ERROR collecting')) {
                  // ERROR collecting 부분 추출
                  const errorMatch = result.stdout.match(/ERROR collecting[^\n]*\n([\s\S]*?)(?=\n={20,}|\ncollected|\n$)/);
                  if (errorMatch) {
                    errorMsg = `pytest가 테스트 파일을 수집하는 중 오류가 발생했습니다:\n\n${errorMatch[1].trim()}`;
                  } else {
                    // ERROR collecting은 있지만 상세 메시지를 못 찾은 경우
                    const errorSection = result.stdout.match(/ERROR collecting[^\n]*\n([\s\S]*?)(?=\n={20,}|\ncollected)/);
                    if (errorSection) {
                      errorMsg = `pytest 수집 오류:\n\n${errorSection[1].trim()}`;
                    } else {
                      errorMsg = '테스트 파일 수집 중 오류가 발생했습니다. 파일에 문법 오류나 import 오류가 있을 수 있습니다.';
                      if (result.stdout) {
                        errorMsg += `\n\npytest 출력:\n${result.stdout.substring(0, 2000)}`;
                      }
                    }
                  }
                } else {
                  errorMsg = '테스트가 발견되지 않았습니다. 테스트 파일에 `test_`로 시작하는 함수가 있는지 확인하세요.';
                  if (result.stdout) {
                    // stdout이 길면 처음과 끝 부분만 표시
                    const preview = result.stdout.length > 1000 
                      ? result.stdout.substring(0, 500) + '\n... (중략) ...\n' + result.stdout.substring(result.stdout.length - 500)
                      : result.stdout;
                    errorMsg += `\n\npytest 출력:\n${preview}`;
                  }
                }
              } else {
                errorMsg += `\n(pytest summary: total=${summary.total}, passed=${summary.passed || 0}, failed=${summary.failed || 0})`;
              }
            } else if (result.stdout) {
              // summary가 없어도 stdout이 있으면 표시
              const preview = result.stdout.length > 2000 
                ? result.stdout.substring(0, 1000) + '\n... (중략) ...\n' + result.stdout.substring(result.stdout.length - 1000)
                : result.stdout;
              errorMsg += `\n\npytest 출력:\n${preview}`;
            }
            
            results.push({
              tcId,
              name: `TC #${tcId}`,
              error: errorMsg,
              status: 'error'
            });
          } else {
            // 스크립트가 없는 경우
            results.push({
              tcId,
              name: `TC #${tcId}`,
              error: '스크립트가 없거나 pytest 형식이 아닙니다',
              status: 'error'
            });
          }
        }
      }
    } else if (result.success && result.data && !result.data.tests) {
      // pytest는 성공했지만 테스트 결과가 없는 경우 (테스트 함수가 없거나 실행되지 않음)
      console.warn('pytest 실행 성공했지만 테스트 결과가 없음:', result.data);
      
      const attemptedTcIds = new Set(scriptsToRun.map(s => s.tcId));
      for (const tcId of tcIds) {
        if (attemptedTcIds.has(tcId)) {
          const script = scriptsToRun.find(s => s.tcId === tcId);
          let errorMsg = '테스트가 실행되지 않았습니다. 테스트 함수가 없거나 pytest 규칙을 따르지 않을 수 있습니다.';
          if (result.data.summary) {
            errorMsg += `\n(pytest summary: total=${result.data.summary.total})`;
          }
          if (result.stdout) {
            errorMsg += `\n출력: ${result.stdout.substring(0, 200)}...`;
          }
          
          results.push({
            tcId,
            name: `TC #${tcId}`,
            error: errorMsg,
            status: 'error'
          });
        } else {
          results.push({
            tcId,
            name: `TC #${tcId}`,
            error: '스크립트가 없거나 pytest 형식이 아닙니다',
            status: 'error'
          });
        }
      }
    } else {
      // 전체 실행 실패
      console.error('테스트 실행 실패:', result);
      results.push({
        error: result.error || '테스트 실행 실패',
        status: 'error',
        result
      });
    }

    // 결과 표시
    displayResults(results);
    updateSummary(results);

  } catch (error) {
    console.error('실행 실패:', error);
    resultsList.innerHTML = `<div class="result-item error">실행 실패: ${error.message}</div>`;
  } finally {
    runSelectedBtn.disabled = false;
    runSelectedBtn.innerHTML = '<span class="btn-icon">▶️</span> 선택한 TC 실행';
  }
}

// HTML 이스케이프 유틸리티 함수
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function displayResults(results) {
  if (!resultsList) {
    console.warn('resultsList 요소를 찾을 수 없습니다.');
    return;
  }

  resultsList.innerHTML = '';

  // 결과 오버레이 표시
  const resultsOverlay = document.getElementById('results-overlay');
  if (resultsOverlay) {
    resultsOverlay.classList.add('show');
  }

  results.forEach((item) => {
    const resultDiv = document.createElement('div');
    resultDiv.className = `result-item ${item.status}`;
    resultDiv.onclick = () => {
      // 결과 상세 탭으로 전환
      if (item.tcId) {
        const tc = findTCById(item.tcId);
        if (tc) {
          selectTC(tc);
          switchTab('result');
        }
      }
    };

    if (item.error) {
      const errorText = escapeHtml(item.error);
      resultDiv.innerHTML = `
        <div class="result-header">
          <span class="result-name">${item.name || 'Unknown'}</span>
          <span class="result-status error">에러</span>
        </div>
        <div class="result-error" style="margin-top: 8px; padding: 8px; background-color: #fee; border-left: 3px solid #f00; border-radius: 4px;">
          <pre style="margin: 0; padding: 8px; background-color: #fff; border: 1px solid #ddd; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; font-size: 12px; line-height: 1.4;">${errorText}</pre>
        </div>
      `;
    } else if (item.result) {
      const statusText = item.result.success ? '통과' : '실패';
      const statusClass = item.result.success ? 'passed' : 'failed';
      
      let errorDetails = '';
      if (!item.result.success && item.result.error) {
        // 에러 메시지가 있으면 표시 (줄바꿈 유지)
        const errorText = escapeHtml(item.result.error);
        errorDetails = `<div class="result-error" style="margin-top: 8px; padding: 8px; background-color: #fee; border-left: 3px solid #f00; border-radius: 4px;">
          <strong style="color: #c00;">에러 상세:</strong>
          <pre style="margin: 4px 0 0 0; padding: 8px; background-color: #fff; border: 1px solid #ddd; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; font-size: 12px; line-height: 1.4;">${errorText}</pre>
        </div>`;
      } else if (!item.result.success && item.result.outcome === 'failed') {
        // outcome이 failed인데 error가 없는 경우
        errorDetails = `<div class="result-error" style="margin-top: 8px; padding: 8px; background-color: #fee; border-left: 3px solid #f00; border-radius: 4px;">
          <strong style="color: #c00;">테스트 실패</strong>
          <p style="margin: 4px 0 0 0;">테스트가 실패했습니다. 상세 정보는 pytest 리포트를 확인하세요.</p>
        </div>`;
      }
      
      resultDiv.innerHTML = `
        <div class="result-header">
          <span class="result-name">${item.name || 'Unknown'}</span>
          <span class="result-status ${statusClass}">${statusText}</span>
        </div>
        ${errorDetails}
        ${item.result.duration !== undefined ? `
          <div class="result-duration">소요 시간: ${(item.result.duration * 1000).toFixed(0)}ms</div>
        ` : ''}
        ${item.result.data ? `
          <div class="result-details">
            <pre>${JSON.stringify(item.result.data, null, 2)}</pre>
          </div>
        ` : ''}
      `;
    }

    resultsList.appendChild(resultDiv);
  });
}

function updateSummary(results) {
  const total = results.length;
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const error = results.filter(r => r.status === 'error').length;

  summaryTotal.textContent = total;
  summaryPassed.textContent = passed;
  summaryFailed.textContent = failed;
  summaryError.textContent = error;
}

function findTCById(tcId) {
  function searchTree(tree) {
    for (const item of tree) {
      if (item.id === tcId) return item;
      if (item.children) {
        const found = searchTree(item.children);
        if (found) return found;
      }
    }
    return null;
  }
  return tcTreeData ? searchTree(tcTreeData) : null;
}

/**
 * 컨텍스트 메뉴에서 TC 생성
 */
async function createTestCaseFromContext(parentItem = null) {
  try {
    if (!currentProject) {
      showMessageDialog('알림', '먼저 프로젝트를 선택하세요.');
      return;
    }

    const name = await showInputDialog('새 테스트케이스', '테스트케이스 이름을 입력하세요:');
    if (name && name.trim()) {
      const parentId = (parentItem && parentItem.type === 'folder') ? parentItem.id : null;
      
      await createTestCase({
        project_id: currentProject.id,
        parent_id: parentId,
        name: name.trim(),
        type: 'test_case',
        status: 'draft'
      });
    }
  } catch (error) {
    console.error('TC 생성 오류:', error);
    showMessageDialog('오류', 'TC 생성 중 오류가 발생했습니다: ' + error.message);
  }
}

// ============================================================================
// 검색 및 필터
// ============================================================================

function filterTreeBySearch(query) {
  if (!query) {
    // 검색어가 없으면 모든 항목 표시
    document.querySelectorAll('.tc-tree-item').forEach(item => {
      item.style.display = '';
    });
    return;
  }

  const lowerQuery = query.toLowerCase();
  document.querySelectorAll('.tc-tree-item').forEach(item => {
    const name = item.querySelector('.tc-tree-item-name').textContent.toLowerCase();
    if (name.includes(lowerQuery)) {
      item.style.display = '';
      // 부모 폴더도 표시
      let parent = item.parentElement;
      while (parent && parent.classList.contains('tree-children')) {
        parent.style.display = 'block';
        parent = parent.parentElement;
      }
    } else {
      item.style.display = 'none';
    }
  });
}

// ============================================================================
// 로그 관리
// ============================================================================


// ============================================================================
// TC 편집
// ============================================================================

/**
 * TC 편집 모달 표시
 */
function editTestCase(tc) {
  if (!tc || tc.type === 'folder') {
    showMessageDialog('알림', '테스트케이스를 선택하세요.');
    return;
  }

  // 기존 다이얼로그 제거
  const existing = document.getElementById('edit-tc-dialog');
  if (existing) {
    existing.remove();
  }

  // steps 파싱 (JSON 문자열인 경우)
  let steps = tc.steps;
  if (typeof steps === 'string') {
    try {
      steps = JSON.parse(steps);
    } catch (e) {
      steps = [];
    }
  }
  if (!Array.isArray(steps)) {
    steps = [];
  }

  // 다이얼로그 생성
  const dialog = document.createElement('div');
  dialog.id = 'edit-tc-dialog';
  dialog.className = 'modal-dialog';
  
  const dialogContent = document.createElement('div');
  dialogContent.className = 'modal-content';
  dialogContent.style.maxWidth = '700px';
  dialogContent.style.width = '90%';
  
  // 헤더
  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `<h3>테스트케이스 편집</h3>`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => dialog.remove());
  header.appendChild(closeBtn);
  
  // 바디
  const body = document.createElement('div');
  body.className = 'modal-body';
  
  // 이름 입력
  const nameLabel = document.createElement('label');
  nameLabel.textContent = '이름 *';
  nameLabel.style.display = 'block';
  nameLabel.style.marginBottom = '5px';
  nameLabel.style.fontWeight = 'bold';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'modal-input';
  nameInput.value = tc.name || '';
  nameInput.placeholder = '테스트케이스 이름';
  nameInput.style.marginBottom = '15px';
  
  // 설명 입력
  const descLabel = document.createElement('label');
  descLabel.textContent = '설명';
  descLabel.style.display = 'block';
  descLabel.style.marginBottom = '5px';
  descLabel.style.fontWeight = 'bold';
  const descTextarea = document.createElement('textarea');
  descTextarea.className = 'modal-input';
  descTextarea.value = tc.description || '';
  descTextarea.placeholder = '테스트케이스 설명';
  descTextarea.rows = 3;
  descTextarea.style.marginBottom = '15px';
  descTextarea.style.resize = 'vertical';
  
  // 사전조건 입력
  const preconditionsLabel = document.createElement('label');
  preconditionsLabel.textContent = '사전조건';
  preconditionsLabel.style.display = 'block';
  preconditionsLabel.style.marginBottom = '5px';
  preconditionsLabel.style.fontWeight = 'bold';
  const preconditionsTextarea = document.createElement('textarea');
  preconditionsTextarea.className = 'modal-input';
  preconditionsTextarea.value = tc.preconditions || '';
  preconditionsTextarea.placeholder = '테스트 실행 전 필요한 사전조건을 입력하세요';
  preconditionsTextarea.rows = 3;
  preconditionsTextarea.style.marginBottom = '15px';
  preconditionsTextarea.style.resize = 'vertical';
  
  // 상태 선택
  const statusLabel = document.createElement('label');
  statusLabel.textContent = '상태';
  statusLabel.style.display = 'block';
  statusLabel.style.marginBottom = '5px';
  statusLabel.style.fontWeight = 'bold';
  const statusSelect = document.createElement('select');
  statusSelect.className = 'modal-input';
  statusSelect.style.marginBottom = '15px';
  statusSelect.innerHTML = `
    <option value="draft" ${tc.status === 'draft' ? 'selected' : ''}>초안</option>
    <option value="active" ${tc.status === 'active' ? 'selected' : ''}>활성</option>
    <option value="deprecated" ${tc.status === 'deprecated' ? 'selected' : ''}>사용 안 함</option>
  `;
  
  // 스텝 편집 영역
  const stepsLabel = document.createElement('label');
  stepsLabel.textContent = '테스트 단계 (키워드)';
  stepsLabel.style.display = 'block';
  stepsLabel.style.marginBottom = '5px';
  stepsLabel.style.fontWeight = 'bold';
  
  const stepsContainer = document.createElement('div');
  stepsContainer.style.marginBottom = '15px';
  stepsContainer.style.maxHeight = '300px';
  stepsContainer.style.overflowY = 'auto';
  stepsContainer.style.border = '1px solid #ddd';
  stepsContainer.style.borderRadius = '4px';
  stepsContainer.style.padding = '10px';
  
  const stepsTable = document.createElement('table');
  stepsTable.style.width = '100%';
  stepsTable.style.borderCollapse = 'collapse';
  stepsTable.innerHTML = `
    <thead>
      <tr style="background: #f5f5f5; border-bottom: 2px solid #ddd;">
        <th style="padding: 8px; text-align: left; width: 40px;">#</th>
        <th style="padding: 8px; text-align: left;">Action</th>
        <th style="padding: 8px; text-align: left;">Target</th>
        <th style="padding: 8px; text-align: left;">Value</th>
        <th style="padding: 8px; text-align: left;">Description</th>
        <th style="padding: 8px; text-align: center; width: 60px;">삭제</th>
      </tr>
    </thead>
    <tbody id="edit-tc-steps-body"></tbody>
  `;
  
  const stepsBody = stepsTable.querySelector('#edit-tc-steps-body');
  
  // 기존 스텝 추가
  if (steps.length > 0) {
    steps.forEach((step, index) => {
      const row = createEditStepRow(index + 1, step);
      stepsBody.appendChild(row);
    });
  }
  
  // 스텝 추가 버튼
  const addStepBtn = document.createElement('button');
  addStepBtn.type = 'button';
  addStepBtn.className = 'btn btn-secondary btn-sm';
  addStepBtn.textContent = '+ 스텝 추가';
  addStepBtn.style.marginTop = '10px';
  addStepBtn.addEventListener('click', () => {
    const newRow = createEditStepRow(stepsBody.children.length + 1, {
      action: '',
      target: '',
      value: '',
      description: ''
    });
    stepsBody.appendChild(newRow);
  });
  
  stepsContainer.appendChild(stepsTable);
  stepsContainer.appendChild(addStepBtn);
  
  body.appendChild(nameLabel);
  body.appendChild(nameInput);
  body.appendChild(descLabel);
  body.appendChild(descTextarea);
  body.appendChild(preconditionsLabel);
  body.appendChild(preconditionsTextarea);
  body.appendChild(statusLabel);
  body.appendChild(statusSelect);
  body.appendChild(stepsLabel);
  body.appendChild(stepsContainer);
  
  // 푸터
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  footer.style.display = 'flex';
  footer.style.justifyContent = 'flex-end';
  footer.style.gap = '10px';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = '취소';
  cancelBtn.addEventListener('click', () => dialog.remove());
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = '저장';
  saveBtn.addEventListener('click', async () => {
    await saveEditedTestCase(tc.id, {
      name: nameInput.value.trim(),
      description: descTextarea.value.trim(),
      preconditions: preconditionsTextarea.value.trim(),
      status: statusSelect.value,
      steps: getStepsFromTable(stepsBody)
    }, dialog);
  });
  
  footer.appendChild(cancelBtn);
  footer.appendChild(saveBtn);
  
  dialogContent.appendChild(header);
  dialogContent.appendChild(body);
  dialogContent.appendChild(footer);
  dialog.appendChild(dialogContent);
  
  document.body.appendChild(dialog);
  nameInput.focus();
  nameInput.select();
}

/**
 * 편집용 스텝 행 생성
 */
function createEditStepRow(index, step) {
  const tr = document.createElement('tr');
  tr.style.borderBottom = '1px solid #eee';
  
  // 기존 step 데이터를 data attribute로 보존 (스크린샷 참조 등)
  if (step) {
    tr.setAttribute('data-original-step', JSON.stringify(step));
  }
  
  // Action 드롭다운
  let actionSelect;
  try {
    actionSelect = document.createElement('select');
    actionSelect.className = 'keyword-action';
    actionSelect.style.width = '100%';
    actionSelect.style.padding = '5px';
    actionSelect.innerHTML = '<option value="">선택...</option>';
    
    if (typeof KEYWORDS !== 'undefined') {
      Object.values(KEYWORDS).forEach(keyword => {
        const option = document.createElement('option');
        option.value = keyword.name;
        option.textContent = `${keyword.name} - ${keyword.description}`;
        if (step.action === keyword.name) {
          option.selected = true;
        }
        actionSelect.appendChild(option);
      });
    }
  } catch (error) {
    actionSelect = document.createElement('input');
    actionSelect.type = 'text';
    actionSelect.className = 'keyword-action';
    actionSelect.value = step.action || '';
    actionSelect.style.width = '100%';
    actionSelect.style.padding = '5px';
  }
  
  const escapeHtml = (text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };
  
  tr.innerHTML = `
    <td style="padding: 8px; text-align: center;">${index}</td>
    <td style="padding: 8px;"></td>
    <td style="padding: 8px;"><input type="text" class="step-target" value="${escapeHtml(step.target || '')}" style="width: 100%; padding: 5px; box-sizing: border-box;" placeholder="선택자 또는 객체 이름"></td>
    <td style="padding: 8px;"><input type="text" class="step-value" value="${escapeHtml(step.value || '')}" style="width: 100%; padding: 5px; box-sizing: border-box;" placeholder="값"></td>
    <td style="padding: 8px;"><input type="text" class="step-description" value="${escapeHtml(step.description || '')}" style="width: 100%; padding: 5px; box-sizing: border-box;" placeholder="설명"></td>
    <td style="padding: 8px; text-align: center;">
      <button type="button" class="btn-icon delete-step" title="삭제" style="background: none; border: none; cursor: pointer; font-size: 16px;">🗑️</button>
    </td>
  `;
  
  // Action 셀에 드롭다운 추가
  const actionCell = tr.querySelector('td:nth-child(2)');
  actionCell.appendChild(actionSelect);
  
  // 삭제 버튼
  tr.querySelector('.delete-step').addEventListener('click', () => {
    tr.remove();
    // 번호 재정렬
    const rows = tr.parentElement.querySelectorAll('tr');
    rows.forEach((row, idx) => {
      row.querySelector('td:first-child').textContent = idx + 1;
    });
  });
  
  return tr;
}

/**
 * 테이블에서 스텝 데이터 추출
 */
function getStepsFromTable(stepsBody) {
  const steps = [];
  stepsBody.querySelectorAll('tr').forEach((row) => {
    const action = row.querySelector('.keyword-action')?.value || '';
    const target = row.querySelector('.step-target')?.value || '';
    const value = row.querySelector('.step-value')?.value || '';
    const description = row.querySelector('.step-description')?.value || '';
    
    if (action) {
      // 기존 step 데이터 복원 (스크린샷 참조 등)
      let originalStep = {};
      const originalStepData = row.getAttribute('data-original-step');
      if (originalStepData) {
        try {
          originalStep = JSON.parse(originalStepData);
        } catch (e) {
          console.warn('기존 step 데이터 파싱 실패:', e);
        }
      }
      
      // 기존 필드 보존 + 새로운 값으로 업데이트
      steps.push({
        ...originalStep,  // 기존 필드 보존 (screenshot 참조 등)
        action: action.trim(),
        target: target.trim(),
        value: value.trim(),
        description: description.trim()
      });
    }
  });
  return steps;
}

/**
 * 편집된 TC 저장
 */
async function saveEditedTestCase(tcId, data, dialog) {
  try {
    if (!data.name || !data.name.trim()) {
      showMessageDialog('오류', '이름은 필수입니다.');
      return;
    }

    addLog('info', `TC 편집 저장 중: ${data.name}`);
    
    // steps를 JSON 문자열로 변환 (DB 저장용)
    const updateData = {
      name: data.name.trim(),
      description: data.description || null,
      preconditions: data.preconditions || null,
      status: data.status || 'draft',
      steps: data.steps && data.steps.length > 0 ? JSON.stringify(data.steps) : null
    };
    
    const response = await window.electronAPI.api.updateTestCase(tcId, updateData);
    
    if (response && response.success) {
      addLog('success', `TC 편집 완료: ${data.name}`);
      dialog.remove();
      
      // TC 트리 새로고침
      if (currentProject) {
        await loadTCTree(currentProject.id);
      }
      
      // 편집된 TC 다시 선택
      if (response.data) {
        // steps 파싱
        if (typeof response.data.steps === 'string') {
          try {
            response.data.steps = JSON.parse(response.data.steps);
          } catch (e) {
            response.data.steps = null;
          }
        }
        selectTC(response.data);
      }
      
      showMessageDialog('성공', '테스트케이스가 업데이트되었습니다.');
    } else {
      throw new Error(response?.error || '업데이트 실패');
    }
  } catch (error) {
    console.error('TC 편집 저장 실패:', error);
    addLog('error', `TC 편집 저장 실패: ${error.message}`);
    showMessageDialog('오류', `TC 편집 저장 실패: ${error.message}`);
  }
}

// ============================================================================
// 다이얼로그 유틸리티 (Electron에서 prompt/alert 대체)
// ============================================================================

// ============================================================================
// 단일 TC 실행
// ============================================================================

async function runSingleTC(tcId) {
  addLog('info', `TC 실행 시작: #${tcId}`);
  
  // 실행 중 표시
  const treeItem = document.querySelector(`[data-tc-id="${tcId}"]`);
  if (treeItem) {
    treeItem.classList.add('running');
  }

  try {
    const scriptsResponse = await window.electronAPI.api.getScriptsByTestCase(tcId);
    
    if (scriptsResponse.success && scriptsResponse.data.length > 0) {
      const script = scriptsResponse.data.find(s => s.status === 'active') || scriptsResponse.data[0];
      
      if (script.file_path) {
        const scriptName = script.file_path.split(/[/\\]/).pop();
        addLog('info', `스크립트 실행: ${scriptName}`);
        
        const result = await window.electronAPI.runPythonScript(scriptName);
        
        if (result.success) {
          addLog('success', `TC #${tcId} 실행 완료: 통과`);
        } else {
          addLog('error', `TC #${tcId} 실행 완료: 실패`);
        }
      }
    } else {
      addLog('warning', `TC #${tcId}: 스크립트가 없습니다`);
    }
  } catch (error) {
    addLog('error', `TC #${tcId} 실행 실패: ${error.message}`);
  } finally {
    // 실행 중 표시 제거
    if (treeItem) {
      treeItem.classList.remove('running');
    }
  }
}

// ============================================================================
// TC 삭제
// ============================================================================

async function deleteTC(tcId) {
  try {
    const response = await window.electronAPI.api.deleteTestCase(tcId);
    if (response.success) {
      addLog('info', `TC #${tcId} 삭제 완료`);
      if (currentProject) {
        await loadTCTree(currentProject.id);
      }
    }
  } catch (error) {
    addLog('error', `TC 삭제 실패: ${error.message}`);
  }
}

async function createProject(name) {
  try {
    if (!name || !name.trim()) {
      alert('프로젝트 이름을 입력하세요.');
      return;
    }

    // API 확인
    if (!window.electronAPI?.api?.createProject) {
      addLog('error', '프로젝트 생성 API가 없습니다.');
      alert('프로젝트 생성 기능을 사용할 수 없습니다. 앱을 재시작하세요.');
      return;
    }

    addLog('info', `프로젝트 생성 중: ${name}`);
    
    const response = await window.electronAPI.api.createProject({ name });
    
    if (response && response.success) {
      addLog('success', `프로젝트 생성 완료: ${name}`);
      await loadProjects();
      
      // 새로 생성된 프로젝트 선택
      if (projectSelect && response.data) {
        projectSelect.value = response.data.id;
        projectSelect.dispatchEvent(new Event('change'));
      }
      
      showMessageDialog('성공', `프로젝트 '${name}'이(가) 생성되었습니다.`);
    } else {
      const errorMsg = response?.error || '알 수 없는 오류';
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error('프로젝트 생성 실패:', error);
    const errorMessage = error.message || '알 수 없는 오류가 발생했습니다';
    addLog('error', `프로젝트 생성 실패: ${errorMessage}`);
    
    // 더 자세한 오류 메시지
    let userMessage = `프로젝트 생성 실패: ${errorMessage}`;
    
    if (errorMessage.includes('no such table') || errorMessage.includes('SQLITE_ERROR')) {
      userMessage = '데이터베이스 테이블 오류입니다.\n\n앱을 재시작하면 자동으로 테이블이 생성됩니다.';
    } else if (errorMessage.includes('database is locked')) {
      userMessage = '데이터베이스가 잠겨있습니다.\n\n다른 프로세스가 데이터베이스를 사용 중일 수 있습니다.';
    } else if (errorMessage.includes('unable to open database')) {
      userMessage = '데이터베이스 파일을 열 수 없습니다.\n\n파일 권한을 확인하거나 앱을 재시작해보세요.';
    }
    
    showMessageDialog('오류', userMessage);
  }
}

// ============================================================================
// 폴더 관리
// ============================================================================


/**
 * 폴더 편집
 */
function editFolder(folder) {
  if (!folder || folder.type !== 'folder') {
    showMessageDialog('알림', '폴더를 선택하세요.');
    return;
  }

  // 기존 다이얼로그 제거
  const existing = document.getElementById('edit-folder-dialog');
  if (existing) {
    existing.remove();
  }

  // 다이얼로그 생성
  const dialog = document.createElement('div');
  dialog.id = 'edit-folder-dialog';
  dialog.className = 'modal-dialog';
  
  const dialogContent = document.createElement('div');
  dialogContent.className = 'modal-content';
  dialogContent.style.maxWidth = '500px';
  
  // 헤더
  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `<h3>폴더 편집</h3>`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => dialog.remove());
  header.appendChild(closeBtn);
  
  // 바디
  const body = document.createElement('div');
  body.className = 'modal-body';
  
  // 이름 입력
  const nameLabel = document.createElement('label');
  nameLabel.textContent = '이름 *';
  nameLabel.style.display = 'block';
  nameLabel.style.marginBottom = '5px';
  nameLabel.style.fontWeight = 'bold';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'modal-input';
  nameInput.value = folder.name || '';
  nameInput.placeholder = '폴더 이름';
  nameInput.style.marginBottom = '15px';
  
  // 설명 입력
  const descLabel = document.createElement('label');
  descLabel.textContent = '설명';
  descLabel.style.display = 'block';
  descLabel.style.marginBottom = '5px';
  descLabel.style.fontWeight = 'bold';
  const descTextarea = document.createElement('textarea');
  descTextarea.className = 'modal-input';
  descTextarea.value = folder.description || '';
  descTextarea.placeholder = '폴더 설명';
  descTextarea.rows = 3;
  descTextarea.style.marginBottom = '15px';
  descTextarea.style.resize = 'vertical';
  
  body.appendChild(nameLabel);
  body.appendChild(nameInput);
  body.appendChild(descLabel);
  body.appendChild(descTextarea);
  
  // 푸터
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  footer.style.display = 'flex';
  footer.style.justifyContent = 'flex-end';
  footer.style.gap = '10px';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = '취소';
  cancelBtn.addEventListener('click', () => dialog.remove());
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = '저장';
  saveBtn.addEventListener('click', async () => {
    await saveEditedFolder(folder.id, {
      name: nameInput.value.trim(),
      description: descTextarea.value.trim()
    }, dialog);
  });
  
  footer.appendChild(cancelBtn);
  footer.appendChild(saveBtn);
  
  dialogContent.appendChild(header);
  dialogContent.appendChild(body);
  dialogContent.appendChild(footer);
  dialog.appendChild(dialogContent);
  
  document.body.appendChild(dialog);
  nameInput.focus();
  nameInput.select();
}

/**
 * 편집된 폴더 저장
 */
async function saveEditedFolder(folderId, data, dialog) {
  try {
    if (!data.name || !data.name.trim()) {
      showMessageDialog('오류', '이름은 필수입니다.');
      return;
    }

    addLog('info', `폴더 편집 저장 중: ${data.name}`);
    
    const updateData = {
      name: data.name.trim(),
      description: data.description || null
    };
    
    const response = await window.electronAPI.api.updateTestCase(folderId, updateData);
    
    if (response && response.success) {
      addLog('success', `폴더 편집 완료: ${data.name}`);
      dialog.remove();
      
      // TC 트리 새로고침
      if (currentProject) {
        await loadTCTree(currentProject.id);
      }
      
      showMessageDialog('성공', '폴더가 업데이트되었습니다.');
    } else {
      throw new Error(response?.error || '업데이트 실패');
    }
  } catch (error) {
    console.error('폴더 편집 저장 실패:', error);
    addLog('error', `폴더 편집 저장 실패: ${error.message}`);
    showMessageDialog('오류', `폴더 편집 저장 실패: ${error.message}`);
  }
}

/**
 * TC를 폴더로 이동
 */
async function moveTCToFolder(tcId, folderId) {
  try {
    // 현재 항목 정보 가져오기
    const tcResponse = await window.electronAPI.api.getTestCase(tcId);
    if (!tcResponse || !tcResponse.success) {
      throw new Error('항목을 찾을 수 없습니다.');
    }
    
    const item = tcResponse.data;
    
    // 폴더 ID가 null이면 루트로 이동
    if (folderId) {
      // 폴더인지 확인
      const folderResponse = await window.electronAPI.api.getTestCase(folderId);
      if (!folderResponse || !folderResponse.success || folderResponse.data.type !== 'folder') {
        throw new Error('테스트케이스와 폴더는 폴더로만 이동할 수 있습니다');
      }
      
      // 순환 참조 방지: 폴더를 자신의 하위 폴더로 이동하는 것을 방지
      if (item.type === 'folder' && folderId === tcId) {
        throw new Error('폴더를 자신의 하위로 이동할 수 없습니다');
      }
      
      // 순환 참조 방지: 폴더를 자신의 하위 폴더의 하위로 이동하는 것을 방지
      if (item.type === 'folder') {
        const targetFolder = folderResponse.data;
        // 대상 폴더의 모든 부모를 확인
        let currentParentId = targetFolder.parent_id;
        while (currentParentId) {
          if (currentParentId === tcId) {
            throw new Error('폴더를 자신의 하위 폴더로 이동할 수 없습니다');
          }
          const parentResponse = await window.electronAPI.api.getTestCase(currentParentId);
          if (!parentResponse || !parentResponse.success) break;
          currentParentId = parentResponse.data.parent_id;
        }
      }
    }
    
    addLog('info', `${item.type === 'folder' ? '폴더' : 'TC'} #${tcId}를 ${folderId ? '폴더로' : '루트로'} 이동 중...`);
    
    // parent_id 업데이트
    const updateData = {
      name: item.name,
      description: item.description,
      steps: item.steps,
      tags: item.tags,
      status: item.status,
      order_index: item.order_index,
      parent_id: folderId || null
    };
    
    const response = await window.electronAPI.api.updateTestCase(tcId, updateData);
    
    if (response && response.success) {
      addLog('success', `${item.type === 'folder' ? '폴더' : 'TC'}를 ${folderId ? '폴더로' : '루트로'} 이동했습니다`);
      
      // TC 트리 새로고침
      if (currentProject) {
        await loadTCTree(currentProject.id);
      }
    } else {
      throw new Error(response?.error || '이동 실패');
    }
  } catch (error) {
    console.error('이동 실패:', error);
    addLog('error', `이동 실패: ${error.message}`);
    showMessageDialog('오류', `이동 실패: ${error.message}`);
  }
}

function showPageObjectsPlaceholder() {
  if (pageObjectsList) {
    pageObjectsList.innerHTML = '<div class="placeholder">프로젝트를 선택하세요</div>';
  }
}

async function loadPageObjects(projectId) {
  if (!pageObjectsList) return;
  
  try {
    if (!window.electronAPI?.api?.getPageObjects) {
      pageObjectsList.innerHTML = '<div class="placeholder">Page Object 기능을 사용할 수 없습니다</div>';
      return;
    }
    
    const response = await window.electronAPI.api.getPageObjects(projectId);
    
    if (response.success && response.data.length > 0) {
      renderPageObjectsList(response.data);
    } else {
      pageObjectsList.innerHTML = '<div class="placeholder">Page Object가 없습니다. 새로 만들어보세요.</div>';
    }
  } catch (error) {
    console.error('Page Objects 로드 실패:', error);
    pageObjectsList.innerHTML = `<div class="placeholder error">로드 실패: ${error.message}</div>`;
  }
}

function renderPageObjectsList(pageObjects) {
  if (!pageObjectsList) return;
  
  pageObjectsList.innerHTML = '';
  
  pageObjects.forEach(po => {
    const item = document.createElement('div');
    item.className = 'page-object-item';
    item.innerHTML = `
      <div class="page-object-header">
        <h4>${po.name}</h4>
        <div class="page-object-actions">
          <button class="btn-icon edit-page-object" data-id="${po.id}" title="편집">✏️</button>
          <button class="btn-icon delete-page-object" data-id="${po.id}" title="삭제">🗑️</button>
        </div>
      </div>
      <div class="page-object-info">
        <div><strong>프레임워크:</strong> ${po.framework}</div>
        <div><strong>언어:</strong> ${po.language}</div>
        ${po.description ? `<div><strong>설명:</strong> ${po.description}</div>` : ''}
        ${po.url_patterns && po.url_patterns.length > 0 ? 
          `<div><strong>URL 패턴:</strong> ${po.url_patterns.join(', ')}</div>` : ''}
      </div>
    `;
    
    item.querySelector('.edit-page-object').addEventListener('click', () => editPageObject(po.id));
    item.querySelector('.delete-page-object').addEventListener('click', () => deletePageObject(po.id));
    
    pageObjectsList.appendChild(item);
  });
}

function createNewPageObject() {
  currentPageObject = null;
  
  if (pageObjectNameInput) pageObjectNameInput.value = '';
  if (pageObjectDescriptionInput) pageObjectDescriptionInput.value = '';
  if (pageObjectUrlPatternsInput) pageObjectUrlPatternsInput.value = '[]';
  if (pageObjectFrameworkSelect) pageObjectFrameworkSelect.value = 'pytest';
  if (pageObjectLanguageSelect) pageObjectLanguageSelect.value = 'python';
  if (pageObjectCodeMirrorEditor) {
    pageObjectCodeMirrorEditor.setValue(`class NewPageObject:
    def __init__(self, page):
        self.page = page
    
    def example_method(self):
        """예제 메서드"""
        pass
`);
  }
  
  if (pageObjectEditor) {
    pageObjectEditor.style.display = 'block';
    const titleEl = document.getElementById('page-object-editor-title');
    if (titleEl) {
      titleEl.textContent = '새 Page Object';
    }
  }
  
  if (pageObjectsList) {
    pageObjectsList.style.display = 'none';
  }
}

async function editPageObject(id) {
  try {
    const response = await window.electronAPI.api.getPageObject(id);
    
    if (response.success) {
      currentPageObject = response.data;
      
      if (pageObjectNameInput) pageObjectNameInput.value = currentPageObject.name || '';
      if (pageObjectDescriptionInput) pageObjectDescriptionInput.value = currentPageObject.description || '';
      if (pageObjectUrlPatternsInput) {
        pageObjectUrlPatternsInput.value = JSON.stringify(currentPageObject.url_patterns || [], null, 2);
      }
      if (pageObjectFrameworkSelect) pageObjectFrameworkSelect.value = currentPageObject.framework || 'pytest';
      if (pageObjectLanguageSelect) pageObjectLanguageSelect.value = currentPageObject.language || 'python';
      if (pageObjectCodeMirrorEditor) {
        pageObjectCodeMirrorEditor.setValue(currentPageObject.code || '');
      }
      
      if (pageObjectEditor) {
        pageObjectEditor.style.display = 'block';
        const titleEl = document.getElementById('page-object-editor-title');
        if (titleEl) {
          titleEl.textContent = `편집: ${currentPageObject.name}`;
        }
      }
      
      if (pageObjectsList) {
        pageObjectsList.style.display = 'none';
      }
    } else {
      throw new Error(response.error || 'Page Object를 찾을 수 없습니다');
    }
  } catch (error) {
    console.error('Page Object 편집 실패:', error);
    showMessageDialog('오류', `편집 실패: ${error.message}`);
  }
}

async function deletePageObject(id) {
  if (!confirm('이 Page Object를 삭제하시겠습니까?')) {
    return;
  }
  
  try {
    const response = await window.electronAPI.api.deletePageObject(id);
    
    if (response.success) {
      showMessageDialog('성공', 'Page Object가 삭제되었습니다.');
      if (currentProject) {
        await loadPageObjects(currentProject.id);
      }
    } else {
      throw new Error(response.error || '삭제 실패');
    }
  } catch (error) {
    console.error('Page Object 삭제 실패:', error);
    showMessageDialog('오류', `삭제 실패: ${error.message}`);
  }
}

// ============================================================================
// 애플리케이션 시작
// ============================================================================

// ============================================================================
// 즉시 실행: 기본 검증 및 초기화
// ============================================================================

console.log('=== RENDERER.JS 즉시 실행 ===');
console.log('1. DOM 상태:', document.readyState);
console.log('2. window 존재:', typeof window !== 'undefined');
console.log('3. document 존재:', typeof document !== 'undefined');
console.log('4. electronAPI 존재:', typeof window?.electronAPI !== 'undefined');

// 전역 클릭 디버깅 (개발용)
document.addEventListener('click', (e) => {
  console.log('🔍 전역 클릭 이벤트:', {
    target: e.target,
    tagName: e.target.tagName,
    id: e.target.id,
    className: e.target.className,
    currentTarget: e.currentTarget
  });
}, true); // 캡처 단계에서 실행

// 전역 에러 핸들러
window.addEventListener('error', (event) => {
  console.error('전역 에러 발생:', event.error);
  console.error('에러 메시지:', event.message);
  console.error('에러 파일:', event.filename);
  console.error('에러 라인:', event.lineno);
});

// 모듈 로드 에러 핸들러
window.addEventListener('unhandledrejection', (event) => {
  console.error('처리되지 않은 Promise 거부:', event.reason);
});

// ============================================================================
// 초기화
// ============================================================================

async function init() {
  try {
    console.log('=== init() 함수 시작 ===');
    
    // DOM 요소 초기화 (가장 먼저!)
    initDOMElements();
    
    // electronAPI 확인
    if (!window.electronAPI) {
      console.error('❌ window.electronAPI가 없습니다!');
      console.error('window 객체:', typeof window);
      console.error('window.electronAPI:', window.electronAPI);
      alert('Electron API가 초기화되지 않았습니다. 앱을 재시작하세요.');
      return;
    }
    
    console.log('✅ window.electronAPI 확인 완료');
    console.log('  electronAPI.api:', typeof window.electronAPI.api);

    addLog('info', '애플리케이션 초기화 중...');
    
    // 데이터베이스 연결 상태 확인
    try {
      if (window.electronAPI.api?.checkServer) {
        const dbStatus = await window.electronAPI.api.checkServer();
        if (dbStatus && dbStatus.connected) {
          addLog('success', '로컬 데이터베이스에 연결되었습니다.');
          if (dbStatus.path) {
            addLog('info', `데이터베이스 위치: ${dbStatus.path}`);
          }
        } else {
          addLog('error', '데이터베이스에 연결할 수 없습니다.');
          addLog('info', '앱을 재시작해보세요.');
        }
      }
    } catch (error) {
      console.warn('데이터베이스 상태 확인 실패:', error);
      addLog('warning', '데이터베이스 상태를 확인할 수 없습니다.');
    }

    await loadProjects();
    
    // 이벤트 리스너 설정 (순서 중요, 각각 try-catch로 감싸서 하나가 실패해도 계속 진행)
    console.log('이벤트 리스너 설정 시작...');
    
    // setup 함수들이 정의되어 있는지 확인하고 호출
    if (typeof setupEventListeners === 'function') {
      try {
        setupEventListeners();
        console.log('✅ setupEventListeners 완료');
      } catch (error) {
        console.error('❌ setupEventListeners 실패:', error);
      }
    } else {
      console.error('❌ setupEventListeners 함수가 정의되지 않았습니다.');
    }
    
    if (typeof setupTabs === 'function') {
      try {
        setupTabs();
        console.log('✅ setupTabs 완료');
      } catch (error) {
        console.error('❌ setupTabs 실패:', error);
      }
    } else {
      console.error('❌ setupTabs 함수가 정의되지 않았습니다.');
    }
    
    if (typeof setupProjectExplorer === 'function') {
      try {
        setupProjectExplorer();
        console.log('✅ setupProjectExplorer 완료');
      } catch (error) {
        console.error('❌ setupProjectExplorer 실패:', error);
      }
    } else {
      console.error('❌ setupProjectExplorer 함수가 정의되지 않았습니다.');
    }
    
    if (typeof setupBottomPanel === 'function') {
      try {
        setupBottomPanel();
        console.log('✅ setupBottomPanel 완료');
      } catch (error) {
        console.error('❌ setupBottomPanel 실패:', error);
      }
    } else {
      console.error('❌ setupBottomPanel 함수가 정의되지 않았습니다.');
    }
    
    if (typeof setupRecorderSidePanel === 'function') {
      try {
        setupRecorderSidePanel();
        console.log('✅ setupRecorderSidePanel 완료');
      } catch (error) {
        console.error('❌ setupRecorderSidePanel 실패:', error);
      }
    } else {
      console.error('❌ setupRecorderSidePanel 함수가 정의되지 않았습니다.');
    }
    
    if (typeof setupContextMenu === 'function') {
      try {
        setupContextMenu();
        console.log('✅ setupContextMenu 완료');
      } catch (error) {
        console.error('❌ setupContextMenu 실패:', error);
      }
    } else {
      console.error('❌ setupContextMenu 함수가 정의되지 않았습니다.');
    }
    
    if (typeof setupCodeEditor === 'function') {
      try {
        setupCodeEditor();
        console.log('✅ setupCodeEditor 완료');
      } catch (error) {
        console.error('❌ setupCodeEditor 실패:', error);
      }
    } else {
      console.error('❌ setupCodeEditor 함수가 정의되지 않았습니다.');
    }
    
    if (typeof setupScriptViews === 'function') {
      try {
        setupScriptViews();
        console.log('✅ setupScriptViews 완료');
      } catch (error) {
        console.error('❌ setupScriptViews 실패:', error);
      }
    } else {
      console.error('❌ setupScriptViews 함수가 정의되지 않았습니다.');
    }
    
    if (typeof setupPageObjects === 'function') {
      try {
        setupPageObjects();
        console.log('✅ setupPageObjects 완료');
      } catch (error) {
        console.error('❌ setupPageObjects 실패:', error);
      }
    } else {
      console.error('❌ setupPageObjects 함수가 정의되지 않았습니다.');
    }
    
    // 서버 이벤트 리스너
    if (window.electronAPI?.onTestCaseUpdated) {
      window.electronAPI.onTestCaseUpdated((data) => {
        if (currentProject) {
          loadTCTree(currentProject.id);
        }
      });
    }
    
    // iframe에서 오는 TC step/script 업데이트 메시지 리스너
    window.addEventListener('message', async (event) => {
      if (!event.data || typeof event.data !== 'object') return;
      
      if (event.data.type === 'tc-step-updated') {
        const tcId = event.data.tcId;
        console.log('[Renderer] TC step 업데이트 알림 수신:', tcId);
        
        // 현재 선택된 TC가 업데이트된 TC이면 새로고침
        if (currentTC && currentTC.id === tcId) {
          try {
            const updatedTC = await window.electronAPI.api.getTestCase(tcId);
            if (updatedTC.success) {
              console.log('[Renderer] ✅ TC 새로고침 완료:', updatedTC.data);
              // steps 파싱
              if (typeof updatedTC.data.steps === 'string') {
                try {
                  updatedTC.data.steps = JSON.parse(updatedTC.data.steps);
                } catch (e) {
                  updatedTC.data.steps = null;
                }
              }
              
              // steps가 배열이 아닌 경우 처리
              if (updatedTC.data.steps && !Array.isArray(updatedTC.data.steps)) {
                console.warn('[Renderer] Steps가 배열이 아님:', typeof updatedTC.data.steps, updatedTC.data.steps);
                updatedTC.data.steps = null;
              }
              
              // steps가 배열이 아닌 경우 빈 배열로 초기화
              if (!Array.isArray(updatedTC.data.steps)) {
                updatedTC.data.steps = updatedTC.data.steps || [];
              }
              
              console.log(`[Renderer] TC steps 업데이트: ${updatedTC.data.steps.length}개, activeTab: ${activeTab}`);
              
              // selectTC 호출하여 TC 정보 업데이트 (displayTCDetail도 내부에서 호출됨)
              selectTC(updatedTC.data);
              
              // detail 탭이 활성화되어 있으면 TC 상세 보기 강제 업데이트 (중복 호출 방지)
              if (activeTab === 'detail') {
                console.log('[Renderer] detail 탭 활성화됨, displayTCDetail 재호출 확인');
              }
            } else {
              console.error('[Renderer] ❌ TC 로드 실패:', updatedTC.error);
            }
          } catch (error) {
            console.error('[Renderer] ❌ TC 새로고침 중 오류:', error);
          }
        }
      } else if (event.data.type === 'tc-script-updated') {
        const tcId = event.data.tcId;
        console.log('[Renderer] TC script 업데이트 알림 수신:', tcId);
        
        // 현재 선택된 TC가 업데이트된 TC이고 스크립트 탭이 활성화되어 있으면 새로고침
        if (currentTC && currentTC.id === tcId) {
          if (activeTab === 'script') {
            try {
              await loadScripts(tcId);
              console.log('[Renderer] ✅ 스크립트 새로고침 완료');
            } catch (error) {
              console.error('[Renderer] ❌ 스크립트 새로고침 중 오류:', error);
            }
          }
        }
      }
    });

    addLog('success', '애플리케이션 초기화 완료');
  } catch (error) {
    console.error('초기화 실패:', error);
    addLog('error', `초기화 실패: ${error.message}`);
  }
}