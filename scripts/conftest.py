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
    # 중복 등록 방지: try-except로 ValueError 처리
    # pytest 7.x 이후 버전에서는 내부 API(_get_optional_actions)가 제거됨
    # 따라서 try-except 방식으로 중복 등록 에러를 처리 (모든 pytest 버전 호환)
    
    # --browser와 --headless 옵션은 pytest-playwright 플러그인이 제공하므로 여기서 등록하지 않음
    # pytest-playwright 플러그인이 이미 설치되어 있고 --browser, --headed/--headless 옵션을 제공함
    
    # --driver 옵션 등록
    try:
        parser.addoption(
            "--driver",
            action="store",
            default=os.getenv("TEST_DRIVER", "playwright"),
            choices=["playwright", "selenium"],
            help="사용할 웹드라이버 (playwright, selenium)"
        )
    except ValueError:
        # 이미 등록된 경우 무시 (중복 등록 방지)
        pass
    
    # --base-url 옵션은 pytest-base-url 플러그인이 제공하므로 여기서 등록하지 않음
    # pytest-base-url 플러그인이 이미 설치되어 있고 --base-url 옵션을 제공함
    
    # --mobile 옵션 등록
    try:
        parser.addoption(
            "--mobile",
            action="store",
            default=os.getenv("TEST_MOBILE", "false"),
            choices=["true", "false"],
            help="모바일 디바이스 에뮬레이션 여부 (true, false)"
        )
    except ValueError:
        # 이미 등록된 경우 무시 (중복 등록 방지)
        pass


@pytest.fixture(scope="session")
def test_config(pytestconfig):
    """테스트 설정 fixture"""
    # pytest-base-url 플러그인의 base_url 옵션 사용
    try:
        base_url = pytestconfig.getoption("base_url")
    except (ValueError, AttributeError):
        base_url = os.getenv("TEST_BASE_URL", "http://localhost:8000")
    
    # pytest-playwright 플러그인의 browser 옵션 사용
    try:
        browser = pytestconfig.getoption("--browser")
        # ✅ browser가 리스트인 경우 첫 번째 값 사용 (unhashable type 에러 방지)
        if isinstance(browser, list):
            browser = browser[0] if browser else "chromium"
    except (ValueError, AttributeError):
        browser = os.getenv("TEST_BROWSER", "chromium")
    
    # pytest-playwright 플러그인의 headed 옵션 사용 (headless의 반대)
    # --headed가 True면 headless=False, --headed가 False면 headless=True
    try:
        headed = pytestconfig.getoption("--headed", default=False)
        headless = not headed
    except (ValueError, AttributeError):
        # --headed 옵션이 없으면 환경 변수 확인
        headless_env = os.getenv("TEST_HEADLESS", "false")
        headless = headless_env.lower() == "true"
    
    return {
        "timeout": 30,
        "retry_count": 3,
        "base_url": base_url,
        "browser": browser,
        "headless": headless,
        "driver": pytestconfig.getoption("--driver"),
        "mobile": pytestconfig.getoption("--mobile") == "true"
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
    
    # headless 옵션: test_config에서 가져옴
    # conftest.py의 기본값이 "false"이고, pytestService.js에서 --headless=false를 전달하므로
    # test_config["headless"]는 False가 되어야 함
    # Playwright의 기본값은 headless=True이므로, 명시적으로 False로 설정해야 브라우저가 표시됨
    headless_mode = test_config.get("headless", False)
    
    launch_options = {
        "headless": headless_mode  # False면 브라우저 표시, True면 헤드리스 모드
    }
    
    # Chrome/Edge는 chromium을 사용하되 추가 옵션 설정
    if test_config["browser"] in ["chrome", "edge"]:
        launch_options["channel"] = test_config["browser"]
    
    browser = browser_type.launch(**launch_options)
    yield browser
    browser.close()


@pytest.fixture(scope="function")
def page_playwright(browser_playwright, request, test_config):
    """Playwright 페이지 생성 (스크린샷 자동 캡처 포함)"""
    from playwright.sync_api import Page
    import os
    
    # 모바일 모드 확인
    is_mobile = test_config.get("mobile", False)
    
    if is_mobile:
        # 모바일 디바이스 에뮬레이션 (iPhone 12 Pro)
        mobile_device = {
            'user_agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1',
            'viewport': {'width': 390, 'height': 844},
            'device_scale_factor': 3,
            'is_mobile': True,
            'has_touch': True
        }
        context = browser_playwright.new_context(**mobile_device)
    else:
        context = browser_playwright.new_context()
    
    page = context.new_page()
    
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
    context.close()


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
def page(test_config, request):
    """자동으로 선택된 드라이버의 페이지/드라이버 반환"""
    # test_config["driver"]에 따라 필요한 fixture만 동적으로 가져오기
    if test_config["driver"] == "playwright":
        return request.getfixturevalue("page_playwright")
    else:
        return request.getfixturevalue("driver_selenium")


@pytest.fixture(scope="function")
def driver(test_config, request):
    """자동으로 선택된 드라이버 반환 (page와 동일하지만 명확성을 위해 별도 제공)"""
    # test_config["driver"]에 따라 필요한 fixture만 동적으로 가져오기
    if test_config["driver"] == "playwright":
        return request.getfixturevalue("page_playwright")
    else:
        return request.getfixturevalue("driver_selenium")


# ============================================================================
# Visual Snapshot Testing
# ============================================================================

# snapshots 폴더 경로
SNAPSHOTS_DIR = project_root / "snapshots"
SNAPSHOTS_DIR.mkdir(exist_ok=True)


def pytest_configure(config):
    """pytest 설정 초기화 - snapshots 폴더 설정"""
    # snapshots 폴더 생성
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    
    # pytest-playwright-visual-snapshot 플러그인 설정
    # snapshots 경로를 pytest.ini나 환경 변수로 설정 가능
    if not config.getini("playwright_visual_snapshots_path"):
        config.option.playwright_visual_snapshots_path = str(SNAPSHOTS_DIR)
    
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

# pytest-playwright-visual-snapshot 패키지가 설치되어 있으면
# 자동으로 assert_snapshot fixture를 제공하므로 여기서 정의하지 않음


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """테스트 결과를 리포트에 저장 (스크린샷 캡처를 위해)"""
    outcome = yield
    rep = outcome.get_result()
    setattr(item, f"rep_{rep.when}", rep)

