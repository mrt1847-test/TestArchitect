# Python 번들링 완전 가이드

## ✅ 번들에 포함되는 항목

### 1. Python 런타임
- Python 3.11+ 실행 파일
- pip 및 기본 패키지

### 2. Python 패키지 (자동 포함)
- ✅ **pytest** - 테스트 프레임워크
- ✅ **pytest-json-report** - JSON 리포트 생성
- ✅ **playwright** - Playwright 패키지
- ✅ **selenium** - Selenium WebDriver
- ✅ **webdriver-manager** - Selenium 드라이버 자동 관리

### 3. Playwright 브라우저 (자동 포함)
- ✅ **Chromium 브라우저** - 빌드 시 자동 설치
- 브라우저는 `python-bundle/.playwright`에 설치되며 앱에 포함됨

### 4. Selenium WebDriver
- ⚠️ **첫 실행 시 자동 다운로드** (인터넷 연결 필요)
- webdriver-manager가 자동으로 ChromeDriver 다운로드
- 이후에는 캐시된 드라이버 사용

## 📦 빌드 프로세스

### 자동 빌드

```bash
npm run build-python
```

이 명령어가 자동으로:
1. Python 가상환경 생성
2. 모든 Python 패키지 설치 (playwright, selenium 포함)
3. Playwright Chromium 브라우저 설치
4. 번들 디렉토리에 모든 것 포함

### 빌드 결과

```
python-bundle/
├── python/              # Python 런타임
│   ├── python.exe      # (Windows)
│   ├── Scripts/        # pip, pytest 등
│   └── Lib/            # 설치된 패키지
└── .playwright/         # Playwright 브라우저
    └── chromium-*/      # Chromium 브라우저
```

## 🚀 사용자 경험

### 사용자가 해야 할 일

**아무것도 없음!** ✅

1. 앱 다운로드 및 실행
2. 테스트 파일 선택
3. 실행 버튼 클릭

### 자동 처리되는 것

- ✅ Python 런타임 자동 감지 및 사용
- ✅ pytest 자동 실행
- ✅ Playwright 브라우저 자동 사용
- ✅ Selenium WebDriver 자동 다운로드 (첫 실행 시만)

## ⚠️ 주의사항

### Selenium WebDriver

- **첫 실행 시**: 인터넷 연결 필요 (ChromeDriver 자동 다운로드)
- **이후 실행**: 캐시된 드라이버 사용 (인터넷 불필요)

### Playwright 브라우저

- ✅ **완전히 번들에 포함됨**
- ✅ 인터넷 연결 불필요
- ✅ 오프라인에서도 작동

## 🔧 개발자 가이드

### 개발 모드 (시스템 Python 사용)

```bash
# 시스템 Python 사용
pip install -r requirements.txt
python -m playwright install chromium
npm start
```

### 프로덕션 빌드 (Python 번들 포함)

```bash
# Python 번들 빌드
npm run build-python

# Electron 앱 빌드
npm run build
```

빌드된 앱은 `dist/` 디렉토리에 생성되며, 모든 것이 포함되어 있습니다.

## 📊 번들 크기

- Python 런타임: ~100-150MB
- Python 패키지: ~50-100MB
- Playwright 브라우저: ~150-200MB
- **총 크기**: 약 300-450MB

## ✅ 결론

**사용자는 아무것도 설치할 필요가 없습니다!**

- ✅ Python: 번들에 포함
- ✅ pytest: 번들에 포함
- ✅ playwright: 번들에 포함
- ✅ playwright 브라우저: 번들에 포함
- ⚠️ selenium WebDriver: 첫 실행 시 자동 다운로드 (한 번만)

