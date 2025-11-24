/**
 * 프로젝트 라우트
 * 프로젝트 CRUD 작업
 */

const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { notifySubscribers } = require('../index');

/**
 * 모든 프로젝트 조회
 */
router.get('/', async (req, res) => {
  try {
    const projects = await db.all('SELECT * FROM projects ORDER BY updated_at DESC');
    res.json({ success: true, data: projects });
  } catch (error) {
    console.error('프로젝트 조회 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 특정 프로젝트 조회
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const project = await db.get('SELECT * FROM projects WHERE id = ?', [id]);

    if (!project) {
      return res.status(404).json({ success: false, error: '프로젝트를 찾을 수 없습니다' });
    }

    res.json({ success: true, data: project });
  } catch (error) {
    console.error('프로젝트 조회 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 프로젝트 생성
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, created_by } = req.body;

    if (!name) {
      return res.status(400).json({ 
        success: false, 
        error: 'name은 필수입니다' 
      });
    }

    const query = `
      INSERT INTO projects (name, description, created_by)
      VALUES (?, ?, ?)
    `;

    const params = [
      name,
      description || null,
      created_by || null
    ];

    const result = await db.run(query, params);
    const newProject = await db.get('SELECT * FROM projects WHERE id = ?', [result.lastID]);

    res.status(201).json({ success: true, data: newProject });
  } catch (error) {
    console.error('프로젝트 생성 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 프로젝트 업데이트
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const existing = await db.get('SELECT * FROM projects WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: '프로젝트를 찾을 수 없습니다' });
    }

    const query = `
      UPDATE projects 
      SET name = IFNULL(?, name),
          description = IFNULL(?, description),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const params = [
      name || null,
      description !== undefined ? description : null,
      id
    ];

    await db.run(query, params);
    const updated = await db.get('SELECT * FROM projects WHERE id = ?', [id]);

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('프로젝트 업데이트 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 프로젝트 삭제
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.get('SELECT * FROM projects WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: '프로젝트를 찾을 수 없습니다' });
    }

    await db.run('DELETE FROM projects WHERE id = ?', [id]);

    res.json({ success: true, message: '프로젝트가 삭제되었습니다' });
  } catch (error) {
    console.error('프로젝트 삭제 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

