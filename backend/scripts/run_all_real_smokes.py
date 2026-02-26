#!/usr/bin/env python3
"""
Combined smoke test runner — runs all 3 adapter tests (6 cases total).

Usage:
    python run_all_real_smokes.py --api-base http://localhost:8000
"""

import argparse
import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent

TESTS = [
    ("Phase1B", "smoke_test_phase1b_real.py"),
    ("Phase2",  "smoke_test_phase2_real.py"),
    ("Onco",    "smoke_test_onc_real.py"),
]


def main():
    parser = argparse.ArgumentParser(description="Run all real-adapter smoke tests (6 cases)")
    parser.add_argument("--api-base", default="http://localhost:8000", help="Backend API base URL")
    args = parser.parse_args()

    print("=" * 70)
    print("  SURGICAL COPILOT — Full Smoke Test Suite (6 cases, 3 adapters)")
    print(f"  API: {args.api_base}")
    print("=" * 70)

    results = {}

    for name, script in TESTS:
        print(f"\n{'─' * 70}")
        print(f"  Running: {name} ({script})")
        print(f"{'─' * 70}")

        script_path = SCRIPTS_DIR / script
        if not script_path.exists():
            print(f"  SKIP: {script_path} not found")
            results[name] = "SKIP"
            continue

        try:
            result = subprocess.run(
                [sys.executable, str(script_path), "--api-base", args.api_base],
                timeout=120,
                capture_output=False,
            )
            results[name] = "PASS" if result.returncode == 0 else "FAIL"
        except subprocess.TimeoutExpired:
            print(f"  TIMEOUT after 120s")
            results[name] = "TIMEOUT"
        except Exception as e:
            print(f"  ERROR: {e}")
            results[name] = "ERROR"

    # Summary
    print(f"\n{'=' * 70}")
    print("  SUMMARY")
    print(f"{'=' * 70}")
    all_pass = True
    for name, status in results.items():
        icon = "✓" if status == "PASS" else "✗"
        print(f"  {icon}  {name:12s}  {status}")
        if status != "PASS":
            all_pass = False

    total_cases = sum(2 for _, s in results.items() if s == "PASS")
    total_possible = len(TESTS) * 2
    print(f"\n  Total: {total_cases}/{total_possible} cases passed")
    print("=" * 70)

    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
