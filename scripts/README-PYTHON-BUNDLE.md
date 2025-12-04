# Python 번들링 가이드

이 가이드는 Python 런타임을 Electron 앱에 번들로 포함하는 방법을 설명합니다.

## 자동 빌드

```bash
npm run build-python
```

이 명령어는 자동으로:
1. Python 가상환경 생성
2. 필요한 패키지 설치 (pytest, playwright, selenium, pytest-playwright-visual-snapshot 등)
3. Playwright 브라우저 설치

## 수동 빌드

### 1. Python Portable 다운로드

**Windows:**
- Python 공식 사이트: https://www.python.org/downloads/
- WinPython (권장): https://winpython.github.io/
  - WinPython은 portable 버전을 제공하여 번들링에 적합합니다

**macOS/Linux:**
- Python 3.11 이상 다운로드
- 또는 시스템 Python 사용

### 2. Python을 번들 디렉토리에 복사

```
python-bundle/
  └── python/
      ├── python.exe (Windows) 또는 python3 (macOS/Linux)
      ├── Scripts/ (Windows) 또는 bin/ (macOS/Linux)
      └── ...
```

### 3. 가상환경 생성 (선택사항)

시스템 Python을 사용하는 경우:

```bash
# Windows
python -m venv python-bundle/python

# macOS/Linux
python3 -m venv python-bundle/python
```

### 4. 패키지 설치

```bash
# Windows
python-bundle/python/Scripts/activate
pip install -r requirements.txt

# macOS/Linux
source python-bundle/python/bin/activate
pip install -r requirements.txt
```

### 5. Playwright 브라우저 설치

```bash
# Windows
python-bundle/python/Scripts/python.exe -m playwright install chromium

# macOS/Linux
python-bundle/python/bin/python -m playwright install chromium
```

## 빌드 시 포함

`electron-builder.yml`에 이미 설정되어 있어, 빌드 시 자동으로 포함됩니다:

```yaml
extraResources:
  - from: "python-bundle/python"
    to: "python"
```

## 주의사항

1. **용량**: Python 번들은 약 200-500MB 정도의 용량을 차지합니다.
2. **플랫폼별 빌드**: 각 플랫폼(Windows, macOS, Linux)마다 별도로 빌드해야 합니다.
3. **Playwright 브라우저**: Chromium 브라우저는 추가로 약 100-200MB를 차지합니다.

## 개발 모드 vs 프로덕션 모드

- **개발 모드**: 시스템 Python 사용 (빌드 불필요)
- **프로덕션 모드**: 번들된 Python 사용 (빌드 필요)

앱은 자동으로 번들된 Python을 우선 사용하고, 없으면 시스템 Python을 사용합니다.

