/**
 * DOM 분석 유틸리티
 * 부모/형제/조상/자식 요소를 찾고 상대 셀렉터를 생성하는 함수들
 */

/**
 * 부모 요소 찾기
 * @param {Object} elementInfo - 요소 정보 (selector, xpath 등)
 * @param {string} selector - 선택적 부모 셀렉터
 * @returns {Object} 부모 요소 정보
 */
export function findParentElement(elementInfo, selector = null) {
  if (!elementInfo) return null;
  
  // Playwright 스타일 부모 셀렉터 생성
  if (selector) {
    return {
      selector: `${elementInfo.selector || ''}.locator('xpath=..').locator('${selector}')`,
      xpath: `(${elementInfo.xpath || ''})/..${selector ? `[${selector}]` : ''}`,
      relation: 'parent',
      targetSelector: selector
    };
  }
  
  return {
    selector: `${elementInfo.selector || ''}.locator('..')`,
    xpath: `(${elementInfo.xpath || ''})/..`,
    relation: 'parent',
    targetSelector: null
  };
}

/**
 * 조상 요소 찾기 (closest)
 * @param {Object} elementInfo - 요소 정보
 * @param {string} ancestorSelector - 조상 셀렉터 (예: '.item', 'div.product-card')
 * @returns {Object} 조상 요소 정보
 */
export function findAncestorElement(elementInfo, ancestorSelector) {
  if (!elementInfo || !ancestorSelector) return null;
  
  return {
    selector: `${elementInfo.selector || ''}.locator('xpath=ancestor::${ancestorSelector.replace(/^\./, '')}[1]')`,
    xpath: `(${elementInfo.xpath || ''})/ancestor::${ancestorSelector.replace(/^\./, '')}[1]`,
    relation: 'ancestor',
    targetSelector: ancestorSelector
  };
}

/**
 * 형제 요소 찾기
 * @param {Object} elementInfo - 요소 정보
 * @param {string} direction - 'next' (다음 형제) 또는 'previous' (이전 형제)
 * @param {string} selector - 선택적 형제 셀렉터
 * @returns {Object} 형제 요소 정보
 */
export function findSiblingElement(elementInfo, direction = 'next', selector = null) {
  if (!elementInfo) return null;
  
  const xpathDirection = direction === 'next' ? 'following-sibling' : 'preceding-sibling';
  
  if (selector) {
    const tagName = selector.replace(/^\./, '').split('[')[0];
    return {
      selector: `${elementInfo.selector || ''}.locator('xpath=../${xpathDirection}::${tagName}${selector.includes('[') ? `[${selector.split('[')[1]}` : ''}')`,
      xpath: `(${elementInfo.xpath || ''})/../${xpathDirection}::${tagName}${selector.includes('[') ? `[${selector.split('[')[1]}` : ''}`,
      relation: 'sibling',
      direction: direction,
      targetSelector: selector
    };
  }
  
  return {
    selector: `${elementInfo.selector || ''}.locator('xpath=../${xpathDirection}::*[1]')`,
    xpath: `(${elementInfo.xpath || ''})/../${xpathDirection}::*[1]`,
    relation: 'sibling',
    direction: direction,
    targetSelector: null
  };
}

/**
 * 자식 요소 찾기
 * @param {Object} elementInfo - 요소 정보
 * @param {string} childSelector - 자식 셀렉터
 * @returns {Object} 자식 요소 정보
 */
export function findChildElement(elementInfo, childSelector) {
  if (!elementInfo || !childSelector) return null;
  
  return {
    selector: `${elementInfo.selector || ''}.locator('${childSelector}')`,
    xpath: `${elementInfo.xpath || ''}/${childSelector}`,
    relation: 'child',
    targetSelector: childSelector
  };
}

/**
 * 요소 구조 분석
 * @param {Object} elementInfo - 요소 정보
 * @returns {Object} 요소 구조 정보 (부모/형제/자식 후보)
 */
export function analyzeElementStructure(elementInfo) {
  if (!elementInfo) return null;
  
  const analysis = {
    parent: findParentElement(elementInfo),
    ancestors: [],
    siblings: {
      next: findSiblingElement(elementInfo, 'next'),
      previous: findSiblingElement(elementInfo, 'previous')
    },
    children: []
  };
  
  // 일반적인 조상 패턴 제안
  const commonAncestors = ['.item', '.product-card', '.card', 'li', 'div.container'];
  commonAncestors.forEach(ancestorSelector => {
    const ancestor = findAncestorElement(elementInfo, ancestorSelector);
    if (ancestor) {
      analysis.ancestors.push(ancestor);
    }
  });
  
  return analysis;
}

/**
 * 상대 셀렉터 생성
 * @param {string} baseSelector - 기준 셀렉터
 * @param {string} relation - 관계 타입 ('parent', 'ancestor', 'sibling', 'child')
 * @param {string} targetSelector - 대상 셀렉터 (선택적)
 * @param {string} direction - 형제의 경우 방향 ('next' 또는 'previous')
 * @returns {string} 생성된 상대 셀렉터
 */
export function generateRelativeSelector(baseSelector, relation, targetSelector = null, direction = 'next') {
  if (!baseSelector || !relation) return baseSelector;
  
  switch (relation) {
    case 'parent':
      if (targetSelector) {
        return `${baseSelector}.locator('xpath=..').locator('${targetSelector}')`;
      }
      return `${baseSelector}.locator('..')`;
      
    case 'ancestor':
      if (!targetSelector) return baseSelector;
      const ancestorTag = targetSelector.replace(/^\./, '').split('[')[0];
      return `${baseSelector}.locator('xpath=ancestor::${ancestorTag}[1]')`;
      
    case 'sibling':
      const xpathDir = direction === 'next' ? 'following-sibling' : 'preceding-sibling';
      if (targetSelector) {
        const tagName = targetSelector.replace(/^\./, '').split('[')[0];
        return `${baseSelector}.locator('xpath=../${xpathDir}::${tagName}[1]')`;
      }
      return `${baseSelector}.locator('xpath=../${xpathDir}::*[1]')`;
      
    case 'child':
      if (!targetSelector) return baseSelector;
      return `${baseSelector}.locator('${targetSelector}')`;
      
    default:
      return baseSelector;
  }
}

/**
 * 조건 타입에 따른 검증 코드 생성
 * @param {string} conditionType - 조건 타입 ('is_visible', 'text_contains', 'class_name' 등)
 * @param {string} conditionValue - 조건 값
 * @param {string} elementSelector - 요소 셀렉터
 * @param {boolean} pythonLike - Python 스타일인지 여부
 * @returns {string} 조건 검증 코드
 */
export function generateConditionCheck(conditionType, conditionValue, elementSelector, pythonLike = true) {
  if (!conditionType || !elementSelector) return '';
  
  const baseSelector = pythonLike ? elementSelector : elementSelector;
  
  switch (conditionType) {
    case 'is_visible':
      return pythonLike 
        ? `await ${baseSelector}.is_visible()`
        : `await ${baseSelector}.isVisible()`;
        
    case 'text_contains':
      if (!conditionValue) return '';
      return pythonLike
        ? `"${conditionValue}" in await ${baseSelector}.inner_text()`
        : `(await ${baseSelector}.innerText()).includes("${conditionValue}")`;
        
    case 'text_equals':
      if (!conditionValue) return '';
      return pythonLike
        ? `await ${baseSelector}.inner_text() == "${conditionValue}"`
        : `(await ${baseSelector}.innerText()) === "${conditionValue}"`;
        
    case 'class_name':
      if (!conditionValue) return '';
      const className = conditionValue.replace(/^\./, '');
      return pythonLike
        ? `await ${baseSelector}.get_attribute('class') and "${className}" in await ${baseSelector}.get_attribute('class')`
        : `(await ${baseSelector}.getAttribute('class'))?.includes("${className}")`;
        
    case 'has_attribute':
      if (!conditionValue) return '';
      return pythonLike
        ? `await ${baseSelector}.get_attribute('${conditionValue}') is not None`
        : `(await ${baseSelector}.getAttribute('${conditionValue}')) !== null`;
        
    default:
      return '';
  }
}

