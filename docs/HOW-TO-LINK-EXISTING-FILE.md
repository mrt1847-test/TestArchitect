# 기존 파일 링크하기

TestArchitect에서 이미 존재하는 테스트 스크립트 파일을 데이터베이스에 링크하는 방법을 안내합니다.

## 개요

TestArchitect는 `scripts/` 디렉토리에 있는 테스트 스크립트 파일을 자동으로 관리합니다. 때로는 이미 작성된 파일을 데이터베이스에 연결하여 관리하고 싶을 수 있습니다.

## 방법

### 1. Electron 앱을 통한 링크

현재 Electron 앱에서는 스크립트 생성 시 `file_path`를 직접 지정할 수 있습니다:

```javascript
// API 호출 예시
const scriptData = {
  test_case_id: 1,
  name: "기존 스크립트",
  framework: "pytest",
  language: "python",
  code: "", // 파일 내용은 file_path로 읽어옴
  file_path: "C:/path/to/existing/test_file.py" // 기존 파일 경로
};

await window.electronAPI.createScript(scriptData);
```

### 2. 파일 경로 형식

- **절대 경로**: 전체 파일 경로를 지정
  ```
  C:\Users\username\Documents\test_script.py
  /home/user/test_script.py
  ```

- **상대 경로**: `scripts/` 디렉토리 기준 상대 경로
  ```
  test_example.py
  subfolder/test_example.py
  ```

### 3. 주의사항

1. **파일 존재 확인**: 링크하려는 파일이 실제로 존재하는지 확인하세요.
2. **경로 일관성**: `scripts/` 디렉토리 내의 파일을 사용하는 것을 권장합니다.
3. **파일 동기화**: 
   - 스크립트를 업데이트하면 `file_path`가 있는 경우 파일도 함께 업데이트됩니다.
   - 파일을 직접 수정하면 데이터베이스의 `code` 필드와 불일치가 발생할 수 있습니다.

### 4. 파일 내용 읽기

기존 파일을 링크할 때, 파일 내용을 읽어서 `code` 필드에 포함시키는 것을 권장합니다:

```javascript
// Node.js 환경에서
const fs = require('fs');
const filePath = 'path/to/existing/file.py';
const code = fs.readFileSync(filePath, 'utf-8');

const scriptData = {
  test_case_id: 1,
  name: "기존 스크립트",
  framework: "pytest",
  language: "python",
  code: code, // 파일 내용 포함
  file_path: filePath
};
```

### 5. 스크립트 업데이트 시

스크립트를 업데이트하면:
- 데이터베이스의 `code` 필드가 업데이트됩니다.
- `file_path`가 있는 경우, 해당 파일도 함께 업데이트됩니다.

```javascript
await window.electronAPI.updateScript(scriptId, {
  code: "새로운 코드 내용",
  // file_path는 변경되지 않음
});
```

### 6. 스크립트 삭제 시

스크립트를 삭제하면:
- 데이터베이스에서 레코드가 삭제됩니다.
- `file_path`가 있는 경우, 해당 파일도 함께 삭제됩니다.

## 향후 개선 사항

다음 기능들이 계획되어 있습니다:

1. **파일 탐색기 통합**: UI에서 직접 파일을 선택하여 링크
2. **자동 파일 감지**: `scripts/` 디렉토리의 파일을 자동으로 감지하여 링크 제안
3. **파일 동기화 옵션**: 파일과 DB 간의 동기화 방향 설정 (양방향, 파일 우선, DB 우선)
4. **파일 변경 감지**: 외부에서 파일이 수정된 경우 알림

## 관련 파일

- `src/main/main.js`: 스크립트 생성/업데이트 IPC 핸들러
- `server/routes/scripts.js`: 스크립트 관리 REST API
- `src/main/services/scriptManager.js`: 스크립트 파일 관리 유틸리티



