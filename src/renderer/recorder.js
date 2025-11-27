/**
 * TestArchitect 녹화 모듈
 * record/popup.js의 핵심 로직을 Electron 환경에 맞게 이식
 */

import { generateCode } from './utils/codeGenerator.js';
import { getAiSelectorSuggestions, getAiCodeReview } from './utils/aiService.js';
import { getSelectorCandidatesWithUniqueness } from './utils/selectorUtils.js';

// Electron IPC 통신 (Electron 환경에서만 사용)
// contextIsolation: true이므로 window.electronAPI를 통해 접근
let electronAPI = null;
if (typeof window !== 'undefined' && window.electronAPI) {
  electronAPI = window.electronAPI;
  console.log('[Recorder] electronAPI 로드 성공');
} else {
  console.warn('[Recorder] electronAPI가 없습니다. Electron 환경이 아닐 수 있습니다.');
}

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
let wsConnection = null;
let manualActions = [];
let manualActionSerial = 1;

// 리플레이 상태 관리 (popup.js 이식)
let replayState = {
  running: false,
  events: [],
  index: 0,
  sessionId: null, // Electron 환경에서는 sessionId 사용
  pending: false,
  awaitingNavigation: false,
  awaitingContent: false,
  navigationGuard: null,
  scheduledTimer: null
};

// 리플레이 상수
const STEP_DELAY_MS = 150;
const NAVIGATION_RECOVERY_DELAY_MS = 800;
const DOM_COMPLETE_DELAY_MS = 250;
const MAX_NAVIGATION_WAIT_MS = 15000;

// 셀렉터 탭 상태 관리 (popup.js의 selectorTabState 이식)
const selectorTabState = {
  active: 'unique', // 'unique' | 'repeat'
  grouped: null,
  contentEl: null,
  buttons: null,
  event: null,
  resolvedIndex: -1
};

// AI 상태 관리 (popup.js 이식)
const aiSuggestionState = new Map();
const aiSettingsDefaults = { endpoint: '', apiKey: '', model: '' };
let aiSettings = { ...aiSettingsDefaults };
let aiSettingsLoaded = false;
let aiSettingsDirty = false;
const aiCodeReviewState = {
  status: 'idle',
  updatedAt: null,
  summary: '',
  changes: []
};

// 요소 선택 워크플로우 상태 관리 (popup.js 이식)
const selectionState = {
  active: false,
  stage: 'idle', // idle | await-root | await-candidate | await-action | await-child
  stack: [],
  pendingAction: null,
  pendingAttribute: '',
  codePreview: ''
};

// WebSocket 연결
function connectWebSocket() {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    return;
  }

  const wsUrl = 'ws://localhost:3000';
  console.log('[Recorder] WebSocket 연결 시도:', wsUrl);

  try {
    wsConnection = new WebSocket(wsUrl);

    wsConnection.onopen = () => {
      console.log('[Recorder] WebSocket 연결 성공');
      logMessage('WebSocket 연결 성공', 'success');
    };

    wsConnection.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error('[Recorder] WebSocket 메시지 파싱 오류:', error);
      }
    };

    wsConnection.onerror = (error) => {
      console.error('[Recorder] WebSocket 오류:', error);
      logMessage('WebSocket 연결 오류', 'error');
    };

    wsConnection.onclose = () => {
      console.log('[Recorder] WebSocket 연결 종료');
      wsConnection = null;
      // 자동 재연결 시도
      setTimeout(connectWebSocket, 2000);
    };
  } catch (error) {
    console.error('[Recorder] WebSocket 연결 실패:', error);
  }
}

// WebSocket 메시지 처리
function handleWebSocketMessage(message) {
  switch (message.type) {
    case 'connected':
      console.log('[Recorder] 서버 연결 확인:', message.message);
      break;

    case 'dom-event':
      // Content Script에서 전송된 DOM 이벤트
      console.log('[Recorder] DOM 이벤트 수신:', message.event?.action || message.action);
      // message.event가 있으면 사용, 없으면 message 자체가 event일 수 있음
      const eventData = message.event || message;
      handleDomEvent(eventData);
      break;

    case 'element-hover':
      // 요소 하이라이트 정보
      handleElementHover(message);
      break;

    case 'element-hover-clear':
      // 요소 하이라이트 해제
      clearElementHover();
      break;

    case 'recording-start':
      if (!recording) {
        startRecording();
      }
      break;

    case 'recording-stop':
      if (recording) {
        stopRecording();
      }
      break;

    case 'replay-step-result':
      // 리플레이 스텝 결과 처리
      handleReplayStepResult(message);
      break;

    default:
      console.log('[Recorder] 알 수 없는 메시지 타입:', message.type);
  }
}

// DOM 이벤트 처리
function handleDomEvent(event) {
  if (!recording) return;

  const normalizedEvent = normalizeEventRecord(event);
  
  // CDP에서 이미 생성된 셀렉터 후보 사용 (selectorUtils.js로 생성됨)
  // selectorCandidates가 없으면 빈 배열로 처리
  if (!normalizedEvent.selectorCandidates) {
    normalizedEvent.selectorCandidates = [];
  }
  if (!normalizedEvent.selectors && normalizedEvent.selectorCandidates.length > 0) {
    normalizedEvent.selectors = normalizedEvent.selectorCandidates.map(c => c.selector || c);
  }
  
  allEvents.push(normalizedEvent);
  const index = allEvents.length - 1;
  
  // Timeline에 아이템 추가
  appendTimelineItem(normalizedEvent, index);
  
  // 자동으로 마지막 이벤트 선택
  currentEventIndex = index;
  document.querySelectorAll('.timeline-item').forEach(item => item.classList.remove('selected'));
  const lastItem = timeline?.querySelector(`[data-event-index="${index}"]`);
  if (lastItem) {
    lastItem.classList.add('selected');
  }
  
  // 셀렉터 표시
  showSelectors(normalizedEvent.selectorCandidates || [], normalizedEvent, index);
  showIframe(normalizedEvent.iframeContext);
  
  // 코드 업데이트
  updateCode();
  
  // 삭제 버튼 상태 업데이트
  updateDeleteButtonState();
  
  logMessage(`이벤트 캡처: ${normalizedEvent.action || 'unknown'}`, 'info');
  
  // 실시간으로 TC step으로 저장
  saveEventAsStep(normalizedEvent);
}

/**
 * 이벤트를 TC step으로 실시간 저장
 */
async function saveEventAsStep(event) {
  // TC ID와 Project ID 확인
  const tcId = tcIdInput?.value;
  const projectId = projectIdInput?.value;
  
  if (!tcId || !projectId) {
    // TC ID나 Project ID가 없으면 저장하지 않음 (조용히 무시)
    return;
  }
  
  if (!electronAPI) {
    console.warn('[Recorder] electronAPI가 없어 실시간 저장을 건너뜁니다.');
    return;
  }
  
  try {
    // Main 프로세스에 이벤트 전송하여 step으로 변환 및 저장
    const result = await electronAPI.invoke('save-event-step', {
      tcId: parseInt(tcId, 10),
      projectId: parseInt(projectId, 10),
      event: event
    });
    
    if (result && result.success) {
      console.log('[Recorder] ✅ 이벤트가 TC step으로 저장되었습니다:', result.stepIndex);
    } else {
      console.warn('[Recorder] ⚠️ 이벤트 저장 실패:', result?.error || '알 수 없는 오류');
    }
  } catch (error) {
    console.error('[Recorder] ❌ 이벤트 저장 중 오류:', error);
  }
}

// 이벤트 레코드 정규화
function normalizeEventRecord(event) {
  if (!event || typeof event !== 'object') return event;
  if (!event.version) {
    event.version = 2;
  }
  if (!event.metadata) {
    event.metadata = { schemaVersion: event.version };
  }
  if (event.page === undefined) {
    event.page = null;
  }
  if (event.frame === undefined && event.iframeContext) {
    event.frame = { iframeContext: event.iframeContext };
  }
  return event;
}

// Timeline 셀렉터 해석
function resolveTimelineSelector(event) {
  if (!event) return '';
  const cleanedPrimary = normalizeTimelineSelectorValue(event.primarySelector);
  if (cleanedPrimary) return cleanedPrimary;
  if (Array.isArray(event.selectorCandidates)) {
    const candidate = event.selectorCandidates.find((c) => normalizeTimelineSelectorValue(c && c.selector));
    if (candidate && normalizeTimelineSelectorValue(candidate.selector)) {
      return normalizeTimelineSelectorValue(candidate.selector);
    }
  }
  const xpathValue = normalizeTimelineSelectorValue(event.primarySelectorXPath);
  if (xpathValue) return xpathValue;
  const textValue = normalizeTimelineSelectorValue(event.primarySelectorText);
  if (textValue) return textValue;
  const rawSelector = normalizeTimelineSelectorValue(event.selector);
  if (rawSelector) return rawSelector;
  if (event.tag && typeof event.tag === 'string') {
    return event.tag.toLowerCase();
  }
  return '';
}

function normalizeTimelineSelectorValue(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length === 0) return '';
  if (/셀렉터$/i.test(trimmed)) return '';
  return trimmed;
}

/**
 * 셀렉터 타입 레이블 포맷팅
 * popup.js의 formatSelectorTypeLabel 이식
 */
function formatSelectorTypeLabel(type) {
  if (!type) return '선택된 셀렉터';
  const lowered = type.toLowerCase();
  switch (lowered) {
    case 'css':
      return 'CSS 셀렉터';
    case 'text':
      return '텍스트 셀렉터';
    case 'xpath':
      return 'XPath 셀렉터';
    case 'xpath-full':
      return '절대 XPath 셀렉터';
    case 'id':
      return 'ID 셀렉터';
    case 'class':
      return '클래스 셀렉터';
    case 'class-tag':
      return '태그+클래스 셀렉터';
    case 'tag':
      return '태그 셀렉터';
    case 'data-testid':
    case 'data-test':
    case 'data-qa':
    case 'data-cy':
    case 'data-id':
      return `${lowered.toUpperCase()} 셀렉터`;
    default:
      return `${lowered.toUpperCase()} 셀렉터`;
  }
}

/**
 * 삭제 버튼 상태 업데이트
 * popup.js의 updateDeleteButtonState 이식
 */
function updateDeleteButtonState() {
  if (!deleteEventBtn) return;
  const hasSelection = currentEventIndex >= 0 && currentEventIndex < allEvents.length;
  deleteEventBtn.disabled = !hasSelection;
}

/**
 * 코드 텍스트 가져오기
 * popup.js의 getCodeText 이식
 */
function getCodeText() {
  if (codeEditor) {
    return codeEditor.getValue();
  }
  return codeOutput ? codeOutput.value || '' : '';
}

/**
 * 코드 텍스트 설정
 * popup.js의 setCodeText 이식
 */
function setCodeText(text) {
  const next = text || '';
  if (codeEditor && codeEditor.getValue() !== next) {
    const cursor = codeEditor.getCursor();
    codeEditor.setValue(next);
    if (cursor) {
      const totalLines = Math.max(codeEditor.lineCount() - 1, 0);
      codeEditor.setCursor({ line: Math.min(cursor.line, totalLines), ch: cursor.ch });
    }
  }
  if (codeOutput && codeOutput.value !== next) {
    codeOutput.value = next;
  }
}

/**
 * CodeMirror 모드 가져오기
 * popup.js의 getCodeMirrorMode 이식
 */
function getCodeMirrorMode(language) {
  const lang = language || selectedLanguage || 'javascript';
  if (lang === 'python' || lang === 'python-class') {
    return 'text/x-python';
  }
  if (lang === 'typescript') {
    return 'text/typescript';
  }
  return 'text/javascript';
}

/**
 * 코드 에디터 모드 새로고침
 * popup.js의 refreshCodeEditorMode 이식
 */
function refreshCodeEditorMode() {
  if (codeEditor) {
    codeEditor.setOption('mode', getCodeMirrorMode(selectedLanguage));
  }
}

// Timeline 아이템 추가 (popup.js의 appendTimelineItem 기반)
function appendTimelineItem(ev, index) {
  if (!timeline) return;
  
  const div = document.createElement('div');
  div.className = 'timeline-item';
  div.dataset.eventIndex = index;
  
  const timestamp = ev.timestamp ? new Date(ev.timestamp) : null;
  const timeLabel = timestamp
    ? `${String(timestamp.getHours()).padStart(2, '0')}:${String(timestamp.getMinutes()).padStart(2, '0')}:${String(timestamp.getSeconds()).padStart(2, '0')}`
    : '--:--:--';
  const actionLabel = ev.action || 'event';
  const usedSelector = resolveTimelineSelector(ev);
  
  const row = document.createElement('div');
  row.className = 'timeline-row';
  const timeSpan = document.createElement('span');
  timeSpan.className = 'time';
  timeSpan.textContent = timeLabel;
  const eventSpan = document.createElement('span');
  eventSpan.className = 'event';
  eventSpan.textContent = actionLabel;
  row.appendChild(timeSpan);
  row.appendChild(eventSpan);

  const selectorLine = document.createElement('div');
  selectorLine.className = 'selector-line';
  const selectorValue = document.createElement('span');
  selectorValue.className = 'value';
  selectorValue.textContent = usedSelector || '';
  selectorLine.appendChild(selectorValue);

  div.appendChild(row);
  div.appendChild(selectorLine);
  div.style.cursor = 'pointer';
  
  div.addEventListener('click', () => {
    // 이전 선택 해제
    document.querySelectorAll('.timeline-item').forEach(item => item.classList.remove('selected'));
    // 현재 선택
    div.classList.add('selected');
    currentEventIndex = index;
    // 해당 이벤트의 셀렉터 표시
    showSelectors(ev.selectorCandidates || [], ev, index);
    showIframe(ev.iframeContext);
    updateDeleteButtonState();
  });
  
  timeline.appendChild(div);
}

/**
 * 타임라인을 이벤트 목록과 동기화
 * popup.js의 syncTimelineFromEvents 이식 (개선)
 */
function syncTimelineFromEvents(events, options = {}) {
  const {
    preserveSelection = false,
    selectLast = false,
    resetAiState = false
  } = options;
  const previousIndex = preserveSelection ? currentEventIndex : -1;
  const normalizedEvents = Array.isArray(events)
    ? events.map((ev) => normalizeEventRecord(ev))
    : [];

  // AI 상태 관리 (간소화 버전 - 나중에 AI 기능 완성 시 확장)
  // const nextAiState = new Map();
  // ... AI 상태 관리 로직은 5단계에서 구현

  allEvents = normalizedEvents;
  if (timeline) {
    timeline.innerHTML = '';
    normalizedEvents.forEach((event, index) => {
      appendTimelineItem(event, index);
    });
    const items = timeline.querySelectorAll('.timeline-item');
    items.forEach((item) => item.classList.remove('selected'));
  }

  let indexToSelect = -1;
  if (preserveSelection && previousIndex >= 0 && previousIndex < normalizedEvents.length) {
    indexToSelect = previousIndex;
  } else if (selectLast && normalizedEvents.length > 0) {
    indexToSelect = normalizedEvents.length - 1;
  }

  if (indexToSelect >= 0) {
    currentEventIndex = indexToSelect;
    const selectedItem = timeline
      ? timeline.querySelector(`[data-event-index="${indexToSelect}"]`)
      : null;
    if (selectedItem) {
      selectedItem.classList.add('selected');
    }
    const selectedEvent = normalizedEvents[indexToSelect];
    showSelectors(selectedEvent.selectorCandidates || [], selectedEvent, indexToSelect);
    showIframe(selectedEvent.iframeContext);
  } else {
    currentEventIndex = -1;
    if (selectorList) {
      selectorList.innerHTML = '';
    }
    showIframe(null);
  }

  updateDeleteButtonState();
  return normalizedEvents;
}

/**
 * Timeline 업데이트 (기존 함수 - 호환성 유지)
 */
function updateTimeline() {
  syncTimelineFromEvents(allEvents, { preserveSelection: true });
}

/**
 * 셀렉터 타입 추론 (내부 사용)
 */
function inferSelectorType(selector) {
  if (!selector || typeof selector !== 'string') return null;
  const trimmed = selector.trim();
  if (trimmed.startsWith('xpath=')) return 'xpath';
  if (trimmed.startsWith('//') || trimmed.startsWith('(')) return 'xpath';
  if (trimmed.startsWith('text=')) return 'text';
  if (trimmed.startsWith('#') || trimmed.startsWith('.') || trimmed.startsWith('[')) return 'css';
  return 'css';
}

/**
 * 셀렉터 탭 그룹 생성
 * popup.js의 buildSelectorTabGroups 이식
 */
function buildSelectorTabGroups(event, baseCandidates, aiCandidates) {
  const safeBase = Array.isArray(baseCandidates) ? baseCandidates : [];
  const safeAi = Array.isArray(aiCandidates) ? aiCandidates : [];
  const uniqueBaseList = [];
  const uniqueAiList = [];

  const createGroup = (listRef) => ({
    listRef,
    indices: []
  });

  const groups = {
    unique: {
      base: createGroup(uniqueBaseList),
      ai: createGroup(uniqueAiList)
    },
    repeat: {
      base: createGroup(safeBase),
      ai: createGroup(safeAi)
    }
  };

  const addIndex = (group, source, index) => {
    const arr = group[source].indices;
    if (!arr.includes(index)) {
      arr.push(index);
    }
  };

  const registerUnique = (source, candidate, originalIndex) => {
    if (!candidate || !candidate.selector) return;
    const targetList = source === 'ai' ? uniqueAiList : uniqueBaseList;
    const stored = { ...candidate, __sourceIndex: originalIndex };
    const newIndex = targetList.push(stored) - 1;
    addIndex(groups.unique, source, newIndex);
  };

  const assign = (listRef, source) => {
    if (!Array.isArray(listRef)) return;
    listRef.forEach((candidate, index) => {
      if (!candidate || !candidate.selector) return;
      const finalMatchCount = typeof candidate.matchCount === 'number' ? candidate.matchCount : null;
      const isAlreadyUnique = candidate.unique === true || finalMatchCount === 1;

      if (isAlreadyUnique) {
        registerUnique(source, candidate, index);
      }

      addIndex(groups.repeat, source, index);
    });
  };

  assign(safeBase, 'base');
  assign(safeAi, 'ai');

  return groups;
}

/**
 * 그룹 카운트 가져오기
 * popup.js의 getGroupCount 이식
 */
function getGroupCount(group) {
  if (!group) return 0;
  const baseCount = Array.isArray(group.base?.indices) ? group.base.indices.length : 0;
  const aiCount = Array.isArray(group.ai?.indices) ? group.ai.indices.length : 0;
  return baseCount + aiCount;
}

/**
 * 셀렉터 표시 (popup.js의 showSelectors 개선)
 */
function showSelectors(list, event, eventIndex) {
  if (!selectorList) return;
  selectorList.innerHTML = '';

  const hasEventContext = !!event;
  const resolvedIndex = hasEventContext
    ? (eventIndex !== undefined && eventIndex !== null ? eventIndex : allEvents.indexOf(event))
    : -1;

  // AI 요청 컨트롤 렌더링
  renderAiRequestControls(event, resolvedIndex);

  if (!hasEventContext) {
    selectorTabState.grouped = null;
    selectorTabState.contentEl = null;
    selectorTabState.buttons = null;
    const baseCandidates = Array.isArray(list) ? list : [];
    if (!Array.isArray(baseCandidates) || baseCandidates.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'selector-empty';
      emptyMessage.textContent = '셀렉터 후보가 없습니다.';
      selectorList.appendChild(emptyMessage);
      return;
    }
    renderSelectorGroup(baseCandidates, {
      source: 'base',
      event: null,
      resolvedIndex,
      listRef: baseCandidates,
      container: selectorList
    });
    return;
  }

  // AI 상태 확인
  const aiState = getAiState(event);
  const aiCandidates = Array.isArray(event.aiSelectorCandidates) ? event.aiSelectorCandidates : [];
  
  if (aiState.status === 'loading') {
    appendAiMessage('AI가 추천 셀렉터를 분석하는 중입니다...', 'loading');
  } else if (aiState.status === 'error') {
    appendAiMessage(aiState.error || 'AI 추천을 불러오지 못했습니다.', 'error');
  }

  const baseCandidates = Array.isArray(event.selectorCandidates) ? event.selectorCandidates : [];
  const grouped = buildSelectorTabGroups(event, baseCandidates, aiCandidates);
  selectorTabState.grouped = grouped;
  selectorTabState.event = event;
  selectorTabState.resolvedIndex = resolvedIndex;

  const uniqueCount = getGroupCount(grouped.unique);
  const repeatCount = getGroupCount(grouped.repeat);

  let desiredActive = selectorTabState.active;
  if (desiredActive !== 'unique' && desiredActive !== 'repeat') {
    desiredActive = 'unique';
  }
  if (desiredActive === 'unique' && uniqueCount === 0 && repeatCount > 0) {
    desiredActive = 'repeat';
  } else if (desiredActive === 'repeat' && repeatCount === 0 && uniqueCount > 0) {
    desiredActive = 'unique';
  }
  selectorTabState.active = desiredActive;

  const tabsHeader = document.createElement('div');
  tabsHeader.className = 'selector-tab-header';

  const uniqueBtn = document.createElement('button');
  uniqueBtn.type = 'button';
  uniqueBtn.className = 'selector-tab-button';
  tabsHeader.appendChild(uniqueBtn);

  const repeatBtn = document.createElement('button');
  repeatBtn.type = 'button';
  repeatBtn.className = 'selector-tab-button';
  tabsHeader.appendChild(repeatBtn);

  selectorList.appendChild(tabsHeader);

  const tabContent = document.createElement('div');
  tabContent.className = 'selector-tab-content';
  selectorList.appendChild(tabContent);

  selectorTabState.contentEl = tabContent;
  selectorTabState.buttons = { unique: uniqueBtn, repeat: repeatBtn };

  uniqueBtn.addEventListener('click', () => {
    if (getGroupCount(selectorTabState.grouped?.unique) === 0) return;
    if (selectorTabState.active !== 'unique') {
      selectorTabState.active = 'unique';
      updateSelectorTabUI();
    }
  });

  repeatBtn.addEventListener('click', () => {
    if (getGroupCount(selectorTabState.grouped?.repeat) === 0) return;
    if (selectorTabState.active !== 'repeat') {
      selectorTabState.active = 'repeat';
      updateSelectorTabUI();
    }
  });

  updateSelectorTabUI();

  if (uniqueCount === 0 && repeatCount === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'selector-empty';
    emptyMessage.textContent = '셀렉터 후보가 없습니다.';
    tabContent.appendChild(emptyMessage);
  }
}

/**
 * 셀렉터 아이템 렌더링 (간단한 버전 - 호환성 유지)
 */
function renderSelectorItems(candidates, container) {
  const targetContainer = container || selectorList;
  if (!targetContainer) return;
  
  candidates.slice(0, 10).forEach((candidate, index) => {
    const item = document.createElement('div');
    item.className = 'selector-item';
    if (index === 0) {
      item.classList.add('primary');
    }
    
    const main = document.createElement('div');
    main.className = 'selector-main';
    
    const type = document.createElement('span');
    type.className = 'type';
    type.textContent = candidate.type || 'css';
    
    const sel = document.createElement('span');
    sel.className = 'sel';
    sel.textContent = candidate.selector || '';
    
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = candidate.score || 0;
    
    main.appendChild(type);
    main.appendChild(sel);
    main.appendChild(score);
    item.appendChild(main);
    
    if (candidate.reason) {
      const reason = document.createElement('div');
      reason.className = 'reason';
      reason.textContent = candidate.reason;
      item.appendChild(reason);
    }
    
    targetContainer.appendChild(item);
  });
}

/**
 * 셀렉터 그룹 렌더링
 * popup.js의 renderSelectorGroup 이식 (간소화)
 */
function renderSelectorGroup(candidates, options = {}) {
  const {
    source = 'base',
    event = null,
    resolvedIndex = -1,
    listRef = Array.isArray(candidates) ? candidates : [],
    container = selectorList,
    allowNonUnique = false,
    mode = 'default'
  } = options;

  const iterateIndices = Array.isArray(listRef)
    ? listRef.map((_, idx) => idx)
    : Array.isArray(candidates)
      ? candidates.map((_, idx) => idx)
      : [];

  if (!container || !Array.isArray(iterateIndices) || iterateIndices.length === 0) return;

  iterateIndices.forEach((listIndex) => {
    const candidateRef = Array.isArray(listRef) && listRef[listIndex]
      ? listRef[listIndex]
      : (Array.isArray(candidates) ? candidates[listIndex] : null);
    if (!candidateRef || !candidateRef.selector) return;
    
    const effectiveCandidate = candidateRef;
    const selectorType = effectiveCandidate.type || inferSelectorType(effectiveCandidate.selector);
    const matchCount = typeof effectiveCandidate.matchCount === 'number' ? effectiveCandidate.matchCount : null;
    const isTextSelector = selectorType === 'text';
    
    if (!allowNonUnique && !isTextSelector) {
      if (matchCount !== null && matchCount !== 1) {
        return;
      }
      if (effectiveCandidate.unique === false) {
        return;
      }
    }
    
    const item = document.createElement('div');
    item.className = 'selector-item';
    
    const isApplied =
      !!event &&
      event.primarySelector === effectiveCandidate.selector &&
      (event.primarySelectorType ? event.primarySelectorType === selectorType : true);
    
    const scoreLabel = typeof effectiveCandidate.score === 'number'
      ? `${effectiveCandidate.score}%`
      : '';
    const typeLabel = (selectorType || 'css').toUpperCase();
    
    item.innerHTML = `
      <div class="selector-main">
        <span class="type">${typeLabel}</span>
        <span class="sel">${effectiveCandidate.selector}</span>
        <span class="score">${scoreLabel}</span>
      </div>
      <div class="selector-actions">
        <button class="apply-btn" ${isApplied ? 'style="background: #4CAF50; color: white;"' : ''}>${isApplied ? '✓ 적용됨' : 'Apply'}</button>
        <button class="highlight-btn">Highlight</button>
      </div>
      <div class="reason">${effectiveCandidate.reason || ''}</div>`;

    const applyBtn = item.querySelector('.apply-btn');
    const highlightBtn = item.querySelector('.highlight-btn');
    
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        applySelector({ ...effectiveCandidate }, resolvedIndex, source, listIndex);
      });
    }
    
    if (highlightBtn) {
      highlightBtn.addEventListener('click', () => {
        highlightSelector(effectiveCandidate);
      });
    }

    container.appendChild(item);
  });
}

/**
 * 셀렉터 탭 UI 업데이트
 * popup.js의 updateSelectorTabUI 이식
 */
function updateSelectorTabUI() {
  const {
    grouped,
    active,
    contentEl,
    buttons,
    event,
    resolvedIndex
  } = selectorTabState;
  
  if (!grouped || !contentEl) return;

  const uniqueCount = getGroupCount(grouped.unique);
  const repeatCount = getGroupCount(grouped.repeat);

  if (buttons && buttons.unique) {
    buttons.unique.textContent = `유일 후보 (${uniqueCount})`;
    buttons.unique.classList.toggle('active', active === 'unique');
    buttons.unique.disabled = uniqueCount === 0;
  }
  
  if (buttons && buttons.repeat) {
    buttons.repeat.textContent = `반복 구조 후보 (${repeatCount})`;
    buttons.repeat.classList.toggle('active', active === 'repeat');
    buttons.repeat.disabled = repeatCount === 0;
  }

  contentEl.innerHTML = '';
  const currentGroup = grouped[active];
  
  if (!currentGroup) {
    const empty = document.createElement('div');
    empty.className = 'selector-empty';
    empty.textContent = '셀렉터 후보가 없습니다.';
    contentEl.appendChild(empty);
    return;
  }

  const allowNonUnique = active === 'repeat';
  const mode = allowNonUnique ? 'repeat' : 'default';

  if (active === 'repeat') {
    const info = document.createElement('div');
    info.className = 'selector-repeat-info';
    info.textContent = '반복 구조 후보는 선택 시 위치 기반 :nth-of-type()이 자동 적용됩니다.';
    contentEl.appendChild(info);
  }

  // Base 셀렉터 렌더링
  if (currentGroup.base && Array.isArray(currentGroup.base.indices) && currentGroup.base.indices.length > 0) {
    renderSelectorGroup(currentGroup.base.listRef, {
      source: 'base',
      event,
      resolvedIndex,
      listRef: currentGroup.base.listRef,
      container: contentEl,
      allowNonUnique,
      mode,
      indices: currentGroup.base.indices
    });
  }

  // AI 셀렉터 렌더링
  if (currentGroup.ai && Array.isArray(currentGroup.ai.indices) && currentGroup.ai.indices.length > 0) {
    renderSelectorGroup(currentGroup.ai.listRef, {
      source: 'ai',
      event,
      resolvedIndex,
      listRef: currentGroup.ai.listRef,
      container: contentEl,
      allowNonUnique,
      mode,
      indices: currentGroup.ai.indices
    });
  }
}

/**
 * 셀렉터 적용
 * popup.js의 applySelector 이식 (간소화)
 */
function applySelector(s, eventIndex, source = 'base', listIndex = -1) {
  const targetIndex = eventIndex !== undefined && eventIndex !== null ? eventIndex : currentEventIndex;
  if (targetIndex < 0) {
    alert('먼저 타임라인에서 이벤트를 선택하세요.');
    return;
  }
  
  if (targetIndex >= 0 && targetIndex < allEvents.length) {
    const targetEvent = allEvents[targetIndex];
    const candidateToApply = { ...s };
    const selectorType = candidateToApply.type || inferSelectorType(candidateToApply.selector);

    // 셀렉터 후보 업데이트
    if (source === 'ai') {
      if (!Array.isArray(targetEvent.aiSelectorCandidates)) {
        targetEvent.aiSelectorCandidates = [];
      }
      // mergeCandidateIntoCollection은 나중에 구현
    } else if (Array.isArray(targetEvent.selectorCandidates)) {
      // mergeCandidateIntoCollection은 나중에 구현
    }

    // Primary 셀렉터 설정
    targetEvent.primarySelector = candidateToApply.selector;
    targetEvent.primarySelectorType = selectorType;
    
    if (selectorType === 'text') {
      targetEvent.primarySelectorMatchMode = candidateToApply.matchMode || 'exact';
      if (candidateToApply.textValue) {
        targetEvent.primarySelectorText = candidateToApply.textValue;
      }
    } else {
      delete targetEvent.primarySelectorMatchMode;
      delete targetEvent.primarySelectorText;
    }
    
    if (selectorType === 'xpath' && candidateToApply.xpathValue) {
      targetEvent.primarySelectorXPath = candidateToApply.xpathValue;
    } else if (selectorType !== 'xpath') {
      delete targetEvent.primarySelectorXPath;
    }

    // 이벤트 업데이트
    allEvents[targetIndex] = targetEvent;
    
    // UI 업데이트
    if (currentEventIndex === targetIndex) {
      showSelectors(null, targetEvent, targetIndex);
    }
    
    updateTimeline();
    updateCode({ preloadedEvents: allEvents });
    
    logMessage(`셀렉터 적용: ${candidateToApply.selector}`, 'success');
  }
}

/**
 * 셀렉터 하이라이트
 * popup.js의 highlightSelector 이식 (간소화)
 */
function highlightSelector(candidate) {
  // Electron 환경에서는 외부 브라우저의 요소를 직접 하이라이트할 수 없음
  // WebSocket을 통해 Content Script에 메시지 전송 (나중에 구현)
  logMessage(`셀렉터 하이라이트: ${candidate.selector}`, 'info');
}

// ============================================================================
// AI 기능 (popup.js 이식) - 5단계
// ============================================================================

/**
 * AI 상태 키 생성
 */
function getAiStateKey(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.id) return `id:${event.id}`;
  if (event.manual && event.manual.id) return `manual:${event.manual.id}`;
  if (event.timestamp) return `ts:${event.timestamp}`;
  if (event.createdAt) return `created:${event.createdAt}`;
  return null;
}

/**
 * AI 상태 가져오기
 */
function getAiState(event) {
  const key = getAiStateKey(event);
  if (!key) return { status: 'idle', error: null };
  let state = aiSuggestionState.get(key);
  if (!state) {
    if (event && Array.isArray(event.aiSelectorCandidates) && event.aiSelectorCandidates.length > 0) {
      state = { status: 'loaded', error: null, updatedAt: event.aiSelectorsUpdatedAt || null };
    } else {
      state = { status: 'idle', error: null };
    }
    aiSuggestionState.set(key, state);
  }
  return state;
}

/**
 * AI 상태 설정
 */
function setAiState(event, patch) {
  const key = getAiStateKey(event);
  if (!key) return null;
  const prev = aiSuggestionState.get(key) || { status: 'idle', error: null };
  const next = { ...prev, ...patch };
  aiSuggestionState.set(key, next);
  return next;
}

/**
 * AI 상태 시간 포맷팅
 */
function formatAiStatusTime(timestamp) {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch (err) {
    return '';
  }
}

/**
 * AI 메시지 추가
 */
function appendAiMessage(text, tone = 'info') {
  if (!selectorList) return false;
  const box = document.createElement('div');
  box.className = `selector-ai-message ${tone}`;
  box.textContent = text;
  selectorList.appendChild(box);
  return true;
}

/**
 * AI 설정 값 정제
 */
function sanitizeAiSettingValue(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

/**
 * AI 설정 상태 표시
 */
function setAiSettingsStatus(text, tone) {
  if (!aiSettingsStatusEl) return;
  aiSettingsStatusEl.className = 'ai-settings-status';
  if (tone === 'error') {
    aiSettingsStatusEl.classList.add('error');
  } else if (tone === 'pending') {
    aiSettingsStatusEl.classList.add('pending');
  } else if (tone === 'success') {
    aiSettingsStatusEl.classList.add('success');
  }
  aiSettingsStatusEl.textContent = text || '';
}

/**
 * AI 설정을 입력 필드에 적용
 */
function applyAiSettingsToInputs(settings = {}) {
  if (aiEndpointInput) {
    aiEndpointInput.value = settings.endpoint || '';
  }
  if (aiApiKeyInput) {
    aiApiKeyInput.value = settings.apiKey || '';
  }
  if (aiModelInput) {
    aiModelInput.value = settings.model || '';
  }
}

/**
 * AI 설정 확인
 */
function isAiConfigured() {
  return !!(aiSettings && typeof aiSettings === 'object' && aiSettings.endpoint && aiSettings.endpoint.trim());
}

/**
 * AI 설정 로드 (Electron 환경용 - 간소화)
 */
function loadAiSettingsFromStorage() {
  try {
    const stored = JSON.parse(localStorage.getItem('aiSettings') || '{}');
    aiSettings = {
      endpoint: sanitizeAiSettingValue(stored.endpoint),
      apiKey: sanitizeAiSettingValue(stored.apiKey),
      model: sanitizeAiSettingValue(stored.model)
    };
    aiSettingsLoaded = true;
    const shouldSyncInputs = !aiSettingsDirty;
    if (shouldSyncInputs) {
      applyAiSettingsToInputs(aiSettings);
      if (!isAiConfigured()) {
        setAiSettingsStatus('AI API 엔드포인트를 설정하세요.', 'pending');
      } else {
        setAiSettingsStatus('AI 설정이 로드되었습니다.', 'success');
      }
    }
    refreshSelectorListForCurrentEvent();
  } catch (err) {
    console.error('[Recorder] AI 설정 로드 오류:', err);
    aiSettings = { ...aiSettingsDefaults };
    aiSettingsLoaded = true;
  }
}

/**
 * AI 설정 변경 표시
 */
function markAiSettingsDirty() {
  aiSettingsDirty = true;
  setAiSettingsStatus('저장되지 않은 변경 사항이 있습니다.', 'pending');
}

/**
 * AI 설정 저장
 */
function saveAiSettings() {
  const nextSettings = {
    endpoint: sanitizeAiSettingValue(aiEndpointInput ? aiEndpointInput.value : ''),
    apiKey: sanitizeAiSettingValue(aiApiKeyInput ? aiApiKeyInput.value : ''),
    model: sanitizeAiSettingValue(aiModelInput ? aiModelInput.value : '')
  };
  setAiSettingsStatus('저장 중...', 'pending');
  
  try {
    localStorage.setItem('aiSettings', JSON.stringify(nextSettings));
    aiSettings = nextSettings;
    aiSettingsDirty = false;
    setAiSettingsStatus('AI 설정이 저장되었습니다.', 'success');
    refreshSelectorListForCurrentEvent();
  } catch (err) {
    console.error('[Recorder] AI 설정 저장 오류:', err);
    setAiSettingsStatus(`AI 설정 저장에 실패했습니다: ${err.message}`, 'error');
  }
}

/**
 * 현재 이벤트의 셀렉터 리스트 새로고침
 */
function refreshSelectorListForCurrentEvent() {
  if (currentEventIndex >= 0 && allEvents[currentEventIndex]) {
    const currentEvent = allEvents[currentEventIndex];
    showSelectors(currentEvent.selectorCandidates || [], currentEvent, currentEventIndex);
  }
}

/**
 * AI 셀렉터 후보 정규화
 */
function normalizeAiCandidates(candidates) {
  if (!Array.isArray(candidates)) return [];
  const seen = new Set();
  return candidates
    .map((candidate) => {
      if (!candidate || typeof candidate !== 'object') return null;
      const selector = typeof candidate.selector === 'string' ? candidate.selector.trim() : '';
      if (!selector) return null;
      if (seen.has(selector)) {
        return null;
      }
      seen.add(selector);
      const normalized = { ...candidate, selector };
      normalized.type = normalized.type || inferSelectorType(selector);
      normalized.reason = normalized.reason || 'AI 추천';
      if (normalized.rawSelector === undefined) {
        normalized.rawSelector = candidate.rawSelector || selector;
      }
      if (normalized.rawType === undefined) {
        normalized.rawType = candidate.rawType || normalized.type;
      }
      if (normalized.rawMatchCount === undefined && typeof normalized.matchCount === 'number') {
        normalized.rawMatchCount = normalized.matchCount;
      }
      if (normalized.rawUnique === undefined && typeof normalized.unique === 'boolean') {
        normalized.rawUnique = normalized.unique;
      }
      if (normalized.rawReason === undefined && normalized.reason) {
        normalized.rawReason = normalized.reason;
      }
      if (normalized.type !== 'text') {
        delete normalized.matchMode;
        delete normalized.textValue;
      } else {
        normalized.matchMode = normalized.matchMode || 'exact';
      }
      normalized.source = 'ai';
      return normalized;
    })
    .filter(Boolean)
    .slice(0, 12);
}

/**
 * AI 요청 페이로드 생성 (간소화)
 */
function buildAiRequestPayload(event) {
  if (!event || typeof event !== 'object') return null;
  const iframeContext = event.iframeContext || (event.frame && event.frame.iframeContext) || null;
  const domPayload = event.domContext ? { root: event.domContext } : null;
  
  return {
    action: event.action || null,
    value: event.value !== undefined ? event.value : null,
    timestamp: event.timestamp || null,
    iframeContext,
    dom: domPayload,
    target: event.target || null,
    page: event.page ? { url: event.page.url || null, title: event.page.title || null } : null,
    clientRect: event.clientRect || null,
    metadata: event.metadata && typeof event.metadata === 'object'
      ? {
          schemaVersion: event.metadata.schemaVersion || 2,
          userAgent: event.metadata.userAgent || null,
          domEvent: event.metadata.domEvent || null
        }
      : null,
    prompt: {
      goal: '주어진 이벤트와 DOM 스냅샷을 분석해 안정적인 셀렉터 후보를 찾는다',
      constraints: [
        '출력은 JSON 객체만 허용하며, 최상위 키는 "candidates" 하나여야 한다',
        '변동성이 있는 상품명이나 숫자는 지양한다',
        '"candidates" 값은 최대 5개의 항목을 가진 배열이어야 한다',
        '각 배열 항목은 { "selector": string, "reason": string } 형태여야 한다',
        '추가 설명, 예시 코드, 텍스트 문단 등은 금지한다'
      ]
    }
  };
}

/**
 * AI 셀렉터 요청
 */
async function requestAiSelectorsForEvent(event, eventIndex) {
  const targetEvent = eventIndex >= 0 && allEvents[eventIndex] ? allEvents[eventIndex] : event;
  if (!targetEvent) return;
  
  if (!isAiConfigured()) {
    setAiState(targetEvent, {
      status: 'error',
      error: 'AI API 설정이 필요합니다. 상단에서 엔드포인트와 (필요 시) API 키를 저장하세요.'
    });
    showSelectors(null, targetEvent, eventIndex);
    return;
  }
  
  setAiState(targetEvent, { status: 'loading', error: null });
  showSelectors(null, targetEvent, eventIndex);
  
  const payload = buildAiRequestPayload(targetEvent);
  if (!payload) {
    setAiState(targetEvent, { status: 'error', error: '요청에 필요한 정보가 부족합니다.' });
    showSelectors(null, targetEvent, eventIndex);
    return;
  }
  
  const requestContext = {
    testCase: document.getElementById('test-purpose') ? (document.getElementById('test-purpose').value || '') : '',
    testUrl: document.getElementById('test-url') ? (document.getElementById('test-url').value || '') : '',
    framework: selectedFramework,
    language: selectedLanguage,
    aiModel: aiSettings.model || ''
  };
  
  try {
    const response = await getAiSelectorSuggestions(payload, requestContext, aiSettings);
    
    if (!response || response.success === false) {
      const message = response && (response.reason || response.error || response.message)
        ? response.reason || response.error || response.message
        : 'AI 추천을 불러오지 못했습니다.';
      setAiState(targetEvent, { status: 'error', error: message });
      showSelectors(null, targetEvent, eventIndex);
      return;
    }
    
    const normalizedCandidates = normalizeAiCandidates(response.candidates || []);
    const updatedAt = Date.now();
    targetEvent.aiSelectorCandidates = normalizedCandidates;
    targetEvent.aiSelectorsUpdatedAt = updatedAt;
    
    if (eventIndex >= 0 && allEvents[eventIndex]) {
      allEvents[eventIndex] = targetEvent;
    }
    
    setAiState(targetEvent, { status: 'loaded', error: null, updatedAt });
    showSelectors(null, targetEvent, eventIndex);
  } catch (error) {
    console.error('[Recorder] AI 셀렉터 요청 오류:', error);
    setAiState(targetEvent, {
      status: 'error',
      error: error.message || 'AI 추천 요청 중 오류가 발생했습니다.'
    });
    showSelectors(null, targetEvent, eventIndex);
  }
}

/**
 * AI 요청 컨트롤 렌더링
 */
function renderAiRequestControls(event, resolvedIndex) {
  if (!selectorList) return;
  
  const header = document.createElement('div');
  header.className = 'selector-ai-control';

  const title = document.createElement('span');
  title.className = 'selector-ai-title';
  title.textContent = 'AI 추천 셀렉터';
  header.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'selector-ai-actions';

  const hasEvent = !!event && resolvedIndex !== undefined && resolvedIndex !== null && resolvedIndex >= 0;
  const aiConfigured = isAiConfigured();
  const state = hasEvent ? getAiState(event) : { status: 'idle', error: null };
  const canRequest = hasEvent && aiConfigured;

  const button = document.createElement('button');
  button.className = 'selector-ai-button';
  if (!aiConfigured) {
    button.textContent = 'AI 설정 필요';
    button.disabled = true;
  } else if (!hasEvent) {
    button.textContent = 'AI 추천 요청';
    button.disabled = true;
  } else if (state.status === 'loading') {
    button.textContent = '요청 중...';
    button.disabled = true;
  } else if (state.status === 'error') {
    button.textContent = '다시 시도';
  } else if (state.status === 'loaded') {
    button.textContent = 'AI 다시 요청';
  } else {
    button.textContent = 'AI 추천 요청';
  }
  if (!canRequest) {
    button.disabled = true;
  }
  button.addEventListener('click', () => {
    if (!canRequest || getAiState(event).status === 'loading') {
      return;
    }
    requestAiSelectorsForEvent(event, resolvedIndex);
  });

  const statusEl = document.createElement('span');
  statusEl.className = 'selector-ai-status';
  if (!aiConfigured) {
    statusEl.textContent = '상단 AI 설정을 저장하면 추천을 요청할 수 있습니다.';
    statusEl.classList.add('error');
  } else if (!canRequest) {
    statusEl.textContent = '타임라인에서 이벤트를 선택하면 AI 추천을 요청할 수 있습니다.';
    statusEl.classList.add('muted');
  } else if (state.status === 'loading') {
    statusEl.textContent = 'AI가 분석 중입니다...';
    statusEl.classList.add('info');
  } else if (state.status === 'error') {
    statusEl.textContent = state.error || 'AI 추천을 불러오지 못했습니다.';
    statusEl.classList.add('error');
  } else if (state.status === 'loaded') {
    const timeText = state.updatedAt ? ` (업데이트 ${formatAiStatusTime(state.updatedAt)})` : '';
    statusEl.textContent = `AI 추천 결과가 준비되었습니다${timeText}`;
    statusEl.classList.add('success');
  } else {
    statusEl.textContent = '필요할 때 AI 추천을 받아보세요.';
    statusEl.classList.add('muted');
  }

  const buttonWrapper = document.createElement('div');
  buttonWrapper.className = 'selector-ai-button-wrapper';
  buttonWrapper.setAttribute(
    'data-tooltip',
    'AI가 이벤트 컨텍스트와 테스트 목적을 분석해 안정적인 셀렉터를 추천합니다.'
  );
  buttonWrapper.appendChild(button);
  actions.appendChild(buttonWrapper);
  actions.appendChild(statusEl);
  header.appendChild(actions);
  selectorList.appendChild(header);
}

// iframe 표시
function showIframe(ctx) {
  if (!iframeBanner) return;
  if (ctx) {
    iframeBanner.classList.remove('hidden');
  } else {
    iframeBanner.classList.add('hidden');
  }
}

// ============================================================================
// 요소 선택 워크플로우 (popup.js 이식) - 6단계
// ============================================================================

/**
 * 요소 상태 메시지 설정
 */
function setElementStatus(message, tone = 'info') {
  if (!elementStatusEl) return;
  elementStatusEl.textContent = message || '';
  elementStatusEl.setAttribute('data-tone', tone || 'info');
  elementStatusEl.style.display = message ? 'block' : 'none';
}

/**
 * 요소 선택 버튼 상태 업데이트
 */
function updateElementButtonState() {
  if (!elementSelectBtn) return;
  if (selectionState.active) {
    elementSelectBtn.classList.add('active');
    elementSelectBtn.textContent = '선택 중단';
  } else {
    elementSelectBtn.classList.remove('active');
    elementSelectBtn.textContent = '요소 선택';
  }
}

/**
 * 요소 패널 표시 여부 확인
 */
function ensureElementPanelVisibility() {
  if (!elementPanel) return;
  if (selectionState.active || selectionState.stack.length > 0) {
    elementPanel.classList.remove('hidden');
  } else {
    elementPanel.classList.add('hidden');
  }
}

/**
 * 선택 UI 초기화
 */
function resetSelectionUI() {
  if (elementPathItems) elementPathItems.innerHTML = '';
  if (elementPathContainer) elementPathContainer.classList.add('hidden');
  if (elementCandidatesContainer) elementCandidatesContainer.innerHTML = '';
  if (elementActionsContainer) elementActionsContainer.classList.add('hidden');
  if (elementAttrPanel) elementAttrPanel.classList.add('hidden');
  if (elementAttrNameInput) elementAttrNameInput.value = '';
  if (elementCodePreview) elementCodePreview.classList.add('hidden');
  if (elementCodeEl) elementCodeEl.textContent = '';
}

/**
 * 선택 상태 초기화
 */
function resetSelectionState(options = {}) {
  selectionState.active = false;
  selectionState.stage = 'idle';
  selectionState.stack = [];
  selectionState.pendingAction = null;
  selectionState.pendingAttribute = '';
  selectionState.codePreview = '';
  if (!options.keepStatus) {
    setElementStatus('');
  }
  resetSelectionUI();
  updateElementButtonState();
  ensureElementPanelVisibility();
}

/**
 * 현재 선택 노드 가져오기
 */
function getCurrentSelectionNode() {
  if (!selectionState.stack.length) return null;
  return selectionState.stack[selectionState.stack.length - 1];
}

/**
 * 선택 경로 렌더링
 */
function renderSelectionPath() {
  if (!elementPathItems || !elementPathContainer) return;
  elementPathItems.innerHTML = '';
  if (selectionState.stack.length === 0) {
    elementPathContainer.classList.add('hidden');
    return;
  }
  elementPathContainer.classList.remove('hidden');
  selectionState.stack.forEach((node, index) => {
    const item = document.createElement('div');
    item.className = 'element-path-item';
    const label = index === 0 ? 'ROOT' : `CHILD ${index}`;
    const selected = node.selectedCandidate ? node.selectedCandidate.selector : '(미선택)';
    item.innerHTML = `<span class="label">${label}</span><span class="value">${selected}</span>`;
    elementPathItems.appendChild(item);
  });
}

/**
 * 선택 후보 아이템 생성
 */
function createSelectionCandidateItem(node, candidate) {
  const item = document.createElement('div');
  item.className = 'selector-item';
  const selectorType = candidate.type || inferSelectorType(candidate.selector);
  const relationLabel = candidate.relation === 'relative' ? ' (REL)' : '';
  const scoreLabel = typeof candidate.score === 'number' ? `${candidate.score}%` : '';
  const badges = [];
  if (candidate.unique === true) badges.push('유일');
  if (typeof candidate.matchCount === 'number' && candidate.matchCount > 1) {
    badges.push(`${candidate.matchCount}개 일치`);
  }
  if (candidate.relation === 'relative' && typeof candidate.contextMatchCount === 'number') {
    badges.push(`부모 내 ${candidate.contextMatchCount}개`);
  }
  const badgeLine = badges.filter(Boolean).join(' • ');
  const isSelected = node.selectedCandidate && node.selectedCandidate.selector === candidate.selector && (node.selectedCandidate.type || inferSelectorType(node.selectedCandidate.selector)) === (candidate.type || inferSelectorType(candidate.selector));
  
  item.innerHTML = `
    <div class="selector-main">
      <span class="type">${(selectorType || 'css').toUpperCase()}${relationLabel}</span>
      <span class="sel">${candidate.selector}</span>
      <span class="score">${scoreLabel}</span>
    </div>
    ${badgeLine ? `<div class="selector-badges">${badgeLine}</div>` : ''}
    ${candidate.reason ? `<div class="selector-reason">${candidate.reason}</div>` : ''}
    <div class="selector-actions">
      <button class="apply-btn" ${isSelected ? 'style="background: #4CAF50; color: white;"' : ''}>${isSelected ? '✓ 선택됨' : '선택'}</button>
      <button class="highlight-btn">하이라이트</button>
    </div>
  `;
  
  const applyBtn = item.querySelector('.apply-btn');
  const highlightBtn = item.querySelector('.highlight-btn');
  
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      applyCandidateToNode(node, candidate);
    });
  }
  
  if (highlightBtn) {
    highlightBtn.addEventListener('click', () => {
      highlightSelector(candidate);
    });
  }
  
  return item;
}

/**
 * 선택 후보 렌더링
 */
function renderSelectionCandidates(node) {
  if (!elementCandidatesContainer || !node) return;
  elementCandidatesContainer.innerHTML = '';
  const candidates = node.candidates || [];
  if (!candidates.length) {
    const empty = document.createElement('div');
    empty.style.padding = '8px';
    empty.style.color = '#777';
    empty.textContent = '후보가 없습니다.';
    elementCandidatesContainer.appendChild(empty);
    return;
  }
  candidates.forEach((candidate) => {
    elementCandidatesContainer.appendChild(createSelectionCandidateItem(node, candidate));
  });
}

/**
 * 선택 액션 표시 여부 업데이트
 */
function updateSelectionActionsVisibility() {
  if (!elementActionsContainer) return;
  const currentNode = getCurrentSelectionNode();
  if (currentNode && currentNode.selectedCandidate) {
    elementActionsContainer.classList.remove('hidden');
  } else {
    elementActionsContainer.classList.add('hidden');
  }
  if (elementAttrPanel) elementAttrPanel.classList.add('hidden');
  if (elementAttrNameInput) elementAttrNameInput.value = '';
}

/**
 * 선택 경로 배열 생성
 */
function buildSelectionPathArray() {
  return selectionState.stack
    .map((node) => {
      if (!node.selectedCandidate) return null;
      const candidate = node.selectedCandidate;
      return {
        selector: candidate.selector,
        type: candidate.type || inferSelectorType(candidate.selector),
        textValue: candidate.textValue || null,
        xpathValue: candidate.xpathValue || null,
        relation: candidate.relation || null,
        reason: candidate.reason || '',
        matchMode: candidate.matchMode || null,
        iframeContext: (node.element && node.element.iframeContext) || null
      };
    })
    .filter(Boolean);
}

/**
 * 선택 코드 미리보기 업데이트
 */
function updateSelectionCodePreview() {
  if (!elementCodePreview || !elementCodeEl) return;
  const path = buildSelectionPathArray();
  if (!path.length) {
    elementCodePreview.classList.add('hidden');
    elementCodeEl.textContent = '';
    return;
  }
  const previewLines = buildSelectionPreviewLines(path, selectedFramework, selectedLanguage);
  elementCodeEl.textContent = previewLines.join('\n');
  elementCodePreview.classList.remove('hidden');
}

/**
 * 후보를 노드에 적용
 */
function applyCandidateToNode(node, candidate) {
  if (!node) return;
  node.selectedCandidate = {
    ...candidate,
    type: candidate.type || inferSelectorType(candidate.selector)
  };
  renderSelectionCandidates(node);
  renderSelectionPath();
  selectionState.stage = 'await-action';
  setElementStatus('동작을 선택하세요.', 'info');
  updateSelectionActionsVisibility();
  updateSelectionCodePreview();
}

/**
 * 선택 워크플로우 시작
 */
function startSelectionWorkflow() {
  resetSelectionState({keepStatus: true});
  selectionState.active = true;
  selectionState.stage = 'await-root';
  setElementStatus('페이지에서 요소를 클릭하세요.', 'info');
  ensureElementPanelVisibility();
  updateElementButtonState();
  requestElementPick('root');
}

/**
 * 선택 워크플로우 취소
 */
function cancelSelectionWorkflow(message = '', tone = 'info') {
  if (selectionState.active || selectionState.stage !== 'idle') {
    sendSelectionMessage({type: 'ELEMENT_SELECTION_CANCEL'}, () => {});
  }
  resetSelectionState({keepStatus: true});
  if (message) {
    setElementStatus(message, tone);
  } else {
    setElementStatus('');
  }
}

/**
 * 선택 메시지 전송 (Electron 환경용 - 간소화)
 */
function sendSelectionMessage(payload, callback) {
  // Electron 환경에서는 WebSocket을 통해 Content Script에 메시지 전송
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify({
      type: 'element-selection',
      ...payload
    }));
    if (callback) callback({ok: true});
  } else {
    if (callback) callback({ok: false, reason: 'WebSocket not connected'});
  }
}

/**
 * 요소 선택 요청
 */
function requestElementPick(mode) {
  const message = mode === 'child' ? {type: 'ELEMENT_SELECTION_PICK_CHILD'} : {type: 'ELEMENT_SELECTION_START'};
  sendSelectionMessage(message, (resp) => {
    if (resp && resp.ok === false && resp.reason) {
      setElementStatus(`요소 선택을 시작할 수 없습니다: ${resp.reason}`, 'error');
      if (mode === 'root') {
        cancelSelectionWorkflow('', 'info');
      }
    }
  });
}

/**
 * 요소 선택 완료 처리
 */
function handleElementSelectionPicked(msg) {
  if (!selectionState.active) {
    selectionState.active = true;
    updateElementButtonState();
  }
  const candidates = (msg.selectors || []).map((cand) => ({
    ...cand,
    type: cand.type || inferSelectorType(cand.selector)
  }));
  const node = {
    element: msg.element || {},
    candidates,
    selectedCandidate: null,
    stage: msg.stage || (selectionState.stack.length === 0 ? 'root' : 'child')
  };
  selectionState.stack.push(node);
  selectionState.stage = 'await-candidate';
  renderSelectionPath();
  renderSelectionCandidates(node);
  updateSelectionActionsVisibility();
  updateSelectionCodePreview();
  ensureElementPanelVisibility();
  setElementStatus('후보 중 하나를 선택하세요.', 'info');
}

/**
 * 요소 선택 오류 처리
 */
function handleElementSelectionError(msg) {
  const reason = msg && msg.reason ? msg.reason : '요소를 선택할 수 없습니다.';
  setElementStatus(reason, 'error');
  const stage = msg && msg.stage ? msg.stage : 'root';
  if (selectionState.active) {
    requestElementPick(stage === 'child' ? 'child' : 'root');
  }
}

/**
 * 요소 선택 취소 처리
 */
function handleElementSelectionCancelled() {
  if (!selectionState.active && selectionState.stack.length === 0) return;
  cancelSelectionWorkflow('페이지에서 요소 선택이 취소되었습니다.', 'info');
}

/**
 * 요소 액션 처리
 */
function handleElementAction(action) {
  if (!action) return;
  const currentNode = getCurrentSelectionNode();
  if (!currentNode || !currentNode.selectedCandidate) {
    setElementStatus('먼저 후보를 선택하세요.', 'error');
    return;
  }
  switch (action) {
    case 'click':
      applySelectionAction('click');
      break;
    case 'text':
      applySelectionAction('extract_text');
      break;
    case 'value':
      applySelectionAction('get_attribute', {attributeName: 'value'});
      break;
    case 'attribute':
      if (elementAttrPanel) {
        elementAttrPanel.classList.remove('hidden');
      }
      if (elementAttrNameInput) {
        elementAttrNameInput.value = '';
        elementAttrNameInput.focus();
      }
      selectionState.pendingAction = 'attribute';
      setElementStatus('추출할 속성명을 입력하고 적용을 누르세요.', 'info');
      break;
    case 'child':
      startChildSelection();
      break;
    case 'parent':
      startParentSelection();
      break;
    case 'commit':
      applySelectionAction('commit');
      break;
    case 'finish':
      cancelSelectionWorkflow('요소 선택을 종료했습니다.');
      break;
    default:
      break;
  }
}

/**
 * 자식 선택 시작
 */
function startChildSelection() {
  const currentNode = getCurrentSelectionNode();
  if (!currentNode || !currentNode.selectedCandidate) {
    setElementStatus('먼저 후보를 선택하세요.', 'error');
    return;
  }
  selectionState.stage = 'await-child';
  updateSelectionActionsVisibility();
  setElementStatus('부모 요소 내부에서 자식 요소를 클릭하세요.', 'info');
  requestElementPick('child');
}

/**
 * 부모 선택 시작
 */
function startParentSelection() {
  const currentNode = getCurrentSelectionNode();
  if (!currentNode || !currentNode.selectedCandidate) {
    setElementStatus('먼저 후보를 선택하세요.', 'error');
    return;
  }
  selectionState.stage = 'await-parent';
  updateSelectionActionsVisibility();
  setElementStatus('상위 요소 정보를 가져오는 중입니다...', 'info');
  sendSelectionMessage({type: 'ELEMENT_SELECTION_PICK_PARENT'}, (resp) => {
    if (resp && resp.ok === false) {
      selectionState.stage = 'await-action';
      updateSelectionActionsVisibility();
      let message = '상위 요소를 찾을 수 없습니다.';
      if (resp.reason === 'no_parent') {
        message = '더 이상 상위 요소가 없습니다.';
      } else if (resp.reason === 'current_not_selected') {
        message = '먼저 요소를 선택하세요.';
      }
      setElementStatus(message, 'error');
    }
  });
}

/**
 * 선택 액션 적용 (8단계 완성)
 */
function applySelectionAction(actionType, options = {}) {
  const path = buildSelectionPathArray();
  if (!path.length) {
    setElementStatus('먼저 요소를 선택하세요.', 'error');
    return;
  }
  
  // pendingAction이 verify, wait, interaction인 경우 처리
  if (selectionState.pendingAction) {
    const pending = selectionState.pendingAction;
    if (pending.startsWith('verify')) {
      let value = null;
      if (pending === 'verifyText') {
        const lastPathItem = path[path.length - 1];
        if (lastPathItem && lastPathItem.textValue) {
          value = lastPathItem.textValue;
        } else {
          const textValue = prompt('검증할 텍스트를 입력하세요:');
          if (textValue === null) {
            selectionState.pendingAction = null;
            return;
          }
          value = textValue;
        }
      }
      addVerifyAction(pending, path, value);
      selectionState.pendingAction = null;
      cancelSelectionWorkflow('', 'info');
      return;
    } else if (pending === 'waitForElement') {
      addWaitAction('waitForElement', null, path);
      selectionState.pendingAction = null;
      cancelSelectionWorkflow('', 'info');
      return;
    } else if (['click', 'doubleClick', 'rightClick', 'hover', 'clear', 'type', 'select'].includes(pending)) {
      let value = null;
      if (pending === 'type') {
        const inputValue = prompt('입력할 텍스트를 입력하세요:');
        if (inputValue === null) {
          selectionState.pendingAction = null;
          return;
        }
        value = inputValue;
      } else if (pending === 'select') {
        const selectValue = prompt('선택할 옵션의 텍스트 또는 값을 입력하세요:');
        if (selectValue === null) {
          selectionState.pendingAction = null;
          return;
        }
        value = selectValue;
      }
      addInteractionAction(pending, path, value);
      selectionState.pendingAction = null;
      cancelSelectionWorkflow('', 'info');
      return;
    }
  }
  
  // 일반 액션 처리
  if (actionType === 'click') {
    addInteractionAction('click', path, null);
  } else if (actionType === 'extract_text') {
    const entry = buildManualActionEntry('extract_text', path, { resultName: `text_result_${manualActionSerial}` });
    if (entry) {
      addManualAction(entry, () => {
        updateCode();
        cancelSelectionWorkflow('텍스트 추출 액션을 추가했습니다.', 'success');
      });
    }
  } else if (actionType === 'get_attribute') {
    const attrName = options.attributeName || selectionState.pendingAttribute || '';
    if (!attrName) {
      setElementStatus('속성명을 입력하세요.', 'error');
      return;
    }
    const entry = buildManualActionEntry('get_attribute', path, {
      attributeName: attrName,
      resultName: `${attrName}_value_${manualActionSerial}`
    });
    if (entry) {
      addManualAction(entry, () => {
        updateCode();
        cancelSelectionWorkflow('속성 추출 액션을 추가했습니다.', 'success');
      });
    }
  } else if (actionType === 'commit') {
    cancelSelectionWorkflow('요소 선택이 완료되었습니다.', 'success');
  } else {
    logMessage(`선택 액션 적용: ${actionType}`, 'info');
    cancelSelectionWorkflow('요소 선택이 완료되었습니다.', 'success');
  }
}

// ============================================================================
// 수동 액션 추가 기능 (popup.js 이식) - 8단계
// ============================================================================

/**
 * 수동 액션 엔트리 생성
 */
function buildManualActionEntry(actionType, path, options = {}) {
  if (!path || !path.length) return null;
  const serial = manualActionSerial++;
  const entry = {
    id: `manual-${Date.now()}-${serial}`,
    serial,
    actionType,
    path,
    createdAt: Date.now(),
    iframeContext: path[path.length - 1] && path[path.length - 1].iframeContext ? path[path.length - 1].iframeContext : null
  };
  if (actionType === 'extract_text') {
    entry.resultName = options.resultName || `text_result_${serial}`;
  }
  if (actionType === 'get_attribute') {
    const attrName = (options.attributeName || selectionState.pendingAttribute || '').trim();
    if (!attrName) return null;
    entry.attributeName = attrName;
    entry.resultName = options.resultName || `${attrName}_value_${serial}`;
  }
  return entry;
}

/**
 * 수동 액션 추가
 */
function addManualAction(entry, callback) {
  if (!entry) return;
  const next = [...manualActions, entry];
  manualActions = next;
  if (callback) callback();
  updateCode();
}

/**
 * 검증 액션 처리
 */
function handleVerifyAction(verifyType) {
  if (verifyType === 'verifyTitle' || verifyType === 'verifyUrl') {
    // 타이틀/URL 검증은 요소 선택 불필요
    addVerifyAction(verifyType, null, null);
    return;
  }
  
  // 요소 검증은 요소 선택 필요
  const path = buildSelectionPathArray();
  if (!path.length) {
    // 요소 선택 모드로 전환
    if (!selectionState.active) {
      startSelectionWorkflow();
    }
    setElementStatus('검증할 요소를 선택하세요.', 'info');
    selectionState.pendingAction = verifyType;
    return;
  }
  
  let value = null;
  if (verifyType === 'verifyText') {
    const lastPathItem = path[path.length - 1];
    if (lastPathItem && lastPathItem.textValue) {
      value = lastPathItem.textValue;
    } else {
      const textValue = prompt('검증할 텍스트를 입력하세요:');
      if (textValue === null) return;
      value = textValue;
    }
  }
  
  addVerifyAction(verifyType, path, value);
}

/**
 * 대기 액션 처리
 */
function handleWaitAction(waitType) {
  if (waitType === 'wait') {
    // 시간 대기는 입력 패널 표시
    const waitInputPanel = document.getElementById('wait-input-panel');
    if (waitInputPanel) {
      waitInputPanel.classList.remove('hidden');
    }
    const waitTimeInput = document.getElementById('wait-time-input');
    if (waitTimeInput) {
      waitTimeInput.focus();
    }
    return;
  }
  
  if (waitType === 'waitForElement') {
    const path = buildSelectionPathArray();
    if (!path.length) {
      if (!selectionState.active) {
        startSelectionWorkflow();
      }
      setElementStatus('대기할 요소를 선택하세요.', 'info');
      selectionState.pendingAction = 'waitForElement';
      return;
    }
    
    addWaitAction('waitForElement', null, path);
  }
}

/**
 * 상호작용 액션 처리
 */
function handleInteractionAction(interactionType) {
  const path = buildSelectionPathArray();
  
  if (interactionType === 'type') {
    if (!path.length) {
      if (!selectionState.active) {
        startSelectionWorkflow();
      }
      setElementStatus('입력할 요소를 선택하세요.', 'info');
      selectionState.pendingAction = 'type';
      return;
    }
    const inputValue = prompt('입력할 텍스트를 입력하세요:');
    if (inputValue === null) return;
    addInteractionAction('type', path, inputValue);
    return;
  }
  
  if (interactionType === 'select') {
    if (!path.length) {
      if (!selectionState.active) {
        startSelectionWorkflow();
      }
      setElementStatus('선택할 드롭다운 요소를 선택하세요.', 'info');
      selectionState.pendingAction = 'select';
      return;
    }
    const selectValue = prompt('선택할 옵션의 텍스트 또는 값을 입력하세요:');
    if (selectValue === null) return;
    addInteractionAction('select', path, selectValue);
    return;
  }
  
  // click, doubleClick, rightClick, hover, clear는 요소만 필요
  if (!path.length) {
    if (!selectionState.active) {
      startSelectionWorkflow();
    }
    setElementStatus(`${interactionType}할 요소를 선택하세요.`, 'info');
    selectionState.pendingAction = interactionType;
    return;
  }
  
  addInteractionAction(interactionType, path, null);
}

/**
 * 검증 액션을 이벤트로 추가
 */
function addVerifyAction(verifyType, path, value) {
  const timestamp = Date.now();
  let eventRecord = null;
  
  if (path && path.length > 0) {
    // 요소 기반 검증
    const selectors = path.map((item, idx) => {
      if (!item || !item.selector) return null;
      const type = item.type || inferSelectorType(item.selector);
      return {
        selector: item.selector,
        type,
        textValue: item.textValue || null,
        xpathValue: item.xpathValue || null,
        matchMode: item.matchMode || null,
        score: idx === path.length - 1 ? 100 : 80
      };
    }).filter(Boolean);
    
    if (!selectors.length) {
      alert('셀렉터를 찾을 수 없습니다.');
      return;
    }
    
    const targetEntry = selectors[selectors.length - 1];
    const iframeContext = path[path.length - 1]?.iframeContext || null;
    
    eventRecord = {
      version: 2,
      timestamp,
      action: verifyType,
      value: value || null,
      tag: null,
      selectorCandidates: selectors,
      iframeContext,
      page: { url: '', title: '' },
      frame: { iframeContext },
      target: null,
      clientRect: null,
      metadata: {
        schemaVersion: 2,
        userAgent: navigator.userAgent
      },
      manual: {
        id: `verify-${timestamp}`,
        type: verifyType,
        resultName: null,
        attributeName: null
      },
      primarySelector: targetEntry.selector,
      primarySelectorType: targetEntry.type,
      primarySelectorText: targetEntry.textValue,
      primarySelectorXPath: targetEntry.xpathValue,
      primarySelectorMatchMode: targetEntry.matchMode
    };
  } else {
    // 타이틀/URL 검증 (요소 불필요)
    eventRecord = {
      version: 2,
      timestamp,
      action: verifyType,
      value: value,
      tag: null,
      selectorCandidates: [],
      iframeContext: null,
      page: { url: '', title: '' },
      frame: { iframeContext: null },
      target: null,
      clientRect: null,
      metadata: {
        schemaVersion: 2,
        userAgent: navigator.userAgent
      },
      manual: {
        id: `verify-${timestamp}`,
        type: verifyType,
        resultName: null,
        attributeName: null
      },
      primarySelector: null,
      primarySelectorType: null
    };
  }
  
  // 이벤트 추가
  const normalized = normalizeEventRecord(eventRecord);
  allEvents.push(normalized);
  updateCode({ preloadedEvents: allEvents });
  syncTimelineFromEvents(allEvents, { selectLast: true });
  
  logMessage(`${verifyType} 액션을 추가했습니다.`, 'success');
}

/**
 * 대기 액션을 이벤트로 추가
 */
function addWaitAction(waitType, timeValue, path) {
  const timestamp = Date.now();
  let eventRecord = null;
  
  if (waitType === 'wait') {
    // 시간 대기
    eventRecord = {
      version: 2,
      timestamp,
      action: 'wait',
      value: String(timeValue || 1000),
      tag: null,
      selectorCandidates: [],
      iframeContext: null,
      page: { url: '', title: '' },
      frame: { iframeContext: null },
      target: null,
      clientRect: null,
      metadata: {
        schemaVersion: 2,
        userAgent: navigator.userAgent
      },
      manual: {
        id: `wait-${timestamp}`,
        type: 'wait',
        resultName: null,
        attributeName: null
      },
      primarySelector: null,
      primarySelectorType: null
    };
  } else if (waitType === 'waitForElement' && path && path.length > 0) {
    // 요소 대기
    const selectors = path.map((item, idx) => {
      if (!item || !item.selector) return null;
      const type = item.type || inferSelectorType(item.selector);
      return {
        selector: item.selector,
        type,
        textValue: item.textValue || null,
        xpathValue: item.xpathValue || null,
        matchMode: item.matchMode || null,
        score: idx === path.length - 1 ? 100 : 80
      };
    }).filter(Boolean);
    
    if (!selectors.length) {
      alert('셀렉터를 찾을 수 없습니다.');
      return;
    }
    
    const targetEntry = selectors[selectors.length - 1];
    const iframeContext = path[path.length - 1]?.iframeContext || null;
    
    eventRecord = {
      version: 2,
      timestamp,
      action: 'waitForElement',
      value: timeValue ? String(timeValue) : null,
      tag: null,
      selectorCandidates: selectors,
      iframeContext,
      page: { url: '', title: '' },
      frame: { iframeContext },
      target: null,
      clientRect: null,
      metadata: {
        schemaVersion: 2,
        userAgent: navigator.userAgent
      },
      manual: {
        id: `wait-${timestamp}`,
        type: 'waitForElement',
        resultName: null,
        attributeName: null
      },
      primarySelector: targetEntry.selector,
      primarySelectorType: targetEntry.type,
      primarySelectorText: targetEntry.textValue,
      primarySelectorXPath: targetEntry.xpathValue,
      primarySelectorMatchMode: targetEntry.matchMode
    };
  } else {
    alert('대기 액션을 생성할 수 없습니다.');
    return;
  }
  
  // 이벤트 추가
  const normalized = normalizeEventRecord(eventRecord);
  allEvents.push(normalized);
  updateCode({ preloadedEvents: allEvents });
  syncTimelineFromEvents(allEvents, { selectLast: true });
  
  logMessage(`${waitType} 액션을 추가했습니다.`, 'success');
}

/**
 * 상호작용 액션을 이벤트로 추가
 */
function addInteractionAction(interactionType, path, value) {
  const timestamp = Date.now();
  
  if (!path || !path.length) {
    alert('요소를 선택하세요.');
    return;
  }
  
  const selectors = path.map((item, idx) => {
    if (!item || !item.selector) return null;
    const type = item.type || inferSelectorType(item.selector);
    return {
      selector: item.selector,
      type,
      textValue: item.textValue || null,
      xpathValue: item.xpathValue || null,
      matchMode: item.matchMode || null,
      score: idx === path.length - 1 ? 100 : 80
    };
  }).filter(Boolean);
  
  if (!selectors.length) {
    alert('셀렉터를 찾을 수 없습니다.');
    return;
  }
  
  const targetEntry = selectors[selectors.length - 1];
  const iframeContext = path[path.length - 1]?.iframeContext || null;
  
  const eventRecord = {
    version: 2,
    timestamp,
    action: interactionType,
    value: value || null,
    tag: null,
    selectorCandidates: selectors,
    iframeContext,
    page: { url: '', title: '' },
    frame: { iframeContext },
    target: null,
    clientRect: null,
    metadata: {
      schemaVersion: 2,
      userAgent: navigator.userAgent
    },
    manual: {
      id: `interaction-${timestamp}`,
      type: interactionType,
      resultName: null,
      attributeName: null
    },
    primarySelector: targetEntry.selector,
    primarySelectorType: targetEntry.type,
    primarySelectorText: targetEntry.textValue,
    primarySelectorXPath: targetEntry.xpathValue,
    primarySelectorMatchMode: targetEntry.matchMode
  };
  
  // 이벤트 추가
  const normalized = normalizeEventRecord(eventRecord);
  allEvents.push(normalized);
  updateCode({ preloadedEvents: allEvents });
  syncTimelineFromEvents(allEvents, { selectLast: true });
  
  logMessage(`${interactionType} 액션을 추가했습니다.`, 'success');
}

/**
 * 선택 미리보기 라인 생성 (간소화)
 */
function buildSelectionPreviewLines(path, framework, language) {
  if (!path || !path.length) return [];
  // 간단한 구현 - 나중에 완성
  return [`// 선택 경로: ${path.length}개 요소`];
}

// ============================================================================
// 리플레이 기능 (popup.js 이식) - 7단계
// ============================================================================

/**
 * 리플레이 상태 초기화
 */
function resetReplayState() {
  if (replayState.navigationGuard) {
    clearTimeout(replayState.navigationGuard);
  }
  if (replayState.scheduledTimer) {
    clearTimeout(replayState.scheduledTimer);
  }
  replayState = {
    running: false,
    events: [],
    index: 0,
    sessionId: null,
    pending: false,
    awaitingNavigation: false,
    awaitingContent: false,
    navigationGuard: null,
    scheduledTimer: null
  };
}

/**
 * 다음 스텝 스케줄링
 */
function scheduleNextStep(delayMs) {
  if (!replayState.running) return;
  if (replayState.scheduledTimer) {
    clearTimeout(replayState.scheduledTimer);
  }
  replayState.scheduledTimer = setTimeout(() => {
    replayState.scheduledTimer = null;
    sendReplayStep();
  }, Math.max(0, delayMs || 0));
}

/**
 * 리플레이 완료
 */
function finishReplay() {
  const wasRunning = replayState.running;
  resetReplayState();
  if (wasRunning) {
    logMessage('✓ 리플레이 완료', 'success');
  }
}

/**
 * 리플레이 중단
 */
function abortReplay(reason) {
  const message = reason || '알 수 없는 오류로 리플레이가 중단되었습니다.';
  logMessage(`✗ 리플레이 종료 - ${message}`, 'error');
  resetReplayState();
}

/**
 * 리플레이 스텝 전송
 */
function sendReplayStep() {
  if (!replayState.running) return;
  if (replayState.pending) return;
  if (replayState.index >= replayState.events.length) {
    finishReplay();
    return;
  }
  
  const currentEvent = replayState.events[replayState.index];
  if (!replayState.sessionId) {
    abortReplay('대상 세션을 찾을 수 없습니다.');
    return;
  }
  
  replayState.pending = true;
  if (replayState.navigationGuard) {
    clearTimeout(replayState.navigationGuard);
    replayState.navigationGuard = null;
  }
  
  // WebSocket을 통해 Content Script에 리플레이 스텝 전송
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify({
      type: 'replay-execute-step',
      sessionId: replayState.sessionId,
      event: currentEvent,
      index: replayState.index,
      total: replayState.events.length,
      timeoutMs: 10000
    }));
    
    // 타임아웃 설정 (응답이 없으면 다음 스텝으로 진행)
    setTimeout(() => {
      if (replayState.pending && replayState.running) {
        replayState.pending = false;
        replayState.index++;
        if (replayState.index >= replayState.events.length) {
          finishReplay();
        } else {
          scheduleNextStep(STEP_DELAY_MS);
        }
      }
    }, 10000);
  } else {
    abortReplay('WebSocket 연결이 끊어졌습니다.');
  }
}

/**
 * 리플레이 스텝 결과 처리
 */
function handleReplayStepResult(msg) {
  if (!replayState.running) return;
  const expectedIndex = replayState.index;
  const msgIndex = msg.stepIndex !== undefined ? msg.stepIndex : (msg.step !== undefined ? (msg.step - 1) : expectedIndex);

  if (msgIndex !== expectedIndex) {
    // 다른 스텝의 응답이면 무시
    return;
  }

  replayState.pending = false;

  if (!msg.ok) {
    abortReplay(msg.reason || 'step failed');
    return;
  }

  replayState.index = msgIndex + 1;

  if (replayState.index >= replayState.events.length) {
    finishReplay();
    return;
  }

  if (msg.navigation) {
    replayState.awaitingNavigation = true;
    replayState.awaitingContent = true;
    if (replayState.navigationGuard) {
      clearTimeout(replayState.navigationGuard);
    }
    replayState.navigationGuard = setTimeout(() => {
      replayState.navigationGuard = null;
      abortReplay('페이지 로딩이 너무 오래 걸립니다.');
    }, MAX_NAVIGATION_WAIT_MS);
    return;
  }

  scheduleNextStep(STEP_DELAY_MS);
}

/**
 * 액션 타임라인 빌드
 */
function buildActionTimeline(events, manualList) {
  const timeline = [];
  let sequence = 0;
  let maxEventTimestamp = 0;
  
  if (Array.isArray(events)) {
    events.forEach((event) => {
      const normalizedEvent = normalizeEventRecord(event);
      const timestamp = typeof normalizedEvent.timestamp === 'number' ? normalizedEvent.timestamp : 0;
      if (timestamp > maxEventTimestamp) {
        maxEventTimestamp = timestamp;
      }
      timeline.push({
        kind: 'event',
        time: timestamp,
        event: normalizedEvent,
        sequence: sequence++
      });
    });
  }
  
  if (Array.isArray(manualList)) {
    manualList.forEach((action) => {
      if (!action || typeof action !== 'object') return;
      const actionTime = typeof action.createdAt === 'number' ? action.createdAt : maxEventTimestamp + (sequence * 100);
      timeline.push({
        kind: 'manual',
        time: actionTime,
        action: action,
        sequence: sequence++
      });
    });
  }
  
  timeline.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return a.sequence - b.sequence;
  });
  
  return timeline;
}

/**
 * 수동 액션을 이벤트로 변환
 */
function convertManualActionToEvent(action) {
  if (!action || typeof action !== 'object') return null;
  // 간단한 구현 - 나중에 8단계에서 완성
  return {
    action: action.actionType || 'click',
    target: action.path && action.path.length > 0 ? action.path[action.path.length - 1] : null,
    value: action.value || null,
    timestamp: action.createdAt || Date.now(),
    manual: true
  };
}

/**
 * 리플레이 큐 빌드
 */
function buildReplayQueue(events, manualList) {
  const timeline = buildActionTimeline(events, manualList);
  const queue = [];
  timeline.forEach((entry) => {
    if (entry.kind === 'event' && entry.event) {
      queue.push(entry.event);
    } else if (entry.kind === 'manual' && entry.action) {
      const manualEvent = convertManualActionToEvent(entry.action);
      if (manualEvent) {
        queue.push(manualEvent);
      }
    }
  });
  return queue;
}

/**
 * 리플레이 시작
 */
function startReplay() {
  if (replayState.running) {
    alert('리플레이가 이미 진행 중입니다. 잠시 후 다시 시도하세요.');
    return;
  }
  
  const replayQueue = buildReplayQueue(allEvents, manualActions);
  const normalizedQueue = replayQueue.map((item) => normalizeEventRecord(item));
  
  if (normalizedQueue.length === 0) {
    alert('재생할 이벤트가 없습니다.');
    return;
  }

  // 테스트 URL 가져오기
  const testUrlInput = document.getElementById('test-url');
  const startUrl = testUrlInput ? testUrlInput.value.trim() : '';
  
  if (!startUrl) {
    alert('테스트 URL을 입력하세요.');
    return;
  }

  // 로그 초기화
  if (logEntries) {
    logEntries.innerHTML = '';
  }
  logMessage(`리플레이 시작 준비 중… (총 ${normalizedQueue.length}개 스텝)`, 'info');

  // WebSocket 연결 확인
  if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
    alert('WebSocket 연결이 필요합니다. 먼저 녹화를 시작하세요.');
    return;
  }

  // 세션 ID 생성 (또는 기존 세션 사용)
  const sessionId = `replay-${Date.now()}`;
  
  // 리플레이 상태 초기화
  resetReplayState();
  replayState.running = true;
  replayState.events = normalizedQueue;
  replayState.index = 0;
  replayState.sessionId = sessionId;
  replayState.pending = false;
  replayState.awaitingNavigation = false;
  replayState.awaitingContent = false;

  // 리플레이 시작 메시지 전송
  wsConnection.send(JSON.stringify({
    type: 'replay-start',
    sessionId: sessionId,
    url: startUrl,
    events: normalizedQueue
  }));

  // 첫 스텝 실행
  scheduleNextStep(500); // 초기 지연
}

// 요소 하이라이트 처리 (마우스 오버 시)
function handleElementHover(data) {
  if (!selectorList) return;
  
  const element = data.element || {};
  const selectors = data.selectors || [];
  
  // 요소 정보 표시
  const elementInfo = document.createElement('div');
  elementInfo.className = 'element-hover-info';
  elementInfo.style.cssText = 'padding: 12px; margin-bottom: 12px; background: var(--vscode-input-bg); border: 1px solid var(--vscode-border); border-radius: 6px;';
  
  const tagEl = document.createElement('div');
  tagEl.style.cssText = 'font-weight: 600; color: var(--vscode-text); margin-bottom: 4px;';
  tagEl.textContent = `<${element.tag || 'unknown'}>`;
  
  if (element.id) {
    const idEl = document.createElement('div');
    idEl.style.cssText = 'font-size: 12px; color: var(--vscode-text-secondary); margin-bottom: 2px;';
    idEl.textContent = `#${element.id}`;
    elementInfo.appendChild(idEl);
  }
  
  if (element.classes && element.classes.length > 0) {
    const classEl = document.createElement('div');
    classEl.style.cssText = 'font-size: 12px; color: var(--vscode-text-secondary); margin-bottom: 2px;';
    classEl.textContent = `.${element.classes.slice(0, 3).join('.')}`;
    elementInfo.appendChild(classEl);
  }
  
  if (element.text) {
    const textEl = document.createElement('div');
    textEl.style.cssText = 'font-size: 11px; color: var(--vscode-text-secondary); margin-top: 4px; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    textEl.textContent = `"${element.text}"`;
    elementInfo.appendChild(textEl);
  }
  
  elementInfo.insertBefore(tagEl, elementInfo.firstChild);
  
  // 셀렉터 리스트 표시
  const tempContainer = document.createElement('div');
  tempContainer.appendChild(elementInfo);
  
  if (selectors.length > 0) {
    renderSelectorItems(selectors, tempContainer);
  } else {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'selector-empty';
    emptyMsg.textContent = '셀렉터 후보가 없습니다.';
    tempContainer.appendChild(emptyMsg);
  }
  
  // 기존 내용 교체
  selectorList.innerHTML = '';
  selectorList.appendChild(tempContainer);
  
  // iframe 경고 표시
  if (element.iframeContext) {
    showIframe(element.iframeContext);
  } else {
    showIframe(null);
  }
}

// 요소 하이라이트 해제
function clearElementHover() {
  if (!selectorList) return;
  
  // 하이라이트 정보만 제거하고, 선택된 이벤트의 셀렉터는 유지
  const hoverInfo = selectorList.querySelector('.element-hover-info');
  if (hoverInfo) {
    hoverInfo.remove();
  }
  
  // 선택된 이벤트가 있으면 해당 셀렉터 표시
  if (currentEventIndex >= 0 && currentEventIndex < allEvents.length) {
    const selectedEvent = allEvents[currentEventIndex];
    showSelectors(selectedEvent.selectorCandidates || [], selectedEvent, currentEventIndex);
  } else {
    // 선택된 이벤트가 없으면 빈 상태
    selectorList.innerHTML = '';
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'selector-empty';
    emptyMsg.textContent = '요소에 마우스를 올려보세요.';
    selectorList.appendChild(emptyMsg);
  }
  
  showIframe(null);
}

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
      // updateSelectionCodePreview(); // 6단계에서 구현
    });
  };

  // preloadedEvents가 제공되면 바로 사용
  if (Array.isArray(preloadedEvents)) {
    handleEvents(preloadedEvents);
    return;
  }

  // Electron 환경에서는 allEvents를 직접 사용
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
function startRecording() {
  if (recording) return;

  recording = true;
  allEvents = [];
  currentEventIndex = -1;

  if (startBtn) startBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;
  if (timeline) timeline.innerHTML = '';
  if (selectorList) selectorList.innerHTML = '';
  if (logEntries) logEntries.innerHTML = '';

  setCodeText('');
  updateDeleteButtonState();

  // WebSocket으로 녹화 시작 신호 전송
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify({
      type: 'recording-start',
      timestamp: Date.now()
    }));
  }

  logMessage('녹화 시작', 'success');
}

// 녹화 중지
function stopRecording() {
  if (!recording) return;

  recording = false;

  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;

  // WebSocket으로 녹화 중지 신호 전송
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify({
      type: 'recording-stop',
      timestamp: Date.now()
    }));
  }

  updateCode();
  logMessage('녹화 중지', 'info');
}

// 초기화
function reset() {
  recording = false;
  allEvents = [];
  manualActions = [];
  currentEventIndex = -1;

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
 * popup.js의 deleteCurrentEvent 이식 (개선)
 */
function deleteCurrentEvent() {
  if (currentEventIndex < 0 || currentEventIndex >= allEvents.length) return;
  
  const targetIndex = currentEventIndex;
  const updatedEvents = allEvents.slice();
  updatedEvents.splice(targetIndex, 1);
  
  const nextIndex = updatedEvents.length > 0 ? Math.min(targetIndex, updatedEvents.length - 1) : -1;
  currentEventIndex = nextIndex;
  
  const normalized = syncTimelineFromEvents(updatedEvents, {
    preserveSelection: nextIndex !== -1,
    selectLast: false,
    resetAiState: false
  });
  
  updateDeleteButtonState();
  updateCode({ preloadedEvents: normalized });
  
  logMessage('이벤트 삭제됨', 'info');
}

// 호환성을 위한 별칭
const deleteSelectedEvent = deleteCurrentEvent;

// 로그 메시지 표시
function logMessage(message, type = 'info') {
  if (!logEntries) return;

  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  
  logEntries.appendChild(entry);
  logEntries.scrollTop = logEntries.scrollHeight;
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
  if (!aiReviewBtn || !codeOutput) return;

  const code = codeEditor ? codeEditor.getValue() : codeOutput.value;
  if (!code || code.trim().length === 0) {
    alert('리뷰할 코드가 없습니다.');
    return;
  }

  // AI 설정 확인 (간단한 구현)
  const aiSettings = {
    endpoint: document.getElementById('ai-endpoint')?.value || '',
    apiKey: document.getElementById('ai-api-key')?.value || '',
    model: document.getElementById('ai-model')?.value || ''
  };

  if (!aiSettings.endpoint || !aiSettings.apiKey) {
    alert('AI 설정을 먼저 입력하세요.');
    return;
  }

  if (aiReviewStatusEl) {
    aiReviewStatusEl.textContent = '리뷰 중...';
    aiReviewStatusEl.className = 'code-review-status info';
  }

  try {
    const result = await getAiCodeReview(
      code,
      selectedFramework,
      selectedLanguage,
      '',
      allEvents,
      aiSettings
    );

    if (result.success && result.data) {
      if (aiReviewStatusEl) {
        aiReviewStatusEl.textContent = '리뷰 완료';
        aiReviewStatusEl.className = 'code-review-status success';
      }

      // 리뷰 결과 표시 (간단한 구현)
      if (result.data.updatedCode) {
        setCodeText(result.data.updatedCode);
      }

      if (result.data.summary) {
        logMessage(`AI 리뷰: ${result.data.summary}`, 'info');
      }
    } else {
      if (aiReviewStatusEl) {
        aiReviewStatusEl.textContent = `오류: ${result.error || '알 수 없는 오류'}`;
        aiReviewStatusEl.className = 'code-review-status error';
      }
    }
  } catch (error) {
    console.error('[Recorder] AI 리뷰 오류:', error);
    if (aiReviewStatusEl) {
      aiReviewStatusEl.textContent = `오류: ${error.message}`;
      aiReviewStatusEl.className = 'code-review-status error';
    }
  }
}

// Action 메뉴 토글
function setupActionMenu() {
  const actionBtn = document.getElementById('action-btn');
  const actionMenu = document.getElementById('action-menu');
  
  if (!actionBtn || !actionMenu) return;

  actionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    actionMenu.classList.toggle('hidden');
  });

  // 메뉴 외부 클릭 시 닫기
  document.addEventListener('click', (e) => {
    if (!actionMenu.contains(e.target) && !actionBtn.contains(e.target)) {
      actionMenu.classList.add('hidden');
    }
  });

  // Action 메뉴 항목 클릭 처리
  actionMenu.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action-type]');
    if (!button) return;

    const actionType = button.dataset.actionType;
    const action = button.dataset.action;
    
    if (actionType === 'interaction') {
      handleInteractionAction(action);
    } else if (actionType === 'verify') {
      handleVerifyAction(action);
    } else if (actionType === 'wait') {
      handleWaitAction(action);
    }

    actionMenu.classList.add('hidden');
  });
}

// 오버레이 토글
function setupOverlayToggle() {
  const overlayToggleBtn = document.getElementById('overlay-toggle-btn');
  
  if (!overlayToggleBtn) return;

  let overlayVisible = false;

  overlayToggleBtn.addEventListener('click', () => {
    overlayVisible = !overlayVisible;
    overlayToggleBtn.setAttribute('aria-pressed', overlayVisible.toString());
    
    // WebSocket으로 오버레이 토글 신호 전송
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        type: 'toggle-overlay',
        visible: overlayVisible,
        timestamp: Date.now()
      }));
    }

    logMessage(`오버레이 ${overlayVisible ? '표시' : '숨김'}`, 'info');
  });
}

// 이벤트 리스너 등록
/**
 * AI 설정 이벤트 리스너 설정
 */
function setupAiSettings() {
  // AI 설정 저장 버튼
  if (aiSettingsSaveBtn) {
    aiSettingsSaveBtn.addEventListener('click', () => {
      if (!aiSettingsLoaded && !aiSettingsDirty) {
        loadAiSettingsFromStorage();
        return;
      }
      saveAiSettings();
    });
  }

  // AI 설정 입력 필드 변경 감지
  [aiEndpointInput, aiApiKeyInput, aiModelInput].forEach((input) => {
    if (!input) return;
    input.addEventListener('input', markAiSettingsDirty);
  });

  // 초기 로드
  loadAiSettingsFromStorage();
}

function setupEventListeners() {
  console.log('[Recorder] 이벤트 리스너 설정 시작');
  console.log('[Recorder] startBtn:', startBtn);
  console.log('[Recorder] stopBtn:', stopBtn);
  
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      console.log('[Recorder] Record Start 버튼 클릭됨');
      startRecording();
    });
  } else {
    console.error('[Recorder] startBtn이 null입니다. DOM 요소를 찾을 수 없습니다.');
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      console.log('[Recorder] Stop 버튼 클릭됨');
      stopRecording();
    });
  } else {
    console.error('[Recorder] stopBtn이 null입니다. DOM 요소를 찾을 수 없습니다.');
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', reset);
  }

  if (deleteEventBtn) {
    deleteEventBtn.addEventListener('click', deleteSelectedEvent);
  }

  if (sendRecordingBtn) {
    sendRecordingBtn.addEventListener('click', sendRecordingData);
  }

  if (frameworkSelect) {
    frameworkSelect.addEventListener('change', (e) => {
      selectedFramework = e.target.value;
      updateCode();
    });
  }

  if (languageSelect) {
    languageSelect.addEventListener('change', (e) => {
      selectedLanguage = e.target.value;
      if (codeEditor) {
        codeEditor.setOption('mode', getCodeMirrorMode(selectedLanguage));
      }
      updateCode();
    });
  }

  if (aiReviewBtn) {
    aiReviewBtn.addEventListener('click', performAiCodeReview);
  }

  // 속성 추출 적용 버튼
  if (elementAttrApplyBtn) {
    elementAttrApplyBtn.addEventListener('click', () => {
      const attrName = elementAttrNameInput ? elementAttrNameInput.value.trim() : '';
      if (!attrName) {
        setElementStatus('속성명을 입력하세요.', 'error');
        return;
      }
      if (selectionState.pendingAction === 'attribute') {
        selectionState.pendingAttribute = attrName;
        applySelectionAction('get_attribute', {attributeName: attrName});
        selectionState.pendingAction = null;
        selectionState.pendingAttribute = '';
      }
    });
  }

  // 상호작용 액션 버튼들
  const interactionActionsContainer = document.getElementById('interaction-actions');
  if (interactionActionsContainer) {
    interactionActionsContainer.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-interaction]');
      if (!button) return;
      const interactionType = button.dataset.interaction;
      handleInteractionAction(interactionType);
    });
  }

  // 검증 액션 버튼들
  const verifyActionsContainer = document.getElementById('verify-actions');
  if (verifyActionsContainer) {
    verifyActionsContainer.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-verify]');
      if (!button) return;
      const verifyType = button.dataset.verify;
      handleVerifyAction(verifyType);
    });
  }

  // 대기 액션 버튼들
  const waitActionsContainer = document.getElementById('wait-actions');
  if (waitActionsContainer) {
    waitActionsContainer.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-wait]');
      if (!button) return;
      const waitType = button.dataset.wait;
      handleWaitAction(waitType);
    });
  }

  // 대기 시간 적용 버튼
  const waitTimeApplyBtn = document.getElementById('wait-time-apply');
  const waitTimeInput = document.getElementById('wait-time-input');
  if (waitTimeApplyBtn && waitTimeInput) {
    waitTimeApplyBtn.addEventListener('click', () => {
      const timeValue = parseInt(waitTimeInput.value);
      if (isNaN(timeValue) || timeValue < 0) {
        alert('올바른 대기 시간을 입력하세요.');
        return;
      }
      addWaitAction('wait', timeValue, null);
      const waitInputPanel = document.getElementById('wait-input-panel');
      if (waitInputPanel) {
        waitInputPanel.classList.add('hidden');
      }
      waitTimeInput.value = '';
    });
  }

  // Action 메뉴 및 오버레이 토글 설정
  setupActionMenu();
  setupOverlayToggle();
}

// IPC 이벤트 리스너 설정 (Electron 환경)
function setupIpcListeners() {
  if (!electronAPI || !electronAPI.onIpcMessage) {
    console.warn('[Recorder] electronAPI.onIpcMessage가 없습니다. Electron 환경이 아닐 수 있습니다.');
    console.warn('[Recorder] electronAPI 상태:', {
      exists: !!electronAPI,
      hasOnIpcMessage: !!(electronAPI && electronAPI.onIpcMessage)
    });
    return;
  }
  
  console.log('[Recorder] IPC 리스너 설정 시작');
  
  // Main 프로세스에서 전송된 DOM 이벤트 수신
  electronAPI.onIpcMessage('dom-event', (data) => {
    console.log('[Recorder] IPC로 DOM 이벤트 수신:', data.action, 'recording 상태:', recording);
    if (!recording) {
      console.warn('[Recorder] 녹화 중이 아니므로 이벤트 무시');
      return;
    }
    handleDomEvent(data);
  });
  
  // 녹화 시작 신호 수신 (Main 프로세스에서)
  electronAPI.onIpcMessage('recording-start', (data) => {
    console.log('[Recorder] IPC로 녹화 시작 신호 수신', data);
    if (!recording) {
      console.log('[Recorder] startRecording() 호출');
      startRecording();
    } else {
      console.log('[Recorder] 이미 녹화 중입니다');
    }
  });
  
  // 녹화 중지 신호 수신 (Main 프로세스에서)
  electronAPI.onIpcMessage('recording-stop', (data) => {
    console.log('[Recorder] IPC로 녹화 중지 신호 수신', data);
    if (recording) {
      console.log('[Recorder] stopRecording() 호출');
      stopRecording();
    } else {
      console.log('[Recorder] 이미 녹화 중지 상태입니다');
    }
  });
  
  // 요소 하이라이트 정보 수신
  electronAPI.onIpcMessage('element-hover', (data) => {
    console.log('[Recorder] IPC로 요소 하이라이트 수신:', data.element?.tag);
    handleElementHover(data);
  });
  
  // 요소 하이라이트 해제
  electronAPI.onIpcMessage('element-hover-clear', (data) => {
    console.log('[Recorder] IPC로 요소 하이라이트 해제');
    clearElementHover();
  });
  
  console.log('[Recorder] IPC 리스너 설정 완료');
}

// DOM 요소 초기화
function initDOMElements() {
  startBtn = document.getElementById('start-record');
  stopBtn = document.getElementById('stop-record');
  timeline = document.getElementById('timeline');
  selectorList = document.getElementById('selector-list');
  iframeBanner = document.getElementById('iframe-banner');
  codeOutput = document.getElementById('code-output');
  logEntries = document.getElementById('log-entries');
  resetBtn = document.getElementById('reset-btn');
  elementSelectBtn = document.getElementById('element-select-btn');
  deleteEventBtn = document.getElementById('delete-event-btn');
  tcIdInput = document.getElementById('tc-id-input');
  projectIdInput = document.getElementById('project-id-input');
  sendRecordingBtn = document.getElementById('send-recording-btn');
  frameworkSelect = document.getElementById('framework-select');
  languageSelect = document.getElementById('language-select');
  aiReviewBtn = document.getElementById('ai-review-btn');
  aiReviewStatusEl = document.getElementById('ai-review-status');
  aiEndpointInput = document.getElementById('ai-endpoint');
  aiApiKeyInput = document.getElementById('ai-api-key');
  aiModelInput = document.getElementById('ai-model');
  aiSettingsSaveBtn = document.getElementById('ai-settings-save');
  aiSettingsStatusEl = document.getElementById('ai-settings-status');
  // 요소 선택 워크플로우 DOM 요소
  elementPanel = document.getElementById('element-panel');
  elementStatusEl = document.getElementById('element-status');
  elementPathContainer = document.getElementById('element-path');
  elementPathItems = document.getElementById('element-path-items');
  elementCandidatesContainer = document.getElementById('element-candidates');
  elementActionsContainer = document.getElementById('element-actions');
  elementCancelBtn = document.getElementById('element-cancel-btn');
  elementAttrPanel = document.getElementById('element-attribute-panel');
  elementAttrNameInput = document.getElementById('element-attr-name');
  elementAttrApplyBtn = document.getElementById('element-attr-apply');
  elementCodePreview = document.getElementById('element-code-preview');
  elementCodeEl = document.getElementById('element-code');
  
  // DOM 요소 확인
  if (!startBtn) {
    console.error('[Recorder] start-record 버튼을 찾을 수 없습니다');
  }
  if (!stopBtn) {
    console.error('[Recorder] stop-record 버튼을 찾을 수 없습니다');
  }
}

// 초기화
function init() {
  console.log('[Recorder] 초기화 시작');
  console.log('[Recorder] electronAPI 상태:', {
    exists: !!electronAPI,
    hasOnIpcMessage: !!(electronAPI && electronAPI.onIpcMessage),
    type: typeof electronAPI
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

  // WebSocket 연결
  connectWebSocket();

  // AI 설정 초기화
  setupAiSettings();

  // 초기 상태 설정
  updateDeleteButtonState();
  
  logMessage('녹화 모듈 준비 완료', 'success');
  console.log('[Recorder] 초기화 완료');
}

// DOMContentLoaded 이벤트 대기
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

