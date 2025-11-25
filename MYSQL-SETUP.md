# MySQL 데이터베이스 설정 가이드

## 📋 사전 요구사항

1. **MySQL 설치**
   - MySQL 8.0 이상 권장
   - [MySQL 다운로드](https://dev.mysql.com/downloads/mysql/)

2. **데이터베이스 생성**
   ```sql
   CREATE DATABASE testarchitect CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

## ⚙️ 설정 방법

### 방법 1: 환경 변수 사용 (권장)

1. `server/.env` 파일 생성 (`.env.example` 참고)
   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=testarchitect
   DB_TYPE=local
   ```

2. `dotenv` 패키지 설치 (선택사항)
   ```bash
   npm install dotenv
   ```

### 방법 2: 직접 설정 파일 수정

`server/config/database.js` 파일에서 직접 수정:

```javascript
local: {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'your_password',
  database: 'testarchitect',
  // ...
}
```

## 🚀 서버 실행

```bash
npm run server
```

또는

```bash
node server/index.js
```

## ✅ 연결 확인

서버 시작 시 다음과 같은 메시지가 표시되면 성공:

```
🚀 TestArchitect 서버 시작
📡 HTTP 서버: http://localhost:3001
🔌 WebSocket 서버: ws://localhost:3001
📊 데이터베이스: MySQL (localhost:3306/testarchitect)
✅ 초기화 완료
```

## 🔧 문제 해결

### 연결 실패 시

1. **MySQL 서버 실행 확인**
   ```bash
   # Windows
   net start MySQL80
   
   # Linux/Mac
   sudo systemctl start mysql
   ```

2. **데이터베이스 존재 확인**
   ```sql
   SHOW DATABASES;
   ```

3. **사용자 권한 확인**
   ```sql
   GRANT ALL PRIVILEGES ON testarchitect.* TO 'root'@'localhost';
   FLUSH PRIVILEGES;
   ```

4. **방화벽 확인**
   - MySQL 포트(3306)가 열려있는지 확인

## 📝 원격 서버 연동 (추후 사용)

`server/config/database.js`에서 원격 서버 설정:

```javascript
remote: {
  host: 'remote-server.com',
  port: 3306,
  user: 'remote_user',
  password: 'remote_password',
  database: 'testarchitect',
  // ...
}
```

환경 변수로 전환:
```env
DB_TYPE=remote
REMOTE_DB_HOST=remote-server.com
REMOTE_DB_USER=remote_user
REMOTE_DB_PASSWORD=remote_password
```

## 🔄 SQLite에서 MySQL로 마이그레이션

기존 SQLite 데이터를 MySQL로 이전하려면:

1. SQLite 데이터 내보내기
2. MySQL로 데이터 가져오기
3. 스키마 확인 및 조정

자세한 마이그레이션 가이드는 추후 제공 예정입니다.


