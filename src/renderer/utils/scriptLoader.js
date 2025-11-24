/**
 * 스크립트 로더 유틸리티
 * 테스트 스크립트 목록 로드 및 관리
 */

/**
 * 테스트 스크립트 목록을 드롭다운에 로드
 * @param {HTMLSelectElement} selectElement - 스크립트를 표시할 select 요소
 * @returns {Promise<void>}
 */
export async function loadTestScripts(selectElement) {
  try {
    const scripts = await window.electronAPI.getTestScripts();

    // 기본 옵션만 남기고 초기화
    selectElement.innerHTML = '<option value="">스크립트를 선택하세요</option>';

    // 스크립트 옵션 추가
    scripts.forEach(script => {
      const option = document.createElement('option');
      option.value = script;
      option.textContent = script;
      selectElement.appendChild(option);
    });

    // 스크립트가 없는 경우 안내 메시지
    if (scripts.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '사용 가능한 스크립트가 없습니다';
      option.disabled = true;
      selectElement.appendChild(option);
    }
  } catch (error) {
    console.error('스크립트 목록 로드 실패:', error);
    throw new Error('스크립트 목록을 불러오는데 실패했습니다.');
  }
}

