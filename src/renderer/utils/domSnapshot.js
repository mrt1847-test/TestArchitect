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
 * DOM 구조 캡처
 * 현재 페이지의 전체 DOM 구조를 문자열로 반환
 * @returns {string} DOM 구조 문자열
 */
export function captureDOM() {
  try {
    // document.documentElement.outerHTML을 사용하여 전체 HTML 구조 캡처
    if (document && document.documentElement) {
      return document.documentElement.outerHTML;
    }
    
    // 대체 방법: document.body가 있는 경우
    if (document && document.body) {
      return document.body.outerHTML;
    }
    
    // 최후의 수단: 빈 문자열 반환
    console.warn('[DOM Snapshot] DOM 구조를 캡처할 수 없습니다.');
    return '';
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

