/**
 * 요소 선택 워크플로우 모듈
 * 요소 선택, 후보 렌더링, 액션 적용 기능을 담당
 */

import { inferSelectorType } from '../utils/selectorUtils.js';
import { highlightSelector } from './recorder-selectors.js';
import {
  addVerifyAction,
  addWaitAction,
  addInteractionAction,
  buildManualActionEntry,
  addManualAction,
  captureVerifyImageScreenshot
} from './recorder-actions.js';

// 요소 선택 상태 관리
export const selectionState = {
  active: false,
  stage: 'idle', // 'idle' | 'await-root' | 'await-candidate' | 'await-action' | 'await-child' | 'await-parent'
  stack: [], // 선택된 노드 스택
  pendingAction: null, // 'verifyText' | 'verifyElementPresent' | 'waitForElement' | 'click' | 'type' 등
  pendingStepIndex: null, // assertion을 추가할 스텝 인덱스
  pendingAttribute: '',
  codePreview: ''
};

// 심플 요소 선택 상태 관리 (Add assertion/wait 전용)
export const simpleSelectionState = {
  active: false,
  callback: null, // (path, elementInfo) => void
  pendingAction: null, // 'verifyText' | 'verifyElementPresent' | 'waitForElement' 등
  pendingStepIndex: null
};

/**
 * 요소 상태 메시지 설정
 */
export function setElementStatus(message, tone, elementStatusEl) {
  if (!elementStatusEl) return;
  elementStatusEl.textContent = message || '';
  elementStatusEl.setAttribute('data-tone', tone || 'info');
  elementStatusEl.style.display = message ? 'block' : 'none';
}

/**
 * 요소 선택 버튼 상태 업데이트
 */
export function updateElementButtonState(selectionStateRef, elementSelectBtn) {
  if (!elementSelectBtn) return;
  if (selectionStateRef.active) {
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
export function ensureElementPanelVisibility(selectionStateRef, elementPanel) {
  if (!elementPanel) return;
  if (selectionStateRef.active || selectionStateRef.stack.length > 0) {
    elementPanel.classList.remove('hidden');
  } else {
    elementPanel.classList.add('hidden');
  }
}

/**
 * 선택 UI 초기화
 */
export function resetSelectionUI(
  elementPathItems,
  elementPathContainer,
  elementCandidatesContainer,
  elementActionsContainer,
  elementAttrPanel,
  elementAttrNameInput,
  elementCodePreview,
  elementCodeEl
) {
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
export function resetSelectionState(
  selectionStateRef,
  options,
  setElementStatusFn,
  resetSelectionUIFn,
  updateElementButtonStateFn,
  ensureElementPanelVisibilityFn
) {
  selectionStateRef.active = false;
  selectionStateRef.stage = 'idle';
  selectionStateRef.stack = [];
  selectionStateRef.pendingAction = null;
  selectionStateRef.pendingAttribute = '';
  selectionStateRef.codePreview = '';
  if (!options.keepStatus) {
    if (setElementStatusFn) {
      setElementStatusFn('', 'info');
    }
  }
  if (resetSelectionUIFn) {
    resetSelectionUIFn();
  }
  if (updateElementButtonStateFn) {
    updateElementButtonStateFn();
  }
  if (ensureElementPanelVisibilityFn) {
    ensureElementPanelVisibilityFn();
  }
}

/**
 * 현재 선택 노드 가져오기
 */
export function getCurrentSelectionNode(selectionStateRef) {
  if (!selectionStateRef.stack.length) return null;
  return selectionStateRef.stack[selectionStateRef.stack.length - 1];
}

/**
 * 선택 경로 렌더링
 */
export function renderSelectionPath(selectionStateRef, elementPathItems, elementPathContainer) {
  if (!elementPathItems || !elementPathContainer) return;
  elementPathItems.innerHTML = '';
  if (selectionStateRef.stack.length === 0) {
    elementPathContainer.classList.add('hidden');
    return;
  }
  elementPathContainer.classList.remove('hidden');
  selectionStateRef.stack.forEach((node, index) => {
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
export function createSelectionCandidateItem(
  node,
  candidate,
  inferSelectorTypeFn,
  applyCandidateToNodeFn,
  highlightSelectorFn,
  logMessageFn
) {
  const item = document.createElement('div');
  item.className = 'selector-item';
  const selectorType = candidate.type || (inferSelectorTypeFn ? inferSelectorTypeFn(candidate.selector) : 'css');
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
  const isSelected = node.selectedCandidate && node.selectedCandidate.selector === candidate.selector && (node.selectedCandidate.type || (inferSelectorTypeFn ? inferSelectorTypeFn(node.selectedCandidate.selector) : 'css')) === (candidate.type || (inferSelectorTypeFn ? inferSelectorTypeFn(candidate.selector) : 'css'));
  
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
  
  if (applyBtn && applyCandidateToNodeFn) {
    applyBtn.addEventListener('click', () => {
      applyCandidateToNodeFn(node, candidate);
    });
  }
  
  if (highlightBtn && highlightSelectorFn) {
    highlightBtn.addEventListener('click', () => {
      highlightSelectorFn(candidate, logMessageFn);
    });
  }
  
  return item;
}

/**
 * 선택 후보 렌더링
 */
export function renderSelectionCandidates(
  node,
  elementCandidatesContainer,
  createSelectionCandidateItemFn
) {
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
    elementCandidatesContainer.appendChild(createSelectionCandidateItemFn(node, candidate));
  });
}

/**
 * 선택 액션 표시 여부 업데이트
 */
export function updateSelectionActionsVisibility(
  selectionStateRef,
  elementActionsContainer,
  elementAttrPanel,
  elementAttrNameInput,
  getCurrentSelectionNodeFn
) {
  if (!elementActionsContainer) return;
  const currentNode = getCurrentSelectionNodeFn ? getCurrentSelectionNodeFn(selectionStateRef) : null;
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
export function buildSelectionPathArray(selectionStateRef, inferSelectorTypeFn) {
  return selectionStateRef.stack
    .map((node) => {
      if (!node.selectedCandidate) return null;
      const candidate = node.selectedCandidate;
      return {
        selector: candidate.selector,
        type: candidate.type || (inferSelectorTypeFn ? inferSelectorTypeFn(candidate.selector) : 'css'),
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
 * 선택 미리보기 라인 생성
 */
export function buildSelectionPreviewLines(path, framework, language, inferSelectorTypeFn) {
  if (!path || !path.length) return [];
  
  const lines = [];
  const lastItem = path[path.length - 1];
  if (!lastItem || !lastItem.selector) return [];
  
  const selector = lastItem.selector;
  const selectorType = lastItem.type || (inferSelectorTypeFn ? inferSelectorTypeFn(selector) : 'css');
  
  if (framework === 'playwright') {
    if (language === 'python' || language === 'python-class') {
      if (selectorType === 'css' || selectorType === 'xpath') {
        lines.push(`page.locator("${selector}")`);
      } else if (selectorType === 'id') {
        lines.push(`page.locator("#${selector.replace(/^#/, '')}")`);
      } else {
        lines.push(`page.locator("${selector}")`);
      }
    } else if (language === 'javascript' || language === 'typescript') {
      if (selectorType === 'css' || selectorType === 'xpath') {
        lines.push(`page.locator("${selector}")`);
      } else {
        lines.push(`page.locator("${selector}")`);
      }
    }
  } else if (framework === 'selenium') {
    if (language === 'python' || language === 'python-class') {
      if (selectorType === 'id') {
        lines.push(`driver.find_element(By.ID, "${selector.replace(/^#/, '')}")`);
      } else if (selectorType === 'css') {
        lines.push(`driver.find_element(By.CSS_SELECTOR, "${selector}")`);
      } else if (selectorType === 'xpath') {
        lines.push(`driver.find_element(By.XPATH, "${selector}")`);
      } else {
        lines.push(`driver.find_element(By.CSS_SELECTOR, "${selector}")`);
      }
    }
  } else if (framework === 'cypress') {
    if (selectorType === 'css' || selectorType === 'id') {
      lines.push(`cy.get("${selector}")`);
    } else {
      lines.push(`cy.get("${selector}")`);
    }
  }
  
  return lines.length > 0 ? lines : [`// 선택 경로: ${path.length}개 요소`];
}

/**
 * 선택 코드 미리보기 업데이트
 */
export function updateSelectionCodePreview(
  selectionStateRef,
  selectedFramework,
  selectedLanguage,
  elementCodePreview,
  elementCodeEl,
  buildSelectionPathArrayFn,
  buildSelectionPreviewLinesFn
) {
  if (!elementCodePreview || !elementCodeEl) return;
  const path = buildSelectionPathArrayFn ? buildSelectionPathArrayFn(selectionStateRef) : [];
  if (!path.length) {
    elementCodePreview.classList.add('hidden');
    elementCodeEl.textContent = '';
    return;
  }
  const previewLines = buildSelectionPreviewLinesFn ? buildSelectionPreviewLinesFn(path, selectedFramework, selectedLanguage) : [];
  elementCodeEl.textContent = previewLines.join('\n');
  elementCodePreview.classList.remove('hidden');
}

/**
 * 후보를 노드에 적용
 */
export function applyCandidateToNode(
  node,
  candidate,
  selectionStateRef,
  inferSelectorTypeFn,
  renderSelectionCandidatesFn,
  renderSelectionPathFn,
  updateSelectionActionsVisibilityFn,
  updateSelectionCodePreviewFn,
  setElementStatusFn
) {
  if (!node) return;
  node.selectedCandidate = {
    ...candidate,
    type: candidate.type || (inferSelectorTypeFn ? inferSelectorTypeFn(candidate.selector) : 'css')
  };
  if (renderSelectionCandidatesFn) {
    renderSelectionCandidatesFn(node);
  }
  if (renderSelectionPathFn) {
    renderSelectionPathFn(selectionStateRef);
  }
  selectionStateRef.stage = 'await-action';
  if (updateSelectionActionsVisibilityFn) {
    updateSelectionActionsVisibilityFn(selectionStateRef);
  }
  if (updateSelectionCodePreviewFn) {
    updateSelectionCodePreviewFn(selectionStateRef);
  }
  if (setElementStatusFn) {
    setElementStatusFn('동작을 선택하세요.', 'info');
  }
}

/**
 * 선택 메시지 전송 (Electron 환경용 - 간소화)
 */
export function sendSelectionMessage(payload, callback, wsConnection) {
  // Electron 환경에서는 WebSocket을 통해 Content Script에 메시지 전송
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    // payload에 type이 있으면 그대로 사용, 없으면 element-selection으로 래핑
    const message = payload.type ? payload : { type: 'element-selection', ...payload };
    console.log('[Recorder] sendSelectionMessage 전송:', JSON.stringify(message, null, 2));
    wsConnection.send(JSON.stringify(message));
    if (callback) callback({ok: true});
  } else {
    if (callback) callback({ok: false, reason: 'WebSocket not connected'});
  }
}

/**
 * 요소 선택 요청
 */
export function requestElementPick(
  mode,
  sendSelectionMessageFn,
  setElementStatusFn,
  cancelSelectionWorkflowFn
) {
  const message = mode === 'child' ? {type: 'ELEMENT_SELECTION_PICK_CHILD'} : {type: 'ELEMENT_SELECTION_START'};
  if (sendSelectionMessageFn) {
    sendSelectionMessageFn(message, (resp) => {
      if (resp && resp.ok === false && resp.reason) {
        if (setElementStatusFn) {
          setElementStatusFn(`요소 선택을 시작할 수 없습니다: ${resp.reason}`, 'error');
        }
        if (mode === 'root' && cancelSelectionWorkflowFn) {
          cancelSelectionWorkflowFn('', 'info');
        }
      }
    });
  }
}

/**
 * 선택 워크플로우 시작
 */
export function startSelectionWorkflow(
  selectionStateRef,
  resetSelectionStateFn,
  setElementStatusFn,
  ensureElementPanelVisibilityFn,
  updateElementButtonStateFn,
  requestElementPickFn
) {
  if (resetSelectionStateFn) {
    resetSelectionStateFn(selectionStateRef, {keepStatus: true});
  }
  selectionStateRef.active = true;
  selectionStateRef.stage = 'await-root';
  if (setElementStatusFn) {
    setElementStatusFn('페이지에서 요소를 클릭하세요.', 'info');
  }
  if (ensureElementPanelVisibilityFn) {
    ensureElementPanelVisibilityFn(selectionStateRef);
  }
  if (updateElementButtonStateFn) {
    updateElementButtonStateFn(selectionStateRef);
  }
  if (requestElementPickFn) {
    requestElementPickFn('root');
  }
}

/**
 * 선택 워크플로우 취소
 */
export function cancelSelectionWorkflow(
  message,
  tone,
  selectionStateRef,
  sendSelectionMessageFn,
  resetSelectionStateFn,
  setElementStatusFn
) {
  if (selectionStateRef.active || selectionStateRef.stage !== 'idle') {
    if (sendSelectionMessageFn) {
      sendSelectionMessageFn({type: 'ELEMENT_SELECTION_CANCEL'}, () => {});
    }
  }
  if (resetSelectionStateFn) {
    resetSelectionStateFn(selectionStateRef, {keepStatus: true});
  }
  if (message) {
    if (setElementStatusFn) {
      setElementStatusFn(message, tone);
    }
  } else {
    if (setElementStatusFn) {
      setElementStatusFn('', 'info');
    }
  }
}

/**
 * 심플 요소 선택 시작 (Add assertion/wait 전용)
 */
export function startSimpleElementSelection(
  callback,
  pendingAction,
  pendingStepIndex,
  selectionStateRef,
  simpleSelectionStateRef,
  cancelSelectionWorkflowFn,
  elementStatusEl,
  sendSelectionMessageFn
) {
  // 기존 요소 선택 모드가 활성화되어 있으면 먼저 취소
  if (selectionStateRef.active && cancelSelectionWorkflowFn) {
    cancelSelectionWorkflowFn('', 'info', selectionStateRef);
  }
  
  // 상태 초기화
  simpleSelectionStateRef.active = true;
  simpleSelectionStateRef.callback = callback;
  simpleSelectionStateRef.pendingAction = pendingAction;
  simpleSelectionStateRef.pendingStepIndex = pendingStepIndex;
  
  // 상태 메시지 표시
  let message = '요소를 선택하세요.';
  if (pendingAction === 'verifyText') {
    message = '텍스트를 검증할 요소를 선택하세요.';
  } else if (pendingAction === 'verifyElementPresent' || pendingAction === 'verifyElementNotPresent') {
    message = '검증할 요소를 선택하세요.';
  } else if (pendingAction === 'waitForElement') {
    message = '대기할 요소를 선택하세요.';
  }
  
  if (elementStatusEl) {
    elementStatusEl.textContent = message;
    elementStatusEl.className = 'element-status info';
  }
  
  // 요소 선택 시작
  console.log('[Recorder] 심플 요소 선택 시작:', { 
    pendingAction, 
    pendingStepIndex,
    active: simpleSelectionStateRef.active,
    hasCallback: !!simpleSelectionStateRef.callback
  });
  if (sendSelectionMessageFn) {
    sendSelectionMessageFn({type: 'ELEMENT_SELECTION_START'}, (resp) => {
      console.log('[Recorder] 요소 선택 시작 응답:', resp, '현재 active:', simpleSelectionStateRef.active);
      if (resp && resp.ok === false && resp.reason) {
        simpleSelectionStateRef.active = false;
        simpleSelectionStateRef.callback = null;
        simpleSelectionStateRef.pendingAction = null;
        simpleSelectionStateRef.pendingStepIndex = null;
        if (elementStatusEl) {
          elementStatusEl.textContent = `요소 선택을 시작할 수 없습니다: ${resp.reason}`;
          elementStatusEl.className = 'element-status error';
        }
      } else {
        console.log('[Recorder] 요소 선택 모드 활성화됨, 브라우저에서 요소를 클릭하세요. active:', simpleSelectionStateRef.active);
      }
    });
  }
}

/**
 * 심플 요소 선택 완료 처리
 */
export function handleSimpleElementSelectionPicked(
  msg,
  simpleSelectionStateRef,
  inferSelectorTypeFn,
  elementStatusEl,
  sendSelectionMessageFn
) {
  console.log('[Recorder] handleSimpleElementSelectionPicked 호출:', {
    active: simpleSelectionStateRef.active,
    hasCallback: !!simpleSelectionStateRef.callback,
    pendingAction: simpleSelectionStateRef.pendingAction,
    selectorsCount: msg.selectors?.length || 0
  });
  
  // 상태 확인 및 콜백 백업 (상태 초기화 전에)
  const wasActive = simpleSelectionStateRef.active;
  const callback = simpleSelectionStateRef.callback;
  const pendingAction = simpleSelectionStateRef.pendingAction;
  const pendingStepIndex = simpleSelectionStateRef.pendingStepIndex;
  
  if (!wasActive || !callback) {
    console.warn('[Recorder] handleSimpleElementSelectionPicked: 상태가 활성화되지 않았거나 콜백이 없음');
    // 상태가 활성화되지 않았어도 ELEMENT_SELECTION_CANCEL 전송하여 Content Script 해제
    if (sendSelectionMessageFn) {
      sendSelectionMessageFn({type: 'ELEMENT_SELECTION_CANCEL'}, () => {});
    }
    return;
  }
  
  const candidates = (msg.selectors || []).map((cand) => ({
    ...cand,
    type: cand.type || (inferSelectorTypeFn ? inferSelectorTypeFn(cand.selector) : 'css')
  }));
  
  if (candidates.length === 0) {
    // 후보가 없으면 오류 처리
    console.warn('[Recorder] handleSimpleElementSelectionPicked: 셀렉터 후보가 없음');
    simpleSelectionStateRef.active = false;
    simpleSelectionStateRef.callback = null;
    simpleSelectionStateRef.pendingAction = null;
    simpleSelectionStateRef.pendingStepIndex = null;
    if (elementStatusEl) {
      elementStatusEl.textContent = '요소를 선택할 수 없습니다.';
      elementStatusEl.className = 'element-status error';
    }
    return;
  }
  
  // 첫 번째 후보를 사용하여 path 생성
  const firstCandidate = candidates[0];
  const path = [{
    selector: firstCandidate.selector,
    type: firstCandidate.type || (inferSelectorTypeFn ? inferSelectorTypeFn(firstCandidate.selector) : 'css'),
    textValue: firstCandidate.textValue || null,
    xpathValue: firstCandidate.xpathValue || null,
    matchMode: firstCandidate.matchMode || null,
    iframeContext: msg.element?.iframeContext || null
  }];
  
  const elementInfo = {
    text: msg.element?.text || firstCandidate.textValue || '',
    iframeContext: msg.element?.iframeContext || null,
    tag: msg.element?.tag || null,
    id: msg.element?.id || null,
    className: msg.element?.className || null,
    value: msg.element?.value || null,
    clientRect: msg.clientRect || null,
    page: msg.page || null,
    selectorCandidates: msg.selectors || candidates || []
  };
  
  console.log('[Recorder] handleSimpleElementSelectionPicked: 콜백 호출 준비:', {
    pendingAction,
    pendingStepIndex,
    pathSelector: path[0]?.selector
  });
  
  // 상태 초기화 (콜백 호출 전에 초기화하여 중복 호출 방지)
  simpleSelectionStateRef.active = false;
  simpleSelectionStateRef.callback = null;
  simpleSelectionStateRef.pendingAction = null;
  simpleSelectionStateRef.pendingStepIndex = null;
  
  // 요소 선택 종료를 먼저 전송하여 Content Script의 isElementSelectionMode를 즉시 해제
  // (콜백 호출 전에 전송하여 이후 클릭 이벤트가 무시되도록 함)
  if (sendSelectionMessageFn) {
    sendSelectionMessageFn({type: 'ELEMENT_SELECTION_CANCEL'}, () => {});
  }
  
  // 콜백 호출
  try {
    callback(path, elementInfo, pendingAction, pendingStepIndex);
    console.log('[Recorder] handleSimpleElementSelectionPicked: 콜백 호출 완료');
  } catch (error) {
    console.error('[Recorder] handleSimpleElementSelectionPicked: 콜백 호출 오류:', error);
  }
}

/**
 * 심플 요소 선택 취소
 */
export function cancelSimpleElementSelection(
  simpleSelectionStateRef,
  elementStatusEl,
  sendSelectionMessageFn
) {
  if (simpleSelectionStateRef.active) {
    if (sendSelectionMessageFn) {
      sendSelectionMessageFn({type: 'ELEMENT_SELECTION_CANCEL'}, () => {});
    }
    simpleSelectionStateRef.active = false;
    simpleSelectionStateRef.callback = null;
    simpleSelectionStateRef.pendingAction = null;
    simpleSelectionStateRef.pendingStepIndex = null;
    if (elementStatusEl) {
      elementStatusEl.textContent = '';
    }
  }
}

/**
 * 요소 선택 완료 처리
 */
export async function handleElementSelectionPicked(
  msg,
  selectionStateRef,
  inferSelectorTypeFn,
  updateElementButtonStateFn,
  addAssertionAfterStepFn,
  addVerifyActionFn,
  addWaitActionFn,
  normalizeEventRecordFn,
  allEvents,
  updateCodeFn,
  syncTimelineFromEventsFn,
  saveEventAsStepFn,
  setElementStatusFn,
  captureVerifyImageScreenshotFn,
  electronAPI,
  initElectronAPIFn,
  cancelSelectionWorkflowFn,
  renderSelectionPathFn,
  renderSelectionCandidatesFn,
  updateSelectionActionsVisibilityFn,
  updateSelectionCodePreviewFn,
  ensureElementPanelVisibilityFn,
  getCurrentSelectionNodeFn
) {
  if (!selectionStateRef.active) {
    selectionStateRef.active = true;
    if (updateElementButtonStateFn) {
      updateElementButtonStateFn(selectionStateRef);
    }
  }
  const candidates = (msg.selectors || []).map((cand) => ({
    ...cand,
    type: cand.type || (inferSelectorTypeFn ? inferSelectorTypeFn(cand.selector) : 'css')
  }));
  
  // pendingAction이 있고 후보가 있으면 바로 이벤트 추가 (UI 표시 없이)
  if (selectionStateRef.pendingAction && candidates.length > 0) {
    const firstCandidate = candidates[0];
    
    // path 생성
    const path = [{
      selector: firstCandidate.selector,
      type: firstCandidate.type || (inferSelectorTypeFn ? inferSelectorTypeFn(firstCandidate.selector) : 'css'),
      textValue: firstCandidate.textValue || null,
      xpathValue: firstCandidate.xpathValue || null,
      matchMode: firstCandidate.matchMode || null,
      iframeContext: msg.element?.iframeContext || null
    }];
    
    const pending = selectionStateRef.pendingAction;
    const pendingStepIndex = selectionStateRef.pendingStepIndex;
    
    // pendingAction에 따라 이벤트 추가
    if (pending.startsWith('verify')) {
      let value = null;
      if (pending === 'verifyText') {
        // 요소의 텍스트를 기본값으로 사용
        const elementText = msg.element?.text || firstCandidate.textValue || '';
        const textValue = prompt('검증할 텍스트를 입력하세요:', elementText);
        if (textValue === null) {
          // 취소 시 워크플로우 종료
          selectionStateRef.pendingAction = null;
          selectionStateRef.pendingStepIndex = null;
          if (cancelSelectionWorkflowFn) {
            cancelSelectionWorkflowFn('요소 선택이 취소되었습니다.', 'info', selectionStateRef);
          }
          return;
        }
        value = textValue || elementText;
      } else if (pending === 'verifyElementPresent' || pending === 'verifyElementNotPresent') {
        // 요소 존재/부재 검증은 value 불필요
        value = null;
      }
      
      // pendingStepIndex가 있으면 addAssertionAfterStep 사용, 없으면 addVerifyAction 사용
      if (pendingStepIndex !== null && pendingStepIndex !== undefined && addAssertionAfterStepFn) {
        addAssertionAfterStepFn(pendingStepIndex, pending, path, value);
        selectionStateRef.pendingStepIndex = null;
      } else if (addVerifyActionFn) {
        await addVerifyActionFn(
          pending,
          path,
          value,
          null,
          normalizeEventRecordFn,
          allEvents,
          updateCodeFn,
          syncTimelineFromEventsFn,
          saveEventAsStepFn,
          setElementStatusFn,
          captureVerifyImageScreenshotFn ? (clientRect) => captureVerifyImageScreenshotFn(clientRect, electronAPI, initElectronAPIFn) : null
        );
      }
      selectionStateRef.pendingAction = null;
      if (cancelSelectionWorkflowFn) {
        cancelSelectionWorkflowFn('', 'info', selectionStateRef);
      }
      return;
    } else if (pending === 'waitForElement' && addWaitActionFn) {
      addWaitActionFn(
        'waitForElement',
        null,
        path,
        null,
        normalizeEventRecordFn,
        allEvents,
        updateCodeFn,
        syncTimelineFromEventsFn,
        saveEventAsStepFn,
        null
      );
      selectionStateRef.pendingAction = null;
      if (cancelSelectionWorkflowFn) {
        cancelSelectionWorkflowFn('', 'info', selectionStateRef);
      }
      return;
    }
  }
  
  // pendingAction이 없거나 후보가 없는 경우 기존 로직 유지
  const node = {
    element: msg.element || {},
    candidates,
    selectedCandidate: null,
    stage: msg.stage || (selectionStateRef.stack.length === 0 ? 'root' : 'child')
  };
  selectionStateRef.stack.push(node);
  selectionStateRef.stage = 'await-candidate';
  if (renderSelectionPathFn) {
    renderSelectionPathFn(selectionStateRef);
  }
  if (renderSelectionCandidatesFn) {
    renderSelectionCandidatesFn(node);
  }
  if (updateSelectionActionsVisibilityFn) {
    updateSelectionActionsVisibilityFn(selectionStateRef);
  }
  if (updateSelectionCodePreviewFn) {
    updateSelectionCodePreviewFn(selectionStateRef);
  }
  if (ensureElementPanelVisibilityFn) {
    ensureElementPanelVisibilityFn(selectionStateRef);
  }
  
  // pendingAction에 따라 다른 메시지 표시
  if (selectionStateRef.pendingAction) {
    if (selectionStateRef.pendingAction === 'verifyText') {
      if (setElementStatusFn) {
        setElementStatusFn('후보를 선택한 후 텍스트를 입력하세요.', 'info');
      }
    } else if (selectionStateRef.pendingAction === 'verifyElementPresent' || 
               selectionStateRef.pendingAction === 'verifyElementNotPresent') {
      if (setElementStatusFn) {
        setElementStatusFn('후보를 선택하면 검증이 완료됩니다.', 'info');
      }
    } else {
      if (setElementStatusFn) {
        setElementStatusFn('후보 중 하나를 선택하세요.', 'info');
      }
    }
  } else {
    if (setElementStatusFn) {
      setElementStatusFn('후보 중 하나를 선택하세요.', 'info');
    }
  }
}

/**
 * 요소 선택 오류 처리
 */
export function handleElementSelectionError(
  msg,
  selectionStateRef,
  setElementStatusFn,
  requestElementPickFn
) {
  const reason = msg && msg.reason ? msg.reason : '요소를 선택할 수 없습니다.';
  if (setElementStatusFn) {
    setElementStatusFn(reason, 'error');
  }
  const stage = msg && msg.stage ? msg.stage : 'root';
  if (selectionStateRef.active && requestElementPickFn) {
    requestElementPickFn(stage === 'child' ? 'child' : 'root');
  }
}

/**
 * 요소 선택 취소 처리
 */
export function handleElementSelectionCancelled(
  selectionStateRef,
  cancelSelectionWorkflowFn
) {
  if (!selectionStateRef.active && selectionStateRef.stack.length === 0) return;
  if (cancelSelectionWorkflowFn) {
    cancelSelectionWorkflowFn('페이지에서 요소 선택이 취소되었습니다.', 'info', selectionStateRef);
  }
}

/**
 * 자식 선택 시작
 */
export function startChildSelection(
  selectionStateRef,
  getCurrentSelectionNodeFn,
  setElementStatusFn,
  updateSelectionActionsVisibilityFn,
  requestElementPickFn
) {
  const currentNode = getCurrentSelectionNodeFn ? getCurrentSelectionNodeFn(selectionStateRef) : null;
  if (!currentNode || !currentNode.selectedCandidate) {
    if (setElementStatusFn) {
      setElementStatusFn('먼저 후보를 선택하세요.', 'error');
    }
    return;
  }
  selectionStateRef.stage = 'await-child';
  if (updateSelectionActionsVisibilityFn) {
    updateSelectionActionsVisibilityFn(selectionStateRef);
  }
  if (setElementStatusFn) {
    setElementStatusFn('부모 요소 내부에서 자식 요소를 클릭하세요.', 'info');
  }
  if (requestElementPickFn) {
    requestElementPickFn('child');
  }
}

/**
 * 부모 선택 시작
 */
export function startParentSelection(
  selectionStateRef,
  getCurrentSelectionNodeFn,
  setElementStatusFn,
  updateSelectionActionsVisibilityFn,
  sendSelectionMessageFn
) {
  const currentNode = getCurrentSelectionNodeFn ? getCurrentSelectionNodeFn(selectionStateRef) : null;
  if (!currentNode || !currentNode.selectedCandidate) {
    if (setElementStatusFn) {
      setElementStatusFn('먼저 후보를 선택하세요.', 'error');
    }
    return;
  }
  selectionStateRef.stage = 'await-parent';
  if (updateSelectionActionsVisibilityFn) {
    updateSelectionActionsVisibilityFn(selectionStateRef);
  }
  if (setElementStatusFn) {
    setElementStatusFn('상위 요소 정보를 가져오는 중입니다...', 'info');
  }
  if (sendSelectionMessageFn) {
    sendSelectionMessageFn({type: 'ELEMENT_SELECTION_PICK_PARENT'}, (resp) => {
      if (resp && resp.ok === false) {
        selectionStateRef.stage = 'await-action';
        if (updateSelectionActionsVisibilityFn) {
          updateSelectionActionsVisibilityFn(selectionStateRef);
        }
        let message = '상위 요소를 찾을 수 없습니다.';
        if (resp.reason === 'no_parent') {
          message = '더 이상 상위 요소가 없습니다.';
        } else if (resp.reason === 'current_not_selected') {
          message = '먼저 요소를 선택하세요.';
        }
        if (setElementStatusFn) {
          setElementStatusFn(message, 'error');
        }
      }
    });
  }
}

/**
 * 요소 액션 처리
 */
export async function handleElementAction(
  action,
  selectionStateRef,
  getCurrentSelectionNodeFn,
  setElementStatusFn,
  applySelectionActionFn,
  startChildSelectionFn,
  startParentSelectionFn,
  cancelSelectionWorkflowFn,
  elementAttrPanel,
  elementAttrNameInput
) {
  if (!action) return;
  const currentNode = getCurrentSelectionNodeFn ? getCurrentSelectionNodeFn(selectionStateRef) : null;
  if (!currentNode || !currentNode.selectedCandidate) {
    if (setElementStatusFn) {
      setElementStatusFn('먼저 후보를 선택하세요.', 'error');
    }
    return;
  }
  switch (action) {
    case 'click':
      if (applySelectionActionFn) {
        await applySelectionActionFn('click', {}, selectionStateRef);
      }
      break;
    case 'text':
      if (applySelectionActionFn) {
        await applySelectionActionFn('extract_text', {}, selectionStateRef);
      }
      break;
    case 'value':
      if (applySelectionActionFn) {
        await applySelectionActionFn('get_attribute', {attributeName: 'value'}, selectionStateRef);
      }
      break;
    case 'attribute':
      if (elementAttrPanel) {
        elementAttrPanel.classList.remove('hidden');
      }
      if (elementAttrNameInput) {
        elementAttrNameInput.value = '';
        elementAttrNameInput.focus();
      }
      selectionStateRef.pendingAction = 'attribute';
      if (setElementStatusFn) {
        setElementStatusFn('추출할 속성명을 입력하고 적용을 누르세요.', 'info');
      }
      break;
    case 'child':
      if (startChildSelectionFn) {
        startChildSelectionFn(selectionStateRef);
      }
      break;
    case 'parent':
      if (startParentSelectionFn) {
        startParentSelectionFn(selectionStateRef);
      }
      break;
    case 'commit':
      if (applySelectionActionFn) {
        await applySelectionActionFn('commit', {}, selectionStateRef);
      }
      break;
    case 'finish':
      if (cancelSelectionWorkflowFn) {
        cancelSelectionWorkflowFn('요소 선택을 종료했습니다.', 'info', selectionStateRef);
      }
      break;
    default:
      break;
  }
}

/**
 * 선택 액션 적용 (8단계 완성)
 */
export async function applySelectionAction(
  actionType,
  options,
  selectionStateRef,
  buildSelectionPathArrayFn,
  setElementStatusFn,
  getCurrentSelectionNodeFn,
  addAssertionAfterStepFn,
  addVerifyActionFn,
  addWaitActionFn,
  addInteractionActionFn,
  buildManualActionEntryFn,
  addManualActionFn,
  normalizeEventRecordFn,
  allEvents,
  updateCodeFn,
  syncTimelineFromEventsFn,
  saveEventAsStepFn,
  captureVerifyImageScreenshotFn,
  electronAPI,
  initElectronAPIFn,
  cancelSelectionWorkflowFn,
  logMessageFn,
  manualActionsRef,
  manualActionSerialRef,
  selectedFramework,
  selectedLanguage
) {
  const path = buildSelectionPathArrayFn ? buildSelectionPathArrayFn(selectionStateRef) : [];
  if (!path.length) {
    if (setElementStatusFn) {
      setElementStatusFn('먼저 요소를 선택하세요.', 'error');
    }
    return;
  }
  
  // pendingAction이 verify, wait, interaction인 경우 처리
  if (selectionStateRef.pendingAction) {
    const pending = selectionStateRef.pendingAction;
    if (pending.startsWith('verify')) {
      let value = null;
      if (pending === 'verifyText') {
        // 요소의 텍스트를 기본값으로 사용
        const currentNode = getCurrentSelectionNodeFn ? getCurrentSelectionNodeFn(selectionStateRef) : null;
        const elementText = currentNode?.element?.text || 
                           path[path.length - 1]?.textValue || 
                           '';
        const textValue = prompt('검증할 텍스트를 입력하세요:', elementText);
        if (textValue === null) {
          selectionStateRef.pendingAction = null;
          selectionStateRef.pendingStepIndex = null;
          return;
        }
        value = textValue || elementText;
      } else if (pending === 'verifyElementPresent' || pending === 'verifyElementNotPresent') {
        // 요소 존재/부재 검증은 value 불필요
        value = null;
      }
      
      // pendingStepIndex가 있으면 addAssertionAfterStep 사용, 없으면 addVerifyAction 사용
      if (selectionStateRef.pendingStepIndex !== null && addAssertionAfterStepFn) {
        addAssertionAfterStepFn(selectionStateRef.pendingStepIndex, pending, path, value);
        selectionStateRef.pendingStepIndex = null;
      } else if (addVerifyActionFn) {
        await addVerifyActionFn(
          pending,
          path,
          value,
          null,
          normalizeEventRecordFn,
          allEvents,
          updateCodeFn,
          syncTimelineFromEventsFn,
          saveEventAsStepFn,
          setElementStatusFn,
          captureVerifyImageScreenshotFn ? (clientRect) => captureVerifyImageScreenshotFn(clientRect, electronAPI, initElectronAPIFn) : null
        );
      }
      selectionStateRef.pendingAction = null;
      if (cancelSelectionWorkflowFn) {
        cancelSelectionWorkflowFn('', 'info', selectionStateRef);
      }
      return;
    } else if (pending === 'waitForElement' && addWaitActionFn) {
      addWaitActionFn(
        'waitForElement',
        null,
        path,
        null,
        normalizeEventRecordFn,
        allEvents,
        updateCodeFn,
        syncTimelineFromEventsFn,
        saveEventAsStepFn,
        null
      );
      selectionStateRef.pendingAction = null;
      if (cancelSelectionWorkflowFn) {
        cancelSelectionWorkflowFn('', 'info', selectionStateRef);
      }
      return;
    } else if (['click', 'doubleClick', 'rightClick', 'hover', 'clear', 'type', 'select'].includes(pending) && addInteractionActionFn) {
      let value = null;
      if (pending === 'type') {
        const inputValue = prompt('입력할 텍스트를 입력하세요:');
        if (inputValue === null) {
          selectionStateRef.pendingAction = null;
          return;
        }
        value = inputValue;
      } else if (pending === 'select') {
        const selectValue = prompt('선택할 옵션의 텍스트 또는 값을 입력하세요:');
        if (selectValue === null) {
          selectionStateRef.pendingAction = null;
          return;
        }
        value = selectValue;
      }
      addInteractionActionFn(
        pending,
        path,
        value,
        normalizeEventRecordFn,
        allEvents,
        updateCodeFn,
        syncTimelineFromEventsFn,
        saveEventAsStepFn,
        null
      );
      selectionStateRef.pendingAction = null;
      if (cancelSelectionWorkflowFn) {
        cancelSelectionWorkflowFn('', 'info', selectionStateRef);
      }
      return;
    }
  }
  
  // 일반 액션 처리
  if (actionType === 'click' && addInteractionActionFn) {
    addInteractionActionFn(
      'click',
      path,
      null,
      normalizeEventRecordFn,
      allEvents,
      updateCodeFn,
      syncTimelineFromEventsFn,
      saveEventAsStepFn,
      null
    );
  } else if (actionType === 'extract_text' && buildManualActionEntryFn && addManualActionFn) {
    const entry = buildManualActionEntryFn('extract_text', path, { resultName: `text_result_${manualActionSerialRef}` }, manualActionSerialRef);
    if (entry) {
      addManualActionFn(entry, (updatedManualActions) => {
        if (manualActionsRef) {
          manualActionsRef.length = 0;
          manualActionsRef.push(...updatedManualActions);
        }
        if (updateCodeFn) {
          updateCodeFn();
        }
        if (cancelSelectionWorkflowFn) {
          cancelSelectionWorkflowFn('텍스트 추출 액션을 추가했습니다.', 'success', selectionStateRef);
        }
      }, manualActionsRef, updateCodeFn);
    }
  } else if (actionType === 'get_attribute' && buildManualActionEntryFn && addManualActionFn) {
    const attrName = options.attributeName || selectionStateRef.pendingAttribute || '';
    if (!attrName) {
      if (setElementStatusFn) {
        setElementStatusFn('속성명을 입력하세요.', 'error');
      }
      return;
    }
    const entry = buildManualActionEntryFn('get_attribute', path, {
      attributeName: attrName,
      resultName: `${attrName}_value_${manualActionSerialRef}`,
      pendingAttribute: selectionStateRef.pendingAttribute
    }, manualActionSerialRef);
    if (entry) {
      addManualActionFn(entry, (updatedManualActions) => {
        if (manualActionsRef) {
          manualActionsRef.length = 0;
          manualActionsRef.push(...updatedManualActions);
        }
        if (updateCodeFn) {
          updateCodeFn();
        }
        if (cancelSelectionWorkflowFn) {
          cancelSelectionWorkflowFn('속성 추출 액션을 추가했습니다.', 'success', selectionStateRef);
        }
      }, manualActionsRef, updateCodeFn);
    }
  } else if (actionType === 'commit' && cancelSelectionWorkflowFn) {
    cancelSelectionWorkflowFn('요소 선택이 완료되었습니다.', 'success', selectionStateRef);
  } else {
    if (logMessageFn) {
      logMessageFn(`선택 액션 적용: ${actionType}`, 'info');
    }
    if (cancelSelectionWorkflowFn) {
      cancelSelectionWorkflowFn('요소 선택이 완료되었습니다.', 'success', selectionStateRef);
    }
  }
}
