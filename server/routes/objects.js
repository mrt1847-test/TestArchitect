/**
 * 객체 레포지토리 라우트
 * CRUD 작업 및 실시간 동기화
 */

const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { notifySubscribers } = require('../index');

/**
 * 프로젝트의 객체 트리 조회 (폴더 구조 포함)
 */
router.get('/project/:projectId/tree', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // 프로젝트의 모든 객체 조회
    const objects = await db.all(
      'SELECT * FROM objects WHERE project_id = ? ORDER BY parent_id, priority, name',
      [projectId]
    );

    // 트리 구조로 변환
    const tree = buildTree(objects, null);

    res.json({ success: true, data: tree });
  } catch (error) {
    console.error('객체 트리 조회 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 트리 구조 빌드 헬퍼 함수
 */
function buildTree(items, parentId) {
  const parentIdValue = parentId === null ? null : parentId;
  
  return items
    .filter(item => {
      if (parentIdValue === null) {
        return item.parent_id === null;
      }
      return item.parent_id === parentIdValue;
    })
    .map(item => {
      const node = {
        id: item.id,
        name: item.name,
        description: item.description,
        type: item.type,
        priority: item.priority,
        created_at: item.created_at,
        updated_at: item.updated_at
      };

      // selectors 파싱
      try {
        node.selectors = item.selectors ? JSON.parse(item.selectors) : [];
      } catch (e) {
        node.selectors = [];
      }

      // 자식 노드 추가
      const children = buildTree(items, item.id);
      if (children.length > 0) {
        node.children = children;
      }

      return node;
    })
    .sort((a, b) => a.priority - b.priority);
}

/**
 * 모든 객체 조회
 */
router.get('/', async (req, res) => {
  try {
    const { project_id, type, search } = req.query;
    let query = 'SELECT * FROM objects WHERE 1=1';
    const params = [];

    if (project_id) {
      query += ' AND project_id = ?';
      params.push(project_id);
    }

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (search) {
      query += ' AND (name LIKE ? OR description LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    query += ' ORDER BY parent_id, priority, name';

    const objects = await db.all(query, params);
    
    // JSON 필드 파싱 (MySQL에서 TEXT는 문자열로 반환)
    const parsed = objects.map(obj => {
      const result = { ...obj };
      
      try {
        result.selectors = obj.selectors ? JSON.parse(obj.selectors) : [];
      } catch (e) {
        result.selectors = [];
      }
      
      return result;
    });

    res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('객체 조회 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 특정 객체 조회
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const object = await db.get('SELECT * FROM objects WHERE id = ?', [id]);

    if (!object) {
      return res.status(404).json({ success: false, error: '객체를 찾을 수 없습니다' });
    }

    // JSON 필드 파싱 (MySQL에서 TEXT는 문자열로 반환)
    try {
      object.selectors = object.selectors ? JSON.parse(object.selectors) : [];
    } catch (e) {
      object.selectors = [];
    }

    res.json({ success: true, data: object });
  } catch (error) {
    console.error('객체 조회 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 객체 생성
 */
router.post('/', async (req, res) => {
  try {
    const { project_id, parent_id, name, description, type, selectors, priority, created_by } = req.body;

    if (!project_id || !name) {
      return res.status(400).json({ 
        success: false, 
        error: 'project_id와 name은 필수입니다' 
      });
    }

    if (!selectors || !Array.isArray(selectors) || selectors.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'selectors는 배열 형태로 최소 1개 이상 필요합니다' 
      });
    }

    const query = `
      INSERT INTO objects (project_id, parent_id, name, description, type, selectors, priority, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      project_id,
      parent_id || null,
      name,
      description || null,
      type || 'element',
      JSON.stringify(selectors),
      priority || 0,
      created_by || null
    ];

    const result = await db.run(query, params);
    const newObject = await db.get('SELECT * FROM objects WHERE id = ?', [result.insertId]);

    // JSON 필드 파싱 (MySQL에서 TEXT는 문자열로 반환)
    try {
      newObject.selectors = newObject.selectors ? JSON.parse(newObject.selectors) : [];
    } catch (e) {
      newObject.selectors = [];
    }

    // WebSocket으로 실시간 알림
    notifySubscribers('object', newObject, { action: 'created' });

    res.status(201).json({ success: true, data: newObject });
  } catch (error) {
    console.error('객체 생성 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 객체 업데이트
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, selectors, priority } = req.body;

    // 기존 객체 확인
    const existing = await db.get('SELECT * FROM objects WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: '객체를 찾을 수 없습니다' });
    }

    // MySQL에서는 IFNULL 또는 직접 조건 사용
    const query = `
      UPDATE objects 
      SET name = IFNULL(?, name),
          description = IFNULL(?, description),
          selectors = IFNULL(?, selectors),
          priority = IFNULL(?, priority),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const params = [
      name || null,
      description !== undefined ? description : null,
      selectors ? JSON.stringify(selectors) : null,
      priority !== undefined ? priority : null,
      id
    ];

    await db.run(query, params);
    const updated = await db.get('SELECT * FROM objects WHERE id = ?', [id]);

    // JSON 필드 파싱 (MySQL에서 TEXT는 문자열로 반환)
    try {
      updated.selectors = updated.selectors ? JSON.parse(updated.selectors) : [];
    } catch (e) {
      updated.selectors = [];
    }

    // WebSocket으로 실시간 알림
    notifySubscribers('object', updated, { action: 'updated' });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('객체 업데이트 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 객체 삭제
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.get('SELECT * FROM objects WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: '객체를 찾을 수 없습니다' });
    }

    await db.run('DELETE FROM objects WHERE id = ?', [id]);

    // WebSocket으로 실시간 알림
    notifySubscribers('object', { id }, { action: 'deleted' });

    res.json({ success: true, message: '객체가 삭제되었습니다' });
  } catch (error) {
    console.error('객체 삭제 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

