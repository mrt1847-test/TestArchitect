/**
 * Python 번들 빌드 스크립트
 * Python 런타임과 필요한 패키지를 번들로 생성
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const execAsync = promisify(exec);

const PYTHON_VERSION = '3.11.0'; // 사용할 Python 버전
const BUNDLE_DIR = path.join(__dirname, '../python-bundle');
const PLATFORM = process.platform;

/**
 * Python 번들 빌드
 */
async function buildPythonBundle() {
  console.log('Python 번들 빌드 시작...');
  console.log(`플랫폼: ${PLATFORM}`);

  try {
    // 번들 디렉토리 생성
    if (!fs.existsSync(BUNDLE_DIR)) {
      fs.mkdirSync(BUNDLE_DIR, { recursive: true });
    }

    // Python 다운로드 및 설치 가이드 출력
    console.log('\n=== Python 번들링 가이드 ===');
    console.log('Python을 번들로 포함하는 방법:');
    console.log('\n1. Python Portable 다운로드:');
    console.log('   Windows: https://www.python.org/downloads/');
    console.log('   또는 WinPython: https://winpython.github.io/');
    console.log('\n2. 다운로드한 Python을 다음 경로에 복사:');
    console.log(`   ${BUNDLE_DIR}/python/`);
    console.log('\n3. 가상환경 생성 및 패키지 설치:');
    console.log('   python -m venv python-bundle/python');
    console.log('   python-bundle/python/Scripts/activate (Windows)');
    console.log('   pip install -r requirements.txt');
    console.log('\n4. playwright 브라우저 설치:');
    console.log('   python -m playwright install chromium');

    console.log('\n=== 자동 설치 시도 ===');
    
    // 시스템 Python으로 가상환경 생성 시도
    const pythonCmd = PLATFORM === 'win32' ? 'python' : 'python3';
    
    try {
      // Python 버전 확인
      const { stdout } = await execAsync(`${pythonCmd} --version`);
      console.log(`시스템 Python 발견: ${stdout.trim()}`);

      // 가상환경 경로
      const venvPath = path.join(BUNDLE_DIR, 'python');
      const pythonVenvCmd = PLATFORM === 'win32'
        ? path.join(venvPath, 'Scripts', 'python.exe')
        : path.join(venvPath, 'bin', 'python');
      const pipCmd = PLATFORM === 'win32'
        ? path.join(venvPath, 'Scripts', 'pip.exe')
        : path.join(venvPath, 'bin', 'pip');

      // 가상환경이 이미 존재하는지 확인
      const venvExists = fs.existsSync(pythonVenvCmd);
      
      if (!venvExists) {
        // 가상환경 생성
        console.log(`가상환경 생성 중: ${venvPath}`);
        await execAsync(`${pythonCmd} -m venv "${venvPath}"`, { timeout: 60000 });
      } else {
        console.log(`기존 가상환경 발견: ${venvPath}`);
      }

      // pip 업그레이드
      console.log('pip 업그레이드 중...');
      try {
        await execAsync(`"${pipCmd}" install --upgrade pip`, { timeout: 60000 });
      } catch (pipError) {
        // pip 업그레이드 실패해도 계속 진행
        console.warn('pip 업그레이드 실패 (계속 진행):', pipError.message);
      }

      // 패키지 설치
      console.log('패키지 설치 중...');
      const requirementsPath = path.join(__dirname, '../requirements.txt');
      await execAsync(`"${pipCmd}" install -r "${requirementsPath}"`, { timeout: 300000 });

      // playwright 브라우저 설치 (번들 디렉토리에 설치)
      // Playwright 브라우저를 번들 디렉토리에 설치하도록 환경 변수 설정
      const playwrightHome = path.join(BUNDLE_DIR, '.playwright');
      const env = {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: playwrightHome
      };
      
      console.log('Playwright 브라우저 설치 중... (시간이 걸릴 수 있습니다)');
      console.log(`브라우저 설치 경로: ${playwrightHome}`);
      await execAsync(`"${pythonVenvCmd}" -m playwright install chromium`, { 
        timeout: 600000,
        env: env
      });
      
      // Playwright 브라우저 경로를 번들에 포함
      console.log('Playwright 브라우저가 번들에 포함되었습니다.');

      console.log('\n✅ Python 번들 빌드 완료!');
      console.log(`번들 경로: ${venvPath}`);

    } catch (error) {
      console.error('\n❌ 자동 빌드 실패:', error.message);
      console.log('\n수동 빌드 가이드를 따르세요.');
    }

  } catch (error) {
    console.error('빌드 오류:', error);
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  buildPythonBundle();
}

module.exports = { buildPythonBundle };

