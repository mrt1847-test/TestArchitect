/**
 * TestArchitect 서버
 * Express + MySQL + WebSocket을 사용한 테스트케이스 및 스크립트 관리 서버
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const db = require('./database/db');
const projectRoutes = require('./routes/projects');
const testCaseRoutes = require('./routes/testCases');
const scriptRoutes = require('./routes/scripts');
const syncRoutes = require('./routes/sync');
const objectRoutes = require('./routes/objects');

const app = express();
const server = http.createServer(app);

// WebSocket 서버
const wss = new WebSocket.Server({ server });

// 미들웨어
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 라우트
app.use('/api/projects', projectRoutes);
app.use('/api/test-cases', testCaseRoutes);
app.use('/api/scripts', scriptRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/objects', objectRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket 연결 관리
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('WebSocket 클라이언트 연결됨');
  clients.add(ws);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      await handleWebSocketMessage(ws, data);
    } catch (error) {
      console.error('WebSocket 메시지 처리 오류:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket 클라이언트 연결 해제');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket 오류:', error);
    clients.delete(ws);
  });

  // 연결 시 현재 상태 전송
  ws.send(JSON.stringify({ 
    type: 'connected',
    message: '서버에 연결되었습니다'
  }));
});

/**
 * WebSocket 메시지 처리
 */
async function handleWebSocketMessage(ws, data) {
  switch (data.type) {
    case 'subscribe':
      // 특정 테스트케이스 또는 스크립트 구독
      ws.subscriptions = data.subscriptions || [];
      ws.send(JSON.stringify({ 
        type: 'subscribed',
        subscriptions: ws.subscriptions
      }));
      break;

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;

    default:
      ws.send(JSON.stringify({ 
        type: 'error',
        message: '알 수 없는 메시지 타입'
      }));
  }
}

/**
 * 모든 클라이언트에 브로드캐스트
 */
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

/**
 * 특정 구독자에게만 전송
 */
function notifySubscribers(type, resource, data) {
  const message = JSON.stringify({
    type: 'update',
    resource: type, // 'test-case' or 'script'
    id: resource.id,
    data: data,
    timestamp: new Date().toISOString()
  });

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      const subscriptions = client.subscriptions || [];
      if (subscriptions.includes(type) || subscriptions.includes('*')) {
        client.send(message);
      }
    }
  });
}

// 서버 모듈로 export (다른 모듈에서 사용)
module.exports = {
  broadcast,
  notifySubscribers
};

// 서버 시작
const PORT = process.env.PORT || 3001;

// 데이터베이스 초기화
db.init().then(() => {
  const dbConfig = db.getConfig();
  server.listen(PORT, () => {
    console.log(`\n🚀 TestArchitect 서버 시작`);
    console.log(`📡 HTTP 서버: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket 서버: ws://localhost:${PORT}`);
    console.log(`📊 데이터베이스: MySQL (${dbConfig.host}:${dbConfig.port}/${dbConfig.database})`);
    console.log(`✅ 초기화 완료\n`);
  });
}).catch((error) => {
  console.error('서버 시작 실패:', error);
  console.error('\n💡 MySQL 데이터베이스 설정을 확인하세요:');
  console.error('   - MySQL 서버가 실행 중인지 확인');
  console.error('   - 데이터베이스가 생성되었는지 확인');
  console.error('   - server/config/database.js 또는 .env 파일의 설정 확인\n');
  process.exit(1);
});

