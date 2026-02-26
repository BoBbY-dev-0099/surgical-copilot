#!/usr/bin/env python3
"""
Smoke test: Onco adapter — 2 genuine colon cancer surveillance cases.

Validates wrapper response structure (schemas.py) + parsed field enums/types/ranges.

Usage:
    python smoke_test_onc_real.py [--api-base http://localhost:8000]
"""

import argparse
import json
import sys
import urllib.request
import urllib.error

DEFAULT_BASE = "http://localhost:8000"

CASES = [
    {
        "name": "Colon ca 12mo surveillance — stable (expect: green / SD)",
        "payload": {
            "case_text": (
                "Patient: 59M with Stage III colon adenocarcinoma s/p right hemicolectomy, on adjuvant chemo.\n\n"
                "Surveillance visit (12 months post-op):\n"
                "Imaging (CT chest/abdomen/pelvis vs 6 months ago):\n"
                "- No new hepatic lesions\n- No lung nodules\n- No enlarged nodes\n- Anastomosis: no mass\n\n"
                "Tumor marker:\n- CEA: 4.8 -> 3.9 ng/mL (down)\n\n"
                "Clinical:\n- Weight stable, no new pain, ECOG 0-1."
            ),
            "patient_id": "ONC_COLON_001",
        },
        "expect_risk": "green",
        "expect_progression": "stable_disease",
        "expect_recist": "SD",
    },
    {
        "name": "Colon ca metastatic — new liver lesions + progression (expect: red / PD)",
        "payload": {
            "case_text": (
                "Patient: 66F with metastatic colorectal cancer on FOLFOX + bevacizumab.\n\n"
                "Imaging (CT chest/abdomen/pelvis, compared to 8 weeks ago):\n"
                "- Liver mets:\n"
                "  - Segment 6: 2.5 cm -> 3.3 cm (+32%)\n"
                "  - Segment 8: 1.9 cm -> 2.6 cm (+37%)\n"
                "  - NEW: Segment 2 lesion 1.4 cm\n"
                "- Small volume ascites: new\n\n"
                "Tumor marker:\n- CEA: 12.0 -> 20.8 ng/mL (rising)\n\n"
                "Clinical:\n- More fatigue, early satiety, ECOG 2."
            ),
            "patient_id": "ONC_COLON_002",
        },
        "expect_risk": "red",
        "expect_progression": "confirmed_progression",
        "expect_recist": "PD",
    },
]

VALID_RISK = {"green", "amber", "red"}
VALID_PROGRESSION = {"stable_disease", "confirmed_progression", "complete_response", "partial_response"}
VALID_RECIST = {"SD", "PD", "CR", "PR", "NE"}
VALID_URGENCY = {"routine", "urgent", "immediate"}


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
    required = [
        "doc_type", "risk_level", "risk_score", "progression_status",
        "recist_alignment", "trigger_reason", "recommended_actions",
        "clinical_explanation",
    ]
    for f in required:
        if f not in parsed:
            errors.append(f"missing: {f}")

    rl = parsed.get("risk_level")
    if rl and rl not in VALID_RISK:
        errors.append(f"risk_level={rl!r} not in {VALID_RISK}")

    ps = parsed.get("progression_status")
    if ps and ps not in VALID_PROGRESSION:
        errors.append(f"progression_status={ps!r} not in {VALID_PROGRESSION}")

    ra = parsed.get("recist_alignment")
    if ra and ra not in VALID_RECIST:
        errors.append(f"recist_alignment={ra!r} not in {VALID_RECIST}")

    rs = parsed.get("risk_score")
    if rs is not None:
        if not isinstance(rs, (int, float)):
            errors.append("risk_score not numeric")
        elif rs < 0 or rs > 1:
            errors.append(f"risk_score={rs} outside [0, 1]")

    tr = parsed.get("trigger_reason")
    if tr is not None and not isinstance(tr, list):
        errors.append("trigger_reason not list")

    ra_list = parsed.get("recommended_actions")
    if ra_list is not None and not isinstance(ra_list, list):
        errors.append("recommended_actions not list")

    ce = parsed.get("clinical_explanation")
    if ce is not None and not isinstance(ce, str):
        errors.append("clinical_explanation not string")

    ct = parsed.get("copilot_transfer")
    if ct and isinstance(ct, dict):
        urg = ct.get("urgency")
        if urg and urg not in VALID_URGENCY:
            errors.append(f"copilot_transfer.urgency={urg!r} not in {VALID_URGENCY}")

    sf = parsed.get("safety_flags")
    if sf and isinstance(sf, dict):
        for flag_key in ("new_lesion", "rapid_growth", "organ_compromise", "neurologic_emergency"):
            if flag_key in sf and not isinstance(sf[flag_key], bool):
                errors.append(f"safety_flags.{flag_key} not bool")

    return errors


def run_case(base, case, idx):
    name = case["name"]
    print(f"\n--- Case {idx}: {name} ---")

    res = post(f"{base}/api/onc", case["payload"])
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
    print(f"  progression_status: {parsed.get('progression_status', '?')}  (expected: {case.get('expect_progression', '?')})")
    print(f"  recist_alignment: {parsed.get('recist_alignment', '?')}  (expected: {case.get('expect_recist', '?')})")
    print(f"  trigger_reason: {parsed.get('trigger_reason', [])}")
    ct = parsed.get("copilot_transfer", {})
    print(f"  urgency: {ct.get('urgency', '?')}  send_to_oncologist: {ct.get('send_to_oncologist', '?')}")
    print(f"  clinical_explanation: {str(parsed.get('clinical_explanation', ''))[:120]}...")
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
    print("SMOKE TEST: Onco Surveillance (2 cases)")
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
    print(f"Onco: {passed}/{total} cases passed")
    print("=" * 60)

    if passed < total:
        sys.exit(1)


if __name__ == "__main__":
    main()
