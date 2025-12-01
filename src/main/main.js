/**
 * Electron 메인 프로세스
 * 애플리케이션의 진입점 및 IPC 통신 관리
 */

// 콘솔 인코딩 설정 (Windows 한글 깨짐 방지)
if (process.platform === 'win32') {
  // Windows 콘솔 인코딩을 UTF-8로 설정
  process.stdout.setDefaultEncoding('utf8');
  process.stderr.setDefaultEncoding('utf8');
  
  // PowerShell 및 CMD 모두에서 작동하도록 여러 방법 시도
  try {
    // 방법 1: chcp 65001 (CMD용)
    require('child_process').execSync('chcp 65001 >nul 2>&1', { shell: true });
  } catch (e) {
    // 무시
  }
  
  try {
    // 방법 2: PowerShell용 인코딩 설정 (PowerShell이면 실행)
    const shell = process.env.SHELL || process.env.COMSPEC || '';
    if (shell.toLowerCase().includes('powershell') || process.env.TERM_PROGRAM === 'vscode') {
      // PowerShell에서는 [Console]::OutputEncoding을 설정
      require('child_process').execSync(
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::InputEncoding = [System.Text.Encoding]::UTF8',
        { shell: 'powershell.exe', encoding: 'utf8' }
      );
    }
  } catch (e) {
    // PowerShell 명령 실패 시 무시 (CMD에서는 작동하지 않음)
  }
  
  // 환경 변수 설정
  process.env.PYTHONIOENCODING = 'utf-8';
  process.env.CHCP = '65001'; // 일부 프로그램에서 사용
}

const { app, BrowserWindow, ipcMain, Menu, globalShortcut } = require('electron');
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn, exec, execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const net = require('net');
const WebSocket = require('ws');
const config = require('./config/config');
const PytestService = require('./services/pytestService');
const ScriptManager = require('./services/scriptManager');
const EnvironmentChecker = require('./services/environmentChecker');
const DbService = require('./services/dbService');
const ChromeForTestingService = require('./services/chromeForTestingService');

// 프로덕션 모드 경로 초기화는 app.whenReady()에서 처리
// createWindow()가 호출되기 전에 경로가 설정되어야 함

/** @type {BrowserWindow} 메인 윈도우 인스턴스 */
let mainWindow;

/** @type {BrowserWindow} 녹화 윈도우 인스턴스 */
let recorderWindow = null;

/** @type {boolean} 전역 녹화 상태 */
let globalRecordingState = false;

/** @type {WebSocket} CDP WebSocket 연결 (URL 변경 감지를 위해 유지) */
let globalCdpWs = null;

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

  // favicon.ico 요청 처리 (404 오류 방지)
  recordingApp.get('/favicon.ico', (req, res) => {
    res.status(204).end(); // No Content
  });

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
    
    // 간단한 HTML 페이지 반환
    // 확장 프로그램의 Content Script가 URL 파라미터를 감지하여 처리
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
            max-width: 600px;
          }
          h1 { margin: 0 0 20px 0; font-size: 2.5em; }
          p { font-size: 1.2em; opacity: 0.9; margin: 10px 0; }
          .info {
            margin-top: 30px;
            padding: 20px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 10px;
            font-size: 0.9em;
            text-align: left;
          }
          .info div {
            margin: 8px 0;
            padding: 5px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }
          .info div:last-child {
            border-bottom: none;
          }
          .status {
            margin-top: 20px;
            padding: 15px;
            background: rgba(76, 175, 80, 0.2);
            border-radius: 8px;
            border-left: 4px solid #4ade80;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎬 녹화 준비 완료</h1>
          <p>크롬 확장 프로그램이 자동으로 녹화를 시작합니다...</p>
          <div class="status">
            ✅ 확장 프로그램의 사이드 패널이 자동으로 열립니다
          </div>
          <div class="info">
            <div><strong>TC ID:</strong> ${tcId || 'N/A'}</div>
            <div><strong>프로젝트 ID:</strong> ${projectId || 'N/A'}</div>
            <div><strong>세션 ID:</strong> ${sessionId || 'N/A'}</div>
          </div>
        </div>
        <!-- 
          Content Script가 자동으로 URL 파라미터를 감지하여
          Background Script에 메시지를 보내고 Side Panel을 엽니다.
          별도의 JavaScript 로직이 필요하지 않습니다.
        -->
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
    const userAgent = req.headers['user-agent'] || 'unknown';
    console.log(`🔌 Extension WebSocket 클라이언트 연결: ${clientIp}, User-Agent: ${userAgent}`);
    extensionClients.add(ws);
    console.log(`[Extension] 현재 연결된 클라이언트 수: ${extensionClients.size}`);
    
    // 연결 확인 메시지 전송
    try {
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'TestArchitect 서버에 연결되었습니다',
        timestamp: Date.now()
      }));
      console.log(`[Extension] 연결 확인 메시지 전송 완료: ${clientIp}`);
      
      // 녹화 중이면 즉시 recording-start 메시지 전송 (늦게 연결된 클라이언트용)
      console.log(`[Extension] 현재 녹화 상태 확인: ${globalRecordingState ? '녹화 중' : '녹화 중지'}`);
      if (globalRecordingState) {
        console.log(`[Extension] 녹화 중이므로 recording-start 메시지 즉시 전송: ${clientIp}`);
        try {
          const message = {
            type: 'recording-start',
            timestamp: Date.now()
          };
          ws.send(JSON.stringify(message));
          console.log(`[Extension] recording-start 메시지 전송 완료: ${clientIp}`);
        } catch (error) {
          console.error(`[Extension] recording-start 메시지 전송 실패: ${error.message}`);
        }
      } else {
        console.log(`[Extension] 녹화 중이 아니므로 recording-start 메시지 전송 안 함: ${clientIp}`);
      }
    } catch (error) {
      console.error(`[Extension] 연결 확인 메시지 전송 실패: ${error.message}`);
    }
    
    // 메시지 수신 처리
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log(`[Extension] 메시지 수신 (${clientIp}):`, data.type);
        handleExtensionMessage(ws, data);
      } catch (error) {
        console.error('[Extension] 메시지 파싱 오류:', error.message);
        console.error('[Extension] 원본 메시지:', message.toString().substring(0, 200));
        try {
          ws.send(JSON.stringify({
            type: 'error',
            message: '메시지 파싱 실패',
            error: error.message
          }));
        } catch (sendError) {
          console.error('[Extension] 에러 메시지 전송 실패:', sendError.message);
        }
      }
    });
    
    // 연결 종료 처리
    ws.on('close', (code, reason) => {
      console.log(`🔌 Extension WebSocket 클라이언트 연결 해제: ${clientIp}, 코드: ${code}, 이유: ${reason?.toString() || '없음'}`);
      extensionClients.delete(ws);
      console.log(`[Extension] 현재 연결된 클라이언트 수: ${extensionClients.size}`);
    });
    
    // 에러 처리
    ws.on('error', (error) => {
      console.error(`❌ Extension WebSocket 오류 (${clientIp}):`, error.message);
      extensionClients.delete(ws);
      console.log(`[Extension] 현재 연결된 클라이언트 수: ${extensionClients.size}`);
    });
    
    // ping/pong으로 연결 유지
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
  });
  
  // 연결 유지 체크 (30초마다)
  const keepAliveInterval = setInterval(() => {
    extensionClients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log('[Extension] 비활성 연결 제거');
        extensionClients.delete(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch (error) {
        console.error('[Extension] ping 실패:', error.message);
        extensionClients.delete(ws);
      }
    });
  }, 30000);
  
  // 서버 종료 시 인터벌 정리
  recordingServer.on('close', () => {
    clearInterval(keepAliveInterval);
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
      
    case 'content-script-connected':
      // Content Script 연결 확인
      console.log('[Extension] Content Script 연결 확인:', {
        url: data.url,
        timestamp: data.timestamp
      });
      ws.send(JSON.stringify({
        type: 'content-script-ack',
        message: 'Content Script 연결 확인됨',
        timestamp: Date.now()
      }));
      break;
      
    case 'recording-start':
      // 확장 프로그램에서 녹화 시작 알림
      console.log('[Extension] 녹화 시작 요청 수신 (WebSocket에서)');
      console.log('[Extension] 현재 연결된 클라이언트 수:', extensionClients.size);
      console.log('[Extension] 녹화 상태 변경: false -> true');
      globalRecordingState = true;
      
      // 메인 윈도우에 알림
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('recording-started', {
          source: 'extension',
          tcId: data.tcId,
          projectId: data.projectId,
          sessionId: data.sessionId,
          timestamp: data.timestamp || Date.now()
        });
      }
      
      // 모든 Extension 클라이언트(Content Script)에게 브로드캐스트
      broadcastToExtensions({
        type: 'recording-start',
        timestamp: data.timestamp || Date.now()
      });
      break;
      
    case 'recording-stop':
      // 확장 프로그램에서 녹화 중지 알림
      console.log('[Extension] 녹화 중지 요청 수신');
      globalRecordingState = false;
      
      // CDP WebSocket 연결 종료
      if (globalCdpWs && globalCdpWs.readyState === WebSocket.OPEN) {
        console.log('[CDP] 녹화 중지: CDP WebSocket 연결 종료');
        globalCdpWs.close();
        globalCdpWs = null;
      }
      
      // 메인 윈도우에 알림
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('recording-stopped', {
          source: 'extension',
          timestamp: data.timestamp || Date.now()
        });
      }
      
      // 모든 Extension 클라이언트(Content Script)에게 브로드캐스트
      broadcastToExtensions({
        type: 'recording-stop',
        timestamp: data.timestamp || Date.now()
      });
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
      
    case 'dom-event':
      // Content Script에서 전송된 DOM 이벤트
      console.log('[Extension] DOM 이벤트 수신:', {
        action: data.event?.action,
        sessionId: data.sessionId,
        timestamp: data.timestamp
      });
      
      const eventData = {
        ...data.event,
        timestamp: data.timestamp || Date.now(),
        sessionId: data.sessionId
      };
      
      // 메인 윈도우로 전달 (한 번만)
      // renderer.js에서 iframe에 postMessage로 전달하므로 여기서는 IPC만 전송
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('dom-event', eventData);
      }
      
      // 녹화 윈도우로도 전달 (별도 윈도우가 있는 경우)
      if (recorderWindow && !recorderWindow.isDestroyed() && recorderWindow.webContents) {
        recorderWindow.webContents.send('dom-event', eventData);
      }
      
      // 주의: 메인 윈도우의 iframe은 renderer.js에서 postMessage로 전달하므로 중복 전송하지 않음
      
      // 실시간 이벤트 스트리밍 (선택적)
      // 필요시 여기서 데이터베이스에 저장하거나 추가 처리
      break;
      
    case 'element-hover':
      // Content Script에서 전송된 요소 하이라이트 정보
      console.log('[Extension] 요소 하이라이트 수신:', {
        tag: data.element?.tag,
        id: data.element?.id,
        selectorsCount: data.selectors?.length || 0
      });
      
      const hoverData = {
        element: data.element,
        selectors: data.selectors || [],
        timestamp: data.timestamp || Date.now()
      };
      
      // 메인 윈도우로 전달 (필요한 경우)
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('element-hover', hoverData);
      }
      
      // 녹화 윈도우로도 전달 (별도 윈도우가 있는 경우)
      if (recorderWindow && !recorderWindow.isDestroyed() && recorderWindow.webContents) {
        recorderWindow.webContents.send('element-hover', hoverData);
      }
      
      // 메인 윈도우의 iframe으로도 전달
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('element-hover', hoverData);
      }
      break;
      
    case 'element-hover-clear':
      // 요소 하이라이트 해제
      console.log('[Extension] 요소 하이라이트 해제');
      
      const clearData = {
        timestamp: data.timestamp || Date.now()
      };
      
      // 메인 윈도우로 전달 (필요한 경우)
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('element-hover-clear', clearData);
      }
      
      // 녹화 윈도우로도 전달 (별도 윈도우가 있는 경우)
      if (recorderWindow && !recorderWindow.isDestroyed() && recorderWindow.webContents) {
        recorderWindow.webContents.send('element-hover-clear', clearData);
      }
      
      // 메인 윈도우의 iframe으로도 전달
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('element-hover-clear', clearData);
      }
      break;
      
    case 'url-changed':
    case 'page-navigated':
      // URL 변경 감지 (페이지 전환)
      console.log('[Extension] ========== URL 변경 감지 ==========');
      console.log('[Extension] URL 변경 정보:', {
        url: data.url,
        tabId: data.tabId,
        timestamp: data.timestamp,
        previousUrl: data.previousUrl || 'N/A'
      });
      console.log('[Extension] 현재 녹화 상태:', globalRecordingState ? '녹화 중' : '녹화 중지');
      console.log('[Extension] 활성 WebSocket 연결 수:', extensionConnections.size);
      
      // WebSocket 연결 상태 확인
      extensionConnections.forEach((conn, index) => {
        console.log(`[Extension] WebSocket #${index}:`, {
          readyState: conn.readyState,
          url: conn.url || 'N/A',
          protocol: conn.protocol || 'N/A'
        });
      });
      
      // 녹화 중인 경우에만 처리
      if (globalRecordingState) {
        const urlChangeData = {
          url: data.url,
          tabId: data.tabId,
          timestamp: data.timestamp || Date.now(),
          previousUrl: data.previousUrl || null
        };
        
        console.log('[Extension] URL 변경 데이터 준비 완료:', urlChangeData);
        
        // 메인 윈도우로 전달
        if (mainWindow && mainWindow.webContents) {
          console.log('[Extension] 메인 윈도우로 URL 변경 전송 시도...');
          mainWindow.webContents.send('url-changed', urlChangeData);
          console.log('[Extension] ✅ 메인 윈도우로 URL 변경 전송 완료');
        } else {
          console.warn('[Extension] ⚠️ 메인 윈도우가 없거나 webContents가 없습니다');
        }
        
        // 녹화 윈도우로도 전달
        if (recorderWindow && !recorderWindow.isDestroyed() && recorderWindow.webContents) {
          console.log('[Extension] 녹화 윈도우로 URL 변경 전송 시도...');
          recorderWindow.webContents.send('url-changed', urlChangeData);
          console.log('[Extension] ✅ 녹화 윈도우로 URL 변경 전송 완료');
        } else {
          console.log('[Extension] ℹ️ 녹화 윈도우가 없거나 닫혔습니다 (정상)');
        }
        
        // Content Script에 녹화 재시작 메시지 전송 (중요!)
        console.log('[Extension] Content Script에 녹화 재시작 메시지 전송 시도...');
        if (data.tabId) {
          // Background Script에 Content Script 재시작 요청 전달
          // 실제로는 확장 프로그램의 Background Script가 처리해야 함
          console.log('[Extension] ⚠️ Content Script 재시작은 확장 프로그램 Background Script에서 처리해야 합니다');
          console.log('[Extension] ⚠️ tabId:', data.tabId, '로 RECORDING_START 메시지를 보내야 합니다');
        }
        
        console.log('[Extension] ========== URL 변경 처리 완료 ==========');
      } else {
        console.log('[Extension] ⚠️ URL 변경 감지되었지만 녹화 중이 아니므로 무시');
      }
      break;
      
    case 'element-selection':
      // 요소 선택 관련 메시지 (Content Script로 전달)
      console.log('[Extension] 요소 선택 메시지 수신:', data.type);
      
      // Content Script에 전달하기 위해 WebSocket으로 브로드캐스트
      // 실제로는 Content Script가 직접 WebSocket에 연결되어 있으므로
      // Background Script를 통해 Content Script에 메시지 전달
      broadcastToExtensions({
        type: 'element-selection',
        ...data
      });
      
      // 녹화 윈도우로도 전달
      if (recorderWindow && !recorderWindow.isDestroyed() && recorderWindow.webContents) {
        recorderWindow.webContents.send('element-selection', data);
      }
      break;
      
    case 'ELEMENT_SELECTION_PICKED':
    case 'ELEMENT_SELECTION_ERROR':
    case 'ELEMENT_SELECTION_CANCELLED':
      // 요소 선택 결과 메시지 (Content Script에서 전송)
      console.log('[Extension] 요소 선택 결과 수신:', data.type);
      
      // 메인 윈도우로 전달
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('element-selection-result', {
          type: data.type,
          ...data
        });
      }
      
      // 녹화 윈도우로도 전달
      if (recorderWindow && !recorderWindow.isDestroyed() && recorderWindow.webContents) {
        recorderWindow.webContents.send('element-selection-result', {
          type: data.type,
          ...data
        });
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
  
  console.log(`[Extension] 브로드캐스트 시작: ${message.type}, 연결된 클라이언트: ${extensionClients.size}개`);
  
  extensionClients.forEach((ws, index) => {
    console.log(`[Extension] 클라이언트 ${index + 1} 상태: ${ws.readyState === WebSocket.OPEN ? 'OPEN' : ws.readyState === WebSocket.CONNECTING ? 'CONNECTING' : ws.readyState === WebSocket.CLOSING ? 'CLOSING' : 'CLOSED'}`);
    
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(messageStr);
        sentCount++;
        console.log(`[Extension] 클라이언트 ${index + 1}에 메시지 전송 성공: ${message.type}`);
      } catch (error) {
        console.error(`❌ Extension 클라이언트 ${index + 1} 메시지 전송 실패:`, error);
        extensionClients.delete(ws);
      }
    } else {
      console.warn(`[Extension] 클라이언트 ${index + 1}는 연결되지 않음 (readyState: ${ws.readyState})`);
    }
  });
  
  if (sentCount > 0) {
    console.log(`📤 Extension에 메시지 브로드캐스트: ${sentCount}개 클라이언트`);
  } else {
    console.warn(`⚠️ Extension에 메시지 브로드캐스트 실패: 연결된 클라이언트가 없거나 모두 연결되지 않음`);
  }
}

/**
 * CDP를 통해 DOM 이벤트 캡처 스크립트 주입 (확장 프로그램 없이)
 * @param {number} cdpPort - Chrome DevTools Protocol 포트
 * @param {string} targetUrl - 주입할 페이지 URL
 */
/**
 * CDP 서버가 준비될 때까지 대기
 * @param {number} cdpPort - CDP 포트
 * @param {number} maxRetries - 최대 재시도 횟수
 * @param {number} retryDelay - 재시도 간격 (ms)
 */
async function waitForCDPServer(cdpPort, maxRetries = 10, retryDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const targets = await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${cdpPort}/json/list`, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (error) {
              reject(error);
            }
          });
        });
        req.on('error', reject);
        req.setTimeout(3000, () => {
          req.destroy();
          reject(new Error('CDP 연결 타임아웃'));
        });
      });
      
      console.log(`✅ CDP 서버 준비 완료 (시도 ${i + 1}/${maxRetries})`);
      return targets;
    } catch (error) {
      if (i < maxRetries - 1) {
        console.log(`⏳ CDP 서버 대기 중... (${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        throw new Error(`CDP 서버가 준비되지 않았습니다: ${error.message}`);
      }
    }
  }
}

async function injectDomEventCaptureViaCDP(cdpPort, targetUrl) {
  try {
    // CDP 서버가 준비될 때까지 대기
    console.log('⏳ CDP 서버 준비 대기 중...');
    const targets = await waitForCDPServer(cdpPort);
    
    // 대상 탭 찾기 (모든 탭에서 찾기)
    const targetTab = targets.find(tab => 
      tab.url && (tab.url.includes('localhost:3000') || tab.url.includes('127.0.0.1:3000'))
    );
    
    if (!targetTab) {
      console.log('⚠️ 대상 탭을 찾을 수 없습니다. 잠시 후 다시 시도합니다...');
      // 2초 후 재시도
      setTimeout(async () => {
        try {
          await injectDomEventCaptureViaCDP(cdpPort, targetUrl);
        } catch (error) {
          console.warn('⚠️ DOM 이벤트 캡처 스크립트 주입 재시도 실패:', error.message);
        }
      }, 2000);
      return;
    }
    
    console.log('✅ 대상 탭 발견:', targetTab.url);
    
    // selectorUtils.js 파일 읽기 (CDP 스크립트에 포함)
    const selectorUtilsPath = path.join(__dirname, '../renderer/utils/selectorUtils.js');
    let selectorUtilsCode = '';
    try {
      selectorUtilsCode = fs.readFileSync(selectorUtilsPath, 'utf8');
      // export 키워드 제거 (CDP 스크립트에서 직접 사용)
      selectorUtilsCode = selectorUtilsCode
        .replace(/export\s+function\s+/g, 'function ')
        .replace(/export\s+/g, '');
      console.log('✅ selectorUtils.js 로드 완료');
    } catch (error) {
      console.warn('⚠️ selectorUtils.js 로드 실패:', error.message);
    }
    
    // DOM 이벤트 캡처 스크립트 생성 (확장 프로그램 없이 직접 구현)
    const domCaptureScript = `
(function() {
  'use strict';
  
  // 이미 주입되었는지 확인
  if (window.__testarchitect_dom_capture__) {
    console.log('[DOM Capture] 이미 주입되어 있습니다.');
    return;
  }
  window.__testarchitect_dom_capture__ = true;
  
  console.log('[DOM Capture] DOM 이벤트 캡처 스크립트 시작');
  
  // ============================================================================
  // selectorUtils.js 함수들 (CDP 스크립트에 포함)
  // ============================================================================
  ${selectorUtilsCode}
  
  // ============================================================================
  // WebSocket 연결
  // ============================================================================
  let wsConnection = null;
  let isRecording = false;
  let lastProcessedUrl = null; // 마지막으로 처리된 URL (중복 이벤트 방지)
  
  // ============================================================================
  // URL 정규화 함수: 의미 있는 부분만 비교 (쿼리 파라미터 제외)
  // G마켓 같은 SPA에서 동적 쿼리 파라미터 변경으로 인한 중복 navigate 이벤트 방지
  // ============================================================================
  function normalizeUrl(url) {
    if (!url) return '';
    // about:blank 같은 특수 URL은 그대로 반환 (비교 불가)
    if (url === 'about:blank' || url.startsWith('about:')) {
      return url;
    }
    try {
      const urlObj = new URL(url);
      // origin + pathname만 비교 (쿼리 파라미터, hash 제외)
      // 실제 페이지 이동만 감지하도록 함
      return urlObj.origin + urlObj.pathname;
    } catch (e) {
      // URL 파싱 실패 시 원본 반환
      console.warn('[DOM Capture] URL 정규화 실패:', url, e);
      return url;
    }
  }
  
  // ============================================================================
  // 요소 하이라이트 기능 (record/content.js 참고)
  // ============================================================================
  let currentHighlightedElement = null;
  let overlayElement = null;
  let hoverTimeout = null;
  let mouseoutTimeout = null;
  let scrollTimeout = null;
  
  // 오버레이 HTML 생성 (record/content.js의 buildOverlayHtml 참고)
  function buildOverlayHtml(topSelector, selectors) {
    if (!topSelector || !topSelector.selector) {
      return '<div style="color: #ff9800;">No selector found</div>';
    }
    const more = selectors.length > 1 ? '<div style="font-size: 10px; color: #888; margin-top: 4px;">+' + (selectors.length - 1) + ' more</div>' : '';
    const score = topSelector.score || 0;
    const reason = topSelector.reason || topSelector.type || 'CSS';
    const selectorText = escapeHtml(topSelector.selector);
    return '<div style="font-weight: bold; margin-bottom: 4px; color: #4CAF50;">' + selectorText + '</div>' +
           '<div style="font-size: 10px; color: #aaa;">Score: ' + score + '% • ' + reason + '</div>' +
           more;
  }
  
  // HTML 이스케이프
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // 오버레이 위치 업데이트 (record/content.js의 updateOverlayPosition 참고)
  function updateOverlayPosition(rect) {
    if (!overlayElement) return;
    
    const overlayHeight = overlayElement.offsetHeight;
    const overlayWidth = overlayElement.offsetWidth;
    const overlayTop = rect.top - overlayHeight - 10;
    const overlayBottom = rect.bottom + 10;
    
    if (overlayTop >= 0) {
      overlayElement.style.top = overlayTop + 'px';
      overlayElement.style.left = rect.left + 'px';
    } else {
      overlayElement.style.top = overlayBottom + 'px';
      overlayElement.style.left = rect.left + 'px';
    }
    
    const maxLeft = window.innerWidth - overlayWidth - 10;
    const currentLeft = parseInt(overlayElement.style.left, 10) || 0;
    if (currentLeft > maxLeft) {
      overlayElement.style.left = Math.max(10, maxLeft) + 'px';
    }
    if (currentLeft < 10) {
      overlayElement.style.left = '10px';
    }
  }
  
  // 셀렉터 오버레이 생성 (record/content.js의 createSelectorOverlay 참고)
  function createSelectorOverlay(rect, selectors) {
    // 기존 오버레이 제거
    if (overlayElement) {
      overlayElement.remove();
      overlayElement = null;
    }
    
    if (!selectors || selectors.length === 0) {
      return;
    }
    
    const overlay = document.createElement('div');
    overlay.id = '__testarchitect_selector_overlay__';
    overlay.style.cssText = 'position: fixed; z-index: 999999; background: rgba(0, 0, 0, 0.85); color: white; padding: 8px 12px; border-radius: 6px; font-family: "Courier New", monospace; font-size: 12px; pointer-events: none; box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 300px; word-break: break-all; line-height: 1.4;';
    
    overlay.innerHTML = buildOverlayHtml(selectors[0], selectors);
    document.body.appendChild(overlay);
    overlayElement = overlay;
    updateOverlayPosition(rect);
  }
  
  function removeHighlight() {
    if (currentHighlightedElement) {
      try {
        currentHighlightedElement.style.outline = '';
        currentHighlightedElement.style.outlineOffset = '';
      } catch (e) {
        // 요소가 DOM에서 제거된 경우 무시
      }
      currentHighlightedElement = null;
    }
    if (overlayElement) {
      overlayElement.remove();
      overlayElement = null;
    }
  }
  
  function highlightElement(element) {
    if (!element || !isRecording) return;
    
    // 같은 요소면 스킵
    const isSameElement = element === currentHighlightedElement;
    if (isSameElement && overlayElement) {
      // 같은 요소면 오버레이 위치만 업데이트
      const rect = element.getBoundingClientRect();
      updateOverlayPosition(rect);
      return;
    }
    
    // 이전 하이라이트 제거
    if (currentHighlightedElement && currentHighlightedElement !== element) {
      try {
        currentHighlightedElement.style.outline = '';
        currentHighlightedElement.style.outlineOffset = '';
      } catch (e) {
        // 요소가 DOM에서 제거된 경우 무시
      }
    }
    
    // 새 요소 하이라이트
    currentHighlightedElement = element;
    try {
      element.style.outline = '3px solid #2196F3';
      element.style.outlineOffset = '2px';
      element.style.transition = 'outline 0.1s ease';
      
      // 셀렉터 후보 생성 및 오버레이 표시
      const rect = element.getBoundingClientRect();
      let selectorCandidates = [];
      try {
        selectorCandidates = getSelectorCandidatesWithUniqueness(element, {
          requireUnique: false
        });
        if (selectorCandidates && selectorCandidates.length > 0) {
          createSelectorOverlay(rect, selectorCandidates);
        }
      } catch (error) {
        console.error('[DOM Capture] 셀렉터 생성 오류:', error);
      }
    } catch (e) {
      // 스타일 적용 실패 시 무시
      currentHighlightedElement = null;
    }
  }
  
  function handleMouseOver(event) {
    if (!isRecording) return;
    
    // mouseout 타임아웃 취소
    if (mouseoutTimeout) {
      clearTimeout(mouseoutTimeout);
      mouseoutTimeout = null;
    }
    
    const target = event.target;
    
    // body나 documentElement는 무시
    if (!target || target === document.body || target === document.documentElement) {
      removeHighlight();
      return;
    }
    
    // 오버레이 요소는 무시
    if (target.id === '__testarchitect_selector_overlay__' || target.closest('#__testarchitect_selector_overlay__')) {
      return;
    }
    
    // 다른 요소로 이동한 경우
    if (target !== currentHighlightedElement) {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }
      // 약간의 지연 후 하이라이트 (성능 최적화)
      hoverTimeout = setTimeout(() => {
        highlightElement(target);
        hoverTimeout = null;
      }, 30);
    } else if (overlayElement) {
      // 같은 요소면 오버레이 위치만 업데이트
      const rect = target.getBoundingClientRect();
      updateOverlayPosition(rect);
    }
  }
  
  function handleMouseOut(event) {
    if (!isRecording) return;
    
    const relatedTarget = event.relatedTarget;
    // 오버레이 요소로 이동한 경우 무시
    if (relatedTarget && (relatedTarget.id === '__testarchitect_selector_overlay__' || relatedTarget.closest('#__testarchitect_selector_overlay__'))) {
      return;
    }
    
    // hover 타임아웃 취소
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    
    // 약간의 지연 후 하이라이트 제거 (빠른 마우스 이동 시 깜빡임 방지)
    if (mouseoutTimeout) {
      clearTimeout(mouseoutTimeout);
    }
    
    mouseoutTimeout = setTimeout(() => {
      const activeElement = document.elementFromPoint(event.clientX, event.clientY);
      
      // 활성 요소가 body나 documentElement가 아니고, 하이라이트된 요소도 아니고, 오버레이도 아니면 제거
      if (activeElement && 
          activeElement !== document.body && 
          activeElement !== document.documentElement &&
          activeElement.id !== '__testarchitect_selector_overlay__' &&
          !activeElement.closest('#__testarchitect_selector_overlay__') &&
          activeElement !== currentHighlightedElement) {
        removeHighlight();
      }
      
      mouseoutTimeout = null;
    }, 200);
  }
  
  function handleScroll() {
    if (!isRecording || !currentHighlightedElement || !overlayElement) return;
    
    // 스크롤 시 오버레이 위치 업데이트
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    
    scrollTimeout = setTimeout(() => {
      if (currentHighlightedElement) {
        try {
          const rect = currentHighlightedElement.getBoundingClientRect();
          // 요소가 뷰포트 밖에 있으면 하이라이트 제거
          if (rect.bottom < 0 || rect.top > window.innerHeight || 
              rect.right < 0 || rect.left > window.innerWidth) {
            removeHighlight();
          } else if (overlayElement) {
            // 요소가 보이면 오버레이 위치 업데이트
            updateOverlayPosition(rect);
          }
        } catch (e) {
          // 요소가 DOM에서 제거된 경우 하이라이트 제거
          removeHighlight();
        }
      }
      scrollTimeout = null;
    }, 50);
  }
  
  function setupHoverListeners() {
    if (!isRecording) return;
    
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    window.addEventListener('scroll', handleScroll, true);
    
    console.log('[DOM Capture] 요소 하이라이트 리스너 설정 완료');
  }
  
  function removeHoverListeners() {
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    window.removeEventListener('scroll', handleScroll, true);
    
    // 타임아웃 정리
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    if (mouseoutTimeout) {
      clearTimeout(mouseoutTimeout);
      mouseoutTimeout = null;
    }
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
      scrollTimeout = null;
    }
    
    // 하이라이트 제거
    removeHighlight();
    
    console.log('[DOM Capture] 요소 하이라이트 리스너 제거 완료');
  }
  
  
  // localStorage에서 녹화 상태 복원 (새 페이지 로드 시)
  function restoreRecordingState() {
    try {
      const stored = localStorage.getItem('testarchitect_isRecording');
      if (stored === 'true') {
        isRecording = true;
        console.log('[DOM Capture] localStorage에서 녹화 상태 복원: 녹화 중');
        // 하이라이트 리스너 설정
        setupHoverListeners();
      }
    } catch (err) {
      console.error('[DOM Capture] localStorage 읽기 실패:', err);
    }
  }
  
  // localStorage에 녹화 상태 저장
  function saveRecordingState(recording) {
    try {
      localStorage.setItem('testarchitect_isRecording', recording ? 'true' : 'false');
    } catch (err) {
      console.error('[DOM Capture] localStorage 저장 실패:', err);
    }
  }
  
  // 초기화 시 녹화 상태 복원
  restoreRecordingState();
  
  // ============================================================================
  // Chrome Recorder 방식: 사용자 상호작용 추적 (CDP 이벤트 우선, 폴백용)
  // ============================================================================
  const USER_INTERACTION_TO_NAVIGATION_WINDOW = 2000; // 상호작용 후 2초 이내 URL 변경이면 사용자 상호작용으로 인한 것으로 간주
  
  // 상호작용 저장 (sessionStorage 사용: 탭 단위, 페이지 간 공유)
  function saveLastInteraction(type, detail) {
    try {
      const obj = {
        timestamp: Date.now(),
        type: type, // 'pointer' | 'keydown' | 'submit' | 'history' | 'click'
        detail: detail || {}
      };
      sessionStorage.setItem('__testarchitect_lastInteraction__', JSON.stringify(obj));
      // localStorage에도 저장 (페이지 간 공유)
      localStorage.setItem('testarchitect_lastUserInteractionTimestamp', obj.timestamp.toString());
      localStorage.setItem('testarchitect_lastUserInteractionType', type);
      if (detail && typeof detail === 'object') {
        localStorage.setItem('testarchitect_lastUserInteractionDetail', JSON.stringify(detail));
      }
    } catch (err) {
      console.error('[DOM Capture] 상호작용 저장 실패:', err);
    }
  }
  
  // CDP에서 호출할 수 있도록 window에 노출
  window.__testarchitect_saveLastInteraction = saveLastInteraction;
  
  // 상호작용 로드
  function getLastInteraction() {
    try {
      // sessionStorage 우선, 없으면 localStorage
      const sessionData = sessionStorage.getItem('__testarchitect_lastInteraction__');
      if (sessionData) {
        return JSON.parse(sessionData);
      }
      // localStorage에서 복원
      const timestamp = localStorage.getItem('testarchitect_lastUserInteractionTimestamp');
      const type = localStorage.getItem('testarchitect_lastUserInteractionType');
      const detailStr = localStorage.getItem('testarchitect_lastUserInteractionDetail');
      if (timestamp) {
        return {
          timestamp: parseInt(timestamp, 10),
          type: type || null,
          detail: detailStr ? JSON.parse(detailStr) : {}
        };
      }
      return null;
    } catch (err) {
      console.error('[DOM Capture] 상호작용 로드 실패:', err);
      return null;
    }
  }
  
  // 상호작용 초기화
  function clearLastInteraction() {
    try {
      sessionStorage.removeItem('__testarchitect_lastInteraction__');
      localStorage.removeItem('testarchitect_lastUserInteractionTimestamp');
      localStorage.removeItem('testarchitect_lastUserInteractionType');
      localStorage.removeItem('testarchitect_lastUserInteractionDetail');
    } catch (err) {
      // 무시
    }
  }
  
  // CDP에서 호출할 수 있도록 window에 노출
  window.__testarchitect_clearLastInteraction = clearLastInteraction;
  
  // ============================================================================
  // Chrome Recorder 방식: CDP에서 네비게이션 이벤트를 직접 생성하는 함수
  // ============================================================================
  function createNavigationEventFromCDP(url, isUserInteraction, source) {
    // Chrome Recorder 방식: CDP에서 호출되면 녹화 중이므로 localStorage에서도 확인
    const recordingState = isRecording || localStorage.getItem('testarchitect_isRecording') === 'true';
    
    console.log('[DOM Capture] createNavigationEventFromCDP 호출:', {
      url: url,
      isUserInteraction: isUserInteraction,
      source: source,
      isRecording: isRecording,
      localStorageRecording: localStorage.getItem('testarchitect_isRecording'),
      recordingState: recordingState
    });
    
    if (!recordingState) {
      console.warn('[DOM Capture] createNavigationEventFromCDP: 녹화 중이 아님, 스킵');
      return;
    }
    
    const currentUrl = url || window.location.href;
    const currentTitle = document.title;
    
    
    if (isUserInteraction) {
        // 사용자 상호작용으로 인한 이동 → verifyUrl assertion 생성
        const verifyUrlEvent = {
          action: 'verifyUrl',
          value: currentUrl,
          selectors: [],
          target: null,
          iframeContext: null,
          clientRect: null,
          metadata: { 
            domEvent: 'navigation', 
          source: source || 'cdp-user-interaction',
          cdpDetected: true
          },
          domContext: null,
          page: {
            url: currentUrl,
            title: currentTitle
          },
          url: currentUrl,
          primarySelector: currentUrl
        };
        
      console.log('[DOM Capture] CDP에서 verifyUrl 이벤트 생성 시작:', {
        source: source,
        url: currentUrl,
        isRecording: isRecording,
        localStorageRecording: localStorage.getItem('testarchitect_isRecording')
      });
        sendEvent(verifyUrlEvent);
      console.log('[DOM Capture] CDP에서 verifyUrl 이벤트 전송 완료:', source, currentUrl);
      } else {
        // 직접 입력으로 인한 이동 → navigate 이벤트 생성
      // ⭐ replaceState pending 정리 (주소창 직접 입력인 경우)
      if (window.__testarchitect_replaceStatePending) {
        console.log('[DOM Capture] createNavigationEventFromCDP: navigate 이벤트 생성 → replaceState pending 정리');
        delete window.__testarchitect_replaceStatePending;
      }
      
        const navigateEvent = {
          action: 'navigate',
          value: currentUrl,
          selectors: [],
          target: null,
          iframeContext: null,
          clientRect: null,
        metadata: { 
          domEvent: 'navigation', 
          source: source || 'cdp-direct',
          cdpDetected: true
        },
          domContext: null,
          page: {
            url: currentUrl,
            title: currentTitle
          },
          url: currentUrl,
          primarySelector: currentUrl
        };
        
      console.log('[DOM Capture] CDP에서 navigate 이벤트 생성 시작:', {
        source: source,
        url: currentUrl,
        isRecording: isRecording,
        localStorageRecording: localStorage.getItem('testarchitect_isRecording')
      });
        sendEvent(navigateEvent);
      console.log('[DOM Capture] CDP에서 navigate 이벤트 전송 완료:', source, currentUrl);
    }
    
    // 처리된 URL 저장 (Chrome Recorder 방식: CDP에서 처리한 경우를 표시)
    try {
      lastProcessedUrl = currentUrl;
      
      // CDP에서 처리한 시간 기록
      window.__testarchitect_lastProcessTime = Date.now();
      
      console.log('[DOM Capture] CDP 네비게이션 이벤트 생성 완료 - URL 저장:', currentUrl);
      } catch (err) {
        console.error('[DOM Capture] URL 저장 실패:', err);
    }
  }
  
  // CDP에서 호출할 수 있도록 window에 노출
  window.__testarchitect_createNavigationEvent = createNavigationEventFromCDP;
  
  
  function connectWebSocket() {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      return;
    }
    
    const wsUrl = 'ws://localhost:3000';
    console.log('[DOM Capture] WebSocket 연결 시도:', wsUrl);
    
    try {
      wsConnection = new WebSocket(wsUrl);
      
      wsConnection.onopen = () => {
        console.log('[DOM Capture] WebSocket 연결 성공');
      };
      
      wsConnection.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[DOM Capture] 메시지 수신:', message.type);
          if (message.type === 'recording-start') {
            console.log('[DOM Capture] 녹화 시작');
            isRecording = true;
            saveRecordingState(true); // localStorage에 저장
            
            // Chrome Recorder 방식: CDP 이벤트가 URL 변경을 처리
            console.log('[DOM Capture] recording-start: 녹화 시작');
            
            // Chrome Recorder 방식: CDP 이벤트만 사용, 주기적 체크 없음
            // 요소 하이라이트 리스너 설정
            setupHoverListeners();
          } else if (message.type === 'recording-stop') {
            console.log('[DOM Capture] 녹화 중지');
            isRecording = false;
            saveRecordingState(false); // localStorage에 저장
            
            // recordingLastUrl은 유지 (다음 녹화 세션에서 사용)
            // clearRecordingLastUrl() 호출하지 않음
            
            // 요소 하이라이트 리스너 제거
            removeHoverListeners();
          }
        } catch (error) {
          console.error('[DOM Capture] 메시지 파싱 오류:', error);
        }
      };
      
      wsConnection.onerror = (error) => {
        console.error('[DOM Capture] WebSocket 오류:', error);
      };
      
      wsConnection.onclose = () => {
        console.log('[DOM Capture] WebSocket 연결 종료, 재연결 시도...');
        wsConnection = null;
        setTimeout(connectWebSocket, 2000);
      };
    } catch (error) {
      console.error('[DOM Capture] WebSocket 연결 실패:', error);
    }
  }
  
  // 이벤트 전송 함수
  function sendEvent(eventData) {
    // Chrome Recorder 방식: localStorage에서도 녹화 상태 확인 (CDP 이벤트 대응)
    const recordingState = isRecording || localStorage.getItem('testarchitect_isRecording') === 'true';
    
    console.log('[DOM Capture] sendEvent 호출:', {
      action: eventData.action,
      url: eventData.page?.url || eventData.url || '',  // page.url을 우선 사용
      value: eventData.value || '',  // value는 별도로 표시
      isRecording: isRecording,
      localStorageRecording: localStorage.getItem('testarchitect_isRecording'),
      recordingState: recordingState,
      wsConnection: !!wsConnection,
      wsReady: wsConnection ? wsConnection.readyState === WebSocket.OPEN : false
    });
    
    if (!recordingState) {
      console.warn('[DOM Capture] 녹화 중이 아니어서 이벤트 전송 스킵:', eventData.action);
      return;
    }
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
      console.warn('[DOM Capture] WebSocket 연결이 없어서 이벤트 전송 스킵:', eventData.action);
      return;
    }
    
    try {
      const message = {
        type: 'dom-event',
        event: eventData,
        timestamp: Date.now(),
        sessionId: window.__testarchitect_session_id__ || null
      };
      console.log('[DOM Capture] 이벤트 전송:', eventData.action, eventData.page?.url || eventData.url || eventData.value || '');
      wsConnection.send(JSON.stringify(message));
    } catch (error) {
      console.error('[DOM Capture] 이벤트 전송 실패:', error);
    }
  }
  
  // ============================================================================
  // 클릭 이벤트 처리 (record/content.js 참고)
  // ============================================================================
  function handleClick(event) {
    if (!isRecording) return;
    
    // Event.isTrusted 확인 - 사용자 상호작용인지 확인 (Chrome Recorder 방식)
    if (!event.isTrusted) {
      // JavaScript로 생성된 이벤트는 무시 (사용자 상호작용 아님)
      return;
    }
    
    const target = event.target;
    if (!target || target === document.body || target === document.documentElement) return;
    
    // 오버레이 요소는 무시
    if (target.id === '__testarchitect_selector_overlay__' || target.closest('#__testarchitect_selector_overlay__')) {
      return;
    }
    
    // 우클릭은 별도 처리
    if (event.button === 2) {
      handleRightClick(event);
      return;
    }
    
    // 사용자 상호작용 추적 (URL 변경 감지용) - 개선된 버전
    const targetInfo = {
      tag: target.tagName,
      id: target.id || null,
      className: target.className || null,
      href: (target.closest && target.closest('a')) ? target.closest('a').href : null,
      isLink: target.tagName === 'A' || target.closest('a') !== null,
      isButton: target.tagName === 'BUTTON' || target.closest('button') !== null
    };
    
    // 🔍 디버그: 클릭한 요소 타입 정보 출력
    console.log('🖱️ [DOM Capture] 클릭 이벤트 발생:', {
      timestamp: Date.now(),
      elementType: targetInfo.isLink ? '링크(<a>)' : targetInfo.isButton ? '버튼(<button>)' : '기타 요소',
      tag: targetInfo.tag,
      id: targetInfo.id,
      className: targetInfo.className,
      href: targetInfo.href,
      isLink: targetInfo.isLink,
      isButton: targetInfo.isButton,
      text: target.textContent ? target.textContent.substring(0, 50) : null
    });
    
    saveLastInteraction('click', targetInfo);
    
    // 🔍 디버그: 상호작용 정보 저장 확인
    console.log('💾 [DOM Capture] 상호작용 정보 저장 완료:', {
      type: 'click',
      targetInfo: targetInfo,
      timestamp: Date.now()
    });
    
    const rect = target.getBoundingClientRect();
    
    // selectorUtils.js를 사용하여 셀렉터 후보 생성
    let selectorCandidates = [];
    try {
      selectorCandidates = getSelectorCandidatesWithUniqueness(target, {
        requireUnique: false
      });
    } catch (error) {
      console.error('[DOM Capture] 셀렉터 생성 오류:', error);
    }
    
    sendEvent({
      action: 'click',
      target: {
        tag: target.tagName.toLowerCase(),
        id: target.id || null,
        className: target.className || null,
        text: (target.innerText || target.textContent || "").trim().substring(0, 100) || null
      },
      value: target.value || target.textContent?.trim() || null,
      selectorCandidates: selectorCandidates,
      selectors: selectorCandidates.map(c => c.selector || c),
      clientRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      },
      page: {
        url: window.location.href,
        title: document.title
      }
    });
  }
  
  // 더블클릭 이벤트 처리 (record/content.js 참고)
  function handleDoubleClick(event) {
    if (!isRecording) return;
    
    const target = event.target;
    if (!target || target === document.body || target === document.documentElement) return;
    
    // 오버레이 요소는 무시
    if (target.id === '__testarchitect_selector_overlay__' || target.closest('#__testarchitect_selector_overlay__')) {
      return;
    }
    
    const rect = target.getBoundingClientRect();
    
    // selectorUtils.js를 사용하여 셀렉터 후보 생성
    let selectorCandidates = [];
    try {
      selectorCandidates = getSelectorCandidatesWithUniqueness(target, {
        requireUnique: false
      });
    } catch (error) {
      console.error('[DOM Capture] 셀렉터 생성 오류:', error);
    }
    
    sendEvent({
      action: 'doubleClick',
      target: {
        tag: target.tagName.toLowerCase(),
        id: target.id || null,
        className: target.className || null,
        text: (target.innerText || target.textContent || "").trim().substring(0, 100) || null
      },
      value: target.value || target.textContent?.trim() || null,
      selectorCandidates: selectorCandidates,
      selectors: selectorCandidates.map(c => c.selector || c),
      clientRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      },
      page: {
        url: window.location.href,
        title: document.title
      }
    });
  }
  
  // 우클릭 이벤트 처리 (record/content.js 참고)
  function handleRightClick(event) {
    if (!isRecording) return;
    
    // Event.isTrusted 확인 - 사용자 상호작용인지 확인
    if (!event.isTrusted) {
      return;
    }
    
    const target = event.target;
    if (!target || target === document.body || target === document.documentElement) return;
    
    // 오버레이 요소는 무시
    if (target.id === '__testarchitect_selector_overlay__' || target.closest('#__testarchitect_selector_overlay__')) {
      return;
    }
    
    const rect = target.getBoundingClientRect();
    
    // selectorUtils.js를 사용하여 셀렉터 후보 생성
    let selectorCandidates = [];
    try {
      selectorCandidates = getSelectorCandidatesWithUniqueness(target, {
        requireUnique: false
      });
    } catch (error) {
      console.error('[DOM Capture] 셀렉터 생성 오류:', error);
    }
    
    sendEvent({
      action: 'rightClick',
      target: {
        tag: target.tagName.toLowerCase(),
        id: target.id || null,
        className: target.className || null,
        text: (target.innerText || target.textContent || "").trim().substring(0, 100) || null
      },
      value: target.value || target.textContent?.trim() || null,
      selectorCandidates: selectorCandidates,
      selectors: selectorCandidates.map(c => c.selector || c),
      clientRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      },
      page: {
        url: window.location.href,
        title: document.title
      }
    });
  }
  
  // SELECT 요소의 change 이벤트 처리 (record/content.js 참고)
  function handleSelect(event) {
    if (!isRecording) return;
    
    // Event.isTrusted 확인 - 사용자 상호작용인지 확인
    if (!event.isTrusted) {
      return;
    }
    
    const target = event.target;
    if (!target || target.tagName !== 'SELECT') return;
    
    // 오버레이 요소는 무시
    if (target.id === '__testarchitect_selector_overlay__' || target.closest('#__testarchitect_selector_overlay__')) {
      return;
    }
    
    const selectedOption = target.options[target.selectedIndex];
    const value = selectedOption ? (selectedOption.text || selectedOption.value || '') : '';
    
    const rect = target.getBoundingClientRect();
    
    // selectorUtils.js를 사용하여 셀렉터 후보 생성
    let selectorCandidates = [];
    try {
      selectorCandidates = getSelectorCandidatesWithUniqueness(target, {
        requireUnique: false
      });
    } catch (error) {
      console.error('[DOM Capture] 셀렉터 생성 오류:', error);
    }
    
    sendEvent({
      action: 'select',
      target: {
        tag: target.tagName.toLowerCase(),
        id: target.id || null,
        className: target.className || null
      },
      value: value,
      selectorCandidates: selectorCandidates,
      selectors: selectorCandidates.map(c => c.selector || c),
      clientRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      },
      page: {
        url: window.location.href,
        title: document.title
      }
    });
  }
  
  // ============================================================================
  // 개선된 상호작용 감지: pointerdown, mousedown 이벤트 추가
  // ============================================================================
  // pointerdown/mousedown 이벤트로 더 빠른 상호작용 감지
  ['pointerdown', 'mousedown'].forEach(eventType => {
    document.addEventListener(eventType, (e) => {
      if (!isRecording) return;
      
      // Event.isTrusted 확인 - 사용자 상호작용인지 확인
      if (!e.isTrusted) {
        return;
      }
      
      const target = e.target;
      if (!target || target === document.body || target === document.documentElement) return;
      if (target.id === '__testarchitect_selector_overlay__' || target.closest('#__testarchitect_selector_overlay__')) return;
      
      const targetInfo = {
        tag: target.tagName,
        id: target.id || null,
        className: target.className || null,
        href: (target.closest && target.closest('a')) ? target.closest('a').href : null,
        isLink: target.tagName === 'A' || target.closest('a') !== null,
        isButton: target.tagName === 'BUTTON' || target.closest('button') !== null
      };
      saveLastInteraction('pointer', targetInfo);
    }, true);
  });
  
  // 클릭 이벤트 리스너 등록
  document.addEventListener('click', handleClick, true);
  
  // 더블클릭 이벤트 리스너 등록
  document.addEventListener('dblclick', handleDoubleClick, true);
  
  // 우클릭 이벤트 리스너 등록 (contextmenu)
  document.addEventListener('contextmenu', handleRightClick, true);
  
  // SELECT 요소의 change 이벤트 리스너 등록
  document.addEventListener('change', handleSelect, true);
  
  // ============================================================================
  // 입력 이벤트 디바운싱 (record/content.js 참고)
  // ============================================================================
  const INPUT_DEBOUNCE_DELAY = 800; // 800ms 디바운스 (record/content.js와 동일)
  const inputTimers = new WeakMap(); // 각 요소별 타이머 관리
  
  // 입력 이벤트 처리 (디바운싱 적용)
  function handleInput(event) {
    if (!isRecording) return;
    
    const target = event.target;
    if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable)) {
      return;
    }
    
    // 기존 타이머가 있으면 취소
    const existingTimer = inputTimers.get(target);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // 새 타이머 설정 (800ms 후 이벤트 기록)
    const timer = setTimeout(() => {
      const currentValue = target.value || target.textContent || '';
      
      // selectorUtils.js를 사용하여 셀렉터 후보 생성
      let selectorCandidates = [];
      try {
        selectorCandidates = getSelectorCandidatesWithUniqueness(target, {
          requireUnique: false
        });
      } catch (error) {
        console.error('[DOM Capture] 셀렉터 생성 오류:', error);
      }
      
      // 빈 값이면 clear 액션, 아니면 input 액션
      const action = currentValue === '' ? 'clear' : 'input';
      
      sendEvent({
        action: action,
        target: {
          tag: target.tagName ? target.tagName.toLowerCase() : null,
          id: target.id || null,
          className: target.className || null,
          type: target.type || null
        },
        value: currentValue || null,
        selectorCandidates: selectorCandidates,
        selectors: selectorCandidates.map(c => c.selector || c),
        page: {
          url: window.location.href,
          title: document.title
        }
      });
      
      // 타이머 제거
      inputTimers.delete(target);
    }, INPUT_DEBOUNCE_DELAY);
    
    inputTimers.set(target, timer);
  }
  
  // blur 이벤트 처리 (입력 필드에서 포커스를 잃을 때 즉시 기록)
  function handleBlur(event) {
    if (!isRecording) return;
    
    const target = event.target;
    if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable)) {
      return;
    }
    
    // 타이머가 있으면 즉시 실행하고 취소
    const existingTimer = inputTimers.get(target);
    if (existingTimer) {
      clearTimeout(existingTimer);
      inputTimers.delete(target);
      
      const currentValue = target.value || target.textContent || '';
      
      // selectorUtils.js를 사용하여 셀렉터 후보 생성
      let selectorCandidates = [];
      try {
        selectorCandidates = getSelectorCandidatesWithUniqueness(target, {
          requireUnique: false
        });
      } catch (error) {
        console.error('[DOM Capture] 셀렉터 생성 오류:', error);
      }
      
      // 빈 값이면 clear 액션, 아니면 input 액션
      const action = currentValue === '' ? 'clear' : 'input';
      
      sendEvent({
        action: action,
        target: {
          tag: target.tagName ? target.tagName.toLowerCase() : null,
          id: target.id || null,
          className: target.className || null,
          type: target.type || null
        },
        value: currentValue || null,
        selectorCandidates: selectorCandidates,
        selectors: selectorCandidates.map(c => c.selector || c),
        page: {
          url: window.location.href,
          title: document.title
        }
      });
    }
  }
  
  // 입력 이벤트 리스너 등록
  document.addEventListener('input', handleInput, true);
  
  // blur 이벤트 리스너 등록 (입력 필드에서 포커스를 잃을 때)
  document.addEventListener('blur', handleBlur, true);
  
  // ============================================================================
  // SPA URL 변경 감지 (Chrome Recorder 방식)
  // ============================================================================
  // history.pushState/replaceState override + popstate + hashchange
  // recorder-url-changed 커스텀 이벤트 발생 → verify step 생성
  
  // 1. history.pushState / replaceState override
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  function dispatchUrlChangedEvent(method, url) {
    if (isRecording && url) {
      // 약간의 지연을 두어 URL이 완전히 변경될 시간 확보
      setTimeout(() => {
        const currentUrl = window.location.href;
        // recorder-url-changed 커스텀 이벤트 발생
        window.dispatchEvent(new CustomEvent('recorder-url-changed', {
          detail: {
            url: currentUrl,
            method: method,
            timestamp: Date.now()
          }
        }));
        console.log('[DOM Capture] recorder-url-changed 이벤트 발생:', {
          method: method,
          url: currentUrl
        });
      }, 10);
    }
  }
  
  history.pushState = function(state, title, url) {
    const result = originalPushState.apply(history, arguments);
    if (isRecording) {
      // pushState는 사용자 상호작용으로 인한 것으로 간주 (SPA 네비게이션)
      saveLastInteraction('history', {
        method: 'pushState',
        url: url || null,
        state: state ? (typeof state === 'object' ? 'object' : String(state)) : null
      });
      console.log('[DOM Capture] history.pushState 감지:', url);
      // recorder-url-changed 이벤트 발생
      dispatchUrlChangedEvent('pushState', url);
    }
    return result;
  };
  
  history.replaceState = function(state, title, url) {
    const result = originalReplaceState.apply(history, arguments);
    if (isRecording) {
      console.log('[DOM Capture] history.replaceState 감지:', url);
      
      // ⭐ 주소창 직접 입력일 수 있으므로 CDP 이벤트를 기다림
      // CDP에서 typed/addressBar reason이 오면 navigate로 처리해야 함
      const currentUrl = window.location.href;
      window.__testarchitect_replaceStatePending = {
        url: currentUrl,
        method: 'replaceState',
        timestamp: Date.now()
      };
      
      console.log('[DOM Capture] history.replaceState: CDP 이벤트 대기 중 (주소창 직접 입력 가능)', {
        url: currentUrl,
        pending: true
      });
      
      // CDP 이벤트를 기다리는 시간 (최대 1000ms)
      // CDP 이벤트가 오지 않으면 SPA로 처리
      setTimeout(() => {
        if (window.__testarchitect_replaceStatePending) {
          const pending = window.__testarchitect_replaceStatePending;
          delete window.__testarchitect_replaceStatePending;
          console.log('[DOM Capture] history.replaceState: CDP 이벤트 미도착, SPA로 처리', {
            url: pending.url,
            method: pending.method
          });
          // SPA로 처리
          dispatchUrlChangedEvent(pending.method, pending.url);
        }
      }, 1000);
    }
    return result;
  };
  
  // 2. popstate 이벤트 (뒤로가기/앞으로가기)
  window.addEventListener('popstate', (event) => {
    if (isRecording) {
      // popstate는 브라우저 네비게이션 (사용자 상호작용)
      console.log('[DOM Capture] popstate 이벤트 감지 (뒤로가기/앞으로가기)');
      // recorder-url-changed 이벤트 발생
      dispatchUrlChangedEvent('popstate', window.location.href);
    }
  });
  
  // 3. hashchange 이벤트 (#fragment 변경)
  window.addEventListener('hashchange', (event) => {
    if (isRecording) {
      console.log('[DOM Capture] hashchange 이벤트 감지:', window.location.href);
      // recorder-url-changed 이벤트 발생
      dispatchUrlChangedEvent('hashchange', window.location.href);
    }
  });
  
  // 연속 pushState 디바운싱 (짧은 시간에 여러 pushState가 발생해도 하나의 step으로 처리)
  let spaUrlChangeTimeout = null;
  let lastSpaUrl = null;
  let lastSpaMethod = null;
  
  // recorder-url-changed 이벤트 리스너 (WebSocket으로 전송)
  window.addEventListener('recorder-url-changed', (event) => {
    if (!isRecording) return;
    
    const { url, method, timestamp } = event.detail;
    
    // ⭐ replaceState의 경우 CDP 이벤트를 기다리는 중이면 스킵
    if (method === 'replaceState' && window.__testarchitect_replaceStatePending) {
      console.log('[DOM Capture] recorder-url-changed: replaceState pending 중이므로 스킵 (CDP 이벤트 대기)');
      return;
    }
    
    // CDP의 navigatedWithinDocument와 중복 방지
    // CDP에서 처리한 경우 window.__testarchitect_lastProcessTime를 확인
    const lastProcessTime = window.__testarchitect_lastProcessTime || 0;
    const timeSinceLastProcess = Date.now() - lastProcessTime;
    
    // CDP에서 최근 500ms 이내에 처리했다면 스킵 (중복 방지)
    if (timeSinceLastProcess < 500) {
      console.log('[DOM Capture] recorder-url-changed: CDP에서 최근 처리했으므로 스킵 (중복 방지)', {
        url: url,
        method: method,
        timeSinceLastProcess: timeSinceLastProcess
      });
      return;
    }
    
    console.log('[DOM Capture] recorder-url-changed 이벤트 처리:', {
      url: url,
      method: method,
      timestamp: timestamp
    });
    
    // 연속 pushState 디바운싱 (300ms 내에 같은 URL이면 마지막 것만 처리)
    if (spaUrlChangeTimeout) {
      clearTimeout(spaUrlChangeTimeout);
    }
    
    lastSpaUrl = url;
    lastSpaMethod = method;
    
    spaUrlChangeTimeout = setTimeout(() => {
      if (!lastSpaUrl) return;
      
      // 사용자 상호작용 정보 확인
      const lastInteraction = getLastInteraction();
      const isUserInteraction = lastInteraction && 
                               (lastInteraction.type === 'click' || 
                                lastInteraction.type === 'submit' || 
                                lastInteraction.type === 'history') &&
                               (Date.now() - lastInteraction.timestamp) < USER_INTERACTION_TO_NAVIGATION_WINDOW;
      
      // verifyUrl 이벤트 생성 (SPA URL 변경은 항상 verify)
      const verifyUrlEvent = {
        action: 'verifyUrl',
        value: lastSpaUrl,
        selectors: [],
        target: null,
        iframeContext: null,
        clientRect: null,
        metadata: {
          domEvent: 'navigation',
          source: 'spa-' + lastSpaMethod, // spa-pushState, spa-replaceState, spa-popstate, spa-hashchange
          cdpDetected: false, // Content Script에서 감지
          isSPANavigation: true
        },
        domContext: null,
        page: {
          url: lastSpaUrl,
          title: document.title
        },
        url: lastSpaUrl,
        primarySelector: lastSpaUrl
      };
      
      console.log('[DOM Capture] SPA URL 변경 → verifyUrl 이벤트 생성:', {
        url: lastSpaUrl,
        method: lastSpaMethod,
        isUserInteraction: isUserInteraction
      });
      
      sendEvent(verifyUrlEvent);
      
      // 초기화
      lastSpaUrl = null;
      lastSpaMethod = null;
      spaUrlChangeTimeout = null;
    }, 300); // 300ms 디바운싱
  });
  
  // ============================================================================
  // 키보드 이벤트 감지 (엔터 키로 인한 폼 제출 등)
  // ============================================================================
  document.addEventListener('keydown', (event) => {
    if (!isRecording) return;
    
    // Event.isTrusted 확인 - 사용자 상호작용인지 확인
    if (!event.isTrusted) {
      return;
    }
    
    // 엔터 키 입력 감지 (검색창 등에서 URL 변경 가능)
    // 주의: 주소창에 직접 입력 후 엔터는 감지할 수 없으므로 navigate로 처리됨
    if (event.key === 'Enter' || event.keyCode === 13) {
      const target = event.target;
      // 페이지 내부의 INPUT, TEXTAREA, 또는 contentEditable 요소에서만 엔터 입력 감지
      // 주소창은 document.body나 document.documentElement가 target이 되므로 제외됨
      if (target && 
          target !== document.body && 
          target !== document.documentElement &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        saveLastInteraction('keydown', {
          key: event.key,
          keyCode: event.keyCode,
          tag: target.tagName,
          id: target.id || null,
          type: target.type || null
        });
        console.log('[DOM Capture] 페이지 내부 엔터 키 입력 감지 (URL 변경 가능):', target.tagName);
      } else {
        // 주소창 입력 등은 사용자 상호작용으로 간주하지 않음
        console.log('[DOM Capture] 엔터 키 입력 감지 (주소창 또는 기타): navigate로 처리됨');
      }
    }
  }, true);
  
  // ============================================================================
  // 폼 제출 이벤트 감지
  // ============================================================================
  document.addEventListener('submit', (event) => {
    if (!isRecording) return;
    
    // Event.isTrusted 확인 - 사용자 상호작용인지 확인
    if (!event.isTrusted) {
      return;
    }
    
    const target = event.target;
    if (target && target.tagName === 'FORM') {
      saveLastInteraction('submit', {
        formAction: target.action || null,
        formMethod: target.method || null
      });
      console.log('[DOM Capture] 폼 제출 감지 (URL 변경 가능)');
    }
  }, true);
  
  // beforeunload 이벤트에서 하이라이트 리스너만 정리
  window.addEventListener('beforeunload', () => {
    // 하이라이트 리스너 정리
    removeHoverListeners();
  });
  
  // WebSocket 연결 시작
  connectWebSocket();
  
  // 초기에는 하이라이트 리스너를 추가하지 않음 (녹화 시작 시에만 추가)
  // setupHoverListeners()는 recording-start 메시지를 받을 때 호출됨
  
  console.log('[DOM Capture] DOM 이벤트 캡처 스크립트 초기화 완료');
})();
`.trim();
    
    // CDP WebSocket 연결 (IPv4 사용)
    const wsUrl = targetTab.webSocketDebuggerUrl.replace('::1', '127.0.0.1').replace('[::1]', '127.0.0.1');
    console.log('🔌 CDP WebSocket 연결 시도:', wsUrl);
    
    // 기존 연결이 있으면 닫기
    if (globalCdpWs && globalCdpWs.readyState === WebSocket.OPEN) {
      console.log('🔌 기존 CDP WebSocket 연결 종료');
      globalCdpWs.close();
      globalCdpWs = null;
    }
    
    const cdpWs = new WebSocket(wsUrl);
    globalCdpWs = cdpWs; // 전역 변수에 저장 (URL 변경 감지를 위해 유지)
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (cdpWs.readyState !== WebSocket.OPEN) {
          cdpWs.close();
          globalCdpWs = null;
          reject(new Error('CDP WebSocket 연결 타임아웃'));
        }
      }, 10000);
      
      cdpWs.on('open', () => {
        console.log('✅ CDP WebSocket 연결 성공 (URL 변경 감지를 위해 연결 유지)');
        clearTimeout(timeout);
        
        let commandsSent = 0;
        const totalCommands = 7; // Page.getFrameTree 추가
        
        const checkComplete = () => {
          commandsSent++;
          if (commandsSent >= totalCommands) {
            console.log('✅ 모든 DOM 이벤트 캡처 스크립트 주입 명령 전송 완료');
            // CDP WebSocket은 URL 변경 감지를 위해 계속 열어둠 (닫지 않음)
            resolve();
          }
        };
        
        // Page.enable
        cdpWs.send(JSON.stringify({
          id: 1,
          method: 'Page.enable'
        }));
        checkComplete();
        
        // Runtime.enable
        cdpWs.send(JSON.stringify({
          id: 2,
          method: 'Runtime.enable'
        }));
        checkComplete();
        
        // Network.enable - Network 이벤트 활성화 (Document 요청 감지용)
        cdpWs.send(JSON.stringify({
          id: 6,
          method: 'Network.enable'
        }));
        checkComplete();
        
        // Page.setLifecycleEventsEnabled - 페이지 생명주기 이벤트 활성화
        cdpWs.send(JSON.stringify({
          id: 3,
          method: 'Page.setLifecycleEventsEnabled',
          params: { enabled: true }
        }));
        checkComplete();
        
        // Page.addScriptToEvaluateOnNewDocument 실행 (새 페이지 로드 시 자동 실행)
        cdpWs.send(JSON.stringify({
          id: 4,
          method: 'Page.addScriptToEvaluateOnNewDocument',
          params: {
            source: domCaptureScript
          }
        }));
        checkComplete();
        
        // Runtime.evaluate로 현재 페이지에도 주입
        cdpWs.send(JSON.stringify({
          id: 5,
          method: 'Runtime.evaluate',
          params: {
            expression: domCaptureScript,
            userGesture: false,
            returnByValue: false
          }
        }));
        checkComplete();
        
        // Page.setBypassCSP - CSP 우회 (필요한 경우, 선택적)
        // 주의: 보안상의 이유로 필요한 경우에만 활성화
        // checkComplete(); // 현재는 사용하지 않음
        
        // CDP 응답 수신 (에러 처리 및 이벤트 감지)
        // Chrome Recorder 방식: navigationReason과 navigationType을 저장하기 위한 변수
        let lastNavigationReason = null;
        let lastNavigationFrameId = null;
        let lastNavigationUrl = null;
        let lastNavigationType = null; // Page.frameStartedNavigating의 navigationType 저장
        
        // Redirect 체인 추적: loaderId -> 최종 URL 매핑
        const redirectChain = new Map(); // loaderId -> url (같은 loaderId로 들어온 마지막 URL이 최종 URL)
        
        // 네비게이션 컨텍스트: frameId -> { 
        //   loaderId, url, navigationType, navigationReason, started,
        //   candidateNavigate, documentRequested, lifecycleCommit, reason
        // }
        const navigationContext = new Map();
        
        // 메인 프레임 ID 저장 (Page.getFrameTree로 확인)
        let mainFrameIdFromTree = null;
        let mainFrameIdConfirmed = false; // Page.getFrameTree 응답 받았는지 확인
        
        // 메인 프레임 판단 헬퍼 함수 (강화된 로직)
        const isMainFrame = (frameId, parentFrameId, reason, disposition) => {
          // 1. Page.getFrameTree에서 확인한 메인 프레임 ID와 일치 (가장 확실)
          if (mainFrameIdFromTree && frameId === mainFrameIdFromTree) {
            return true;
          }
          
          // 2. parentFrameId가 없고, disposition이 currentTab이면 메인 프레임 가능성 높음
          if (!parentFrameId && disposition === 'currentTab') {
            // 주소창 직접 입력 (typed) 또는 초기 프레임 로드 (initialFrameNavigation)는 메인 프레임
            if (reason === 'typed' || reason === 'initialFrameNavigation') {
              return true;
            }
            // 다른 reason이어도 parentFrameId가 없으면 메인 프레임으로 간주
            return true;
          }
          
          // 3. frameId가 없거나 'main'이면 메인 프레임 (폴백)
          if (!frameId || frameId === 'main' || frameId === null || frameId === undefined) {
            return true;
          }
          
          return false;
        };
        
        // Page.getFrameTree로 메인 프레임 ID 확인
        cdpWs.send(JSON.stringify({
          id: 7,
          method: 'Page.getFrameTree'
        }));
        
        cdpWs.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            if (message.error) {
              console.error('❌ CDP 명령 오류:', message.error);
            } else if (message.id && message.id <= 7) {
              console.log(`✅ CDP 명령 ${message.id} 완료`);
              
              // Page.getFrameTree 응답 처리
              if (message.id === 7 && message.result && message.result.frameTree) {
                const frameTree = message.result.frameTree;
                mainFrameIdFromTree = frameTree.frame.id;
                mainFrameIdConfirmed = true;
                console.log('🎯 [CDP] 메인 프레임 ID 확인:', {
                  mainFrameId: mainFrameIdFromTree,
                  url: frameTree.frame.url ? frameTree.frame.url.substring(0, 100) : null
                });
              }
            }
            
            // 🔍 디버그: Page 관련 CDP 메시지 로그
            if (message.method && (
              message.method.includes('Page.') || 
              message.method.includes('Navigation')
            )) {
              // params의 실제 값 표시 (URL은 축약)
              const paramsDetail = message.params ? Object.keys(message.params).reduce((acc, key) => {
                let value = message.params[key];
                if (key === 'url' && typeof value === 'string') {
                  // URL은 100자로 제한
                  value = value.length > 100 ? value.substring(0, 100) + '...' : value;
                } else if (key === 'frame' && typeof value === 'object') {
                  // frame 객체는 주요 필드만 표시
                  value = {
                    id: value.id,
                    url: value.url ? (value.url.length > 50 ? value.url.substring(0, 50) + '...' : value.url) : value.url,
                    parentId: value.parentId
                  };
                }
                acc[key] = value;
                return acc;
              }, {}) : null;
              
              // frameId가 있는 경우 메인 프레임 여부 표시
              const frameId = message.params && message.params.frameId;
              const isMainFrame = !frameId || frameId === 'main' || frameId === null || frameId === undefined;
              
              console.log('📡 [CDP] 메시지 수신:', {
                method: message.method,
                params: paramsDetail,
                isMainFrame: isMainFrame,
                frameId: frameId || 'null/undefined',
                timestamp: Date.now()
              });
            }
            
            // ============================================================================
            // Page.frameRequestedNavigation 이벤트 감지 (최신 Chrome 방식)
            // ============================================================================
            // FrameRequestedNavigationEvent: { frameId, reason, url, disposition }
            // reason: "linkClicked" | "formSubmitted" | "scriptInitiated" | "reload" | "typed" | etc.
            // disposition: 'currentTab' | 'newTab' | 'newWindow' | 'download'
            // Recorder의 핵심: reason으로 navigate/verify 판단 시작
            if (message.method === 'Page.frameRequestedNavigation') {
              const frameId = message.params && message.params.frameId;
              const reason = message.params && message.params.reason; // ⭐ 핵심: reason 직접 추출
              const url = message.params && message.params.url;
              const disposition = message.params && message.params.disposition;
              const parentFrameId = message.params && message.params.parentFrameId;
              
              // ⭐ 모든 frameRequestedNavigation 이벤트 로그 출력 (디버깅)
              const isMainFrameResult = isMainFrame(frameId, parentFrameId, reason, disposition);
              console.log('📡 [CDP] Page.frameRequestedNavigation (모든 프레임):', {
                frameId: frameId || 'null/undefined',
                reason: reason || 'unknown',
                url: url ? url.substring(0, 100) : null,
                disposition: disposition || 'unknown',
                parentFrameId: parentFrameId || 'none',
                isMainFrameFromTree: mainFrameIdFromTree ? (frameId === mainFrameIdFromTree) : 'unknown',
                isMainFrameByParent: !parentFrameId,
                isMainFrameByReason: (reason === 'typed' || reason === 'initialFrameNavigation') && !parentFrameId && disposition === 'currentTab',
                isMainFrameFinal: isMainFrameResult,
                mainFrameIdConfirmed: mainFrameIdConfirmed
              });
              
              // 메인 프레임 판단 (강화된 로직 사용)
              if (!isMainFrameResult) {
                console.log('[CDP] Page.frameRequestedNavigation: 서브프레임 무시:', {
                  frameId: frameId,
                  url: url ? url.substring(0, 100) : null,
                  reason: reason,
                  parentFrameId: parentFrameId
                });
                return;
              }
              
              // disposition이 'currentTab'이 아니면 현재 탭 네비게이션이 아니므로 무시
              if (disposition !== 'currentTab') {
                console.log('[CDP] Page.frameRequestedNavigation: currentTab이 아니므로 무시:', {
                  disposition: disposition,
                  url: url ? url.substring(0, 100) : null
                });
                return;
              }
              
              console.log('🔗 [CDP] Page.frameRequestedNavigation 감지 (원인 저장):', {
                frameId: frameId || 'main',
                reason: reason || 'unknown',
                url: url ? url.substring(0, 100) : null,
                disposition: disposition || 'unknown'
              });
              
              // ⭐ 주소창 직접 입력 감지: replaceState pending 취소
              if (reason === 'typed' && window.__testarchitect_replaceStatePending) {
                console.log('[CDP] Page.frameRequestedNavigation: typed 감지 → replaceState pending 취소 (navigate로 처리)');
                delete window.__testarchitect_replaceStatePending;
              }
              
              // ⭐ 메인 프레임 ID 동적 업데이트 (Page.getFrameTree 응답 전에 이벤트가 올 수 있음)
              // parentFrameId가 없고, disposition이 currentTab이면 메인 프레임으로 간주
              if (!mainFrameIdConfirmed && !parentFrameId && disposition === 'currentTab') {
                if (reason === 'typed' || reason === 'initialFrameNavigation') {
                  // 주소창 직접 입력이나 초기 프레임 로드는 확실히 메인 프레임
                  if (!mainFrameIdFromTree || mainFrameIdFromTree !== frameId) {
                    mainFrameIdFromTree = frameId;
                    console.log('🎯 [CDP] 메인 프레임 ID 동적 업데이트 (frameRequestedNavigation):', {
                      mainFrameId: mainFrameIdFromTree,
                      reason: reason,
                      url: url ? url.substring(0, 100) : null
                    });
                  }
                }
              }
              
              // frameRequestedNavigation은 "의도"만 알려줌
              // reason을 저장하고, 실제 이벤트 생성은 lifecycle.commit에서 수행
              const mainFrameId = frameId || 'main';
              
              // 네비게이션 컨텍스트 초기화 또는 업데이트
              if (!navigationContext.has(mainFrameId)) {
                navigationContext.set(mainFrameId, {
                  url: url,
                  reason: reason, // ⭐ reason 직접 저장
                  navigationReason: lastNavigationReason, // navigationInitiatedByUser에서 받은 값 (폴백)
                  navigationType: null,
                  started: false,
                  loaderId: null,
                  candidateNavigate: false,
                  documentRequested: false,
                  lifecycleCommit: false
                });
              } else {
                const nav = navigationContext.get(mainFrameId);
                nav.url = url;
                nav.reason = reason; // ⭐ reason 직접 저장
                nav.navigationReason = lastNavigationReason;
              }
              
              console.log('[CDP] Page.frameRequestedNavigation: 네비게이션 컨텍스트 저장', {
                frameId: mainFrameId,
                url: url,
                reason: reason,
                navigationReason: lastNavigationReason
              });
            }
            
            // ============================================================================
            // Page.frameStartedNavigating 이벤트 감지 (최신 Chrome 방식)
            // ============================================================================
            // FrameStartedNavigatingEvent: { frameId, loaderId, url, navigationType?, isErrorPage? }
            // navigationType: "differentDocument" | "sameDocument" (⭐ 핵심: 문서 교체 여부)
            // 또는 "reload" | "linkClicked" | "formSubmitted" | "other" (구버전)
            // 핵심: loaderId로 redirect 체인을 묶고, differentDocument면 candidateNavigate = true
            if (message.method === 'Page.frameStartedNavigating') {
              const frameId = message.params && message.params.frameId;
              const loaderId = message.params && message.params.loaderId;
              const url = message.params && message.params.url;
              const navigationType = message.params && message.params.navigationType;
              const isErrorPage = message.params && message.params.isErrorPage;
              
              // 메인 프레임 판단 (강화된 로직 사용)
              // frameStartedNavigating에는 reason과 disposition이 없으므로 frameId와 mainFrameIdFromTree로만 판단
              const isMainFrameResult = mainFrameIdFromTree ? (frameId === mainFrameIdFromTree) :
                                       !frameId || frameId === 'main' || frameId === null || frameId === undefined;
              
              if (!isMainFrameResult) {
                console.log('[CDP] Page.frameStartedNavigating: 서브프레임 무시:', {
                  frameId: frameId,
                  url: url ? url.substring(0, 100) : null,
                  navigationType: navigationType,
                  isMainFrameFromTree: mainFrameIdFromTree ? (frameId === mainFrameIdFromTree) : 'unknown'
                });
                return;
              }
              
              const mainFrameId = frameId || 'main';
              
              // 필터링: chrome://, about: 내부 페이지 제거 (단, about:srcdoc은 iframe이므로 무시)
              if (url && (url.startsWith('chrome://') || (url.startsWith('about:') && url !== 'about:blank'))) {
                console.log('[CDP] Page.frameStartedNavigating: 내부 페이지 무시:', url);
                return;
              }
              
              // 필터링: 에러 페이지는 verify만 가능 (navigate 불가)
              if (isErrorPage === true) {
                console.log('[CDP] Page.frameStartedNavigating: 에러 페이지 감지:', url);
                // 에러 페이지는 별도 처리 (현재는 스킵)
                return;
              }
              
              console.log('🚀 [CDP] Page.frameStartedNavigating 감지 (네비게이션 시작):', {
                frameId: mainFrameId,
                loaderId: loaderId || 'unknown',
                url: url ? url.substring(0, 100) : null,
                navigationType: navigationType || 'unknown',
                isErrorPage: isErrorPage || false
              });
              
              // loaderId로 redirect 체인 추적 (같은 loaderId의 마지막 URL이 최종 URL)
              if (loaderId && url) {
                redirectChain.set(loaderId, url);
                console.log('[CDP] Page.frameStartedNavigating: redirect 체인 업데이트', {
                  loaderId: loaderId,
                  url: url,
                  chainLength: redirectChain.size
                });
              }
              
              // 네비게이션 컨텍스트 업데이트
              if (!navigationContext.has(mainFrameId)) {
                navigationContext.set(mainFrameId, {
                  url: url,
                  reason: null,
                  navigationReason: lastNavigationReason,
                  navigationType: navigationType,
                  started: true,
                  loaderId: loaderId,
                  candidateNavigate: false,
                  documentRequested: false,
                  lifecycleCommit: false
                });
              } else {
                const nav = navigationContext.get(mainFrameId);
                nav.navigationType = navigationType;
                nav.started = true;
                nav.loaderId = loaderId;
                if (url) {
                  nav.url = url;
                }
              }
              
              // ⭐ 핵심: navigationType이 "differentDocument"면 candidateNavigate = true
              const nav = navigationContext.get(mainFrameId);
              if (navigationType === 'differentDocument') {
                nav.candidateNavigate = true;
                console.log('[CDP] Page.frameStartedNavigating: differentDocument 감지 → candidateNavigate = true');
              } else if (navigationType === 'sameDocument') {
                nav.candidateNavigate = false;
                console.log('[CDP] Page.frameStartedNavigating: sameDocument 감지 → candidateNavigate = false (SPA)');
              }
              
              // navigationType 저장 (navigate/verifyUrl 구분에 사용)
              lastNavigationType = navigationType || null;
              lastNavigationFrameId = mainFrameId;
              lastNavigationUrl = url;
              
              console.log('[CDP] Page.frameStartedNavigating: 네비게이션 컨텍스트 업데이트', {
                navigationType: navigationType,
                candidateNavigate: nav.candidateNavigate,
                loaderId: loaderId
              });
            }
            
            // ============================================================================
            // Page.navigationInitiatedByUser 이벤트 감지 (Chrome Recorder 핵심 신호)
            // ============================================================================
            // 이 이벤트는 Page.frameNavigated보다 먼저 발생하므로, navigationReason을 저장해두었다가
            // Page.frameNavigated에서 활용
            // 우선순위: navigationInitiatedByUser > frameRequestedNavigation
            if (message.method === 'Page.navigationInitiatedByUser') {
              const frameId = message.params && message.params.frameId;
              const navigationReason = message.params && message.params.navigationReason;
              
              // 메인 프레임만 처리
              if (frameId && frameId !== 'main') {
                console.log('[CDP] 서브프레임 navigationInitiatedByUser 무시:', navigationReason);
                return;
              }
              
              lastNavigationReason = navigationReason;
              lastNavigationFrameId = frameId;
              
              // ⭐ 주소창 직접 입력 감지: replaceState pending 취소
              if (navigationReason === 'addressBar' && window.__testarchitect_replaceStatePending) {
                console.log('[CDP] Page.navigationInitiatedByUser: addressBar 감지 → replaceState pending 취소 (navigate로 처리)');
                delete window.__testarchitect_replaceStatePending;
              }
              
              console.log('🎯 [CDP] Page.navigationInitiatedByUser 감지:', {
                frameId: frameId || 'main',
                navigationReason: navigationReason || 'unknown',
                description: navigationReason === 'addressBar' ? '주소창 직접 입력' : 
                             navigationReason === 'linkClick' ? '링크 클릭' : 
                             navigationReason === 'formSubmissionGet' || navigationReason === 'formSubmissionPost' ? '폼 제출' :
                             '기타'
              });
              
              // Chrome Recorder 방식: navigationReason에 따라 즉시 판단 가능
              // 하지만 실제 URL 변경은 Page.frameNavigated에서 처리하므로 여기서는 정보만 저장
            }
            
            // ============================================================================
            // Page.navigatedWithinDocument 이벤트 감지 (SPA 내부 네비게이션 - pushState/replaceState)
            // ============================================================================
            // 최신 Chrome: SPA 내부 네비게이션은 navigatedWithinDocument로 처리
            // 사용자 상호작용으로 인한 것으로 간주하여 verifyUrl 생성
            if (message.method === 'Page.navigatedWithinDocument') {
              const url = message.params && message.params.url;
              const frameId = message.params && message.params.frameId;
              
              // 메인 프레임만 처리
              if (frameId && frameId !== 'main') {
                console.log('[CDP] 서브프레임 내부 네비게이션 무시:', url);
                return;
              }
              
              console.log('📄 [CDP] Page.navigatedWithinDocument 감지 (SPA 내부 네비게이션):', url);
              
              // SPA 내부 네비게이션은 사용자 상호작용으로 인한 것으로 간주 → verifyUrl 생성
              if (cdpWs.readyState === WebSocket.OPEN && url && globalRecordingState) {
                try {
                  const escapedUrl = JSON.stringify(url);
                cdpWs.send(JSON.stringify({
                  id: Date.now(),
                  method: 'Runtime.evaluate',
                  params: {
                      expression: `
                        (function() {
                          const currentUrl = window.location.href;
                          const targetUrl = ${escapedUrl};
                          
                          // URL이 변경되었는지 확인
                          if (currentUrl === targetUrl || currentUrl.startsWith(targetUrl.split('?')[0])) {
                            // SPA 내부 네비게이션은 사용자 상호작용으로 간주 → verifyUrl
                            if (window.__testarchitect_createNavigationEvent) {
                              window.__testarchitect_createNavigationEvent(currentUrl, true, 'cdp-navigatedWithinDocument');
                              console.log('[DOM Capture] Page.navigatedWithinDocument: verifyUrl 이벤트 생성 완료', currentUrl);
                            } else {
                              console.error('[DOM Capture] window.__testarchitect_createNavigationEvent 함수가 없습니다!');
                            }
                          }
                        })();
                      `,
                    userGesture: false
                  }
                }));
                } catch (err) {
                  console.error('[CDP] navigatedWithinDocument 이벤트 생성 실패:', err);
                }
              }
              
              // URL 변경 정보 전달
              if (url && globalRecordingState) {
                const timestamp = Date.now();
                const urlChangeData = {
                  url: url,
                  timestamp: timestamp,
                  isSPANavigation: true,
                  source: 'cdp-navigatedWithinDocument'
                };
                
                if (recorderWindow && !recorderWindow.isDestroyed() && recorderWindow.webContents) {
                  recorderWindow.webContents.send('url-changed', urlChangeData);
                }
                if (mainWindow && mainWindow.webContents) {
                  mainWindow.webContents.send('url-changed', urlChangeData);
                }
              }
            }
            
            // ============================================================================
            // Page.lifecycleEvent 이벤트 감지 (페이지 생명주기)
            // ============================================================================
            // Recorder 핵심: lifecycle.commit에서 최종 판단 수행
            // commit → DOMContentLoaded → load 순서
            if (message.method === 'Page.lifecycleEvent') {
              const frameId = message.params && message.params.frameId;
              const name = message.params && message.params.name;
              const loaderId = message.params && message.params.loaderId;
              
              // ⭐ 모든 lifecycle 이벤트 로그 (디버깅)
              const isMainFrameFromTree = mainFrameIdFromTree ? (frameId === mainFrameIdFromTree) : 'unknown';
              const nav = navigationContext.get(frameId || 'main');
              
              console.log('🔄 [CDP] Page.lifecycleEvent (모든 프레임):', {
                frameId: frameId || 'null/undefined',
                name: name || 'unknown',
                loaderId: loaderId || 'none',
                isMainFrameFromTree: isMainFrameFromTree,
                hasNavigationContext: !!nav,
                navigationContextStarted: nav?.started || false,
                navigationContextReason: nav?.reason || 'none',
                navigationContextCandidateNavigate: nav?.candidateNavigate || false,
                navigationContextDocumentRequested: nav?.documentRequested || false,
                navigationContextLifecycleCommit: nav?.lifecycleCommit || false
              });
              
              // 메인 프레임 판단 (강화된 로직)
              // lifecycleEvent에는 reason과 disposition이 없으므로 frameId와 mainFrameIdFromTree로만 판단
              const isMainFrameResult = mainFrameIdFromTree ? (frameId === mainFrameIdFromTree) :
                                       !frameId || frameId === 'main' || frameId === null || frameId === undefined;
              
              if (!isMainFrameResult) {
                console.log('[CDP] Page.lifecycleEvent: 서브프레임 무시:', {
                  frameId: frameId,
                  name: name,
                  isMainFrameFromTree: isMainFrameFromTree,
                  mainFrameIdFromTree: mainFrameIdFromTree || 'not set'
                });
                return;
              }
              
              const mainFrameId = frameId || 'main';
              
              console.log('🔄 [CDP] Page.lifecycleEvent 감지 (메인 프레임):', {
                frameId: mainFrameId,
                name: name,
                loaderId: loaderId || 'none'
              });
              
              // 네비게이션 컨텍스트 확인
              const mainNav = navigationContext.get(mainFrameId);
              if (!mainNav || !mainNav.started) {
                console.log('[CDP] Page.lifecycleEvent: 네비게이션 컨텍스트 없음 또는 started=false:', {
                  frameId: mainFrameId,
                  name: name,
                  hasNav: !!mainNav,
                  started: mainNav?.started || false
                });
                return;
              }
              
              // lifecycle.commit 시점에서 최종 판단 및 이벤트 생성
              if (name === 'commit') {
                mainNav.lifecycleCommit = true;
                console.log('✅ [CDP] Page.lifecycleEvent: commit 감지 (메인 프레임) → lifecycleCommit = true', {
                  frameId: mainFrameId,
                  loaderId: loaderId || 'none',
                  url: mainNav.url || 'none',
                  reason: mainNav.reason || 'none',
                  candidateNavigate: mainNav.candidateNavigate,
                  documentRequested: mainNav.documentRequested
                });
                
                // ⭐ Recorder 최종 판단 로직
                // candidateNavigate + documentRequested → navigate
                // 그 외 → verify
                const shouldNavigate = mainNav.candidateNavigate && mainNav.documentRequested;
                const reason = mainNav.reason || mainNav.navigationReason;
                
                // reason 기반 추가 판단
                // scriptInitiated는 navigate로 기록 안 함 (SPA pushState)
                if (reason === 'scriptInitiated') {
                  console.log('[CDP] Page.lifecycleEvent: scriptInitiated 감지 → verify로 처리');
                  // verify로 처리 (이벤트는 navigatedWithinDocument에서 생성됨)
                  navigationContext.delete(mainFrameId);
                  return;
                }
                
                // initialFrameNavigation은 초기 프레임 로드이므로 verifyUrl로 처리
                if (reason === 'initialFrameNavigation') {
                  console.log('[CDP] Page.lifecycleEvent: initialFrameNavigation 감지 → verifyUrl로 처리');
                  stepType = 'verifyUrl';
                  isUserInteraction = true;
                  // 계속 진행하여 이벤트 생성
                }
                
                // typed, reload, linkClicked, formSubmitted 등은 reason 기반 판단
                let isUserInteraction = false;
                let stepType = 'navigate';
                
                // History 관련 reason 처리
                if (reason === 'restore' || reason === 'restoreWithPost' || 
                    reason === 'historySameDocument' || reason === 'historyDifferentDocument') {
                  // History 네비게이션 → navigate (뒤로/앞으로)
                  stepType = 'navigate';
                  isUserInteraction = false; // 브라우저 네비게이션
                  console.log('[CDP] Page.lifecycleEvent: history 네비게이션 감지', reason);
                }
                // Document 타입 관련 reason 처리
                else if (reason === 'sameDocument') {
                  // same-document → verify (SPA 내부 네비게이션)
                  stepType = 'verifyUrl';
                  isUserInteraction = true;
                  console.log('[CDP] Page.lifecycleEvent: sameDocument 감지 → verifyUrl');
                } else if (reason === 'differentDocument') {
                  // different-document → navigate (페이지 로드)
                  stepType = 'navigate';
                  isUserInteraction = false;
                  console.log('[CDP] Page.lifecycleEvent: differentDocument 감지 → navigate');
                }
                // Reload 관련 reason 처리
                else if (reason === 'reload' || reason === 'reloadBypassingCache') {
                  // 새로고침 → navigate
                  stepType = 'navigate';
                  isUserInteraction = false;
                  console.log('[CDP] Page.lifecycleEvent: reload 감지', reason);
                }
                // 기존 로직 (shouldNavigate 기반 판단)
                else if (shouldNavigate) {
                  // candidateNavigate + documentRequested → navigate
                  stepType = 'navigate';
                  // reason이 linkClicked, formSubmitted면 verifyUrl
                  if (reason === 'linkClicked' || reason === 'formSubmitted') {
                    stepType = 'verifyUrl';
                    isUserInteraction = true;
                  } else if (reason === 'typed' || reason === 'reload' || reason === 'reloadBypassingCache') {
                    stepType = 'navigate';
                    isUserInteraction = false;
                  }
                } else {
                  // candidateNavigate가 false거나 documentRequested가 false → verify
                  stepType = 'verifyUrl';
                  isUserInteraction = true;
                }
                
                console.log('🎯 [CDP] Page.lifecycleEvent: 최종 판단 (메인 프레임)', {
                  frameId: mainFrameId,
                  loaderId: loaderId || 'none',
                  candidateNavigate: mainNav.candidateNavigate,
                  documentRequested: mainNav.documentRequested,
                  lifecycleCommit: mainNav.lifecycleCommit,
                  reason: reason,
                  stepType: stepType,
                  isUserInteraction: isUserInteraction,
                  finalUrl: finalUrl
                });
                
                // loaderId 기준으로 redirect 체인의 최종 URL 확정
                let finalUrl = mainNav.url;
                if (mainNav.loaderId && redirectChain.has(mainNav.loaderId)) {
                  finalUrl = redirectChain.get(mainNav.loaderId);
                  console.log('[CDP] Page.lifecycleEvent: redirect 체인에서 최종 URL 확정', {
                    loaderId: mainNav.loaderId,
                    finalUrl: finalUrl,
                    originalUrl: mainNav.url
                  });
                }
                
                // 최종 URL로 이벤트 생성
                if (finalUrl && globalRecordingState) {
                  console.log('[CDP] Page.lifecycleEvent: 최종 URL로 이벤트 생성 시작', {
                    finalUrl: finalUrl,
                    stepType: stepType,
                    isUserInteraction: isUserInteraction
                  });
                  
                  // 약간의 지연을 두어 URL이 완전히 변경될 시간 확보
                  setTimeout(() => {
                    if (cdpWs.readyState === WebSocket.OPEN) {
                      try {
                        const escapedUrl = JSON.stringify(finalUrl);
                        const escapedIsUserInteraction = JSON.stringify(isUserInteraction);
                        
                        cdpWs.send(JSON.stringify({
                          id: Date.now(),
                          method: 'Runtime.evaluate',
                          params: {
                            expression: `
                              (function() {
                                const currentUrl = window.location.href;
                                const targetUrl = ${escapedUrl};
                                const isUserInteraction = ${escapedIsUserInteraction};
                                
                                console.log('[DOM Capture] Page.lifecycleEvent: 최종 URL 확인', {
                                  currentUrl: currentUrl,
                                  targetUrl: targetUrl,
                                  isUserInteraction: isUserInteraction,
                                  stepType: '${stepType}'
                                });
                                
                                // URL 비교 (더 유연한 방식)
                                const currentUrlObj = new URL(currentUrl);
                                const targetUrlObj = new URL(targetUrl);
                                const urlMatches = currentUrl === targetUrl || 
                                                  (currentUrlObj.origin + currentUrlObj.pathname === targetUrlObj.origin + targetUrlObj.pathname) ||
                                                  currentUrl.includes(targetUrl.split('?')[0]) ||
                                                  targetUrl.includes(currentUrl.split('?')[0]);
                                
                                if (urlMatches && window.__testarchitect_createNavigationEvent) {
                                  window.__testarchitect_createNavigationEvent(currentUrl, isUserInteraction, 'cdp-lifecycleEvent-commit');
                                  console.log('[DOM Capture] ✅ Page.lifecycleEvent: 이벤트 생성 완료', {
                                    url: currentUrl,
                                    stepType: '${stepType}'
                                  });
                                  return { success: true, url: currentUrl };
                                } else if (!urlMatches) {
                                  console.warn('[DOM Capture] ⚠️ Page.lifecycleEvent: URL 불일치, targetUrl로 강제 생성', {
                                    currentUrl: currentUrl,
                                    targetUrl: targetUrl
                                  });
                                  if (window.__testarchitect_createNavigationEvent) {
                                    window.__testarchitect_createNavigationEvent(targetUrl, isUserInteraction, 'cdp-lifecycleEvent-commit-fallback');
                                    return { success: true, url: targetUrl, fallback: true };
                                  }
                                } else {
                                  console.error('[DOM Capture] ❌ window.__testarchitect_createNavigationEvent 함수가 없습니다!');
                                  return { success: false, error: 'function_not_found' };
                                }
                              })();
                            `,
                            userGesture: false
                          }
                        }));
                      } catch (err) {
                        console.error('[CDP] lifecycleEvent 이벤트 생성 실패:', err);
                      }
                    }
                  }, 100);
                  
                  // redirect 체인에서 loaderId 제거
                  if (mainNav.loaderId) {
                    redirectChain.delete(mainNav.loaderId);
                  }
                  
                  // 네비게이션 컨텍스트 정리
                  navigationContext.delete(mainFrameId);
                  console.log('[CDP] Page.lifecycleEvent: 네비게이션 컨텍스트 정리 완료', {
                    frameId: mainFrameId,
                    loaderId: mainNav.loaderId || 'none'
                  });
                  
                  console.log('[CDP] Page.lifecycleEvent: 네비게이션 컨텍스트 정리 완료');
                }
              }
            }
            
            // ============================================================================
            // Network.requestWillBeSent 이벤트 감지 (Document 요청 확인)
            // ============================================================================
            // Recorder 핵심: Document 타입 요청이 있으면 documentRequested = true
            if (message.method === 'Network.requestWillBeSent') {
              const request = message.params && message.params.request;
              const loaderId = message.params && message.params.loaderId;
              const type = message.params && message.params.type;
              
              // Document 타입 요청만 처리
              if (type === 'Document') {
                console.log('📄 [CDP] Network.requestWillBeSent: Document 요청 감지', {
                  url: request && request.url ? request.url.substring(0, 100) : null,
                  loaderId: loaderId || 'unknown'
                });
                
                // loaderId로 네비게이션 컨텍스트 찾기
                for (const [frameId, nav] of navigationContext.entries()) {
                  if (nav.loaderId === loaderId) {
                    nav.documentRequested = true;
                    console.log('[CDP] Network.requestWillBeSent: documentRequested = true', {
                      frameId: frameId,
                      loaderId: loaderId,
                      url: request && request.url ? request.url.substring(0, 100) : null
                    });
                    break;
                  }
                }
              }
            }
            
            // ============================================================================
            // Page.loadEventFired 이벤트 감지 (페이지 로드 완료)
            // ============================================================================
            // 최신 Chrome: 페이지 로드 완료 시점에서 DOM 스크립트 재주입
            // (이벤트 생성은 lifecycle.commit에서 수행)
            if (message.method === 'Page.loadEventFired') {
              const frameId = message.params && message.params.frameId;
              
              // 메인 프레임만 처리
              const mainFrameId = frameId || 'main';
              if (frameId && frameId !== 'main') {
                return;
              }
              
              console.log('✅ [CDP] Page.loadEventFired 감지 (페이지 로드 완료)');
              
              // DOM 이벤트 캡처 스크립트 재주입 (새 페이지 로드 완료 후)
              // (이벤트 생성은 lifecycle.commit에서 수행)
              if (cdpWs.readyState === WebSocket.OPEN && globalRecordingState) {
                setTimeout(() => {
                  try {
                    cdpWs.send(JSON.stringify({
                      id: Date.now(),
                      method: 'Runtime.evaluate',
                      params: {
                        expression: domCaptureScript,
                        userGesture: false
                      }
                    }));
                    console.log('[CDP] 페이지 로드 완료 후 DOM 캡처 스크립트 재주입');
                  } catch (err) {
                    console.error('[CDP] 스크립트 재주입 실패:', err);
                  }
                }, 200);
              }
            }
            
            // Page.frameNavigated는 최신 Chrome에서 더 이상 사용되지 않음
            // 최신 Chrome: frameRequestedNavigation → frameStartedNavigating → loadEventFired 순서 사용
            // 삭제됨
          } catch (error) {
            // 무시 (일부 메시지는 파싱 불가능할 수 있음)
          }
        });
      });
      
      cdpWs.on('error', (error) => {
        clearTimeout(timeout);
        console.error('❌ CDP WebSocket 오류:', error);
        globalCdpWs = null;
        // 연결 오류 시에도 Promise는 resolve (스크립트 주입은 완료되었을 수 있음)
        if (commandsSent >= totalCommands) {
          resolve();
        } else {
          reject(error);
        }
      });
      
      cdpWs.on('close', () => {
        clearTimeout(timeout);
        console.log('🔌 CDP WebSocket 연결 종료');
        if (globalCdpWs === cdpWs) {
          globalCdpWs = null;
        }
      });
    });
    
  } catch (error) {
    console.error('❌ CDP를 통한 DOM 이벤트 캡처 스크립트 주입 실패:', error);
    throw error;
  }
}

/**
 * 단일 이벤트를 step으로 변환하는 함수
 */
function convertEventToStep(event, index = 0) {
  // 디버깅: 이벤트 구조 로그 (첫 번째 이벤트만)
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
    
    // 2. selectorCandidates에서 추출 (최우선 셀렉터 사용)
    if (!targetSelector && event.selectorCandidates && Array.isArray(event.selectorCandidates) && event.selectorCandidates.length > 0) {
      // 가장 높은 점수의 셀렉터 사용
      const topCandidate = event.selectorCandidates[0];
      if (topCandidate && topCandidate.selector) {
        targetSelector = topCandidate.selector;
      }
    }
    
    // 3. selectors 배열에서 추출
    if (!targetSelector && event.selectors && Array.isArray(event.selectors) && event.selectors.length > 0) {
      targetSelector = event.selectors[0];
    }
    
    // 4. target 객체에서 직접 추출
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
    // event.value, event.url, event.page?.url 순서로 확인
    step.target = event.value || event.url || event.page?.url || null;
  }

  // navigate 이벤트의 경우 target을 URL로 설정
  if (event.type === 'navigate' || action === 'navigate') {
    // event.value, event.url, event.page?.url 순서로 확인
    const navigateUrl = event.value || event.url || event.page?.url || null;
    if (navigateUrl) {
      step.target = navigateUrl;
    step.value = null;
    }
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
  // event.url 또는 event.page.url에서 URL 추출
  const eventUrl = event.url || event.page?.url || null;
  if (eventUrl && eventUrl !== step.target) {
    if (step.description) {
      step.description += ` | url:${eventUrl}`;
    } else {
      step.description = `url:${eventUrl}`;
    }
  }

  return step;
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
    return convertEventToStep(event, index);
  });

  // 디버깅: 변환된 steps 확인
  console.log('[Recording] 변환된 Steps (총 ' + steps.length + '개):');
  let validStepsCount = 0;
  steps.forEach((step, index) => {
    const hasAction = !!step.action;
    const hasTarget = !!step.target;
    const isValid = hasAction && hasTarget;
    if (isValid) validStepsCount++;
    
    console.log(`  ${index + 1}. action: ${step.action || '(없음)'}, target: ${step.target || '(없음)'}, value: ${step.value || '(없음)'}`);
    if (!hasAction || !hasTarget) {
      console.warn(`    ⚠️ Step ${index + 1}에 필수 필드가 누락되었습니다!`);
      console.warn(`    ⚠️ 원본 이벤트:`, JSON.stringify(events[index], null, 2));
    }
  });
  
  if (validStepsCount === 0 && steps.length > 0) {
    console.error('[Recording] ❌ 모든 스텝이 유효하지 않습니다! 이벤트 변환에 문제가 있을 수 있습니다.');
    console.error('[Recording] 첫 번째 이벤트 샘플:', JSON.stringify(events[0], null, 2));
  } else if (validStepsCount < steps.length) {
    console.warn(`[Recording] ⚠️ ${steps.length - validStepsCount}개의 스텝이 유효하지 않습니다.`);
  } else {
    console.log(`[Recording] ✅ 모든 ${steps.length}개의 스텝이 유효합니다.`);
  }

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
  
  return { steps, tcId, projectId };
  
  // 저장된 데이터 확인
  const savedTC = DbService.get('SELECT steps FROM test_cases WHERE id = ?', [tcId]);
  if (savedTC && savedTC.steps) {
    try {
      const savedSteps = JSON.parse(savedTC.steps);
      console.log('[Recording] ✅ 저장된 Steps 확인 (총 ' + savedSteps.length + '개):');
      let savedValidCount = 0;
      savedSteps.forEach((step, index) => {
        const hasAction = !!step.action;
        const hasTarget = !!step.target;
        const status = (hasAction && hasTarget) ? '✅' : '⚠️';
        if (hasAction && hasTarget) savedValidCount++;
        console.log(`  ${status} ${index + 1}. action: ${step.action || '(없음)'}, target: ${step.target || '(없음)'}`);
      });
      
      if (savedValidCount === 0 && savedSteps.length > 0) {
        console.error('[Recording] ❌ 저장된 모든 스텝이 유효하지 않습니다!');
      } else if (savedValidCount < savedSteps.length) {
        console.warn(`[Recording] ⚠️ 저장된 ${savedSteps.length - savedValidCount}개의 스텝이 유효하지 않습니다.`);
      } else {
        console.log(`[Recording] ✅ 저장된 모든 ${savedSteps.length}개의 스텝이 유효합니다.`);
      }
    } catch (e) {
      console.error('[Recording] 저장된 Steps 파싱 오류:', e.message);
      console.error('[Recording] 저장된 원본 데이터:', savedTC.steps?.substring(0, 500));
    }
  } else {
    console.error('[Recording] ❌ 저장된 TC에 steps가 없습니다!');
    console.error('[Recording] savedTC:', savedTC);
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
 * 녹화 윈도우 생성
 * @param {Object} options - 녹화 옵션 (tcId, projectId, sessionId)
 */
function createRecorderWindow(options = {}) {
  // 이미 열려있으면 포커스만 이동
  if (recorderWindow && !recorderWindow.isDestroyed()) {
    recorderWindow.focus();
    // 옵션 업데이트
    if (options.tcId && options.projectId && options.sessionId) {
      recorderWindow.webContents.send('recorder-init', {
        tcId: options.tcId,
        projectId: options.projectId,
        sessionId: options.sessionId
      });
    }
    return recorderWindow;
  }

  const recorderPath = path.join(__dirname, '../renderer/recorder.html');
  
  recorderWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'TestArchitect - 녹화',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: config.paths.preload,
      webSecurity: false // 개발 모드에서 CORS 우회
    },
    show: false // 준비될 때까지 숨김
  });

  // 녹화 윈도우 로드
  recorderWindow.loadFile(recorderPath);

  // 준비되면 표시
  recorderWindow.once('ready-to-show', () => {
    recorderWindow.show();
    recorderWindow.focus();
    
    // 개발 모드에서 DevTools 자동 열기
    if (config.dev.enabled && config.dev.autoOpenDevTools) {
      recorderWindow.webContents.openDevTools();
    }
  });

  // 윈도우가 닫힐 때 정리
  recorderWindow.on('closed', () => {
    recorderWindow = null;
  });

  // 녹화 옵션을 윈도우에 전달
  recorderWindow.webContents.once('did-finish-load', () => {
    if (options.tcId && options.projectId && options.sessionId) {
      recorderWindow.webContents.send('recorder-init', {
        tcId: options.tcId,
        projectId: options.projectId,
        sessionId: options.sessionId
      });
    }
  });

  return recorderWindow;
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

    // 녹화 서버가 실행 중인지 확인
    if (!recordingServer) {
      startRecordingServer();
      // 서버 시작 대기
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 녹화 윈도우는 더 이상 별도로 열지 않음 (사이드 패널로 통합)
    // createRecorderWindow는 iframe 내부에서 사용되지 않으므로 주석 처리
    // createRecorderWindow({ tcId, projectId, sessionId });
    
    // 확장프로그램과 통신하기 위한 URL 생성
    const recordingUrl = `http://localhost:3000/record?tcId=${tcId}&projectId=${projectId}&sessionId=${sessionId}`;
    
    // 확장 프로그램 ID
    const EXTENSION_ID = 'hemlilhhjhpkpgeonbmaknbffgapneam';
    
    // Chrome 경로 및 확장 프로그램 경로 찾기
    let chromePath;
    let extensionPath;
    let canLoadExtension = false; // --load-extension 사용 가능 여부
    const platform = process.platform;
    
    // Chrome for Testing 우선 사용
    const chromeInfo = ChromeForTestingService.getChromePath();
    if (chromeInfo) {
      chromePath = chromeInfo.chromePath;
      canLoadExtension = chromeInfo.canLoadExtension;
      console.log('✅ Chrome 경로 확인:', chromePath);
      console.log('  - Chrome for Testing:', chromeInfo.isChromeForTesting);
      console.log('  - --load-extension 사용 가능:', canLoadExtension);
    } else {
      console.error('❌ Chrome을 찾을 수 없습니다.');
      return { 
        success: false, 
        error: 'Chrome을 찾을 수 없습니다. Chrome을 설치하거나 Chrome for Testing을 빌드에 포함해주세요.' 
      };
    }
    
    // 확장 프로그램 경로 찾기 (플랫폼별)
    if (platform === 'win32') {
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
      // macOS - PATH에서 찾지 못했으면 하드코딩된 경로 시도
      if (!chromePath) {
        chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        if (fs.existsSync(chromePath)) {
          console.log('✅ macOS 하드코딩된 경로에서 Chrome 발견:', chromePath);
        } else {
          chromePath = null;
        }
      }
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
      // Linux - PATH에서 찾지 못했으면 'google-chrome' 시도
      if (!chromePath) {
        chromePath = 'google-chrome';
        console.log('⚠️ Linux: PATH에서 찾지 못해 "google-chrome" 사용 (실행 시 확인됨)');
      }
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
    console.log('🔍 Chrome 경로 확인 결과:');
    console.log('  - chromePath:', chromePath || '없음');
    console.log('  - 경로 존재 여부:', chromePath ? fs.existsSync(chromePath) : false);
    
    if (chromePath && fs.existsSync(chromePath)) {
      console.log('✅ Chrome 경로 확인됨 - spawn으로 CDP 모드 실행');
      // 사용 가능한 CDP 포트 찾기
      async function findAvailableCDPPort(startPort = 9222, maxAttempts = 10) {
        for (let i = 0; i < maxAttempts; i++) {
          const port = startPort + i;
          const isAvailable = await new Promise((resolve) => {
            const server = net.createServer();
            server.listen(port, '127.0.0.1', () => {
              server.once('close', () => resolve(true));
              server.close();
            });
            server.on('error', () => resolve(false));
          });
          if (isAvailable) {
            return port;
          }
        }
        // 모든 포트가 사용 중이면 기본 포트 반환 (Chrome이 자동으로 처리)
        return startPort;
      }
      
      // 포트 찾기
      const CDP_PORT = await findAvailableCDPPort(9222);
      if (CDP_PORT !== 9222) {
        console.log(`⚠️ 포트 9222가 사용 중이어서 포트 ${CDP_PORT}를 사용합니다.`);
      } else {
        console.log(`✅ CDP 포트 ${CDP_PORT} 사용 가능`);
      }
      
      const chromeArgs = [
        recordingUrl,
        '--new-window',
        `--remote-debugging-port=${CDP_PORT}`,
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ];
      
      // 기존 Chrome 프로필 사용 (로그인 정보 유지)
      let userDataPath;
      if (platform === 'win32') {
        userDataPath = path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\User Data');
      } else if (platform === 'darwin') {
        userDataPath = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');
      } else {
        userDataPath = path.join(os.homedir(), '.config/google-chrome');
      }
      
      // 기존 프로필을 복제해서 CDP 전용 프로필로 사용 (로그인 정보 유지 + 충돌 방지)
      function copyProfileForCDP(sourceProfilePath, targetProfilePath) {
        try {
          // 필요한 파일/폴더만 복제 (전체 복제는 시간이 오래 걸림)
          const filesToCopy = [
            'Cookies',
            'Cookies-journal',
            'Login Data',
            'Login Data-journal',
            'Preferences',
            'Secure Preferences',
            'Web Data',
            'Web Data-journal',
            'History',
            'History-journal',
            'Bookmarks',
            'Bookmarks.bak',
            'Favicons',
            'Favicons-journal',
            'Top Sites',
            'Top Sites-journal',
            'Shortcuts',
            'Shortcuts-journal'
          ];
          
          const dirsToCopy = [
            'Local Storage',
            'Session Storage',
            'IndexedDB'
          ];
          
          // 타겟 프로필 디렉토리 생성
          if (!fs.existsSync(targetProfilePath)) {
            fs.mkdirSync(targetProfilePath, { recursive: true });
          }
          
          // 파일 복제
          let copiedCount = 0;
          for (const file of filesToCopy) {
            const sourceFile = path.join(sourceProfilePath, file);
            const targetFile = path.join(targetProfilePath, file);
            
            if (fs.existsSync(sourceFile)) {
              try {
                fs.copyFileSync(sourceFile, targetFile);
                copiedCount++;
              } catch (error) {
                // 파일이 잠겨있거나 사용 중일 수 있음 (무시)
                console.warn(`  ⚠️ 복제 실패: ${file} - ${error.message}`);
              }
            }
          }
          
          // 디렉토리 복제 (빈 디렉토리만 생성)
          for (const dir of dirsToCopy) {
            const targetDir = path.join(targetProfilePath, dir);
            if (!fs.existsSync(targetDir)) {
              try {
                fs.mkdirSync(targetDir, { recursive: true });
              } catch (error) {
                console.warn(`  ⚠️ 디렉토리 생성 실패: ${dir}`);
              }
            }
          }
          
          console.log(`  ✅ ${copiedCount}개 파일 복제 완료`);
          return true;
        } catch (error) {
          console.error('❌ 프로필 복제 실패:', error.message);
          return false;
        }
      }
      
      let cdpProfilePath = null;
      let useTempProfile = false;
      
      if (fs.existsSync(userDataPath)) {
        const defaultProfilePath = path.join(
          userDataPath,
          platform === 'win32' ? 'Default' : 'Default'
        );
        
        if (fs.existsSync(defaultProfilePath)) {
          // CDP 전용 프로필 경로 (앱 데이터 디렉토리)
          const cdpProfileBasePath = path.join(
            os.homedir(),
            platform === 'win32' 
              ? 'AppData\\Local\\TestArchitect\\ChromeProfiles'
              : platform === 'darwin'
              ? 'Library/Application Support/TestArchitect/ChromeProfiles'
              : '.config/testarchitect/chrome-profiles'
          );
          
          // CDP 프로필 디렉토리 생성
          if (!fs.existsSync(cdpProfileBasePath)) {
            fs.mkdirSync(cdpProfileBasePath, { recursive: true });
          }
          
          cdpProfilePath = path.join(cdpProfileBasePath, 'CDP-Profile');
          
          // 프로필 복제 (캐시된 프로필이 있으면 스킵 가능)
          const profileCacheFile = path.join(cdpProfilePath, '.profile-copied');
          const sourcePrefsFile = path.join(defaultProfilePath, 'Preferences');
          const shouldCopy = !fs.existsSync(profileCacheFile) || 
                            !fs.existsSync(sourcePrefsFile) ||
                            (fs.existsSync(profileCacheFile) && fs.existsSync(sourcePrefsFile) &&
                             fs.statSync(profileCacheFile).mtime < fs.statSync(sourcePrefsFile).mtime);
          
          if (shouldCopy) {
            console.log('📋 기존 프로필을 CDP 전용 프로필로 복제 중...');
            if (copyProfileForCDP(defaultProfilePath, cdpProfilePath)) {
              // 복제 완료 마커 파일 생성
              try {
                fs.writeFileSync(profileCacheFile, new Date().toISOString());
              } catch (error) {
                // 무시
              }
              console.log('✅ 프로필 복제 완료:', cdpProfilePath);
            } else {
              console.warn('⚠️ 프로필 복제 실패, 임시 프로필 사용');
              useTempProfile = true;
            }
          } else {
            console.log('✅ 캐시된 CDP 프로필 사용:', cdpProfilePath);
          }
          
          // CDP 프로필 사용
          if (!useTempProfile && cdpProfilePath && fs.existsSync(cdpProfilePath)) {
            chromeArgs.push(`--user-data-dir=${cdpProfileBasePath}`);
            chromeArgs.push('--profile-directory=CDP-Profile');
            console.log('✅ CDP 전용 프로필 사용 (로그인 정보 유지, 충돌 방지):', cdpProfilePath);
            
            // 확장 프로그램 경로 확인 (원본 프로필에서)
            const extensionBasePath = path.join(
              userDataPath,
              platform === 'win32' ? 'Default\\Extensions' : 'Default/Extensions',
              EXTENSION_ID
            );
            
            if (fs.existsSync(extensionBasePath)) {
              console.log('✅ 기존에 설치된 확장 프로그램이 자동으로 로드됩니다');
            }
          } else {
            useTempProfile = true;
          }
        } else {
          useTempProfile = true;
        }
      } else {
        useTempProfile = true;
      }
      
      // 임시 프로필 사용 (복제 실패 시)
      if (useTempProfile) {
        const tempUserDataDir = path.join(os.tmpdir(), `testarchitect-chrome-${Date.now()}`);
        chromeArgs.push(`--user-data-dir=${tempUserDataDir}`);
        console.log('ℹ️ 임시 Chrome 프로필 사용:', tempUserDataDir);
      }
      
      // 확장 프로그램이 있으면 로드 (Chrome for Testing 사용 시에만 가능)
      if (canLoadExtension && extensionPath && fs.existsSync(extensionPath)) {
        chromeArgs.push(`--load-extension=${extensionPath}`);
        console.log('✅ 확장 프로그램 로드 (--load-extension):', extensionPath);
      } else if (extensionPath && fs.existsSync(extensionPath)) {
        console.log('ℹ️ 확장 프로그램 경로 확인됨 (프로필에서 자동 로드):', extensionPath);
      } else if (canLoadExtension) {
        console.log('⚠️ 확장 프로그램 경로를 찾을 수 없습니다. 수동으로 설치해주세요.');
      }
      
      // Chrome 실행 인수 검증 (CDP 모드 확인)
      const hasRemoteDebuggingPort = chromeArgs.some(arg => arg.includes('--remote-debugging-port'));
      if (!hasRemoteDebuggingPort) {
        console.error('❌ --remote-debugging-port 옵션이 Chrome 인수에 없습니다!');
        console.error('❌ CDP 모드로 실행할 수 없습니다.');
        return { 
          success: false, 
          error: '--remote-debugging-port 옵션이 없습니다' 
        };
      }
      
      console.log('🔍 Chrome 실행 인수 검증:');
      console.log('  ✅ --remote-debugging-port 옵션 확인됨');
      console.log('  📋 전체 실행 인수:', chromeArgs.join(' '));
      
      // Chrome 프로세스 실행 (오류 확인을 위해 stdio 캡처)
      const chromeProcess = spawn(chromePath, chromeArgs, {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      // Chrome 프로세스 출력 캡처 (CDP 서버 시작 확인)
      let cdpServerReady = false;
      let chromeProcessStarted = false;
      let chromeProcessError = null;
      
      // Chrome 프로세스 시작 확인
      chromeProcess.on('spawn', () => {
        chromeProcessStarted = true;
        console.log('✅ Chrome 프로세스 시작됨 (PID:', chromeProcess.pid, ')');
      });
      
      chromeProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('DevTools listening')) {
          // CDP 서버가 시작되었음을 확인
          const match = output.match(/DevTools listening on (ws?:\/\/[^\s]+)/);
          if (match) {
            console.log('✅ CDP 서버 시작 확인:', match[1]);
            cdpServerReady = true;
          }
        }
        // 디버깅을 위해 모든 출력 로깅 (필요시 주석 처리)
        // if (output.trim() && !output.includes('DevTools listening')) {
        //   console.log('[Chrome stdout]', output.trim());
        // }
      });
      
      chromeProcess.stderr.on('data', (data) => {
        const output = data.toString();
        // DevTools listening 메시지는 stderr에도 출력될 수 있음
        if (output.includes('DevTools listening')) {
          const match = output.match(/DevTools listening on (ws?:\/\/[^\s]+)/);
          if (match) {
            console.log('✅ CDP 서버 시작 확인:', match[1]);
            cdpServerReady = true;
          }
        }
        // 프로필 관련 오류는 중요하므로 로깅
        if (output.includes('profile') || output.includes('lock') || output.includes('already running')) {
          console.warn('[Chrome stderr]', output.trim());
          chromeProcessError = output.trim();
        }
        // 일반적인 Chrome 경고는 무시
        if (!output.includes('DevTools listening') && !output.includes('INFO') && !output.includes('ERROR:google_apis') && output.trim()) {
          // 디버깅을 위해 주석 처리 (필요시 활성화)
          // console.warn('[Chrome stderr]', output.trim());
        }
      });
      
      chromeProcess.on('error', (error) => {
        console.error('❌ Chrome 실행 오류:', error.message);
        chromeProcessError = error.message;
      });
      
      chromeProcess.on('exit', (code, signal) => {
        if (code !== null && code !== 0) {
          console.warn(`⚠️ Chrome 프로세스 종료 (코드: ${code}, 신호: ${signal})`);
          if (code === 1) {
            console.warn('⚠️ Chrome이 오류로 종료되었습니다. 프로필 잠금 또는 다른 Chrome 인스턴스와 충돌할 수 있습니다.');
          }
        }
      });
      
      // 프로세스 ID 저장 (나중에 종료할 수 있도록)
      chromeProcess.unref();
      
      console.log('🌐 Chrome 실행 (CDP 모드):', { 
        chromePath, 
        extensionPath: extensionPath || '없음',
        recordingUrl, 
        sessionId,
        cdpPort: CDP_PORT,
        wsUrl: `ws://localhost:3000`,
        pid: chromeProcess.pid
      });
      
      // Chrome 실행 인수 상세 출력 (디버깅용)
      console.log('📋 Chrome 실행 인수 (상세):');
      chromeArgs.forEach((arg, index) => {
        if (arg.includes('--remote-debugging-port')) {
          console.log(`  [${index}] ✅ ${arg} <- CDP 모드 활성화`);
        } else {
          console.log(`  [${index}] ${arg}`);
        }
      });

      // Chrome이 완전히 시작될 때까지 대기 후 DOM 이벤트 캡처 스크립트 주입 시도
      // CDP 서버가 준비될 때까지 내부에서 재시도하므로 한 번만 호출
      // 기존 프로필 사용 시 더 긴 대기 시간 필요
      const initialDelay = (fs.existsSync(userDataPath) && !useTempProfile) ? 5000 : 3000;
      
      // CDP 서버 시작 확인을 위한 플래그
      let cdpServerDetected = false;
      
      // Chrome stdout/stderr에서 CDP 서버 시작 감지
      const checkCDPServer = setInterval(() => {
        if (cdpServerReady) {
          cdpServerDetected = true;
          clearInterval(checkCDPServer);
        }
      }, 500);
      
      setTimeout(async () => {
        clearInterval(checkCDPServer);
        
        // Chrome 프로세스 시작 확인
        if (!chromeProcessStarted) {
          console.error('❌ Chrome 프로세스가 시작되지 않았습니다.');
          if (chromeProcessError) {
            console.error('❌ 오류:', chromeProcessError);
          }
          return;
        }
        
        // Chrome이 실제로 CDP 모드로 실행되었는지 확인 (Windows)
        if (platform === 'win32' && chromeProcess.pid) {
          try {
            // PowerShell을 사용하여 Chrome 프로세스의 명령줄 인수 확인
            const checkCommand = `powershell -Command "Get-WmiObject Win32_Process -Filter \\"ProcessId = ${chromeProcess.pid}\\" | Select-Object -ExpandProperty CommandLine"`;
            exec(checkCommand, { timeout: 3000 }, (error, stdout, stderr) => {
              if (!error && stdout) {
                const commandLine = stdout.trim();
                if (commandLine.includes('--remote-debugging-port')) {
                  const portMatch = commandLine.match(/--remote-debugging-port=(\d+)/);
                  if (portMatch) {
                    const actualPort = parseInt(portMatch[1]);
                    console.log(`✅ Chrome 프로세스 확인: CDP 모드로 실행 중 (포트: ${actualPort})`);
                    if (actualPort !== CDP_PORT) {
                      console.warn(`⚠️ 예상 포트(${CDP_PORT})와 실제 포트(${actualPort})가 다릅니다.`);
                    }
                  } else {
                    console.log('✅ Chrome 프로세스 확인: --remote-debugging-port 옵션 포함됨');
                  }
                } else {
                  console.error('❌ Chrome 프로세스 확인: --remote-debugging-port 옵션이 없습니다!');
                  console.error('❌ Chrome이 CDP 모드로 실행되지 않았습니다.');
                }
              }
            });
          } catch (error) {
            console.warn('⚠️ Chrome 프로세스 명령줄 확인 실패:', error.message);
          }
        }
        
        // CDP 서버가 감지되지 않았으면 경고
        if (!cdpServerDetected && !cdpServerReady) {
          console.warn('⚠️ Chrome에서 CDP 서버 시작 메시지를 감지하지 못했습니다.');
          console.warn('⚠️ Chrome이 CDP 모드로 실행되었는지 확인하세요.');
          console.warn('⚠️ 프로필 잠금으로 인해 Chrome이 제대로 시작되지 않았을 수 있습니다.');
          console.warn('💡 해결 방법:');
          console.warn('   1. 실행 중인 Chrome을 모두 종료하세요.');
          console.warn('   2. 프로필 잠금 파일을 확인하세요 (SingletonLock).');
          console.warn('   3. Chrome을 수동으로 CDP 모드로 실행해보세요.');
          console.warn(`   4. 수동 실행: "${chromePath}" --remote-debugging-port=${CDP_PORT} "${recordingUrl}"`);
        }
        
        try {
          await injectDomEventCaptureViaCDP(CDP_PORT, recordingUrl);
          console.log('✅ DOM 이벤트 캡처 스크립트 주입 성공');
        } catch (error) {
          console.warn('⚠️ CDP를 통한 DOM 이벤트 캡처 스크립트 주입 실패:', error.message);
          console.log('ℹ️ Chrome이 CDP 모드로 실행되었는지 확인하세요.');
          console.log('ℹ️ 실행 중인 Chrome을 모두 종료한 후 다시 시도해보세요.');
          console.log(`ℹ️ CDP 포트 ${CDP_PORT}가 사용 가능한지 확인하세요.`);
          console.log('ℹ️ Chrome 프로세스가 정상적으로 시작되었는지 확인하세요.');
          
          // 추가 디버깅 정보
          if (chromeProcessError) {
            console.log('ℹ️ Chrome 프로세스 오류:', chromeProcessError);
          }
          
          // CDP 서버 연결 테스트
          console.log(`🔍 CDP 서버 연결 테스트: http://127.0.0.1:${CDP_PORT}/json/list`);
          try {
            const testReq = http.get(`http://127.0.0.1:${CDP_PORT}/json/list`, { timeout: 2000 }, (res) => {
              let data = '';
              res.on('data', (chunk) => { data += chunk; });
              res.on('end', () => {
                try {
                  const targets = JSON.parse(data);
                  console.log(`✅ CDP 서버 연결 성공! 발견된 탭: ${targets.length}개`);
                } catch (e) {
                  console.error('❌ CDP 서버 응답 파싱 실패');
                }
              });
            });
            testReq.on('error', (err) => {
              console.error(`❌ CDP 서버 연결 실패: ${err.message}`);
              console.error(`❌ 포트 ${CDP_PORT}에 CDP 서버가 실행되고 있지 않습니다.`);
            });
            testReq.on('timeout', () => {
              testReq.destroy();
              console.error(`❌ CDP 서버 연결 타임아웃`);
            });
          } catch (testError) {
            console.error('❌ CDP 서버 연결 테스트 실패:', testError.message);
          }
        }
      }, initialDelay); // 기존 프로필 사용 시 5초, 임시 프로필 사용 시 3초

      // 확장 프로그램에 녹화 시작 명령 전송 (WebSocket으로)
      broadcastToExtensions({
        type: 'start-recording',
        tcId: tcId,
        projectId: projectId,
        sessionId: sessionId,
        url: recordingUrl,
        timestamp: Date.now()
      });
      
      return { 
        success: true, 
        url: recordingUrl, 
        sessionId, 
        method: 'cdp',
        cdpPort: CDP_PORT,
        wsUrl: `ws://localhost:3000`,
        extensionLoaded: !!extensionPath
      };
    } else {
      // Chrome을 찾을 수 없으면 기본 브라우저로 폴백
      console.error('❌❌❌ Chrome을 찾을 수 없습니다!');
      console.error('❌ shell.openExternal()로 일반 브라우저를 열려고 시도합니다.');
      console.error('❌ 이 경우 CDP 모드가 아니므로 연결이 실패합니다!');
      console.error('💡 해결 방법:');
      console.error('   1. Chrome이 설치되어 있는지 확인하세요.');
      console.error('   2. Chrome 경로를 확인하세요:');
      console.error('      - C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
      console.error('      - C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe');
      console.error('   3. Chrome을 수동으로 CDP 모드로 실행하세요:');
      console.error(`      chrome.exe --remote-debugging-port=9222 "${recordingUrl}"`);
      
      console.warn('⚠️ 기본 브라우저로 열립니다 (CDP 연결 불가능)');
      await shell.openExternal(recordingUrl);
      return { 
        success: false,  // 실패로 표시
        error: 'Chrome을 찾을 수 없습니다. CDP 모드로 실행할 수 없습니다.',
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
 * 실시간 이벤트를 TC step으로 저장
 */
ipcMain.handle('save-event-step', async (event, { tcId, projectId, event: eventData }) => {
  try {
    if (!tcId || !eventData) {
      return { success: false, error: 'tcId와 event가 필요합니다' };
    }
    
    // 1. 이벤트를 step으로 변환
    const newStep = convertEventToStep(eventData, 0);
    
    // 2. 기존 steps 읽기
    const testCase = DbService.get('SELECT steps FROM test_cases WHERE id = ?', [tcId]);
    if (!testCase) {
      return { success: false, error: `TC ID ${tcId}를 찾을 수 없습니다` };
    }
    
    let existingSteps = [];
    if (testCase.steps) {
      try {
        existingSteps = JSON.parse(testCase.steps);
        if (!Array.isArray(existingSteps)) {
          existingSteps = [];
        }
      } catch (e) {
        console.warn('[Recording] 기존 steps 파싱 실패, 빈 배열로 시작:', e);
        existingSteps = [];
      }
    }
    
    // 3. 새 step 추가
    existingSteps.push(newStep);
    
    // 4. 업데이트된 steps 저장
    const stepsJson = JSON.stringify(existingSteps);
    DbService.run(
      'UPDATE test_cases SET steps = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [stepsJson, tcId]
    );
    
    console.log(`[Recording] ✅ 실시간 step 저장 완료: TC ${tcId}, Step ${existingSteps.length} (action: ${newStep.action}, target: ${newStep.target || '(없음)'})`);
    
    return {
      success: true,
      stepIndex: existingSteps.length - 1,
      step: newStep
    };
  } catch (error) {
    console.error('[Recording] ❌ 실시간 step 저장 실패:', error);
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

