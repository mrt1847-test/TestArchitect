/**
 * API 서비스
 * 서버와의 HTTP 통신 및 WebSocket 연결 관리
 */

const http = require('http');
const https = require('https');

// WebSocket 모듈 선택적 로드 (서버 기능이 선택사항이므로)
let WebSocket = null;
try {
  WebSocket = require('ws');
} catch (error) {
  console.warn('⚠️ WebSocket 모듈을 로드할 수 없습니다. 서버 기능이 비활성화됩니다.');
  console.warn('💡 서버 기능을 사용하려면: npm install');
}

const API_BASE_URL = process.env.API_URL || 'http://localhost:3001';
const WS_URL = process.env.WS_URL || 'ws://localhost:3001';

class ApiService {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
    this.listeners = new Map();
    this.isConnected = false; // 서버 연결 상태
  }

  /**
   * HTTP 요청 헬퍼
   * 서버가 없으면 조용히 실패 처리 (로컬 모드)
   */
  async request(method, endpoint, data = null) {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL(`${API_BASE_URL}${endpoint}`);
        const isHttps = url.protocol === 'https:';
        const httpModule = isHttps ? https : http;
        
        const options = {
          method,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 3000 // 3초 타임아웃
        };

        const req = httpModule.request(options, (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            try {
              // 빈 응답 처리
              if (!body || body.trim() === '') {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                  this.isConnected = true;
                  resolve({ success: true, data: null });
                } else {
                  reject(new Error(`HTTP ${res.statusCode}: 빈 응답`));
                }
                return;
              }

              const parsed = JSON.parse(body);
              if (res.statusCode >= 200 && res.statusCode < 300) {
                this.isConnected = true;
                resolve(parsed);
              } else {
                const errorMsg = parsed.error || parsed.message || `HTTP ${res.statusCode}`;
                reject(new Error(errorMsg));
              }
            } catch (error) {
              // JSON 파싱 실패 시 원본 body 포함
              reject(new Error(`응답 파싱 실패: ${error.message}. 응답: ${body.substring(0, 200)}`));
            }
          });
        });

        req.on('error', (error) => {
          // 서버 연결 실패는 조용히 처리 (로컬 모드)
          this.isConnected = false;
          // 더 자세한 오류 메시지
          const errorMessage = error.code === 'ECONNREFUSED' 
            ? '서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.'
            : error.message || '서버 연결 실패';
          reject(new Error(errorMessage));
        });

        req.on('timeout', () => {
          req.destroy();
          this.isConnected = false;
          reject(new Error('서버 연결 타임아웃'));
        });

        if (data) {
          req.write(JSON.stringify(data));
        }

        req.end();
      } catch (error) {
        this.isConnected = false;
        reject(error);
      }
    });
  }

  /**
   * GET 요청
   */
  async get(endpoint) {
    return this.request('GET', endpoint);
  }

  /**
   * POST 요청
   */
  async post(endpoint, data) {
    return this.request('POST', endpoint, data);
  }

  /**
   * PUT 요청
   */
  async put(endpoint, data) {
    return this.request('PUT', endpoint, data);
  }

  /**
   * DELETE 요청
   */
  async delete(endpoint) {
    return this.request('DELETE', endpoint);
  }

  /**
   * WebSocket 연결
   * 서버가 없어도 앱은 정상 작동 (조용히 실패 처리)
   */
  connectWebSocket() {
    // WebSocket 모듈이 없으면 연결 시도하지 않음
    if (!WebSocket) {
      console.warn('⚠️ WebSocket 모듈이 없어 서버 연결을 건너뜁니다.');
      this.isConnected = false;
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return; // 이미 연결됨
    }

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.on('open', () => {
        console.log('✅ 서버 연결 성공 (WebSocket)');
        this.reconnectAttempts = 0;
        this.isConnected = true;
        
        // 구독 요청
        this.ws.send(JSON.stringify({
          type: 'subscribe',
          subscriptions: ['test-case', 'script']
        }));
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(message);
        } catch (error) {
          console.error('WebSocket 메시지 파싱 오류:', error);
        }
      });

      this.ws.on('error', (error) => {
        // 서버가 없어도 앱은 계속 작동 (에러만 로그)
        console.warn('⚠️ 서버 연결 실패 (WebSocket):', error.message);
        console.log('💡 서버 없이도 기본 기능은 사용 가능합니다');
        this.isConnected = false;
      });

      this.ws.on('close', () => {
        console.log('WebSocket 연결 종료');
        this.isConnected = false;
        // 서버가 없으면 재연결 시도하지 않음 (너무 많은 로그 방지)
        if (this.reconnectAttempts < 2) {
          this.attemptReconnect();
        }
      });
    } catch (error) {
      // WebSocket 생성 실패도 조용히 처리
      console.warn('⚠️ WebSocket 생성 실패:', error.message);
      this.isConnected = false;
    }
  }

  /**
   * WebSocket 재연결 시도
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('WebSocket 재연결 실패: 최대 시도 횟수 초과');
      return;
    }

    this.reconnectAttempts++;
    console.log(`WebSocket 재연결 시도 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    setTimeout(() => {
      this.connectWebSocket();
    }, this.reconnectDelay);
  }

  /**
   * WebSocket 메시지 처리
   */
  handleWebSocketMessage(message) {
    // 이벤트 리스너에 전달
    const listeners = this.listeners.get(message.type) || [];
    listeners.forEach(listener => {
      try {
        listener(message);
      } catch (error) {
        console.error('이벤트 리스너 오류:', error);
      }
    });

    // update 타입은 resource별로도 전달
    if (message.type === 'update') {
      const resourceListeners = this.listeners.get(`${message.resource}:update`) || [];
      resourceListeners.forEach(listener => {
        try {
          listener(message);
        } catch (error) {
          console.error('리소스 이벤트 리스너 오류:', error);
        }
      });
    }
  }

  /**
   * 이벤트 리스너 등록
   */
  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType).push(callback);
  }

  /**
   * 이벤트 리스너 제거
   */
  off(eventType, callback) {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * WebSocket 연결 종료
   */
  disconnectWebSocket() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * 서버 상태 확인
   */
  async checkServerStatus() {
    try {
      const response = await this.get('/api/health');
      this.isConnected = true;
      return { connected: true, ...response };
    } catch (error) {
      this.isConnected = false;
      return { connected: false, error: error.message };
    }
  }

  /**
   * 서버 연결 상태 확인
   */
  getConnectionStatus() {
    return this.isConnected;
  }
}

// 싱글톤 인스턴스
const apiService = new ApiService();

module.exports = apiService;

