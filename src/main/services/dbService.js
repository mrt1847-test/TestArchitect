/**
 * 데이터베이스 서비스
 * Electron 메인 프로세스에서 직접 SQLite 연결
 * 로컬 파일 기반 데이터베이스 (서버 불필요)
 * sql.js 사용 (순수 JavaScript, 네이티브 빌드 불필요)
 * 
 * 현재는 로컬 모드만 지원하며, 나중에 서버 모드로 전환 가능하도록 구조화됨
 * config.database.mode를 'local' 또는 'server'로 설정하여 전환 가능
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let db = null;
let dbPath = null;
let SQL = null;

/**
 * 데이터베이스 경로 가져오기
 */
function getDbPath() {
  // 사용자 데이터 디렉토리 사용
  const userDataPath = app.getPath('userData');
  const dbDir = path.join(userDataPath, 'database');
  
  // 디렉토리가 없으면 생성
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  return path.join(dbDir, 'testarchitect.db');
}

/**
 * 데이터베이스 초기화
 */
async function init() {
  try {
    dbPath = getDbPath();
    console.log(`📁 데이터베이스 경로: ${dbPath}`);
    
    // sql.js 초기화
    if (!SQL) {
      SQL = await initSqlJs();
    }
    
    // 기존 데이터베이스 파일이 있으면 로드, 없으면 새로 생성
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
      console.log('✅ 기존 SQLite 데이터베이스 로드 완료');
    } else {
      db = new SQL.Database();
      console.log('✅ 새 SQLite 데이터베이스 생성 완료');
    }
    
    // 테이블 생성
    createTables();
    
    // 마이그레이션 실행 (컬럼 추가 등)
    migrateTables();
    
    // 변경사항 저장
    saveDatabase();
    
    return true;
  } catch (error) {
    console.error('❌ 데이터베이스 연결 실패:', error);
    throw error;
  }
}

/**
 * 데이터베이스 저장
 */
function saveDatabase() {
  if (db && dbPath) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (error) {
      console.error('❌ 데이터베이스 저장 실패:', error);
    }
  }
}

/**
 * 테이블 생성
 */
function createTables() {
  const queries = [
    // 프로젝트 테이블
    `CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // 테스트케이스 테이블 (폴더 구조 지원)
    `CREATE TABLE IF NOT EXISTS test_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      tc_number INTEGER,
      parent_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      preconditions TEXT,
      type TEXT DEFAULT 'test_case' CHECK(type IN ('folder', 'test_case')),
      steps TEXT,
      tags TEXT,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'deprecated')),
      order_index INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT,
      version INTEGER DEFAULT 1,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES test_cases(id) ON DELETE CASCADE,
      UNIQUE(project_id, tc_number)
    )`,

    // 테스트 스크립트 테이블
    `CREATE TABLE IF NOT EXISTS test_scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_case_id INTEGER,
      name TEXT NOT NULL,
      framework TEXT NOT NULL CHECK(framework IN ('pytest', 'playwright', 'selenium', 'appium')),
      language TEXT NOT NULL CHECK(language IN ('python', 'javascript', 'typescript')),
      code TEXT NOT NULL,
      file_path TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'deprecated')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT,
      FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
    )`,

    // 테스트 실행 결과 테이블
    `CREATE TABLE IF NOT EXISTS test_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_case_id INTEGER,
      test_script_id INTEGER,
      status TEXT NOT NULL CHECK(status IN ('passed', 'failed', 'error', 'skipped')),
      duration REAL,
      output TEXT,
      error_message TEXT,
      screenshots TEXT,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      executed_by TEXT,
      FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE SET NULL,
      FOREIGN KEY (test_script_id) REFERENCES test_scripts(id) ON DELETE SET NULL
    )`,

    // 객체 레포지토리 테이블
    `CREATE TABLE IF NOT EXISTS objects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      parent_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'element' CHECK(type IN ('page', 'element')),
      selectors TEXT NOT NULL,
      priority INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES objects(id) ON DELETE CASCADE
    )`,

    // Page Objects 테이블 (POM 지원)
    `CREATE TABLE IF NOT EXISTS page_objects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      url_patterns TEXT,
      framework TEXT NOT NULL CHECK(framework IN ('pytest', 'playwright', 'selenium', 'appium')),
      language TEXT NOT NULL CHECK(language IN ('python', 'javascript', 'typescript')),
      code TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'deprecated')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, name)
    )`,

    // Page Object Methods 테이블
    `CREATE TABLE IF NOT EXISTS page_object_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_object_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      parameters TEXT,
      code TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (page_object_id) REFERENCES page_objects(id) ON DELETE CASCADE,
      UNIQUE(page_object_id, name)
    )`,

    // 페이지 DOM 스냅샷 테이블
    `CREATE TABLE IF NOT EXISTS page_dom_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_url TEXT NOT NULL,
      dom_structure TEXT NOT NULL,
      snapshot_date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // 테스트케이스 스텝 스크린샷 테이블
    `CREATE TABLE IF NOT EXISTS test_case_steps_screenshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_case_id INTEGER NOT NULL,
      step_index INTEGER NOT NULL,
      screenshot TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
      UNIQUE(test_case_id, step_index)
    )`
  ];

  try {
    // 인덱스 생성
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name)',
      'CREATE INDEX IF NOT EXISTS idx_test_cases_project_id ON test_cases(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_test_cases_parent_id ON test_cases(parent_id)',
      'CREATE INDEX IF NOT EXISTS idx_test_cases_status ON test_cases(status)',
      'CREATE INDEX IF NOT EXISTS idx_test_cases_type ON test_cases(type)',
      'CREATE INDEX IF NOT EXISTS idx_test_scripts_test_case_id ON test_scripts(test_case_id)',
      'CREATE INDEX IF NOT EXISTS idx_test_scripts_framework ON test_scripts(framework)',
      'CREATE INDEX IF NOT EXISTS idx_test_results_test_case_id ON test_results(test_case_id)',
      'CREATE INDEX IF NOT EXISTS idx_test_results_executed_at ON test_results(executed_at)',
      'CREATE INDEX IF NOT EXISTS idx_objects_project_id ON objects(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_objects_parent_id ON objects(parent_id)',
      'CREATE INDEX IF NOT EXISTS idx_objects_type ON objects(type)',
      'CREATE INDEX IF NOT EXISTS idx_objects_name ON objects(name)',
      'CREATE INDEX IF NOT EXISTS idx_page_objects_project_id ON page_objects(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_page_objects_name ON page_objects(name)',
      'CREATE INDEX IF NOT EXISTS idx_page_object_methods_page_object_id ON page_object_methods(page_object_id)',
      'CREATE INDEX IF NOT EXISTS idx_page_dom_snapshots_page_url ON page_dom_snapshots(page_url)',
      'CREATE INDEX IF NOT EXISTS idx_page_dom_snapshots_snapshot_date ON page_dom_snapshots(snapshot_date)',
      'CREATE INDEX IF NOT EXISTS idx_page_dom_snapshots_url_date ON page_dom_snapshots(page_url, snapshot_date)',
      'CREATE INDEX IF NOT EXISTS idx_step_screenshots_test_case_id ON test_case_steps_screenshots(test_case_id)',
      'CREATE INDEX IF NOT EXISTS idx_step_screenshots_step_index ON test_case_steps_screenshots(test_case_id, step_index)'
    ];

    // 쿼리 실행
    for (const query of queries) {
      db.run(query);
    }
    
    // 인덱스 생성
    for (const index of indexes) {
      try {
        db.run(index);
      } catch (e) {
        // 인덱스가 이미 존재하면 무시
      }
    }
    
    console.log('✅ 데이터베이스 테이블 생성 완료');
  } catch (error) {
    console.error('❌ 테이블 생성 실패:', error);
    throw error;
  }

  // 기존 테이블 마이그레이션 (컬럼 추가)
  migrateTables();
}

/**
 * 실행 결과 정리 (최근 N개만 보관)
 * @param {number} keepCount - 보관할 결과 개수 (기본값: 100)
 */
function cleanupOldResults(keepCount = 100) {
  try {
    ensureInitialized();
    
    // 최근 N개의 ID 조회
    const keepResults = all(
      `SELECT id FROM test_results 
       ORDER BY executed_at DESC 
       LIMIT ?`,
      [keepCount]
    );
    
    if (keepResults.length > 0) {
      const keepIds = keepResults.map(r => r.id);
      const placeholders = keepIds.map(() => '?').join(',');
      
      // 나머지 삭제
      const deleted = run(
        `DELETE FROM test_results 
         WHERE id NOT IN (${placeholders})`,
        keepIds
      );
      
      if (deleted.changes > 0) {
        console.log(`✅ 오래된 실행 결과 ${deleted.changes}개 삭제 (최근 ${keepCount}개만 보관)`);
        saveDatabase();
      }
    }
  } catch (error) {
    console.warn('⚠️ 실행 결과 정리 실패:', error.message);
  }
}

/**
 * 기존 테이블 마이그레이션 (컬럼 추가)
 */
function migrateTables() {
  try {
    // test_cases 테이블에 컬럼이 있는지 확인
    const tableInfo = db.exec("PRAGMA table_info(test_cases)");
    if (tableInfo && tableInfo.length > 0) {
      // sql.js는 결과를 {columns: [...], values: [[...], ...]} 형태로 반환
      const result = tableInfo[0];
      const columnNames = result.values.map(row => row[1]); // 컬럼 이름은 두 번째 컬럼 (cid, name, type, ...)
      
      // tc_number 컬럼이 없으면 추가
      if (!columnNames.includes('tc_number')) {
        console.log('📝 test_cases 테이블에 tc_number 컬럼 추가 중...');
        try {
          db.exec('ALTER TABLE test_cases ADD COLUMN tc_number INTEGER');
          console.log('✅ tc_number 컬럼 추가 완료');
          saveDatabase();
        } catch (alterError) {
          // 이미 컬럼이 있거나 다른 오류
          console.warn('⚠️ tc_number 컬럼 추가 실패:', alterError.message);
        }
      } else {
        console.log('✅ tc_number 컬럼이 이미 존재합니다.');
      }
      
      // preconditions 컬럼이 없으면 추가
      if (!columnNames.includes('preconditions')) {
        console.log('📝 test_cases 테이블에 preconditions 컬럼 추가 중...');
        try {
          db.exec('ALTER TABLE test_cases ADD COLUMN preconditions TEXT');
          console.log('✅ preconditions 컬럼 추가 완료');
          saveDatabase();
        } catch (alterError) {
          // 이미 컬럼이 있거나 다른 오류
          console.warn('⚠️ preconditions 컬럼 추가 실패:', alterError.message);
        }
      } else {
        console.log('✅ preconditions 컬럼이 이미 존재합니다.');
      }
    }
  } catch (error) {
    // 테이블이 없거나 이미 컬럼이 있는 경우 무시
    console.warn('⚠️ 마이그레이션 경고:', error.message);
  }
}

/**
 * 데이터베이스 연결 확인
 */
function ensureInitialized() {
  if (!db) {
    console.error('❌ 데이터베이스가 초기화되지 않았습니다. 초기화를 시도합니다...');
    // 동기식 초기화는 불가능하므로 오류 발생
    throw new Error('데이터베이스가 초기화되지 않았습니다. 앱을 재시작하세요.');
  }
}

/**
 * 데이터베이스 쿼리 실행 (INSERT, UPDATE, DELETE)
 */
function run(query, params = []) {
  try {
    ensureInitialized();
    
    // sql.js는 prepare를 사용하여 파라미터 바인딩
    const stmt = db.prepare(query);
    
    if (params && params.length > 0) {
      stmt.bind(params);
    }
    
    stmt.step();
    stmt.free();
    
    saveDatabase(); // 변경사항 즉시 저장
    
    // last_insert_rowid와 changes 가져오기
    const lastIdResult = db.exec('SELECT last_insert_rowid() as id');
    const changesResult = db.exec('SELECT changes() as changes');
    
    return {
      lastID: lastIdResult.length > 0 && lastIdResult[0].values.length > 0 
        ? lastIdResult[0].values[0][0] 
        : null,
      changes: changesResult.length > 0 && changesResult[0].values.length > 0 
        ? changesResult[0].values[0][0] 
        : 0
    };
  } catch (error) {
    console.error('❌ 쿼리 실행 실패:', error);
    throw error;
  }
}

/**
 * 데이터베이스 단일 행 조회
 */
function get(query, params = []) {
  try {
    ensureInitialized();
    
    // sql.js는 prepare를 사용하여 파라미터 바인딩
    const stmt = db.prepare(query);
    
    if (params && params.length > 0) {
      stmt.bind(params);
    }
    
    let result = null;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    
    stmt.free();
    
    // 빈 객체인지 확인 (sql.js는 빈 객체를 반환할 수 있음)
    if (result && Object.keys(result).length > 0) {
      return result;
    }
    return null;
  } catch (error) {
    console.error('❌ 데이터 조회 실패:', error);
    throw error;
  }
}

/**
 * 데이터베이스 여러 행 조회
 */
function all(query, params = []) {
  try {
    ensureInitialized();
    
    // sql.js는 prepare를 사용하여 파라미터 바인딩
    const stmt = db.prepare(query);
    const result = [];
    
    if (params && params.length > 0) {
      stmt.bind(params);
    }
    
    while (stmt.step()) {
      result.push(stmt.getAsObject());
    }
    
    stmt.free();
    return result;
  } catch (error) {
    console.error('❌ 데이터 조회 실패:', error);
    throw error;
  }
}

/**
 * 연결 종료
 */
function close() {
  if (db) {
    saveDatabase(); // 종료 전 저장
    db.close();
    db = null;
    console.log('데이터베이스 연결 종료');
  }
}

/**
 * 현재 설정 반환
 */
function getConfig() {
  return {
    type: 'sqlite',
    path: dbPath,
    connected: db !== null
  };
}

/**
 * 데이터베이스 백업
 */
function backup(backupPath) {
  if (!db) {
    throw new Error('데이터베이스가 연결되지 않았습니다.');
  }
  
  try {
    saveDatabase();
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(backupPath, buffer);
    console.log(`✅ 백업 완료: ${backupPath}`);
  } catch (error) {
    console.error('❌ 백업 실패:', error);
    throw error;
  }
}

/**
 * DOM 스냅샷 저장
 * @param {string} pageUrl - 정규화된 페이지 URL
 * @param {string} domStructure - 압축된 DOM 구조
 * @param {Date} snapshotDate - 스냅샷 날짜
 * @returns {Promise<Object>} 저장 결과
 */
function saveDomSnapshot(pageUrl, domStructure, snapshotDate) {
  try {
    ensureInitialized();
    
    const dateStr = snapshotDate.toISOString().split('T')[0]; // YYYY-MM-DD 형식
    
    const result = run(
      `INSERT INTO page_dom_snapshots (page_url, dom_structure, snapshot_date)
       VALUES (?, ?, ?)`,
      [pageUrl, domStructure, dateStr]
    );
    
    console.log(`✅ DOM 스냅샷 저장 완료: ${pageUrl} (${dateStr})`);
    return { success: true, id: result.lastID };
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
function checkDomSnapshotInPeriod(pageUrl, startDate, endDate) {
  try {
    ensureInitialized();
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const result = get(
      `SELECT COUNT(*) as count FROM page_dom_snapshots
       WHERE page_url = ? AND snapshot_date >= ? AND snapshot_date <= ?`,
      [pageUrl, startDateStr, endDateStr]
    );
    
    return result && result.count > 0;
  } catch (error) {
    console.error('❌ DOM 스냅샷 확인 실패:', error);
    return false;
  }
}

/**
 * 60일 이상 된 스냅샷 삭제
 * @returns {Promise<number>} 삭제된 레코드 수
 */
function cleanupOldDomSnapshots() {
  try {
    ensureInitialized();
    
    // 60일 전 날짜 계산
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 60);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
    
    // 삭제 전 개수 확인
    const beforeCount = get(
      `SELECT COUNT(*) as count FROM page_dom_snapshots WHERE snapshot_date < ?`,
      [cutoffDateStr]
    );
    
    const deletedCount = beforeCount ? beforeCount.count : 0;
    
    if (deletedCount > 0) {
      const result = run(
        `DELETE FROM page_dom_snapshots WHERE snapshot_date < ?`,
        [cutoffDateStr]
      );
      
      console.log(`✅ 오래된 DOM 스냅샷 ${result.changes}개 삭제 (60일 이상)`);
      return result.changes;
    }
    
    return 0;
  } catch (error) {
    console.warn('⚠️ DOM 스냅샷 정리 실패:', error.message);
    return 0;
  }
}

/**
 * 스텝 스크린샷 저장
 * @param {number} tcId - 테스트케이스 ID
 * @param {number} stepIndex - 스텝 인덱스
 * @param {string} screenshot - base64 인코딩된 스크린샷 (data:image/png;base64,...)
 * @returns {Promise<Object>} 저장 결과
 */
function saveStepScreenshot(tcId, stepIndex, screenshot) {
  try {
    ensureInitialized();
    
    // 기존 스크린샷이 있으면 업데이트, 없으면 삽입
    const existing = get(
      'SELECT id FROM test_case_steps_screenshots WHERE test_case_id = ? AND step_index = ?',
      [tcId, stepIndex]
    );
    
    if (existing) {
      run(
        'UPDATE test_case_steps_screenshots SET screenshot = ?, created_at = CURRENT_TIMESTAMP WHERE test_case_id = ? AND step_index = ?',
        [screenshot, tcId, stepIndex]
      );
    } else {
      run(
        'INSERT INTO test_case_steps_screenshots (test_case_id, step_index, screenshot) VALUES (?, ?, ?)',
        [tcId, stepIndex, screenshot]
      );
    }
    
    saveDatabase();
    return { success: true };
  } catch (error) {
    console.error('❌ 스텝 스크린샷 저장 실패:', error);
    throw error;
  }
}

/**
 * 스텝 스크린샷 조회
 * @param {number} tcId - 테스트케이스 ID
 * @param {number} stepIndex - 스텝 인덱스
 * @returns {string|null} base64 인코딩된 스크린샷 또는 null
 */
function getStepScreenshot(tcId, stepIndex) {
  try {
    ensureInitialized();
    
    const result = get(
      'SELECT screenshot FROM test_case_steps_screenshots WHERE test_case_id = ? AND step_index = ?',
      [tcId, stepIndex]
    );
    
    return result ? result.screenshot : null;
  } catch (error) {
    console.error('❌ 스텝 스크린샷 조회 실패:', error);
    return null;
  }
}

/**
 * 테스트케이스의 모든 스텝 스크린샷 삭제
 * @param {number} tcId - 테스트케이스 ID
 * @returns {Promise<number>} 삭제된 레코드 수
 */
function deleteStepScreenshots(tcId) {
  try {
    ensureInitialized();
    
    const result = run(
      'DELETE FROM test_case_steps_screenshots WHERE test_case_id = ?',
      [tcId]
    );
    
    saveDatabase();
    return result.changes || 0;
  } catch (error) {
    console.error('❌ 스텝 스크린샷 삭제 실패:', error);
    return 0;
  }
}

module.exports = {
  init,
  run,
  get,
  all,
  close,
  cleanupOldResults,
  getConfig,
  backup,
  saveDomSnapshot,
  checkDomSnapshotInPeriod,
  cleanupOldDomSnapshots,
  saveStepScreenshot,
  getStepScreenshot,
  deleteStepScreenshots
};
