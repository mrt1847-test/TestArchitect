/**
 * 액션 처리 모듈
 * 검증, 대기, 상호작용 액션을 처리하는 기능을 담당
 */

import { inferSelectorType } from '../utils/selectorUtils.js';
import { shouldFilterIntermediateUrl, waitForFinalPage, removeQueryParams } from '../utils/urlFilter.js';

/**
 * 수동 액션 엔트리 생성
 */
export function buildManualActionEntry(actionType, path, options = {}, manualActionSerial) {
  if (!path || !path.length) return null;
  const serial = manualActionSerial || 1;
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
    const attrName = (options.attributeName || options.pendingAttribute || '').trim();
    if (!attrName) return null;
    entry.attributeName = attrName;
    entry.resultName = options.resultName || `${attrName}_value_${serial}`;
  }
  return entry;
}

/**
 * 수동 액션 추가
 */
export function addManualAction(entry, callback, manualActions, updateCodeFn) {
  if (!entry) return;
  const next = [...manualActions, entry];
  if (callback) callback(next);
  if (updateCodeFn) {
    updateCodeFn();
  }
}

/**
 * 검증 액션 처리
 */
export async function handleVerifyAction(
  verifyType,
  setElementStatusFn,
  startSimpleElementSelectionFn,
  addVerifyActionFn
) {
  if (verifyType === 'verifyTitle' || verifyType === 'verifyUrl') {
    // 타이틀/URL 검증은 요소 선택 불필요
    let initialValue = null;
    
    if (verifyType === 'verifyUrl') {
      // 현재 URL 가져오기
      let currentUrl = window.location.href || '';
      
      // 중간 처리 페이지인 경우 최종 목적지 페이지로 이동할 때까지 대기
      if (shouldFilterIntermediateUrl(currentUrl)) {
        console.log('[Recorder] verifyUrl: 중간 처리 페이지 감지, 최종 목적지 페이지로 이동 대기...');
        
        const waitResult = await waitForFinalPage({
          onProgress: (url, waitedTime) => {
            console.log(`[Recorder] verifyUrl: 대기 중... (${waitedTime}ms)`, url);
          }
        });
        
        if (waitResult.success && waitResult.finalUrl) {
          currentUrl = waitResult.finalUrl;
          console.log('[Recorder] verifyUrl: 최종 목적지 페이지 도달:', currentUrl);
        } else {
          // 타임아웃으로 인해 currentUrl이 여전히 중간 URL인 경우 이벤트 추가 취소
          console.warn('[Recorder] verifyUrl: 최종 목적지 페이지 대기 타임아웃, 중간 URL 필터링');
          if (setElementStatusFn) {
            setElementStatusFn('중간 처리 페이지가 감지되었습니다. 최종 목적지 페이지에서 다시 시도해주세요.', 'error');
          }
          return;
        }
      }
      
      // 필터링된 URL 사용 (중간 URL이 아닌 경우만)
      if (currentUrl && !shouldFilterIntermediateUrl(currentUrl)) {
        initialValue = currentUrl;
      } else if (currentUrl && shouldFilterIntermediateUrl(currentUrl)) {
        // 여전히 중간 URL인 경우 이벤트 추가 취소
        console.warn('[Recorder] verifyUrl: 중간 URL 필터링으로 인해 이벤트 추가 취소');
        if (setElementStatusFn) {
          setElementStatusFn('중간 처리 페이지가 감지되었습니다. 최종 목적지 페이지에서 다시 시도해주세요.', 'error');
        }
        return;
      }
    }
    
    if (addVerifyActionFn) {
      await addVerifyActionFn(verifyType, null, initialValue);
    }
    return;
  }
  
  // 요소 검증은 심플 요소 선택 사용 (waitForElement와 동일한 방식)
  if (startSimpleElementSelectionFn) {
    startSimpleElementSelectionFn(async (path, elementInfo, pendingAction, pendingStepIndex) => {
      let value = null;
      if (pendingAction === 'verifyText') {
        // 요소의 텍스트를 자동으로 사용 (prompt 없이)
        value = elementInfo.text || path[0]?.textValue || '';
        console.log('[Recorder] verifyText: 요소 텍스트 자동 사용:', value);
      } else if (pendingAction === 'verifyElementPresent' || pendingAction === 'verifyElementNotPresent') {
        // 요소 존재/부재 검증은 value 불필요
        value = null;
      }
      
      if (addVerifyActionFn) {
        await addVerifyActionFn(pendingAction, path, value, elementInfo);
      }
    }, verifyType, null);
  }
}

/**
 * 대기 액션 처리
 */
export function handleWaitAction(
  waitType,
  buildSelectionPathArrayFn,
  startSelectionWorkflowFn,
  selectionState,
  setElementStatusFn,
  addWaitActionFn
) {
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
    const path = buildSelectionPathArrayFn ? buildSelectionPathArrayFn() : [];
    if (!path.length) {
      if (!selectionState.active) {
        if (startSelectionWorkflowFn) {
          startSelectionWorkflowFn();
        }
      }
      if (setElementStatusFn) {
        setElementStatusFn('대기할 요소를 선택하세요.', 'info');
      }
      if (selectionState) {
        selectionState.pendingAction = 'waitForElement';
      }
      return;
    }
    
    if (addWaitActionFn) {
      addWaitActionFn('waitForElement', null, path);
    }
  }
}

/**
 * 상호작용 액션 처리
 */
export function handleInteractionAction(
  interactionType,
  buildSelectionPathArrayFn,
  startSelectionWorkflowFn,
  selectionState,
  setElementStatusFn,
  addInteractionActionFn
) {
  const path = buildSelectionPathArrayFn ? buildSelectionPathArrayFn() : [];
  
  if (interactionType === 'type') {
    if (!path.length) {
      if (!selectionState.active) {
        if (startSelectionWorkflowFn) {
          startSelectionWorkflowFn();
        }
      }
      if (setElementStatusFn) {
        setElementStatusFn('입력할 요소를 선택하세요.', 'info');
      }
      if (selectionState) {
        selectionState.pendingAction = 'type';
      }
      return;
    }
    const inputValue = prompt('입력할 텍스트를 입력하세요:');
    if (inputValue === null) return;
    if (addInteractionActionFn) {
      addInteractionActionFn('type', path, inputValue);
    }
    return;
  }
  
  if (interactionType === 'select') {
    if (!path.length) {
      if (!selectionState.active) {
        if (startSelectionWorkflowFn) {
          startSelectionWorkflowFn();
        }
      }
      if (setElementStatusFn) {
        setElementStatusFn('선택할 드롭다운 요소를 선택하세요.', 'info');
      }
      if (selectionState) {
        selectionState.pendingAction = 'select';
      }
      return;
    }
    const selectValue = prompt('선택할 옵션의 텍스트 또는 값을 입력하세요:');
    if (selectValue === null) return;
    if (addInteractionActionFn) {
      addInteractionActionFn('select', path, selectValue);
    }
    return;
  }
  
  // click, doubleClick, rightClick, hover, clear는 요소만 필요
  if (!path.length) {
    if (!selectionState.active) {
      if (startSelectionWorkflowFn) {
        startSelectionWorkflowFn();
      }
    }
    if (setElementStatusFn) {
      setElementStatusFn(`${interactionType}할 요소를 선택하세요.`, 'info');
    }
    if (selectionState) {
      selectionState.pendingAction = interactionType;
    }
    return;
  }
  
  if (addInteractionActionFn) {
    addInteractionActionFn(interactionType, path, null);
  }
}

/**
 * 검증 액션을 이벤트로 추가
 */
export async function addVerifyAction(
  verifyType,
  path,
  value,
  elementInfo = null,
  normalizeEventRecordFn,
  allEvents,
  updateCodeFn,
  syncTimelineFromEventsFn,
  saveEventAsStepFn,
  setElementStatusFn,
  captureVerifyImageScreenshotFn
) {
  console.log('[Recorder] addVerifyAction 호출:', {
    verifyType,
    pathLength: path?.length || 0,
    value,
    path: path ? path.map(p => p.selector) : null,
    hasElementInfo: !!elementInfo
  });
  
  const timestamp = Date.now();
  const currentUrl = window.location.href || '';
  const currentTitle = document.title || '';
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
    const iframeContext = path[path.length - 1]?.iframeContext || elementInfo?.iframeContext || null;
    
    // elementInfo에서 추가 정보 가져오기
    const targetTag = elementInfo?.tag || null;
    const clientRect = elementInfo?.clientRect || null;
    const pageInfo = elementInfo?.page || { url: currentUrl, title: currentTitle };
    
    eventRecord = {
      version: 2,
      timestamp,
      action: verifyType,
      value: value || null,
      tag: targetTag,
      selectorCandidates: elementInfo?.selectorCandidates || selectors,
      iframeContext,
      page: pageInfo,
      frame: { iframeContext },
      target: targetTag ? { tag: targetTag, id: elementInfo?.id || null, className: elementInfo?.className || null } : null,
      clientRect: clientRect,
      elementImageData: null, // 스크린샷 캡처 후 채워짐
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
    
    // verifyImage 액션인 경우 실시간 스크린샷 캡처
    if (verifyType === 'verifyImage' && clientRect && captureVerifyImageScreenshotFn) {
      console.log('[Recorder] verifyImage 액션 감지, 스크린샷 캡처 시작...');
      
      // 이벤트 추가 (이미지 없이 먼저 추가)
      const normalized = normalizeEventRecordFn ? normalizeEventRecordFn(eventRecord) : eventRecord;
      console.log('[Recorder] addVerifyAction: 정규화된 이벤트:', normalized);
      allEvents.push(normalized);
      console.log('[Recorder] addVerifyAction: allEvents에 추가됨, 총 이벤트 수:', allEvents.length);
      if (updateCodeFn) {
        updateCodeFn({ preloadedEvents: allEvents });
      }
      if (syncTimelineFromEventsFn) {
        syncTimelineFromEventsFn(allEvents, { selectLast: true });
      }
      console.log('[Recorder] addVerifyAction: 코드 및 타임라인 업데이트 완료');
      
      // 이미지 캡처 후 저장
      captureVerifyImageScreenshotFn(clientRect).then(imageData => {
        if (imageData) {
          // 이벤트에 이미지 데이터 추가
          eventRecord.elementImageData = imageData;
          
          // 이미 추가된 이벤트 업데이트
          const lastEvent = allEvents[allEvents.length - 1];
          if (lastEvent && lastEvent.timestamp === timestamp) {
            lastEvent.elementImageData = imageData;
            // 타임라인 새로고침하여 이미지 표시
            if (syncTimelineFromEventsFn) {
              syncTimelineFromEventsFn(allEvents, { selectLast: false });
            }
            console.log('[Recorder] ✅ verifyImage 이미지 데이터 추가 완료');
            
            // 이미지가 추가된 후에 TC step으로 저장
            console.log('[Recorder] addVerifyAction: saveEventAsStep 호출 시작 (이미지 포함)');
            if (saveEventAsStepFn) {
              saveEventAsStepFn(lastEvent);
            }
            console.log('[Recorder] addVerifyAction: saveEventAsStep 호출 완료');
          }
        } else {
          // 이미지 캡처 실패해도 이벤트는 저장
          console.log('[Recorder] addVerifyAction: saveEventAsStep 호출 시작 (이미지 없음)');
          if (saveEventAsStepFn) {
            saveEventAsStepFn(normalized);
          }
          console.log('[Recorder] addVerifyAction: saveEventAsStep 호출 완료');
        }
      }).catch(error => {
        console.warn('[Recorder] verifyImage 스크린샷 캡처 실패:', error);
        // 이미지 캡처 실패해도 이벤트는 저장
        console.log('[Recorder] addVerifyAction: saveEventAsStep 호출 시작 (이미지 캡처 실패)');
        if (saveEventAsStepFn) {
          saveEventAsStepFn(normalized);
        }
        console.log('[Recorder] addVerifyAction: saveEventAsStep 호출 완료');
      });
      
      // verifyImage인 경우 여기서 종료 (이미지 캡처 완료 후 저장)
      const verifyActionsContainer = document.getElementById('verify-actions');
      if (verifyActionsContainer) {
        verifyActionsContainer.classList.add('hidden');
      }
      if (setElementStatusFn) {
        setElementStatusFn(`${verifyType} 액션을 추가했습니다.`, 'success');
      }
      return;
    }
  } else {
    // 타이틀/URL 검증 (요소 불필요)
    if (verifyType === 'verifyTitle') {
      value = value || currentTitle;
    } else if (verifyType === 'verifyUrl') {
      // URL 정규화 적용 (쿼리 파라미터 제거)
      let rawUrl = value || currentUrl;
      
      // 중간 처리 페이지인 경우 최종 목적지 페이지로 이동할 때까지 대기
      if (shouldFilterIntermediateUrl(rawUrl)) {
        console.log('[Recorder] verifyUrl: 중간 처리 페이지 감지, 최종 목적지 페이지로 이동 대기...');
        
        const waitResult = await waitForFinalPage({
          onProgress: (url, waitedTime) => {
            console.log(`[Recorder] verifyUrl: 대기 중... (${waitedTime}ms)`, url);
          }
        });
        
        if (waitResult.success && waitResult.finalUrl) {
          rawUrl = waitResult.finalUrl;
          console.log('[Recorder] verifyUrl: 최종 목적지 페이지 도달:', rawUrl);
        } else {
          // 타임아웃으로 인해 rawUrl이 null이 된 경우 이벤트 추가 취소
          console.warn('[Recorder] verifyUrl: 최종 목적지 페이지 대기 타임아웃, 중간 URL 필터링');
          if (setElementStatusFn) {
            setElementStatusFn('중간 처리 페이지가 감지되었습니다. 최종 목적지 페이지에서 다시 시도해주세요.', 'error');
          }
          return;
        }
      }
      
      // rawUrl이 null이 아니고 중간 URL이 아닌 경우에만 처리
      if (rawUrl && !shouldFilterIntermediateUrl(rawUrl)) {
        value = removeQueryParams(rawUrl);
      } else if (!rawUrl || shouldFilterIntermediateUrl(rawUrl)) {
        // 중간 URL이거나 rawUrl이 null인 경우 이벤트 추가 취소
        console.warn('[Recorder] verifyUrl: 중간 URL 필터링으로 인해 이벤트 추가 취소');
        if (setElementStatusFn) {
          setElementStatusFn('중간 처리 페이지가 감지되었습니다. 최종 목적지 페이지에서 다시 시도해주세요.', 'error');
        }
        return;
      }
    }
    
    eventRecord = {
      version: 2,
      timestamp,
      action: verifyType,
      value: value,
      tag: null,
      selectorCandidates: [],
      iframeContext: null,
      page: {
        url: currentUrl,
        title: currentTitle
      },
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
  const normalized = normalizeEventRecordFn ? normalizeEventRecordFn(eventRecord) : eventRecord;
  console.log('[Recorder] addVerifyAction: 정규화된 이벤트:', normalized);
  allEvents.push(normalized);
  console.log('[Recorder] addVerifyAction: allEvents에 추가됨, 총 이벤트 수:', allEvents.length);
  if (updateCodeFn) {
    updateCodeFn({ preloadedEvents: allEvents });
  }
  if (syncTimelineFromEventsFn) {
    syncTimelineFromEventsFn(allEvents, { selectLast: true });
  }
  console.log('[Recorder] addVerifyAction: 코드 및 타임라인 업데이트 완료');
  
  // 실시간으로 TC step으로 저장
  console.log('[Recorder] addVerifyAction: saveEventAsStep 호출 시작');
  if (saveEventAsStepFn) {
    saveEventAsStepFn(normalized);
  }
  console.log('[Recorder] addVerifyAction: saveEventAsStep 호출 완료');
  
  const verifyActionsContainer = document.getElementById('verify-actions');
  if (verifyActionsContainer) {
    verifyActionsContainer.classList.add('hidden');
  }
  if (setElementStatusFn) {
    setElementStatusFn(`${verifyType} 액션을 추가했습니다.`, 'success');
  }
}

/**
 * verifyImage 요소 스크린샷 캡처 헬퍼 함수
 */
export async function captureVerifyImageScreenshot(clientRect, electronAPI, initElectronAPIFn) {
  try {
    // electronAPI 초기화 확인
    if (!electronAPI && initElectronAPIFn) {
      initElectronAPIFn();
    }
    
    if (!electronAPI || !electronAPI.captureVerifyImage) {
      console.warn('[Recorder] electronAPI.captureVerifyImage를 사용할 수 없습니다.');
      return null;
    }
    
    // clientRect 형식 통일: { x, y, width, height } 형식으로 변환
    const normalizedClientRect = {
      x: clientRect.x,
      y: clientRect.y,
      width: clientRect.width || clientRect.w,
      height: clientRect.height || clientRect.h
    };
    
    if (!normalizedClientRect.x || !normalizedClientRect.y || !normalizedClientRect.width || !normalizedClientRect.height) {
      console.warn('[Recorder] 유효하지 않은 clientRect 정보:', clientRect);
      return null;
    }
    
    const result = await electronAPI.captureVerifyImage({ clientRect: normalizedClientRect });
    if (result.success && result.imageData) {
      console.log('[Recorder] ✅ verifyImage 스크린샷 캡처 성공');
      return result.imageData;
    } else {
      console.warn('[Recorder] 스크린샷 캡처 실패:', result.error);
      return null;
    }
  } catch (error) {
    console.error('[Recorder] 스크린샷 캡처 중 오류:', error);
    return null;
  }
}

/**
 * 대기 액션을 이벤트로 추가
 */
export function addWaitAction(
  waitType,
  timeValue,
  path,
  elementInfo = null,
  normalizeEventRecordFn,
  allEvents,
  updateCodeFn,
  syncTimelineFromEventsFn,
  saveEventAsStepFn,
  logMessageFn
) {
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
    const iframeContext = path[path.length - 1]?.iframeContext || elementInfo?.iframeContext || null;
    
    // elementInfo에서 추가 정보 가져오기
    const targetTag = elementInfo?.tag || null;
    const clientRect = elementInfo?.clientRect || null;
    const currentUrl = window.location.href || '';
    const currentTitle = document.title || '';
    const pageInfo = elementInfo?.page || { url: currentUrl, title: currentTitle };
    
    eventRecord = {
      version: 2,
      timestamp,
      action: 'waitForElement',
      value: null, // waitForElement는 요소 대기이므로 value는 null
      tag: targetTag,
      selectorCandidates: elementInfo?.selectorCandidates || selectors,
      iframeContext,
      page: pageInfo,
      frame: { iframeContext },
      target: targetTag ? { tag: targetTag, id: elementInfo?.id || null, className: elementInfo?.className || null } : null,
      clientRect: clientRect,
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
  const normalized = normalizeEventRecordFn ? normalizeEventRecordFn(eventRecord) : eventRecord;
  allEvents.push(normalized);
  if (updateCodeFn) {
    updateCodeFn({ preloadedEvents: allEvents });
  }
  if (syncTimelineFromEventsFn) {
    syncTimelineFromEventsFn(allEvents, { selectLast: true });
  }
  
  // 실시간으로 TC step으로 저장
  if (saveEventAsStepFn) {
    saveEventAsStepFn(normalized);
  }
  
  if (logMessageFn) {
    logMessageFn(`${waitType} 액션을 추가했습니다.`, 'success');
  }
}

/**
 * 상호작용 액션을 이벤트로 추가
 */
export function addInteractionAction(
  interactionType,
  path,
  value,
  normalizeEventRecordFn,
  allEvents,
  updateCodeFn,
  syncTimelineFromEventsFn,
  saveEventAsStepFn,
  logMessageFn
) {
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
  const normalized = normalizeEventRecordFn ? normalizeEventRecordFn(eventRecord) : eventRecord;
  allEvents.push(normalized);
  if (updateCodeFn) {
    updateCodeFn({ preloadedEvents: allEvents });
  }
  if (syncTimelineFromEventsFn) {
    syncTimelineFromEventsFn(allEvents, { selectLast: true });
  }
  
  // 실시간으로 TC step으로 저장
  if (saveEventAsStepFn) {
    saveEventAsStepFn(normalized);
  }
  
  if (logMessageFn) {
    logMessageFn(`${interactionType} 액션을 추가했습니다.`, 'success');
  }
}
