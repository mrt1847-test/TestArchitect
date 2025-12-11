/**
 * 셀렉터 UI 관리 모듈
 * 셀렉터 표시, 그룹화, 적용 기능을 담당
 */

import { inferSelectorType } from '../utils/selectorUtils.js';
import { getAiState, appendAiMessage, renderAiRequestControls } from './recorder-ai.js';

// 셀렉터 탭 상태 관리
export const selectorTabState = {
  active: 'unique', // 'unique' | 'repeat'
  grouped: null,
  contentEl: null,
  buttons: null,
  event: null,
  resolvedIndex: -1
};

/**
 * 타겟 위치 정보 가져오기
 */
function getTargetPositionInfo(event) {
  if (!event || typeof event !== 'object') return null;
  const target = event.target || null;
  const extractFromPosition = (pos, source) => {
    if (!pos || typeof pos !== 'object') return null;
    const nth = typeof pos.nthOfType === 'number' ? pos.nthOfType : null;
    if (!nth || nth < 1) return null;
    const total = typeof pos.total === 'number' ? pos.total : null;
    return {
      nthOfType: nth,
      total,
      index: typeof pos.index === 'number' ? pos.index : null,
      tag: source && source.tag ? String(source.tag).toLowerCase() : (target && target.tag ? String(target.tag).toLowerCase() : null),
      repeats: source && typeof source.repeats === 'boolean'
        ? source.repeats
        : (typeof total === 'number' ? total > 1 : false)
    };
  };

  const direct = target && target.position ? extractFromPosition(target.position, target) : null;
  if (direct) return direct;

  const targetDomContext = target && target.domContext && target.domContext.self ? target.domContext.self : null;
  const contextSelf = event.domContext && event.domContext.self ? event.domContext.self : null;
  const fallbackSelf = targetDomContext || contextSelf || null;
  if (fallbackSelf && fallbackSelf.position) {
    return extractFromPosition(fallbackSelf.position, fallbackSelf);
  }

  return null;
}

/**
 * 셀렉터가 안정적인지 확인
 */
function selectorLikelyStable(selector) {
  if (!selector || typeof selector !== 'string') return false;
  // id, data-* 속성, aria-* 속성 등이 포함되면 충분히 안정적인 것으로 판단
  if (/#/.test(selector)) return true;
  if (/\[data-[^\]=]+=['"][^'"]+['"]/.test(selector)) return true;
  if (/\[aria-[^\]=]+=['"][^'"]+['"]/.test(selector)) return true;
  if (/\[id=['"][^'"]+['"]/.test(selector)) return true;
  return false;
}

/**
 * 셀렉터에 nth-of-type 추가
 */
function appendNthToSelector(selector, nth) {
  if (!selector || typeof selector !== 'string') return null;
  const trimmed = selector.trim();
  if (!trimmed || /:nth-(child|of-type)\(/i.test(trimmed)) return null;
  const match = trimmed.match(/([^\s>+~]+)$/);
  if (!match) return null;
  const lastPart = match[1];
  const pseudoIndex = lastPart.indexOf(':');
  const basePart = pseudoIndex >= 0 ? lastPart.slice(0, pseudoIndex) : lastPart;
  const pseudoPart = pseudoIndex >= 0 ? lastPart.slice(pseudoIndex) : '';
  const newLastPart = `${basePart}:nth-of-type(${nth})${pseudoPart}`;
  const prefix = match.index ? trimmed.slice(0, match.index) : '';
  return `${prefix}${newLastPart}`;
}

/**
 * 필요시 nth 셀렉터 적용
 */
function enforceNthSelectorIfNeeded(candidate, event) {
  if (!candidate || !event) return candidate;
  const type = candidate.type || inferSelectorType(candidate.selector);
  if (!type || type === 'xpath' || type === 'xpath-full') {
    return candidate;
  }
  const positionInfo = getTargetPositionInfo(event);
  if (!positionInfo) return candidate;
  const nth = positionInfo.nthOfType;
  const total = positionInfo.total;
  const matchCount = typeof candidate.matchCount === 'number' ? candidate.matchCount : null;
  const repeated = positionInfo.repeats === true || (typeof positionInfo.total === 'number' && positionInfo.total > 1);
  const needsNth =
    (matchCount !== null && matchCount > 1) ||
    candidate.unique === false ||
    (!selectorLikelyStable(candidate.selector) && repeated);
  if (!needsNth) return candidate;
  const reasonParts = (candidate.reason ? candidate.reason.split(' • ') : []).filter(Boolean);
  const nthLabel = `nth-of-type(${nth}) 적용`;

  if (type === 'text') {
    const filtered = reasonParts.filter((part) => !/개 요소와 일치|유일 일치/.test(part));
    if (!reasonParts.includes(nthLabel)) {
      filtered.push(nthLabel);
    }
    return {
      ...candidate,
      reason: filtered.join(' • '),
      unique: true,
      matchCount: 1,
      __nthApplied: nth,
      __nthTotal: total,
      __nthTag: positionInfo.tag || null
    };
  }

  const appended = appendNthToSelector(candidate.selector, nth);
  if (!appended) return candidate;
  if (!reasonParts.includes(nthLabel)) {
    reasonParts.push(nthLabel);
  }
  const filtered = reasonParts.filter((part) => !/개 요소와 일치|유일 일치/.test(part));
  if (!filtered.includes(nthLabel)) {
    filtered.push(nthLabel);
  }
  return {
    ...candidate,
    selector: appended,
    reason: filtered.join(' • '),
    unique: true,
    matchCount: 1,
    __nthApplied: nth,
    __nthTotal: total,
    __nthTag: positionInfo.tag || null
  };
}

/**
 * 셀렉터 탭 그룹 생성
 */
export function buildSelectorTabGroups(event, baseCandidates, aiCandidates) {
  const safeBase = Array.isArray(baseCandidates) ? baseCandidates : [];
  const safeAi = Array.isArray(aiCandidates) ? aiCandidates : [];
  const uniqueBaseList = [];
  const uniqueAiList = [];
  const repeatBaseList = [];
  const repeatAiList = [];

  const createGroup = (listRef) => ({
    listRef,
    indices: []
  });

  const groups = {
    unique: {
      base: createGroup(uniqueBaseList),
      ai: createGroup(uniqueAiList)
    },
    repeat: {
      base: createGroup(repeatBaseList),
      ai: createGroup(repeatAiList)
    }
  };

  const addIndex = (group, source, index) => {
    const arr = group[source].indices;
    if (!arr.includes(index)) {
      arr.push(index);
    }
  };

  const registerUnique = (source, candidate, originalIndex, options = {}) => {
    if (!candidate || !candidate.selector) return;
    const targetList = source === 'ai' ? uniqueAiList : uniqueBaseList;
    const stored = { ...candidate, __sourceIndex: originalIndex };
    if (options.derived === true) {
      stored.__derived = true;
    }
    const newIndex = targetList.push(stored) - 1;
    addIndex(groups.unique, source, newIndex);
  };

  const registerRepeat = (source, candidate, originalIndex) => {
    if (!candidate || !candidate.selector) return;
    const targetList = source === 'ai' ? repeatAiList : repeatBaseList;
    const stored = { ...candidate, __sourceIndex: originalIndex, __isRaw: true };
    const newIndex = targetList.push(stored) - 1;
    addIndex(groups.repeat, source, newIndex);
  };

  const assign = (listRef, source) => {
    if (!Array.isArray(listRef)) return;
    listRef.forEach((candidate, index) => {
      if (!candidate || !candidate.selector) return;
      
      // 원본 셀렉터 정보 확인 (rawSelector가 있으면 원본, 없으면 현재 셀렉터가 원본)
      const rawSelector = candidate.rawSelector || candidate.selector;
      const rawType = candidate.rawType || candidate.type || inferSelectorType(candidate.selector);
      const rawMatchCount = typeof candidate.rawMatchCount === 'number' 
        ? candidate.rawMatchCount 
        : (typeof candidate.matchCount === 'number' ? candidate.matchCount : null);
      const rawUnique = candidate.rawUnique !== undefined ? candidate.rawUnique : (rawMatchCount === 1);
      
      // 가공 여부 확인 (셀렉터가 변경되었거나, 부모 노드 기반으로 생성되었거나, 인덱싱이 적용된 경우)
      const isProcessed = candidate.selector !== rawSelector || 
                          candidate.__derived === true || 
                          candidate.__autoDerived !== undefined ||
                          (candidate.reason && (candidate.reason.includes('부모') || candidate.reason.includes('상위') || candidate.reason.includes('경로') || candidate.reason.includes('조합')));
      
      // 가공된 셀렉터의 유일성 확인
      const finalMatchCount = typeof candidate.matchCount === 'number' ? candidate.matchCount : null;
      const isAlreadyUnique = candidate.unique === true || finalMatchCount === 1;

      // 1. 원본 셀렉터가 유일한 경우: 유일요소 탭에 포함
      if (rawUnique || (rawMatchCount !== null && rawMatchCount === 1)) {
        registerUnique(source, candidate, index);
        // 가공된 셀렉터가 유일한 경우도 처리
        const derivedCandidate = enforceNthSelectorIfNeeded({ ...candidate }, event);
        if (derivedCandidate && derivedCandidate.unique === true && derivedCandidate.selector !== candidate.selector) {
          registerUnique(source, derivedCandidate, index, { derived: true });
        }
        return; // 원본이 유일하면 반복요소 탭에 포함하지 않음
      }

      // 2. 가공된 셀렉터가 유일한 경우: 유일요소 탭에 포함
      if (isAlreadyUnique && isProcessed) {
        registerUnique(source, candidate, index);
        // 조합 XPath가 유일하더라도 원본 셀렉터가 반복되면 반복요소 탭에도 추가
        if (!rawUnique && rawMatchCount !== null && rawMatchCount > 1) {
          const rawCandidate = {
            selector: rawSelector,
            type: rawType,
            matchCount: rawMatchCount,
            unique: false,
            score: candidate.score,
            reason: candidate.rawReason || candidate.reason,
            __isRaw: true,
            __originalIndex: index
          };
          registerRepeat(source, rawCandidate, index);
        }
        return; // 가공된 셀렉터가 유일하면 여기서 종료
      }

      // 3. 반복요소 탭: 원본 셀렉터가 중복되는 경우에만 포함
      // 원본 셀렉터가 DOM 전체에서 중복되는 경우 (text, class, id 등)
      // 조건: 원본 셀렉터가 반복되고(rawMatchCount > 1)
      // 가공되지 않은 원본 셀렉터만 반복요소 탭에 포함 (가공된 셀렉터는 위에서 이미 처리됨)
      if (!rawUnique && rawMatchCount !== null && rawMatchCount > 1 && !isProcessed) {
        // 원본 셀렉터 정보로 반복 구조 그룹에 추가
        const rawCandidate = {
          selector: rawSelector,
          type: rawType,
          matchCount: rawMatchCount,
          unique: false,
          score: candidate.score,
          reason: candidate.rawReason || candidate.reason,
          __isRaw: true, // 원본 셀렉터임을 표시
          __originalIndex: index
        };
        registerRepeat(source, rawCandidate, index);
        
        // 반복요소에서 nth-of-type을 적용하여 유일하게 만든 경우 유일요소 탭에도 추가
        const derivedCandidate = enforceNthSelectorIfNeeded({ ...candidate }, event);
        if (derivedCandidate && derivedCandidate.unique === true && derivedCandidate.selector !== candidate.selector) {
          registerUnique(source, derivedCandidate, index, { derived: true });
          const auto = {
            ...derivedCandidate,
            rawSelector: candidate.selector,
            rawType: candidate.type || inferSelectorType(candidate.selector),
            rawMatchCount: candidate.matchCount,
            rawReason: candidate.reason,
            __sourceIndex: index,
            __derived: true
          };
          listRef[index] = { ...candidate, __autoDerived: auto };
        }
      }
    });
  };

  assign(safeBase, 'base');
  assign(safeAi, 'ai');

  return groups;
}

/**
 * 그룹 카운트 가져오기
 */
export function getGroupCount(group) {
  if (!group) return 0;
  const baseCount = Array.isArray(group.base?.indices) ? group.base.indices.length : 0;
  const aiCount = Array.isArray(group.ai?.indices) ? group.ai.indices.length : 0;
  return baseCount + aiCount;
}

/**
 * 셀렉터 표시
 */
export function showSelectors(
  list,
  event,
  eventIndex,
  selectorList,
  allEvents,
  selectedFramework,
  selectedLanguage,
  requestAiSelectorsForEventFn,
  updateSelectorTabUIFn,
  applySelectorFn,
  highlightSelectorFn
) {
  if (!selectorList) return;
  selectorList.innerHTML = '';

  const hasEventContext = !!event;
  const resolvedIndex = hasEventContext
    ? (eventIndex !== undefined && eventIndex !== null ? eventIndex : allEvents.indexOf(event))
    : -1;

  // AI 요청 컨트롤 렌더링
  renderAiRequestControls(event, resolvedIndex, selectorList, (ev, idx) => {
    if (requestAiSelectorsForEventFn) {
      requestAiSelectorsForEventFn(ev, idx);
    }
  });

  if (!hasEventContext) {
    selectorTabState.grouped = null;
    selectorTabState.contentEl = null;
    selectorTabState.buttons = null;
    const baseCandidates = Array.isArray(list) ? list : [];
    if (!Array.isArray(baseCandidates) || baseCandidates.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'selector-empty';
      emptyMessage.textContent = '셀렉터 후보가 없습니다.';
      selectorList.appendChild(emptyMessage);
      return;
    }
    renderSelectorGroup(baseCandidates, {
      source: 'base',
      event: null,
      resolvedIndex,
      listRef: baseCandidates,
      container: selectorList,
      applySelectorFn,
      highlightSelectorFn
    });
    return;
  }

  // AI 상태 확인
  const aiState = getAiState(event);
  const aiCandidates = Array.isArray(event.aiSelectorCandidates) ? event.aiSelectorCandidates : [];
  
  if (aiState.status === 'loading') {
    appendAiMessage(selectorList, 'AI가 추천 셀렉터를 분석하는 중입니다...', 'loading');
  } else if (aiState.status === 'error') {
    appendAiMessage(selectorList, aiState.error || 'AI 추천을 불러오지 못했습니다.', 'error');
  }

  const baseCandidates = Array.isArray(event.selectorCandidates) ? event.selectorCandidates : [];
  const grouped = buildSelectorTabGroups(event, baseCandidates, aiCandidates);
  selectorTabState.grouped = grouped;
  selectorTabState.event = event;
  selectorTabState.resolvedIndex = resolvedIndex;

  const uniqueCount = getGroupCount(grouped.unique);
  const repeatCount = getGroupCount(grouped.repeat);

  let desiredActive = selectorTabState.active;
  if (desiredActive !== 'unique' && desiredActive !== 'repeat') {
    desiredActive = 'unique';
  }
  if (desiredActive === 'unique' && uniqueCount === 0 && repeatCount > 0) {
    desiredActive = 'repeat';
  } else if (desiredActive === 'repeat' && repeatCount === 0 && uniqueCount > 0) {
    desiredActive = 'unique';
  }
  selectorTabState.active = desiredActive;

  const tabsHeader = document.createElement('div');
  tabsHeader.className = 'selector-tab-header';

  const uniqueBtn = document.createElement('button');
  uniqueBtn.type = 'button';
  uniqueBtn.className = 'selector-tab-button';
  tabsHeader.appendChild(uniqueBtn);

  const repeatBtn = document.createElement('button');
  repeatBtn.type = 'button';
  repeatBtn.className = 'selector-tab-button';
  tabsHeader.appendChild(repeatBtn);

  selectorList.appendChild(tabsHeader);

  const tabContent = document.createElement('div');
  tabContent.className = 'selector-tab-content';
  selectorList.appendChild(tabContent);

  selectorTabState.contentEl = tabContent;
  selectorTabState.buttons = { unique: uniqueBtn, repeat: repeatBtn };

  uniqueBtn.addEventListener('click', () => {
    if (getGroupCount(selectorTabState.grouped?.unique) === 0) return;
    if (selectorTabState.active !== 'unique') {
      selectorTabState.active = 'unique';
      if (updateSelectorTabUIFn) {
        updateSelectorTabUIFn();
      }
    }
  });

  repeatBtn.addEventListener('click', () => {
    if (getGroupCount(selectorTabState.grouped?.repeat) === 0) return;
    if (selectorTabState.active !== 'repeat') {
      selectorTabState.active = 'repeat';
      if (updateSelectorTabUIFn) {
        updateSelectorTabUIFn();
      }
    }
  });

  if (updateSelectorTabUIFn) {
    updateSelectorTabUIFn();
  }

  if (uniqueCount === 0 && repeatCount === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'selector-empty';
    emptyMessage.textContent = '셀렉터 후보가 없습니다.';
    tabContent.appendChild(emptyMessage);
  }
}

/**
 * 셀렉터 아이템 렌더링
 */
export function renderSelectorItems(candidates, container) {
  if (!container) return;
  
  candidates.slice(0, 10).forEach((candidate, index) => {
    const item = document.createElement('div');
    item.className = 'selector-item';
    if (index === 0) {
      item.classList.add('primary');
    }
    
    const main = document.createElement('div');
    main.className = 'selector-main';
    
    const type = document.createElement('span');
    type.className = 'type';
    type.textContent = candidate.type || 'css';
    
    const sel = document.createElement('span');
    sel.className = 'sel';
    sel.textContent = candidate.selector || '';
    
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = candidate.score || 0;
    
    main.appendChild(type);
    main.appendChild(sel);
    main.appendChild(score);
    item.appendChild(main);
    
    if (candidate.reason) {
      const reason = document.createElement('div');
      reason.className = 'reason';
      reason.textContent = candidate.reason;
      item.appendChild(reason);
    }
    
    container.appendChild(item);
  });
}

/**
 * 셀렉터 그룹 렌더링
 */
export function renderSelectorGroup(candidates, options = {}) {
  const {
    source = 'base',
    event = null,
    resolvedIndex = -1,
    listRef = Array.isArray(candidates) ? candidates : [],
    container = null,
    allowNonUnique = false,
    mode = 'default',
    applySelectorFn = null,
    highlightSelectorFn = null
  } = options;

  if (!container) return;

  // indices가 제공되면 해당 인덱스만 사용, 없으면 전체 리스트 사용
  const providedIndices = Array.isArray(options.indices) && options.indices.length > 0
    ? options.indices
    : null;
  
  const iterateIndices = providedIndices !== null
    ? providedIndices
    : (Array.isArray(listRef)
        ? listRef.map((_, idx) => idx)
        : Array.isArray(candidates)
          ? candidates.map((_, idx) => idx)
          : []);

  if (!Array.isArray(iterateIndices) || iterateIndices.length === 0) return;

  iterateIndices.forEach((listIndex) => {
    const candidateRef = Array.isArray(listRef) && listRef[listIndex]
      ? listRef[listIndex]
      : (Array.isArray(candidates) ? candidates[listIndex] : null);
    if (!candidateRef || !candidateRef.selector) return;
    
    const effectiveCandidate = candidateRef;
    const selectorType = effectiveCandidate.type || inferSelectorType(effectiveCandidate.selector);
    
    // 반복요소 탭에서는 원본 셀렉터의 matchCount 사용
    // 유일요소 탭에서는 가공된 셀렉터의 matchCount 사용
    const matchCount = allowNonUnique && effectiveCandidate.__isRaw
      ? (typeof effectiveCandidate.matchCount === 'number' ? effectiveCandidate.matchCount : null)
      : (typeof effectiveCandidate.matchCount === 'number' ? effectiveCandidate.matchCount : null);
    
    const isTextSelector = selectorType === 'text';
    
    // 유일요소 탭: 유일하지 않은 셀렉터 제외 (text는 예외)
    if (!allowNonUnique && !isTextSelector) {
      if (matchCount !== null && matchCount !== 1) {
        return;
      }
      if (effectiveCandidate.unique === false) {
        return;
      }
    }
    
    // 반복요소 탭: 원본 셀렉터가 중복되는 것만 표시
    if (allowNonUnique) {
      // 원본 셀렉터가 유일한 경우 제외
      if (effectiveCandidate.__isRaw && effectiveCandidate.unique === true) {
        return;
      }
      // matchCount가 1이거나 null인 경우 제외 (중복 정보가 없음)
      // 반복요소 탭은 원본 셀렉터가 2개 이상 일치하는 경우만 표시
      if (matchCount === null || matchCount === 1) {
        return; // 중복 정보가 없으면 반복요소 탭에 표시하지 않음
      }
      // matchCount가 2 이상인 경우만 반복요소 탭에 표시
      if (matchCount < 2) {
        return;
      }
    }
    
    const item = document.createElement('div');
    item.className = 'selector-item';
    
    const isApplied =
      !!event &&
      event.primarySelector === effectiveCandidate.selector &&
      (event.primarySelectorType ? event.primarySelectorType === selectorType : true);
    
    const scoreLabel = typeof effectiveCandidate.score === 'number'
      ? `${effectiveCandidate.score}%`
      : '';
    const typeLabel = (selectorType || 'css').toUpperCase();
    
    // 반복요소 탭에서는 matchCount를 명확히 표시
    let matchCountLabel = '';
    if (allowNonUnique && matchCount !== null && matchCount !== 1) {
      matchCountLabel = `<span class="match-count" style="color: #ff6b6b; font-weight: bold;">(${matchCount}개 일치)</span>`;
    }
    
    // 유일요소 탭에서 가공된 셀렉터 표시
    let derivedLabel = '';
    if (!allowNonUnique && (effectiveCandidate.__derived === true || effectiveCandidate.__autoDerived)) {
      derivedLabel = `<span class="derived-badge" style="background: #4CAF50; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-left: 4px;">가공됨</span>`;
    }
    
    item.innerHTML = `
      <div class="selector-main">
        <span class="type">${typeLabel}</span>
        <span class="sel">${effectiveCandidate.selector}</span>
        ${matchCountLabel}
        ${derivedLabel}
        <span class="score">${scoreLabel}</span>
      </div>
      <div class="selector-actions">
        <button class="apply-btn" ${isApplied ? 'style="background: #4CAF50; color: white;"' : ''}>${isApplied ? '✓ 적용됨' : 'Apply'}</button>
        <button class="highlight-btn">Highlight</button>
      </div>
      <div class="reason">${effectiveCandidate.reason || ''}</div>`;

    const applyBtn = item.querySelector('.apply-btn');
    const highlightBtn = item.querySelector('.highlight-btn');
    
    if (applyBtn && applySelectorFn) {
      applyBtn.addEventListener('click', () => {
        applySelectorFn({ ...effectiveCandidate }, resolvedIndex, source, listIndex);
      });
    }
    
    if (highlightBtn && highlightSelectorFn) {
      highlightBtn.addEventListener('click', () => {
        highlightSelectorFn(effectiveCandidate);
      });
    }

    container.appendChild(item);
  });
}

/**
 * 셀렉터 탭 UI 업데이트
 */
export function updateSelectorTabUI(
  selectorTabStateRef,
  allEvents,
  currentEventIndex,
  showSelectorsFn,
  applySelectorFn,
  highlightSelectorFn
) {
  const {
    grouped,
    active,
    contentEl,
    buttons,
    event,
    resolvedIndex
  } = selectorTabStateRef;
  
  if (!grouped || !contentEl) return;

  const uniqueCount = getGroupCount(grouped.unique);
  const repeatCount = getGroupCount(grouped.repeat);

  if (buttons && buttons.unique) {
    buttons.unique.textContent = `유일 후보 (${uniqueCount})`;
    buttons.unique.classList.toggle('active', active === 'unique');
    buttons.unique.disabled = uniqueCount === 0;
  }
  
  if (buttons && buttons.repeat) {
    buttons.repeat.textContent = `반복 구조 후보 (${repeatCount})`;
    buttons.repeat.classList.toggle('active', active === 'repeat');
    buttons.repeat.disabled = repeatCount === 0;
  }

  contentEl.innerHTML = '';
  const currentGroup = grouped[active];
  
  if (!currentGroup) {
    const empty = document.createElement('div');
    empty.className = 'selector-empty';
    empty.textContent = '셀렉터 후보가 없습니다.';
    contentEl.appendChild(empty);
    return;
  }

  const allowNonUnique = active === 'repeat';
  const mode = allowNonUnique ? 'repeat' : 'default';

  if (active === 'repeat') {
    const info = document.createElement('div');
    info.className = 'selector-repeat-info';
    info.style.cssText = 'padding: 8px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; margin-bottom: 12px; color: #856404; font-size: 13px;';
    info.textContent = '반복 구조 후보: DOM 전체에서 중복되는 원본 셀렉터입니다. 선택 시 위치 기반 :nth-of-type()이 자동 적용되어 유일요소 탭으로 이동합니다.';
    contentEl.appendChild(info);
  } else if (active === 'unique') {
    const info = document.createElement('div');
    info.className = 'selector-unique-info';
    info.style.cssText = 'padding: 8px; background: #d4edda; border: 1px solid #28a745; border-radius: 4px; margin-bottom: 12px; color: #155724; font-size: 13px;';
    info.textContent = '유일 후보: 조합하거나 부모 노드를 통해 유일성을 확보한 가공된 셀렉터입니다.';
    contentEl.appendChild(info);
  }

  // Base 셀렉터 렌더링
  if (currentGroup.base && Array.isArray(currentGroup.base.indices) && currentGroup.base.indices.length > 0) {
    renderSelectorGroup(currentGroup.base.listRef, {
      source: 'base',
      event,
      resolvedIndex,
      listRef: currentGroup.base.listRef,
      container: contentEl,
      allowNonUnique,
      mode,
      indices: currentGroup.base.indices,
      applySelectorFn,
      highlightSelectorFn
    });
  }

  // AI 셀렉터 렌더링
  if (currentGroup.ai && Array.isArray(currentGroup.ai.indices) && currentGroup.ai.indices.length > 0) {
    renderSelectorGroup(currentGroup.ai.listRef, {
      source: 'ai',
      event,
      resolvedIndex,
      listRef: currentGroup.ai.listRef,
      container: contentEl,
      allowNonUnique,
      mode,
      indices: currentGroup.ai.indices,
      applySelectorFn,
      highlightSelectorFn
    });
  }
}

/**
 * 셀렉터 적용
 */
export function applySelector(
  s,
  eventIndex,
  source,
  listIndex,
  getAllEventsFn, // allEvents 대신 getAllEvents 함수 전달
  currentEventIndex,
  inferSelectorTypeFn,
  showSelectorsFn,
  updateTimelineFn,
  updateCodeFn,
  logMessageFn,
  syncAllEventsToTCFn
) {
  const targetIndex = eventIndex !== undefined && eventIndex !== null ? eventIndex : currentEventIndex;
  if (targetIndex < 0) {
    alert('먼저 타임라인에서 이벤트를 선택하세요.');
    return;
  }
  
  // getAllEventsFn를 통해 최신 allEvents 참조
  const currentEvents = getAllEventsFn ? getAllEventsFn() : [];
  if (targetIndex >= 0 && targetIndex < currentEvents.length) {
    const targetEvent = currentEvents[targetIndex];
    const candidateToApply = { ...s };
    const selectorType = candidateToApply.type || (inferSelectorTypeFn ? inferSelectorTypeFn(candidateToApply.selector) : 'css');

    // 셀렉터 후보 업데이트
    if (source === 'ai') {
      if (!Array.isArray(targetEvent.aiSelectorCandidates)) {
        targetEvent.aiSelectorCandidates = [];
      }
      // mergeCandidateIntoCollection은 나중에 구현
    } else if (Array.isArray(targetEvent.selectorCandidates)) {
      // mergeCandidateIntoCollection은 나중에 구현
    }

    // Primary 셀렉터 설정
    targetEvent.primarySelector = candidateToApply.selector;
    targetEvent.primarySelectorType = selectorType;
    
    if (selectorType === 'text') {
      targetEvent.primarySelectorMatchMode = candidateToApply.matchMode || 'exact';
      if (candidateToApply.textValue) {
        targetEvent.primarySelectorText = candidateToApply.textValue;
      }
    } else {
      delete targetEvent.primarySelectorMatchMode;
      delete targetEvent.primarySelectorText;
    }
    
    if (selectorType === 'xpath' && candidateToApply.xpathValue) {
      targetEvent.primarySelectorXPath = candidateToApply.xpathValue;
    } else if (selectorType !== 'xpath') {
      delete targetEvent.primarySelectorXPath;
    }

    // 이벤트 업데이트
    currentEvents[targetIndex] = targetEvent;
    
    // UI 업데이트
    if (currentEventIndex === targetIndex) {
      if (showSelectorsFn) {
        showSelectorsFn(null, targetEvent, targetIndex);
      }
    }
    
    if (updateTimelineFn) {
      updateTimelineFn();
    }
    if (updateCodeFn) {
      updateCodeFn({ preloadedEvents: currentEvents });
    }
    
    // TC step 업데이트 (셀렉터 변경 반영)
    if (syncAllEventsToTCFn) {
      syncAllEventsToTCFn({ allEvents: currentEvents }).then((result) => {
        if (result && result.success) {
          console.log('[Recorder] ✅ 셀렉터 변경이 TC step에 반영되었습니다');
          // 부모 윈도우에 TC 새로고침 요청 (iframe 환경)
          if (window.parent !== window) {
            try {
              const tcIdInput = document.getElementById('tc-id-input');
              const tcId = tcIdInput?.value;
              if (tcId) {
                window.parent.postMessage({
                  type: 'tc-step-updated',
                  tcId: parseInt(tcId, 10)
                }, '*');
              }
            } catch (e) {
              console.warn('[Recorder] 부모 윈도우 메시지 전송 실패:', e);
            }
          }
        } else {
          console.warn('[Recorder] ⚠️ 셀렉터 변경 반영 실패:', result?.error);
        }
      }).catch((error) => {
        console.error('[Recorder] ❌ 셀렉터 변경 반영 중 오류:', error);
      });
    }
    
    if (logMessageFn) {
      logMessageFn(`셀렉터 적용: ${candidateToApply.selector}`, 'success');
    }
  }
}

/**
 * 셀렉터 하이라이트
 */
export function highlightSelector(candidate, logMessageFn) {
  // Electron 환경에서는 외부 브라우저의 요소를 직접 하이라이트할 수 없음
  // WebSocket을 통해 Content Script에 메시지 전송 (나중에 구현)
  if (logMessageFn) {
    logMessageFn(`셀렉터 하이라이트: ${candidate.selector}`, 'info');
  }
}
