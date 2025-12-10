/**
 * TestArchitect 녹화 핵심 로직 모듈
 * WebSocket 통신, 이벤트 처리, 녹화 상태 관리
 */

// 상태는 외부에서 주입받음 (recorder.js에서 관리)
// recording, wsConnection, allEvents 등은 recorder.js에서 관리

/**
 * WebSocket 연결
 * @param {Function} logMessage - 로그 메시지 출력 함수
 * @param {Function} handleWebSocketMessageCallback - WebSocket 메시지 처리 콜백
 * @param {Object} stateRefs - 상태 참조 객체 { recording, wsConnection, startBtn, stopBtn }
 * @returns {WebSocket|null} WebSocket 연결 객체
 */
export function connectWebSocket(logMessage, handleWebSocketMessageCallback, stateRefs) {
  const { recording, wsConnection, startBtn, stopBtn } = stateRefs;
  
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    console.log('[Recorder] WebSocket이 이미 연결되어 있습니다.');
    return wsConnection;
  }

  const wsUrl = 'ws://localhost:3000';
  console.log('[Recorder] WebSocket 연결 시도:', wsUrl);

  try {
    const newConnection = new WebSocket(wsUrl);

    newConnection.onopen = () => {
      console.log('[Recorder] WebSocket 연결 성공');
      logMessage('WebSocket 연결 성공', 'success');
      
      // 연결 성공 시 Extension에 등록 메시지 전송
      newConnection.send(JSON.stringify({
        type: 'register',
        source: 'recorder-window',
        timestamp: Date.now()
      }));
    };

    newConnection.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessageCallback(message);
      } catch (error) {
        console.error('[Recorder] WebSocket 메시지 파싱 오류:', error);
        console.error('[Recorder] 원본 메시지:', event.data.substring(0, 200));
      }
    };

    newConnection.onerror = (error) => {
      console.error('[Recorder] WebSocket 오류:', error);
      logMessage('WebSocket 연결 오류', 'error');
    };

    newConnection.onclose = () => {
      console.log('[Recorder] WebSocket 연결 종료');
      // 녹화 중이면 중지
      if (stateRefs.recording) {
        stateRefs.recording = false;
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        logMessage('WebSocket 연결이 끊어져 녹화가 중지되었습니다.', 'error');
      }
      // 자동 재연결 시도 (녹화 중이 아닐 때만)
      if (!stateRefs.recording) {
        setTimeout(() => {
          connectWebSocket(logMessage, handleWebSocketMessageCallback, stateRefs);
        }, 2000);
      }
    };
    
    // 상태 업데이트
    stateRefs.wsConnection = newConnection;
    return newConnection;
  } catch (error) {
    console.error('[Recorder] WebSocket 연결 실패:', error);
    logMessage('WebSocket 연결 실패: ' + error.message, 'error');
    return null;
  }
}

/**
 * 이벤트 레코드 정규화
 * @param {Object} event - 원본 이벤트 객체
 * @returns {Object} 정규화된 이벤트 객체
 */
export function normalizeEventRecord(event) {
  if (!event || typeof event !== 'object') return event;
  if (!event.version) {
    event.version = 2;
  }
  if (!event.metadata) {
    event.metadata = { schemaVersion: event.version };
  }
  if (event.page === undefined) {
    event.page = null;
  }
  if (event.frame === undefined && event.iframeContext) {
    event.frame = { iframeContext: event.iframeContext };
  }
  if (event.wrapInTry === undefined) {
    event.wrapInTry = false;
  }
  // 조건부 액션 및 상대 노드 탐색 필드 초기화
  if (event.action === 'conditionalAction' || event.action === 'relativeAction' || event.action === 'loopAction') {
    if (event.conditionElement === undefined) {
      event.conditionElement = null;
    }
    if (event.conditionType === undefined) {
      event.conditionType = null;
    }
    if (event.conditionValue === undefined) {
      event.conditionValue = null;
    }
    if (event.targetRelation === undefined) {
      event.targetRelation = null;
    }
    if (event.targetSelector === undefined) {
      event.targetSelector = null;
    }
    if (event.actionType === undefined) {
      event.actionType = 'click';
    }
    if (event.loopMode === undefined) {
      event.loopMode = 'single';
    }
  }
  return event;
}

/**
 * 이벤트를 TC step으로 저장
 * @param {Object} event - 저장할 이벤트 객체
 * @param {string} tcId - TC ID
 * @param {string} projectId - Project ID
 * @param {Object} electronAPI - Electron API 객체
 * @param {Function} initElectronAPI - Electron API 초기화 함수
 */
export async function saveEventAsStep(event, tcId, projectId, electronAPI, initElectronAPI) {
  if (!tcId || !projectId) {
    // TC ID나 Project ID가 없으면 저장하지 않음 (조용히 무시)
    return;
  }

  // electronAPI 재확인 (동적으로 다시 확인)
  let api = electronAPI;
  if (!api) {
    if (initElectronAPI) {
      initElectronAPI();
      // initElectronAPI가 electronAPI를 반환하거나 전역 변수를 업데이트할 수 있음
      // 여기서는 파라미터로 받은 electronAPI를 사용
    }
  }

  if (!api) {
    console.warn('[Recorder] electronAPI가 없어 실시간 저장을 건너뜁니다.');
    return;
  }

  try {
    // Main 프로세스에 이벤트 전송하여 step으로 변환 및 저장
    const result = await api.invoke('save-event-step', {
      tcId: parseInt(tcId, 10),
      projectId: parseInt(projectId, 10),
      event: event
    });
    
    if (result && result.success) {
      console.log('[Recorder] ✅ 이벤트가 TC step으로 저장되었습니다:', result.stepIndex);
      
      // 부모 윈도우에 TC 새로고침 요청 (iframe 환경)
      if (window.parent !== window) {
        try {
          window.parent.postMessage({
            type: 'tc-step-updated',
            tcId: parseInt(tcId, 10)
          }, '*');
          console.log('[Recorder] 부모 윈도우에 TC 새로고침 요청 전송');
        } catch (e) {
          console.warn('[Recorder] 부모 윈도우 메시지 전송 실패:', e);
        }
      }
    } else {
      console.warn('[Recorder] ⚠️ 이벤트 저장 실패:', result?.error || '알 수 없는 오류');
    }
  } catch (error) {
    console.error('[Recorder] ❌ 이벤트 저장 중 오류:', error);
  }
}

/**
 * 이벤트로부터 타임라인 동기화
 * @param {Array} events - 이벤트 배열
 * @param {Object} options - 옵션 객체
 * @param {Object} stateRefs - 상태 참조 객체 { allEvents, currentEventIndex, timeline, selectorList }
 * @param {Function} normalizeEventRecord - 이벤트 정규화 함수
 * @param {Function} appendTimelineItem - 타임라인 아이템 추가 함수
 * @param {Function} updateStepsEmptyState - 빈 상태 메시지 업데이트 함수
 * @param {Function} showSelectorsWrapper - 셀렉터 표시 래퍼 함수
 * @param {Function} showIframe - iframe 표시 함수
 * @param {Function} updateDeleteButtonState - 삭제 버튼 상태 업데이트 함수
 * @param {Function} updateTryWrapCheckbox - try 문 체크박스 상태 업데이트 함수
 * @param {Object} aiSuggestionState - AI 제안 상태 Map
 * @param {Function} getAiStateKey - AI 상태 키 생성 함수
 * @returns {Array} 정규화된 이벤트 배열
 */
export function syncTimelineFromEvents(
  events,
  options = {},
  stateRefs,
  normalizeEventRecord,
  appendTimelineItem,
  updateStepsEmptyState,
  showSelectorsWrapper,
  showIframe,
  updateDeleteButtonState,
  updateTryWrapCheckbox,
  aiSuggestionState,
  getAiStateKey
) {
  const {
    preserveSelection = false,
    selectLast = false,
    resetAiState = false
  } = options;
  const previousIndex = preserveSelection ? stateRefs.currentEventIndex : -1;
  const normalizedEvents = Array.isArray(events)
    ? events.map((ev) => normalizeEventRecord(ev))
    : [];

  // AI 상태 관리
  const nextAiState = new Map();
  normalizedEvents.forEach((event) => {
    const key = getAiStateKey ? getAiStateKey(event) : null;
    if (!key) return;
    const existing = resetAiState ? null : (aiSuggestionState && aiSuggestionState.get(key));
    const hasCandidates = Array.isArray(event.aiSelectorCandidates) && event.aiSelectorCandidates.length > 0;
    if (existing && existing.status === 'loading') {
      nextAiState.set(key, existing);
    } else if (hasCandidates) {
      nextAiState.set(key, {
        status: 'loaded',
        error: null,
        updatedAt: event.aiSelectorsUpdatedAt || (existing && existing.updatedAt) || null
      });
    } else if (existing) {
      nextAiState.set(key, existing);
    } else {
      nextAiState.set(key, { status: 'idle', error: null });
    }
  });
  if (aiSuggestionState) {
    aiSuggestionState.clear();
    nextAiState.forEach((state, key) => aiSuggestionState.set(key, state));
  }

  // 빈 상태 메시지 업데이트
  updateStepsEmptyState();

  stateRefs.allEvents = normalizedEvents;
  if (stateRefs.timeline) {
    stateRefs.timeline.innerHTML = '';
    normalizedEvents.forEach((event, index) => {
      appendTimelineItem(event, index);
    });
    const items = stateRefs.timeline.querySelectorAll('.recorder-step');
    items.forEach((item) => item.classList.remove('selected'));
    // 빈 상태 메시지 업데이트
    updateStepsEmptyState();
  }

  let indexToSelect = -1;
  if (preserveSelection && previousIndex >= 0 && previousIndex < normalizedEvents.length) {
    indexToSelect = previousIndex;
  } else if (selectLast && normalizedEvents.length > 0) {
    indexToSelect = normalizedEvents.length - 1;
  }

  if (indexToSelect >= 0) {
    stateRefs.currentEventIndex = indexToSelect;
    const selectedItem = stateRefs.timeline
      ? stateRefs.timeline.querySelector(`[data-event-index="${indexToSelect}"]`)
      : null;
    if (selectedItem) {
      selectedItem.classList.add('selected');
    }
    const selectedEvent = normalizedEvents[indexToSelect];
    showSelectorsWrapper(selectedEvent.selectorCandidates || [], selectedEvent, indexToSelect);
    showIframe(selectedEvent.iframeContext);
    
    // Step Details 패널 표시
    const stepDetailsPanel = document.getElementById('step-details-panel');
    if (stepDetailsPanel) {
      stepDetailsPanel.classList.remove('hidden');
    }
    
    // try 문 체크박스 상태 업데이트
    updateTryWrapCheckbox(selectedEvent);
  } else {
    stateRefs.currentEventIndex = -1;
    if (stateRefs.selectorList) {
      stateRefs.selectorList.innerHTML = '';
    }
    showIframe(null);
    
    // Step Details 패널 숨기기
    const stepDetailsPanel = document.getElementById('step-details-panel');
    if (stepDetailsPanel) {
      stepDetailsPanel.classList.add('hidden');
    }
    // try 문 체크박스 초기화
    updateTryWrapCheckbox(null);
  }

  updateDeleteButtonState();
  return normalizedEvents;
}

/**
 * 녹화 시작
 * @param {Object} stateRefs - 상태 참조 객체 { recording, allEvents, currentEventIndex, wsConnection, startBtn, stopBtn, timeline, selectorList, logEntries }
 * @param {Function} logMessage - 로그 메시지 출력 함수
 * @param {Function} connectWebSocket - WebSocket 연결 함수
 * @param {Function} setCodeText - 코드 텍스트 설정 함수
 * @param {Function} updateDeleteButtonState - 삭제 버튼 상태 업데이트 함수
 * @param {Function} updateStepsEmptyState - 빈 상태 메시지 업데이트 함수
 * @param {string} tcId - TC ID
 * @param {string} projectId - Project ID
 * @param {Object} electronAPI - Electron API 객체
 * @param {Function} initElectronAPI - Electron API 초기화 함수
 */
export async function startRecording(
  stateRefs,
  logMessage,
  connectWebSocket,
  setCodeText,
  updateDeleteButtonState,
  updateStepsEmptyState,
  tcId,
  projectId,
  electronAPI,
  initElectronAPI
) {
  if (stateRefs.recording) {
    console.log('[Recorder-Core] 이미 녹화 중이므로 반환');
    return;
  }

  // TC ID가 있을 때 steps 초기화/추가 선택
  if (tcId) {
    // electronAPI 재확인
    let api = electronAPI;
    if (!api && initElectronAPI) {
      initElectronAPI();
      // initElectronAPI가 electronAPI를 업데이트할 수 있음
    }
    
    if (api) {
      try {
        // TC 정보 조회하여 실제로 steps가 있는지 확인
        const tcResponse = await api.invoke('api-get-test-case', parseInt(tcId, 10));
        
        if (tcResponse && tcResponse.success && tcResponse.data) {
          const tc = tcResponse.data;
          let steps = [];
          
          // steps 파싱
          if (tc.steps) {
            try {
              steps = typeof tc.steps === 'string' ? JSON.parse(tc.steps) : tc.steps;
            } catch (e) {
              steps = [];
            }
          }
          
          // steps가 실제로 있는 경우에만 확인 팝업 표시
          if (Array.isArray(steps) && steps.length > 0) {
            const choice = await new Promise((resolve) => {
              const shouldClear = confirm(
                'TC에 기존 steps가 있습니다.\n\n' +
                '확인: 기존 steps를 초기화하고 새로 시작\n' +
                '취소: 기존 steps 뒤에 추가하여 이어서 녹화'
              );
              resolve(shouldClear);
            });

            if (choice) {
              // 기존 steps 초기화
              const result = await api.invoke('clear-tc-steps', parseInt(tcId, 10));
              if (result && result.success) {
                console.log('[Recorder] ✅ TC steps 초기화 완료');
                logMessage('TC steps 초기화 완료', 'info');
              } else {
                console.warn('[Recorder] ⚠️ TC steps 초기화 실패:', result?.error);
                logMessage('TC steps 초기화 실패: ' + (result?.error || '알 수 없는 오류'), 'error');
              }
            } else {
              console.log('[Recorder] 기존 steps 유지하고 이어서 녹화');
              logMessage('기존 steps 뒤에 추가하여 녹화', 'info');
            }
          } else {
            console.log('[Recorder] TC에 기존 steps가 없음 - 바로 녹화 시작');
          }
        } else {
          console.warn('[Recorder] ⚠️ TC 정보 조회 실패:', tcResponse?.error);
        }
      } catch (error) {
        console.error('[Recorder] ❌ TC steps 확인 중 오류:', error);
        // 오류가 발생해도 녹화는 계속 진행
      }
    }
  }

  stateRefs.recording = true;
  stateRefs.allEvents = [];
  stateRefs.currentEventIndex = -1;

  if (stateRefs.startBtn) stateRefs.startBtn.disabled = true;
  if (stateRefs.stopBtn) stateRefs.stopBtn.disabled = false;
  if (stateRefs.timeline) stateRefs.timeline.innerHTML = '';
  if (stateRefs.selectorList) stateRefs.selectorList.innerHTML = '';
  if (stateRefs.logEntries) stateRefs.logEntries.innerHTML = '';

  setCodeText('');
  updateDeleteButtonState();
  
  // 빈 상태 메시지 표시
  updateStepsEmptyState();

  // WebSocket 연결 확인 (startRecording()에서 이미 연결했으므로 여기서는 확인만)
  if (!stateRefs.wsConnection || stateRefs.wsConnection.readyState !== WebSocket.OPEN) {
    console.warn('[Recorder] WebSocket이 연결되지 않았습니다. 녹화를 시작할 수 없습니다.');
    logMessage('WebSocket 연결이 필요합니다. 브라우저를 먼저 열어주세요.', 'error');
    stateRefs.recording = false;
    if (stateRefs.startBtn) stateRefs.startBtn.disabled = false;
    if (stateRefs.stopBtn) stateRefs.stopBtn.disabled = true;
    return;
  }
  
  // WebSocket으로 녹화 시작 신호 전송
  try {
    if (stateRefs.wsConnection && stateRefs.wsConnection.readyState === WebSocket.OPEN) {
      stateRefs.wsConnection.send(JSON.stringify({
        type: 'recording-start',
        tcId: tcId ? parseInt(tcId, 10) : null,
        projectId: projectId ? parseInt(projectId, 10) : null,
        timestamp: Date.now()
      }));
      console.log('[Recorder] WebSocket으로 녹화 시작 신호 전송');
    } else {
      console.warn('[Recorder] WebSocket이 연결되지 않아 녹화 시작 신호를 전송할 수 없습니다.');
    }
    
    // iframe 환경에서는 부모 윈도우로도 녹화 시작 신호 전송
    if (typeof window !== 'undefined' && window.parent !== window) {
      try {
        window.parent.postMessage({
          type: 'recording-start',
          tcId: tcId ? parseInt(tcId, 10) : null,
          projectId: projectId ? parseInt(projectId, 10) : null,
          timestamp: Date.now()
        }, '*');
        console.log('[Recorder] 부모 윈도우로 녹화 시작 신호 전송 (postMessage)');
      } catch (e) {
        console.warn('[Recorder] 부모 윈도우 메시지 전송 실패:', e);
      }
    }
  } catch (error) {
    console.error('[Recorder] WebSocket 메시지 전송 실패:', error);
    logMessage('녹화 시작 신호 전송 실패: ' + error.message, 'error');
    stateRefs.recording = false;
    if (stateRefs.startBtn) stateRefs.startBtn.disabled = false;
    if (stateRefs.stopBtn) stateRefs.stopBtn.disabled = true;
    return;
  }

  logMessage('녹화 시작', 'success');
}

/**
 * 녹화 중지
 * @param {Object} stateRefs - 상태 참조 객체 { recording, wsConnection, startBtn, stopBtn }
 * @param {Function} logMessage - 로그 메시지 출력 함수
 * @param {Function} updateCode - 코드 업데이트 함수
 */
export async function stopRecording(stateRefs, logMessage, updateCode) {
  if (!stateRefs.recording) return;

  // 녹화 중지 전에 코드 저장을 위해 recording 상태를 유지한 채로 updateCode 호출
  // updateCode 내부에서 코드 저장 후 recording을 false로 설정
  const wasRecording = stateRefs.recording;
  
  if (stateRefs.startBtn) stateRefs.startBtn.disabled = false;
  if (stateRefs.stopBtn) stateRefs.stopBtn.disabled = true;

  // WebSocket으로 녹화 중지 신호 전송
  if (stateRefs.wsConnection && stateRefs.wsConnection.readyState === WebSocket.OPEN) {
    stateRefs.wsConnection.send(JSON.stringify({
      type: 'recording-stop',
      timestamp: Date.now()
    }));
    console.log('[Recorder] WebSocket으로 녹화 중지 신호 전송');
  }

  // 코드 저장 (updateCode 내부에서 처리)
  if (wasRecording && updateCode) {
    await updateCode();
  }

  // 코드 저장 후 recording 상태 변경
  stateRefs.recording = false;
  
  logMessage('녹화 중지', 'info');
}
