/**
 * 테스트 스크립트 라우트
 * 스크립트 CRUD 및 테스트케이스 연동
 */

const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { notifySubscribers } = require('../index');
const fs = require('fs').promises;
const path = require('path');

/**
 * 모든 스크립트 조회
 */
router.get('/', async (req, res) => {
  try {
    const { test_case_id, framework, status } = req.query;
    let query = 'SELECT * FROM test_scripts WHERE 1=1';
    const params = [];

    if (test_case_id) {
      query += ' AND test_case_id = ?';
      params.push(test_case_id);
    }

    if (framework) {
      query += ' AND framework = ?';
      params.push(framework);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const scripts = await db.all(query, params);
    res.json({ success: true, data: scripts });
  } catch (error) {
    console.error('스크립트 조회 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 특정 스크립트 조회
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const script = await db.get('SELECT * FROM test_scripts WHERE id = ?', [id]);

    if (!script) {
      return res.status(404).json({ success: false, error: '스크립트를 찾을 수 없습니다' });
    }

    res.json({ success: true, data: script });
  } catch (error) {
    console.error('스크립트 조회 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 스크립트 생성
 */
router.post('/', async (req, res) => {
  try {
    const { test_case_id, name, framework, language, code, created_by } = req.body;

    if (!name || !framework || !language || !code) {
      return res.status(400).json({ 
        success: false, 
        error: 'name, framework, language, code는 필수입니다' 
      });
    }

    // 파일 경로 생성 (선택사항)
    let file_path = null;
    if (test_case_id) {
      const scriptsDir = path.join(__dirname, '../../scripts');
      const extension = language === 'python' ? 'py' : language === 'typescript' ? 'ts' : 'js';
      
      // pytest 형식으로 파일명 생성 (test_*.py)
      let filename;
      if (language === 'python' && framework === 'pytest') {
        // pytest 형식: test_tc{id}_{name}.py
        const sanitizedName = name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
        filename = `test_tc${test_case_id}_${sanitizedName}.${extension}`;
      } else {
        // 기존 형식: {name}_{timestamp}.{ext}
        filename = `${name.replace(/\s+/g, '_')}_${Date.now()}.${extension}`;
      }
      
      file_path = path.join(scriptsDir, filename);

      // 파일 저장
      await fs.mkdir(scriptsDir, { recursive: true });
      await fs.writeFile(file_path, code, 'utf-8');
    }

    const query = `
      INSERT INTO test_scripts (test_case_id, name, framework, language, code, file_path, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      test_case_id || null,
      name,
      framework,
      language,
      code,
      file_path,
      created_by || null
    ];

    const result = await db.run(query, params);
    const newScript = await db.get('SELECT * FROM test_scripts WHERE id = ?', [result.lastID]);

    // WebSocket으로 실시간 알림
    notifySubscribers('script', newScript, { action: 'created' });

    res.status(201).json({ success: true, data: newScript });
  } catch (error) {
    console.error('스크립트 생성 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 스크립트 업데이트
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, status } = req.body;

    const existing = await db.get('SELECT * FROM test_scripts WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: '스크립트를 찾을 수 없습니다' });
    }

    // 파일 업데이트 (file_path가 있는 경우)
    if (code && existing.file_path) {
      try {
        await fs.writeFile(existing.file_path, code, 'utf-8');
      } catch (error) {
        console.warn('파일 업데이트 실패:', error);
      }
    }

    const query = `
      UPDATE test_scripts 
      SET name = IFNULL(?, name),
          code = IFNULL(?, code),
          status = IFNULL(?, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const params = [
      name || null,
      code || null,
      status || null,
      id
    ];

    await db.run(query, params);
    const updated = await db.get('SELECT * FROM test_scripts WHERE id = ?', [id]);

    // WebSocket으로 실시간 알림
    notifySubscribers('script', updated, { action: 'updated' });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('스크립트 업데이트 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 스크립트 삭제
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.get('SELECT * FROM test_scripts WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: '스크립트를 찾을 수 없습니다' });
    }

    // 파일 삭제 (있는 경우)
    if (existing.file_path) {
      try {
        await fs.unlink(existing.file_path);
      } catch (error) {
        console.warn('파일 삭제 실패:', error);
      }
    }

    await db.run('DELETE FROM test_scripts WHERE id = ?', [id]);

    // WebSocket으로 실시간 알림
    notifySubscribers('script', { id }, { action: 'deleted' });

    res.json({ success: true, message: '스크립트가 삭제되었습니다' });
  } catch (error) {
    console.error('스크립트 삭제 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 테스트케이스에 연결된 모든 스크립트 조회
 */
router.get('/test-case/:test_case_id', async (req, res) => {
  try {
    const { test_case_id } = req.params;
    const scripts = await db.all(
      'SELECT * FROM test_scripts WHERE test_case_id = ? ORDER BY created_at DESC',
      [test_case_id]
    );
    res.json({ success: true, data: scripts });
  } catch (error) {
    console.error('스크립트 조회 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

