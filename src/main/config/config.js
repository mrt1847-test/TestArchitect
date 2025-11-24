/**
 * 애플리케이션 설정 관리 모듈
 * 모든 설정값을 중앙에서 관리하여 유지보수성 향상
 */

const path = require('path');

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

  // 경로 설정
  paths: {
    scripts: path.join(__dirname, '../../scripts'),
    renderer: path.join(__dirname, '../../renderer/index.html'),
    preload: path.join(__dirname, '../../preload/preload.js')
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
    // pytest 실행 옵션
    options: [
      '--json-report',           // JSON 리포트 생성
      '-v',                       // 상세 출력
      '--tb=short'                // 짧은 트레이스백
    ]
  },

  // 개발 모드 설정
  dev: {
    // 개발 모드 플래그
    enabled: process.argv.includes('--dev'),
    // DevTools 자동 열기 여부
    autoOpenDevTools: true
  }
};

module.exports = config;

