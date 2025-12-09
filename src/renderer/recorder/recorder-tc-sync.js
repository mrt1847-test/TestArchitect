/**
 * TC 동기화 모듈
 * Test Case와의 코드 및 이벤트 동기화 기능
 */

// 코드 저장 debounce 타이머
let codeSaveTimer = null;
const CODE_SAVE_DELAY = 1000; // 1초 지연

/**
 * 코드를 TC script로 실시간 저장
 * @param {string} code - 저장할 코드
 * @param {Object} dependencies - 의존성 객체
 * @param {HTMLElement} tcIdInput - TC ID 입력 필드
 * @param {HTMLElement} projectIdInput - Project ID 입력 필드
 * @param {string} selectedLanguage - 선택된 언어
 * @param {string} selectedFramework - 선택된 프레임워크
 * @param {Object} electronAPI - Electron API 객체
 * @param {Function} initElectronAPI - Electron API 초기화 함수
 */
export async function saveCodeToTC(code, dependencies) {
  const {
    tcIdInput,
    projectIdInput,
    selectedLanguage,
    selectedFramework,
    electronAPI,
    initElectronAPI
  } = dependencies;

  // TC ID와 Project ID 확인
  const tcId = tcIdInput?.value;
  const projectId = projectIdInput?.value;
  
  if (!tcId || !projectId) {
    // TC ID나 Project ID가 없으면 저장하지 않음 (조용히 무시)
    return;
  }
  
  if (!code || !code.trim()) {
    // 코드가 없으면 저장하지 않음
    return;
  }
  
  // electronAPI 재확인
  let api = electronAPI;
  if (!api) {
    if (initElectronAPI) {
      initElectronAPI();
      // initElectronAPI가 electronAPI를 반환하거나 전역 변수를 설정한다고 가정
      // 실제 구현에 따라 조정 필요
    }
    api = electronAPI;
  }
  
  if (!api) {
    console.warn('[Recorder] electronAPI가 없어 코드 저장을 건너뜁니다.');
    return;
  }
  
  try {
    // 기존 스크립트 확인
    const scriptsResponse = await api.invoke('api-get-scripts', {
      test_case_id: parseInt(tcId, 10)
    });
    
    if (!scriptsResponse || !scriptsResponse.success) {
      console.warn('[Recorder] ⚠️ 기존 스크립트 조회 실패:', scriptsResponse?.error);
      return;
    }
    
    const existingScripts = scriptsResponse.data || [];
    const existingScript = existingScripts.find(
      s => s.language === selectedLanguage && s.framework === selectedFramework && s.status === 'active'
    );
    
    if (existingScript) {
      // 기존 스크립트 업데이트
      const updateResponse = await api.invoke('api-update-script', existingScript.id, {
        code: code
      });
      
      if (updateResponse && updateResponse.success) {
        console.log(`[Recorder] ✅ 코드가 TC script로 업데이트되었습니다: Script ID ${existingScript.id}`);
        
        // 부모 윈도우에 스크립트 업데이트 알림 (iframe 환경)
        if (window.parent !== window) {
          try {
            window.parent.postMessage({
              type: 'tc-script-updated',
              tcId: parseInt(tcId, 10)
            }, '*');
          } catch (e) {
            console.warn('[Recorder] 부모 윈도우 메시지 전송 실패:', e);
          }
        }
      } else {
        console.warn('[Recorder] ⚠️ 코드 업데이트 실패:', updateResponse?.error || '알 수 없는 오류');
      }
    } else {
      // 새 스크립트 생성
      const scriptName = `Generated ${selectedLanguage} script`;
      const createResponse = await api.invoke('api-create-script', {
        test_case_id: parseInt(tcId, 10),
        name: scriptName,
        framework: selectedFramework,
        language: selectedLanguage,
        code: code,
        status: 'active'
      });
      
      if (createResponse && createResponse.success) {
        console.log(`[Recorder] ✅ 코드가 TC script로 생성되었습니다: Script ID ${createResponse.data?.id}`);
        
        // 부모 윈도우에 스크립트 생성 알림 (iframe 환경)
        if (window.parent !== window) {
          try {
            window.parent.postMessage({
              type: 'tc-script-updated',
              tcId: parseInt(tcId, 10)
            }, '*');
          } catch (e) {
            console.warn('[Recorder] 부모 윈도우 메시지 전송 실패:', e);
          }
        }
      } else {
        console.warn('[Recorder] ⚠️ 코드 생성 실패:', createResponse?.error || '알 수 없는 오류');
      }
    }
  } catch (error) {
    console.error('[Recorder] ❌ 코드 저장 중 오류:', error);
  }
}

/**
 * 코드 저장 (debounce 적용)
 * @param {string} code - 저장할 코드
 * @param {Object} dependencies - 의존성 객체
 */
export function saveCodeToTCWithDebounce(code, dependencies) {
  // 기존 타이머 취소
  if (codeSaveTimer) {
    clearTimeout(codeSaveTimer);
  }
  
  // 새 타이머 설정
  codeSaveTimer = setTimeout(() => {
    saveCodeToTC(code, dependencies);
    codeSaveTimer = null;
  }, CODE_SAVE_DELAY);
}

/**
 * 전체 이벤트를 TC steps로 동기화
 * @param {Object} dependencies - 의존성 객체
 * @param {HTMLElement} tcIdInput - TC ID 입력 필드
 * @param {Array} allEvents - 모든 이벤트 배열
 * @param {Object} electronAPI - Electron API 객체
 * @param {Function} initElectronAPI - Electron API 초기화 함수
 * @param {Function} logMessage - 로그 메시지 함수
 */
export async function syncAllEventsToTC(dependencies) {
  const {
    tcIdInput,
    allEvents,
    electronAPI,
    initElectronAPI,
    logMessage
  } = dependencies;

  const tcId = tcIdInput?.value;
  
  if (!tcId) {
    logMessage('TC ID를 입력하세요.', 'error');
    return { success: false, error: 'TC ID가 필요합니다' };
  }
  
  // electronAPI 재확인
  let api = electronAPI;
  if (!api) {
    if (initElectronAPI) {
      initElectronAPI();
    }
    api = electronAPI;
  }
  
  if (!api) {
    logMessage('Electron API를 사용할 수 없습니다.', 'error');
    return { success: false, error: 'Electron API를 사용할 수 없습니다' };
  }
  
  if (allEvents.length === 0) {
    logMessage('동기화할 이벤트가 없습니다.', 'info');
    return { success: false, error: '동기화할 이벤트가 없습니다' };
  }
  
  try {
    logMessage('TC steps 동기화 중...', 'info');
    
    const result = await api.invoke('sync-events-to-tc', {
      tcId: parseInt(tcId, 10),
      events: allEvents
    });
    
    if (result && result.success) {
      console.log(`[Recorder] ✅ ${result.stepCount}개의 steps가 TC에 동기화되었습니다`);
      logMessage(`${result.stepCount}개의 steps가 TC에 동기화되었습니다`, 'success');
      return { success: true, stepCount: result.stepCount };
    } else {
      const errorMsg = result?.error || '알 수 없는 오류';
      console.warn('[Recorder] ⚠️ TC steps 동기화 실패:', errorMsg);
      logMessage('TC steps 동기화 실패: ' + errorMsg, 'error');
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    console.error('[Recorder] ❌ TC steps 동기화 중 오류:', error);
    logMessage('TC steps 동기화 중 오류: ' + error.message, 'error');
    return { success: false, error: error.message };
  }
}

/**
 * 현재 코드를 TC steps로 동기화
 * 코드에서 steps를 추출하거나 현재 이벤트를 steps로 변환
 * @param {Object} dependencies - 의존성 객체
 */
export async function syncCodeToTC(dependencies) {
  const {
    tcIdInput,
    allEvents,
    electronAPI,
    logMessage
  } = dependencies;

  const tcId = tcIdInput?.value;
  
  if (!tcId) {
    logMessage('TC ID를 입력하세요.', 'error');
    return { success: false, error: 'TC ID가 필요합니다' };
  }
  
  if (!electronAPI) {
    logMessage('Electron API를 사용할 수 없습니다.', 'error');
    return { success: false, error: 'Electron API를 사용할 수 없습니다' };
  }
  
  // 현재 이벤트를 steps로 변환하여 동기화
  if (allEvents.length === 0) {
    logMessage('동기화할 이벤트가 없습니다.', 'info');
    return { success: false, error: '동기화할 이벤트가 없습니다' };
  }
  
  // syncAllEventsToTC를 사용하여 동기화
  return await syncAllEventsToTC(dependencies);
}

