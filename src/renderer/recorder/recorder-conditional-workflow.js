/**
 * 조건부 액션 워크플로우 모듈
 * 조건부 액션 단계별 워크플로우 처리
 */

/**
 * 조건부 액션 단계별 워크플로우 시작
 * @param {number} stepIndex - 조건부 액션을 추가할 스텝의 인덱스
 * @param {Object} stepEvent - 스텝 이벤트 정보
 * @param {Object} stateRefs - 상태 참조 객체 (conditionalActionStep, conditionalActionData)
 * @param {Object} dependencies - 의존성 객체
 */
export function startConditionalActionWorkflow(stepIndex, stepEvent, stateRefs, dependencies) {
  const {
    updateConditionalActionStep
  } = dependencies;

  // 상태 초기화
  stateRefs.conditionalActionStep = 1;
  stateRefs.conditionalActionData = {
    actionType: null,
    conditionElement: null,
    childElement: null,
    siblingElement: null,
    ancestorElement: null,
    conditionType: null,
    conditionValue: null,
    targetRelation: null,
    targetSelector: null,
    loopMode: null,
    loopSelector: null,
    actionTypeValue: null,
    actionValue: null,
    stepIndex: stepIndex
  };
  
  // 메뉴 표시
  const menu = document.getElementById('global-conditional-action-menu');
  if (menu) {
    menu.classList.remove('hidden');
    // 네비게이션 표시 (첫 단계에서도 취소 버튼 표시)
    const navigation = document.getElementById('conditional-action-navigation');
    const backBtn = document.getElementById('conditional-action-back-btn');
    if (navigation) {
      navigation.style.display = 'flex';
      if (backBtn) {
        backBtn.style.display = 'none'; // 첫 단계에서는 이전 버튼 숨김
      }
    }
    updateConditionalActionStep(1, stateRefs, dependencies);
  }
}

/**
 * 조건부 액션 단계별 UI 업데이트
 * @param {number} step - 현재 단계 번호
 * @param {Object} stateRefs - 상태 참조 객체
 * @param {Object} dependencies - 의존성 객체
 */
export function updateConditionalActionStep(step, stateRefs, dependencies) {
  const {
    startSimpleElementSelection,
    validateBySelector,
    validateSiblingRelation,
    validateAncestorRelation
  } = dependencies;

  const menu = document.getElementById('global-conditional-action-menu');
  const header = document.getElementById('conditional-action-header');
  const buttonsContainer = document.getElementById('conditional-action-buttons');
  const navigation = document.getElementById('conditional-action-navigation');
  const backBtn = document.getElementById('conditional-action-back-btn');
  const cancelBtn = document.getElementById('conditional-action-cancel-btn');
  
  if (!menu || !header || !buttonsContainer) return;
  
  // 취소 버튼 이벤트 리스너
  if (cancelBtn) {
    cancelBtn.onclick = () => cancelConditionalAction(stateRefs, dependencies);
  }
  
  // 이전 버튼 표시/숨김
  if (navigation && backBtn) {
    if (step > 1) {
      navigation.style.display = 'flex';
      backBtn.style.display = 'block';
      backBtn.onclick = () => goToConditionalActionStep(step - 1, stateRefs, dependencies);
    } else {
      // 첫 번째 단계에서도 취소 버튼은 표시
      navigation.style.display = 'flex';
      backBtn.style.display = 'none'; // 이전 버튼만 숨김
    }
  }
  
  // 단계별 UI 업데이트
  buttonsContainer.innerHTML = '';
  
  if (step === 1) {
    // 첫 번째 단계: 액션 타입 선택
    header.textContent = '액션 타입 선택';
    const actionTypes = [
      { value: 'conditionalAction', label: '조건부 액션 (if 문)' },
      { value: 'relativeAction', label: '상대 노드 탐색 (부모/형제/자식)' },
      { value: 'loopAction', label: '반복 액션 (for 문)' }
    ];
    
    actionTypes.forEach(type => {
      const btn = document.createElement('button');
      btn.className = 'assertion-menu-btn';
      btn.textContent = type.label;
      btn.onclick = () => {
        stateRefs.conditionalActionData.actionType = type.value;
        stateRefs.conditionalActionStep = 2;
        updateConditionalActionStep(2, stateRefs, dependencies);
      };
      buttonsContainer.appendChild(btn);
    });
  } else if (step === 2) {
    // 두 번째 단계: 액션 타입에 따른 다음 선택지
    if (stateRefs.conditionalActionData.actionType === 'conditionalAction') {
      header.textContent = '조건 요소 선택';
      const btn = document.createElement('button');
      btn.className = 'assertion-menu-btn';
      btn.textContent = '요소 선택하기';
      btn.onclick = () => {
        activateElementSelectionForConditionalActionStep(stateRefs, dependencies);
      };
      buttonsContainer.appendChild(btn);
    } else if (stateRefs.conditionalActionData.actionType === 'relativeAction') {
      header.textContent = '액션 대상 선택';
      const relations = [
        { value: 'parent', label: '부모 노드' },
        { value: 'ancestor', label: '조상 노드 (closest)' },
        { value: 'sibling', label: '형제 노드' },
        { value: 'child', label: '자식 노드' }
      ];
      
      relations.forEach(rel => {
        const btn = document.createElement('button');
        btn.className = 'assertion-menu-btn';
        btn.textContent = rel.label;
        btn.onclick = () => {
          stateRefs.conditionalActionData.targetRelation = rel.value;
          stateRefs.conditionalActionStep = 3;
          updateConditionalActionStep(3, stateRefs, dependencies);
        };
        buttonsContainer.appendChild(btn);
      });
    } else if (stateRefs.conditionalActionData.actionType === 'loopAction') {
      header.textContent = '반복 모드 선택';
      const modes = [
        { value: 'single', label: '단일 액션' },
        { value: 'loop', label: '반복 액션 (리스트 순회)' }
      ];
      
      modes.forEach(mode => {
        const btn = document.createElement('button');
        btn.className = 'assertion-menu-btn';
        btn.textContent = mode.label;
        btn.onclick = () => {
          stateRefs.conditionalActionData.loopMode = mode.value;
          if (mode.value === 'loop') {
            // 리스트 셀렉터 입력 단계로
            stateRefs.conditionalActionStep = 3;
            updateConditionalActionStep(3, stateRefs, dependencies);
          } else {
            // 조건 요소 선택 단계로
            stateRefs.conditionalActionStep = 4;
            updateConditionalActionStep(4, stateRefs, dependencies);
          }
        };
        buttonsContainer.appendChild(btn);
      });
    }
  } else if (step === 3) {
    // 세 번째 단계: 요소 선택 또는 추가 입력
    if (stateRefs.conditionalActionData.actionType === 'conditionalAction') {
      // 조건 요소가 선택되었으면 조건 타입 선택
      if (stateRefs.conditionalActionData.conditionElement) {
        header.textContent = '조건 타입 선택';
        const conditionTypes = [
          { value: 'is_visible', label: '요소가 보임 (is_visible)' },
          { value: 'text_contains', label: '텍스트 포함' },
          { value: 'text_equals', label: '텍스트 일치' },
          { value: 'class_name', label: '클래스명 포함' },
          { value: 'has_attribute', label: '속성 존재' }
        ];
        
        conditionTypes.forEach(type => {
          const btn = document.createElement('button');
          btn.className = 'assertion-menu-btn';
          btn.textContent = type.label;
          btn.onclick = () => {
            stateRefs.conditionalActionData.conditionType = type.value;
            if (['text_contains', 'text_equals', 'class_name', 'has_attribute'].includes(type.value)) {
              // 조건 값 입력 단계로
              stateRefs.conditionalActionStep = 4;
              updateConditionalActionStep(4, stateRefs, dependencies);
            } else {
              // 실행할 액션 선택 단계로
              stateRefs.conditionalActionStep = 5;
              updateConditionalActionStep(5, stateRefs, dependencies);
            }
          };
          buttonsContainer.appendChild(btn);
        });
      }
    } else if (stateRefs.conditionalActionData.actionType === 'relativeAction') {
      // 기준 요소 선택
      header.textContent = '기준 요소 선택';
      const btn = document.createElement('button');
      btn.className = 'assertion-menu-btn';
      btn.textContent = '요소 선택하기';
      btn.onclick = () => {
        activateElementSelectionForRelativeActionStep('base', stateRefs, dependencies);
      };
      buttonsContainer.appendChild(btn);
    } else if (stateRefs.conditionalActionData.actionType === 'loopAction' && stateRefs.conditionalActionData.loopMode === 'loop') {
      // 리스트 셀렉터 입력
      header.textContent = '리스트 셀렉터 입력';
      const inputContainer = document.createElement('div');
      inputContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
      
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = '리스트 셀렉터 (예: .item)';
      input.style.cssText = 'width: 100%; padding: 8px; border: 1px solid var(--vscode-input-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground);';
      
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'assertion-menu-btn';
      confirmBtn.textContent = '확인';
      confirmBtn.onclick = () => {
        stateRefs.conditionalActionData.loopSelector = input.value;
        if (stateRefs.conditionalActionData.loopSelector) {
          stateRefs.conditionalActionStep = 4;
          updateConditionalActionStep(4, stateRefs, dependencies);
        }
      };
      
      inputContainer.appendChild(input);
      inputContainer.appendChild(confirmBtn);
      buttonsContainer.appendChild(inputContainer);
    }
  } else if (step === 4) {
    // 네 번째 단계: 조건 값 입력 또는 관계 요소 선택
    if (stateRefs.conditionalActionData.actionType === 'conditionalAction') {
      if (['text_contains', 'text_equals', 'class_name', 'has_attribute'].includes(stateRefs.conditionalActionData.conditionType)) {
        // 조건 값 입력
        header.textContent = '조건 값 입력';
        const inputContainer = document.createElement('div');
        inputContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = '조건 값 입력';
        input.style.cssText = 'width: 100%; padding: 8px; border: 1px solid var(--vscode-input-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground);';
        
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'assertion-menu-btn';
        confirmBtn.textContent = '확인';
        confirmBtn.onclick = () => {
          stateRefs.conditionalActionData.conditionValue = input.value;
          stateRefs.conditionalActionStep = 5;
          updateConditionalActionStep(5, stateRefs, dependencies);
        };
        
        inputContainer.appendChild(input);
        inputContainer.appendChild(confirmBtn);
        buttonsContainer.appendChild(inputContainer);
      }
    } else if (stateRefs.conditionalActionData.actionType === 'relativeAction') {
      // 기준 요소가 선택되었으면 관계 요소 선택 또는 실행할 액션 선택
      if (stateRefs.conditionalActionData.conditionElement) {
        if (['child', 'sibling', 'ancestor'].includes(stateRefs.conditionalActionData.targetRelation)) {
          // 관계 요소 선택
          header.textContent = `${stateRefs.conditionalActionData.targetRelation === 'child' ? '자식' : stateRefs.conditionalActionData.targetRelation === 'sibling' ? '형제' : '조상'} 요소 선택`;
          const btn = document.createElement('button');
          btn.className = 'assertion-menu-btn';
          btn.textContent = '요소 선택하기';
          btn.onclick = () => {
            activateElementSelectionForRelativeActionStep(stateRefs.conditionalActionData.targetRelation, stateRefs, dependencies);
          };
          buttonsContainer.appendChild(btn);
        } else {
          // 부모 노드는 관계 요소 선택 불필요, 바로 실행할 액션 선택
          stateRefs.conditionalActionStep = 5;
          updateConditionalActionStep(5, stateRefs, dependencies);
        }
      }
    } else if (stateRefs.conditionalActionData.actionType === 'loopAction') {
      // 조건 요소 선택
      if (!stateRefs.conditionalActionData.conditionElement) {
        header.textContent = '조건 요소 선택';
        const btn = document.createElement('button');
        btn.className = 'assertion-menu-btn';
        btn.textContent = '요소 선택하기';
        btn.onclick = () => {
          activateElementSelectionForConditionalActionStep(stateRefs, dependencies);
        };
        buttonsContainer.appendChild(btn);
      } else if (!stateRefs.conditionalActionData.conditionType) {
        // 조건 요소가 선택되었으면 조건 타입 선택
        header.textContent = '조건 타입 선택';
        const conditionTypes = [
          { value: 'is_visible', label: '요소가 보임 (is_visible)' },
          { value: 'text_contains', label: '텍스트 포함' },
          { value: 'text_equals', label: '텍스트 일치' },
          { value: 'class_name', label: '클래스명 포함' },
          { value: 'has_attribute', label: '속성 존재' }
        ];
        
        conditionTypes.forEach(type => {
          const btn = document.createElement('button');
          btn.className = 'assertion-menu-btn';
          btn.textContent = type.label;
          btn.onclick = () => {
            stateRefs.conditionalActionData.conditionType = type.value;
            if (['text_contains', 'text_equals', 'class_name', 'has_attribute'].includes(type.value)) {
              // 조건 값 입력 단계로
              stateRefs.conditionalActionStep = 5;
              updateConditionalActionStep(5, stateRefs, dependencies);
            } else {
              // 실행할 액션 선택 단계로
              stateRefs.conditionalActionStep = 6;
              updateConditionalActionStep(6, stateRefs, dependencies);
            }
          };
          buttonsContainer.appendChild(btn);
        });
      } else {
        // 조건 타입이 선택되었으면 실행할 액션 선택
        stateRefs.conditionalActionStep = 6;
        updateConditionalActionStep(6, stateRefs, dependencies);
      }
    }
  } else if (step === 5) {
    // 다섯 번째 단계: 조건 값 입력 또는 실행할 액션 선택
    if (stateRefs.conditionalActionData.actionType === 'loopAction' && ['text_contains', 'text_equals', 'class_name', 'has_attribute'].includes(stateRefs.conditionalActionData.conditionType)) {
      // 조건 값 입력
      header.textContent = '조건 값 입력';
      const inputContainer = document.createElement('div');
      inputContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
      
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = '조건 값 입력';
      input.style.cssText = 'width: 100%; padding: 8px; border: 1px solid var(--vscode-input-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground);';
      
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'assertion-menu-btn';
      confirmBtn.textContent = '확인';
      confirmBtn.onclick = () => {
        stateRefs.conditionalActionData.conditionValue = input.value;
        stateRefs.conditionalActionStep = 6;
        updateConditionalActionStep(6, stateRefs, dependencies);
      };
      
      inputContainer.appendChild(input);
      inputContainer.appendChild(confirmBtn);
      buttonsContainer.appendChild(inputContainer);
    } else {
      // 실행할 액션 선택
      header.textContent = '실행할 액션 선택';
      const actions = [
        { value: 'click', label: '클릭' },
        { value: 'type', label: '입력' },
        { value: 'hover', label: '호버' },
        { value: 'doubleClick', label: '더블 클릭' },
        { value: 'rightClick', label: '우클릭' }
      ];
      
      actions.forEach(action => {
        const btn = document.createElement('button');
        btn.className = 'assertion-menu-btn';
        btn.textContent = action.label;
        btn.onclick = () => {
          stateRefs.conditionalActionData.actionTypeValue = action.value;
          if (action.value === 'type') {
            // 입력 값 입력 단계로
            stateRefs.conditionalActionStep = 6;
            updateConditionalActionStep(6, stateRefs, dependencies);
          } else {
            // 최종 확인 단계로
            stateRefs.conditionalActionStep = 7;
            updateConditionalActionStep(7, stateRefs, dependencies);
          }
        };
        buttonsContainer.appendChild(btn);
      });
    }
  } else if (step === 6) {
    // 여섯 번째 단계: 입력 값 입력 (type 액션인 경우) 또는 실행할 액션 선택
    if (stateRefs.conditionalActionData.actionTypeValue === 'type') {
      // 입력 값 입력
      header.textContent = '입력할 값 입력';
      const inputContainer = document.createElement('div');
      inputContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
      
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = '입력할 값';
      input.style.cssText = 'width: 100%; padding: 8px; border: 1px solid var(--vscode-input-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground);';
      
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'assertion-menu-btn';
      confirmBtn.textContent = '확인';
      confirmBtn.onclick = () => {
        stateRefs.conditionalActionData.actionValue = input.value;
        stateRefs.conditionalActionStep = 7;
        updateConditionalActionStep(7, stateRefs, dependencies);
      };
      
      inputContainer.appendChild(input);
      inputContainer.appendChild(confirmBtn);
      buttonsContainer.appendChild(inputContainer);
    } else {
      // 실행할 액션 선택 (루프 액션의 경우)
      header.textContent = '실행할 액션 선택';
      const actions = [
        { value: 'click', label: '클릭' },
        { value: 'type', label: '입력' },
        { value: 'hover', label: '호버' },
        { value: 'doubleClick', label: '더블 클릭' },
        { value: 'rightClick', label: '우클릭' }
      ];
      
      actions.forEach(action => {
        const btn = document.createElement('button');
        btn.className = 'assertion-menu-btn';
        btn.textContent = action.label;
        btn.onclick = () => {
          stateRefs.conditionalActionData.actionTypeValue = action.value;
          if (action.value === 'type') {
            // 입력 값 입력 단계로
            stateRefs.conditionalActionStep = 7;
            updateConditionalActionStep(7, stateRefs, dependencies);
          } else {
            // 최종 확인 단계로
            stateRefs.conditionalActionStep = 8;
            updateConditionalActionStep(8, stateRefs, dependencies);
          }
        };
        buttonsContainer.appendChild(btn);
      });
    }
  } else if (step === 7) {
    // 일곱 번째 단계: 입력 값 입력 (type 액션인 경우) 또는 최종 확인
    if (stateRefs.conditionalActionData.actionTypeValue === 'type' && !stateRefs.conditionalActionData.actionValue) {
      // 입력 값 입력
      header.textContent = '입력할 값 입력';
      const inputContainer = document.createElement('div');
      inputContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
      
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = '입력할 값';
      input.style.cssText = 'width: 100%; padding: 8px; border: 1px solid var(--vscode-input-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground);';
      
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'assertion-menu-btn';
      confirmBtn.textContent = '확인';
      confirmBtn.onclick = () => {
        stateRefs.conditionalActionData.actionValue = input.value;
        stateRefs.conditionalActionStep = 8;
        updateConditionalActionStep(8, stateRefs, dependencies);
      };
      
      inputContainer.appendChild(input);
      inputContainer.appendChild(confirmBtn);
      buttonsContainer.appendChild(inputContainer);
    } else {
      // 최종 확인
      header.textContent = '조건부 액션 추가';
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'assertion-menu-btn';
      confirmBtn.textContent = '추가';
      confirmBtn.style.cssText = 'background: var(--vscode-button-background); color: var(--vscode-button-foreground);';
      confirmBtn.onclick = () => {
        completeConditionalAction(stateRefs, dependencies);
      };
      buttonsContainer.appendChild(confirmBtn);
    }
  } else if (step === 8) {
    // 여덟 번째 단계: 최종 확인
    header.textContent = '조건부 액션 추가';
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'assertion-menu-btn';
    confirmBtn.textContent = '추가';
    confirmBtn.style.cssText = 'background: var(--vscode-button-background); color: var(--vscode-button-foreground);';
    confirmBtn.onclick = () => {
      completeConditionalAction(stateRefs, dependencies);
    };
    buttonsContainer.appendChild(confirmBtn);
  }
}

/**
 * 이전 단계로 이동
 * @param {number} step - 이동할 단계 번호
 * @param {Object} stateRefs - 상태 참조 객체
 * @param {Object} dependencies - 의존성 객체
 */
export function goToConditionalActionStep(step, stateRefs, dependencies) {
  stateRefs.conditionalActionStep = step;
  updateConditionalActionStep(step, stateRefs, dependencies);
}

/**
 * 조건부 액션을 위한 요소 선택 활성화 (단계별 워크플로우용)
 * @param {Object} stateRefs - 상태 참조 객체
 * @param {Object} dependencies - 의존성 객체
 */
export function activateElementSelectionForConditionalActionStep(stateRefs, dependencies) {
  const {
    startSimpleElementSelection,
    updateConditionalActionStep
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
    
    stateRefs.conditionalActionData.conditionElement = elementData;
    
    // 다음 단계로 진행
    if (stateRefs.conditionalActionData.actionType === 'conditionalAction') {
      stateRefs.conditionalActionStep = 3;
      updateConditionalActionStep(3, stateRefs, dependencies);
    } else if (stateRefs.conditionalActionData.actionType === 'loopAction') {
      // 루프 액션의 경우 조건 타입 선택 단계로
      stateRefs.conditionalActionStep = 4;
      updateConditionalActionStep(4, stateRefs, dependencies);
    }
  }, null, stateRefs.conditionalActionData.stepIndex);
}

/**
 * 상대 노드 탐색을 위한 요소 선택 활성화 (단계별 워크플로우용)
 * @param {string} type - 'base', 'child', 'sibling', 'ancestor'
 * @param {Object} stateRefs - 상태 참조 객체
 * @param {Object} dependencies - 의존성 객체
 */
export function activateElementSelectionForRelativeActionStep(type, stateRefs, dependencies) {
  const {
    startSimpleElementSelection,
    validateBySelector,
    validateSiblingRelation,
    validateAncestorRelation,
    updateConditionalActionStep
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
    
    if (type === 'base') {
      stateRefs.conditionalActionData.conditionElement = elementData;
      // 관계 요소 선택 단계로 (child, sibling, ancestor인 경우)
      if (['child', 'sibling', 'ancestor'].includes(stateRefs.conditionalActionData.targetRelation)) {
        stateRefs.conditionalActionStep = 4;
        updateConditionalActionStep(4, stateRefs, dependencies);
      } else {
        // 부모 노드는 바로 실행할 액션 선택
        stateRefs.conditionalActionStep = 5;
        updateConditionalActionStep(5, stateRefs, dependencies);
      }
    } else if (type === 'child') {
      // 부모-자식 관계 검증
      if (stateRefs.conditionalActionData.conditionElement) {
        const isValid = validateBySelector(stateRefs.conditionalActionData.conditionElement, elementData);
        if (isValid) {
          stateRefs.conditionalActionData.childElement = elementData;
          stateRefs.conditionalActionStep = 5;
          updateConditionalActionStep(5, stateRefs, dependencies);
        } else {
          alert('선택한 요소가 부모 요소의 자식이 아닙니다.');
        }
      }
    } else if (type === 'sibling') {
      // 형제 관계 검증
      if (stateRefs.conditionalActionData.conditionElement) {
        const isValid = validateSiblingRelation(stateRefs.conditionalActionData.conditionElement, elementData);
        if (isValid) {
          stateRefs.conditionalActionData.siblingElement = elementData;
          stateRefs.conditionalActionStep = 5;
          updateConditionalActionStep(5, stateRefs, dependencies);
        } else {
          alert('선택한 요소가 기준 요소의 형제가 아닙니다.');
        }
      }
    } else if (type === 'ancestor') {
      // 조상 관계 검증
      if (stateRefs.conditionalActionData.conditionElement) {
        const isValid = validateAncestorRelation(stateRefs.conditionalActionData.conditionElement, elementData);
        if (isValid) {
          stateRefs.conditionalActionData.ancestorElement = elementData;
          stateRefs.conditionalActionStep = 5;
          updateConditionalActionStep(5, stateRefs, dependencies);
        } else {
          alert('선택한 요소가 기준 요소의 조상이 아닙니다.');
        }
      }
    }
  }, null, stateRefs.conditionalActionData.stepIndex);
}

/**
 * 조건부 액션 완료 및 추가
 * @param {Object} stateRefs - 상태 참조 객체
 * @param {Object} dependencies - 의존성 객체
 */
export function completeConditionalAction(stateRefs, dependencies) {
  const {
    addConditionalActionAfterStep
  } = dependencies;

  // addConditionalActionAfterStep 함수 호출
  addConditionalActionAfterStep(stateRefs.conditionalActionData.stepIndex, {
    actionType: stateRefs.conditionalActionData.actionType,
    conditionElement: stateRefs.conditionalActionData.conditionElement,
    childElement: stateRefs.conditionalActionData.childElement,
    siblingElement: stateRefs.conditionalActionData.siblingElement,
    ancestorElement: stateRefs.conditionalActionData.ancestorElement,
    conditionType: stateRefs.conditionalActionData.conditionType,
    conditionValue: stateRefs.conditionalActionData.conditionValue,
    targetRelation: stateRefs.conditionalActionData.targetRelation,
    targetSelector: stateRefs.conditionalActionData.targetSelector,
    loopMode: stateRefs.conditionalActionData.loopMode,
    loopSelector: stateRefs.conditionalActionData.loopSelector,
    actionTypeValue: stateRefs.conditionalActionData.actionTypeValue,
    actionValue: stateRefs.conditionalActionData.actionValue
  });
  
  // 메뉴 닫기
  const menu = document.getElementById('global-conditional-action-menu');
  if (menu) {
    menu.classList.add('hidden');
  }
  
  // 상태 초기화
  stateRefs.conditionalActionStep = 0;
  stateRefs.conditionalActionData = {
    actionType: null,
    conditionElement: null,
    childElement: null,
    siblingElement: null,
    ancestorElement: null,
    conditionType: null,
    conditionValue: null,
    targetRelation: null,
    targetSelector: null,
    loopMode: null,
    loopSelector: null,
    actionTypeValue: null,
    actionValue: null,
    stepIndex: -1
  };
}

/**
 * 조건부 액션 추가 취소
 * @param {Object} stateRefs - 상태 참조 객체
 * @param {Object} dependencies - 의존성 객체
 */
export function cancelConditionalAction(stateRefs, dependencies) {
  // 메뉴 닫기
  const menu = document.getElementById('global-conditional-action-menu');
  if (menu) {
    menu.classList.add('hidden');
  }
  
  // 상태 초기화
  stateRefs.conditionalActionStep = 0;
  stateRefs.conditionalActionData = {
    actionType: null,
    conditionElement: null,
    childElement: null,
    siblingElement: null,
    ancestorElement: null,
    conditionType: null,
    conditionValue: null,
    targetRelation: null,
    targetSelector: null,
    loopMode: null,
    loopSelector: null,
    actionTypeValue: null,
    actionValue: null,
    stepIndex: -1
  };
}

