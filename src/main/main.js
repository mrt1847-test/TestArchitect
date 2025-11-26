/**
 * Electron 메인 프로세스
 * 애플리케이션의 진입점 및 IPC 통신 관리
 */

// 콘솔 인코딩 설정 (Windows 한글 깨짐 방지)
if (process.platform === 'win32') {
  // Windows 콘솔 인코딩을 UTF-8로 설정
  process.stdout.setDefaultEncoding('utf8');
  process.stderr.setDefaultEncoding('utf8');
  // chcp 65001 (UTF-8) 설정
  try {
    require('child_process').execSync('chcp 65001 >nul 2>&1', { shell: true });
  } catch (e) {
    // 무시
  }
  // 환경 변수 설정
  process.env.PYTHONIOENCODING = 'utf-8';
}

const { app, BrowserWindow, ipcMain, Menu, globalShortcut } = require('electron');
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const WebSocket = require('ws');
const config = require('./config/config');
const PytestService = require('./services/pytestService');
const ScriptManager = require('./services/scriptManager');
const EnvironmentChecker = require('./services/environmentChecker');
const DbService = require('./services/dbService');

// 프로덕션 모드 경로 초기화는 app.whenReady()에서 처리
// createWindow()가 호출되기 전에 경로가 설정되어야 함

/** @type {BrowserWindow} 메인 윈도우 인스턴스 */
let mainWindow;

/** @type {http.Server} 녹화 데이터 수신용 HTTP 서버 */
let recordingServer = null;

/** @type {WebSocket.Server} Extension 통신용 WebSocket 서버 */
let recordingWebSocketServer = null;

/** @type {Set<WebSocket>} 연결된 Extension 클라이언트 */
const extensionClients = new Set();

/**
 * 녹화 데이터 수신용 HTTP 서버 시작
 * 크롬 확장 프로그램과 통신하기 위한 로컬 서버
 */
function startRecordingServer() {
  if (recordingServer) {
    console.log('⚠️ 녹화 서버가 이미 실행 중입니다.');
    return;
  }

  const recordingApp = express();
  recordingApp.use(cors());
  recordingApp.use(bodyParser.json({ limit: '50mb' }));
  recordingApp.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

  // 녹화 데이터 수신 엔드포인트
  recordingApp.post('/api/recording', async (req, res) => {
    try {
      const recordingData = req.body;
      console.log('📥 녹화 데이터 수신:', {
        type: recordingData.type,
        sessionId: recordingData.sessionId,
        tcId: recordingData.tcId,
        eventsCount: recordingData.events?.length || 0
      });
      
      // 디버깅: events 데이터 구조 확인
      if (recordingData.events && recordingData.events.length > 0) {
        console.log('📋 첫 번째 이벤트 샘플:', JSON.stringify(recordingData.events[0], null, 2));
        console.log('📋 이벤트 타입들:', recordingData.events.map(e => e.type || '(type 없음)'));
      }

      // 녹화 데이터를 메인 프로세스로 전달
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('recording-data', recordingData);
      }

      // 데이터를 TC와 스크립트에 반영
      const result = await processRecordingData(recordingData);

      res.json({
        success: true,
        message: '녹화 데이터가 성공적으로 저장되었습니다',
        ...result
      });
    } catch (error) {
      console.error('❌ 녹화 데이터 처리 오류:', error);
      res.status(500).json({
        success: false,
        error: error.message || '녹화 데이터 처리 중 오류가 발생했습니다',
        code: 'PROCESSING_ERROR'
      });
    }
  });

  // 녹화 시작 페이지 (크롬 확장 프로그램이 감지할 URL)
  recordingApp.get('/record', (req, res) => {
    const { tcId, projectId, sessionId } = req.query;
    
    // 간단한 HTML 페이지 반환 (크롬 확장 프로그램이 감지)
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>TestArchitect 녹화</title>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            backdrop-filter: blur(10px);
          }
          h1 { margin: 0 0 20px 0; font-size: 2.5em; }
          p { font-size: 1.2em; opacity: 0.9; }
          .info {
            margin-top: 30px;
            padding: 20px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 10px;
            font-size: 0.9em;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎬 녹화 준비 완료</h1>
          <p>크롬 확장 프로그램이 녹화를 시작합니다...</p>
          <div class="info">
            <div>TC ID: ${tcId || 'N/A'}</div>
            <div>프로젝트 ID: ${projectId || 'N/A'}</div>
            <div>세션 ID: ${sessionId || 'N/A'}</div>
          </div>
        </div>
        <script>
          // 크롬 확장 프로그램에 팝업 열기 메시지 전송
          (function() {
            const params = {
              type: 'OPEN_POPUP',
              tcId: '${tcId}',
              projectId: '${projectId}',
              sessionId: '${sessionId}',
              source: 'testarchitect',
              timestamp: Date.now()
            };
            
            let attemptCount = 0;
            const maxAttempts = 8;
            let messageReceived = false;
            let ws = null;
            let wsConnected = false;
            
            // WebSocket 연결 (Extension Background와 직접 통신)
            function connectWebSocket() {
              try {
                const wsUrl = 'ws://localhost:3000';
                ws = new WebSocket(wsUrl);
                
                ws.onopen = () => {
                  wsConnected = true;
                  console.log('[TestArchitect] ✅ WebSocket 연결 성공');
                  
                  // Extension에 팝업 열기 요청 전송
                  sendWebSocketMessage({
                    type: 'OPEN_POPUP',
                    tcId: params.tcId,
                    projectId: params.projectId,
                    sessionId: params.sessionId
                  });
                };
                
                ws.onmessage = (event) => {
                  try {
                    const data = JSON.parse(event.data);
                    console.log('[TestArchitect] 📨 WebSocket 메시지 수신:', data);
                    
                    if (data.type === 'popup_opened' || data.type === 'OPEN_POPUP_RESPONSE') {
                      messageReceived = true;
                      const p = document.querySelector('p');
                      if (p) {
                        p.textContent = '✅ 팝업 열기 요청이 확장 프로그램에 전달되었습니다!';
                        p.style.color = '#4ade80';
                      }
                    }
                  } catch (error) {
                    console.error('[TestArchitect] WebSocket 메시지 파싱 오류:', error);
                  }
                };
                
                ws.onerror = (error) => {
                  console.warn('[TestArchitect] ⚠️ WebSocket 연결 오류:', error);
                  wsConnected = false;
                };
                
                ws.onclose = () => {
                  console.log('[TestArchitect] WebSocket 연결 종료');
                  wsConnected = false;
                };
              } catch (error) {
                console.error('[TestArchitect] WebSocket 생성 오류:', error);
              }
            }
            
            function sendWebSocketMessage(message) {
              if (ws && wsConnected && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message));
                console.log('[TestArchitect] 📤 WebSocket 메시지 전송:', message);
              }
            }
            
            // 확장 프로그램으로부터 응답을 받는 리스너 (Content Script용)
            window.addEventListener('message', function(event) {
              // 보안: 같은 윈도우에서 온 메시지만 처리
              if (event.source !== window) return;
              
              // 확장 프로그램으로부터의 응답 확인
              if (event.data && event.data.type === 'OPEN_POPUP_RESPONSE' && event.data.source === 'testarchitect-extension') {
                messageReceived = true;
                console.log('[TestArchitect] ✅ 확장 프로그램으로부터 응답 수신:', event.data);
                
                const p = document.querySelector('p');
                if (p) {
                  if (event.data.success) {
                    p.textContent = '✅ 팝업 열기 요청이 확장 프로그램에 전달되었습니다!';
                    p.style.color = '#4ade80';
                  } else {
                    p.textContent = '⚠️ 확장 프로그램 응답: ' + (event.data.error || '알 수 없는 오류');
                    p.style.color = '#fbbf24';
                  }
                }
              }
            });
            
            function sendMessage() {
              if (attemptCount >= maxAttempts) {
                if (!messageReceived) {
                  console.warn('[TestArchitect] ⚠️ 메시지 전송 최대 시도 횟수 도달 - 확장 프로그램이 응답하지 않음');
                  
                  // URL 파라미터를 전역 변수로도 노출 (확장 프로그램이 읽을 수 있도록)
                  window.testArchitectParams = params;
                  
                  const p = document.querySelector('p');
                  if (p) {
                    p.innerHTML = '❌ 확장 프로그램이 메시지에 응답하지 않습니다.<br><br>' +
                      '💡 <strong>확인 사항:</strong><br>' +
                      '1. 확장 프로그램이 설치되어 있고 활성화되어 있는지<br>' +
                      '2. 확장 프로그램의 Background Script가 WebSocket에 연결되어 있는지<br>' +
                      '3. 현재 URL: <code>' + window.location.href + '</code><br>' +
                      '4. WebSocket 연결 상태: ' + (wsConnected ? '✅ 연결됨' : '❌ 연결 안 됨');
                    p.style.color = '#ef4444';
                    p.style.textAlign = 'left';
                    p.style.fontSize = '0.9em';
                  }
                }
                return;
              }
              
              try {
                // 방법 1: WebSocket (우선순위 높음)
                if (wsConnected) {
                  sendWebSocketMessage({
                    type: 'OPEN_POPUP',
                    tcId: params.tcId,
                    projectId: params.projectId,
                    sessionId: params.sessionId
                  });
                }
                
                // 방법 2: window.postMessage (Content Script용)
                window.postMessage(params, '*');
                
                // 방법 3: 커스텀 이벤트
                const customEvent = new CustomEvent('testarchitect-open-popup', {
                  detail: params,
                  bubbles: true,
                  cancelable: true
                });
                document.dispatchEvent(customEvent);
                window.dispatchEvent(customEvent);
                
                // 방법 4: 전역 변수 노출
                window.testArchitectParams = params;
                
                attemptCount++;
                console.log('[TestArchitect] 📤 팝업 열기 메시지 전송 (시도 ' + attemptCount + '/' + maxAttempts + '):', {
                  type: params.type,
                  tcId: params.tcId,
                  projectId: params.projectId,
                  sessionId: params.sessionId,
                  websocket: wsConnected ? '✅' : '❌'
                });
                
                // 메시지 전송 확인을 위한 피드백
                const p = document.querySelector('p');
                if (p && !messageReceived) {
                  const methods = [];
                  if (wsConnected) methods.push('WebSocket');
                  methods.push('postMessage', 'CustomEvent', '전역변수');
                  p.textContent = '📤 확장 프로그램에 팝업 열기 요청 전송 중... (시도: ' + attemptCount + '/' + maxAttempts + ')\\n💡 사용 방법: ' + methods.join(', ');
                  p.style.whiteSpace = 'pre-line';
                }
                
                // 다음 재시도 스케줄링 (점진적으로 간격 증가)
                if (attemptCount < maxAttempts && !messageReceived) {
                  const delays = [0, 200, 500, 1000, 1500, 2000, 3000, 5000];
                  const delay = delays[attemptCount] || 5000;
                  setTimeout(() => sendMessage(), delay);
                }
              } catch (error) {
                console.error('[TestArchitect] ❌ 메시지 전송 오류:', error);
              }
            }
            
            // 페이지 로드 완료 후 메시지 전송 시작
            function init() {
              console.log('[TestArchitect] 🚀 페이지 초기화 시작');
              console.log('[TestArchitect] 📋 파라미터:', params);
              
              // WebSocket 연결 시도 (Extension Background와 직접 통신)
              connectWebSocket();
              
              // 기존 방식도 함께 시도
              setTimeout(() => sendMessage(), 200);
            }
            
            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', () => {
                console.log('[TestArchitect] 📄 DOMContentLoaded 이벤트 발생');
                setTimeout(init, 100);
              });
            } else {
              console.log('[TestArchitect] 📄 DOM 이미 로드됨');
              setTimeout(init, 100);
            }
            
            // window.load 이벤트에서도 한 번 더 시도
            window.addEventListener('load', () => {
              console.log('[TestArchitect] ✅ window.load 이벤트 발생');
              if (!messageReceived && !wsConnected) {
                // WebSocket 재연결 시도
                connectWebSocket();
              }
              if (!messageReceived) {
                setTimeout(() => sendMessage(), 300);
              }
            });
            
            // 페이지 언로드 시 WebSocket 정리
            window.addEventListener('beforeunload', () => {
              if (ws) {
                ws.close();
              }
            });
          })();
        </script>
      </body>
      </html>
    `);
  });

  // 녹화 중지 요청 엔드포인트
  recordingApp.post('/api/recording/stop', (req, res) => {
    try {
      const { sessionId } = req.body;
      console.log('🛑 녹화 중지 요청:', { sessionId });

      // 녹화 중지 신호를 메인 프로세스로 전달
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('recording-stop', { sessionId });
      }

      res.json({
        success: true,
        message: '녹화 중지 신호가 전송되었습니다'
      });
    } catch (error) {
      console.error('❌ 녹화 중지 오류:', error);
      res.status(500).json({
        success: false,
        error: error.message || '녹화 중지 중 오류가 발생했습니다'
      });
    }
  });

  // Extension 팝업 열기 요청 엔드포인트
  recordingApp.post('/api/extension/open-popup', (req, res) => {
    try {
      const { tcId, projectId, sessionId } = req.body;
      
      if (!tcId || !projectId) {
        return res.status(400).json({
          success: false,
          error: 'tcId와 projectId가 필요합니다'
        });
      }
      
      console.log('📤 Extension 팝업 열기 요청:', { tcId, projectId, sessionId });
      
      // Extension에 WebSocket으로 메시지 전송
      broadcastToExtensions({
        type: 'OPEN_POPUP',
        tcId: tcId,
        projectId: projectId,
        sessionId: sessionId || `session-${Date.now()}`,
        timestamp: Date.now()
      });
      
      res.json({
        success: true,
        message: 'Extension에 팝업 열기 요청을 전송했습니다',
        tcId,
        projectId,
        sessionId
      });
    } catch (error) {
      console.error('❌ Extension 팝업 열기 요청 오류:', error);
      res.status(500).json({
        success: false,
        error: error.message || '팝업 열기 요청 처리 중 오류가 발생했습니다'
      });
    }
  });

  // Health check
  recordingApp.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      server: {
        port: PORT,
        running: recordingServer !== null && recordingServer.listening
      },
      websocket: {
        enabled: recordingWebSocketServer !== null,
        clients: extensionClients.size,
        url: `ws://localhost:${PORT}`
      }
    });
  });
  
  // 서버 상태 확인 (Extension용)
  recordingApp.get('/api/server-status', (req, res) => {
    res.json({
      running: recordingServer !== null && recordingServer.listening,
      port: PORT,
      websocket: {
        enabled: recordingWebSocketServer !== null,
        clients: extensionClients.size,
        url: `ws://localhost:${PORT}`
      },
      timestamp: Date.now()
    });
  });

  const PORT = 3000;
  recordingServer = http.createServer(recordingApp);
  
  // WebSocket 서버 생성 (Extension Background와 통신)
  recordingWebSocketServer = new WebSocket.Server({ server: recordingServer });
  
  // Extension 클라이언트 연결 관리
  recordingWebSocketServer.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`🔌 Extension WebSocket 클라이언트 연결: ${clientIp}`);
    extensionClients.add(ws);
    
    // 연결 확인 메시지 전송
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'TestArchitect 서버에 연결되었습니다',
      timestamp: Date.now()
    }));
    
    // 메시지 수신 처리
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        handleExtensionMessage(ws, data);
      } catch (error) {
        console.error('[Extension] 메시지 파싱 오류:', error.message);
        console.error('[Extension] 원본 메시지:', message.toString().substring(0, 200));
        ws.send(JSON.stringify({
          type: 'error',
          message: '메시지 파싱 실패',
          error: error.message
        }));
      }
    });
    
    // 연결 종료 처리
    ws.on('close', () => {
      console.log(`🔌 Extension WebSocket 클라이언트 연결 해제: ${clientIp}`);
      extensionClients.delete(ws);
    });
    
    // 에러 처리
    ws.on('error', (error) => {
      console.error('❌ Extension WebSocket 오류:', error);
      extensionClients.delete(ws);
    });
  });
  
  recordingServer.listen(PORT, () => {
    console.log(`[Server] 녹화 데이터 수신 서버 시작: http://localhost:${PORT}`);
    console.log(`[Server] Extension WebSocket 서버 시작: ws://localhost:${PORT}`);
    console.log(`[Server] 서버 준비 완료 - Extension 연결 대기 중...`);
  });

  recordingServer.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`[Server] 포트 ${PORT}가 이미 사용 중입니다. 녹화 서버를 시작할 수 없습니다.`);
      console.warn(`[Server] 다른 프로세스가 포트 ${PORT}를 사용 중일 수 있습니다.`);
    } else {
      console.error('[Server] 녹화 서버 오류:', error);
    }
  });
  
  // 서버 시작 확인용 Promise 반환 (선택사항)
  return new Promise((resolve, reject) => {
    recordingServer.on('listening', () => {
      console.log(`[Server] 서버가 포트 ${PORT}에서 리스닝 중입니다.`);
      resolve(recordingServer);
    });
    
    recordingServer.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`포트 ${PORT}가 이미 사용 중입니다.`));
      } else {
        reject(error);
      }
    });
  });
}

/**
 * Extension으로부터 받은 메시지 처리
 * @param {WebSocket} ws - WebSocket 연결
 * @param {Object} data - 메시지 데이터
 */
function handleExtensionMessage(ws, data) {
  const messageType = data.type || 'unknown';
  console.log('[Extension] 메시지 수신:', messageType);
  
  // 디버깅: 전체 메시지 로그 (개발 모드)
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Extension] 전체 메시지:', JSON.stringify(data, null, 2));
  }
  
  switch (messageType) {
    case 'ping':
      // 연결 확인
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
      
    case 'register':
      // Extension 등록 (Background Script)
      console.log('[Extension] 등록:', data.extensionId || 'unknown');
      ws.extensionId = data.extensionId;
      ws.send(JSON.stringify({
        type: 'registered',
        success: true,
        message: 'Extension registered'
      }));
      break;
      
    case 'popup_opened':
      // 팝업이 열렸다는 알림
      console.log('[Extension] 팝업 열림:', {
        tcId: data.tcId,
        projectId: data.projectId,
        sessionId: data.sessionId
      });
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('extension-popup-opened', data);
      }
      break;
      
    case 'recording_status':
      // 녹화 상태 업데이트
      console.log('[Extension] 녹화 상태:', data.status);
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('extension-recording-status', data);
      }
      break;
      
    case 'ERROR':
    case 'error':
      // 에러 메시지 처리
      console.error('[Extension] 에러 메시지:', data.message || data.error || 'Unknown error');
      if (data.details) {
        console.error('[Extension] 에러 상세:', data.details);
      }
      break;
      
    default:
      console.warn('[Extension] 알 수 없는 메시지 타입:', messageType);
      console.warn('[Extension] 전체 메시지:', JSON.stringify(data, null, 2));
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Unknown message type',
        receivedType: messageType
      }));
  }
}

/**
 * Extension에 메시지 브로드캐스트
 * @param {Object} message - 전송할 메시지
 */
function broadcastToExtensions(message) {
  const messageStr = JSON.stringify(message);
  let sentCount = 0;
  
  extensionClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(messageStr);
        sentCount++;
      } catch (error) {
        console.error('❌ Extension 메시지 전송 실패:', error);
        extensionClients.delete(ws);
      }
    }
  });
  
  if (sentCount > 0) {
    console.log(`📤 Extension에 메시지 브로드캐스트: ${sentCount}개 클라이언트`);
  }
}

/**
 * 녹화 데이터를 TC와 스크립트에 반영
 */
async function processRecordingData(recordingData) {
  const { type, tcId, projectId, events, code } = recordingData;

  if (type !== 'recording_complete') {
    throw new Error('지원하지 않는 녹화 데이터 타입입니다');
  }

  if (!tcId || !events || !Array.isArray(events)) {
    throw new Error('필수 데이터가 누락되었습니다 (tcId, events)');
  }

  // 1. 이벤트를 TC 스텝으로 변환 (키워드 형식)
  const steps = events.map((event, index) => {
    // 디버깅: 이벤트 구조 로그
    if (index === 0) {
      console.log('[Recording] 첫 번째 이벤트 구조:', JSON.stringify(event, null, 2));
    }
    
    // 키워드 형식으로 변환: { action, target, value, description }
    // event.type이 없을 경우 이벤트 구조에서 추론 시도
    let action = event.type;
    if (!action) {
      // 이벤트 구조에서 타입 추론
      if (event.action) action = event.action;
      else if (event.eventType) action = event.eventType;
      else if (event.name) action = event.name;
      else {
        console.warn(`[Recording] 이벤트 ${index}에 type이 없습니다:`, event);
        action = 'unknown';
      }
    }
    
    const step = {
      action: action, // 'click', 'type', 'navigate', 'wait', 'assert' 등
      target: null,
      value: event.value || null,
      description: null
    };

    // Target 추출 및 정규화
    if (event.target) {
      const selectors = event.target.selectors || {};
      
      // Selector 우선순위: id > css > xpath > text > name
      let targetSelector = null;
      
      // 1. selectors 객체에서 추출
      if (selectors.id) {
        targetSelector = `#${selectors.id.replace(/^#/, '')}`;
      } else if (selectors.css) {
        targetSelector = selectors.css;
      } else if (selectors.xpath) {
        targetSelector = selectors.xpath;
      } else if (selectors.text) {
        targetSelector = `text:"${selectors.text}"`;
      } else if (selectors.name) {
        targetSelector = `[name="${selectors.name}"]`;
      } else if (selectors.dataTestId) {
        targetSelector = `[data-testid="${selectors.dataTestId}"]`;
      }
      
      // 2. target 객체에서 직접 추출
      if (!targetSelector) {
        if (event.target.id) {
          targetSelector = `#${event.target.id}`;
        } else if (event.target.className) {
          const classes = event.target.className.split(/\s+/).filter(c => c).join('.');
          if (classes) {
            targetSelector = `.${classes}`;
          }
        } else if (event.target.tagName) {
          targetSelector = event.target.tagName.toLowerCase();
        } else if (event.target.text) {
          targetSelector = `text:"${event.target.text}"`;
        } else if (event.target.selector) {
          targetSelector = event.target.selector;
        } else if (event.target.xpath) {
          targetSelector = event.target.xpath;
        }
      }
      
      step.target = targetSelector;
      
      // Description 생성 (디버깅용)
      const targetInfo = [];
      if (event.target.tagName) targetInfo.push(`tag:${event.target.tagName}`);
      if (event.target.id) targetInfo.push(`id:${event.target.id}`);
      if (event.target.text) targetInfo.push(`text:"${event.target.text.substring(0, 50)}"`);
      if (event.target.className) targetInfo.push(`class:${event.target.className}`);
      if (targetInfo.length > 0) {
        step.description = targetInfo.join(', ');
      }
      
      // target이 여전히 null이면 경고 및 상세 디버깅
      if (!step.target) {
        console.warn(`[Recording] ⚠️ 이벤트 ${index} (${step.action})의 target을 추출할 수 없습니다.`);
        console.warn(`[Recording] 이벤트 전체 구조:`, JSON.stringify(event, null, 2));
        console.warn(`[Recording] target 객체:`, event.target);
        console.warn(`[Recording] selectors 객체:`, selectors);
      }
    } else if (event.selector) {
      // target이 없지만 selector가 직접 있는 경우
      step.target = event.selector;
      console.log(`[Recording] selector에서 target 추출: ${step.target}`);
    } else if (event.xpath) {
      // xpath가 직접 있는 경우
      step.target = event.xpath;
      console.log(`[Recording] xpath에서 target 추출: ${step.target}`);
    } else if (action === 'navigate') {
      // navigate의 경우 target이 없을 수 있음 (value가 URL)
      step.target = event.value || event.url || null;
    } else if (event.selector) {
      // target이 없지만 selector가 직접 있는 경우
      step.target = event.selector;
    } else if (event.xpath) {
      // xpath가 직접 있는 경우
      step.target = event.xpath;
    }

    // navigate 이벤트의 경우 target을 URL로 설정
    if (event.type === 'navigate' && event.value) {
      step.target = event.value;
      step.value = null;
    }

    // wait 이벤트의 경우 조건 추가
    if (event.type === 'wait') {
      step.condition = event.condition || 'visible';
      step.timeout = event.timeout || 5000;
      if (!step.target && event.target) {
        // wait의 경우 target이 selector여야 함
        const selectors = event.target.selectors || {};
        step.target = selectors.css || selectors.xpath || selectors.id || null;
      }
    }

    // assert 이벤트의 경우 검증 정보 추가
    if (event.type === 'assert') {
      step.assertion = event.assertion || 'text';
      step.expected = event.expected || null;
      if (!step.target && event.target) {
        const selectors = event.target.selectors || {};
        step.target = selectors.css || selectors.xpath || selectors.id || null;
      }
    }

    // URL 정보는 description에 추가 (선택사항)
    if (event.url && event.url !== step.target) {
      if (step.description) {
        step.description += ` | url:${event.url}`;
      } else {
        step.description = `url:${event.url}`;
      }
    }

    return step;
  });

  // 디버깅: 변환된 steps 확인
  console.log('[Recording] 변환된 Steps (총 ' + steps.length + '개):');
  steps.forEach((step, index) => {
    console.log(`  ${index + 1}. action: ${step.action}, target: ${step.target || '(없음)'}, value: ${step.value || '(없음)'}`);
    if (!step.action || !step.target) {
      console.warn(`    ⚠️ Step ${index + 1}에 필수 필드가 누락되었습니다!`);
    }
  });

  // 2. TC 업데이트 (steps 저장)
  const tcUpdateData = {
    steps: JSON.stringify(steps)
  };

  const tcUpdateResult = DbService.run(
    'UPDATE test_cases SET steps = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [tcUpdateData.steps, tcId]
  );

  if (!tcUpdateResult) {
    throw new Error('TC 업데이트 실패');
  }
  
  // 저장된 데이터 확인
  const savedTC = DbService.get('SELECT steps FROM test_cases WHERE id = ?', [tcId]);
  if (savedTC && savedTC.steps) {
    try {
      const savedSteps = JSON.parse(savedTC.steps);
      console.log('[Recording] ✅ 저장된 Steps 확인 (총 ' + savedSteps.length + '개):');
      savedSteps.forEach((step, index) => {
        const hasAction = !!step.action;
        const hasTarget = !!step.target;
        const status = (hasAction && hasTarget) ? '✅' : '⚠️';
        console.log(`  ${status} ${index + 1}. action: ${step.action || '(없음)'}, target: ${step.target || '(없음)'}`);
      });
    } catch (e) {
      console.error('[Recording] 저장된 Steps 파싱 오류:', e.message);
    }
  }

  // 3. 코드가 있으면 스크립트 생성/업데이트
  let scriptResults = {};
  if (code) {
    for (const [language, codeData] of Object.entries(code)) {
      if (!codeData || !codeData.code) continue;

      const framework = codeData.framework || 'playwright';
      const scriptCode = codeData.code;

      // 기존 스크립트 확인
      const existingScript = DbService.get(
        'SELECT * FROM test_scripts WHERE test_case_id = ? AND language = ? AND framework = ? AND status = ?',
        [tcId, language, framework, 'active']
      );

      if (existingScript) {
        // 기존 스크립트 업데이트
        DbService.run(
          'UPDATE test_scripts SET code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [scriptCode, existingScript.id]
        );
        scriptResults[language] = { id: existingScript.id, action: 'updated' };
      } else {
        // 새 스크립트 생성
        const scriptName = `Generated ${language} script`;
        const result = DbService.run(
          `INSERT INTO test_scripts (test_case_id, name, framework, language, code, file_path, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [tcId, scriptName, framework, language, scriptCode, null, 'active']
        );
        scriptResults[language] = { id: result.lastID, action: 'created' };
      }
    }
  }

  return {
    tcId: tcId,
    scriptIds: scriptResults
  };
}

/**
 * 메인 윈도우 생성
 * Electron BrowserWindow를 생성하고 렌더러 프로세스를 로드
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: config.window.width,
    height: config.window.height,
    minWidth: config.window.minWidth,
    minHeight: config.window.minHeight,
    title: config.window.title,
    webPreferences: {
      nodeIntegration: false, // 보안: Node.js API 직접 접근 차단
      contextIsolation: true, // 보안: 컨텍스트 격리 활성화
      preload: config.paths.preload, // Preload 스크립트 경로
      webviewTag: true // WebView 태그 활성화 (Recorder 탭에서 사용)
    }
  });

  // 렌더러 HTML 파일 로드
  mainWindow.loadFile(config.paths.renderer);

  // 개발 모드에서 DevTools 자동 열기
  if (config.dev.enabled && config.dev.autoOpenDevTools) {
    mainWindow.webContents.openDevTools();
  }
}

/**
 * 애플리케이션 초기화
 * Electron 앱이 준비되면 윈도우 생성
 */
app.whenReady().then(async () => {
  // 메뉴 바 표시 (기본 Electron 메뉴)
  // Menu.setApplicationMenu(null); // 주석 처리하여 메뉴 표시
  
  // 프로덕션 모드 경로 초기화 (createWindow 전에 실행)
  config.initializePaths(app);
  // 스크립트 디렉토리 초기화
  ScriptManager.initializeScriptsDirectory();

  // 데이터베이스 초기화
  // config.database.mode에 따라 로컬 또는 서버 모드로 동작
  const dbMode = config.database.mode || 'local';
  
  if (dbMode === 'local') {
    // 로컬 SQLite 모드 (현재 기본 모드)
    // sql.js는 비동기 초기화가 필요함
    DbService.init().then(() => {
      const dbConfig = DbService.getConfig();
      if (dbConfig && dbConfig.connected) {
        console.log('✅ 로컬 SQLite 데이터베이스 연결 완료');
        console.log(`📁 데이터베이스 위치: ${dbConfig.path}`);
        console.log(`🔧 DB 모드: 로컬 (SQLite)`);
      } else {
        console.warn('⚠️ 데이터베이스 초기화는 완료되었지만 연결 상태를 확인할 수 없습니다.');
      }
    }).catch((error) => {
      console.error('❌ 데이터베이스 연결 실패:', error.message);
      console.error('💡 데이터베이스 파일 생성에 실패했습니다.');
      console.error('💡 상세 오류:', error);
      // 초기화 실패해도 앱은 계속 실행
    });
  } else if (dbMode === 'server') {
    // 서버 모드 (추후 구현)
    console.log('🔧 DB 모드: 서버');
    console.log(`📡 서버 URL: ${config.database.server.url}`);
    console.warn('⚠️ 서버 모드는 아직 구현되지 않았습니다. 로컬 모드를 사용합니다.');
    console.warn('⚠️ config.database.mode를 "local"로 변경하거나 서버 모드를 구현해주세요.');
    // TODO: 서버 모드 구현 시 ApiService를 통해 서버에 연결
  } else {
    console.error(`❌ 알 수 없는 DB 모드: ${dbMode}`);
    console.error('💡 config.database.mode는 "local" 또는 "server"여야 합니다.');
  }

  // 메인 윈도우 생성
  createWindow();

  // 녹화 데이터 수신용 HTTP 서버 시작
  startRecordingServer();

  // DevTools 단축키 등록 (F12 또는 Ctrl+Shift+I)
  // 윈도우가 생성된 후에 등록해야 함
  setTimeout(() => {
    try {
      const ret1 = globalShortcut.register('F12', () => {
        if (mainWindow) {
          mainWindow.webContents.toggleDevTools();
        }
      });
      const ret2 = globalShortcut.register('CommandOrControl+Shift+I', () => {
        if (mainWindow) {
          mainWindow.webContents.toggleDevTools();
        }
      });
      if (ret1 && ret2) {
        console.log('✅ DevTools 단축키 등록 완료 (F12, Ctrl+Shift+I)');
      } else {
        console.warn('⚠️ DevTools 단축키 등록 실패');
      }
    } catch (error) {
      console.error('❌ DevTools 단축키 등록 오류:', error);
    }
  }, 500);

  // macOS에서 독 아이콘 클릭 시 윈도우 재생성
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 앱 종료 시 데이터베이스 연결 종료 및 정리
app.on('before-quit', () => {
  // 전역 단축키 해제
  globalShortcut.unregisterAll();
  
  // 녹화 서버 종료
    if (recordingServer) {
      // WebSocket 서버 종료
      if (recordingWebSocketServer) {
        extensionClients.forEach((ws) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        });
        extensionClients.clear();
        recordingWebSocketServer.close(() => {
          console.log('✅ Extension WebSocket 서버 종료');
        });
        recordingWebSocketServer = null;
      }
      
      recordingServer.close(() => {
        console.log('✅ 녹화 서버 종료');
      });
      recordingServer = null;
    }
  
  try {
    // 실행 결과 정리 (최근 100개만 보관)
    DbService.cleanupOldResults(100);
    DbService.close();
  } catch (error) {
    console.error('데이터베이스 연결 종료 실패:', error);
  }
});

/**
 * 모든 윈도우가 닫혔을 때 처리
 * macOS를 제외한 플랫폼에서는 앱 종료
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============================================================================
// IPC 핸들러 등록
// ============================================================================

/**
 * DevTools 토글 IPC 핸들러
 * 렌더러 프로세스에서 DevTools 열기/닫기 요청 처리
 */
ipcMain.handle('toggle-devtools', () => {
  if (mainWindow) {
    mainWindow.webContents.toggleDevTools();
    return { success: true };
  }
  return { success: false, error: 'Main window not found' };
});

/**
 * Pytest 테스트 실행 IPC 핸들러
 * 렌더러 프로세스에서 pytest 테스트 실행 요청 처리
 * 
 * @event ipcMain.handle:run-python-script
 * @param {Electron.IpcMainInvokeEvent} event - IPC 이벤트 객체
 * @param {string} testFile - 실행할 테스트 파일명
 * @param {string[]} args - pytest에 전달할 추가 인자 배열
 * @returns {Promise<Object>} 실행 결과 객체
 * 
 * @example
 * // 렌더러에서 호출
 * const result = await window.electronAPI.runPythonScript('test_example.py', ['-k', 'test_login']);
 */
ipcMain.handle('run-python-script', async (event, testFile, args = [], options = {}) => {
  try {
    const result = await PytestService.runTests(testFile, args, options);
    return result;
  } catch (error) {
    // 에러를 일관된 형식으로 반환
    return {
      success: false,
      error: error.error || error.message || '알 수 없는 오류가 발생했습니다.',
      stderr: error.stderr || '',
      stdout: error.stdout || ''
    };
  }
});

/**
 * 여러 스크립트를 임시 파일로 생성하여 실행
 * DB에서 코드를 가져와 임시 파일 생성 → 실행 → 삭제
 */
ipcMain.handle('run-python-scripts', async (event, scripts, args = [], options = {}) => {
  const fs = require('fs').promises;
  const path = require('path');
  const tempDir = path.join(config.paths.scripts, 'temp');
  const pageObjectsDir = path.join(tempDir, 'page_objects');
  
  try {
    // 1. 임시 디렉토리 생성
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(pageObjectsDir, { recursive: true });
    
    // 2. 사용된 Page Object 수집 및 파일 생성
    const usedPageObjects = new Set();
    const pageObjectCodes = {};
    
    // 스크립트 코드에서 import 문 분석하여 Page Object 찾기
    for (const script of scripts) {
      const importMatches = script.code.match(/from\s+page_objects\.(\w+)\s+import\s+(\w+)/g);
      if (importMatches) {
        importMatches.forEach(match => {
          const poName = match.match(/page_objects\.(\w+)/)[1];
          usedPageObjects.add(poName);
        });
      }
    }
    
    // DB에서 Page Object 코드 조회 및 파일 생성
    if (usedPageObjects.size > 0 && scripts.length > 0) {
      // 프로젝트 ID 가져오기 (첫 번째 스크립트의 TC에서)
      const firstScript = scripts[0];
      const tc = DbService.get('SELECT project_id FROM test_cases WHERE id = ?', [firstScript.tcId]);
      
      if (tc) {
        for (const poName of usedPageObjects) {
          const po = DbService.get(
            'SELECT * FROM page_objects WHERE name = ? AND project_id = ?',
            [poName, tc.project_id]
          );
          
          if (po) {
            pageObjectCodes[poName] = po.code;
            const fileName = `${poName.toLowerCase()}.py`;
            await fs.writeFile(
              path.join(pageObjectsDir, fileName),
              po.code,
              'utf-8'
            );
          }
        }
      }
    }
    
    // 3. __init__.py 생성
    await fs.writeFile(
      path.join(pageObjectsDir, '__init__.py'),
      '',
      'utf-8'
    );
    
    // 3-1. conftest.py 복사 (pytest 설정 및 fixture를 위해 필요)
    const isPackaged = app.isPackaged;
    const scriptsDir = config.paths.scripts;
    const conftestPath = path.join(scriptsDir, 'conftest.py');
    const conftestDestPath = path.join(tempDir, 'conftest.py');
    
    try {
      // 파일 존재 여부 확인
      await fs.access(conftestPath);
      // 파일 읽기 및 쓰기 (한글 경로 문제 방지)
      const conftestContent = await fs.readFile(conftestPath, 'utf-8');
      await fs.writeFile(conftestDestPath, conftestContent, 'utf-8');
      console.log('[INFO] conftest.py copied successfully');
    } catch (error) {
      if (error.code === 'ENOENT') {
        // 여러 경로 시도 (개발/프로덕션 모드 모두 고려)
        const altPaths = [
          path.join(scriptsDir, 'conftest.py'),  // config.paths.scripts 사용
          isPackaged 
            ? path.join(app.getAppPath(), 'scripts', 'conftest.py')  // 프로덕션
            : path.join(process.cwd(), 'scripts', 'conftest.py'),   // 개발
          path.join(__dirname, '..', '..', 'scripts', 'conftest.py') // 상대 경로
        ];
        
        let found = false;
        for (const altPath of altPaths) {
          try {
            await fs.access(altPath);
            const conftestContent = await fs.readFile(altPath, 'utf-8');
            await fs.writeFile(conftestDestPath, conftestContent, 'utf-8');
            console.log(`[INFO] conftest.py copied from: ${altPath}`);
            found = true;
            break;
          } catch (e) {
            // 다음 경로 시도
          }
        }
        
        if (!found) {
          console.warn(`[WARN] conftest.py not found. Tried: ${altPaths.map(p => path.resolve(p)).join(', ')}`);
          console.warn('[WARN] Continuing without conftest.py (fixtures may not work)');
        }
      } else {
        console.warn(`[WARN] Failed to copy conftest.py: ${error.code || error.message}`);
      }
      // conftest.py가 없어도 계속 진행
    }
    
    // 4. TC 스크립트 파일 생성
    const testFiles = [];
    for (const script of scripts) {
      const extension = script.language === 'python' ? 'py' : 
                       script.language === 'typescript' ? 'ts' : 'js';
      const sanitizedName = script.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const filename = `test_tc${script.tcId}_${sanitizedName}.${extension}`;
      const filePath = path.join(tempDir, filename);
      
      await fs.writeFile(filePath, script.code, 'utf-8');
      testFiles.push(filename);
    }
    
    // 5. pytest 실행 (temp 디렉토리에서)
    // 파일명만 전달 (상대 경로)
    const result = await PytestService.runTests(testFiles, args, {
      ...options,
      cwd: tempDir  // 임시 디렉토리에서 실행
    });
    
    // 6. 임시 파일 삭제
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn('임시 파일 삭제 실패:', cleanupError);
    }
    
    return result;
  } catch (error) {
    // 에러 발생 시에도 임시 파일 삭제 시도
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn('임시 파일 삭제 실패:', cleanupError);
    }
    
    return {
      success: false,
      error: error.error || error.message || '알 수 없는 오류가 발생했습니다.',
      stderr: error.stderr || '',
      stdout: error.stdout || ''
    };
  }
});

/**
 * 테스트 스크립트 목록 조회 IPC 핸들러
 * 사용 가능한 모든 테스트 스크립트 목록 반환
 * 
 * @event ipcMain.handle:get-test-scripts
 * @param {Electron.IpcMainInvokeEvent} event - IPC 이벤트 객체
 * @returns {Promise<string[]>} 스크립트 파일명 배열
 * 
 * @example
 * // 렌더러에서 호출
 * const scripts = await window.electronAPI.getTestScripts();
 */
ipcMain.handle('get-test-scripts', async (event) => {
  try {
    const scripts = await ScriptManager.getAvailableScripts();
    return scripts;
  } catch (error) {
    console.error('스크립트 목록 조회 실패:', error);
    return [];
  }
});

/**
 * 환경 검사 IPC 핸들러
 * Python, pytest 등 필수 환경이 준비되어 있는지 확인
 * 
 * @event ipcMain.handle:check-environment
 * @param {Electron.IpcMainInvokeEvent} event - IPC 이벤트 객체
 * @returns {Promise<Object>} 환경 검사 결과
 * 
 * @example
 * // 렌더러에서 호출
 * const envCheck = await window.electronAPI.checkEnvironment();
 * if (!envCheck.allReady) {
 *   console.log('설치 필요:', envCheck.missingItems);
 * }
 */
ipcMain.handle('check-environment', async (event) => {
  try {
    const result = await EnvironmentChecker.checkEnvironment();
    const installGuide = EnvironmentChecker.generateInstallGuide(result);
    return {
      ...result,
      installGuide
    };
  } catch (error) {
    console.error('환경 검사 실패:', error);
    return {
      pythonInstalled: false,
      pytestInstalled: false,
      jsonReportInstalled: false,
      allReady: false,
      missingItems: ['환경 검사 실패'],
      installGuide: '환경 검사를 수행할 수 없습니다.'
    };
  }
});

// ============================================================================
// 확장 포인트
// ============================================================================

/**
 * Recorder 기능 IPC 핸들러
 */

// 녹화된 이벤트 저장소
let recordedEvents = [];

/**
 * 녹화 시작 IPC 핸들러
 * @event ipcMain.handle:start-recording
 */
ipcMain.handle('start-recording', async (event, options) => {
  try {
    recordedEvents = []; // 이벤트 초기화
    console.log('녹화 시작:', options);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 녹화 중지 IPC 핸들러
 * @event ipcMain.handle:stop-recording
 */
ipcMain.handle('stop-recording', async (event) => {
  try {
    const events = [...recordedEvents];
    recordedEvents = []; // 이벤트 초기화
    console.log('녹화 중지, 이벤트 수:', events.length);
    return { success: true, events };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 이벤트 캡처 IPC 핸들러
 * @event ipcMain.handle:capture-event
 */
ipcMain.handle('capture-event', async (event, eventData) => {
  try {
    recordedEvents.push({
      ...eventData,
      timestamp: Date.now()
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 브라우저 열기 IPC 핸들러
 * @event ipcMain.handle:open-browser
 */
const { shell } = require('electron');
ipcMain.handle('open-browser', async (event, options) => {
  try {
    const browser = options.browser || 'chrome';
    const tcId = options.tcId;
    const projectId = options.projectId;
    const sessionId = options.sessionId || `session-${Date.now()}`;
    
    if (!tcId || !projectId) {
      return { success: false, error: 'tcId와 projectId가 필요합니다' };
    }

    // 녹화 서버가 실행 중인지 확인
    if (!recordingServer) {
      startRecordingServer();
      // 서버 시작 대기
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 확장프로그램과 통신하기 위한 URL 생성
    const recordingUrl = `http://localhost:3000/record?tcId=${tcId}&projectId=${projectId}&sessionId=${sessionId}`;
    
    // 확장 프로그램 ID
    const EXTENSION_ID = 'hemlilhhjhpkpgeonbmaknbffgapneam';
    
    // Chrome 경로 및 확장 프로그램 경로 찾기
    let chromePath;
    let extensionPath;
    const platform = process.platform;
    
    if (platform === 'win32') {
      // Windows Chrome 경로 찾기
      const possibleChromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
      ];
      
      for (const possiblePath of possibleChromePaths) {
        if (fs.existsSync(possiblePath)) {
          chromePath = possiblePath;
          break;
        }
      }
      
      // 확장 프로그램 경로 찾기
      const extensionBasePath = path.join(
        os.homedir(),
        'AppData\\Local\\Google\\Chrome\\User Data\\Default\\Extensions',
        EXTENSION_ID
      );
      
      console.log('🔍 확장 프로그램 경로 확인:', extensionBasePath);
      console.log('🔍 경로 존재 여부:', fs.existsSync(extensionBasePath));
      
      if (fs.existsSync(extensionBasePath)) {
        // 최신 버전 폴더 찾기
        try {
          const items = fs.readdirSync(extensionBasePath);
          console.log('🔍 확장 프로그램 폴더 내용:', items);
          
          const versions = items
            .filter(item => {
              const itemPath = path.join(extensionBasePath, item);
              const isDir = fs.statSync(itemPath).isDirectory();
              console.log(`🔍 항목 확인: ${item}, 디렉토리: ${isDir}`);
              return isDir;
            })
            .sort((a, b) => {
              // 버전 번호로 정렬 (간단한 버전 비교)
              return b.localeCompare(a, undefined, { numeric: true });
            });
          
          console.log('🔍 찾은 버전:', versions);
          
          if (versions.length > 0) {
            extensionPath = path.join(extensionBasePath, versions[0]);
            console.log('✅ 확장 프로그램 경로:', extensionPath);
          } else {
            console.warn('⚠️ 확장 프로그램 버전 폴더를 찾을 수 없습니다');
          }
        } catch (error) {
          console.error('❌ 확장 프로그램 버전 폴더 읽기 실패:', error);
          console.error('❌ 오류 상세:', error.message);
        }
      } else {
        console.warn('⚠️ 확장 프로그램 기본 경로가 존재하지 않습니다:', extensionBasePath);
        
        // 대체 경로 시도 (Profile 1 등)
        const alternativePaths = [
          path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\User Data\\Profile 1\\Extensions', EXTENSION_ID),
          path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\User Data\\Extensions', EXTENSION_ID)
        ];
        
        for (const altPath of alternativePaths) {
          console.log('🔍 대체 경로 확인:', altPath);
          if (fs.existsSync(altPath)) {
            console.log('✅ 대체 경로에서 확장 프로그램 발견:', altPath);
            try {
              const items = fs.readdirSync(altPath);
              const versions = items
                .filter(item => {
                  const itemPath = path.join(altPath, item);
                  return fs.statSync(itemPath).isDirectory();
                })
                .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
              
              if (versions.length > 0) {
                extensionPath = path.join(altPath, versions[0]);
                console.log('✅ 확장 프로그램 경로 (대체):', extensionPath);
                break;
              }
            } catch (error) {
              console.warn('대체 경로 읽기 실패:', error);
            }
          }
        }
      }
    } else if (platform === 'darwin') {
      // macOS
      chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      const extensionBasePath = path.join(
        os.homedir(),
        'Library/Application Support/Google/Chrome/Default/Extensions',
        EXTENSION_ID
      );
      
      if (fs.existsSync(extensionBasePath)) {
        try {
          const versions = fs.readdirSync(extensionBasePath)
            .filter(item => {
              const itemPath = path.join(extensionBasePath, item);
              return fs.statSync(itemPath).isDirectory();
            })
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
          
          if (versions.length > 0) {
            extensionPath = path.join(extensionBasePath, versions[0]);
          }
        } catch (error) {
          console.warn('확장 프로그램 버전 폴더 읽기 실패:', error);
        }
      }
    } else {
      // Linux
      chromePath = 'google-chrome';
      const extensionBasePath = path.join(
        os.homedir(),
        '.config/google-chrome/Default/Extensions',
        EXTENSION_ID
      );
      
      if (fs.existsSync(extensionBasePath)) {
        try {
          const versions = fs.readdirSync(extensionBasePath)
            .filter(item => {
              const itemPath = path.join(extensionBasePath, item);
              return fs.statSync(itemPath).isDirectory();
            })
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
          
          if (versions.length > 0) {
            extensionPath = path.join(extensionBasePath, versions[0]);
          }
        } catch (error) {
          console.warn('확장 프로그램 버전 폴더 읽기 실패:', error);
        }
      }
    }
    
    // Chrome 실행
    if (chromePath && fs.existsSync(chromePath)) {
      const chromeArgs = [
        recordingUrl,
        '--new-window'
      ];
      
      // 기존 사용자 데이터 디렉토리 사용 (기존 확장 프로그램 접근 가능)
      let userDataPath;
      if (platform === 'win32') {
        userDataPath = path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\User Data');
      } else if (platform === 'darwin') {
        userDataPath = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');
      } else {
        userDataPath = path.join(os.homedir(), '.config/google-chrome');
      }
      
      // 기존 사용자 데이터 디렉토리가 있으면 사용
      if (fs.existsSync(userDataPath)) {
        chromeArgs.push(`--user-data-dir=${userDataPath}`);
        chromeArgs.push('--profile-directory=Default');
        console.log('✅ 기존 Chrome 프로필 사용:', userDataPath);
        
        // 확장 프로그램이 이미 설치되어 있는지 확인
        const extensionBasePath = path.join(
          userDataPath,
          platform === 'win32' ? 'Default\\Extensions' : 'Default/Extensions',
          EXTENSION_ID
        );
        
        if (fs.existsSync(extensionBasePath)) {
          // 이미 설치된 확장 프로그램이므로 --load-extension 불필요
          // 기존 프로필에서 자동으로 로드됨
          console.log('✅ 기존에 설치된 확장 프로그램이 자동으로 로드됩니다');
        } else {
          // 확장 프로그램이 없을 때만 --load-extension 사용
          if (extensionPath && fs.existsSync(extensionPath)) {
            chromeArgs.push(`--load-extension=${extensionPath}`);
            console.log('✅ 확장 프로그램 로드:', extensionPath);
          } else {
            console.warn('⚠️ 확장 프로그램을 찾을 수 없습니다:', EXTENSION_ID);
          }
        }
      } else {
        // 사용자 데이터 디렉토리가 없으면 기본 프로필 사용 (--user-data-dir 없이)
        console.log('⚠️ Chrome 사용자 데이터 디렉토리를 찾을 수 없습니다. 기본 프로필 사용');
        
        // 확장 프로그램이 없을 때만 --load-extension 사용
        if (extensionPath && fs.existsSync(extensionPath)) {
          chromeArgs.push(`--load-extension=${extensionPath}`);
          console.log('✅ 확장 프로그램 로드:', extensionPath);
        }
      }
      
      spawn(chromePath, chromeArgs, {
        detached: true,
        stdio: 'ignore'
      });
      
      console.log('🌐 Chrome 실행:', { 
        chromePath, 
        extensionPath: extensionPath || '없음',
        recordingUrl, 
        sessionId 
      });
      
      return { 
        success: true, 
        url: recordingUrl, 
        sessionId, 
        method: 'direct',
        extensionLoaded: !!extensionPath
      };
    } else {
      // Chrome을 찾을 수 없으면 기본 브라우저로 폴백
      console.warn('⚠️ Chrome을 찾을 수 없습니다. 기본 브라우저로 열립니다.');
      await shell.openExternal(recordingUrl);
      return { 
        success: true, 
        url: recordingUrl, 
        sessionId, 
        method: 'fallback' 
      };
    }
  } catch (error) {
    console.error('❌ 브라우저 열기 오류:', error);
    return { success: false, error: error.message };
  }
});

/**
 * 확장프로그램으로부터 녹화 데이터 수신 IPC 핸들러
 * @event ipcMain.on:recording-data
 */
ipcMain.on('recording-data', (event, data) => {
  // 모든 렌더러 프로세스에 브로드캐스트
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('recording-data', data);
  }
});

/**
 * 프로젝트 관리 IPC 핸들러 (로컬 MySQL 직접 연결)
 */

ipcMain.handle('api-get-projects', async (event) => {
  try {
    const projects = DbService.all('SELECT * FROM projects ORDER BY updated_at DESC');
    return { success: true, data: projects };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-get-project', async (event, id) => {
  try {
    const project = DbService.get('SELECT * FROM projects WHERE id = ?', [id]);
    if (!project) {
      return { success: false, error: '프로젝트를 찾을 수 없습니다' };
    }
    return { success: true, data: project };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-create-project', async (event, data) => {
  try {
    const { name, description, created_by } = data;
    if (!name) {
      return { success: false, error: '프로젝트 이름은 필수입니다' };
    }
    const result = DbService.run(
      'INSERT INTO projects (name, description, created_by) VALUES (?, ?, ?)',
      [name, description || null, created_by || null]
    );
    const newProject = DbService.get('SELECT * FROM projects WHERE id = ?', [result.lastID]);
    return { success: true, data: newProject };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-update-project', async (event, id, data) => {
  try {
    const { name, description } = data;
    DbService.run(
      'UPDATE projects SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, description || null, id]
    );
    const updatedProject = DbService.get('SELECT * FROM projects WHERE id = ?', [id]);
    return { success: true, data: updatedProject };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-delete-project', async (event, id) => {
  try {
    DbService.run('DELETE FROM projects WHERE id = ?', [id]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 테스트케이스 관리 IPC 핸들러 (로컬 MySQL 직접 연결)
 */

// TC 트리 구조 생성 헬퍼 함수
function buildTree(items, parentId = null, scriptsMap = {}) {
  const parentIdValue = parentId === null ? null : parentId;
  
  return items
    .filter(item => {
      if (parentIdValue === null) {
        return item.parent_id === null;
      }
      return item.parent_id === parentIdValue;
    })
    .map(item => {
      const node = {
        id: item.id,
        name: item.name,
        description: item.description,
        type: item.type,
        status: item.status,
        hasScript: scriptsMap[item.id] || false,
        order_index: item.order_index,
        tc_number: item.tc_number || null, // 프로젝트별 TC 번호
        created_at: item.created_at,
        updated_at: item.updated_at
      };

      if (item.type === 'test_case') {
        // JSON 필드 파싱
        try {
          node.steps = item.steps ? JSON.parse(item.steps) : [];
        } catch (e) {
          node.steps = [];
        }
        try {
          node.tags = item.tags ? JSON.parse(item.tags) : [];
        } catch (e) {
          node.tags = [];
        }
      }

      // tc_number가 없으면 id를 사용 (기존 데이터 호환성)
      if (!node.tc_number && node.type === 'test_case') {
        node.tc_number = node.id;
      }

      // 자식 노드 추가
      const children = buildTree(items, item.id, scriptsMap);
      if (children.length > 0) {
        node.children = children;
      }

      return node;
    })
    .sort((a, b) => {
      // tc_number로 정렬 (없으면 order_index, 그 다음 id)
      if (a.tc_number && b.tc_number) {
        return a.tc_number - b.tc_number;
      }
      if (a.tc_number) return -1;
      if (b.tc_number) return 1;
      if (a.order_index !== b.order_index) {
        return a.order_index - b.order_index;
      }
      return a.id - b.id;
    });
}

ipcMain.handle('api-get-tc-tree', async (event, projectId) => {
  try {
    // 프로젝트의 모든 TC 조회
    const testCases = DbService.all(
      'SELECT * FROM test_cases WHERE project_id = ? ORDER BY parent_id, order_index, name',
      [projectId]
    );

    // 스크립트 존재 여부 확인
    const testCaseIds = testCases.map(tc => tc.id);
    let scriptsMap = {};
    if (testCaseIds.length > 0) {
      const placeholders = testCaseIds.map(() => '?').join(',');
      const scripts = DbService.all(
        `SELECT DISTINCT test_case_id FROM test_scripts WHERE test_case_id IN (${placeholders}) AND status = 'active'`,
        testCaseIds
      );
      scripts.forEach(s => {
        scriptsMap[s.test_case_id] = true;
      });
    }

    // 트리 구조로 변환
    const tree = buildTree(testCases, null, scriptsMap);
    return { success: true, data: tree };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-get-test-cases', async (event, params = {}) => {
  try {
    let query = 'SELECT * FROM test_cases WHERE 1=1';
    const queryParams = [];
    
    if (params.project_id) {
      query += ' AND project_id = ?';
      queryParams.push(params.project_id);
    }
    if (params.parent_id !== undefined) {
      query += ' AND parent_id = ?';
      queryParams.push(params.parent_id);
    }
    
    query += ' ORDER BY order_index, id';
    const testCases = DbService.all(query, queryParams);
    return { success: true, data: testCases };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-get-test-case', async (event, id) => {
  try {
    const testCase = DbService.get('SELECT * FROM test_cases WHERE id = ?', [id]);
    if (!testCase) {
      return { success: false, error: '테스트케이스를 찾을 수 없습니다' };
    }
    return { success: true, data: testCase };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-create-test-case', async (event, data) => {
  try {
    const { project_id, parent_id, name, description, type, steps, tags, status, order_index } = data;
    if (!project_id || !name) {
      return { success: false, error: '프로젝트 ID와 이름은 필수입니다' };
    }
    
    // 부모 검증: 폴더는 폴더나 null만 부모로 가질 수 있고, 테스트케이스는 폴더나 null만 부모로 가질 수 있음
    let validatedParentId = null;
    if (parent_id) {
      const parent = DbService.get('SELECT type FROM test_cases WHERE id = ?', [parent_id]);
      if (!parent) {
        return { success: false, error: '부모 항목을 찾을 수 없습니다' };
      }
      
      if (type === 'folder') {
        // 폴더는 폴더나 null만 부모로 가질 수 있음 (테스트케이스 하위에 폴더 생성 불가)
        if (parent.type !== 'folder') {
          return { success: false, error: '폴더는 다른 폴더나 루트에만 생성할 수 있습니다' };
        }
        validatedParentId = parent_id;
      } else if (type === 'test_case') {
        // 테스트케이스는 폴더나 null만 부모로 가질 수 있음 (테스트케이스 하위에 테스트케이스 생성 불가)
        if (parent.type !== 'folder') {
          return { success: false, error: '테스트케이스는 폴더나 루트에만 생성할 수 있습니다' };
        }
        validatedParentId = parent_id;
      }
    }
    
    // tc_number 자동 할당 (test_case인 경우만)
    let tc_number = null;
    if (type === 'test_case') {
      try {
        const maxResult = DbService.get(
          'SELECT COALESCE(MAX(tc_number), 0) as max_number FROM test_cases WHERE project_id = ? AND type = ?',
          [project_id, 'test_case']
        );
        tc_number = (maxResult?.max_number || 0) + 1;
      } catch (error) {
        // tc_number 컬럼이 없을 수 있으므로 에러 무시
        console.warn('tc_number 조회 실패 (마이그레이션 필요):', error);
      }
    }
    
    const result = DbService.run(
      `INSERT INTO test_cases (project_id, tc_number, parent_id, name, description, type, steps, tags, status, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project_id,
        tc_number,
        validatedParentId,
        name,
        description || null,
        type || 'test_case',
        steps || null,
        tags || null,
        status || 'draft',
        order_index || 0
      ]
    );
    const newTestCase = DbService.get('SELECT * FROM test_cases WHERE id = ?', [result.lastID]);
    return { success: true, data: newTestCase };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-update-test-case', async (event, id, data) => {
  try {
    const { name, description, steps, tags, status, order_index, parent_id } = data;
    
    // 현재 항목 정보 조회
    const currentItem = DbService.get('SELECT type FROM test_cases WHERE id = ?', [id]);
    if (!currentItem) {
      return { success: false, error: '테스트케이스를 찾을 수 없습니다' };
    }
    
    // parent_id 업데이트 포함
    let validatedParentId = null;
    if (parent_id !== undefined) {
      if (parent_id === null) {
        validatedParentId = null; // 루트로 이동
      } else {
        // 부모 검증
        const parent = DbService.get('SELECT type FROM test_cases WHERE id = ?', [parent_id]);
        if (!parent) {
          return { success: false, error: '부모 항목을 찾을 수 없습니다' };
        }
        
        if (currentItem.type === 'folder') {
          // 폴더는 폴더나 null만 부모로 가질 수 있음
          if (parent.type !== 'folder') {
            return { success: false, error: '폴더는 다른 폴더나 루트에만 위치할 수 있습니다' };
          }
        } else if (currentItem.type === 'test_case') {
          // 테스트케이스는 폴더나 null만 부모로 가질 수 있음
          if (parent.type !== 'folder') {
            return { success: false, error: '테스트케이스는 폴더나 루트에만 위치할 수 있습니다' };
          }
        }
        validatedParentId = parent_id;
      }
      
      DbService.run(
        `UPDATE test_cases 
         SET name = COALESCE(?, name), 
             description = COALESCE(?, description), 
             steps = COALESCE(?, steps), 
             tags = COALESCE(?, tags), 
             status = COALESCE(?, status), 
             order_index = COALESCE(?, order_index),
             parent_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          name || null,
          description || null,
          steps || null,
          tags || null,
          status || null,
          order_index !== undefined ? order_index : null,
          validatedParentId,
          id
        ]
      );
    } else {
      DbService.run(
        `UPDATE test_cases 
         SET name = COALESCE(?, name), 
             description = COALESCE(?, description), 
             steps = COALESCE(?, steps), 
             tags = COALESCE(?, tags), 
             status = COALESCE(?, status), 
             order_index = COALESCE(?, order_index),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          name || null,
          description || null,
          steps || null,
          tags || null,
          status || null,
          order_index !== undefined ? order_index : null,
          id
        ]
      );
    }
    
    const updatedTestCase = DbService.get('SELECT * FROM test_cases WHERE id = ?', [id]);
    return { success: true, data: updatedTestCase };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-delete-test-case', async (event, id) => {
  try {
    DbService.run('DELETE FROM test_cases WHERE id = ?', [id]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 스크립트 관리 IPC 핸들러 (로컬 MySQL 직접 연결)
 */

ipcMain.handle('api-get-scripts', async (event, params = {}) => {
  try {
    let query = 'SELECT * FROM test_scripts WHERE 1=1';
    const queryParams = [];
    
    if (params.test_case_id) {
      query += ' AND test_case_id = ?';
      queryParams.push(params.test_case_id);
    }
    if (params.framework) {
      query += ' AND framework = ?';
      queryParams.push(params.framework);
    }
    
    query += ' ORDER BY created_at DESC';
    const scripts = DbService.all(query, queryParams);
    return { success: true, data: scripts };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-create-script', async (event, data) => {
  try {
    const { test_case_id, name, framework, language, code, file_path, status } = data;
    if (!name || !framework || !language || !code) {
      return { success: false, error: '이름, 프레임워크, 언어, 코드는 필수입니다' };
    }

    // 파일 경로는 더 이상 저장하지 않음 (실행 시 임시 파일로 생성)
    // DB에만 코드 저장
    const result = DbService.run(
      `INSERT INTO test_scripts (test_case_id, name, framework, language, code, file_path, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        test_case_id || null,
        name,
        framework,
        language,
        code,
        null, // file_path는 더 이상 사용하지 않음
        status || 'active'
      ]
    );
    const newScript = DbService.get('SELECT * FROM test_scripts WHERE id = ?', [result.lastID]);
    return { success: true, data: newScript };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-update-script', async (event, id, data) => {
  try {
    const { name, framework, language, code, file_path, status } = data;
    
    // 기존 스크립트 조회
    const existing = DbService.get('SELECT * FROM test_scripts WHERE id = ?', [id]);
    if (!existing) {
      return { success: false, error: '스크립트를 찾을 수 없습니다' };
    }

    // 파일 경로는 더 이상 저장하지 않음 (실행 시 임시 파일로 생성)
    // DB에만 코드 저장
    DbService.run(
      `UPDATE test_scripts 
       SET name = COALESCE(?, name), 
           framework = COALESCE(?, framework), 
           language = COALESCE(?, language), 
           code = COALESCE(?, code), 
           status = COALESCE(?, status), 
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name || null,
        framework || null,
        language || null,
        code || null,
        status || null,
        id
      ]
    );
    const updatedScript = DbService.get('SELECT * FROM test_scripts WHERE id = ?', [id]);
    return { success: true, data: updatedScript };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-delete-script', async (event, id) => {
  try {
    // 기존 스크립트 조회
    const existing = DbService.get('SELECT * FROM test_scripts WHERE id = ?', [id]);
    if (!existing) {
      return { success: false, error: '스크립트를 찾을 수 없습니다' };
    }

    // 파일 삭제 (있는 경우)
    if (existing.file_path) {
      try {
        const fs = require('fs').promises;
        await fs.unlink(existing.file_path);
      } catch (fileError) {
        console.warn('파일 삭제 실패:', fileError);
        // 파일 삭제 실패해도 DB에서는 삭제
      }
    }

    DbService.run('DELETE FROM test_scripts WHERE id = ?', [id]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-get-scripts-by-test-case', async (event, testCaseId) => {
  try {
    const scripts = DbService.all(
      'SELECT * FROM test_scripts WHERE test_case_id = ? ORDER BY created_at DESC',
      [testCaseId]
    );
    return { success: true, data: scripts };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 동기화 IPC 핸들러 (로컬 모드에서는 사용하지 않음)
 */

ipcMain.handle('api-get-sync-status', async (event) => {
  return { success: true, data: { synced: true, mode: 'local' } };
});

ipcMain.handle('api-get-test-case-full', async (event, id) => {
  try {
    const testCase = DbService.get('SELECT * FROM test_cases WHERE id = ?', [id]);
    if (!testCase) {
      return { success: false, error: '테스트케이스를 찾을 수 없습니다' };
    }
    const scripts = DbService.all('SELECT * FROM test_scripts WHERE test_case_id = ?', [id]);
    const results = DbService.all('SELECT * FROM test_results WHERE test_case_id = ? ORDER BY executed_at DESC', [id]);
    return {
      success: true,
      data: {
        testCase,
        scripts,
        results
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 객체 레퍼지토리 IPC 핸들러 (로컬 SQLite 직접 연결)
 */

// ============================================================================
// Page Object 관리 IPC 핸들러
// ============================================================================

ipcMain.handle('api-get-page-objects', async (event, projectId) => {
  try {
    const pageObjects = DbService.all(
      'SELECT * FROM page_objects WHERE project_id = ? ORDER BY name',
      [projectId]
    );
    
    // url_patterns JSON 파싱
    const parsed = pageObjects.map(po => {
      const result = { ...po };
      try {
        result.url_patterns = po.url_patterns ? JSON.parse(po.url_patterns) : [];
      } catch (e) {
        result.url_patterns = [];
      }
      return result;
    });
    
    return { success: true, data: parsed };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-get-page-object', async (event, id) => {
  try {
    const pageObject = DbService.get('SELECT * FROM page_objects WHERE id = ?', [id]);
    if (!pageObject) {
      return { success: false, error: 'Page Object를 찾을 수 없습니다' };
    }
    
    // url_patterns JSON 파싱
    try {
      pageObject.url_patterns = pageObject.url_patterns ? JSON.parse(pageObject.url_patterns) : [];
    } catch (e) {
      pageObject.url_patterns = [];
    }
    
    // 메서드 조회
    const methods = DbService.all(
      'SELECT * FROM page_object_methods WHERE page_object_id = ? ORDER BY name',
      [id]
    );
    
    // parameters JSON 파싱
    const parsedMethods = methods.map(m => {
      const result = { ...m };
      try {
        result.parameters = m.parameters ? JSON.parse(m.parameters) : [];
      } catch (e) {
        result.parameters = [];
      }
      return result;
    });
    
    return { success: true, data: { ...pageObject, methods: parsedMethods } };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-create-page-object', async (event, data) => {
  try {
    const { project_id, name, description, url_patterns, framework, language, code, status } = data;
    if (!project_id || !name || !framework || !language || !code) {
      return { success: false, error: '프로젝트 ID, 이름, 프레임워크, 언어, 코드는 필수입니다' };
    }
    
    const result = DbService.run(
      `INSERT INTO page_objects (project_id, name, description, url_patterns, framework, language, code, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project_id,
        name,
        description || null,
        url_patterns ? JSON.stringify(url_patterns) : null,
        framework,
        language,
        code,
        status || 'active'
      ]
    );
    
    const newPageObject = DbService.get('SELECT * FROM page_objects WHERE id = ?', [result.lastID]);
    
    // url_patterns JSON 파싱
    try {
      newPageObject.url_patterns = newPageObject.url_patterns ? JSON.parse(newPageObject.url_patterns) : [];
    } catch (e) {
      newPageObject.url_patterns = [];
    }
    
    return { success: true, data: newPageObject };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-update-page-object', async (event, id, data) => {
  try {
    const { name, description, url_patterns, framework, language, code, status } = data;
    
    const existing = DbService.get('SELECT * FROM page_objects WHERE id = ?', [id]);
    if (!existing) {
      return { success: false, error: 'Page Object를 찾을 수 없습니다' };
    }
    
    DbService.run(
      `UPDATE page_objects 
       SET name = COALESCE(?, name), 
           description = COALESCE(?, description), 
           url_patterns = COALESCE(?, url_patterns), 
           framework = COALESCE(?, framework), 
           language = COALESCE(?, language), 
           code = COALESCE(?, code), 
           status = COALESCE(?, status), 
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name || null,
        description || null,
        url_patterns ? JSON.stringify(url_patterns) : null,
        framework || null,
        language || null,
        code || null,
        status || null,
        id
      ]
    );
    
    const updatedPageObject = DbService.get('SELECT * FROM page_objects WHERE id = ?', [id]);
    
    // url_patterns JSON 파싱
    try {
      updatedPageObject.url_patterns = updatedPageObject.url_patterns ? JSON.parse(updatedPageObject.url_patterns) : [];
    } catch (e) {
      updatedPageObject.url_patterns = [];
    }
    
    return { success: true, data: updatedPageObject };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-delete-page-object', async (event, id) => {
  try {
    DbService.run('DELETE FROM page_objects WHERE id = ?', [id]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-find-page-object-by-url', async (event, url, projectId) => {
  try {
    const pageObjects = DbService.all(
      'SELECT * FROM page_objects WHERE project_id = ? AND status = ?',
      [projectId, 'active']
    );
    
    // URL 패턴 매칭
    for (const po of pageObjects) {
      let urlPatterns = [];
      try {
        urlPatterns = po.url_patterns ? JSON.parse(po.url_patterns) : [];
      } catch (e) {
        continue;
      }
      
      for (const pattern of urlPatterns) {
        // 정확한 매칭
        if (url === pattern) {
          return { success: true, data: po };
        }
        
        // 상대 경로 매칭
        if (pattern.startsWith('/')) {
          try {
            const urlPath = new URL(url).pathname;
            if (urlPath === pattern || urlPath.startsWith(pattern)) {
              return { success: true, data: po };
            }
          } catch (e) {
            // URL 파싱 실패 시 무시
          }
        }
        
        // 정규식 매칭 (regex: 접두사)
        if (pattern.startsWith('regex:')) {
          try {
            const regex = new RegExp(pattern.substring(6));
            if (regex.test(url)) {
              return { success: true, data: po };
            }
          } catch (e) {
            // 정규식 파싱 실패 시 무시
          }
        }
      }
    }
    
    return { success: false, data: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================================================
// 객체 레포지토리 IPC 핸들러
// ============================================================================

ipcMain.handle('api-get-objects', async (event, projectId) => {
  try {
    const objects = DbService.all(
      'SELECT * FROM objects WHERE project_id = ? ORDER BY parent_id, priority, name',
      [projectId]
    );
    // selectors JSON 파싱
    const parsed = objects.map(obj => {
      const result = { ...obj };
      try {
        result.selectors = obj.selectors ? JSON.parse(obj.selectors) : [];
      } catch (e) {
        result.selectors = [];
      }
      return result;
    });
    return { success: true, data: parsed };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-get-object-tree', async (event, projectId) => {
  try {
    const objects = DbService.all(
      'SELECT * FROM objects WHERE project_id = ? ORDER BY parent_id, priority, name',
      [projectId]
    );
    
    // 트리 구조로 변환
    function buildTree(items, parentId) {
      const parentIdValue = parentId === null ? null : parentId;
      return items
        .filter(item => {
          if (parentIdValue === null) {
            return item.parent_id === null;
          }
          return item.parent_id === parentIdValue;
        })
        .map(item => {
          const node = { ...item };
          try {
            node.selectors = item.selectors ? JSON.parse(item.selectors) : [];
          } catch (e) {
            node.selectors = [];
          }
          const children = buildTree(items, item.id);
          if (children.length > 0) {
            node.children = children;
          }
          return node;
        })
        .sort((a, b) => (a.priority || 0) - (b.priority || 0));
    }
    
    const tree = buildTree(objects, null);
    return { success: true, data: tree };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-get-object', async (event, id) => {
  try {
    const object = DbService.get('SELECT * FROM objects WHERE id = ?', [id]);
    if (!object) {
      return { success: false, error: '객체를 찾을 수 없습니다' };
    }
    try {
      object.selectors = object.selectors ? JSON.parse(object.selectors) : [];
    } catch (e) {
      object.selectors = [];
    }
    return { success: true, data: object };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-create-object', async (event, data) => {
  try {
    const { project_id, parent_id, name, description, type, selectors, priority } = data;
    if (!project_id || !name) {
      return { success: false, error: 'project_id와 name은 필수입니다' };
    }
    if (!selectors || !Array.isArray(selectors) || selectors.length === 0) {
      return { success: false, error: 'selectors는 배열 형태로 최소 1개 이상 필요합니다' };
    }
    const result = DbService.run(
      `INSERT INTO objects (project_id, parent_id, name, description, type, selectors, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        project_id,
        parent_id || null,
        name,
        description || null,
        type || 'element',
        JSON.stringify(selectors),
        priority || 0
      ]
    );
    const newObject = DbService.get('SELECT * FROM objects WHERE id = ?', [result.lastID]);
    try {
      newObject.selectors = newObject.selectors ? JSON.parse(newObject.selectors) : [];
    } catch (e) {
      newObject.selectors = [];
    }
    return { success: true, data: newObject };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-update-object', async (event, id, data) => {
  try {
    const { name, description, selectors, priority } = data;
    DbService.run(
      `UPDATE objects 
       SET name = COALESCE(?, name), 
           description = COALESCE(?, description), 
           selectors = COALESCE(?, selectors), 
           priority = COALESCE(?, priority), 
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name || null,
        description !== undefined ? description : null,
        selectors ? JSON.stringify(selectors) : null,
        priority !== undefined ? priority : null,
        id
      ]
    );
    const updatedObject = DbService.get('SELECT * FROM objects WHERE id = ?', [id]);
    try {
      updatedObject.selectors = updatedObject.selectors ? JSON.parse(updatedObject.selectors) : [];
    } catch (e) {
      updatedObject.selectors = [];
    }
    return { success: true, data: updatedObject };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-delete-object', async (event, id) => {
  try {
    DbService.run('DELETE FROM objects WHERE id = ?', [id]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 서버 상태 확인 IPC 핸들러 (로컬 모드에서는 항상 연결됨)
 */

ipcMain.handle('api-check-server', async (event) => {
  try {
    // 데이터베이스 연결 확인
    DbService.get('SELECT 1');
    const config = DbService.getConfig();
    return { 
      connected: true, 
      mode: 'local',
      type: 'sqlite',
      path: config.path
    };
  } catch (error) {
    return { 
      connected: false, 
      error: error.message, 
      mode: 'local',
      type: 'sqlite'
    };
  }
});
