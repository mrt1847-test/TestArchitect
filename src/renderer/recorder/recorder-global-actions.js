/**
 * Global Actions 모듈
 * Global Assertion 및 Wait 액션 처리
 */

/**
 * Global assertion 처리 (맨 끝에 추가)
 * @param {string} assertionType - assertion 타입
 * @param {Object} dependencies - 의존성 객체
 */
export function handleGlobalAssertion(assertionType, dependencies) {
  if (!assertionType) return;
  
  const {
    addVerifyAction,
    addAssertionAfterStep,
    startSimpleElementSelection
  } = dependencies;
  
  // verifyTitle은 요소 선택 불필요
  if (assertionType === 'verifyTitle') {
    addVerifyAction(assertionType, null, null);
    return;
  }
  
  // verifyUrl은 matchMode 선택 필요
  if (assertionType === 'verifyUrl') {
    // withActiveTab은 Electron 환경에서만 사용 가능
    // 대신 window.location.href 사용
    const currentUrl = window.location.href || '';
    const inputValue = prompt('검증할 URL을 입력하세요:', currentUrl);
    if (inputValue === null) return; // 취소
    
    // matchMode 선택 (완전일치/포함)
    const matchMode = confirm('완전일치 검증을 사용하시겠습니까?\n\n확인: 완전일치\n취소: 포함 검증');
    const matchModeValue = matchMode ? 'exact' : 'contains';
    
    addVerifyAction(assertionType, null, inputValue || currentUrl, null, matchModeValue);
    return;
  }
  
  // 요소 검증은 심플 요소 선택 사용 (waitForElement와 동일한 방식)
  // startSimpleElementSelection은 래퍼 함수로 전달되므로 직접 호출 가능
  console.log('[Recorder] handleGlobalAssertion: 요소 선택 시작', {
    assertionType,
    hasStartSimpleElementSelection: !!startSimpleElementSelection
  });
  
  if (!startSimpleElementSelection) {
    console.error('[Recorder] handleGlobalAssertion: startSimpleElementSelection이 전달되지 않았습니다.');
    return;
  }
  
  // verify actions 컨테이너 숨기기 (요소 선택 모드 시작 전에)
  const verifyActionsContainer = document.getElementById('verify-actions');
  if (verifyActionsContainer) {
    verifyActionsContainer.classList.add('hidden');
  }
  
  // 요소 선택 모드 시작
  console.log('[Recorder] handleGlobalAssertion: startSimpleElementSelection 호출 시작');
  startSimpleElementSelection(async (path, elementInfo, pendingAction, pendingStepIndex) => {
    console.log('[Recorder] handleGlobalAssertion 콜백 실행:', {
      pendingAction,
      pendingStepIndex,
      pathLength: path?.length || 0,
      elementText: elementInfo?.text,
      hasPath: !!path && path.length > 0
    });
    
    if (!path || path.length === 0) {
      console.warn('[Recorder] handleGlobalAssertion: path가 비어있습니다.');
      return;
    }
    
    let value = null;
    if (pendingAction === 'verifyText' || pendingAction === 'verifyTextContains') {
      // 요소의 텍스트를 자동으로 사용 (prompt 없이)
      value = elementInfo?.text || path[0]?.textValue || '';
      console.log(`[Recorder] ${pendingAction}: 요소 텍스트 자동 사용:`, value);
    }
    
    // pendingStepIndex가 있으면 addAssertionAfterStep 사용, 없으면 addVerifyAction 사용
    if (pendingStepIndex !== null && pendingStepIndex !== undefined) {
      console.log('[Recorder] handleGlobalAssertion: addAssertionAfterStep 호출 시작:', { pendingStepIndex, pendingAction });
      addAssertionAfterStep(pendingStepIndex, pendingAction, path, value);
      console.log('[Recorder] handleGlobalAssertion: addAssertionAfterStep 호출 완료');
    } else {
      console.log('[Recorder] handleGlobalAssertion: addVerifyAction 호출 시작:', { pendingAction, pathLength: path?.length || 0, value });
      await addVerifyAction(pendingAction, path, value, elementInfo);
      console.log('[Recorder] handleGlobalAssertion: addVerifyAction 호출 완료');
    }
  }, assertionType, null);
  console.log('[Recorder] handleGlobalAssertion: startSimpleElementSelection 호출 완료');
}

/**
 * Global wait 처리 (맨 끝에 추가)
 * @param {string} waitType - wait 타입
 * @param {Object} dependencies - 의존성 객체
 */
export function handleGlobalWait(waitType, dependencies) {
  if (!waitType) return;
  
  const {
    addWaitAction,
    startSimpleElementSelection,
    normalizeEventRecord,
    allEvents,
    updateCode,
    syncTimelineFromEvents,
    saveEventAsStep,
    logMessage
  } = dependencies;
  
  // 시간 대기는 입력 패널 표시
  if (waitType === 'wait') {
    // global-wait-menu 숨기기
    const globalWaitMenu = document.getElementById('global-wait-menu');
    if (globalWaitMenu) {
      globalWaitMenu.classList.add('hidden');
    }
    
    // 입력 패널 표시 (global-wait-menu 다음에 위치)
    const waitInputPanel = document.getElementById('wait-input-panel');
    if (waitInputPanel) {
      waitInputPanel.classList.remove('hidden');
    }
    
    // 입력 필드에 포커스
    const waitTimeInput = document.getElementById('wait-time-input');
    if (waitTimeInput) {
      waitTimeInput.value = '1000'; // 기본값 설정
      waitTimeInput.focus();
    }
    
    return;
  }
  
  // 요소 대기는 심플 요소 선택 사용
  if (waitType === 'waitForElement') {
    console.log('[Recorder] handleGlobalWait: 요소 선택 시작', {
      waitType,
      hasStartSimpleElementSelection: !!startSimpleElementSelection,
      hasAddWaitAction: !!addWaitAction
    });
    
    if (!startSimpleElementSelection) {
      console.error('[Recorder] handleGlobalWait: startSimpleElementSelection이 전달되지 않았습니다.');
      if (logMessage) {
        logMessage('요소 선택을 시작할 수 없습니다. startSimpleElementSelection이 없습니다.', 'error');
      }
      return;
    }
    
    // wait-actions 컨테이너 숨기기 (요소 선택 모드 시작 전에)
    const waitActionsContainer = document.getElementById('wait-actions');
    if (waitActionsContainer) {
      waitActionsContainer.classList.add('hidden');
    }
    
    // 요소 선택 모드 시작
    console.log('[Recorder] handleGlobalWait: startSimpleElementSelection 호출 시작');
    startSimpleElementSelection((path, elementInfo, pendingAction, pendingStepIndex) => {
      console.log('[Recorder] handleGlobalWait 콜백 실행:', {
        pendingAction,
        pendingStepIndex,
        pathLength: path?.length || 0,
        elementText: elementInfo?.text,
        hasPath: !!path && path.length > 0
      });
      
      if (!path || path.length === 0) {
        console.warn('[Recorder] handleGlobalWait: path가 비어있습니다.');
        if (logMessage) {
          logMessage('요소를 선택할 수 없습니다.', 'error');
        }
        return;
      }
      
      console.log('[Recorder] handleGlobalWait: addWaitAction 호출 시작');
      addWaitAction(
        'waitForElement',
        null,
        path,
        elementInfo,
        normalizeEventRecord,
        allEvents,
        updateCode,
        syncTimelineFromEvents,
        saveEventAsStep,
        logMessage
      );
      console.log('[Recorder] handleGlobalWait: addWaitAction 호출 완료');
    }, 'waitForElement', null);
    console.log('[Recorder] handleGlobalWait: startSimpleElementSelection 호출 완료');
  }
}

