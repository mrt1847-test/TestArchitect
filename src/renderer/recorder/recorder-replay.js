/**
 * 리플레이 기능 모듈
 * 녹화된 이벤트를 재생하는 기능을 담당
 */

// 리플레이 상수
export const STEP_DELAY_MS = 150;
export const NAVIGATION_RECOVERY_DELAY_MS = 800;
export const DOM_COMPLETE_DELAY_MS = 250;
export const MAX_NAVIGATION_WAIT_MS = 15000;

// 리플레이 상태 관리
export let replayState = {
  running: false,
  events: [],
  index: 0,
  sessionId: null,
  pending: false,
  awaitingNavigation: false,
  awaitingContent: false,
  navigationGuard: null,
  scheduledTimer: null
};

/**
 * 리플레이 상태 초기화
 */
export function resetReplayState() {
  if (replayState.navigationGuard) {
    clearTimeout(replayState.navigationGuard);
  }
  if (replayState.scheduledTimer) {
    clearTimeout(replayState.scheduledTimer);
  }
  replayState = {
    running: false,
    events: [],
    index: 0,
    sessionId: null,
    pending: false,
    awaitingNavigation: false,
    awaitingContent: false,
    navigationGuard: null,
    scheduledTimer: null
  };
}

/**
 * 다음 스텝 스케줄링
 */
export function scheduleNextStep(delayMs, sendReplayStepFn) {
  if (!replayState.running) return;
  if (replayState.scheduledTimer) {
    clearTimeout(replayState.scheduledTimer);
  }
  replayState.scheduledTimer = setTimeout(() => {
    replayState.scheduledTimer = null;
    if (sendReplayStepFn) {
      sendReplayStepFn();
    }
  }, Math.max(0, delayMs || 0));
}

/**
 * 리플레이 완료
 */
export function finishReplay(logMessageFn) {
  const wasRunning = replayState.running;
  resetReplayState();
  if (wasRunning && logMessageFn) {
    logMessageFn('✓ 리플레이 완료', 'success');
  }
}

/**
 * 리플레이 중단
 */
export function abortReplay(reason, logMessageFn) {
  const message = reason || '알 수 없는 오류로 리플레이가 중단되었습니다.';
  if (logMessageFn) {
    logMessageFn(`✗ 리플레이 종료 - ${message}`, 'error');
  }
  resetReplayState();
}

/**
 * 리플레이 스텝 전송
 */
export function sendReplayStep(wsConnection, onFinish, onAbort, onScheduleNext) {
  if (!replayState.running) return;
  if (replayState.pending) return;
  if (replayState.index >= replayState.events.length) {
    if (onFinish) onFinish();
    return;
  }
  
  const currentEvent = replayState.events[replayState.index];
  if (!replayState.sessionId) {
    if (onAbort) onAbort('대상 세션을 찾을 수 없습니다.');
    return;
  }
  
  replayState.pending = true;
  if (replayState.navigationGuard) {
    clearTimeout(replayState.navigationGuard);
    replayState.navigationGuard = null;
  }
  
  // WebSocket을 통해 Content Script에 리플레이 스텝 전송
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify({
      type: 'replay-execute-step',
      sessionId: replayState.sessionId,
      event: currentEvent,
      index: replayState.index,
      total: replayState.events.length,
      timeoutMs: 10000
    }));
    
    // 타임아웃 설정 (응답이 없으면 다음 스텝으로 진행)
    setTimeout(() => {
      if (replayState.pending && replayState.running) {
        replayState.pending = false;
        replayState.index++;
        if (replayState.index >= replayState.events.length) {
          if (onFinish) onFinish();
        } else {
          if (onScheduleNext) onScheduleNext(STEP_DELAY_MS);
        }
      }
    }, 10000);
  } else {
    if (onAbort) onAbort('WebSocket 연결이 끊어졌습니다.');
  }
}

/**
 * 리플레이 스텝 결과 처리
 */
export function handleReplayStepResult(msg, onFinish, onAbort, onScheduleNext) {
  if (!replayState.running) return;
  const expectedIndex = replayState.index;
  const msgIndex = msg.stepIndex !== undefined ? msg.stepIndex : (msg.step !== undefined ? (msg.step - 1) : expectedIndex);

  if (msgIndex !== expectedIndex) {
    // 다른 스텝의 응답이면 무시
    return;
  }

  replayState.pending = false;

  if (!msg.ok) {
    if (onAbort) {
      onAbort(msg.reason || 'step failed');
    }
    return;
  }

  replayState.index = msgIndex + 1;

  if (replayState.index >= replayState.events.length) {
    if (onFinish) onFinish();
    return;
  }

  if (msg.navigation) {
    replayState.awaitingNavigation = true;
    replayState.awaitingContent = true;
    if (replayState.navigationGuard) {
      clearTimeout(replayState.navigationGuard);
    }
    replayState.navigationGuard = setTimeout(() => {
      replayState.navigationGuard = null;
      if (onAbort) {
        onAbort('페이지 로딩이 너무 오래 걸립니다.');
      }
    }, MAX_NAVIGATION_WAIT_MS);
    return;
  }

  if (onScheduleNext) {
    onScheduleNext(STEP_DELAY_MS);
  }
}

/**
 * 액션 타임라인 빌드
 */
export function buildActionTimeline(events, manualList, normalizeEventRecordFn) {
  const timeline = [];
  let sequence = 0;
  let maxEventTimestamp = 0;
  
  if (Array.isArray(events)) {
    events.forEach((event) => {
      const normalizedEvent = normalizeEventRecordFn ? normalizeEventRecordFn(event) : event;
      const timestamp = typeof normalizedEvent.timestamp === 'number' ? normalizedEvent.timestamp : 0;
      if (timestamp > maxEventTimestamp) {
        maxEventTimestamp = timestamp;
      }
      timeline.push({
        kind: 'event',
        time: timestamp,
        event: normalizedEvent,
        sequence: sequence++
      });
    });
  }
  
  if (Array.isArray(manualList)) {
    manualList.forEach((action) => {
      if (!action || typeof action !== 'object') return;
      const actionTime = typeof action.createdAt === 'number' ? action.createdAt : maxEventTimestamp + (sequence * 100);
      timeline.push({
        kind: 'manual',
        time: actionTime,
        action: action,
        sequence: sequence++
      });
    });
  }
  
  timeline.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return a.sequence - b.sequence;
  });
  
  return timeline;
}

/**
 * 수동 액션을 이벤트로 변환
 */
export function convertManualActionToEvent(action) {
  if (!action || typeof action !== 'object') return null;
  return {
    action: action.actionType || 'click',
    target: action.path && action.path.length > 0 ? action.path[action.path.length - 1] : null,
    value: action.value || null,
    timestamp: action.createdAt || Date.now(),
    manual: true
  };
}

/**
 * 리플레이 큐 빌드
 */
export function buildReplayQueue(events, manualList, normalizeEventRecordFn) {
  const timeline = buildActionTimeline(events, manualList, normalizeEventRecordFn);
  const queue = [];
  timeline.forEach((entry) => {
    if (entry.kind === 'event' && entry.event) {
      queue.push(entry.event);
    } else if (entry.kind === 'manual' && entry.action) {
      const manualEvent = convertManualActionToEvent(entry.action);
      if (manualEvent) {
        queue.push(manualEvent);
      }
    }
  });
  return queue;
}

/**
 * 리플레이 시작
 */
export function startReplay(allEvents, manualActions, normalizeEventRecordFn, wsConnection, logMessageFn) {
  if (replayState.running) {
    alert('리플레이가 이미 진행 중입니다. 잠시 후 다시 시도하세요.');
    return;
  }
  
  const replayQueue = buildReplayQueue(allEvents, manualActions, normalizeEventRecordFn);
  const normalizedQueue = replayQueue.map((item) => 
    normalizeEventRecordFn ? normalizeEventRecordFn(item) : item
  );
  
  if (normalizedQueue.length === 0) {
    alert('재생할 이벤트가 없습니다.');
    return;
  }

  // 테스트 URL 가져오기
  const testUrlInput = document.getElementById('test-url');
  const startUrl = testUrlInput ? testUrlInput.value.trim() : '';
  
  if (!startUrl) {
    alert('테스트 URL을 입력하세요.');
    return;
  }

  // 로그 초기화
  const logEntries = document.getElementById('log-entries');
  if (logEntries) {
    logEntries.innerHTML = '';
  }
  if (logMessageFn) {
    logMessageFn(`리플레이 시작 준비 중… (총 ${normalizedQueue.length}개 스텝)`, 'info');
  }

  // WebSocket 연결 확인
  if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
    alert('WebSocket 연결이 필요합니다. 먼저 녹화를 시작하세요.');
    return;
  }

  // 세션 ID 생성
  const sessionId = `replay-${Date.now()}`;
  
  // 리플레이 상태 초기화
  resetReplayState();
  replayState.running = true;
  replayState.events = normalizedQueue;
  replayState.index = 0;
  replayState.sessionId = sessionId;
  replayState.pending = false;
  replayState.awaitingNavigation = false;
  replayState.awaitingContent = false;

  // 리플레이 시작 메시지 전송
  wsConnection.send(JSON.stringify({
    type: 'replay-start',
    sessionId: sessionId,
    url: startUrl,
    events: normalizedQueue
  }));

  return true; // 성공
}
