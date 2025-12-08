/**
 * 로케이터 힐링 API 라우트
 * 힐링 요청 처리 및 힐링 히스토리 관리
 */

const express = require('express');
const router = express.Router();
const db = require('../database/db');
const healingService = require('../services/locatorHealingService');
const codeModifier = require('../services/codeModifier');

/**
 * 힐링 트리거 (테스트 실패 시 자동 호출)
 * POST /api/locator-healing/trigger
 */
router.post('/trigger', async (req, res) => {
  try {
    const { failure_info, test_file, test_function, timestamp } = req.body;

    if (!failure_info || !failure_info.failed_locator) {
      return res.status(400).json({
        success: false,
        error: 'failure_info와 failed_locator는 필수입니다.'
      });
    }

    const { failed_locator, locator_type, page_url, line_number, current_dom } = failure_info;

    // 힐링 수행
    const healingResult = await healingService.healLocator({
      failedLocator: failed_locator,
      locatorType: locator_type || 'playwright',
      pageUrl: page_url,
      snapshotId: null,
      currentDom: current_dom || null
    });

    if (!healingResult.success) {
      return res.json({
        success: false,
        error: healingResult.error,
        healing_attempted: true
      });
    }

    // 힐링 결과 반환 (자동 적용은 나중에)
    res.json({
      success: true,
      healing_result: healingResult,
      message: '힐링 완료. 수동으로 코드에 적용해주세요.'
    });
  } catch (error) {
    console.error('[Locator Healing API] 힐링 트리거 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Locator 힐링 요청 (수동)
 * POST /api/locator-healing/heal
 */
router.post('/heal', async (req, res) => {
  try {
    const {
      test_script_id,
      failed_locator,
      locator_type,
      page_url,
      line_number,
      healing_method = 'auto',
      current_dom
    } = req.body;

    if (!test_script_id || !failed_locator || !page_url) {
      return res.status(400).json({
        success: false,
        error: 'test_script_id, failed_locator, page_url는 필수입니다.'
      });
    }

    // 테스트 스크립트 조회
    const testScript = await db.get('SELECT * FROM test_scripts WHERE id = ?', [test_script_id]);
    if (!testScript) {
      return res.status(404).json({
        success: false,
        error: '테스트 스크립트를 찾을 수 없습니다.'
      });
    }

    // 힐링 수행
    const healingResult = await healingService.healLocator({
      failedLocator: failed_locator,
      locatorType: locator_type || 'playwright',
      pageUrl: page_url,
      snapshotId: null,
      currentDom: current_dom || null
    });

    if (!healingResult.success) {
      return res.json({
        success: false,
        error: healingResult.error
      });
    }

    // 코드 수정
    let modifiedCode = testScript.code;
    try {
      modifiedCode = await codeModifier.replaceLocatorInCode({
        code: testScript.code,
        oldLocator: failed_locator,
        newLocator: healingResult.healedLocator,
        lineNumber: line_number || null
      });
    } catch (error) {
      console.error('[Locator Healing API] 코드 수정 실패:', error);
      return res.status(500).json({
        success: false,
        error: `코드 수정 실패: ${error.message}`
      });
    }

    // 코드 업데이트
    await db.run(
      'UPDATE test_scripts SET code = ?, updated_at = NOW() WHERE id = ?',
      [modifiedCode, test_script_id]
    );

    // 힐링 히스토리 저장
    const historyResult = await healingService.saveHealingHistory({
      test_script_id: test_script_id,
      test_case_id: testScript.test_case_id,
      failed_locator: failed_locator,
      healed_locator: healingResult.healedLocator,
      healing_method: healingResult.healingMethod,
      snapshot_id: healingResult.snapshotId,
      page_url: page_url,
      success: true
    });

    res.json({
      success: true,
      healing_result: healingResult,
      code_updated: true,
      history: historyResult.history,
      modified_code: modifiedCode
    });
  } catch (error) {
    console.error('[Locator Healing API] 힐링 요청 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 힐링 히스토리 조회
 * GET /api/locator-healing/history
 */
router.get('/history', async (req, res) => {
  try {
    const { test_script_id, test_case_id, success, limit = 50 } = req.query;

    const filters = {};
    if (test_script_id) filters.test_script_id = parseInt(test_script_id, 10);
    if (test_case_id) filters.test_case_id = parseInt(test_case_id, 10);
    if (success !== undefined) filters.success = success === 'true';
    if (limit) filters.limit = parseInt(limit, 10);

    const history = await healingService.getHealingHistory(filters);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('[Locator Healing API] 힐링 히스토리 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 특정 스크립트의 힐링 히스토리 조회
 * GET /api/locator-healing/history/:test_script_id
 */
router.get('/history/:test_script_id', async (req, res) => {
  try {
    const { test_script_id } = req.params;
    const { limit = 20 } = req.query;

    const history = await healingService.getHealingHistory({
      test_script_id: parseInt(test_script_id, 10),
      limit: parseInt(limit, 10)
    });

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('[Locator Healing API] 힐링 히스토리 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
