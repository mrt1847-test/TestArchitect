/**
 * Chrome for Testing 다운로드 스크립트
 * 빌드 시 Chrome for Testing을 다운로드하여 번들에 포함
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PLATFORM = process.platform;
const ARCH = process.arch;

// 플랫폼별 디렉토리 이름 매핑
function getPlatformName() {
  if (PLATFORM === 'win32') {
    return 'win64';
  } else if (PLATFORM === 'darwin') {
    return ARCH === 'arm64' ? 'mac-arm64' : 'mac-x64';
  } else {
    return 'linux64';
  }
}

async function downloadChromeForTesting() {
  const outputDir = path.join(__dirname, '..', 'chrome-for-testing');
  const platformName = getPlatformName();
  
  console.log('📥 Chrome for Testing 다운로드 중...');
  console.log(`플랫폼: ${PLATFORM} (${ARCH})`);
  console.log(`플랫폼 이름: ${platformName}`);
  console.log(`출력 디렉토리: ${outputDir}`);
  
  // 기존 디렉토리가 있으면 삭제
  if (fs.existsSync(outputDir)) {
    console.log('🗑️  기존 Chrome for Testing 디렉토리 삭제 중...');
    try {
      fs.rmSync(outputDir, { recursive: true, force: true });
      console.log('✅ 기존 디렉토리 삭제 완료');
    } catch (error) {
      console.warn('⚠️  기존 디렉토리 삭제 실패:', error.message);
    }
  }
  
  try {
    // @puppeteer/browsers를 사용하여 다운로드
    console.log('📦 @puppeteer/browsers를 사용하여 Chrome for Testing 다운로드 중...');
    
    // npx를 사용하여 다운로드 (로컬에 설치되어 있지 않아도 됨)
    execSync(`npx --yes @puppeteer/browsers install chrome@stable --path "${outputDir}"`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    // 다운로드된 Chrome 경로 확인
    const downloadedDirs = fs.readdirSync(outputDir);
    console.log('📁 다운로드된 디렉토리:', downloadedDirs);
    
    if (downloadedDirs.length === 0) {
      throw new Error('Chrome for Testing 다운로드 실패: 디렉토리가 비어있습니다');
    }
    
    // Chrome 실행 파일 경로 확인
    let chromePath;
    if (PLATFORM === 'win32') {
      chromePath = path.join(outputDir, downloadedDirs[0], 'chrome-win64', 'chrome.exe');
    } else if (PLATFORM === 'darwin') {
      const archDir = ARCH === 'arm64' ? 'chrome-mac-arm64' : 'chrome-mac-x64';
      chromePath = path.join(outputDir, downloadedDirs[0], archDir, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    } else {
      chromePath = path.join(outputDir, downloadedDirs[0], 'chrome-linux64', 'chrome');
    }
    
    if (fs.existsSync(chromePath)) {
      console.log('✅ Chrome for Testing 다운로드 완료');
      console.log(`📍 Chrome 경로: ${chromePath}`);
    } else {
      console.warn('⚠️  Chrome 실행 파일을 찾을 수 없습니다:', chromePath);
      console.log('📁 실제 디렉토리 구조 확인 중...');
      const actualPath = path.join(outputDir, downloadedDirs[0]);
      console.log('📁 실제 경로:', actualPath);
      if (fs.existsSync(actualPath)) {
        const files = fs.readdirSync(actualPath);
        console.log('📁 파일 목록:', files);
      }
    }
    
  } catch (error) {
    console.error('❌ Chrome for Testing 다운로드 실패:', error.message);
    console.error('스택 트레이스:', error.stack);
    process.exit(1);
  }
}

// 스크립트 직접 실행 시
if (require.main === module) {
  downloadChromeForTesting().catch(error => {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  });
}

module.exports = { downloadChromeForTesting };

