# TestArchitect 서버 가이드

## 📋 개요

TestArchitect 서버는 Express + SQLite + WebSocket을 사용하여 테스트케이스와 테스트 스크립트를 실시간으로 관리하는 백엔드 서버입니다.

## 🚀 서버 시작

### 개발 모드
```bash
npm run server
```

### 프로덕션 모드
```bash
NODE_ENV=production npm run server
```

서버는 기본적으로 `http://localhost:3001`에서 실행됩니다.

## 📊 데이터베이스 구조

### 테이블

#### test_cases (테스트케이스)
- `id`: 고유 ID
- `name`: 테스트케이스 이름
- `description`: 설명
- `steps`: 테스트 단계 (JSON)
- `tags`: 태그 (JSON)
- `status`: 상태 (draft, active, deprecated)
- `created_at`, `updated_at`: 타임스탬프
- `created_by`: 생성자
- `version`: 버전

#### test_scripts (테스트 스크립트)
- `id`: 고유 ID
- `test_case_id`: 연결된 테스트케이스 ID
- `name`: 스크립트 이름
- `framework`: 프레임워크 (playwright, selenium, appium)
- `language`: 언어 (python, javascript, typescript)
- `code`: 코드 내용
- `file_path`: 파일 경로
- `status`: 상태 (active, deprecated)
- `created_at`, `updated_at`: 타임스탬프
- `created_by`: 생성자

#### test_results (테스트 결과)
- `id`: 고유 ID
- `test_case_id`: 테스트케이스 ID
- `test_script_id`: 스크립트 ID
- `status`: 결과 상태 (passed, failed, error, skipped)
- `duration`: 실행 시간
- `output`: 출력
- `error_message`: 에러 메시지
- `screenshots`: 스크린샷 경로 (JSON)
- `executed_at`: 실행 시간
- `executed_by`: 실행자

## 🔌 API 엔드포인트

### 테스트케이스

#### GET /api/test-cases
모든 테스트케이스 조회

**Query Parameters:**
- `status`: 상태 필터 (draft, active, deprecated)
- `search`: 검색어

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "로그인 테스트",
      "description": "사용자 로그인 테스트",
      "steps": [...],
      "tags": ["login", "auth"],
      "status": "active",
      ...
    }
  ]
}
```

#### GET /api/test-cases/:id
특정 테스트케이스 조회

#### POST /api/test-cases
테스트케이스 생성

**Request Body:**
```json
{
  "name": "테스트케이스 이름",
  "description": "설명",
  "steps": [...],
  "tags": ["tag1", "tag2"],
  "status": "draft",
  "created_by": "user"
}
```

#### PUT /api/test-cases/:id
테스트케이스 업데이트

#### DELETE /api/test-cases/:id
테스트케이스 삭제

### 스크립트

#### GET /api/scripts
모든 스크립트 조회

**Query Parameters:**
- `test_case_id`: 테스트케이스 ID 필터
- `framework`: 프레임워크 필터
- `status`: 상태 필터

#### GET /api/scripts/:id
특정 스크립트 조회

#### POST /api/scripts
스크립트 생성

**Request Body:**
```json
{
  "test_case_id": 1,
  "name": "test_login",
  "framework": "playwright",
  "language": "python",
  "code": "from playwright.sync_api import ...",
  "created_by": "user"
}
```

#### PUT /api/scripts/:id
스크립트 업데이트

#### DELETE /api/scripts/:id
스크립트 삭제

#### GET /api/scripts/test-case/:test_case_id
테스트케이스에 연결된 모든 스크립트 조회

### 동기화

#### GET /api/sync/status
동기화 상태 조회

#### GET /api/sync/test-case/:id/full
테스트케이스와 연결된 모든 데이터 조회 (스크립트, 결과 포함)

## 🔌 WebSocket

### 연결
```
ws://localhost:3001
```

### 메시지 타입

#### 클라이언트 → 서버

**구독 요청:**
```json
{
  "type": "subscribe",
  "subscriptions": ["test-case", "script"]
}
```

**Ping:**
```json
{
  "type": "ping"
}
```

#### 서버 → 클라이언트

**연결 확인:**
```json
{
  "type": "connected",
  "message": "서버에 연결되었습니다"
}
```

**업데이트 알림:**
```json
{
  "type": "update",
  "resource": "test-case",
  "id": 1,
  "data": {
    "action": "created",
    ...
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🔄 실시간 동기화

서버는 다음 이벤트 발생 시 모든 연결된 클라이언트에 실시간으로 알림을 보냅니다:

- 테스트케이스 생성/수정/삭제
- 스크립트 생성/수정/삭제

클라이언트는 구독한 리소스 타입에 대한 업데이트만 받습니다.

## 📁 파일 구조

```
server/
├── index.js              # 서버 진입점
├── database/
│   └── db.js            # 데이터베이스 모듈
└── routes/
    ├── testCases.js     # 테스트케이스 라우트
    ├── scripts.js       # 스크립트 라우트
    └── sync.js          # 동기화 라우트
```

## 🔧 설정

### 환경 변수

- `PORT`: 서버 포트 (기본값: 3001)
- `API_URL`: API 기본 URL (Electron 앱에서 사용)
- `WS_URL`: WebSocket URL (Electron 앱에서 사용)

### 데이터베이스

데이터베이스 파일은 `data/testarchitect.db`에 저장됩니다.

## 🚀 Electron 앱과의 통합

Electron 앱은 자동으로 서버에 연결됩니다:

1. 앱 시작 시 WebSocket 연결
2. 테스트케이스/스크립트 변경 시 실시간 알림 수신
3. API를 통한 CRUD 작업

## 📝 사용 예시

### 테스트케이스 생성 및 스크립트 연결

1. Test Builder에서 Steps 생성
2. Export Steps → 서버에 테스트케이스로 저장
3. Code Generator에서 코드 생성
4. Save Code → 서버에 스크립트로 저장 (테스트케이스와 자동 연결)
5. Runner에서 서버의 스크립트 선택하여 실행

### 실시간 동기화

- 다른 클라이언트에서 테스트케이스를 수정하면 모든 클라이언트에 실시간 알림
- WebSocket을 통해 즉시 UI 업데이트

