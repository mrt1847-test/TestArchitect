/**
 * 객체 레퍼지토리 유틸리티
 * 테스트 객체(페이지, 요소) 관리 및 선택자 관리
 */

/**
 * 객체 타입
 */
export const OBJECT_TYPES = {
  PAGE: 'page',
  ELEMENT: 'element'
};

/**
 * 선택자 타입
 */
export const SELECTOR_TYPES = {
  CSS: 'css',
  XPATH: 'xpath',
  ID: 'id',
  CLASS: 'class',
  NAME: 'name',
  TAG: 'tag',
  LINK_TEXT: 'linkText',
  PARTIAL_LINK_TEXT: 'partialLinkText'
};

/**
 * 객체 레퍼지토리 클래스
 */
export class ObjectRepository {
  /**
   * 프로젝트의 모든 객체 가져오기
   * @param {number} projectId - 프로젝트 ID
   * @returns {Promise<Array>} 객체 배열
   */
  static async getObjects(projectId) {
    try {
      if (!window.electronAPI?.api?.getObjects) {
        console.warn('getObjects API가 없습니다.');
        return [];
      }

      const response = await window.electronAPI.api.getObjects(projectId);
      if (response && response.success) {
        return response.data || [];
      }
      return [];
    } catch (error) {
      console.error('객체 가져오기 실패:', error);
      return [];
    }
  }

  /**
   * 객체 트리 구조로 가져오기
   * @param {number} projectId - 프로젝트 ID
   * @returns {Promise<Array>} 트리 구조 객체 배열
   */
  static async getObjectTree(projectId) {
    try {
      const objects = await this.getObjects(projectId);
      return this.buildTree(objects);
    } catch (error) {
      console.error('객체 트리 가져오기 실패:', error);
      return [];
    }
  }

  /**
   * 객체 트리 구조 생성
   * @param {Array} objects - 객체 배열
   * @returns {Array} 트리 구조 배열
   */
  static buildTree(objects) {
    if (!Array.isArray(objects)) {
      return [];
    }

    // ID로 매핑
    const objectMap = new Map();
    const rootObjects = [];

    // 모든 객체를 맵에 추가
    objects.forEach(obj => {
      objectMap.set(obj.id, {
        ...obj,
        children: []
      });
    });

    // 트리 구조 생성
    objects.forEach(obj => {
      const node = objectMap.get(obj.id);
      if (obj.parent_id) {
        const parent = objectMap.get(obj.parent_id);
        if (parent) {
          parent.children.push(node);
        } else {
          rootObjects.push(node);
        }
      } else {
        rootObjects.push(node);
      }
    });

    return rootObjects;
  }

  /**
   * 객체 생성
   * @param {Object} objectData - 객체 데이터
   * @returns {Promise<Object>} 생성된 객체
   */
  static async createObject(objectData) {
    try {
      if (!window.electronAPI?.api?.createObject) {
        throw new Error('createObject API가 없습니다.');
      }

      const response = await window.electronAPI.api.createObject(objectData);
      if (response && response.success) {
        return response.data;
      }
      throw new Error(response?.error || '객체 생성 실패');
    } catch (error) {
      console.error('객체 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 객체 업데이트
   * @param {number} objectId - 객체 ID
   * @param {Object} objectData - 업데이트할 객체 데이터
   * @returns {Promise<Object>} 업데이트된 객체
   */
  static async updateObject(objectId, objectData) {
    try {
      if (!window.electronAPI?.api?.updateObject) {
        throw new Error('updateObject API가 없습니다.');
      }

      const response = await window.electronAPI.api.updateObject(objectId, objectData);
      if (response && response.success) {
        return response.data;
      }
      throw new Error(response?.error || '객체 업데이트 실패');
    } catch (error) {
      console.error('객체 업데이트 실패:', error);
      throw error;
    }
  }

  /**
   * 객체 삭제
   * @param {number} objectId - 객체 ID
   * @returns {Promise<boolean>} 삭제 성공 여부
   */
  static async deleteObject(objectId) {
    try {
      if (!window.electronAPI?.api?.deleteObject) {
        throw new Error('deleteObject API가 없습니다.');
      }

      const response = await window.electronAPI.api.deleteObject(objectId);
      return response && response.success;
    } catch (error) {
      console.error('객체 삭제 실패:', error);
      throw error;
    }
  }

  /**
   * 이름으로 객체 찾기
   * @param {number} projectId - 프로젝트 ID
   * @param {string} name - 객체 이름
   * @returns {Promise<Object|null>} 찾은 객체
   */
  static async findObjectByName(projectId, name) {
    try {
      const objects = await this.getObjects(projectId);
      return objects.find(obj => obj.name === name) || null;
    } catch (error) {
      console.error('객체 찾기 실패:', error);
      return null;
    }
  }

  /**
   * 선택자 파싱
   * @param {string} selectorsJson - JSON 형식의 선택자 문자열
   * @returns {Array} 선택자 배열
   */
  static parseSelectors(selectorsJson) {
    try {
      if (typeof selectorsJson === 'string') {
        return JSON.parse(selectorsJson);
      }
      return selectorsJson || [];
    } catch (error) {
      console.error('선택자 파싱 실패:', error);
      return [];
    }
  }

  /**
   * 선택자 문자열화
   * @param {Array} selectors - 선택자 배열
   * @returns {string} JSON 문자열
   */
  static stringifySelectors(selectors) {
    try {
      return JSON.stringify(selectors || []);
    } catch (error) {
      console.error('선택자 문자열화 실패:', error);
      return '[]';
    }
  }

  /**
   * 최적 선택자 가져오기
   * @param {Object} object - 객체
   * @param {string} framework - 프레임워크 (playwright, selenium)
   * @returns {string} 최적 선택자
   */
  static getBestSelector(object, framework = 'playwright') {
    const selectors = this.parseSelectors(object.selectors);
    if (selectors.length === 0) {
      return '';
    }

    // 우선순위에 따라 정렬
    const sorted = [...selectors].sort((a, b) => (a.priority || 0) - (b.priority || 0));

    // 프레임워크별 선호 선택자 타입
    const preferredTypes = {
      playwright: [SELECTOR_TYPES.CSS, SELECTOR_TYPES.XPATH, SELECTOR_TYPES.ID],
      selenium: [SELECTOR_TYPES.ID, SELECTOR_TYPES.CSS, SELECTOR_TYPES.XPATH]
    };

    const preferred = preferredTypes[framework] || preferredTypes.playwright;

    // 선호 타입 중에서 찾기
    for (const type of preferred) {
      const selector = sorted.find(s => s.type === type);
      if (selector) {
        return selector.value;
      }
    }

    // 없으면 첫 번째 선택자
    return sorted[0].value;
  }

  /**
   * 선택자 생성
   * @param {string} type - 선택자 타입
   * @param {string} value - 선택자 값
   * @param {number} priority - 우선순위
   * @returns {Object} 선택자 객체
   */
  static createSelector(type, value, priority = 0) {
    return {
      type,
      value,
      priority
    };
  }

  /**
   * 객체 자동완성 목록 가져오기
   * @param {number} projectId - 프로젝트 ID
   * @param {string} query - 검색어
   * @returns {Promise<Array>} 매칭되는 객체 배열
   */
  static async getObjectSuggestions(projectId, query = '') {
    try {
      const objects = await this.getObjects(projectId);
      if (!query) {
        return objects.filter(obj => obj.type === OBJECT_TYPES.ELEMENT);
      }

      const lowerQuery = query.toLowerCase();
      return objects.filter(obj => 
        obj.type === OBJECT_TYPES.ELEMENT &&
        (obj.name.toLowerCase().includes(lowerQuery) ||
         (obj.description && obj.description.toLowerCase().includes(lowerQuery)))
      );
    } catch (error) {
      console.error('객체 자동완성 실패:', error);
      return [];
    }
  }
}

/**
 * 선택자 유틸리티
 */
export class SelectorUtils {
  /**
   * 선택자 타입 감지
   * @param {string} selector - 선택자 문자열
   * @returns {string} 선택자 타입
   */
  static detectType(selector) {
    if (!selector || typeof selector !== 'string') {
      return SELECTOR_TYPES.CSS;
    }

    const trimmed = selector.trim();

    // ID 선택자
    if (trimmed.startsWith('#')) {
      return SELECTOR_TYPES.ID;
    }

    // Class 선택자
    if (trimmed.startsWith('.')) {
      return SELECTOR_TYPES.CLASS;
    }

    // XPath
    if (trimmed.startsWith('//') || trimmed.startsWith('/')) {
      return SELECTOR_TYPES.XPATH;
    }

    // Name 속성
    if (trimmed.startsWith('name=')) {
      return SELECTOR_TYPES.NAME;
    }

    // Link text
    if (trimmed.startsWith('link=')) {
      return SELECTOR_TYPES.LINK_TEXT;
    }

    // Partial link text
    if (trimmed.startsWith('partialLink=')) {
      return SELECTOR_TYPES.PARTIAL_LINK_TEXT;
    }

    // Tag
    if (trimmed.startsWith('tag=')) {
      return SELECTOR_TYPES.TAG;
    }

    // 기본값: CSS
    return SELECTOR_TYPES.CSS;
  }

  /**
   * 선택자 정규화
   * @param {string} selector - 선택자 문자열
   * @param {string} type - 선택자 타입 (선택사항)
   * @returns {Object} 정규화된 선택자 객체
   */
  static normalize(selector, type = null) {
    const detectedType = type || this.detectType(selector);
    let value = selector;

    // 타입별 값 추출
    if (type === SELECTOR_TYPES.NAME && value.startsWith('name=')) {
      value = value.substring(5);
    } else if (type === SELECTOR_TYPES.LINK_TEXT && value.startsWith('link=')) {
      value = value.substring(5);
    } else if (type === SELECTOR_TYPES.PARTIAL_LINK_TEXT && value.startsWith('partialLink=')) {
      value = value.substring(12);
    } else if (type === SELECTOR_TYPES.TAG && value.startsWith('tag=')) {
      value = value.substring(4);
    }

    return {
      type: detectedType,
      value: value.trim(),
      priority: 0
    };
  }
}

