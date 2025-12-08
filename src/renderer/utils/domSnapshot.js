/**
 * DOM 스냅샷 유틸리티
 * DOM 구조 캡처 및 URL 정규화 기능 제공
 */

/**
 * URL 정규화 (도메인+경로만 추출, 쿼리 파라미터 제외)
 * @param {string} url - 원본 URL
 * @returns {string} 정규화된 URL
 * 
 * @example
 * normalizeURL('https://example.com/page?id=123&name=test')
 * // => 'https://example.com/page'
 */
export function normalizeURL(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }
  
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  } catch (e) {
    // URL 파싱 실패 시 쿼리만 제거
    return url.split('?')[0];
  }
}

/**
 * HTML 최소화 (힐링 품질 유지하면서 용량 절감)
 * script, style, 주석 제거하지만 DOM 구조는 유지
 * @param {string} html - 원본 HTML
 * @returns {string} 최소화된 HTML
 */
export function minimizeHTML(html) {
  if (!html || typeof html !== 'string') {
    return html || '';
  }
  
  try {
    // 임시 DOM 생성
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // script 태그 제거
    const scripts = doc.querySelectorAll('script');
    scripts.forEach(script => script.remove());
    
    // style 태그 제거 (인라인 style 속성은 유지)
    const styles = doc.querySelectorAll('style');
    styles.forEach(style => style.remove());
    
    // 주석 제거
    const commentXPath = doc.evaluate(
      '//comment()',
      doc,
      null,
      XPathResult.UNORDERED_NODE_ITERATOR_TYPE,
      null
    );
    const comments = [];
    let commentNode;
    while (commentNode = commentXPath.iterateNext()) {
      comments.push(commentNode);
    }
    comments.forEach(comment => comment.remove());
    
    // 빈 텍스트 노드 정리 (공백만 있는 노드) - XPath 사용
    const textXPath = doc.evaluate(
      '//text()',
      doc,
      null,
      XPathResult.UNORDERED_NODE_ITERATOR_TYPE,
      null
    );
    const emptyTextNodes = [];
    let textNode;
    while (textNode = textXPath.iterateNext()) {
      if (textNode.textContent && textNode.textContent.trim() === '') {
        emptyTextNodes.push(textNode);
      }
    }
    emptyTextNodes.forEach(node => {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    });
    
    // 불필요한 속성 제거 (프레임워크 관련 속성, 하지만 힐링에 필요한 것은 유지)
    const allElements = doc.querySelectorAll('*');
    allElements.forEach(elem => {
      // data-react-*, data-vue-* 같은 프레임워크 속성 제거
      // 하지만 data-testid, data-id 같은 힐링에 필요한 것은 유지
      const attrsToRemove = [];
      for (const attr of elem.attributes) {
        const attrName = attr.name;
        if (
          attrName.startsWith('data-react-') ||
          attrName.startsWith('data-vue-') ||
          attrName.startsWith('data-ng-') ||
          attrName.startsWith('_ng') ||
          attrName === 'data-reactroot' ||
          attrName.startsWith('__')
        ) {
          attrsToRemove.push(attrName);
        }
      }
      attrsToRemove.forEach(attr => elem.removeAttribute(attr));
    });
    
    // HTML 문자열 반환
    return doc.documentElement.outerHTML;
  } catch (error) {
    console.warn('[DOM Snapshot] HTML 최소화 실패, 원본 반환:', error);
    // 최소화 실패 시 간단한 정규식 기반 제거
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
  }
}

/**
 * DOM 구조 캡처 (최소화된 HTML)
 * @returns {string} 최소화된 DOM 구조 문자열
 */
export function captureDOM() {
  try {
    let html = '';
    
    // document.documentElement.outerHTML을 사용하여 전체 HTML 구조 캡처
    if (document && document.documentElement) {
      html = document.documentElement.outerHTML;
    } else if (document && document.body) {
      // 대체 방법: document.body가 있는 경우
      html = document.body.outerHTML;
    }
    
    if (!html) {
      console.warn('[DOM Snapshot] DOM 구조를 캡처할 수 없습니다.');
      return '';
    }
    
    // HTML 최소화
    return minimizeHTML(html);
  } catch (error) {
    console.error('[DOM Snapshot] DOM 캡처 오류:', error);
    return '';
  }
}

/**
 * 현재 페이지의 URL 가져오기
 * @returns {string} 현재 페이지 URL
 */
export function getCurrentURL() {
  try {
    return window.location.href;
  } catch (e) {
    return '';
  }
}

/**
 * 현재 날짜가 저장 기간 내인지 확인
 * @param {Date} date - 확인할 날짜 (기본값: 오늘)
 * @returns {Object} { periodStart, periodEnd, isInPeriod }
 */
export function getCurrentPeriod(date = new Date()) {
  const day = date.getDate();
  const month = date.getMonth();
  const year = date.getFullYear();
  
  // 현재 기간 결정 (1-15일: 상반기, 16-말일: 하반기)
  const periodStart = day <= 15 ? 1 : 16;
  const periodEnd = day <= 15 ? 15 : new Date(year, month + 1, 0).getDate();
  
  const periodStartDate = new Date(year, month, periodStart);
  const periodEndDate = new Date(year, month, periodEnd);
  
  return {
    periodStart,
    periodEnd,
    periodStartDate,
    periodEndDate,
    isInPeriod: true // 항상 저장 가능한 기간 내
  };
}
