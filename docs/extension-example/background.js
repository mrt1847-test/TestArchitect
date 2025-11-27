// background.js

console.log('[TestArchitect Background] 초기화');

// Content Script로부터 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[TestArchitect Background] 메시지 수신:', message);
  
  if (message.type === 'OPEN_RECORDING_PANEL') {
    handleOpenRecordingPanel(message, sender, sendResponse);
    return true; // 비동기 응답을 위해 true 반환
  }
  
  return false;
});

async function handleOpenRecordingPanel(message, sender, sendResponse) {
  try {
    const { tcId, projectId, sessionId } = message;
    
    // 현재 활성 탭 찾기
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tabs || tabs.length === 0) {
      throw new Error('활성 탭을 찾을 수 없습니다');
    }
    
    const tab = tabs[0];
    
    // 녹화 데이터를 Storage에 저장 (Side Panel에서 사용)
    await chrome.storage.local.set({
      recordingData: {
        tcId,
        projectId,
        sessionId,
        timestamp: Date.now()
      }
    });
    
    // Side Panel 열기
    await chrome.sidePanel.open({ windowId: tab.windowId });
    
    console.log('[TestArchitect Background] Side Panel 열기 성공');
    
    sendResponse({ 
      success: true, 
      message: 'Side Panel이 열렸습니다' 
    });
    
  } catch (error) {
    console.error('[TestArchitect Background] Side Panel 열기 실패:', error);
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

// 확장 프로그램 설치/시작 시
chrome.runtime.onInstalled.addListener(() => {
  console.log('[TestArchitect Background] 확장 프로그램 설치됨');
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[TestArchitect Background] 확장 프로그램 시작됨');
});

