#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
예제 테스트 스크립트
이 스크립트는 JSON 형식의 결과를 stdout으로 출력합니다.
"""

import json
import sys
import time

def run_test():
    """테스트 실행 함수"""
    # 테스트 시뮬레이션
    time.sleep(1)
    
    # 테스트 결과 생성
    result = {
        "test_name": "예제 테스트",
        "status": "PASSED",
        "duration": 1.0,
        "timestamp": "2024-01-01T00:00:00",
        "details": {
            "total_steps": 5,
            "passed_steps": 5,
            "failed_steps": 0
        },
        "steps": [
            {"step": 1, "action": "페이지 로드", "status": "PASSED"},
            {"step": 2, "action": "로그인", "status": "PASSED"},
            {"step": 3, "action": "데이터 입력", "status": "PASSED"},
            {"step": 4, "action": "검증", "status": "PASSED"},
            {"step": 5, "action": "로그아웃", "status": "PASSED"}
        ]
    }
    
    return result

if __name__ == "__main__":
    try:
        result = run_test()
        # JSON 결과를 stdout으로 출력 (중요: 다른 출력은 하지 않아야 함)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(0)
    except Exception as e:
        error_result = {
            "status": "ERROR",
            "error": str(e)
        }
        print(json.dumps(error_result, ensure_ascii=False, indent=2))
        sys.exit(1)

