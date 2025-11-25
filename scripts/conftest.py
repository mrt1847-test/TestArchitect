"""
pytest 설정 파일
모든 테스트에 공통으로 적용되는 설정 및 fixture 정의
"""

import pytest
import sys
import os
import time
from pathlib import Path
from typing import Optional

# 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


def pytest_addoption(parser):
    """pytest 명령줄 옵션 추가"""
    parser.addoption(
        "--browser",
        action="store",
        default=os.getenv("TEST_BROWSER", "chromium"),
        choices=["chromium", "firefox", "webkit", "chrome", "edge"],
        help="사용할 브라우저 선택 (chromium, firefox, webkit, chrome, edge)"
    )
    parser.addoption(
        "--headless",
        action="store",
        default=os.getenv("TEST_HEADLESS", "true"),
        choices=["true", "false"],
        help="헤드리스 모드 실행 여부 (true, false)"
    )
    parser.addoption(
        "--driver",
        action="store",
        default=os.getenv("TEST_DRIVER", "playwright"),
        choices=["playwright", "selenium"],
        help="사용할 웹드라이버 (playwright, selenium)"
    )
    parser.addoption(
        "--base-url",
        action="store",
        default=os.getenv("TEST_BASE_URL", "http://localhost:8000"),
        help="테스트 기본 URL"
    )


@pytest.fixture(scope="session")
def test_config(pytestconfig):
    """테스트 설정 fixture"""
    return {
        "timeout": 30,
        "retry_count": 3,
        "base_url": pytestconfig.getoption("--base-url"),
        "browser": pytestconfig.getoption("--browser"),
        "headless": pytestconfig.getoption("--headless") == "true",
        "driver": pytestconfig.getoption("--driver")
    }


# ============================================================================
# Playwright Fixtures
# ============================================================================

@pytest.fixture(scope="session")
def playwright_instance():
    """Playwright 인스턴스 생성"""
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            yield p
    except ImportError:
        pytest.skip("Playwright가 설치되지 않았습니다. 'pip install playwright' 실행 후 'playwright install' 실행하세요.")


@pytest.fixture(scope="session")
def browser_type(playwright_instance, test_config):
    """브라우저 타입 선택"""
    browser_name = test_config["browser"]
    
    browser_map = {
        "chromium": playwright_instance.chromium,
        "firefox": playwright_instance.firefox,
        "webkit": playwright_instance.webkit,
        "chrome": playwright_instance.chromium,  # chromium으로 대체
        "edge": playwright_instance.chromium      # chromium으로 대체
    }
    
    return browser_map.get(browser_name, playwright_instance.chromium)


@pytest.fixture(scope="session")
def browser_playwright(browser_type, test_config):
    """Playwright 브라우저 인스턴스 생성"""
    from playwright.sync_api import Browser
    
    launch_options = {
        "headless": test_config["headless"]
    }
    
    # Chrome/Edge는 chromium을 사용하되 추가 옵션 설정
    if test_config["browser"] in ["chrome", "edge"]:
        launch_options["channel"] = test_config["browser"]
    
    browser = browser_type.launch(**launch_options)
    yield browser
    browser.close()


@pytest.fixture(scope="function")
def page_playwright(browser_playwright, request):
    """Playwright 페이지 생성 (스크린샷 자동 캡처 포함)"""
    from playwright.sync_api import Page
    import os
    
    page = browser_playwright.new_page()
    
    yield page
    
    # 실패 시 스크린샷 자동 캡처
    if hasattr(request.node, 'rep_call') and request.node.rep_call.failed:
        screenshot_dir = os.getenv('PYTEST_SCREENSHOT_DIR', '.pytest-reports/screenshots')
        os.makedirs(screenshot_dir, exist_ok=True)
        
        test_name = request.node.name.replace('::', '_').replace('/', '_')
        timestamp = int(time.time() * 1000)
        screenshot_path = os.path.join(screenshot_dir, f'{test_name}_{timestamp}.png')
        
        try:
            page.screenshot(path=screenshot_path, full_page=True)
            print(f"스크린샷 저장: {screenshot_path}")
        except Exception as e:
            print(f"스크린샷 캡처 실패: {e}")
    
    page.close()


# ============================================================================
# Selenium Fixtures
# ============================================================================

@pytest.fixture(scope="session")
def selenium_driver_options(test_config):
    """Selenium WebDriver 옵션 생성"""
    try:
        from selenium.webdriver.chrome.options import Options as ChromeOptions
        from selenium.webdriver.firefox.options import Options as FirefoxOptions
        from selenium.webdriver.edge.options import Options as EdgeOptions
    except ImportError:
        pytest.skip("Selenium이 설치되지 않았습니다. 'pip install selenium' 실행하세요.")
    
    browser_name = test_config["browser"]
    headless = test_config["headless"]
    
    if browser_name in ["chromium", "chrome"]:
        options = ChromeOptions()
        if headless:
            options.add_argument("--headless")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        return options, "Chrome"
    elif browser_name == "firefox":
        options = FirefoxOptions()
        if headless:
            options.add_argument("--headless")
        return options, "Firefox"
    elif browser_name == "edge":
        options = EdgeOptions()
        if headless:
            options.add_argument("--headless")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        return options, "Edge"
    else:
        # 기본값: Chrome
        options = ChromeOptions()
        if headless:
            options.add_argument("--headless")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        return options, "Chrome"


@pytest.fixture(scope="function")
def driver_selenium(selenium_driver_options, test_config):
    """Selenium WebDriver 생성"""
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service as ChromeService
    from selenium.webdriver.firefox.service import Service as FirefoxService
    from selenium.webdriver.edge.service import Service as EdgeService
    
    # webdriver-manager가 없으면 경고하고 기본 경로 사용 시도
    try:
        from webdriver_manager.chrome import ChromeDriverManager
        from webdriver_manager.firefox import GeckoDriverManager
        from webdriver_manager.microsoft import EdgeChromiumDriverManager
        use_webdriver_manager = True
    except ImportError:
        use_webdriver_manager = False
        import warnings
        warnings.warn("webdriver-manager가 설치되지 않았습니다. WebDriver 경로를 수동으로 설정해야 할 수 있습니다.")
    
    options, browser_name = selenium_driver_options
    
    try:
        if browser_name == "Chrome":
            if use_webdriver_manager:
                service = ChromeService(ChromeDriverManager().install())
            else:
                service = ChromeService()
            driver = webdriver.Chrome(service=service, options=options)
        elif browser_name == "Firefox":
            if use_webdriver_manager:
                service = FirefoxService(GeckoDriverManager().install())
            else:
                service = FirefoxService()
            driver = webdriver.Firefox(service=service, options=options)
        elif browser_name == "Edge":
            if use_webdriver_manager:
                service = EdgeService(EdgeChromiumDriverManager().install())
            else:
                service = EdgeService()
            driver = webdriver.Edge(service=service, options=options)
        else:
            # 기본값: Chrome
            if use_webdriver_manager:
                service = ChromeService(ChromeDriverManager().install())
            else:
                service = ChromeService()
            driver = webdriver.Chrome(service=service, options=options)
        
        yield driver
        driver.quit()
    except Exception as e:
        pytest.skip(f"Selenium WebDriver 생성 실패: {str(e)}")


# ============================================================================
# 통합 Fixtures (자동으로 driver 선택)
# ============================================================================

@pytest.fixture(scope="function")
def page(test_config, page_playwright, driver_selenium):
    """자동으로 선택된 드라이버의 페이지/드라이버 반환"""
    if test_config["driver"] == "playwright":
        return page_playwright
    else:
        return driver_selenium


@pytest.fixture(scope="function")
def driver(test_config, page_playwright, driver_selenium):
    """자동으로 선택된 드라이버 반환 (page와 동일하지만 명확성을 위해 별도 제공)"""
    if test_config["driver"] == "playwright":
        return page_playwright
    else:
        return driver_selenium


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """테스트 결과를 리포트에 저장 (스크린샷 캡처를 위해)"""
    outcome = yield
    rep = outcome.get_result()
    setattr(item, f"rep_{rep.when}", rep)


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
    config.addinivalue_line(
        "markers", "playwright: Playwright를 사용하는 테스트"
    )
    config.addinivalue_line(
        "markers", "selenium: Selenium을 사용하는 테스트"
    )
    config.addinivalue_line(
        "markers", "smoke: 스모크 테스트"
    )
    config.addinivalue_line(
        "markers", "regression: 회귀 테스트"
    )

