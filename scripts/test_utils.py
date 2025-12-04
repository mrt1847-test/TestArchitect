"""
테스트 유틸리티 함수
공통으로 사용되는 헬퍼 함수들을 정의
"""

from urllib.parse import urlparse


def normalize_url(url):
    """URL 정규화: 쿼리 파라미터를 제거하여 기본 경로만 반환"""
    if not url:
        return url
    try:
        parsed = urlparse(url)
        return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    except:
        # URL 파싱 실패 시 쿼리 스트링만 제거
        query_index = url.find('?')
        return url[:query_index] if query_index != -1 else url

