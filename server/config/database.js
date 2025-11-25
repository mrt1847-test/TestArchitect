/**
 * 데이터베이스 설정
 * 로컬 MySQL 및 원격 서버 연결 설정
 */

module.exports = {
  // 로컬 MySQL 설정
  local: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'testarchitect',
    charset: 'utf8mb4',
    timezone: '+09:00',
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0
  },

  // 원격 서버 설정 (추후 사용)
  remote: {
    host: process.env.REMOTE_DB_HOST || '',
    port: process.env.REMOTE_DB_PORT || 3306,
    user: process.env.REMOTE_DB_USER || '',
    password: process.env.REMOTE_DB_PASSWORD || '',
    database: process.env.REMOTE_DB_NAME || 'testarchitect',
    charset: 'utf8mb4',
    timezone: '+09:00',
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0
  },

  // 사용할 데이터베이스 타입
  type: process.env.DB_TYPE || 'local' // 'local' 또는 'remote'
};


