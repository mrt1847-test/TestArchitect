# 데이터베이스 모드 전환 가이드

---

## 📋 개요

TestArchitect는 두 가지 데이터베이스 모드를 지원합니다:

1. **로컬 모드 (Local Mode)**: 로컬 SQLite 파일 사용 (기본값)
2. **서버 모드 (Server Mode)**: 원격 서버 DB 사용 (추후 구현)

현재는 **로컬 모드**만 지원하며, 나중에 서버 모드로 전환할 수 있도록 구조화되어 있습니다.

---

## 🔧 현재 상태

### 로컬 모드 (기본)

- **DB 타입**: SQLite (sql.js)
- **저장 위치**: 사용자 데이터 디렉토리 (`app.getPath('userData')/database/testarchitect.db`)
- **서버 필요**: ❌ 없음
- **협업**: 로컬 파일 공유 필요

### 서버 모드 (추후 구현)

- **DB 타입**: MySQL/PostgreSQL (서버에서 관리)
- **저장 위치**: 서버 데이터베이스
- **서버 필요**: ✅ 필요
- **협업**: 실시간 동기화 지원

---

## ⚙️ 모드 설정 방법

### 방법 1: 환경 변수 사용 (권장)

```bash
# 로컬 모드 (기본값)
DB_MODE=local npm start

# 서버 모드 (추후 구현)
DB_MODE=server npm start
```

### 방법 2: 설정 파일 수정

`src/main/config/config.js` 파일에서 직접 수정:

```javascript
database: {
  mode: 'local',  // 'local' 또는 'server'
  // ...
}
```

---

## 🔄 모드 전환 시나리오

### 현재: 로컬 모드 사용

```javascript
// src/main/config/config.js
database: {
  mode: 'local',  // 로컬 SQLite 사용
  // ...
}
```

**동작:**
- `DbService`가 로컬 SQLite 파일에 직접 연결
- 모든 데이터가 로컬 파일에 저장
- 서버 없이 독립적으로 동작

### 추후: 서버 모드 전환

```javascript
// src/main/config/config.js
database: {
  mode: 'server',  // 서버 DB 사용
  server: {
    url: 'http://your-server.com:3001',
    wsUrl: 'ws://your-server.com:3001',
    // ...
  }
}
```

**동작 (구현 예정):**
- `ApiService`를 통해 서버에 연결
- 모든 데이터가 서버 DB에 저장
- 여러 클라이언트가 실시간 동기화

---

## 📊 아키텍처

### 로컬 모드 구조

```
Electron Main Process
    ↓
DbService (로컬 SQLite)
    ↓
SQLite 파일 (로컬)
```

### 서버 모드 구조 (추후)

```
Electron Main Process
    ↓
ApiService (HTTP/WebSocket)
    ↓
Server (Express + MySQL/PostgreSQL)
    ↓
데이터베이스 (서버)
```

---

## 🚀 서버 모드 구현 계획

서버 모드를 활성화하려면 다음 작업이 필요합니다:

### 1. ApiService 구현

`src/main/services/apiService.js`를 확장하여:
- 서버 연결 관리
- HTTP API 호출
- WebSocket 실시간 동기화

### 2. DB 서비스 추상화

`DbService`와 `ApiService`를 통합하는 추상화 레이어:
- 모드에 따라 적절한 서비스 선택
- 동일한 인터페이스 제공

### 3. 서버 백엔드 구현

서버 측에서:
- Express 서버
- MySQL/PostgreSQL 연결
- WebSocket 서버
- API 엔드포인트

---

## 💡 권장 사항

### 현재 단계

- ✅ **로컬 모드 사용**: 서버 없이 모든 기능 사용 가능
- ✅ **로컬 파일 백업**: 정기적으로 DB 파일 백업
- ✅ **협업 시**: DB 파일을 Git 또는 공유 폴더로 관리

### 서버 도입 시

- 🔄 **점진적 전환**: 서버 모드 구현 후 전환
- 🔄 **데이터 마이그레이션**: 로컬 DB → 서버 DB
- 🔄 **하이브리드 모드**: 로컬 캐시 + 서버 동기화

---

## 📝 설정 예시

### 로컬 모드 (현재)

```javascript
// src/main/config/config.js
database: {
  mode: 'local',
  local: {
    // SQLite 파일은 자동으로 생성됨
  }
}
```

### 서버 모드 (추후)

```javascript
// src/main/config/config.js
database: {
  mode: 'server',
  server: {
    url: 'http://localhost:3001',
    wsUrl: 'ws://localhost:3001',
    timeout: 5000,
    reconnectAttempts: 3,
    reconnectDelay: 1000
  }
}
```

---

## ⚠️ 주의사항

1. **현재는 로컬 모드만 지원**: 서버 모드는 아직 구현되지 않았습니다.
2. **모드 전환 시 데이터 마이그레이션 필요**: 로컬 → 서버 전환 시 데이터를 수동으로 마이그레이션해야 합니다.
3. **서버 모드 활성화 전 서버 준비 필요**: 서버가 실행 중이어야 합니다.

---

## 🔍 현재 구현 상태

- ✅ 로컬 모드: 완전 구현
- ⏳ 서버 모드: 구조만 준비됨 (구현 필요)
- ✅ 모드 전환 구조: 준비됨

---

## 📚 관련 문서

- [ARCHITECTURE-POM-DB.md](./ARCHITECTURE-POM-DB.md) - 전체 아키텍처
- [SERVER-README.md](../SERVER-README.md) - 서버 가이드 (참고용)

