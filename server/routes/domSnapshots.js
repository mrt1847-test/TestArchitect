/**
 * DOM 스냅샷 라우트
 * DOM 스냅샷 CRUD 작업
 */

const express = require('express');
const router = express.Router();
const snapshotScheduler = require('../services/domSnapshotScheduler');
const db = require('../database/db');

/**
 * DOM 스냅샷 저장
 * POST /api/dom-snapshots
 */
router.post('/', async (req, res) => {
  try {
    const { url, domData, pageTitle, metadata } = req.body;

    if (!url || !domData) {
      return res.status(400).json({
        success: false,
        error: 'url과 domData는 필수입니다'
      });
    }

    const result = await snapshotScheduler.saveSnapshot({
      url,
      domData,
      pageTitle,
      metadata
    });

    if (result.skipped) {
      return res.json({
        success: true,
        skipped: true,
        reason: result.reason,
        message: result.reason === 'duplicate' 
          ? '중복된 스냅샷입니다' 
          : '저장 주기가 아직 경과하지 않았습니다'
      });
    }

    res.json({
      success: true,
      data: result.snapshot
    });
  } catch (error) {
    console.error('[DOM Snapshots API] 스냅샷 저장 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 특정 URL의 최신 스냅샷 조회
 * GET /api/dom-snapshots/:normalizedUrl
 */
router.get('/:normalizedUrl', async (req, res) => {
  try {
    const { normalizedUrl } = req.params;
    
    // URL 디코딩
    const decodedUrl = decodeURIComponent(normalizedUrl);
    
    const snapshot = await snapshotScheduler.getLatestSnapshot(decodedUrl);

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        error: '스냅샷을 찾을 수 없습니다'
      });
    }

    // metadata JSON 파싱
    if (snapshot.metadata && typeof snapshot.metadata === 'string') {
      try {
        snapshot.metadata = JSON.parse(snapshot.metadata);
      } catch (e) {
        // 파싱 실패 시 그대로 유지
      }
    }
    
    // 응답에는 압축 해제된 데이터 포함 (decompressed_data 사용)
    if (snapshot.decompressed_data) {
      snapshot.snapshot_data = snapshot.decompressed_data;
      delete snapshot.decompressed_data; // 클라이언트에 불필요한 필드 제거
    }

    res.json({
      success: true,
      data: snapshot
    });
  } catch (error) {
    console.error('[DOM Snapshots API] 스냅샷 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 특정 URL의 스냅샷 히스토리 조회
 * GET /api/dom-snapshots/:normalizedUrl/history
 */
router.get('/:normalizedUrl/history', async (req, res) => {
  try {
    const { normalizedUrl } = req.params;
    const { limit = 10 } = req.query;
    
    // URL 디코딩
    const decodedUrl = decodeURIComponent(normalizedUrl);
    
    const history = await snapshotScheduler.getSnapshotHistory(
      decodedUrl, 
      parseInt(limit, 10)
    );

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('[DOM Snapshots API] 히스토리 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 만료된 스냅샷 삭제
 * DELETE /api/dom-snapshots/expired
 */
router.delete('/expired', async (req, res) => {
  try {
    const deletedCount = await snapshotScheduler.cleanupExpiredSnapshots();

    res.json({
      success: true,
      deletedCount,
      message: `만료된 스냅샷 ${deletedCount}개가 삭제되었습니다`
    });
  } catch (error) {
    console.error('[DOM Snapshots API] 만료된 스냅샷 삭제 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 모든 스냅샷 조회 (관리용)
 * GET /api/dom-snapshots
 */
router.get('/', async (req, res) => {
  try {
    const { normalized_url, limit = 50 } = req.query;
    
    let query = 'SELECT id, normalized_url, snapshot_hash, page_title, captured_at, expires_at FROM dom_snapshots WHERE 1=1';
    const params = [];

    if (normalized_url) {
      query += ' AND normalized_url = ?';
      params.push(normalized_url);
    }

    query += ' ORDER BY captured_at DESC LIMIT ?';
    params.push(parseInt(limit, 10));

    const snapshots = await db.all(query, params);

    res.json({
      success: true,
      data: snapshots
    });
  } catch (error) {
    console.error('[DOM Snapshots API] 스냅샷 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
