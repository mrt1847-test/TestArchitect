// content.js
// URL 파라미터 감지 및 Background에 메시지 전송

(function() {
  'use strict';
  
  console.log('[TestArchitect Content Script] 로드됨');
  
  // URL 파라미터 파싱
  function getUrlParams() {
    const url = new URL(window.location.href);
    const params = {};
    
    params.tcId = url.searchParams.get('tcId');
    params.projectId = url.searchParams.get('projectId');
    params.sessionId = url.searchParams.get('sessionId');
    
    return params;
  }
  
  // 페이지 로드 시 즉시 실행
  const params = getUrlParams();
  
  // 필수 파라미터가 모두 있는지 확인
  if (params.tcId && params.projectId && params.sessionId) {
    console.log('[TestArchitect Content Script] URL 파라미터 감지:', params);
    
    // Background Script에 메시지 전송
    chrome.runtime.sendMessage({
      type: 'OPEN_RECORDING_PANEL',
      tcId: params.tcId,
      projectId: params.projectId,
      sessionId: params.sessionId
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[TestArchitect] 메시지 전송 실패:', chrome.runtime.lastError);
      } else {
        console.log('[TestArchitect] Background Script 응답:', response);
      }
    });
  } else {
    console.warn('[TestArchitect] 필수 파라미터가 없습니다:', params);
  }
})();

