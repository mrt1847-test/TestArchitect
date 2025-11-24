"""
예제 pytest 테스트
pytest 형식으로 작성된 테스트 예제
"""

import pytest
import time


class TestExample:
    """예제 테스트 클래스"""

    def test_page_load(self):
        """페이지 로드 테스트"""
        # 테스트 시뮬레이션
        time.sleep(0.1)
        assert True, "페이지 로드 성공"

    def test_login(self):
        """로그인 테스트"""
        # 테스트 시뮬레이션
        time.sleep(0.1)
        username = "test_user"
        password = "test_pass"
        assert username == "test_user", "사용자명 검증"
        assert password == "test_pass", "비밀번호 검증"

    def test_data_input(self):
        """데이터 입력 테스트"""
        # 테스트 시뮬레이션
        time.sleep(0.1)
        test_data = {"name": "Test", "value": 123}
        assert test_data["name"] == "Test", "데이터 이름 검증"
        assert test_data["value"] == 123, "데이터 값 검증"

    def test_validation(self):
        """검증 테스트"""
        # 테스트 시뮬레이션
        time.sleep(0.1)
        result = 2 + 2
        assert result == 4, "계산 결과 검증"

    def test_logout(self):
        """로그아웃 테스트"""
        # 테스트 시뮬레이션
        time.sleep(0.1)
        logged_in = False
        assert logged_in == False, "로그아웃 상태 검증"


@pytest.fixture
def sample_data():
    """테스트용 샘플 데이터 fixture"""
    return {
        "id": 1,
        "name": "Sample",
        "active": True
    }


def test_with_fixture(sample_data):
    """Fixture를 사용하는 테스트"""
    assert sample_data["id"] == 1
    assert sample_data["name"] == "Sample"
    assert sample_data["active"] == True


@pytest.mark.parametrize("input_value,expected", [
    (1, 2),
    (2, 4),
    (3, 6),
])
def test_parametrized(input_value, expected):
    """파라미터화된 테스트"""
    result = input_value * 2
    assert result == expected, f"{input_value} * 2 = {expected}"

