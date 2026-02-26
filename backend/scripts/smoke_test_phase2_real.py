#!/usr/bin/env python3
"""
Smoke test: Phase2 (SAFEGUARD) adapter — 2 genuine post-discharge kidney cases.

Validates wrapper response structure (schemas.py) + parsed field enums/types/ranges.

Usage:
    python smoke_test_phase2_real.py [--api-base http://localhost:8000]
"""

import argparse
import json
import sys
import urllib.request
import urllib.error

DEFAULT_BASE = "http://localhost:8000"

CASES = [
    {
        "name": "Kidney POD6 — expected recovery (expect: green)",
        "payload": {
            "case_text": (
                "POD6 after robotic partial nephrectomy. Expected recovery pattern.\n"
                "Pain 3/10 decreasing, no fever (max 37.2), wound clean/dry/intact, "
                "BM today, eating solids, walking independently."
            ),
            "patient_id": "PH2_KIDNEY_001",
            "post_op_day": 6,
            "checkin": {
                "pain_score": 3,
                "pain_trend": "decreasing",
                "temperature": 37.2,
                "nausea_vomiting": False,
                "bowel_function": True,
                "appetite": "good",
                "wound_concerns": "clean, dry, intact",
                "mobility": "normal",
            },
        },
        "expect_risk": "green",
    },
    {
        "name": "Kidney POD8 — SSI / wound infection (expect: red)",
        "payload": {
            "case_text": (
                "POD8 after robotic partial nephrectomy. Worsening wound infection pattern.\n"
                "Pain 8/10 increasing, fever 38.9, wound red/swollen/warm with purulent "
                "drainage, no BM 3 days, poor appetite, mostly bedbound."
            ),
            "patient_id": "PH2_KIDNEY_002",
            "post_op_day": 8,
            "checkin": {
                "pain_score": 8,
                "pain_trend": "increasing significantly",
                "temperature": 38.9,
                "nausea_vomiting": True,
                "bowel_function": False,
                "appetite": "poor",
                "wound_concerns": "red, swollen, warm; purulent foul-smelling drainage",
                "mobility": "reduced",
            },
        },
        "expect_risk": "red",
    },
]

VALID_RISK = {"green", "amber", "red"}
VALID_DEVIATION = {"none", "mild", "moderate", "severe"}


def post(url, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {e.read().decode()[:300]}")
        return None
    except Exception as e:
        print(f"  Error: {e}")
        return None


def get(url):
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"  Error: {e}")
        return None


def validate_wrapper(res):
    errors = []
    for key in ("request_id", "mode", "fallback_used", "raw_text", "error"):
        if key not in res:
            errors.append(f"wrapper missing: {key}")
    if "parsed" not in res and "data" not in res:
        errors.append("wrapper missing: parsed/data")
    mode = res.get("mode")
    if mode not in ("real", "demo"):
        errors.append(f"mode={mode!r} not in [real, demo]")
    return errors


def validate_parsed(parsed):
    errors = []
    required = ["doc_type", "risk_level", "risk_score", "timeline_deviation", "trigger_reason"]
    for f in required:
        if f not in parsed:
            errors.append(f"missing: {f}")

    rl = parsed.get("risk_level")
    if rl and rl not in VALID_RISK:
        errors.append(f"risk_level={rl!r} not in {VALID_RISK}")

    td = parsed.get("timeline_deviation")
    if td and td not in VALID_DEVIATION:
        errors.append(f"timeline_deviation={td!r} not in {VALID_DEVIATION}")

    rs = parsed.get("risk_score")
    if rs is not None:
        if not isinstance(rs, (int, float)):
            errors.append("risk_score not numeric")
        elif rs < 0 or rs > 1:
            errors.append(f"risk_score={rs} outside [0, 1]")

    tr = parsed.get("trigger_reason")
    if tr is not None and not isinstance(tr, list):
        errors.append("trigger_reason not list")

    ct = parsed.get("copilot_transfer")
    if ct and isinstance(ct, dict):
        sbar = ct.get("sbar")
        if sbar and isinstance(sbar, dict):
            for key in ("situation", "background", "assessment", "recommendation"):
                if key not in sbar:
                    errors.append(f"sbar.{key} missing")

    return errors


def run_case(base, case, idx):
    name = case["name"]
    print(f"\n--- Case {idx}: {name} ---")

    res = post(f"{base}/api/phase2", case["payload"])
    if not res:
        print("  FAIL: No response")
        return False

    w_errs = validate_wrapper(res)
    if w_errs:
        print(f"  Wrapper errors: {w_errs[:5]}")

    print(f"  request_id: {res.get('request_id', '?')}")
    print(f"  mode: {res.get('mode', '?')}  fallback_used: {res.get('fallback_used', '?')}  fallback_reason: {res.get('fallback_reason')}")

    parsed = res.get("parsed") or res.get("data")
    if not parsed or not isinstance(parsed, dict):
        print("  FAIL: No parsed data")
        return False

    p_errs = validate_parsed(parsed)
    all_errs = w_errs + p_errs
    passed = len(all_errs) == 0

    print(f"  risk_level: {parsed.get('risk_level', '?')}  (expected: {case['expect_risk']})")
    print(f"  risk_score: {parsed.get('risk_score', '?')}")
    print(f"  timeline_deviation: {parsed.get('timeline_deviation', '?')}")
    print(f"  trigger_reason: {parsed.get('trigger_reason', [])}")
    ct = parsed.get("copilot_transfer", {})
    print(f"  send_to_clinician: {ct.get('send_to_clinician', '?')}")
    print(f"  Schema: {'PASS' if passed else 'FAIL'}")
    if all_errs:
        for e in all_errs[:5]:
            print(f"    - {e}")

    return passed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-base", default=DEFAULT_BASE)
    args = parser.parse_args()
    base = args.api_base.rstrip("/")

    print("=" * 60)
    print("SMOKE TEST: Phase2 SAFEGUARD (2 cases)")
    print(f"API: {base}")
    print("=" * 60)

    health = get(f"{base}/health")
    if not health:
        print("FAIL: Backend not reachable")
        sys.exit(1)
    print(f"Health: {health}")

    results = []
    for i, case in enumerate(CASES, 1):
        ok = run_case(base, case, i)
        results.append(ok)

    passed = sum(results)
    total = len(results)
    print(f"\n{'=' * 60}")
    print(f"Phase2: {passed}/{total} cases passed")
    print("=" * 60)

    if passed < total:
        sys.exit(1)


if __name__ == "__main__":
    main()
