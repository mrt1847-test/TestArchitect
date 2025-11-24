# TestArchitect

테스트 자동화 도구 - Recorder, 코드변환, 테스트케이스 관리, Runner, Result Viewer를 포함한 통합 솔루션

## 프로젝트 구조

```
TestArchitect/
├── src/
│   ├── main/                    # Electron 메인 프로세스
│   │   ├── main.js              # 메인 프로세스 진입점 및 IPC 핸들러
│   │   ├── config/              # 설정 관리
│   │   │   └── config.js        # 애플리케이션 설정
│   │   └── services/            # 비즈니스 로직 서비스
│   │       ├── pythonService.js # Python 스크립트 실행 서비스
│   │       └── scriptManager.js # 스크립트 관리 서비스
│   ├── preload/                 # Preload 스크립트
│   │   └── preload.js           # IPC 브릿지 (보안)
│   └── renderer/                # UI 렌더러 프로세스
│       ├── index.html           # 메인 UI
│       ├── styles.css           # 스타일시트
│       ├── renderer.js          # 렌더러 메인 로직
│       └── utils/               # 렌더러 유틸리티
│           ├── scriptLoader.js  # 스크립트 로더
│           ├── testRunner.js    # 테스트 실행 유틸
│           └── uiHelper.js      # UI 헬퍼 함수
├── scripts/                     # Python 테스트 스크립트
│   └── example_test.py          # 예제 테스트 스크립트
├── package.json
└── README.md
```

### 아키텍처 특징

- **모듈화**: 기능별로 명확히 분리된 모듈 구조
- **확장성**: 새로운 기능 추가를 위한 확장 포인트 명시
- **보안**: contextIsolation 및 nodeIntegration 비활성화
- **유지보수성**: JSDoc 주석 및 명확한 코드 구조

## 주요 기능

### 현재 구현된 기능
- ✅ Electron 기반 UI
- ✅ Node.js에서 Python 스크립트 실행
- ✅ 테스트 결과 JSON 반환 및 파싱
- ✅ UI에 결과 표시

### 향후 확장 예정
- 🔄 Recorder (테스트 기록)
- 🔄 코드변환 (다양한 테스트 프레임워크 지원)
- 🔄 테스트케이스 관리 (CRUD 기능)
- 🔄 Runner (고급 테스트 실행 옵션)
- 🔄 Result Viewer (상세 리포트 및 시각화)

## 설치 및 실행

### 필수 요구사항

**Electron 앱 실행:**
- Node.js (v16 이상)
- npm 또는 yarn

**테스트 실행:**
- **방법 1 (권장)**: Python이 번들로 포함된 빌드 사용
  - 사용자가 Python을 별도로 설치할 필요 없음
  - `npm run build`로 빌드 시 자동 포함
  
- **방법 2**: 시스템 Python 사용 (개발 모드)
  - Python 3.11 이상
  - pytest, pytest-json-report, playwright, selenium

> ✅ **완전한 번들링**: 이 앱은 Python 런타임, pytest, playwright, selenium을 모두 번들로 포함합니다.  
> 빌드된 앱은 사용자가 **아무것도 설치할 필요가 없습니다** (Selenium WebDriver는 첫 실행 시 자동 다운로드).

### 설치

**1. Node.js 의존성 설치:**
```bash
npm install
```

**2. Python 번들 빌드 (프로덕션 배포용):**
```bash
npm run build-python
```

이 명령어는 Python 가상환경을 생성하고 필요한 패키지(pytest, playwright, selenium 등)를 설치합니다.

**또는 개발 모드 (시스템 Python 사용):**
```bash
pip install -r requirements.txt
python -m playwright install chromium
```

> 📌 **참고**: 
> - **개발 모드**: 시스템 Python 사용 (Python 설치 필요)
> - **프로덕션 빌드**: Python이 번들로 포함되어 사용자 설치 불필요

### 실행

**개발 모드:**
```bash
npm start
```

**개발 모드 (DevTools 포함):**
```bash
npm run dev
```

**프로덕션 빌드:**
```bash
npm run build
```

빌드된 앱은 `dist/` 디렉토리에 생성되며, Python 런타임이 포함되어 있습니다.

## 사용 방법

1. 앱을 실행하면 메인 화면이 표시됩니다.
2. "테스트 스크립트 선택" 드롭다운에서 실행할 pytest 테스트 파일을 선택합니다.
3. "실행" 버튼을 클릭하여 테스트를 실행합니다.
4. pytest가 테스트를 실행하고 JSON 리포트를 생성합니다.
5. 실행 결과가 "실행 결과" 패널에 표시됩니다.

### 테스트 실행 예시

- `test_example.py` 선택 → 모든 테스트 실행
- 특정 테스트만 실행하려면 pytest 옵션을 추가할 수 있습니다 (향후 기능)

## Python 테스트 작성 가이드

이 프로젝트는 **pytest**를 사용하여 테스트를 실행합니다.

### 필수 설치

먼저 pytest와 관련 플러그인을 설치해야 합니다:

```bash
pip install -r requirements.txt
```

또는 직접 설치:

```bash
pip install pytest pytest-json-report
```

### pytest 테스트 작성

테스트는 pytest 형식으로 작성해야 합니다. `test_`로 시작하는 함수나 `Test`로 시작하는 클래스가 자동으로 인식됩니다.

#### 예제 테스트 구조

```python
import pytest

class TestExample:
    """예제 테스트 클래스"""

    def test_page_load(self):
        """페이지 로드 테스트"""
        assert True, "페이지 로드 성공"

    def test_login(self):
        """로그인 테스트"""
        username = "test_user"
        assert username == "test_user", "사용자명 검증"

def test_simple():
    """간단한 테스트 함수"""
    result = 2 + 2
    assert result == 4, "계산 결과 검증"
```

#### Fixture 사용

```python
@pytest.fixture
def sample_data():
    """테스트용 샘플 데이터"""
    return {"id": 1, "name": "Sample"}

def test_with_fixture(sample_data):
    """Fixture를 사용하는 테스트"""
    assert sample_data["id"] == 1
```

#### 파라미터화된 테스트

```python
@pytest.mark.parametrize("input_value,expected", [
    (1, 2),
    (2, 4),
])
def test_parametrized(input_value, expected):
    """파라미터화된 테스트"""
    result = input_value * 2
    assert result == expected
```

### 중요 사항
- 테스트 파일은 `scripts/` 디렉토리에 저장해야 합니다.
- 파일명은 `test_*.py` 형식을 권장합니다 (예: `test_example.py`).
- `conftest.py` 파일에 공통 fixture와 설정을 정의할 수 있습니다.
- pytest는 자동으로 JSON 리포트를 생성하여 앱에서 표시합니다.

## 기술 스택

- **Electron**: 크로스 플랫폼 데스크톱 앱 프레임워크
- **Node.js**: 백엔드 로직 및 pytest 실행
- **Python**: 테스트 스크립트 실행
- **pytest**: Python 테스트 프레임워크
- **pytest-json-report**: JSON 리포트 생성 플러그인

## 개발 로드맵

1. ✅ 기본 Electron 앱 구조
2. ✅ Python 스크립트 실행 기능
3. ✅ 결과 표시 기능
4. ✅ 모듈화 및 코드 구조 개선
5. ✅ JSDoc 주석 및 문서화
6. 🔄 Recorder 기능 추가
7. 🔄 코드변환 엔진 구현
8. 🔄 테스트케이스 관리 시스템
9. 🔄 고급 Runner 기능
10. 🔄 상세 리포트 및 시각화

## 코드 구조 개선 사항

### 모듈화
- **설정 관리**: `config/config.js`로 모든 설정값 중앙 관리
- **서비스 레이어**: 비즈니스 로직을 서비스 모듈로 분리
  - `pythonService.js`: Python 실행 로직
  - `scriptManager.js`: 스크립트 관리 로직
- **유틸리티 모듈**: 렌더러 프로세스의 재사용 가능한 함수들 분리

### 주석 및 문서화
- 모든 주요 함수에 JSDoc 주석 추가
- 확장 포인트 명시 (향후 기능 추가 가이드)
- 코드 구조 및 아키텍처 설명

### 확장성
- 새로운 IPC 핸들러 추가가 용이한 구조
- 서비스 모듈 추가로 기능 확장 가능
- 설정값 변경이 용이한 구조

## 라이선스

MIT