# 크롬 확장 프로그램 녹화 데이터 형식

## 개요
크롬 확장 프로그램에서 TestArchitect로 녹화 데이터를 전송할 때 사용하는 데이터 형식을 정의합니다.

## 통신 방식
- **프로토콜**: HTTP POST
- **엔드포인트**: `http://localhost:3000/api/recording`
- **Content-Type**: `application/json`

## 데이터 형식

### 1. 녹화 완료 요청 (Recording Complete)

```json
{
  "type": "recording_complete",
  "sessionId": "unique-session-id",
  "tcId": 123,
  "projectId": 1,
  "events": [
    {
      "id": "event-1",
      "type": "click",
      "timestamp": 1234567890,
      "target": {
        "tagName": "BUTTON",
        "id": "submit-btn",
        "className": "btn btn-primary",
        "text": "제출",
        "selectors": {
          "id": "#submit-btn",
          "css": ".btn.btn-primary",
          "xpath": "//button[@id='submit-btn']",
          "text": "//button[text()='제출']"
        },
        "attributes": {
          "data-testid": "submit-button",
          "aria-label": "제출 버튼"
        }
      },
      "value": null,
      "url": "https://example.com/form",
      "viewport": {
        "width": 1920,
        "height": 1080
      },
      "screenshot": "data:image/png;base64,..." // 선택사항
    },
    {
      "id": "event-2",
      "type": "type",
      "timestamp": 1234567891,
      "target": {
        "tagName": "INPUT",
        "id": "username",
        "type": "text",
        "selectors": {
          "id": "#username",
          "css": "input#username",
          "xpath": "//input[@id='username']"
        }
      },
      "value": "testuser",
      "url": "https://example.com/form",
      "viewport": {
        "width": 1920,
        "height": 1080
      }
    },
    {
      "id": "event-3",
      "type": "navigate",
      "timestamp": 1234567892,
      "target": null,
      "value": "https://example.com/dashboard",
      "url": "https://example.com/dashboard",
      "viewport": {
        "width": 1920,
        "height": 1080
      }
    },
    {
      "id": "event-4",
      "type": "wait",
      "timestamp": 1234567893,
      "target": {
        "tagName": "DIV",
        "id": "loading",
        "selectors": {
          "css": ".loading",
          "xpath": "//div[@class='loading']"
        }
      },
      "value": null,
      "condition": "visible", // "visible", "hidden", "exists", "text", "attribute"
      "timeout": 5000,
      "url": "https://example.com/dashboard",
      "viewport": {
        "width": 1920,
        "height": 1080
      }
    },
    {
      "id": "event-5",
      "type": "assert",
      "timestamp": 1234567894,
      "target": {
        "tagName": "H1",
        "selectors": {
          "css": "h1.title",
          "xpath": "//h1[@class='title']"
        }
      },
      "value": "대시보드",
      "assertion": "text", // "text", "value", "attribute", "visible", "enabled", "selected"
      "expected": "대시보드",
      "url": "https://example.com/dashboard",
      "viewport": {
        "width": 1920,
        "height": 1080
      }
    }
  ],
  "code": {
    "python": {
      "framework": "playwright",
      "code": "from playwright.sync_api import sync_playwright\n\ndef test_example(page):\n    page.goto('https://example.com/form')\n    page.click('#submit-btn')\n    page.fill('#username', 'testuser')\n    page.goto('https://example.com/dashboard')\n    page.wait_for_selector('.loading', state='visible', timeout=5000)\n    assert page.text_content('h1.title') == '대시보드'\n"
    },
    "javascript": {
      "framework": "playwright",
      "code": "const { test, expect } = require('@playwright/test');\n\ntest('example', async ({ page }) => {\n  await page.goto('https://example.com/form');\n  await page.click('#submit-btn');\n  await page.fill('#username', 'testuser');\n  await page.goto('https://example.com/dashboard');\n  await page.waitForSelector('.loading', { state: 'visible', timeout: 5000 });\n  await expect(page.locator('h1.title')).toHaveText('대시보드');\n});\n"
    }
  },
  "metadata": {
    "browser": "chrome",
    "browserVersion": "120.0.0.0",
    "os": "Windows",
    "osVersion": "10",
    "userAgent": "Mozilla/5.0...",
    "startTime": 1234567890,
    "endTime": 1234567894,
    "duration": 4000
  }
}
```

### 2. 이벤트 타입 정의

#### 지원하는 이벤트 타입
- `click`: 요소 클릭
- `dblclick`: 더블 클릭
- `type`: 텍스트 입력
- `keydown`: 키 누름
- `keyup`: 키 떼기
- `navigate`: 페이지 이동
- `wait`: 대기 (요소가 나타날 때까지)
- `assert`: 검증
- `select`: 드롭다운 선택
- `hover`: 마우스 호버
- `scroll`: 스크롤
- `screenshot`: 스크린샷 캡처
- `upload`: 파일 업로드
- `download`: 파일 다운로드

### 3. Target 객체 구조

```typescript
interface Target {
  tagName: string;           // HTML 태그명 (예: "BUTTON", "INPUT")
  id?: string;                // 요소 ID
  className?: string;         // 클래스명
  type?: string;              // input type 등
  text?: string;              // 요소의 텍스트 내용
  selectors: {                // 다양한 셀렉터
    id?: string;              // ID 셀렉터 (#id)
    css?: string;             // CSS 셀렉터
    xpath?: string;           // XPath
    text?: string;            // 텍스트 기반 XPath
    name?: string;            // name 속성
    dataTestId?: string;      // data-testid 속성
  };
  attributes?: {              // 기타 속성들
    [key: string]: string;
  };
}
```

### 4. Assertion 타입

- `text`: 텍스트 내용 검증
- `value`: 입력값 검증
- `attribute`: 속성값 검증
- `visible`: 요소 표시 여부
- `hidden`: 요소 숨김 여부
- `enabled`: 요소 활성화 여부
- `disabled`: 요소 비활성화 여부
- `selected`: 선택 여부 (체크박스, 라디오)
- `count`: 요소 개수 검증

### 5. Wait 조건

- `visible`: 요소가 보일 때까지 대기
- `hidden`: 요소가 숨겨질 때까지 대기
- `exists`: 요소가 존재할 때까지 대기
- `text`: 특정 텍스트가 나타날 때까지 대기
- `attribute`: 특정 속성이 나타날 때까지 대기

### 6. 코드 생성 형식

코드는 여러 언어와 프레임워크로 생성될 수 있습니다:

```json
{
  "code": {
    "python": {
      "framework": "playwright", // 또는 "selenium"
      "code": "생성된 Python 코드"
    },
    "javascript": {
      "framework": "playwright", // 또는 "selenium"
      "code": "생성된 JavaScript 코드"
    }
  }
}
```

## 에러 응답 형식

```json
{
  "success": false,
  "error": "에러 메시지",
  "code": "ERROR_CODE"
}
```

## 성공 응답 형식

```json
{
  "success": true,
  "message": "녹화 데이터가 성공적으로 저장되었습니다",
  "tcId": 123,
  "scriptId": 456
}
```

## 예제: 크롬 확장 프로그램에서 데이터 전송

```javascript
// 크롬 확장 프로그램에서 TestArchitect로 데이터 전송
async function sendRecordingData(recordingData) {
  try {
    const response = await fetch('http://localhost:3000/api/recording', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(recordingData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('녹화 데이터가 성공적으로 저장되었습니다');
      return result;
    } else {
      console.error('녹화 데이터 저장 실패:', result.error);
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('전송 실패:', error);
    throw error;
  }
}

// 사용 예제
const recordingData = {
  type: "recording_complete",
  sessionId: "session-123",
  tcId: 123,
  projectId: 1,
  events: [...],
  code: {...},
  metadata: {...}
};

sendRecordingData(recordingData);
```

## 참고사항

1. **세션 ID**: 각 녹화 세션마다 고유한 ID를 생성하여 추적
2. **타임스탬프**: 밀리초 단위 Unix 타임스탬프
3. **스크린샷**: Base64 인코딩된 이미지 데이터 (선택사항)
4. **셀렉터 우선순위**: ID > CSS > XPath > 텍스트 순으로 우선순위 적용
5. **에러 처리**: 네트워크 오류나 서버 오류 시 재시도 로직 구현 권장

