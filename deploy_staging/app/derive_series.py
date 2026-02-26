"""
Build time-series from parsed note entries for a patient.

Given a list of parsed notes (from note_parser), produces:
  - vitals_series
  - labs_series
  - imaging_events
  - lesion_size_series
  - computed_red_flags_summary
"""

from __future__ import annotations

import json
from typing import Any


def build_series(notes: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Build time-series data from a list of note records.

    Each note record should have:
      - parsed_json: dict (output of note_parser.parse_note)
      - created_at: str (ISO timestamp)
    """
    vitals_series: list[dict[str, Any]] = []
    labs_series: list[dict[str, Any]] = []
    imaging_events: list[dict[str, Any]] = []
    lesion_size_series: list[dict[str, Any]] = []
    all_red_flags: list[str] = []

    for note in notes:
        parsed = note.get("parsed_json")
        if not parsed:
            continue
        if isinstance(parsed, str):
            try:
                parsed = json.loads(parsed)
            except Exception:
                continue

        date = parsed.get("date") or note.get("created_at", "")[:10]

        # Vitals
        vitals = parsed.get("vitals", {})
        if vitals:
            entry = {"date": date}
            for key in ("temp_c", "hr_bpm", "bp_sys", "bp_dia", "spo2_percent", "rr_bpm"):
                if key in vitals and vitals[key] is not None:
                    entry[key] = vitals[key]
            if len(entry) > 1:
                vitals_series.append(entry)

        # Labs
        labs = parsed.get("labs", {})
        if labs:
            entry = {"date": date}
            for key in ("wbc_k_ul", "crp_mg_l", "creatinine_mg_dl", "hgb_g_dl",
                        "lactate_mmol_l", "cea_ng_ml"):
                if key in labs and labs[key] is not None:
                    entry[key] = labs[key]
            if len(entry) > 1:
                labs_series.append(entry)

        # Imaging
        imaging = parsed.get("imaging", {})
        if imaging and imaging.get("modality"):
            event = {
                "date": date,
                "modality": imaging.get("modality"),
                "impression": imaging.get("impression", ""),
                "flags": imaging.get("flags", []),
            }
            if imaging.get("lesion_size_cm") is not None:
                event["lesion_size_cm"] = imaging["lesion_size_cm"]
                lesion_size_series.append({
                    "date": date,
                    "lesion_size_cm": imaging["lesion_size_cm"],
                })
            imaging_events.append(event)

        # Red flags
        rfs = parsed.get("red_flags", [])
        if rfs:
            all_red_flags.extend(rfs)

    # Deduplicate red flags while preserving order
    seen = set()
    unique_flags = []
    for f in all_red_flags:
        if f not in seen:
            seen.add(f)
            unique_flags.append(f)

    return {
        "vitals_series": vitals_series,
        "labs_series": labs_series,
        "imaging_events": imaging_events,
        "lesion_size_series": lesion_size_series,
        "computed_red_flags_summary": unique_flags,
    }
