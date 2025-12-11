/**
 * 코드 생성 모듈
 * record/popup.js의 코드 생성 로직을 추출
 * Playwright, Selenium, Cypress 지원
 * Python, JavaScript, TypeScript 지원
 */

// 이벤트 스키마 버전
const EVENT_SCHEMA_VERSION = 2;

/**
 * 이벤트 레코드 정규화
 */
function normalizeEventRecord(event) {
  if (!event || typeof event !== 'object') return event;
  if (!event.version) {
    event.version = 1;
  }
  if (!event.metadata) {
    event.metadata = { schemaVersion: event.version };
  } else if (event.metadata.schemaVersion === undefined) {
    event.metadata.schemaVersion = event.version;
  }
  if (event.page === undefined) {
    event.page = null;
  }
  if (event.frame === undefined && event.iframeContext) {
    event.frame = { iframeContext: event.iframeContext };
  }
  if (event.manual === true) {
    event.manual = {
      id: event.manualActionId || null,
      type: event.manualActionType || null,
      resultName: event.manualResultName || null,
      attributeName: event.manualAttribute || null
    };
  }
  if (event.wrapInTry === undefined) {
    event.wrapInTry = false;
  }
  // 조건부 액션 및 상대 노드 탐색 필드 초기화
  if (event.action === 'conditionalAction' || event.action === 'relativeAction' || event.action === 'loopAction') {
    if (event.conditionElement === undefined) {
      event.conditionElement = null;
    }
    if (event.childElement === undefined) {
      event.childElement = null;
    }
    if (event.siblingElement === undefined) {
      event.siblingElement = null;
    }
    if (event.ancestorElement === undefined) {
      event.ancestorElement = null;
    }
    if (event.conditionType === undefined) {
      event.conditionType = null;
    }
    if (event.conditionValue === undefined) {
      event.conditionValue = null;
    }
    if (event.targetRelation === undefined) {
      event.targetRelation = null;
    }
    if (event.targetSelector === undefined) {
      event.targetSelector = null;
    }
    if (event.actionType === undefined) {
      event.actionType = 'click';
    }
    if (event.loopMode === undefined) {
      event.loopMode = 'single';
    }
  }
  return event;
}

/**
 * URL 정규화 함수
 * 쿼리 파라미터를 제거하여 기본 경로만 반환
 * @param {string} url - 정규화할 URL
 * @returns {string} 정규화된 URL (기본 경로만)
 */
function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return url;
  
  try {
    const urlObj = new URL(url);
    // 기본 경로만 반환 (쿼리 파라미터 제거)
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  } catch (e) {
    // URL 파싱 실패 시 쿼리 스트링만 제거
    const queryIndex = url.indexOf('?');
    if (queryIndex !== -1) {
      return url.substring(0, queryIndex);
    }
    return url;
  }
}

/**
 * 셀렉터 타입 추론
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
 * 이벤트에서 셀렉터 선택
 */
function selectSelectorForEvent(ev) {
  if (!ev) return {selector:null, type:null, iframeContext:null};
  if (ev.primarySelector) {
    return {
      selector: ev.primarySelector,
      type: ev.primarySelectorType || inferSelectorType(ev.primarySelector),
      textValue: ev.primarySelectorText || null,
      xpathValue: ev.primarySelectorXPath || null,
      matchMode: ev.primarySelectorMatchMode || null,
      iframeContext: ev.iframeContext || null
    };
  }
  if (ev.selectorCandidates && ev.selectorCandidates.length > 0) {
    const sorted = [...ev.selectorCandidates].sort((a, b) => (b.score || 0) - (a.score || 0));
    const best = sorted[0];
    return {
      selector: best.selector,
      type: best.type || inferSelectorType(best.selector),
      textValue: best.textValue || null,
      xpathValue: best.xpathValue || null,
      matchMode: best.matchMode || null,
      iframeContext: ev.iframeContext || null
    };
  }
  if (ev.tag) {
    return {selector: ev.tag.toLowerCase(), type: 'tag', iframeContext: ev.iframeContext || null};
  }
  return {selector:null, type:null, iframeContext: ev.iframeContext || null};
}

/**
 * 텍스트 값 추출
 */
function getTextValue(selectorInfo) {
  if (!selectorInfo) return '';
  if (selectorInfo.textValue) return selectorInfo.textValue;
  const selector = selectorInfo.selector || '';
  if (selector.startsWith('text=')) {
    let raw = selector.slice(5);
    raw = raw.replace(/^['"]|['"]$/g, '');
    return raw.replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return '';
}

/**
 * XPath 값 추출
 */
function getXPathValue(selectorInfo) {
  if (!selectorInfo) return '';
  if (selectorInfo.xpathValue) return selectorInfo.xpathValue;
  const selector = selectorInfo.selector || '';
  if (selector.startsWith('xpath=')) {
    return selector.slice(6);
  }
  return selector;
}

/**
 * 셀렉터 코어 추출
 */
function getSelectorCore(selector) {
  if (!selector) return '';
  if (selector.startsWith('css=')) return selector.slice(4);
  if (selector.startsWith('xpath=')) return selector.slice(6);
  return selector;
}

/**
 * 속성 값 추출
 */
function extractAttributeValue(selector, attrName) {
  if (!selector || !attrName) return '';
  const attrPattern = new RegExp(`\\[${attrName}\\s*=\\s*["']([^"']+)["']\\]`);
  const match = selector.match(attrPattern);
  if (match && match[1]) {
    return match[1];
  }
  const partialPattern = new RegExp(`\\[${attrName}\\s*\\*=\\s*["']([^"']+)["']\\]`);
  const partialMatch = selector.match(partialPattern);
  if (partialMatch && partialMatch[1]) {
    return partialMatch[1];
  }
  return '';
}

/**
 * XPath 셀렉터 보장
 */
function ensureXPathSelector(selector) {
  if (!selector) return '';
  return selector.startsWith('xpath=') ? selector : 'xpath=' + selector;
}

/**
 * 문자열 이스케이프 (Python/JS 공통)
 */
function escapeForDoubleQuotes(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeForPythonString(str) {
  return escapeForDoubleQuotes(str);
}

function escapeForJSString(str) {
  return escapeForDoubleQuotes(str);
}

/**
 * 프레임 비교
 */
function framesEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (a.id || null) === (b.id || null)
    && (a.name || null) === (b.name || null)
    && (a.src || null) === (b.src || null);
}

/**
 * 셀렉터 위치 정보 해석
 */
function resolveSelectorPosition(event) {
  if (!event) return null;
  // 기본 구현 (필요시 확장)
  return null;
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
        sequence: sequence++,
        event: normalizedEvent,
        selectorInfo: selectSelectorForEvent(normalizedEvent)
      });
    });
  }

  let manualFallbackOffset = 0;
  const manualListSafe = Array.isArray(manualList) ? manualList : [];
  manualListSafe.forEach((action) => {
    if (!action || !Array.isArray(action.path) || !action.path.length) return;
    const created = typeof action.createdAt === 'number'
      ? action.createdAt
      : (maxEventTimestamp || Date.now()) + manualFallbackOffset;
    manualFallbackOffset += 1;
    timeline.push({
      kind: 'manual',
      time: created,
      sequence: sequence++,
      action
    });
  });

  timeline.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return a.sequence - b.sequence;
  });
  
  return timeline;
}

/**
 * Playwright Locator 표현식 생성
 */
function buildPlaywrightLocatorExpressionForAction(base, selectorInfo, pythonLike) {
  const selectorType = selectorInfo.type || inferSelectorType(selectorInfo.selector);
  
  if (pythonLike) {
    // Python: text
    if (selectorType === 'text') {
      const textVal = getTextValue(selectorInfo);
      if (textVal) {
        const matchMode = selectorInfo.matchMode || 'exact';
        if (matchMode === 'contains') {
          return `${base}.get_by_text("${escapeForPythonString(textVal)}", exact=False)`;
        }
        return `${base}.get_by_text("${escapeForPythonString(textVal)}", exact=True)`;
      }
    }
    // Python: xpath
    if (selectorType === 'xpath' || selectorType === 'xpath-full') {
      const locator = ensureXPathSelector(selectorInfo.selector);
      return `${base}.locator("${escapeForPythonString(locator)}")`;
    }
    // Python: data-testid
    if (selectorType === 'data-testid') {
      const testIdValue = extractAttributeValue(selectorInfo.selector, 'data-testid');
      if (testIdValue) {
        return `${base}.get_by_test_id("${escapeForPythonString(testIdValue)}")`;
      }
    }
    // Python: 기본 locator
    return `${base}.locator("${escapeForPythonString(selectorInfo.selector)}")`;
  }
  
  // JavaScript/TypeScript: text
  if (selectorType === 'text') {
    const textVal = getTextValue(selectorInfo);
    if (textVal) {
      const matchMode = selectorInfo.matchMode || 'exact';
      if (matchMode === 'contains') {
        return `${base}.getByText("${escapeForJSString(textVal)}")`;
      }
      return `${base}.getByText("${escapeForJSString(textVal)}", { exact: true })`;
    }
  }
  // JavaScript/TypeScript: xpath
  if (selectorType === 'xpath' || selectorType === 'xpath-full') {
    const locator = ensureXPathSelector(selectorInfo.selector);
    return `${base}.locator("${escapeForJSString(locator)}")`;
  }
  // JavaScript/TypeScript: data-testid
  if (selectorType === 'data-testid') {
    const testIdValue = extractAttributeValue(selectorInfo.selector, 'data-testid');
    if (testIdValue) {
      return `${base}.getByTestId("${escapeForJSString(testIdValue)}")`;
    }
  }
  // JavaScript/TypeScript: 기본 locator
  return `${base}.locator("${escapeForJSString(selectorInfo.selector)}")`;
}

/**
 * Playwright Python 액션 생성
 */
function buildPlaywrightPythonAction(ev, selectorInfo, base = 'page') {
  // Assertion actions that don't require selector
  if (ev && (ev.action === 'verifyTitle' || ev.action === 'verifyUrl')) {
    if (ev.action === 'verifyTitle') {
      const value = escapeForPythonString(ev.value || '');
      return `assert ${base}.title() == "${value}"`;
    }
    if (ev.action === 'verifyUrl') {
      // URL 정규화 적용
      const normalizedUrl = normalizeUrl(ev.value || '');
      const value = escapeForPythonString(normalizedUrl);
      const matchMode = ev.matchMode || 'exact'; // 기본값은 'exact'
      
      if (matchMode === 'contains') {
        // 포함 검증
        return `assert "${value}" in normalize_url(${base}.url)`;
      } else {
        // 완전일치 검증 (기존 동작)
        return [
          `${base}.wait_for_url(lambda url: normalize_url(url) == "${value}", timeout=10000)`,
          `assert normalize_url(${base}.url) == "${value}"`
        ];
      }
    }
  }
  
  // Wait actions that don't require selector - selector 체크 전으로 이동
  if (ev && ev.action === 'wait') {
    const waitTime = ev.value || 1000;
    return `${base}.wait_for_timeout(${waitTime})`;
  }
  
  if (!ev || !selectorInfo || !selectorInfo.selector) return null;
  const locatorExpr = buildPlaywrightLocatorExpressionForAction(base, selectorInfo, true);
  const value = escapeForPythonString(ev.value || '');
  const positionInfo = resolveSelectorPosition(ev);
  
  const getLocator = () => {
    if (selectorInfo.type === 'text' && positionInfo && positionInfo.nthOfType && positionInfo.repeats) {
      const index = positionInfo.nthOfType - 1;
      return `${locatorExpr}.nth(${index})`;
    }
    return locatorExpr;
  };
  
  if (ev.action === 'click') {
    return `${getLocator()}.click()`;
  }
  if (ev.action === 'doubleClick') {
    return `${getLocator()}.dblclick()`;
  }
  if (ev.action === 'rightClick') {
    return `${getLocator()}.click(button="right")`;
  }
  if (ev.action === 'hover') {
    return `${getLocator()}.hover()`;
  }
  if (ev.action === 'input' || ev.action === 'type') {
    return `${getLocator()}.fill("${value}")`;
  }
  if (ev.action === 'clear') {
    return `${getLocator()}.clear()`;
  }
  if (ev.action === 'select') {
    if (value) {
      return `${getLocator()}.select_option("${value}")`;
    }
    return `${getLocator()}.select_option()`;
  }
  if (ev.action === 'navigate') {
    return `page.goto("${escapeForPythonString(ev.value || ev.url || '')}")`;
  }
  // Wait actions
  if (ev.action === 'waitForElement') {
    if (!selectorInfo || !selectorInfo.selector) return null;
    const selector = escapeForPythonString(selectorInfo.selector);
    return `${base}.wait_for_selector("${selector}", timeout=30000)`;
  }
  // Assertion actions
  if (ev.action === 'verifyText') {
    const expectedText = escapeForPythonString(value || '');
    return `assert ${getLocator()}.inner_text() == "${expectedText}"`;
  }
  if (ev.action === 'verifyTextContains') {
    const expectedText = escapeForPythonString(value || '');
    return `assert "${expectedText}" in ${getLocator()}.inner_text()`;
  }
  if (ev.action === 'verifyElementPresent') {
    return `assert ${getLocator()}.is_visible()`;
  }
  if (ev.action === 'verifyElementNotPresent') {
    return `assert ${getLocator()}.is_hidden()`;
  }
  if (ev.action === 'verifyTitle') {
    const expectedTitle = escapeForPythonString(value || '');
    return `assert ${base}.title() == "${expectedTitle}"`;
  }
  if (ev.action === 'verifyUrl') {
    // URL 정규화 적용
    const normalizedUrl = normalizeUrl(value || '');
    const expectedUrl = escapeForPythonString(normalizedUrl);
    const matchMode = ev.matchMode || 'exact'; // 기본값은 'exact'
    
    if (matchMode === 'contains') {
      // 포함 검증
      return `assert "${expectedUrl}" in normalize_url(${base}.url)`;
    } else {
      // 완전일치 검증 (기존 동작)
      return [
        `${base}.wait_for_url(lambda url: normalize_url(url) == "${expectedUrl}", timeout=10000)`,
        `assert normalize_url(${base}.url) == "${expectedUrl}"`
      ];
    }
  }
  if (ev.action === 'verifyImage') {
    // 이미지 비교 (pytest-playwright-visual-snapshot 사용)
    // locator.screenshot()으로 이미지를 캡처하고 assert_snapshot에 전달
    const locatorVar = getLocator();
    const imageVar = `image_${Math.random().toString(36).substr(2, 9)}`;
    const snapshotName = ev.snapshotName || ev.value || 'snapshot';
    
    return [
      `${imageVar} = ${locatorVar}.screenshot()`,
      `assert_snapshot(${imageVar}, name="${snapshotName}.jpeg")`
    ];
  }
  return null;
}

/**
 * Playwright JavaScript 액션 생성
 */
function buildPlaywrightJSAction(ev, selectorInfo, base = 'page') {
  // Assertion actions that don't require selector
  if (ev && (ev.action === 'verifyTitle' || ev.action === 'verifyUrl')) {
    const value = escapeForJSString(ev.value || '');
    if (ev.action === 'verifyTitle') {
      return `expect(await ${base}.title()).toBe("${value}");`;
    }
    if (ev.action === 'verifyUrl') {
      // URL 정규화 적용
      const normalizedUrl = normalizeUrl(ev.value || '');
      const normalizedValue = escapeForJSString(normalizedUrl);
      const matchMode = ev.matchMode || 'exact'; // 기본값은 'exact'
      
      if (matchMode === 'contains') {
        // 포함 검증
        return `expect(normalizeUrl(${base}.url())).toContain("${normalizedValue}");`;
      } else {
        // 완전일치 검증 (기존 동작)
        return `await ${base}.waitForURL(url => normalizeUrl(url) === "${normalizedValue}", { timeout: 10000 });\n  expect(normalizeUrl(${base}.url())).toBe("${normalizedValue}");`;
      }
    }
  }
  
  // Wait actions that don't require selector - selector 체크 전으로 이동
  if (ev && ev.action === 'wait') {
    const waitTime = ev.value || 1000;
    return `await ${base}.waitForTimeout(${waitTime});`;
  }
  
  if (!ev || !selectorInfo || !selectorInfo.selector) return null;
  const locatorExpr = buildPlaywrightLocatorExpressionForAction(base, selectorInfo, false);
  const value = escapeForJSString(ev.value || '');
  const positionInfo = resolveSelectorPosition(ev);
  
  const getLocator = () => {
    if (selectorInfo.type === 'text' && positionInfo && positionInfo.nthOfType && positionInfo.repeats) {
      const index = positionInfo.nthOfType - 1;
      return `${locatorExpr}.nth(${index})`;
    }
    return locatorExpr;
  };
  
  if (ev.action === 'click') {
    return `await ${getLocator()}.click();`;
  }
  if (ev.action === 'doubleClick') {
    return `await ${getLocator()}.dblclick();`;
  }
  if (ev.action === 'rightClick') {
    return `await ${getLocator()}.click({ button: 'right' });`;
  }
  if (ev.action === 'hover') {
    return `await ${getLocator()}.hover();`;
  }
  if (ev.action === 'input' || ev.action === 'type') {
    return `await ${getLocator()}.fill("${value}");`;
  }
  if (ev.action === 'clear') {
    return `await ${getLocator()}.clear();`;
  }
  if (ev.action === 'select') {
    if (value) {
      return `await ${getLocator()}.selectOption("${value}");`;
    }
    return `await ${getLocator()}.selectOption();`;
  }
  if (ev.action === 'navigate') {
    return `await page.goto("${escapeForJSString(ev.value || ev.url || '')}");`;
  }
  // Wait actions
  if (ev.action === 'waitForElement') {
    if (!selectorInfo || !selectorInfo.selector) return null;
    return `await ${getLocator()}.waitFor({ timeout: 30000 });`;
  }
  // Assertion actions
  if (ev.action === 'verifyText') {
    const expectedText = escapeForJSString(value || '');
    return `expect(await ${getLocator()}.innerText()).toBe("${expectedText}");`;
  }
  if (ev.action === 'verifyTextContains') {
    const expectedText = escapeForJSString(value || '');
    return `expect(await ${getLocator()}.innerText()).toContain("${expectedText}");`;
  }
  if (ev.action === 'verifyElementPresent') {
    return `expect(await ${getLocator()}.isVisible()).toBe(true);`;
  }
  if (ev.action === 'verifyElementNotPresent') {
    return `expect(await ${getLocator()}.isHidden()).toBe(true);`;
  }
  if (ev.action === 'verifyTitle') {
    const expectedTitle = escapeForJSString(value || '');
    return `expect(await ${base}.title()).toBe("${expectedTitle}");`;
  }
  if (ev.action === 'verifyUrl') {
    // URL 정규화 적용
    const normalizedUrl = normalizeUrl(value || '');
    const expectedUrl = escapeForJSString(normalizedUrl);
    const matchMode = ev.matchMode || 'exact'; // 기본값은 'exact'
    
    if (matchMode === 'contains') {
      // 포함 검증
      return `expect(normalizeUrl(${base}.url())).toContain("${expectedUrl}");`;
    } else {
      // 완전일치 검증 (기존 동작)
      return `await ${base}.waitForURL(url => normalizeUrl(url) === "${expectedUrl}", { timeout: 10000 });\n  expect(normalizeUrl(${base}.url())).toBe("${expectedUrl}");`;
    }
  }
  if (ev.action === 'verifyImage') {
    // 이미지 비교 (Playwright의 snapshot 기능 사용)
    return `expect(await ${getLocator()}.screenshot()).toMatchSnapshot();`;
  }
  return null;
}

/**
 * Selenium Python 액션 생성
 */
function buildSeleniumPythonAction(ev, selectorInfo, driverVar = 'driver') {
  // Assertion actions that don't require selector
  if (ev && (ev.action === 'verifyTitle' || ev.action === 'verifyUrl')) {
    const value = escapeForPythonString(ev.value || '');
    if (ev.action === 'verifyTitle') {
      return `assert ${driverVar}.title == "${value}"`;
    }
    if (ev.action === 'verifyUrl') {
      // URL 정규화 적용
      const normalizedUrl = normalizeUrl(ev.value || '');
      const normalizedValue = escapeForPythonString(normalizedUrl);
      const matchMode = ev.matchMode || 'exact'; // 기본값은 'exact'
      
      if (matchMode === 'contains') {
        // 포함 검증
        return `assert "${normalizedValue}" in normalize_url(${driverVar}.current_url)`;
      } else {
        // 완전일치 검증 (기존 동작)
        return [
          `WebDriverWait(${driverVar}, 10).until(lambda d: normalize_url(d.current_url) == "${normalizedValue}")`,
          `assert normalize_url(${driverVar}.current_url) == "${normalizedValue}"`
        ];
      }
    }
  }
  if (!ev || !selectorInfo || !selectorInfo.selector) return null;
  const selectorType = selectorInfo.type || inferSelectorType(selectorInfo.selector);
  const value = escapeForPythonString(ev.value || '');
  const positionInfo = resolveSelectorPosition(ev);
  
  const getElement = () => {
    if (selectorType === 'xpath') {
      const xpath = escapeForPythonString(getXPathValue(selectorInfo));
      return `${driverVar}.find_element(By.XPATH, "${xpath}")`;
    }
    if (selectorType === 'text') {
      const textVal = getTextValue(selectorInfo);
      if (textVal) {
        const matchMode = selectorInfo.matchMode || 'exact';
        let expr = matchMode === 'exact'
          ? `//*[normalize-space(.) = "${textVal}"]`
          : `//*[contains(normalize-space(.), "${textVal}")]`;
        if (positionInfo && positionInfo.nthOfType && positionInfo.repeats) {
          expr = `(${expr})[${positionInfo.nthOfType}]`;
        }
        const escapedExpr = escapeForPythonString(expr);
        return `${driverVar}.find_element(By.XPATH, "${escapedExpr}")`;
      }
    }
    const cssSelector = escapeForPythonString(selectorInfo.selector);
    return `${driverVar}.find_element(By.CSS_SELECTOR, "${cssSelector}")`;
  };
  
  const element = getElement();
  if (!element) return null;
  
  if (ev.action === 'click') {
    return `${element}.click()`;
  }
  if (ev.action === 'doubleClick') {
    return `${element}.double_click()`;
  }
  if (ev.action === 'rightClick') {
    return `${element}.context_click()`;
  }
  if (ev.action === 'hover') {
    return `ActionChains(${driverVar}).move_to_element(${element}).perform()`;
  }
  if (ev.action === 'input' || ev.action === 'type') {
    return `${element}.send_keys("${value}")`;
  }
  if (ev.action === 'clear') {
    return `${element}.clear()`;
  }
  if (ev.action === 'select') {
    if (value) {
      return `Select(${element}).select_by_visible_text("${value}")`;
    }
    return `Select(${element})`;
  }
  if (ev.action === 'navigate') {
    return `${driverVar}.get("${escapeForPythonString(ev.value || ev.url || '')}")`;
  }
  // Wait actions
  if (ev.action === 'waitForElement') {
    if (!selectorInfo || !selectorInfo.selector) return null;
    const selectorType = selectorInfo.type || inferSelectorType(selectorInfo.selector);
    const selector = escapeForPythonString(selectorInfo.selector);
    if (selectorType === 'xpath') {
      const xpath = escapeForPythonString(getXPathValue(selectorInfo));
      return `WebDriverWait(${driverVar}, 10).until(EC.presence_of_element_located((By.XPATH, "${xpath}")))`;
    }
    return `WebDriverWait(${driverVar}, 10).until(EC.presence_of_element_located((By.CSS_SELECTOR, "${selector}")))`;
  }
  // Assertion actions
  if (ev.action === 'verifyText') {
    const expectedText = escapeForPythonString(value || '');
    return `assert ${element}.text == "${expectedText}"`;
  }
  if (ev.action === 'verifyTextContains') {
    const expectedText = escapeForPythonString(value || '');
    return `assert "${expectedText}" in ${element}.text`;
  }
  if (ev.action === 'verifyElementPresent') {
    return `assert ${element}.is_displayed()`;
  }
  if (ev.action === 'verifyElementNotPresent') {
    return `assert not ${element}.is_displayed()`;
  }
  if (ev.action === 'verifyTitle') {
    const expectedTitle = escapeForPythonString(value || '');
    return `assert ${driverVar}.title == "${expectedTitle}"`;
  }
  if (ev.action === 'verifyUrl') {
    // URL 정규화 적용
    const normalizedUrl = normalizeUrl(value || '');
    const expectedUrl = escapeForPythonString(normalizedUrl);
    const matchMode = ev.matchMode || 'exact'; // 기본값은 'exact'
    
    if (matchMode === 'contains') {
      // 포함 검증
      return `assert "${expectedUrl}" in normalize_url(${driverVar}.current_url)`;
    } else {
      // 완전일치 검증 (기존 동작)
      return [
        `WebDriverWait(${driverVar}, 10).until(lambda d: normalize_url(d.current_url) == "${expectedUrl}")`,
        `assert normalize_url(${driverVar}.current_url) == "${expectedUrl}"`
      ];
    }
  }
  if (ev.action === 'verifyImage') {
    // 이미지 비교 (PIL/Pillow 사용)
    return `# 이미지 비교를 위해 PIL/Pillow 라이브러리 필요\nfrom PIL import Image\nimport io\ncurrent_screenshot = ${element}.screenshot_as_png\n# 기준 이미지와 비교하는 로직 구현 필요`;
  }
  return null;
}

/**
 * Selenium JavaScript 액션 생성
 */
function buildSeleniumJSAction(ev, selectorInfo) {
  if (!ev || !selectorInfo || !selectorInfo.selector) return null;
  const selectorType = selectorInfo.type || inferSelectorType(selectorInfo.selector);
  const value = escapeForJSString(ev.value || '');
  const positionInfo = resolveSelectorPosition(ev);
  
  const getElement = () => {
    if (selectorType === 'xpath') {
      const xpath = escapeForJSString(getXPathValue(selectorInfo));
      return `driver.findElement(By.xpath("${xpath}"))`;
    }
    if (selectorType === 'text') {
      const textVal = getTextValue(selectorInfo);
      if (textVal) {
        const matchMode = selectorInfo.matchMode || 'exact';
        let expr = matchMode === 'exact'
          ? `//*[normalize-space(.) = "${textVal}"]`
          : `//*[contains(normalize-space(.), "${textVal}")]`;
        if (positionInfo && positionInfo.nthOfType && positionInfo.repeats) {
          expr = `(${expr})[${positionInfo.nthOfType}]`;
        }
        const escapedExpr = escapeForJSString(expr);
        return `driver.findElement(By.xpath("${escapedExpr}"))`;
      }
    }
    const cssSelector = escapeForJSString(selectorInfo.selector);
    return `driver.findElement(By.css("${cssSelector}"))`;
  };
  
  const element = getElement();
  if (!element) return null;
  
  if (ev.action === 'click') {
    return `await ${element}.click();`;
  }
  if (ev.action === 'doubleClick') {
    return `await ${element}.doubleClick();`;
  }
  if (ev.action === 'rightClick') {
    return `await ${element}.contextClick();`;
  }
  if (ev.action === 'hover') {
    return `await driver.actions().move({ origin: ${element} }).perform();`;
  }
  if (ev.action === 'input' || ev.action === 'type') {
    return `await ${element}.sendKeys("${value}");`;
  }
  if (ev.action === 'clear') {
    return `await ${element}.clear();`;
  }
  if (ev.action === 'select') {
    if (value) {
      return `await new Select(${element}).selectByVisibleText("${value}");`;
    }
    return `new Select(${element});`;
  }
  if (ev.action === 'navigate') {
    return `await driver.get("${escapeForJSString(ev.value || ev.url || '')}");`;
  }
  // Wait actions
  if (ev.action === 'waitForElement') {
    if (!selectorInfo || !selectorInfo.selector) return null;
    const selectorType = selectorInfo.type || inferSelectorType(selectorInfo.selector);
    if (selectorType === 'xpath') {
      const xpath = escapeForJSString(getXPathValue(selectorInfo));
      return `await driver.wait(until.elementLocated(By.xpath("${xpath}")), 10000);`;
    }
    const cssSelector = escapeForJSString(selectorInfo.selector);
    return `await driver.wait(until.elementLocated(By.css("${cssSelector}")), 10000);`;
  }
  // Assertion actions
  if (ev.action === 'verifyText') {
    const expectedText = escapeForJSString(value || '');
    return `expect(await ${element}.getText()).toBe("${expectedText}");`;
  }
  if (ev.action === 'verifyTextContains') {
    const expectedText = escapeForJSString(value || '');
    return `expect(await ${element}.getText()).toContain("${expectedText}");`;
  }
  if (ev.action === 'verifyElementPresent') {
    return `expect(await ${element}.isDisplayed()).toBe(true);`;
  }
  if (ev.action === 'verifyElementNotPresent') {
    return `expect(await ${element}.isDisplayed()).toBe(false);`;
  }
  if (ev.action === 'verifyTitle') {
    const expectedTitle = escapeForJSString(value || '');
    return `expect(await driver.getTitle()).toBe("${expectedTitle}");`;
  }
  if (ev.action === 'verifyUrl') {
    const normalizedUrl = normalizeUrl(value || '');
    const expectedUrl = escapeForJSString(normalizedUrl);
    const matchMode = ev.matchMode || 'exact'; // 기본값은 'exact'
    
    if (matchMode === 'contains') {
      // 포함 검증
      return `expect(normalizeUrl(await driver.getCurrentUrl())).toContain("${expectedUrl}");`;
    } else {
      // 완전일치 검증
      return `expect(normalizeUrl(await driver.getCurrentUrl())).toBe("${expectedUrl}");`;
    }
  }
  if (ev.action === 'verifyImage') {
    // 이미지 비교 (JavaScript에서는 이미지 비교 라이브러리 필요)
    return `// 이미지 비교를 위해 이미지 비교 라이브러리 필요\nconst screenshot = await ${element}.takeScreenshot();\n// 기준 이미지와 비교하는 로직 구현 필요`;
  }
  return null;
}

/**
 * Playwright 프레임 Locator 라인 생성
 */
function buildPlaywrightFrameLocatorLines(ctx, languageLower, alias, indent, baseVar = 'page') {
  if (!ctx) return [];
  const lines = [];
  const pythonLike = languageLower === 'python' || languageLower === 'python-class';
  
  if (ctx.name) {
    if (pythonLike) {
      lines.push(`${indent}${alias} = ${baseVar}.frame_locator('iframe[name="${ctx.name}"]')`);
    } else {
      lines.push(`${indent}const ${alias} = ${baseVar}.frameLocator('iframe[name="${ctx.name}"]');`);
    }
  } else if (ctx.id) {
    if (pythonLike) {
      lines.push(`${indent}${alias} = ${baseVar}.frame_locator('iframe#${ctx.id}')`);
    } else {
      lines.push(`${indent}const ${alias} = ${baseVar}.frameLocator('iframe#${ctx.id}');`);
    }
  } else if (ctx.src) {
    if (pythonLike) {
      lines.push(`${indent}${alias} = ${baseVar}.frame_locator('iframe[src="${ctx.src}"]')`);
    } else {
      lines.push(`${indent}const ${alias} = ${baseVar}.frameLocator('iframe[src="${ctx.src}"]');`);
    }
  }
  
  return lines;
}

/**
 * Selenium 프레임 전환 (Python)
 */
function buildSeleniumFrameSwitchPython(ctx, driverVar = 'driver') {
  if (!ctx) return null;
  if (ctx.name) return `${driverVar}.switch_to.frame("${ctx.name}")`;
  if (ctx.id) return `${driverVar}.switch_to.frame(${driverVar}.find_element(By.CSS_SELECTOR, "iframe#${ctx.id}"))`;
  if (ctx.src) return `${driverVar}.switch_to.frame(${driverVar}.find_element(By.CSS_SELECTOR, "iframe[src='${ctx.src}']"))`;
  return null;
}

/**
 * Selenium 프레임 전환 (JavaScript)
 */
function buildSeleniumFrameSwitchJS(ctx, indent) {
  if (!ctx) return null;
  if (ctx.name) return `${indent}await driver.switchTo().frame("${ctx.name}");`;
  if (ctx.id) return `${indent}await driver.switchTo().frame(await driver.findElement(By.css("iframe#${ctx.id}")));`;
  if (ctx.src) return `${indent}await driver.switchTo().frame(await driver.findElement(By.css("iframe[src='${ctx.src}']")));`;
  return null;
}

/**
 * 수동 액션 코드 생성 (기본 구현)
 */
function emitManualActionLines(lines, action, frameworkLower, languageLower, indent) {
  // 기본 구현 (필요시 확장)
  // record/popup.js의 buildManualActionCode 함수를 참조
}

/**
 * 조건부 액션 생성 (Python)
 */
function buildConditionalActionPython(ev, base = 'page') {
  if (!ev || ev.action !== 'conditionalAction') return null;
  
  const conditionElement = ev.conditionElement;
  if (!conditionElement || !conditionElement.selector) return null;
  
  const conditionType = ev.conditionType || 'is_visible';
  const conditionValue = ev.conditionValue || '';
  const actionType = ev.actionType || 'click';
  const actionValue = ev.value || '';
  
  const elementSelector = conditionElement.selector;
  let conditionCheck = '';
  
  // 조건 검증 코드 생성
  if (conditionType === 'is_visible') {
    conditionCheck = `${elementSelector}.is_visible()`;
  } else if (conditionType === 'text_contains' && conditionValue) {
    conditionCheck = `"${escapeForPythonString(conditionValue)}" in ${elementSelector}.inner_text()`;
  } else if (conditionType === 'text_equals' && conditionValue) {
    conditionCheck = `${elementSelector}.inner_text() == "${escapeForPythonString(conditionValue)}"`;
  } else if (conditionType === 'class_name' && conditionValue) {
    const className = conditionValue.replace(/^\./, '');
    conditionCheck = `${elementSelector}.get_attribute('class') and "${escapeForPythonString(className)}" in ${elementSelector}.get_attribute('class')`;
  } else if (conditionType === 'has_attribute' && conditionValue) {
    conditionCheck = `${elementSelector}.get_attribute('${escapeForPythonString(conditionValue)}') is not None`;
  } else {
    conditionCheck = `${elementSelector}.is_visible()`;
  }
  
  // 액션 코드 생성
  let actionCode = '';
  if (actionType === 'click') {
    actionCode = `${elementSelector}.click()`;
  } else if (actionType === 'type' && actionValue) {
    actionCode = `${elementSelector}.fill("${escapeForPythonString(actionValue)}")`;
  } else if (actionType === 'hover') {
    actionCode = `${elementSelector}.hover()`;
  } else if (actionType === 'doubleClick') {
    actionCode = `${elementSelector}.dblclick()`;
  } else if (actionType === 'rightClick') {
    actionCode = `${elementSelector}.click(button="right")`;
  } else {
    actionCode = `${elementSelector}.click()`;
  }
  
  return [
    `if await ${conditionCheck}:`,
    `    await ${actionCode}`
  ];
}

/**
 * 조건부 액션 생성 (JavaScript/TypeScript)
 */
function buildConditionalActionJS(ev, base = 'page') {
  if (!ev || ev.action !== 'conditionalAction') return null;
  
  const conditionElement = ev.conditionElement;
  if (!conditionElement || !conditionElement.selector) return null;
  
  const conditionType = ev.conditionType || 'is_visible';
  const conditionValue = ev.conditionValue || '';
  const actionType = ev.actionType || 'click';
  const actionValue = ev.value || '';
  
  const elementSelector = conditionElement.selector;
  let conditionCheck = '';
  
  // 조건 검증 코드 생성
  if (conditionType === 'is_visible') {
    conditionCheck = `await ${elementSelector}.isVisible()`;
  } else if (conditionType === 'text_contains' && conditionValue) {
    conditionCheck = `(await ${elementSelector}.innerText()).includes("${escapeForJSString(conditionValue)}")`;
  } else if (conditionType === 'text_equals' && conditionValue) {
    conditionCheck = `(await ${elementSelector}.innerText()) === "${escapeForJSString(conditionValue)}"`;
  } else if (conditionType === 'class_name' && conditionValue) {
    const className = conditionValue.replace(/^\./, '');
    conditionCheck = `(await ${elementSelector}.getAttribute('class'))?.includes("${escapeForJSString(className)}")`;
  } else if (conditionType === 'has_attribute' && conditionValue) {
    conditionCheck = `(await ${elementSelector}.getAttribute('${escapeForJSString(conditionValue)}')) !== null`;
  } else {
    conditionCheck = `await ${elementSelector}.isVisible()`;
  }
  
  // 액션 코드 생성
  let actionCode = '';
  if (actionType === 'click') {
    actionCode = `await ${elementSelector}.click();`;
  } else if (actionType === 'type' && actionValue) {
    actionCode = `await ${elementSelector}.fill("${escapeForJSString(actionValue)}");`;
  } else if (actionType === 'hover') {
    actionCode = `await ${elementSelector}.hover();`;
  } else if (actionType === 'doubleClick') {
    actionCode = `await ${elementSelector}.dblclick();`;
  } else if (actionType === 'rightClick') {
    actionCode = `await ${elementSelector}.click({ button: 'right' });`;
  } else {
    actionCode = `await ${elementSelector}.click();`;
  }
  
  return `if (${conditionCheck}) {\n  ${actionCode}\n}`;
}

/**
 * 상대 노드 탐색 액션 생성 (Python)
 */
function buildRelativeActionPython(ev, base = 'page') {
  if (!ev || ev.action !== 'relativeAction') return null;
  
  const conditionElement = ev.conditionElement;
  if (!conditionElement || !conditionElement.selector) return null;
  
  const baseSelector = conditionElement.selector;
  const targetRelation = ev.targetRelation || 'parent';
  const targetSelector = ev.targetSelector || '';
  const actionType = ev.actionType || 'click';
  const actionValue = ev.value || '';
  
  let targetSelectorCode = baseSelector;
  
  // 상대 셀렉터 생성
  if (targetRelation === 'parent') {
    if (targetSelector) {
      targetSelectorCode = `${baseSelector}.locator('xpath=..').locator('${targetSelector}')`;
    } else {
      targetSelectorCode = `${baseSelector}.locator('..')`;
    }
  } else if (targetRelation === 'ancestor') {
    // 조상 요소가 선택되었으면 그것을 우선 사용
    const ancestorElement = ev.ancestorElement;
    if (ancestorElement && ancestorElement.selector) {
      targetSelectorCode = ancestorElement.selector;
    } else if (targetSelector) {
      const ancestorTag = targetSelector.replace(/^\./, '').split('[')[0];
      targetSelectorCode = `${baseSelector}.locator('xpath=ancestor::${ancestorTag}[1]')`;
    } else {
      targetSelectorCode = `${baseSelector}.locator('xpath=ancestor::*[1]')`;
    }
  } else if (targetRelation === 'sibling') {
    // 형제 요소가 선택되었으면 그것을 우선 사용
    const siblingElement = ev.siblingElement;
    if (siblingElement && siblingElement.selector) {
      targetSelectorCode = siblingElement.selector;
    } else if (targetSelector) {
      const tagName = targetSelector.replace(/^\./, '').split('[')[0];
      targetSelectorCode = `${baseSelector}.locator('xpath=../following-sibling::${tagName}[1]')`;
    } else {
      targetSelectorCode = `${baseSelector}.locator('xpath=../following-sibling::*[1]')`;
    }
  } else if (targetRelation === 'child') {
    // 자식 요소가 선택되었으면 그것을 우선 사용
    const childElement = ev.childElement;
    if (childElement && childElement.selector) {
      targetSelectorCode = childElement.selector;
    } else if (targetSelector) {
      targetSelectorCode = `${baseSelector}.locator('${targetSelector}')`;
    } else {
      targetSelectorCode = `${baseSelector}.locator('*')`;
    }
  }
  
  // 액션 코드 생성
  if (actionType === 'click') {
    return `await ${targetSelectorCode}.click()`;
  } else if (actionType === 'type' && actionValue) {
    return `await ${targetSelectorCode}.fill("${escapeForPythonString(actionValue)}")`;
  } else if (actionType === 'hover') {
    return `await ${targetSelectorCode}.hover()`;
  } else if (actionType === 'doubleClick') {
    return `await ${targetSelectorCode}.dblclick()`;
  } else if (actionType === 'rightClick') {
    return `await ${targetSelectorCode}.click(button="right")`;
  }
  
  return `await ${targetSelectorCode}.click()`;
}

/**
 * 상대 노드 탐색 액션 생성 (JavaScript/TypeScript)
 */
function buildRelativeActionJS(ev, base = 'page') {
  if (!ev || ev.action !== 'relativeAction') return null;
  
  const conditionElement = ev.conditionElement;
  if (!conditionElement || !conditionElement.selector) return null;
  
  const baseSelector = conditionElement.selector;
  const targetRelation = ev.targetRelation || 'parent';
  const targetSelector = ev.targetSelector || '';
  const actionType = ev.actionType || 'click';
  const actionValue = ev.value || '';
  
  let targetSelectorCode = baseSelector;
  
  // 상대 셀렉터 생성
  if (targetRelation === 'parent') {
    if (targetSelector) {
      targetSelectorCode = `${baseSelector}.locator('xpath=..').locator('${targetSelector}')`;
    } else {
      targetSelectorCode = `${baseSelector}.locator('..')`;
    }
  } else if (targetRelation === 'ancestor') {
    // 조상 요소가 선택되었으면 그것을 우선 사용
    const ancestorElement = ev.ancestorElement;
    if (ancestorElement && ancestorElement.selector) {
      targetSelectorCode = ancestorElement.selector;
    } else if (targetSelector) {
      const ancestorTag = targetSelector.replace(/^\./, '').split('[')[0];
      targetSelectorCode = `${baseSelector}.locator('xpath=ancestor::${ancestorTag}[1]')`;
    } else {
      targetSelectorCode = `${baseSelector}.locator('xpath=ancestor::*[1]')`;
    }
  } else if (targetRelation === 'sibling') {
    // 형제 요소가 선택되었으면 그것을 우선 사용
    const siblingElement = ev.siblingElement;
    if (siblingElement && siblingElement.selector) {
      targetSelectorCode = siblingElement.selector;
    } else if (targetSelector) {
      const tagName = targetSelector.replace(/^\./, '').split('[')[0];
      targetSelectorCode = `${baseSelector}.locator('xpath=../following-sibling::${tagName}[1]')`;
    } else {
      targetSelectorCode = `${baseSelector}.locator('xpath=../following-sibling::*[1]')`;
    }
  } else if (targetRelation === 'child') {
    // 자식 요소가 선택되었으면 그것을 우선 사용
    const childElement = ev.childElement;
    if (childElement && childElement.selector) {
      targetSelectorCode = childElement.selector;
    } else if (targetSelector) {
      targetSelectorCode = `${baseSelector}.locator('${targetSelector}')`;
    } else {
      targetSelectorCode = `${baseSelector}.locator('*')`;
    }
  }
  
  // 액션 코드 생성
  if (actionType === 'click') {
    return `await ${targetSelectorCode}.click();`;
  } else if (actionType === 'type' && actionValue) {
    return `await ${targetSelectorCode}.fill("${escapeForJSString(actionValue)}");`;
  } else if (actionType === 'hover') {
    return `await ${targetSelectorCode}.hover();`;
  } else if (actionType === 'doubleClick') {
    return `await ${targetSelectorCode}.dblclick();`;
  } else if (actionType === 'rightClick') {
    return `await ${targetSelectorCode}.click({ button: 'right' });`;
  }
  
  return `await ${targetSelectorCode}.click();`;
}

/**
 * 반복 액션 생성 (Python)
 */
function buildLoopActionPython(ev, base = 'page') {
  if (!ev || ev.action !== 'loopAction') return null;
  
  const loopMode = ev.loopMode || 'single';
  const loopSelector = ev.loopSelector || '';
  const conditionElement = ev.conditionElement;
  const conditionType = ev.conditionType || 'is_visible';
  const conditionValue = ev.conditionValue || '';
  const actionType = ev.actionType || 'click';
  const actionValue = ev.value || '';
  
  if (loopMode === 'loop' && loopSelector) {
    const lines = [
      `items = ${base}.locator('${loopSelector}')`,
      `count = await items.count()`,
      `for i in range(count):`,
      `    item = items.nth(i)`
    ];
    
    // 조건이 있는 경우
    if (conditionElement && conditionElement.selector) {
      const elementSelector = conditionElement.selector.replace(base, 'item');
      let conditionCheck = '';
      
      if (conditionType === 'is_visible') {
        conditionCheck = `${elementSelector}.is_visible()`;
      } else if (conditionType === 'text_contains' && conditionValue) {
        conditionCheck = `"${escapeForPythonString(conditionValue)}" in ${elementSelector}.inner_text()`;
      } else if (conditionType === 'text_equals' && conditionValue) {
        conditionCheck = `${elementSelector}.inner_text() == "${escapeForPythonString(conditionValue)}"`;
      } else {
        conditionCheck = `${elementSelector}.is_visible()`;
      }
      
      lines.push(`    if await ${conditionCheck}:`);
      
      // 액션 코드
      if (actionType === 'click') {
        lines.push(`        await item.click()`);
      } else if (actionType === 'type' && actionValue) {
        lines.push(`        await item.fill("${escapeForPythonString(actionValue)}")`);
      } else {
        lines.push(`        await item.click()`);
      }
    } else {
      // 조건 없이 액션만
      if (actionType === 'click') {
        lines.push(`    await item.click()`);
      } else if (actionType === 'type' && actionValue) {
        lines.push(`    await item.fill("${escapeForPythonString(actionValue)}")`);
      } else {
        lines.push(`    await item.click()`);
      }
    }
    
    return lines;
  }
  
  // 단일 액션
  return buildConditionalActionPython(ev, base);
}

/**
 * 반복 액션 생성 (JavaScript/TypeScript)
 */
function buildLoopActionJS(ev, base = 'page') {
  if (!ev || ev.action !== 'loopAction') return null;
  
  const loopMode = ev.loopMode || 'single';
  const loopSelector = ev.loopSelector || '';
  const conditionElement = ev.conditionElement;
  const conditionType = ev.conditionType || 'is_visible';
  const conditionValue = ev.conditionValue || '';
  const actionType = ev.actionType || 'click';
  const actionValue = ev.value || '';
  
  if (loopMode === 'loop' && loopSelector) {
    let code = `const items = ${base}.locator('${loopSelector}');\n`;
    code += `const count = await items.count();\n`;
    code += `for (let i = 0; i < count; i++) {\n`;
    code += `  const item = items.nth(i);\n`;
    
    // 조건이 있는 경우
    if (conditionElement && conditionElement.selector) {
      const elementSelector = conditionElement.selector.replace(base, 'item');
      let conditionCheck = '';
      
      if (conditionType === 'is_visible') {
        conditionCheck = `await ${elementSelector}.isVisible()`;
      } else if (conditionType === 'text_contains' && conditionValue) {
        conditionCheck = `(await ${elementSelector}.innerText()).includes("${escapeForJSString(conditionValue)}")`;
      } else if (conditionType === 'text_equals' && conditionValue) {
        conditionCheck = `(await ${elementSelector}.innerText()) === "${escapeForJSString(conditionValue)}"`;
      } else {
        conditionCheck = `await ${elementSelector}.isVisible()`;
      }
      
      code += `  if (${conditionCheck}) {\n`;
      
      // 액션 코드
      if (actionType === 'click') {
        code += `    await item.click();\n`;
      } else if (actionType === 'type' && actionValue) {
        code += `    await item.fill("${escapeForJSString(actionValue)}");\n`;
      } else {
        code += `    await item.click();\n`;
      }
      
      code += `  }\n`;
    } else {
      // 조건 없이 액션만
      if (actionType === 'click') {
        code += `  await item.click();\n`;
      } else if (actionType === 'type' && actionValue) {
        code += `  await item.fill("${escapeForJSString(actionValue)}");\n`;
      } else {
        code += `  await item.click();\n`;
      }
    }
    
    code += `}`;
    return code;
  }
  
  // 단일 액션
  return buildConditionalActionJS(ev, base);
}

/**
 * Python 코드를 try-catch 블록으로 감싸기
 */
function wrapPythonInTry(actionLines, indent = '    ') {
  if (!actionLines || (Array.isArray(actionLines) && actionLines.length === 0)) {
    return actionLines;
  }
  
  const lines = Array.isArray(actionLines) ? actionLines : [actionLines];
  const result = [
    `${indent}try:`
  ];
  
  // 각 줄에 추가 들여쓰기 적용 (try 블록 내부)
  lines.forEach(line => {
    result.push(`${indent}    ${line.trimStart()}`);
  });
  
  result.push(`${indent}except Exception as e:`);
  result.push(`${indent}    print(f"요소 탐색 실패: {type(e).__name__}")`);
  result.push(`${indent}    pass`);
  
  return result;
}

/**
 * JavaScript/TypeScript 코드를 try-catch 블록으로 감싸기
 */
function wrapJSInTry(actionLine, indent = '  ') {
  if (!actionLine) return actionLine;
  
  // 여러 줄인 경우 (개행 포함)
  if (actionLine.includes('\n')) {
    const lines = actionLine.split('\n');
    const result = [`${indent}try {`];
    lines.forEach(line => {
      if (line.trim()) {
        result.push(`${indent}  ${line.trimStart()}`);
      }
    });
    result.push(`${indent}} catch (e) {`);
    result.push(`${indent}  console.error("요소 탐색 실패:", e.name || "Error");`);
    result.push(`${indent}}`);
    return result.join('\n');
  }
  
  // 단일 줄인 경우
  return `${indent}try {\n${indent}  ${actionLine.trimStart()}\n${indent}} catch (e) {\n${indent}  console.error("요소 탐색 실패:", e.name || "Error");\n${indent}}`;
}

/**
 * 메인 코드 생성 함수
 */
export function generateCode(events, manualList, framework, language) {
  const lines = [];
  const frameworkLower = (framework || '').toLowerCase();
  const languageLower = (language || '').toLowerCase();
  const manualActionsList = Array.isArray(manualList) ? manualList.filter(Boolean) : [];
  const timeline = buildActionTimeline(events || [], manualActionsList);
  
  if (frameworkLower === 'playwright') {
    if (languageLower === 'python') {
      // pytest 형식으로 생성
      lines.push("import pytest");
      
      // verifyUrl 액션이 있는지 확인
      const hasVerifyUrl = timeline.some(entry => 
        entry.kind === 'event' && entry.event && entry.event.action === 'verifyUrl'
      );
      
      // verifyImage 액션이 있는지 확인
      const hasVerifyImage = timeline.some(entry => 
        entry.kind === 'event' && entry.event && entry.event.action === 'verifyImage'
      );
      
      // 필요한 import 추가
      if (hasVerifyUrl) {
        lines.push("from test_utils import normalize_url");
      }
      lines.push("");
      
      // fixture 설정: page는 항상 필요, verifyImage가 있으면 assert_snapshot도 추가
      const fixtureParams = hasVerifyImage ? "page, assert_snapshot" : "page";
      lines.push(`def test_generated(${fixtureParams}):`);
      lines.push("    \"\"\"Generated test case\"\"\"");
      
      let currentFrameContext = null;
      let frameLocatorIndex = 0;
      let currentBase = 'page';
      timeline.forEach((entry) => {
        if (entry.kind === 'event') {
          const {event, selectorInfo} = entry;
          const targetFrame = selectorInfo && selectorInfo.iframeContext ? selectorInfo.iframeContext : null;
          if (!framesEqual(targetFrame, currentFrameContext)) {
            if (targetFrame) {
              frameLocatorIndex += 1;
              const alias = `frame_locator_${frameLocatorIndex}`;
              const setupLines = buildPlaywrightFrameLocatorLines(targetFrame, languageLower, alias, '    ', 'page');
              setupLines.forEach(line => lines.push(line));
              currentBase = alias;
              currentFrameContext = targetFrame;
            } else {
              currentBase = 'page';
              currentFrameContext = null;
            }
          }
          // 새로운 액션 타입 처리
          let actionLine = null;
          if (event.action === 'conditionalAction') {
            actionLine = buildConditionalActionPython(event, currentBase);
          } else if (event.action === 'relativeAction') {
            actionLine = buildRelativeActionPython(event, currentBase);
          } else if (event.action === 'loopAction') {
            actionLine = buildLoopActionPython(event, currentBase);
          } else {
            actionLine = buildPlaywrightPythonAction(event, selectorInfo, currentBase);
          }
          
          if (actionLine) {
            // wrapInTry 플래그 확인
            if (event.wrapInTry) {
              console.log('[CodeGenerator] wrapInTry가 true인 이벤트 발견:', {
                action: event.action,
                target: event.target || event.primarySelector,
                wrapInTry: event.wrapInTry
              });
              const wrappedLines = wrapPythonInTry(actionLine, '    ');
              if (Array.isArray(wrappedLines)) {
                wrappedLines.forEach(line => lines.push(line));
              } else {
                lines.push(wrappedLines);
              }
            } else {
              // 배열인 경우 각 줄에 들여쓰기 적용 (함수 내부는 4칸)
              if (Array.isArray(actionLine)) {
                actionLine.forEach(line => lines.push(`    ${line}`));
              } else {
                lines.push(`    ${actionLine}`);
              }
            }
          }
        } else if (entry.kind === 'manual') {
          emitManualActionLines(lines, entry.action, frameworkLower, languageLower, '    ');
        }
      });
    } else if (languageLower === 'python-class') {
      lines.push("from playwright.sync_api import sync_playwright");
      lines.push("");
      lines.push("class GeneratedTestCase:");
      lines.push("  def __init__(self, page):");
      lines.push("    self.page = page");
      lines.push("");
      lines.push("  def run(self):");
      let currentFrameContext = null;
      let frameLocatorIndex = 0;
      let currentBase = 'self.page';
      let hasEmittedAction = false;
      timeline.forEach((entry) => {
        if (entry.kind === 'event') {
          const { event, selectorInfo } = entry;
          const targetFrame = selectorInfo && selectorInfo.iframeContext ? selectorInfo.iframeContext : null;
          if (!framesEqual(targetFrame, currentFrameContext)) {
            if (targetFrame) {
              frameLocatorIndex += 1;
              const alias = `self.frame_locator_${frameLocatorIndex}`;
              const setupLines = buildPlaywrightFrameLocatorLines(targetFrame, languageLower, alias, '    ', 'self.page');
              setupLines.forEach((line) => lines.push(line));
              currentBase = alias;
              currentFrameContext = targetFrame;
            } else {
              currentBase = 'self.page';
              currentFrameContext = null;
            }
          }
          // 새로운 액션 타입 처리
          let actionLine = null;
          if (event.action === 'conditionalAction') {
            actionLine = buildConditionalActionPython(event, currentBase);
          } else if (event.action === 'relativeAction') {
            actionLine = buildRelativeActionPython(event, currentBase);
          } else if (event.action === 'loopAction') {
            actionLine = buildLoopActionPython(event, currentBase);
          } else {
            actionLine = buildPlaywrightPythonAction(event, selectorInfo, currentBase);
          }
          
          if (actionLine) {
            // wrapInTry 플래그 확인
            if (event.wrapInTry) {
              const wrappedLines = wrapPythonInTry(actionLine, '    ');
              if (Array.isArray(wrappedLines)) {
                wrappedLines.forEach(line => lines.push(line));
              } else {
                lines.push(wrappedLines);
              }
            } else {
              // 배열인 경우 각 줄에 들여쓰기 적용
              if (Array.isArray(actionLine)) {
                actionLine.forEach(line => lines.push(`    ${line}`));
              } else {
                lines.push(`    ${actionLine}`);
              }
            }
            hasEmittedAction = true;
          }
        } else if (entry.kind === 'manual') {
          emitManualActionLines(lines, entry.action, frameworkLower, languageLower, '    ');
          hasEmittedAction = true;
        }
      });
      if (!hasEmittedAction) {
        lines.push("    pass");
      }
      lines.push("");
      lines.push("def run_test():");
      lines.push("  with sync_playwright() as p:");
      lines.push("    browser = p.chromium.launch(headless=False)");
      lines.push("    page = browser.new_page()");
      lines.push("    test_case = GeneratedTestCase(page)");
      lines.push("    test_case.run()");
      lines.push("    browser.close()");
      lines.push("");
      lines.push("if __name__ == \"__main__\":");
      lines.push("  run_test()");
    } else if (languageLower === 'javascript') {
      lines.push("const { chromium } = require('playwright');");
      lines.push("");
      lines.push("function normalizeUrl(url) {");
      lines.push("  // URL 정규화: 쿼리 파라미터를 제거하여 기본 경로만 반환");
      lines.push("  if (!url) return url;");
      lines.push("  try {");
      lines.push("    const urlObj = new URL(url);");
      lines.push("    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;");
      lines.push("  } catch (e) {");
      lines.push("    // URL 파싱 실패 시 쿼리 스트링만 제거");
      lines.push("    const queryIndex = url.indexOf('?');");
      lines.push("    return queryIndex !== -1 ? url.substring(0, queryIndex) : url;");
      lines.push("  }");
      lines.push("}");
      lines.push("");
      lines.push("(async () => {");
      lines.push("  const browser = await chromium.launch({ headless: false });");
      lines.push("  const page = await browser.newPage();");
      let currentFrameContext = null;
      let frameLocatorIndex = 0;
      let currentBase = 'page';
      timeline.forEach((entry) => {
        if (entry.kind === 'event') {
          const {event, selectorInfo} = entry;
          const targetFrame = selectorInfo && selectorInfo.iframeContext ? selectorInfo.iframeContext : null;
          if (!framesEqual(targetFrame, currentFrameContext)) {
            if (targetFrame) {
              frameLocatorIndex += 1;
              const alias = `frameLocator${frameLocatorIndex}`;
              const setupLines = buildPlaywrightFrameLocatorLines(targetFrame, languageLower, alias, '  ', 'page');
              setupLines.forEach(line => lines.push(line));
              currentBase = alias;
              currentFrameContext = targetFrame;
            } else {
              currentBase = 'page';
              currentFrameContext = null;
            }
          }
          // 새로운 액션 타입 처리
          let actionLine = null;
          if (event.action === 'conditionalAction') {
            actionLine = buildConditionalActionJS(event, currentBase);
          } else if (event.action === 'relativeAction') {
            actionLine = buildRelativeActionJS(event, currentBase);
          } else if (event.action === 'loopAction') {
            actionLine = buildLoopActionJS(event, currentBase);
          } else {
            actionLine = buildPlaywrightJSAction(event, selectorInfo, currentBase);
          }
          
          if (actionLine) {
            // wrapInTry 플래그 확인
            if (event.wrapInTry) {
              const wrappedLine = wrapJSInTry(actionLine, '  ');
              lines.push(wrappedLine);
            } else {
              // 여러 줄인 경우 개행 처리
              if (actionLine.includes('\n')) {
                const actionLines = actionLine.split('\n');
                actionLines.forEach(line => {
                  if (line.trim()) {
                    lines.push(`  ${line}`);
                  }
                });
              } else {
                lines.push(`  ${actionLine}`);
              }
            }
          }
        } else if (entry.kind === 'manual') {
          emitManualActionLines(lines, entry.action, frameworkLower, languageLower, '  ');
        }
      });
      lines.push("  await browser.close();");
      lines.push("})();");
    } else if (languageLower === 'typescript') {
      lines.push("import { chromium } from 'playwright';");
      lines.push("");
      lines.push("(async () => {");
      lines.push("  const browser = await chromium.launch({ headless: false });");
      lines.push("  const page = await browser.newPage();");
      let currentFrameContext = null;
      let frameLocatorIndex = 0;
      let currentBase = 'page';
      timeline.forEach((entry) => {
        if (entry.kind === 'event') {
          const {event, selectorInfo} = entry;
          const targetFrame = selectorInfo && selectorInfo.iframeContext ? selectorInfo.iframeContext : null;
          if (!framesEqual(targetFrame, currentFrameContext)) {
            if (targetFrame) {
              frameLocatorIndex += 1;
              const alias = `frameLocator${frameLocatorIndex}`;
              const setupLines = buildPlaywrightFrameLocatorLines(targetFrame, languageLower, alias, '  ', 'page');
              setupLines.forEach(line => lines.push(line));
              currentBase = alias;
              currentFrameContext = targetFrame;
            } else {
              currentBase = 'page';
              currentFrameContext = null;
            }
          }
          // 새로운 액션 타입 처리
          let actionLine = null;
          if (event.action === 'conditionalAction') {
            actionLine = buildConditionalActionJS(event, currentBase);
          } else if (event.action === 'relativeAction') {
            actionLine = buildRelativeActionJS(event, currentBase);
          } else if (event.action === 'loopAction') {
            actionLine = buildLoopActionJS(event, currentBase);
          } else {
            actionLine = buildPlaywrightJSAction(event, selectorInfo, currentBase);
          }
          
          if (actionLine) {
            // wrapInTry 플래그 확인
            if (event.wrapInTry) {
              const wrappedLine = wrapJSInTry(actionLine, '  ');
              lines.push(wrappedLine);
            } else {
              // 여러 줄인 경우 개행 처리
              if (actionLine.includes('\n')) {
                const actionLines = actionLine.split('\n');
                actionLines.forEach(line => {
                  if (line.trim()) {
                    lines.push(`  ${line}`);
                  }
                });
              } else {
                lines.push(`  ${actionLine}`);
              }
            }
          }
        } else if (entry.kind === 'manual') {
          emitManualActionLines(lines, entry.action, frameworkLower, languageLower, '  ');
        }
      });
      lines.push("  await browser.close();");
      lines.push("})();");
    }
  } else if (frameworkLower === 'selenium') {
    if (languageLower === 'python') {
      lines.push("from selenium import webdriver");
      lines.push("from selenium.webdriver.common.by import By");
      lines.push("from selenium.webdriver.common.action_chains import ActionChains");
      lines.push("from selenium.webdriver.support.ui import Select, WebDriverWait");
      
      // verifyUrl 액션이 있는지 확인
      const hasVerifyUrl = timeline.some(entry => 
        entry.kind === 'event' && entry.event && entry.event.action === 'verifyUrl'
      );
      
      if (hasVerifyUrl) {
        lines.push("from test_utils import normalize_url");
      }
      lines.push("");
      lines.push("");
      lines.push("driver = webdriver.Chrome()");
      lines.push("driver.get('REPLACE_URL')");
      let currentFrame = null;
      timeline.forEach((entry) => {
        if (entry.kind === 'event') {
          const {event, selectorInfo} = entry;
          const targetFrame = selectorInfo && selectorInfo.iframeContext ? selectorInfo.iframeContext : null;
          if (targetFrame) {
            const switchLine = buildSeleniumFrameSwitchPython(targetFrame);
            if (switchLine) {
              lines.push(switchLine);
              currentFrame = targetFrame;
            }
          } else if (currentFrame) {
            lines.push('driver.switch_to.default_content()');
            currentFrame = null;
          }
          // 새로운 액션 타입 처리 (Selenium은 제한적 지원)
          let actionLine = null;
          if (event.action === 'conditionalAction' || event.action === 'loopAction') {
            // Selenium에서는 조건부 액션을 기본 액션으로 변환
            actionLine = buildSeleniumPythonAction(event, selectorInfo);
          } else if (event.action === 'relativeAction') {
            // Selenium에서는 상대 노드 탐색이 제한적이므로 기본 액션으로 변환
            actionLine = buildSeleniumPythonAction(event, selectorInfo);
          } else {
            actionLine = buildSeleniumPythonAction(event, selectorInfo);
          }
          
          if (actionLine) {
            // wrapInTry 플래그 확인
            if (event.wrapInTry) {
              const wrappedLines = wrapPythonInTry(actionLine, '  ');
              if (Array.isArray(wrappedLines)) {
                wrappedLines.forEach(line => lines.push(line));
              } else {
                lines.push(wrappedLines);
              }
            } else {
              // 배열인 경우 각 줄에 들여쓰기 적용
              if (Array.isArray(actionLine)) {
                actionLine.forEach(line => lines.push(`  ${line}`));
              } else {
                lines.push(`  ${actionLine}`);
              }
            }
          }
        } else if (entry.kind === 'manual') {
          emitManualActionLines(lines, entry.action, frameworkLower, languageLower, '');
        }
      });
      lines.push("driver.quit()");
    } else if (languageLower === 'javascript') {
      lines.push("const { Builder, By, until } = require('selenium-webdriver');");
      lines.push("const chrome = require('selenium-webdriver/chrome');");
      lines.push("");
      lines.push("(async () => {");
      lines.push("  const driver = await new Builder()");
      lines.push("    .forBrowser('chrome')");
      lines.push("    .setChromeOptions(new chrome.Options().addArguments('--headless=new'))");
      lines.push("    .build();");
      lines.push("  await driver.get('REPLACE_URL');");
      let currentFrame = null;
      timeline.forEach((entry) => {
        if (entry.kind === 'event') {
          const {event, selectorInfo} = entry;
          const targetFrame = selectorInfo && selectorInfo.iframeContext ? selectorInfo.iframeContext : null;
          if (targetFrame) {
            const switchLine = buildSeleniumFrameSwitchJS(targetFrame, '  ');
            if (switchLine) {
              lines.push(switchLine);
              currentFrame = targetFrame;
            }
          } else if (currentFrame) {
            lines.push('  await driver.switchTo().defaultContent();');
            currentFrame = null;
          }
          const actionLine = buildSeleniumJSAction(event, selectorInfo);
          if (actionLine) {
            // wrapInTry 플래그 확인
            if (event.wrapInTry) {
              const wrappedLine = wrapJSInTry(actionLine, '  ');
              lines.push(wrappedLine);
            } else {
              lines.push(actionLine);
            }
          }
        } else if (entry.kind === 'manual') {
          emitManualActionLines(lines, entry.action, frameworkLower, languageLower, '  ');
        }
      });
      lines.push("  await driver.quit();");
      lines.push("})();");
    } else if (languageLower === 'typescript') {
      lines.push("import { Builder, By, until } from 'selenium-webdriver';");
      lines.push("import * as chrome from 'selenium-webdriver/chrome';");
      lines.push("");
      lines.push("(async () => {");
      lines.push("  const driver = await new Builder()");
      lines.push("    .forBrowser('chrome')");
      lines.push("    .setChromeOptions(new chrome.Options().addArguments('--headless=new'))");
      lines.push("    .build();");
      lines.push("  await driver.get('REPLACE_URL');");
      let currentFrame = null;
      timeline.forEach((entry) => {
        if (entry.kind === 'event') {
          const {event, selectorInfo} = entry;
          const targetFrame = selectorInfo && selectorInfo.iframeContext ? selectorInfo.iframeContext : null;
          if (targetFrame) {
            const switchLine = buildSeleniumFrameSwitchJS(targetFrame, '  ');
            if (switchLine) {
              lines.push(switchLine);
              currentFrame = targetFrame;
            }
          } else if (currentFrame) {
            lines.push('  await driver.switchTo().defaultContent();');
            currentFrame = null;
          }
          const actionLine = buildSeleniumJSAction(event, selectorInfo);
          if (actionLine) {
            // wrapInTry 플래그 확인
            if (event.wrapInTry) {
              const wrappedLine = wrapJSInTry(actionLine, '  ');
              lines.push(wrappedLine);
            } else {
              lines.push(actionLine);
            }
          }
        } else if (entry.kind === 'manual') {
          emitManualActionLines(lines, entry.action, frameworkLower, languageLower, '  ');
        }
      });
      lines.push("  await driver.quit();");
      lines.push("})();");
    }
  }
  
  return lines.join('\n');
}

