/**
 * URL 필터링 유틸리티
 * 중간 처리 페이지(loginproc, logoutproc 등) 필터링 및 최종 목적지 페이지 대기
 */

/**
 * 중간 처리 페이지 URL인지 확인
 * @param {string} url - 확인할 URL
 * @returns {boolean} 중간 처리 페이지이면 true
 */
export function shouldFilterIntermediateUrl(url) {
  if (!url) return false;
  const urlLower = url.toLowerCase();
  const intermediatePatterns = [
    /loginproc/i, /logoutproc/i, /redirect/i, /processing/i, /intermediate/i,
    /callback/i, /verify/i,
    /token/i, /oauth/i, /handshake/i, /sso/i, /saml/i,
    /loading/i, /wait/i, /waiting/i, /transit/i,
    /session/i, /signin/i, /signout/i, /logout/i, /jump/i
  ];
  return intermediatePatterns.some(pattern => pattern.test(urlLower));
}

/**
 * 최종 목적지 페이지로 이동할 때까지 대기
 * @param {Object} options - 옵션
 * @param {number} options.maxWaitTime - 최대 대기 시간 (ms), 기본값 3000
 * @param {number} options.checkInterval - URL 체크 간격 (ms), 기본값 200
 * @param {Function} options.onProgress - 진행 상황 콜백 (currentUrl, waitedTime)
 * @returns {Promise<{success: boolean, finalUrl: string|null}>} 최종 URL 또는 null
 */
export async function waitForFinalPage(options = {}) {
  const {
    maxWaitTime = 3000,
    checkInterval = 200,
    onProgress = null
  } = options;
  
  let waitedTime = 0;
  
  return new Promise((resolve) => {
    const checkUrl = () => {
      const checkCurrentUrl = window.location.href || '';
      
      if (!shouldFilterIntermediateUrl(checkCurrentUrl)) {
        console.log('[URLFilter] 최종 목적지 페이지 도달:', checkCurrentUrl);
        resolve({ success: true, finalUrl: checkCurrentUrl });
        return;
      }
      
      if (onProgress) {
        onProgress(checkCurrentUrl, waitedTime);
      }
      
      waitedTime += checkInterval;
      if (waitedTime >= maxWaitTime) {
        console.warn('[URLFilter] 최종 목적지 페이지 대기 타임아웃');
        resolve({ success: false, finalUrl: null });
        return;
      }
      
      setTimeout(checkUrl, checkInterval);
    };
    
    checkUrl();
  });
}

/**
 * URL에서 쿼리 파라미터 제거
 * @param {string} url - 원본 URL
 * @returns {string} 쿼리 파라미터가 제거된 URL
 */
export function removeQueryParams(url) {
  if (!url) return url;
  
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  } catch (e) {
    // URL 파싱 실패 시 쿼리 스트링만 제거
    const queryIndex = url.indexOf('?');
    return queryIndex !== -1 ? url.substring(0, queryIndex) : url;
  }
}
