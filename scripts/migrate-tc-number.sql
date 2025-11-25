-- TC 번호 마이그레이션 스크립트
-- 기존 데이터베이스에 tc_number 컬럼을 추가하고 기존 TC에 번호를 할당합니다.

-- SQLite용 마이그레이션
-- 1. tc_number 컬럼 추가
ALTER TABLE test_cases ADD COLUMN tc_number INTEGER;

-- 2. 프로젝트별로 순차적으로 tc_number 할당
-- SQLite는 UPDATE with subquery가 제한적이므로, 애플리케이션 레벨에서 처리하는 것을 권장합니다.

-- 3. UNIQUE 제약조건 추가 (프로젝트별로 고유한 TC 번호)
-- SQLite는 ALTER TABLE로 UNIQUE 제약조건을 직접 추가할 수 없으므로,
-- 새 테이블을 만들고 데이터를 복사한 후 기존 테이블을 교체해야 합니다.
-- 이는 복잡하므로 애플리케이션 레벨에서 검증하는 것을 권장합니다.

-- MySQL용 마이그레이션
-- 1. tc_number 컬럼 추가
-- ALTER TABLE test_cases ADD COLUMN tc_number INT NULL AFTER project_id;

-- 2. 프로젝트별로 순차적으로 tc_number 할당
-- UPDATE test_cases tc1
-- SET tc_number = (
--   SELECT COUNT(*) + 1
--   FROM test_cases tc2
--   WHERE tc2.project_id = tc1.project_id
--     AND tc2.id < tc1.id
--     AND tc2.type = 'test_case'
-- )
-- WHERE tc1.type = 'test_case';

-- 3. NOT NULL 제약조건 추가
-- ALTER TABLE test_cases MODIFY COLUMN tc_number INT NOT NULL;

-- 4. UNIQUE 제약조건 추가 (프로젝트별로 고유한 TC 번호)
-- ALTER TABLE test_cases ADD CONSTRAINT unique_project_tc_number UNIQUE (project_id, tc_number);

-- 참고:
-- 이 마이그레이션은 애플리케이션 코드에서 자동으로 처리됩니다.
-- dbService.js와 server/database/db.js의 createTables() 함수에서
-- tc_number 컬럼이 자동으로 추가되며, 새로 생성되는 TC에는 자동으로 번호가 할당됩니다.
-- 기존 TC의 경우, tc_number가 없으면 id를 사용하여 호환성을 유지합니다.

