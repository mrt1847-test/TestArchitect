# TC 번호 마이그레이션 가이드

기존 데이터베이스에 `tc_number` 컬럼을 추가하고 테스트케이스에 번호를 할당하는 마이그레이션 가이드입니다.

## 개요

`tc_number`는 프로젝트별로 고유한 테스트케이스 번호를 관리하는 필드입니다. 이를 통해 각 테스트케이스를 "TC01", "TC02"와 같은 형식으로 식별할 수 있습니다.

## 마이그레이션 필요성

- 기존 데이터베이스에는 `tc_number` 컬럼이 없을 수 있습니다.
- 새로 생성되는 테이블에는 자동으로 포함되지만, 기존 테이블에는 수동으로 추가해야 합니다.

## 마이그레이션 방법

### SQLite 데이터베이스 (Electron 앱)

#### 1단계: 컬럼 추가

```sql
ALTER TABLE test_cases ADD COLUMN tc_number INTEGER;
```

#### 2단계: 기존 TC에 번호 할당

SQLite는 UPDATE with subquery가 제한적이므로, 애플리케이션 레벨에서 처리하는 것을 권장합니다.

**Node.js 스크립트 예시:**

```javascript
const db = require('./src/main/services/dbService');

// 프로젝트별로 TC 번호 할당
const projects = db.all('SELECT DISTINCT project_id FROM test_cases WHERE type = ?', ['test_case']);

for (const project of projects) {
  const testCases = db.all(
    'SELECT id FROM test_cases WHERE project_id = ? AND type = ? ORDER BY id',
    [project.project_id, 'test_case']
  );
  
  testCases.forEach((tc, index) => {
    db.run(
      'UPDATE test_cases SET tc_number = ? WHERE id = ?',
      [index + 1, tc.id]
    );
  });
}
```

#### 3단계: UNIQUE 제약조건

SQLite는 ALTER TABLE로 UNIQUE 제약조건을 직접 추가할 수 없습니다. 새 테이블을 만들고 데이터를 복사해야 합니다.

**대안**: 애플리케이션 레벨에서 검증하는 것을 권장합니다. (이미 구현됨)

### MySQL 데이터베이스 (서버)

#### 1단계: 컬럼 추가

```sql
ALTER TABLE test_cases ADD COLUMN tc_number INT NULL AFTER project_id;
```

#### 2단계: 기존 TC에 번호 할당

```sql
UPDATE test_cases tc1
SET tc_number = (
  SELECT COUNT(*) + 1
  FROM test_cases tc2
  WHERE tc2.project_id = tc1.project_id
    AND tc2.id < tc1.id
    AND tc2.type = 'test_case'
)
WHERE tc1.type = 'test_case';
```

#### 3단계: NOT NULL 제약조건 추가

```sql
ALTER TABLE test_cases MODIFY COLUMN tc_number INT NOT NULL;
```

#### 4단계: UNIQUE 제약조건 추가

```sql
ALTER TABLE test_cases ADD CONSTRAINT unique_project_tc_number UNIQUE (project_id, tc_number);
```

## 자동 마이그레이션

애플리케이션은 다음 상황에서 자동으로 처리합니다:

1. **새 테이블 생성**: `createTables()` 함수에서 자동으로 `tc_number` 컬럼이 포함됩니다.
2. **새 TC 생성**: `api-create-test-case` 핸들러에서 자동으로 번호가 할당됩니다.
3. **기존 TC 호환성**: `tc_number`가 없는 경우, `id`를 사용하여 호환성을 유지합니다.

## 마이그레이션 스크립트 사용

`scripts/migrate-tc-number.sql` 파일에 마이그레이션 SQL이 포함되어 있습니다:

```bash
# SQLite
sqlite3 database.db < scripts/migrate-tc-number.sql

# MySQL
mysql -u username -p database_name < scripts/migrate-tc-number.sql
```

## 확인 방법

마이그레이션이 성공했는지 확인:

```sql
-- 컬럼 존재 확인
PRAGMA table_info(test_cases);  -- SQLite
DESCRIBE test_cases;             -- MySQL

-- TC 번호 할당 확인
SELECT id, project_id, tc_number, name 
FROM test_cases 
WHERE type = 'test_case' 
ORDER BY project_id, tc_number;
```

## 주의사항

1. **백업**: 마이그레이션 전에 데이터베이스를 백업하세요.
2. **프로젝트별 고유성**: `tc_number`는 프로젝트별로 고유해야 합니다.
3. **폴더 제외**: `type = 'folder'`인 항목에는 `tc_number`가 할당되지 않습니다.
4. **기존 데이터**: 기존 TC의 경우, `tc_number`가 없으면 `id`를 사용하여 호환성을 유지합니다.

## 문제 해결

### UNIQUE 제약조건 위반

프로젝트 내에 중복된 `tc_number`가 있는 경우:

```sql
-- 중복 확인
SELECT project_id, tc_number, COUNT(*) 
FROM test_cases 
WHERE type = 'test_case' AND tc_number IS NOT NULL
GROUP BY project_id, tc_number 
HAVING COUNT(*) > 1;

-- 중복 해결 (예시: NULL로 설정 후 재할당)
UPDATE test_cases 
SET tc_number = NULL 
WHERE project_id = ? AND tc_number IN (
  SELECT tc_number 
  FROM test_cases 
  WHERE project_id = ? 
  GROUP BY tc_number 
  HAVING COUNT(*) > 1
);
```

### NULL 값 처리

`tc_number`가 NULL인 경우, 애플리케이션은 자동으로 `id`를 사용합니다. 필요시 위의 2단계를 다시 실행하여 할당하세요.

## 관련 파일

- `scripts/migrate-tc-number.sql`: 마이그레이션 SQL 스크립트
- `src/main/services/dbService.js`: SQLite 데이터베이스 서비스
- `server/database/db.js`: MySQL 데이터베이스 서비스
- `src/main/main.js`: TC 생성 및 트리 빌드 로직

