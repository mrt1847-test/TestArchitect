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
 * XPath 생성 (Chrome Recorder 방식)
 * Shadow DOM을 지원하고 최적화된 XPath를 생성합니다.
 * 
 * @param node - XPath를 생성할 노드
 * @param optimized - 최적화 여부 (custom attributes 우선 사용)
 * @param attributes - 우선 사용할 custom attributes 배열
 * @returns XPath 문자열 또는 undefined
 */
export function computeXPath(node, optimized = true, attributes = []) {
  if (!node) return undefined;
  
  // Document 노드는 '/' 반환
  if (node.nodeType === 9) { // DOCUMENT_NODE
    return '/';
  }

  const selectors = [];
  const buffer = [];
  let contextNode = node;
  const doc = typeof document !== 'undefined' ? document : null;
  
  // Custom attributes 기본값 (Chrome Recorder와 동일)
  const defaultAttributes = [
    'data-testid',
    'data-test',
    'data-qa',
    'data-cy',
    'data-test-id',
    'data-qa-id',
    'data-testing',
  ];
  const customAttributes = attributes.length > 0 ? attributes : defaultAttributes;

  while (contextNode && contextNode !== doc) {
    const part = getXPathSelectorPart(contextNode, optimized, customAttributes);
    if (!part) {
      return undefined;
    }
    buffer.unshift(part);
    
    // optimized part면 root node로 이동, 아니면 parent로 이동
    if (part.optimized) {
      contextNode = contextNode.getRootNode();
    } else {
      contextNode = contextNode.parentNode;
    }
    
    // ShadowRoot 경계 처리
    if (contextNode && contextNode instanceof ShadowRoot) {
      let prefix = '';
      if (!optimized) {
        prefix = '/';
      } else {
        prefix = buffer[0] && buffer[0].optimized ? '' : '/';
      }
      const selectorStr = prefix + buffer.map(p => p.toString()).join('/');
      selectors.unshift(selectorStr);
      buffer.splice(0, buffer.length);
      contextNode = contextNode.host;
    }
  }

  if (buffer.length) {
    // optimized = false일 때는 항상 절대 경로(/로 시작)를 생성
    // optimized = true일 때는 optimized part가 있으면 //로 시작, 없으면 /로 시작
    let prefix = '';
    if (!optimized) {
      prefix = '/';
    } else {
      prefix = buffer[0].optimized ? '' : '/';
    }
    const selectorStr = prefix + buffer.map(p => p.toString()).join('/');
    selectors.unshift(selectorStr);
  }

  // ShadowRoot가 여러 개면 XPath 평가가 작동하지 않으므로 undefined 반환
  if (!selectors.length || selectors.length > 1) {
    return undefined;
  }

  return selectors[0];
}

/**
 * 전체 XPath 생성 (하위 호환성 유지)
 * @deprecated computeXPath를 사용하세요
 */
export function buildFullXPath(el) {
  if (!el || el.nodeType !== 1) return null;
  const xpath = computeXPath(el, false);
  if (!xpath) return null;
  // Full XPath는 절대 경로(/로 시작)여야 함
  // /로 시작하지 않으면 /를 추가
  return xpath.startsWith('/') ? xpath : `/${xpath}`;
}

/**
 * XPath SelectorPart 클래스 (Chrome Recorder 방식)
 */
class SelectorPart {
  constructor(value, optimized) {
    this.value = value;
    this.optimized = optimized || false;
  }

  toString() {
    return this.value;
  }
}

/**
 * XPath 인덱스 계산 (Chrome Recorder 방식)
 * 형제 노드 중에서 같은 타입의 노드들 사이의 인덱스를 계산
 */
function getXPathIndexInParent(node) {
  /**
   * @returns -1 in case of error, 0 if no siblings matching the same expression,
   * XPath index among the same expression-matching sibling nodes otherwise.
   */
  function areNodesSimilar(left, right) {
    if (left === right) {
      return true;
    }

    if (left instanceof Element && right instanceof Element) {
      return left.localName === right.localName;
    }

    if (left.nodeType === right.nodeType) {
      return true;
    }

    // XPath treats CDATA as text nodes.
    // CDATA_SECTION_NODE = 4, TEXT_NODE = 3
    const leftType = left.nodeType === 4 ? 3 : left.nodeType;
    const rightType = right.nodeType === 4 ? 3 : right.nodeType;
    return leftType === rightType;
  }

  const children = node.parentNode ? node.parentNode.children : null;
  if (!children) {
    return 0;
  }
  let hasSameNamedElements;
  for (let i = 0; i < children.length; ++i) {
    if (areNodesSimilar(node, children[i]) && children[i] !== node) {
      hasSameNamedElements = true;
      break;
    }
  }
  if (!hasSameNamedElements) {
    return 0;
  }
  let ownIndex = 1;  // XPath indices start with 1.
  for (let i = 0; i < children.length; ++i) {
    if (areNodesSimilar(node, children[i])) {
      if (children[i] === node) {
        return ownIndex;
      }
      ++ownIndex;
    }
  }

  throw new Error(
      'This is impossible; a child must be the child of the parent',
  );
}

/**
 * XPath 세그먼트 생성 (Chrome Recorder 방식)
 */
function getXPathSelectorPart(node, optimized, attributes = []) {
  let value;
  switch (node.nodeType) {
    case 1: // ELEMENT_NODE
      if (!(node instanceof Element)) {
        return;
      }
      // optimized = false일 때는 절대 경로를 위해 optimized part를 생성하지 않음
      if (optimized) {
        for (const attribute of attributes) {
          value = node.getAttribute(attribute) ?? '';
          if (value) {
            return new SelectorPart(`//*[@${attribute}=${escapeXPathLiteral(value)}]`, true);
          }
        }
        if (node.id) {
          return new SelectorPart(`//*[@id=${escapeXPathLiteral(node.id)}]`, true);
        }
      }
      value = node.localName || node.tagName?.toLowerCase() || '';
      break;
    case 2: // ATTRIBUTE_NODE
      value = '@' + node.nodeName;
      break;
    case 3: // TEXT_NODE
    case 4: // CDATA_SECTION_NODE
      value = 'text()';
      break;
    case 7: // PROCESSING_INSTRUCTION_NODE
      value = 'processing-instruction()';
      break;
    case 8: // COMMENT_NODE
      value = 'comment()';
      break;
    case 9: // DOCUMENT_NODE
      value = '';
      break;
    default:
      value = '';
      break;
  }

  const index = getXPathIndexInParent(node);
  if (index > 0) {
    value += `[${index}]`;
  }

  return new SelectorPart(value, node.nodeType === 9);
}

/**
 * 셀렉터 타입 추론
 */
export function inferSelectorType(selector) {
  if (!selector || typeof selector !== "string") return "css";
  const trimmed = selector.trim();
  
  // XPath 타입 확인
  if (trimmed.startsWith("xpath=")) return "xpath";
  if (trimmed.startsWith("//") || trimmed.startsWith("(") || trimmed.startsWith("/")) return "xpath";
  
  // 텍스트 타입 확인
  if (trimmed.startsWith("text=")) return "text";
  
  // ID 셀렉터 확인
  if (trimmed.startsWith("#")) return "id";
  
  // 클래스 셀렉터 확인 (점으로 시작하고 공백/특수문자 없음)
  if (trimmed.startsWith(".") && !trimmed.includes(" ")) return "class";
  
  // 속성 셀렉터 확인
  if (trimmed.includes("[") && trimmed.includes("]")) return "attribute";
  
  // 단순 태그명 확인 (알파벳만, 공백 없음)
  if (/^[a-z][a-z0-9-]*$/i.test(trimmed) && !trimmed.includes(" ") && !trimmed.includes(">")) {
    return "tag";
  }
  
  // 기본값: CSS 셀렉터 (복합 셀렉터 포함)
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
const MAX_CLASS_COMBINATIONS = 12; // 24 -> 12로 줄여 불필요한 후보 생성 방지
const DEFAULT_TEXT_SCORE = 65;
const DEFAULT_TAG_SCORE = 20;

// 속성 우선순위 정의
const ATTRIBUTE_PRIORITY = [
  { attr: "id", type: "id", score: 98, reason: "id 속성", allowPartial: false },
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
  
  // 원본 class 셀렉터는 조합 XPath보다 높은 점수
  // ID가 있는 경우 class 조합 셀렉터의 점수를 낮춤
  const hasId = element.id ? 1 : 0;
  
  ordered.slice(0, MAX_CLASS_COMBINATIONS).forEach((key) => {
    const classSelector = `.${key}`;
    // 원본 class 셀렉터 점수 상향 (조합 XPath보다 높게)
    const baseClassScore = 75 - Math.min(8, key.split(".").length * 2); // 62 → 75점 기준
    const baseTagClassScore = 82 - Math.min(8, key.split(".").length); // 68 → 82점 기준
    
    results.push({
      type: "class",
      selector: classSelector,
      score: hasId ? Math.max(68, baseClassScore - 5) : baseClassScore, // ID가 있으면 최대 70점
      reason: "class 조합"
    });
    results.push({
      type: "class-tag",
      selector: `${element.tagName.toLowerCase()}${classSelector}`,
      score: hasId ? Math.max(75, baseTagClassScore - 5) : baseTagClassScore, // ID가 있으면 최대 77점
      reason: "태그 + class 조합"
    });
  });
  return results;
}

/**
 * class 기반 XPath 생성 (유일성 확보를 위한 조합)
 */
function buildClassBasedXPath(element) {
  if (!element || element.nodeType !== 1) return [];
  const classList = Array.from(element.classList || []).filter(Boolean);
  if (classList.length === 0) return [];
  
  const results = [];
  const tagName = element.tagName ? element.tagName.toLowerCase() : '*';
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return [];
  
  // class XPath 표현식 생성 헬퍼
  const buildClassContainsExpr = (cls) => {
    return `contains(concat(' ', normalize-space(@class), ' '), ${escapeXPathLiteral(" " + cls + " ")})`;
  };
  
  // 조합 XPath는 원본 셀렉터보다 낮은 점수 (가공된 셀렉터이므로)
  // ID가 있는 경우 class 조합 XPath의 점수를 더 낮춤
  const hasIdForXPath = element.id ? 1 : 0;
  
  // 원본 class 셀렉터 정보 수집 (반복요소 탭 표시용)
  const originalClassSelectors = [];
  for (const cls of classList.slice(0, 3)) {
    const classSelector = `.${cssEscapeIdent(cls)}`;
    const classSelectorParsed = parseSelectorForMatching(classSelector, "css");
    const classSelectorCount = countMatchesForSelector(classSelectorParsed, doc, { maxCount: 10 });
    originalClassSelectors.push({
      selector: classSelector,
      type: "class",
      matchCount: classSelectorCount,
      unique: classSelectorCount === 1
    });
  }
  
  // 1. 단일 class만 사용 (태그명 포함) - 조합 XPath이므로 원본 class 셀렉터보다 낮게
  for (let i = 0; i < Math.min(3, classList.length); i++) {
    const cls = classList[i];
    const classExpr = buildClassContainsExpr(cls);
    const xpathValue = `//${tagName}[${classExpr}]`;
    const selector = `xpath=${xpathValue}`;
    const parsed = parseSelectorForMatching(selector, "xpath");
    const count = countMatchesForSelector(parsed, doc, { maxCount: 3 });
    
    // 조합 XPath는 원본 class 셀렉터(75-82점)보다 낮게 설정
    const singleClassBaseScore = count === 1 ? 72 : (count === 2 ? 60 : 50); // 88 → 72점으로 하향
    const singleClassAdjustedScore = hasIdForXPath ? Math.max(60, singleClassBaseScore - 8) : singleClassBaseScore; // ID가 있으면 최대 64점
    
    // 원본 class 셀렉터 정보 추가 (반복요소 탭 표시용)
    const originalClassInfo = originalClassSelectors[i];
    const result = {
      type: "xpath",
      selector: selector,
      score: singleClassAdjustedScore,
      reason: count === 1 ? "태그 + class 조합 (유일)" : `태그 + class 조합 (${count}개 일치)`,
      xpathValue: xpathValue,
      unique: count === 1,
      matchCount: count
    };
    
    // 원본 class 셀렉터 정보 저장 (조합 XPath가 유일해도 원본이 반복되면 반복요소 탭에 표시)
    if (originalClassInfo && originalClassInfo.matchCount > 1) {
      result.rawSelector = originalClassInfo.selector;
      result.rawType = originalClassInfo.type;
      result.rawMatchCount = originalClassInfo.matchCount;
      result.rawUnique = false;
      result.rawReason = `class 조합`;
    }
    
    results.push(result);
  }
  
  // 2. class만 사용 (태그명 없음) - 조합 XPath이므로 원본 class 셀렉터보다 낮게
  for (let i = 0; i < Math.min(2, classList.length); i++) {
    const cls = classList[i];
    const classExpr = buildClassContainsExpr(cls);
    const xpathValue = `//*[${classExpr}]`;
    const selector = `xpath=${xpathValue}`;
    const parsed = parseSelectorForMatching(selector, "xpath");
    const count = countMatchesForSelector(parsed, doc, { maxCount: 3 });
    
    // 조합 XPath는 원본 class 셀렉터(75점)보다 낮게 설정
    const wildcardClassBaseScore = count === 1 ? 70 : (count === 2 ? 55 : 45); // 85 → 70점으로 하향
    const wildcardClassAdjustedScore = hasIdForXPath ? Math.max(58, wildcardClassBaseScore - 8) : wildcardClassBaseScore; // ID가 있으면 최대 62점
    
    // 원본 class 셀렉터 정보 추가
    const originalClassInfo = originalClassSelectors[i];
    const result = {
      type: "xpath",
      selector: selector,
      score: wildcardClassAdjustedScore,
      reason: count === 1 ? "class만 사용 (유일)" : `class만 사용 (${count}개 일치)`,
      xpathValue: xpathValue,
      unique: count === 1,
      matchCount: count
    };
    
    // 원본 class 셀렉터 정보 저장
    if (originalClassInfo && originalClassInfo.matchCount > 1) {
      result.rawSelector = originalClassInfo.selector;
      result.rawType = originalClassInfo.type;
      result.rawMatchCount = originalClassInfo.matchCount;
      result.rawUnique = false;
      result.rawReason = `class 조합`;
    }
    
    results.push(result);
  }
  
  // 3. 여러 class 조합 (2-3개 class)
  if (classList.length >= 2) {
    const classCombos = [];
    // 2개 조합
    for (let i = 0; i < Math.min(2, classList.length); i++) {
      for (let j = i + 1; j < Math.min(3, classList.length); j++) {
        classCombos.push([classList[i], classList[j]]);
      }
    }
    // 3개 조합 (class가 3개 이상인 경우)
    if (classList.length >= 3) {
      classCombos.push([classList[0], classList[1], classList[2]]);
    }
    
    // ID가 있는 경우 class 조합 XPath의 점수를 낮춤 (ID가 더 우선순위가 높음)
    const hasId = element.id ? 1 : 0;
    
    for (const combo of classCombos.slice(0, 3)) {
      const classExprs = combo.map(cls => buildClassContainsExpr(cls));
      const combinedExpr = classExprs.join(' and ');
      
      // 원본 class 조합 셀렉터 정보 수집 (반복요소 탭 표시용)
      const comboClassSelector = `.${combo.map(c => cssEscapeIdent(c)).join('.')}`;
      const comboClassSelectorParsed = parseSelectorForMatching(comboClassSelector, "css");
      const comboClassSelectorCount = countMatchesForSelector(comboClassSelectorParsed, doc, { maxCount: 10 });
      
      // 태그명 포함 버전
      const tagXpathValue = `//${tagName}[${combinedExpr}]`;
      const tagSelector = `xpath=${tagXpathValue}`;
      const tagParsed = parseSelectorForMatching(tagSelector, "xpath");
      const tagCount = countMatchesForSelector(tagParsed, doc, { maxCount: 3 });
      
      // 여러 class 조합 XPath는 원본 class 셀렉터보다 낮게 설정
      const tagBaseScore = tagCount === 1 ? 75 : (tagCount === 2 ? 62 : 52); // 92 → 75점으로 하향
      const tagAdjustedScore = hasId ? Math.max(60, tagBaseScore - 8) : tagBaseScore; // ID가 있으면 최대 67점
      
      const tagResult = {
        type: "xpath",
        selector: tagSelector,
        score: tagAdjustedScore,
        reason: tagCount === 1 ? `태그 + ${combo.length}개 class 조합 (유일)` : `태그 + ${combo.length}개 class 조합 (${tagCount}개 일치)`,
        xpathValue: tagXpathValue,
        unique: tagCount === 1,
        matchCount: tagCount
      };
      
      // 원본 class 조합 셀렉터 정보 저장
      if (comboClassSelectorCount > 1) {
        tagResult.rawSelector = comboClassSelector;
        tagResult.rawType = "class";
        tagResult.rawMatchCount = comboClassSelectorCount;
        tagResult.rawUnique = false;
        tagResult.rawReason = `class 조합`;
      }
      
      results.push(tagResult);
      
      // 태그명 없이 버전
      const wildcardXpathValue = `//*[${combinedExpr}]`;
      const wildcardSelector = `xpath=${wildcardXpathValue}`;
      const wildcardParsed = parseSelectorForMatching(wildcardSelector, "xpath");
      const wildcardCount = countMatchesForSelector(wildcardParsed, doc, { maxCount: 3 });
      
      // 여러 class 조합 XPath는 원본 class 셀렉터보다 낮게 설정
      const wildcardBaseScore = wildcardCount === 1 ? 73 : (wildcardCount === 2 ? 58 : 48); // 88 → 73점으로 하향
      const wildcardAdjustedScore = hasId ? Math.max(60, wildcardBaseScore - 8) : wildcardBaseScore; // ID가 있으면 최대 65점
      
      const wildcardResult = {
        type: "xpath",
        selector: wildcardSelector,
        score: wildcardAdjustedScore,
        reason: wildcardCount === 1 ? `${combo.length}개 class 조합 (유일)` : `${combo.length}개 class 조합 (${wildcardCount}개 일치)`,
        xpathValue: wildcardXpathValue,
        unique: wildcardCount === 1,
        matchCount: wildcardCount
      };
      
      // 원본 class 조합 셀렉터 정보 저장
      if (comboClassSelectorCount > 1) {
        wildcardResult.rawSelector = comboClassSelector;
        wildcardResult.rawType = "class";
        wildcardResult.rawMatchCount = comboClassSelectorCount;
        wildcardResult.rawUnique = false;
        wildcardResult.rawReason = `class 조합`;
      }
      
      results.push(wildcardResult);
    }
  }
  
  // 4. class + id 조합
  if (element.id) {
    for (const cls of classList.slice(0, 2)) {
      const classExpr = buildClassContainsExpr(cls);
      const xpathValue = `//*[@id=${escapeXPathLiteral(element.id)} and ${classExpr}]`;
      const selector = `xpath=${xpathValue}`;
      const parsed = parseSelectorForMatching(selector, "xpath");
      const count = countMatchesForSelector(parsed, doc, { maxCount: 2 });
      
      results.push({
        type: "xpath",
        selector: selector,
        score: 90,
        reason: "id + class 조합",
        xpathValue: xpathValue,
        unique: true,
        matchCount: count
      });
    }
  }
  
  // 5. class + 다른 속성 조합 (data-*, aria-* 등)
  const attrPriority = ['data-testid', 'data-test', 'data-qa', 'data-cy', 'aria-label', 'name', 'role'];
  for (const attr of attrPriority) {
    const attrValue = element.getAttribute && element.getAttribute(attr);
    if (!attrValue) continue;
    
    for (const cls of classList.slice(0, 2)) {
      const classExpr = buildClassContainsExpr(cls);
      const xpathValue = `//*[@${attr}=${escapeXPathLiteral(attrValue)} and ${classExpr}]`;
      const selector = `xpath=${xpathValue}`;
      const parsed = parseSelectorForMatching(selector, "xpath");
      const count = countMatchesForSelector(parsed, doc, { maxCount: 3 });
      
      results.push({
        type: "xpath",
        selector: selector,
        score: count === 1 ? 82 : (count === 2 ? 67 : 57),
        reason: count === 1 ? `${attr} + class 조합 (유일)` : `${attr} + class 조합 (${count}개 일치)`,
        xpathValue: xpathValue,
        unique: count === 1,
        matchCount: count
      });
    }
  }
  
  return results;
}

/**
 * Robust XPath 생성 (속성 기반, 최적화됨)
 * Chrome Recorder의 computeXPath를 사용하여 최적화된 XPath 생성
 */
function buildRobustXPath(el) {
  if (!el || el.nodeType !== 1) return null;
  const customAttributes = [
    'data-testid',
    'data-test',
    'data-qa',
    'data-cy',
    'data-test-id',
    'data-qa-id',
    'data-testing',
  ];
  const xpath = computeXPath(el, true, customAttributes);
  if (!xpath) return null;
  // Chrome Recorder 방식은 이미 //로 시작하거나 /로 시작하므로 그대로 반환
  return xpath.startsWith('//') ? xpath : `//${xpath}`;
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
    // 텍스트 길이 제한 완화: 60자 -> 100자
    if (firstLine && firstLine.length > 0 && firstLine.length <= 100) {
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
      
      // 텍스트 셀렉터 점수 계산 개선: 일치 개수에 따른 세밀한 점수 차등
      // 원본 셀렉터이므로 조합 XPath보다 높은 점수
      let textScore;
      if (textMatchCount === 1) {
        textScore = 85; // 유일 일치 (원본 셀렉터 우선)
      } else if (textMatchCount === 2) {
        textScore = 70; // 2개 일치
      } else if (textMatchCount > 2 && textMatchCount <= 5) {
        textScore = 55; // 3-5개 일치
      } else if (textMatchCount > 5) {
        textScore = 35; // 5개 이상 일치 (낮은 우선순위)
      } else {
        textScore = 45; // 일치 개수를 알 수 없는 경우
      }
      
      candidates.push({
        selector: textSelector,
        type: 'text',
        score: textScore,
        reason: reasonParts.join(" • "),
        textValue: firstLine,
        matchMode: "exact",
        unique: textMatchCount === 1,
        matchCount: textMatchCount
      });
    }
  }
  
  // 5. Class 기반 XPath (유일성 확보를 위한 조합)
  try {
    const classBasedXPaths = buildClassBasedXPath(element);
    classBasedXPaths.forEach((cand) => {
      candidates.push(cand);
    });
  } catch (e) {
    console.error('[SelectorUtils] buildClassBasedXPath 오류:', e);
  }
  
  // 6. Robust XPath (속성 기반, 최적화됨 - Chrome Recorder 방식)
  try {
    const customAttributes = [
      'data-testid',
      'data-test',
      'data-qa',
      'data-cy',
      'data-test-id',
      'data-qa-id',
      'data-testing',
    ];
    const optimizedXPath = computeXPath(element, true, customAttributes);
    if (optimizedXPath) {
      const xpathValue = optimizedXPath.startsWith('//') ? optimizedXPath : `//${optimizedXPath}`;
      candidates.push({
        type: "xpath",
        selector: `xpath=${xpathValue}`,
        score: 75,
        reason: "최적화된 XPath (속성 기반)",
        xpathValue: xpathValue
      });
    }
  } catch (e) {
    console.error('[SelectorUtils] computeXPath (optimized) 오류:', e);
  }
  
  // 7. CSS 경로
  const cssPath = buildUniqueCssPath(element);
  if (cssPath) {
    // ID가 있는 경우 CSS 경로 점수를 높임 (ID 기반 CSS 경로는 더 안정적)
    const hasId = element.id ? 1 : 0;
    const baseScore = 70;
    const adjustedScore = hasId ? 93 : baseScore; // ID가 있으면 93점
    
    candidates.push({
      selector: cssPath,
      type: 'css',
      score: adjustedScore,
      reason: 'CSS 경로'
    });
  }
  
  // 8. Full XPath (비최적화 버전 - 절대 경로)
  try {
    const fullXPath = computeXPath(element, false);
    if (fullXPath) {
      // Full XPath는 절대 경로(/로 시작)여야 함
      const xpathValue = fullXPath.startsWith('/') ? fullXPath : `/${fullXPath}`;
      candidates.push({
        selector: `xpath=${xpathValue}`,
        type: 'xpath-full',
        score: 42,
        reason: 'Full XPath (절대 경로)',
        xpathValue: xpathValue
      });
    }
  } catch (e) {
    console.error('[SelectorUtils] computeXPath (full) 오류:', e);
  }
  
  // 9. 첫 번째 nth-of-type 셀렉터
  try {
    const firstNthCandidate = buildFirstNthOfTypeSelector(element);
    if (firstNthCandidate) {
      candidates.push(firstNthCandidate);
    }
  } catch (e) {
    console.error('[SelectorUtils] buildFirstNthOfTypeSelector 오류:', e);
  }
  
  // 10. 태그 기반 (낮은 우선순위)
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
  // 원본 셀렉터 정보 보존 (가공 전 원본 셀렉터의 matchCount를 rawMatchCount로 저장)
  if (candidate.rawMatchCount === undefined) {
    candidate.rawMatchCount = globalCount;
    candidate.rawUnique = globalCount === 1;
  } else {
    // rawMatchCount가 이미 있으면 유지 (조합 XPath에서 원본 정보를 가져온 경우)
    // rawUnique도 업데이트
    candidate.rawUnique = candidate.rawMatchCount === 1;
  }
  
  // 유일성 검증 실패 시 명확한 피드백 제공
  if (globalCount === 0 && options.allowZero !== true) {
    ctx.reasonParts = ctx.reasonParts.filter((part) => !/유일 일치|개 요소와 일치/.test(part));
    ctx.reasonParts.push("일치하는 요소 없음 (셀렉터 오류 가능성)");
    return false;
  }
  
  ctx.reasonParts = ctx.reasonParts.filter((part) => !/유일 일치|개 요소와 일치|일치하는 요소 없음/.test(part));
  if (globalCount === 1) {
    ctx.reasonParts.push("유일 일치");
  } else if (globalCount > 1) {
    // 일치 개수에 따른 명확한 설명 제공
    if (globalCount === 2) {
      ctx.reasonParts.push("2개 요소와 일치 (추가 조합 필요)");
    } else if (globalCount <= 5) {
      ctx.reasonParts.push(`${globalCount}개 요소와 일치 (유일하지 않음)`);
    } else {
      ctx.reasonParts.push(`${globalCount}개 이상 일치 (다른 셀렉터 권장)`);
    }
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
  // XPath 타입 셀렉터는 CSS로 변환하지 않음 (class 조합 XPath 보호)
  const currentType = candidate.type || inferSelectorType(candidate.selector);
  if (currentType === "xpath") return;
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
  // XPath 타입 셀렉터는 인덱싱을 적용하지 않음 (class 조합 XPath 보호)
  if (originalType === "text" || originalType === "xpath") return;
  // 현재 타입이 XPath인 경우도 인덱싱 적용하지 않음
  const currentType = candidate.type || inferSelectorType(candidate.selector);
  if (currentType === "xpath") return;
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
  
  // 기존 이유에서 일치 관련 설명 제거
  ctx.reasonParts = ctx.reasonParts.filter((part) => !/유일 일치|개 요소와 일치|일치하는 요소 없음/.test(part));
  
  // 유일성 검증 결과에 따른 명확한 피드백 제공
  if (verificationCount === 1) {
    ctx.reasonParts.push("유일 일치");
  } else if (verificationCount === 0) {
    ctx.reasonParts.push("일치하는 요소 없음 - 셀렉터 수정 필요");
  } else if (verificationCount === 2) {
    ctx.reasonParts.push("2개 요소와 일치 (추가 조합 필요)");
  } else if (verificationCount > 2 && verificationCount <= 5) {
    ctx.reasonParts.push(`${verificationCount}개 요소와 일치 (유일하지 않음)`);
  } else {
    ctx.reasonParts.push(`${verificationCount}개 이상 일치 (다른 셀렉터 권장)`);
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
/**
 * 셀렉터 문자열 정규화 (중복 비교용)
 */
function normalizeSelectorForDedup(selector, type) {
  if (!selector) return '';
  // prefix 제거 (css=, xpath=, text= 등)
  let normalized = selector;
  if (normalized.startsWith('css=')) {
    normalized = normalized.slice(4);
  } else if (normalized.startsWith('xpath=')) {
    normalized = normalized.slice(6);
  } else if (normalized.startsWith('text=')) {
    normalized = normalized.slice(5);
  }
  // 공백 제거 및 소문자 변환
  return normalized.trim().toLowerCase();
}

/**
 * 중복 셀렉터 제거 (같은 셀렉터는 가장 높은 점수만 유지)
 */
function deduplicateCandidates(candidates) {
  const seen = new Map(); // key: normalizedSelector, value: bestCandidate
  
  for (const candidate of candidates) {
    const selector = candidate.selector || '';
    const type = candidate.type || inferSelectorType(selector);
    const normalizedKey = normalizeSelectorForDedup(selector, type);
    
    if (!normalizedKey) continue; // 빈 셀렉터는 건너뛰기
    
    const existing = seen.get(normalizedKey);
    
    if (!existing) {
      // 첫 번째 발견: 저장
      seen.set(normalizedKey, candidate);
    } else {
      // 중복 발견: 점수 비교하여 더 좋은 것만 유지
      const existingScore = existing.score || 0;
      const currentScore = candidate.score || 0;
      
      // 점수가 같거나 더 높으면 교체
      // 점수가 같으면 유일성, relation 등을 고려
      if (currentScore > existingScore) {
        seen.set(normalizedKey, candidate);
      } else if (currentScore === existingScore) {
        // 점수가 같으면 유일성 우선
        if (candidate.unique && !existing.unique) {
          seen.set(normalizedKey, candidate);
        } else if (candidate.unique === existing.unique) {
          // 유일성도 같으면 relation 비교
          const currentRelation = candidate.relation === "relative" ? 1 : 0;
          const existingRelation = existing.relation === "relative" ? 1 : 0;
          if (currentRelation > existingRelation) {
            seen.set(normalizedKey, candidate);
          }
          // 모두 같으면 기존 것 유지
        }
      }
      // currentScore < existingScore면 기존 것 유지
    }
  }
  
  return Array.from(seen.values());
}

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
  
  // 중복 제거 (같은 셀렉터는 가장 높은 점수만 유지)
  const deduplicated = deduplicateCandidates(candidates);
  
  // 점수 및 유일성 기준으로 정렬
  return deduplicated.sort((a, b) => {
    const uniqueA = a.unique ? 1 : 0;
    const uniqueB = b.unique ? 1 : 0;
    if (uniqueA !== uniqueB) return uniqueB - uniqueA;
    
    const scoreA = a.score || 0;
    const scoreB = b.score || 0;
    const typeA = a.type || inferSelectorType(a.selector);
    const typeB = b.type || inferSelectorType(b.selector);
    
    // 타입 우선순위: id > css > class > class-tag > text > xpath > 기타
    const typePriority = {
      'id': 100,
      'css': 90,
      'class': 85,
      'class-tag': 80,
      'text': 75,
      'xpath': 70
    };
    const priorityA = typePriority[typeA] || 50;
    const priorityB = typePriority[typeB] || 50;
    
    // 점수 차이 계산
    const scoreDiff = Math.abs(scoreA - scoreB);
    
    // ID 타입은 항상 우선 (점수 차이가 5점 이하일 때)
    if (typeA === 'id' && typeB !== 'id' && scoreDiff <= 5) {
      return -1; // ID 우선
    }
    if (typeB === 'id' && typeA !== 'id' && scoreDiff <= 5) {
      return 1; // ID 우선
    }
    
    // 점수 차이가 크면 점수 우선 (3점 이상 차이)
    if (scoreDiff >= 3) {
      return scoreB - scoreA; // 점수가 높은 것 우선
    }
    
    // 점수 차이가 작으면(3점 미만) 타입 우선순위 적용
    // 원본 셀렉터 타입(ID, CSS, class)이 조합 XPath보다 우선
    if (priorityA !== priorityB) return priorityB - priorityA;
    
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

