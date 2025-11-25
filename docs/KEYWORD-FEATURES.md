# 키워드 기능 가이드

TestArchitect는 키워드 기반 테스트 작성 방식을 지원합니다. 키워드를 사용하여 테스트 케이스를 작성하면 자동으로 코드가 생성됩니다.

## 키워드 방식이란?

키워드 방식은 테스트 자동화를 위한 비기술자 친화적인 접근 방식입니다. 각 키워드는 특정 동작을 나타내며, 키워드를 조합하여 테스트 케이스를 구성합니다.

### 장점

- **비기술자도 사용 가능**: 프로그래밍 지식 없이도 테스트 작성 가능
- **재사용성**: 키워드를 재사용하여 다양한 테스트 케이스 작성
- **유지보수 용이**: 키워드 수정 시 모든 테스트에 자동 반영
- **자동 코드 생성**: 키워드로부터 자동으로 테스트 코드 생성

## 지원되는 키워드

### 네비게이션 키워드

#### `open` / `goto`
URL을 열거나 이동합니다.

**파라미터:**
- `url`: 이동할 URL

**예제:**
```
Action: open
Target: https://example.com
```

**생성 코드 (Playwright):**
```python
page.goto("https://example.com")
```

### 상호작용 키워드

#### `click`
요소를 클릭합니다.

**파라미터:**
- `target`: 클릭할 요소의 선택자

**예제:**
```
Action: click
Target: #login-button
```

**생성 코드 (Playwright):**
```python
page.click("#login-button")
```

#### `type` / `setText`
텍스트를 입력합니다.

**파라미터:**
- `target`: 입력할 요소의 선택자
- `value`: 입력할 텍스트

**예제:**
```
Action: type
Target: #username
Value: admin
```

**생성 코드 (Playwright):**
```python
page.fill("#username", "admin")
```

#### `clear`
입력 필드를 지웁니다.

**파라미터:**
- `target`: 지울 요소의 선택자

**예제:**
```
Action: clear
Target: #username
```

#### `select`
드롭다운에서 옵션을 선택합니다.

**파라미터:**
- `target`: 드롭다운 요소의 선택자
- `value`: 선택할 옵션 값

**예제:**
```
Action: select
Target: #country
Value: Korea
```

#### `hover`
요소에 마우스를 올립니다.

**파라미터:**
- `target`: 마우스를 올릴 요소의 선택자

#### `doubleClick`
요소를 더블 클릭합니다.

**파라미터:**
- `target`: 더블 클릭할 요소의 선택자

#### `rightClick`
요소를 우클릭합니다.

**파라미터:**
- `target`: 우클릭할 요소의 선택자

### 검증 키워드

#### `verifyText`
요소의 텍스트를 검증합니다.

**파라미터:**
- `target`: 검증할 요소의 선택자
- `value`: 예상되는 텍스트

**예제:**
```
Action: verifyText
Target: #welcome-message
Value: Welcome!
```

**생성 코드 (Playwright):**
```python
expect(page.locator("#welcome-message")).to_have_text("Welcome!")
```

#### `verifyElementPresent`
요소가 존재하는지 확인합니다.

**파라미터:**
- `target`: 확인할 요소의 선택자

#### `verifyElementNotPresent`
요소가 존재하지 않는지 확인합니다.

**파라미터:**
- `target`: 확인할 요소의 선택자

#### `verifyTitle`
페이지 타이틀을 검증합니다.

**파라미터:**
- `value`: 예상되는 타이틀

#### `verifyUrl`
URL을 검증합니다.

**파라미터:**
- `value`: 예상되는 URL

### 대기 키워드

#### `waitForElement`
요소가 나타날 때까지 대기합니다.

**파라미터:**
- `target`: 대기할 요소의 선택자
- `value`: 타임아웃 시간 (밀리초, 기본값: 30000)

**예제:**
```
Action: waitForElement
Target: #loading-spinner
Value: 5000
```

#### `wait` / `sleep`
지정된 시간만큼 대기합니다.

**파라미터:**
- `value`: 대기 시간 (밀리초)

## 키워드 뷰 사용법

1. **테스트 케이스 선택**: 좌측 트리에서 테스트 케이스를 선택합니다.
2. **스크립트 탭 열기**: 상단 탭에서 "스크립트" 탭을 클릭합니다.
3. **키워드 뷰 전환**: "키워드" 버튼을 클릭하여 키워드 뷰로 전환합니다.
4. **키워드 추가**: "키워드 추가" 버튼을 클릭하여 새 행을 추가합니다.
5. **키워드 입력**:
   - **Action**: 드롭다운에서 키워드를 선택합니다.
   - **Target**: 요소 선택자 또는 객체 레퍼지토리의 객체 이름을 입력합니다.
   - **Value**: 필요한 경우 값을 입력합니다.
   - **Description**: 설명을 입력합니다 (선택사항).
6. **코드 생성**: "코드" 뷰로 전환하면 자동으로 코드가 생성됩니다.

## 객체 레퍼지토리와 연동

키워드의 `target` 필드에 객체 레퍼지토리의 객체 이름을 입력하면, 자동으로 최적의 선택자가 사용됩니다.

**예제:**
```
Action: click
Target: btn_Login  (객체 레퍼지토리의 객체 이름)
```

객체 레퍼지토리에 `btn_Login` 객체가 정의되어 있고, CSS 선택자 `#login-button`이 있다면, 자동으로 해당 선택자가 사용됩니다.

## 프레임워크별 코드 생성

키워드는 선택한 프레임워크에 따라 자동으로 적절한 코드를 생성합니다.

### Playwright
```python
from playwright.sync_api import Page, expect
import pytest

@pytest.mark.playwright
def test_example(page_playwright: Page):
    """테스트 예제"""
    page = page_playwright
    page.goto("https://example.com")
    page.click("#login-button")
    page.fill("#username", "admin")
    expect(page.locator("#welcome")).to_have_text("Welcome!")
```

### Selenium
```python
from selenium import webdriver
from selenium.webdriver.common.by import By
import pytest

@pytest.mark.selenium
def test_example(driver_selenium):
    """테스트 예제"""
    driver = driver_selenium
    driver.get("https://example.com")
    driver.find_element(By.CSS_SELECTOR, "#login-button").click()
    driver.find_element(By.CSS_SELECTOR, "#username").send_keys("admin")
    assert "Welcome!" in driver.find_element(By.CSS_SELECTOR, "#welcome").text
```

## 키워드 검증

키워드 뷰에서 키워드를 입력하면 자동으로 검증됩니다:

- **필수 파라미터 확인**: 키워드에 필요한 파라미터가 모두 입력되었는지 확인
- **타겟 형식 검증**: 선택자 형식이 올바른지 확인
- **키워드 존재 확인**: 입력한 키워드가 지원되는지 확인

## 팁

1. **객체 레퍼지토리 활용**: 선택자를 직접 입력하는 대신 객체 레퍼지토리의 객체 이름을 사용하면 유지보수가 쉬워집니다.
2. **설명 추가**: 각 키워드에 설명을 추가하면 테스트의 가독성이 향상됩니다.
3. **키워드 재사용**: 자주 사용하는 키워드 조합은 별도의 테스트 케이스로 저장하여 재사용할 수 있습니다.

