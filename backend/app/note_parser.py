"""
Deterministic structured note parser.

Supports two note types:
  - INITIAL_INTAKE: patient baseline + imaging baseline
  - DAILY_UPDATE: vitals / labs / symptoms / imaging / red_flags

Format: section headers in square brackets, key:value lines.

Example:
    [DATE]
    2025-06-20

    [VITALS]
    temp_c: 38.1
    hr_bpm: 92
    bp: 128/78
    spo2_percent: 97

    [LABS]
    wbc_k_ul: 14.2
    crp_mg_l: 85
    creatinine_mg_dl: 1.4

    [IMAGING]
    modality: CT
    impression: 2cm perinephric collection, no free air
    lesion_size_cm: 2.0
    flags: abscess

    [SYMPTOMS]
    pain_score: 3
    nausea: false
    bowel_function: true

    [RED_FLAGS]
    imaging_abscess
    wbc_very_high
"""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

_SECTION_RE = re.compile(r"^\[([A-Z_]+)\]\s*$", re.MULTILINE)

_BOOL_TRUE = {"true", "yes", "1", "y"}
_BOOL_FALSE = {"false", "no", "0", "n"}

_NUMERIC_FIELDS = {
    "temp_c", "hr_bpm", "bp_sys", "bp_dia", "spo2_percent", "rr_bpm",
    "wbc_k_ul", "crp_mg_l", "creatinine_mg_dl", "hgb_g_dl", "lactate_mmol_l",
    "cea_ng_ml", "pain_score", "lesion_size_cm",
}


def _coerce_value(key: str, raw: str) -> Any:
    raw = raw.strip()
    low = raw.lower()
    if low in _BOOL_TRUE:
        return True
    if low in _BOOL_FALSE:
        return False
    if key in _NUMERIC_FIELDS:
        try:
            return float(raw)
        except ValueError:
            pass
    return raw


def _parse_bp(raw: str) -> dict[str, float | None]:
    """Parse '128/78' → {bp_sys: 128, bp_dia: 78}."""
    parts = raw.strip().split("/")
    result: dict[str, float | None] = {"bp_sys": None, "bp_dia": None}
    try:
        result["bp_sys"] = float(parts[0])
        if len(parts) > 1:
            result["bp_dia"] = float(parts[1])
    except (ValueError, IndexError):
        pass
    return result


def _parse_section_lines(lines: list[str]) -> dict[str, Any]:
    """Parse key:value lines within a section."""
    result: dict[str, Any] = {}
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if ":" in line:
            key, _, val = line.partition(":")
            key = key.strip().lower().replace(" ", "_")
            val = val.strip()
            if key == "bp":
                result.update(_parse_bp(val))
            elif key == "flags":
                result["flags"] = [f.strip() for f in val.split(",") if f.strip()]
            else:
                result[key] = _coerce_value(key, val)
        else:
            # Bare line (used in RED_FLAGS section)
            result.setdefault("_items", []).append(line)
    return result


def parse_note(note_text: str, note_type: str = "DAILY_UPDATE") -> dict[str, Any]:
    """
    Parse a structured note into a normalized dict.

    Returns:
        {
            date: str | None,
            vitals: {...},
            labs: {...},
            symptoms: {...},
            imaging: {modality, impression, lesion_size_cm?, flags[]},
            red_flags: [...],
            raw_sections: {section_name: {...}},
        }
    """
    sections: dict[str, list[str]] = {}
    current_section = "_PREAMBLE"
    sections[current_section] = []

    for line in note_text.split("\n"):
        m = _SECTION_RE.match(line.strip())
        if m:
            current_section = m.group(1)
            sections.setdefault(current_section, [])
        else:
            sections.setdefault(current_section, []).append(line)

    parsed_sections: dict[str, dict[str, Any]] = {}
    for name, lines in sections.items():
        if name == "_PREAMBLE":
            continue
        parsed_sections[name] = _parse_section_lines(lines)

    # Normalize into standard structure
    date_section = parsed_sections.get("DATE", {})
    date_val = date_section.get("_items", [None])
    date_str = date_val[0] if isinstance(date_val, list) and date_val else None
    if not date_str and "_items" not in date_section:
        for v in date_section.values():
            if isinstance(v, str) and re.match(r"\d{4}-\d{2}-\d{2}", v):
                date_str = v
                break

    vitals = parsed_sections.get("VITALS", {})
    vitals.pop("_items", None)

    labs = parsed_sections.get("LABS", {})
    labs.pop("_items", None)

    symptoms = parsed_sections.get("SYMPTOMS", {})
    symptoms.pop("_items", None)

    imaging_raw = parsed_sections.get("IMAGING", {})
    imaging = {
        "modality": imaging_raw.get("modality"),
        "impression": imaging_raw.get("impression"),
        "lesion_size_cm": imaging_raw.get("lesion_size_cm"),
        "flags": imaging_raw.get("flags", []),
    }

    red_flags_section = parsed_sections.get("RED_FLAGS", {})
    red_flags = red_flags_section.get("_items", [])

    result = {
        "date": date_str,
        "vitals": vitals,
        "labs": labs,
        "symptoms": symptoms,
        "imaging": imaging,
        "red_flags": red_flags,
        "raw_sections": parsed_sections,
    }

    # Validate minimums
    if note_type == "DAILY_UPDATE":
        has_data = any([vitals, labs, symptoms, imaging_raw.get("modality")])
        if not date_str and not has_data:
            logger.warning("DAILY_UPDATE note has no date and no data sections")

    return result


def generate_template(note_type: str = "DAILY_UPDATE") -> str:
    """Return a blank template string for the given note type."""
    if note_type == "INITIAL_INTAKE":
        return """[DATE]
YYYY-MM-DD

[VITALS]
temp_c:
hr_bpm:
bp: /
spo2_percent:

[LABS]
wbc_k_ul:
crp_mg_l:
creatinine_mg_dl:
hgb_g_dl:
lactate_mmol_l:

[IMAGING]
modality:
impression:
lesion_size_cm:
flags:

[SYMPTOMS]
pain_score:
nausea:
bowel_function:
appetite:
wound_concerns:
mobility:

[RED_FLAGS]
"""
    # DAILY_UPDATE
    return """[DATE]
YYYY-MM-DD

[VITALS]
temp_c:
hr_bpm:
bp: /
spo2_percent:

[LABS]
wbc_k_ul:
crp_mg_l:
creatinine_mg_dl:

[IMAGING]
modality:
impression:
lesion_size_cm:
flags:

[SYMPTOMS]
pain_score:
nausea:
bowel_function:

[RED_FLAGS]
"""
