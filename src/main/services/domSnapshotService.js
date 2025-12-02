/**
 * DOM 스냅샷 서비스
 * 로컬/서버 모드를 자동으로 감지하여 적절한 저장 방식 선택
 * 추후 서버 DB로 전환 시 최소한의 코드 변경만 필요
 */

const config = require('../config/config');
const DbService = require('./dbService');
const ApiService = require('./apiService'); // 인스턴스를 직접 import
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class DomSnapshotService {
  /**
   * DOM 스냅샷 저장
   * @param {string} pageUrl - 정규화된 페이지 URL
   * @param {string} domStructure - DOM 구조 문자열 (압축 전)
   * @param {Date} snapshotDate - 스냅샷 날짜
   * @returns {Promise<Object>} 저장 결과
   */
  async saveSnapshot(pageUrl, domStructure, snapshotDate) {
    try {
      // DOM 구조 압축
      const compressed = await gzip(Buffer.from(domStructure, 'utf8'));
      const compressedBase64 = compressed.toString('base64');
      
      if (config.database.mode === 'local') {
        // 로컬 DbService 사용
        return await DbService.saveDomSnapshot(pageUrl, compressedBase64, snapshotDate);
      } else {
        // 서버 API 호출 (추후 구현)
        return await ApiService.request('POST', '/api/dom-snapshots', {
          pageUrl,
          domStructure: compressedBase64,
          snapshotDate: snapshotDate.toISOString().split('T')[0]
        });
      }
    } catch (error) {
      console.error('❌ DOM 스냅샷 저장 실패:', error);
      throw error;
    }
  }

  /**
   * 특정 기간 내 스냅샷 존재 여부 확인
   * @param {string} pageUrl - 정규화된 페이지 URL
   * @param {Date} startDate - 시작 날짜
   * @param {Date} endDate - 종료 날짜
   * @returns {Promise<boolean>} 존재 여부
   */
  async checkSnapshotInPeriod(pageUrl, startDate, endDate) {
    try {
      if (config.database.mode === 'local') {
        return await DbService.checkDomSnapshotInPeriod(pageUrl, startDate, endDate);
      } else {
        // 서버 API 호출 (추후 구현)
        const response = await ApiService.request('GET', 
          `/api/dom-snapshots/check?pageUrl=${encodeURIComponent(pageUrl)}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
        );
        return response.exists || false;
      }
    } catch (error) {
      console.error('❌ DOM 스냅샷 확인 실패:', error);
      return false;
    }
  }

  /**
   * 60일 이상 된 스냅샷 삭제
   * @returns {Promise<number>} 삭제된 레코드 수
   */
  async cleanupOldSnapshots() {
    try {
      if (config.database.mode === 'local') {
        return await DbService.cleanupOldDomSnapshots();
      } else {
        // 서버 API 호출 (추후 구현)
        const response = await ApiService.request('DELETE', '/api/dom-snapshots/cleanup');
        return response.deletedCount || 0;
      }
    } catch (error) {
      console.warn('⚠️ DOM 스냅샷 정리 실패:', error.message);
      return 0;
    }
  }

  /**
   * 압축된 DOM 구조 압축 해제
   * @param {string} compressedBase64 - 압축된 base64 문자열
   * @returns {Promise<string>} 압축 해제된 DOM 구조
   */
  async decompressDOM(compressedBase64) {
    try {
      const compressed = Buffer.from(compressedBase64, 'base64');
      const decompressed = await gunzip(compressed);
      return decompressed.toString('utf8');
    } catch (error) {
      console.error('❌ DOM 압축 해제 실패:', error);
      throw error;
    }
  }
}

module.exports = new DomSnapshotService();

