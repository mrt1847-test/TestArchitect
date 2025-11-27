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

