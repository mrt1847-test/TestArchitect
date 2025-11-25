# TestArchitect 진단 가이드

## 문제 해결 체크리스트

### 1. 서버 실행 확인

```bash
# 서버 실행
npm run server

# 서버가 정상적으로 시작되면 다음 메시지가 표시됩니다:
# 🚀 TestArchitect 서버 시작
# 📡 HTTP 서버: http://localhost:3001
# 🔌 WebSocket 서버: ws://localhost:3001
# 📊 데이터베이스: MySQL (localhost:3306/testarchitect)
# ✅ 초기화 완료
```

**문제가 발생하는 경우:**
- MySQL 서버가 실행 중인지 확인
- 데이터베이스가 생성되었는지 확인
- `server/config/database.js` 설정 확인

### 2. 데이터베이스 설정 확인

**MySQL 데이터베이스 생성:**
```sql
CREATE DATABASE testarchitect CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

**설정 파일 확인:**
- `server/config/database.js` 파일 확인
- 사용자명, 비밀번호, 데이터베이스명 확인

### 3. Electron 앱 실행 확인

```bash
# 앱 실행
npm start
```

**확인 사항:**
1. DevTools 열기 (F12 또는 Ctrl+Shift+I)
2. Console 탭에서 오류 확인
3. `window.electronAPI` 객체 확인:
   ```javascript
   console.log(window.electronAPI);
   console.log(window.electronAPI.api);
   ```

### 4. API 연결 테스트

**브라우저에서 직접 테스트:**
```bash
# 서버가 실행 중일 때
curl http://localhost:3001/api/health

# 또는 브라우저에서
# http://localhost:3001/api/health 접속
```

**예상 응답:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 5. 일반적인 오류 및 해결 방법

#### 오류: "서버에 연결할 수 없습니다"
- **원인**: 서버가 실행되지 않음
- **해결**: `npm run server` 실행

#### 오류: "MySQL 인증 실패"
- **원인**: 데이터베이스 사용자명/비밀번호 오류
- **해결**: `server/config/database.js`에서 설정 확인

#### 오류: "데이터베이스를 찾을 수 없습니다"
- **원인**: 데이터베이스가 생성되지 않음
- **해결**: MySQL에서 데이터베이스 생성

#### 오류: "window.electronAPI가 없습니다"
- **원인**: preload 스크립트가 로드되지 않음
- **해결**: 앱 재시작 또는 `src/main/config/config.js`에서 preload 경로 확인

#### 오류: "프로젝트 생성 실패"
- **원인**: 서버 연결 실패 또는 데이터베이스 오류
- **해결**: 
  1. 서버 로그 확인
  2. 데이터베이스 연결 확인
  3. DevTools Console에서 상세 오류 확인

### 6. 로그 확인

**서버 로그:**
- 서버 실행 터미널에서 확인
- MySQL 연결 오류, 쿼리 오류 등 표시

**앱 로그:**
- 하단 패널의 "로그" 탭 확인
- DevTools Console 확인

### 7. 단계별 테스트

1. **서버 실행 테스트**
   ```bash
   npm run server
   ```
   - 서버가 정상적으로 시작되는지 확인

2. **데이터베이스 연결 테스트**
   - 서버 시작 시 "MySQL 데이터베이스 연결 성공" 메시지 확인

3. **앱 실행 테스트**
   ```bash
   npm start
   ```
   - 앱이 정상적으로 시작되는지 확인
   - 하단 패널 로그에서 "애플리케이션 초기화 완료" 확인

4. **프로젝트 로드 테스트**
   - 프로젝트 드롭다운이 정상적으로 표시되는지 확인
   - 하단 패널 로그에서 "프로젝트 X개를 불러왔습니다" 확인

5. **프로젝트 생성 테스트**
   - 새 프로젝트 생성 버튼 클릭
   - 프로젝트 이름 입력 후 생성
   - 하단 패널 로그에서 성공/실패 메시지 확인

### 8. 디버깅 팁

1. **DevTools 사용**
   - F12 또는 Ctrl+Shift+I로 열기
   - Console 탭에서 모든 오류 확인
   - Network 탭에서 API 호출 확인

2. **서버 로그 확인**
   - 서버 실행 터미널에서 모든 요청/응답 확인
   - MySQL 쿼리 오류 확인

3. **단계별 확인**
   - 각 기능을 하나씩 테스트
   - 오류 발생 시 즉시 확인

### 9. 지원

문제가 계속되면 다음 정보를 확인하세요:
- 서버 로그 전체 내용
- DevTools Console의 오류 메시지
- `server/config/database.js` 설정 (비밀번호 제외)
- MySQL 버전 및 상태


