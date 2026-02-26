"""
Deterministic risk rules and escalation triggers.

Computes risk_level (green/amber/red) from derived series data
using simple clinical thresholds. No ML/LLM needed.

Returns:
    {
        risk_level: "green" | "amber" | "red",
        triggers: [...],
        severity_recommended: "SEV3" | "SEV2" | "SEV1"
    }
"""

from __future__ import annotations

from typing import Any


def evaluate_risk(derived: dict[str, Any]) -> dict[str, Any]:
    """
    Evaluate risk from derived series data.

    Args:
        derived: output of derive_series.build_series(), containing
                 vitals_series, labs_series, imaging_events, lesion_size_series,
                 computed_red_flags_summary.
    """
    triggers: list[str] = []

    vitals = derived.get("vitals_series", [])
    labs = derived.get("labs_series", [])
    imaging = derived.get("imaging_events", [])
    lesion_sizes = derived.get("lesion_size_series", [])
    red_flags = derived.get("computed_red_flags_summary", [])

    # ── Vitals checks (use latest entry) ──
    if vitals:
        latest_v = vitals[-1]
        temp = latest_v.get("temp_c")
        hr = latest_v.get("hr_bpm")

        if temp is not None and temp >= 38.5:
            triggers.append("fever_high")
        elif temp is not None and temp >= 38.0:
            triggers.append("fever_low_grade")

        if hr is not None and hr >= 110:
            triggers.append("tachycardia")

        # Persistent fever: >=38.5 for >=2 consecutive entries
        if len(vitals) >= 2:
            recent_temps = [v.get("temp_c") for v in vitals[-3:] if v.get("temp_c") is not None]
            consecutive_fever = sum(1 for t in recent_temps if t >= 38.5)
            if consecutive_fever >= 2:
                triggers.append("fever_persistent_2d")

    # ── Labs checks (use latest + trend) ──
    if labs:
        latest_l = labs[-1]
        wbc = latest_l.get("wbc_k_ul")
        crp = latest_l.get("crp_mg_l")
        lactate = latest_l.get("lactate_mmol_l")

        if wbc is not None and wbc >= 15:
            triggers.append("wbc_very_high")
        elif wbc is not None and wbc >= 12:
            triggers.append("wbc_elevated")

        if crp is not None and crp >= 100:
            triggers.append("crp_very_high")
        elif crp is not None and crp >= 50:
            triggers.append("crp_elevated")

        if lactate is not None and lactate >= 2.0:
            triggers.append("lactate_elevated")

        # Rising WBC trend (last 2 entries)
        if len(labs) >= 2:
            prev_wbc = labs[-2].get("wbc_k_ul")
            if prev_wbc is not None and wbc is not None and wbc > prev_wbc + 2:
                triggers.append("wbc_rising")

            prev_crp = labs[-2].get("crp_mg_l")
            if prev_crp is not None and crp is not None and crp > prev_crp * 1.3:
                triggers.append("crp_rising")

    # ── Imaging flags ──
    if imaging:
        latest_img = imaging[-1]
        img_flags = latest_img.get("flags", [])
        for flag in img_flags:
            fl = flag.lower().replace(" ", "_")
            if fl in ("abscess", "imaging_abscess"):
                triggers.append("imaging_abscess")
            elif fl in ("free_air", "imaging_free_air", "pneumoperitoneum"):
                triggers.append("imaging_free_air")
            elif fl in ("leak", "anastomotic_leak"):
                triggers.append("imaging_leak")
            elif fl not in triggers:
                triggers.append(f"imaging_{fl}")

    # ── Lesion growth (oncology) ──
    if len(lesion_sizes) >= 2:
        first = lesion_sizes[0]
        last = lesion_sizes[-1]
        delta = (last.get("lesion_size_cm") or 0) - (first.get("lesion_size_cm") or 0)
        if delta >= 0.5:
            triggers.append("lesion_rapid_growth")
        elif delta >= 0.3:
            triggers.append("lesion_moderate_growth")

    # ── Symptoms (from red flags) ──
    for rf in red_flags:
        if rf not in triggers:
            triggers.append(rf)

    # ── Determine risk level ──
    red_triggers = {
        "fever_persistent_2d", "imaging_free_air", "imaging_leak",
        "lactate_elevated", "lesion_rapid_growth", "tachycardia",
    }
    amber_triggers = {
        "fever_high", "fever_low_grade", "wbc_very_high", "wbc_elevated",
        "crp_very_high", "crp_elevated", "wbc_rising", "crp_rising",
        "imaging_abscess", "lesion_moderate_growth",
    }

    has_red = any(t in red_triggers for t in triggers)
    has_amber = any(t in amber_triggers for t in triggers)

    # Multiple amber triggers escalate to red
    amber_count = sum(1 for t in triggers if t in amber_triggers)

    if has_red or amber_count >= 3:
        risk_level = "red"
    elif has_amber or amber_count >= 1:
        risk_level = "amber"
    else:
        risk_level = "green"

    # Severity mapping
    if risk_level == "red":
        severity = "SEV1"
    elif risk_level == "amber":
        severity = "SEV2"
    else:
        severity = "SEV3"

    return {
        "risk_level": risk_level,
        "triggers": triggers,
        "severity_recommended": severity,
    }
