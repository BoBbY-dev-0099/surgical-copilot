#!/usr/bin/env python3
"""
Smoke test: Phase1B adapter — 2 genuine kidney cases via real AWS adapter.

Validates wrapper response structure (schemas.py) + parsed field enums/types.

Usage:
    python smoke_test_phase1b_real.py [--api-base http://localhost:8000]
"""

import argparse
import json
import sys
import urllib.request
import urllib.error

DEFAULT_BASE = "http://localhost:8000"

CASES = [
    {
        "name": "Kidney POD3 — small collection (expect: watch_wait / stable)",
        "payload": {
            "case_text": (
                "TITLE: POD3 after robotic partial nephrectomy — small perinephric collection\n\n"
                "PATIENT\n- 68M, robotic partial nephrectomy (right), warm ischemia 18 min\n"
                "- Path: benign renal adenoma (3.2 cm), margins negative\n\n"
                "CURRENT STATUS (POD 3)\n- Symptoms: mild flank discomfort, tolerating diet, no peritoneal signs\n"
                "- Vitals: T 38.1 C, HR 92, BP 128/78, RR 16, SpO2 97% RA\n"
                "- Exam: incision clean/dry, mild CVA tenderness, abdomen soft\n\n"
                "TREND (serial)\n"
                "DAY | WBC (K) | CRP (mg/L) | Temp(C) | Pain(0-10) | Imaging\n"
                "0   | 11.8    | 42         | 37.6    | 4          | --\n"
                "1   | 12.6    | 55         | 37.8    | 4          | --\n"
                "2   | 13.4    | 72         | 37.9    | 5          | --\n"
                "3   | 14.2    | 85         | 38.1    | 5          | CT: 2.0 cm perinephric fluid collection, no rim enhancement, no obvious gas, no extravasation\n\n"
                "MEDS / PLAN\n- On IV piperacillin-tazobactam, JP drain minimal serosanguinous output\n"
                "- Plan: continue antibiotics, repeat CBC/CRP in 12-24h, repeat imaging if worsening"
            ),
            "patient_id": "PH1B_KIDNEY_001",
        },
        "expect_label": "watch_wait",
    },
    {
        "name": "Kidney POD4 — enlarging abscess + sepsis (expect: operate_now / deteriorating)",
        "payload": {
            "case_text": (
                "TITLE: POD4 after robotic partial nephrectomy — worsening sepsis concern, enlarging collection\n\n"
                "PATIENT\n- 70F, robotic partial nephrectomy (left) for benign renal mass\n"
                "- POD 2 discharge cancelled due to fever trend\n\n"
                "CURRENT STATUS (POD 4)\n- Symptoms: worsening flank pain, chills, nausea\n"
                "- Vitals: T 39.0 C, HR 118, BP 96/58, RR 22, SpO2 95% RA\n"
                "- Exam: ill-appearing, left flank tenderness, mild guarding, drain output decreased\n\n"
                "TREND (serial)\n"
                "DAY | WBC (K) | CRP (mg/L) | Lactate | Temp(C) | Pain | Imaging\n"
                "2   | 13.9    | 88         | 1.6     | 38.1    | 5    | CT: 2.4 cm fluid collection, equivocal rim\n"
                "3   | 16.8    | 145        | 2.1     | 38.7    | 7    | --\n"
                "4   | 19.6    | 210        | 3.2     | 39.0    | 8    | CT: 5.6 cm rim-enhancing perinephric collection with gas pockets; no PE; no bowel injury seen\n\n"
                "MEDS / PLAN\n- Broad-spectrum antibiotics already running\n"
                "- Concern: post-op abscess / infected collection with hemodynamic instability"
            ),
            "patient_id": "PH1B_KIDNEY_002",
        },
        "expect_label": "operate_now",
    },
]

VALID_LABEL_CLASS = {"watch_wait", "operate_now", "avoid"}
VALID_TRAJECTORY = {"improving", "stable", "deteriorating"}


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
    required = ["label_class", "trajectory", "red_flag_triggered", "red_flags"]
    for f in required:
        if f not in parsed:
            errors.append(f"missing: {f}")
    lc = parsed.get("label_class")
    if lc and lc not in VALID_LABEL_CLASS:
        errors.append(f"label_class={lc!r} not in {VALID_LABEL_CLASS}")
    tr = parsed.get("trajectory")
    if tr and tr not in VALID_TRAJECTORY:
        errors.append(f"trajectory={tr!r} not in {VALID_TRAJECTORY}")
    if "red_flag_triggered" in parsed and not isinstance(parsed["red_flag_triggered"], bool):
        errors.append("red_flag_triggered not bool")
    if "red_flags" in parsed and not isinstance(parsed["red_flags"], list):
        errors.append("red_flags not list")
    return errors


def run_case(base, case, idx):
    name = case["name"]
    print(f"\n--- Case {idx}: {name} ---")

    res = post(f"{base}/api/phase1b", case["payload"])
    if not res:
        print("  FAIL: No response")
        return False

    # Wrapper validation
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

    print(f"  label_class: {parsed.get('label_class', '?')}  (expected: {case['expect_label']})")
    print(f"  trajectory: {parsed.get('trajectory', '?')}")
    print(f"  red_flag_triggered: {parsed.get('red_flag_triggered', '?')}")
    print(f"  red_flags: {parsed.get('red_flags', [])}")
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
    print("SMOKE TEST: Phase1B (2 cases)")
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
    print(f"Phase1B: {passed}/{total} cases passed")
    print("=" * 60)

    if passed < total:
        sys.exit(1)


if __name__ == "__main__":
    main()
