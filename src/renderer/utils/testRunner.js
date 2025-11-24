/**
 * 테스트 실행 유틸리티
 * 테스트 실행 로직을 캡슐화
 */

/**
 * 테스트 실행
 * @param {string} scriptName - 실행할 스크립트 파일명
 * @returns {Promise<Object>} 실행 결과
 */
export async function runTest(scriptName) {
  if (!scriptName) {
    throw new Error('스크립트를 선택해주세요.');
  }

  try {
    const result = await window.electronAPI.runPythonScript(scriptName);
    return result;
  } catch (error) {
    throw new Error(`테스트 실행 실패: ${error.message || error}`);
  }
}

