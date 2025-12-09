/**
 * TestArchitect 녹화 UI 관리 모듈
 * 타임라인 렌더링, 코드 에디터, 로깅, UI 업데이트
 */

/**
 * 로그 메시지 출력
 * @param {string} message - 로그 메시지
 * @param {string} type - 로그 타입 ('info', 'success', 'error', 'warning')
 * @param {HTMLElement} logEntries - 로그 엔트리 컨테이너
 */
export function logMessage(message, type = 'info', logEntries) {
  if (!logEntries) return;

  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  
  logEntries.appendChild(entry);
  logEntries.scrollTop = logEntries.scrollHeight;
}

/**
 * 타임라인 셀렉터 값 정규화
 * @param {string} raw - 원본 셀렉터 값
 * @returns {string} 정규화된 셀렉터 값
 */
export function normalizeTimelineSelectorValue(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length === 0) return '';
  if (/셀렉터$/i.test(trimmed)) return '';
  return trimmed;
}

/**
 * 타임라인 셀렉터 해석
 * @param {Object} event - 이벤트 객체
 * @returns {string} 해석된 셀렉터
 */
export function resolveTimelineSelector(event) {
  if (!event) return '';
  const cleanedPrimary = normalizeTimelineSelectorValue(event.primarySelector);
  if (cleanedPrimary) return cleanedPrimary;
  if (Array.isArray(event.selectorCandidates)) {
    const candidate = event.selectorCandidates.find((c) => normalizeTimelineSelectorValue(c && c.selector));
    if (candidate && normalizeTimelineSelectorValue(candidate.selector)) {
      return normalizeTimelineSelectorValue(candidate.selector);
    }
  }
  const xpathValue = normalizeTimelineSelectorValue(event.primarySelectorXPath);
  if (xpathValue) return xpathValue;
  const textValue = normalizeTimelineSelectorValue(event.primarySelectorText);
  if (textValue) return textValue;
  const rawSelector = normalizeTimelineSelectorValue(event.selector);
  if (rawSelector) return rawSelector;
  if (event.tag && typeof event.tag === 'string') {
    return event.tag.toLowerCase();
  }
  return '';
}

/**
 * 셀렉터 타입 레이블 포맷팅
 * @param {string} type - 셀렉터 타입
 * @returns {string} 포맷팅된 레이블
 */
export function formatSelectorTypeLabel(type) {
  if (!type) return '선택된 셀렉터';
  const lowered = type.toLowerCase();
  switch (lowered) {
    case 'css':
      return 'CSS 셀렉터';
    case 'text':
      return '텍스트 셀렉터';
    case 'xpath':
      return 'XPath 셀렉터';
    case 'xpath-full':
      return '절대 XPath 셀렉터';
    case 'id':
      return 'ID 셀렉터';
    case 'class':
      return '클래스 셀렉터';
    case 'class-tag':
      return '태그+클래스 셀렉터';
    case 'tag':
      return '태그 셀렉터';
    case 'data-testid':
    case 'data-test':
    case 'data-qa':
    case 'data-cy':
    case 'data-id':
      return `${lowered.toUpperCase()} 셀렉터`;
    default:
      return `${lowered.toUpperCase()} 셀렉터`;
  }
}

/**
 * 액션 아이콘 가져오기
 * @param {string} action - 액션 타입
 * @returns {string} 아이콘 이모지
 */
export function getActionIcon(action) {
  const iconMap = {
    'click': '👆',
    'doubleClick': '👆👆',
    'rightClick': '🖱',
    'hover': '👋',
    'type': '⌨',
    'input': '⌨',
    'clear': '🗑',
    'select': '📋',
    'navigate': '🌐',
    'goto': '🌐',
    'open': '🌐',
    'wait': '⏱',
    'waitForElement': '⏳',
    'verifyText': '✓',
    'verifyTextContains': '✓',
    'verifyElementPresent': '✓',
    'verifyElementNotPresent': '✗',
    'verifyTitle': '📄',
    'verifyUrl': '🔗',
    'verifyImage': '🖼'
  };
  return iconMap[action] || '•';
}

/**
 * 액션 라벨 포맷팅
 * @param {string} action - 액션 타입
 * @returns {string} 포맷팅된 라벨
 */
export function formatActionLabel(action) {
  const labelMap = {
    'click': 'Click',
    'doubleClick': 'Double click',
    'rightClick': 'Right click',
    'hover': 'Hover',
    'type': 'Type',
    'input': 'Type',
    'clear': 'Clear',
    'select': 'Select',
    'navigate': 'Navigate',
    'goto': 'Navigate',
    'open': 'Navigate',
    'wait': 'Wait',
    'waitForElement': 'Wait for element',
    'verifyText': 'Verify text',
    'verifyTextContains': 'Verify text contains',
    'verifyElementPresent': 'Verify element present',
    'verifyElementNotPresent': 'Verify element not present',
    'verifyTitle': 'Verify title',
    'verifyUrl': 'Verify URL',
    'verifyImage': 'Verify image'
  };
  return labelMap[action] || action;
}

/**
 * 타겟 정보 포맷팅
 * @param {Object} ev - 이벤트 객체
 * @returns {string|null} 포맷팅된 타겟 정보
 */
export function formatTargetInfo(ev) {
  if (ev.target) {
    if (ev.target.id) return `#${ev.target.id}`;
    if (ev.target.className) return `.${ev.target.className.split(' ')[0]}`;
    if (ev.target.tagName) return ev.target.tagName.toLowerCase();
  }
  return null;
}

/**
 * 삭제 버튼 상태 업데이트
 * @param {HTMLElement} deleteEventBtn - 삭제 버튼 요소
 * @param {number} currentEventIndex - 현재 선택된 이벤트 인덱스
 * @param {Array} allEvents - 모든 이벤트 배열
 */
export function updateDeleteButtonState(deleteEventBtn, currentEventIndex, allEvents) {
  if (!deleteEventBtn) return;
  const hasSelection = currentEventIndex >= 0 && currentEventIndex < allEvents.length;
  deleteEventBtn.disabled = !hasSelection;
}

/**
 * try 문 체크박스 상태 업데이트
 * @param {Object} event - 이벤트 객체
 */
export function updateTryWrapCheckbox(event) {
  const checkbox = document.getElementById('wrap-in-try-checkbox');
  if (!checkbox) return;
  
  if (event && typeof event.wrapInTry === 'boolean') {
    checkbox.checked = event.wrapInTry;
  } else {
    checkbox.checked = false;
  }
}

/**
 * 코드 텍스트 가져오기
 * @param {Object} codeEditor - CodeMirror 에디터 인스턴스
 * @param {HTMLElement} codeOutput - 코드 출력 요소
 * @returns {string} 코드 텍스트
 */
export function getCodeText(codeEditor, codeOutput) {
  if (codeEditor) {
    return codeEditor.getValue();
  }
  return codeOutput ? codeOutput.value || '' : '';
}

/**
 * 코드 텍스트 설정
 * @param {string} text - 설정할 코드 텍스트
 * @param {Object} codeEditor - CodeMirror 에디터 인스턴스
 * @param {HTMLElement} codeOutput - 코드 출력 요소
 */
export function setCodeText(text, codeEditor, codeOutput) {
  const next = text || '';
  if (codeEditor && codeEditor.getValue() !== next) {
    const cursor = codeEditor.getCursor();
    codeEditor.setValue(next);
    if (cursor) {
      const totalLines = Math.max(codeEditor.lineCount() - 1, 0);
      codeEditor.setCursor({ line: Math.min(cursor.line, totalLines), ch: cursor.ch });
    }
  }
  if (codeOutput && codeOutput.value !== next) {
    codeOutput.value = next;
  }
}

/**
 * CodeMirror 모드 가져오기
 * @param {string} language - 언어 타입
 * @param {string} selectedLanguage - 선택된 언어
 * @returns {string} CodeMirror 모드
 */
export function getCodeMirrorMode(language, selectedLanguage) {
  const lang = language || selectedLanguage || 'javascript';
  if (lang === 'python' || lang === 'python-class') {
    return 'text/x-python';
  }
  if (lang === 'typescript') {
    return 'text/typescript';
  }
  return 'text/javascript';
}

/**
 * 코드 에디터 모드 새로고침
 * @param {Object} codeEditor - CodeMirror 에디터 인스턴스
 * @param {string} selectedLanguage - 선택된 언어
 */
export function refreshCodeEditorMode(codeEditor, selectedLanguage) {
  if (codeEditor) {
    codeEditor.setOption('mode', getCodeMirrorMode(selectedLanguage, selectedLanguage));
  }
}

/**
 * 빈 상태 메시지 업데이트
 * @param {Array} allEvents - 모든 이벤트 배열
 */
export function updateStepsEmptyState(allEvents) {
  const stepsEmpty = document.getElementById('steps-empty');
  const timeline = document.getElementById('timeline');
  
  if (stepsEmpty && timeline) {
    // timeline에 recorder-step이 있는지 확인
    const hasSteps = timeline.querySelectorAll('.recorder-step').length > 0;
    
    if (hasSteps || allEvents.length > 0) {
      stepsEmpty.classList.add('hidden');
    } else {
      stepsEmpty.classList.remove('hidden');
    }
  }
}

/**
 * iframe 배너 표시/숨김
 * @param {Object} ctx - iframe 컨텍스트
 * @param {HTMLElement} iframeBanner - iframe 배너 요소
 */
export function showIframe(ctx, iframeBanner) {
  if (!iframeBanner) return;
  if (ctx) {
    iframeBanner.classList.remove('hidden');
  } else {
    iframeBanner.classList.add('hidden');
  }
}

/**
 * 타임라인 아이템 추가
 * @param {Object} ev - 이벤트 객체
 * @param {number} index - 이벤트 인덱스
 * @param {HTMLElement} timeline - 타임라인 컨테이너
 * @param {Function} resolveTimelineSelector - 타임라인 셀렉터 해석 함수
 * @param {Function} getActionIcon - 액션 아이콘 가져오기 함수
 * @param {Function} formatActionLabel - 액션 라벨 포맷팅 함수
 * @param {Function} formatTargetInfo - 타겟 정보 포맷팅 함수
 * @param {Function} deleteCurrentEvent - 현재 이벤트 삭제 콜백
 * @param {Function} handleStepAssertion - 스텝 assertion 처리 콜백
 * @param {Function} showSelectorsWrapper - 셀렉터 표시 래퍼 함수
 * @param {Function} showIframe - iframe 표시 함수
 * @param {Function} updateDeleteButtonState - 삭제 버튼 상태 업데이트 함수
 * @param {Function} updateTryWrapCheckbox - try 문 체크박스 상태 업데이트 함수
 * @param {Object} stateRefs - 상태 참조 객체 { currentEventIndex, allEvents }
 */
export function appendTimelineItem(
  ev,
  index,
  timeline,
  resolveTimelineSelector,
  getActionIcon,
  formatActionLabel,
  formatTargetInfo,
  deleteCurrentEvent,
  handleStepAssertion,
  showSelectorsWrapper,
  showIframe,
  updateDeleteButtonState,
  updateTryWrapCheckbox,
  stateRefs
) {
  if (!timeline) return;
  
  const div = document.createElement('div');
  div.className = 'recorder-step';
  div.dataset.eventIndex = index;
  
  const action = ev.action || 'event';
  const actionIcon = getActionIcon(action);
  const actionLabel = formatActionLabel(action);
  const usedSelector = resolveTimelineSelector(ev);
  const targetInfo = formatTargetInfo(ev);
  
  // 단계 번호
  const stepNumber = document.createElement('div');
  stepNumber.className = 'recorder-step-number';
  stepNumber.textContent = index + 1;
  
  // 아이콘
  const stepIcon = document.createElement('div');
  stepIcon.className = 'recorder-step-icon';
  stepIcon.textContent = actionIcon;
  
  // 콘텐츠 영역
  const stepContent = document.createElement('div');
  stepContent.className = 'recorder-step-content';
  
  // 액션 라인
  const actionLine = document.createElement('div');
  actionLine.className = 'recorder-step-action';
  actionLine.textContent = actionLabel;
  
  // verifyImage 액션의 경우 이미지 미리보기 추가
  if (action === 'verifyImage' && ev.elementImageData) {
    const imagePreview = document.createElement('div');
    imagePreview.className = 'recorder-step-image-preview';
    imagePreview.style.cssText = 'margin: 4px 0; max-width: 200px; max-height: 150px; border: 1px solid var(--vscode-border); border-radius: 4px; overflow: hidden;';
    
    const img = document.createElement('img');
    img.src = ev.elementImageData;
    img.style.cssText = 'width: 100%; height: auto; display: block;';
    img.alt = '요소 이미지';
    
    imagePreview.appendChild(img);
    stepContent.appendChild(actionLine);
    stepContent.appendChild(imagePreview);
  }
  
  // 타겟 정보
  if (targetInfo || usedSelector) {
    const targetLine = document.createElement('div');
    targetLine.className = 'recorder-step-target';
    targetLine.textContent = targetInfo || usedSelector || '';
    if (action !== 'verifyImage' || !ev.elementImageData) {
      stepContent.appendChild(actionLine);
    }
    stepContent.appendChild(targetLine);
  } else {
    if (action !== 'verifyImage' || !ev.elementImageData) {
      stepContent.appendChild(actionLine);
    }
  }
  
  // 셀렉터 정보 (있는 경우)
  if (usedSelector && usedSelector !== targetInfo) {
    const selectorLine = document.createElement('div');
    selectorLine.className = 'recorder-step-selector';
    selectorLine.textContent = usedSelector;
    stepContent.appendChild(selectorLine);
  }
  
  // 액션 버튼들
  const stepActions = document.createElement('div');
  stepActions.className = 'recorder-step-actions';
  
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'recorder-step-btn';
  deleteBtn.textContent = '🗑';
  deleteBtn.title = '삭제';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm('이 단계를 삭제하시겠습니까?')) {
      deleteCurrentEvent();
    }
  });
  
  // 더보기 버튼 (펼치기/접기)
  const expandBtn = document.createElement('button');
  expandBtn.className = 'recorder-step-expand';
  expandBtn.innerHTML = '▼';
  expandBtn.title = '상세 정보 펼치기/접기';
  expandBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = div.classList.contains('expanded');
    const details = div.querySelector('.recorder-step-details');
    
    if (!isExpanded) {
      // 펼칠 때
      div.classList.add('expanded');
      if (details) {
        // 실제 높이 계산을 위해 임시로 표시
        details.style.maxHeight = 'none';
        const scrollHeight = details.scrollHeight;
        details.style.maxHeight = '0px';
        // 리플로우 후 실제 높이 설정
        requestAnimationFrame(() => {
          details.style.maxHeight = `${scrollHeight + 20}px`;
        });
      }
      expandBtn.innerHTML = '▲';
    } else {
      // 접을 때
      if (details) {
        details.style.maxHeight = '0px';
        setTimeout(() => {
          div.classList.remove('expanded');
          details.style.maxHeight = ''; // 인라인 스타일 제거
        }, 300); // transition 시간과 맞춤
      }
      expandBtn.innerHTML = '▼';
    }
  });
  
  stepActions.appendChild(expandBtn);
  stepActions.appendChild(deleteBtn);
  
  // 상세 정보 영역 (기본적으로 숨김)
  const stepDetails = document.createElement('div');
  stepDetails.className = 'recorder-step-details';
  
  // Type 정보
  const typeRow = document.createElement('div');
  typeRow.className = 'step-detail-row';
  const typeLabel = document.createElement('span');
  typeLabel.className = 'step-detail-label';
  typeLabel.textContent = 'type:';
  const typeValue = document.createElement('span');
  typeValue.className = 'step-detail-value';
  typeValue.textContent = action;
  typeRow.appendChild(typeLabel);
  typeRow.appendChild(typeValue);
  stepDetails.appendChild(typeRow);
  
  // Selectors 정보
  if (usedSelector || (ev.selectorCandidates && ev.selectorCandidates.length > 0)) {
    const selectorsRow = document.createElement('div');
    selectorsRow.className = 'step-detail-row';
    const selectorsLabel = document.createElement('span');
    selectorsLabel.className = 'step-detail-label';
    selectorsLabel.textContent = 'selectors:';
    selectorsRow.appendChild(selectorsLabel);
    
    const selectorsContainer = document.createElement('div');
    selectorsContainer.className = 'step-detail-selectors';
    
    // Primary selector
    if (usedSelector) {
      const selectorItem = document.createElement('div');
      selectorItem.className = 'step-detail-selector-item';
      const selectorLabel = document.createElement('span');
      selectorLabel.className = 'step-detail-selector-label';
      selectorLabel.textContent = 'selector #1:';
      const selectorValue = document.createElement('span');
      selectorValue.className = 'step-detail-selector-value';
      selectorValue.textContent = usedSelector;
      selectorItem.appendChild(selectorLabel);
      selectorItem.appendChild(selectorValue);
      selectorsContainer.appendChild(selectorItem);
    }
    
    // Additional selectors from candidates
    if (ev.selectorCandidates && ev.selectorCandidates.length > 0) {
      let selectorIndex = 2;
      ev.selectorCandidates.slice(0, 3).forEach((candidate) => {
        const selector = candidate.selector || candidate;
        if (selector && selector !== usedSelector) {
          const selectorItem = document.createElement('div');
          selectorItem.className = 'step-detail-selector-item';
          const selectorLabel = document.createElement('span');
          selectorLabel.className = 'step-detail-selector-label';
          selectorLabel.textContent = `selector #${selectorIndex}:`;
          const selectorValue = document.createElement('span');
          selectorValue.className = 'step-detail-selector-value';
          selectorValue.textContent = selector;
          selectorItem.appendChild(selectorLabel);
          selectorItem.appendChild(selectorValue);
          selectorsContainer.appendChild(selectorItem);
          selectorIndex++;
        }
      });
    }
    
    selectorsRow.appendChild(selectorsContainer);
    stepDetails.appendChild(selectorsRow);
  }
  
  // Value 정보 (type 액션인 경우)
  if (ev.action === 'type' && ev.value) {
    const valueRow = document.createElement('div');
    valueRow.className = 'step-detail-row';
    const valueLabel = document.createElement('span');
    valueLabel.className = 'step-detail-label';
    valueLabel.textContent = 'value:';
    const valueValue = document.createElement('span');
    valueValue.className = 'step-detail-value';
    valueValue.textContent = ev.value;
    valueRow.appendChild(valueLabel);
    valueRow.appendChild(valueValue);
    stepDetails.appendChild(valueRow);
  }
  
  // 이미지 정보 (verifyImage 액션인 경우)
  if (ev.action === 'verifyImage' && ev.elementImageData) {
    const imageRow = document.createElement('div');
    imageRow.className = 'step-detail-row';
    const imageLabel = document.createElement('span');
    imageLabel.className = 'step-detail-label';
    imageLabel.textContent = '요소 이미지:';
    const imageValue = document.createElement('div');
    imageValue.className = 'step-detail-image';
    imageValue.style.cssText = 'margin-top: 4px; max-width: 400px; max-height: 300px; border: 1px solid var(--vscode-border); border-radius: 4px; overflow: hidden;';
    
    const detailImg = document.createElement('img');
    detailImg.src = ev.elementImageData;
    detailImg.style.cssText = 'width: 100%; height: auto; display: block;';
    detailImg.alt = '요소 이미지';
    
    imageValue.appendChild(detailImg);
    imageRow.appendChild(imageLabel);
    imageRow.appendChild(imageValue);
    stepDetails.appendChild(imageRow);
  }
  
  // 스텝에 귀속된 Assertion 추가 섹션
  const assertionSection = document.createElement('div');
  assertionSection.className = 'step-assertion-section';
  
  const addAssertionBtn = document.createElement('button');
  addAssertionBtn.className = 'step-add-assertion-btn';
  addAssertionBtn.textContent = 'Add assertion';
  addAssertionBtn.type = 'button';
  
  const assertionMenu = document.createElement('div');
  assertionMenu.className = 'step-assertion-menu hidden';
  
  const menuHeader = document.createElement('div');
  menuHeader.className = 'assertion-menu-header';
  menuHeader.textContent = 'Assertion 타입 선택';
  assertionMenu.appendChild(menuHeader);
  
  const menuButtons = document.createElement('div');
  menuButtons.className = 'assertion-menu-buttons';
  
  const assertionTypes = [
    { type: 'verifyText', label: '텍스트 검증' },
    { type: 'verifyTextContains', label: '텍스트 부분일치 검증' },
    { type: 'verifyElementPresent', label: '요소 존재 검증' },
    { type: 'verifyElementNotPresent', label: '요소 부재 검증' },
    { type: 'verifyTitle', label: '타이틀 검증' },
    { type: 'verifyUrl', label: 'URL 검증' },
    { type: 'verifyImage', label: '이미지 비교' }
  ];
  
  assertionTypes.forEach(({ type, label }) => {
    const btn = document.createElement('button');
    btn.className = 'assertion-menu-btn';
    btn.textContent = label;
    btn.setAttribute('data-assertion', type);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      assertionMenu.classList.add('hidden');
      handleStepAssertion(index, type, ev);
    });
    menuButtons.appendChild(btn);
  });
  
  assertionMenu.appendChild(menuButtons);
  
  addAssertionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    assertionMenu.classList.toggle('hidden');
  });
  
  assertionSection.appendChild(addAssertionBtn);
  assertionSection.appendChild(assertionMenu);
  stepDetails.appendChild(assertionSection);
  
  // 메인 영역 (번호, 아이콘, 콘텐츠, 액션 버튼)
  const stepMain = document.createElement('div');
  stepMain.className = 'recorder-step-main';
  stepMain.appendChild(stepNumber);
  stepMain.appendChild(stepIcon);
  stepMain.appendChild(stepContent);
  stepMain.appendChild(stepActions);
  
  // 조립
  div.appendChild(stepMain);
  div.appendChild(stepDetails);
  
  // 클릭 이벤트 (선택만, 펼치기는 expandBtn에서 처리)
  div.addEventListener('click', (e) => {
    // expandBtn이나 stepActions를 클릭한 경우는 제외
    if (e.target.closest('.recorder-step-expand') || e.target.closest('.recorder-step-actions')) {
      return;
    }
    
    // 이전 선택 해제
    document.querySelectorAll('.recorder-step').forEach(item => item.classList.remove('selected'));
    // 현재 선택
    div.classList.add('selected');
    if (stateRefs.currentEventIndex && typeof stateRefs.currentEventIndex === 'object' && 'value' in stateRefs.currentEventIndex) {
      stateRefs.currentEventIndex.value = index;
    } else {
      stateRefs.currentEventIndex = index;
    }
    
    // Step Details 패널 표시
    const stepDetailsPanel = document.getElementById('step-details-panel');
    if (stepDetailsPanel) {
      stepDetailsPanel.classList.remove('hidden');
    }
    
    // 해당 이벤트의 셀렉터 표시
    showSelectorsWrapper(ev.selectorCandidates || [], ev, index);
    showIframe(ev.iframeContext);
    // updateDeleteButtonState 호출 (함수로 전달된 경우 파라미터 없이 호출 가능)
    if (typeof updateDeleteButtonState === 'function') {
      updateDeleteButtonState();
    }
    
    // try 문 체크박스 상태 업데이트
    updateTryWrapCheckbox(ev);
  });
  
  timeline.appendChild(div);
}

/**
 * 요소 하이라이트 처리 (마우스 오버 시)
 * @param {Object} data - 요소 데이터
 * @param {HTMLElement} selectorList - 셀렉터 리스트 컨테이너
 * @param {Function} renderSelectorItems - 셀렉터 아이템 렌더링 함수
 * @param {Function} showIframe - iframe 표시 함수
 */
export function handleElementHover(data, selectorList, renderSelectorItems, showIframe) {
  if (!selectorList) return;
  
  const element = data.element || {};
  const selectors = data.selectors || [];
  
  // 요소 정보 표시
  const elementInfo = document.createElement('div');
  elementInfo.className = 'element-hover-info';
  elementInfo.style.cssText = 'padding: 12px; margin-bottom: 12px; background: var(--vscode-input-bg); border: 1px solid var(--vscode-border); border-radius: 6px;';
  
  const tagEl = document.createElement('div');
  tagEl.style.cssText = 'font-weight: 600; color: var(--vscode-text); margin-bottom: 4px;';
  tagEl.textContent = `<${element.tag || 'unknown'}>`;
  
  if (element.id) {
    const idEl = document.createElement('div');
    idEl.style.cssText = 'font-size: 12px; color: var(--vscode-text-secondary); margin-bottom: 2px;';
    idEl.textContent = `#${element.id}`;
    elementInfo.appendChild(idEl);
  }
  
  if (element.classes && element.classes.length > 0) {
    const classEl = document.createElement('div');
    classEl.style.cssText = 'font-size: 12px; color: var(--vscode-text-secondary); margin-bottom: 2px;';
    classEl.textContent = `.${element.classes.slice(0, 3).join('.')}`;
    elementInfo.appendChild(classEl);
  }
  
  if (element.text) {
    const textEl = document.createElement('div');
    textEl.style.cssText = 'font-size: 11px; color: var(--vscode-text-secondary); margin-top: 4px; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    textEl.textContent = `"${element.text}"`;
    elementInfo.appendChild(textEl);
  }
  
  elementInfo.insertBefore(tagEl, elementInfo.firstChild);
  
  // 셀렉터 리스트 표시
  const tempContainer = document.createElement('div');
  tempContainer.appendChild(elementInfo);
  
  if (selectors.length > 0) {
    renderSelectorItems(selectors, tempContainer);
  } else {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'selector-empty';
    emptyMsg.textContent = '셀렉터 후보가 없습니다.';
    tempContainer.appendChild(emptyMsg);
  }
  
  // 기존 내용 교체
  selectorList.innerHTML = '';
  selectorList.appendChild(tempContainer);
  
  // iframe 경고 표시
  if (element.iframeContext) {
    showIframe(element.iframeContext);
  } else {
    showIframe(null);
  }
}

/**
 * 요소 하이라이트 해제
 * @param {HTMLElement} selectorList - 셀렉터 리스트 컨테이너
 * @param {number} currentEventIndex - 현재 선택된 이벤트 인덱스
 * @param {Array} allEvents - 모든 이벤트 배열
 * @param {Function} showSelectors - 셀렉터 표시 함수
 * @param {Function} showIframe - iframe 표시 함수
 */
export function clearElementHover(selectorList, currentEventIndex, allEvents, showSelectors, showIframe) {
  if (!selectorList) return;
  
  // 하이라이트 정보만 제거하고, 선택된 이벤트의 셀렉터는 유지
  const hoverInfo = selectorList.querySelector('.element-hover-info');
  if (hoverInfo) {
    hoverInfo.remove();
  }
  
  // 선택된 이벤트가 있으면 해당 셀렉터 표시
  if (currentEventIndex >= 0 && currentEventIndex < allEvents.length) {
    const selectedEvent = allEvents[currentEventIndex];
    showSelectors(selectedEvent.selectorCandidates || [], selectedEvent, currentEventIndex);
  } else {
    // 선택된 이벤트가 없으면 빈 상태
    selectorList.innerHTML = '';
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'selector-empty';
    emptyMsg.textContent = '요소에 마우스를 올려보세요.';
    selectorList.appendChild(emptyMsg);
  }
  
  showIframe(null);
}
