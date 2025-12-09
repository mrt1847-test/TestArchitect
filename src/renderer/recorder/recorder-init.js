/**
 * 초기화 모듈
 * DOM 요소 초기화, 패널 리사이즈, 설정 로드 등
 */

/**
 * DOM 요소 초기화
 * @param {Object} domRefs - DOM 참조 객체 (출력 파라미터로 사용)
 */
export function initDOMElements(domRefs) {
  domRefs.startBtn = document.getElementById('start-record');
  domRefs.stopBtn = document.getElementById('stop-record');
  domRefs.timeline = document.getElementById('timeline');
  domRefs.selectorList = document.getElementById('selector-list');
  domRefs.iframeBanner = document.getElementById('iframe-banner');
  domRefs.codeOutput = document.getElementById('code-output');
  domRefs.logEntries = document.getElementById('log-entries');
  domRefs.resetBtn = document.getElementById('reset-btn');
  domRefs.elementSelectBtn = document.getElementById('element-select-btn');
  domRefs.deleteEventBtn = document.getElementById('delete-event-btn');
  domRefs.tcIdInput = document.getElementById('tc-id-input');
  domRefs.projectIdInput = document.getElementById('project-id-input');
  domRefs.sendRecordingBtn = document.getElementById('send-recording-btn');
  domRefs.frameworkSelect = document.getElementById('framework-select');
  domRefs.languageSelect = document.getElementById('language-select');
  domRefs.aiReviewBtn = document.getElementById('ai-review-btn');
  domRefs.aiReviewStatusEl = document.getElementById('ai-review-status');
  domRefs.syncToTcBtn = document.getElementById('sync-to-tc-btn');
  domRefs.aiEndpointInput = document.getElementById('ai-endpoint');
  domRefs.aiApiKeyInput = document.getElementById('ai-api-key');
  domRefs.aiModelInput = document.getElementById('ai-model');
  domRefs.aiSettingsSaveBtn = document.getElementById('ai-settings-save');
  domRefs.aiSettingsStatusEl = document.getElementById('ai-settings-status');
  // 요소 선택 워크플로우 DOM 요소
  domRefs.elementPanel = document.getElementById('element-panel');
  domRefs.elementStatusEl = document.getElementById('element-status');
  domRefs.elementPathContainer = document.getElementById('element-path');
  domRefs.elementPathItems = document.getElementById('element-path-items');
  domRefs.elementCandidatesContainer = document.getElementById('element-candidates');
  domRefs.elementActionsContainer = document.getElementById('element-actions');
  domRefs.elementCancelBtn = document.getElementById('element-cancel-btn');
  domRefs.elementAttrPanel = document.getElementById('element-attribute-panel');
  domRefs.elementAttrNameInput = document.getElementById('element-attr-name');
  domRefs.elementAttrApplyBtn = document.getElementById('element-attr-apply');
  domRefs.elementCodePreview = document.getElementById('element-code-preview');
  domRefs.elementCodeEl = document.getElementById('element-code');
  
  // DOM 요소 확인
  if (!domRefs.startBtn) {
    console.error('[Recorder] start-record 버튼을 찾을 수 없습니다');
  }
  if (!domRefs.stopBtn) {
    console.error('[Recorder] stop-record 버튼을 찾을 수 없습니다');
  }
}

/**
 * 패널 리사이즈 초기화
 * @param {Function} savePanelHeight - 패널 높이 저장 함수
 */
export function initPanelResize(savePanelHeight) {
  const resizeHandles = document.querySelectorAll('.panel-resize-handle');
  
  console.log('[Resize] 리사이즈 핸들 개수:', resizeHandles.length); // 디버깅용
  
  resizeHandles.forEach(handle => {
    const panelId = handle.dataset.panel;
    if (!panelId) {
      console.warn('[Resize] panelId가 없습니다:', handle);
      return;
    }
    
    const panel = document.getElementById(panelId);
    if (!panel) {
      console.warn('[Resize] 패널을 찾을 수 없습니다:', panelId);
      return;
    }
    
    console.log('[Resize] 리사이즈 핸들 초기화:', panelId); // 디버깅용
    
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;
    
    const startResize = (e) => {
      isResizing = true;
      startY = e.clientY || (e.touches && e.touches[0].clientY);
      startHeight = panel.offsetHeight;
      
      document.addEventListener('mousemove', doResize);
      document.addEventListener('mouseup', stopResize);
      document.addEventListener('touchmove', doResize);
      document.addEventListener('touchend', stopResize);
      
      e.preventDefault();
    };
    
    const doResize = (e) => {
      if (!isResizing) return;
      
      const currentY = e.clientY || (e.touches && e.touches[0].clientY);
      const diff = currentY - startY;
      
      // 패널 위치에 따라 높이 조정 방향 결정
      // 모든 패널은 하단 핸들로 아래로 드래그하면 높이 증가
      const newHeight = startHeight + diff;
      
      // 최소/최대 높이 제한
      const minHeight = 150;
      const maxHeight = window.innerHeight * 0.8;
      
      if (newHeight >= minHeight && newHeight <= maxHeight) {
        panel.style.height = `${newHeight}px`;
        panel.style.minHeight = `${newHeight}px`;
      }
      
      e.preventDefault();
    };
    
    const stopResize = () => {
      if (isResizing) {
        isResizing = false;
        
        // 최종 높이 저장
        const finalHeight = panel.offsetHeight;
        savePanelHeight(panelId, finalHeight);
        
        document.removeEventListener('mousemove', doResize);
        document.removeEventListener('mouseup', stopResize);
        document.removeEventListener('touchmove', doResize);
        document.removeEventListener('touchend', stopResize);
      }
    };
    
    handle.addEventListener('mousedown', startResize);
    handle.addEventListener('touchstart', startResize);
  });
}

/**
 * Recorder 설정 로드
 * @param {Object} electronAPI - Electron API 객체
 */
export async function loadRecorderSettings(electronAPI) {
  try {
    if (!electronAPI || !electronAPI.getRecorderSettings) {
      console.warn('[Recorder] electronAPI.getRecorderSettings를 사용할 수 없습니다.');
      return;
    }
    
    const result = await electronAPI.getRecorderSettings();
    if (result && result.success && result.data) {
      const settings = result.data;
      
      // 패널 높이 복원
      if (settings.panelHeights) {
        Object.keys(settings.panelHeights).forEach(panelId => {
          const panel = document.getElementById(panelId);
          if (panel && settings.panelHeights[panelId]) {
            const height = settings.panelHeights[panelId];
            panel.style.height = `${height}px`;
            panel.style.minHeight = `${height}px`;
          }
        });
      }
      
      console.log('[Recorder] 설정 로드 완료:', settings);
    }
  } catch (error) {
    console.error('[Recorder] 설정 로드 실패:', error);
  }
}

/**
 * 패널 높이 저장
 * @param {string} panelId - 패널 ID
 * @param {number} height - 패널 높이
 * @param {Object} electronAPI - Electron API 객체
 */
export async function savePanelHeight(panelId, height, electronAPI) {
  try {
    if (!electronAPI || !electronAPI.getRecorderSettings || !electronAPI.setRecorderSettings) {
      console.warn('[Recorder] electronAPI를 사용할 수 없습니다.');
      return;
    }
    
    // 현재 설정 로드
    const result = await electronAPI.getRecorderSettings();
    if (!result || !result.success) {
      console.warn('[Recorder] 설정 로드 실패');
      return;
    }
    
    const settings = result.data || {};
    if (!settings.panelHeights) {
      settings.panelHeights = {};
    }
    
    // 높이 업데이트
    settings.panelHeights[panelId] = height;
    
    // 설정 저장
    await electronAPI.setRecorderSettings({
      panelHeights: settings.panelHeights,
      layout: settings.layout || {}
    });
    
    console.log(`[Recorder] 패널 높이 저장: ${panelId} = ${height}px`);
  } catch (error) {
    console.error('[Recorder] 패널 높이 저장 실패:', error);
  }
}

