"""
테스트 유틸리티 함수
공통으로 사용되는 헬퍼 함수들을 정의
"""

import re
import ast
import inspect
from urllib.parse import urlparse
from typing import Optional, Dict, Any, List


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


def extract_locator_failure_info(rep, item) -> Optional[Dict[str, Any]]:
    """
    테스트 실패 리포트에서 locator 실패 정보 추출
    
    Args:
        rep: pytest 리포트 객체
        item: pytest 테스트 아이템
        
    Returns:
        locator 실패 정보 딕셔너리 또는 None
    """
    if not rep.failed or not rep.longrepr:
        return None
    
    error_message = str(rep.longrepr)
    exc_info = getattr(rep, 'longrepr', None)
    
    # Playwright TimeoutError 감지
    playwright_timeout_patterns = [
        r"TimeoutError:.*?Locator\.(?:click|fill|press|wait_for|locator)",
        r"TimeoutError.*?locator\(['\"]([^'\"]+)['\"]\)",
        r"Locator\.(?:click|fill|press|wait_for).*?timeout",
    ]
    
    # Selenium ElementNotFound 감지
    selenium_patterns = [
        r"NoSuchElementException.*?(\w+)\s*=\s*['\"]([^'\"]+)['\"]",
        r"ElementNotFoundError.*?(\w+)\s*=\s*['\"]([^'\"]+)['\"]",
        r"selenium\.common\.exceptions\.NoSuchElementException",
    ]
    
    failed_locator = None
    locator_type = None
    
    # Playwright locator 추출
    for pattern in playwright_timeout_patterns:
        match = re.search(pattern, error_message, re.IGNORECASE)
        if match:
            locator_type = 'playwright'
            # 다양한 locator 패턴 추출
            locator_patterns = [
                r"locator\(['\"]([^'\"]+)['\"]\)",
                r"\.locator\(['\"]([^'\"]+)['\"]\)",
                r":has-text\(['\"]([^'\"]+)['\"]\)",
                r"text=['\"]([^'\"]+)['\"]",
            ]
            for loc_pattern in locator_patterns:
                locator_match = re.search(loc_pattern, error_message)
                if locator_match:
                    failed_locator = locator_match.group(1)
                    break
            if not failed_locator:
                # 전체 locator 표현식 추출
                full_locator_match = re.search(r"(?:page|self)\.locator\(['\"]([^'\"]+)['\"]\)", error_message)
                if full_locator_match:
                    failed_locator = full_locator_match.group(1)
            break
    
    # Selenium locator 추출
    if not failed_locator:
        for pattern in selenium_patterns:
            match = re.search(pattern, error_message, re.IGNORECASE)
            if match:
                locator_type = 'selenium'
                if len(match.groups()) >= 2:
                    failed_locator = match.group(2)
                break
    
    # 소스 코드에서 locator 추출 시도 (AST 파싱 사용)
    if not failed_locator and hasattr(item, 'func') and hasattr(item.func, '__code__'):
        try:
            source_file = inspect.getfile(item.func)
            with open(source_file, 'r', encoding='utf-8') as f:
                source_code = f.read()
                source_lines = source_code.splitlines()
            
            # 실패한 라인 번호 추정 (traceback에서)
            line_number = _extract_line_number_from_error(error_message)
            
            if line_number:
                # AST 파싱으로 정확한 locator 추출 시도
                failed_locator = _extract_locator_with_ast(source_code, line_number, locator_type)
                
                # AST 파싱 실패 시 정규식으로 폴백
                if not failed_locator:
                    failed_locator = _extract_locator_from_source(source_lines, line_number, locator_type)
        except Exception as e:
            # 추출 실패는 무시
            pass
    
    if not failed_locator:
        return None
    
    # 현재 페이지 URL 추출 시도
    page_url = None
    try:
        # 에러 메시지에서 URL 추출 시도
        url_patterns = [
            r"navigating to ['\"]([^'\"]+)['\"]",
            r"url:\s*['\"]([^'\"]+)['\"]",
            r"page\.goto\(['\"]([^'\"]+)['\"]\)",
            r"driver\.get\(['\"]([^'\"]+)['\"]\)",
        ]
        for pattern in url_patterns:
            match = re.search(pattern, error_message, re.IGNORECASE)
            if match:
                page_url = match.group(1)
                break
    except Exception:
        pass
    
    return {
        'test_file': str(item.fspath) if hasattr(item, 'fspath') else None,
        'test_function': item.name,
        'failed_locator': failed_locator,
        'locator_type': locator_type or 'unknown',
        'error_message': error_message[:500],  # 길이 제한
        'line_number': _extract_line_number_from_error(error_message),
        'page_url': page_url
    }


def _extract_line_number_from_error(error_message: str) -> Optional[int]:
    """에러 메시지에서 라인 번호 추출"""
    # File "path/to/file.py", line X 패턴
    line_match = re.search(r'File\s+["\']([^"\']+)["\'],\s+line\s+(\d+)', error_message)
    if line_match:
        return int(line_match.group(2))
    return None


def _extract_locator_with_ast(source_code: str, line_number: int, locator_type: Optional[str]) -> Optional[str]:
    """AST 파싱을 사용하여 소스 코드에서 locator 추출"""
    try:
        tree = ast.parse(source_code)
        
        class LocatorVisitor(ast.NodeVisitor):
            def __init__(self, target_line: int):
                self.target_line = target_line
                self.found_locator = None
                self.locator_type = locator_type
            
            def visit_Call(self, node):
                # Playwright: page.locator('...')
                if isinstance(node.func, ast.Attribute):
                    if node.func.attr == 'locator' and node.lineno == self.target_line:
                        if node.args and isinstance(node.args[0], ast.Constant):
                            self.found_locator = node.args[0].value
                            return
                    # Selenium: driver.find_element(...)
                    elif node.func.attr == 'find_element' and node.lineno == self.target_line:
                        if len(node.args) >= 2 and isinstance(node.args[1], ast.Constant):
                            self.found_locator = node.args[1].value
                            return
                
                # 중첩된 호출 처리
                self.generic_visit(node)
        
        visitor = LocatorVisitor(line_number)
        visitor.visit(tree)
        return visitor.found_locator
    except Exception:
        return None


def _extract_locator_from_source(source_lines: list, line_number: int, locator_type: Optional[str]) -> Optional[str]:
    """정규식을 사용하여 소스 코드에서 locator 추출 (AST 파싱 실패 시 폴백)"""
    if line_number < 1 or line_number > len(source_lines):
        return None
    
    # 해당 라인과 주변 라인 검색 (최대 10줄 위아래)
    start = max(0, line_number - 10)
    end = min(len(source_lines), line_number + 10)
    
    context_lines = source_lines[start:end]
    context_text = '\n'.join(context_lines)
    
    # Playwright 패턴: page.locator('...') 또는 locator('...')
    playwright_patterns = [
        r"(?:page|self|driver)\.locator\(['\"]([^'\"]+)['\"]\)",
        r"locator\(['\"]([^'\"]+)['\"]\)",
        r":has-text\(['\"]([^'\"]+)['\"]\)",
        r"get_by_text\(['\"]([^'\"]+)['\"]\)",
        r"get_by_role\(['\"]([^'\"]+)['\"]\)",
    ]
    
    # Selenium 패턴: driver.find_element(By.XXX, '...')
    selenium_patterns = [
        r"find_element\([^,]+,\s*['\"]([^'\"]+)['\"]\)",
        r"find_element_by_(\w+)\(['\"]([^'\"]+)['\"]\)",
        r"find_element\(By\.\w+,\s*['\"]([^'\"]+)['\"]\)",
    ]
    
    patterns = playwright_patterns if locator_type == 'playwright' else selenium_patterns
    if not locator_type:
        patterns = playwright_patterns + selenium_patterns
    
    # 라인 번호에 가까운 매칭 우선
    matches = []
    for pattern in patterns:
        for match in re.finditer(pattern, context_text):
            match_line = context_text[:match.start()].count('\n') + start + 1
            distance = abs(match_line - line_number)
            locator_value = match.group(1) if len(match.groups()) > 0 else (match.group(2) if len(match.groups()) > 1 else None)
            if locator_value:
                matches.append((distance, locator_value))
    
    if matches:
        # 가장 가까운 라인의 locator 반환
        matches.sort(key=lambda x: x[0])
        return matches[0][1]
    
    return None

