/**
 * Electron 메인 프로세스
 * 애플리케이션의 진입점 및 IPC 통신 관리
 */

// 콘솔 인코딩 설정 (Windows 한글 깨짐 방지)
if (process.platform === 'win32') {
  // Windows 콘솔 인코딩을 UTF-8로 설정
  process.stdout.setDefaultEncoding('utf8');
  process.stderr.setDefaultEncoding('utf8');
  // chcp 65001 (UTF-8) 설정
  try {
    require('child_process').execSync('chcp 65001 >nul 2>&1', { shell: true });
  } catch (e) {
    // 무시
  }
}

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const config = require('./config/config');
const PytestService = require('./services/pytestService');
const ScriptManager = require('./services/scriptManager');
const EnvironmentChecker = require('./services/environmentChecker');
const DbService = require('./services/dbService');

/** @type {BrowserWindow} 메인 윈도우 인스턴스 */
let mainWindow;

/**
 * 메인 윈도우 생성
 * Electron BrowserWindow를 생성하고 렌더러 프로세스를 로드
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: config.window.width,
    height: config.window.height,
    minWidth: config.window.minWidth,
    minHeight: config.window.minHeight,
    title: config.window.title,
    webPreferences: {
      nodeIntegration: false, // 보안: Node.js API 직접 접근 차단
      contextIsolation: true, // 보안: 컨텍스트 격리 활성화
      preload: config.paths.preload, // Preload 스크립트 경로
      webviewTag: true // WebView 태그 활성화 (Recorder 탭에서 사용)
    }
  });

  // 렌더러 HTML 파일 로드
  mainWindow.loadFile(config.paths.renderer);

  // 개발 모드에서 DevTools 자동 열기
  if (config.dev.enabled && config.dev.autoOpenDevTools) {
    mainWindow.webContents.openDevTools();
  }
}

/**
 * 애플리케이션 초기화
 * Electron 앱이 준비되면 윈도우 생성
 */
app.whenReady().then(async () => {
  // 스크립트 디렉토리 초기화
  ScriptManager.initializeScriptsDirectory();

  // 데이터베이스 초기화 (로컬 SQLite 파일)
  // sql.js는 비동기 초기화가 필요함
  DbService.init().then(() => {
    const config = DbService.getConfig();
    if (config && config.connected) {
      console.log('✅ 로컬 SQLite 데이터베이스 연결 완료');
      console.log(`📁 데이터베이스 위치: ${config.path}`);
    } else {
      console.warn('⚠️ 데이터베이스 초기화는 완료되었지만 연결 상태를 확인할 수 없습니다.');
    }
  }).catch((error) => {
    console.error('❌ 데이터베이스 연결 실패:', error.message);
    console.error('💡 데이터베이스 파일 생성에 실패했습니다.');
    console.error('💡 상세 오류:', error);
    // 초기화 실패해도 앱은 계속 실행
  });

  // 메인 윈도우 생성
  createWindow();

  // macOS에서 독 아이콘 클릭 시 윈도우 재생성
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 앱 종료 시 데이터베이스 연결 종료
app.on('before-quit', () => {
  try {
    DbService.close();
  } catch (error) {
    console.error('데이터베이스 연결 종료 실패:', error);
  }
});

/**
 * 모든 윈도우가 닫혔을 때 처리
 * macOS를 제외한 플랫폼에서는 앱 종료
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============================================================================
// IPC 핸들러 등록
// ============================================================================

/**
 * Pytest 테스트 실행 IPC 핸들러
 * 렌더러 프로세스에서 pytest 테스트 실행 요청 처리
 * 
 * @event ipcMain.handle:run-python-script
 * @param {Electron.IpcMainInvokeEvent} event - IPC 이벤트 객체
 * @param {string} testFile - 실행할 테스트 파일명
 * @param {string[]} args - pytest에 전달할 추가 인자 배열
 * @returns {Promise<Object>} 실행 결과 객체
 * 
 * @example
 * // 렌더러에서 호출
 * const result = await window.electronAPI.runPythonScript('test_example.py', ['-k', 'test_login']);
 */
ipcMain.handle('run-python-script', async (event, testFile, args = [], options = {}) => {
  try {
    const result = await PytestService.runTests(testFile, args, options);
    return result;
  } catch (error) {
    // 에러를 일관된 형식으로 반환
    return {
      success: false,
      error: error.error || error.message || '알 수 없는 오류가 발생했습니다.',
      stderr: error.stderr || '',
      stdout: error.stdout || ''
    };
  }
});

/**
 * 테스트 스크립트 목록 조회 IPC 핸들러
 * 사용 가능한 모든 테스트 스크립트 목록 반환
 * 
 * @event ipcMain.handle:get-test-scripts
 * @param {Electron.IpcMainInvokeEvent} event - IPC 이벤트 객체
 * @returns {Promise<string[]>} 스크립트 파일명 배열
 * 
 * @example
 * // 렌더러에서 호출
 * const scripts = await window.electronAPI.getTestScripts();
 */
ipcMain.handle('get-test-scripts', async (event) => {
  try {
    const scripts = await ScriptManager.getAvailableScripts();
    return scripts;
  } catch (error) {
    console.error('스크립트 목록 조회 실패:', error);
    return [];
  }
});

/**
 * 환경 검사 IPC 핸들러
 * Python, pytest 등 필수 환경이 준비되어 있는지 확인
 * 
 * @event ipcMain.handle:check-environment
 * @param {Electron.IpcMainInvokeEvent} event - IPC 이벤트 객체
 * @returns {Promise<Object>} 환경 검사 결과
 * 
 * @example
 * // 렌더러에서 호출
 * const envCheck = await window.electronAPI.checkEnvironment();
 * if (!envCheck.allReady) {
 *   console.log('설치 필요:', envCheck.missingItems);
 * }
 */
ipcMain.handle('check-environment', async (event) => {
  try {
    const result = await EnvironmentChecker.checkEnvironment();
    const installGuide = EnvironmentChecker.generateInstallGuide(result);
    return {
      ...result,
      installGuide
    };
  } catch (error) {
    console.error('환경 검사 실패:', error);
    return {
      pythonInstalled: false,
      pytestInstalled: false,
      jsonReportInstalled: false,
      allReady: false,
      missingItems: ['환경 검사 실패'],
      installGuide: '환경 검사를 수행할 수 없습니다.'
    };
  }
});

// ============================================================================
// 확장 포인트
// ============================================================================

/**
 * Recorder 기능 IPC 핸들러
 */

// 녹화된 이벤트 저장소
let recordedEvents = [];

/**
 * 녹화 시작 IPC 핸들러
 * @event ipcMain.handle:start-recording
 */
ipcMain.handle('start-recording', async (event, options) => {
  try {
    recordedEvents = []; // 이벤트 초기화
    console.log('녹화 시작:', options);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 녹화 중지 IPC 핸들러
 * @event ipcMain.handle:stop-recording
 */
ipcMain.handle('stop-recording', async (event) => {
  try {
    const events = [...recordedEvents];
    recordedEvents = []; // 이벤트 초기화
    console.log('녹화 중지, 이벤트 수:', events.length);
    return { success: true, events };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 이벤트 캡처 IPC 핸들러
 * @event ipcMain.handle:capture-event
 */
ipcMain.handle('capture-event', async (event, eventData) => {
  try {
    recordedEvents.push({
      ...eventData,
      timestamp: Date.now()
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 브라우저 열기 IPC 핸들러
 * @event ipcMain.handle:open-browser
 */
ipcMain.handle('open-browser', async (event, options) => {
  try {
    // 새 BrowserWindow 생성 (향후 구현)
    console.log('브라우저 열기:', options);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 프로젝트 관리 IPC 핸들러 (로컬 MySQL 직접 연결)
 */

ipcMain.handle('api-get-projects', async (event) => {
  try {
    const projects = DbService.all('SELECT * FROM projects ORDER BY updated_at DESC');
    return { success: true, data: projects };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-get-project', async (event, id) => {
  try {
    const project = DbService.get('SELECT * FROM projects WHERE id = ?', [id]);
    if (!project) {
      return { success: false, error: '프로젝트를 찾을 수 없습니다' };
    }
    return { success: true, data: project };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-create-project', async (event, data) => {
  try {
    const { name, description, created_by } = data;
    if (!name) {
      return { success: false, error: '프로젝트 이름은 필수입니다' };
    }
    const result = DbService.run(
      'INSERT INTO projects (name, description, created_by) VALUES (?, ?, ?)',
      [name, description || null, created_by || null]
    );
    const newProject = DbService.get('SELECT * FROM projects WHERE id = ?', [result.lastID]);
    return { success: true, data: newProject };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-update-project', async (event, id, data) => {
  try {
    const { name, description } = data;
    DbService.run(
      'UPDATE projects SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, description || null, id]
    );
    const updatedProject = DbService.get('SELECT * FROM projects WHERE id = ?', [id]);
    return { success: true, data: updatedProject };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-delete-project', async (event, id) => {
  try {
    DbService.run('DELETE FROM projects WHERE id = ?', [id]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 테스트케이스 관리 IPC 핸들러 (로컬 MySQL 직접 연결)
 */

// TC 트리 구조 생성 헬퍼 함수
function buildTree(items, parentId = null, scriptsMap = {}) {
  const parentIdValue = parentId === null ? null : parentId;
  
  return items
    .filter(item => {
      if (parentIdValue === null) {
        return item.parent_id === null;
      }
      return item.parent_id === parentIdValue;
    })
    .map(item => {
      const node = {
        id: item.id,
        name: item.name,
        description: item.description,
        type: item.type,
        status: item.status,
        hasScript: scriptsMap[item.id] || false,
        order_index: item.order_index,
        tc_number: item.tc_number || null, // 프로젝트별 TC 번호
        created_at: item.created_at,
        updated_at: item.updated_at
      };

      if (item.type === 'test_case') {
        // JSON 필드 파싱
        try {
          node.steps = item.steps ? JSON.parse(item.steps) : [];
        } catch (e) {
          node.steps = [];
        }
        try {
          node.tags = item.tags ? JSON.parse(item.tags) : [];
        } catch (e) {
          node.tags = [];
        }
      }

      // tc_number가 없으면 id를 사용 (기존 데이터 호환성)
      if (!node.tc_number && node.type === 'test_case') {
        node.tc_number = node.id;
      }

      // 자식 노드 추가
      const children = buildTree(items, item.id, scriptsMap);
      if (children.length > 0) {
        node.children = children;
      }

      return node;
    })
    .sort((a, b) => {
      // tc_number로 정렬 (없으면 order_index, 그 다음 id)
      if (a.tc_number && b.tc_number) {
        return a.tc_number - b.tc_number;
      }
      if (a.tc_number) return -1;
      if (b.tc_number) return 1;
      if (a.order_index !== b.order_index) {
        return a.order_index - b.order_index;
      }
      return a.id - b.id;
    });
}

ipcMain.handle('api-get-tc-tree', async (event, projectId) => {
  try {
    // 프로젝트의 모든 TC 조회
    const testCases = DbService.all(
      'SELECT * FROM test_cases WHERE project_id = ? ORDER BY parent_id, order_index, name',
      [projectId]
    );

    // 스크립트 존재 여부 확인
    const testCaseIds = testCases.map(tc => tc.id);
    let scriptsMap = {};
    if (testCaseIds.length > 0) {
      const placeholders = testCaseIds.map(() => '?').join(',');
      const scripts = DbService.all(
        `SELECT DISTINCT test_case_id FROM test_scripts WHERE test_case_id IN (${placeholders}) AND status = 'active'`,
        testCaseIds
      );
      scripts.forEach(s => {
        scriptsMap[s.test_case_id] = true;
      });
    }

    // 트리 구조로 변환
    const tree = buildTree(testCases, null, scriptsMap);
    return { success: true, data: tree };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-get-test-cases', async (event, params = {}) => {
  try {
    let query = 'SELECT * FROM test_cases WHERE 1=1';
    const queryParams = [];
    
    if (params.project_id) {
      query += ' AND project_id = ?';
      queryParams.push(params.project_id);
    }
    if (params.parent_id !== undefined) {
      query += ' AND parent_id = ?';
      queryParams.push(params.parent_id);
    }
    
    query += ' ORDER BY order_index, id';
    const testCases = DbService.all(query, queryParams);
    return { success: true, data: testCases };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-get-test-case', async (event, id) => {
  try {
    const testCase = DbService.get('SELECT * FROM test_cases WHERE id = ?', [id]);
    if (!testCase) {
      return { success: false, error: '테스트케이스를 찾을 수 없습니다' };
    }
    return { success: true, data: testCase };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-create-test-case', async (event, data) => {
  try {
    const { project_id, parent_id, name, description, type, steps, tags, status, order_index } = data;
    if (!project_id || !name) {
      return { success: false, error: '프로젝트 ID와 이름은 필수입니다' };
    }
    
    // tc_number 자동 할당 (test_case인 경우만)
    let tc_number = null;
    if (type === 'test_case') {
      try {
        const maxResult = DbService.get(
          'SELECT COALESCE(MAX(tc_number), 0) as max_number FROM test_cases WHERE project_id = ? AND type = ?',
          [project_id, 'test_case']
        );
        tc_number = (maxResult?.max_number || 0) + 1;
      } catch (error) {
        // tc_number 컬럼이 없을 수 있으므로 에러 무시
        console.warn('tc_number 조회 실패 (마이그레이션 필요):', error);
      }
    }
    
    const result = DbService.run(
      `INSERT INTO test_cases (project_id, tc_number, parent_id, name, description, type, steps, tags, status, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project_id,
        tc_number,
        parent_id || null,
        name,
        description || null,
        type || 'test_case',
        steps || null,
        tags || null,
        status || 'draft',
        order_index || 0
      ]
    );
    const newTestCase = DbService.get('SELECT * FROM test_cases WHERE id = ?', [result.lastID]);
    return { success: true, data: newTestCase };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-update-test-case', async (event, id, data) => {
  try {
    const { name, description, steps, tags, status, order_index, parent_id } = data;
    
    // parent_id 업데이트 포함
    if (parent_id !== undefined) {
      DbService.run(
        `UPDATE test_cases 
         SET name = COALESCE(?, name), 
             description = COALESCE(?, description), 
             steps = COALESCE(?, steps), 
             tags = COALESCE(?, tags), 
             status = COALESCE(?, status), 
             order_index = COALESCE(?, order_index),
             parent_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          name || null,
          description || null,
          steps || null,
          tags || null,
          status || null,
          order_index !== undefined ? order_index : null,
          parent_id,
          id
        ]
      );
    } else {
      DbService.run(
        `UPDATE test_cases 
         SET name = COALESCE(?, name), 
             description = COALESCE(?, description), 
             steps = COALESCE(?, steps), 
             tags = COALESCE(?, tags), 
             status = COALESCE(?, status), 
             order_index = COALESCE(?, order_index),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          name || null,
          description || null,
          steps || null,
          tags || null,
          status || null,
          order_index !== undefined ? order_index : null,
          id
        ]
      );
    }
    
    const updatedTestCase = DbService.get('SELECT * FROM test_cases WHERE id = ?', [id]);
    return { success: true, data: updatedTestCase };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-delete-test-case', async (event, id) => {
  try {
    DbService.run('DELETE FROM test_cases WHERE id = ?', [id]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 스크립트 관리 IPC 핸들러 (로컬 MySQL 직접 연결)
 */

ipcMain.handle('api-get-scripts', async (event, params = {}) => {
  try {
    let query = 'SELECT * FROM test_scripts WHERE 1=1';
    const queryParams = [];
    
    if (params.test_case_id) {
      query += ' AND test_case_id = ?';
      queryParams.push(params.test_case_id);
    }
    if (params.framework) {
      query += ' AND framework = ?';
      queryParams.push(params.framework);
    }
    
    query += ' ORDER BY created_at DESC';
    const scripts = DbService.all(query, queryParams);
    return { success: true, data: scripts };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-create-script', async (event, data) => {
  try {
    const { test_case_id, name, framework, language, code, file_path, status } = data;
    if (!name || !framework || !language || !code) {
      return { success: false, error: '이름, 프레임워크, 언어, 코드는 필수입니다' };
    }

    // 파일 경로 생성 (test_case_id가 있는 경우)
    let finalFilePath = file_path;
    if (!finalFilePath && test_case_id) {
      const fs = require('fs').promises;
      const path = require('path');
      const scriptsDir = config.paths.scripts;
      const extension = language === 'python' ? 'py' : language === 'typescript' ? 'ts' : 'js';
      
      // pytest 형식으로 파일명 생성 (test_*.py)
      let filename;
      if (language === 'python' && framework === 'pytest') {
        // pytest 형식: test_tc{id}_{name}.py
        const sanitizedName = name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
        filename = `test_tc${test_case_id}_${sanitizedName}.${extension}`;
      } else {
        // 기존 형식: {name}_{timestamp}.{ext}
        filename = `${name.replace(/\s+/g, '_')}_${Date.now()}.${extension}`;
      }
      
      finalFilePath = path.join(scriptsDir, filename);

      // 파일 저장
      try {
        await fs.mkdir(scriptsDir, { recursive: true });
        await fs.writeFile(finalFilePath, code, 'utf-8');
      } catch (fileError) {
        console.warn('파일 저장 실패:', fileError);
        // 파일 저장 실패해도 DB에는 저장
        finalFilePath = null;
      }
    }

    const result = DbService.run(
      `INSERT INTO test_scripts (test_case_id, name, framework, language, code, file_path, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        test_case_id || null,
        name,
        framework,
        language,
        code,
        finalFilePath,
        status || 'active'
      ]
    );
    const newScript = DbService.get('SELECT * FROM test_scripts WHERE id = ?', [result.lastID]);
    return { success: true, data: newScript };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-update-script', async (event, id, data) => {
  try {
    const { name, framework, language, code, file_path, status } = data;
    
    // 기존 스크립트 조회
    const existing = DbService.get('SELECT * FROM test_scripts WHERE id = ?', [id]);
    if (!existing) {
      return { success: false, error: '스크립트를 찾을 수 없습니다' };
    }

    // 파일 업데이트 (code가 있고 file_path가 있는 경우)
    if (code && existing.file_path) {
      try {
        const fs = require('fs').promises;
        await fs.writeFile(existing.file_path, code, 'utf-8');
      } catch (fileError) {
        console.warn('파일 업데이트 실패:', fileError);
      }
    }

    DbService.run(
      `UPDATE test_scripts 
       SET name = COALESCE(?, name), 
           framework = COALESCE(?, framework), 
           language = COALESCE(?, language), 
           code = COALESCE(?, code), 
           file_path = COALESCE(?, file_path), 
           status = COALESCE(?, status), 
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name || null,
        framework || null,
        language || null,
        code || null,
        file_path || null,
        status || null,
        id
      ]
    );
    const updatedScript = DbService.get('SELECT * FROM test_scripts WHERE id = ?', [id]);
    return { success: true, data: updatedScript };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-delete-script', async (event, id) => {
  try {
    // 기존 스크립트 조회
    const existing = DbService.get('SELECT * FROM test_scripts WHERE id = ?', [id]);
    if (!existing) {
      return { success: false, error: '스크립트를 찾을 수 없습니다' };
    }

    // 파일 삭제 (있는 경우)
    if (existing.file_path) {
      try {
        const fs = require('fs').promises;
        await fs.unlink(existing.file_path);
      } catch (fileError) {
        console.warn('파일 삭제 실패:', fileError);
        // 파일 삭제 실패해도 DB에서는 삭제
      }
    }

    DbService.run('DELETE FROM test_scripts WHERE id = ?', [id]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-get-scripts-by-test-case', async (event, testCaseId) => {
  try {
    const scripts = DbService.all(
      'SELECT * FROM test_scripts WHERE test_case_id = ? ORDER BY created_at DESC',
      [testCaseId]
    );
    return { success: true, data: scripts };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 동기화 IPC 핸들러 (로컬 모드에서는 사용하지 않음)
 */

ipcMain.handle('api-get-sync-status', async (event) => {
  return { success: true, data: { synced: true, mode: 'local' } };
});

ipcMain.handle('api-get-test-case-full', async (event, id) => {
  try {
    const testCase = DbService.get('SELECT * FROM test_cases WHERE id = ?', [id]);
    if (!testCase) {
      return { success: false, error: '테스트케이스를 찾을 수 없습니다' };
    }
    const scripts = DbService.all('SELECT * FROM test_scripts WHERE test_case_id = ?', [id]);
    const results = DbService.all('SELECT * FROM test_results WHERE test_case_id = ? ORDER BY executed_at DESC', [id]);
    return {
      success: true,
      data: {
        testCase,
        scripts,
        results
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 객체 레퍼지토리 IPC 핸들러 (로컬 SQLite 직접 연결)
 */

ipcMain.handle('api-get-objects', async (event, projectId) => {
  try {
    const objects = DbService.all(
      'SELECT * FROM objects WHERE project_id = ? ORDER BY parent_id, priority, name',
      [projectId]
    );
    // selectors JSON 파싱
    const parsed = objects.map(obj => {
      const result = { ...obj };
      try {
        result.selectors = obj.selectors ? JSON.parse(obj.selectors) : [];
      } catch (e) {
        result.selectors = [];
      }
      return result;
    });
    return { success: true, data: parsed };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-get-object-tree', async (event, projectId) => {
  try {
    const objects = DbService.all(
      'SELECT * FROM objects WHERE project_id = ? ORDER BY parent_id, priority, name',
      [projectId]
    );
    
    // 트리 구조로 변환
    function buildTree(items, parentId) {
      const parentIdValue = parentId === null ? null : parentId;
      return items
        .filter(item => {
          if (parentIdValue === null) {
            return item.parent_id === null;
          }
          return item.parent_id === parentIdValue;
        })
        .map(item => {
          const node = { ...item };
          try {
            node.selectors = item.selectors ? JSON.parse(item.selectors) : [];
          } catch (e) {
            node.selectors = [];
          }
          const children = buildTree(items, item.id);
          if (children.length > 0) {
            node.children = children;
          }
          return node;
        })
        .sort((a, b) => (a.priority || 0) - (b.priority || 0));
    }
    
    const tree = buildTree(objects, null);
    return { success: true, data: tree };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-get-object', async (event, id) => {
  try {
    const object = DbService.get('SELECT * FROM objects WHERE id = ?', [id]);
    if (!object) {
      return { success: false, error: '객체를 찾을 수 없습니다' };
    }
    try {
      object.selectors = object.selectors ? JSON.parse(object.selectors) : [];
    } catch (e) {
      object.selectors = [];
    }
    return { success: true, data: object };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-create-object', async (event, data) => {
  try {
    const { project_id, parent_id, name, description, type, selectors, priority } = data;
    if (!project_id || !name) {
      return { success: false, error: 'project_id와 name은 필수입니다' };
    }
    if (!selectors || !Array.isArray(selectors) || selectors.length === 0) {
      return { success: false, error: 'selectors는 배열 형태로 최소 1개 이상 필요합니다' };
    }
    const result = DbService.run(
      `INSERT INTO objects (project_id, parent_id, name, description, type, selectors, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        project_id,
        parent_id || null,
        name,
        description || null,
        type || 'element',
        JSON.stringify(selectors),
        priority || 0
      ]
    );
    const newObject = DbService.get('SELECT * FROM objects WHERE id = ?', [result.lastID]);
    try {
      newObject.selectors = newObject.selectors ? JSON.parse(newObject.selectors) : [];
    } catch (e) {
      newObject.selectors = [];
    }
    return { success: true, data: newObject };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-update-object', async (event, id, data) => {
  try {
    const { name, description, selectors, priority } = data;
    DbService.run(
      `UPDATE objects 
       SET name = COALESCE(?, name), 
           description = COALESCE(?, description), 
           selectors = COALESCE(?, selectors), 
           priority = COALESCE(?, priority), 
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name || null,
        description !== undefined ? description : null,
        selectors ? JSON.stringify(selectors) : null,
        priority !== undefined ? priority : null,
        id
      ]
    );
    const updatedObject = DbService.get('SELECT * FROM objects WHERE id = ?', [id]);
    try {
      updatedObject.selectors = updatedObject.selectors ? JSON.parse(updatedObject.selectors) : [];
    } catch (e) {
      updatedObject.selectors = [];
    }
    return { success: true, data: updatedObject };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-delete-object', async (event, id) => {
  try {
    DbService.run('DELETE FROM objects WHERE id = ?', [id]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 서버 상태 확인 IPC 핸들러 (로컬 모드에서는 항상 연결됨)
 */

ipcMain.handle('api-check-server', async (event) => {
  try {
    // 데이터베이스 연결 확인
    DbService.get('SELECT 1');
    const config = DbService.getConfig();
    return { 
      connected: true, 
      mode: 'local',
      type: 'sqlite',
      path: config.path
    };
  } catch (error) {
    return { 
      connected: false, 
      error: error.message, 
      mode: 'local',
      type: 'sqlite'
    };
  }
});
