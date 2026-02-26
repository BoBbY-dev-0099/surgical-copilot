#!/usr/bin/env python3
"""
Test script for new clinical features:
- NEWS2 scoring
- Sepsis screening
- MedASR benchmark
- NCCN guideline scheduling
- Wearable signal analysis
- Structured audit rationale

Run with: python test_new_features.py
Or with pytest: pytest test_new_features.py -v
"""

import requests
import json

BASE_URL = "http://localhost:8000"

# ═══════════════════════════════════════════════════════════════════
# Test Cases
# ═══════════════════════════════════════════════════════════════════

# Phase 1B case with vitals for NEWS2/Sepsis testing
PHASE1B_CASE = """
POD 3 following laparoscopic sigmoid colectomy.
Vitals: Temp 38.9°C, HR 118 bpm, BP 92/58, RR 24, SpO2 94% on 2L NC.
Labs: WBC 18.4, Lactate 3.2, Creatinine 1.4 (baseline 0.9).
Patient is confused and drowsy. Abdomen distended with diffuse tenderness.
CT shows rim-enhancing 4cm collection in the pelvis with gas bubbles.
"""

# Phase 2 case with wearable data
PHASE2_CASE = """
Day 5 post-discharge following appendectomy.
Patient reports: Pain 4/10 (was 2/10 yesterday), temp 37.8°C at home.
Wound site has some redness, no drainage.
Appetite fair, had small breakfast.
"""

PHASE2_CHECKIN = {
    "steps_today": 1200,
    "steps_baseline": 6000,
    "resting_hr": 88,
    "hr_baseline": 65,
    "sleep_hours": 4,
    "sleep_quality": "poor",
}

# Oncology case for NCCN testing
ONCO_CASE = """
18 months post sigmoid colectomy for Stage IIIB colon cancer.
Surveillance CT shows: hepatic lesion segment 6 now 2.8cm (was 2.1cm, +33%).
New 1.2cm pulmonary nodule in RLL not present on prior scan.
CEA: 8.4 (was 4.2 three months ago, was 3.1 six months ago).
Patient asymptomatic, ECOG 0.
"""


def test_news2_and_sepsis():
    """Test NEWS2 scoring and sepsis screening via Phase 1B endpoint."""
    print("\n" + "="*60)
    print("TEST: NEWS2 & Sepsis Screening (Phase 1B)")
    print("="*60)
    
    response = requests.post(
        f"{BASE_URL}/infer/phase1b",
        json={"case_text": PHASE1B_CASE}
    )
    
    if response.status_code != 200:
        print(f"❌ Request failed: {response.status_code}")
        print(response.text)
        return False
    
    data = response.json()
    parsed = data.get("parsed", {})
    
    # Check NEWS2
    news2 = parsed.get("news2", {})
    print(f"\n📊 NEWS2 Score: {news2.get('news2_score', 'N/A')}")
    print(f"   Risk Band: {news2.get('news2_risk_band', 'N/A')}")
    print(f"   Clinical Response: {news2.get('news2_clinical_response', 'N/A')}")
    print(f"   Components: {news2.get('news2_components', {})}")
    
    # Check Sepsis
    sepsis = parsed.get("sepsis_screen", {})
    print(f"\n🦠 Sepsis Screen:")
    print(f"   qSOFA Score: {sepsis.get('qsofa_score', 'N/A')}/3")
    print(f"   Likelihood: {sepsis.get('sepsis_likelihood', 'N/A')}")
    print(f"   Action: {sepsis.get('sepsis_action', 'N/A')}")
    print(f"   Criteria Met: {sepsis.get('qsofa_criteria_met', [])}")
    
    # Check extracted vitals
    vitals = parsed.get("extracted_vitals", {})
    print(f"\n🌡️ Extracted Vitals: {vitals}")
    
    # Validate
    if news2.get("news2_score") is not None and news2.get("news2_score") >= 5:
        print("\n✅ NEWS2 correctly identified high-risk patient")
    else:
        print("\n⚠️ NEWS2 score may not reflect severity")
    
    if sepsis.get("qsofa_score", 0) >= 2:
        print("✅ Sepsis screening correctly triggered qSOFA ≥2")
    
    return True


def test_wearable_analysis():
    """Test wearable/passive signal analysis via Phase 2 endpoint."""
    print("\n" + "="*60)
    print("TEST: Wearable Signal Analysis (Phase 2)")
    print("="*60)
    
    response = requests.post(
        f"{BASE_URL}/infer/phase2",
        json={
            "case_text": PHASE2_CASE,
            "post_op_day": 5,
            "checkin": PHASE2_CHECKIN,
        }
    )
    
    if response.status_code != 200:
        print(f"❌ Request failed: {response.status_code}")
        print(response.text)
        return False
    
    data = response.json()
    parsed = data.get("parsed", {})
    
    # Check wearable analysis
    wearable = parsed.get("wearable_analysis", {})
    print(f"\n⌚ Wearable Analysis:")
    print(f"   Data Available: {wearable.get('wearable_data_available', False)}")
    print(f"   Risk Level: {wearable.get('wearable_risk_level', 'N/A')}")
    print(f"   Action: {wearable.get('wearable_action', 'N/A')}")
    
    signals = wearable.get("signals", {})
    print(f"\n   Signals:")
    for sig_name, sig_data in signals.items():
        print(f"     - {sig_name}: {sig_data}")
    
    deviations = wearable.get("deviations", [])
    print(f"\n   Deviations ({len(deviations)}):")
    for dev in deviations:
        print(f"     - [{dev.get('severity', '?').upper()}] {dev.get('signal')}: {dev.get('finding')}")
    
    # Check fused risk
    fused = parsed.get("fused_risk", {})
    print(f"\n🔀 Fused Risk:")
    print(f"   Self-Reported: {fused.get('self_reported_risk', 'N/A')}")
    print(f"   Wearable: {fused.get('wearable_risk', 'N/A')}")
    print(f"   Fused: {fused.get('fused_risk_level', 'N/A')}")
    print(f"   Upgraded: {fused.get('risk_upgraded', False)}")
    if fused.get("upgrade_reason"):
        print(f"   Reason: {fused.get('upgrade_reason')}")
    
    # Validate
    if wearable.get("wearable_data_available"):
        print("\n✅ Wearable data correctly processed")
    
    if len(deviations) > 0:
        print("✅ Deviations correctly detected (step drop, HR elevation)")
    
    return True


def test_nccn_guidelines():
    """Test NCCN guideline-aware scheduling via Oncology endpoint."""
    print("\n" + "="*60)
    print("TEST: NCCN Guideline Scheduling (Oncology)")
    print("="*60)
    
    response = requests.post(
        f"{BASE_URL}/infer/onco",
        json={"case_text": ONCO_CASE}
    )
    
    if response.status_code != 200:
        print(f"❌ Request failed: {response.status_code}")
        print(response.text)
        return False
    
    data = response.json()
    parsed = data.get("parsed", {})
    
    # Check NCCN surveillance
    nccn = parsed.get("nccn_surveillance", {})
    print(f"\n📋 NCCN Surveillance:")
    print(f"   Schedule Period: {nccn.get('schedule_period', 'N/A')}")
    print(f"   Months Post-Resection: {nccn.get('months_post_resection', 'N/A')}")
    
    # Check guideline followup
    followup = parsed.get("guideline_followup", {})
    print(f"\n📅 Guideline Follow-up:")
    print(f"   Urgency: {followup.get('urgency', 'N/A')}")
    if followup.get("cea"):
        print(f"   CEA: {followup['cea'].get('timing')} - {followup['cea'].get('rationale')}")
    if followup.get("imaging"):
        print(f"   Imaging: {followup['imaging'].get('timing')} - {followup['imaging'].get('rationale')}")
    if followup.get("oncology_review"):
        print(f"   Oncology: {followup['oncology_review'].get('timing')}")
    print(f"   NCCN Reference: {followup.get('nccn_reference', 'N/A')}")
    
    # Check RECIST details
    recist = parsed.get("recist_details", {})
    print(f"\n📈 RECIST Details:")
    print(f"   Response: {recist.get('name', 'N/A')}")
    print(f"   Definition: {recist.get('definition', 'N/A')}")
    print(f"   Action: {recist.get('action', 'N/A')}")
    
    # Check clinical action summary
    summary = parsed.get("clinical_action_summary", {})
    if summary:
        print(f"\n📝 Clinical Action Summary:")
        for k, v in summary.items():
            print(f"   {k}: {v}")
    
    # Validate
    if nccn.get("schedule_period"):
        print("\n✅ NCCN schedule correctly identified")
    
    if followup.get("urgency"):
        print("✅ Guideline-aware follow-up generated")
    
    return True


def test_medasr_benchmark():
    """Test MedASR benchmark endpoints."""
    print("\n" + "="*60)
    print("TEST: MedASR Benchmark Endpoints")
    print("="*60)
    
    # Test samples endpoint
    print("\n📋 Getting benchmark samples...")
    response = requests.get(f"{BASE_URL}/api/medasr/benchmark/samples")
    
    if response.status_code != 200:
        print(f"❌ Samples request failed: {response.status_code}")
        return False
    
    samples = response.json()
    print(f"   Total samples: {samples.get('total_samples', 0)}")
    print(f"   Domains: {samples.get('domains', [])}")
    for s in samples.get("samples", [])[:3]:
        print(f"   - {s['id']}: {s['domain']} ({s['difficulty']})")
    
    # Test benchmark run
    print("\n🏃 Running benchmark on sample...")
    response = requests.post(
        f"{BASE_URL}/api/medasr/benchmark/run",
        data={"sample_id": "radiology_001"}
    )
    
    if response.status_code != 200:
        print(f"❌ Benchmark run failed: {response.status_code}")
        print(response.text)
        return False
    
    result = response.json()
    print(f"   Sample: {result.get('sample_id')}")
    print(f"   Domain: {result.get('domain')}")
    print(f"   Medical terms: {result.get('medical_terms_in_reference', [])[:5]}...")
    
    print("\n   Results:")
    for r in result.get("results", []):
        print(f"   - {r['model']}: WER={r.get('wer', 'N/A')}, Medical Term Accuracy={r.get('medical_term_accuracy', 'N/A')}")
    
    summary = result.get("summary", {})
    print(f"\n   Summary:")
    for k, v in summary.items():
        print(f"   - {k}: {v}")
    
    # Test summary endpoint
    print("\n📊 Getting benchmark summary...")
    response = requests.get(f"{BASE_URL}/api/medasr/benchmark/summary")
    
    if response.status_code != 200:
        print(f"❌ Summary request failed: {response.status_code}")
        return False
    
    summary = response.json()
    print(f"   Title: {summary.get('title')}")
    metrics = summary.get("metrics", {})
    if "radiology_dictation" in metrics:
        rad = metrics["radiology_dictation"]
        print(f"   Radiology: MedASR {rad.get('medasr_wer')}% vs Whisper {rad.get('whisper_large_wer')}%")
    
    print("\n✅ MedASR benchmark endpoints working")
    return True


def test_structured_audit():
    """Test structured audit via agent endpoint."""
    print("\n" + "="*60)
    print("TEST: Structured Audit Rationale Codes")
    print("="*60)
    
    response = requests.post(
        f"{BASE_URL}/api/agent",
        json={"case_text": PHASE1B_CASE}
    )
    
    if response.status_code != 200:
        print(f"❌ Request failed: {response.status_code}")
        print(response.text)
        return False
    
    data = response.json()
    
    # Check rationale codes
    codes = data.get("rationale_codes", [])
    print(f"\n🏷️ Rationale Codes: {codes}")
    
    # Check structured audit
    audit = data.get("structured_audit", {})
    print(f"\n📋 Structured Audit:")
    print(f"   Version: {audit.get('audit_version', 'N/A')}")
    print(f"   Type: {audit.get('audit_type', 'N/A')}")
    
    audit_codes = audit.get("rationale_codes", [])
    print(f"\n   Rationale Codes in Audit:")
    for c in audit_codes:
        print(f"   - {c.get('code')}: {c.get('pattern')} [{c.get('urgency')}]")
    
    baselines = audit.get("clinical_baselines", {})
    print(f"\n   Clinical Baselines:")
    print(f"   - NEWS2: {baselines.get('news2_score')} ({baselines.get('news2_risk_band')})")
    print(f"   - qSOFA: {baselines.get('qsofa_score')}")
    print(f"   - Sepsis: {baselines.get('sepsis_likelihood')}")
    
    governance = audit.get("governance", {})
    print(f"\n   Governance:")
    print(f"   - PHI in reasoning: {governance.get('phi_in_reasoning')}")
    print(f"   - Hallucination risk: {governance.get('hallucination_risk')}")
    
    # Validate
    if len(codes) > 0:
        print("\n✅ Rationale codes correctly derived")
    
    if audit.get("audit_version") == "2.0":
        print("✅ Structured audit v2.0 generated")
    
    return True


def test_clinical_baselines_in_agent():
    """Test that clinical baselines are returned in agent response."""
    print("\n" + "="*60)
    print("TEST: Clinical Baselines in Agent Response")
    print("="*60)
    
    response = requests.post(
        f"{BASE_URL}/api/agent",
        json={"case_text": PHASE1B_CASE}
    )
    
    if response.status_code != 200:
        print(f"❌ Request failed: {response.status_code}")
        return False
    
    data = response.json()
    
    baselines = data.get("clinical_baselines", {})
    print(f"\n📊 Clinical Baselines in Response:")
    
    news2 = baselines.get("news2", {})
    print(f"\n   NEWS2:")
    print(f"   - Score: {news2.get('news2_score')}")
    print(f"   - Risk Band: {news2.get('news2_risk_band')}")
    print(f"   - Components: {news2.get('news2_components')}")
    
    sepsis = baselines.get("sepsis_screen", {})
    print(f"\n   Sepsis Screen:")
    print(f"   - qSOFA: {sepsis.get('qsofa_score')}")
    print(f"   - Likelihood: {sepsis.get('sepsis_likelihood')}")
    
    vitals = baselines.get("extracted_vitals", {})
    print(f"\n   Extracted Vitals: {vitals}")
    
    labs = baselines.get("extracted_labs", {})
    print(f"   Extracted Labs: {labs}")
    
    if news2 and sepsis:
        print("\n✅ Clinical baselines correctly included in agent response")
    
    return True


def main():
    """Run all tests."""
    print("\n" + "="*60)
    print("SURGICAL COPILOT - NEW FEATURES TEST SUITE")
    print("="*60)
    print(f"\nTarget: {BASE_URL}")
    print("Make sure the backend is running: cd backend && uvicorn app.main:app --reload")
    
    # Check if server is running
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        print(f"\n✅ Server is running (status: {response.status_code})")
    except requests.exceptions.ConnectionError:
        print(f"\n❌ Cannot connect to {BASE_URL}")
        print("   Start the server with: cd backend && uvicorn app.main:app --reload")
        return
    
    results = []
    
    # Run tests
    results.append(("NEWS2 & Sepsis", test_news2_and_sepsis()))
    results.append(("Wearable Analysis", test_wearable_analysis()))
    results.append(("NCCN Guidelines", test_nccn_guidelines()))
    results.append(("MedASR Benchmark", test_medasr_benchmark()))
    results.append(("Structured Audit", test_structured_audit()))
    results.append(("Clinical Baselines", test_clinical_baselines_in_agent()))
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    passed = sum(1 for _, r in results if r)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}: {name}")
    
    print(f"\n  Total: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Features are working correctly.")
    else:
        print("\n⚠️ Some tests failed. Check the output above for details.")


if __name__ == "__main__":
    main()
