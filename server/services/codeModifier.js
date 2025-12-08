/**
 * 코드 수정 서비스
 * Python 코드에서 실패한 locator를 새 locator로 교체
 * AST 파싱 또는 정규식을 사용하여 코드 포맷 유지
 */

/**
 * Locator 표현식에서 실제 문자열 값 추출
 * @param {string} locatorExpression - locator 표현식 (예: "page.locator('button')")
 * @returns {string|null} 추출된 문자열 (예: "button")
 */
function extractLocatorString(locatorExpression) {
  if (!locatorExpression) return null;
  
  // 문자열 리터럴 추출
  const stringMatch = locatorExpression.match(/['"]([^'"]+)['"]/);
  if (stringMatch) {
    return stringMatch[1];
  }
  
  // ID 셀렉터
  if (locatorExpression.startsWith('#')) {
    return locatorExpression.slice(1);
  }
  
  // Class 셀렉터
  if (locatorExpression.startsWith('.')) {
    return locatorExpression.slice(1);
  }
  
  return locatorExpression;
}

/**
 * 정규식 이스케이프
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 정규식을 사용하여 locator 교체
 * @param {string} code - Python 코드
 * @param {string} oldLocator - 교체할 locator 문자열
 * @param {string} newLocator - 새로운 locator 문자열
 * @param {number} lineNumber - 실패한 라인 번호 (선택사항)
 * @returns {string} 수정된 코드
 */
function replaceLocatorWithRegex(code, oldLocator, newLocator, lineNumber = null) {
  if (!code || !oldLocator || !newLocator) {
    return code;
  }
  
  const lines = code.split('\n');
  
  // locator 패턴 추출 (문자열 부분만)
  const oldLocatorPattern = extractLocatorString(oldLocator);
  const newLocatorPattern = extractLocatorString(newLocator);
  
  if (!oldLocatorPattern || !newLocatorPattern) {
    return code;
  }
  
  const escapedOld = escapeRegExp(oldLocatorPattern);
  const escapedNew = newLocatorPattern;
  
  // Playwright 패턴들
  const playwrightPatterns = [
    // page.locator('old') -> page.locator('new')
    new RegExp(`(page\\.locator\\()(['"])([^'"]*)${escapedOld}([^'"]*)\\2(\\))`, 'g'),
    // .locator('old') -> .locator('new')
    new RegExp(`(\\.locator\\()(['"])([^'"]*)${escapedOld}([^'"]*)\\2(\\))`, 'g'),
  ];
  
  // Selenium 패턴들
  const seleniumPatterns = [
    // find_element(By.XXX, 'old') -> find_element(By.XXX, 'new')
    new RegExp(`(find_element\\([^,]+,\\s*)(['"])${escapedOld}\\2(\\))`, 'g'),
  ];
  
  let modifiedCode = code;
  
  // 라인 번호가 지정된 경우 해당 라인 주변만 처리
  if (lineNumber && lineNumber > 0 && lineNumber <= lines.length) {
    const start = Math.max(0, lineNumber - 10);
    const end = Math.min(lines.length, lineNumber + 10);
    const contextLines = lines.slice(start, end);
    const contextCode = contextLines.join('\n');
    
    let modifiedContext = contextCode;
    
    // Playwright 패턴 교체
    for (const pattern of playwrightPatterns) {
      if (pattern.test(contextCode)) {
        modifiedContext = modifiedContext.replace(pattern, (match, prefix, quote, before, after, suffix) => {
          return `${prefix}${quote}${before}${escapedNew}${after}${quote}${suffix}`;
        });
        break;
      }
    }
    
    // Selenium 패턴 교체
    for (const pattern of seleniumPatterns) {
      if (pattern.test(contextCode)) {
        modifiedContext = modifiedContext.replace(pattern, (match, prefix, quote, suffix) => {
          return `${prefix}${quote}${escapedNew}${quote}${suffix}`;
        });
        break;
      }
    }
    
    // 수정된 컨텍스트를 원본 코드에 다시 삽입
    const beforeContext = lines.slice(0, start).join('\n');
    const afterContext = lines.slice(end).join('\n');
    modifiedCode = [beforeContext, modifiedContext, afterContext].filter(Boolean).join('\n');
  } else {
    // 전체 코드에서 교체
    for (const pattern of playwrightPatterns) {
      if (pattern.test(modifiedCode)) {
        modifiedCode = modifiedCode.replace(pattern, (match, prefix, quote, before, after, suffix) => {
          return `${prefix}${quote}${before}${escapedNew}${after}${quote}${suffix}`;
        });
        break;
      }
    }
    
    for (const pattern of seleniumPatterns) {
      if (pattern.test(modifiedCode)) {
        modifiedCode = modifiedCode.replace(pattern, (match, prefix, quote, suffix) => {
          return `${prefix}${quote}${escapedNew}${quote}${suffix}`;
        });
        break;
      }
    }
  }
  
  return modifiedCode;
}

/**
 * Python 코드에서 locator 교체
 * @param {Object} options - 교체 옵션
 * @param {string} options.code - Python 코드
 * @param {string} options.oldLocator - 교체할 locator 표현식
 * @param {string} options.newLocator - 새로운 locator 표현식
 * @param {number} options.lineNumber - 실패한 라인 번호 (선택사항)
 * @returns {Promise<string>} 수정된 코드
 */
async function replaceLocatorInCode(options) {
  const { code, oldLocator, newLocator, lineNumber } = options;
  
  if (!code || !oldLocator || !newLocator) {
    throw new Error('code, oldLocator, newLocator는 필수입니다.');
  }
  
  // 현재는 정규식 방법만 사용 (AST 파싱은 추후 Python 스크립트로 구현 가능)
  return replaceLocatorWithRegex(code, oldLocator, newLocator, lineNumber);
}

module.exports = {
  replaceLocatorInCode,
  replaceLocatorWithRegex,
  extractLocatorString
};
