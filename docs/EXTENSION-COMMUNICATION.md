# Extension 통신 가이드

## 개요

TestArchitect는 HTTP를 통해 Chrome Extension과 통신합니다. 이 문서는 Extension 개발자가 TestArchitect와 통신하는 방법을 설명합니다.

> **⚠️ 중요**: 최신 구현 방식은 Side Panel을 사용합니다. 자세한 내용은 [Side Panel 구현 가이드](./EXTENSION-SIDE-PANEL-IMPLEMENTATION.md)를 참조하세요.

## 아키텍처 (최신 방식)

```
[Electron App] - 녹화 버튼 클릭
    │
    ▼
[Chrome 실행 - recording URL 열기]
    │
    ▼
[Content Script - URL 파라미터 감지]
    │
    ▼
[Background Script - 메시지 수신]
    │
    ▼
[chrome.sidePanel.open() - 자동 열기]
    │
    ▼
[Side Panel - 녹화 UI 표시]
```

## 새로운 플로우 (권장)

1. Electron에서 녹화 버튼 클릭
2. Chrome 브라우저가 `http://localhost:3000/record?tcId=X&projectId=Y&sessionId=Z` URL로 열림
3. Content Script가 URL 파라미터를 자동 감지
4. Background Script에 메시지 전송
5. `chrome.sidePanel.open()`으로 Side Panel 자동 열기
6. Side Panel에 녹화 UI 표시

자세한 구현 방법은 [Side Panel 구현 가이드](./EXTENSION-SIDE-PANEL-IMPLEMENTATION.md)를 참조하세요.

## 통신 방법

### 1. WebSocket 연결 (권장)

Extension Background Script에서 WebSocket으로 연결합니다.

#### 연결

```javascript
// background.js
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  console.log('TestArchitect 서버에 연결됨');
  
  // Extension 등록
  ws.send(JSON.stringify({
    type: 'register',
    extensionId: chrome.runtime.id
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  handleMessage(data);
};

ws.onerror = (error) => {
  console.error('WebSocket 오류:', error);
  // ERR_CONNECTION_REFUSED는 서버가 아직 시작되지 않았을 수 있음
  if (error.message && error.message.includes('ERR_CONNECTION_REFUSED')) {
    console.warn('서버가 아직 시작되지 않았습니다. 재연결을 시도합니다...');
    setTimeout(connect, 3000); // 3초 후 재연결
  }
};

ws.onclose = () => {
  console.log('WebSocket 연결 종료');
  // 재연결 로직 구현 권장
  setTimeout(connect, 3000); // 3초 후 재연결
};
```

#### 메시지 수신

```javascript
function handleMessage(data) {
  switch (data.type) {
    case 'connected':
      console.log('서버 연결 확인:', data.message);
      break;
      
    case 'OPEN_POPUP':
      // 팝업 열기 요청
      openPopup({
        tcId: data.tcId,
        projectId: data.projectId,
        sessionId: data.sessionId
      });
      
      // 팝업 열기 완료 알림
      ws.send(JSON.stringify({
        type: 'popup_opened',
        tcId: data.tcId,
        projectId: data.projectId,
        sessionId: data.sessionId
      }));
      break;
      
    default:
      console.warn('알 수 없는 메시지 타입:', data.type);
  }
}
```

### 2. HTTP API

#### 팝업 열기 요청

```javascript
// Extension에서 팝업 열기 요청
fetch('http://localhost:3000/api/extension/open-popup', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tcId: 8,
    projectId: 1,
    sessionId: 'session-123'
  })
})
.then(res => res.json())
.then(data => {
  console.log('응답:', data);
});
```

#### 녹화 데이터 전송

```javascript
// 녹화 완료 후 데이터 전송
fetch('http://localhost:3000/api/recording', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    type: 'recording_complete',
    sessionId: 'session-123',
    tcId: 8,
    projectId: 1,
    events: [...],
    code: {...}
  })
})
.then(res => res.json())
.then(data => {
  console.log('저장 완료:', data);
});
```

### 3. Content Script 통신 (선택사항)

Content Script를 사용하는 경우:

```javascript
// content.js
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  if (event.data && event.data.type === 'OPEN_POPUP' && event.data.source === 'testarchitect') {
    // Background Script에 전달
    chrome.runtime.sendMessage({
      type: 'OPEN_POPUP',
      ...event.data
    });
    
    // 응답 전송
    window.postMessage({
      type: 'OPEN_POPUP_RESPONSE',
      source: 'testarchitect-extension',
      success: true
    }, '*');
  }
});
```

## 메시지 타입

### 서버 → Extension

#### `connected`
서버 연결 확인

```json
{
  "type": "connected",
  "message": "TestArchitect 서버에 연결되었습니다",
  "timestamp": 1234567890
}
```

#### `OPEN_POPUP`
팝업 열기 요청

```json
{
  "type": "OPEN_POPUP",
  "tcId": "8",
  "projectId": "1",
  "sessionId": "session-1234567890",
  "timestamp": 1234567890
}
```

### Extension → 서버

#### `register`
Extension 등록

```json
{
  "type": "register",
  "extensionId": "abcdefghijklmnopqrstuvwxyz123456"
}
```

#### `popup_opened`
팝업 열기 완료 알림

```json
{
  "type": "popup_opened",
  "tcId": "8",
  "projectId": "1",
  "sessionId": "session-1234567890"
}
```

#### `recording_status`
녹화 상태 업데이트

```json
{
  "type": "recording_status",
  "status": "recording",
  "sessionId": "session-1234567890"
}
```

#### `ping`
연결 확인

```json
{
  "type": "ping"
}
```

## API 엔드포인트

### POST /api/extension/open-popup

Extension 팝업 열기 요청

**Request:**
```json
{
  "tcId": 8,
  "projectId": 1,
  "sessionId": "session-123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Extension에 팝업 열기 요청을 전송했습니다",
  "tcId": 8,
  "projectId": 1,
  "sessionId": "session-123"
}
```

### POST /api/recording

녹화 데이터 수신

**Request:**
```json
{
  "type": "recording_complete",
  "sessionId": "session-123",
  "tcId": 8,
  "projectId": 1,
  "events": [...],
  "code": {...}
}
```

**Response:**
```json
{
  "success": true,
  "message": "녹화 데이터가 성공적으로 저장되었습니다",
  "tcId": 8,
  "scriptId": 456
}
```

### GET /api/health

서버 상태 확인

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "server": {
    "port": 3000,
    "running": true
  },
  "websocket": {
    "enabled": true,
    "clients": 1,
    "url": "ws://localhost:3000"
  }
}
```

### GET /api/server-status

서버 상태 확인 (Extension용 간단 버전)

**Response:**
```json
{
  "running": true,
  "port": 3000,
  "websocket": {
    "enabled": true,
    "clients": 1,
    "url": "ws://localhost:3000"
  },
  "timestamp": 1234567890
}
```

## 구현 예제

### Background Script 전체 예제

```javascript
// background.js
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

function connect() {
  ws = new WebSocket('ws://localhost:3000');
  
  ws.onopen = () => {
    console.log('✅ TestArchitect 서버 연결 성공');
    reconnectAttempts = 0;
    
    // Extension 등록
    ws.send(JSON.stringify({
      type: 'register',
      extensionId: chrome.runtime.id
    }));
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleMessage(data);
  };
  
  ws.onerror = (error) => {
    console.error('❌ WebSocket 오류:', error);
    // ERR_CONNECTION_REFUSED는 서버가 아직 시작되지 않았을 수 있음
    if (error.message && error.message.includes('ERR_CONNECTION_REFUSED')) {
      console.warn('서버가 아직 시작되지 않았습니다. 재연결을 시도합니다...');
    }
  };
  
  ws.onclose = () => {
    console.log('🔌 WebSocket 연결 종료');
    reconnect();
  };
}

// 서버 상태 확인 (연결 전에 서버가 준비되었는지 확인)
async function checkServerStatus() {
  try {
    const response = await fetch('http://localhost:3000/api/server-status');
    const data = await response.json();
    return data.running && data.websocket.enabled;
  } catch (error) {
    return false;
  }
}

async function reconnect() {
  if (reconnectAttempts >= maxReconnectAttempts) {
    console.error('❌ 최대 재연결 시도 횟수 도달');
    return;
  }
  
  reconnectAttempts++;
  console.log(`🔄 재연결 시도 ${reconnectAttempts}/${maxReconnectAttempts}`);
  
  // 서버 상태 확인 후 연결
  const serverReady = await checkServerStatus();
  if (serverReady) {
    console.log('서버가 준비되었습니다. 연결을 시도합니다...');
    connect();
  } else {
    console.log('서버가 아직 준비되지 않았습니다. 잠시 후 다시 시도합니다...');
    setTimeout(reconnect, 3000);
  }
}

function handleMessage(data) {
  switch (data.type) {
    case 'connected':
      console.log('서버 연결 확인');
      break;
      
    case 'OPEN_POPUP':
      openPopup(data);
      break;
      
    default:
      console.warn('알 수 없는 메시지:', data);
  }
}

function openPopup(data) {
  // 팝업 열기
  chrome.action.openPopup();
  
  // Content Script에 메시지 전달
  chrome.tabs.query({url: 'http://localhost:3000/*'}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'OPEN_POPUP',
        tcId: data.tcId,
        projectId: data.projectId,
        sessionId: data.sessionId
      });
    });
  });
  
  // 서버에 알림
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'popup_opened',
      ...data
    }));
  }
}

// Extension 설치/시작 시 연결
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
connect();
```

## 주의사항

1. **포트 번호**: 기본 포트는 3000입니다. 변경 시 Extension도 함께 수정해야 합니다.
2. **재연결**: WebSocket 연결이 끊어질 수 있으므로 재연결 로직을 구현하는 것을 권장합니다.
3. **보안**: 로컬 서버이므로 보안 문제는 적지만, 프로덕션 환경에서는 추가 보안 조치가 필요할 수 있습니다.
4. **Content Script**: Content Script를 사용하지 않아도 WebSocket을 통해 통신할 수 있습니다.

## 문제 해결

### WebSocket 연결 실패 (ERR_CONNECTION_REFUSED)

이 오류는 다음 경우에 발생할 수 있습니다:

1. **TestArchitect가 아직 시작되지 않음**
   - Electron 앱이 완전히 시작되기 전에 Extension이 연결을 시도
   - 해결: 재연결 로직이 자동으로 처리 (3초마다 재시도)

2. **서버가 실행되지 않음**
   - `startRecordingServer()`가 호출되지 않았거나 실패
   - 해결: Electron 앱 콘솔에서 서버 시작 로그 확인
   - 예상 로그: `[Server] 녹화 데이터 수신 서버 시작: http://localhost:3000`

3. **포트 3000이 다른 프로세스에 의해 사용 중**
   - 다른 애플리케이션이 포트 3000을 사용 중
   - 해결: 포트를 사용하는 프로세스 확인 및 종료

4. **Extension 권한 문제**
   - Extension의 manifest.json에 `host_permissions` 추가 필요:
   ```json
   {
     "host_permissions": [
       "http://localhost:3000/*",
       "ws://localhost:3000/*"
     ]
   }
   ```

5. **서버 상태 확인**
   - 브라우저에서 `http://localhost:3000/api/server-status` 접속
   - `running: true`인지 확인

### 메시지 수신 안 됨

1. WebSocket 연결 상태 확인
2. 콘솔에서 메시지 타입 확인
3. 서버 로그 확인

### 팝업이 열리지 않음

1. Extension이 활성화되어 있는지 확인
2. Background Script가 실행 중인지 확인
3. Content Script가 주입되는지 확인 (사용하는 경우)



