/**
 * UI 헬퍼 유틸리티
 * DOM 조작 및 UI 업데이트 관련 유틸리티 함수들
 */

/**
 * 결과 컨테이너에 성공 메시지 표시
 * @param {HTMLElement} container - 결과를 표시할 컨테이너 요소
 * @param {Object} data - 표시할 데이터 객체
 */
export function displaySuccess(container, data) {
  container.innerHTML = '';

  const successDiv = document.createElement('div');
  successDiv.className = 'result-success';
  successDiv.textContent = '✓ 테스트 실행 성공';
  container.appendChild(successDiv);

  if (data) {
    const dataDiv = document.createElement('div');
    dataDiv.className = 'result-data';
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(data, null, 2);
    dataDiv.appendChild(pre);
    container.appendChild(dataDiv);
  }
}

/**
 * 결과 컨테이너에 에러 메시지 표시
 * @param {HTMLElement} container - 결과를 표시할 컨테이너 요소
 * @param {string} message - 에러 메시지
 */
export function displayError(container, message) {
  container.innerHTML = '';
  const errorDiv = document.createElement('div');
  errorDiv.className = 'result-error';
  errorDiv.textContent = `✗ ${message}`;
  container.appendChild(errorDiv);
}

/**
 * 로딩 상태 표시
 * @param {HTMLElement} container - 결과를 표시할 컨테이너 요소
 * @param {string} message - 로딩 메시지 (기본값: '테스트 실행 중')
 */
export function displayLoading(container, message = '테스트 실행 중') {
  container.innerHTML = `<div class="loading">${message}</div>`;
}

/**
 * 버튼을 로딩 상태로 변경
 * @param {HTMLButtonElement} button - 대상 버튼 요소
 * @param {string} loadingText - 로딩 중 표시할 텍스트
 * @param {string} originalText - 원래 버튼 텍스트
 */
export function setButtonLoading(button, loadingText = '실행 중...', originalText = '실행') {
  button.disabled = true;
  button.textContent = loadingText;
  button.dataset.originalText = originalText;
}

/**
 * 버튼을 일반 상태로 복원
 * @param {HTMLButtonElement} button - 대상 버튼 요소
 */
export function restoreButton(button) {
  button.disabled = false;
  button.textContent = button.dataset.originalText || '실행';
}

