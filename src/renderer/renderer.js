/**
 * 렌더러 프로세스 메인 스크립트
 * TestRail 스타일 TC 관리 및 실행 (탭 기반 UI)
 */

// 키워드 라이브러리 및 객체 레퍼지토리 import
import { generateCodeFromSteps, getKeywordSuggestions, KEYWORDS } from './utils/keywordLibrary.js';
import { validateSteps, normalizeSteps } from './utils/keywordValidator.js';
import { ObjectRepository, SelectorUtils } from './utils/objectRepository.js';

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

// ============================================================================
// DOM 요소 참조
// ============================================================================

const projectSelect = document.getElementById('project-select');
const newProjectBtn = document.getElementById('new-project-btn');
const tcTree = document.getElementById('tc-tree');
const expandAllBtn = document.getElementById('expand-all-btn');
const collapseAllBtn = document.getElementById('collapse-all-btn');
const selectedCountSpan = document.getElementById('selected-count');
const runSelectedBtn = document.getElementById('run-selected-btn');

// 탭 관련
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

// TC 상세 탭
const tcDetailContent = document.getElementById('tc-detail-content');
const editTCBtn = document.getElementById('edit-tc-btn');
const newTCBtn = document.getElementById('new-tc-btn');

// 스크립트 탭
const scriptContent = document.getElementById('script-content');
const createScriptBtn = document.getElementById('create-script-btn');
const editScriptBtn = document.getElementById('edit-script-btn');
const saveScriptBtn = document.getElementById('save-script-btn');
const scriptLanguage = document.getElementById('script-language');
const scriptFramework = document.getElementById('script-framework');
const codeEditor = document.getElementById('code-editor');
const scriptCodeView = document.getElementById('script-code-view');
const scriptKeywordView = document.getElementById('script-keyword-view');
const viewButtons = document.querySelectorAll('.view-btn');
const keywordTableBody = document.getElementById('keyword-table-body');
const addKeywordBtn = document.getElementById('add-keyword-btn');

// CodeMirror 인스턴스
let codeMirrorEditor = null;
let currentScript = null;
let isDirty = false; // 변경사항 추적

// 결과 상세 탭
const resultDetailContent = document.getElementById('result-detail-content');
const refreshResultsBtn = document.getElementById('refresh-results-btn');

// 리코더 탭
const recorderBrowser = document.getElementById('recorder-browser');
const startRecordingBtn = document.getElementById('start-recording-btn');
const stopRecordingBtn = document.getElementById('stop-recording-btn');
const recorderViewport = document.getElementById('recorder-viewport');
const eventsList = document.getElementById('events-list');

// 전체 실행 결과 패널
const resultsPanel = document.getElementById('results-panel');
const toggleResultsBtn = document.getElementById('toggle-results-btn');
const exportReportBtn = document.getElementById('export-report-btn');
const clearResultsBtn = document.getElementById('clear-results-btn');
const resultsList = document.getElementById('results-list');
const summaryTotal = document.getElementById('summary-total');
const summaryPassed = document.getElementById('summary-passed');
const summaryFailed = document.getElementById('summary-failed');
const summaryError = document.getElementById('summary-error');

// 상단 툴바
const runCurrentBtn = document.getElementById('run-current-btn');
const profileSelect = document.getElementById('profile-select');
const browserSelect = document.getElementById('browser-select');
const searchInput = document.getElementById('search-input');
const filterBtn = document.getElementById('filter-btn');
const settingsBtn = document.getElementById('settings-btn');

// 하단 패널
const bottomPanel = document.getElementById('bottom-panel');
const toggleBottomPanel = document.getElementById('toggle-bottom-panel');
const panelTabs = document.querySelectorAll('.panel-tab');
const panelTabContents = document.querySelectorAll('.panel-tab-content');
const logContent = document.getElementById('log-content');
const resultContent = document.getElementById('result-content');
const consoleContent = document.getElementById('console-content');
const errorContent = document.getElementById('error-content');

// 컨텍스트 메뉴
const contextMenu = document.getElementById('context-menu');
let contextMenuTarget = null;

// ============================================================================
// 초기화
// ============================================================================

async function init() {
  try {
    // electronAPI 확인
    if (!window.electronAPI) {
      console.error('window.electronAPI가 없습니다. preload 스크립트가 로드되지 않았습니다.');
      addLog('error', 'Electron API가 초기화되지 않았습니다. 앱을 재시작하세요.');
      return;
    }

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
    setupEventListeners();
    setupTabs();
    setupProjectExplorer();
    setupBottomPanel();
    setupContextMenu();
    setupCodeEditor();
    setupScriptViews();
    
    // 서버 이벤트 리스너
    if (window.electronAPI?.onTestCaseUpdated) {
      window.electronAPI.onTestCaseUpdated((data) => {
        if (currentProject) {
          loadTCTree(currentProject.id);
        }
      });
    }

    addLog('success', '애플리케이션 초기화 완료');
  } catch (error) {
    console.error('초기화 실패:', error);
    addLog('error', `초기화 실패: ${error.message}`);
  }
}

// ============================================================================
// 탭 관리
// ============================================================================

function setupTabs() {
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      switchTab(tabName);
    });
  });
}

function switchTab(tabName) {
  // 탭 버튼 활성화
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // 탭 패널 표시
  tabPanels.forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabName}`);
  });

  activeTab = tabName;

  // 탭별 초기화
  if (tabName === 'script') {
    if (currentTC) {
      loadScripts(currentTC.id);
    } else {
      showScriptPlaceholder();
    }
  } else if (tabName === 'result' && currentTC) {
    loadResultDetail(currentTC.id);
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
    const treeItem = createTreeItem(item, level);
    parentElement.appendChild(treeItem);

    // 자식 노드가 있으면 재귀적으로 렌더링
    if (item.children && item.children.length > 0) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';
      childrenContainer.style.display = 'none';
      childrenContainer.style.marginLeft = '20px';
      treeItem.appendChild(childrenContainer);
      renderTCTree(item.children, childrenContainer, level + 1);
    }
  });
}

function createTreeItem(item, level) {
  const div = document.createElement('div');
  div.className = `tc-tree-item ${item.type}`;
  div.dataset.tcId = item.id;
  div.dataset.tcType = item.type;
  div.style.paddingLeft = `${level * 20 + 8}px`;

  // 드래그 가능 설정 (test_case만)
  if (item.type === 'test_case') {
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
        if (data.type === 'test_case') {
          await moveTCToFolder(data.id, item.id);
        }
      } catch (error) {
        console.error('드롭 처리 실패:', error);
        addLog('error', `이동 실패: ${error.message}`);
      }
    });
  }

  // 체크박스 (폴더는 제외, test_case만)
  if (item.type === 'test_case') {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedTCs.has(item.id);
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      if (e.target.checked) {
        selectedTCs.add(item.id);
      } else {
        selectedTCs.delete(item.id);
      }
      updateSelectedCount();
      updateRunButton();
    });
    div.appendChild(checkbox);
  }

  // 아이콘
  const icon = document.createElement('span');
  icon.className = 'tc-tree-item-icon';
  icon.textContent = item.type === 'folder' ? '📁' : '📄';
  icon.style.cursor = item.type === 'folder' ? 'pointer' : 'default';
  if (item.type === 'folder') {
    icon.title = '클릭하여 확장/축소';
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
    const children = div.querySelector('.tree-children');
    if (children) {
      const isHidden = children.style.display === 'none';
      children.style.display = isHidden ? 'block' : 'none';
      icon.textContent = isHidden ? '📂' : '📁';
    }
  };

  // 클릭 이벤트 처리
  div.addEventListener('click', (e) => {
    // 체크박스 클릭은 무시
    if (e.target.type === 'checkbox') {
      return;
    }
    
    // 폴더 아이콘 클릭 시 확장/축소
    if (item.type === 'folder' && (e.target === icon || e.target.closest('.tc-tree-item-icon'))) {
      e.stopPropagation();
      toggleFolder();
      return;
    }
    
    // 그 외 클릭은 선택
    selectTC(item);
  });

  // 우클릭 이벤트 (컨텍스트 메뉴)
  div.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.pageX, e.pageY, item);
  });

  // 폴더 더블클릭 (이름 영역) - 확장/축소
  if (item.type === 'folder') {
    name.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      toggleFolder();
    });
    
    // 폴더 아이콘 더블클릭도 확장/축소
    icon.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      toggleFolder();
    });
  }

  return div;
}

// ============================================================================
// TC 선택 및 상세 정보
// ============================================================================

function selectTC(tc) {
  currentTC = tc;

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
    displayTCDetail(tc);
  } else if (activeTab === 'script') {
    loadScripts(tc.id);
  } else if (activeTab === 'result') {
    loadResultDetail(tc.id);
  }

  // 버튼 활성화
  editTCBtn.disabled = false; // 폴더와 TC 모두 편집 가능
  createScriptBtn.disabled = tc.type === 'folder';
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
        steps = null;
      }
    }
    
    tcDetailContent.innerHTML = `
      <div class="tc-detail-info">
        <h4>${tc.name}</h4>
        ${tc.description ? `<p>${tc.description}</p>` : ''}
        <div>
          <strong>상태:</strong> ${getStatusLabel(tc.status)} | 
          <strong>스크립트:</strong> ${tc.hasScript ? '✅ 있음' : '❌ 없음'}
        </div>
        ${steps && Array.isArray(steps) && steps.length > 0 ? `
          <div class="tc-steps">
            <h5>테스트 단계:</h5>
            ${steps.map((step, idx) => `
              <div class="step-item">
                <strong>${idx + 1}. ${step.action || step.type || 'N/A'}</strong>
                ${step.target ? `<div>대상: ${step.target}</div>` : ''}
                ${step.value ? `<div>값: ${step.value}</div>` : ''}
                ${step.description ? `<div>설명: ${step.description}</div>` : ''}
              </div>
            `).join('')}
          </div>
        ` : '<p class="placeholder">테스트 단계가 없습니다</p>'}
      </div>
    `;
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
  
  tr.innerHTML = `
    <td>${index}</td>
    <td></td>
    <td><input type="text" value="${step.target || ''}" class="keyword-target" placeholder="선택자 또는 객체 이름"></td>
    <td><input type="text" value="${step.value || ''}" class="keyword-value" placeholder="값"></td>
    <td><textarea class="keyword-description" placeholder="설명">${step.description || ''}</textarea></td>
    <td>
      <button class="btn-icon delete-keyword" title="삭제">🗑️</button>
    </td>
  `;
  
  // Action 셀에 드롭다운 추가
  const actionCell = tr.querySelector('td:nth-child(2)');
  actionCell.appendChild(actionSelect);

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
    currentTC.steps = steps;
  }

  // 코드 뷰로 전환 시 코드 생성
  if (codeMirrorEditor && steps.length > 0) {
    const code = generateCodeFromKeywords(steps);
    codeMirrorEditor.setValue(code);
    isDirty = true;
    updateSaveButton();
  }
}

function generateCodeFromKeywords(steps) {
  // 키워드 라이브러리 사용
  try {
    const language = scriptLanguage.value;
    const framework = scriptFramework.value === 'pytest' ? 'pytest' : scriptFramework.value;
    
    return generateCodeFromSteps(steps, {
      language,
      framework,
      testName: `test_${currentTC?.id || 'example'}`,
      testDescription: currentTC?.name || 'Test'
    });
  } catch (error) {
    console.error('키워드 라이브러리 사용 실패, 기본 코드 생성:', error);
  }
  
  // 폴백: 기본 코드 생성
  const language = scriptLanguage.value;
  const framework = scriptFramework.value;
  
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
  
  return steps.map(step => `${step.action}(${step.target || ''}, ${step.value || ''})`).join('\n');
}

// 키워드 추가
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

async function stopRecording() {
  try {
    const result = await window.electronAPI.stopRecording();
    
    if (result.success && result.events) {
      recordedEvents = result.events;
      isRecording = false;
      startRecordingBtn.disabled = false;
      stopRecordingBtn.disabled = true;
      
      // 이벤트 목록 표시
      displayRecordedEvents(recordedEvents);
      
      // TC에 저장할지 확인
      if (confirm(`${recordedEvents.length}개의 이벤트가 캡처되었습니다. TC에 저장하시겠습니까?`)) {
        await saveEventsToTC(recordedEvents);
      }
    }
  } catch (error) {
    console.error('녹화 중지 실패:', error);
    alert('녹화 중지 실패: ' + error.message);
  }
}

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

function updateSelectedCount() {
  selectedCountSpan.textContent = selectedTCs.size;
}

function updateRunButton() {
  runSelectedBtn.disabled = selectedTCs.size === 0;
}

// ============================================================================
// 실행 기능
// ============================================================================

async function runSelectedTCs() {
  if (selectedTCs.size === 0) {
    alert('실행할 테스트케이스를 선택하세요.');
    return;
  }

  runSelectedBtn.disabled = true;
  runSelectedBtn.innerHTML = '<span class="btn-icon">⏳</span> 실행 중...';

  resultsList.innerHTML = '<div class="placeholder">테스트 실행 중...</div>';

  try {
    const tcIds = Array.from(selectedTCs);
    const testFiles = [];
    const tcFileMap = new Map(); // TC ID와 파일명 매핑
    
    // 모든 TC의 스크립트 파일 수집
    for (const tcId of tcIds) {
      try {
        const scriptsResponse = await window.electronAPI.api.getScriptsByTestCase(tcId);
        
        if (scriptsResponse.success && scriptsResponse.data.length > 0) {
          const script = scriptsResponse.data.find(s => s.status === 'active') || scriptsResponse.data[0];
          
          if (script.file_path) {
            const scriptName = script.file_path.split(/[/\\]/).pop();
            // pytest 형식 파일만 수집 (test_*.py)
            if (scriptName.startsWith('test_') && scriptName.endsWith('.py')) {
              testFiles.push(scriptName);
              tcFileMap.set(scriptName, { tcId, scriptId: script.id, name: script.name });
            }
          }
        }
      } catch (error) {
        console.error(`TC #${tcId} 스크립트 조회 실패:`, error);
      }
    }

    if (testFiles.length === 0) {
      alert('실행할 pytest 테스트 파일이 없습니다. 테스트 케이스에 pytest 형식(test_*.py)의 스크립트가 필요합니다.');
      return;
    }

    // 여러 파일을 한번에 pytest로 실행 (병렬 실행 활성화)
    // 여러 TC를 선택한 경우 자동으로 병렬 실행
    const options = {
      parallel: testFiles.length > 1,  // 파일이 2개 이상이면 병렬 실행
      workers: 'auto',                 // 자동 워커 수
      htmlReport: true,                // HTML 리포트 생성
      captureScreenshots: true         // 스크린샷 캡처
    };
    
    const result = await window.electronAPI.runPythonScript(testFiles, [], options);
    
    // 결과 파싱 및 매핑
    const results = [];
    if (result.success && result.data && result.data.tests) {
      // pytest JSON 리포트에서 각 테스트 결과 추출
      for (const test of result.data.tests) {
        const testName = test.nodeid; // 예: "test_tc1_login.py::test_login"
        const fileName = testName.split('::')[0]; // 파일명 추출
        
        if (tcFileMap.has(fileName)) {
          const tcInfo = tcFileMap.get(fileName);
          results.push({
            tcId: tcInfo.tcId,
            scriptId: tcInfo.scriptId,
            name: tcInfo.name,
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
      
      // 실행되지 않은 TC 처리 (스크립트가 없는 경우)
      for (const tcId of tcIds) {
        if (!results.find(r => r.tcId === tcId)) {
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

function displayResults(results) {
  resultsList.innerHTML = '';

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
      resultDiv.innerHTML = `
        <div class="result-header">
          <span class="result-name">${item.name}</span>
          <span class="result-status">에러</span>
        </div>
        <div>${item.error}</div>
      `;
    } else if (item.result) {
      resultDiv.innerHTML = `
        <div class="result-header">
          <span class="result-name">${item.name}</span>
          <span class="result-status">${item.result.success ? '통과' : '실패'}</span>
        </div>
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

// ============================================================================
// 이벤트 리스너
// ============================================================================

function setupEventListeners() {
  // 프로젝트 선택
  projectSelect.addEventListener('change', async (e) => {
    const projectId = e.target.value;
    if (projectId) {
      currentProject = { id: parseInt(projectId) };
      selectedTCs.clear();
      currentTC = null;
      updateSelectedCount();
      updateRunButton();
      await loadTCTree(projectId);
    } else {
      currentProject = null;
      currentTC = null;
      tcTree.innerHTML = '<div class="tree-placeholder">프로젝트를 선택하세요</div>';
      tcDetailContent.innerHTML = '<div class="placeholder">프로젝트를 선택하세요</div>';
    }
  });

  // 새 프로젝트
  if (newProjectBtn) {
    newProjectBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('새 프로젝트 버튼 클릭됨');
      
      try {
        const name = await showInputDialog('프로젝트 생성', '프로젝트 이름을 입력하세요:');
        if (name && name.trim()) {
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
    console.log('새 프로젝트 버튼 등록 완료:', newProjectBtn);
  } else {
    console.error('newProjectBtn 요소를 찾을 수 없습니다. HTML을 확인하세요.');
  }

  // 새 TC 버튼
  if (newTCBtn) {
    newTCBtn.addEventListener('click', async () => {
      try {
        if (!currentProject) {
          showMessageDialog('알림', '먼저 프로젝트를 선택하세요.');
          return;
        }

        const name = await showInputDialog('새 테스트케이스', '테스트케이스 이름을 입력하세요:');
        if (name && name.trim()) {
          await createTestCase({
            project_id: currentProject.id,
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
  } else {
    console.error('newTCBtn 요소를 찾을 수 없습니다. HTML을 확인하세요.');
  }

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

  // 모두 펼치기/접기
  expandAllBtn.addEventListener('click', () => {
    document.querySelectorAll('.tree-children').forEach(el => {
      el.style.display = 'block';
    });
    document.querySelectorAll('.tc-tree-item.folder .tc-tree-item-icon').forEach(icon => {
      icon.textContent = '📂';
    });
  });

  collapseAllBtn.addEventListener('click', () => {
    document.querySelectorAll('.tree-children').forEach(el => {
      el.style.display = 'none';
    });
    document.querySelectorAll('.tc-tree-item.folder .tc-tree-item-icon').forEach(icon => {
      icon.textContent = '📁';
    });
  });

  // 실행
  runSelectedBtn.addEventListener('click', runSelectedTCs);

  // 리코더
  startRecordingBtn.addEventListener('click', startRecording);
  stopRecordingBtn.addEventListener('click', stopRecording);

  // 결과 패널 토글
  toggleResultsBtn.addEventListener('click', () => {
    resultsPanel.classList.toggle('collapsed');
    toggleResultsBtn.textContent = resultsPanel.classList.contains('collapsed') ? '▶' : '◀';
  });

  // 리포트 내보내기
  exportReportBtn.addEventListener('click', () => {
    alert('리포트 내보내기 기능은 향후 구현 예정입니다.');
  });

  // 결과 지우기
  clearResultsBtn.addEventListener('click', () => {
    resultsList.innerHTML = '<div class="placeholder">실행 결과가 여기에 표시됩니다</div>';
    updateSummary([]);
  });

  // 상단 툴바
  runCurrentBtn.addEventListener('click', () => {
    if (currentTC && currentTC.type === 'test_case') {
      runSingleTC(currentTC.id);
    } else {
      alert('테스트케이스를 선택하세요');
    }
  });

  searchInput.addEventListener('input', (e) => {
    filterTreeBySearch(e.target.value);
  });

  filterBtn.addEventListener('click', () => {
    alert('필터 기능은 향후 구현 예정입니다.');
  });

  settingsBtn.addEventListener('click', () => {
    alert('설정 기능은 향후 구현 예정입니다.');
  });

  // 스크립트 저장
  saveScriptBtn.addEventListener('click', saveScript);

  // 새 스크립트 생성
  createScriptBtn.addEventListener('click', () => {
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
}

// ============================================================================
// 프로젝트 탐색기 관리
// ============================================================================

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

// ============================================================================
// 하단 패널 관리
// ============================================================================

function setupBottomPanel() {
  // 패널 토글
  toggleBottomPanel.addEventListener('click', () => {
    bottomPanel.classList.toggle('collapsed');
    toggleBottomPanel.textContent = bottomPanel.classList.contains('collapsed') ? '▲' : '▼';
  });

  // 탭 전환
  panelTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const panelName = tab.dataset.panel;
      
      // 탭 활성화
      panelTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // 컨텐츠 표시
      panelTabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `panel-${panelName}`) {
          content.classList.add('active');
        }
      });
    });
  });
}

// ============================================================================
// 컨텍스트 메뉴
// ============================================================================

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
}

function showContextMenu(x, y, item) {
  contextMenuTarget = item;
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
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
      if (confirm(`'${contextMenuTarget.name}'을(를) 삭제하시겠습니까?`)) {
        deleteTC(contextMenuTarget.id);
      }
      break;
    case 'new-folder':
      createNewFolder(contextMenuTarget);
      break;
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

function addLog(type, message) {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  logEntry.textContent = `[${timestamp}] ${message}`;
  
  logContent.appendChild(logEntry);
  logContent.scrollTop = logContent.scrollHeight;

  // 콘솔에도 출력
  console.log(`[${type.toUpperCase()}] ${message}`);
}

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
      steps.push({
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

/**
 * 입력 다이얼로그 표시
 */
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

/**
 * 메시지 다이얼로그 표시
 */
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

// ============================================================================
// TC 생성
// ============================================================================

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
 * 새 폴더 생성
 */
async function createNewFolder(parentItem = null) {
  try {
    if (!currentProject) {
      showMessageDialog('알림', '먼저 프로젝트를 선택하세요.');
      return;
    }

    const name = await showInputDialog('새 폴더', '폴더 이름을 입력하세요:');
    if (name && name.trim()) {
      const folderData = {
        project_id: currentProject.id,
        parent_id: parentItem ? parentItem.id : null,
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
    addLog('info', `TC #${tcId}를 폴더로 이동 중...`);
    
    // 현재 TC 정보 가져오기
    const tcResponse = await window.electronAPI.api.getTestCase(tcId);
    if (!tcResponse || !tcResponse.success) {
      throw new Error('TC를 찾을 수 없습니다.');
    }
    
    const tc = tcResponse.data;
    
    // parent_id 업데이트
    const updateData = {
      name: tc.name,
      description: tc.description,
      steps: tc.steps,
      tags: tc.tags,
      status: tc.status,
      order_index: tc.order_index,
      parent_id: folderId
    };
    
    const response = await window.electronAPI.api.updateTestCase(tcId, updateData);
    
    if (response && response.success) {
      addLog('success', `TC #${tcId} 이동 완료`);
      
      // TC 트리 새로고침
      if (currentProject) {
        await loadTCTree(currentProject.id);
      }
    } else {
      throw new Error(response?.error || '이동 실패');
    }
  } catch (error) {
    console.error('TC 이동 실패:', error);
    addLog('error', `TC 이동 실패: ${error.message}`);
    showMessageDialog('오류', `TC 이동 실패: ${error.message}`);
  }
}

// ============================================================================
// 애플리케이션 시작
// ============================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
