/**
 * DOM 스냅샷 스케줄러 서비스
 * 녹화 날짜 기준 15일 구간별로 최신 스냅샷 3개만 유지 (0-15일, 16-30일, 31-45일)
 * DOM 데이터는 HTML 최소화 + gzip 압축하여 저장 (힐링 품질 유지)
 */

const crypto = require('crypto');
const zlib = require('zlib');
const db = require('../database/db');

const SNAPSHOT_INTERVAL_DAYS = 15; // 15일 구간 단위
const RETENTION_DAYS = 45; // 45일 보관 (최근 3개 구간)
const MAX_PERIODS = 3; // 최대 보관 구간 수 (0-15일, 16-30일, 31-45일)

/**
 * URL 정규화 (도메인+경로만 추출, 쿼리 파라미터 제외)
 * @param {string} url - 원본 URL
 * @returns {string} 정규화된 URL
 */
function normalizeURL(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }
  
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  } catch (e) {
    // URL 파싱 실패 시 쿼리만 제거
    return url.split('?')[0];
  }
}

/**
 * URL 패턴 분석 (동적 페이지 처리)
 * 예: /product?id=123 -> /product, /product/456 -> /product/*
 * @param {string} url - 원본 URL
 * @returns {Object} 패턴 정보
 */
function analyzeURLPattern(url) {
  if (!url || typeof url !== 'string') {
    return { normalizedUrl: '', pattern: null, isDynamic: false };
  }
  
  try {
    const urlObj = new URL(url);
    const normalizedUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    
    // 동적 패턴 감지 (숫자 ID, UUID 등)
    const pathParts = urlObj.pathname.split('/');
    const hasDynamicPart = pathParts.some(part => {
      // 숫자만 있는 경우 (예: /123)
      if (/^\d+$/.test(part)) return true;
      // UUID 형식
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part)) return true;
      // 쿼리 파라미터가 있는 경우
      if (urlObj.search && urlObj.search.length > 1) return true;
      return false;
    });
    
    // 패턴 URL 생성 (동적 부분을 *로 치환)
    let patternUrl = normalizedUrl;
    if (hasDynamicPart) {
      patternUrl = pathParts.map(part => {
        if (/^\d+$/.test(part) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part)) {
          return '*';
        }
        return part;
      }).join('/');
      
      if (urlObj.search) {
        // 쿼리 파라미터도 제거한 정규화 URL과 별도로 패턴 URL 유지
        patternUrl = `${urlObj.protocol}//${urlObj.host}${patternUrl}`;
      }
    }
    
    return {
      normalizedUrl,
      patternUrl: hasDynamicPart ? patternUrl : normalizedUrl,
      isDynamic: hasDynamicPart,
      originalUrl: url
    };
  } catch (e) {
    return {
      normalizedUrl: url.split('?')[0],
      patternUrl: url.split('?')[0],
      isDynamic: false,
      originalUrl: url
    };
  }
}

/**
 * URL 패턴 매칭 (동적 페이지 스냅샷 검색)
 * @param {string} targetUrl - 대상 URL
 * @param {string} snapshotUrl - 스냅샷 URL
 * @returns {boolean} 매칭 여부
 */
function matchURLPattern(targetUrl, snapshotUrl) {
  const targetPattern = analyzeURLPattern(targetUrl);
  const snapshotPattern = analyzeURLPattern(snapshotUrl);
  
  // 정규화된 URL이 정확히 일치하면 매칭
  if (targetPattern.normalizedUrl === snapshotPattern.normalizedUrl) {
    return true;
  }
  
  // 동적 페이지인 경우 패턴 URL로 매칭
  if (targetPattern.isDynamic && snapshotPattern.isDynamic) {
    // 패턴 URL의 구조가 같으면 매칭 (예: /product/* == /product/*)
    const targetPathParts = new URL(targetPattern.patternUrl).pathname.split('/');
    const snapshotPathParts = new URL(snapshotPattern.patternUrl).pathname.split('/');
    
    if (targetPathParts.length === snapshotPathParts.length) {
      return targetPathParts.every((part, index) => {
        return part === snapshotPathParts[index] || part === '*' || snapshotPathParts[index] === '*';
      });
    }
  }
  
  return false;
}

/**
 * DOM 데이터의 SHA256 해시 생성 (압축 전 원본 기준)
 * @param {string} domData - DOM 데이터
 * @returns {string} 해시 값
 */
function generateHash(domData) {
  return crypto.createHash('sha256').update(domData, 'utf8').digest('hex');
}

/**
 * DOM 데이터 gzip 압축
 * @param {string} domData - 원본 DOM 데이터
 * @returns {Promise<Buffer>} 압축된 데이터
 */
function compressDomData(domData) {
  return new Promise((resolve, reject) => {
    // 압축 레벨 9 (최대 압축)로 변경하여 용량 더 절감
    zlib.gzip(domData, { level: 9 }, (err, compressed) => {
      if (err) {
        reject(err);
      } else {
        resolve(compressed);
      }
    });
  });
}

/**
 * 압축된 DOM 데이터 압축 해제
 * @param {Buffer|string} compressedData - 압축된 데이터
 * @returns {Promise<string>} 압축 해제된 원본 데이터
 */
function decompressDomData(compressedData) {
  return new Promise((resolve, reject) => {
    // Buffer가 아닌 경우 Buffer로 변환
    const buffer = Buffer.isBuffer(compressedData) 
      ? compressedData 
      : Buffer.from(compressedData, 'base64');
    
    zlib.gunzip(buffer, (err, decompressed) => {
      if (err) {
        reject(err);
      } else {
        resolve(decompressed.toString('utf8'));
      }
    });
  });
}

/**
 * 날짜를 기반으로 구간 계산 (15일 단위)
 * @param {Date} date - 기준 날짜
 * @returns {number} 구간 번호 (0: 0-15일, 1: 16-30일, 2: 31-45일)
 */
function getPeriodNumber(date) {
  const now = new Date();
  const daysDiff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  
  if (daysDiff < 0) daysDiff = 0; // 미래 날짜는 0으로 처리
  
  // 15일 단위로 구간 나누기
  return Math.floor(daysDiff / SNAPSHOT_INTERVAL_DAYS);
}

/**
 * 특정 URL의 각 구간별 최신 스냅샷 조회
 * @param {string} normalizedUrl - 정규화된 URL
 * @returns {Promise<Map<number, Object>>} 구간별 스냅샷 맵 (periodNumber -> snapshot)
 */
async function getSnapshotsByPeriod(normalizedUrl) {
  try {
    const query = `
      SELECT *
      FROM dom_snapshots
      WHERE normalized_url = ?
        AND expires_at > NOW()
      ORDER BY captured_at DESC
    `;
    
    const snapshots = await db.all(query, [normalizedUrl]);
    const periodMap = new Map();
    
    for (const snapshot of snapshots) {
      const capturedDate = new Date(snapshot.captured_at);
      const periodNum = getPeriodNumber(capturedDate);
      
      // 최대 구간 수를 초과하는 것은 제외
      if (periodNum >= MAX_PERIODS) {
        continue;
      }
      
      // 각 구간에서 가장 최신 것만 유지
      if (!periodMap.has(periodNum)) {
        periodMap.set(periodNum, snapshot);
      } else {
        const existing = periodMap.get(periodNum);
        if (new Date(snapshot.captured_at) > new Date(existing.captured_at)) {
          periodMap.set(periodNum, snapshot);
        }
      }
    }
    
    return periodMap;
  } catch (error) {
    console.error('[Snapshot Scheduler] 구간별 스냅샷 조회 실패:', error);
    return new Map();
  }
}

/**
 * 특정 구간의 기존 스냅샷 삭제
 * @param {string} normalizedUrl - 정규화된 URL
 * @param {number} periodNum - 구간 번호
 * @returns {Promise<number>} 삭제된 스냅샷 수
 */
async function deleteSnapshotsInPeriod(normalizedUrl, periodNum) {
  try {
    // 해당 구간에 속하는 모든 스냅샷 조회
    const allSnapshots = await db.all(
      'SELECT * FROM dom_snapshots WHERE normalized_url = ? AND expires_at > NOW()',
      [normalizedUrl]
    );
    
    const periodStartDays = periodNum * SNAPSHOT_INTERVAL_DAYS;
    const periodEndDays = (periodNum + 1) * SNAPSHOT_INTERVAL_DAYS;
    const now = new Date();
    
    const snapshotsToDelete = allSnapshots.filter(snapshot => {
      const capturedDate = new Date(snapshot.captured_at);
      const daysDiff = Math.floor((now - capturedDate) / (1000 * 60 * 60 * 24));
      return daysDiff >= periodStartDays && daysDiff < periodEndDays;
    });
    
    if (snapshotsToDelete.length === 0) {
      return 0;
    }
    
    // 삭제 실행
    const ids = snapshotsToDelete.map(s => s.id);
    const placeholders = ids.map(() => '?').join(',');
    const deleteQuery = `DELETE FROM dom_snapshots WHERE id IN (${placeholders})`;
    
    const result = await db.run(deleteQuery, ids);
    console.log(`[Snapshot Scheduler] 구간 ${periodNum} 스냅샷 ${result.changes}개 삭제`);
    
    return result.changes;
  } catch (error) {
    console.error('[Snapshot Scheduler] 구간 스냅샷 삭제 실패:', error);
    return 0;
  }
}

/**
 * 중복 스냅샷 체크 (URL + hash 조합)
 * @param {string} normalizedUrl - 정규화된 URL
 * @param {string} snapshotHash - 스냅샷 해시
 * @returns {Promise<boolean>} 중복 여부
 */
async function isDuplicateSnapshot(normalizedUrl, snapshotHash) {
  try {
    const query = `
      SELECT id
      FROM dom_snapshots
      WHERE normalized_url = ? AND snapshot_hash = ?
      LIMIT 1
    `;
    const result = await db.get(query, [normalizedUrl, snapshotHash]);
    return result !== null;
  } catch (error) {
    console.error('[Snapshot Scheduler] 중복 체크 실패:', error);
    return false;
  }
}

/**
 * DOM 스냅샷 저장
 * @param {Object} snapshotData - 스냅샷 데이터
 * @param {string} snapshotData.url - 원본 URL
 * @param {string} snapshotData.domData - DOM 데이터 (HTML)
 * @param {string} snapshotData.pageTitle - 페이지 제목
 * @param {Object} snapshotData.metadata - 메타데이터 (userAgent, viewport 등)
 * @returns {Promise<Object>} 저장된 스냅샷 정보
 */
async function saveSnapshot(snapshotData) {
  const { url, domData, pageTitle, metadata } = snapshotData;
  
  if (!url || !domData) {
    throw new Error('URL과 DOM 데이터는 필수입니다.');
  }
  
  const normalizedUrl = normalizeURL(url);
  const snapshotHash = generateHash(domData);
  
  // 중복 체크 (동일한 해시가 있으면 건너뛰기)
  const isDuplicate = await isDuplicateSnapshot(normalizedUrl, snapshotHash);
  if (isDuplicate) {
    console.log(`[Snapshot Scheduler] 중복 스냅샷 건너뛰기: ${normalizedUrl}`);
    return { skipped: true, reason: 'duplicate' };
  }
  
  // 현재 구간 계산
  const now = new Date();
  const currentPeriodNum = 0; // 현재는 항상 구간 0 (0-15일)
  
  // 기존 구간별 스냅샷 확인
  const periodMap = await getSnapshotsByPeriod(normalizedUrl);
  
  // 현재 구간에 이미 스냅샷이 있으면 기존 것 삭제
  if (periodMap.has(currentPeriodNum)) {
    await deleteSnapshotsInPeriod(normalizedUrl, currentPeriodNum);
    console.log(`[Snapshot Scheduler] 구간 ${currentPeriodNum}의 기존 스냅샷 삭제 후 새로 저장`);
  }
  
  // 오래된 구간(45일 이상) 스냅샷 삭제
  for (let periodNum = MAX_PERIODS; periodNum < MAX_PERIODS + 2; periodNum++) {
    await deleteSnapshotsInPeriod(normalizedUrl, periodNum);
  }
  
  // DOM 데이터 압축
  let compressedData;
  try {
    compressedData = await compressDomData(domData);
    const compressionRatio = ((1 - compressedData.length / Buffer.from(domData, 'utf8').length) * 100).toFixed(1);
    console.log(`[Snapshot Scheduler] DOM 압축 완료: ${compressionRatio}% 절약 (${Buffer.from(domData, 'utf8').length} → ${compressedData.length} bytes)`);
  } catch (error) {
    console.error('[Snapshot Scheduler] DOM 압축 실패, 원본 저장:', error);
    compressedData = Buffer.from(domData, 'utf8');
  }
  
  // 만료일 계산 (45일 후 - 최근 3개 구간 유지)
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + RETENTION_DAYS);
  
  try {
    // 압축된 데이터를 base64로 인코딩하여 저장 (LONGTEXT에 저장)
    const compressedBase64 = compressedData.toString('base64');
    
    const query = `
      INSERT INTO dom_snapshots (
        normalized_url,
        snapshot_data,
        snapshot_hash,
        page_title,
        expires_at,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      normalizedUrl,
      compressedBase64, // 압축된 데이터 (base64 인코딩)
      snapshotHash,
      pageTitle || null,
      expiresAt,
      metadata ? JSON.stringify(metadata) : null
    ];
    
    const result = await db.run(query, params);
    const savedSnapshot = await db.get('SELECT * FROM dom_snapshots WHERE id = ?', [result.lastID]);
    
    // 저장된 스냅샷에는 압축 해제된 원본 데이터 추가 (메모리 사용량 주의)
    // 실제 사용 시에는 필요할 때만 압축 해제
    if (savedSnapshot && savedSnapshot.snapshot_data) {
      savedSnapshot.is_compressed = true;
      // 원본 데이터는 필요시에만 압축 해제하도록 메모리 절약
      // savedSnapshot.decompressed_data = await decompressDomData(savedSnapshot.snapshot_data);
    }
    
    console.log(`[Snapshot Scheduler] 스냅샷 저장 완료: ${normalizedUrl} (ID: ${result.lastID})`);
    
    return {
      success: true,
      snapshot: savedSnapshot
    };
  } catch (error) {
    // UNIQUE KEY 제약 조건 위반 시 중복으로 간주
    if (error.code === 'ER_DUP_ENTRY') {
      return { skipped: true, reason: 'duplicate' };
    }
    throw error;
  }
}

/**
 * 만료된 스냅샷 삭제 (45일 이상 된 스냅샷)
 * @returns {Promise<number>} 삭제된 스냅샷 수
 */
async function cleanupExpiredSnapshots() {
  try {
    // 만료일 기반 삭제
    const expireQuery = `
      DELETE FROM dom_snapshots
      WHERE expires_at < NOW()
    `;
    const expireResult = await db.run(expireQuery);
    let deletedCount = expireResult.changes;
    
    // 추가: 45일 이상 된 구간의 스냅샷도 삭제
    const allSnapshots = await db.all(
      'SELECT * FROM dom_snapshots WHERE expires_at > NOW()'
    );
    
    const now = new Date();
    const snapshotsToDelete = [];
    
    for (const snapshot of allSnapshots) {
      const capturedDate = new Date(snapshot.captured_at);
      const daysDiff = Math.floor((now - capturedDate) / (1000 * 60 * 60 * 24));
      const periodNum = Math.floor(daysDiff / SNAPSHOT_INTERVAL_DAYS);
      
      // 최대 구간 수를 초과하는 것은 삭제 대상
      if (periodNum >= MAX_PERIODS || daysDiff >= RETENTION_DAYS) {
        snapshotsToDelete.push(snapshot.id);
      }
    }
    
    // 각 URL별로 구간별 최신 것만 유지
    const urlGroups = {};
    for (const snapshot of allSnapshots) {
      if (snapshotsToDelete.includes(snapshot.id)) continue;
      
      const url = snapshot.normalized_url;
      if (!urlGroups[url]) {
        urlGroups[url] = [];
      }
      urlGroups[url].push(snapshot);
    }
    
    // 각 URL별로 구간별 최신 것만 유지하고 나머지 삭제
    for (const [url, snapshots] of Object.entries(urlGroups)) {
      const periodMap = new Map();
      
      for (const snapshot of snapshots) {
        const capturedDate = new Date(snapshot.captured_at);
        const daysDiff = Math.floor((now - capturedDate) / (1000 * 60 * 60 * 24));
        const periodNum = Math.floor(daysDiff / SNAPSHOT_INTERVAL_DAYS);
        
        if (periodNum >= MAX_PERIODS) {
          snapshotsToDelete.push(snapshot.id);
          continue;
        }
        
        if (!periodMap.has(periodNum)) {
          periodMap.set(periodNum, snapshot);
        } else {
          const existing = periodMap.get(periodNum);
          if (new Date(snapshot.captured_at) > new Date(existing.captured_at)) {
            snapshotsToDelete.push(existing.id);
            periodMap.set(periodNum, snapshot);
          } else {
            snapshotsToDelete.push(snapshot.id);
          }
        }
      }
    }
    
    // 중복 제거
    const uniqueIdsToDelete = [...new Set(snapshotsToDelete)];
    
    if (uniqueIdsToDelete.length > 0) {
      const placeholders = uniqueIdsToDelete.map(() => '?').join(',');
      const deleteQuery = `DELETE FROM dom_snapshots WHERE id IN (${placeholders})`;
      const deleteResult = await db.run(deleteQuery, uniqueIdsToDelete);
      deletedCount += deleteResult.changes;
    }
    
    if (deletedCount > 0) {
      console.log(`[Snapshot Scheduler] 만료된 스냅샷 ${deletedCount}개 삭제 완료`);
    }
    
    return deletedCount;
  } catch (error) {
    console.error('[Snapshot Scheduler] 만료된 스냅샷 삭제 실패:', error);
    throw error;
  }
}

/**
 * 특정 URL의 최신 스냅샷 조회 (압축 해제 포함)
 * @param {string} normalizedUrl - 정규화된 URL
 * @param {boolean} decompress - 압축 해제 여부 (기본값: true)
 * @returns {Promise<Object|null>} 최신 스냅샷 또는 null
 */
async function getLatestSnapshot(normalizedUrl, decompress = true) {
  try {
    const query = `
      SELECT *
      FROM dom_snapshots
      WHERE normalized_url = ?
        AND expires_at > NOW()
      ORDER BY captured_at DESC
      LIMIT 1
    `;
    
    const snapshot = await db.get(query, [normalizedUrl]);
    
    if (!snapshot) {
      return null;
    }
    
    // 압축 해제가 필요한 경우
    if (decompress && snapshot.snapshot_data) {
      try {
        snapshot.decompressed_data = await decompressDomData(snapshot.snapshot_data);
        snapshot.is_compressed = true;
      } catch (error) {
        console.error('[Snapshot Scheduler] 압축 해제 실패, 원본 데이터로 시도:', error);
        // 압축 해제 실패 시 원본 데이터가 압축되지 않은 것일 수 있음
        snapshot.decompressed_data = snapshot.snapshot_data;
        snapshot.is_compressed = false;
      }
    }
    
    return snapshot;
  } catch (error) {
    console.error('[Snapshot Scheduler] 최신 스냅샷 조회 실패:', error);
    return null;
  }
}

/**
 * 특정 URL의 최근 N개 스냅샷 조회 (히스토리)
 * @param {string} normalizedUrl - 정규화된 URL
 * @param {number} limit - 조회할 개수 (기본값: 5)
 * @param {boolean} decompress - 압축 해제 여부 (기본값: true)
 * @returns {Promise<Array>} 스냅샷 배열
 */
async function getRecentSnapshots(normalizedUrl, limit = 5, decompress = true) {
  try {
    const query = `
      SELECT *
      FROM dom_snapshots
      WHERE normalized_url = ?
        AND expires_at > NOW()
      ORDER BY captured_at DESC
      LIMIT ?
    `;
    
    const snapshots = await db.all(query, [normalizedUrl, limit]);
    
    if (!snapshots || snapshots.length === 0) {
      return [];
    }
    
    // 각 스냅샷 압축 해제
    if (decompress) {
      for (const snapshot of snapshots) {
        if (snapshot.snapshot_data) {
          try {
            snapshot.decompressed_data = await decompressDomData(snapshot.snapshot_data);
            snapshot.is_compressed = true;
          } catch (error) {
            console.error('[Snapshot Scheduler] 스냅샷 압축 해제 실패:', error);
            snapshot.decompressed_data = snapshot.snapshot_data;
            snapshot.is_compressed = false;
          }
        }
      }
    }
    
    return snapshots;
  } catch (error) {
    console.error('[Snapshot Scheduler] 최근 스냅샷 조회 실패:', error);
    return [];
  }
}

/**
 * 특정 URL의 스냅샷 히스토리 조회
 * @param {string} normalizedUrl - 정규화된 URL
 * @param {number} limit - 조회 개수 제한
 * @returns {Promise<Array>} 스냅샷 히스토리
 */
async function getSnapshotHistory(normalizedUrl, limit = 10) {
  try {
    const query = `
      SELECT id, normalized_url, snapshot_hash, page_title, captured_at, expires_at
      FROM dom_snapshots
      WHERE normalized_url = ?
      ORDER BY captured_at DESC
      LIMIT ?
    `;
    
    return await db.all(query, [normalizedUrl, limit]);
  } catch (error) {
    console.error('[Snapshot Scheduler] 스냅샷 히스토리 조회 실패:', error);
    return [];
  }
}

/**
 * 주기적 정리 작업 (만료된 스냅샷 삭제)
 * 하루에 한 번 실행
 */
function startPeriodicCleanup() {
  // 서버 시작 시 즉시 실행
  cleanupExpiredSnapshots().catch(error => {
    console.error('[Snapshot Scheduler] 초기 정리 작업 실패:', error);
  });
  
  // 매일 자정에 실행 (24시간 = 86400000ms)
  setInterval(() => {
    cleanupExpiredSnapshots().catch(error => {
      console.error('[Snapshot Scheduler] 주기적 정리 작업 실패:', error);
    });
  }, 24 * 60 * 60 * 1000);
  
  console.log('[Snapshot Scheduler] 주기적 정리 작업 시작 (매일 자정)');
}

module.exports = {
  normalizeURL,
  analyzeURLPattern,
  matchURLPattern,
  generateHash,
  saveSnapshot,
  cleanupExpiredSnapshots,
  getLatestSnapshot,
  getRecentSnapshots,
  getSnapshotHistory,
  shouldSaveSnapshot,
  isDuplicateSnapshot,
  startPeriodicCleanup,
  SNAPSHOT_INTERVAL_DAYS,
  RETENTION_DAYS
};
