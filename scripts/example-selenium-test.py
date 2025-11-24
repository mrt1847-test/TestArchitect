"""
Selenium을 사용한 예제 테스트
"""

import pytest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager


@pytest.fixture(scope="function")
def driver():
    """Chrome WebDriver 생성"""
    options = webdriver.ChromeOptions()
    options.add_argument("--headless")  # 헤드리스 모드
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)
    
    yield driver
    driver.quit()


def test_google_search_selenium(driver):
    """Google 검색 테스트 (Selenium)"""
    # Google 접속
    driver.get("https://www.google.com")
    
    # 검색어 입력
    search_box = driver.find_element(By.NAME, "q")
    search_box.send_keys("Selenium Python")
    search_box.send_keys(Keys.RETURN)
    
    # 결과 페이지 로드 대기
    wait = WebDriverWait(driver, 10)
    results = wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "h3"))
    )
    
    # 검색 결과 확인
    assert results.is_displayed(), "검색 결과가 표시되지 않았습니다"


def test_github_navigation_selenium(driver):
    """GitHub 네비게이션 테스트 (Selenium)"""
    # GitHub 접속
    driver.get("https://github.com")
    
    # 타이틀 확인
    assert "GitHub" in driver.title
    
    # 로고 확인
    logo = driver.find_element(By.CSS_SELECTOR, "svg.octicon-mark-github")
    assert logo.is_displayed(), "GitHub 로고가 표시되지 않았습니다"


def test_element_interaction(driver):
    """요소 상호작용 테스트"""
    driver.get("https://www.google.com")
    
    # 검색 박스 찾기 및 클릭
    search_box = driver.find_element(By.NAME, "q")
    search_box.click()
    
    # 텍스트 입력
    search_box.send_keys("Test Automation")
    
    # 입력된 텍스트 확인
    assert search_box.get_attribute("value") == "Test Automation"

