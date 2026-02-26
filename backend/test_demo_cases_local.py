#!/usr/bin/env python3
"""
Test new features using the same demo cases as the frontend (mockCases.js).

Usage:
  1. Start backend:  cd backend && uvicorn app.main:app --reload --port 8000
  2. Run this:       cd backend && python test_demo_cases_local.py

Demo case texts match PH1B_KIDNEY_002, PH2_AMBER_001, ONC_COLON_001 from src/data/mockCases.js
"""

import json
import requests

BASE = "http://localhost:8000"

# Demo case texts from mockCases.js (same as frontend)
DEMO_PHASE1B = """TITLE: POD4 after robotic partial nephrectomy — worsening sepsis concern, enlarging collection

PATIENT
- 70F, robotic partial nephrectomy (left) for benign renal mass
- POD 2 discharge cancelled due to fever trend

CURRENT STATUS (POD 4)
- Symptoms: worsening flank pain, chills, nausea
- Vitals: T 39.0 C, HR 118, BP 96/58, RR 22, SpO2 95% RA
- Exam: ill-appearing, left flank tenderness, mild guarding, drain output decreased

TREND (serial)
DAY | WBC (K) | CRP (mg/L) | Lactate | Temp(C) | Pain | Imaging
2   | 13.9    | 88         | 1.6     | 38.1    | 5    | CT: 2.4 cm fluid collection, equivocal rim
3   | 16.8    | 145        | 2.1     | 38.7    | 7    | --
4   | 19.6    | 210        | 3.2     | 39.0    | 8    | CT: 5.6 cm rim-enhancing perinephric collection with gas pockets; hemodynamic instability"""

DEMO_PHASE2 = """POD5 after laparoscopic appendectomy for acute non-perforated appendicitis.
Pain 5/10 — not improving compared to yesterday (was 4/10). Low-grade fever this evening (38.1°C). Wound site slightly warm and erythematous at staple line, no discharge. Appetite reduced, mainly liquids. No BMs in 2 days. Activity level reduced, mostly resting in bed."""

DEMO_PHASE2_CHECKIN = {
    "pain_score": 5,
    "pain_trend": "plateau",
    "temperature": 38.1,
    "nausea_vomiting": False,
    "bowel_function": False,
    "appetite": "reduced",
    "wound_concerns": "mildly warm and erythematous at staple line, no discharge",
    "mobility": "reduced",
    "steps_today": 800,
    "steps_baseline": 4500,
    "resting_hr": 92,
    "hr_baseline": 72,
}

DEMO_ONCO = """Patient: 59M with Stage III colon adenocarcinoma s/p right hemicolectomy, on adjuvant chemo.

Surveillance visit (12 months post-op):
Imaging (CT chest/abdomen/pelvis vs 6 months ago):
- No new hepatic lesions
- No lung nodules
- No enlarged nodes
- Anastomosis: no mass

Tumor marker:
- CEA: 4.8 -> 3.9 ng/mL (down)

Clinical:
- Weight stable, no new pain, ECOG 0-1."""


def run_phase1b():
    """Run Phase 1B demo case — expect NEWS2 + Sepsis in parsed."""
    print("\n" + "=" * 60)
    print("DEMO CASE: Phase 1B (PH1B_KIDNEY_002 — Operate Now)")
    print("=" * 60)
    r = requests.post(f"{BASE}/api/phase1b", json={"case_text": DEMO_PHASE1B}, timeout=60)
    if r.status_code != 200:
        print(f"FAIL: HTTP {r.status_code}\n{r.text}")
        return False
    data = r.json()
    parsed = data.get("parsed") or {}
    print("\n--- Decision ---")
    print("  label_class:", parsed.get("label_class"))
    print("  trajectory:", parsed.get("trajectory"))
    print("\n--- NEW FEATURES: NEWS2 ---")
    news2 = parsed.get("news2", {})
    if news2:
        print("  news2_score:", news2.get("news2_score"))
        print("  news2_risk_band:", news2.get("news2_risk_band"))
        print("  news2_clinical_response:", (news2.get("news2_clinical_response") or "")[:80] + "...")
        print("  news2_components:", news2.get("news2_components"))
    else:
        print("  (missing — check _enrich_phase1b_output)")
    print("\n--- NEW FEATURES: Sepsis Screen ---")
    sepsis = parsed.get("sepsis_screen", {})
    if sepsis:
        print("  qsofa_score:", sepsis.get("qsofa_score"))
        print("  sepsis_likelihood:", sepsis.get("sepsis_likelihood"))
        print("  sepsis_action:", (sepsis.get("sepsis_action") or "")[:80] + "...")
    else:
        print("  (missing)")
    print("\n--- Extracted Vitals (for NEWS2) ---")
    print("  ", parsed.get("extracted_vitals"))
    print("\n--- SBAR (should reference NEWS2/qSOFA) ---")
    sbar = parsed.get("sbar", {})
    if sbar.get("assessment"):
        print("  assessment:", (sbar["assessment"] or "")[:120] + "...")
    return bool(news2 and sepsis)


def run_phase2():
    """Run Phase 2 demo case — expect wearable_analysis + fused_risk in parsed."""
    print("\n" + "=" * 60)
    print("DEMO CASE: Phase 2 (PH2_AMBER_001 — Appendectomy POD5)")
    print("=" * 60)
    r = requests.post(
        f"{BASE}/api/phase2",
        json={
            "case_text": DEMO_PHASE2,
            "post_op_day": 5,
            "checkin": DEMO_PHASE2_CHECKIN,
        },
        timeout=60,
    )
    if r.status_code != 200:
        print(f"FAIL: HTTP {r.status_code}\n{r.text}")
        return False
    data = r.json()
    parsed = data.get("parsed") or {}
    print("\n--- Decision ---")
    print("  risk_level:", parsed.get("risk_level"))
    print("\n--- NEW FEATURES: Wearable Analysis ---")
    wear = parsed.get("wearable_analysis", {})
    if wear:
        print("  wearable_data_available:", wear.get("wearable_data_available"))
        print("  wearable_risk_level:", wear.get("wearable_risk_level"))
        print("  wearable_action:", wear.get("wearable_action"))
        print("  signals:", list(wear.get("signals", {}).keys()))
        print("  deviations:", [d.get("finding") for d in wear.get("deviations", [])])
    else:
        print("  (missing — check _enrich_phase2_output)")
    print("\n--- NEW FEATURES: Fused Risk ---")
    fused = parsed.get("fused_risk", {})
    if fused:
        print("  self_reported_risk:", fused.get("self_reported_risk"))
        print("  wearable_risk:", fused.get("wearable_risk"))
        print("  fused_risk_level:", fused.get("fused_risk_level"))
        print("  risk_upgraded:", fused.get("risk_upgraded"))
    return bool(wear)


def run_onco():
    """Run Oncology demo case — expect nccn_surveillance + guideline_followup in parsed."""
    print("\n" + "=" * 60)
    print("DEMO CASE: Oncology (ONC_COLON_001 — 12mo surveillance)")
    print("=" * 60)
    r = requests.post(f"{BASE}/api/onc", json={"case_text": DEMO_ONCO}, timeout=60)
    if r.status_code != 200:
        print(f"FAIL: HTTP {r.status_code}\n{r.text}")
        return False
    data = r.json()
    parsed = data.get("parsed") or {}
    print("\n--- Decision ---")
    print("  risk_level:", parsed.get("risk_level"))
    print("  progression_status:", parsed.get("progression_status"))
    print("  recist_alignment:", parsed.get("recist_alignment"))
    print("\n--- NEW FEATURES: NCCN Surveillance ---")
    nccn = parsed.get("nccn_surveillance", {})
    if nccn:
        print("  schedule_period:", nccn.get("schedule_period"))
        print("  months_post_resection:", nccn.get("months_post_resection"))
        print("  schedule keys:", list(nccn.get("schedule", {}).keys()) if nccn.get("schedule") else None)
    else:
        print("  (missing — check _enrich_onco_output)")
    print("\n--- NEW FEATURES: Guideline Follow-up ---")
    followup = parsed.get("guideline_followup", {})
    if followup:
        print("  urgency:", followup.get("urgency"))
        print("  CEA timing:", followup.get("cea", {}).get("timing"))
        print("  Imaging timing:", followup.get("imaging", {}).get("timing"))
        print("  nccn_reference:", (followup.get("nccn_reference") or "")[:60] + "...")
    print("\n--- RECIST details ---")
    print("  ", parsed.get("recist_details"))
    return bool(nccn and followup)


def run_medasr_benchmark():
    """Quick check: MedASR benchmark endpoints."""
    print("\n" + "=" * 60)
    print("DEMO: MedASR Benchmark (no audio, summary only)")
    print("=" * 60)
    r = requests.get(f"{BASE}/api/medasr/benchmark/samples", timeout=10)
    if r.status_code != 200:
        print(f"FAIL: HTTP {r.status_code}")
        return False
    samples = r.json()
    print("  samples count:", samples.get("total_samples"))
    print("  domains:", samples.get("domains"))
    r2 = requests.get(f"{BASE}/api/medasr/benchmark/summary", timeout=10)
    if r2.status_code != 200:
        return False
    summary = r2.json()
    print("  title:", summary.get("title"))
    print("  radiology MedASR WER:", summary.get("metrics", {}).get("radiology_dictation", {}).get("medasr_wer"))
    return True


def main():
    print("\nSurgical Copilot — Test new features with DEMO CASES (local)")
    print("Backend must be running: uvicorn app.main:app --reload --port 8000\n")
    try:
        requests.get(f"{BASE}/health", timeout=3)
    except Exception as e:
        print(f"Cannot reach {BASE}. Start backend first.\nError: {e}")
        return
    ok = 0
    ok += run_phase1b()
    ok += run_phase2()
    ok += run_onco()
    ok += run_medasr_benchmark()
    print("\n" + "=" * 60)
    print(f"Done. {ok}/4 checks had new features present.")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
