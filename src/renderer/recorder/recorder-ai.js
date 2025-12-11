/**
 * AI 관련 기능 모듈
 * AI 셀렉터 추천 및 코드 리뷰 기능을 담당
 */

import { inferSelectorType } from '../utils/selectorUtils.js';
import { getAiSelectorSuggestions, getAiCodeReview } from '../utils/aiService.js';

// AI 상태 관리
export const aiSuggestionState = new Map();
export const aiSettingsDefaults = { endpoint: '', apiKey: '', model: '' };
export let aiSettings = { ...aiSettingsDefaults };
export let aiSettingsLoaded = false;
export let aiSettingsDirty = false;
export const aiCodeReviewState = {
  status: 'idle',
  updatedAt: null,
  summary: '',
  changes: []
};

/**
 * AI 상태 키 생성
 */
export function getAiStateKey(event) {
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
export function getAiState(event) {
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
export function setAiState(event, patch) {
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
export function formatAiStatusTime(timestamp) {
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
export function appendAiMessage(selectorList, text, tone = 'info') {
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
export function sanitizeAiSettingValue(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

/**
 * AI 설정 상태 표시
 */
export function setAiSettingsStatus(aiSettingsStatusEl, text, tone) {
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
export function applyAiSettingsToInputs(aiEndpointInput, aiApiKeyInput, aiModelInput, settings = {}) {
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
export function isAiConfigured() {
  return !!(aiSettings && typeof aiSettings === 'object' && aiSettings.endpoint && aiSettings.endpoint.trim());
}

/**
 * AI 설정 로드 (Electron 환경용 - 간소화)
 */
export function loadAiSettingsFromStorage(aiEndpointInput, aiApiKeyInput, aiModelInput, aiSettingsStatusEl, refreshSelectorListFn) {
  try {
    // localStorage에서 로드 (chrome.storage 대신)
    const stored = JSON.parse(localStorage.getItem('aiSettings') || '{}');
    aiSettings = {
      endpoint: sanitizeAiSettingValue(stored.endpoint),
      apiKey: sanitizeAiSettingValue(stored.apiKey),
      model: sanitizeAiSettingValue(stored.model)
    };
    aiSettingsLoaded = true;
    const shouldSyncInputs = !aiSettingsDirty;
    if (shouldSyncInputs) {
      applyAiSettingsToInputs(aiEndpointInput, aiApiKeyInput, aiModelInput, aiSettings);
      if (!isAiConfigured()) {
        setAiSettingsStatus(aiSettingsStatusEl, 'AI API 엔드포인트를 설정하세요.', 'pending');
      } else {
        setAiSettingsStatus(aiSettingsStatusEl, 'AI 설정이 로드되었습니다.', 'success');
      }
    }
    if (refreshSelectorListFn) {
      refreshSelectorListFn();
    }
  } catch (err) {
    console.error('[Recorder] AI 설정 로드 오류:', err);
    aiSettings = { ...aiSettingsDefaults };
    aiSettingsLoaded = true;
  }
}

/**
 * AI 설정 변경 표시
 */
export function markAiSettingsDirty(aiSettingsStatusEl) {
  aiSettingsDirty = true;
  setAiSettingsStatus(aiSettingsStatusEl, '저장되지 않은 변경 사항이 있습니다.', 'pending');
}

/**
 * AI 설정 저장
 */
export function saveAiSettings(aiEndpointInput, aiApiKeyInput, aiModelInput, aiSettingsStatusEl, refreshSelectorListFn) {
  const nextSettings = {
    endpoint: sanitizeAiSettingValue(aiEndpointInput ? aiEndpointInput.value : ''),
    apiKey: sanitizeAiSettingValue(aiApiKeyInput ? aiApiKeyInput.value : ''),
    model: sanitizeAiSettingValue(aiModelInput ? aiModelInput.value : '')
  };
  setAiSettingsStatus(aiSettingsStatusEl, '저장 중...', 'pending');
  
  try {
    // localStorage에 저장 (chrome.storage.local 대신)
    localStorage.setItem('aiSettings', JSON.stringify(nextSettings));
    aiSettings = nextSettings;
    aiSettingsDirty = false;
    setAiSettingsStatus(aiSettingsStatusEl, 'AI 설정이 저장되었습니다.', 'success');
    if (refreshSelectorListFn) {
      refreshSelectorListFn();
    }
  } catch (err) {
    console.error('[Recorder] AI 설정 저장 오류:', err);
    setAiSettingsStatus(aiSettingsStatusEl, `AI 설정 저장에 실패했습니다: ${err.message}`, 'error');
  }
}

/**
 * AI 셀렉터 후보 정규화
 */
export function normalizeAiCandidates(candidates) {
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
export function buildAiRequestPayload(event) {
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
export async function requestAiSelectorsForEvent(
  event, 
  eventIndex, 
  getAllEventsFn, // allEvents 대신 getAllEvents 함수 전달
  selectedFramework, 
  selectedLanguage,
  showSelectorsFn
) {
  // getAllEventsFn를 통해 최신 allEvents 참조
  const currentEvents = getAllEventsFn ? getAllEventsFn() : [];
  const targetEvent = eventIndex >= 0 && currentEvents[eventIndex] ? currentEvents[eventIndex] : event;
  if (!targetEvent) return;
  
  if (!isAiConfigured()) {
    setAiState(targetEvent, {
      status: 'error',
      error: 'AI API 설정이 필요합니다. 상단에서 엔드포인트와 (필요 시) API 키를 저장하세요.'
    });
    if (showSelectorsFn) {
      showSelectorsFn(null, targetEvent, eventIndex);
    }
    return;
  }
  
  setAiState(targetEvent, { status: 'loading', error: null });
  if (showSelectorsFn) {
    showSelectorsFn(null, targetEvent, eventIndex);
  }
  
  const payload = buildAiRequestPayload(targetEvent);
  if (!payload) {
    setAiState(targetEvent, { status: 'error', error: '요청에 필요한 정보가 부족합니다.' });
    if (showSelectorsFn) {
      showSelectorsFn(null, targetEvent, eventIndex);
    }
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
      if (showSelectorsFn) {
        showSelectorsFn(null, targetEvent, eventIndex);
      }
      return;
    }
    
    const normalizedCandidates = normalizeAiCandidates(response.candidates || []);
    const updatedAt = Date.now();
    targetEvent.aiSelectorCandidates = normalizedCandidates;
    targetEvent.aiSelectorsUpdatedAt = updatedAt;
    
    // 최신 allEvents 업데이트
    const latestEvents = getAllEventsFn ? getAllEventsFn() : [];
    if (eventIndex >= 0 && latestEvents[eventIndex]) {
      latestEvents[eventIndex] = targetEvent;
    }
    
    setAiState(targetEvent, { status: 'loaded', error: null, updatedAt });
    if (showSelectorsFn) {
      showSelectorsFn(null, targetEvent, eventIndex);
    }
  } catch (error) {
    console.error('[Recorder] AI 셀렉터 요청 오류:', error);
    setAiState(targetEvent, {
      status: 'error',
      error: error.message || 'AI 추천 요청 중 오류가 발생했습니다.'
    });
    if (showSelectorsFn) {
      showSelectorsFn(null, targetEvent, eventIndex);
    }
  }
}

/**
 * AI 요청 컨트롤 렌더링
 */
export function renderAiRequestControls(
  event, 
  resolvedIndex, 
  selectorList, 
  requestAiSelectorsFn
) {
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
    if (requestAiSelectorsFn) {
      requestAiSelectorsFn(event, resolvedIndex);
    }
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

/**
 * AI 코드 리뷰 수행
 */
export async function performAiCodeReview(
  codeEditor,
  codeOutput,
  aiReviewBtn,
  aiReviewStatusEl,
  selectedFramework,
  selectedLanguage,
  allEvents,
  setCodeTextFn,
  logMessageFn
) {
  if (!aiReviewBtn || !codeOutput) return;

  const code = codeEditor ? codeEditor.getValue() : codeOutput.value;
  if (!code || code.trim().length === 0) {
    alert('리뷰할 코드가 없습니다.');
    return;
  }

  // AI 설정 확인
  const currentAiSettings = {
    endpoint: document.getElementById('ai-endpoint')?.value || '',
    apiKey: document.getElementById('ai-api-key')?.value || '',
    model: document.getElementById('ai-model')?.value || ''
  };

  if (!currentAiSettings.endpoint || !currentAiSettings.apiKey) {
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
      currentAiSettings
    );

    if (result.success && result.data) {
      if (aiReviewStatusEl) {
        aiReviewStatusEl.textContent = '리뷰 완료';
        aiReviewStatusEl.className = 'code-review-status success';
      }

      // 리뷰 결과 표시
      if (result.data.updatedCode && setCodeTextFn) {
        setCodeTextFn(result.data.updatedCode);
      }

      if (result.data.summary && logMessageFn) {
        logMessageFn(`AI 리뷰: ${result.data.summary}`, 'info');
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
