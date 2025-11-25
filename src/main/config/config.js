/**
 * 애플리케이션 설정 관리 모듈
 * 모든 설정값을 중앙에서 관리하여 유지보수성 향상
 */

const path = require('path');

/**
 * 앱 경로 가져오기 (개발/프로덕션 모드 자동 감지)
 * @param {Object} app - Electron app 객체 (선택사항)
 * @returns {string} 앱 경로
 */
function getAppPath(app = null) {
  // app 객체가 제공되면 isPackaged 확인
  if (app && typeof app.isPackaged !== 'undefined') {
    if (app.isPackaged) {
      // 프로덕션: 앱 번들 내부 경로
      return app.getAppPath();
    } else {
      // 개발: 프로젝트 루트
      return path.join(__dirname, '../..');
    }
  }
  
  // app 객체가 없으면 개발 모드로 가정
  return path.join(__dirname, '../..');
}

/**
 * 경로 설정 초기화 (app 객체 사용 가능 시 호출)
 * @param {Object} app - Electron app 객체
 */
function initializePaths(app) {
  if (!app) {
    // app 객체가 없으면 개발 모드로 가정하고 기본 경로 사용
    return;
  }
  
  const isPackaged = app.isPackaged;
  
  if (isPackaged) {
    // 프로덕션 모드: 앱 번들 내부 경로
    const appPath = app.getAppPath();
    config.paths = {
      scripts: path.join(appPath, 'scripts'),
      renderer: path.join(appPath, 'src/renderer/index.html'),
      preload: path.join(appPath, 'src/preload/preload.js')
    };
  } else {
    // 개발 모드: 기본 경로 유지 (이미 올바르게 설정됨)
    // config.paths는 이미 올바른 기본값으로 설정되어 있음
  }
  
  // 리포트 디렉토리도 사용자 데이터 디렉토리로 변경 (프로덕션)
  if (isPackaged && app) {
    const userDataPath = app.getPath('userData');
    config.pytest.reportDir = path.join(userDataPath, '.pytest-reports');
    config.pytest.htmlReportDir = path.join(userDataPath, '.pytest-reports', 'html');
    config.pytest.screenshotDir = path.join(userDataPath, '.pytest-reports', 'screenshots');
  }
}

/**
 * 애플리케이션 설정 객체
 */
const config = {
  // 윈도우 설정
  window: {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'TestArchitect'
  },

  // 경로 설정 (초기값, initializePaths로 업데이트됨)
  paths: {
    scripts: path.join(__dirname, '../../scripts'),
    renderer: path.join(__dirname, '../../renderer/index.html'),  // 개발 모드 기본값
    preload: path.join(__dirname, '../../preload/preload.js')  // 개발 모드 기본값
  },

  // Python 실행 설정
  python: {
    // 플랫폼별 Python 명령어 (기본값, 런타임에서 동적으로 결정됨)
    command: process.platform === 'win32' ? 'python' : 'python3',
    // 스크립트 실행 타임아웃 (밀리초)
    timeout: 300000, // 5분
    // 지원하는 스크립트 확장자
    supportedExtensions: ['.py'],
    // 번들된 Python 경로 (프로덕션 모드)
    bundledPath: null // 런타임에서 동적으로 설정
  },

  // Pytest 실행 설정
  pytest: {
    // pytest 명령어 (pytest가 PATH에 있는 경우)
    command: 'pytest',
    // JSON 리포트 디렉토리
    reportDir: path.join(__dirname, '../../.pytest-reports'),
    // HTML 리포트 디렉토리
    htmlReportDir: path.join(__dirname, '../../.pytest-reports/html'),
    // 스크린샷 디렉토리
    screenshotDir: path.join(__dirname, '../../.pytest-reports/screenshots'),
    // pytest 실행 옵션
    options: [
      '--json-report',           // JSON 리포트 생성
      '-v',                       // 상세 출력
      '--tb=short'                // 짧은 트레이스백
    ],
    // 기본 실행 옵션
    defaultOptions: {
      parallel: false,            // 병렬 실행 여부
      workers: 'auto',             // 병렬 워커 수 ('auto' 또는 숫자)
      reruns: 0,                  // 실패 시 재시도 횟수
      rerunsDelay: 0,             // 재시도 전 대기 시간(초)
      maxFailures: null,          // 최대 실패 허용 수 (null = 무제한)
      timeout: 300,               // 테스트 타임아웃(초)
      captureScreenshots: true,    // 스크린샷 자동 캡처 여부
      htmlReport: true            // HTML 리포트 생성 여부
    }
  },

  // 개발 모드 설정
  dev: {
    // 개발 모드 플래그
    enabled: process.argv.includes('--dev'),
    // DevTools 자동 열기 여부
    autoOpenDevTools: true
  },

  // 데이터베이스 설정
  database: {
    // DB 연결 모드: 'local' (로컬 SQLite) 또는 'server' (서버 DB)
    // 현재는 로컬 모드 사용, 나중에 서버 도입 시 'server'로 변경
    mode: process.env.DB_MODE || 'local', // 'local' 또는 'server'
    
    // 로컬 모드 설정 (SQLite)
    local: {
      // SQLite 파일은 dbService.js에서 자동으로 생성됨
      // 사용자 데이터 디렉토리에 저장
    },
    
    // 서버 모드 설정 (추후 사용)
    server: {
      // 서버 URL (서버 모드일 때만 사용)
      url: process.env.SERVER_URL || 'http://localhost:3001',
      // WebSocket URL (서버 모드일 때만 사용)
      wsUrl: process.env.WS_URL || 'ws://localhost:3001',
      // 연결 타임아웃 (밀리초)
      timeout: 5000,
      // 재연결 시도 횟수
      reconnectAttempts: 3,
      // 재연결 지연 시간 (밀리초)
      reconnectDelay: 1000
    }
  }
};

// 경로 초기화 함수 export
config.initializePaths = initializePaths;
config.getAppPath = getAppPath;

module.exports = config;

