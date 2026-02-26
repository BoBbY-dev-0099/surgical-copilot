from typing import Any, Dict, List

def normalize_analysis(phase: str, parsed: Dict[str, Any], raw_text: str = "") -> Dict[str, Any]:
    """
    Normalizes adapter-specific JSON into a standard UI-friendly shape.
    """
    if not isinstance(parsed, dict):
        parsed = {}
        
    # Standard defaults
    res = {
        "risk_level": "green",
        "decision": "",
        "red_flags": [],
        "sbar": {
            "situation": "",
            "background": "",
            "assessment": "",
            "recommendation": ""
        },
        "patient_next_steps": [],
        "clinician_summary": ""
    }

    if phase == "phase1b":
        # Phase 1B: label_class, trajectory, red_flag_triggered, red_flags
        decision = parsed.get("label_class", "watch_wait")
        res["decision"] = decision
        res["risk_level"] = "red" if decision == "operate_now" else "green"
        flags = parsed.get("red_flags", [])
        res["red_flags"] = flags if isinstance(flags, list) else ([flags] if flags else [])
        res["clinician_summary"] = f"Inpatient monitoring: {str(decision).replace('_', ' ').title()}. Trajectory is {parsed.get('trajectory', 'unknown')}."
        # SBAR will be populated by enrichment or left empty for manual review
        res["sbar"] = {
            "situation": "",
            "background": "",
            "assessment": "",
            "recommendation": ""
        }

    elif phase == "phase2":
        # Phase 2: risk_level (green/amber/red), risk_score, timeline_deviation, trigger_reason
        risk = parsed.get("risk_level", "green").lower()
        res["risk_level"] = risk
        flags = parsed.get("trigger_reason", [])
        res["red_flags"] = flags if isinstance(flags, list) else ([flags] if flags else [])
        res["decision"] = "clinician_review" if risk in ("amber", "red") else "safe_monitoring"
        
        res["clinician_summary"] = f"Post-discharge recovery: {risk.upper()} risk detected. Assessment: {parsed.get('timeline_deviation', 'none')}."
        
        # Robustly handle copilot_transfer being a dict or something else
        copilot_transfer = parsed.get("copilot_transfer", {})
        if not isinstance(copilot_transfer, dict):
            copilot_transfer = {}
            
        sbar_data = copilot_transfer.get("sbar", {})
        if isinstance(sbar_data, dict) and sbar_data:
            res["sbar"] = {
                "situation": sbar_data.get("situation", ""),
                "background": sbar_data.get("background", ""),
                "assessment": sbar_data.get("assessment", ""),
                "recommendation": sbar_data.get("recommendation", "")
            }
        else:
            res["sbar"] = {
                "situation": f"Phase 2 monitoring triggered {risk} risk.",
                "background": "Patient is in post-discharge recovery phase.",
                "assessment": f"Deviation detected: {parsed.get('timeline_deviation', 'none')}",
                "recommendation": "Follow up with patient via telehealth" if risk != "green" else "Maintain routine monitoring."
            }

    elif phase == "onc":
        # Onco: progression_status, risk_score, follow_up_months, send_to_oncologist
        status = parsed.get("progression_status", parsed.get("label_class", "stable_disease"))
        send_to_oncologist = parsed.get("send_to_oncologist", False)
        follow_up_months = parsed.get("follow_up_months", 3)
        
        # Derive urgency from follow_up_months and send_to_oncologist
        # 0-0.5 months = urgent, 1 month = soon, 3+ months = routine
        if follow_up_months <= 0.5 or status == "confirmed_progression":
            urgency = "urgent"
        elif follow_up_months <= 1 or status == "possible_progression" or send_to_oncologist:
            urgency = "soon"
        else:
            urgency = "routine"
        
        res["decision"] = status
        res["risk_level"] = "red" if urgency == "urgent" else ("amber" if urgency == "soon" else "green")
        flags = parsed.get("trigger_reason", [])
        res["red_flags"] = flags if isinstance(flags, list) else ([flags] if flags else [])
        res["clinician_summary"] = f"Oncology surveillance: {str(status).replace('_', ' ').title()} ({urgency} urgency)."
        
        # Handle SBAR - check top-level first, then copilot_transfer
        sbar_data = parsed.get("sbar", {})
        if not isinstance(sbar_data, dict) or not sbar_data:
            copilot_transfer = parsed.get("copilot_transfer", {})
            if isinstance(copilot_transfer, dict):
                sbar_data = copilot_transfer.get("sbar", {})
        
        if isinstance(sbar_data, dict) and sbar_data:
            res["sbar"] = {
                "situation": sbar_data.get("situation", ""),
                "background": sbar_data.get("background", ""),
                "assessment": sbar_data.get("assessment", ""),
                "recommendation": sbar_data.get("recommendation", "")
            }
        else:
            res["sbar"] = {
                "situation": f"Oncology follow-up shows {str(status).replace('_', ' ')}.",
                "background": "Patient undergoing long-term surveillance post-resection.",
                "assessment": f"Urgency flagged as {urgency}. RECIST: {parsed.get('recist_alignment', 'N/A')}.",
                "recommendation": "Urgent oncologist review and tumor board" if urgency == "urgent" else (
                    "Expedited follow-up imaging and oncology review" if urgency == "soon" else 
                    "Continue routine surveillance per NCCN guidelines."
                )
            }

    # ── Vision-Aware Risk Escalation ──────────────────────────────
    image_analysis = parsed.get("image_analysis")
    if isinstance(image_analysis, dict):
        res["image_analysis"] = image_analysis
        concern = image_analysis.get("concern_level", "").lower()
        if not concern:
            # Fallback for different key names
            concern = image_analysis.get("wound_status", "").lower()
            if concern in ("purulent", "dehisced"): concern = "high"
            elif concern == "erythematous": concern = "medium"
        
        # Risk escalation policy
        original_risk = res["risk_level"]
        if concern == "high" and res["risk_level"] != "red":
            res["risk_level"] = "red"
            res["vision_escalated"] = True
            res["red_flags"].append(f"Vision Escalation: {image_analysis.get('wound_status', 'High-concern')} features")
        elif concern == "medium" and res["risk_level"] == "green":
            res["risk_level"] = "amber"
            res["vision_escalated"] = True
            res["red_flags"].append("Vision Escalation: Moderate inflammatory features")
            
        if res.get("vision_escalated"):
            res["clinician_summary"] += f" (Risk escalated to {res['risk_level'].upper()} due to vision analysis findings)."

    # ── Preserve Enriched Narrative ─────────────────────────────
    if parsed.get("patient_message"):
        res["patient_message"] = parsed.get("patient_message")
    
    if parsed.get("clinical_explanation"):
        res["clinical_explanation"] = parsed.get("clinical_explanation")
    elif parsed.get("clinical_rationale"):
        res["clinical_explanation"] = parsed.get("clinical_rationale")

    if parsed.get("followup_questions"):
        res["followup_questions"] = parsed.get("followup_questions")

    return res
