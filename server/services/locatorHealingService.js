/**
 * 로케이터 힐링 서비스
 * 실패한 locator를 저장된 DOM 스냅샷과 현재 DOM을 비교하여 새로운 locator 생성
 */

const snapshotScheduler = require('./domSnapshotScheduler');
const db = require('../database/db');

/**
 * 실패한 locator로 저장된 DOM 스냅샷에서 요소 찾기
 * @param {string} snapshotData - 저장된 DOM HTML 또는 메타데이터 JSON
 * @param {string} failedLocator - 실패한 locator
 * @param {string} locatorType - locator 타입 ('playwright', 'selenium', 'css', 'xpath', 'text')
 * @param {boolean} isMetadata - 메타데이터 형식인지 여부 (기본값: false)
 * @returns {Promise<Object|null>} 찾은 요소 정보 또는 null
 */
async function findElementInSnapshot(snapshotData, failedLocator, locatorType, isMetadata = false) {
  // Node.js 환경에서는 실제 DOM API를 사용할 수 없으므로
  // 간단한 텍스트 기반 매칭 또는 정규식으로 요소 추출
  // 실제 구현 시 Playwright를 사용하여 DOM을 파싱하는 것이 좋음
  
  if (!snapshotData || !failedLocator) {
    return null;
  }
  
  // 메타데이터 형식인 경우
  if (isMetadata) {
    try {
      const metadata = typeof snapshotData === 'string' ? JSON.parse(snapshotData) : snapshotData;
      if (!metadata.elements || !Array.isArray(metadata.elements)) {
        return null;
      }
      
      // 텍스트 기반 locator인 경우
      if (locatorType === 'text' || failedLocator.startsWith('text=')) {
        const textValue = failedLocator.replace(/^text=/, '').replace(/['"]/g, '').toLowerCase();
        for (const elem of metadata.elements) {
          if (elem.text && elem.text.toLowerCase().includes(textValue)) {
            return {
              type: 'text',
              text: elem.text,
              matchedText: elem.text,
              element: elem
            };
          }
        }
      }
      
      // 속성 기반 locator인 경우
      if (locatorType === 'css' || locatorType === 'playwright' || locatorType === 'selenium') {
        // ID 기반
        if (failedLocator.startsWith('#')) {
          const id = failedLocator.slice(1);
          const elem = metadata.elements.find(e => e.id === id);
          if (elem) {
            return {
              type: 'attribute',
              attribute: 'id',
              value: id,
              element: elem
            };
          }
        }
        
        // Class 기반
        if (failedLocator.startsWith('.')) {
          const className = failedLocator.slice(1);
          const elem = metadata.elements.find(e => 
            e.classes && e.classes.includes(className)
          );
          if (elem) {
            return {
              type: 'attribute',
              attribute: 'class',
              value: className,
              element: elem
            };
          }
        }
        
        // data-* 속성 기반
        const dataAttrMatch = failedLocator.match(/\[data-(\w+)=['"]([^'"]+)['"]\]/);
        if (dataAttrMatch) {
          const attrName = `data-${dataAttrMatch[1]}`;
          const attrValue = dataAttrMatch[2];
          const elem = metadata.elements.find(e => 
            e.dataAttrs && e.dataAttrs[attrName] === attrValue
          );
          if (elem) {
            return {
              type: 'attribute',
              attribute: attrName,
              value: attrValue,
              element: elem
            };
          }
        }
        
        // aria-label 기반
        const ariaMatch = failedLocator.match(/\[aria-label=['"]([^'"]+)['"]\]/);
        if (ariaMatch) {
          const ariaValue = ariaMatch[1];
          const elem = metadata.elements.find(e => 
            e.attrs && e.attrs['aria-label'] === ariaValue
          );
          if (elem) {
            return {
              type: 'attribute',
              attribute: 'aria-label',
              value: ariaValue,
              element: elem
            };
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('[Healing Service] 메타데이터 파싱 실패:', error);
      return null;
    }
  }
  
  // HTML 형식인 경우 (기존 로직)
  // 텍스트 기반 locator인 경우
  if (locatorType === 'text' || failedLocator.startsWith('text=')) {
    const textValue = failedLocator.replace(/^text=/, '').replace(/['"]/g, '');
    const textRegex = new RegExp(`>([^<]*${escapeRegExp(textValue)}[^<]*)<`, 'i');
    const match = snapshotData.match(textRegex);
    if (match) {
      return {
        type: 'text',
        text: textValue,
        matchedText: match[1].trim()
      };
    }
  }
  
  // CSS/XPath locator인 경우 - HTML에서 속성으로 찾기
  if (locatorType === 'css' || locatorType === 'playwright' || locatorType === 'selenium') {
    // ID 기반
    if (failedLocator.startsWith('#')) {
      const id = failedLocator.slice(1);
      const idRegex = new RegExp(`<[^>]+id=['"]${escapeRegExp(id)}['"][^>]*>`, 'i');
      const match = snapshotData.match(idRegex);
      if (match) {
        return {
          type: 'attribute',
          attribute: 'id',
          value: id,
          element: match[0]
        };
      }
    }
    
    // Class 기반
    if (failedLocator.startsWith('.')) {
      const className = failedLocator.slice(1);
      const classRegex = new RegExp(`<[^>]+class=['"][^'"]*\\b${escapeRegExp(className)}\\b[^'"]*['"][^>]*>`, 'i');
      const match = snapshotData.match(classRegex);
      if (match) {
        return {
          type: 'attribute',
          attribute: 'class',
          value: className,
          element: match[0]
        };
      }
    }
    
    // data-* 속성 기반
    const dataAttrMatch = failedLocator.match(/\[data-(\w+)=['"]([^'"]+)['"]\]/);
    if (dataAttrMatch) {
      const attrName = `data-${dataAttrMatch[1]}`;
      const attrValue = dataAttrMatch[2];
      const attrRegex = new RegExp(`<[^>]+${escapeRegExp(attrName)}=['"]${escapeRegExp(attrValue)}['"][^>]*>`, 'i');
      const match = snapshotData.match(attrRegex);
      if (match) {
        return {
          type: 'attribute',
          attribute: attrName,
          value: attrValue,
          element: match[0]
        };
      }
    }
    
    // aria-label 기반
    const ariaMatch = failedLocator.match(/\[aria-label=['"]([^'"]+)['"]\]/);
    if (ariaMatch) {
      const ariaValue = ariaMatch[1];
      const ariaRegex = new RegExp(`<[^>]+aria-label=['"]${escapeRegExp(ariaValue)}['"][^>]*>`, 'i');
      const match = snapshotData.match(ariaRegex);
      if (match) {
        return {
          type: 'attribute',
          attribute: 'aria-label',
          value: ariaValue,
          element: match[0]
        };
      }
    }
  }
  
  return null;
}

/**
 * 정규식 이스케이프
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 텍스트 기반 매칭으로 새 locator 생성
 * @param {string} text - 요소의 텍스트
 * @param {string} locatorType - 원하는 locator 타입 ('playwright', 'selenium')
 * @returns {string} 새 locator
 */
function generateTextLocator(text, locatorType = 'playwright') {
  if (!text) return null;
  
  const escapedText = text.replace(/"/g, '\\"');
  
  if (locatorType === 'playwright') {
    return `page.locator('text="${escapedText}"')`;
  } else if (locatorType === 'selenium') {
    return `driver.find_element(By.XPATH, f'//*[text()="{escapedText}"]')`;
  }
  
  return null;
}

/**
 * 속성 기반 매칭으로 새 locator 생성
 * @param {string} attribute - 속성 이름
 * @param {string} value - 속성 값
 * @param {string} locatorType - 원하는 locator 타입
 * @returns {string} 새 locator
 */
function generateAttributeLocator(attribute, value, locatorType = 'playwright') {
  if (!attribute || !value) return null;
  
  const escapedValue = value.replace(/"/g, '\\"');
  
  if (locatorType === 'playwright') {
    if (attribute === 'id') {
      return `page.locator('#${escapedValue}')`;
    } else if (attribute === 'class') {
      return `page.locator('.${escapedValue}')`;
    } else {
      return `page.locator('[${attribute}="${escapedValue}"]')`;
    }
  } else if (locatorType === 'selenium') {
    if (attribute === 'id') {
      return `driver.find_element(By.ID, "${escapedValue}")`;
    } else if (attribute === 'class') {
      return `driver.find_element(By.CLASS_NAME, "${escapedValue}")`;
    } else if (attribute.startsWith('data-')) {
      return `driver.find_element(By.XPATH, '//*[@${attribute}="${escapedValue}"]')`;
    } else {
      return `driver.find_element(By.XPATH, '//*[@${attribute}="${escapedValue}"]')`;
    }
  }
  
  return null;
}

/**
 * 예전 DOM에서 추출한 특징으로 현재 DOM에서 요소 찾기
 * @param {string} currentDom - 현재 DOM HTML
 * @param {Object} elementCharacteristics - 예전 DOM에서 추출한 요소 특징
 * @returns {Object|null} 찾은 요소 정보 (HTML 문자열)
 */
function findElementInCurrentDom(currentDom, elementCharacteristics) {
  if (!currentDom || !elementCharacteristics) {
    return null;
  }
  
  const foundElements = [];
  
  // 1. 텍스트 기반 검색
  if (elementCharacteristics.text || elementCharacteristics.matchedText) {
    const text = elementCharacteristics.text || elementCharacteristics.matchedText;
    // 텍스트를 포함하는 요소 찾기
    const textRegex = new RegExp(`<([^>]+)>([^<]*${escapeRegExp(text)}[^<]*)</[^>]+>`, 'i');
    const matches = [...currentDom.matchAll(new RegExp(textRegex.source, 'gi'))];
    
    for (const match of matches) {
      if (match && match[1] && match[2]) {
        const tagMatch = match[1].match(/^(\w+)/);
        if (tagMatch) {
          const tagName = tagMatch[1];
          // 요소의 시작 태그 찾기
          const tagStartRegex = new RegExp(`<${tagName}[^>]*>`, 'i');
          const tagStartMatch = currentDom.match(tagStartRegex);
          if (tagStartMatch) {
            foundElements.push({
              type: 'text',
              text: text,
              elementHtml: tagStartMatch[0],
              matchedText: match[2].trim()
            });
            break; // 첫 번째 매칭만 사용
          }
        }
      }
    }
  }
  
  // 2. 속성 기반 검색
  if (elementCharacteristics.attribute && elementCharacteristics.value) {
    const attrName = elementCharacteristics.attribute;
    const attrValue = elementCharacteristics.value;
    
    let attrRegex;
    if (attrName === 'id') {
      attrRegex = new RegExp(`<([^>]+)id=['"]${escapeRegExp(attrValue)}['"][^>]*>`, 'i');
    } else if (attrName === 'class') {
      attrRegex = new RegExp(`<([^>]+)class=['"][^'"]*\\b${escapeRegExp(attrValue)}\\b[^'"]*['"][^>]*>`, 'i');
    } else {
      attrRegex = new RegExp(`<([^>]+)${escapeRegExp(attrName)}=['"]${escapeRegExp(attrValue)}['"][^>]*>`, 'i');
    }
    
    const match = currentDom.match(attrRegex);
    if (match) {
      foundElements.push({
        type: 'attribute',
        attribute: attrName,
        value: attrValue,
        elementHtml: match[0]
      });
    }
  }
  
  // 3. 요소 HTML 또는 메타데이터에서 추가 속성 추출 (data-testid, name 등)
  if (elementCharacteristics.element) {
    const oldElement = elementCharacteristics.element;
    
    // 메타데이터 객체인 경우
    if (typeof oldElement === 'object' && !Array.isArray(oldElement)) {
      // data-testid 검색
      if (oldElement.dataAttrs && oldElement.dataAttrs['data-testid']) {
        const testIdValue = oldElement.dataAttrs['data-testid'];
        const attrRegex = new RegExp(`<([^>]+)data-testid=['"]${escapeRegExp(testIdValue)}['"][^>]*>`, 'i');
        const match = currentDom.match(attrRegex);
        if (match) {
          foundElements.push({
            type: 'attribute',
            attribute: 'data-testid',
            value: testIdValue,
            elementHtml: match[0]
          });
        }
      }
      
      // name 속성 검색
      if (oldElement.attrs && oldElement.attrs['name']) {
        const nameValue = oldElement.attrs['name'];
        const attrRegex = new RegExp(`<([^>]+)name=['"]${escapeRegExp(nameValue)}['"][^>]*>`, 'i');
        const match = currentDom.match(attrRegex);
        if (match) {
          foundElements.push({
            type: 'attribute',
            attribute: 'name',
            value: nameValue,
            elementHtml: match[0]
          });
        }
      }
    } else if (typeof oldElement === 'string') {
      // HTML 문자열인 경우
      const oldElementHtml = oldElement;
      
      // HTML에서 data-testid, name 추출하여 검색
      const testIdMatch = oldElementHtml.match(/data-testid=['"]([^'"]+)['"]/i);
      if (testIdMatch) {
        const attrRegex = new RegExp(`<([^>]+)data-testid=['"]${escapeRegExp(testIdMatch[1])}['"][^>]*>`, 'i');
        const match = currentDom.match(attrRegex);
        if (match) {
          foundElements.push({
            type: 'attribute',
            attribute: 'data-testid',
            value: testIdMatch[1],
            elementHtml: match[0]
          });
        }
      }
      
      const nameMatch = oldElementHtml.match(/name=['"]([^'"]+)['"]/i);
      if (nameMatch) {
        const attrRegex = new RegExp(`<([^>]+)name=['"]${escapeRegExp(nameMatch[1])}['"][^>]*>`, 'i');
        const match = currentDom.match(attrRegex);
        if (match) {
          foundElements.push({
            type: 'attribute',
            attribute: 'name',
            value: nameMatch[1],
            elementHtml: match[0]
          });
        }
      }
    }
  }
  
  // 가장 유일한 요소 반환 (우선순위: ID > data-testid > name > aria-label > text > class)
  if (foundElements.length > 0) {
    const priority = { 'id': 6, 'data-testid': 5, 'name': 4, 'aria-label': 3, 'text': 2, 'class': 1 };
    foundElements.sort((a, b) => {
      const aPriority = priority[a.attribute] || 0;
      const bPriority = priority[b.attribute] || 0;
      return bPriority - aPriority;
    });
    
    return foundElements[0];
  }
  
  return null;
}

/**
 * 현재 DOM에서 찾은 요소에 대한 최적의 locator 생성
 * @param {Object} elementInCurrentDom - 현재 DOM에서 찾은 요소
 * @param {string} currentDom - 현재 DOM HTML
 * @param {string} locatorType - locator 타입
 * @returns {Array} locator 후보 배열 (confidence 포함)
 */
function generateOptimalLocators(elementInCurrentDom, currentDom, locatorType) {
  if (!elementInCurrentDom) {
    return [];
  }
  
  const candidates = [];
  const elementHtml = elementInCurrentDom.elementHtml || '';
  
  // 1. ID 기반 (가장 높은 우선순위)
  const idMatch = elementHtml.match(/id=['"]([^'"]+)['"]/i);
  if (idMatch) {
    const idLocator = generateAttributeLocator('id', idMatch[1], locatorType);
    if (idLocator) {
      // 유일성 검증
      const idRegex = new RegExp(`id=['"]${escapeRegExp(idMatch[1])}['"]`, 'gi');
      const idCount = (currentDom.match(idRegex) || []).length;
      candidates.push({
        method: 'id',
        locator: idLocator,
        confidence: idCount === 1 ? 95 : 85,
        reason: `id="${idMatch[1]}" 기반 매칭${idCount === 1 ? ' (유일)' : ` (${idCount}개 발견)`}`
      });
    }
  }
  
  // 2. data-testid 기반
  const testIdMatch = elementHtml.match(/data-testid=['"]([^'"]+)['"]/i) || 
                      (elementInCurrentDom.attribute === 'data-testid' ? { 1: elementInCurrentDom.value } : null);
  if (testIdMatch) {
    const testIdValue = testIdMatch[1];
    const testIdLocator = generateAttributeLocator('data-testid', testIdValue, locatorType);
    if (testIdLocator) {
      const testIdRegex = new RegExp(`data-testid=['"]${escapeRegExp(testIdValue)}['"]`, 'gi');
      const testIdCount = (currentDom.match(testIdRegex) || []).length;
      candidates.push({
        method: 'data-testid',
        locator: testIdLocator,
        confidence: testIdCount === 1 ? 90 : 80,
        reason: `data-testid="${testIdValue}" 기반 매칭${testIdCount === 1 ? ' (유일)' : ` (${testIdCount}개 발견)`}`
      });
    }
  }
  
  // 3. name 속성 기반
  const nameMatch = elementHtml.match(/name=['"]([^'"]+)['"]/i) ||
                    (elementInCurrentDom.attribute === 'name' ? { 1: elementInCurrentDom.value } : null);
  if (nameMatch) {
    const nameValue = nameMatch[1];
    const nameLocator = generateAttributeLocator('name', nameValue, locatorType);
    if (nameLocator) {
      const nameRegex = new RegExp(`name=['"]${escapeRegExp(nameValue)}['"]`, 'gi');
      const nameCount = (currentDom.match(nameRegex) || []).length;
      candidates.push({
        method: 'name',
        locator: nameLocator,
        confidence: nameCount === 1 ? 85 : 75,
        reason: `name="${nameValue}" 기반 매칭${nameCount === 1 ? ' (유일)' : ` (${nameCount}개 발견)`}`
      });
    }
  }
  
  // 4. aria-label 기반
  const ariaMatch = elementHtml.match(/aria-label=['"]([^'"]+)['"]/i) ||
                    (elementInCurrentDom.attribute === 'aria-label' ? { 1: elementInCurrentDom.value } : null);
  if (ariaMatch) {
    const ariaValue = ariaMatch[1];
    const ariaLocator = generateAttributeLocator('aria-label', ariaValue, locatorType);
    if (ariaLocator) {
      const ariaRegex = new RegExp(`aria-label=['"]${escapeRegExp(ariaValue)}['"]`, 'gi');
      const ariaCount = (currentDom.match(ariaRegex) || []).length;
      candidates.push({
        method: 'aria-label',
        locator: ariaLocator,
        confidence: ariaCount === 1 ? 82 : 72,
        reason: `aria-label="${ariaValue}" 기반 매칭${ariaCount === 1 ? ' (유일)' : ` (${ariaCount}개 발견)`}`
      });
    }
  }
  
  // 5. 텍스트 기반 (유일성 검증 중요)
  if (elementInCurrentDom.text || elementInCurrentDom.matchedText) {
    const text = elementInCurrentDom.text || elementInCurrentDom.matchedText;
    const textLocator = generateTextLocator(text, locatorType);
    if (textLocator) {
      // 텍스트가 유일한지 확인
      const textRegex = new RegExp(`>([^<]*${escapeRegExp(text)}[^<]*)<`, 'gi');
      const textMatches = currentDom.match(textRegex) || [];
      const textCount = textMatches.length;
      
      candidates.push({
        method: 'text',
        locator: textLocator,
        confidence: textCount === 1 ? 85 : textCount <= 3 ? 75 : 65,
        reason: `텍스트 "${text}" 기반 매칭${textCount === 1 ? ' (유일)' : ` (${textCount}개 발견)`}`
      });
    }
  }
  
  // 6. class 기반 (복수 매칭 가능성이 높으므로 낮은 우선순위)
  const classMatch = elementHtml.match(/class=['"]([^'"]+)['"]/i) ||
                     (elementInCurrentDom.attribute === 'class' ? { 1: elementInCurrentDom.value } : null);
  if (classMatch) {
    const classValue = classMatch[1].split(/\s+/)[0]; // 첫 번째 클래스만
    const classLocator = generateAttributeLocator('class', classValue, locatorType);
    if (classLocator) {
      const classRegex = new RegExp(`class=['"][^'"]*\\b${escapeRegExp(classValue)}\\b[^'"]*['"]`, 'gi');
      const classCount = (currentDom.match(classRegex) || []).length;
      candidates.push({
        method: 'class',
        locator: classLocator,
        confidence: classCount === 1 ? 70 : 60,
        reason: `class="${classValue}" 기반 매칭${classCount === 1 ? ' (유일)' : ` (${classCount}개 발견)`}`
      });
    }
  }
  
  return candidates;
}

/**
 * 하이브리드 힐링 전략 (텍스트 → 속성 → 구조 순서)
 * @param {Object} options - 힐링 옵션
 * @param {string} options.failedLocator - 실패한 locator
 * @param {string} options.locatorType - locator 타입
 * @param {string} options.pageUrl - 현재 페이지 URL
 * @param {string} options.snapshotId - 사용할 스냅샷 ID
 * @param {string} options.currentDom - 현재 DOM HTML (필수: 현재 DOM에서 요소를 찾기 위해 필요)
 * @returns {Promise<Object>} 힐링 결과
 */
async function healLocator(options) {
  const { failedLocator, locatorType, pageUrl, snapshotId, currentDom } = options;
  
  if (!failedLocator || !pageUrl) {
    return {
      success: false,
      error: 'failedLocator와 pageUrl은 필수입니다.'
    };
  }
  
  // URL 정규화 및 패턴 분석
  const normalizedUrl = snapshotScheduler.normalizeURL(pageUrl);
  const urlPattern = snapshotScheduler.analyzeURLPattern(pageUrl);
  
  // 스냅샷 조회 (여러 스냅샷 활용)
  let snapshots = [];
  if (snapshotId) {
    // 특정 스냅샷 ID가 지정된 경우
    const snapshot = await db.get('SELECT * FROM dom_snapshots WHERE id = ?', [snapshotId]);
    if (snapshot) {
      // 압축 해제
      if (snapshot.snapshot_data) {
        try {
          const zlib = require('zlib');
          const decompress = (data) => new Promise((resolve, reject) => {
            const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64');
            zlib.gunzip(buffer, (err, decompressed) => {
              if (err) reject(err);
              else resolve(decompressed.toString('utf8'));
            });
          });
          snapshot.decompressed_data = await decompress(snapshot.snapshot_data);
        } catch (e) {
          snapshot.decompressed_data = snapshot.snapshot_data;
        }
      }
      snapshots = [snapshot];
    }
  } else {
    // 최근 여러 스냅샷 조회 (최대 5개)
    snapshots = await snapshotScheduler.getRecentSnapshots(normalizedUrl, 5, true);
    
    // 동적 페이지인 경우 패턴 매칭으로 추가 스냅샷 검색
    if (urlPattern.isDynamic && snapshots.length === 0) {
      // 패턴 URL과 일치하는 다른 스냅샷 검색
      try {
        const allSnapshots = await db.all(`
          SELECT * FROM dom_snapshots
          WHERE expires_at > NOW()
          ORDER BY captured_at DESC
          LIMIT 20
        `);
        
        for (const snap of allSnapshots) {
          if (snapshotScheduler.matchURLPattern(pageUrl, snap.normalized_url)) {
            // 압축 해제
            if (snap.snapshot_data) {
              try {
                const zlib = require('zlib');
                const decompress = (data) => new Promise((resolve, reject) => {
                  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64');
                  zlib.gunzip(buffer, (err, decompressed) => {
                    if (err) reject(err);
                    else resolve(decompressed.toString('utf8'));
                  });
                });
                snap.decompressed_data = await decompress(snap.snapshot_data);
                snapshots.push(snap);
                if (snapshots.length >= 5) break;
              } catch (e) {
                snap.decompressed_data = snap.snapshot_data;
                snapshots.push(snap);
                if (snapshots.length >= 5) break;
              }
            }
          }
        }
      } catch (error) {
        console.error('[Healing Service] 패턴 매칭 스냅샷 검색 실패:', error);
      }
    }
  }
  
  // 스냅샷이 없고 currentDom도 없는 경우
  if (snapshots.length === 0 && !currentDom) {
    return {
      success: false,
      error: '해당 URL의 스냅샷을 찾을 수 없고, 현재 DOM 정보도 제공되지 않았습니다. 힐링을 수행할 수 없습니다.',
      error_code: 'NO_SNAPSHOT_OR_CURRENT_DOM',
      suggestions: [
        '해당 페이지에서 녹화를 수행하여 DOM 스냅샷을 먼저 저장하세요.',
        '테스트 실패 시 현재 DOM 정보를 전달하도록 설정하세요 (Playwright: page.content(), Selenium: driver.page_source).'
      ]
    };
  }

  // 예전 DOM 스냅샷에서 요소 찾기 및 특징 추출
  let elementCharacteristics = null;
  let elementMatches = [];

  if (snapshots.length > 0) {
    // 여러 스냅샷에서 요소 찾기 및 공통 패턴 추출
    for (const snapshot of snapshots) {
      const snapshotData = snapshot.decompressed_data || snapshot.snapshot_data || '';
      // 메타데이터 형식인지 확인
      const isMetadata = snapshot.metadata && 
        (typeof snapshot.metadata === 'string' 
          ? JSON.parse(snapshot.metadata)?.dataType === 'metadata'
          : snapshot.metadata.dataType === 'metadata');
      
      const elementInSnapshot = await findElementInSnapshot(
        snapshotData, 
        failedLocator, 
        locatorType, 
        isMetadata
      );
      
      if (elementInSnapshot) {
        elementMatches.push({
          snapshot,
          element: elementInSnapshot,
          snapshotId: snapshot.id
        });
      }
    }
    
    if (elementMatches.length > 0) {
      // 가장 최근 스냅샷의 요소를 기준으로 사용
      const primaryMatch = elementMatches[0];
      elementCharacteristics = primaryMatch.element;
    }
  }

  // 예전 DOM에서 요소를 찾지 못한 경우, currentDom에서 직접 시도
  if (!elementCharacteristics && currentDom) {
    console.log('[Healing Service] 스냅샷에서 요소를 찾지 못해 현재 DOM에서 직접 검색 시도');
    const elementInCurrentDom = await findElementInSnapshot(currentDom, failedLocator, locatorType, false);
    if (elementInCurrentDom) {
      elementCharacteristics = elementInCurrentDom;
    }
  }

  if (!elementCharacteristics) {
    return {
      success: false,
      error: '예전 DOM 스냅샷과 현재 DOM 모두에서 실패한 locator로 요소를 찾을 수 없습니다.'
    };
  }

  // 현재 DOM에서 같은 특징을 가진 요소 찾기
  if (!currentDom) {
    // currentDom이 없으면 예전 DOM의 특징으로 locator 생성 (하위 호환성)
    console.warn('[Healing Service] currentDom이 제공되지 않아 예전 DOM 특징으로 locator 생성');
    
    const healingStrategies = [];
    
    // 텍스트 기반
    if (elementCharacteristics.text || elementCharacteristics.matchedText) {
      const text = elementCharacteristics.text || elementCharacteristics.matchedText;
      const textLocator = generateTextLocator(text, locatorType);
      if (textLocator) {
        healingStrategies.push({
          method: 'text',
          locator: textLocator,
          confidence: 70,
          reason: `텍스트 "${text}" 기반 매칭 (현재 DOM 검증 없음)`
        });
      }
    }
    
    // 속성 기반
    if (elementCharacteristics.attribute && elementCharacteristics.value) {
      const attrLocator = generateAttributeLocator(
        elementCharacteristics.attribute,
        elementCharacteristics.value,
        locatorType
      );
      if (attrLocator) {
        healingStrategies.push({
          method: 'attribute',
          locator: attrLocator,
          confidence: elementCharacteristics.attribute === 'id' ? 85 : 75,
          reason: `${elementCharacteristics.attribute}="${elementCharacteristics.value}" 기반 매칭 (현재 DOM 검증 없음)`
        });
      }
    }
    
    if (healingStrategies.length === 0) {
      return {
        success: false,
        error: '적용 가능한 힐링 전략을 찾을 수 없습니다.'
      };
    }
    
    healingStrategies.sort((a, b) => b.confidence - a.confidence);
    const bestStrategy = healingStrategies[0];
    
    return {
      success: true,
      healedLocator: bestStrategy.locator,
      healingMethod: bestStrategy.method,
      confidence: bestStrategy.confidence,
      reason: bestStrategy.reason,
      allStrategies: healingStrategies,
      snapshotId: snapshots.length > 0 ? snapshots[0].id : null,
      warning: '현재 DOM 검증 없이 생성된 locator입니다. 테스트 실행 시 currentDom을 제공하시면 더 정확한 locator를 생성할 수 있습니다.'
    };
  }

  // 현재 DOM에서 요소 찾기
  const elementInCurrentDom = findElementInCurrentDom(currentDom, elementCharacteristics);
  
  if (!elementInCurrentDom) {
    return {
      success: false,
      error: '예전 DOM에서 찾은 요소의 특징을 현재 DOM에서 찾을 수 없습니다. 페이지 구조가 변경되었을 수 있습니다.'
    };
  }

  // 현재 DOM에서 찾은 요소에 대한 최적의 locator 생성
  const healingStrategies = generateOptimalLocators(elementInCurrentDom, currentDom, locatorType);
  
  if (healingStrategies.length === 0) {
    return {
      success: false,
      error: '현재 DOM에서 찾은 요소에 대한 유효한 locator를 생성할 수 없습니다.'
    };
  }

  // 신뢰도가 가장 높은 locator 선택
  healingStrategies.sort((a, b) => b.confidence - a.confidence);
  const bestStrategy = healingStrategies[0];
  
  return {
    success: true,
    healedLocator: bestStrategy.locator,
    healingMethod: bestStrategy.method,
    confidence: Math.min(100, bestStrategy.confidence),
    reason: bestStrategy.reason,
    allStrategies: healingStrategies,
    snapshotId: snapshots.length > 0 ? snapshots[0].id : null,
    matchedSnapshotsCount: snapshots.length,
    urlPattern: urlPattern.isDynamic ? urlPattern.patternUrl : null,
    usedCurrentDom: true
  };
}

/**
 * 힐링 히스토리 저장
 * @param {Object} healingData - 힐링 데이터
 * @returns {Promise<Object>} 저장 결과
 */
async function saveHealingHistory(healingData) {
  const {
    test_script_id,
    test_case_id,
    failed_locator,
    healed_locator,
    healing_method,
    snapshot_id,
    page_url,
    success = true
  } = healingData;
  
  if (!test_script_id || !failed_locator || !healed_locator) {
    throw new Error('test_script_id, failed_locator, healed_locator는 필수입니다.');
  }
  
  try {
    const query = `
      INSERT INTO locator_healing_history (
        test_script_id,
        test_case_id,
        failed_locator,
        healed_locator,
        healing_method,
        snapshot_id,
        page_url,
        success
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      test_script_id,
      test_case_id || null,
      failed_locator,
      healed_locator,
      healing_method || null,
      snapshot_id || null,
      page_url || null,
      success
    ];
    
    const result = await db.run(query, params);
    const savedHistory = await db.get(
      'SELECT * FROM locator_healing_history WHERE id = ?',
      [result.lastID]
    );
    
    return {
      success: true,
      history: savedHistory
    };
  } catch (error) {
    console.error('[Healing Service] 힐링 히스토리 저장 실패:', error);
    throw error;
  }
}

/**
 * 힐링 히스토리 조회
 * @param {Object} filters - 필터 조건
 * @returns {Promise<Array>} 힐링 히스토리 목록
 */
async function getHealingHistory(filters = {}) {
  try {
    let query = 'SELECT * FROM locator_healing_history WHERE 1=1';
    const params = [];
    
    if (filters.test_script_id) {
      query += ' AND test_script_id = ?';
      params.push(filters.test_script_id);
    }
    
    if (filters.test_case_id) {
      query += ' AND test_case_id = ?';
      params.push(filters.test_case_id);
    }
    
    if (filters.success !== undefined) {
      query += ' AND success = ?';
      params.push(filters.success);
    }
    
    query += ' ORDER BY healed_at DESC';
    
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    return await db.all(query, params);
  } catch (error) {
    console.error('[Healing Service] 힐링 히스토리 조회 실패:', error);
    return [];
  }
}

module.exports = {
  healLocator,
  saveHealingHistory,
  getHealingHistory,
  findElementInSnapshot,
  generateTextLocator,
  generateAttributeLocator
};
