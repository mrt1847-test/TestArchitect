/**
 * 스크린샷 서비스
 * 로컬/서버 모드를 자동으로 감지하여 적절한 저장 방식 선택
 * 추후 서버 DB로 전환 시 최소한의 코드 변경만 필요
 */

const config = require('../config/config');
const DbService = require('./dbService');
const ApiService = require('./apiService'); // 인스턴스를 직접 import

class ScreenshotService {
  /**
   * 스텝 스크린샷 저장
   * @param {number} tcId - 테스트케이스 ID
   * @param {number} stepIndex - 스텝 인덱스
   * @param {string} screenshotData - base64 인코딩된 스크린샷 (data:image/jpeg;base64,...)
   * @returns {Promise<Object>} 저장 결과
   */
  async saveScreenshot(tcId, stepIndex, screenshotData) {
    try {
      if (config.database.mode === 'local') {
        // 로컬 DbService 사용
        return DbService.saveStepScreenshot(tcId, stepIndex, screenshotData);
      } else {
        // 서버 API 호출 (추후 구현)
        return await ApiService.request('POST', '/api/test-cases/screenshots', {
          tcId,
          stepIndex,
          screenshot: screenshotData
        });
      }
    } catch (error) {
      console.error('❌ 스크린샷 저장 실패:', error);
      throw error;
    }
  }

  /**
   * 스텝 스크린샷 조회
   * @param {number} tcId - 테스트케이스 ID
   * @param {number} stepIndex - 스텝 인덱스
   * @returns {Promise<string|null>} base64 인코딩된 스크린샷 또는 null
   */
  async getScreenshot(tcId, stepIndex) {
    try {
      if (config.database.mode === 'local') {
        // 로컬 DbService 사용
        return DbService.getStepScreenshot(tcId, stepIndex);
      } else {
        // 서버 API 호출 (추후 구현)
        const response = await ApiService.request('GET', `/api/test-cases/${tcId}/screenshots/${stepIndex}`);
        return response.success && response.data ? response.data.screenshot : null;
      }
    } catch (error) {
      console.error('❌ 스크린샷 조회 실패:', error);
      return null;
    }
  }

  /**
   * 테스트케이스의 모든 스텝 스크린샷 삭제
   * @param {number} tcId - 테스트케이스 ID
   * @returns {Promise<number>} 삭제된 레코드 수
   */
  async deleteScreenshots(tcId) {
    try {
      if (config.database.mode === 'local') {
        // 로컬 DbService 사용
        return DbService.deleteStepScreenshots(tcId);
      } else {
        // 서버 API 호출 (추후 구현)
        const response = await ApiService.request('DELETE', `/api/test-cases/${tcId}/screenshots`);
        return response.success ? response.deletedCount || 0 : 0;
      }
    } catch (error) {
      console.error('❌ 스크린샷 삭제 실패:', error);
      return 0;
    }
  }
}

module.exports = new ScreenshotService();

