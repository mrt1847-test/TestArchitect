# 확장 프로그램과 Electron 통합 가이드

## ⚠️ 중요 사항

**이 문서는 확장 프로그램 프로젝트에서 참고할 문서입니다.**

- `record` 폴더는 참고용이며, 실제 확장 프로그램은 별도 프로젝트로 관리됩니다.
- Electron 앱은 `src/main/main.js`에서만 수정됩니다.
- 확장 프로그램은 이 문서의 가이드를 따라 구현해야 합니다.

## 개요

이 문서는 TestArchitect 확장 프로그램이 Electron 앱과 실시간으로 동기화되도록 구현하기 위한 가이드입니다.

**아키텍처 변경사항:**
- ❌ Electron 내부 `recorder.html` 창 제거
- ✅ 확장 프로그램의 Side Panel 사용
- ✅ WebSocket을 통한 실시간 동기화

## 아키텍처

```
[확장 프로그램] ←→ WebSocket (ws://localhost:3000) ←→ [Electron 앱]
```

- **확장 프로그램**: Chrome Extension (Background Script, Content Script, Side Panel)
- **통신 방식**: WebSocket (ws://localhost:3000)
- **Electron 서버**: localhost:3000에서 WebSocket 서버 실행

## WebSocket 연결

### 연결 설정

```javascript
// background.js
const WS_URL = 'ws://localhost:3000';

let wsConnection = null;
let wsReconnectAttempts = 0;
const WS_MAX_RECONNECT_ATTEMPTS = 5;
const WS_RECONNECT_DELAY = 5000;

function initWebSocket() {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    return;
  }
  
  if (wsReconnectAttempts >= WS_MAX_RECONNECT_ATTEMPTS) {
    return;
  }

  try {
    wsConnection = new WebSocket(WS_URL);

    wsConnection.onopen = () => {
      console.log('[Background] ✅ WebSocket 연결 성공');
      wsReconnectAttempts = 0;
      
      // 연결 시 Extension 등록
      sendWebSocketMessage({
        type: 'register',
        extensionId: chrome.runtime.id,
        version: EXTENSION_VERSION
      });
    };

    wsConnection.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error('[Background] WebSocket 메시지 파싱 실패:', error);
      }
    };

    wsConnection.onerror = (error) => {
      // 에러는 onclose에서 처리
    };

    wsConnection.onclose = (event) => {
      wsConnection = null;
      
      if (event.code !== 1000 && wsReconnectAttempts < WS_MAX_RECONNECT_ATTEMPTS) {
        wsReconnectAttempts++;
        const delay = WS_RECONNECT_DELAY * wsReconnectAttempts;
        setTimeout(() => {
          initWebSocket();
        }, delay);
      }
    };
  } catch (error) {
    console.error('[Background] WebSocket 생성 실패:', error);
  }
}

// 확장 프로그램 시작 시 WebSocket 연결
chrome.runtime.onInstalled.addListener(() => {
  initWebSocket();
});

chrome.runtime.onStartup.addListener(() => {
  initWebSocket();
});

initWebSocket();
```

### 메시지 전송

```javascript
function sendWebSocketMessage(message) {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    try {
      wsConnection.send(JSON.stringify(message));
      console.log('[Background] WebSocket 메시지 전송:', message.type);
      return true;
    } catch (error) {
      console.error('[Background] WebSocket 메시지 전송 실패:', error);
      return false;
    }
  } else {
    console.warn('[Background] WebSocket이 연결되지 않아 메시지 전송 실패');
    return false;
  }
}
```

## 메시지 타입 정의

### 확장 프로그램 → Electron

#### 1. Extension 등록
```javascript
{
  type: 'register',
  extensionId: 'hemlilhhjhpkpgeonbmaknbffgapneam',
  version: '1.0',
  timestamp: 1234567890
}
```

#### 2. 녹화 시작 알림
```javascript
{
  type: 'recording-start',
  tcId: 123,
  projectId: 1,
  sessionId: 'session-1234567890',
  timestamp: 1234567890
}
```

#### 3. 녹화 중지 알림
```javascript
{
  type: 'recording-stop',
  timestamp: 1234567890
}
```

#### 4. DOM 이벤트 전송
```javascript
{
  type: 'dom-event',
  event: {
    action: 'click',
    target: {
      tagName: 'BUTTON',
      id: 'submit-btn',
      selectors: {
        id: '#submit-btn',
        css: '.btn.btn-primary',
        xpath: '//button[@id="submit-btn"]'
      }
    },
    value: null,
    url: 'https://example.com',
    timestamp: 1234567890
  },
  sessionId: 'session-1234567890',
  timestamp: 1234567890
}
```

#### 5. 요소 하이라이트 정보
```javascript
{
  type: 'element-hover',
  element: {
    tag: 'BUTTON',
    id: 'submit-btn',
    className: 'btn btn-primary',
    text: '제출'
  },
  selectors: [
    { selector: '#submit-btn', type: 'id', score: 90 },
    { selector: '.btn.btn-primary', type: 'css', score: 70 }
  ],
  timestamp: 1234567890
}
```

#### 6. 요소 하이라이트 해제
```javascript
{
  type: 'element-hover-clear',
  timestamp: 1234567890
}
```

#### 7. 녹화 완료
```javascript
{
  type: 'recording-complete',
  data: {
    type: 'recording_complete',
    sessionId: 'session-1234567890',
    tcId: 123,
    projectId: 1,
    events: [
      // 이벤트 배열
    ],
    code: {
      python: {
        framework: 'playwright',
        code: '...'
      }
    },
    metadata: {
      browser: 'chrome',
      browserVersion: '120.0.0.0',
      startTime: 1234567890,
      endTime: 1234567891,
      duration: 1000
    }
  },
  timestamp: 1234567890
}
```

#### 8. Content Script 연결 확인
```javascript
{
  type: 'content-script-connected',
  url: 'https://example.com',
  tabId: 123,
  timestamp: 1234567890
}
```

#### 9. 녹화 상태 업데이트
```javascript
{
  type: 'recording_status',
  status: 'recording' | 'stopped' | 'paused',
  timestamp: 1234567890
}
```

### Electron → 확장 프로그램

#### 1. 연결 확인
```javascript
{
  type: 'connected',
  message: 'TestArchitect 서버에 연결되었습니다',
  timestamp: 1234567890
}
```

#### 2. Extension 등록 확인
```javascript
{
  type: 'registered',
  success: true,
  message: 'Extension registered',
  timestamp: 1234567890
}
```

#### 3. 녹화 시작 명령
```javascript
{
  type: 'start-recording',
  tcId: 123,
  projectId: 1,
  sessionId: 'session-1234567890',
  url: 'http://localhost:3000/record?tcId=123&projectId=1&sessionId=session-1234567890',
  timestamp: 1234567890
}
```

#### 4. 녹화 중지 명령
```javascript
{
  type: 'stop-recording',
  timestamp: 1234567890
}
```

#### 5. 녹화 상태 브로드캐스트
```javascript
{
  type: 'recording-start',  // 또는 'recording-stop'
  timestamp: 1234567890
}
```

#### 6. Content Script 연결 확인 응답
```javascript
{
  type: 'content-script-ack',
  message: 'Content Script 연결 확인됨',
  timestamp: 1234567890
}
```

#### 7. 녹화 완료 응답
```javascript
{
  type: 'recording-complete-response',
  success: true,
  scriptId: 456,
  timestamp: 1234567890
}
```

## 구현 가이드

### 1. Background Script (background.js)

#### WebSocket 메시지 처리

```javascript
function handleWebSocketMessage(message) {
  if (!message || !message.type) {
    console.warn('[Background] 잘못된 WebSocket 메시지:', message);
    return;
  }

  switch (message.type) {
    case 'connected':
      console.log('[Background] Electron 서버 연결 확인:', message.message);
      break;

    case 'registered':
      console.log('[Background] Extension 등록 확인:', message.message);
      break;

    case 'start-recording':
      // Electron에서 녹화 시작 명령 수신
      handleStartRecording(message);
      break;

    case 'stop-recording':
      // Electron에서 녹화 중지 명령 수신
      handleStopRecording();
      break;

    case 'recording-start':
    case 'recording-stop':
      // 다른 클라이언트의 녹화 상태 변경 알림
      // 필요시 처리
      break;

    default:
      console.warn('[Background] 알 수 없는 메시지 타입:', message.type);
  }
}

async function handleStartRecording(message) {
  try {
    const { tcId, projectId, sessionId, url } = message;
    
    // 녹화 데이터 저장
    await chrome.storage.local.set({
      recordingData: {
        tcId,
        projectId,
        sessionId,
        url: url || '',
        timestamp: Date.now()
      },
      isRecording: true // 녹화 상태 저장
    });
    
    // Side Panel 열기 및 Content Script에 메시지 전송
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0 && tabs[0].id) {
      const activeTab = tabs[0];
      
      // Side Panel 열기
      await chrome.sidePanel.open({ tabId: activeTab.id });
      
      // ⚠️ 중요: Content Script에 녹화 시작 메시지 전송
      sendRecordingStartToTab(activeTab.id, { tcId, projectId, sessionId, url: url || activeTab.url || '' });
      
      // 모든 탭의 Content Script에 브로드캐스트 (선택적)
      // 현재 활성 탭 외에도 녹화가 필요한 경우
      chrome.tabs.query({}, (allTabs) => {
        allTabs.forEach((tab) => {
          // chrome://, chrome-extension:// 페이지는 제외
          if (tab.url && 
              !tab.url.startsWith('chrome://') && 
              !tab.url.startsWith('chrome-extension://') &&
              !tab.url.startsWith('edge://') &&
              tab.id !== activeTab.id) { // 활성 탭은 이미 처리했으므로 제외
            sendRecordingStartToTab(tab.id, { tcId, projectId, sessionId });
          }
        });
      });
    }
    
    // Electron에 녹화 시작 알림
    sendWebSocketMessage({
      type: 'recording-start',
      tcId,
      projectId,
      sessionId,
      timestamp: Date.now()
    });
    
    console.log('[Background] 녹화 시작됨');
  } catch (error) {
    console.error('[Background] 녹화 시작 실패:', error);
  }
}

/**
 * 특정 탭의 Content Script에 녹화 시작 메시지 전송
 * @param {number} tabId - 탭 ID
 * @param {Object} data - 녹화 데이터
 */
function sendRecordingStartToTab(tabId, data) {
  chrome.tabs.sendMessage(tabId, {
    type: 'RECORDING_START',
    tcId: data.tcId,
    projectId: data.projectId,
    sessionId: data.sessionId,
    url: data.url || '',
    timestamp: Date.now()
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[Background] Content Script에 메시지 전송 실패:', chrome.runtime.lastError);
      // Content Script가 아직 로드되지 않았을 수 있음
      // 탭 업데이트 리스너에서 재시도
    } else {
      console.log('[Background] Content Script에 녹화 시작 메시지 전송 성공');
    }
  });
}

async function handleStopRecording() {
  try {
    // 녹화 상태 저장 해제
    await chrome.storage.local.set({
      isRecording: false
    });
    
    // 모든 탭의 Content Script에 녹화 중지 메시지 전송
    chrome.tabs.query({}, (allTabs) => {
      allTabs.forEach((tab) => {
        if (tab.url && 
            !tab.url.startsWith('chrome://') && 
            !tab.url.startsWith('chrome-extension://') &&
            !tab.url.startsWith('edge://')) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'RECORDING_STOP',
            timestamp: Date.now()
          }, () => {
            // 에러는 무시 (Content Script가 없는 탭일 수 있음)
          });
        }
      });
    });
    
    // Electron에 녹화 중지 알림
    sendWebSocketMessage({
      type: 'recording-stop',
      timestamp: Date.now()
    });
    
    console.log('[Background] 녹화 중지됨');
  } catch (error) {
    console.error('[Background] 녹화 중지 실패:', error);
  }
}

/**
 * ⚠️ 중요: 페이지 전환 감지 및 녹화 상태 재전송
 * 
 * URL이 변경되면 Content Script가 새 페이지에서 이벤트 리스너를 재등록해야 합니다.
 * Background Script가 URL 변경을 감지하고 Content Script에 녹화 시작 메시지를 다시 보냅니다.
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // URL이 변경되고 페이지가 완전히 로드되었을 때만 처리
  if (changeInfo.status === 'complete' && changeInfo.url) {
    console.log('[Background] ========== 페이지 전환 감지 ==========');
    console.log('[Background] 탭 ID:', tabId);
    console.log('[Background] 이전 URL:', changeInfo.url);
    console.log('[Background] 현재 URL:', tab.url);
    
    // 녹화 상태 확인
    const result = await chrome.storage.local.get(['isRecording', 'recordingData']);
    const isRecording = result.isRecording === true;
    const recordingData = result.recordingData || {};
    
    console.log('[Background] 현재 녹화 상태:', isRecording ? '녹화 중' : '녹화 중지');
    console.log('[Background] 녹화 데이터:', recordingData);
    
    // 녹화 중인 경우에만 Content Script에 녹화 시작 메시지 재전송
    if (isRecording && recordingData.tcId && recordingData.projectId && recordingData.sessionId) {
      console.log('[Background] 녹화 중이므로 Content Script에 녹화 시작 메시지 재전송...');
      
      // Content Script가 로드될 때까지 약간 대기 (최대 3초)
      let retryCount = 0;
      const maxRetries = 6;
      const retryDelay = 500;
      
      const sendRecordingStart = () => {
        chrome.tabs.sendMessage(tabId, {
          type: 'RECORDING_START',
          tcId: recordingData.tcId,
          projectId: recordingData.projectId,
          sessionId: recordingData.sessionId,
          url: tab.url || changeInfo.url || '',
          timestamp: Date.now()
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn(`[Background] Content Script에 메시지 전송 실패 (시도 ${retryCount + 1}/${maxRetries}):`, chrome.runtime.lastError.message);
            
            // 재시도
            if (retryCount < maxRetries) {
              retryCount++;
              setTimeout(sendRecordingStart, retryDelay);
            } else {
              console.error('[Background] ❌ Content Script에 녹화 시작 메시지 전송 실패 (최대 재시도 횟수 초과)');
            }
          } else {
            console.log('[Background] ✅ Content Script에 녹화 시작 메시지 재전송 성공');
            
            // Electron에 URL 변경 알림
            sendWebSocketMessage({
              type: 'url-changed',
              url: tab.url || changeInfo.url || '',
              tabId: tabId,
              timestamp: Date.now(),
              previousUrl: changeInfo.url || null
            });
          }
        });
      };
      
      // 첫 시도 (즉시)
      setTimeout(sendRecordingStart, 100);
    } else {
      console.log('[Background] ⚠️ 녹화 중이 아니거나 녹화 데이터가 없어 Content Script에 메시지를 보내지 않습니다');
      console.log('[Background] isRecording:', isRecording);
      console.log('[Background] recordingData:', recordingData);
    }
    
    console.log('[Background] ===========================================');
  }
});
```

#### Content Script로부터 메시지 수신 및 Electron으로 전달

```javascript
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // DOM 이벤트를 Electron으로 전달
  if (msg.type === 'DOM_EVENT') {
    sendWebSocketMessage({
      type: 'dom-event',
      event: msg.event,
      sessionId: msg.sessionId,
      timestamp: Date.now()
    });
    sendResponse({ ok: true });
    return true;
  }
  
  // 요소 하이라이트 정보 전달
  if (msg.type === 'ELEMENT_HOVER') {
    sendWebSocketMessage({
      type: 'element-hover',
      element: msg.element,
      selectors: msg.selectors,
      timestamp: Date.now()
    });
    sendResponse({ ok: true });
    return true;
  }
  
  // 요소 하이라이트 해제
  if (msg.type === 'ELEMENT_HOVER_CLEAR') {
    sendWebSocketMessage({
      type: 'element-hover-clear',
      timestamp: Date.now()
    });
    sendResponse({ ok: true });
    return true;
  }
  
  // 녹화 완료 전달
  if (msg.type === 'RECORDING_COMPLETE') {
    sendWebSocketMessage({
      type: 'recording-complete',
      data: msg.data,
      timestamp: Date.now()
    });
    sendResponse({ ok: true });
    return true;
  }
  
  return false;
});
```

### 2. Content Script (content.js)

#### 녹화 상태 관리 및 Background Script로부터 메시지 수신

```javascript
// Content Script는 Background Script를 통해 Electron과 통신
// 직접 WebSocket 연결하지 않음

// 녹화 상태 관리
window.testArchitectRecording = {
  active: false,
  tcId: null,
  projectId: null,
  sessionId: null,
  url: null,
  startTime: null
};

// Background Script로부터 메시지 수신
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'RECORDING_START') {
    // 녹화 시작 처리
    const { tcId, projectId, sessionId, url } = msg;
    
    window.testArchitectRecording = {
      active: true,
      tcId,
      projectId,
      sessionId,
      url: url || window.location.href,
      startTime: Date.now()
    };
    
    // DOM 이벤트 리스너 시작
    startRecordingEventListeners();
    
    console.log('[Content] 녹화 시작됨:', { tcId, projectId, sessionId });
    sendResponse({ ok: true });
    return true;
  }
  
  if (msg.type === 'RECORDING_STOP') {
    // 녹화 중지 처리
    window.testArchitectRecording = {
      active: false
    };
    
    // DOM 이벤트 리스너 중지
    stopRecordingEventListeners();
    
    console.log('[Content] 녹화 중지됨');
    sendResponse({ ok: true });
    return true;
  }
  
  // 기존 메시지 처리 (DOM_EVENT 등)
  return false;
});

// 녹화 이벤트 리스너 시작/중지 함수
function startRecordingEventListeners() {
  // DOM 이벤트 리스너 등록
  // click, input, change 등의 이벤트 캡처
  // 기존 구현 참고
  console.log('[Content] 녹화 이벤트 리스너 시작');
}

function stopRecordingEventListeners() {
  // DOM 이벤트 리스너 제거
  // 기존 구현 참고
  console.log('[Content] 녹화 이벤트 리스너 중지');
}

// DOM 이벤트 발생 시 Background로 전송
function sendDomEventToBackground(event) {
  // 녹화가 활성화되어 있을 때만 전송
  if (!window.testArchitectRecording || !window.testArchitectRecording.active) {
    return;
  }
  
  chrome.runtime.sendMessage({
    type: 'DOM_EVENT',
    event: event,
    sessionId: window.testArchitectRecording.sessionId || getSessionId()
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[Content] 메시지 전송 실패:', chrome.runtime.lastError);
    }
  });
}

// 요소 하이라이트 정보 전송
function sendElementHoverToBackground(element, selectors) {
  chrome.runtime.sendMessage({
    type: 'ELEMENT_HOVER',
    element: {
      tag: element.tagName,
      id: element.id,
      className: element.className,
      text: element.textContent?.trim()
    },
    selectors: selectors
  });
}

// 요소 하이라이트 해제
function sendElementHoverClearToBackground() {
  chrome.runtime.sendMessage({
    type: 'ELEMENT_HOVER_CLEAR'
  });
}

// Content Script 연결 확인
chrome.runtime.sendMessage({
  type: 'CONTENT_SCRIPT_CONNECTED',
  url: window.location.href,
  tabId: null // Background에서 sender.tab.id로 확인
}, (response) => {
  if (response && response.ok) {
    console.log('[Content] Background 연결 확인됨');
  }
});
```

### 3. Side Panel (side_panel.js 또는 popup.js)

#### 녹화 완료 시 Electron으로 전송

```javascript
// 녹화 완료 버튼 클릭 시
async function sendRecordingComplete() {
  const recordingData = {
    type: 'recording_complete',
    sessionId: getSessionId(),
    tcId: getTcId(),
    projectId: getProjectId(),
    events: getAllEvents(),
    code: generateCode(),
    metadata: {
      browser: navigator.userAgent,
      startTime: recordingStartTime,
      endTime: Date.now(),
      duration: Date.now() - recordingStartTime
    }
  };
  
  // Background로 전송하여 Electron에 전달
  chrome.runtime.sendMessage({
    type: 'RECORDING_COMPLETE',
    data: recordingData
  }, (response) => {
    if (response && response.ok) {
      console.log('[Side Panel] 녹화 완료 데이터 전송 성공');
    }
  });
}
```

## 필수 구현 사항

### 1. WebSocket 연결 관리
- ✅ 연결 실패 시 자동 재연결
- ✅ 연결 상태 모니터링
- ✅ ping/pong으로 연결 유지

### 2. 메시지 처리
- ✅ 모든 메시지 타입 처리
- ✅ 에러 처리 및 로깅
- ✅ 메시지 검증

### 3. 녹화 상태 관리
- ✅ 녹화 시작/중지 상태 동기화
- ✅ Electron 명령에 대한 응답
- ✅ 상태 변경 알림

### 4. 이벤트 전송
- ✅ DOM 이벤트 실시간 전송
- ✅ 요소 하이라이트 정보 전송
- ✅ 녹화 완료 데이터 전송

## 전체 흐름도

```
[사용자 클릭: Electron 녹화 버튼]
        │
        ▼
[Electron → WebSocket 메시지 전송]
        │ type: 'start-recording'
        ▼
[Chrome 확장 Background Script 수신]
        │
        ├─→ [Side Panel 열기] ✅
        │   chrome.sidePanel.open()
        │
        └─→ [Content Script에 메시지 전송] ✅
                │ chrome.tabs.sendMessage()
                │ type: 'RECORDING_START'
                ▼
        [Content Script: 녹화 상태 활성화]
                │
                ▼
        [페이지 이벤트 리스너 시작]
                │
                ▼
        [DOM 이벤트 발생 시 Background로 전송]
                │
                ▼
        [Background → WebSocket → Electron]
```

## 테스트 체크리스트

- [ ] WebSocket 연결 성공
- [ ] Extension 등록 확인
- [ ] 녹화 시작 명령 수신 및 처리
- [ ] Side Panel 자동 열기 확인
- [ ] Content Script에 녹화 시작 메시지 전송 확인
- [ ] Content Script에서 녹화 상태 활성화 확인
- [ ] DOM 이벤트 리스너 시작 확인
- [ ] 녹화 중지 명령 수신 및 처리
- [ ] Content Script에 녹화 중지 메시지 전송 확인
- [ ] DOM 이벤트 전송 확인
- [ ] 요소 하이라이트 정보 전송 확인
- [ ] 녹화 완료 데이터 전송 확인
- [ ] 연결 끊김 시 자동 재연결 확인

## 참고사항

1. **WebSocket 서버 주소**: `ws://localhost:3000`
2. **연결 타임아웃**: 5초
3. **재연결 최대 시도**: 5회
4. **재연결 지연**: 5초 (시도 횟수에 따라 증가)
5. **메시지 형식**: JSON
6. **에러 처리**: 모든 메시지 전송/수신에 try-catch 적용

## 문제 해결

### WebSocket 연결 실패
- Electron 앱이 실행 중인지 확인
- localhost:3000 포트가 열려있는지 확인
- 방화벽 설정 확인

### 메시지 전송 실패
- WebSocket 연결 상태 확인
- 메시지 형식 확인 (JSON)
- Background Script 로그 확인

### 녹화 상태 동기화 실패
- Electron과 확장 프로그램 간 메시지 타입 일치 확인
- 타임스탬프 확인
- 로그 확인

