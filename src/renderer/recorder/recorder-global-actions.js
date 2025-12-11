/**
 * Global Actions 모듈
 * Global Assertion 및 Wait 액션 처리
 */

/**
 * Global assertion 처리 (맨 끝에 추가)
 * @param {string} assertionType - assertion 타입
 * @param {Object} dependencies - 의존성 객체
 */
export async function handleGlobalAssertion(assertionType, dependencies) {
  if (!assertionType) return;
  
  const {
    addVerifyAction,
    addAssertionAfterStep,
    startSimpleElementSelection,
    getAllEvents // 최신 allEvents를 가져오는 함수
  } = dependencies;
  
  // verifyTitle은 요소 선택 불필요
  if (assertionType === 'verifyTitle') {
    console.log('[Recorder] handleGlobalAssertion: verifyTitle 처리 시작');
    try {
      await addVerifyAction(assertionType, null, null);
      console.log('[Recorder] handleGlobalAssertion: verifyTitle 처리 완료');
    } catch (error) {
      console.error('[Recorder] handleGlobalAssertion: verifyTitle 처리 오류', error);
    }
    return;
  }
  
  // verifyUrl은 matchMode 선택 필요
  if (assertionType === 'verifyUrl') {
    console.log('[Recorder] handleGlobalAssertion: verifyUrl 처리 시작');
    console.log('[Recorder] handleGlobalAssertion: getAllEvents 존재 여부:', !!getAllEvents);
    
    // 마지막 이벤트의 page.url을 가져오기 (실제 브라우저 탭의 URL)
    let currentUrl = '';
    if (getAllEvents) {
      const events = getAllEvents();
      console.log('[Recorder] handleGlobalAssertion: 이벤트 개수:', events ? events.length : 0);
      if (events && events.length > 0) {
        // 마지막 이벤트부터 역순으로 page.url이 있는 이벤트 찾기
        for (let i = events.length - 1; i >= 0; i--) {
          const event = events[i];
          console.log('[Recorder] handleGlobalAssertion: 이벤트 확인:', i, {
            hasEvent: !!event,
            hasPage: !!(event && event.page),
            hasUrl: !!(event && event.page && event.page.url),
            url: event && event.page ? event.page.url : null
          });
          if (event && event.page && event.page.url) {
            currentUrl = event.page.url;
            console.log('[Recorder] handleGlobalAssertion: 마지막 이벤트의 URL 사용:', currentUrl, '이벤트 인덱스:', i);
            break;
          }
        }
      } else {
        console.log('[Recorder] handleGlobalAssertion: 이벤트가 없거나 빈 배열');
      }
    } else {
      console.log('[Recorder] handleGlobalAssertion: getAllEvents 함수가 전달되지 않음');
    }
    
    // 마지막 이벤트에 URL이 없으면 취소
    if (!currentUrl) {
      console.log('[Recorder] handleGlobalAssertion: 마지막 이벤트에 URL이 없음, verifyUrl 취소');
      return; // URL이 없으면 취소
    }
    
    // prompt 없이 마지막 이벤트의 URL을 자동으로 사용 (일반 verifyUrl과 동일한 방식)
    const inputValue = currentUrl;
    console.log('[Recorder] handleGlobalAssertion: 사용할 URL:', inputValue);
    
    // matchMode 제거 - 일반 verifyUrl과 동일하게 처리 (기본값 'exact' 사용)
    console.log('[Recorder] handleGlobalAssertion: addVerifyAction 호출 시작', {
      assertionType,
      path: null,
      value: inputValue,
      hasAddVerifyAction: !!addVerifyAction
    });
    
    // addVerifyAction은 async 함수이므로 await 사용
    try {
      const result = await addVerifyAction(assertionType, null, inputValue);
      console.log('[Recorder] handleGlobalAssertion: addVerifyAction 호출 완료', result);
    } catch (error) {
      console.error('[Recorder] handleGlobalAssertion: addVerifyAction 호출 오류', error);
    }
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

