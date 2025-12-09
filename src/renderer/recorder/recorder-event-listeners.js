/**
 * 이벤트 리스너 모듈
 * UI 이벤트 리스너 설정 및 관리
 */

/**
 * Action 메뉴 토글 설정
 * @param {Object} dependencies - 의존성 객체
 */
export function setupActionMenu(dependencies) {
  const {
    handleInteractionAction,
    handleVerifyAction,
    handleWaitAction,
    buildSelectionPathArrayWrapper,
    startSelectionWorkflowWrapper,
    startSimpleElementSelectionWrapper,
    selectionState,
    setElementStatusWrapper,
    addInteractionAction,
    addVerifyAction,
    addWaitAction,
    normalizeEventRecord,
    allEvents,
    updateCode,
    syncTimelineFromEvents,
    saveEventAsStep,
    logMessage,
    electronAPI,
    initElectronAPI,
    captureVerifyImageScreenshot
  } = dependencies;

  const actionBtn = document.getElementById('action-btn');
  const actionMenu = document.getElementById('action-menu');
  
  if (!actionBtn || !actionMenu) return;

  actionBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    actionMenu.classList.toggle('hidden');
  });

  // 메뉴 외부 클릭 시 닫기
  document.addEventListener('click', (e) => {
    if (!actionMenu.contains(e.target) && !actionBtn.contains(e.target)) {
      actionMenu.classList.add('hidden');
    }
  });

  // Action 메뉴 항목 클릭 처리
  actionMenu.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const button = e.target.closest('button[data-action-type]');
    if (!button) return;

    const actionType = button.dataset.actionType;
    const action = button.dataset.action;
    
    if (actionType === 'interaction') {
      handleInteractionAction(
        action,
        buildSelectionPathArrayWrapper,
        startSelectionWorkflowWrapper,
        selectionState,
        setElementStatusWrapper,
        (interactionType, path, value) => addInteractionAction(
          interactionType,
          path,
          value,
          normalizeEventRecord,
          allEvents,
          updateCode,
          syncTimelineFromEvents,
          saveEventAsStep,
          logMessage
        )
      );
    } else if (actionType === 'verify') {
      handleVerifyAction(
        action,
        setElementStatusWrapper,
        startSimpleElementSelectionWrapper,
        (verifyType, path, value, elementInfo) => addVerifyAction(
          verifyType,
          path,
          value,
          elementInfo,
          normalizeEventRecord,
          allEvents,
          updateCode,
          syncTimelineFromEvents,
          saveEventAsStep,
          setElementStatusWrapper,
          (clientRect) => captureVerifyImageScreenshot(clientRect, electronAPI, initElectronAPI)
        )
      );
    } else if (actionType === 'wait') {
      handleWaitAction(
        action,
        buildSelectionPathArrayWrapper,
        startSelectionWorkflowWrapper,
        selectionState,
        setElementStatusWrapper,
        (waitType, timeValue, path, elementInfo) => addWaitAction(
          waitType,
          timeValue,
          path,
          elementInfo,
          normalizeEventRecord,
          allEvents,
          updateCode,
          syncTimelineFromEvents,
          saveEventAsStep,
          logMessage
        )
      );
    }

    actionMenu.classList.add('hidden');
  });
}

/**
 * 오버레이 토글 설정
 * @param {Object} dependencies - 의존성 객체
 */
export function setupOverlayToggle(dependencies) {
  const {
    wsConnection,
    logMessage
  } = dependencies;

  const overlayToggleBtn = document.getElementById('overlay-toggle-btn');
  
  if (!overlayToggleBtn) return;

  let overlayVisible = false;

  overlayToggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    overlayVisible = !overlayVisible;
    overlayToggleBtn.setAttribute('aria-pressed', overlayVisible.toString());
    
    // WebSocket으로 오버레이 토글 신호 전송
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        type: 'toggle-overlay',
        visible: overlayVisible,
        timestamp: Date.now()
      }));
    }

    logMessage(`오버레이 ${overlayVisible ? '표시' : '숨김'}`, 'info');
  });
}

/**
 * AI 설정 이벤트 리스너 설정
 * @param {Object} dependencies - 의존성 객체
 */
export function setupAiSettings(dependencies) {
  const {
    aiSettingsSaveBtn,
    aiEndpointInput,
    aiApiKeyInput,
    aiModelInput,
    aiSettingsStatusEl,
    aiSettingsLoaded,
    aiSettingsDirty,
    loadAiSettingsFromStorage,
    saveAiSettings,
    markAiSettingsDirty,
    refreshSelectorListForCurrentEvent
  } = dependencies;

  // AI 설정 저장 버튼
  if (aiSettingsSaveBtn) {
    aiSettingsSaveBtn.addEventListener('click', () => {
      if (!aiSettingsLoaded && !aiSettingsDirty) {
        loadAiSettingsFromStorage(aiEndpointInput, aiApiKeyInput, aiModelInput, aiSettingsStatusEl, refreshSelectorListForCurrentEvent);
        return;
      }
      saveAiSettings(aiEndpointInput, aiApiKeyInput, aiModelInput, aiSettingsStatusEl, refreshSelectorListForCurrentEvent);
    });
  }

  // AI 설정 입력 필드 변경 감지
  [aiEndpointInput, aiApiKeyInput, aiModelInput].forEach((input) => {
    if (!input) return;
    input.addEventListener('input', () => markAiSettingsDirty(aiSettingsStatusEl));
  });

  // 초기 로드
  loadAiSettingsFromStorage(aiEndpointInput, aiApiKeyInput, aiModelInput, aiSettingsStatusEl, refreshSelectorListForCurrentEvent);
}

/**
 * 이벤트 리스너 설정 (메인 함수)
 * @param {Object} dependencies - 의존성 객체
 */
export function setupEventListeners(dependencies) {
  const {
    // DOM 요소
    startBtn,
    stopBtn,
    resetBtn,
    deleteEventBtn,
    sendRecordingBtn,
    frameworkSelect,
    languageSelect,
    aiReviewBtn,
    syncToTcBtn,
    elementAttrApplyBtn,
    elementAttrNameInput,
    elementSelectBtn,
    tcIdInput,
    projectIdInput,
    // 상태
    selectedFramework,
    selectedLanguage,
    codeEditor,
    allEvents,
    currentEventIndex,
    recording,
    selectionState,
    // 함수들
    startRecording,
    stopRecording,
    reset,
    deleteSelectedEvent,
    sendRecordingData,
    updateCode,
    getCodeMirrorMode,
    performAiCodeReview,
    syncCodeToTC,
    setElementStatusWrapper,
    applySelectionActionWrapper,
    handleInteractionAction,
    handleVerifyAction,
    handleWaitAction,
    buildSelectionPathArrayWrapper,
    startSelectionWorkflowWrapper,
    startSimpleElementSelectionWrapper,
    addInteractionAction,
    addVerifyAction,
    addWaitAction,
    normalizeEventRecord,
    syncTimelineFromEvents,
    saveEventAsStep,
    logMessage,
    generateCode,
    manualActions,
    setCodeText,
    saveCodeToTCWithDebounce,
    updateDeleteButtonState,
    initPanelResize,
    handleGlobalAssertion,
    handleGlobalWait,
    startConditionalActionWorkflow,
    startReplay,
    cancelSelectionWorkflowWrapper,
    addAssertionAfterStep,
    updateTimeline,
    highlightSelector,
    requestAiSelectorsForEvent,
    electronAPI,
    initElectronAPI,
    captureVerifyImageScreenshot
  } = dependencies;

  console.log('[Recorder] 이벤트 리스너 설정 시작');
  console.log('[Recorder] startBtn:', startBtn);
  console.log('[Recorder] stopBtn:', stopBtn);
  
  if (startBtn) {
    startBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[Recorder] Record Start 버튼 클릭됨');
      try {
        await startRecording();
      } catch (error) {
        console.error('[Recorder] 녹화 시작 중 오류:', error);
        if (logMessage) {
          logMessage('녹화 시작 중 오류가 발생했습니다: ' + error.message, 'error');
        }
      }
    });
  } else {
    console.error('[Recorder] startBtn이 null입니다. DOM 요소를 찾을 수 없습니다.');
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[Recorder] Stop 버튼 클릭됨');
      stopRecording();
    });
  } else {
    console.error('[Recorder] stopBtn이 null입니다. DOM 요소를 찾을 수 없습니다.');
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      reset();
    });
  }

  if (deleteEventBtn) {
    deleteEventBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteSelectedEvent();
    });
  }

  if (sendRecordingBtn) {
    sendRecordingBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sendRecordingData();
    });
  }

  if (frameworkSelect) {
    frameworkSelect.addEventListener('change', (e) => {
      if (dependencies.selectedFramework && typeof dependencies.selectedFramework === 'object' && 'value' in dependencies.selectedFramework) {
        dependencies.selectedFramework.value = e.target.value;
      } else {
        dependencies.selectedFramework = e.target.value;
      }
      updateCode();
    });
  }

  if (languageSelect) {
    languageSelect.addEventListener('change', (e) => {
      if (dependencies.selectedLanguage && typeof dependencies.selectedLanguage === 'object' && 'value' in dependencies.selectedLanguage) {
        dependencies.selectedLanguage.value = e.target.value;
      } else {
        dependencies.selectedLanguage = e.target.value;
      }
      if (codeEditor) {
        codeEditor.setOption('mode', getCodeMirrorMode(e.target.value));
      }
      updateCode();
    });
  }

  if (aiReviewBtn) {
    aiReviewBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      performAiCodeReview();
    });
  }

  // TC 동기화 버튼
  if (syncToTcBtn) {
    syncToTcBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await syncCodeToTC();
    });
  }

  // 속성 추출 적용 버튼
  if (elementAttrApplyBtn) {
    elementAttrApplyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const attrName = elementAttrNameInput ? elementAttrNameInput.value.trim() : '';
      if (!attrName) {
        setElementStatusWrapper('속성명을 입력하세요.', 'error');
        return;
      }
      if (selectionState.pendingAction === 'attribute') {
        selectionState.pendingAttribute = attrName;
        await applySelectionActionWrapper('get_attribute', {attributeName: attrName});
        selectionState.pendingAction = null;
        selectionState.pendingAttribute = '';
      }
    });
  }

  // 요소 선택 취소 버튼
  const elementCancelBtn = document.getElementById('element-cancel-btn');
  if (elementCancelBtn && cancelSelectionWorkflowWrapper) {
    elementCancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[Recorder] 요소 선택 취소 버튼 클릭됨');
      cancelSelectionWorkflowWrapper('요소 선택이 취소되었습니다.', 'info');
    });
  } else {
    console.warn('[Recorder] element-cancel-btn을 찾을 수 없거나 cancelSelectionWorkflowWrapper가 없습니다.');
  }

  // 요소 선택 버튼
  if (elementSelectBtn && startSelectionWorkflowWrapper) {
    elementSelectBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[Recorder] 요소 선택 버튼 클릭됨');
      startSelectionWorkflowWrapper();
    });
  } else {
    console.warn('[Recorder] element-select-btn을 찾을 수 없거나 startSelectionWorkflowWrapper가 없습니다.');
  }

  // 상호작용 액션 버튼들
  const interactionActionsContainer = document.getElementById('interaction-actions');
  if (interactionActionsContainer) {
    interactionActionsContainer.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-interaction]');
      if (!button) return;
      e.preventDefault();
      e.stopPropagation();
      const interactionType = button.dataset.interaction;
      handleInteractionAction(
        interactionType,
        buildSelectionPathArrayWrapper,
        startSelectionWorkflowWrapper,
        selectionState,
        setElementStatusWrapper,
        (interactionType, path, value) => addInteractionAction(
          interactionType,
          path,
          value,
          normalizeEventRecord,
          allEvents,
          updateCode,
          syncTimelineFromEvents,
          saveEventAsStep,
          logMessage
        )
      );
    });
  }

  // 검증 액션 버튼들
  const verifyActionsContainer = document.getElementById('verify-actions');
  if (verifyActionsContainer) {
    verifyActionsContainer.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-verify]');
      if (!button) return;
      e.preventDefault();
      e.stopPropagation();
      const verifyType = button.dataset.verify;
      handleVerifyAction(
        verifyType,
        setElementStatusWrapper,
        startSimpleElementSelectionWrapper,
        (verifyType, path, value, elementInfo) => addVerifyAction(
          verifyType,
          path,
          value,
          elementInfo,
          normalizeEventRecord,
          allEvents,
          updateCode,
          syncTimelineFromEvents,
          saveEventAsStep,
          setElementStatusWrapper,
          (clientRect) => captureVerifyImageScreenshot(clientRect, electronAPI, initElectronAPI)
        )
      );
    });
  }

  // 대기 액션 버튼들
  const waitActionsContainer = document.getElementById('wait-actions');
  if (waitActionsContainer) {
    waitActionsContainer.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-wait]');
      if (!button) return;
      e.preventDefault();
      e.stopPropagation();
      const waitType = button.dataset.wait;
      handleWaitAction(
        waitType,
        buildSelectionPathArrayWrapper,
        startSelectionWorkflowWrapper,
        selectionState,
        setElementStatusWrapper,
        (waitType, timeValue, path, elementInfo) => addWaitAction(
          waitType,
          timeValue,
          path,
          elementInfo,
          normalizeEventRecord,
          allEvents,
          updateCode,
          syncTimelineFromEvents,
          saveEventAsStep,
          logMessage
        )
      );
    });
  }

  // 대기 시간 적용 버튼
  const waitTimeApplyBtn = document.getElementById('wait-time-apply');
  const waitTimeInput = document.getElementById('wait-time-input');
  
  const applyWaitTime = () => {
    if (!waitTimeInput) return;
    const timeValue = parseInt(waitTimeInput.value);
    if (isNaN(timeValue) || timeValue < 0) {
      alert('올바른 대기 시간을 입력하세요.');
      return;
    }
    addWaitAction(
      'wait',
      timeValue,
      null,
      null,
      normalizeEventRecord,
      allEvents,
      updateCode,
      syncTimelineFromEvents,
      saveEventAsStep,
      logMessage
    );
    const waitInputPanel = document.getElementById('wait-input-panel');
    if (waitInputPanel) {
      waitInputPanel.classList.add('hidden');
    }
    waitTimeInput.value = '';
  };
  
  if (waitTimeApplyBtn) {
    waitTimeApplyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyWaitTime();
    });
  }
  
  if (waitTimeInput) {
    // Enter 키로도 적용
    waitTimeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        applyWaitTime();
      }
    });
  }

  // Action 메뉴 및 오버레이 토글 설정
  setupActionMenu(dependencies);
  setupOverlayToggle(dependencies);
  
  // 설정 패널 토글
  const settingsToggleBtn = document.getElementById('settings-toggle-btn');
  const settingsPanel = document.getElementById('settings-panel');
  if (settingsToggleBtn && settingsPanel) {
    settingsToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      settingsPanel.classList.toggle('hidden');
    });
  }
  
  // 단계 상세 정보 닫기
  const stepDetailsClose = document.getElementById('step-details-close');
  const stepDetailsPanel = document.getElementById('step-details-panel');
  if (stepDetailsClose && stepDetailsPanel) {
    stepDetailsClose.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      stepDetailsPanel.classList.add('hidden');
      // 선택 해제
      document.querySelectorAll('.recorder-step').forEach(item => item.classList.remove('selected'));
      if (dependencies.currentEventIndex !== undefined) {
        if (typeof dependencies.currentEventIndex === 'object' && 'value' in dependencies.currentEventIndex) {
          dependencies.currentEventIndex.value = -1;
        } else {
          dependencies.currentEventIndex = -1;
        }
      }
      updateDeleteButtonState();
    });
  }
  
  // try 문 체크박스 이벤트 리스너
  const wrapInTryCheckbox = document.getElementById('wrap-in-try-checkbox');
  if (wrapInTryCheckbox) {
    wrapInTryCheckbox.addEventListener('change', (e) => {
      const currentIdx = (dependencies.currentEventIndex && typeof dependencies.currentEventIndex === 'object' && 'value' in dependencies.currentEventIndex) 
        ? dependencies.currentEventIndex.value 
        : dependencies.currentEventIndex;
      if (currentIdx >= 0 && currentIdx < dependencies.allEvents.length) {
        dependencies.allEvents[currentIdx].wrapInTry = e.target.checked;
        // 코드 재생성
        const normalizedEvents = dependencies.allEvents.map(ev => normalizeEventRecord(ev));
        const framework = (dependencies.selectedFramework && typeof dependencies.selectedFramework === 'object' && 'value' in dependencies.selectedFramework) 
          ? dependencies.selectedFramework.value 
          : dependencies.selectedFramework;
        const language = (dependencies.selectedLanguage && typeof dependencies.selectedLanguage === 'object' && 'value' in dependencies.selectedLanguage) 
          ? dependencies.selectedLanguage.value 
          : dependencies.selectedLanguage;
        const code = generateCode(normalizedEvents, manualActions, framework, language);
        setCodeText(code);
        // 코드를 TC에 실시간 저장
        if (dependencies.recording || normalizedEvents.length > 0) {
          saveCodeToTCWithDebounce(code, {
            tcIdInput: dependencies.tcIdInput,
            projectIdInput: dependencies.projectIdInput,
            selectedLanguage: language,
            selectedFramework: framework,
            electronAPI,
            initElectronAPI
          });
        }
      }
    });
  }
  
  // 패널 리사이즈 초기화
  initPanelResize();
  
  // 코드 미리보기 접기/펼치기
  const codeAreaToggle = document.getElementById('code-area-toggle');
  const codeAreaContent = document.getElementById('code-area-content');
  const codeArea = document.getElementById('code-area');
  const codeAreaHeader = codeArea?.querySelector('.code-area-header');
  
  if (codeAreaToggle && codeAreaContent && codeArea) {
    const toggleCodeArea = () => {
      codeArea.classList.toggle('collapsed');
      codeAreaToggle.classList.toggle('collapsed');
      codeAreaToggle.textContent = codeArea.classList.contains('collapsed') ? '▶' : '▼';
      
      // 접힐 때 패널 높이를 헤더만큼으로 설정 (위아래로 접기)
      if (codeArea.classList.contains('collapsed')) {
        // 헤더 높이 측정 (약간의 지연을 두어 DOM 업데이트 대기)
        setTimeout(() => {
          const header = codeArea.querySelector('.code-area-header');
          const headerHeight = header ? header.offsetHeight : 40;
          
          // 패널 높이를 헤더만큼으로 강제 설정
          codeArea.style.setProperty('height', `${headerHeight}px`, 'important');
          codeArea.style.setProperty('min-height', `${headerHeight}px`, 'important');
          codeArea.style.setProperty('max-height', `${headerHeight}px`, 'important');
          codeArea.style.setProperty('overflow', 'hidden', 'important');
        }, 10);
      } else {
        // 펼칠 때 높이 제한 해제
        codeArea.style.removeProperty('height');
        codeArea.style.removeProperty('min-height');
        codeArea.style.removeProperty('max-height');
        codeArea.style.removeProperty('overflow');
        codeArea.style.minHeight = '300px';
      }
    };
    
    // 토글 버튼 클릭
    codeAreaToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleCodeArea();
    });
    
    // 헤더 클릭도 토글 가능
    if (codeAreaHeader) {
      codeAreaHeader.addEventListener('click', (e) => {
        // 토글 버튼을 클릭한 경우는 제외
        if (!e.target.closest('.code-area-toggle')) {
          toggleCodeArea();
        }
      });
    }
  }
  
  // Replay Log 접기/펼치기
  const replayLogToggle = document.getElementById('replay-log-toggle');
  const replayLogContent = document.getElementById('replay-log-content');
  const replayLog = document.getElementById('replay-log');
  const replayLogHeader = replayLog?.querySelector('.replay-log-header');
  
  if (replayLogToggle && replayLogContent && replayLog) {
    const toggleReplayLog = () => {
      replayLog.classList.toggle('collapsed');
      replayLogContent.classList.toggle('collapsed');
      replayLogToggle.classList.toggle('collapsed');
      replayLogToggle.textContent = replayLogContent.classList.contains('collapsed') ? '▶' : '▼';
      
      // 접힐 때 패널 높이를 헤더만큼으로 설정 (위아래로 접기)
      if (replayLog.classList.contains('collapsed')) {
        // 헤더 높이 측정 (약간의 지연을 두어 DOM 업데이트 대기)
        setTimeout(() => {
          const header = replayLog.querySelector('.replay-log-header');
          const headerHeight = header ? header.offsetHeight : 50;
          
          // 패널 높이를 헤더만큼으로 강제 설정
          replayLog.style.setProperty('height', `${headerHeight}px`, 'important');
          replayLog.style.setProperty('min-height', `${headerHeight}px`, 'important');
          replayLog.style.setProperty('max-height', `${headerHeight}px`, 'important');
          replayLog.style.setProperty('overflow', 'hidden', 'important');
        }, 10);
      } else {
        // 펼칠 때 높이 제한 해제
        replayLog.style.removeProperty('height');
        replayLog.style.removeProperty('min-height');
        replayLog.style.removeProperty('max-height');
        replayLog.style.removeProperty('overflow');
        replayLog.style.minHeight = '180px';
      }
    };
    
    // 토글 버튼 클릭
    replayLogToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleReplayLog();
    });
    
    // 헤더 클릭도 토글 가능
    if (replayLogHeader) {
      replayLogHeader.addEventListener('click', (e) => {
        // 토글 버튼을 클릭한 경우는 제외
        if (!e.target.closest('.replay-log-toggle')) {
          toggleReplayLog();
        }
      });
    }
  }
  
  // Global assertion 버튼 이벤트 핸들러
  const globalAddAssertionBtn = document.getElementById('global-add-assertion-btn');
  const globalAssertionMenu = document.getElementById('global-assertion-menu');
  console.log('[Recorder] Global assertion 버튼 찾기:', {
    button: !!globalAddAssertionBtn,
    menu: !!globalAssertionMenu
  });
  
  if (globalAddAssertionBtn && globalAssertionMenu) {
    console.log('[Recorder] ✅ Global assertion 버튼 이벤트 리스너 등록');
    globalAddAssertionBtn.addEventListener('click', (e) => {
      console.log('[Recorder] Global assertion 버튼 클릭됨', e.target, e.currentTarget);
      e.preventDefault();
      e.stopPropagation();
      globalAssertionMenu.classList.toggle('hidden');
      console.log('[Recorder] Assertion 메뉴 토글:', !globalAssertionMenu.classList.contains('hidden'));
      // 다른 메뉴 닫기
      const actionMenu = document.getElementById('action-menu');
      if (actionMenu) actionMenu.classList.add('hidden');
    });
    
    // Global assertion 메뉴 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
      if (globalAddAssertionBtn && globalAssertionMenu && 
          !globalAddAssertionBtn.contains(e.target) && 
          !globalAssertionMenu.contains(e.target)) {
        globalAssertionMenu.classList.add('hidden');
      }
    });
    
    // Global assertion 타입 선택 처리
    globalAssertionMenu.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-assertion]');
      if (!button) return;
      e.preventDefault();
      e.stopPropagation();
      const assertionType = button.getAttribute('data-assertion');
      console.log('[Recorder] Assertion 타입 선택:', assertionType);
      globalAssertionMenu.classList.add('hidden');
      
      // 독립적인 assertion 추가 (맨 끝에 추가)
      handleGlobalAssertion(assertionType, {
        addVerifyAction,
        addAssertionAfterStep: dependencies.addAssertionAfterStep,
        startSimpleElementSelection: startSimpleElementSelectionWrapper
      });
    });
  } else {
    console.warn('[Recorder] Global assertion 버튼 또는 메뉴를 찾을 수 없습니다.');
  }
  
  // Global wait 버튼 이벤트 핸들러
  const globalAddWaitBtn = document.getElementById('global-add-wait-btn');
  const globalWaitMenu = document.getElementById('global-wait-menu');
  console.log('[Recorder] Global wait 버튼 찾기:', {
    button: !!globalAddWaitBtn,
    menu: !!globalWaitMenu
  });
  
  if (globalAddWaitBtn && globalWaitMenu) {
    console.log('[Recorder] ✅ Global wait 버튼 이벤트 리스너 등록');
    globalAddWaitBtn.addEventListener('click', (e) => {
      console.log('[Recorder] Global wait 버튼 클릭됨', e.target, e.currentTarget);
      e.preventDefault();
      e.stopPropagation();
      globalWaitMenu.classList.toggle('hidden');
      console.log('[Recorder] Wait 메뉴 토글:', !globalWaitMenu.classList.contains('hidden'));
      // 다른 메뉴 닫기
      const actionMenu = document.getElementById('action-menu');
      if (actionMenu) actionMenu.classList.add('hidden');
      if (globalAssertionMenu) globalAssertionMenu.classList.add('hidden');
    });
    
    // Global wait 메뉴 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
      if (globalAddWaitBtn && globalWaitMenu && 
          !globalAddWaitBtn.contains(e.target) && 
          !globalWaitMenu.contains(e.target)) {
        globalWaitMenu.classList.add('hidden');
      }
    });
    
    // Global wait 타입 선택 처리
    globalWaitMenu.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-wait]');
      if (!button) return;
      e.preventDefault();
      e.stopPropagation();
      const waitType = button.getAttribute('data-wait');
      console.log('[Recorder] Wait 타입 선택:', waitType);
      globalWaitMenu.classList.add('hidden');
      
      // 독립적인 wait 추가 (맨 끝에 추가)
      handleGlobalWait(waitType, {
        addWaitAction,
        startSimpleElementSelection: startSimpleElementSelectionWrapper,
        normalizeEventRecord,
        allEvents,
        updateCode,
        syncTimelineFromEvents,
        saveEventAsStep,
        logMessage
      });
    });
  } else {
    console.warn('[Recorder] Global wait 버튼 또는 메뉴를 찾을 수 없습니다.');
  }
  
  // Global 조건부 액션 추가 버튼 이벤트 핸들러
  const globalAddConditionalActionBtn = document.getElementById('global-add-conditional-action-btn');
  console.log('[Recorder] Global 조건부 액션 버튼 찾기:', {
    button: !!globalAddConditionalActionBtn
  });
  
  if (globalAddConditionalActionBtn) {
    console.log('[Recorder] ✅ Global 조건부 액션 버튼 이벤트 리스너 등록');
    globalAddConditionalActionBtn.addEventListener('click', (e) => {
      console.log('[Recorder] Global 조건부 액션 버튼 클릭됨');
      e.preventDefault();
      e.stopPropagation();
      // 다른 메뉴 닫기
      const actionMenu = document.getElementById('action-menu');
      if (actionMenu) actionMenu.classList.add('hidden');
      if (globalAssertionMenu) globalAssertionMenu.classList.add('hidden');
      if (globalWaitMenu) globalWaitMenu.classList.add('hidden');
      // 조건부 액션 단계별 워크플로우 시작
      startConditionalActionWorkflow(-1, null);
    });
  } else {
    console.warn('[Recorder] Global 조건부 액션 버튼을 찾을 수 없습니다.');
  }
  
  // Replay 버튼 이벤트 리스너
  const replayBtn = document.getElementById('replay-btn');
  if (replayBtn && dependencies.startReplay) {
    console.log('[Recorder] ✅ Replay 버튼 이벤트 리스너 등록');
    replayBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[Recorder] Replay 버튼 클릭됨');
      dependencies.startReplay();
    });
  } else {
    console.warn('[Recorder] Replay 버튼을 찾을 수 없거나 startReplay 함수가 없습니다.');
  }
}

