/**
 * 렌더러 프로세스 메인 스크립트
 * UI 이벤트 처리 및 테스트 실행 흐름 관리
 */

import { loadTestScripts } from './utils/scriptLoader.js';
import { runTest } from './utils/testRunner.js';
import { 
  displaySuccess, 
  displayError, 
  displayLoading,
  setButtonLoading,
  restoreButton
} from './utils/uiHelper.js';

// ============================================================================
// DOM 요소 참조
// ============================================================================

/** @type {HTMLSelectElement} 테스트 스크립트 선택 드롭다운 */
const scriptSelect = document.getElementById('script-select');

/** @type {HTMLButtonElement} 테스트 실행 버튼 */
const runBtn = document.getElementById('run-btn');

/** @type {HTMLElement} 테스트 결과 표시 컨테이너 */
const resultContainer = document.getElementById('result-container');

// ============================================================================
// 초기화
// ============================================================================

/**
 * 애플리케이션 초기화
 * 환경 검사, 스크립트 목록 로드 및 이벤트 리스너 설정
 */
async function init() {
  try {
    // 환경 검사
    await checkAndDisplayEnvironment();
    
    // 스크립트 목록 로드
    await loadTestScripts(scriptSelect);
    
    // 이벤트 리스너 설정
    setupEventListeners();
  } catch (error) {
    console.error('초기화 실패:', error);
    displayError(resultContainer, error.message || '초기화에 실패했습니다.');
  }
}

/**
 * 환경 검사 및 결과 표시
 */
async function checkAndDisplayEnvironment() {
  try {
    const envCheck = await window.electronAPI.checkEnvironment();
    
    if (!envCheck.allReady) {
      const warningDiv = document.createElement('div');
      warningDiv.className = 'environment-warning';
      warningDiv.innerHTML = `
        <div class="warning-header">
          <strong>⚠️ 필수 환경이 설치되지 않았습니다</strong>
        </div>
        <div class="warning-content">
          <p>누락된 항목: ${envCheck.missingItems.join(', ')}</p>
          <pre class="install-guide">${envCheck.installGuide}</pre>
        </div>
      `;
      
      // 결과 컨테이너에 경고 표시
      resultContainer.innerHTML = '';
      resultContainer.appendChild(warningDiv);
    }
  } catch (error) {
    console.error('환경 검사 실패:', error);
  }
}

// ============================================================================
// 이벤트 핸들러
// ============================================================================

/**
 * 이벤트 리스너 설정
 * UI 요소에 이벤트 핸들러 등록
 */
function setupEventListeners() {
  runBtn.addEventListener('click', handleRunTest);
  
  // 향후 확장: 키보드 단축키 등 추가 가능
  // document.addEventListener('keydown', handleKeyboardShortcut);
}

/**
 * 테스트 실행 핸들러
 * 사용자가 실행 버튼을 클릭했을 때 호출
 */
async function handleRunTest() {
  const selectedScript = scriptSelect.value;

  if (!selectedScript) {
    displayError(resultContainer, '스크립트를 선택해주세요.');
    return;
  }

  // UI 상태 업데이트: 로딩 상태로 전환
  setButtonLoading(runBtn);
  displayLoading(resultContainer);

  try {
    // 환경 검사 (테스트 실행 전)
    const envCheck = await window.electronAPI.checkEnvironment();
    if (!envCheck.allReady) {
      displayError(resultContainer, 
        `필수 환경이 설치되지 않았습니다.\n\n누락된 항목: ${envCheck.missingItems.join(', ')}\n\n${envCheck.installGuide}`
      );
      return;
    }

    // 테스트 실행
    const result = await runTest(selectedScript);
    
    // 결과 표시
    if (result.success) {
      displaySuccess(resultContainer, result.data);
    } else {
      displayError(resultContainer, result.error || '알 수 없는 오류가 발생했습니다.');
    }
  } catch (error) {
    displayError(resultContainer, error.message || '테스트 실행에 실패했습니다.');
  } finally {
    // UI 상태 복원
    restoreButton(runBtn);
  }
}

// ============================================================================
// 애플리케이션 시작
// ============================================================================

// DOM이 로드되면 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ============================================================================
// 확장 포인트
// ============================================================================

/**
 * 향후 추가할 수 있는 기능들:
 * 
 * 1. 테스트 실행 취소 기능
 *    - handleCancelTest()
 *    - 실행 중인 프로세스 취소
 * 
 * 2. 테스트 결과 내보내기
 *    - exportResults(result)
 *    - CSV, JSON, PDF 등 형식으로 내보내기
 * 
 * 3. 테스트 히스토리 관리
 *    - saveTestHistory(result)
 *    - getTestHistory()
 * 
 * 4. 실시간 로그 표시
 *    - displayRealtimeLogs(logs)
 *    - WebSocket 또는 EventSource를 통한 실시간 업데이트
 */
