/**
 * DOM 스냅샷 서비스
 * 로컬/서버 모드를 자동으로 감지하여 적절한 저장 방식 선택
 * 15일 주기로 DOM 스냅샷을 저장하고, 60일 이상 된 스냅샷을 자동으로 삭제
 */

const zlib = require('zlib');
const config = require('../config/config');
const DbService = require('./dbService');
const ApiService = require('./apiService');

class DomSnapshotService {
  /**
   * DOM 데이터 압축 (gzip)
   * @param {string} domData - 원본 DOM 데이터
   * @returns {Promise<Buffer>} 압축된 데이터
   */
  async compressDomData(domData) {
    return new Promise((resolve, reject) => {
      zlib.gzip(domData, (err, compressed) => {
        if (err) {
          reject(err);
        } else {
          resolve(compressed);
        }
      });
    });
  }

  /**
   * DOM 데이터 압축 해제 (gzip)
   * @param {Buffer} compressedData - 압축된 데이터
   * @returns {Promise<string>} 압축 해제된 데이터
   */
  async decompressDomData(compressedData) {
    return new Promise((resolve, reject) => {
      zlib.gunzip(compressedData, (err, decompressed) => {
        if (err) {
          reject(err);
        } else {
          resolve(decompressed.toString('utf8'));
        }
      });
    });
  }

  /**
   * DOM 스냅샷 저장 (새로운 API 형식)
   * @param {Object} snapshotData - 스냅샷 데이터
   * @param {string} snapshotData.url - 원본 URL
   * @param {string} snapshotData.domData - DOM 데이터 (HTML)
   * @param {string} snapshotData.pageTitle - 페이지 제목 (선택사항)
   * @param {Object} snapshotData.metadata - 메타데이터 (userAgent, viewport 등, 선택사항)
   * @returns {Promise<Object>} 저장 결과
   */
  async saveSnapshot(snapshotData) {
    try {
      const { url, domData, pageTitle, metadata } = snapshotData;
      
      if (!url || !domData) {
        throw new Error('url과 domData는 필수입니다.');
      }

      // 메타데이터에 userAgent 추가 (없는 경우)
      const enhancedMetadata = {
        ...metadata,
        userAgent: metadata?.userAgent || 'Electron/TestArchitect',
        timestamp: new Date().toISOString()
      };
      
      // 서버 API 호출 (압축 없이 원본 전송, 서버에서 처리)
      try {
        const response = await ApiService.request('POST', '/api/dom-snapshots', {
          url,
          domData,
          pageTitle,
          metadata: enhancedMetadata
        });
        return response;
      } catch (error) {
        console.warn('⚠️ 서버에 저장 실패, 로컬 저장 시도:', error.message);
      }
      
      // 로컬 모드 또는 서버 연결 실패 시 로컬 저장 (기존 방식)
      if (config.database.mode === 'local' && DbService.saveDomSnapshot) {
        const snapshotDate = new Date();
        return await DbService.saveDomSnapshot(url, domData, snapshotDate);
      }
      
      throw new Error('DOM 스냅샷을 저장할 수 없습니다 (서버 연결 실패 및 로컬 모드 없음)');
    } catch (error) {
      console.error('❌ DOM 스냅샷 저장 실패:', error);
      throw error;
    }
  }
  
  /**
   * 특정 URL의 최신 스냅샷 조회
   * @param {string} normalizedUrl - 정규화된 URL
   * @returns {Promise<Object|null>} 최신 스냅샷 또는 null
   */
  async getLatestSnapshot(normalizedUrl) {
    try {
      const encodedUrl = encodeURIComponent(normalizedUrl);
      const response = await ApiService.request('GET', `/api/dom-snapshots/${encodedUrl}`);
      return response.data || null;
    } catch (error) {
      console.error('❌ DOM 스냅샷 조회 실패:', error);
      return null;
    }
  }

  /**
   * 특정 URL의 스냅샷 히스토리 조회
   * @param {string} normalizedUrl - 정규화된 URL
   * @param {number} limit - 조회 개수 제한
   * @returns {Promise<Array>} 스냅샷 히스토리
   */
  async getSnapshotHistory(normalizedUrl, limit = 10) {
    try {
      const encodedUrl = encodeURIComponent(normalizedUrl);
      const response = await ApiService.request('GET', `/api/dom-snapshots/${encodedUrl}/history?limit=${limit}`);
      return response.data || [];
    } catch (error) {
      console.error('❌ 스냅샷 히스토리 조회 실패:', error);
      return [];
    }
  }
}

module.exports = new DomSnapshotService();

