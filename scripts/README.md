# 테스트 스크립트 디렉토리

이 디렉토리는 pytest 테스트 파일을 저장하는 곳입니다.

## 파일 구조

- `test_*.py`: pytest 테스트 파일 (자동으로 인식됨)
- `conftest.py`: pytest 설정 및 공통 fixture 정의

## 테스트 작성 가이드

### 기본 테스트

```python
def test_example():
    assert 1 + 1 == 2
```

### 테스트 클래스

```python
class TestExample:
    def test_method(self):
        assert True
```

### Fixture 사용

```python
@pytest.fixture
def data():
    return {"key": "value"}

def test_with_fixture(data):
    assert data["key"] == "value"
```

## 실행 방법

1. Electron 앱에서 테스트 파일 선택
2. "실행" 버튼 클릭
3. pytest가 자동으로 테스트를 실행하고 결과를 반환

## 참고사항

- 모든 테스트는 pytest 형식으로 작성되어야 합니다
- `conftest.py`에 공통 설정을 정의할 수 있습니다
- 테스트 파일은 `test_`로 시작하거나 `Test`로 시작하는 클래스를 포함해야 합니다

