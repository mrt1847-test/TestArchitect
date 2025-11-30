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
  return event;
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
    const value = escapeForPythonString(ev.value || '');
    if (ev.action === 'verifyTitle') {
      return `assert ${base}.title() == "${value}"`;
    }
    if (ev.action === 'verifyUrl') {
      return `assert ${base}.url == "${value}"`;
    }
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
  // Assertion actions
  if (ev.action === 'verifyText') {
    const expectedText = escapeForPythonString(value || '');
    return `assert ${getLocator()}.inner_text() == "${expectedText}"`;
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
    const expectedUrl = escapeForPythonString(value || '');
    return `assert ${base}.url == "${expectedUrl}"`;
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
      return `expect(${base}.url()).toBe("${value}");`;
    }
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
  // Assertion actions
  if (ev.action === 'verifyText') {
    const expectedText = escapeForJSString(value || '');
    return `expect(await ${getLocator()}.innerText()).toBe("${expectedText}");`;
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
    const expectedUrl = escapeForJSString(value || '');
    return `expect(${base}.url()).toBe("${expectedUrl}");`;
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
      return `assert ${driverVar}.current_url == "${value}"`;
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
  // Assertion actions
  if (ev.action === 'verifyText') {
    const expectedText = escapeForPythonString(value || '');
    return `assert ${element}.text == "${expectedText}"`;
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
    const expectedUrl = escapeForPythonString(value || '');
    return `assert ${driverVar}.current_url == "${expectedUrl}"`;
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
      lines.push(`${alias} = ${baseVar}.frame_locator('iframe[name="${ctx.name}"]')`);
    } else {
      lines.push(`const ${alias} = ${baseVar}.frameLocator('iframe[name="${ctx.name}"]');`);
    }
  } else if (ctx.id) {
    if (pythonLike) {
      lines.push(`${alias} = ${baseVar}.frame_locator('iframe#${ctx.id}')`);
    } else {
      lines.push(`const ${alias} = ${baseVar}.frameLocator('iframe#${ctx.id}');`);
    }
  } else if (ctx.src) {
    if (pythonLike) {
      lines.push(`${alias} = ${baseVar}.frame_locator('iframe[src="${ctx.src}"]')`);
    } else {
      lines.push(`const ${alias} = ${baseVar}.frameLocator('iframe[src="${ctx.src}"]');`);
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
      lines.push("from playwright.sync_api import sync_playwright");
      lines.push("");
      lines.push("with sync_playwright() as p:");
      lines.push("  browser = p.chromium.launch(headless=False)");
      lines.push("  page = browser.new_page()");
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
              const setupLines = buildPlaywrightFrameLocatorLines(targetFrame, languageLower, alias, '  ', 'page');
              setupLines.forEach(line => lines.push(`  ${line}`));
              currentBase = alias;
              currentFrameContext = targetFrame;
            } else {
              currentBase = 'page';
              currentFrameContext = null;
            }
          }
          const actionLine = buildPlaywrightPythonAction(event, selectorInfo, currentBase);
          if (actionLine) {
            lines.push(`  ${actionLine}`);
          }
        } else if (entry.kind === 'manual') {
          emitManualActionLines(lines, entry.action, frameworkLower, languageLower, '  ');
        }
      });
      lines.push("  browser.close()");
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
              setupLines.forEach((line) => lines.push(`    ${line}`));
              currentBase = alias;
              currentFrameContext = targetFrame;
            } else {
              currentBase = 'self.page';
              currentFrameContext = null;
            }
          }
          const actionLine = buildPlaywrightPythonAction(event, selectorInfo, currentBase);
          if (actionLine) {
            lines.push(`    ${actionLine}`);
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
              setupLines.forEach(line => lines.push(`  ${line}`));
              currentBase = alias;
              currentFrameContext = targetFrame;
            } else {
              currentBase = 'page';
              currentFrameContext = null;
            }
          }
          const actionLine = buildPlaywrightJSAction(event, selectorInfo, currentBase);
          if (actionLine) {
            lines.push(`  ${actionLine}`);
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
              setupLines.forEach(line => lines.push(`  ${line}`));
              currentBase = alias;
              currentFrameContext = targetFrame;
            } else {
              currentBase = 'page';
              currentFrameContext = null;
            }
          }
          const actionLine = buildPlaywrightJSAction(event, selectorInfo, currentBase);
          if (actionLine) {
            lines.push(`  ${actionLine}`);
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
      lines.push("from selenium.webdriver.support.ui import Select");
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
          const actionLine = buildSeleniumPythonAction(event, selectorInfo);
          if (actionLine) {
            lines.push(actionLine);
          }
        } else if (entry.kind === 'manual') {
          emitManualActionLines(lines, entry.action, frameworkLower, languageLower, '');
        }
      });
      lines.push("driver.quit()");
    } else if (languageLower === 'javascript') {
      lines.push("const { Builder, By } = require('selenium-webdriver');");
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
            lines.push(actionLine);
          }
        } else if (entry.kind === 'manual') {
          emitManualActionLines(lines, entry.action, frameworkLower, languageLower, '  ');
        }
      });
      lines.push("  await driver.quit();");
      lines.push("})();");
    } else if (languageLower === 'typescript') {
      lines.push("import { Builder, By } from 'selenium-webdriver';");
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
            lines.push(actionLine);
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

