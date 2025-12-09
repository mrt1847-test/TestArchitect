/**
 * TestArchitect 녹화 조건부 액션 모듈
 * 조건부 액션, 상대 노드 탐색, 반복 액션 워크플로우
 */

import { inferSelectorType } from '../utils/selectorUtils.js';
import {
  findParentElement,
  findAncestorElement,
  findSiblingElement
} from '../utils/domAnalyzer.js';

/**
 * 조건부 액션 상태 초기화
 * @returns {Object} 초기화된 상태 객체
 */
export function createConditionalActionState() {
  return {
    step: 0,
    data: {
      actionType: null,
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
    }
  };
}

/**
 * 부모-자식 관계 검증
 * @param {Object} parentElement - 부모 요소 데이터
 * @param {Object} childElement - 자식 요소 데이터
 * @returns {boolean} 검증 결과
 */
export function validateBySelector(parentElement, childElement) {
  // XPath 기반 검증
  if (parentElement.xpath && childElement.xpath) {
    const parentXPath = parentElement.xpath;
    const childXPath = childElement.xpath;
    
    // child의 xpath가 parent의 xpath로 시작하는지 확인
    if (childXPath.startsWith(parentXPath + '/') || 
        childXPath.startsWith(parentXPath + '[') ||
        childXPath === parentXPath) {
      return true;
    }
  }
  
  // 셀렉터 기반 검증
  if (parentElement.selector && childElement.selector) {
    const parentSelector = parentElement.selector;
    const childSelector = childElement.selector;
    
    // childSelector가 parentSelector를 포함하거나 확장한 형태인지 확인
    if (childSelector.includes(parentSelector)) {
      // parent.locator(...) 형태인지 확인
      if (childSelector.startsWith(parentSelector + '.locator(') ||
          childSelector.startsWith(parentSelector + '[') ||
          childSelector === parentSelector) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * 형제 관계 검증
 * @param {Object} baseElement - 기준 요소 데이터
 * @param {Object} siblingElement - 형제 요소 데이터
 * @returns {boolean} 검증 결과
 */
export function validateSiblingRelation(baseElement, siblingElement) {
  // XPath 기반 검증: 같은 부모를 가져야 함
  if (baseElement.xpath && siblingElement.xpath) {
    const baseXPath = baseElement.xpath;
    const siblingXPath = siblingElement.xpath;
    
    // 부모 경로 추출 (마지막 / 또는 [ 이전까지)
    const baseParentMatch = baseXPath.match(/^(.+)\/[^\/]+$/);
    const siblingParentMatch = siblingXPath.match(/^(.+)\/[^\/]+$/);
    
    if (baseParentMatch && siblingParentMatch) {
      const baseParent = baseParentMatch[1];
      const siblingParent = siblingParentMatch[1];
      
      // 같은 부모를 가지면 형제
      if (baseParent === siblingParent) {
        return true;
      }
    }
  }
  
  // 셀렉터 기반 검증: 같은 부모 경로를 포함해야 함
  if (baseElement.selector && siblingElement.selector) {
    const baseSelector = baseElement.selector;
    const siblingSelector = siblingElement.selector;
    
    // 부모 경로 추출 시도
    // 예: page.locator('.parent').locator('.child1') vs page.locator('.parent').locator('.child2')
    const baseParentMatch = baseSelector.match(/^(.+)\.locator\([^)]+\)$/);
    const siblingParentMatch = siblingSelector.match(/^(.+)\.locator\([^)]+\)$/);
    
    if (baseParentMatch && siblingParentMatch) {
      const baseParent = baseParentMatch[1];
      const siblingParent = siblingParentMatch[1];
      
      // 같은 부모를 가지면 형제
      if (baseParent === siblingParent) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * 조상 관계 검증
 * @param {Object} baseElement - 기준 요소 데이터
 * @param {Object} ancestorElement - 조상 요소 데이터
 * @returns {boolean} 검증 결과
 */
export function validateAncestorRelation(baseElement, ancestorElement) {
  // XPath 기반 검증: ancestor의 xpath가 base의 xpath로 시작해야 함
  if (baseElement.xpath && ancestorElement.xpath) {
    const baseXPath = baseElement.xpath;
    const ancestorXPath = ancestorElement.xpath;
    
    // base의 xpath가 ancestor의 xpath로 시작하는지 확인
    // 예: ancestor: /html/body/div[1], base: /html/body/div[1]/span[2] -> true
    if (baseXPath.startsWith(ancestorXPath + '/') || 
        baseXPath.startsWith(ancestorXPath + '[') ||
        baseXPath === ancestorXPath) {
      return true;
    }
  }
  
  // 셀렉터 기반 검증: base의 셀렉터가 ancestor의 셀렉터를 포함해야 함
  if (baseElement.selector && ancestorElement.selector) {
    const baseSelector = baseElement.selector;
    const ancestorSelector = ancestorElement.selector;
    
    // baseSelector가 ancestorSelector를 포함하는지 확인
    // 예: ancestor: page.locator('.parent'), base: page.locator('.parent').locator('.child')
    if (baseSelector.includes(ancestorSelector)) {
      // baseSelector가 ancestorSelector로 시작하는지 확인
      if (baseSelector.startsWith(ancestorSelector + '.locator(') ||
          baseSelector.startsWith(ancestorSelector + '[') ||
          baseSelector === ancestorSelector) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * 스텝 다음에 assertion 추가
 * @param {number} stepIndex - assertion을 추가할 스텝의 인덱스
 * @param {string} assertionType - assertion 타입
 * @param {Array} path - 요소 선택 경로 (있는 경우)
 * @param {string} value - 검증 값 (있는 경우)
 * @param {string} matchMode - 매칭 모드 (verifyUrl의 경우 'exact' | 'contains')
 * @param {Object} stateRefs - 상태 참조 객체 { allEvents }
 * @param {Function} inferSelectorType - 셀렉터 타입 추론 함수
 * @param {Function} syncTimelineFromEvents - 타임라인 동기화 함수
 * @param {Function} updateCode - 코드 업데이트 함수
 * @param {Function} logMessage - 로그 메시지 출력 함수
 * @returns {Object|null} 생성된 이벤트 레코드
 */
export function addAssertionAfterStep(
  stepIndex,
  assertionType,
  path,
  value,
  matchMode = null,
  stateRefs,
  inferSelectorType,
  syncTimelineFromEvents,
  updateCode,
  logMessage
) {
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
      return null;
    }
    
    const targetEntry = selectors[selectors.length - 1];
    const iframeContext = path[path.length - 1]?.iframeContext || null;
    
    eventRecord = {
      version: 2,
      timestamp,
      action: assertionType,
      value: value || null,
      tag: null,
      selectorCandidates: selectors,
      iframeContext,
      page: {
        url: currentUrl,
        title: currentTitle
      },
      frame: { iframeContext },
      target: null,
      clientRect: null,
      metadata: {
        schemaVersion: 2,
        userAgent: navigator.userAgent
      },
      manual: {
        id: `verify-${timestamp}`,
        type: assertionType,
        resultName: null,
        attributeName: null
      },
      primarySelector: targetEntry.selector,
      primarySelectorType: targetEntry.type,
      primarySelectorText: targetEntry.textValue,
      primarySelectorXPath: targetEntry.xpathValue,
      primarySelectorMatchMode: targetEntry.matchMode,
      matchMode: matchMode || null
    };
  } else {
    // 타이틀/URL 검증 (요소 불필요)
    if (assertionType === 'verifyTitle') {
      value = value || currentTitle;
    } else if (assertionType === 'verifyUrl') {
      value = value || currentUrl;
    }
    
    eventRecord = {
      version: 2,
      timestamp,
      action: assertionType,
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
        type: assertionType,
        resultName: null,
        attributeName: null
      },
      primarySelector: null,
      primarySelectorType: null,
      matchMode: matchMode || null
    };
  }
  
  // 현재 이벤트 배열에 삽입 (stepIndex 다음에)
  const insertIndex = stepIndex + 1;
  const updatedEvents = [...stateRefs.allEvents];
  updatedEvents.splice(insertIndex, 0, eventRecord);
  
  // 타임라인 업데이트 및 코드 갱신
  const normalized = syncTimelineFromEvents(updatedEvents, {
    preserveSelection: false,
    selectLast: false,
    resetAiState: false
  });
  // allEvents가 syncTimelineFromEvents에서 업데이트되므로 normalized를 사용
  updateCode({ preloadedEvents: normalized });
  
  logMessage(`Assertion 추가: ${assertionType}`, 'success');
  return eventRecord;
}

/**
 * 스텝 다음에 조건부 액션 추가
 * @param {number} stepIndex - 조건부 액션을 추가할 스텝의 인덱스 (-1이면 맨 끝에 추가)
 * @param {Object} actionData - 조건부 액션 데이터
 * @param {Object} stateRefs - 상태 참조 객체 { allEvents }
 * @param {Function} syncTimelineFromEvents - 타임라인 동기화 함수
 * @param {Function} updateCode - 코드 업데이트 함수
 * @param {Function} normalizeEventRecord - 이벤트 정규화 함수
 * @param {Function} saveEventAsStep - 이벤트를 TC step으로 저장하는 함수
 * @param {Function} logMessage - 로그 메시지 출력 함수
 * @returns {Object|null} 생성된 이벤트 레코드
 */
export function addConditionalActionAfterStep(
  stepIndex,
  actionData,
  stateRefs,
  syncTimelineFromEvents,
  updateCode,
  normalizeEventRecord,
  saveEventAsStep,
  logMessage
) {
  const timestamp = Date.now();
  const currentUrl = window.location.href || '';
  const currentTitle = document.title || '';
  
  // target과 description 생성
  let target = null;
  let description = null;
  
  if (actionData.actionType === 'relativeAction') {
    // relativeAction의 경우 targetRelation과 targetSelector 정보를 target에 포함
    const relationLabels = {
      'parent': '부모 노드',
      'ancestor': '조상 노드',
      'sibling': '형제 노드',
      'child': '자식 노드'
    };
    const relationLabel = relationLabels[actionData.targetRelation] || actionData.targetRelation;
    
    if (actionData.childElement && actionData.childElement.selector) {
      target = `${relationLabel}: ${actionData.childElement.selector}`;
    } else if (actionData.siblingElement && actionData.siblingElement.selector) {
      target = `${relationLabel}: ${actionData.siblingElement.selector}`;
    } else if (actionData.ancestorElement && actionData.ancestorElement.selector) {
      target = `${relationLabel}: ${actionData.ancestorElement.selector}`;
    } else if (actionData.targetSelector) {
      target = `${relationLabel}: ${actionData.targetSelector}`;
    } else if (actionData.conditionElement && actionData.conditionElement.selector) {
      target = `${relationLabel} (기준: ${actionData.conditionElement.selector})`;
    } else {
      target = relationLabel;
    }
    
    const actionLabels = {
      'click': '클릭',
      'type': '입력',
      'hover': '호버',
      'doubleClick': '더블 클릭',
      'rightClick': '우클릭'
    };
    const actionLabel = actionLabels[actionData.actionTypeValue] || actionData.actionTypeValue || '액션';
    description = `${actionLabel} - ${target}`;
  } else if (actionData.actionType === 'conditionalAction') {
    // conditionalAction의 경우
    if (actionData.conditionElement && actionData.conditionElement.selector) {
      target = actionData.conditionElement.selector;
    }
    description = `조건부 액션 (${actionData.conditionType || '조건'})`;
  } else if (actionData.actionType === 'loopAction') {
    // loopAction의 경우
    if (actionData.loopSelector) {
      target = actionData.loopSelector;
    }
    description = `반복 액션 (${actionData.loopMode === 'loop' ? '반복' : '단일'})`;
  }
  
  const eventRecord = {
    version: 2,
    timestamp,
    action: actionData.actionType,
    conditionElement: actionData.conditionElement,
    childElement: actionData.childElement || null,
    siblingElement: actionData.siblingElement || null,
    ancestorElement: actionData.ancestorElement || null,
    conditionType: actionData.conditionType,
    conditionValue: actionData.conditionValue,
    targetRelation: actionData.targetRelation,
    targetSelector: actionData.targetSelector,
    loopMode: actionData.loopMode,
    loopSelector: actionData.loopSelector,
    actionType: actionData.actionTypeValue,
    value: actionData.actionValue,
    tag: null,
    selectorCandidates: actionData.conditionElement ? [{
      selector: actionData.conditionElement.selector,
      type: 'css',
      score: 100
    }] : [],
    iframeContext: null,
    page: {
      url: currentUrl,
      title: currentTitle
    },
    frame: { iframeContext: null },
    target: target,
    description: description,
    clientRect: null,
    metadata: {
      schemaVersion: 2,
      userAgent: navigator.userAgent
    },
    manual: {
      id: `conditional-${timestamp}`,
      type: actionData.actionType,
      resultName: null,
      attributeName: null
    }
  };
  
  // 현재 이벤트 배열에 삽입
  let insertIndex;
  if (stepIndex === -1) {
    // 맨 끝에 추가
    insertIndex = stateRefs.allEvents.length;
  } else {
    insertIndex = stepIndex + 1;
  }
  const updatedEvents = [...stateRefs.allEvents];
  updatedEvents.splice(insertIndex, 0, eventRecord);
  
  // 타임라인 업데이트 및 코드 갱신
  const normalized = syncTimelineFromEvents(updatedEvents, {
    preserveSelection: false,
    selectLast: false,
    resetAiState: false
  });
  updateCode({ preloadedEvents: normalized });
  
  // 정규화된 이벤트를 TC step으로 저장
  const normalizedEvent = normalizeEventRecord(eventRecord);
  saveEventAsStep(normalizedEvent);
  
  logMessage(`조건부 액션 추가: ${actionData.actionType}`, 'success');
  
  return normalizedEvent;
}