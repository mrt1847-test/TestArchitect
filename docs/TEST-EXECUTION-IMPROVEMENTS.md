# 테스트 실행 개선사항

TestArchitect의 테스트 실행 기능 개선사항과 고급 기능 사용법을 안내합니다.

## 개요

TestArchitect는 pytest를 기반으로 한 강력한 테스트 실행 기능을 제공합니다. 병렬 실행, 재시도, 타임아웃, HTML 리포트 등 다양한 고급 기능을 지원합니다.

## 주요 개선사항

### 1. 병렬 실행 (Parallel Execution)

여러 테스트를 동시에 실행하여 전체 실행 시간을 단축할 수 있습니다.

#### 사용 방법

```javascript
const result = await window.electronAPI.runPythonScript(
  ['test_file1.py', 'test_file2.py'],
  [],
  {
    parallel: true,
    workers: 'auto'  // 또는 숫자 (예: 4)
  }
);
```

#### 옵션

- `parallel`: 병렬 실행 여부 (boolean)
- `workers`: 워커 수
  - `'auto'`: CPU 코어 수에 맞춰 자동 설정
  - 숫자: 지정한 수만큼의 워커 사용

#### 요구사항

- `pytest-xdist` 패키지 설치 필요
  ```bash
  pip install pytest-xdist
  ```

### 2. 실패 재시도 (Rerun on Failure)

일시적인 오류로 인한 실패를 자동으로 재시도할 수 있습니다.

#### 사용 방법

```javascript
const result = await window.electronAPI.runPythonScript(
  'test_file.py',
  [],
  {
    reruns: 3,           // 최대 3번 재시도
    rerunsDelay: 2       // 재시도 전 2초 대기
  }
);
```

#### 옵션

- `reruns`: 재시도 횟수 (0 = 재시도 안 함)
- `rerunsDelay`: 재시도 전 대기 시간(초)

#### 요구사항

- `pytest-rerunfailures` 패키지 설치 필요
  ```bash
  pip install pytest-rerunfailures
  ```

### 3. 타임아웃 설정 (Timeout)

각 테스트에 최대 실행 시간을 설정하여 무한 대기를 방지합니다.

#### 사용 방법

```javascript
const result = await window.electronAPI.runPythonScript(
  'test_file.py',
  [],
  {
    timeout: 60  // 60초 타임아웃
  }
);
```

#### 옵션

- `timeout`: 테스트 타임아웃(초)

#### 요구사항

- `pytest-timeout` 패키지 설치 필요
  ```bash
  pip install pytest-timeout
  ```

### 4. 최대 실패 허용 수 (Max Failures)

지정한 수만큼 테스트가 실패하면 나머지 테스트 실행을 중단합니다.

#### 사용 방법

```javascript
const result = await window.electronAPI.runPythonScript(
  ['test1.py', 'test2.py', 'test3.py'],
  [],
  {
    maxFailures: 5  // 5개 실패 시 중단
  }
);
```

#### 옵션

- `maxFailures`: 최대 실패 허용 수 (null = 무제한)

### 5. HTML 리포트 생성

테스트 실행 결과를 HTML 형식으로 생성하여 상세한 리포트를 확인할 수 있습니다.

#### 사용 방법

```javascript
const result = await window.electronAPI.runPythonScript(
  'test_file.py',
  [],
  {
    htmlReport: true
  }
);
```

#### 리포트 위치

- 기본 경로: `.pytest-reports/html/pytest-report-{timestamp}.html`
- 리포트는 자체 포함(self-contained) 형식으로 생성되어 별도 파일 없이 열 수 있습니다.

#### 요구사항

- `pytest-html` 패키지 설치 필요
  ```bash
  pip install pytest-html
  ```

### 6. 스크린샷 자동 캡처

테스트 실패 시 자동으로 스크린샷을 캡처합니다.

#### 사용 방법

```javascript
const result = await window.electronAPI.runPythonScript(
  'test_file.py',
  [],
  {
    captureScreenshots: true
  }
);
```

#### 스크린샷 위치

- 기본 경로: `.pytest-reports/screenshots/`

## 실행 옵션 조합 예시

### 빠른 병렬 실행

```javascript
const result = await window.electronAPI.runPythonScript(
  ['test1.py', 'test2.py', 'test3.py'],
  [],
  {
    parallel: true,
    workers: 4,
    timeout: 120
  }
);
```

### 안정적인 재시도 실행

```javascript
const result = await window.electronAPI.runPythonScript(
  'flaky_test.py',
  [],
  {
    reruns: 5,
    rerunsDelay: 3,
    htmlReport: true
  }
);
```

### 제한된 실패 허용

```javascript
const result = await window.electronAPI.runPythonScript(
  ['test1.py', 'test2.py', 'test3.py'],
  [],
  {
    maxFailures: 3,
    htmlReport: true,
    captureScreenshots: true
  }
);
```

## 기본 설정

기본 실행 옵션은 `src/main/config/config.js`에서 설정할 수 있습니다:

```javascript
pytest: {
  defaultOptions: {
    parallel: false,
    workers: 'auto',
    reruns: 0,
    rerunsDelay: 0,
    maxFailures: null,
    timeout: 300,
    captureScreenshots: true,
    htmlReport: false
  }
}
```

## 추가 pytest 인자

`args` 파라미터를 통해 추가 pytest 인자를 전달할 수 있습니다:

```javascript
const result = await window.electronAPI.runPythonScript(
  'test_file.py',
  ['-k', 'test_login', '--verbose'],  // 추가 인자
  {
    htmlReport: true
  }
);
```

### 유용한 pytest 인자

- `-k EXPRESSION`: 표현식과 일치하는 테스트만 실행
- `-v`, `--verbose`: 상세 출력
- `-s`: 출력 캡처 비활성화
- `-m MARKER`: 마커로 필터링
- `--tb=short`: 짧은 트레이스백
- `--tb=long`: 긴 트레이스백

## 성능 최적화 팁

1. **병렬 실행 활용**: 많은 테스트가 있는 경우 `parallel: true` 사용
2. **타임아웃 설정**: 무한 대기 방지를 위해 적절한 타임아웃 설정
3. **선택적 실행**: `-k` 옵션으로 필요한 테스트만 실행
4. **재시도 최소화**: 안정적인 테스트는 `reruns: 0`으로 설정

## 문제 해결

### 병렬 실행 오류

- **원인**: `pytest-xdist` 미설치 또는 테스트 간 리소스 충돌
- **해결**: 패키지 설치 확인 및 테스트 격리 확인

### 재시도가 작동하지 않음

- **원인**: `pytest-rerunfailures` 미설치
- **해결**: 패키지 설치 확인

### 타임아웃이 적용되지 않음

- **원인**: `pytest-timeout` 미설치
- **해결**: 패키지 설치 확인

### HTML 리포트가 생성되지 않음

- **원인**: `pytest-html` 미설치
- **해결**: 패키지 설치 확인

## 관련 파일

- `src/main/services/pytestService.js`: pytest 실행 서비스
- `src/main/config/config.js`: 실행 옵션 설정
- `scripts/pytest.ini`: pytest 설정 파일
- `scripts/conftest.py`: pytest 공통 설정 및 fixture

## 참고 자료

- [pytest 공식 문서](https://docs.pytest.org/)
- [pytest-xdist 문서](https://pytest-xdist.readthedocs.io/)
- [pytest-rerunfailures 문서](https://github.com/pytest-dev/pytest-rerunfailures)
- [pytest-timeout 문서](https://pytest-timeout.readthedocs.io/)
- [pytest-html 문서](https://pytest-html.readthedocs.io/)


