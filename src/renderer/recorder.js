/**
 * TestArchitect 녹화 모듈
 * record/popup.js의 핵심 로직을 Electron 환경에 맞게 이식
 */

import { generateCode } from './utils/codeGenerator.js';
import { getSelectorCandidatesWithUniqueness, inferSelectorType } from './utils/selectorUtils.js';
import { normalizeURL, captureDOM, getCurrentPeriod } from './utils/domSnapshot.js';
import { 
  findParentElement, 
  findAncestorElement, 
  findSiblingElement, 
  analyzeElementStructure,
  generateRelativeSelector,
  generateConditionCheck
} from './utils/domAnalyzer.js';
import { shouldFilterIntermediateUrl, waitForFinalPage, removeQueryParams } from './utils/urlFilter.js';
import {
  replayState,
  STEP_DELAY_MS,
  MAX_NAVIGATION_WAIT_MS,
  resetReplayState,
  scheduleNextStep as scheduleReplayNextStep,
  finishReplay,
  abortReplay,
  sendReplayStep,
  handleReplayStepResult,
  buildActionTimeline,
  buildReplayQueue,
  startReplay as startReplayModule
} from './recorder/recorder-replay.js';
import {
  aiSuggestionState,
  aiSettings,
  aiSettingsLoaded,
  aiSettingsDirty,
  aiCodeReviewState,
  getAiState,
  setAiState,
  formatAiStatusTime,
  appendAiMessage,
  sanitizeAiSettingValue,
  setAiSettingsStatus,
  applyAiSettingsToInputs,
  isAiConfigured,
  loadAiSettingsFromStorage,
  markAiSettingsDirty,
  saveAiSettings,
  normalizeAiCandidates,
  buildAiRequestPayload,
  requestAiSelectorsForEvent,
  renderAiRequestControls,
  performAiCodeReview as performAiCodeReviewModule
} from './recorder/recorder-ai.js';
import {
  buildManualActionEntry,
  addManualAction,
  handleVerifyAction,
  handleWaitAction,
  handleInteractionAction,
  addVerifyAction,
  addWaitAction,
  addInteractionAction,
  captureVerifyImageScreenshot
} from './recorder/recorder-actions.js';
import {
  selectorTabState,
  buildSelectorTabGroups,
  getGroupCount,
  showSelectors,
  renderSelectorItems,
  renderSelectorGroup,
  updateSelectorTabUI,
  applySelector,
  highlightSelector
} from './recorder/recorder-selectors.js';
import {
  selectionState,
  simpleSelectionState,
  setElementStatus,
  updateElementButtonState,
  ensureElementPanelVisibility,
  resetSelectionUI,
  resetSelectionState,
  getCurrentSelectionNode,
  renderSelectionPath,
  createSelectionCandidateItem,
  renderSelectionCandidates,
  updateSelectionActionsVisibility,
  buildSelectionPathArray,
  buildSelectionPreviewLines,
  updateSelectionCodePreview,
  applyCandidateToNode,
  sendSelectionMessage,
  requestElementPick,
  startSelectionWorkflow,
  cancelSelectionWorkflow,
  startSimpleElementSelection,
  handleSimpleElementSelectionPicked,
  cancelSimpleElementSelection,
  handleElementSelectionPicked,
  handleElementSelectionError,
  handleElementSelectionCancelled,
  handleElementAction,
  startChildSelection,
  startParentSelection,
  applySelectionAction
} from './recorder/recorder-selection.js';
import {
  connectWebSocket as connectWebSocketModule,
  normalizeEventRecord as normalizeEventRecordModule,
  saveEventAsStep as saveEventAsStepModule,
  syncTimelineFromEvents as syncTimelineFromEventsModule,
  startRecording as startRecordingModule,
  stopRecording as stopRecordingModule
} from './recorder/recorder-core.js';
import {
  logMessage as logMessageModule,
  normalizeTimelineSelectorValue,
  resolveTimelineSelector as resolveTimelineSelectorModule,
  formatSelectorTypeLabel as formatSelectorTypeLabelModule,
  getActionIcon as getActionIconModule,
  formatActionLabel as formatActionLabelModule,
  formatTargetInfo as formatTargetInfoModule,
  updateDeleteButtonState as updateDeleteButtonStateModule,
  updateTryWrapCheckbox as updateTryWrapCheckboxModule,
  getCodeText as getCodeTextModule,
  setCodeText as setCodeTextModule,
  getCodeMirrorMode as getCodeMirrorModeModule,
  refreshCodeEditorMode as refreshCodeEditorModeModule,
  updateStepsEmptyState as updateStepsEmptyStateModule,
  showIframe as showIframeModule,
  appendTimelineItem as appendTimelineItemModule,
  handleElementHover as handleElementHoverModule,
  clearElementHover as clearElementHoverModule
} from './recorder/recorder-ui.js';
import {
  createConditionalActionState,
  validateBySelector as validateBySelectorModule,
  validateSiblingRelation as validateSiblingRelationModule,
  validateAncestorRelation as validateAncestorRelationModule,
  addAssertionAfterStep as addAssertionAfterStepModule,
  addConditionalActionAfterStep as addConditionalActionAfterStepModule,
  // handleStepAssertion은 recorder-conditional.js에서 export되지 않음
  // handleStepAssertion as handleStepAssertionModule,
} from './recorder/recorder-conditional.js';
import {
  saveCodeToTC as saveCodeToTCModule,
  saveCodeToTCWithDebounce as saveCodeToTCWithDebounceModule,
  syncAllEventsToTC as syncAllEventsToTCModule,
  syncCodeToTC as syncCodeToTCModule
} from './recorder/recorder-tc-sync.js';
import {
  handleGlobalAssertion as handleGlobalAssertionModule,
  handleGlobalWait as handleGlobalWaitModule
} from './recorder/recorder-global-actions.js';
import {
  initDOMElements as initDOMElementsModule,
  initPanelResize as initPanelResizeModule,
  loadRecorderSettings as loadRecorderSettingsModule,
  savePanelHeight as savePanelHeightModule
} from './recorder/recorder-init.js';
import {
  setupEventListeners as setupEventListenersModule,
  setupActionMenu as setupActionMenuModule,
  setupOverlayToggle as setupOverlayToggleModule,
  setupAiSettings as setupAiSettingsModule
} from './recorder/recorder-event-listeners.js';
import {
  setupIpcListeners as setupIpcListenersModule,
  setupPostMessageListeners as setupPostMessageListenersModule,
  handleWebSocketMessage as handleWebSocketMessageModule
} from './recorder/recorder-messaging.js';
import {
  showConditionalActionDialog as showConditionalActionDialogModule,
  updateConditionalActionUI as updateConditionalActionUIModule,
  updateCodePreview as updateCodePreviewModule,
  activateElementSelectionForConditionalAction as activateElementSelectionForConditionalActionModule,
  activateChildElementSelection as activateChildElementSelectionModule,
  activateSiblingElementSelection as activateSiblingElementSelectionModule,
  activateAncestorElementSelection as activateAncestorElementSelectionModule
} from './recorder/recorder-conditional-dialog.js';
import {
  startConditionalActionWorkflow as startConditionalActionWorkflowModule,
  updateConditionalActionStep as updateConditionalActionStepModule,
  goToConditionalActionStep as goToConditionalActionStepModule,
  activateElementSelectionForConditionalActionStep as activateElementSelectionForConditionalActionStepModule,
  activateElementSelectionForRelativeActionStep as activateElementSelectionForRelativeActionStepModule,
  completeConditionalAction as completeConditionalActionModule,
  cancelConditionalAction as cancelConditionalActionModule
} from './recorder/recorder-conditional-workflow.js';

// Electron IPC 통신 (Electron 환경에서만 사용)
// contextIsolation: true이므로 window.electronAPI를 통해 접근
let electronAPI = null;

/**
 * electronAPI 초기화 및 재확인
 * iframe 환경에서는 부모 윈도우의 electronAPI에 접근 시도
 */
function initElectronAPI() {
  // 먼저 현재 윈도우에서 확인
  if (typeof window !== 'undefined' && window.electronAPI) {
    electronAPI = window.electronAPI;
    console.log('[Recorder] electronAPI 로드 성공 (현재 윈도우)');
    return true;
  }
  
  // iframe 환경에서는 부모 윈도우 확인
  if (window.parent !== window && window.parent.electronAPI) {
    electronAPI = window.parent.electronAPI;
    console.log('[Recorder] electronAPI 로드 성공 (부모 윈도우)');
    return true;
  }
  
  // top 윈도우 확인
  if (window.top && window.top !== window && window.top.electronAPI) {
    electronAPI = window.top.electronAPI;
    console.log('[Recorder] electronAPI 로드 성공 (top 윈도우)');
    return true;
  }
  
  console.warn('[Recorder] electronAPI를 찾을 수 없습니다.');
  return false;
}

// 초기화 시도
initElectronAPI();

// DOM 요소 참조 (나중에 초기화됨)
let startBtn = null;
let stopBtn = null;
let timeline = null;
let selectorList = null;
let iframeBanner = null;
let codeOutput = null;
let logEntries = null;
let resetBtn = null;
let elementSelectBtn = null;
let deleteEventBtn = null;
let tcIdInput = null;
let projectIdInput = null;
let sendRecordingBtn = null;
let frameworkSelect = null;
let languageSelect = null;
let aiReviewBtn = null;
let aiReviewStatusEl = null;
let syncToTcBtn = null;
let aiEndpointInput = null;
let aiApiKeyInput = null;
let aiModelInput = null;
let aiSettingsSaveBtn = null;
let aiSettingsStatusEl = null;
// 요소 선택 워크플로우 DOM 요소
let elementPanel = null;
let elementStatusEl = null;
let elementPathContainer = null;
let elementPathItems = null;
let elementCandidatesContainer = null;
let elementActionsContainer = null;
let elementCancelBtn = null;
let elementAttrPanel = null;
let elementAttrNameInput = null;
let elementAttrApplyBtn = null;
let elementCodePreview = null;
let elementCodeEl = null;

// 상태 관리
let recording = false;
let selectedFramework = 'playwright';
let selectedLanguage = 'python';
let currentEventIndex = -1;
let allEvents = [];
let codeEditor = null;

// 조건부 액션 단계별 워크플로우 상태 관리
let conditionalActionStep = 0; // 현재 단계 (0: 초기, 1: 액션 타입 선택, 2: 다음 단계...)
let conditionalActionData = {
  actionType: null, // 'conditionalAction', 'relativeAction', 'loopAction'
  conditionElement: null,
  childElement: null,
  siblingElement: null,
  ancestorElement: null,
  conditionType: null,
  conditionValue: null,
  targetRelation: null,
  targetSelector: null,
  loopMode: null,
  loopSelector: null,
  actionTypeValue: null,
  actionValue: null,
  stepIndex: -1
};
let wsConnection = null;
let manualActions = [];
let manualActionSerial = 1;

// DOM 스냅샷 저장 상태 관리 (같은 세션 내 중복 저장 방지)
const snapshotSavedUrls = new Set();

// 리플레이 상태 및 상수는 recorder-replay.js에서 import

// 셀렉터 탭 상태 관리 (popup.js의 selectorTabState 이식)
// selectorTabState는 recorder-selectors.js에서 import

// AI 상태는 recorder-ai.js에서 import

// 요소 선택 워크플로우 상태 관리 (popup.js 이식)
// selectionState, simpleSelectionState는 recorder-selection.js에서 import

// WebSocket 연결 (래퍼 함수)
function connectWebSocket() {
  // stateRefs를 getter/setter 패턴으로 변경하여 자동 동기화
  const stateRefs = {
    get recording() { return recording; },
    set recording(v) { recording = v; },
    get wsConnection() { return wsConnection; },
    set wsConnection(v) { wsConnection = v; },
    startBtn,
    stopBtn
  };
  
  const result = connectWebSocketModule(
    logMessage,
    handleWebSocketMessage,
    stateRefs
  );
  
  if (result) {
    wsConnection = result;
  }
  
  return result;
}

// 원래 함수 정의는 recorder-core.js로 이동됨

// WebSocket 메시지 처리 (래퍼 함수)
function handleWebSocketMessage(message) {
  handleWebSocketMessageModule(message, {
    recording,
    logMessage,
    handleDomEvent,
    startRecording,
    stopRecording,
    handleElementHover,
    clearElementHover,
    trySaveDomSnapshot,
    simpleSelectionState,
    elementStatusEl,
    handleSimpleElementSelectionPicked: handleSimpleElementSelectionPickedWrapper,
    handleElementSelectionPicked: handleElementSelectionPickedWrapper,
    cancelSimpleElementSelection: cancelSimpleElementSelectionWrapper,
    handleElementSelectionError: handleElementSelectionErrorWrapper,
    handleElementSelectionCancelled: handleElementSelectionCancelledWrapper,
    wsConnection,
    finishReplay,
    abortReplay,
    scheduleReplayNextStep,
    sendReplayStep,
    handleReplayStepResult
  });
}

/**
 * DOM 스냅샷 저장 시도
 * @param {string} url - 페이지 URL
 */
async function trySaveDomSnapshot(url) {
  try {
    // electronAPI 확인
    if (!electronAPI) {
      initElectronAPI();
    }
    
    if (!electronAPI || !electronAPI.saveDomSnapshot) {
      console.warn('[Recorder] electronAPI가 없어 DOM 스냅샷 저장을 건너뜁니다.');
      return;
    }
    
    // URL 정규화
    const normalizedUrl = normalizeURL(url);
    if (!normalizedUrl) {
      console.warn('[Recorder] URL 정규화 실패:', url);
      return;
    }
    
    // 같은 세션 내 중복 저장 방지 (15일 주기 확인은 서버에서 처리)
    if (snapshotSavedUrls.has(normalizedUrl)) {
      console.log(`[Recorder] 이미 저장된 URL이므로 스냅샷 저장 건너뜀: ${normalizedUrl}`);
      return;
    }
    
    // DOM 구조 캡처 (현재 페이지에서)
    // 주의: recorder.js는 iframe에서 실행되므로, 실제 DOM은 Content Script에서 캡처해야 함
    // 여기서는 Content Script에서 전달받은 DOM 데이터를 사용하거나,
    // Content Script에서 직접 캡처하도록 요청해야 함
    let domStructure = null;
    let pageTitle = null;
    
    try {
      // iframe 내부에서는 부모 페이지의 DOM에 직접 접근할 수 없으므로
      // Content Script에서 DOM을 캡처하여 전달받아야 함
      // 임시로 빈 문자열 사용 (나중에 Content Script에서 전달받도록 수정 필요)
      domStructure = captureDOM(); // 이 함수는 iframe 내부 DOM을 반환
      pageTitle = document.title || null;
    } catch (error) {
      console.warn('[Recorder] DOM 구조 캡처 시도 실패:', error);
      // Content Script에서 캡처한 DOM을 사용하도록 개선 필요
    }
    
    if (!domStructure) {
      console.log('[Recorder] DOM 구조를 캡처할 수 없습니다. Content Script에서 캡처 필요');
      return;
    }
    
    // 메타데이터 준비
    const metadata = {
      userAgent: navigator.userAgent || 'Unknown',
      viewport: {
        width: window.innerWidth || 0,
        height: window.innerHeight || 0
      },
      timestamp: new Date().toISOString()
    };
    
    // 새로운 API 형식으로 스냅샷 저장
    const snapshotData = {
      url: url, // 원본 URL (정규화는 서버에서 수행)
      domData: domStructure,
      pageTitle: pageTitle,
      metadata: metadata
    };
    
    const result = await electronAPI.saveDomSnapshot(snapshotData);
    
    if (result && result.success) {
      if (result.skipped) {
        console.log(`[Recorder] DOM 스냅샷 저장 건너뜀: ${normalizedUrl} (${result.reason})`);
        snapshotSavedUrls.add(normalizedUrl); // 중복 저장 방지
      } else {
        console.log(`[Recorder] ✅ DOM 스냅샷 저장 완료: ${normalizedUrl}`);
        snapshotSavedUrls.add(normalizedUrl); // 중복 저장 방지
        logMessage(`DOM 스냅샷 저장: ${normalizedUrl}`, 'success');
      }
    } else {
      console.error('[Recorder] DOM 스냅샷 저장 실패:', result?.error || '알 수 없는 오류');
    }
  } catch (error) {
    console.error('[Recorder] DOM 스냅샷 저장 중 오류:', error);
  }
}

// DOM 이벤트 처리
function handleDomEvent(event) {
  console.log('[Recorder] handleDomEvent 호출됨:', {
    recording,
    eventAction: event?.action || event?.type,
    timeline: !!timeline,
    allEventsLength: allEvents.length
  });
  
  if (!recording) {
    console.warn('[Recorder] 녹화 중이 아니므로 이벤트 무시');
    return;
  }

  if (!timeline) {
    console.error('[Recorder] timeline이 null입니다. DOM 요소를 찾을 수 없습니다.');
    // timeline 재초기화 시도
    timeline = document.getElementById('timeline');
    if (!timeline) {
      console.error('[Recorder] timeline 재초기화 실패');
      return;
    }
  }

  // 요소 선택 모드가 활성화되어 있으면 클릭 이벤트 무시
  // Content Script에서 이미 ELEMENT_SELECTION_PICKED를 WebSocket으로 보내므로
  // 여기서는 dom-event를 무시하면 됨 (WebSocket 핸들러에서 처리)
  if ((selectionState.active || simpleSelectionState.active) && (event.action === 'click' || event.type === 'click')) {
    console.log('[Recorder] 요소 선택 모드 활성화 중 - dom-event 무시 (Content Script에서 ELEMENT_SELECTION_PICKED 전송)');
    return;
  }

  const normalizedEvent = normalizeEventRecord(event);
  console.log('[Recorder] 이벤트 정규화 완료:', normalizedEvent.action);
  
  // CDP에서 이미 생성된 셀렉터 후보 사용 (selectorUtils.js로 생성됨)
  // selectorCandidates가 없으면 빈 배열로 처리
  if (!normalizedEvent.selectorCandidates) {
    normalizedEvent.selectorCandidates = [];
  }
  if (!normalizedEvent.selectors && normalizedEvent.selectorCandidates.length > 0) {
    normalizedEvent.selectors = normalizedEvent.selectorCandidates.map(c => c.selector || c);
  }
  
  // 중복 체크: 같은 타임스탬프와 액션의 이벤트가 이미 있는지 확인
  const isDuplicate = allEvents.some(existing => {
    return existing.timestamp === normalizedEvent.timestamp &&
           existing.action === normalizedEvent.action &&
           existing.primarySelector === normalizedEvent.primarySelector;
  });
  
  if (isDuplicate) {
    console.log('[Recorder] 중복 이벤트 무시:', normalizedEvent.action);
    return;
  }
  
  allEvents.push(normalizedEvent);
  const index = allEvents.length - 1;
  console.log('[Recorder] 이벤트 추가됨, 인덱스:', index, '전체 이벤트 수:', allEvents.length);
  
  // Timeline에 아이템 추가
  try {
    appendTimelineItem(normalizedEvent, index);
    console.log('[Recorder] 타임라인 아이템 추가 완료');
  } catch (error) {
    console.error('[Recorder] 타임라인 아이템 추가 실패:', error);
  }
  
  // 빈 상태 메시지 업데이트 (이벤트 추가 후)
  updateStepsEmptyState();
  
  // 자동으로 마지막 이벤트 선택
  currentEventIndex = index;
  document.querySelectorAll('.recorder-step').forEach(item => item.classList.remove('selected'));
  const lastItem = timeline?.querySelector(`[data-event-index="${index}"]`);
  if (lastItem) {
    lastItem.classList.add('selected');
    console.log('[Recorder] 마지막 이벤트 선택됨');
  } else {
    console.warn('[Recorder] 마지막 이벤트 아이템을 찾을 수 없음:', index);
  }
  
  // 셀렉터 표시
  showSelectorsWrapper(normalizedEvent.selectorCandidates || [], normalizedEvent, index);
  showIframe(normalizedEvent.iframeContext);
  
  // 코드 업데이트
  updateCode();
  
  // 삭제 버튼 상태 업데이트
  updateDeleteButtonState();
  
  logMessage(`이벤트 캡처: ${normalizedEvent.action || 'unknown'}`, 'info');
  
  // 실시간으로 TC step으로 저장
  try {
    saveEventAsStep(normalizedEvent);
    console.log('[Recorder] TC step 저장 완료');
  } catch (error) {
    console.error('[Recorder] TC step 저장 실패:', error);
  }
}

// 코드 저장 debounce 타이머 (recorder-tc-sync.js 모듈에서 관리)
// let codeSaveTimer = null;
// const CODE_SAVE_DELAY = 1000; // 1초 지연

/**
 * 코드를 TC script로 실시간 저장 (래퍼 함수)
 */
async function saveCodeToTC(code) {
  await saveCodeToTCModule(code, {
    tcIdInput,
    projectIdInput,
    selectedLanguage,
    selectedFramework,
    electronAPI,
    initElectronAPI
  });
}

/**
 * 코드 저장 (debounce 적용) (래퍼 함수)
 */
function saveCodeToTCWithDebounce(code) {
  saveCodeToTCWithDebounceModule(code, {
    tcIdInput,
    projectIdInput,
    selectedLanguage,
    selectedFramework,
    electronAPI,
    initElectronAPI
  });
}

/**
 * 이벤트를 TC step으로 실시간 저장
 */
// 이벤트를 TC step으로 저장 (래퍼 함수)
async function saveEventAsStep(event) {
  const tcId = tcIdInput?.value;
  const projectId = projectIdInput?.value;
  
  await saveEventAsStepModule(
    event,
    tcId,
    projectId,
    electronAPI,
    initElectronAPI
  );
}

// 원래 함수 정의는 recorder-core.js로 이동됨

/**
 * 전체 이벤트를 TC steps로 동기화 (래퍼 함수)
 */
async function syncAllEventsToTC() {
  return await syncAllEventsToTCModule({
    tcIdInput,
    allEvents,
    electronAPI,
    initElectronAPI,
    logMessage
  });
}

/**
 * 현재 코드를 TC steps로 동기화 (래퍼 함수)
 * 코드에서 steps를 추출하거나 현재 이벤트를 steps로 변환
 */
async function syncCodeToTC() {
  return await syncCodeToTCModule({
    tcIdInput,
    allEvents,
    electronAPI,
    logMessage
  });
}

// 이벤트 레코드 정규화 (래퍼 함수)
function normalizeEventRecord(event) {
  return normalizeEventRecordModule(event);
}

// 원래 함수 정의는 recorder-core.js로 이동됨

// Timeline 셀렉터 해석 (래퍼 함수)
function resolveTimelineSelector(event) {
  return resolveTimelineSelectorModule(event);
}

// 원래 함수 정의는 recorder-ui.js로 이동됨

/**
 * 셀렉터 타입 레이블 포맷팅 (래퍼 함수)
 * popup.js의 formatSelectorTypeLabel 이식
 */
function formatSelectorTypeLabel(type) {
  return formatSelectorTypeLabelModule(type);
}

/**
 * 삭제 버튼 상태 업데이트 (래퍼 함수)
 * popup.js의 updateDeleteButtonState 이식
 */
function updateDeleteButtonState() {
  updateDeleteButtonStateModule(deleteEventBtn, currentEventIndex, allEvents);
}

/**
 * try 문 체크박스 상태 업데이트 (래퍼 함수)
 */
function updateTryWrapCheckbox(event) {
  updateTryWrapCheckboxModule(event);
}

/**
 * 코드 텍스트 가져오기 (래퍼 함수)
 * popup.js의 getCodeText 이식
 */
function getCodeText() {
  return getCodeTextModule(codeEditor, codeOutput);
}

/**
 * 코드 텍스트 설정 (래퍼 함수)
 * popup.js의 setCodeText 이식
 */
function setCodeText(text) {
  setCodeTextModule(text, codeEditor, codeOutput);
}

/**
 * CodeMirror 모드 가져오기 (래퍼 함수)
 * popup.js의 getCodeMirrorMode 이식
 */
function getCodeMirrorMode(language) {
  return getCodeMirrorModeModule(language, selectedLanguage);
}

/**
 * 코드 에디터 모드 새로고침 (래퍼 함수)
 * popup.js의 refreshCodeEditorMode 이식
 */
function refreshCodeEditorMode() {
  refreshCodeEditorModeModule(codeEditor, selectedLanguage);
}

// 액션 타입별 아이콘 매핑 (래퍼 함수)
function getActionIcon(action) {
  return getActionIconModule(action);
}

// 액션 라벨 포맷팅 (래퍼 함수)
function formatActionLabel(action) {
  return formatActionLabelModule(action);
}

// 타겟 정보 포맷팅 (래퍼 함수)
function formatTargetInfo(ev) {
  return formatTargetInfoModule(ev);
}

// Timeline 아이템 추가 (래퍼 함수)
function appendTimelineItem(ev, index) {
  if (!timeline) {
    console.error('[Recorder] appendTimelineItem: timeline이 null입니다.');
    timeline = document.getElementById('timeline');
    if (!timeline) {
      console.error('[Recorder] appendTimelineItem: timeline 재초기화 실패');
      return;
    }
  }
  
  // stateRefs를 getter/setter 패턴으로 변경하여 자동 동기화
  const stateRefs = {
    get currentEventIndex() { return currentEventIndex; },
    set currentEventIndex(v) { currentEventIndex = v; },
    get allEvents() { return allEvents; },
    set allEvents(v) { allEvents = v; }
  };
  
  console.log('[Recorder] appendTimelineItem 호출:', { action: ev.action, index, timeline: !!timeline });
  
  appendTimelineItemModule(
    ev,
    index,
    timeline,
    resolveTimelineSelectorModule,
    getActionIconModule,
    formatActionLabelModule,
    formatTargetInfoModule,
    deleteCurrentEvent,
    handleStepAssertion,
    showSelectorsWrapper,
    (ctx) => showIframeModule(ctx, iframeBanner),
    updateDeleteButtonState,
    updateTryWrapCheckbox,
    stateRefs
  );
}

// 원래 함수 정의는 recorder-ui.js로 이동됨

/**
 * 빈 상태 메시지 업데이트 (래퍼 함수)
 */
function updateStepsEmptyState() {
  updateStepsEmptyStateModule(allEvents);
}

/**
 * 타임라인을 이벤트 목록과 동기화 (확장 프로그램 버전 기반)
 */
// 이벤트로부터 타임라인 동기화 (래퍼 함수)
function syncTimelineFromEvents(events, options = {}) {
  // stateRefs를 getter/setter 패턴으로 변경하여 자동 동기화
  const stateRefs = {
    get allEvents() { return allEvents; },
    set allEvents(v) { allEvents = v; },
    get currentEventIndex() { return currentEventIndex; },
    set currentEventIndex(v) { currentEventIndex = v; },
    timeline,
    selectorList
  };
  
  return syncTimelineFromEventsModule(
    events,
    options,
    stateRefs,
    normalizeEventRecordModule,
    appendTimelineItem,
    updateStepsEmptyState,
    showSelectorsWrapper,
    showIframe,
    updateDeleteButtonState,
    updateTryWrapCheckbox,
    aiSuggestionState,
    getAiStateKey
  );
}

// 원래 함수 정의는 recorder-core.js로 이동됨

/**
 * Timeline 업데이트 (기존 함수 - 호환성 유지)
 */
function updateTimeline() {
  syncTimelineFromEvents(allEvents, { preserveSelection: true });
}

// getTargetPositionInfo, selectorLikelyStable, appendNthToSelector, enforceNthSelectorIfNeeded, buildSelectorTabGroups, getGroupCount, showSelectors, renderSelectorItems, renderSelectorGroup, updateSelectorTabUI, applySelector, highlightSelector 함수들이 recorder-selectors.js로 이동됨

// ============================================================================
// AI 기능 (recorder-ai.js 모듈로 이동됨)
// ============================================================================

/**
 * 셀렉터 표시 래퍼 함수
 */
function showSelectorsWrapper(list, event, eventIndex) {
  const applySelectorFn = (s, ei, src, li) => applySelector(s, ei, src, li, allEvents, currentEventIndex, inferSelectorType, showSelectorsWrapper, updateTimeline, updateCode, logMessage);
  const highlightSelectorFn = (c) => highlightSelector(c, logMessage);
  
  showSelectors(
    list,
    event,
    eventIndex,
    selectorList,
    allEvents,
    selectedFramework,
    selectedLanguage,
    (ev, idx) => requestAiSelectorsForEvent(ev, idx, allEvents, selectedFramework, selectedLanguage, showSelectorsWrapper),
    () => updateSelectorTabUI(
      selectorTabState,
      allEvents,
      currentEventIndex,
      showSelectorsWrapper,
      applySelectorFn,
      highlightSelectorFn
    ),
    applySelectorFn,
    highlightSelectorFn
  );
}

/**
 * 셀렉터 적용 래퍼 함수
 */
function applySelectorWrapper(s, eventIndex, source = 'base', listIndex = -1) {
  applySelector(
    s,
    eventIndex,
    source,
    listIndex,
    allEvents,
    currentEventIndex,
    inferSelectorType,
    showSelectorsWrapper,
    updateTimeline,
    updateCode,
    logMessage
  );
}

/**
 * 현재 이벤트의 셀렉터 리스트 새로고침
 */
function refreshSelectorListForCurrentEvent() {
  if (currentEventIndex >= 0 && allEvents[currentEventIndex]) {
    const currentEvent = allEvents[currentEventIndex];
    showSelectorsWrapper(currentEvent.selectorCandidates || [], currentEvent, currentEventIndex);
  }
}

// iframe 표시
// iframe 배너 표시/숨김 (래퍼 함수)
function showIframe(ctx) {
  showIframeModule(ctx, iframeBanner);
}

// ============================================================================
// 요소 선택 워크플로우 (popup.js 이식) - 6단계
// ============================================================================

// setElementStatus, updateElementButtonState, ensureElementPanelVisibility, resetSelectionUI, resetSelectionState, getCurrentSelectionNode, renderSelectionPath, createSelectionCandidateItem, renderSelectionCandidates, updateSelectionActionsVisibility, buildSelectionPathArray, updateSelectionCodePreview, applyCandidateToNode, startSelectionWorkflow, cancelSelectionWorkflow, sendSelectionMessage, requestElementPick, startSimpleElementSelection, handleSimpleElementSelectionPicked, cancelSimpleElementSelection, handleElementSelectionPicked, handleElementSelectionError, handleElementSelectionCancelled, handleElementAction, startChildSelection, startParentSelection, applySelectionAction, buildSelectionPreviewLines 함수들이 recorder-selection.js로 이동됨

/**
 * 요소 선택 워크플로우 래퍼 함수들
 */
function setElementStatusWrapper(message, tone = 'info') {
  setElementStatus(message, tone, elementStatusEl);
}

function updateElementButtonStateWrapper() {
  updateElementButtonState(selectionState, elementSelectBtn);
}

function ensureElementPanelVisibilityWrapper() {
  ensureElementPanelVisibility(selectionState, elementPanel);
}

function resetSelectionUIWrapper() {
  resetSelectionUI(
    elementPathItems,
    elementPathContainer,
    elementCandidatesContainer,
    elementActionsContainer,
    elementAttrPanel,
    elementAttrNameInput,
    elementCodePreview,
    elementCodeEl
  );
}

function resetSelectionStateWrapper(options = {}) {
  resetSelectionState(
    selectionState,
    options,
    setElementStatusWrapper,
    resetSelectionUIWrapper,
    updateElementButtonStateWrapper,
    ensureElementPanelVisibilityWrapper
  );
}

function getCurrentSelectionNodeWrapper() {
  return getCurrentSelectionNode(selectionState);
}

function renderSelectionPathWrapper() {
  renderSelectionPath(selectionState, elementPathItems, elementPathContainer);
}

function createSelectionCandidateItemWrapper(node, candidate) {
  return createSelectionCandidateItem(
    node,
    candidate,
    inferSelectorType,
    applyCandidateToNodeWrapper,
    (c) => highlightSelector(c, logMessage),
    logMessage
  );
}

function renderSelectionCandidatesWrapper(node) {
  renderSelectionCandidates(node, elementCandidatesContainer, createSelectionCandidateItemWrapper);
}

function updateSelectionActionsVisibilityWrapper() {
  updateSelectionActionsVisibility(
    selectionState,
    elementActionsContainer,
    elementAttrPanel,
    elementAttrNameInput,
    getCurrentSelectionNodeWrapper
  );
}

function buildSelectionPathArrayWrapper() {
  return buildSelectionPathArray(selectionState, inferSelectorType);
}

function buildSelectionPreviewLinesWrapper(path, framework, language) {
  return buildSelectionPreviewLines(path, framework, language, inferSelectorType);
}

function updateSelectionCodePreviewWrapper() {
  updateSelectionCodePreview(
    selectionState,
    selectedFramework,
    selectedLanguage,
    elementCodePreview,
    elementCodeEl,
    buildSelectionPathArrayWrapper,
    buildSelectionPreviewLinesWrapper
  );
}

function applyCandidateToNodeWrapper(node, candidate) {
  applyCandidateToNode(
    node,
    candidate,
    selectionState,
    inferSelectorType,
    renderSelectionCandidatesWrapper,
    renderSelectionPathWrapper,
    updateSelectionActionsVisibilityWrapper,
    updateSelectionCodePreviewWrapper,
    setElementStatusWrapper
  );
}

function sendSelectionMessageWrapper(payload, callback) {
  sendSelectionMessage(payload, callback, wsConnection);
}

function requestElementPickWrapper(mode) {
  requestElementPick(
    mode,
    sendSelectionMessageWrapper,
    setElementStatusWrapper,
    cancelSelectionWorkflowWrapper
  );
}

function startSelectionWorkflowWrapper() {
  startSelectionWorkflow(
    selectionState,
    resetSelectionStateWrapper,
    setElementStatusWrapper,
    ensureElementPanelVisibilityWrapper,
    updateElementButtonStateWrapper,
    requestElementPickWrapper
  );
}

function cancelSelectionWorkflowWrapper(message = '', tone = 'info') {
  cancelSelectionWorkflow(
    message,
    tone,
    selectionState,
    sendSelectionMessageWrapper,
    resetSelectionStateWrapper,
    setElementStatusWrapper
  );
}

function startSimpleElementSelectionWrapper(callback, pendingAction, pendingStepIndex = null) {
  startSimpleElementSelection(
    callback,
    pendingAction,
    pendingStepIndex,
    selectionState,
    simpleSelectionState,
    cancelSelectionWorkflowWrapper,
    elementStatusEl,
    sendSelectionMessageWrapper
  );
}

function handleSimpleElementSelectionPickedWrapper(msg) {
  handleSimpleElementSelectionPicked(
    msg,
    simpleSelectionState,
    inferSelectorType,
    elementStatusEl,
    sendSelectionMessageWrapper
  );
}

function cancelSimpleElementSelectionWrapper() {
  cancelSimpleElementSelection(
    simpleSelectionState,
    elementStatusEl,
    sendSelectionMessageWrapper
  );
}

function handleElementSelectionPickedWrapper(msg) {
  handleElementSelectionPicked(
    msg,
    selectionState,
    inferSelectorType,
    updateElementButtonStateWrapper,
    addAssertionAfterStep,
    addVerifyAction,
    addWaitAction,
    normalizeEventRecord,
    allEvents,
    updateCode,
    syncTimelineFromEvents,
    saveEventAsStep,
    setElementStatusWrapper,
    captureVerifyImageScreenshot,
    electronAPI,
    initElectronAPI,
    cancelSelectionWorkflowWrapper,
    renderSelectionPathWrapper,
    renderSelectionCandidatesWrapper,
    updateSelectionActionsVisibilityWrapper,
    updateSelectionCodePreviewWrapper,
    ensureElementPanelVisibilityWrapper,
    getCurrentSelectionNodeWrapper
  );
}

function handleElementSelectionErrorWrapper(msg) {
  handleElementSelectionError(
    msg,
    selectionState,
    setElementStatusWrapper,
    requestElementPickWrapper
  );
}

function handleElementSelectionCancelledWrapper() {
  handleElementSelectionCancelled(
    selectionState,
    cancelSelectionWorkflowWrapper
  );
}

function startChildSelectionWrapper() {
  startChildSelection(
    selectionState,
    getCurrentSelectionNodeWrapper,
    setElementStatusWrapper,
    updateSelectionActionsVisibilityWrapper,
    requestElementPickWrapper
  );
}

function startParentSelectionWrapper() {
  startParentSelection(
    selectionState,
    getCurrentSelectionNodeWrapper,
    setElementStatusWrapper,
    updateSelectionActionsVisibilityWrapper,
    sendSelectionMessageWrapper
  );
}

function applySelectionActionWrapper(actionType, options = {}) {
  return applySelectionAction(
    actionType,
    options,
    selectionState,
    buildSelectionPathArrayWrapper,
    setElementStatusWrapper,
    getCurrentSelectionNodeWrapper,
    addAssertionAfterStep,
    addVerifyAction,
    addWaitAction,
    addInteractionAction,
    buildManualActionEntry,
    addManualAction,
    normalizeEventRecord,
    allEvents,
    updateCode,
    syncTimelineFromEvents,
    saveEventAsStep,
    captureVerifyImageScreenshot,
    electronAPI,
    initElectronAPI,
    cancelSelectionWorkflowWrapper,
    logMessage,
    manualActions,
    manualActionSerial,
    selectedFramework,
    selectedLanguage
  );
}

function handleElementActionWrapper(action) {
  return handleElementAction(
    action,
    selectionState,
    getCurrentSelectionNodeWrapper,
    setElementStatusWrapper,
    applySelectionActionWrapper,
    startChildSelectionWrapper,
    startParentSelectionWrapper,
    cancelSelectionWorkflowWrapper,
    elementAttrPanel,
    elementAttrNameInput
  );
}

// ============================================================================
// 수동 액션 추가 기능 (popup.js 이식) - 8단계
// ============================================================================
// 함수들이 recorder-actions.js로 이동됨

// handleVerifyAction, handleWaitAction, handleInteractionAction 함수들이 recorder-actions.js로 이동됨
// addVerifyAction, captureVerifyImageScreenshot, addWaitAction, addInteractionAction 함수들이 recorder-actions.js로 이동됨

// ============================================================================
// 리플레이 기능 (recorder-replay.js 모듈로 이동됨)
// ============================================================================

/**
 * 리플레이 시작 (래퍼 함수)
 */
function startReplay() {
  const sendReplayStepWrapper = () => {
    sendReplayStep(
      wsConnection,
      () => finishReplay(logMessage),
      (reason) => abortReplay(reason, logMessage),
      (delayMs) => scheduleReplayNextStep(delayMs, sendReplayStepWrapper)
    );
  };
  
  const result = startReplayModule(allEvents, manualActions, normalizeEventRecord, wsConnection, logMessage);
  if (result) {
    // 첫 스텝 실행
    scheduleReplayNextStep(500, sendReplayStepWrapper);
  }
}

// 요소 하이라이트 처리 (래퍼 함수)
function handleElementHover(data) {
  handleElementHoverModule(
    data,
    selectorList,
    renderSelectorItems,
    (ctx) => showIframeModule(ctx, iframeBanner)
  );
}

// 원래 함수 정의는 recorder-ui.js로 이동됨

// 요소 하이라이트 해제 (래퍼 함수)
function clearElementHover() {
  clearElementHoverModule(
    selectorList,
    currentEventIndex,
    allEvents,
    showSelectors,
    (ctx) => showIframeModule(ctx, iframeBanner)
  );
}

// 원래 함수 정의는 recorder-ui.js로 이동됨

// 코드 업데이트
/**
 * 코드 업데이트
 * popup.js의 updateCode 이식 (개선)
 */
function updateCode(options = {}) {
  const {
    refreshTimeline = false,
    preserveSelection = false,
    selectLast = false,
    resetAiState = false,
    preloadedEvents = null
  } = options || {};

  const handleEvents = (events) => {
    let normalizedEvents;
    if (refreshTimeline) {
      normalizedEvents = syncTimelineFromEvents(events, {
        preserveSelection,
        selectLast,
        resetAiState
      });
    } else {
      normalizedEvents = Array.isArray(events) ? events.map((ev) => normalizeEventRecord(ev)) : [];
      allEvents = normalizedEvents;
    }

    // 수동 액션 로드 (간소화 버전)
    loadManualActions(() => {
      const code = generateCode(normalizedEvents, manualActions, selectedFramework, selectedLanguage);
      setCodeText(code);
      
      // 코드를 TC에 실시간 저장 (debounce 적용)
      // 녹화 중이거나 녹화가 방금 중지된 경우 저장
      if (recording || normalizedEvents.length > 0) {
        saveCodeToTCWithDebounce(code);
      }
      
      // updateSelectionCodePreview(); // 6단계에서 구현
    });
  };

  // preloadedEvents가 제공되면 바로 사용
  if (Array.isArray(preloadedEvents)) {
    handleEvents(preloadedEvents);
    return;
  }

  // Electron 환경에서는 allEvents를 직접 사용
  // refreshTimeline이 true이면 syncTimelineFromEvents가 allEvents를 업데이트하므로
  // 여기서는 allEvents를 그대로 전달
  handleEvents(allEvents);
}

/**
 * 수동 액션 로드
 * popup.js의 loadManualActions 이식 (간소화)
 */
function loadManualActions(callback) {
  // Electron 환경에서는 메모리에서 직접 로드
  // chrome.storage는 사용하지 않음
  if (callback) {
    callback(manualActions || []);
  }
}

// CodeMirror 초기화
function initCodeEditor() {
  if (!codeOutput || typeof CodeMirror === 'undefined') return;

  codeEditor = CodeMirror.fromTextArea(codeOutput, {
    lineNumbers: true,
    theme: 'neo',
    scrollbarStyle: 'native',
    mode: getCodeMirrorMode(selectedLanguage)
  });
  
  codeEditor.setSize('100%', 'auto');
  codeEditor.on('change', () => {
    codeOutput.value = codeEditor.getValue();
  });
  codeEditor.refresh();
}

// 녹화 시작
// 녹화 시작 (래퍼 함수)
async function startRecording() {
  try {
    // stateRefs를 getter/setter 패턴으로 변경하여 자동 동기화
    const stateRefs = {
      get recording() { return recording; },
      set recording(v) { recording = v; },
      get allEvents() { return allEvents; },
      set allEvents(v) { allEvents = v; },
      get currentEventIndex() { return currentEventIndex; },
      set currentEventIndex(v) { currentEventIndex = v; },
      get wsConnection() { return wsConnection; },
      set wsConnection(v) { wsConnection = v; },
      startBtn,
      stopBtn,
      timeline,
      selectorList,
      logEntries
    };
    
    const tcId = tcIdInput?.value;
    const projectId = projectIdInput?.value;
    
    console.log('[Recorder] startRecordingModule 호출 전:', { tcId, projectId });
    
    // WebSocket 연결 확인 및 연결
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
      console.log('[Recorder] WebSocket 연결 시작 (startRecording 호출 시)');
      const newConnection = connectWebSocket();
      
      if (newConnection) {
        wsConnection = newConnection;
      }
      
      // WebSocket 연결 완료 대기 (최대 2초)
      let waitCount = 0;
      const maxWait = 20; // 2초 (100ms * 20)
      
      while ((!wsConnection || wsConnection.readyState !== WebSocket.OPEN) && waitCount < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }
      
      if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
        console.warn('[Recorder] WebSocket 연결 실패. 녹화를 시작할 수 없습니다.');
        if (logMessage) {
          logMessage('WebSocket 연결이 필요합니다. 브라우저를 먼저 열어주세요.', 'error');
        }
        return;
      }
    }
    
    // stateRefs 업데이트 (최신 wsConnection 반영) - getter/setter로 자동 동기화됨
    stateRefs.wsConnection = wsConnection;
    
    await startRecordingModule(
      stateRefs,
      logMessage,
      connectWebSocket,
      setCodeText,
      updateDeleteButtonState,
      updateStepsEmptyState,
      tcId,
      projectId,
      electronAPI,
      initElectronAPI
    );
    
    // getter/setter로 자동 동기화되므로 수동 동기화 불필요
    console.log('[Recorder] startRecording 완료:', { recording, allEventsLength: allEvents.length });
  } catch (error) {
    console.error('[Recorder] startRecording 오류:', error);
    if (logMessage) {
      logMessage('녹화 시작 중 오류: ' + error.message, 'error');
    }
    // 에러 발생 시 상태 복구
    recording = false;
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    throw error;
  }
}

// 원래 함수 정의는 recorder-core.js로 이동됨

// 녹화 중지 (래퍼 함수)
async function stopRecording() {
  // stateRefs를 getter/setter 패턴으로 변경하여 자동 동기화
  const stateRefs = {
    get recording() { return recording; },
    set recording(v) { recording = v; },
    get wsConnection() { return wsConnection; },
    set wsConnection(v) { wsConnection = v; },
    startBtn,
    stopBtn
  };
  
  await stopRecordingModule(
    stateRefs,
    logMessage,
    updateCode
  );
  
  // getter/setter로 자동 동기화되므로 수동 동기화 불필요
}

// 원래 함수 정의는 recorder-core.js로 이동됨

// 초기화
function reset() {
  recording = false;
  allEvents = [];
  manualActions = [];
  currentEventIndex = -1;
  snapshotSavedUrls.clear(); // 스냅샷 저장 상태 초기화

  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;
  if (timeline) timeline.innerHTML = '';
  if (selectorList) selectorList.innerHTML = '';
  if (logEntries) logEntries.innerHTML = '';

  setCodeText('');
  updateDeleteButtonState();

  logMessage('초기화 완료', 'info');
}

// 이벤트 삭제
/**
 * 현재 선택된 이벤트 삭제
 * 확장 프로그램 버전 기반
 */
async function deleteCurrentEvent() {
  if (currentEventIndex < 0 || currentEventIndex >= allEvents.length) return;
  
  const targetIndex = currentEventIndex;
  const updatedEvents = allEvents.slice();
  updatedEvents.splice(targetIndex, 1);
  
  // TC에서도 step 삭제
  const tcId = tcIdInput?.value;
  if (tcId) {
    // electronAPI 재확인
    if (!electronAPI) {
      initElectronAPI();
    }
    
    if (electronAPI) {
      try {
        const result = await electronAPI.invoke('delete-tc-step', {
          tcId: parseInt(tcId, 10),
          stepIndex: targetIndex
        });
        
        if (result && result.success) {
          console.log(`[Recorder] ✅ TC에서 Step ${targetIndex} 삭제 완료`);
        } else {
          console.warn('[Recorder] ⚠️ TC step 삭제 실패:', result?.error || '알 수 없는 오류');
          // TC 삭제 실패해도 UI는 업데이트 (부분 동기화)
        }
      } catch (error) {
        console.error('[Recorder] ❌ TC step 삭제 중 오류:', error);
        // 오류가 발생해도 UI는 업데이트
      }
    }
  }
  
  const nextIndex = updatedEvents.length > 0 ? Math.min(targetIndex, updatedEvents.length - 1) : -1;
  currentEventIndex = nextIndex;
  
  const normalized = syncTimelineFromEvents(updatedEvents, {
    preserveSelection: nextIndex !== -1,
    selectLast: false,
    resetAiState: false
  });
  
  updateDeleteButtonState();
  updateCode({ preloadedEvents: normalized });
  
  // 단계 상세 정보 패널 닫기 (삭제된 경우)
  if (nextIndex === -1) {
    const stepDetailsPanel = document.getElementById('step-details-panel');
    if (stepDetailsPanel) {
      stepDetailsPanel.classList.add('hidden');
    }
  }
  
  logMessage('이벤트 삭제됨', 'info');
}

// 호환성을 위한 별칭
const deleteSelectedEvent = deleteCurrentEvent;

// 로그 메시지 표시
// 로그 메시지 출력 (래퍼 함수)
function logMessage(message, type = 'info') {
  logMessageModule(message, type, logEntries);
}

// 녹화 데이터 전송
async function sendRecordingData() {
  const tcId = tcIdInput?.value;
  const projectId = projectIdInput?.value;

  if (!tcId || !projectId) {
    alert('TC ID와 Project ID를 입력하세요.');
    return;
  }

  if (allEvents.length === 0) {
    alert('전송할 이벤트가 없습니다.');
    return;
  }

  try {
    const code = generateCode(allEvents, manualActions, selectedFramework, selectedLanguage);
    
    const recordingData = {
      type: 'recording_complete',
      tcId: parseInt(tcId, 10),
      projectId: parseInt(projectId, 10),
      sessionId: `session-${Date.now()}`,
      events: allEvents,
      code: code,
      framework: selectedFramework,
      language: selectedLanguage,
      metadata: {
        browser: 'chrome',
        timestamp: Date.now()
      }
    };

    const response = await fetch('http://localhost:3000/api/recording', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(recordingData)
    });

    const result = await response.json();

    if (result.success) {
      logMessage('녹화 데이터 전송 성공', 'success');
      alert('녹화 데이터가 저장되었습니다!');
    } else {
      logMessage(`전송 실패: ${result.error}`, 'error');
      alert('녹화 데이터 저장 실패: ' + result.error);
    }
  } catch (error) {
    console.error('[Recorder] 전송 오류:', error);
    logMessage(`전송 오류: ${error.message}`, 'error');
    alert('녹화 데이터 전송 오류: ' + error.message);
  }
}

// AI 코드 리뷰
async function performAiCodeReview() {
  await performAiCodeReviewModule(
    codeEditor,
    codeOutput,
    aiReviewBtn,
    aiReviewStatusEl,
    selectedFramework,
    selectedLanguage,
    allEvents,
    setCodeText,
    logMessage
  );
}

// Action 메뉴 토글
// Action 메뉴 설정 (래퍼 함수)
function setupActionMenu() {
  setupActionMenuModule({
    handleInteractionAction,
    handleVerifyAction,
    handleWaitAction,
    buildSelectionPathArrayWrapper,
    startSelectionWorkflowWrapper,
    startSimpleElementSelectionWrapper,
    selectionState,
    setElementStatusWrapper,
    addInteractionAction,
    addVerifyAction,
    addWaitAction,
    normalizeEventRecord,
    allEvents,
    updateCode,
    syncTimelineFromEvents,
    saveEventAsStep,
    logMessage,
    electronAPI,
    initElectronAPI,
    captureVerifyImageScreenshot
  });
}

// 오버레이 토글 (래퍼 함수)
function setupOverlayToggle() {
  setupOverlayToggleModule({
    wsConnection,
    logMessage
  });
}

// AI 설정 이벤트 리스너 설정 (래퍼 함수)
function setupAiSettings() {
  setupAiSettingsModule({
    aiSettingsSaveBtn,
    aiEndpointInput,
    aiApiKeyInput,
    aiModelInput,
    aiSettingsStatusEl,
    aiSettingsLoaded,
    aiSettingsDirty,
    loadAiSettingsFromStorage,
    saveAiSettings,
    markAiSettingsDirty,
    refreshSelectorListForCurrentEvent
  });
}

// 이벤트 리스너 설정 (래퍼 함수)
function setupEventListeners() {
  // selectedFramework와 selectedLanguage는 전역 변수이므로 getter/setter를 사용
  const stateRefs = {
    selectedFramework: {
      get value() { return selectedFramework; },
      set value(v) { selectedFramework = v; }
    },
    selectedLanguage: {
      get value() { return selectedLanguage; },
      set value(v) { selectedLanguage = v; }
    },
    currentEventIndex: {
      get value() { return currentEventIndex; },
      set value(v) { currentEventIndex = v; }
    }
  };
  
  setupEventListenersModule({
    // DOM 요소
    startBtn,
    stopBtn,
    resetBtn,
    deleteEventBtn,
    sendRecordingBtn,
    frameworkSelect,
    languageSelect,
    aiReviewBtn,
    syncToTcBtn,
    elementAttrApplyBtn,
    elementAttrNameInput,
    elementSelectBtn,
    tcIdInput,
    projectIdInput,
    // 상태
    selectedFramework: stateRefs.selectedFramework,
    selectedLanguage: stateRefs.selectedLanguage,
    codeEditor,
    allEvents,
    currentEventIndex: stateRefs.currentEventIndex,
    recording,
    selectionState,
    // 함수들
    startRecording,
    stopRecording,
    reset,
    deleteSelectedEvent,
    sendRecordingData,
    updateCode,
    getCodeMirrorMode,
    performAiCodeReview,
    syncCodeToTC,
    setElementStatusWrapper,
    applySelectionActionWrapper,
    handleInteractionAction,
    handleVerifyAction,
    handleWaitAction,
    buildSelectionPathArrayWrapper,
    startSelectionWorkflowWrapper,
    startSimpleElementSelectionWrapper,
    addInteractionAction,
    addVerifyAction,
    addWaitAction,
    normalizeEventRecord,
    syncTimelineFromEvents,
    saveEventAsStep,
    logMessage,
    generateCode,
    manualActions,
    setCodeText,
    saveCodeToTCWithDebounce,
    updateDeleteButtonState,
    initPanelResize,
    handleGlobalAssertion,
    handleGlobalWait,
    startConditionalActionWorkflow,
    startReplay,
    cancelSelectionWorkflowWrapper,
    addAssertionAfterStep,
    updateTimeline,
    highlightSelector,
    requestAiSelectorsForEvent,
    electronAPI,
    initElectronAPI,
    captureVerifyImageScreenshot
  });
}

/**
 * Global assertion 처리 (맨 끝에 추가)
 */
/**
 * 스텝에 assertion 추가 처리
 * @param {number} stepIndex - assertion을 추가할 기반 스텝의 인덱스
 * @param {string} assertionType - assertion 타입 (verifyText, verifyElementPresent, verifyElementNotPresent, verifyTitle, verifyUrl)
 * @param {Object} stepEvent - 기반 스텝의 이벤트 데이터
 */
// 스텝 assertion 처리 (래퍼 함수)
function handleStepAssertion(stepIndex, assertionType, stepEvent) {
  // stateRefs를 getter/setter 패턴으로 변경하여 자동 동기화
  const stateRefs = {
    get allEvents() { return allEvents; },
    set allEvents(v) { allEvents = v; }
  };
  
  const verifyActionsContainer = document.getElementById('verify-actions');
  
  if (!assertionType || !stepEvent) return;
  
  // verifyTitle은 요소 선택 불필요
  if (assertionType === 'verifyTitle') {
    const result = addAssertionAfterStepModule(
      stepIndex,
      assertionType,
      null,
      null,
      null,
      stateRefs,
      inferSelectorType,
      syncTimelineFromEvents,
      updateCode,
      logMessage
    );
    if (result && verifyActionsContainer) {
      verifyActionsContainer.classList.add('hidden');
    }
    return;
  }
  
  // verifyUrl은 matchMode 선택 필요
  if (assertionType === 'verifyUrl') {
    const currentUrl = window.location.href || '';
    const inputValue = prompt('검증할 URL을 입력하세요:', currentUrl);
    if (inputValue === null) return; // 취소
    
    // matchMode 선택 (완전일치/포함)
    const matchMode = confirm('완전일치 검증을 사용하시겠습니까?\n\n확인: 완전일치\n취소: 포함 검증');
    const matchModeValue = matchMode ? 'exact' : 'contains';
    
    const result = addAssertionAfterStepModule(
      stepIndex,
      assertionType,
      null,
      inputValue || currentUrl,
      matchModeValue,
      stateRefs,
      inferSelectorType,
      syncTimelineFromEvents,
      updateCode,
      logMessage
    );
    if (result && verifyActionsContainer) {
      verifyActionsContainer.classList.add('hidden');
    }
    return;
  }
  
  // 요소 검증은 심플 요소 선택 사용
  // pendingAction으로 assertionType 전달하여 요소 선택 상태 메시지에 사용
  startSimpleElementSelectionWrapper((path, elementInfo, pendingAction, pendingStepIndex) => {
    if (!path || path.length === 0) {
      alert('요소를 선택할 수 없습니다.');
      return;
    }
    
    // pendingAction이 전달되면 사용, 없으면 assertionType 사용
    const actualAssertionType = pendingAction || assertionType;
    const actualStepIndex = pendingStepIndex !== null && pendingStepIndex !== undefined ? pendingStepIndex : stepIndex;
    
    let value = null;
    if (actualAssertionType === 'verifyText' || actualAssertionType === 'verifyTextContains') {
      // 요소의 텍스트를 자동으로 사용
      value = elementInfo?.text || path[0]?.textValue || '';
    }
    
    const result = addAssertionAfterStepModule(
      actualStepIndex,
      actualAssertionType,
      path,
      value,
      null,
      stateRefs,
      inferSelectorType,
      syncTimelineFromEvents,
      updateCode,
      logMessage
    );
    
    if (result && verifyActionsContainer) {
      verifyActionsContainer.classList.add('hidden');
    }
  }, assertionType, stepIndex);
}

// 원래 함수 정의는 recorder-conditional.js로 이동됨

/**
 * Assertion을 위한 요소 선택 모드 활성화 (래퍼 함수)
 */
function activateElementSelectionForAssertion(stepIndex, assertionType) {
  // stateRefs를 getter/setter 패턴으로 변경하여 자동 동기화
  const stateRefs = {
    get allEvents() { return allEvents; },
    set allEvents(v) { allEvents = v; }
  };
  
  const verifyActionsContainer = document.getElementById('verify-actions');
  
  // pendingAction으로 assertionType 전달하여 요소 선택 상태 메시지에 사용
  startSimpleElementSelectionWrapper((path, elementInfo, pendingAction, pendingStepIndex) => {
    if (!path || path.length === 0) {
      alert('요소를 선택할 수 없습니다.');
      return;
    }
    
    // pendingAction이 전달되면 사용, 없으면 assertionType 사용
    const actualAssertionType = pendingAction || assertionType;
    const actualStepIndex = pendingStepIndex !== null && pendingStepIndex !== undefined ? pendingStepIndex : stepIndex;
    
    const result = addAssertionAfterStepModule(
      actualStepIndex,
      actualAssertionType,
      path,
      null,
      null,
      stateRefs,
      inferSelectorType,
      syncTimelineFromEvents,
      updateCode,
      logMessage
    );
    
    if (result && verifyActionsContainer) {
      verifyActionsContainer.classList.add('hidden');
    }
  }, assertionType, stepIndex);
}

// 원래 함수 정의는 recorder-conditional.js로 이동됨

/**
 * 스텝 다음에 assertion 추가 (래퍼 함수)
 * @param {number} stepIndex - assertion을 추가할 스텝의 인덱스
 * @param {string} assertionType - assertion 타입
 * @param {Array} path - 요소 선택 경로 (있는 경우)
 * @param {string} value - 검증 값 (있는 경우)
 * @param {string} matchMode - 매칭 모드 (verifyUrl의 경우 'exact' | 'contains')
 */
function addAssertionAfterStep(stepIndex, assertionType, path, value, matchMode = null) {
  // stateRefs를 getter/setter 패턴으로 변경하여 자동 동기화
  const stateRefs = {
    get allEvents() { return allEvents; },
    set allEvents(v) { allEvents = v; }
  };
  
  return addAssertionAfterStepModule(
    stepIndex,
    assertionType,
    path,
    value,
    matchMode,
    stateRefs,
    inferSelectorType,
    syncTimelineFromEvents,
    updateCode,
    logMessage
  );
}

// 원래 함수 정의는 recorder-conditional.js로 이동됨

/**
 * 조건부 액션 추가 핸들러
 * @param {number} stepIndex - 조건부 액션을 추가할 스텝의 인덱스
 * @param {Object} stepEvent - 스텝 이벤트 정보
 */
function handleAddConditionalAction(stepIndex, stepEvent) {
  // 조건부 액션 단계별 워크플로우 시작
  startConditionalActionWorkflow(stepIndex, stepEvent);
}

/**
 * 조건부 액션 단계별 워크플로우 시작
 * @param {number} stepIndex - 조건부 액션을 추가할 스텝의 인덱스
 * @param {Object} stepEvent - 스텝 이벤트 정보
 */
// 조건부 액션 단계별 워크플로우 시작 (래퍼 함수)
function startConditionalActionWorkflow(stepIndex, stepEvent) {
  const stateRefs = {
    conditionalActionStep,
    conditionalActionData
  };
  
  startConditionalActionWorkflowModule(stepIndex, stepEvent, stateRefs, {
    updateConditionalActionStep
  });
  
  // stateRefs의 변경사항을 전역 변수에 반영
  conditionalActionStep = stateRefs.conditionalActionStep;
  conditionalActionData = stateRefs.conditionalActionData;
}

/**
 * 조건부 액션 단계별 UI 업데이트
 * @param {number} step - 현재 단계 번호
 */
// 조건부 액션 단계별 UI 업데이트 (래퍼 함수)
function updateConditionalActionStep(step) {
  const stateRefs = {
    conditionalActionStep,
    conditionalActionData
  };
  
  updateConditionalActionStepModule(step, stateRefs, {
    startSimpleElementSelection: startSimpleElementSelectionWrapper,
    validateBySelector: validateBySelectorWrapper,
    validateSiblingRelation: validateSiblingRelationWrapper,
    validateAncestorRelation: validateAncestorRelationWrapper
  });
  
  // stateRefs의 변경사항을 전역 변수에 반영
  conditionalActionStep = stateRefs.conditionalActionStep;
  conditionalActionData = stateRefs.conditionalActionData;
}

// 원래 함수 정의는 recorder-conditional-workflow.js로 이동됨

/**
 * 이전 단계로 이동 (래퍼 함수)
 * @param {number} step - 이동할 단계 번호
 */
function goToConditionalActionStep(step) {
  const stateRefs = {
    conditionalActionStep,
    conditionalActionData
  };
  
  goToConditionalActionStepModule(step, stateRefs, {
    updateConditionalActionStep
  });
  
  // stateRefs의 변경사항을 전역 변수에 반영
  conditionalActionStep = stateRefs.conditionalActionStep;
  conditionalActionData = stateRefs.conditionalActionData;
}

/**
 * 조건부 액션을 위한 요소 선택 활성화 (단계별 워크플로우용) (래퍼 함수)
 */
function activateElementSelectionForConditionalActionStep() {
  const stateRefs = {
    conditionalActionStep,
    conditionalActionData
  };
  
  activateElementSelectionForConditionalActionStepModule(stateRefs, {
    startSimpleElementSelection: startSimpleElementSelectionWrapper,
    updateConditionalActionStep
  });
  
  // stateRefs의 변경사항을 전역 변수에 반영
  conditionalActionStep = stateRefs.conditionalActionStep;
  conditionalActionData = stateRefs.conditionalActionData;
}

/**
 * 상대 노드 탐색을 위한 요소 선택 활성화 (단계별 워크플로우용) (래퍼 함수)
 * @param {string} type - 'base', 'child', 'sibling', 'ancestor'
 */
function activateElementSelectionForRelativeActionStep(type) {
  const stateRefs = {
    conditionalActionStep,
    conditionalActionData
  };
  
  activateElementSelectionForRelativeActionStepModule(type, stateRefs, {
    startSimpleElementSelection: startSimpleElementSelectionWrapper,
    validateBySelector: validateBySelectorWrapper,
    validateSiblingRelation: validateSiblingRelationWrapper,
    validateAncestorRelation: validateAncestorRelationWrapper,
    updateConditionalActionStep
  });
  
  // stateRefs의 변경사항을 전역 변수에 반영
  conditionalActionStep = stateRefs.conditionalActionStep;
  conditionalActionData = stateRefs.conditionalActionData;
}

/**
 * 조건부 액션 완료 및 추가 (래퍼 함수)
 */
function completeConditionalAction() {
  const stateRefs = {
    conditionalActionStep,
    conditionalActionData
  };
  
  completeConditionalActionModule(stateRefs, {
    addConditionalActionAfterStep
  });
  
  // stateRefs의 변경사항을 전역 변수에 반영
  conditionalActionStep = stateRefs.conditionalActionStep;
  conditionalActionData = stateRefs.conditionalActionData;
}

/**
 * 조건부 액션 추가 취소 (래퍼 함수)
 */
function cancelConditionalAction() {
  const stateRefs = {
    conditionalActionStep,
    conditionalActionData
  };
  
  cancelConditionalActionModule(stateRefs, {});
  
  // stateRefs의 변경사항을 전역 변수에 반영
  conditionalActionStep = stateRefs.conditionalActionStep;
  conditionalActionData = stateRefs.conditionalActionData;
}

// 원래 함수 정의는 recorder-conditional-workflow.js로 이동됨

// 원래 함수 정의는 recorder-conditional-workflow.js로 이동됨 (래퍼 함수는 위에 정의됨)

/**
 * 조건부 액션 다이얼로그 표시 (래퍼 함수)
 * @param {number} stepIndex - 스텝 인덱스 (-1이면 맨 끝에 추가)
 * @param {Object} stepEvent - 스텝 이벤트 정보
 */
function showConditionalActionDialog(stepIndex, stepEvent) {
  showConditionalActionDialogModule(stepIndex, stepEvent, {
    addConditionalActionAfterStep,
    startSimpleElementSelection: startSimpleElementSelectionWrapper,
    validateBySelector: validateBySelectorWrapper,
    validateSiblingRelation: validateSiblingRelationWrapper,
    validateAncestorRelation: validateAncestorRelationWrapper,
    updateConditionalActionUI: updateConditionalActionUIWrapper,
    updateCodePreview: updateCodePreviewWrapper
  });
}

// 원래 함수 정의는 recorder-conditional-dialog.js로 이동됨

// 원래 함수 정의는 recorder-conditional-dialog.js로 이동됨

/**
 * 조건부 액션 UI 업데이트 (래퍼 함수)
 */
function updateConditionalActionUI(actionType, dialog) {
  updateConditionalActionUIModule(actionType, dialog, {
    updateCodePreview: updateCodePreviewWrapper
  });
}

// 원래 함수 정의는 recorder-conditional-dialog.js로 이동됨

/**
 * 코드 미리보기 업데이트 (래퍼 함수)
 */
function updateCodePreview(dialog) {
  updateCodePreviewModule(dialog, {});
}

// 원래 함수 정의는 recorder-conditional-dialog.js로 이동됨

/**
 * 조건부 액션을 위한 요소 선택 활성화 (래퍼 함수)
 */
function activateElementSelectionForConditionalAction(stepIndex, dialog) {
  activateElementSelectionForConditionalActionModule(stepIndex, dialog, {
    startSimpleElementSelection: startSimpleElementSelectionWrapper,
    updateCodePreview: updateCodePreviewWrapper
  });
}

// 원래 함수 정의는 recorder-conditional-dialog.js로 이동됨

/**
 * 자식 요소 선택 활성화 (부모-자식 관계 검증 포함) (래퍼 함수)
 */
function activateChildElementSelection(stepIndex, dialog) {
  activateChildElementSelectionModule(stepIndex, dialog, {
    startSimpleElementSelection: startSimpleElementSelectionWrapper,
    validateBySelector: validateBySelectorWrapper,
    updateCodePreview: updateCodePreviewWrapper
  });
}

// 원래 함수 정의는 recorder-conditional-dialog.js로 이동됨

/**
 * 형제 요소 선택 활성화 (형제 관계 검증 포함) (래퍼 함수)
 */
function activateSiblingElementSelection(stepIndex, dialog) {
  activateSiblingElementSelectionModule(stepIndex, dialog, {
    startSimpleElementSelection: startSimpleElementSelectionWrapper,
    validateSiblingRelation: validateSiblingRelationWrapper,
    updateCodePreview: updateCodePreviewWrapper
  });
}

// 원래 함수 정의는 recorder-conditional-dialog.js로 이동됨

/**
 * 조상 요소 선택 활성화 (조상 관계 검증 포함) (래퍼 함수)
 */
function activateAncestorElementSelection(stepIndex, dialog) {
  activateAncestorElementSelectionModule(stepIndex, dialog, {
    startSimpleElementSelection: startSimpleElementSelectionWrapper,
    validateAncestorRelation: validateAncestorRelationWrapper,
    updateCodePreview: updateCodePreviewWrapper
  });
}

// 원래 함수 정의는 recorder-conditional-dialog.js로 이동됨

// 삭제된 함수들: 오래된 구현들은 모두 recorder-conditional-dialog.js로 이동됨

/**
 * 부모-자식 관계 검증 (래퍼 함수)
 */
function validateBySelectorWrapper(parentElement, childElement) {
  return validateBySelectorModule(parentElement, childElement);
}

/**
 * 형제 관계 검증 (래퍼 함수)
 */
function validateSiblingRelationWrapper(baseElement, siblingElement) {
  return validateSiblingRelationModule(baseElement, siblingElement);
}

/**
 * 조상 관계 검증 (래퍼 함수)
 */
function validateAncestorRelationWrapper(baseElement, ancestorElement) {
  return validateAncestorRelationModule(baseElement, ancestorElement);
}


/**
 * 조건부 액션 추가 (래퍼 함수)
 */
function addConditionalActionAfterStep(stepIndex, actionData) {
  // stateRefs를 getter/setter 패턴으로 변경하여 자동 동기화
  const stateRefs = {
    get allEvents() { return allEvents; },
    set allEvents(v) { allEvents = v; }
  };
  
  return addConditionalActionAfterStepModule(
    stepIndex,
    actionData,
    stateRefs,
    syncTimelineFromEvents,
    updateCode,
    normalizeEventRecord,
    saveEventAsStep,
    logMessage
  );
}


/**
 * Global assertion 처리 (맨 끝에 추가) (래퍼 함수)
 */
function handleGlobalAssertion(assertionType) {
  handleGlobalAssertionModule(assertionType, {
    addVerifyAction,
    addAssertionAfterStep,
    startSimpleElementSelection: startSimpleElementSelectionWrapper
  });
}

/**
 * Global wait 처리 (맨 끝에 추가) (래퍼 함수)
 */
function handleGlobalWait(waitType) {
  handleGlobalWaitModule(waitType, {
    addWaitAction,
    startSimpleElementSelection: startSimpleElementSelectionWrapper,
    normalizeEventRecord,
    allEvents,
    updateCode,
    syncTimelineFromEvents,
    saveEventAsStep,
    logMessage
  });
}

// IPC 이벤트 리스너 설정 (Electron 환경) (래퍼 함수)
function setupIpcListeners() {
  setupIpcListenersModule({
    electronAPI,
    tcIdInput,
    projectIdInput,
    recording,
    logMessage,
    handleDomEvent,
    startRecording,
    stopRecording,
    handleElementHover,
    clearElementHover,
    simpleSelectionState,
    elementStatusEl,
    handleSimpleElementSelectionPicked: handleSimpleElementSelectionPickedWrapper,
    handleElementSelectionPicked: handleElementSelectionPickedWrapper,
    cancelSimpleElementSelection: cancelSimpleElementSelectionWrapper,
    handleElementSelectionError: handleElementSelectionErrorWrapper,
    handleElementSelectionCancelled: handleElementSelectionCancelledWrapper
  });
}

// DOM 요소 초기화 (래퍼 함수)
function initDOMElements() {
  const domRefs = {};
  initDOMElementsModule(domRefs);
  // domRefs의 값을 전역 변수에 할당
  startBtn = domRefs.startBtn;
  stopBtn = domRefs.stopBtn;
  timeline = domRefs.timeline;
  selectorList = domRefs.selectorList;
  iframeBanner = domRefs.iframeBanner;
  codeOutput = domRefs.codeOutput;
  logEntries = domRefs.logEntries;
  resetBtn = domRefs.resetBtn;
  elementSelectBtn = domRefs.elementSelectBtn;
  deleteEventBtn = domRefs.deleteEventBtn;
  tcIdInput = domRefs.tcIdInput;
  projectIdInput = domRefs.projectIdInput;
  sendRecordingBtn = domRefs.sendRecordingBtn;
  frameworkSelect = domRefs.frameworkSelect;
  languageSelect = domRefs.languageSelect;
  aiReviewBtn = domRefs.aiReviewBtn;
  aiReviewStatusEl = domRefs.aiReviewStatusEl;
  syncToTcBtn = domRefs.syncToTcBtn;
  aiEndpointInput = domRefs.aiEndpointInput;
  aiApiKeyInput = domRefs.aiApiKeyInput;
  aiModelInput = domRefs.aiModelInput;
  aiSettingsSaveBtn = domRefs.aiSettingsSaveBtn;
  aiSettingsStatusEl = domRefs.aiSettingsStatusEl;
  elementPanel = domRefs.elementPanel;
  elementStatusEl = domRefs.elementStatusEl;
  elementPathContainer = domRefs.elementPathContainer;
  elementPathItems = domRefs.elementPathItems;
  elementCandidatesContainer = domRefs.elementCandidatesContainer;
  elementActionsContainer = domRefs.elementActionsContainer;
  elementCancelBtn = domRefs.elementCancelBtn;
  elementAttrPanel = domRefs.elementAttrPanel;
  elementAttrNameInput = domRefs.elementAttrNameInput;
  elementAttrApplyBtn = domRefs.elementAttrApplyBtn;
  elementCodePreview = domRefs.elementCodePreview;
  elementCodeEl = domRefs.elementCodeEl;
}

// 초기화
function init() {
  console.log('[Recorder] 초기화 시작');
  
  // electronAPI 재초기화 (iframe 환경 대응)
  initElectronAPI();
  
  console.log('[Recorder] electronAPI 상태:', {
    exists: !!electronAPI,
    hasOnIpcMessage: !!(electronAPI && electronAPI.onIpcMessage),
    type: typeof electronAPI,
    isIframe: window.parent !== window
  });
  
  // DOM 요소 초기화
  initDOMElements();
  
  // CodeMirror 초기화
  if (typeof CodeMirror !== 'undefined') {
    initCodeEditor();
  } else {
    // CodeMirror가 아직 로드되지 않은 경우 대기
    setTimeout(initCodeEditor, 100);
  }

  // 이벤트 리스너 설정
  setupEventListeners();
  
  // IPC 리스너 설정 (Electron 환경) - 가장 먼저 설정
  setupIpcListeners();
  
  // PostMessage 리스너 설정 (iframe 환경)
  setupPostMessageListeners();

  // WebSocket 연결 제거 - startRecording()이 호출될 때만 연결
  // connectWebSocket();

  // AI 설정 초기화
  setupAiSettings();

  // Recorder 설정 로드
  loadRecorderSettings();

  // 초기 상태 설정
  updateDeleteButtonState();
  
  logMessage('녹화 모듈 준비 완료', 'success');
  console.log('[Recorder] 초기화 완료');
}

// PostMessage 이벤트 리스너 설정 (래퍼 함수)
// init 함수에서 호출됨
function setupPostMessageListeners() {
  setupPostMessageListenersModule({
    tcIdInput,
    projectIdInput,
    recording,
    logMessage,
    handleDomEvent,
    startRecording,
    stopRecording,
    handleElementHover,
    clearElementHover,
    simpleSelectionState,
    elementStatusEl,
    handleSimpleElementSelectionPicked: handleSimpleElementSelectionPickedWrapper,
    handleElementSelectionPicked: handleElementSelectionPickedWrapper,
    cancelSimpleElementSelection: cancelSimpleElementSelectionWrapper,
    handleElementSelectionError: handleElementSelectionErrorWrapper,
    handleElementSelectionCancelled: handleElementSelectionCancelledWrapper,
    wsConnection,
    trySaveDomSnapshot
  });
}

/**
 * 패널 리사이즈 초기화 (래퍼 함수)
 */
function initPanelResize() {
  initPanelResizeModule((panelId, height) => {
    savePanelHeight(panelId, height);
  });
}

/**
 * Recorder 설정 로드 (래퍼 함수)
 */
async function loadRecorderSettings() {
  await loadRecorderSettingsModule(electronAPI);
}

/**
 * 패널 높이 저장 (래퍼 함수)
 */
async function savePanelHeight(panelId, height) {
  await savePanelHeightModule(panelId, height, electronAPI);
}

// DOMContentLoaded 이벤트 대기
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

