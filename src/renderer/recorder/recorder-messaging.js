/**
 * IPC 및 메시징 모듈
 * Electron IPC와 PostMessage 통신 처리
 */

/**
 * IPC 이벤트 리스너 설정 (Electron 환경)
 * @param {Object} dependencies - 의존성 객체
 */
export function setupIpcListeners(dependencies) {
  const {
    electronAPI,
    tcIdInput,
    projectIdInput,
    recording,
    logMessage,
    handleDomEvent,
    startRecording,
    stopRecording,
    handleElementHover,
    clearElementHover,
    simpleSelectionState,
    elementStatusEl,
    handleSimpleElementSelectionPicked,
    handleElementSelectionPicked,
    cancelSimpleElementSelection,
    handleElementSelectionError,
    handleElementSelectionCancelled
  } = dependencies;

  if (!electronAPI || !electronAPI.onIpcMessage) {
    console.warn('[Recorder] electronAPI.onIpcMessage가 없습니다. Electron 환경이 아닐 수 있습니다.');
    console.warn('[Recorder] electronAPI 상태:', {
      exists: !!electronAPI,
      hasOnIpcMessage: !!(electronAPI && electronAPI.onIpcMessage)
    });
    return;
  }
  
  console.log('[Recorder] IPC 리스너 설정 시작');
  
  // 녹화 윈도우 초기화 (Main 프로세스에서 전송)
  electronAPI.onIpcMessage('recorder-init', (data) => {
    console.log('[Recorder] 녹화 윈도우 초기화:', data);
    if (data.tcId && tcIdInput) {
      tcIdInput.value = data.tcId;
    }
    if (data.projectId && projectIdInput) {
      projectIdInput.value = data.projectId;
    }
    // sessionId는 나중에 사용할 수 있음
    logMessage('녹화 준비 완료', 'success');
  });
  
  // Main 프로세스에서 전송된 DOM 이벤트 수신
  // 주의: iframe 환경에서는 postMessage로도 받으므로 중복 방지를 위해 IPC는 무시
  // WebSocket과 postMessage만 사용 (iframe 환경)
  if (window.parent !== window) {
    // iframe 환경: IPC는 무시하고 postMessage만 사용
    console.log('[Recorder] iframe 환경 감지: IPC dom-event 리스너 등록 안 함 (postMessage 사용)');
  } else {
    // 별도 윈도우 환경: IPC 사용
    electronAPI.onIpcMessage('dom-event', (data) => {
      console.log('[Recorder] IPC로 DOM 이벤트 수신:', data.action, 'recording 상태:', recording);
      if (!recording) {
        console.warn('[Recorder] 녹화 중이 아니므로 이벤트 무시');
        return;
      }
      handleDomEvent(data);
    });
  }
  
  // 녹화 시작 신호 수신 (Main 프로세스에서)
  electronAPI.onIpcMessage('recording-start', (data) => {
    console.log('[Recorder] IPC로 녹화 시작 신호 수신', data);
    if (!recording) {
      console.log('[Recorder] startRecording() 호출');
      startRecording();
    } else {
      console.log('[Recorder] 이미 녹화 중입니다');
    }
  });
  
  // 녹화 중지 신호 수신 (Main 프로세스에서)
  electronAPI.onIpcMessage('recording-stop', (data) => {
    console.log('[Recorder] IPC로 녹화 중지 신호 수신', data);
    if (recording) {
      console.log('[Recorder] stopRecording() 호출');
      stopRecording();
    } else {
      console.log('[Recorder] 이미 녹화 중지 상태입니다');
    }
  });
  
  // 요소 하이라이트 정보 수신
  electronAPI.onIpcMessage('element-hover', (data) => {
    console.log('[Recorder] IPC로 요소 하이라이트 수신:', data.element?.tag);
    handleElementHover(data);
  });
  
  // 요소 하이라이트 해제
  electronAPI.onIpcMessage('element-hover-clear', (data) => {
    console.log('[Recorder] IPC로 요소 하이라이트 해제');
    clearElementHover();
  });
  
  // 요소 선택 결과 수신 (IPC)
  electronAPI.onIpcMessage('element-selection-result', (data) => {
    console.log('[Recorder] IPC로 요소 선택 결과 수신:', data.type);
    if (data.type === 'ELEMENT_SELECTION_PICKED') {
      // 심플 요소 선택이 활성화되어 있으면 심플 처리, 아니면 기존 처리
      console.log('[Recorder] ELEMENT_SELECTION_PICKED 수신 (IPC), simpleSelectionState.active:', simpleSelectionState.active);
      if (simpleSelectionState.active) {
        handleSimpleElementSelectionPicked(data);
      } else {
        console.log('[Recorder] simpleSelectionState.active가 false이므로 handleElementSelectionPicked 호출');
        handleElementSelectionPicked(data);
      }
    } else if (data.type === 'ELEMENT_SELECTION_ERROR') {
      if (simpleSelectionState.active) {
        cancelSimpleElementSelection();
        if (elementStatusEl) {
          const reason = data.reason || '요소를 선택할 수 없습니다.';
          elementStatusEl.textContent = reason;
          elementStatusEl.className = 'element-status error';
        }
      } else {
        handleElementSelectionError(data);
      }
    } else if (data.type === 'ELEMENT_SELECTION_CANCELLED' || data.type === 'ELEMENT_SELECTION_CANCEL') {
      console.log('[Recorder] ELEMENT_SELECTION_CANCEL 수신, 상태 초기화');
      if (simpleSelectionState.active) {
        cancelSimpleElementSelection();
      } else {
        // active가 false여도 상태를 확실히 초기화
        simpleSelectionState.active = false;
        simpleSelectionState.callback = null;
        simpleSelectionState.pendingAction = null;
        simpleSelectionState.pendingStepIndex = null;
        handleElementSelectionCancelled();
      }
    }
  });
  
  console.log('[Recorder] IPC 리스너 설정 완료');
}

/**
 * PostMessage 이벤트 리스너 설정
 * @param {Object} dependencies - 의존성 객체
 */
export function setupPostMessageListeners(dependencies) {
  const {
    tcIdInput,
    projectIdInput,
    recording,
    logMessage,
    handleDomEvent,
    startRecording,
    stopRecording,
    handleElementHover,
    clearElementHover,
    simpleSelectionState,
    elementStatusEl,
    handleSimpleElementSelectionPicked,
    handleElementSelectionPicked,
    cancelSimpleElementSelection,
    handleElementSelectionError,
    handleElementSelectionCancelled,
    trySaveDomSnapshot,
    wsConnection
  } = dependencies;

  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;
    
    switch (event.data.type) {
      case 'recorder-init':
        console.log('[Recorder] 부모 윈도우로부터 초기화 메시지 수신:', event.data);
        if (event.data.tcId && tcIdInput) {
          tcIdInput.value = event.data.tcId;
        }
        if (event.data.projectId && projectIdInput) {
          projectIdInput.value = event.data.projectId;
        }
        logMessage('녹화 준비 완료', 'success');
        break;
        
      case 'dom-event':
        // postMessage로 받은 이벤트는 이미 WebSocket이나 IPC로 처리되었을 수 있으므로
        // iframe 환경에서만 처리 (별도 윈도우에서는 WebSocket/IPC 사용)
        if (window.parent !== window) {
          console.log('[Recorder] 부모 윈도우로부터 DOM 이벤트 수신 (postMessage):', event.data.event?.action);
          if (event.data.event) {
            handleDomEvent(event.data.event);
          }
        } else {
          console.log('[Recorder] postMessage dom-event 무시 (별도 윈도우에서는 WebSocket/IPC 사용)');
        }
        break;
        
      case 'recording-start':
        console.log('[Recorder] 부모 윈도우로부터 녹화 시작 신호 수신');
        if (!recording) {
          startRecording();
        }
        break;
        
      case 'recording-stop':
        console.log('[Recorder] 부모 윈도우로부터 녹화 중지 신호 수신');
        if (recording) {
          stopRecording();
        }
        break;
        
      case 'element-hover':
        console.log('[Recorder] 부모 윈도우로부터 요소 하이라이트 수신');
        if (event.data.data) {
          handleElementHover(event.data.data);
        }
        break;
        
      case 'element-hover-clear':
        console.log('[Recorder] 부모 윈도우로부터 요소 하이라이트 해제');
        clearElementHover();
        break;
        
      case 'element-selection-result':
        // 요소 선택 결과 수신 (IPC를 통해 전달됨)
        console.log('[Recorder] 요소 선택 결과 수신 (postMessage):', event.data.type);
        const selectionResult = event.data;
        if (selectionResult.type === 'ELEMENT_SELECTION_PICKED') {
          // 심플 요소 선택이 활성화되어 있으면 심플 처리, 아니면 기존 처리
          if (simpleSelectionState.active) {
            handleSimpleElementSelectionPicked(selectionResult);
          } else {
            handleElementSelectionPicked(selectionResult);
          }
        } else if (selectionResult.type === 'ELEMENT_SELECTION_ERROR') {
          if (simpleSelectionState.active) {
            cancelSimpleElementSelection();
            if (elementStatusEl) {
              const reason = selectionResult.reason || '요소를 선택할 수 없습니다.';
              elementStatusEl.textContent = reason;
              elementStatusEl.className = 'element-status error';
            }
          } else {
            handleElementSelectionError(selectionResult);
          }
        } else if (selectionResult.type === 'ELEMENT_SELECTION_CANCELLED') {
          if (simpleSelectionState.active) {
            cancelSimpleElementSelection();
          } else {
            handleElementSelectionCancelled();
          }
        }
        break;
        
      case 'url-changed':
        // URL 변경 감지 (페이지 전환)
        console.log('[Recorder] ========== URL 변경 감지 (postMessage) ==========');
        console.log('[Recorder] URL 변경 정보:', {
          url: event.data.url,
          previousUrl: event.data.previousUrl || 'N/A',
          tabId: event.data.tabId || 'N/A',
          timestamp: event.data.timestamp || Date.now()
        });
        console.log('[Recorder] 현재 녹화 상태:', recording ? '녹화 중' : '녹화 중지');
        console.log('[Recorder] WebSocket 연결 상태:', wsConnection ? {
          readyState: wsConnection.readyState,
          url: wsConnection.url
        } : '연결 없음');
        
        // 녹화 중인 경우에만 처리
        if (recording) {
          logMessage(`페이지 전환: ${event.data.url}`, 'info');
          
          // DOM 스냅샷 저장 시도
          trySaveDomSnapshot(event.data.url);
          
          console.log('[Recorder] ✅ URL 변경 처리 완료 (녹화 상태 유지)');
          console.log('[Recorder] ⚠️ 주의: Content Script가 새 페이지에서 이벤트 리스너를 재등록해야 합니다');
          console.log('[Recorder] ⚠️ Background Script가 Content Script에 RECORDING_START 메시지를 다시 보내야 합니다');
        } else {
          console.log('[Recorder] ⚠️ URL 변경 감지되었지만 녹화 중이 아니므로 무시');
        }
        console.log('[Recorder] ============================================');
        break;
        
      default:
        break;
    }
  });
}

/**
 * WebSocket 메시지 처리
 * @param {Object} message - WebSocket 메시지
 * @param {Object} dependencies - 의존성 객체
 */
export function handleWebSocketMessage(message, dependencies) {
  const {
    recording,
    logMessage,
    handleDomEvent,
    startRecording,
    stopRecording,
    handleElementHover,
    clearElementHover,
    trySaveDomSnapshot,
    simpleSelectionState,
    elementStatusEl,
    handleSimpleElementSelectionPicked,
    handleElementSelectionPicked,
    cancelSimpleElementSelection,
    handleElementSelectionError,
    handleElementSelectionCancelled,
    wsConnection,
    finishReplay,
    abortReplay,
    scheduleReplayNextStep,
    sendReplayStep,
    handleReplayStepResult
  } = dependencies;

  // 디버깅: 메시지 타입이 없거나 예상과 다를 때 로그 출력
  if (!message || !message.type) {
    console.log('[Recorder] WebSocket 메시지 타입 없음, 전체 메시지:', message);
    return;
  }
  
  switch (message.type) {
    case 'connected':
      console.log('[Recorder] 서버 연결 확인:', message.message);
      break;
      
    case 'registered':
      // 등록 확인 메시지 (무시하거나 로그만 출력)
      console.log('[Recorder] 등록 확인:', message.message || '등록 완료');
      break;

    case 'dom-event':
      // Content Script에서 전송된 DOM 이벤트
      // iframe 환경에서는 postMessage로도 받으므로 WebSocket은 무시
      // 별도 윈도우 환경에서만 WebSocket 사용
      console.log('[Recorder] 📨 DOM 이벤트 수신 (WebSocket):', {
        action: message.event?.action || message.action,
        timestamp: message.timestamp || Date.now(),
        sessionId: message.sessionId || 'N/A',
        url: message.event?.page?.url || 'N/A',
        isIframe: window.parent !== window
      });
      
      if (window.parent === window) {
        // 별도 윈도우: WebSocket 사용
        console.log('[Recorder] ✅ 별도 윈도우 환경 - DOM 이벤트 처리');
        const eventData = message.event || message;
        handleDomEvent(eventData);
      } else {
        // iframe 환경: WebSocket 무시 (postMessage 사용)
        console.log('[Recorder] ⚠️ iframe 환경 - WebSocket dom-event 무시 (postMessage 사용)');
      }
      break;

    case 'element-hover':
      // 요소 하이라이트 정보
      handleElementHover(message);
      break;

    case 'element-hover-clear':
      // 요소 하이라이트 해제
      clearElementHover();
      break;

    case 'recording-start':
      if (!recording) {
        startRecording();
      }
      break;

    case 'recording-stop':
      if (recording) {
        stopRecording();
      }
      break;

    case 'url-changed':
    case 'page-navigated':
      // URL 변경 감지 (페이지 전환)
      console.log('[Recorder] URL 변경 감지:', message.url);
      
      // 녹화 중인 경우에만 처리
      if (recording) {
        logMessage(`페이지 전환: ${message.url}`, 'info');
        
        // DOM 스냅샷 저장 시도
        trySaveDomSnapshot(message.url);
        
        console.log('[Recorder] URL 변경 처리 완료 (녹화 상태 유지)');
      } else {
        console.log('[Recorder] URL 변경 감지되었지만 녹화 중이 아니므로 무시');
      }
      break;

    case 'replay-step-result':
      // 리플레이 스텝 결과 처리
      const sendReplayStepWrapper = () => {
        sendReplayStep(
          wsConnection,
          () => finishReplay(logMessage),
          (reason) => abortReplay(reason, logMessage),
          (delayMs) => scheduleReplayNextStep(delayMs, sendReplayStepWrapper)
        );
      };
      handleReplayStepResult(
        message,
        () => finishReplay(logMessage),
        (reason) => abortReplay(reason, logMessage),
        (delayMs) => scheduleReplayNextStep(delayMs, sendReplayStepWrapper)
      );
      break;

    case 'ELEMENT_SELECTION_START':
      // 요소 선택 모드 시작 (확인용 로그만 출력, 실제 처리는 Content Script에서 함)
      console.log('[Recorder] 요소 선택 모드 시작 메시지 수신');
      break;

    case 'ELEMENT_SELECTION_PICKED':
      // 요소 선택 완료
      // 심플 요소 선택이 활성화되어 있으면 심플 처리, 아니면 기존 처리
      console.log('[Recorder] ELEMENT_SELECTION_PICKED 수신 (WebSocket), simpleSelectionState.active:', simpleSelectionState.active);
      if (simpleSelectionState.active) {
        handleSimpleElementSelectionPicked(message);
      } else {
        console.log('[Recorder] simpleSelectionState.active가 false이므로 handleElementSelectionPicked 호출');
        handleElementSelectionPicked(message);
      }
      break;

    case 'ELEMENT_SELECTION_ERROR':
      // 요소 선택 오류
      if (simpleSelectionState.active) {
        cancelSimpleElementSelection();
        if (elementStatusEl) {
          const reason = message && message.reason ? message.reason : '요소를 선택할 수 없습니다.';
          elementStatusEl.textContent = reason;
          elementStatusEl.className = 'element-status error';
        }
      } else {
        handleElementSelectionError(message);
      }
      break;

    case 'ELEMENT_SELECTION_CANCELLED':
    case 'ELEMENT_SELECTION_CANCEL':
      // 요소 선택 취소
      if (simpleSelectionState.active) {
        cancelSimpleElementSelection();
      } else {
        handleElementSelectionCancelled();
      }
      break;

    case 'error':
      // 에러 메시지 처리
      console.error('[Recorder] WebSocket 에러 메시지:', message.message || message.error || message);
      break;
      
    default:
      console.log('[Recorder] 알 수 없는 메시지 타입:', message.type);
  }
}

