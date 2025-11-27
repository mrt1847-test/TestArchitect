/**
 * AI 서비스 모듈
 * record/background.js의 AI 셀렉터 추천 및 코드 리뷰 로직을 추출
 */

/**
 * 순환 참조나 함수가 포함된 객체를 보낼 수 있도록 JSON-safe 복사본을 만든다.
 */
function sanitizeForTransport(data) {
  try {
    return JSON.parse(JSON.stringify(data, (key, value) => {
      if (typeof value === 'function' || value === undefined) {
        return undefined;
      }
      return value;
    }));
  } catch (err) {
    return null;
  }
}

/**
 * API 요청 추적을 위한 고유 요청 ID를 생성한다.
 */
function generateRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * AI 응답과 같은 텍스트에서 JSON을 추출/파싱한다.
 */
function parseJsonFromText(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const tryParse = (candidate) => {
    if (!candidate) return null;
    try {
      return JSON.parse(candidate);
    } catch (err) {
      return null;
    }
  };
  const direct = tryParse(trimmed);
  if (direct) return direct;
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    const fencedParsed = tryParse(fencedMatch[1].trim());
    if (fencedParsed) return fencedParsed;
  }
  const jsonLikeMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonLikeMatch) {
    const guess = tryParse(jsonLikeMatch[0]);
    if (guess) return guess;
  }
  return null;
}

/**
 * AI 셀렉터 추천 요청 페이로드 생성
 */
function buildAiSelectorRequestBody(eventPayload, contextPayload, settings) {
  const sanitizedEvent = sanitizeForTransport(eventPayload) || {};
  const context = contextPayload && typeof contextPayload === 'object' ? contextPayload : {};
  const {
    tabId,
    aiModel,
    testCase = '',
    testUrl = '',
    framework = '',
    language = ''
  } = context;
  const resolvedModel = typeof aiModel === 'string' && aiModel.trim()
    ? aiModel.trim()
    : (settings && settings.model ? settings.model : '');
  const selectorCandidates = Array.isArray(sanitizedEvent.selectorCandidates)
    ? sanitizedEvent.selectorCandidates
    : [];
  return {
    requestId: generateRequestId(),
    testCase: typeof testCase === 'string' ? testCase : '',
    testUrl: typeof testUrl === 'string' ? testUrl : '',
    framework: typeof framework === 'string' ? framework : '',
    language: typeof language === 'string' ? language : '',
    model: resolvedModel || '',
    event: sanitizedEvent,
    selectorCandidates,
    guidance: [
      '의미 있는 속성(id, data-*, aria- 등)을 우선 사용하고 동적 클래스 의존을 줄입니다.',
      'nth-child, 인덱스 기반 경로는 불가피할 때만 사용합니다.',
      '텍스트 기반 셀렉터는 컨텐츠 변경 가능성을 고려해 신중히 사용합니다.',
      '가능한 한 유일하게 매칭되는 셀렉터를 제안합니다.',
      'iframe 및 부모·자식 문맥 정보를 고려합니다.'
    ],
    metadata: {
      extension: 'ai_test_recorder',
      version: '1.0',
      requestedAt: new Date().toISOString()
    },
    _tabId: typeof tabId === 'number' ? tabId : null
  };
}

/**
 * AI 코드 리뷰 요청 페이로드 생성
 */
function buildAiCodeReviewRequestBody(message, settings) {
  const resolvedModel = (settings && settings.model) || '';
  const {
    testCase = '',
    code = '',
    framework = '',
    language = '',
    events = []
  } = message;
  return {
    requestId: generateRequestId(),
    testCase: typeof testCase === 'string' ? testCase : '',
    code: typeof code === 'string' ? code : '',
    framework: typeof framework === 'string' ? framework : '',
    language: typeof language === 'string' ? language : '',
    model: resolvedModel || '',
    events: Array.isArray(events) ? events.slice(0, 10) : [],
    guidance: [
      '코드의 가독성과 유지보수성을 개선합니다.',
      '불필요한 중복을 제거하고 재사용 가능한 패턴을 제안합니다.',
      '에러 처리와 대기 로직을 강화합니다.',
      '셀렉터의 안정성을 검토하고 개선합니다.',
      '테스트의 신뢰성을 높이는 방향으로 수정합니다.'
    ],
    metadata: {
      extension: 'ai_test_recorder',
      version: '1.0',
      requestedAt: new Date().toISOString()
    }
  };
}

/**
 * AI 셀렉터 추천 요청
 */
export async function getAiSelectorSuggestions(event, context, aiSettings) {
  try {
    const { endpoint, apiKey, model } = aiSettings || {};
    if (!endpoint || !apiKey) {
      return { success: false, error: 'AI 설정이 완료되지 않았습니다' };
    }

    const requestBody = buildAiSelectorRequestBody(event, context, { endpoint, apiKey, model });
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const text = await response.text();
    const parsed = parseJsonFromText(text);
    
    if (!parsed) {
      return { success: false, error: '응답 파싱 실패' };
    }

    return {
      success: true,
      data: parsed
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * AI 코드 리뷰 요청
 */
export async function getAiCodeReview(code, framework, language, testCase, events, aiSettings) {
  try {
    const { endpoint, apiKey, model } = aiSettings || {};
    if (!endpoint || !apiKey) {
      return { success: false, error: 'AI 설정이 완료되지 않았습니다' };
    }

    const requestBody = buildAiCodeReviewRequestBody({
      testCase,
      code,
      framework,
      language,
      events
    }, { endpoint, apiKey, model });
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const text = await response.text();
    const parsed = parseJsonFromText(text);
    
    if (!parsed) {
      return { success: false, error: '응답 파싱 실패' };
    }

    return {
      success: true,
      data: parsed
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

