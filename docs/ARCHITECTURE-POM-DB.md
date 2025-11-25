# TestArchitect 아키텍처 문서
## DB 기반 스크립트 저장 및 POM (Page Object Model) 지원

---

## 📋 개요

이 문서는 TestArchitect의 주요 아키텍처 변경사항을 설명합니다:
1. **DB 기반 스크립트 저장**: 파일 시스템 의존성 제거
2. **POM (Page Object Model) 지원**: 코드 재사용성 향상
3. **URL 기반 Page Object 자동 인식**: 직관적인 테스트 작성
4. **실행 시 임시 파일 생성**: 협업 친화적 구조

---

## 🗄️ 데이터베이스 구조

### 1. 기존 테이블

#### `test_scripts`
- **변경사항**: `file_path` 컬럼은 더 이상 사용하지 않음 (NULL 저장)
- **용도**: 스크립트 코드를 DB에 직접 저장
- **장점**: 
  - 파일 시스템 의존성 제거
  - 협업 시 DB만 공유하면 됨
  - 버전 관리 용이

```sql
CREATE TABLE test_scripts (
  id INTEGER PRIMARY KEY,
  test_case_id INTEGER,
  name TEXT NOT NULL,
  framework TEXT NOT NULL,
  language TEXT NOT NULL,
  code TEXT NOT NULL,        -- 스크립트 코드 (DB에 저장)
  file_path TEXT,            -- 더 이상 사용하지 않음 (NULL)
  status TEXT DEFAULT 'active',
  ...
);
```

### 2. 새로운 테이블

#### `page_objects`
Page Object 클래스를 저장하는 테이블

```sql
CREATE TABLE page_objects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,              -- "LoginPage", "HomePage" 등
  description TEXT,
  url_patterns TEXT,               -- JSON 배열: ["https://example.com/login", "/login"]
  framework TEXT NOT NULL,          -- 'pytest', 'playwright', 'selenium'
  language TEXT NOT NULL,           -- 'python', 'javascript', 'typescript'
  code TEXT NOT NULL,               -- Page Object 클래스 코드
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, name)
);
```

**예시 데이터:**
```json
{
  "name": "LoginPage",
  "url_patterns": ["https://example.com/login", "/login"],
  "code": "class LoginPage:\n    def __init__(self, page):\n        self.page = page\n    \n    def login(self, username, password):\n        self.page.fill('#username', username)\n        self.page.fill('#password', password)\n        self.page.click('#login-btn')"
}
```

#### `page_object_methods`
Page Object의 메서드를 별도로 관리 (선택적)

```sql
CREATE TABLE page_object_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_object_id INTEGER NOT NULL,
  name TEXT NOT NULL,              -- "login", "logout" 등
  description TEXT,
  parameters TEXT,                 -- JSON: [{"name": "username", "type": "str"}, ...]
  code TEXT NOT NULL,              -- 메서드 코드
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (page_object_id) REFERENCES page_objects(id) ON DELETE CASCADE,
  UNIQUE(page_object_id, name)
);
```

### 3. `test_cases.steps` 구조 확장

기존 키워드 방식과 Page Object 방식을 모두 지원:

```json
{
  "steps": [
    {
      "type": "keyword",
      "action": "goto",
      "target": "https://example.com/login",
      "value": "",
      "description": "로그인 페이지로 이동"
    },
    {
      "type": "page_object",
      "page_object": "LoginPage",
      "method": "login",
      "params": {
        "username": "user",
        "password": "pass"
      },
      "description": "로그인 수행"
    },
    {
      "type": "keyword",
      "action": "verifyText",
      "target": "#welcome",
      "value": "Welcome",
      "description": "환영 메시지 확인"
    }
  ]
}
```

---

## 🔄 실행 흐름

### 1. 스크립트 저장

```
사용자 입력 (CodeMirror)
    ↓
saveScript()
    ↓
api-create-script / api-update-script
    ↓
DB에 코드 저장 (file_path = NULL)
    ↓
완료
```

**변경사항:**
- 파일 시스템에 저장하지 않음
- DB에만 코드 저장
- `file_path`는 NULL로 저장

### 2. 테스트 실행

```
runSelectedTCs()
    ↓
DB에서 스크립트 코드 조회
    ↓
임시 디렉토리 생성 (scripts/temp/)
    ↓
Page Object 파일 생성 (scripts/temp/page_objects/)
    ↓
TC 스크립트 파일 생성 (scripts/temp/test_*.py)
    ↓
pytest 실행 (temp 디렉토리에서)
    ↓
결과 수집
    ↓
임시 파일 삭제
    ↓
결과 표시
```

**임시 파일 구조:**
```
scripts/temp/
├── page_objects/
│   ├── __init__.py
│   ├── loginpage.py      (DB에서 가져온 코드)
│   └── homepage.py       (DB에서 가져온 코드)
├── test_tc1_login.py     (DB에서 가져온 코드)
└── test_tc2_settings.py  (DB에서 가져온 코드)
```

### 3. Page Object 자동 인식 (향후 구현)

```
TC Steps 분석
    ↓
goto/open 키워드 감지
    ↓
URL 추출
    ↓
page_objects.url_patterns와 매칭
    ↓
해당 Page Object 자동 선택
    ↓
다음 스텝에서 Page Object 메서드만 표시
```

---

## 📝 코드 생성 로직

### 1. 키워드 기반 코드 생성

기존 방식 유지:
```python
from playwright.sync_api import Page, expect
import pytest

@pytest.mark.playwright
def test_tc1(page_playwright: Page):
    """로그인 테스트"""
    page = page_playwright
    page.goto("https://example.com/login")
    page.fill("#username", "user")
    page.fill("#password", "pass")
    page.click("#login-btn")
```

### 2. POM 기반 코드 생성 (향후 구현)

```python
from playwright.sync_api import Page, expect
import pytest
from page_objects.loginpage import LoginPage
from page_objects.homepage import HomePage

@pytest.mark.playwright
def test_tc1(page_playwright: Page):
    """로그인 후 홈으로 이동"""
    page = page_playwright
    
    # Step 1: goto → LoginPage 자동 인식
    page.goto("https://example.com/login")
    login_page = LoginPage(page)  # 자동 생성
    
    # Step 2: LoginPage 메서드 호출
    login_page.login(username="user", password="pass")
    
    # Step 3: goto → HomePage 자동 인식
    page.goto("https://example.com/home")
    home_page = HomePage(page)  # 자동 생성
    
    # Step 4: HomePage 메서드 호출
    home_page.navigate_to_settings()
    
    # Step 5: 일반 키워드
    expect(page.locator("#welcome")).to_have_text("Welcome")
```

---

## 🗂️ 실행 결과 보관 정책

### 자동 정리 기능

앱 종료 시 최근 100개의 실행 결과만 보관하고 나머지는 자동 삭제:

```javascript
// src/main/services/dbService.js
function cleanupOldResults(keepCount = 100) {
  // 최근 N개의 ID 조회
  const keepResults = all(
    `SELECT id FROM test_results 
     ORDER BY executed_at DESC 
     LIMIT ?`,
    [keepCount]
  );
  
  // 나머지 삭제
  if (keepResults.length > 0) {
    const keepIds = keepResults.map(r => r.id);
    run(`DELETE FROM test_results WHERE id NOT IN (...)`, keepIds);
  }
}
```

**호출 시점:**
- 앱 종료 시 (`app.on('before-quit')`)
- 수동 호출 가능

**예상 DB 용량:**
- TC (100개): ~50KB
- 스크립트 (100개): ~5MB
- 실행 결과 (100개): ~1MB
- **총합: ~6MB** (SQLite로 충분)

---

## 🔌 IPC API 변경사항

### 새로운 API

#### `runPythonScripts`
여러 스크립트를 임시 파일로 생성하여 실행

```javascript
// 렌더러에서 호출
const scripts = [
  {
    tcId: 1,
    scriptId: 1,
    name: "TC_1_Login",
    code: "...",  // DB에서 가져온 코드
    framework: "pytest",
    language: "python"
  },
  // ...
];

const result = await window.electronAPI.runPythonScripts(scripts, [], options);
```

**동작:**
1. 임시 디렉토리 생성
2. Page Object 파일 생성 (import 문 분석)
3. TC 스크립트 파일 생성
4. pytest 실행
5. 임시 파일 삭제

### 변경된 API

#### `api-create-script` / `api-update-script`
- `file_path` 파라미터는 무시됨 (항상 NULL 저장)
- 파일 시스템에 저장하지 않음

---

## 📊 장점

### 1. 협업 친화적
- ✅ 파일 시스템 의존성 제거
- ✅ DB만 공유하면 모든 스크립트 동기화
- ✅ 버전 관리 용이 (DB 백업/복원)

### 2. 코드 재사용성
- ✅ Page Object로 중복 코드 제거
- ✅ 로그인 로직 변경 시 한 곳만 수정
- ✅ 유지보수 비용 감소

### 3. 유연성
- ✅ 실행 시에만 파일 생성 (디스크 공간 절약)
- ✅ Page Object 자동 인식 (향후)
- ✅ 키워드와 Page Object 혼용 가능

### 4. 확장성
- ✅ 서버 연동 시 DB만 동기화
- ✅ Git 연동 가능 (DB 내보내기/가져오기)
- ✅ CI/CD 통합 용이

---

## ✅ 구현 완료 사항

### 1. URL 기반 Page Object 자동 인식 ✅
- `goto`/`open` 키워드 후 URL 분석
- `page_objects.url_patterns`와 매칭
- 자동으로 Page Object 인식 및 코드 생성

**구현 위치:**
- `src/renderer/utils/keywordLibrary.js` - `generateCodeFromSteps()` 함수
- `src/main/main.js` - `api-find-page-object-by-url` IPC 핸들러

**동작 방식:**
```javascript
// Steps에서 goto/open 감지
if (step.action === 'goto' || step.action === 'open') {
  const url = step.target || step.value;
  const result = await findPageObjectByUrl(url, projectId);
  if (result.success) {
    // Page Object 자동 인식
    currentPageObject = result.data;
  }
}
```

### 2. 코드 생성 로직 개선 (POM 지원) ✅
- Steps에서 Page Object 자동 감지
- import 문 자동 생성
- Page Object 인스턴스 자동 생성

**구현 위치:**
- `src/renderer/utils/keywordLibrary.js` - `generateCodeFromSteps()` 함수 개선

**생성되는 코드 예시:**
```python
from playwright.sync_api import Page, expect
import pytest
from page_objects.loginpage import LoginPage  # 자동 생성
from page_objects.homepage import HomePage    # 자동 생성

@pytest.mark.playwright
def test_tc1(page_playwright: Page):
    """로그인 후 홈으로 이동"""
    page = page_playwright
    
    # goto → LoginPage 자동 인식
    page.goto("https://example.com/login")
    login_page = LoginPage(page)  # 자동 생성
    
    # Page Object 메서드 호출
    login_page.login(username="user", password="pass")
    
    # goto → HomePage 자동 인식
    page.goto("https://example.com/home")
    home_page = HomePage(page)  # 자동 생성
    
    home_page.navigate_to_settings()
```

### 3. UI 개선 (Page Object 관리 탭) ✅
- Page Object 관리 탭 추가
- Page Object CRUD 기능
- CodeMirror 기반 코드 편집

**구현 위치:**
- `src/renderer/index.html` - Page Objects 탭 추가
- `src/renderer/renderer.js` - Page Object 관리 함수들
- `src/renderer/styles.css` - Page Object 스타일

**기능:**
- Page Object 목록 조회
- Page Object 생성/편집/삭제
- URL 패턴 설정
- 코드 편집 (CodeMirror)

### 4. Page Object CRUD IPC 핸들러 ✅
- `api-get-page-objects` - 목록 조회
- `api-get-page-object` - 상세 조회
- `api-create-page-object` - 생성
- `api-update-page-object` - 수정
- `api-delete-page-object` - 삭제
- `api-find-page-object-by-url` - URL로 찾기

**구현 위치:**
- `src/main/main.js` - IPC 핸들러
- `src/preload/preload.js` - API 노출

## 🚀 향후 개선 사항

### 1. Step Type 선택 UI
- 키워드 vs Page Object 선택 드롭다운
- Page Object 메서드 자동완성
- 파라미터 입력 UI 개선

### 2. 실행 결과 저장
- 실행 결과를 DB에 저장
- 결과와 TC/스크립트 연결
- 히스토리 추적

### 3. Page Object 메서드 관리
- 메서드를 별도 테이블로 관리
- 메서드별 파라미터 정의
- 메서드 재사용성 향상

---

## 📚 관련 문서

- [KEYWORD-FEATURES.md](./KEYWORD-FEATURES.md) - 키워드 기능 설명
- [OBJECT-REPOSITORY.md](./OBJECT-REPOSITORY.md) - 객체 레포지토리 설명
- [TEST-EXECUTION-IMPROVEMENTS.md](./TEST-EXECUTION-IMPROVEMENTS.md) - 테스트 실행 개선사항

---

## 🔧 마이그레이션 가이드

### 기존 파일 기반 스크립트 → DB 기반

1. **기존 스크립트 파일 읽기**
   ```javascript
   const fs = require('fs');
   const code = fs.readFileSync('scripts/test_example.py', 'utf-8');
   ```

2. **DB에 저장**
   ```javascript
   DbService.run(
     `UPDATE test_scripts SET code = ? WHERE id = ?`,
     [code, scriptId]
   );
   ```

3. **file_path 제거 (선택적)**
   ```javascript
   DbService.run(
     `UPDATE test_scripts SET file_path = NULL WHERE file_path IS NOT NULL`
   );
   ```

### Page Object 추가

1. **Page Object 생성**
   ```sql
   INSERT INTO page_objects (project_id, name, url_patterns, framework, language, code)
   VALUES (1, 'LoginPage', '["https://example.com/login"]', 'pytest', 'python', '...');
   ```

2. **TC Steps에 Page Object 사용**
   ```json
   {
     "type": "page_object",
     "page_object": "LoginPage",
     "method": "login",
     "params": {"username": "user", "password": "pass"}
   }
   ```

---

## 📝 변경 이력

- **2024-01-XX**: DB 기반 스크립트 저장 구현
- **2024-01-XX**: POM 테이블 추가
- **2024-01-XX**: 임시 파일 생성 로직 구현
- **2024-01-XX**: 실행 결과 보관 정책 구현
- **2024-01-XX**: URL 기반 Page Object 자동 인식 구현
- **2024-01-XX**: 코드 생성 로직 개선 (POM 지원)
- **2024-01-XX**: Page Object 관리 UI 추가

---

## ❓ FAQ

### Q: 파일 시스템에 저장하지 않으면 디버깅이 어렵지 않나요?
A: 실행 시 임시 파일이 생성되므로, 필요시 임시 디렉토리를 확인할 수 있습니다. 또한 DB에서 코드를 직접 확인할 수 있습니다.

### Q: Page Object를 언제 사용해야 하나요?
A: 여러 TC에서 반복되는 로직(예: 로그인, 네비게이션)이 있을 때 Page Object로 추출하는 것을 권장합니다.

### Q: 실행 결과는 얼마나 보관되나요?
A: 기본적으로 최근 100개만 보관됩니다. 필요시 `cleanupOldResults()` 함수의 파라미터를 조정할 수 있습니다.

### Q: 협업 시 DB를 어떻게 공유하나요?
A: 현재는 로컬 DB만 지원합니다. 향후 서버 연동 또는 Git 기반 동기화 기능이 추가될 예정입니다.

