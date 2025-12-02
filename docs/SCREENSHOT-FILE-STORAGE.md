# 스크린샷 파일 시스템 저장 방식 전환 가이드

## 📋 개요

현재 스크린샷은 base64 인코딩된 이미지를 DB에 직접 저장하고 있습니다. 이 문서는 추후 서버 모드로 전환 시 파일 시스템에 저장하는 방식으로 변경하기 위한 구현 가이드입니다.

## 현재 방식 (DB 저장)

### 구조
```
DB 테이블: test_case_steps_screenshots
- screenshot TEXT: base64 인코딩된 이미지 데이터
  (예: "data:image/jpeg;base64,/9j/4AAQSkZJRg...")
```

### 특징
- ✅ 구현 단순 (DB에 바로 저장)
- ❌ DB 크기 증가 (스크린샷당 50-200KB)
- ❌ DB 부하 증가 (큰 데이터 전송)
- ❌ 백업/복구 시 DB 파일 크기 증가

## 파일 시스템 저장 방식

### 구조

```
서버 파일 시스템:
/uploads/screenshots/
  ├── tc_12_step_0.jpg
  ├── tc_12_step_1.jpg
  └── tc_12_step_2.jpg

DB 테이블: test_case_steps_screenshots
- screenshot_path VARCHAR(500): 파일 경로
  (예: "/uploads/screenshots/tc_12_step_0.jpg")
```

### 특징
- ✅ DB 크기 최소화 (경로만 저장, 50바이트)
- ✅ DB 부하 감소 (경로만 조회)
- ✅ 파일 관리 용이 (파일 시스템에서 직접 관리)
- ✅ 캐싱 가능 (웹 서버 레벨)
- ✅ CDN 연동 가능
- ⚠️ 파일 시스템 관리 필요
- ⚠️ 서버 인프라 필요

## 장단점 비교

| 항목 | 현재 (DB 저장) | 파일 시스템 저장 |
|------|---------------|-----------------|
| **DB 크기** | 50-200KB/스크린샷 | 50바이트/스크린샷 |
| **DB 부하** | 높음 (큰 데이터) | 낮음 (경로만) |
| **파일 관리** | DB 백업 필요 | 파일 시스템 관리 |
| **여러 사용자** | 로컬만 가능 | 서버 URL로 공유 |
| **캐싱** | 어려움 | 웹 서버 캐싱 |
| **구현 복잡도** | 단순 | 중간 |

## 구현 계획

### 1. DB 스키마 변경

#### 변경 전
```sql
CREATE TABLE test_case_steps_screenshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_case_id INTEGER NOT NULL,
  step_index INTEGER NOT NULL,
  screenshot TEXT NOT NULL,  -- base64 데이터
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

#### 변경 후
```sql
CREATE TABLE test_case_steps_screenshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_case_id INTEGER NOT NULL,
  step_index INTEGER NOT NULL,
  screenshot_path VARCHAR(500) NOT NULL,  -- 파일 경로
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
  UNIQUE(test_case_id, step_index)
)
```

### 2. 서버 파일 저장 구조

```
서버 디렉토리 구조:
/server/
  /uploads/
    /screenshots/
      /tc_{tc_id}/
        step_{step_index}.jpg
```

**파일명 규칙:**
- `tc_{tc_id}_step_{step_index}.jpg`
- 예: `tc_12_step_0.jpg`, `tc_12_step_1.jpg`

### 3. Express 정적 파일 서빙 설정

```javascript
// server/index.js
const express = require('express');
const path = require('path');

// 정적 파일 서빙 설정
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
```

### 4. API 엔드포인트 변경

#### 스크린샷 업로드 (POST)
```javascript
// server/routes/screenshots.js
router.post('/upload', async (req, res) => {
  const { tcId, stepIndex, screenshot } = req.body;
  
  // 1. base64에서 이미지 데이터 추출
  const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  
  // 2. 파일명 생성
  const filename = `tc_${tcId}_step_${stepIndex}.jpg`;
  const uploadDir = path.join(__dirname, '../../uploads/screenshots');
  
  // 3. 디렉토리 생성
  await fs.mkdir(uploadDir, { recursive: true });
  
  // 4. 파일 저장
  const filepath = path.join(uploadDir, filename);
  await fs.writeFile(filepath, buffer);
  
  // 5. DB에 경로 저장
  const dbPath = `/uploads/screenshots/${filename}`;
  await db.run(
    'INSERT INTO test_case_steps_screenshots (test_case_id, step_index, screenshot_path) VALUES (?, ?, ?)',
    [tcId, stepIndex, dbPath]
  );
  
  // 6. URL 반환
  res.json({ 
    success: true, 
    url: `http://server:3001${dbPath}` 
  });
});
```

#### 스크린샷 조회 (GET)
```javascript
router.get('/:tcId/:stepIndex', async (req, res) => {
  const { tcId, stepIndex } = req.params;
  
  // DB에서 경로 조회
  const result = await db.get(
    'SELECT screenshot_path FROM test_case_steps_screenshots WHERE test_case_id = ? AND step_index = ?',
    [tcId, stepIndex]
  );
  
  if (result) {
    res.json({ 
      success: true, 
      url: `http://server:3001${result.screenshot_path}` 
    });
  } else {
    res.status(404).json({ success: false, error: '스크린샷을 찾을 수 없습니다' });
  }
});
```

### 5. 클라이언트 코드 변경

#### 저장 방식 변경
```javascript
// src/main/services/screenshotService.js
async saveScreenshot(tcId, stepIndex, screenshotData) {
  if (config.database.mode === 'local') {
    // 로컬: 기존 방식 유지 (DB에 base64 저장)
    return DbService.saveStepScreenshot(tcId, stepIndex, screenshotData);
  } else {
    // 서버: 파일 시스템 저장
    const response = await ApiService.request('POST', '/api/screenshots/upload', {
      tcId,
      stepIndex,
      screenshot: screenshotData  // base64 데이터
    });
    return response;
  }
}
```

#### 조회 방식 변경
```javascript
async getScreenshot(tcId, stepIndex) {
  if (config.database.mode === 'local') {
    // 로컬: DB에서 base64 반환
    return DbService.getStepScreenshot(tcId, stepIndex);
  } else {
    // 서버: 파일 URL 반환
    const response = await ApiService.request('GET', `/api/screenshots/${tcId}/${stepIndex}`);
    return response.success ? response.url : null;
  }
}
```

#### UI 렌더링
```javascript
// src/renderer/renderer.js
async function loadStepScreenshot(tcId, stepIndex, imgElement) {
  const screenshot = await window.electronAPI.getStepScreenshot(tcId, stepIndex);
  if (screenshot) {
    // base64 또는 URL 모두 지원
    if (screenshot.startsWith('data:')) {
      imgElement.src = screenshot;  // base64 (로컬)
    } else {
      imgElement.src = screenshot;  // URL (서버)
    }
    imgElement.style.display = 'block';
  }
}
```

## 마이그레이션 계획

### 1. 기존 데이터 마이그레이션

기존 DB에 저장된 base64 스크린샷을 파일로 변환:

```javascript
// server/scripts/migrate-screenshots.js
async function migrateScreenshots() {
  // 1. 모든 스크린샷 조회
  const screenshots = await db.all(
    'SELECT * FROM test_case_steps_screenshots WHERE screenshot LIKE "data:image/%"'
  );
  
  for (const screenshot of screenshots) {
    // 2. base64에서 이미지 데이터 추출
    const base64Data = screenshot.screenshot.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // 3. 파일 저장
    const filename = `tc_${screenshot.test_case_id}_step_${screenshot.step_index}.jpg`;
    const filepath = path.join(__dirname, '../uploads/screenshots', filename);
    await fs.writeFile(filepath, buffer);
    
    // 4. DB 업데이트 (경로로 변경)
    const dbPath = `/uploads/screenshots/${filename}`;
    await db.run(
      'UPDATE test_case_steps_screenshots SET screenshot_path = ? WHERE id = ?',
      [dbPath, screenshot.id]
    );
  }
}
```

### 2. 단계별 전환 계획

1. **Phase 1: 준비**
   - DB 스키마 변경 (screenshot_path 컬럼 추가)
   - 파일 시스템 저장 로직 구현
   - API 엔드포인트 추가

2. **Phase 2: 병행 운영**
   - 새로운 스크린샷: 파일 시스템 저장
   - 기존 스크린샷: DB에서 조회 (호환성 유지)

3. **Phase 3: 마이그레이션**
   - 기존 DB 스크린샷을 파일로 변환
   - DB 스키마 정리 (screenshot 컬럼 제거)

4. **Phase 4: 완료**
   - 파일 시스템 저장만 사용
   - 기존 base64 저장 방식 제거

## 비용 분석

### 저장 공간 비교

#### 현재 방식 (DB 저장)
```
스크린샷 1,000개 기준:
- JPEG 압축 (50% 품질): 약 50KB/개
- 총 용량: 1,000 × 50KB = 50MB
- DB 크기: 50MB 증가
```

#### 파일 시스템 저장
```
스크린샷 1,000개 기준:
- 파일 크기: 50KB/개
- DB 용량: 1,000 × 50바이트 = 50KB (경로만)
- 파일 시스템: 50MB
- DB 크기: 50KB만 증가
```

### 서버 인프라 비용

#### 소규모 팀 (5명, 1,000개/월)
```
- DigitalOcean: $6/월 (약 8,000원)
- 스토리지: 25GB (충분)
- 총 비용: 월 8,000원 (1인당 1,600원)
```

#### 중규모 팀 (20명, 5,000개/월)
```
- DigitalOcean: $12/월 (약 16,000원)
- 스토리지: 50GB (충분)
- 총 비용: 월 16,000원 (1인당 800원)
```

## 파일 시스템 저장의 장점

### 1. DB 부하 감소
- 파일 요청: DB 거치지 않음 (웹 서버가 직접 처리)
- DB는 경로 조회만 (매우 가벼운 쿼리)

### 2. 성능 향상
- 웹 서버 레벨 캐싱 가능
- CDN 연동 가능 (이미지 전용 CDN)
- 여러 사용자가 동시 접근 시 효율적

### 3. 관리 용이
- 파일 시스템에서 직접 백업
- 오래된 파일 자동 삭제 스크립트
- 디스크 용량 관리 용이

### 4. 확장성
- 스토리지 분리 가능 (예: S3, Azure Blob)
- 파일 서버 분리 가능
- 로드 밸런싱 용이

## 구현 시 주의사항

### 1. 파일명 충돌 방지
- TC 삭제 시 관련 파일도 삭제
- 파일명에 타임스탬프 포함 고려

### 2. 보안
- 파일 업로드 검증 (이미지 형식만)
- 파일 크기 제한
- 경로 조작 방지 (path traversal 공격)

### 3. 백업
- 파일 시스템 백업 정책 수립
- DB와 파일 동시 백업 필요

### 4. 에러 처리
- 파일 저장 실패 시 처리
- DB와 파일 불일치 방지
- 파일 누락 시 처리

## 서버 인프라 옵션

### 1. 로컬 PC 서버 (무료)
- 회사/팀 내부 PC에서 실행
- 동일 네트워크에서 접속
- 비용: 0원

### 2. 클라우드 무료 티어
- AWS EC2 t2.micro: 1년 무료
- Oracle Cloud: 항상 무료
- 비용: 0원 (범위 내)

### 3. 저렴한 클라우드 (월 5,000-20,000원)
- DigitalOcean: 월 $6
- Linode: 월 $5
- AWS Lightsail: 월 $3.50
- 소규모 팀에 충분

## 결론

파일 시스템 저장 방식은:
- ✅ DB 부하 대폭 감소
- ✅ 확장성 향상
- ✅ 관리 용이
- ✅ 비용 효율적 (저렴한 서버로도 가능)

**현재는 로컬 모드(DB 저장)를 유지하고, 서버 모드 전환 시 파일 시스템 저장 방식으로 구현하면 됩니다.**

