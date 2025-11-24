"""
pytest 설정 파일
모든 테스트에 공통으로 적용되는 설정 및 fixture 정의
"""

import pytest
import sys
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


@pytest.fixture(scope="session")
def test_config():
    """테스트 설정 fixture"""
    return {
        "timeout": 30,
        "retry_count": 3,
        "base_url": "http://localhost:8000"
    }


def pytest_configure(config):
    """pytest 설정 초기화"""
    # 커스텀 마커 등록
    config.addinivalue_line(
        "markers", "slow: 느린 테스트 (실행 시간이 오래 걸림)"
    )
    config.addinivalue_line(
        "markers", "integration: 통합 테스트"
    )
    config.addinivalue_line(
        "markers", "unit: 단위 테스트"
    )

