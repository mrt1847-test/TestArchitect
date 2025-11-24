/**
 * 테스트케이스 라우트
 * CRUD 작업 및 실시간 동기화
 */

const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { notifySubscribers } = require('../index');

/**
 * 프로젝트의 테스트케이스 트리 조회 (폴더 구조 포함)
 */
router.get('/project/:projectId/tree', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // 프로젝트의 모든 TC 조회
    const testCases = await db.all(
      'SELECT * FROM test_cases WHERE project_id = ? ORDER BY parent_id, order_index, name',
      [projectId]
    );

    // 스크립트 존재 여부 확인
    const testCaseIds = testCases.map(tc => tc.id);
    let scriptsMap = {};
    if (testCaseIds.length > 0) {
      const placeholders = testCaseIds.map(() => '?').join(',');
      const scripts = await db.all(
        `SELECT DISTINCT test_case_id FROM test_scripts WHERE test_case_id IN (${placeholders}) AND status = 'active'`,
        testCaseIds
      );
      scripts.forEach(s => {
        scriptsMap[s.test_case_id] = true;
      });
    }

    // 트리 구조로 변환
    const tree = buildTree(testCases, null, scriptsMap);

    res.json({ success: true, data: tree });
  } catch (error) {
    console.error('테스트케이스 트리 조회 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 트리 구조 빌드 헬퍼 함수
 */
function buildTree(items, parentId, scriptsMap) {
  // MySQL에서는 NULL 비교를 위해 명시적으로 처리
  const parentIdValue = parentId === null ? null : parentId;
  
  return items
    .filter(item => {
      // MySQL에서 NULL 비교
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
        status: item.status,
        hasScript: scriptsMap[item.id] || false,
        order_index: item.order_index,
        created_at: item.created_at,
        updated_at: item.updated_at
      };

      if (item.type === 'test_case') {
        // MySQL에서 TEXT/LONGTEXT는 문자열로 반환되므로 파싱
        try {
          node.steps = item.steps ? JSON.parse(item.steps) : [];
        } catch (e) {
          node.steps = [];
        }
        try {
          node.tags = item.tags ? JSON.parse(item.tags) : [];
        } catch (e) {
          node.tags = [];
        }
      }

      // 자식 노드 추가
      const children = buildTree(items, item.id, scriptsMap);
      if (children.length > 0) {
        node.children = children;
      }

      return node;
    })
    .sort((a, b) => a.order_index - b.order_index);
}

/**
 * 모든 테스트케이스 조회
 */
router.get('/', async (req, res) => {
  try {
    const { project_id, status, search, type } = req.query;
    let query = 'SELECT * FROM test_cases WHERE 1=1';
    const params = [];

    if (project_id) {
      query += ' AND project_id = ?';
      params.push(project_id);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
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

    query += ' ORDER BY parent_id, order_index, name';

    const testCases = await db.all(query, params);
    
    // JSON 필드 파싱 (MySQL에서 TEXT는 문자열로 반환)
    const parsed = testCases.map(tc => {
      const result = { ...tc };
      
      try {
        result.tags = tc.tags ? JSON.parse(tc.tags) : [];
      } catch (e) {
        result.tags = [];
      }
      
      if (tc.type === 'test_case' && tc.steps) {
        try {
          result.steps = JSON.parse(tc.steps);
        } catch (e) {
          result.steps = [];
        }
      }
      
      return result;
    });

    res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('테스트케이스 조회 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 특정 테스트케이스 조회
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const testCase = await db.get('SELECT * FROM test_cases WHERE id = ?', [id]);

    if (!testCase) {
      return res.status(404).json({ success: false, error: '테스트케이스를 찾을 수 없습니다' });
    }

    // JSON 필드 파싱 (MySQL에서 TEXT는 문자열로 반환)
    try {
      testCase.steps = testCase.steps ? JSON.parse(testCase.steps) : [];
    } catch (e) {
      testCase.steps = [];
    }
    try {
      testCase.tags = testCase.tags ? JSON.parse(testCase.tags) : [];
    } catch (e) {
      testCase.tags = [];
    }

    res.json({ success: true, data: testCase });
  } catch (error) {
    console.error('테스트케이스 조회 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 테스트케이스 생성
 */
router.post('/', async (req, res) => {
  try {
    const { project_id, parent_id, name, description, type, steps, tags, status, order_index, created_by } = req.body;

    if (!project_id || !name) {
      return res.status(400).json({ 
        success: false, 
        error: 'project_id와 name은 필수입니다' 
      });
    }

    // 폴더인 경우 steps 불필요, test_case인 경우 steps 필요
    if (type === 'test_case' && !steps) {
      return res.status(400).json({ 
        success: false, 
        error: 'test_case 타입은 steps가 필수입니다' 
      });
    }

    const query = `
      INSERT INTO test_cases (project_id, parent_id, name, description, type, steps, tags, status, order_index, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      project_id,
      parent_id || null,
      name,
      description || null,
      type || 'test_case',
      type === 'test_case' ? JSON.stringify(steps) : null,
      JSON.stringify(tags || []),
      status || 'draft',
      order_index || 0,
      created_by || null
    ];

    const result = await db.run(query, params);
    const newTestCase = await db.get('SELECT * FROM test_cases WHERE id = ?', [result.lastID]);

    // JSON 필드 파싱 (MySQL에서 TEXT는 문자열로 반환)
    try {
      newTestCase.steps = newTestCase.steps ? JSON.parse(newTestCase.steps) : null;
    } catch (e) {
      newTestCase.steps = null;
    }
    try {
      newTestCase.tags = newTestCase.tags ? JSON.parse(newTestCase.tags) : [];
    } catch (e) {
      newTestCase.tags = [];
    }

    // WebSocket으로 실시간 알림
    notifySubscribers('test-case', newTestCase, { action: 'created' });

    res.status(201).json({ success: true, data: newTestCase });
  } catch (error) {
    console.error('테스트케이스 생성 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 테스트케이스 업데이트
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, steps, tags, status } = req.body;

    // 기존 테스트케이스 확인
    const existing = await db.get('SELECT * FROM test_cases WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: '테스트케이스를 찾을 수 없습니다' });
    }

    // MySQL에서는 IFNULL 또는 직접 조건 사용
    const query = `
      UPDATE test_cases 
      SET name = IFNULL(?, name),
          description = IFNULL(?, description),
          steps = IFNULL(?, steps),
          tags = IFNULL(?, tags),
          status = IFNULL(?, status),
          updated_at = CURRENT_TIMESTAMP,
          version = version + 1
      WHERE id = ?
    `;

    const params = [
      name || null,
      description !== undefined ? description : null,
      steps ? JSON.stringify(steps) : null,
      tags ? JSON.stringify(tags) : null,
      status || null,
      id
    ];

    await db.run(query, params);
    const updated = await db.get('SELECT * FROM test_cases WHERE id = ?', [id]);

    // JSON 필드 파싱 (MySQL에서 TEXT는 문자열로 반환)
    try {
      updated.steps = updated.steps ? JSON.parse(updated.steps) : null;
    } catch (e) {
      updated.steps = null;
    }
    try {
      updated.tags = updated.tags ? JSON.parse(updated.tags) : [];
    } catch (e) {
      updated.tags = [];
    }

    // WebSocket으로 실시간 알림
    notifySubscribers('test-case', updated, { action: 'updated' });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('테스트케이스 업데이트 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 테스트케이스 삭제
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.get('SELECT * FROM test_cases WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: '테스트케이스를 찾을 수 없습니다' });
    }

    await db.run('DELETE FROM test_cases WHERE id = ?', [id]);

    // WebSocket으로 실시간 알림
    notifySubscribers('test-case', { id }, { action: 'deleted' });

    res.json({ success: true, message: '테스트케이스가 삭제되었습니다' });
  } catch (error) {
    console.error('테스트케이스 삭제 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

