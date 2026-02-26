"""
Surgical Copilot — SQLite persistence layer.

Tables: patients, notes, derived, alerts.
Uses a single DB file; falls back to :memory: if path is not writable.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_DB_PATH = os.getenv("SC_DB_PATH", str(Path(__file__).resolve().parent.parent / "data" / "sc.db"))
_conn: sqlite3.Connection | None = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uuid() -> str:
    return str(uuid.uuid4())


def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is not None:
        return _conn

    db_path = Path(_DB_PATH)
    try:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(str(db_path), check_same_thread=False)
    except OSError:
        logger.warning("Cannot write to %s — using in-memory DB", db_path)
        _conn = sqlite3.connect(":memory:", check_same_thread=False)

    _conn.row_factory = sqlite3.Row
    _conn.execute("PRAGMA journal_mode=WAL")
    _init_tables(_conn)
    _init_default_patients(_conn)  # Initialize default demo patients
    return _conn


def _init_tables(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS patients (
            id                      TEXT PRIMARY KEY,
            name                    TEXT NOT NULL,
            age_years               INTEGER,
            sex                     TEXT,
            pod                     INTEGER DEFAULT 0,
            phase                   TEXT DEFAULT 'phase1b',
            procedure_name          TEXT,
            indication              TEXT DEFAULT '',
            assigned_clinician_name TEXT DEFAULT '',
            clinician_phone         TEXT DEFAULT '',
            nurse_phone             TEXT DEFAULT '',
            latest_risk_level       TEXT DEFAULT 'green',
            latest_decision         TEXT DEFAULT '',
            created_at              TEXT NOT NULL,
            updated_at              TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notes (
            id          TEXT PRIMARY KEY,
            patient_id  TEXT NOT NULL REFERENCES patients(id),
            author_role TEXT DEFAULT 'doctor',
            note_type   TEXT NOT NULL,
            note_text   TEXT NOT NULL,
            parsed_json TEXT,
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS derived (
            id           TEXT PRIMARY KEY,
            patient_id   TEXT NOT NULL REFERENCES patients(id),
            derived_json TEXT NOT NULL,
            updated_at   TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS alerts (
            id            TEXT PRIMARY KEY,
            patient_id    TEXT NOT NULL REFERENCES patients(id),
            severity      TEXT NOT NULL,
            kind          TEXT DEFAULT '',
            message       TEXT NOT NULL,
            channels_sent TEXT DEFAULT '[]',
            created_at    TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS checkins (
            id          TEXT PRIMARY KEY,
            patient_id  TEXT NOT NULL REFERENCES patients(id),
            raw_input   TEXT NOT NULL,
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS analysis_results (
            id                  TEXT PRIMARY KEY,
            checkin_id          TEXT NOT NULL REFERENCES checkins(id),
            phase               TEXT NOT NULL,
            wrapper_json        TEXT NOT NULL,
            parsed_data         TEXT NOT NULL,
            risk_level          TEXT NOT NULL,
            red_flags           TEXT NOT NULL,
            sbar_json           TEXT NOT NULL,
            clinician_summary   TEXT DEFAULT '',
            created_at          TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id          TEXT PRIMARY KEY,
            patient_id  TEXT NOT NULL REFERENCES patients(id),
            checkin_id  TEXT NOT NULL REFERENCES checkins(id),
            risk_level  TEXT NOT NULL,
            message     TEXT NOT NULL,
            read        INTEGER DEFAULT 0,
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS hitl_decisions (
            id              TEXT PRIMARY KEY,
            patient_id      TEXT NOT NULL REFERENCES patients(id),
            analysis_id     TEXT REFERENCES analysis_results(id),
            decision        TEXT NOT NULL,
            clinician_id    TEXT DEFAULT '',
            clinician_name  TEXT DEFAULT '',
            rationale       TEXT DEFAULT '',
            original_risk   TEXT NOT NULL,
            override_risk   TEXT,
            created_at      TEXT NOT NULL
        );
    """)
    conn.commit()


# ── Patient CRUD ──────────────────────────────────────────────────

def create_patient(
    name: str,
    age_years: int | None = None,
    sex: str = "",
    pod: int = 0,
    phase: str = "phase1b",
    procedure_name: str = "",
    indication: str = "",
    clinician_name: str = "",
    clinician_phone: str = "",
    nurse_phone: str = "",
    latest_risk_level: str = "green",
    latest_decision: str = "",
) -> dict[str, Any]:
    conn = get_conn()
    pid = f"PT-{datetime.now(timezone.utc).strftime('%Y')}-{uuid.uuid4().hex[:5].upper()}"
    now = _now_iso()
    conn.execute(
        """INSERT INTO patients
           (id, name, age_years, sex, pod, phase, procedure_name, indication,
            assigned_clinician_name, clinician_phone, nurse_phone, 
            latest_risk_level, latest_decision, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (pid, name, age_years, sex, pod, phase, procedure_name, indication,
         clinician_name, clinician_phone, nurse_phone, 
         latest_risk_level, latest_decision, now, now),
    )
    conn.commit()
    return get_patient(pid)


def list_patients() -> list[dict[str, Any]]:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM patients ORDER BY updated_at DESC").fetchall()
    patients = []
    for r in rows:
        p = dict(r)
        latest_risk = _latest_risk(p["id"])
        p["risk"] = latest_risk
        p["alert_count"] = _alert_count(p["id"])
        patients.append(p)
    return patients


def delete_patient(pid: str) -> bool:
    conn = get_conn()
    try:
        # Delete related records first (cascading deletes for some, manual for others)
        conn.execute("DELETE FROM notifications WHERE patient_id=?", (pid,))
        conn.execute("DELETE FROM hitl_decisions WHERE patient_id=?", (pid,))
        conn.execute("DELETE FROM alerts WHERE patient_id=?", (pid,))
        conn.execute("DELETE FROM derived WHERE patient_id=?", (pid,))
        conn.execute("DELETE FROM notes WHERE patient_id=?", (pid,))
        
        # Delete analysis results related to this patient's checkins
        conn.execute(
            "DELETE FROM analysis_results WHERE checkin_id IN (SELECT id FROM checkins WHERE patient_id=?)",
            (pid,)
        )
        conn.execute("DELETE FROM checkins WHERE patient_id=?", (pid,))
        
        # Finally delete the patient
        cursor = conn.execute("DELETE FROM patients WHERE id=?", (pid,))
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        logger.error("Failed to delete patient %s: %s", pid, e)
        conn.rollback()
        return False


def get_patient(pid: str) -> dict[str, Any] | None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM patients WHERE id=?", (pid,)).fetchone()
    if not row:
        return None
    p = dict(row)
    p["risk"] = _latest_risk(pid)
    p["alert_count"] = _alert_count(pid)
    return p


def update_patient_status(pid: str, risk_level: str, decision: str = "") -> None:
    conn = get_conn()
    now = _now_iso()
    conn.execute(
        "UPDATE patients SET latest_risk_level=?, latest_decision=?, updated_at=? WHERE id=?",
        (risk_level, decision, now, pid)
    )
    conn.commit()


def _latest_risk(pid: str) -> str:
    conn = get_conn()
    row = conn.execute(
        "SELECT derived_json FROM derived WHERE patient_id=? ORDER BY updated_at DESC LIMIT 1",
        (pid,),
    ).fetchone()
    if row:
        try:
            d = json.loads(row["derived_json"])
            return d.get("risk_eval", {}).get("risk_level", "green")
        except Exception:
            pass
    return "green"


def _alert_count(pid: str) -> int:
    conn = get_conn()
    row = conn.execute("SELECT COUNT(*) as c FROM alerts WHERE patient_id=?", (pid,)).fetchone()
    return row["c"] if row else 0


# ── Notes ─────────────────────────────────────────────────────────

def add_note(
    patient_id: str,
    note_text: str,
    note_type: str = "DAILY_UPDATE",
    author_role: str = "doctor",
    parsed_json: dict | None = None,
) -> dict[str, Any]:
    conn = get_conn()
    nid = _uuid()
    now = _now_iso()
    conn.execute(
        "INSERT INTO notes (id, patient_id, author_role, note_type, note_text, parsed_json, created_at) VALUES (?,?,?,?,?,?,?)",
        (nid, patient_id, author_role, note_type, note_text,
         json.dumps(parsed_json) if parsed_json else None, now),
    )
    conn.execute("UPDATE patients SET updated_at=? WHERE id=?", (now, patient_id))
    conn.commit()
    return {"id": nid, "patient_id": patient_id, "note_type": note_type, "created_at": now}


def get_notes(patient_id: str) -> list[dict[str, Any]]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM notes WHERE patient_id=? ORDER BY created_at ASC", (patient_id,)
    ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        if d.get("parsed_json"):
            try:
                d["parsed_json"] = json.loads(d["parsed_json"])
            except Exception:
                pass
        result.append(d)
    return result


# ── Derived ───────────────────────────────────────────────────────

def save_derived(patient_id: str, derived: dict[str, Any]) -> None:
    conn = get_conn()
    did = _uuid()
    now = _now_iso()
    conn.execute(
        "INSERT INTO derived (id, patient_id, derived_json, updated_at) VALUES (?,?,?,?)",
        (did, patient_id, json.dumps(derived), now),
    )
    conn.commit()


def get_latest_derived(patient_id: str) -> dict[str, Any] | None:
    conn = get_conn()
    row = conn.execute(
        "SELECT derived_json FROM derived WHERE patient_id=? ORDER BY updated_at DESC LIMIT 1",
        (patient_id,),
    ).fetchone()
    if row:
        try:
            return json.loads(row["derived_json"])
        except Exception:
            pass
    return None


# ── Alerts ────────────────────────────────────────────────────────

def create_alert(
    patient_id: str,
    severity: str,
    kind: str,
    message: str,
    channels_sent: list[str] | None = None,
) -> dict[str, Any]:
    conn = get_conn()
    aid = _uuid()
    now = _now_iso()
    conn.execute(
        "INSERT INTO alerts (id, patient_id, severity, kind, message, channels_sent, created_at) VALUES (?,?,?,?,?,?,?)",
        (aid, patient_id, severity, kind, message,
         json.dumps(channels_sent or []), now),
    )
    conn.commit()
    return {"id": aid, "patient_id": patient_id, "severity": severity, "kind": kind,
            "message": message, "channels_sent": channels_sent or [], "created_at": now}


def get_alerts(patient_id: str) -> list[dict[str, Any]]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM alerts WHERE patient_id=? ORDER BY created_at DESC", (patient_id,)
    ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        try:
            d["channels_sent"] = json.loads(d["channels_sent"])
        except Exception:
            d["channels_sent"] = []
        result.append(d)
    return result


# ── Demo / v1 Logic ───────────────────────────────────────────────

def reset_db() -> None:
    conn = get_conn()
    conn.executescript("""
        DROP TABLE IF EXISTS notifications;
        DROP TABLE IF EXISTS analysis_results;
        DROP TABLE IF EXISTS checkins;
        DROP TABLE IF EXISTS alerts;
        DROP TABLE IF EXISTS derived;
        DROP TABLE IF EXISTS notes;
        DROP TABLE IF EXISTS patients;
    """)
    _init_tables(conn)
    conn.commit()


def add_checkin(patient_id: str, raw_input: dict) -> dict[str, Any]:
    conn = get_conn()
    cid = _uuid()
    now = _now_iso()
    conn.execute(
        "INSERT INTO checkins (id, patient_id, raw_input, created_at) VALUES (?,?,?,?)",
        (cid, patient_id, json.dumps(raw_input), now)
    )
    conn.commit()
    return {"id": cid, "patient_id": patient_id, "created_at": now}


def get_checkins(patient_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT c.*, a.wrapper_json, a.parsed_data, a.risk_level, a.red_flags, a.sbar_json, a.clinician_summary "
        "FROM checkins c LEFT JOIN analysis_results a ON c.id = a.checkin_id "
        "WHERE c.patient_id=? ORDER BY c.created_at DESC",
        (patient_id,)
    ).fetchall()
    res = []
    for r in rows:
        d = dict(r)
        d["raw_input"] = json.loads(d["raw_input"])
        if d.get("wrapper_json"):
            d["wrapper"] = json.loads(d["wrapper_json"])
            d["parsed"] = json.loads(d["parsed_data"])
            d["red_flags"] = json.loads(d["red_flags"])
            d["sbar"] = json.loads(d["sbar_json"])
            # clinician_summary is already a string in the row
        res.append(d)
    return res


def save_analysis(
    checkin_id: str,
    phase: str,
    wrapper: dict,
    parsed: dict,
    risk_level: str,
    red_flags: list[str],
    sbar: dict,
    clinician_summary: str = ""
) -> None:
    conn = get_conn()
    rid = _uuid()
    now = _now_iso()
    conn.execute(
        """INSERT INTO analysis_results 
           (id, checkin_id, phase, wrapper_json, parsed_data, risk_level, red_flags, sbar_json, clinician_summary, created_at) 
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (rid, checkin_id, phase, json.dumps(wrapper), json.dumps(parsed),
         risk_level, json.dumps(red_flags), json.dumps(sbar), clinician_summary, now)
    )
    conn.commit()


def create_notification(patient_id: str, checkin_id: str, risk_level: str, message: str) -> None:
    conn = get_conn()
    nid = _uuid()
    now = _now_iso()
    conn.execute(
        "INSERT INTO notifications (id, patient_id, checkin_id, risk_level, message, created_at) VALUES (?,?,?,?,?,?)",
        (nid, patient_id, checkin_id, risk_level, message, now)
    )
    conn.commit()


def list_notifications(limit: int = 20) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT n.*, p.name as patient_name FROM notifications n JOIN patients p ON n.patient_id = p.id ORDER BY n.created_at DESC LIMIT ?",
        (limit,)
    ).fetchall()
    return [dict(r) for r in rows]


def mark_notification_read(nid: str) -> None:
    conn = get_conn()
    conn.execute("UPDATE notifications SET read=1 WHERE id=?", (nid,))
    conn.commit()


def seed_demo_data() -> None:
    """Seed rich clinical demo patients if they haven't been seeded yet."""
    conn = get_conn()
    # Guard: only seed if DEMO-SEED- patients don't exist yet
    existing = conn.execute(
        "SELECT COUNT(*) FROM patients WHERE id LIKE 'DEMO-SEED-%'"
    ).fetchone()[0]
    if existing > 0:
        return  # Already seeded

    logger.info("Seeding clinical demo data...")
    now = _now_iso()

    # ──────────────────────────────────────────────────────────────
    # 1. Phase 1B — RED: Post-nephrectomy deterioration
    # ──────────────────────────────────────────────────────────────
    p1_id = "DEMO-SEED-PH1B-001"
    conn.execute(
        """INSERT INTO patients
           (id, name, age_years, sex, pod, phase, procedure_name, indication,
            assigned_clinician_name, clinician_phone, nurse_phone,
            latest_risk_level, latest_decision, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (p1_id, "Sarah Martinez", 67, "F", 2, "phase1b",
         "Robotic Partial Right Nephrectomy",
         "3.2 cm right renal cell carcinoma (cT1b)",
         "Dr. R. Thompson", "+1-555-0191", "+1-555-0192",
         "red", "operate_now", now, now),
    )
    # Pre-seed a checkin for patient 1
    c1_id = _uuid()
    raw1 = json.dumps({
        "pain_score": 7, "temp_c": 38.9, "hr": 112, "bp": "98/64",
        "rr": 24, "spo2": 96, "wbc": 18.2, "crp": 142, "lactate": 2.4,
        "wound_status": "erythema and induration at port site",
        "mobility": "bed-bound", "urine_output_ml_hr": 18,
        "notes": "Patient reports worsening abdominal pain and chills since midnight."
    })
    conn.execute(
        "INSERT INTO checkins (id, patient_id, raw_input, created_at) VALUES (?,?,?,?)",
        (c1_id, p1_id, raw1, now)
    )
    sbar1 = {
        "situation": "URGENT: 67F POD2 post robotic partial nephrectomy — deteriorating with fever, tachycardia, rising WBC. NEWS2=7.",
        "background": "Robotic-assisted partial right nephrectomy for 3.2cm renal mass. PMH HTN, T2DM. Now POD2 with worsening clinical picture over 6 hours.",
        "assessment": "Temp 38.9°C, HR 112, BP 98/64, RR 24, SpO2 96% on 2L NC. WBC 18.2, CRP 142, Lactate 2.4. Wound erythema and induration. qSOFA 2.",
        "recommendation": "Urgent bedside review. CT abdomen/pelvis. Blood cultures × 2. IV antibiotics per local protocol. Consider ICU if haemodynamics don't stabilise within 1 hour."
    }
    conn.execute(
        """INSERT INTO analysis_results
           (id, checkin_id, phase, wrapper_json, parsed_data, risk_level, red_flags, sbar_json, clinician_summary, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (_uuid(), c1_id, "phase1b",
         json.dumps({"fallback_used": True, "mode": "demo"}),
         json.dumps({"label_class": "operate_now", "trajectory": "deteriorating", "red_flag_triggered": True,
                     "red_flags": ["fever_high", "tachycardia", "elevated_wbc", "wound_erythema"],
                     "confidence": 0.91, "news2": {"news2_score": 7, "news2_risk_band": "high"}}),
         "red",
         json.dumps(["fever_high", "tachycardia", "elevated_wbc", "wound_erythema"]),
         json.dumps(sbar1),
         "Urgent escalation — NEWS2=7, qSOFA 2. Sepsis protocol activated. Surgical registrar notified.",
         now)
    )
    conn.execute(
        "INSERT INTO notifications (id, patient_id, checkin_id, risk_level, message, read, created_at) VALUES (?,?,?,?,?,?,?)",
        (_uuid(), p1_id, c1_id, "red",
         "🔴 URGENT: Sarah Martinez — NEWS2=7, qSOFA 2. Sepsis protocol. Immediate surgical review required.",
         0, now)
    )
    conn.execute(
        "UPDATE patients SET latest_risk_level='red', latest_decision='operate_now', updated_at=? WHERE id=?",
        (now, p1_id)
    )

    # ──────────────────────────────────────────────────────────────
    # 2. Phase 2 — AMBER: Post-discharge wound infection concern
    # ──────────────────────────────────────────────────────────────
    p2_id = "DEMO-SEED-PH2-001"
    conn.execute(
        """INSERT INTO patients
           (id, name, age_years, sex, pod, phase, procedure_name, indication,
            assigned_clinician_name, clinician_phone, nurse_phone,
            latest_risk_level, latest_decision, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (p2_id, "John Chen", 58, "M", 4, "phase2",
         "Laparoscopic Sigmoid Resection",
         "Diverticulitis (Hinchey II) with pericolic abscess",
         "Dr. A. Williams", "+1-555-0291", "+1-555-0292",
         "amber", "watch_wait", now, now),
    )
    c2_id = _uuid()
    raw2 = json.dumps({
        "pain_score": 3, "temp": 38.1, "wound_status": "erythema left port site no discharge",
        "bowel_function": "passing flatus", "mobility": "mobilising short distances",
        "appetite": "reduced", "nausea": False,
        "notes": "Noticed redness around wound this morning. Low temp."
    })
    conn.execute(
        "INSERT INTO checkins (id, patient_id, raw_input, created_at) VALUES (?,?,?,?)",
        (c2_id, p2_id, raw2, now)
    )
    sbar2 = {
        "situation": "AMBER: 58M POD4 post sigmoid resection — low-grade fever, wound erythema, reduced mobility. Risk score 0.54.",
        "background": "Laparoscopic sigmoid resection for Hinchey II diverticulitis. Discharged POD2. Check-in via app POD4.",
        "assessment": "Self-reported Temp 38.1°C, Pain 3/10, wound erythema at left port site (no discharge reported). Bowel function returned. Mobility limited to <100m. Risk score 0.54 (AMBER).",
        "recommendation": "Telephone review by surgical nurse today. Arrange wound check (community nurse or GP same-day). Return if Temp >38.5°C, wound discharge, severe abdominal pain."
    }
    conn.execute(
        """INSERT INTO analysis_results
           (id, checkin_id, phase, wrapper_json, parsed_data, risk_level, red_flags, sbar_json, clinician_summary, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (_uuid(), c2_id, "phase2",
         json.dumps({"fallback_used": True, "mode": "demo"}),
         json.dumps({"risk_level": "amber", "risk_score": 0.54, "trajectory": "stable",
                     "red_flag_triggered": True, "timeline_deviation": "mild",
                     "trigger_reason": ["low_grade_fever", "wound_redness", "reduced_mobility"]}),
         "amber",
         json.dumps(["low_grade_fever", "wound_erythema"]),
         json.dumps(sbar2),
         "AMBER — wound check required within 24 hours. Nurse telephone review arranged.",
         now)
    )
    conn.execute(
        "INSERT INTO notifications (id, patient_id, checkin_id, risk_level, message, read, created_at) VALUES (?,?,?,?,?,?,?)",
        (_uuid(), p2_id, c2_id, "amber",
         "🟡 AMBER: John Chen (POD4) — low-grade fever, wound erythema. Clinical review recommended within 24 h.",
         0, now)
    )
    conn.execute(
        "UPDATE patients SET latest_risk_level='amber', latest_decision='watch_wait', updated_at=? WHERE id=?",
        (now, p2_id)
    )

    # ──────────────────────────────────────────────────────────────
    # 3. Onco — AMBER: Rising CEA, query peritoneal deposit
    # ──────────────────────────────────────────────────────────────
    p3_id = "DEMO-SEED-ONC-001"
    conn.execute(
        """INSERT INTO patients
           (id, name, age_years, sex, pod, phase, procedure_name, indication,
            assigned_clinician_name, clinician_phone, nurse_phone,
            latest_risk_level, latest_decision, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (p3_id, "Maria Rodriguez", 62, "F", 0, "onc",
         "Laparoscopic Sigmoid Colectomy (Jan 2024)",
         "Adenocarcinoma pT3N0M0 Stage IIB (MSI-H)",
         "Dr. S. Johnson", "+1-555-0391", "+1-555-0392",
         "amber", "partial_response", now, now),
    )
    c3_id = _uuid()
    raw3 = json.dumps({
        "cea_current": 9.3, "cea_prev": [2.1, 4.8],
        "ecog": 1, "fatigue": "mild", "weight_loss_kg": 1.5,
        "imaging": "CT: 8mm soft tissue deposit pouch of Douglas — uncertain significance",
        "symptoms": "mild fatigue, no PR bleeding, no abdominal pain",
        "colonoscopy_due": "1 year (scheduled)"
    })
    conn.execute(
        "INSERT INTO checkins (id, patient_id, raw_input, created_at) VALUES (?,?,?,?)",
        (c3_id, p3_id, raw3, now)
    )
    sbar3 = {
        "situation": "AMBER: 62F — 18 months post sigmoid colectomy. CEA rising over 3 readings (2.1→4.8→9.3). Query peritoneal deposit on CT. Oncology MDT review recommended within 2 weeks.",
        "background": "Laparoscopic sigmoid colectomy Jan 2024 for pT3N0M0 Stage IIB adenocarcinoma (MSI-H). No adjuvant chemo. NCCN surveillance. ECOG upgraded 0→1.",
        "assessment": "CEA doubling time ~90 days. 8mm peritoneal deposit pouch of Douglas — not RECIST progression but concerning alongside CEA trend. ECOG 1, mild fatigue, no PR bleeding.",
        "recommendation": "Oncology MDT within 2 weeks. PET-CT to characterise peritoneal focus. Repeat CEA in 4 weeks. Repeat CT in 6 weeks. Colonoscopy (1-year) confirmed."
    }
    conn.execute(
        """INSERT INTO analysis_results
           (id, checkin_id, phase, wrapper_json, parsed_data, risk_level, red_flags, sbar_json, clinician_summary, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (_uuid(), c3_id, "onc",
         json.dumps({"fallback_used": True, "mode": "demo"}),
         json.dumps({"progression_status": "partial_response", "risk_score": 0.47, "urgency": "soon",
                     "send_to_oncologist": True, "cea_assessment": "rising",
                     "trigger_reason": ["cea_rising_3_consecutive", "patient_fatigue_reported", "query_peritoneal_deposit_ct"]}),
         "amber",
         json.dumps(["cea_rising_3_consecutive", "query_peritoneal_deposit"]),
         json.dumps(sbar3),
         "AMBER — CEA rising (3 consecutive readings). Peritoneal deposit on CT. MDT review within 2 weeks.",
         now)
    )
    conn.execute(
        "INSERT INTO notifications (id, patient_id, checkin_id, risk_level, message, read, created_at) VALUES (?,?,?,?,?,?,?)",
        (_uuid(), p3_id, c3_id, "amber",
         "🟡 AMBER: Maria Rodriguez — CEA 9.3 (rising trend). Query peritoneal deposit. Oncology MDT review required.",
         0, now)
    )
    conn.execute(
        "UPDATE patients SET latest_risk_level='amber', latest_decision='partial_response', updated_at=? WHERE id=?",
        (now, p3_id)
    )

    conn.commit()
    logger.info("Demo seed complete: 3 clinical patients created with pre-seeded analysis data.")




# ── HITL (Human-in-the-Loop) Decisions ─────────────────────────────

def create_hitl_decision(
    patient_id: str,
    decision: str,
    original_risk: str,
    analysis_id: str = "",
    clinician_id: str = "",
    clinician_name: str = "",
    rationale: str = "",
    override_risk: str = None,
) -> dict[str, Any]:
    """
    Record a HITL decision (approve/reject/override).
    
    Args:
        patient_id: Patient ID
        decision: One of 'approve', 'reject', 'override'
        original_risk: The AI-predicted risk level
        analysis_id: Optional reference to the analysis being reviewed
        clinician_id: ID of the clinician making the decision
        clinician_name: Name of the clinician
        rationale: Free-text explanation for the decision
        override_risk: If decision is 'override', the new risk level
    """
    conn = get_conn()
    hid = _uuid()
    now = _now_iso()
    
    conn.execute(
        """INSERT INTO hitl_decisions 
           (id, patient_id, analysis_id, decision, clinician_id, clinician_name, 
            rationale, original_risk, override_risk, created_at) 
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (hid, patient_id, analysis_id, decision, clinician_id, clinician_name,
         rationale, original_risk, override_risk, now)
    )
    
    # If override, update patient's risk level
    if decision == "override" and override_risk:
        update_patient_status(patient_id, override_risk, "")
    
    conn.commit()
    return get_hitl_decision(hid)


def get_hitl_decision(hid: str) -> dict[str, Any] | None:
    """Get a single HITL decision by ID."""
    conn = get_conn()
    row = conn.execute("SELECT * FROM hitl_decisions WHERE id=?", (hid,)).fetchone()
    return dict(row) if row else None


def list_hitl_decisions(patient_id: str = None, limit: int = 50) -> list[dict[str, Any]]:
    """List HITL decisions, optionally filtered by patient."""
    conn = get_conn()
    if patient_id:
        rows = conn.execute(
            """SELECT h.*, p.name as patient_name 
               FROM hitl_decisions h 
               JOIN patients p ON h.patient_id = p.id 
               WHERE h.patient_id = ?
               ORDER BY h.created_at DESC LIMIT ?""",
            (patient_id, limit)
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT h.*, p.name as patient_name 
               FROM hitl_decisions h 
               JOIN patients p ON h.patient_id = p.id 
               ORDER BY h.created_at DESC LIMIT ?""",
            (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def get_hitl_stats() -> dict[str, Any]:
    """Get aggregate HITL statistics."""
    conn = get_conn()
    
    total = conn.execute("SELECT COUNT(*) FROM hitl_decisions").fetchone()[0]
    approved = conn.execute("SELECT COUNT(*) FROM hitl_decisions WHERE decision='approve'").fetchone()[0]
    rejected = conn.execute("SELECT COUNT(*) FROM hitl_decisions WHERE decision='reject'").fetchone()[0]
    overridden = conn.execute("SELECT COUNT(*) FROM hitl_decisions WHERE decision='override'").fetchone()[0]
    
    return {
        "total_decisions": total,
        "approved": approved,
        "rejected": rejected,
        "overridden": overridden,
        "approval_rate": approved / total if total > 0 else 0,
        "override_rate": overridden / total if total > 0 else 0,
    }


def _init_default_patients(conn: sqlite3.Connection) -> None:
    """Create default demo patients if they don't exist."""
    # Check if default patients already exist
    existing = conn.execute("SELECT COUNT(*) FROM patients WHERE id LIKE 'DEFAULT-%'").fetchone()[0]
    if existing > 0:
        return  # Already initialized
    
    logger.info("Initializing default demo patients...")
    now = _now_iso()
    
    default_patients = [
        ("DEFAULT-PH1B-001", "Sarah Martinez", 67, "F", 2, "phase1b", "Robotic partial nephrectomy", 
         "Renal cell carcinoma", "Dr. Thompson", "+1-555-0101", "+1-555-0102", "red", "Urgent surgical review"),
        ("DEFAULT-PH2-001", "John Chen", 58, "M", 4, "phase2", "Sigmoid resection", 
         "Diverticulitis (Hinchey II)", "Dr. Williams", "+1-555-0201", "+1-555-0202", "amber", "Increased surveillance"),
        ("DEFAULT-ONC-001", "Maria Rodriguez", 62, "F", 0, "onc", "Sigmoid colon resection", 
         "Adenocarcinoma Stage IIB", "Dr. Johnson", "+1-555-0301", "+1-555-0302", "amber", "Possible progression"),
    ]
    
    for patient_data in default_patients:
        try:
            conn.execute(
                """INSERT INTO patients
                   (id, name, age_years, sex, pod, phase, procedure_name, indication,
                    assigned_clinician_name, clinician_phone, nurse_phone,
                    latest_risk_level, latest_decision, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (*patient_data, now, now)
            )
        except sqlite3.IntegrityError:
            # Patient already exists
            pass
    
    conn.commit()
    logger.info("Default patients initialized: 3 patients created")

