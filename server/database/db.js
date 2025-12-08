/**
 * 데이터베이스 모듈
 * MySQL 데이터베이스 초기화 및 관리
 * 로컬 MySQL 사용, 원격 서버 연동은 추후 확장 가능
 */

const mysql = require('mysql2/promise');
const dbConfig = require('../config/database');

let pool = null;
let currentConfig = null;

/**
 * 데이터베이스 초기화
 */
async function init() {
  try {
    // 사용할 설정 선택
    currentConfig = dbConfig.type === 'remote' ? dbConfig.remote : dbConfig.local;
    
    // 연결 풀 생성
    pool = mysql.createPool({
      ...currentConfig,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // 연결 테스트
    const connection = await pool.getConnection();
    console.log('MySQL 데이터베이스 연결 성공');
    connection.release();

    // 테이블 생성
    await createTables();
    
    // 스키마 마이그레이션 (필드 추가 등)
    await migrateSchema();
    
    return true;
  } catch (error) {
    console.error('데이터베이스 연결 실패:', error);
    throw error;
  }
}

/**
 * 스키마 마이그레이션 (필드 추가 등)
 */
async function migrateSchema() {
  try {
    // test_cases 테이블에 preconditions 필드 추가 (없는 경우만)
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'test_cases' 
      AND COLUMN_NAME = 'preconditions'
    `);
    
    if (columns.length === 0) {
      await pool.execute(`
        ALTER TABLE test_cases 
        ADD COLUMN preconditions TEXT NULL 
        AFTER description
      `);
      console.log('✅ test_cases 테이블에 preconditions 필드 추가 완료');
    }
  } catch (error) {
    console.error('스키마 마이그레이션 실패:', error);
    // 마이그레이션 실패해도 계속 진행 (테이블이 없을 수 있음)
  }
}

/**
 * 테이블 생성
 */
async function createTables() {
  const queries = [
    // 프로젝트 테이블
    `CREATE TABLE IF NOT EXISTS projects (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_by VARCHAR(255),
      INDEX idx_projects_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 테스트케이스 테이블 (폴더 구조 지원)
    `CREATE TABLE IF NOT EXISTS test_cases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      tc_number INT NULL,
      parent_id INT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      preconditions TEXT,
      type ENUM('folder', 'test_case') DEFAULT 'test_case',
      steps TEXT,
      tags TEXT,
      status ENUM('draft', 'active', 'deprecated') DEFAULT 'draft',
      order_index INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_by VARCHAR(255),
      version INT DEFAULT 1,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES test_cases(id) ON DELETE CASCADE,
      UNIQUE KEY unique_project_tc_number (project_id, tc_number),
      INDEX idx_test_cases_project_id (project_id),
      INDEX idx_test_cases_parent_id (parent_id),
      INDEX idx_test_cases_status (status),
      INDEX idx_test_cases_type (type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 테스트 스크립트 테이블
    `CREATE TABLE IF NOT EXISTS test_scripts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      test_case_id INT NULL,
      name VARCHAR(255) NOT NULL,
      framework ENUM('pytest', 'playwright', 'selenium', 'appium') NOT NULL,
      language ENUM('python', 'javascript', 'typescript') NOT NULL,
      code LONGTEXT NOT NULL,
      file_path VARCHAR(500),
      status ENUM('active', 'deprecated') DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_by VARCHAR(255),
      FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
      INDEX idx_test_scripts_test_case_id (test_case_id),
      INDEX idx_test_scripts_framework (framework)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 테스트 실행 결과 테이블
    `CREATE TABLE IF NOT EXISTS test_results (
      id INT AUTO_INCREMENT PRIMARY KEY,
      test_case_id INT NULL,
      test_script_id INT NULL,
      status ENUM('passed', 'failed', 'error', 'skipped') NOT NULL,
      duration DECIMAL(10, 3),
      output TEXT,
      error_message TEXT,
      screenshots TEXT,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      executed_by VARCHAR(255),
      FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE SET NULL,
      FOREIGN KEY (test_script_id) REFERENCES test_scripts(id) ON DELETE SET NULL,
      INDEX idx_test_results_test_case_id (test_case_id),
      INDEX idx_test_results_executed_at (executed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 객체 레포지토리 테이블
    `CREATE TABLE IF NOT EXISTS objects (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      parent_id INT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      type ENUM('page', 'element') DEFAULT 'element',
      selectors TEXT NOT NULL,
      priority INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_by VARCHAR(255),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES objects(id) ON DELETE CASCADE,
      INDEX idx_objects_project_id (project_id),
      INDEX idx_objects_parent_id (parent_id),
      INDEX idx_objects_type (type),
      INDEX idx_objects_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 스냅샷 이미지 테이블 (verifyImage 액션용)
    `CREATE TABLE IF NOT EXISTS snapshot_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      test_case_id INT NOT NULL,
      step_index INT NOT NULL,
      snapshot_name VARCHAR(255) NOT NULL,
      image_data LONGBLOB NOT NULL,
      selector TEXT,
      element_x INT,
      element_y INT,
      element_width INT,
      element_height INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
      INDEX idx_snapshot_images_test_case_id (test_case_id),
      INDEX idx_snapshot_images_step_index (step_index),
      INDEX idx_snapshot_images_name (snapshot_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // DOM 스냅샷 테이블 (로케이터 자동 회복용)
    `CREATE TABLE IF NOT EXISTS dom_snapshots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      normalized_url VARCHAR(500) NOT NULL,
      snapshot_data LONGTEXT NOT NULL,
      snapshot_hash VARCHAR(64) NOT NULL,
      page_title VARCHAR(500),
      captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      metadata JSON,
      INDEX idx_normalized_url (normalized_url),
      INDEX idx_expires_at (expires_at),
      INDEX idx_captured_at (captured_at),
      UNIQUE KEY unique_url_hash (normalized_url, snapshot_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 로케이터 힐링 히스토리 테이블
    `CREATE TABLE IF NOT EXISTS locator_healing_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      test_script_id INT NOT NULL,
      test_case_id INT NULL,
      failed_locator TEXT NOT NULL,
      healed_locator TEXT NOT NULL,
      healing_method VARCHAR(50),
      snapshot_id INT,
      page_url VARCHAR(500),
      healed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      success BOOLEAN DEFAULT TRUE,
      FOREIGN KEY (test_script_id) REFERENCES test_scripts(id) ON DELETE CASCADE,
      FOREIGN KEY (snapshot_id) REFERENCES dom_snapshots(id) ON DELETE SET NULL,
      INDEX idx_test_script_id (test_script_id),
      INDEX idx_healed_at (healed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  ];

  try {
    for (const query of queries) {
      await pool.execute(query);
    }
    console.log('데이터베이스 테이블 생성 완료');
  } catch (error) {
    console.error('테이블 생성 실패:', error);
    throw error;
  }
}

/**
 * 데이터베이스 쿼리 실행 (INSERT, UPDATE, DELETE)
 */
async function run(query, params = []) {
  try {
    const [result] = await pool.execute(query, params);
    return {
      lastID: result.insertId || null,
      changes: result.affectedRows || 0
    };
  } catch (error) {
    console.error('쿼리 실행 실패:', error);
    throw error;
  }
}

/**
 * 데이터베이스 단일 행 조회
 */
async function get(query, params = []) {
  try {
    const [rows] = await pool.execute(query, params);
    return rows[0] || null;
  } catch (error) {
    console.error('데이터 조회 실패:', error);
    throw error;
  }
}

/**
 * 데이터베이스 여러 행 조회
 */
async function all(query, params = []) {
  try {
    const [rows] = await pool.execute(query, params);
    return rows;
  } catch (error) {
    console.error('데이터 조회 실패:', error);
    throw error;
  }
}

/**
 * 트랜잭션 시작
 */
async function beginTransaction() {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  return connection;
}

/**
 * 트랜잭션 커밋
 */
async function commit(connection) {
  await connection.commit();
  connection.release();
}

/**
 * 트랜잭션 롤백
 */
async function rollback(connection) {
  await connection.rollback();
  connection.release();
}

/**
 * 데이터베이스 연결 종료
 */
async function close() {
  try {
    if (pool) {
      await pool.end();
      console.log('데이터베이스 연결 종료');
    }
  } catch (error) {
    console.error('데이터베이스 연결 종료 실패:', error);
    throw error;
  }
}

/**
 * 연결 상태 확인
 */
async function checkConnection() {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  init,
  run,
  get,
  all,
  beginTransaction,
  commit,
  rollback,
  close,
  checkConnection,
  getPool: () => pool,
  getConfig: () => currentConfig
};
