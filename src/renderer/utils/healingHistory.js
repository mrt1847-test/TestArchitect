/**
 * 힐링 히스토리 UI 유틸리티
 * 힐링 결과 표시 및 힐링 히스토리 관리
 */

/**
 * 힐링 히스토리 조회
 * @param {Object} filters - 필터 조건
 * @returns {Promise<Array>} 힐링 히스토리 목록
 */
export async function getHealingHistory(filters = {}) {
  try {
    if (!window.electronAPI || !window.electronAPI.api) {
      console.warn('[Healing History] API가 없습니다.');
      return [];
    }

    const params = new URLSearchParams();
    if (filters.test_script_id) params.append('test_script_id', filters.test_script_id);
    if (filters.test_case_id) params.append('test_case_id', filters.test_case_id);
    if (filters.success !== undefined) params.append('success', filters.success);
    if (filters.limit) params.append('limit', filters.limit);

    const queryString = params.toString();
    const endpoint = `/api/locator-healing/history${queryString ? `?${queryString}` : ''}`;
    
    const response = await window.electronAPI.api.get(endpoint);
    
    if (response && response.success && Array.isArray(response.data)) {
      return response.data;
    }
    
    return [];
  } catch (error) {
    console.error('[Healing History] 힐링 히스토리 조회 실패:', error);
    return [];
  }
}

/**
 * 힐링 히스토리 아이템 렌더링
 * @param {Object} historyItem - 힐링 히스토리 항목
 * @param {HTMLElement} container - 컨테이너 요소
 */
export function renderHealingHistoryItem(historyItem, container) {
  if (!historyItem || !container) return;

  const item = document.createElement('div');
  item.className = 'healing-history-item';
  
  const methodBadge = document.createElement('span');
  methodBadge.className = `healing-method-badge healing-method-${historyItem.healing_method || 'unknown'}`;
  methodBadge.textContent = historyItem.healing_method || 'unknown';
  
  const timestamp = new Date(historyItem.healed_at).toLocaleString('ko-KR');
  
  item.innerHTML = `
    <div class="healing-history-header">
      <span class="healing-timestamp">${timestamp}</span>
      ${historyItem.success ? '<span class="healing-success">✓ 성공</span>' : '<span class="healing-failed">✗ 실패</span>'}
    </div>
    <div class="healing-history-content">
      <div class="healing-locator-pair">
        <div class="healing-locator-old">
          <span class="healing-label">이전:</span>
          <code class="healing-locator-code">${escapeHtml(historyItem.failed_locator)}</code>
        </div>
        <div class="healing-locator-arrow">→</div>
        <div class="healing-locator-new">
          <span class="healing-label">수정:</span>
          <code class="healing-locator-code">${escapeHtml(historyItem.healed_locator)}</code>
        </div>
      </div>
      ${historyItem.page_url ? `<div class="healing-page-url">페이지: ${escapeHtml(historyItem.page_url)}</div>` : ''}
    </div>
  `;
  
  container.appendChild(item);
}

/**
 * 힐링 히스토리 목록 렌더링
 * @param {Array} historyList - 힐링 히스토리 목록
 * @param {HTMLElement} container - 컨테이너 요소
 */
export function renderHealingHistoryList(historyList, container) {
  if (!container) return;

  container.innerHTML = '';

  if (!Array.isArray(historyList) || historyList.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'healing-history-empty';
    emptyMessage.textContent = '힐링 히스토리가 없습니다.';
    container.appendChild(emptyMessage);
    return;
  }

  historyList.forEach(item => {
    renderHealingHistoryItem(item, container);
  });
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 테스트 결과에 힐링 정보 표시
 * @param {Object} testResult - 테스트 결과
 * @param {HTMLElement} resultElement - 결과 표시 요소
 */
export async function showHealingInfoForTestResult(testResult, resultElement) {
  if (!testResult || !resultElement) return;

  // 실패한 테스트에만 힐링 정보 표시
  if (testResult.success || !testResult.scriptId) return;

  try {
    // 힐링 히스토리 조회
    const history = await getHealingHistory({
      test_script_id: testResult.scriptId,
      limit: 5
    });

    if (history.length === 0) return;

    // 힐링 정보 섹션 생성
    const healingSection = document.createElement('div');
    healingSection.className = 'test-result-healing-info';
    
    const header = document.createElement('div');
    header.className = 'healing-section-header';
    header.innerHTML = `
      <span class="healing-icon">🔧</span>
      <span class="healing-title">로케이터 자동 힐링 히스토리 (${history.length}건)</span>
    `;
    healingSection.appendChild(header);

    const historyContainer = document.createElement('div');
    historyContainer.className = 'healing-history-container';
    renderHealingHistoryList(history, historyContainer);
    healingSection.appendChild(historyContainer);

    // 결과 요소에 추가
    resultElement.appendChild(healingSection);
  } catch (error) {
    console.error('[Healing History] 힐링 정보 표시 오류:', error);
  }
}

/**
 * 힐링 설정 UI 렌더링
 * @param {HTMLElement} container - 컨테이너 요소
 * @param {Object} currentSettings - 현재 설정
 */
export function renderHealingSettings(container, currentSettings = {}) {
  if (!container) return;

  const defaultSettings = {
    autoHeal: true,
    healingStrategy: 'hybrid',
    requireApproval: false
  };

  const settings = { ...defaultSettings, ...currentSettings };

  container.innerHTML = `
    <div class="healing-settings-section">
      <h3>로케이터 자동 힐링 설정</h3>
      
      <div class="setting-item">
        <label>
          <input type="checkbox" id="healing-auto-heal" ${settings.autoHeal ? 'checked' : ''}>
          <span>자동 힐링 활성화</span>
        </label>
        <p class="setting-description">테스트 실패 시 자동으로 로케이터 힐링을 시도합니다.</p>
      </div>

      <div class="setting-item">
        <label>힐링 전략:</label>
        <select id="healing-strategy">
          <option value="text" ${settings.healingStrategy === 'text' ? 'selected' : ''}>텍스트 기반</option>
          <option value="attribute" ${settings.healingStrategy === 'attribute' ? 'selected' : ''}>속성 기반</option>
          <option value="structure" ${settings.healingStrategy === 'structure' ? 'selected' : ''}>구조 기반</option>
          <option value="hybrid" ${settings.healingStrategy === 'hybrid' ? 'selected' : ''}>하이브리드 (권장)</option>
        </select>
        <p class="setting-description">힐링 시 우선 사용할 매칭 전략을 선택합니다.</p>
      </div>

      <div class="setting-item">
        <label>
          <input type="checkbox" id="healing-require-approval" ${settings.requireApproval ? 'checked' : ''}>
          <span>수동 승인 필요</span>
        </label>
        <p class="setting-description">힐링된 로케이터를 코드에 적용하기 전에 사용자 승인을 요청합니다.</p>
      </div>

      <div class="setting-actions">
        <button id="healing-settings-save" class="btn-primary">설정 저장</button>
      </div>
    </div>
  `;

  // 설정 저장 이벤트 리스너
  const saveBtn = container.querySelector('#healing-settings-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const newSettings = {
        autoHeal: container.querySelector('#healing-auto-heal').checked,
        healingStrategy: container.querySelector('#healing-strategy').value,
        requireApproval: container.querySelector('#healing-require-approval').checked
      };
      
      // 설정 저장 (localStorage 또는 API)
      try {
        localStorage.setItem('healingSettings', JSON.stringify(newSettings));
        alert('힐링 설정이 저장되었습니다.');
      } catch (error) {
        console.error('[Healing History] 설정 저장 실패:', error);
      }
    });
  }
}

/**
 * 힐링 설정 로드
 * @returns {Object} 힐링 설정
 */
export function loadHealingSettings() {
  try {
    const saved = localStorage.getItem('healingSettings');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('[Healing History] 설정 로드 실패:', error);
  }
  
  return {
    autoHeal: true,
    healingStrategy: 'hybrid',
    requireApproval: false
  };
}
