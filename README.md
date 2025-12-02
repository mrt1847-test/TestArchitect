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
│   │       ├── scriptManager.js # 스크립트 관리 서비스
│   │       ├── dbService.js     # 로컬 SQLite 데이터베이스 서비스
│   │       ├── apiService.js    # 서버 API 통신 서비스
│   │       └── domSnapshotService.js # DOM 스냅샷 저장 서비스
│   ├── preload/                 # Preload 스크립트
│   │   └── preload.js           # IPC 브릿지 (보안)
│   └── renderer/                # UI 렌더러 프로세스
│       ├── index.html           # 메인 UI
│       ├── styles.css           # 스타일시트
│       ├── renderer.js          # 렌더러 메인 로직
│       ├── recorder.js          # 테스트 녹화 모듈
│       └── utils/               # 렌더러 유틸리티
│           ├── scriptLoader.js  # 스크립트 로더
│           ├── testRunner.js    # 테스트 실행 유틸
│           ├── uiHelper.js      # UI 헬퍼 함수
│           ├── codeGenerator.js # 코드 생성 유틸
│           ├── domSnapshot.js   # DOM 스냅샷 유틸리티
│           └── ...              # 기타 유틸리티
├── server/                      # 백엔드 서버 (선택사항)
│   ├── index.js                 # 서버 진입점
│   ├── database/                # 데이터베이스 모듈
│   └── routes/                  # API 라우트
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

#### 핵심 기능
- ✅ **Electron 기반 UI** - 크로스 플랫폼 데스크톱 애플리케이션
- ✅ **테스트 녹화 (Recorder)** - 브라우저 상호작용 자동 기록
  - 클릭, 입력, 네비게이션 등 이벤트 캡처
  - 셀렉터 자동 생성 및 최적화
  - 실시간 코드 생성 및 미리보기
  - AI 기반 셀렉터 제안 (선택사항)
- ✅ **코드 생성 (Code Generator)** - 다양한 프레임워크 지원
  - Playwright, Selenium, Appium 지원
  - Python, JavaScript, TypeScript 언어 지원
  - 키워드 기반 코드 생성
- ✅ **테스트케이스 관리** - TestRail 스타일 TC 관리
  - 프로젝트/폴더 구조 지원
  - Steps 기반 테스트케이스 작성
  - 로컬 SQLite 또는 서버 MySQL 저장
  - 실시간 동기화 (서버 모드)
- ✅ **테스트 실행 (Runner)** - pytest 기반 실행
  - Python 스크립트 실행
  - JSON 리포트 생성 및 파싱
  - 결과 시각화
  - 스크린샷 자동 캡처
- ✅ **DOM 스냅샷 저장** - 페이지별 DOM 구조 저장
  - 페이지 진입 시 자동 DOM 캡처
  - 매월 상반기(1-15일)와 하반기(16-말일) 각각 한 번만 저장
  - 정규화된 URL 기준 저장 (도메인+경로, 쿼리 제외)
  - 60일 이상 된 스냅샷 자동 정리
  - gzip 압축으로 저장 공간 최적화
- ✅ **로컬/서버 모드** - 유연한 저장 방식
  - 로컬 SQLite 모드 (서버 불필요)
  - 서버 MySQL 모드 (팀 협업)
  - 자동 모드 전환 지원

#### 데이터 관리
- ✅ **로컬 데이터베이스** - SQLite 기반 로컬 저장
- ✅ **서버 데이터베이스** - MySQL 기반 서버 저장 (선택사항)
- ✅ **실시간 동기화** - WebSocket 기반 실시간 업데이트
- ✅ **버전 관리** - 테스트케이스 및 스크립트 버전 관리

### 향후 확장 예정
- 🔄 **고급 Runner 기능** - 병렬 실행, 재시도, 타임아웃 설정
- 🔄 **상세 리포트 및 시각화** - 차트, 그래프, 트렌드 분석
- 🔄 **Page Object Model (POM)** - 고급 POM 지원 확장
- 🔄 **CI/CD 통합** - Jenkins, GitHub Actions 연동

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

> ⚠️ **중요**: `python-bundle/` 디렉토리는 `.gitignore`에 포함되어 있어 Git에 커밋되지 않습니다.  
> 다른 컴퓨터에서 작업할 때는 다음 중 하나를 수행하세요:
> 
> **방법 1 (권장)**: `npm install` 실행 시 자동 설치
> ```bash
> npm install
> ```
> `postinstall` 스크립트가 자동으로 Python 번들을 생성하고 패키지를 설치합니다.
> 
> **방법 2**: 수동 설치
> ```bash
> npm run build-python
> ```
> 
> **방법 3**: 기존 번들 복사
> - 다른 컴퓨터의 `python-bundle/` 디렉토리를 현재 컴퓨터로 복사
> - 또는 USB/네트워크 드라이브로 전송

**또는 개발 모드 (시스템 Python 사용):**
```bash
pip install -r requirements.txt
python -m playwright install chromium
```

> 📌 **참고**: 
> - **개발 모드**: 시스템 Python 사용 (Python 설치 필요)
> - **프로덕션 빌드**: Python이 번들로 포함되어 사용자 설치 불필요
> - **다른 컴퓨터로 전송**: `npm install` 실행 시 자동으로 번들이 생성됩니다

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

### 1. 테스트 녹화 (Recorder)

1. 앱 실행 후 "Recorder" 탭 선택
2. "녹화 시작" 버튼 클릭
3. 브라우저에서 테스트할 웹사이트로 이동
4. 클릭, 입력 등 상호작용 수행
5. "녹화 중지" 버튼으로 녹화 종료
6. 생성된 코드 확인 및 수정
7. 테스트케이스로 저장

**특징:**
- 페이지 진입 시 자동으로 DOM 스냅샷 저장
- 각 페이지별로 매월 상반기/하반기 각각 한 번씩만 저장
- 저장된 DOM 구조는 60일간 보관 후 자동 삭제

### 2. 테스트케이스 관리

1. "Test Cases" 탭에서 프로젝트 선택
2. 폴더/테스트케이스 생성
3. Steps 기반으로 테스트 단계 작성
4. 키워드 라이브러리 활용
5. 저장 및 버전 관리

### 3. 코드 생성

1. 녹화된 이벤트 또는 Steps에서 코드 생성
2. 프레임워크 선택 (Playwright, Selenium, Appium)
3. 언어 선택 (Python, JavaScript, TypeScript)
4. 생성된 코드 확인 및 수정
5. 스크립트로 저장

### 4. 테스트 실행

1. "Runner" 탭에서 테스트 스크립트 선택
2. 실행 옵션 설정 (병렬 실행, 재시도 등)
3. "실행" 버튼 클릭
4. 실행 결과 확인
5. 리포트 및 스크린샷 확인

### 테스트 실행 예시

- `test_example.py` 선택 → 모든 테스트 실행
- 특정 테스트만 실행하려면 pytest 옵션을 추가할 수 있습니다

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

### 프론트엔드
- **Electron**: 크로스 플랫폼 데스크톱 앱 프레임워크
- **HTML/CSS/JavaScript**: UI 구현
- **CodeMirror**: 코드 에디터

### 백엔드
- **Node.js**: 백엔드 로직 및 pytest 실행
- **Express**: 서버 프레임워크 (선택사항)
- **WebSocket**: 실시간 동기화

### 데이터베이스
- **SQLite**: 로컬 데이터베이스 (sql.js)
- **MySQL**: 서버 데이터베이스 (선택사항)

### 테스트 프레임워크
- **Python**: 테스트 스크립트 실행
- **pytest**: Python 테스트 프레임워크
- **pytest-json-report**: JSON 리포트 생성 플러그인
- **Playwright**: 브라우저 자동화
- **Selenium**: 웹 자동화
- **Appium**: 모바일 자동화

### 기타
- **zlib**: DOM 스냅샷 압축
- **Chrome DevTools Protocol (CDP)**: 브라우저 제어

## 개발 로드맵

### 완료된 기능 ✅
1. ✅ 기본 Electron 앱 구조
2. ✅ Python 스크립트 실행 기능
3. ✅ 결과 표시 기능
4. ✅ 모듈화 및 코드 구조 개선
5. ✅ JSDoc 주석 및 문서화
6. ✅ Recorder 기능 (테스트 녹화)
7. ✅ 코드변환 엔진 (다양한 프레임워크 지원)
8. ✅ 테스트케이스 관리 시스템
9. ✅ 로컬/서버 데이터베이스 지원
10. ✅ DOM 스냅샷 저장 기능
11. ✅ 실시간 동기화 (서버 모드)
12. ✅ AI 기반 셀렉터 제안

### 진행 중 / 향후 계획 🔄
1. 🔄 고급 Runner 기능 (병렬 실행, 재시도, 타임아웃)
2. 🔄 상세 리포트 및 시각화 (차트, 그래프)
3. 🔄 Page Object Model (POM) 고급 기능
4. 🔄 CI/CD 통합 (Jenkins, GitHub Actions)
5. 🔄 테스트 데이터 관리
6. 🔄 키워드 라이브러리 확장

## 코드 구조 개선 사항

### 모듈화
- **설정 관리**: `config/config.js`로 모든 설정값 중앙 관리
- **서비스 레이어**: 비즈니스 로직을 서비스 모듈로 분리
  - `pythonService.js`: Python 실행 로직
  - `scriptManager.js`: 스크립트 관리 로직
  - `dbService.js`: 로컬 SQLite 데이터베이스 관리
  - `apiService.js`: 서버 API 통신
  - `domSnapshotService.js`: DOM 스냅샷 저장 (로컬/서버 모드 지원)
- **유틸리티 모듈**: 렌더러 프로세스의 재사용 가능한 함수들 분리
  - `codeGenerator.js`: 코드 생성 엔진
  - `domSnapshot.js`: DOM 캡처 및 URL 정규화
  - `selectorUtils.js`: 셀렉터 최적화
  - `aiService.js`: AI 기반 셀렉터 제안

### DOM 스냅샷 저장 기능

페이지 진입 시 자동으로 DOM 구조를 캡처하여 저장하는 기능입니다.

**주요 특징:**
- **자동 저장**: 페이지 진입 시 자동으로 DOM 구조 캡처
- **주기적 저장**: 매월 상반기(1-15일)와 하반기(16-말일) 각각 한 번만 저장
- **중복 방지**: 같은 기간 내 저장 이력이 있으면 저장하지 않음
- **URL 정규화**: 도메인+경로 기준 저장 (쿼리 파라미터 제외)
- **자동 정리**: 60일 이상 된 스냅샷 자동 삭제
- **압축 저장**: gzip 압축으로 저장 공간 최적화
- **로컬/서버 지원**: 로컬 SQLite 또는 서버 MySQL 저장

**사용 예시:**
```
페이지 진입: https://example.com/page?id=123
→ 정규화: https://example.com/page
→ DOM 구조 캡처 및 압축 저장
→ 같은 기간 내 재방문 시 저장 건너뜀
```

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