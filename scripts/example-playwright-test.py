"""
Playwright를 사용한 예제 테스트
"""

import pytest
from playwright.sync_api import sync_playwright, Page, expect, Browser, Playwright


@pytest.fixture(scope="session")
def playwright_instance() -> Playwright:
    """Playwright 인스턴스 생성"""
    with sync_playwright() as p:
        yield p


@pytest.fixture(scope="session")
def browser(playwright_instance: Playwright) -> Browser:
    """브라우저 인스턴스 생성"""
    browser = playwright_instance.chromium.launch(headless=True)
    yield browser
    browser.close()


@pytest.fixture(scope="function")
def page(browser: Browser) -> Page:
    """새 페이지 생성"""
    page = browser.new_page()
    yield page
    page.close()


def test_google_search(page: Page):
    """Google 검색 테스트"""
    # Google 접속
    page.goto("https://www.google.com")
    
    # 검색어 입력
    search_box = page.locator('textarea[name="q"]')
    search_box.fill("Playwright Python")
    
    # 검색 실행
    page.keyboard.press("Enter")
    
    # 결과 페이지 로드 대기
    page.wait_for_load_state("networkidle")
    
    # 검색 결과 확인
    results = page.locator("h3").first
    expect(results).to_be_visible()


def test_github_navigation(page: Page):
    """GitHub 네비게이션 테스트"""
    # GitHub 접속
    page.goto("https://github.com")
    
    # 타이틀 확인 (GitHub 타이틀은 변경될 수 있으므로 부분 일치)
    title = page.title()
    assert "GitHub" in title, f"예상한 타이틀에 'GitHub'가 포함되지 않았습니다: {title}"
    
    # 로고 확인
    logo = page.locator("svg.octicon-mark-github").first
    expect(logo).to_be_visible()

