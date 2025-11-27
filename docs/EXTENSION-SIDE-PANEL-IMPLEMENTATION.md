# 크롬 확장 프로그램 Side Panel 구현 가이드

## 개요

이 문서는 TestArchitect와 연동되는 Chrome 확장 프로그램을 Side Panel 방식으로 구현하는 방법을 설명합니다.

## 플로우

```
Electron (녹화버튼 눌림)
    ↓
Chrome 실행 (확장 로드 / recording URL 열기)
    ↓
확장 Content Script가 URL 파라미터 감지
    ↓
Background에 메시지 전송
    ↓
chrome.sidePanel.open()
    ↓
사이드패널이 열리면서 녹화 UI 표시
```

## 구현 단계

### 1. manifest.json 설정

```json
{
  "manifest_version": 3,
  "name": "TestArchitect Recorder",
  "version": "1.0.0",
  "description": "TestArchitect 녹화 도구",
  
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  
  "permissions": [
    "sidePanel",
    "tabs",
    "activeTab",
    "storage"
  ],
  
  "host_permissions": [
    "http://localhost:3000/*"
  ],
  
  "background": {
    "service_worker": "background.js"
  },
  
  "content_scripts": [
    {
      "matches": ["http://localhost:3000/record*"],
      "js": ["content.js"],
      "run_at": "document_start"
    }
  ],
  
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### 2. Content Script (content.js)

URL 파라미터를 감지하고 Background Script에 메시지를 전송합니다.

```javascript
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
```

### 3. Background Script (background.js)

Content Script로부터 메시지를 받아 Side Panel을 엽니다.

```javascript
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
```

### 4. Side Panel (sidepanel.html)

녹화 UI를 표시합니다.

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>TestArchitect 녹화</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
      background: #f5f5f5;
      min-height: 100vh;
    }
    
    .container {
      max-width: 400px;
      margin: 0 auto;
    }
    
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 10px;
      margin-bottom: 20px;
      text-align: center;
    }
    
    .header h1 {
      font-size: 24px;
      margin-bottom: 10px;
    }
    
    .info-card {
      background: white;
      padding: 20px;
      border-radius: 10px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    
    .info-row:last-child {
      border-bottom: none;
    }
    
    .info-label {
      font-weight: bold;
      color: #666;
    }
    
    .info-value {
      color: #333;
    }
    
    .controls {
      background: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .btn {
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 6px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      margin-bottom: 10px;
      transition: all 0.3s;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(102, 126, 234, 0.4);
    }
    
    .btn-secondary {
      background: #6c757d;
      color: white;
    }
    
    .btn-secondary:hover {
      background: #5a6268;
    }
    
    .btn-danger {
      background: #dc3545;
      color: white;
    }
    
    .btn-danger:hover {
      background: #c82333;
    }
    
    .status {
      text-align: center;
      padding: 10px;
      margin-top: 10px;
      border-radius: 6px;
      font-weight: bold;
    }
    
    .status.recording {
      background: #d4edda;
      color: #155724;
    }
    
    .status.stopped {
      background: #f8d7da;
      color: #721c24;
    }
    
    .events-count {
      text-align: center;
      margin-top: 10px;
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎬 TestArchitect</h1>
      <p>녹화 도구</p>
    </div>
    
    <div class="info-card">
      <div class="info-row">
        <span class="info-label">TC ID:</span>
        <span class="info-value" id="tc-id">-</span>
      </div>
      <div class="info-row">
        <span class="info-label">프로젝트 ID:</span>
        <span class="info-value" id="project-id">-</span>
      </div>
      <div class="info-row">
        <span class="info-label">세션 ID:</span>
        <span class="info-value" id="session-id">-</span>
      </div>
    </div>
    
    <div class="controls">
      <button id="start-btn" class="btn btn-primary">녹화 시작</button>
      <button id="stop-btn" class="btn btn-danger" style="display:none;">녹화 중지</button>
      
      <div id="status" class="status stopped" style="display:none;">중지됨</div>
      <div id="events-count" class="events-count"></div>
    </div>
  </div>
  
  <script src="sidepanel.js"></script>
</body>
</html>
```

### 5. Side Panel Script (sidepanel.js)

녹화 기능을 구현합니다.

```javascript
// sidepanel.js

let recordingData = null;
let isRecording = false;
let recordedEvents = [];

// Storage에서 녹화 데이터 가져오기
async function loadRecordingData() {
  try {
    const result = await chrome.storage.local.get(['recordingData']);
    if (result.recordingData) {
      recordingData = result.recordingData;
      displayRecordingData();
    }
  } catch (error) {
    console.error('녹화 데이터 로드 실패:', error);
  }
}

// 녹화 데이터 표시
function displayRecordingData() {
  if (!recordingData) return;
  
  document.getElementById('tc-id').textContent = recordingData.tcId || '-';
  document.getElementById('project-id').textContent = recordingData.projectId || '-';
  document.getElementById('session-id').textContent = recordingData.sessionId || '-';
}

// 녹화 시작
async function startRecording() {
  if (!recordingData) {
    alert('녹화 데이터가 없습니다.');
    return;
  }
  
  isRecording = true;
  recordedEvents = [];
  
  // UI 업데이트
  document.getElementById('start-btn').style.display = 'none';
  document.getElementById('stop-btn').style.display = 'block';
  
  const statusEl = document.getElementById('status');
  statusEl.style.display = 'block';
  statusEl.className = 'status recording';
  statusEl.textContent = '녹화 중...';
  
  // Content Script에 녹화 시작 메시지 전송
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs[0]) {
    chrome.tabs.sendMessage(tabs[0].id, {
      type: 'START_RECORDING',
      sessionId: recordingData.sessionId
    });
  }
  
  console.log('녹화 시작:', recordingData);
}

// 녹화 중지
async function stopRecording() {
  if (!isRecording) return;
  
  isRecording = false;
  
  // UI 업데이트
  document.getElementById('start-btn').style.display = 'block';
  document.getElementById('stop-btn').style.display = 'none';
  
  const statusEl = document.getElementById('status');
  statusEl.className = 'status stopped';
  statusEl.textContent = '중지됨';
  
  // Content Script에 녹화 중지 메시지 전송
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs[0]) {
    chrome.tabs.sendMessage(tabs[0].id, {
      type: 'STOP_RECORDING',
      sessionId: recordingData.sessionId
    });
  }
  
  // 녹화 데이터 전송
  await sendRecordingData();
  
  console.log('녹화 중지:', recordedEvents.length, 'events');
}

// 녹화 데이터 전송
async function sendRecordingData() {
  if (!recordingData || recordedEvents.length === 0) {
    console.warn('전송할 녹화 데이터가 없습니다');
    return;
  }
  
  try {
    const response = await fetch('http://localhost:3000/api/recording', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'recording_complete',
        sessionId: recordingData.sessionId,
        tcId: recordingData.tcId,
        projectId: recordingData.projectId,
        events: recordedEvents,
        metadata: {
          browser: 'chrome',
          timestamp: Date.now()
        }
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('녹화 데이터 전송 성공:', result);
      alert('녹화 데이터가 저장되었습니다!');
    } else {
      console.error('녹화 데이터 전송 실패:', result.error);
      alert('녹화 데이터 저장 실패: ' + result.error);
    }
  } catch (error) {
    console.error('녹화 데이터 전송 오류:', error);
    alert('녹화 데이터 전송 오류: ' + error.message);
  }
}

// 이벤트 수신 (Content Script로부터)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RECORDED_EVENT') {
    recordedEvents.push(message.event);
    
    // 이벤트 개수 업데이트
    document.getElementById('events-count').textContent = 
      `캡처된 이벤트: ${recordedEvents.length}개`;
  }
  
  return true;
});

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
  await loadRecordingData();
  
  document.getElementById('start-btn').addEventListener('click', startRecording);
  document.getElementById('stop-btn').addEventListener('click', stopRecording);
});
```

## 파일 구조

```
extension/
├── manifest.json
├── background.js
├── content.js
├── sidepanel.html
├── sidepanel.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 주요 특징

1. **자동 감지**: Content Script가 URL 파라미터를 자동으로 감지
2. **사이드 패널**: 사용자 제스처 없이 자동으로 열림
3. **간단한 구조**: 복잡한 WebSocket 로직 불필요
4. **안정적**: 크롬 정책을 준수하면서 자동화 가능

## 참고사항

- Chrome 114 이상이 필요합니다 (Side Panel API 지원)
- Content Script는 `document_start`에서 실행되어 즉시 URL을 감지합니다
- Storage API를 사용하여 Background와 Side Panel 간 데이터를 공유합니다

