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
 * URL에 프로토콜이 없으면 자동으로 추가
 * @param {string} url - URL 문자열
 * @returns {string} 프로토콜이 포함된 URL
 */
function normalizeUrl(url) {
  if (!url) return url;
  
  // 이미 프로토콜이 있으면 그대로 반환
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  
  // 프로토콜이 없으면 https:// 추가
  return `https://${url}`;
}

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
      playwright: (params) => `page.goto("${normalizeUrl(params.url)}")`,
      selenium: (params) => `driver.get("${normalizeUrl(params.url)}")`,
      pytest: (params) => `page.goto("${normalizeUrl(params.url)}")`
    }
  },
  goto: {
    type: KEYWORD_TYPES.NAVIGATION,
    name: 'goto',
    description: 'URL로 이동',
    parameters: ['url'],
    codeGenerators: {
      playwright: (params) => `page.goto("${normalizeUrl(params.url)}")`,
      selenium: (params) => `driver.get("${normalizeUrl(params.url)}")`,
      pytest: (params) => `page.goto("${normalizeUrl(params.url)}")`
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
 * 키워드 스텝 배열로부터 전체 코드 생성 (POM 지원)
 * @param {Array} steps - 키워드 스텝 배열
 * @param {Object} options - 옵션
 * @param {string} options.language - 언어 (python)
 * @param {string} options.framework - 프레임워크 (playwright, selenium, pytest)
 * @param {string} options.testName - 테스트 함수 이름
 * @param {string} options.testDescription - 테스트 설명
 * @param {Function} options.findPageObjectByUrl - URL로 Page Object 찾기 함수 (선택적)
 * @param {number} options.projectId - 프로젝트 ID (Page Object 조회용)
 * @returns {Promise<string>} 생성된 전체 코드
 */
export async function generateCodeFromSteps(steps, options = {}) {
  const {
    language = 'python',
    framework = 'pytest',
    testName = 'test_example',
    testDescription = 'Test',
    findPageObjectByUrl = null,
    projectId = null
  } = options;

  if (language !== 'python') {
    return `# ${language} 언어는 아직 지원하지 않습니다.`;
  }

  // 사용된 Page Object 수집
  const usedPageObjects = new Set();
  let currentPageObject = null;

  // 1단계: Steps 분석하여 사용된 Page Object 찾기
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    
    // goto/open 키워드로 URL 기반 Page Object 자동 인식
    if ((step.action === 'goto' || step.action === 'open') && findPageObjectByUrl && projectId) {
      const url = step.target || step.value;
      if (url) {
        try {
          const result = await findPageObjectByUrl(url, projectId);
          if (result.success && result.data) {
            currentPageObject = result.data;
            usedPageObjects.add(currentPageObject.name);
          } else {
            currentPageObject = null;
          }
        } catch (error) {
          console.warn('Page Object 찾기 실패:', error);
          currentPageObject = null;
        }
      }
    }
    
    // Page Object 타입 스텝
    if (step.type === 'page_object' && step.page_object) {
      usedPageObjects.add(step.page_object);
      currentPageObject = { name: step.page_object };
    }
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

  // Page Object import 문 추가
  let pageObjectImports = '';
  if (usedPageObjects.size > 0) {
    usedPageObjects.forEach(poName => {
      const moduleName = poName.toLowerCase();
      pageObjectImports += `from page_objects.${moduleName} import ${poName}\n`;
    });
    pageObjectImports += '\n';
  }

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
  code += pageObjectImports;
  code += functionSignatures[framework] || functionSignatures.pytest;

  // Page Object 인스턴스 변수 선언
  const pageObjectInstances = new Map();
  if (usedPageObjects.size > 0) {
    usedPageObjects.forEach(poName => {
      const varName = poName.toLowerCase().replace(/page$/, '') + '_page';
      pageObjectInstances.set(poName, varName);
    });
  }

  // 현재 페이지 컨텍스트 추적
  currentPageObject = null;

  // 각 스텝을 코드로 변환
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    
    // goto/open 키워드로 URL 기반 Page Object 자동 인식
    if ((step.action === 'goto' || step.action === 'open') && findPageObjectByUrl && projectId) {
      const url = step.target || step.value;
      if (url) {
        try {
          const result = await findPageObjectByUrl(url, projectId);
          if (result.success && result.data) {
            currentPageObject = result.data;
            const varName = pageObjectInstances.get(currentPageObject.name);
            if (varName) {
              // Page Object 인스턴스 생성 코드 추가
              code += `    ${varName} = ${currentPageObject.name}(${driverVar})\n`;
            }
          } else {
            currentPageObject = null;
          }
        } catch (error) {
          console.warn('Page Object 찾기 실패:', error);
          currentPageObject = null;
        }
      }
    }
    
    // 설명이 있으면 주석 추가
    if (step.description) {
      code += `    # ${step.description}\n`;
    }
    
    // Page Object 타입 스텝 처리
    if (step.type === 'page_object' && step.page_object && step.method) {
      const varName = pageObjectInstances.get(step.page_object);
      if (varName) {
        // Page Object 인스턴스가 없으면 생성
        if (!code.includes(`${varName} = ${step.page_object}(`)) {
          code += `    ${varName} = ${step.page_object}(${driverVar})\n`;
        }
        
        // 메서드 호출
        const params = step.params || {};
        const paramStr = Object.entries(params)
          .map(([k, v]) => {
            if (typeof v === 'string') {
              return `${k}="${v}"`;
            }
            return `${k}=${v}`;
          })
          .join(', ');
        
        code += `    ${varName}.${step.method}(${paramStr})\n`;
      } else {
        code += `    # Page Object 인스턴스 생성 필요: ${step.page_object}\n`;
      }
    } else if (step.action) {
      // 일반 키워드 코드 생성
      const keywordCode = generateKeywordCode(step.action, { target: step.target, value: step.value }, framework);
      code += `    ${keywordCode}\n`;
    }
  }

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

