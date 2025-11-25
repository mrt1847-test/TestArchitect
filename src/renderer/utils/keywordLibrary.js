/**
 * 키워드 라이브러리
 * 테스트 키워드 정의 및 코드 생성 로직
 */

/**
 * 지원되는 키워드 타입
 */
export const KEYWORD_TYPES = {
  NAVIGATION: 'navigation',
  INTERACTION: 'interaction',
  VERIFICATION: 'verification',
  WAIT: 'wait',
  DATA: 'data'
};

/**
 * 키워드 정의
 */
export const KEYWORDS = {
  // 네비게이션
  open: {
    type: KEYWORD_TYPES.NAVIGATION,
    name: 'open',
    description: 'URL 열기',
    parameters: ['url'],
    codeGenerators: {
      playwright: (params) => `page.goto("${params.url}")`,
      selenium: (params) => `driver.get("${params.url}")`,
      pytest: (params) => `page.goto("${params.url}")`
    }
  },
  goto: {
    type: KEYWORD_TYPES.NAVIGATION,
    name: 'goto',
    description: 'URL로 이동',
    parameters: ['url'],
    codeGenerators: {
      playwright: (params) => `page.goto("${params.url}")`,
      selenium: (params) => `driver.get("${params.url}")`,
      pytest: (params) => `page.goto("${params.url}")`
    }
  },
  
  // 상호작용
  click: {
    type: KEYWORD_TYPES.INTERACTION,
    name: 'click',
    description: '요소 클릭',
    parameters: ['target'],
    codeGenerators: {
      playwright: (params) => `page.click("${params.target}")`,
      selenium: (params) => `driver.find_element(By.CSS_SELECTOR, "${params.target}").click()`,
      pytest: (params) => `page.click("${params.target}")`
    }
  },
  type: {
    type: KEYWORD_TYPES.INTERACTION,
    name: 'type',
    description: '텍스트 입력',
    parameters: ['target', 'value'],
    codeGenerators: {
      playwright: (params) => `page.fill("${params.target}", "${params.value || ''}")`,
      selenium: (params) => `driver.find_element(By.CSS_SELECTOR, "${params.target}").send_keys("${params.value || ''}")`,
      pytest: (params) => `page.fill("${params.target}", "${params.value || ''}")`
    }
  },
  setText: {
    type: KEYWORD_TYPES.INTERACTION,
    name: 'setText',
    description: '텍스트 설정',
    parameters: ['target', 'value'],
    codeGenerators: {
      playwright: (params) => `page.fill("${params.target}", "${params.value || ''}")`,
      selenium: (params) => `driver.find_element(By.CSS_SELECTOR, "${params.target}").send_keys("${params.value || ''}")`,
      pytest: (params) => `page.fill("${params.target}", "${params.value || ''}")`
    }
  },
  clear: {
    type: KEYWORD_TYPES.INTERACTION,
    name: 'clear',
    description: '입력 필드 지우기',
    parameters: ['target'],
    codeGenerators: {
      playwright: (params) => `page.fill("${params.target}", "")`,
      selenium: (params) => `driver.find_element(By.CSS_SELECTOR, "${params.target}").clear()`,
      pytest: (params) => `page.fill("${params.target}", "")`
    }
  },
  select: {
    type: KEYWORD_TYPES.INTERACTION,
    name: 'select',
    description: '드롭다운 선택',
    parameters: ['target', 'value'],
    codeGenerators: {
      playwright: (params) => `page.select_option("${params.target}", "${params.value || ''}")`,
      selenium: (params) => {
        const select = `driver.find_element(By.CSS_SELECTOR, "${params.target}")`;
        return `Select(${select}).select_by_visible_text("${params.value || ''}")`;
      },
      pytest: (params) => `page.select_option("${params.target}", "${params.value || ''}")`
    }
  },
  hover: {
    type: KEYWORD_TYPES.INTERACTION,
    name: 'hover',
    description: '요소에 마우스 오버',
    parameters: ['target'],
    codeGenerators: {
      playwright: (params) => `page.hover("${params.target}")`,
      selenium: (params) => {
        const element = `driver.find_element(By.CSS_SELECTOR, "${params.target}")`;
        return `ActionChains(driver).move_to_element(${element}).perform()`;
      },
      pytest: (params) => `page.hover("${params.target}")`
    }
  },
  doubleClick: {
    type: KEYWORD_TYPES.INTERACTION,
    name: 'doubleClick',
    description: '더블 클릭',
    parameters: ['target'],
    codeGenerators: {
      playwright: (params) => `page.dblclick("${params.target}")`,
      selenium: (params) => {
        const element = `driver.find_element(By.CSS_SELECTOR, "${params.target}")`;
        return `ActionChains(driver).double_click(${element}).perform()`;
      },
      pytest: (params) => `page.dblclick("${params.target}")`
    }
  },
  rightClick: {
    type: KEYWORD_TYPES.INTERACTION,
    name: 'rightClick',
    description: '우클릭',
    parameters: ['target'],
    codeGenerators: {
      playwright: (params) => `page.click("${params.target}", button="right")`,
      selenium: (params) => {
        const element = `driver.find_element(By.CSS_SELECTOR, "${params.target}")`;
        return `ActionChains(driver).context_click(${element}).perform()`;
      },
      pytest: (params) => `page.click("${params.target}", button="right")`
    }
  },
  
  // 검증
  verifyText: {
    type: KEYWORD_TYPES.VERIFICATION,
    name: 'verifyText',
    description: '텍스트 검증',
    parameters: ['target', 'value'],
    codeGenerators: {
      playwright: (params) => `expect(page.locator("${params.target}")).to_have_text("${params.value || ''}")`,
      selenium: (params) => `assert "${params.value || ''}" in driver.find_element(By.CSS_SELECTOR, "${params.target}").text`,
      pytest: (params) => `expect(page.locator("${params.target}")).to_have_text("${params.value || ''}")`
    }
  },
  verifyElementPresent: {
    type: KEYWORD_TYPES.VERIFICATION,
    name: 'verifyElementPresent',
    description: '요소 존재 확인',
    parameters: ['target'],
    codeGenerators: {
      playwright: (params) => `expect(page.locator("${params.target}")).to_be_visible()`,
      selenium: (params) => `assert driver.find_element(By.CSS_SELECTOR, "${params.target}").is_displayed()`,
      pytest: (params) => `expect(page.locator("${params.target}")).to_be_visible()`
    }
  },
  verifyElementNotPresent: {
    type: KEYWORD_TYPES.VERIFICATION,
    name: 'verifyElementNotPresent',
    description: '요소 미존재 확인',
    parameters: ['target'],
    codeGenerators: {
      playwright: (params) => `expect(page.locator("${params.target}")).not.to_be_visible()`,
      selenium: (params) => {
        return `try:\n    assert not driver.find_element(By.CSS_SELECTOR, "${params.target}").is_displayed()\nexcept NoSuchElementException:\n    pass`;
      },
      pytest: (params) => `expect(page.locator("${params.target}")).not.to_be_visible()`
    }
  },
  verifyTitle: {
    type: KEYWORD_TYPES.VERIFICATION,
    name: 'verifyTitle',
    description: '페이지 타이틀 검증',
    parameters: ['value'],
    codeGenerators: {
      playwright: (params) => `expect(page).to_have_title("${params.value || ''}")`,
      selenium: (params) => `assert "${params.value || ''}" in driver.title`,
      pytest: (params) => `expect(page).to_have_title("${params.value || ''}")`
    }
  },
  verifyUrl: {
    type: KEYWORD_TYPES.VERIFICATION,
    name: 'verifyUrl',
    description: 'URL 검증',
    parameters: ['value'],
    codeGenerators: {
      playwright: (params) => `expect(page).to_have_url("${params.value || ''}")`,
      selenium: (params) => `assert "${params.value || ''}" in driver.current_url`,
      pytest: (params) => `expect(page).to_have_url("${params.value || ''}")`
    }
  },
  
  // 대기
  waitForElement: {
    type: KEYWORD_TYPES.WAIT,
    name: 'waitForElement',
    description: '요소 대기',
    parameters: ['target', 'value'],
    codeGenerators: {
      playwright: (params) => `page.wait_for_selector("${params.target}", timeout=${params.value || 30000})`,
      selenium: (params) => {
        const wait = `WebDriverWait(driver, ${params.value || 10})`;
        return `${wait}.until(EC.presence_of_element_located((By.CSS_SELECTOR, "${params.target}")))`;
      },
      pytest: (params) => `page.wait_for_selector("${params.target}", timeout=${params.value || 30000})`
    }
  },
  wait: {
    type: KEYWORD_TYPES.WAIT,
    name: 'wait',
    description: '시간 대기',
    parameters: ['value'],
    codeGenerators: {
      playwright: (params) => `page.wait_for_timeout(${params.value || 1000})`,
      selenium: (params) => `time.sleep(${params.value || 1})`,
      pytest: (params) => `page.wait_for_timeout(${params.value || 1000})`
    }
  },
  sleep: {
    type: KEYWORD_TYPES.WAIT,
    name: 'sleep',
    description: '대기',
    parameters: ['value'],
    codeGenerators: {
      playwright: (params) => `page.wait_for_timeout(${params.value || 1000})`,
      selenium: (params) => `time.sleep(${params.value || 1})`,
      pytest: (params) => `page.wait_for_timeout(${params.value || 1000})`
    }
  }
};

/**
 * 키워드 목록 가져오기
 * @param {string} type - 키워드 타입 (선택사항)
 * @returns {Array} 키워드 배열
 */
export function getKeywords(type = null) {
  const keywords = Object.values(KEYWORDS);
  if (type) {
    return keywords.filter(k => k.type === type);
  }
  return keywords;
}

/**
 * 키워드 이름으로 키워드 가져오기
 * @param {string} name - 키워드 이름
 * @returns {Object|null} 키워드 객체
 */
export function getKeyword(name) {
  return KEYWORDS[name] || null;
}

/**
 * 키워드 코드 생성
 * @param {string} keywordName - 키워드 이름
 * @param {Object} params - 키워드 파라미터
 * @param {string} framework - 프레임워크 (playwright, selenium, pytest)
 * @returns {string} 생성된 코드
 */
export function generateKeywordCode(keywordName, params, framework = 'pytest') {
  const keyword = getKeyword(keywordName);
  if (!keyword) {
    return `# 알 수 없는 키워드: ${keywordName}`;
  }

  const generator = keyword.codeGenerators[framework];
  if (!generator) {
    return `# ${framework}에서 지원하지 않는 키워드: ${keywordName}`;
  }

  try {
    return generator(params);
  } catch (error) {
    console.error(`키워드 코드 생성 실패: ${keywordName}`, error);
    return `# 키워드 코드 생성 실패: ${keywordName}`;
  }
}

/**
 * 키워드 스텝 배열로부터 전체 코드 생성
 * @param {Array} steps - 키워드 스텝 배열
 * @param {Object} options - 옵션
 * @param {string} options.language - 언어 (python)
 * @param {string} options.framework - 프레임워크 (playwright, selenium, pytest)
 * @param {string} options.testName - 테스트 함수 이름
 * @param {string} options.testDescription - 테스트 설명
 * @returns {string} 생성된 전체 코드
 */
export function generateCodeFromSteps(steps, options = {}) {
  const {
    language = 'python',
    framework = 'pytest',
    testName = 'test_example',
    testDescription = 'Test'
  } = options;

  if (language !== 'python') {
    return `# ${language} 언어는 아직 지원하지 않습니다.`;
  }

  // 프레임워크별 import 문
  const imports = {
    playwright: `from playwright.sync_api import Page, expect
import pytest

`,
    selenium: `from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import Select
import pytest
import time

`,
    pytest: `from playwright.sync_api import Page, expect
import pytest

`
  };

  // 테스트 함수 시그니처
  const functionSignatures = {
    playwright: `@pytest.mark.playwright
def ${testName}(page_playwright: Page):
    """${testDescription}"""
`,
    selenium: `@pytest.mark.selenium
def ${testName}(driver_selenium):
    """${testDescription}"""
    driver = driver_selenium
`,
    pytest: `@pytest.mark.playwright
def ${testName}(page_playwright: Page):
    """${testDescription}"""
    page = page_playwright
`
  };

  // 프레임워크별 변수명
  const driverVar = framework === 'selenium' ? 'driver' : 'page';

  let code = imports[framework] || imports.pytest;
  code += functionSignatures[framework] || functionSignatures.pytest;

  // 각 스텝을 코드로 변환
  steps.forEach((step, index) => {
    const { action, target, value, description } = step;
    
    if (!action) {
      return;
    }

    // 키워드 코드 생성
    const keywordCode = generateKeywordCode(action, { target, value }, framework);
    
    // 설명이 있으면 주석 추가
    if (description) {
      code += `    # ${description}\n`;
    }
    
    code += `    ${keywordCode}\n`;
  });

  // Selenium의 경우 finally 블록 추가
  if (framework === 'selenium') {
    code = code.replace(
      `def ${testName}(driver_selenium):`,
      `def ${testName}(driver_selenium):
    try:`
    );
    code += `    finally:
        driver.quit()
`;
  }

  return code;
}

/**
 * 키워드 자동완성 목록 가져오기
 * @param {string} query - 검색어
 * @returns {Array} 매칭되는 키워드 배열
 */
export function getKeywordSuggestions(query = '') {
  if (!query) {
    return getKeywords();
  }

  const lowerQuery = query.toLowerCase();
  return getKeywords().filter(keyword => 
    keyword.name.toLowerCase().includes(lowerQuery) ||
    keyword.description.toLowerCase().includes(lowerQuery)
  );
}

