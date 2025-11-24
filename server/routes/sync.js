/**
 * 동기화 라우트
 * 실시간 동기화 및 상태 확인
 */

const express = require('express');
const router = express.Router();
const db = require('../database/db');

/**
 * 전체 동기화 상태 조회
 */
router.get('/status', async (req, res) => {
  try {
    const [testCasesCount, scriptsCount, resultsCount] = await Promise.all([
      db.get('SELECT COUNT(*) as count FROM test_cases'),
      db.get('SELECT COUNT(*) as count FROM test_scripts'),
      db.get('SELECT COUNT(*) as count FROM test_results')
    ]);

    res.json({
      success: true,
      data: {
        test_cases: testCasesCount.count,
        scripts: scriptsCount.count,
        results: resultsCount.count,
        last_sync: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('동기화 상태 조회 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 테스트케이스와 스크립트 통합 조회
 */
router.get('/test-case/:id/full', async (req, res) => {
  try {
    const { id } = req.params;

    const testCase = await db.get('SELECT * FROM test_cases WHERE id = ?', [id]);
    if (!testCase) {
      return res.status(404).json({ success: false, error: '테스트케이스를 찾을 수 없습니다' });
    }

    const scripts = await db.all(
      'SELECT * FROM test_scripts WHERE test_case_id = ? ORDER BY created_at DESC',
      [id]
    );

    const recentResults = await db.all(
      `SELECT * FROM test_results 
       WHERE test_case_id = ? 
       ORDER BY executed_at DESC 
       LIMIT 10`,
      [id]
    );

    // JSON 필드 파싱
    testCase.steps = JSON.parse(testCase.steps || '[]');
    testCase.tags = JSON.parse(testCase.tags || '[]');

    res.json({
      success: true,
      data: {
        test_case: testCase,
        scripts: scripts,
        recent_results: recentResults
      }
    });
  } catch (error) {
    console.error('통합 조회 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

