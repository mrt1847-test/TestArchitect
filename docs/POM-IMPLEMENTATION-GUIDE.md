# Page Object Model (POM) 구현 가이드

---

## 📋 개요

TestArchitect에 Page Object Model (POM) 지원이 완전히 구현되었습니다. 이 가이드에서는 POM을 사용하는 방법을 설명합니다.

---

## 🎯 주요 기능

### ✅ 구현 완료
1. **URL 기반 Page Object 자동 인식** - `goto`/`open` 키워드 후 자동으로 Page Object 감지
2. **코드 생성 로직 개선** - POM을 지원하는 코드 자동 생성
3. **Page Object 관리 UI** - 전용 탭에서 Page Object CRUD
4. **실행 시 임시 파일 생성** - Page Object 파일 자동 포함

---

## 📝 사용 방법

### 1. Page Object 생성

#### 방법 1: UI에서 생성
1. **Page Objects 탭** 클릭
2. **"새 Page Object"** 버튼 클릭
3. 정보 입력:
   - **이름**: `LoginPage`
   - **설명**: `로그인 페이지`
   - **URL 패턴**: `["https://example.com/login", "/login"]`
   - **프레임워크**: `pytest`
   - **언어**: `python`
   - **코드**: Page Object 클래스 코드 작성

#### 예시 코드:
```python
class LoginPage:
    def __init__(self, page):
        self.page = page
        self.username_input = "#username"
        self.password_input = "#password"
        self.login_button = "#login-btn"
    
    def login(self, username, password):
        """로그인 수행"""
        self.page.fill(self.username_input, username)
        self.page.fill(self.password_input, password)
        self.page.click(self.login_button)
    
    def verify_login_form(self):
        """로그인 폼 확인"""
        assert self.page.locator(self.username_input).is_visible()
        assert self.page.locator(self.password_input).is_visible()
```

#### 방법 2: DB에 직접 저장
```sql
INSERT INTO page_objects (project_id, name, url_patterns, framework, language, code)
VALUES (
  1,
  'LoginPage',
  '["https://example.com/login", "/login"]',
  'pytest',
  'python',
  'class LoginPage: ...'
);
```

### 2. URL 패턴 설정

URL 패턴은 JSON 배열로 저장됩니다:

```json
[
  "https://example.com/login",      // 정확한 URL
  "/login",                          // 상대 경로
  "regex:.*/login.*"                // 정규식 (regex: 접두사)
]
```

**매칭 우선순위:**
1. 정확한 URL 매칭
2. 상대 경로 매칭
3. 정규식 매칭

### 3. TC Steps에서 Page Object 사용

#### 방법 1: URL 기반 자동 인식 (권장)

TC Steps에 `goto`/`open` 키워드를 사용하면 자동으로 Page Object를 인식합니다:

```json
{
  "steps": [
    {
      "type": "keyword",
      "action": "goto",
      "target": "https://example.com/login",
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
    }
  ]
}
```

**자동 처리:**
- `goto` 후 URL 분석
- `page_objects.url_patterns`와 매칭
- 해당 Page Object 자동 선택
- 코드 생성 시 import 및 인스턴스 자동 생성

#### 방법 2: 수동 지정

Steps에 직접 Page Object 타입 지정:

```json
{
  "steps": [
    {
      "type": "page_object",
      "page_object": "LoginPage",
      "method": "login",
      "params": {
        "username": "user",
        "password": "pass"
      }
    }
  ]
}
```

### 4. 생성되는 코드

#### 입력 (TC Steps):
```json
[
  {"action": "goto", "target": "https://example.com/login"},
  {"type": "page_object", "page_object": "LoginPage", "method": "login", "params": {"username": "user", "password": "pass"}},
  {"action": "goto", "target": "https://example.com/home"},
  {"type": "page_object", "page_object": "HomePage", "method": "navigateToSettings"},
  {"action": "verifyText", "target": "#welcome", "value": "Welcome"}
]
```

#### 출력 (생성된 코드):
```python
from playwright.sync_api import Page, expect
import pytest
from page_objects.loginpage import LoginPage
from page_objects.homepage import HomePage

@pytest.mark.playwright
def test_tc1(page_playwright: Page):
    """테스트 케이스"""
    page = page_playwright
    
    # goto → LoginPage 자동 인식
    page.goto("https://example.com/login")
    login_page = LoginPage(page)
    
    # LoginPage 메서드 호출
    login_page.login(username="user", password="pass")
    
    # goto → HomePage 자동 인식
    page.goto("https://example.com/home")
    home_page = HomePage(page)
    
    # HomePage 메서드 호출
    home_page.navigate_to_settings()
    
    # 일반 키워드
    expect(page.locator("#welcome")).to_have_text("Welcome")
```

---

## 🔄 실행 흐름

### 1. 코드 생성 시
```
TC Steps 분석
    ↓
goto/open 키워드 감지
    ↓
URL 추출
    ↓
findPageObjectByUrl() 호출
    ↓
page_objects.url_patterns 매칭
    ↓
Page Object 자동 선택
    ↓
import 문 자동 생성
    ↓
코드 생성 완료
```

### 2. 테스트 실행 시
```
DB에서 스크립트 코드 조회
    ↓
import 문 분석 (from page_objects.* import *)
    ↓
사용된 Page Object 수집
    ↓
임시 디렉토리 생성
    ↓
Page Object 파일 생성 (page_objects/*.py)
    ↓
TC 스크립트 파일 생성 (test_*.py)
    ↓
pytest 실행
    ↓
임시 파일 삭제
```

---

## 🎨 UI 사용법

### Page Objects 탭

1. **탭 선택**: 상단 탭에서 "Page Objects" 클릭
2. **목록 보기**: 프로젝트의 모든 Page Object 표시
3. **새로 만들기**: "새 Page Object" 버튼 클릭
4. **편집**: Page Object 항목의 ✏️ 버튼 클릭
5. **삭제**: Page Object 항목의 🗑️ 버튼 클릭

### 편집 화면

- **이름**: Page Object 클래스 이름 (예: `LoginPage`)
- **설명**: 설명
- **URL 패턴**: JSON 배열 형식으로 입력
- **프레임워크**: pytest, playwright, selenium
- **언어**: python (현재 지원)
- **코드**: CodeMirror 에디터로 편집

---

## 💡 예시 시나리오

### 시나리오: 로그인 테스트

#### 1. Page Object 생성

**LoginPage** 생성:
- URL 패턴: `["https://example.com/login", "/login"]`
- 코드:
```python
class LoginPage:
    def __init__(self, page):
        self.page = page
    
    def login(self, username, password):
        self.page.fill("#username", username)
        self.page.fill("#password", password)
        self.page.click("#login-btn")
    
    def verify_error_message(self, message):
        assert message in self.page.locator("#error").text_content()
```

#### 2. TC Steps 작성

```json
{
  "steps": [
    {
      "action": "goto",
      "target": "https://example.com/login"
    },
    {
      "type": "page_object",
      "page_object": "LoginPage",
      "method": "login",
      "params": {
        "username": "testuser",
        "password": "testpass"
      }
    },
    {
      "action": "verifyText",
      "target": "#welcome",
      "value": "Welcome"
    }
  ]
}
```

#### 3. 자동 생성되는 코드

```python
from playwright.sync_api import Page, expect
import pytest
from page_objects.loginpage import LoginPage

@pytest.mark.playwright
def test_tc1(page_playwright: Page):
    """로그인 테스트"""
    page = page_playwright
    
    page.goto("https://example.com/login")
    login_page = LoginPage(page)
    login_page.login(username="testuser", password="testpass")
    expect(page.locator("#welcome")).to_have_text("Welcome")
```

---

## 🔧 고급 기능

### 1. 여러 URL 패턴 지원

하나의 Page Object가 여러 URL을 처리할 수 있습니다:

```json
{
  "url_patterns": [
    "https://example.com/login",
    "https://example.com/signin",
    "/login",
    "regex:.*/auth/.*"
  ]
}
```

### 2. Page Object 체이닝

여러 Page Object를 순차적으로 사용:

```python
# 자동 생성되는 코드
login_page = LoginPage(page)
login_page.login("user", "pass")

home_page = HomePage(page)
home_page.navigate_to_settings()

settings_page = SettingsPage(page)
settings_page.update_profile({"name": "New Name"})
```

### 3. 키워드와 Page Object 혼용

같은 TC에서 키워드와 Page Object를 함께 사용 가능:

```json
{
  "steps": [
    {"action": "goto", "target": "https://example.com"},
    {"type": "page_object", "page_object": "LoginPage", "method": "login", "params": {...}},
    {"action": "verifyText", "target": "#welcome", "value": "Welcome"},
    {"type": "page_object", "page_object": "HomePage", "method": "logout"}
  ]
}
```

---

## ⚠️ 주의사항

### 1. URL 패턴 매칭
- 정확한 URL이 우선순위가 높습니다
- 정규식은 `regex:` 접두사를 사용해야 합니다
- 상대 경로는 `/`로 시작해야 합니다

### 2. Page Object 이름
- Python 클래스 이름 규칙을 따라야 합니다 (PascalCase)
- 프로젝트 내에서 고유해야 합니다
- 파일명은 소문자로 변환됩니다 (`LoginPage` → `loginpage.py`)

### 3. 메서드 파라미터
- `params`는 JSON 객체로 전달됩니다
- 문자열은 자동으로 따옴표 처리됩니다
- 숫자나 불린은 그대로 전달됩니다

---

## 🐛 문제 해결

### Q: Page Object가 자동 인식되지 않아요
A: 다음을 확인하세요:
1. URL 패턴이 정확한지 확인
2. Page Object의 `status`가 `active`인지 확인
3. 프로젝트 ID가 일치하는지 확인

### Q: import 오류가 발생해요
A: 다음을 확인하세요:
1. Page Object 이름이 올바른지 확인 (PascalCase)
2. 실행 시 Page Object 파일이 생성되는지 확인
3. 임시 디렉토리(`scripts/temp/page_objects/`) 확인

### Q: 코드 생성이 실패해요
A: 다음을 확인하세요:
1. TC Steps의 형식이 올바른지 확인
2. Page Object가 DB에 존재하는지 확인
3. 콘솔 로그 확인

---

## 📚 관련 문서

- [ARCHITECTURE-POM-DB.md](./ARCHITECTURE-POM-DB.md) - 전체 아키텍처 설명
- [KEYWORD-FEATURES.md](./KEYWORD-FEATURES.md) - 키워드 기능 설명

---

## 📝 변경 이력

- **2024-01-XX**: POM 기능 완전 구현
  - URL 기반 자동 인식
  - 코드 생성 로직 개선
  - UI 추가

