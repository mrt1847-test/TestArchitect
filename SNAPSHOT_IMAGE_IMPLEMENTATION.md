# 스냅샷 이미지 저장 및 매칭 구현 계획

## 현재 상태

### ✅ 완료된 작업
1. DB 테이블 스키마 추가: `snapshot_images` 테이블 생성
2. 요소 스크린샷 캡처 함수 추가: `captureElementScreenshotViaCDP()` 함수

### 🔄 구현 필요한 작업

#### 1. verifyImage 액션 시 요소 좌표/사이즈 정보 수집
- **위치**: `record/side_panel.js`의 `addVerifyAction()` 함수
- **작업**: verifyImage 액션 시 요소의 좌표와 사이즈 정보를 clientRect에 저장

#### 2. verifyImage 액션 처리 시 요소 스크린샷 캡처 및 DB 저장
- **위치**: `src/main/main.js`의 `processRecordingData()` 함수
- **작업**: 
  - verifyImage 액션이 포함된 이벤트 처리 시
  - 요소의 좌표/사이즈 정보로 스크린샷 캡처
  - DB에 이미지 저장
  - step에 `snapshot_image_id` 추가

#### 3. 테스트 실행 전 DB에서 이미지 불러와서 snapshots 폴더에 저장
- **위치**: `src/main/main.js`의 `run-python-scripts` 핸들러
- **작업**:
  - 테스트 실행 전 steps JSON에서 verifyImage 액션 찾기
  - DB에서 snapshot 이미지 조회
  - snapshots 폴더에 임시 파일로 저장
  - 테스트 실행 후 임시 파일 삭제

#### 4. 코드 생성 로직 수정
- **위치**: `src/renderer/utils/codeGenerator.js`
- **작업**: 이미 구현되어 있음 (locator.screenshot() 방식)

## 데이터베이스 스키마

```sql
CREATE TABLE snapshot_images (
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
)
```

## 데이터 흐름

1. **녹화 시점**:
   - verifyImage 액션 추가
   - 요소 선택 시 좌표/사이즈 정보 수집
   - Electron으로 이벤트 전송

2. **이벤트 처리 시점** (녹화 완료 후):
   - verifyImage 액션 발견
   - 요소 스크린샷 캡처
   - DB에 이미지 저장
   - step에 snapshot_image_id 추가

3. **테스트 실행 시점**:
   - 테스트 실행 전 steps JSON 파싱
   - verifyImage 액션의 snapshot_image_id로 이미지 조회
   - snapshots 폴더에 임시 파일로 저장
   - 테스트 실행
   - 테스트 완료 후 임시 파일 삭제

