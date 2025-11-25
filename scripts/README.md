# 테스트 스크립트 디렉토리

이 디렉토리는 pytest 테스트 파일을 저장하는 곳입니다.

## 파일 구조

- `test_*.py`: pytest 테스트 파일 (자동으로 인식됨)
  - **중요**: 파일명은 반드시 `test_`로 시작해야 합니다
  - 파일 내의 `def test_*()` 함수들만 테스트로 인식됩니다
- `conftest.py`: pytest 설정 및 공통 fixture 정의 (브라우저 선택, 드라이버 설정 등)
- `pytest.ini`: pytest 전역 설정 파일

## 테스트 작성 가이드

### 기본 테스트

각 테스트 케이스는 `def` 함수로 작성합니다:

```python
def test_example():
    """예제 테스트"""
    assert 1 + 1 == 2
```

### 테스트 클래스

```python
class TestExample:
    """예제 테스트 클래스"""
    
    def test_method(self):
        """테스트 메서드"""
        assert True
```

### Playwright 사용 테스트

`conftest.py`의 `page_playwright` fixture를 사용합니다:

```python
import pytest
from playwright.sync_api import Page

@pytest.mark.playwright
def test_google_search(page_playwright: Page):
    """Google 검색 테스트"""
    page_playwright.goto("https://www.google.com")
    # 테스트 로직...
```

### Selenium 사용 테스트

`conftest.py`의 `driver_selenium` fixture를 사용합니다:

```python
import pytest
from selenium.webdriver.remote.webdriver import WebDriver

@pytest.mark.selenium
def test_google_search(driver_selenium: WebDriver):
    """Google 검색 테스트"""
    driver_selenium.get("https://www.google.com")
    # 테스트 로직...
```

### 자동 드라이버 선택

`conftest.py`의 `page` 또는 `driver` fixture를 사용하면 설정에 따라 자동으로 선택됩니다:

```python
import pytest

def test_with_auto_driver(page):
    """자동으로 선택된 드라이버 사용"""
    # test_config["driver"] 설정에 따라 playwright 또는 selenium 사용
    if hasattr(page, 'goto'):  # Playwright
        page.goto("https://example.com")
    else:  # Selenium
        page.get("https://example.com")
```

### Fixture 사용

```python
@pytest.fixture
def data():
    return {"key": "value"}

def test_with_fixture(data):
    assert data["key"] == "value"
```

### 테스트 설정 접근

`test_config` fixture를 통해 설정값에 접근할 수 있습니다:

```python
def test_with_config(test_config):
    """테스트 설정 사용"""
    base_url = test_config["base_url"]
    browser = test_config["browser"]
    headless = test_config["headless"]
    driver = test_config["driver"]
```

## 브라우저 및 드라이버 설정

### 명령줄 옵션으로 설정

```bash
# 브라우저 선택 (chromium, firefox, webkit, chrome, edge)
pytest --browser=chromium

# 헤드리스 모드 설정
pytest --headless=true

# 드라이버 선택 (playwright, selenium)
pytest --driver=playwright

# 기본 URL 설정
pytest --base-url=http://localhost:8000
```

### 환경 변수로 설정

```bash
# Windows
set TEST_BROWSER=chromium
set TEST_HEADLESS=true
set TEST_DRIVER=playwright
set TEST_BASE_URL=http://localhost:8000

# Linux/macOS
export TEST_BROWSER=chromium
export TEST_HEADLESS=true
export TEST_DRIVER=playwright
export TEST_BASE_URL=http://localhost:8000
```

### conftest.py 기본값

- 브라우저: `chromium` (환경 변수 `TEST_BROWSER` 또는 `--browser` 옵션으로 변경 가능)
- 헤드리스: `true` (환경 변수 `TEST_HEADLESS` 또는 `--headless` 옵션으로 변경 가능)
- 드라이버: `playwright` (환경 변수 `TEST_DRIVER` 또는 `--driver` 옵션으로 변경 가능)
- 기본 URL: `http://localhost:8000` (환경 변수 `TEST_BASE_URL` 또는 `--base-url` 옵션으로 변경 가능)

## 실행 방법

### Electron 앱에서 실행

1. Electron 앱에서 테스트 파일 선택
2. "실행" 버튼 클릭
3. pytest가 자동으로 테스트를 실행하고 결과를 반환

### 명령줄에서 실행

```bash
# 모든 테스트 실행
pytest

# 특정 테스트 파일 실행
pytest test_example.py

# 특정 테스트 함수 실행
pytest test_example.py::test_login

# 마커로 필터링
pytest -m playwright  # Playwright 테스트만 실행
pytest -m selenium    # Selenium 테스트만 실행
pytest -m slow        # 느린 테스트만 실행

# 브라우저와 드라이버 지정하여 실행
pytest --browser=firefox --driver=playwright
```

## 사용 가능한 Fixtures

### 브라우저 관련

- `playwright_instance`: Playwright 인스턴스 (session scope)
- `browser_type`: 선택된 브라우저 타입 (session scope)
- `browser_playwright`: Playwright 브라우저 인스턴스 (session scope)
- `page_playwright`: Playwright 페이지 인스턴스 (function scope)
- `driver_selenium`: Selenium WebDriver 인스턴스 (function scope)

### 통합 Fixtures

- `page`: 자동으로 선택된 드라이버의 페이지/드라이버 (function scope)
- `driver`: 자동으로 선택된 드라이버 (function scope, `page`와 동일)

### 설정 Fixtures

- `test_config`: 테스트 설정 딕셔너리 (session scope)

## 참고사항

- **파일명 규칙**: 테스트 파일은 반드시 `test_*.py` 형식이어야 합니다
  - 예: `test_example.py`, `test_playwright.py`, `test_selenium.py`
- **함수명 규칙**: 테스트 함수는 반드시 `test_*`로 시작해야 합니다
  - 예: `def test_login():`, `def test_search():`
- 모든 테스트는 pytest 형식으로 작성되어야 합니다
- `conftest.py`에 공통 설정(브라우저 선택, 드라이버 설정 등)을 정의합니다
- 각 테스트 케이스는 하나의 `def test_*()` 함수로 작성합니다
- 브라우저와 드라이버 설정은 `conftest.py`에서 중앙 관리됩니다

