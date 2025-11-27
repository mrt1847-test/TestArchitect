/**
 * 셀렉터 유틸리티 모듈
 * record/content.js의 셀렉터 생성 및 검증 로직을 추출
 * 
 * 주요 기능:
 * - 기본 셀렉터 생성 (ID, CSS 경로, XPath, data-* 속성)
 * - 유일성 검증 (전역 및 컨텍스트 기반)
 * - 상위 요소 기반 셀렉터 생성
 * - 텍스트 기반 셀렉터 개선
 * - 점수 계산 및 정렬
 * 
 * @example
 * // 기본 사용
 * const candidates = getSelectorCandidates(element);
 * 
 * // 유일성 검증 포함
 * const enrichedCandidates = getSelectorCandidatesWithUniqueness(element, {
 *   contextElement: parentElement,
 *   requireUnique: true
 * });
 */

// DOM 유틸리티 함수들
function escapeAttributeValue(value) {
  return (value || "").replace(/"/g, '\\"').replace(/\u0008/g, "").replace(/\u000c/g, "").trim();
}

function cssEscapeIdent(value) {
  if (typeof value !== "string") return "";
  if (typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }
  return value.replace(/([!"#$%&'()*+,./:;<=>?@\[\]^`{|}~])/g, "\\$1");
}

function escapeXPathLiteral(value) {
  if (value.includes('"') && value.includes("'")) {
    const parts = value.split('"').map((part) => `"${part}"`).join(', """, ');
    return `concat(${parts})`;
  }
  if (value.includes('"')) {
    return `'${value}'`;
  }
  return `"${value}"`;
}

function normalizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

/**
 * CSS 셀렉터 세그먼트 생성
 */
export function buildCssSegment(el) {
  if (!el || el.nodeType !== 1) return "";
  const tag = el.tagName.toLowerCase();
  let index = 1;
  let sibling = el.previousElementSibling;
  while (sibling) {
    if (sibling.nodeType === 1 && sibling.tagName === el.tagName) {
      index += 1;
    }
    sibling = sibling.previousElementSibling;
  }
  if (el.id) {
    return `${tag}#${cssEscapeIdent(el.id)}`;
  }
  const rawClassList = Array.from(el.classList || []).filter(Boolean);
  const classList = rawClassList.slice(0, 2).map(cssEscapeIdent).filter(Boolean);
  if (classList.length) {
    const classSelector = `${tag}.${classList.join(".")}`;
    const parent = el.parentElement;
    if (parent) {
      const requiredClasses = rawClassList.slice(0, classList.length);
      const matchingSiblings = Array.from(parent.children || []).filter((child) => {
        if (!child || child.nodeType !== 1) return false;
        if (child.tagName !== el.tagName) return false;
        const childClasses = child.classList || [];
        return requiredClasses.every((cls) => childClasses.contains ? childClasses.contains(cls) : childClasses.includes(cls));
      }).length;
      if (matchingSiblings > 1) {
        return `${classSelector}:nth-of-type(${index})`;
      }
    }
    return classSelector;
  }
  return `${tag}:nth-of-type(${index})`;
}

/**
 * 고유한 CSS 경로 생성
 */
export function buildUniqueCssPath(element, contextElement = null) {
  if (!element || element.nodeType !== 1) return null;
  const segments = [];
  let current = element;
  
  while (current && current.nodeType === 1 && current !== contextElement) {
    const segment = buildCssSegment(current);
    if (!segment) return null;
    segments.unshift(segment);
    const cssPath = segments.join(" > ");
    const selectorString = contextElement ? `:scope ${cssPath}` : cssPath;
    const parsed = parseSelectorForMatching(`css=${selectorString}`, "css");
    const targetScope = contextElement || (typeof document !== 'undefined' ? document : null);
    if (!targetScope) return null;
    
    const matchCount = countMatchesForSelector(parsed, targetScope);
    if (matchCount === 1) {
      if (!contextElement && cssPath.startsWith("html:nth-of-type(1) > ")) {
        return cssPath.replace(/^html:nth-of-type\(1\)\s*>\s*/, "");
      }
      return contextElement ? `:scope ${cssPath}` : cssPath;
    }
    current = current.parentElement;
    if (!current) break;
    if (!contextElement && current === (typeof document !== 'undefined' ? document.documentElement : null)) {
      break;
    }
  }
  
  if (contextElement) {
    const relativePath = segments.join(" > ");
    return relativePath ? `:scope ${relativePath}` : null;
  }
  let finalPath = segments.join(" > ");
  if (finalPath.startsWith("html:nth-of-type(1) > ")) {
    finalPath = finalPath.replace(/^html:nth-of-type\(1\)\s*>\s*/, "");
  }
  return finalPath;
}

/**
 * 전체 XPath 생성
 */
export function buildFullXPath(el) {
  if (!el || el.nodeType !== 1) return null;
  if (el.id) {
    const cleanedId = escapeAttributeValue(el.id);
    if (cleanedId) {
      return `//*[@id="${cleanedId}"]`;
    }
  }
  const parts = [];
  let current = el;
  while (current && current.nodeType === 1 && current !== (typeof document !== 'undefined' ? document.documentElement : null)) {
    const tagName = current.tagName.toLowerCase();
    let index = 1;
    let sibling = current.previousSibling;
    while (sibling) {
      if (sibling.nodeType === 1 && sibling.tagName === current.tagName) {
        index += 1;
      }
      sibling = sibling.previousSibling;
    }
    parts.unshift(`${tagName}[${index}]`);
    current = current.parentNode;
  }
  if (parts.length === 0) return null;
  return `//${parts.join("/")}`;
}

/**
 * XPath 세그먼트 생성
 */
function buildXPathSegment(el) {
  if (!el || el.nodeType !== 1) return "";
  const tag = el.tagName.toLowerCase();
  if (el.id) {
    return `${tag}[@id=${escapeXPathLiteral(el.id)}]`;
  }
  const classList = Array.from(el.classList || []).filter(Boolean);
  if (classList.length) {
    const cls = classList[0];
    const containsExpr = `contains(concat(' ', normalize-space(@class), ' '), ${escapeXPathLiteral(" " + cls + " ")})`;
    return `${tag}[${containsExpr}]`;
  }
  const attrPriority = ["data-testid", "data-test", "data-qa", "data-cy", "data-id", "aria-label", "role", "name", "type"];
  for (const attr of attrPriority) {
    const val = el.getAttribute && el.getAttribute(attr);
    if (val) {
      return `${tag}[@${attr}=${escapeXPathLiteral(val)}]`;
    }
  }
  const nameAttr = el.getAttribute && el.getAttribute("name");
  if (nameAttr) {
    return `${tag}[@name=${escapeXPathLiteral(nameAttr)}]`;
  }
  let index = 1;
  let sibling = el.previousElementSibling;
  while (sibling) {
    if (sibling.tagName === el.tagName) {
      index += 1;
    }
    sibling = sibling.previousElementSibling;
  }
  return `${tag}[${index}]`;
}

/**
 * 셀렉터 타입 추론
 */
export function inferSelectorType(selector) {
  if (!selector || typeof selector !== "string") return null;
  const trimmed = selector.trim();
  if (trimmed.startsWith("xpath=")) return "xpath";
  if (trimmed.startsWith("//") || trimmed.startsWith("(")) return "xpath";
  if (trimmed.startsWith("text=")) return "text";
  if (trimmed.startsWith("#") || trimmed.startsWith(".") || trimmed.startsWith("[")) return "css";
  return "css";
}

/**
 * 셀렉터 파싱 (매칭용)
 */
export function parseSelectorForMatching(selector, explicitType) {
  if (!selector) return { type: explicitType || null, value: "" };
  let type = explicitType || inferSelectorType(selector);
  let value = selector;
  if (selector.startsWith("css=")) {
    type = "css";
    value = selector.slice(4);
  } else if (selector.startsWith("xpath=")) {
    type = "xpath";
    value = selector.slice(6);
  } else if (selector.startsWith("text=")) {
    type = "text";
    value = selector.slice(5);
  }
  if (type === "text") {
    value = value.replace(/^['"]|['"]$/g, "");
    value = value.replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return { type, value };
}

/**
 * 요소가 매칭에 사용 가능한지 확인
 */
function isElementVisibleForMatching(element) {
  if (!element || element.nodeType !== 1) return false;
  if (element.hidden) return false;
  const doc = element.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) return false;
  const view = doc && doc.defaultView || (typeof window !== 'undefined' ? window : null);
  if (!view) return false;
  
  let computedStyle = null;
  try {
    computedStyle = view.getComputedStyle(element);
  } catch (err) {
    computedStyle = null;
  }
  if (computedStyle) {
    const opacity = parseFloat(computedStyle.opacity);
    if (!Number.isNaN(opacity) && opacity === 0) return false;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return false;
  }
  return true;
}

function isNodeVisibleForMatching(node) {
  if (!node) return false;
  if (node.nodeType === 1) {
    return isElementVisibleForMatching(node);
  }
  if (node.nodeType === 3 && node.parentElement) {
    return isElementVisibleForMatching(node.parentElement);
  }
  return false;
}

/**
 * 셀렉터 매칭 개수 계산
 */
export function countMatchesForSelector(parsed, root, options = {}) {
  if (!parsed || !parsed.value) return 0;
  if (typeof document === 'undefined' && typeof root === 'undefined') return 0;
  
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope) return 0;
  
  const maxCount = typeof options.maxCount === "number" && options.maxCount > 0 ? options.maxCount : Infinity;
  const shouldClamp = Number.isFinite(maxCount);
  
  try {
    if (parsed.type === "xpath") {
      const doc = scope.ownerDocument || (typeof document !== 'undefined' ? document : null);
      if (!doc || typeof doc.evaluate !== 'function') return 0;
      const contextNode = scope.nodeType ? scope : doc;
      const iterator = doc.evaluate(parsed.value, contextNode, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
      let count = 0;
      let node = iterator.iterateNext();
      while (node) {
        if (isNodeVisibleForMatching(node)) {
          count += 1;
          if (shouldClamp && count >= maxCount) {
            return maxCount;
          }
        }
        node = iterator.iterateNext();
      }
      return count;
    }
    
    if (parsed.type === "text") {
      const targetText = normalizeText(parsed.value);
      if (!targetText) return 0;
      const doc = scope.ownerDocument || (typeof document !== 'undefined' ? document : null);
      if (!doc || typeof doc.evaluate !== 'function') return 0;
      const contextNode = scope.nodeType ? scope : doc;
      const isDocumentScope = !scope || scope === (typeof document !== 'undefined' ? document : null) || scope.nodeType === 9;
      const matchMode = options.matchMode === "contains" ? "contains" : "exact";
      const expression = buildTextXPathExpression(targetText, matchMode, isDocumentScope);
      const iterator = doc.evaluate(expression, contextNode, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
      const matches = [];
      let node = iterator.iterateNext();
      while (node) {
        if (isNodeVisibleForMatching(node)) {
          matches.push(node);
        }
        node = iterator.iterateNext();
      }
      const deduped = dedupeTextMatchNodes(matches);
      if (!shouldClamp) return deduped.length;
      return Math.min(deduped.length, maxCount);
    }
    
    // CSS 셀렉터
    if (typeof scope.querySelectorAll === 'function') {
      const result = scope.querySelectorAll(parsed.value);
      const filtered = Array.from(result).filter((node) => isNodeVisibleForMatching(node));
      if (!shouldClamp) {
        if (scope === (typeof document !== 'undefined' ? document : null)) {
          return filtered.length;
        }
        let count = filtered.length;
        if (scope.matches && scope.matches(parsed.value) && isNodeVisibleForMatching(scope)) {
          count += 1;
        }
        return count;
      }
      let count = 0;
      for (let i = 0; i < filtered.length; i += 1) {
        count += 1;
        if (count >= maxCount) {
          return maxCount;
        }
      }
      if (scope !== (typeof document !== 'undefined' ? document : null) && scope.matches && scope.matches(parsed.value) && isNodeVisibleForMatching(scope)) {
        count += 1;
        if (count >= maxCount) {
          return maxCount;
        }
      }
      return count;
    }
  } catch (err) {
    return 0;
  }
  
  return 0;
}

/**
 * 셀렉터 검증
 */
export function validateSelector(selector, type = null) {
  if (!selector || typeof selector !== 'string') {
    return { valid: false, error: '셀렉터가 없습니다' };
  }
  
  const inferredType = type || inferSelectorType(selector);
  const parsed = parseSelectorForMatching(selector, inferredType);
  
  if (!parsed.value) {
    return { valid: false, error: '셀렉터 값이 비어있습니다' };
  }
  
  // 기본 검증 통과
  return { valid: true, type: parsed.type, value: parsed.value };
}

// 상수 정의
const CLASS_COMBINATION_LIMIT = 3;
const MAX_CLASS_COMBINATIONS = 24;
const DEFAULT_TEXT_SCORE = 65;
const DEFAULT_TAG_SCORE = 20;

// 속성 우선순위 정의
const ATTRIBUTE_PRIORITY = [
  { attr: "id", type: "id", score: 90, reason: "id 속성", allowPartial: false },
  { attr: "data-testid", type: "data-testid", score: 88, reason: "data-testid 속성", allowPartial: true },
  { attr: "data-test", type: "data-test", score: 86, reason: "data-test 속성", allowPartial: true },
  { attr: "data-qa", type: "data-qa", score: 84, reason: "data-qa 속성", allowPartial: true },
  { attr: "data-cy", type: "data-cy", score: 84, reason: "data-cy 속성", allowPartial: true },
  { attr: "data-id", type: "data-id", score: 82, reason: "data-id 속성", allowPartial: true },
  { attr: "aria-label", type: "aria-label", score: 80, reason: "aria-label 속성", allowPartial: true },
  { attr: "role", type: "role", score: 78, reason: "role 속성", allowPartial: false },
  { attr: "name", type: "name", score: 78, reason: "name 속성", allowPartial: false },
  { attr: "title", type: "title", score: 72, reason: "title 속성", allowPartial: true },
  { attr: "type", type: "type", score: 68, reason: "type 속성", allowPartial: false }
];

/**
 * 속성 기반 셀렉터 생성
 */
function buildAttributeSelectors(element) {
  const results = [];
  for (const meta of ATTRIBUTE_PRIORITY) {
    const rawValue = element.getAttribute && element.getAttribute(meta.attr);
    if (!rawValue) continue;
    if (meta.attr === "id") {
      results.push({
        type: "id",
        selector: `#${cssEscapeIdent(rawValue)}`,
        score: meta.score,
        reason: meta.reason
      });
      continue;
    }
    const escaped = escapeAttributeValue(rawValue);
    results.push({
      type: meta.type,
      selector: `[${meta.attr}="${escaped}"]`,
      score: meta.score,
      reason: meta.reason
    });
    if (meta.allowPartial) {
      const tokens = rawValue.split(/[\s,;]+/).filter((token) => token.length > 2);
      tokens.slice(0, 2).forEach((token, index) => {
        const escapedToken = escapeAttributeValue(token);
        results.push({
          type: `${meta.type}-partial`,
          selector: `[${meta.attr}*="${escapedToken}"]`,
          score: Math.max(meta.score - 8 - index * 2, 60),
          reason: `${meta.reason} 부분 일치`,
          matchMode: "contains"
        });
      });
    }
  }
  return results;
}

/**
 * 클래스 조합 셀렉터 생성
 */
function generateClassSelectors(element) {
  const classList = Array.from(element.classList || []).filter(Boolean);
  if (classList.length === 0) return [];
  const escaped = classList.map((cls) => cssEscapeIdent(cls));
  const combinations = new Set();
  
  function backtrack(start, depth, current) {
    if (current.length > 0 && current.length <= CLASS_COMBINATION_LIMIT) {
      const key = current.join(".");
      combinations.add(key);
    }
    if (current.length === CLASS_COMBINATION_LIMIT) return;
    for (let i = start; i < escaped.length; i += 1) {
      current.push(escaped[i]);
      backtrack(i + 1, depth + 1, current);
      current.pop();
    }
  }
  backtrack(0, 0, []);
  
  const results = [];
  const ordered = Array.from(combinations).sort((a, b) => {
    const lenDiff = a.split(".").length - b.split(".").length;
    if (lenDiff !== 0) return lenDiff;
    return a.localeCompare(b);
  });
  
  ordered.slice(0, MAX_CLASS_COMBINATIONS).forEach((key) => {
    const classSelector = `.${key}`;
    results.push({
      type: "class",
      selector: classSelector,
      score: 62 - Math.min(10, key.split(".").length * 2),
      reason: "class 조합"
    });
    results.push({
      type: "class-tag",
      selector: `${element.tagName.toLowerCase()}${classSelector}`,
      score: 68 - Math.min(10, key.split(".").length),
      reason: "태그 + class 조합"
    });
  });
  return results;
}

/**
 * Robust XPath 세그먼트 생성 (속성 기반)
 */
function buildRobustXPathSegment(el) {
  if (!el || el.nodeType !== 1) return null;
  const tag = el.tagName.toLowerCase();
  if (el.id) {
    return { segment: `//*[@id=${escapeXPathLiteral(el.id)}]`, stop: true };
  }
  const attrPriority = ["data-testid", "data-test", "data-qa", "data-cy", "data-id", "aria-label", "role", "name", "type"];
  for (const attr of attrPriority) {
    const val = el.getAttribute && el.getAttribute(attr);
    if (val) {
      return { segment: `${tag}[@${attr}=${escapeXPathLiteral(val)}]`, stop: false };
    }
  }
  const classList = Array.from(el.classList || []).filter(Boolean);
  if (classList.length) {
    const cls = classList[0];
    const containsExpr = `contains(concat(' ', normalize-space(@class), ' '), ${escapeXPathLiteral(" " + cls + " ")})`;
    return { segment: `${tag}[${containsExpr}]`, stop: false };
  }
  let index = 1;
  let sibling = el.previousElementSibling;
  while (sibling) {
    if (sibling.tagName === el.tagName) {
      index += 1;
    }
    sibling = sibling.previousElementSibling;
  }
  return { segment: `${tag}[${index}]`, stop: false };
}

/**
 * Robust XPath 생성 (속성 기반)
 */
function buildRobustXPath(el) {
  if (!el || el.nodeType !== 1) return null;
  const segments = [];
  let current = el;
  while (current && current.nodeType === 1) {
    const info = buildRobustXPathSegment(current);
    if (!info || !info.segment) return null;
    segments.unshift(info.segment);
    if (info.stop) break;
    current = current.parentElement;
  }
  if (segments.length === 0) return null;
  let xpath = segments[0];
  if (xpath.startsWith("//*[@")) {
    if (segments.length > 1) {
      xpath += `/${segments.slice(1).join("/")}`;
    }
  } else {
    xpath = `//${segments.join("/")}`;
  }
  return xpath;
}

/**
 * 첫 번째 nth-of-type 셀렉터 생성
 */
function buildFirstNthOfTypeSelector(element) {
  if (!element || element.nodeType !== 1) return null;
  const parent = element.parentElement;
  if (!parent) return null;
  const tagName = element.tagName ? element.tagName.toLowerCase() : null;
  if (!tagName) return null;
  const siblings = Array.from(parent.children || []);
  let nth = 0;
  for (const sibling of siblings) {
    if (!sibling || sibling.nodeType !== 1) continue;
    if (!sibling.tagName) continue;
    if (sibling.tagName.toLowerCase() === tagName) {
      nth += 1;
      if (sibling === element) break;
    }
  }
  if (nth !== 1) return null;
  const classList = Array.from(element.classList || []).filter(Boolean);
  if (!classList.length) return null;
  const escapedClasses = classList.slice(0, 2).map((cls) => cssEscapeIdent(cls)).filter(Boolean);
  if (!escapedClasses.length) return null;
  const selector = `${tagName}.${escapedClasses.join(".")}:nth-of-type(1)`;
  
  // 유일성 검증 (간단한 버전)
  try {
    const doc = typeof document !== 'undefined' ? document : null;
    if (doc) {
      const matches = doc.querySelectorAll(selector);
      if (matches.length === 1) {
        return {
          type: "css",
          selector: selector,
          score: 88,
          reason: "첫 번째 항목 (nth-of-type)"
        };
      }
    }
  } catch (e) {
    // 무시
  }
  return null;
}

/**
 * 요소에서 셀렉터 후보 생성 (기본 버전)
 */
export function getSelectorCandidates(element) {
  if (!element || element.nodeType !== 1) return [];
  
  const candidates = [];
  
  // 1. 속성 기반 셀렉터 (ID, data-*, aria-label, name, role, title, type 등)
  try {
    buildAttributeSelectors(element).forEach((cand) => {
      candidates.push(cand);
    });
  } catch (e) {
    console.error('[SelectorUtils] buildAttributeSelectors 오류:', e);
  }
  
  // 2. 클래스 조합 셀렉터
  try {
    generateClassSelectors(element).forEach((cand) => {
      candidates.push(cand);
    });
  } catch (e) {
    console.error('[SelectorUtils] generateClassSelectors 오류:', e);
  }
  
  // 4. 텍스트 기반 셀렉터 (버튼, 링크, 라벨 등에 유용)
  const rawText = (element.innerText || element.textContent || "").trim();
  if (rawText) {
    // 첫 번째 줄만 사용 (여러 줄인 경우)
    const firstLine = rawText.split("\n").map((t) => t.trim()).filter(Boolean)[0];
    if (firstLine && firstLine.length > 0 && firstLine.length <= 60) {
      const escapedText = escapeAttributeValue(firstLine);
      const textSelector = `text="${escapedText}"`;
      
      // 텍스트 매칭 개수 확인
      let textMatchCount = null;
      try {
        const parsed = parseSelectorForMatching(textSelector, "text");
        const doc = typeof document !== 'undefined' ? document : null;
        if (doc) {
          textMatchCount = countMatchesForSelector(parsed, doc, { matchMode: "exact", maxCount: 6 });
        }
      } catch (e) {
        textMatchCount = null;
      }
      
      const reasonParts = ["텍스트 일치"];
      if (typeof textMatchCount === "number") {
        if (textMatchCount === 1) {
          reasonParts.push("1개 요소와 일치");
        } else if (textMatchCount > 1) {
          reasonParts.push(`${textMatchCount}개 요소와 일치`);
        } else if (textMatchCount === 0) {
          reasonParts.push("일치 없음");
        }
      }
      
      candidates.push({
        selector: textSelector,
        type: 'text',
        score: textMatchCount === 1 ? 80 : 50,
        reason: reasonParts.join(" • "),
        textValue: firstLine,
        matchMode: "exact",
        unique: textMatchCount === 1,
        matchCount: textMatchCount
      });
    }
  }
  
  // 5. Robust XPath (속성 기반)
  try {
    const robustXPath = buildRobustXPath(element);
    if (robustXPath) {
      candidates.push({
        type: "xpath",
        selector: `xpath=${robustXPath}`,
        score: 58,
        reason: "속성 기반 XPath",
        xpathValue: robustXPath
      });
    }
  } catch (e) {
    console.error('[SelectorUtils] buildRobustXPath 오류:', e);
  }
  
  // 6. CSS 경로
  const cssPath = buildUniqueCssPath(element);
  if (cssPath) {
    candidates.push({
      selector: cssPath,
      type: 'css',
      score: 70,
      reason: 'CSS 경로'
    });
  }
  
  // 7. Full XPath
  const xpath = buildFullXPath(element);
  if (xpath) {
    candidates.push({
      selector: `xpath=${xpath}`,
      type: 'xpath-full',
      score: 42,
      reason: 'Full XPath (절대 경로)',
      xpathValue: xpath
    });
  }
  
  // 8. 첫 번째 nth-of-type 셀렉터
  try {
    const firstNthCandidate = buildFirstNthOfTypeSelector(element);
    if (firstNthCandidate) {
      candidates.push(firstNthCandidate);
    }
  } catch (e) {
    console.error('[SelectorUtils] buildFirstNthOfTypeSelector 오류:', e);
  }
  
  // 9. 태그 기반 (낮은 우선순위)
  const tagSelector = element.tagName.toLowerCase();
  candidates.push({
    selector: tagSelector,
    type: 'tag',
    score: DEFAULT_TAG_SCORE,
    reason: '태그 이름'
  });
  
  return candidates.sort((a, b) => (b.score || 0) - (a.score || 0));
}

// ============================================================================
// 유일성 검증 및 상위 요소 기반 셀렉터 생성
// ============================================================================

// 상수 정의
const CSS_PARENT_MAX_DEPTH = 3;
const CSS_PARENT_CLASS_LIMIT = 4;
const CSS_PARENT_COMBINATION_LIMIT = 3;
const CSS_PARENT_MAX_COMBINATIONS = 20;
const CSS_SIMPLE_PARENT_MAX_DEPTH = 4;
const TEXT_PARENT_MAX_DEPTH = 4;
const TEXT_PARENT_CLASS_LIMIT = 4;
const TEXT_PARENT_COMBINATION_LIMIT = 3;
const TEXT_PARENT_MAX_COMBINATIONS = 12;
const UNIQUE_MATCH_BONUS = 6;
const DUPLICATE_PENALTY_STEP = 6;

/**
 * 텍스트 XPath 표현식 생성
 */
function buildTextXPathExpression(text, matchMode, scopeIsDocument) {
  const literal = escapeXPathLiteral(text);
  const base = scopeIsDocument ? "//" : ".//";
  if (matchMode === "exact") {
    return `${base}*[normalize-space(.) = ${literal}]`;
  }
  return `${base}*[contains(normalize-space(.), ${literal})]`;
}

/**
 * 텍스트 매칭 노드 중복 제거
 */
function dedupeTextMatchNodes(nodes) {
  if (!Array.isArray(nodes) || nodes.length <= 1) return nodes || [];
  const nodeSet = new Set(nodes);
  const result = [];
  nodes.forEach((node) => {
    if (!node) return;
    const text = normalizeText(node.textContent || "");
    if (!text) return;
    let ancestor = node.parentElement;
    while (ancestor) {
      if (nodeSet.has(ancestor)) {
        const ancestorText = normalizeText(ancestor.textContent || "");
        if (ancestorText === text) {
          return;
        }
      }
      ancestor = ancestor.parentElement;
    }
    result.push(node);
  });
  return result;
}

/**
 * 클래스 조합 리스트 생성
 */
function buildClassCombinationLists(classes, options = {}) {
  const {
    limit = CSS_PARENT_COMBINATION_LIMIT,
    maxResults = CSS_PARENT_MAX_COMBINATIONS,
    classLimit = CSS_PARENT_CLASS_LIMIT
  } = options;
  const uniqueClasses = Array.from(new Set(classes)).filter(Boolean).slice(0, classLimit);
  const combos = [];
  function backtrack(start, current) {
    if (current.length > 0 && combos.length < maxResults) {
      combos.push([...current]);
    }
    if (current.length === limit) return;
    for (let i = start; i < uniqueClasses.length && combos.length < maxResults; i += 1) {
      current.push(uniqueClasses[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }
  backtrack(0, []);
  return combos;
}

/**
 * CSS 셀렉터 추출
 */
function extractCssSelector(candidate) {
  if (!candidate) return null;
  const selector = candidate.selector || "";
  const type = candidate.type || inferSelectorType(selector);
  if (type === "css") {
    return selector.startsWith("css=") ? selector.slice(4) : selector;
  }
  if (type === "class" || type === "class-tag" || type === "id" || type === "tag") {
    return selector;
  }
  if (type === "text") return null;
  return null;
}

/**
 * 상위 요소 기반 텍스트 XPath 생성
 */
function tryBuildAncestorTextXPath(element, textValue, matchMode) {
  if (!element || !textValue) return null;
  const normalized = normalizeText(textValue);
  if (!normalized) return null;
  const literal = escapeXPathLiteral(normalized);
  const textExpr = matchMode === "contains" ? `contains(normalize-space(.), ${literal})` : `normalize-space(.) = ${literal}`;
  const elementClassList = Array.from(element.classList || []).filter(Boolean);
  
  if (elementClassList.length) {
    for (const cls of elementClassList.slice(0, TEXT_PARENT_CLASS_LIMIT)) {
      const literalClass = escapeXPathLiteral(cls);
      const tagName = element.tagName ? element.tagName.toLowerCase() : "*";
      const candidates = [
        `//*[@class=${literalClass} and normalize-space(.) = ${literal}]`,
        `//*[@class=${literalClass} and contains(normalize-space(.), ${literal})]`,
        `//${tagName}[@class=${literalClass} and normalize-space(.) = ${literal}]`,
        `//${tagName}[@class=${literalClass} and contains(normalize-space(.), ${literal})]`
      ];
      for (const xpathExpr of candidates) {
        const selector = `xpath=${xpathExpr}`;
        const parsed = parseSelectorForMatching(selector, "xpath");
        const doc = typeof document !== 'undefined' ? document : null;
        if (!doc) continue;
        const count = countMatchesForSelector(parsed, doc, { matchMode });
        if (count === 1) {
          const isTagVariant = xpathExpr.startsWith(`//${tagName}`);
          return {
            selector,
            count,
            reason: isTagVariant ? "태그+클래스 + 텍스트 조합" : "클래스 + 텍스트 조합"
          };
        }
      }
    }
  }
  
  let current = element.parentElement;
  let depth = 0;
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return null;
  
  while (current && depth < TEXT_PARENT_MAX_DEPTH) {
    depth += 1;
    if (current.nodeType !== 1) {
      current = current.parentElement;
      continue;
    }
    const classList = Array.from(current.classList || []).filter(Boolean);
    const tagName = current.tagName ? current.tagName.toLowerCase() : "*";
    if (classList.length > 0) {
      for (const cls of classList.slice(0, TEXT_PARENT_CLASS_LIMIT)) {
        const classLiteral = escapeXPathLiteral(cls);
        const classXPath = `//*[@class=${classLiteral}]//*[${textExpr}]`;
        const classSelector = `xpath=${classXPath}`;
        const classParsed = parseSelectorForMatching(classSelector, "xpath");
        const classCount = countMatchesForSelector(classParsed, doc, { matchMode });
        if (classCount === 1) {
          return {
            selector: classSelector,
            count: classCount,
            reason: "상위 클래스 + 텍스트 조합"
          };
        }
        const tagClassXPath = `//${tagName}[@class=${classLiteral}]//*[${textExpr}]`;
        const tagClassSelector = `xpath=${tagClassXPath}`;
        const tagClassParsed = parseSelectorForMatching(tagClassSelector, "xpath");
        const tagClassCount = countMatchesForSelector(tagClassParsed, doc, { matchMode });
        if (tagClassCount === 1) {
          return {
            selector: tagClassSelector,
            count: tagClassCount,
            reason: "상위 태그+클래스 + 텍스트 조합"
          };
        }
      }
    } else if (tagName && tagName !== "*") {
      const tagOnlyXPath = `//${tagName}[${textExpr}]`;
      const tagOnlySelector = `xpath=${tagOnlyXPath}`;
      const tagOnlyParsed = parseSelectorForMatching(tagOnlySelector, "xpath");
      const tagOnlyCount = countMatchesForSelector(tagOnlyParsed, doc, { matchMode });
      if (tagOnlyCount === 1) {
        return {
          selector: tagOnlySelector,
          count: tagOnlyCount,
          reason: "상위 태그 + 텍스트 조합"
        };
      }
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * 상위 요소 기반 CSS 셀렉터 생성 (복잡한 버전)
 */
function tryBuildAncestorCssSelector(element, baseSelector, contextElement) {
  if (!element || !baseSelector) return null;
  const base = baseSelector.startsWith("css=") ? baseSelector.slice(4).trim() : baseSelector.trim();
  if (!base) return null;
  
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return null;
  
  const tested = new Set();
  let current = element.parentElement;
  let depth = 0;
  let paths = [base];
  
  while (current && depth < CSS_PARENT_MAX_DEPTH && paths.length) {
    depth += 1;
    if (current.nodeType !== 1) {
      current = current.parentElement;
      continue;
    }
    const ancestorSelectors = [];
    const classList = Array.from(current.classList || []).filter(Boolean);
    if (classList.length) {
      const combos = buildClassCombinationLists(classList, {
        limit: CSS_PARENT_COMBINATION_LIMIT,
        maxResults: CSS_PARENT_MAX_COMBINATIONS,
        classLimit: CSS_PARENT_CLASS_LIMIT
      });
      combos.forEach((combo) => {
        const escaped = combo.map((cls) => cssEscapeIdent(cls));
        if (escaped.length) {
          ancestorSelectors.push(`.${escaped.join(".")}`);
          const tag = current.tagName ? current.tagName.toLowerCase() : "*";
          ancestorSelectors.push(`${tag}.${escaped.join(".")}`);
        }
      });
    }
    const tagName = current.tagName ? current.tagName.toLowerCase() : "*";
    ancestorSelectors.push(tagName);
    const newPaths = [];
    for (const ancestorSelector of ancestorSelectors) {
      for (const path of paths) {
        const directSelector = `${ancestorSelector} > ${path}`;
        const descendantSelector = `${ancestorSelector} ${path}`;
        const candidates = [directSelector, descendantSelector];
        for (const candidatePath of candidates) {
          const normalized = candidatePath.trim();
          if (!normalized || tested.has(normalized)) continue;
          tested.add(normalized);
          const fullSelector = contextElement ? `:scope ${normalized}` : normalized;
          const parsed = parseSelectorForMatching(`css=${fullSelector}`, "css");
          const targetScope = contextElement || doc;
          const count = countMatchesForSelector(parsed, targetScope);
          if (count === 1) {
            return {
              selector: `css=${fullSelector}`,
              count
            };
          }
          newPaths.push(normalized);
        }
      }
    }
    paths = Array.from(new Set(newPaths)).slice(0, CSS_PARENT_MAX_COMBINATIONS);
    current = current.parentElement;
  }
  return null;
}

/**
 * 상위 요소 기반 CSS 셀렉터 생성 (간단한 버전)
 */
function tryBuildSimpleAncestorCss(element, baseSelector, contextElement) {
  if (!element || !baseSelector) return null;
  const base = baseSelector.startsWith("css=") ? baseSelector.slice(4).trim() : baseSelector.trim();
  if (!base) return null;
  
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return null;
  
  const targetScope = contextElement || doc;
  let current = element;
  let selector = base;
  let depth = 0;
  
  const buildParentSelector = (node) => {
    if (!node || node.nodeType !== 1) return null;
    if (node.id) {
      return `#${cssEscapeIdent(node.id)}`;
    }
    const classList = Array.from(node.classList || []).filter(Boolean);
    if (classList.length) {
      return `.${cssEscapeIdent(classList[0])}`;
    }
    return node.tagName ? node.tagName.toLowerCase() : null;
  };
  
  while (current && depth < CSS_SIMPLE_PARENT_MAX_DEPTH) {
    const fullSelector = contextElement ? `css=:scope ${selector}` : `css=${selector}`;
    const parsed = parseSelectorForMatching(fullSelector, "css");
    const count = countMatchesForSelector(parsed, targetScope);
    if (count === 1) {
      return { selector: fullSelector, count };
    }
    const parent = current.parentElement;
    if (!parent) break;
    const parentSelector = buildParentSelector(parent);
    if (!parentSelector) break;
    selector = `${parentSelector} > ${selector}`;
    current = parent;
    depth += 1;
  }
  const finalSelector = contextElement ? `css=:scope ${selector}` : `css=${selector}`;
  const finalParsed = parseSelectorForMatching(finalSelector, "css");
  const finalCount = countMatchesForSelector(finalParsed, targetScope);
  if (finalCount === 1) {
    return { selector: finalSelector, count: finalCount };
  }
  return null;
}

/**
 * 원본 메타데이터 보장
 */
function ensureRawMetadata(candidate, baseCandidate, originalType) {
  if (candidate.rawSelector === undefined) {
    candidate.rawSelector = baseCandidate.rawSelector || baseCandidate.selector;
  }
  if (candidate.rawType === undefined) {
    candidate.rawType = baseCandidate.rawType || originalType;
  }
  if (candidate.rawReason === undefined && baseCandidate.reason) {
    candidate.rawReason = baseCandidate.rawReason || baseCandidate.reason;
  }
}

/**
 * 이유 컨텍스트 생성
 */
function createReasonContext(candidate) {
  return {
    reasonParts: candidate.reason ? [candidate.reason] : []
  };
}

/**
 * 전역 매칭 검증
 */
function applyGlobalMatchCheck(candidate, parsed, options, ctx) {
  if (options.skipGlobalCheck) return true;
  
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return false;
  
  const matchOptions = {
    matchMode: candidate.matchMode,
    maxCount: typeof options.maxMatchSample === "number" && options.maxMatchSample > 0 ? options.maxMatchSample : 4
  };
  const globalCount = countMatchesForSelector(parsed, doc, matchOptions);
  candidate.matchCount = globalCount;
  candidate.unique = globalCount === 1;
  if (candidate.rawMatchCount === undefined) {
    candidate.rawMatchCount = globalCount;
    candidate.rawUnique = globalCount === 1;
  }
  if (globalCount === 0 && options.allowZero !== true) {
    return false;
  }
  ctx.reasonParts = ctx.reasonParts.filter((part) => !/유일 일치|개 요소와 일치/.test(part));
  if (globalCount === 1) {
    ctx.reasonParts.push("유일 일치");
  } else if (globalCount > 1) {
    ctx.reasonParts.push(globalCount === 2 ? "2개 요소와 일치 (추가 조합)" : `${globalCount}개 요소와 일치`);
  }
  return true;
}

/**
 * 컨텍스트 매칭 검증
 */
function applyContextMatchCheck(candidate, parsed, options, ctx) {
  if (!options.contextElement) return true;
  
  const contextCount = countMatchesForSelector(parsed, options.contextElement, { matchMode: candidate.matchMode });
  candidate.contextMatchCount = contextCount;
  candidate.uniqueInContext = contextCount === 1;
  if (options.contextLabel) {
    if (contextCount === 1) {
      ctx.reasonParts.push(`${options.contextLabel} 내 유일`);
    } else if (contextCount > 1) {
      ctx.reasonParts.push(`${options.contextLabel} 내 ${contextCount}개 일치`);
    } else {
      ctx.reasonParts.push(`${options.contextLabel} 내 일치 없음`);
    }
  }
  if (options.requireContextUnique && !candidate.uniqueInContext) {
    return false;
  }
  if (options.skipGlobalCheck) {
    candidate.matchCount = contextCount;
    candidate.unique = candidate.uniqueInContext;
  }
  return true;
}

/**
 * 중복 점수 제한
 */
function clampDuplicateScore(candidate, options) {
  if (typeof candidate.score !== "number") return;
  candidate.score = Math.min(candidate.score, options.duplicateScore ?? 55);
}

/**
 * 텍스트 셀렉터 개선 (상위 요소 기반)
 */
function maybeDeriveTextSelector(candidate, originalType, options, parsed, ctx) {
  if (candidate.unique) return;
  if (originalType !== "text") return;
  if (!options.element) return;
  const textValue = candidate.textValue || parsed.value;
  if (!textValue) return;
  const ancestorResult = tryBuildAncestorTextXPath(
    options.element,
    textValue,
    candidate.matchMode || "exact"
  );
  if (!ancestorResult) return;
  candidate.selector = ancestorResult.selector;
  candidate.type = "xpath";
  candidate.relation = candidate.relation || "global";
  if (ancestorResult.reason) {
    ctx.reasonParts.push(ancestorResult.reason);
  } else {
    ctx.reasonParts.push("텍스트 조합");
  }
}

/**
 * CSS 셀렉터 개선 (상위 요소 기반)
 */
function maybeDeriveCssSelector(candidate, options, ctx) {
  if (candidate.unique) return;
  if (!options.element) return;
  const baseCssSelector = extractCssSelector(candidate);
  if (!baseCssSelector) return;
  const simpleDerived = tryBuildSimpleAncestorCss(options.element, baseCssSelector, options.contextElement);
  if (simpleDerived) {
    candidate.selector = simpleDerived.selector;
    candidate.type = "css";
    candidate.relation = options.contextElement ? "relative" : candidate.relation || "global";
    ctx.reasonParts.push("부모 태그 경로 조합");
    return;
  }
  const derived = tryBuildAncestorCssSelector(options.element, baseCssSelector, options.contextElement);
  if (derived) {
    candidate.selector = derived.selector;
    candidate.type = "css";
    candidate.relation = options.contextElement ? "relative" : candidate.relation || "global";
    ctx.reasonParts.push("상위 class 경로 조합");
  }
}

/**
 * 인덱싱 적용
 */
function maybeApplyIndexing(candidate, originalType, options, ctx) {
  if (candidate.unique) return;
  if (originalType === "text" || originalType === "xpath") return;
  if (!options.element) return;
  if (options.enableIndexing === false) return;
  const contextEl = options.contextElement && candidate.relation === "relative" ? options.contextElement : null;
  const uniqueSelector = buildUniqueCssPath(options.element, contextEl);
  if (!uniqueSelector || uniqueSelector === candidate.selector) return;
  const uniqueParsed = parseSelectorForMatching(uniqueSelector, "css");
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return;
  const count = countMatchesForSelector(uniqueParsed, contextEl || doc, {
    matchMode: candidate.matchMode,
    maxCount: 2
  });
  if (count !== 1) return;
  candidate.selector = uniqueSelector;
  candidate.type = "css";
  candidate.relation = contextEl ? "relative" : candidate.relation;
  ctx.reasonParts.push("경로 인덱싱 적용");
}

/**
 * 유일성 최종화
 */
function finalizeUniqueness(candidate, options, ctx) {
  if (candidate.unique) return;
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return;
  
  const verificationParsed = parseSelectorForMatching(
    candidate.selector,
    candidate.type || inferSelectorType(candidate.selector)
  );
  const verificationCount = countMatchesForSelector(
    verificationParsed,
    options.contextElement || doc,
    { matchMode: candidate.matchMode, maxCount: 4 }
  );
  candidate.matchCount = verificationCount;
  candidate.unique = verificationCount === 1;
  candidate.uniqueInContext = verificationCount === 1;
  ctx.reasonParts = ctx.reasonParts.filter((part) => !/유일 일치|개 요소와 일치/.test(part));
  if (verificationCount === 1) {
    ctx.reasonParts.push("유일 일치");
  } else if (verificationCount === 2) {
    ctx.reasonParts.push("2개 요소와 일치 (추가 조합)");
  } else if (verificationCount > 2) {
    ctx.reasonParts.push(`${verificationCount}개 요소와 일치`);
  }
}

/**
 * 셀렉터 후보 유일성 검증 및 개선
 */
export function enrichCandidateWithUniqueness(baseCandidate, options = {}) {
  if (!baseCandidate || !baseCandidate.selector) return null;
  
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return null;
  
  const candidate = { ...baseCandidate };
  const originalType = candidate.type || inferSelectorType(candidate.selector);
  const resolvedType = candidate.type || originalType;
  ensureRawMetadata(candidate, baseCandidate, originalType);
  const parsed = parseSelectorForMatching(candidate.selector, resolvedType);
  const ctx = createReasonContext(candidate);
  
  if (!applyGlobalMatchCheck(candidate, parsed, options, ctx)) {
    return null;
  }
  if (!applyContextMatchCheck(candidate, parsed, options, ctx)) {
    return null;
  }
  if (!options.skipGlobalCheck && options.requireUnique && candidate.unique === false) {
    return null;
  }
  if (!options.skipGlobalCheck && candidate.unique === false) {
    clampDuplicateScore(candidate, options);
  }
  
  maybeDeriveTextSelector(candidate, originalType, options, parsed, ctx);
  maybeDeriveCssSelector(candidate, options, ctx);
  maybeApplyIndexing(candidate, originalType, options, ctx);
  finalizeUniqueness(candidate, options, ctx);
  
  candidate.reason = ctx.reasonParts.join(" • ");
  if (typeof candidate.score === "number") {
    if (candidate.unique) {
      candidate.score = Math.min(100, Math.max(candidate.score + UNIQUE_MATCH_BONUS, 95));
    } else if (candidate.matchCount > 1) {
      candidate.score = Math.max(
        10,
        candidate.score - Math.min(24, (candidate.matchCount - 1) * DUPLICATE_PENALTY_STEP)
      );
    }
  }
  
  return candidate;
}

/**
 * 개선된 셀렉터 후보 생성 (유일성 검증 포함)
 * 이 함수는 상위 요소 기반 셀렉터 생성 및 유일성 검증을 포함합니다.
 */
export function getSelectorCandidatesWithUniqueness(element, options = {}) {
  if (!element || element.nodeType !== 1) return [];
  
  const candidates = [];
  
  // 기본 셀렉터 후보 생성
  const baseCandidates = getSelectorCandidates(element);
  
  // 각 후보에 대해 유일성 검증 및 개선
  baseCandidates.forEach((baseCandidate) => {
    const enriched = enrichCandidateWithUniqueness(baseCandidate, {
      element,
      ...options
    });
    if (enriched) {
      candidates.push(enriched);
    }
  });
  
  // 점수 및 유일성 기준으로 정렬
  return candidates.sort((a, b) => {
    const uniqueA = a.unique ? 1 : 0;
    const uniqueB = b.unique ? 1 : 0;
    if (uniqueA !== uniqueB) return uniqueB - uniqueA;
    const relationA = a.relation === "relative" ? 1 : 0;
    const relationB = b.relation === "relative" ? 1 : 0;
    if (relationA !== relationB) return relationB - relationA;
    return (b.score || 0) - (a.score || 0);
  });
}

/**
 * 셀렉터 후보 정렬 (유일성 우선)
 */
export function sortCandidates(candidates) {
  return candidates.slice().sort((a, b) => {
    const uniqueA = a.unique ? 1 : 0;
    const uniqueB = b.unique ? 1 : 0;
    if (uniqueA !== uniqueB) return uniqueB - uniqueA;
    const relationA = a.relation === "relative" ? 1 : 0;
    const relationB = b.relation === "relative" ? 1 : 0;
    if (relationA !== relationB) return relationB - relationA;
    return (b.score || 0) - (a.score || 0);
  });
}

