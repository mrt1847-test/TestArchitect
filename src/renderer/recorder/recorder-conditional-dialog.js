/**
 * 조건부 액션 다이얼로그 모듈
 * 조건부 액션 다이얼로그 UI 및 요소 선택 처리
 */

/**
 * 조건부 액션 다이얼로그 표시
 * @param {number} stepIndex - 스텝 인덱스 (-1이면 맨 끝에 추가)
 * @param {Object} stepEvent - 스텝 이벤트 정보
 * @param {Object} dependencies - 의존성 객체
 */
export function showConditionalActionDialog(stepIndex, stepEvent, dependencies) {
  const {
    addConditionalActionAfterStep,
    startSimpleElementSelection,
    validateBySelector,
    validateSiblingRelation,
    validateAncestorRelation,
    updateConditionalActionUI,
    updateCodePreview
  } = dependencies;

  // 기존 다이얼로그가 있으면 제거
  const existing = document.getElementById('conditional-action-dialog');
  if (existing) {
    existing.remove();
  }
  
  const dialog = document.createElement('div');
  dialog.id = 'conditional-action-dialog';
  dialog.className = 'modal-dialog';
  dialog.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 10000; background: var(--vscode-editor-background); border: 1px solid var(--vscode-border); border-radius: 8px; padding: 20px; min-width: 500px; max-width: 700px; max-height: 80vh; overflow-y: auto;';
  
  const dialogContent = document.createElement('div');
  dialogContent.className = 'modal-content';
  
  // 헤더
  const header = document.createElement('div');
  header.className = 'modal-header';
  header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;';
  header.innerHTML = '<h3>조건부 액션 추가</h3>';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.cssText = 'background: none; border: none; font-size: 24px; cursor: pointer; color: var(--vscode-foreground);';
  closeBtn.addEventListener('click', () => dialog.remove());
  header.appendChild(closeBtn);
  
  // 바디
  const body = document.createElement('div');
  body.className = 'modal-body';
  
  // 액션 타입 선택
  const actionTypeSection = document.createElement('div');
  actionTypeSection.style.cssText = 'margin-bottom: 20px;';
  actionTypeSection.innerHTML = '<label style="display: block; margin-bottom: 8px; font-weight: bold;">액션 타입:</label>';
  const actionTypeSelect = document.createElement('select');
  actionTypeSelect.id = 'conditional-action-type';
  actionTypeSelect.style.cssText = 'width: 100%; padding: 8px; border: 1px solid var(--vscode-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground);';
  actionTypeSelect.innerHTML = `
    <option value="conditionalAction">조건부 액션 (if 문)</option>
    <option value="relativeAction">상대 노드 탐색 (부모/형제/자식)</option>
    <option value="loopAction">반복 액션 (for 문)</option>
  `;
  actionTypeSection.appendChild(actionTypeSelect);
  
  // 조건 요소 선택 섹션
  const conditionElementSection = document.createElement('div');
  conditionElementSection.id = 'condition-element-section';
  conditionElementSection.style.cssText = 'margin-bottom: 20px;';
  conditionElementSection.innerHTML = `
    <label style="display: block; margin-bottom: 8px; font-weight: bold;">조건 요소 선택:</label>
    <button id="select-condition-element" style="width: 100%; padding: 8px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer;">요소 선택하기</button>
    <div id="selected-condition-element" style="margin-top: 8px; padding: 8px; background: var(--vscode-input-background); border-radius: 4px; display: none;"></div>
  `;
  
  // 조건 타입 선택
  const conditionTypeSection = document.createElement('div');
  conditionTypeSection.id = 'condition-type-section';
  conditionTypeSection.style.cssText = 'margin-bottom: 20px; display: none;';
  conditionTypeSection.innerHTML = `
    <label style="display: block; margin-bottom: 8px; font-weight: bold;">조건 타입:</label>
    <select id="condition-type" style="width: 100%; padding: 8px; border: 1px solid var(--vscode-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground);">
      <option value="is_visible">요소가 보임 (is_visible)</option>
      <option value="text_contains">텍스트 포함</option>
      <option value="text_equals">텍스트 일치</option>
      <option value="class_name">클래스명 포함</option>
      <option value="has_attribute">속성 존재</option>
    </select>
    <input id="condition-value" type="text" placeholder="조건 값 입력" style="width: 100%; margin-top: 8px; padding: 8px; border: 1px solid var(--vscode-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); display: none;">
  `;
  
  // 액션 대상 선택 (상대 노드 탐색용)
  const targetRelationSection = document.createElement('div');
  targetRelationSection.id = 'target-relation-section';
  targetRelationSection.style.cssText = 'margin-bottom: 20px; display: none;';
  targetRelationSection.innerHTML = `
    <label style="display: block; margin-bottom: 8px; font-weight: bold;">액션 대상:</label>
    <select id="target-relation" style="width: 100%; padding: 8px; border: 1px solid var(--vscode-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground);">
      <option value="parent">부모 노드</option>
      <option value="ancestor">조상 노드 (closest)</option>
      <option value="sibling">형제 노드</option>
      <option value="child">자식 노드</option>
    </select>
    <div id="child-selection-section" style="margin-top: 8px; display: none;">
      <button id="select-child-element" type="button" style="width: 100%; padding: 8px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; margin-bottom: 8px;">자식 요소 선택하기</button>
      <div id="selected-child-element" style="margin-bottom: 8px; padding: 8px; background: var(--vscode-input-background); border-radius: 4px; display: none;"></div>
    </div>
    <div id="sibling-selection-section" style="margin-top: 8px; display: none;">
      <button id="select-sibling-element" type="button" style="width: 100%; padding: 8px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; margin-bottom: 8px;">형제 요소 선택하기</button>
      <div id="selected-sibling-element" style="margin-bottom: 8px; padding: 8px; background: var(--vscode-input-background); border-radius: 4px; display: none;"></div>
    </div>
    <div id="ancestor-selection-section" style="margin-top: 8px; display: none;">
      <button id="select-ancestor-element" type="button" style="width: 100%; padding: 8px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; margin-bottom: 8px;">조상 요소 선택하기</button>
      <div id="selected-ancestor-element" style="margin-bottom: 8px; padding: 8px; background: var(--vscode-input-background); border-radius: 4px; display: none;"></div>
    </div>
    <input id="target-selector" type="text" placeholder="대상 셀렉터 (선택사항, 예: .item)" style="width: 100%; margin-top: 8px; padding: 8px; border: 1px solid var(--vscode-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground);">
  `;
  
  // 반복 모드 선택
  const loopModeSection = document.createElement('div');
  loopModeSection.id = 'loop-mode-section';
  loopModeSection.style.cssText = 'margin-bottom: 20px; display: none;';
  loopModeSection.innerHTML = `
    <label style="display: block; margin-bottom: 8px; font-weight: bold;">반복 모드:</label>
    <select id="loop-mode" style="width: 100%; padding: 8px; border: 1px solid var(--vscode-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground);">
      <option value="single">단일 액션</option>
      <option value="loop">반복 액션 (리스트 순회)</option>
    </select>
    <input id="loop-selector" type="text" placeholder="반복할 리스트 셀렉터 (예: .item)" style="width: 100%; margin-top: 8px; padding: 8px; border: 1px solid var(--vscode-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); display: none;">
  `;
  
  // 액션 타입 선택
  const actionTypeInputSection = document.createElement('div');
  actionTypeInputSection.style.cssText = 'margin-bottom: 20px;';
  actionTypeInputSection.innerHTML = `
    <label style="display: block; margin-bottom: 8px; font-weight: bold;">실행할 액션:</label>
    <select id="action-type" style="width: 100%; padding: 8px; border: 1px solid var(--vscode-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground);">
      <option value="click">클릭</option>
      <option value="type">입력</option>
      <option value="hover">호버</option>
      <option value="doubleClick">더블 클릭</option>
      <option value="rightClick">우클릭</option>
    </select>
    <input id="action-value" type="text" placeholder="입력할 값 (type 액션인 경우)" style="width: 100%; margin-top: 8px; padding: 8px; border: 1px solid var(--vscode-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); display: none;">
  `;
  
  // 코드 미리보기
  const previewSection = document.createElement('div');
  previewSection.style.cssText = 'margin-bottom: 20px;';
  previewSection.innerHTML = `
    <label style="display: block; margin-bottom: 8px; font-weight: bold;">코드 미리보기:</label>
    <pre id="code-preview" style="padding: 12px; background: var(--vscode-textBlockQuote-background); border: 1px solid var(--vscode-border); border-radius: 4px; font-size: 12px; max-height: 200px; overflow-y: auto; white-space: pre-wrap; word-wrap: break-word;"></pre>
  `;
  
  body.appendChild(actionTypeSection);
  body.appendChild(conditionElementSection);
  body.appendChild(conditionTypeSection);
  body.appendChild(targetRelationSection);
  body.appendChild(loopModeSection);
  body.appendChild(actionTypeInputSection);
  body.appendChild(previewSection);
  
  // 푸터
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  footer.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '취소';
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.style.cssText = 'padding: 8px 16px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 4px; cursor: pointer;';
  cancelBtn.addEventListener('click', () => dialog.remove());
  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = '추가';
  confirmBtn.className = 'btn btn-primary';
  confirmBtn.style.cssText = 'padding: 8px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer;';
  confirmBtn.addEventListener('click', () => {
    const actionType = actionTypeSelect.value;
    const conditionElement = dialog.dataset.conditionElement ? JSON.parse(dialog.dataset.conditionElement) : null;
    const childElement = dialog.dataset.childElement ? JSON.parse(dialog.dataset.childElement) : null;
    const siblingElement = dialog.dataset.siblingElement ? JSON.parse(dialog.dataset.siblingElement) : null;
    const ancestorElement = dialog.dataset.ancestorElement ? JSON.parse(dialog.dataset.ancestorElement) : null;
    const conditionType = document.getElementById('condition-type').value;
    const conditionValue = document.getElementById('condition-value').value;
    const targetRelation = document.getElementById('target-relation').value;
    const targetSelector = document.getElementById('target-selector').value;
    const loopMode = document.getElementById('loop-mode').value;
    const loopSelector = document.getElementById('loop-selector').value;
    const actionTypeValue = document.getElementById('action-type').value;
    const actionValue = document.getElementById('action-value').value;
    
    addConditionalActionAfterStep(stepIndex, {
      actionType,
      conditionElement,
      childElement,
      siblingElement,
      ancestorElement,
      conditionType,
      conditionValue,
      targetRelation,
      targetSelector,
      loopMode,
      loopSelector,
      actionTypeValue,
      actionValue
    });
    
    dialog.remove();
  });
  
  footer.appendChild(cancelBtn);
  footer.appendChild(confirmBtn);
  
  dialogContent.appendChild(header);
  dialogContent.appendChild(body);
  dialogContent.appendChild(footer);
  dialog.appendChild(dialogContent);
  document.body.appendChild(dialog);
  
  // 액션 타입 변경 시 UI 업데이트
  actionTypeSelect.addEventListener('change', () => {
    updateConditionalActionUI(actionTypeSelect.value, dialog, dependencies);
  });
  
  // 조건 타입 변경 시 값 입력 필드 표시/숨김
  document.getElementById('condition-type').addEventListener('change', (e) => {
    const conditionValueInput = document.getElementById('condition-value');
    const needsValue = ['text_contains', 'text_equals', 'class_name', 'has_attribute'].includes(e.target.value);
    conditionValueInput.style.display = needsValue ? 'block' : 'none';
    updateCodePreview(dialog, dependencies);
  });
  
  // 액션 타입 변경 시 값 입력 필드 표시/숨김
  document.getElementById('action-type').addEventListener('change', (e) => {
    const actionValueInput = document.getElementById('action-value');
    actionValueInput.style.display = e.target.value === 'type' ? 'block' : 'none';
    updateCodePreview(dialog, dependencies);
  });
  
  // 반복 모드 변경 시 리스트 셀렉터 표시/숨김
  document.getElementById('loop-mode').addEventListener('change', (e) => {
    const loopSelectorInput = document.getElementById('loop-selector');
    loopSelectorInput.style.display = e.target.value === 'loop' ? 'block' : 'none';
    updateCodePreview(dialog, dependencies);
  });
  
  // target-relation 변경 시 선택 버튼 표시/숨김
  document.getElementById('target-relation').addEventListener('change', (e) => {
    const childSelectionSection = document.getElementById('child-selection-section');
    const siblingSelectionSection = document.getElementById('sibling-selection-section');
    const ancestorSelectionSection = document.getElementById('ancestor-selection-section');
    const targetSelectorInput = document.getElementById('target-selector');
    
    // 모든 선택 섹션 숨김
    childSelectionSection.style.display = 'none';
    siblingSelectionSection.style.display = 'none';
    ancestorSelectionSection.style.display = 'none';
    
    // 선택된 요소 데이터 초기화
    delete dialog.dataset.childElement;
    delete dialog.dataset.siblingElement;
    delete dialog.dataset.ancestorElement;
    
    const selectedChildDiv = document.getElementById('selected-child-element');
    const selectedSiblingDiv = document.getElementById('selected-sibling-element');
    const selectedAncestorDiv = document.getElementById('selected-ancestor-element');
    if (selectedChildDiv) selectedChildDiv.style.display = 'none';
    if (selectedSiblingDiv) selectedSiblingDiv.style.display = 'none';
    if (selectedAncestorDiv) selectedAncestorDiv.style.display = 'none';
    
    // 선택된 관계에 따라 해당 섹션 표시
    if (e.target.value === 'child') {
      childSelectionSection.style.display = 'block';
      targetSelectorInput.placeholder = '또는 셀렉터를 직접 입력하세요 (예: .item)';
    } else if (e.target.value === 'sibling') {
      siblingSelectionSection.style.display = 'block';
      targetSelectorInput.placeholder = '또는 셀렉터를 직접 입력하세요 (예: .item)';
    } else if (e.target.value === 'ancestor') {
      ancestorSelectionSection.style.display = 'block';
      targetSelectorInput.placeholder = '또는 셀렉터를 직접 입력하세요 (예: .item)';
    } else {
      targetSelectorInput.placeholder = '대상 셀렉터 (선택사항, 예: .item)';
    }
    updateCodePreview(dialog, dependencies);
  });
  
  // 요소 선택 버튼 이벤트
  document.getElementById('select-condition-element').addEventListener('click', () => {
    activateElementSelectionForConditionalAction(stepIndex, dialog, dependencies);
  });
  
  // 자식 요소 선택 버튼 이벤트
  document.getElementById('select-child-element').addEventListener('click', () => {
    activateChildElementSelection(stepIndex, dialog, dependencies);
  });
  
  // 형제 요소 선택 버튼 이벤트
  document.getElementById('select-sibling-element').addEventListener('click', () => {
    activateSiblingElementSelection(stepIndex, dialog, dependencies);
  });
  
  // 조상 요소 선택 버튼 이벤트
  document.getElementById('select-ancestor-element').addEventListener('click', () => {
    activateAncestorElementSelection(stepIndex, dialog, dependencies);
  });
  
  // 모든 입력 변경 시 미리보기 업데이트
  [actionTypeSelect, document.getElementById('condition-type'), document.getElementById('condition-value'),
   document.getElementById('target-relation'), document.getElementById('target-selector'),
   document.getElementById('loop-mode'), document.getElementById('loop-selector'),
   document.getElementById('action-type'), document.getElementById('action-value')].forEach(el => {
    if (el) {
      el.addEventListener('input', () => updateCodePreview(dialog, dependencies));
      el.addEventListener('change', () => updateCodePreview(dialog, dependencies));
    }
  });
  
  // 초기 UI 업데이트
  updateConditionalActionUI(actionTypeSelect.value, dialog, dependencies);
}

/**
 * 조건부 액션 UI 업데이트
 * @param {string} actionType - 액션 타입
 * @param {HTMLElement} dialog - 다이얼로그 요소
 * @param {Object} dependencies - 의존성 객체
 */
export function updateConditionalActionUI(actionType, dialog, dependencies) {
  const conditionTypeSection = document.getElementById('condition-type-section');
  const targetRelationSection = document.getElementById('target-relation-section');
  const loopModeSection = document.getElementById('loop-mode-section');
  
  if (actionType === 'conditionalAction' || actionType === 'loopAction') {
    conditionTypeSection.style.display = 'block';
  } else {
    conditionTypeSection.style.display = 'none';
  }
  
  if (actionType === 'relativeAction') {
    targetRelationSection.style.display = 'block';
  } else {
    targetRelationSection.style.display = 'none';
  }
  
  if (actionType === 'loopAction') {
    loopModeSection.style.display = 'block';
  } else {
    loopModeSection.style.display = 'none';
  }
  
  updateCodePreview(dialog, dependencies);
}

/**
 * 코드 미리보기 업데이트
 * @param {HTMLElement} dialog - 다이얼로그 요소
 * @param {Object} dependencies - 의존성 객체
 */
export function updateCodePreview(dialog, dependencies) {
  const preview = document.getElementById('code-preview');
  if (!preview) return;
  
  const actionType = document.getElementById('conditional-action-type').value;
  const conditionElement = dialog.dataset.conditionElement ? JSON.parse(dialog.dataset.conditionElement) : null;
  const conditionType = document.getElementById('condition-type').value;
  const conditionValue = document.getElementById('condition-value').value;
  const targetRelation = document.getElementById('target-relation').value;
  const targetSelector = document.getElementById('target-selector').value;
  const loopMode = document.getElementById('loop-mode').value;
  const loopSelector = document.getElementById('loop-selector').value;
  const actionTypeValue = document.getElementById('action-type').value;
  const actionValue = document.getElementById('action-value').value;
  
  let code = '';
  
  if (actionType === 'conditionalAction') {
    if (conditionElement && conditionType) {
      const elementSelector = conditionElement.selector || 'page.locator("...")';
      code = `# 조건부 액션\n`;
      code += `${elementSelector}\n`;
      code += `if await ${elementSelector}.is_visible():\n`;
      code += `    await ${elementSelector}.click()`;
    } else {
      code = '조건 요소를 선택하세요.';
    }
  } else if (actionType === 'relativeAction') {
    if (conditionElement) {
      const baseSelector = conditionElement.selector || 'page.locator("...")';
      let targetSelectorCode = baseSelector;
      const childElement = dialog.dataset.childElement ? JSON.parse(dialog.dataset.childElement) : null;
      const siblingElement = dialog.dataset.siblingElement ? JSON.parse(dialog.dataset.siblingElement) : null;
      const ancestorElement = dialog.dataset.ancestorElement ? JSON.parse(dialog.dataset.ancestorElement) : null;
      
      if (targetRelation === 'parent') {
        targetSelectorCode = `${baseSelector}.locator('..')`;
      } else if (targetRelation === 'ancestor') {
        // 조상 요소가 선택되었으면 그것을 사용, 아니면 targetSelector 사용
        if (ancestorElement && ancestorElement.selector) {
          targetSelectorCode = ancestorElement.selector;
        } else if (targetSelector) {
          targetSelectorCode = `${baseSelector}.locator('xpath=ancestor::${targetSelector.replace(/^\./, '')}[1]')`;
        } else {
          targetSelectorCode = `${baseSelector}.locator('xpath=ancestor::*[1]')`;
        }
      } else if (targetRelation === 'sibling') {
        // 형제 요소가 선택되었으면 그것을 사용, 아니면 targetSelector 사용
        if (siblingElement && siblingElement.selector) {
          targetSelectorCode = siblingElement.selector;
        } else if (targetSelector) {
          const tagName = targetSelector.replace(/^\./, '').split('[')[0];
          targetSelectorCode = `${baseSelector}.locator('xpath=../following-sibling::${tagName}[1]')`;
        } else {
          targetSelectorCode = `${baseSelector}.locator('xpath=../following-sibling::*[1]')`;
        }
      } else if (targetRelation === 'child') {
        // 자식 요소가 선택되었으면 그것을 사용, 아니면 targetSelector 사용
        if (childElement && childElement.selector) {
          targetSelectorCode = childElement.selector;
        } else if (targetSelector) {
          targetSelectorCode = `${baseSelector}.locator('${targetSelector}')`;
        } else {
          targetSelectorCode = `${baseSelector}.locator('...')`;
        }
      }
      code = `# 상대 노드 탐색\n`;
      code += `element = ${baseSelector}\n`;
      code += `await ${targetSelectorCode}.click()`;
    } else {
      code = '조건 요소를 선택하세요.';
    }
  } else if (actionType === 'loopAction') {
    if (loopMode === 'loop' && loopSelector) {
      code = `# 반복 액션\n`;
      code += `items = page.locator('${loopSelector}')\n`;
      code += `count = await items.count()\n`;
      code += `for i in range(count):\n`;
      code += `    item = items.nth(i)\n`;
      if (conditionElement && conditionType) {
        const elementSelector = conditionElement.selector || 'item.locator("...")';
        code += `    if await ${elementSelector}.is_visible():\n`;
        code += `        await item.click()`;
      } else {
        code += `    await item.click()`;
      }
    } else {
      code = '반복 모드를 선택하고 리스트 셀렉터를 입력하세요.';
    }
  }
  
  preview.textContent = code;
}

/**
 * 조건부 액션을 위한 요소 선택 활성화
 * @param {number} stepIndex - 스텝 인덱스
 * @param {HTMLElement} dialog - 다이얼로그 요소
 * @param {Object} dependencies - 의존성 객체
 */
export function activateElementSelectionForConditionalAction(stepIndex, dialog, dependencies) {
  const {
    startSimpleElementSelection,
    updateCodePreview
  } = dependencies;

  startSimpleElementSelection((path, elementInfo) => {
    if (!path || path.length === 0) {
      alert('요소를 선택할 수 없습니다.');
      return;
    }
    
    const selectedElement = path[path.length - 1];
    const elementData = {
      selector: selectedElement.selector || selectedElement,
      xpath: selectedElement.xpathValue || selectedElement.xpath || null,
      text: elementInfo.text || selectedElement.textValue || null
    };
    
    dialog.dataset.conditionElement = JSON.stringify(elementData);
    
    const selectedElementDiv = document.getElementById('selected-condition-element');
    selectedElementDiv.style.display = 'block';
    selectedElementDiv.textContent = `선택된 요소: ${elementData.selector}`;
    
    updateCodePreview(dialog, dependencies);
  }, null, stepIndex);
}

/**
 * 자식 요소 선택 활성화 (부모-자식 관계 검증 포함)
 * @param {number} stepIndex - 스텝 인덱스
 * @param {HTMLElement} dialog - 다이얼로그 요소
 * @param {Object} dependencies - 의존성 객체
 */
export function activateChildElementSelection(stepIndex, dialog, dependencies) {
  const {
    startSimpleElementSelection,
    validateBySelector,
    updateCodePreview
  } = dependencies;

  // 부모 요소가 선택되었는지 확인
  const conditionElement = dialog.dataset.conditionElement ? JSON.parse(dialog.dataset.conditionElement) : null;
  if (!conditionElement) {
    alert('먼저 부모 요소를 선택하세요.');
    return;
  }
  
  // 부모 요소 정보를 저장하여 검증에 사용
  dialog.dataset.parentElementForValidation = JSON.stringify(conditionElement);
  
  startSimpleElementSelection((path, elementInfo) => {
    if (!path || path.length === 0) {
      alert('요소를 선택할 수 없습니다.');
      return;
    }
    
    const selectedElement = path[path.length - 1];
    const childElementData = {
      selector: selectedElement.selector || selectedElement,
      xpath: selectedElement.xpathValue || selectedElement.xpath || null,
      text: elementInfo.text || selectedElement.textValue || null
    };
    
    // 부모-자식 관계 검증
    const parentElement = dialog.dataset.parentElementForValidation ? JSON.parse(dialog.dataset.parentElementForValidation) : null;
    if (parentElement) {
      const isValid = validateBySelector(parentElement, childElementData);
      
      if (isValid) {
        // 검증 성공: 자식 요소 저장
        dialog.dataset.childElement = JSON.stringify(childElementData);
        
        const selectedChildDiv = document.getElementById('selected-child-element');
        selectedChildDiv.style.display = 'block';
        selectedChildDiv.textContent = `선택된 자식 요소: ${childElementData.selector}`;
        
        // target-selector에 자동으로 채우기
        const targetSelectorInput = document.getElementById('target-selector');
        if (targetSelectorInput && !targetSelectorInput.value) {
          // 셀렉터에서 클래스나 ID 추출 시도
          const selector = childElementData.selector || '';
          const match = selector.match(/['"]([^'"]+)['"]/);
          if (match) {
            targetSelectorInput.value = match[1];
          }
        }
        
        updateCodePreview(dialog, dependencies);
      } else {
        // 검증 실패: 경고 메시지
        alert('선택한 요소가 부모 요소의 자식이 아닙니다. 부모 요소 내부의 자식 요소를 선택하세요.');
      }
    } else {
      // 부모 요소 정보가 없으면 그냥 저장 (검증 없이)
      dialog.dataset.childElement = JSON.stringify(childElementData);
      
      const selectedChildDiv = document.getElementById('selected-child-element');
      selectedChildDiv.style.display = 'block';
      selectedChildDiv.textContent = `선택된 자식 요소: ${childElementData.selector}`;
      
      updateCodePreview(dialog, dependencies);
    }
  }, null, stepIndex);
}

/**
 * 형제 요소 선택 활성화 (형제 관계 검증 포함)
 * @param {number} stepIndex - 스텝 인덱스
 * @param {HTMLElement} dialog - 다이얼로그 요소
 * @param {Object} dependencies - 의존성 객체
 */
export function activateSiblingElementSelection(stepIndex, dialog, dependencies) {
  const {
    startSimpleElementSelection,
    validateSiblingRelation,
    updateCodePreview
  } = dependencies;

  // 기준 요소가 선택되었는지 확인
  const conditionElement = dialog.dataset.conditionElement ? JSON.parse(dialog.dataset.conditionElement) : null;
  if (!conditionElement) {
    alert('먼저 기준 요소를 선택하세요.');
    return;
  }
  
  // 기준 요소 정보를 저장하여 검증에 사용
  dialog.dataset.baseElementForValidation = JSON.stringify(conditionElement);
  
  startSimpleElementSelection((path, elementInfo) => {
    if (!path || path.length === 0) {
      alert('요소를 선택할 수 없습니다.');
      return;
    }
    
    const selectedElement = path[path.length - 1];
    const siblingElementData = {
      selector: selectedElement.selector || selectedElement,
      xpath: selectedElement.xpathValue || selectedElement.xpath || null,
      text: elementInfo.text || selectedElement.textValue || null
    };
    
    // 형제 관계 검증
    const baseElement = dialog.dataset.baseElementForValidation ? JSON.parse(dialog.dataset.baseElementForValidation) : null;
    if (baseElement) {
      const isValid = validateSiblingRelation(baseElement, siblingElementData);
      
      if (isValid) {
        // 검증 성공: 형제 요소 저장
        dialog.dataset.siblingElement = JSON.stringify(siblingElementData);
        
        const selectedSiblingDiv = document.getElementById('selected-sibling-element');
        selectedSiblingDiv.style.display = 'block';
        selectedSiblingDiv.textContent = `선택된 형제 요소: ${siblingElementData.selector}`;
        
        // target-selector에 자동으로 채우기
        const targetSelectorInput = document.getElementById('target-selector');
        if (targetSelectorInput && !targetSelectorInput.value) {
          const selector = siblingElementData.selector || '';
          const match = selector.match(/['"]([^'"]+)['"]/);
          if (match) {
            targetSelectorInput.value = match[1];
          }
        }
        
        updateCodePreview(dialog, dependencies);
      } else {
        // 검증 실패: 경고 메시지
        alert('선택한 요소가 기준 요소의 형제가 아닙니다. 같은 부모를 가진 형제 요소를 선택하세요.');
      }
    } else {
      // 기준 요소 정보가 없으면 그냥 저장 (검증 없이)
      dialog.dataset.siblingElement = JSON.stringify(siblingElementData);
      
      const selectedSiblingDiv = document.getElementById('selected-sibling-element');
      selectedSiblingDiv.style.display = 'block';
      selectedSiblingDiv.textContent = `선택된 형제 요소: ${siblingElementData.selector}`;
      
      updateCodePreview(dialog, dependencies);
    }
  }, null, stepIndex);
}

/**
 * 조상 요소 선택 활성화 (조상 관계 검증 포함)
 * @param {number} stepIndex - 스텝 인덱스
 * @param {HTMLElement} dialog - 다이얼로그 요소
 * @param {Object} dependencies - 의존성 객체
 */
export function activateAncestorElementSelection(stepIndex, dialog, dependencies) {
  const {
    startSimpleElementSelection,
    validateAncestorRelation,
    updateCodePreview
  } = dependencies;

  // 기준 요소가 선택되었는지 확인
  const conditionElement = dialog.dataset.conditionElement ? JSON.parse(dialog.dataset.conditionElement) : null;
  if (!conditionElement) {
    alert('먼저 기준 요소를 선택하세요.');
    return;
  }
  
  // 기준 요소 정보를 저장하여 검증에 사용
  dialog.dataset.baseElementForValidation = JSON.stringify(conditionElement);
  
  startSimpleElementSelection((path, elementInfo) => {
    if (!path || path.length === 0) {
      alert('요소를 선택할 수 없습니다.');
      return;
    }
    
    const selectedElement = path[path.length - 1];
    const ancestorElementData = {
      selector: selectedElement.selector || selectedElement,
      xpath: selectedElement.xpathValue || selectedElement.xpath || null,
      text: elementInfo.text || selectedElement.textValue || null
    };
    
    // 조상 관계 검증
    const baseElement = dialog.dataset.baseElementForValidation ? JSON.parse(dialog.dataset.baseElementForValidation) : null;
    if (baseElement) {
      const isValid = validateAncestorRelation(baseElement, ancestorElementData);
      
      if (isValid) {
        // 검증 성공: 조상 요소 저장
        dialog.dataset.ancestorElement = JSON.stringify(ancestorElementData);
        
        const selectedAncestorDiv = document.getElementById('selected-ancestor-element');
        selectedAncestorDiv.style.display = 'block';
        selectedAncestorDiv.textContent = `선택된 조상 요소: ${ancestorElementData.selector}`;
        
        // target-selector에 자동으로 채우기
        const targetSelectorInput = document.getElementById('target-selector');
        if (targetSelectorInput && !targetSelectorInput.value) {
          const selector = ancestorElementData.selector || '';
          const match = selector.match(/['"]([^'"]+)['"]/);
          if (match) {
            targetSelectorInput.value = match[1];
          }
        }
        
        updateCodePreview(dialog, dependencies);
      } else {
        // 검증 실패: 경고 메시지
        alert('선택한 요소가 기준 요소의 조상이 아닙니다. 기준 요소의 상위 요소를 선택하세요.');
      }
    } else {
      // 기준 요소 정보가 없으면 그냥 저장 (검증 없이)
      dialog.dataset.ancestorElement = JSON.stringify(ancestorElementData);
      
      const selectedAncestorDiv = document.getElementById('selected-ancestor-element');
      selectedAncestorDiv.style.display = 'block';
      selectedAncestorDiv.textContent = `선택된 조상 요소: ${ancestorElementData.selector}`;
      
      updateCodePreview(dialog, dependencies);
    }
  }, null, stepIndex);
}

