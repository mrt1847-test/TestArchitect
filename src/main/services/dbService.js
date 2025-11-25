/**
 * 데이터베이스 서비스
 * Electron 메인 프로세스에서 직접 SQLite 연결
 * 로컬 파일 기반 데이터베이스 (서버 불필요)
 * sql.js 사용 (순수 JavaScript, 네이티브 빌드 불필요)
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
      parent_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
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
      FOREIGN KEY (parent_id) REFERENCES test_cases(id) ON DELETE CASCADE
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
      'CREATE INDEX IF NOT EXISTS idx_objects_name ON objects(name)'
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

module.exports = {
  init,
  run,
  get,
  all,
  close,
  getConfig,
  backup
};
