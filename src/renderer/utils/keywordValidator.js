/**
 * 키워드 검증 유틸리티
 * 키워드 스텝의 유효성을 검증
 */

import { getKeyword, KEYWORDS } from './keywordLibrary.js';

/**
 * 키워드 스텝 검증 결과
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - 유효성 여부
 * @property {Array<string>} errors - 에러 메시지 배열
 * @property {Array<string>} warnings - 경고 메시지 배열
 */

/**
 * 키워드 스텝 검증
 * @param {Object} step - 키워드 스텝 객체
 * @param {number} index - 스텝 인덱스 (0부터 시작)
 * @returns {ValidationResult} 검증 결과
 */
export function validateStep(step, index = 0) {
  const errors = [];
  const warnings = [];

  // 필수 필드 확인
  if (!step.action) {
    errors.push(`스텝 ${index + 1}: action이 필요합니다.`);
    return { valid: false, errors, warnings };
  }

  // 키워드 존재 확인
  const keyword = getKeyword(step.action);
  if (!keyword) {
    errors.push(`스텝 ${index + 1}: 알 수 없는 키워드 '${step.action}'입니다.`);
    return { valid: false, errors, warnings };
  }

  // 필수 파라미터 확인
  for (const param of keyword.parameters) {
    if (param === 'target' && !step.target) {
      errors.push(`스텝 ${index + 1}: '${step.action}' 키워드는 'target' 파라미터가 필요합니다.`);
    } else if (param === 'value' && !step.value) {
      // value는 일부 키워드에서 선택사항일 수 있음
      const optionalValueKeywords = ['clear', 'verifyElementPresent', 'verifyElementNotPresent'];
      if (!optionalValueKeywords.includes(step.action)) {
        warnings.push(`스텝 ${index + 1}: '${step.action}' 키워드에 'value' 파라미터가 없습니다.`);
      }
    } else if (param === 'url' && !step.target && !step.value) {
      errors.push(`스텝 ${index + 1}: '${step.action}' 키워드는 URL이 필요합니다.`);
    }
  }

  // 타겟 형식 검증 (선택사항)
  if (step.target) {
    const targetValidation = validateTarget(step.target);
    if (!targetValidation.valid) {
      warnings.push(`스텝 ${index + 1}: 타겟 형식이 표준이 아닐 수 있습니다: ${targetValidation.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 여러 스텝 검증
 * @param {Array<Object>} steps - 키워드 스텝 배열
 * @returns {ValidationResult} 검증 결과
 */
export function validateSteps(steps) {
  if (!Array.isArray(steps)) {
    return {
      valid: false,
      errors: ['steps는 배열이어야 합니다.'],
      warnings: []
    };
  }

  if (steps.length === 0) {
    return {
      valid: false,
      errors: ['최소 하나의 스텝이 필요합니다.'],
      warnings: []
    };
  }

  const allErrors = [];
  const allWarnings = [];
  let allValid = true;

  steps.forEach((step, index) => {
    const result = validateStep(step, index);
    if (!result.valid) {
      allValid = false;
    }
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  });

  return {
    valid: allValid,
    errors: allErrors,
    warnings: allWarnings
  };
}

/**
 * 타겟 선택자 검증
 * @param {string} target - 타겟 선택자
 * @returns {Object} 검증 결과
 */
export function validateTarget(target) {
  if (!target || typeof target !== 'string') {
    return {
      valid: false,
      message: '타겟은 문자열이어야 합니다.'
    };
  }

  // 일반적인 선택자 패턴 확인
  const patterns = {
    id: /^#[\w-]+$/,
    class: /^\.[\w-]+$/,
    css: /^[\w\s#.\[\]:-]+$/,
    xpath: /^\/\//,
    linkText: /^link=/,
    partialLinkText: /^partialLink=/,
    name: /^name=/,
    tag: /^tag=/
  };

  // 패턴 매칭
  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(target.trim())) {
      return {
        valid: true,
        message: `${type} 선택자로 인식됨`,
        type
      };
    }
  }

  // URL인 경우
  if (target.startsWith('http://') || target.startsWith('https://')) {
    return {
      valid: true,
      message: 'URL로 인식됨',
      type: 'url'
    };
  }

  // 알 수 없는 형식이지만 경고만
  return {
    valid: true,
    message: '표준 선택자 형식이 아닐 수 있습니다',
    type: 'unknown'
  };
}

/**
 * 키워드 스텝 정규화
 * @param {Object} step - 키워드 스텝 객체
 * @returns {Object} 정규화된 스텝 객체
 */
export function normalizeStep(step) {
  const normalized = {
    action: step.action ? step.action.trim() : '',
    target: step.target ? step.target.trim() : '',
    value: step.value ? String(step.value).trim() : '',
    description: step.description ? step.description.trim() : ''
  };

  // action을 소문자로 변환 (일부 키워드는 대소문자 구분)
  const caseSensitiveKeywords = ['setText', 'doubleClick', 'rightClick', 'verifyText'];
  if (!caseSensitiveKeywords.includes(normalized.action)) {
    normalized.action = normalized.action.toLowerCase();
  }

  return normalized;
}

/**
 * 키워드 스텝 배열 정규화
 * @param {Array<Object>} steps - 키워드 스텝 배열
 * @returns {Array<Object>} 정규화된 스텝 배열
 */
export function normalizeSteps(steps) {
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps
    .map(step => normalizeStep(step))
    .filter(step => step.action); // action이 있는 것만 유지
}

/**
 * 키워드 스텝 검증 및 정규화
 * @param {Array<Object>} steps - 키워드 스텝 배열
 * @returns {Object} 검증 결과 및 정규화된 스텝
 */
export function validateAndNormalizeSteps(steps) {
  const normalized = normalizeSteps(steps);
  const validation = validateSteps(normalized);

  return {
    ...validation,
    normalizedSteps: normalized
  };
}

