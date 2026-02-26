"""
Deterministic case_text builder for adapter input.

Converts the last N days of patient data into a clean text summary
that serves as stable input for Phase1B / Phase2 / Onc adapters.
"""

from __future__ import annotations

from typing import Any


def build_case_text(
    patient: dict[str, Any],
    derived: dict[str, Any],
    risk_eval: dict[str, Any] | None = None,
    max_days: int = 7,
) -> str:
    """
    Build a deterministic case_text string from patient + derived data.

    Args:
        patient: patient record dict
        derived: output of derive_series.build_series()
        risk_eval: output of risk_rules.evaluate_risk() (optional)
        max_days: max number of recent entries to include
    """
    lines: list[str] = []

    # Patient summary
    age = patient.get("age_years", "?")
    sex = patient.get("sex", "?")
    procedure = patient.get("procedure_name", "Unknown procedure")
    indication = patient.get("indication", "")
    phase = patient.get("phase", "phase1b")

    lines.append(f"{age}{sex}, {procedure}.")
    if indication:
        lines.append(f"Indication: {indication}.")
    lines.append(f"Phase: {phase}.")
    lines.append("")

    # Vitals trend table
    vitals = derived.get("vitals_series", [])[-max_days:]
    if vitals:
        lines.append("VITALS TREND:")
        lines.append("Date       | Temp°C | HR  | BP        | SpO2")
        for v in vitals:
            date = v.get("date", "?")
            temp = v.get("temp_c", "-")
            hr = v.get("hr_bpm", "-")
            bp_s = v.get("bp_sys", "-")
            bp_d = v.get("bp_dia", "-")
            bp = f"{bp_s}/{bp_d}" if bp_s != "-" else "-"
            spo2 = v.get("spo2_percent", "-")
            lines.append(f"{date:10} | {str(temp):6} | {str(hr):3} | {bp:9} | {str(spo2)}")
        lines.append("")

    # Labs trend table
    labs = derived.get("labs_series", [])[-max_days:]
    if labs:
        lines.append("LABS TREND:")
        lines.append("Date       | WBC   | CRP   | Cr    | Hgb   | Lactate")
        for l in labs:
            date = l.get("date", "?")
            wbc = l.get("wbc_k_ul", "-")
            crp = l.get("crp_mg_l", "-")
            cr = l.get("creatinine_mg_dl", "-")
            hgb = l.get("hgb_g_dl", "-")
            lac = l.get("lactate_mmol_l", "-")
            lines.append(f"{date:10} | {str(wbc):5} | {str(crp):5} | {str(cr):5} | {str(hgb):5} | {str(lac)}")
        lines.append("")

    # Most recent imaging
    imaging = derived.get("imaging_events", [])
    if imaging:
        latest = imaging[-1]
        lines.append("MOST RECENT IMAGING:")
        lines.append(f"  Date: {latest.get('date', '?')}")
        lines.append(f"  Modality: {latest.get('modality', '?')}")
        lines.append(f"  Impression: {latest.get('impression', 'N/A')}")
        if latest.get("lesion_size_cm") is not None:
            lines.append(f"  Lesion size: {latest['lesion_size_cm']} cm")
        if latest.get("flags"):
            lines.append(f"  Flags: {', '.join(latest['flags'])}")
        lines.append("")

    # Lesion size trend
    lesion = derived.get("lesion_size_series", [])
    if len(lesion) >= 2:
        first = lesion[0]
        last = lesion[-1]
        delta = (last.get("lesion_size_cm") or 0) - (first.get("lesion_size_cm") or 0)
        direction = "growing" if delta > 0 else "shrinking" if delta < 0 else "stable"
        lines.append(f"LESION TREND: {first.get('lesion_size_cm')} cm → {last.get('lesion_size_cm')} cm ({direction}, Δ{delta:+.1f} cm)")
        lines.append("")

    # Red flags + symptoms
    red_flags = derived.get("computed_red_flags_summary", [])
    if red_flags:
        lines.append(f"RED FLAGS: {', '.join(red_flags)}")
        lines.append("")

    # Risk evaluation
    if risk_eval:
        lines.append(f"COMPUTED RISK: {risk_eval.get('risk_level', '?').upper()}")
        triggers = risk_eval.get("triggers", [])
        if triggers:
            lines.append(f"TRIGGERS: {', '.join(triggers)}")
        lines.append("")

    return "\n".join(lines).strip()
