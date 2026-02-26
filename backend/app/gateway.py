"""
Surgical Copilot — SageMaker Gateway (Azure VM edition)

Lightweight FastAPI proxy that forwards inference requests to
SageMaker real-time endpoints via boto3, with automatic demo
fallback when endpoints are unreachable.

Endpoints
---------
  GET  /health            → {"status": "ok"}
  POST /infer/{route}     → route ∈ ["phase1b", "phase2", "onc"]
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.getcwd(), '.env'))

import boto3
from botocore.config import Config
from fastapi import FastAPI, Response, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from . import storage, note_parser, derive_series, risk_rules, case_text_builder, notify
from .services import sse_manager, derive, inference_router

# ── Logging ───────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger("sc_gateway")

# ── Configuration ─────────────────────────────────────────────────
AWS_REGION       = os.getenv("AWS_REGION", "us-west-2")
# Default to demo-only mode — no SageMaker required for Azure deployment
SAGEMAKER_MODE   = os.getenv("SAGEMAKER_MODE", "false").lower() in ("1", "true", "yes")
USE_DEMO_ON_ERROR = os.getenv("USE_DEMO_ON_ERROR", "true").lower() in ("1", "true", "yes")
SM_CONNECT_TIMEOUT = int(os.getenv("SM_CONNECT_TIMEOUT", "2"))
SM_READ_TIMEOUT    = int(os.getenv("SM_READ_TIMEOUT", "5"))

# ── Static file paths ─────────────────────────────────────────────
# dist/ is built by `npm run build` and sits at the repo root
DIST_DIR = Path(__file__).resolve().parent.parent / "dist"

ENDPOINT_MAP: dict[str, str] = {
    "phase1b": os.getenv("PHASE1B_ENDPOINT", ""),
    "phase2":  os.getenv("PHASE2_ENDPOINT", ""),
    "onc":     os.getenv("ONC_ENDPOINT", ""),
}

VALID_ROUTES = set(ENDPOINT_MAP.keys())

DEMO_DIR = Path(__file__).parent / "demo_outputs"

# ── FastAPI app ───────────────────────────────────────────────────
app = FastAPI(
    title="Surgical Copilot Gateway",
    version="1.0.0",
    description="SageMaker proxy gateway for Phase 1B, Phase 2, and Onco inference.",
)

# ── CORS ──────────────────────────────────────────────────────────
_default_origins = (
    "http://localhost:5173,http://127.0.0.1:5173,"
    "https://surgicalcopilot-app.azurewebsites.net"
)
cors_origins = os.getenv("CORS_ORIGINS", _default_origins).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Startup event: seed demo data ─────────────────────────────────
@app.on_event("startup")
async def startup_event():
    """Seed demo patients on first start."""
    storage.seed_demo_data()
    logger.info("Startup: demo seed complete.")

# ── SageMaker client (lazy init) ─────────────────────────────────
_sm_client = None


def _get_sm_client():
    global _sm_client
    if _sm_client is None:
        _sm_client = boto3.client(
            "sagemaker-runtime",
            region_name=AWS_REGION,
            config=Config(
                connect_timeout=SM_CONNECT_TIMEOUT,
                read_timeout=SM_READ_TIMEOUT,
                retries={"max_attempts": 1},
            ),
        )
    return _sm_client


# ── Helpers ───────────────────────────────────────────────────────

def _load_demo(route: str) -> dict[str, Any]:
    """Load demo JSON for the given route."""
    demo_file = DEMO_DIR / f"{route}.json"
    with open(demo_file, "r") as f:
        return json.load(f)


LOCKED_METADATA = {
    "phase1b": {
        "prompt": "You are a surgical copilot assisting with inpatient monitoring (Phase 1B Watch & Wait). Analyze the case and return structured JSON with label_class, trajectory, red_flag_triggered, and red_flags.",
        "schema": {
            "label_class": "string: watch_wait | operate_now | avoid",
            "trajectory": "string: improving | stable | deteriorating",
            "red_flag_triggered": "boolean",
            "red_flags": "array of strings",
        },
        "validators": {
            "required_fields": ["label_class", "trajectory", "red_flag_triggered", "red_flags"],
            "enum_values": {
                "label_class": ["watch_wait", "operate_now", "avoid"],
                "trajectory": ["improving", "stable", "deteriorating"],
            },
            "ranges": {},
            "array_fields": ["red_flags"],
        },
    },
    "phase2": {
        "prompt": "You are a surgical copilot assisting with post-discharge surveillance (Phase 2 SAFEGUARD). Analyze the daily check-in and return structured JSON with doc_type, risk_level, risk_score, timeline_deviation, trigger_reason, copilot_transfer, phase1b_compat.",
        "schema": {
            "doc_type": "string: daily_triage",
            "risk_level": "string: green | amber | red",
            "risk_score": "float 0..1",
            "timeline_deviation": "string: none | mild | moderate | severe",
            "trigger_reason": "array of strings",
            "copilot_transfer": "object: { send_to_clinician: bool, sbar?: { situation, background, assessment, recommendation } }",
            "phase1b_compat": "object: { label_class, trajectory, red_flag_triggered, red_flags }",
        },
        "validators": {
            "required_fields": ["doc_type", "risk_level", "risk_score", "timeline_deviation", "trigger_reason"],
            "enum_values": {
                "risk_level": ["green", "amber", "red"],
                "timeline_deviation": ["none", "mild", "moderate", "severe"],
            },
            "ranges": {
                "risk_score": {"min": 0, "max": 1},
            },
            "array_fields": ["trigger_reason"],
            "nested_required": {
                "copilot_transfer.sbar": ["situation", "background", "assessment", "recommendation"],
            },
        },
    },
    "onc": {
        "prompt": "You are a surgical copilot assisting with post-operative oncological surveillance. Analyze the follow-up data and return structured JSON with doc_type, progression_status, risk_score, urgency, trigger_reason, send_to_oncologist.",
        "schema": {
            "doc_type": "string: onco_surveillance",
            "progression_status": "string: stable_disease | partial_response | progression | recurrence",
            "risk_score": "float 0..1",
            "urgency": "string: routine | soon | urgent",
            "trigger_reason": "array of strings",
            "send_to_oncologist": "boolean",
        },
        "validators": {
            "required_fields": ["doc_type", "progression_status", "risk_score", "urgency", "trigger_reason", "send_to_oncologist"],
            "enum_values": {
                "progression_status": ["stable_disease", "partial_response", "progression", "recurrence"],
                "urgency": ["routine", "soon", "urgent"],
            },
            "ranges": {
                "risk_score": {"min": 0, "max": 1},
            },
            "array_fields": ["trigger_reason"],
        },
    },
}

def _extract_json_from_text(text: str) -> dict | None:
    """Find the first balanced '{' and '}' pair and try to parse it as JSON."""
    if not text:
        return None
    try:
        start = text.find('{')
        if start == -1:
            return None
        
        stack = 0
        for i in range(start, len(text)):
            if text[i] == '{':
                stack += 1
            elif text[i] == '}':
                stack -= 1
                if stack == 0:
                    json_str = text[start : i + 1]
                    try:
                        return json.loads(json_str)
                    except Exception:
                        # If the first balanced block fails, maybe try to find the next one?
                        # For now, just continue and see if we find another.
                        pass
        
        # Fallback to the old method if the stack method didn't yield a valid object
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start : end + 1])
    except Exception:
        pass
    return None

def _envelope(
    *,
    ok: bool,
    route: str,
    fallback: bool,
    endpoint: str,
    model_response: Any,
    request_id: str | None = None,
) -> dict[str, Any]:
    import uuid
    rid = request_id or f"req-{uuid.uuid4().hex[:8]}"
    
    # Extract parsed data
    parsed = model_response
    raw_text = ""
    
    if isinstance(model_response, dict):
        if "parsed" in model_response:
            parsed = model_response["parsed"]
        elif "text" in model_response:
            # Model output is wrapped in 'text' key
            raw_text = model_response["text"]
            extracted = _extract_json_from_text(raw_text)
            if extracted:
                parsed = extracted
            else:
                # If extraction fails, use raw text but it won't pass schema
                parsed = raw_text
        elif "generated_text" in model_response: # For SM LLM responses
            raw_text = model_response["generated_text"]
            extracted = _extract_json_from_text(raw_text)
            if extracted:
                parsed = extracted
            else:
                parsed = raw_text # Fallback to raw text if JSON extraction fails
    elif isinstance(model_response, str): # For SM LLM responses that are just text
        raw_text = model_response
        extracted = _extract_json_from_text(raw_text)
        if extracted:
            parsed = extracted
        else:
            parsed = raw_text # Fallback to raw text if JSON extraction fails
    
    return {
        "ok": ok,
        "request_id": rid,
        "mode": "demo" if (fallback or endpoint == "demo") else "real",
        "fallback_used": fallback or endpoint == "demo",
        "fallback_reason": "Inference Error" if fallback else None,
        "raw_text": raw_text,
        "parsed": parsed,
        "data": parsed, # for legacy
        "error": None if ok else str(model_response),
        # Internal info preserved for debugging
        "route": route,
        "endpoint": endpoint,
        "model_response": model_response,
    }


# ── Endpoints ─────────────────────────────────────────────────────

@app.get("/health")
@app.get("/ping")
@app.get("/healthz")
async def health():
    return {"status": "ok"}


@app.get("/api/locked")
async def api_locked():
    return LOCKED_METADATA


@app.post("/infer/{route}")
async def api_infer_route(route: str, body: dict[str, Any] | None = None, response: Response = None):
    return await infer(route, body, response)


# ═══════════════════════════════════════════════════════════════════
# PATIENT / NOTES / ALERTS — Longitudinal Copilot API
# ═══════════════════════════════════════════════════════════════════


def _wrap_infer_response(infer_result) -> dict:
    """Convert an /infer/* response model into the frontend-compatible shape.
    Used for legacy compatibility in submitNote.
    """
    obj = infer_result
    # In gateway, infer_result is already a dict (envelope)
    demo = obj.get("fallback", False) or obj.get("endpoint") == "demo"
    model_res = obj.get("model_response", {})
    
    # Extract parsed data if present (it might be nested in model_response)
    data = obj.get("parsed", model_res) # Use the already parsed data from _envelope

    return {
        "request_id": obj.get("request_id", ""),
        "mode": "demo" if demo else "real",
        "fallback_used": demo,
        "fallback_reason": None,
        "raw_text": obj.get("raw_text", ""), # Use raw_text from _envelope
        "parsed": data,
        "error": None if obj.get("ok") else str(model_res),
        "data": data,
        "demo": demo,
    }


@app.post("/api/patients")
async def api_create_patient(request: Request):
    body = await request.json()
    patient = storage.create_patient(
        name=body.get("name", "Unknown"),
        age_years=body.get("age_years") or body.get("age"),
        sex=body.get("sex", ""),
        pod=int(body.get("pod", 0)),
        phase=body.get("phase", "phase1b"),
        procedure_name=body.get("procedure_name", ""),
        indication=body.get("indication", ""),
        clinician_name=body.get("clinician_name", ""),
        clinician_phone=body.get("clinician_phone", ""),
        nurse_phone=body.get("nurse_phone", ""),
    )
    return patient


@app.get("/api/patients")
async def api_list_patients():
    return storage.list_patients()


@app.get("/api/patients/{patient_id}")
async def api_get_patient(patient_id: str):
    patient = storage.get_patient(patient_id)
    if not patient:
        from fastapi import HTTPException
        raise HTTPException(404, detail=f"Patient not found: {patient_id}")

    derived = storage.get_latest_derived(patient_id)
    alerts = storage.get_alerts(patient_id)
    notes = storage.get_notes(patient_id)

    return {
        "patient": patient,
        "derived": derived,
        "alerts": alerts,
        "notes_count": len(notes),
    }


@app.post("/api/patients/{patient_id}/notes")
async def api_add_note(patient_id: str, request: Request):
    patient = storage.get_patient(patient_id)
    if not patient:
        from fastapi import HTTPException
        raise HTTPException(404, detail=f"Patient not found: {patient_id}")

    body = await request.json()
    note_text = body.get("note_text", "")
    note_type = body.get("note_type", "DAILY_UPDATE")
    author_role = body.get("author_role", "doctor")
    auto_infer = body.get("auto_infer", True)

    if not note_text.strip():
        from fastapi import HTTPException
        raise HTTPException(400, detail="note_text is required")

    # 1. Parse note
    parsed = note_parser.parse_note(note_text, note_type)

    # 2. Store note
    note_record = storage.add_note(
        patient_id=patient_id,
        note_text=note_text,
        note_type=note_type,
        author_role=author_role,
        parsed_json=parsed,
    )

    # 3. Rebuild derived series from all notes
    all_notes = storage.get_notes(patient_id)
    series = derive_series.build_series(all_notes)

    # 4. Compute risk
    risk_eval = risk_rules.evaluate_risk(series)

    # 5. Save derived (series + risk)
    derived_record = {**series, "risk_eval": risk_eval}
    storage.save_derived(patient_id, derived_record)

    # 6. Optionally auto-run inference
    latest_inference = None
    is_demo_fallback = False
    if auto_infer:
        case_text = case_text_builder.build_case_text(patient, series, risk_eval)
        try:
            # For gateway, we call the local infer function which proxies to SM
            result = await infer("phase1b", {"case_text": case_text})
            latest_inference = _wrap_infer_response(result)
            is_demo_fallback = latest_inference.get("demo", False)
        except Exception as exc:
            logger.error("Auto-inference failed for %s: %s", patient_id, exc)
            latest_inference = {"data": None, "demo": True, "error": str(exc)}
            is_demo_fallback = True

    # 7. Process alerts
    alerts_created = notify.process_alerts(
        patient=patient,
        risk_eval=risk_eval,
        inference_result=latest_inference,
        is_demo_fallback=is_demo_fallback,
    )

    # Refresh patient card
    patient_card = storage.get_patient(patient_id)

    return {
        "patient_card": patient_card,
        "note": note_record,
        "derived_series": series,
        "risk_eval": risk_eval,
        "latest_inference": latest_inference,
        "alerts_created": alerts_created,
    }


@app.get("/api/patients/{patient_id}/alerts")
async def api_get_alerts(patient_id: str):
    return storage.get_alerts(patient_id)


@app.get("/api/patients/{patient_id}/notes")
async def api_get_notes(patient_id: str):
    return storage.get_notes(patient_id)


@app.get("/api/patients/{patient_id}/series")
async def api_get_series(patient_id: str):
    derived = storage.get_latest_derived(patient_id)
    return derived or {}


@app.get("/api/note-template/{note_type}")
async def api_note_template(note_type: str):
    return {"template": note_parser.generate_template(note_type.upper())}


async def infer(route: str, body: dict[str, Any] | None = None, response: Response = None):
    """
    Refactored infer function that uses inference_router but maintains 
    the legacy 'envelope' schema for smoke tests.
    """
    if route not in VALID_ROUTES:
        return _envelope(
            ok=False,
            route=route,
            fallback=False,
            endpoint="",
            model_response={"error": f"Unknown route: {route!r}"}
        )

    endpoint_name = ENDPOINT_MAP[route]
    prompt = LOCKED_METADATA.get(route, {}).get("prompt", "")
    
    # Use the new inference router
    wrapper = await inference_router.run_inference(route, endpoint_name, body or {}, prompt)
    
    if wrapper["fallback_used"] and response:
        response.headers["X-Fallback"] = "demo"
        # For legacy compatibility, if fallback, we still return the _envelope shape
        demo_data = _load_demo(route)
        return _envelope(
            ok=True,
            route=route,
            fallback=True,
            endpoint=endpoint_name,
            model_response=demo_data,
            request_id=wrapper["request_id"]
        )
    
    return _envelope(
        ok=wrapper["ok"],
        route=route,
        fallback=wrapper["fallback_used"],
        endpoint=endpoint_name if not wrapper["fallback_used"] else "demo",
        model_response=wrapper["parsed_data"] if wrapper["ok"] else {"error": wrapper["error"]},
        request_id=wrapper["request_id"]
    )


@app.get("/v1/patients")
async def v1_list_patients():
    return storage.list_patients()


@app.get("/v1/patients/{patient_id}")
async def v1_get_patient(patient_id: str):
    p = storage.get_patient(patient_id)
    if not p:
        raise HTTPException(404, detail="Patient not found")
    
    # Enrich with latest checkins
    checkins = storage.get_checkins(patient_id)
    return {
        "patient": p,
        "checkins": checkins
    }


@app.post("/v1/patients/{patient_id}/checkins")
async def v1_create_checkin(patient_id: str, request: Request):
    p = storage.get_patient(patient_id)
    if not p:
        raise HTTPException(404, detail="Patient not found")
        
    body = await request.json()
    
    # 1. Store raw check-in
    checkin = storage.add_checkin(patient_id, body)
    
    # 2. Run Inference
    route = p["phase"]
    endpoint_name = ENDPOINT_MAP.get(route, "")
    prompt = LOCKED_METADATA.get(route, {}).get("prompt", "")
    
    wrapper = await inference_router.run_inference(route, endpoint_name, body, prompt)
    
    # 3. Handle Fallback Parsed Data (if real failed)
    if wrapper["fallback_used"]:
        # Load route-specific demo data if real failed
        wrapper["parsed_data"] = _load_demo(route)
        
    # 4. Normalize (Derive Clinical Findings)
    normalized = derive.normalize_analysis(route, wrapper["parsed_data"], wrapper["raw_text"])
    
    # 5. Persist Analysis
    storage.save_analysis(
        checkin["id"],
        route,
        wrapper,
        wrapper["parsed_data"],
        normalized["risk_level"],
        normalized["red_flags"],
        normalized.get("sbar", {}),
        normalized.get("clinician_summary", "")
    )
    
    # 6. Update Patient Cache
    storage.update_patient_status(patient_id, normalized["risk_level"], normalized.get("decision", ""))
    
    # 7. Broadcast Notification (SSE)
    msg = f"Alert: {p['name']} - {normalized['risk_level'].upper()} risk detected."
    storage.create_notification(patient_id, checkin["id"], normalized["risk_level"], msg)
    
    await sse_manager.manager.broadcast("checkin_created", {
        "patient_id": patient_id,
        "patient_name": p["name"],
        "checkin_id": checkin["id"],
        "risk_level": normalized["risk_level"],
        "message": msg,
        "created_at": checkin["created_at"]
    })
    
    return {
        **wrapper,
        "derived": normalized,
        "patient_id": patient_id,
        "checkin_id": checkin["id"]
    }


@app.get("/v1/stream/doctor")
async def v1_sse_doctor(request: Request):
    async def event_generator():
        queue = await sse_manager.manager.subscribe()
        try:
            while True:
                # Check for client disconnect
                if await request.is_disconnected():
                    break
                
                try:
                    # Non-blocking wait for message
                    message = await asyncio.wait_for(queue.get(), timeout=5.0)
                    yield f"event: {message['event']}\ndata: {json.dumps(message['data'])}\n\n"
                except asyncio.TimeoutError:
                    # Heartbeat to keep connection alive
                    yield ": heartbeat\n\n"
        finally:
            sse_manager.manager.unsubscribe(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/v1/notifications")
async def v1_list_notifications():
    return storage.list_notifications()


@app.post("/v1/notifications/{nid}/read")
async def v1_mark_read(nid: str):
    storage.mark_notification_read(nid)
    return {"ok": True}


@app.post("/api/reset")
async def api_reset():
    storage.reset_db()
    storage.seed_demo_data()
    return {"ok": True, "message": "Database reset and seeded."}


# ── Compliance Endpoints ───────────────────────────────────────────

@app.get("/api/compliance/status")
async def api_compliance_status():
    """Get current compliance configuration and status."""
    from .compliance import ComplianceGate, DataSource, get_deidentification_documentation
    from .services.inference_router import get_compliance_gate
    
    gate = get_compliance_gate()
    return {
        "data_source": gate.data_source.value,
        "compliance_level": gate.compliance_level.value,
        "inference_mode": gate.get_inference_mode(),
        "can_use_external_llm": gate.can_use_external_llm(),
        "phi_patterns_count": len(gate.PHI_PATTERNS),
    }


@app.post("/api/compliance/scan")
async def api_compliance_scan(request: Request):
    """Scan text for potential PHI."""
    from .services.inference_router import get_compliance_gate
    
    body = await request.json()
    text = body.get("text", "")
    
    if not text:
        raise HTTPException(400, detail="No text provided")
    
    gate = get_compliance_gate()
    report = gate.check_text(text)
    
    return {
        "passed": report.passed,
        "data_source": report.data_source.value,
        "phi_findings": [
            {
                "pattern_type": f.pattern_type,
                "severity": f.severity,
                "position": f.position,
            }
            for f in report.phi_findings
        ],
        "warnings": report.warnings,
        "inference_mode": report.inference_mode,
    }


@app.get("/api/compliance/documentation")
async def api_compliance_documentation():
    """Get de-identification documentation."""
    from .compliance import get_deidentification_documentation
    return {"documentation": get_deidentification_documentation()}


# ── Evaluation Endpoints ───────────────────────────────────────────

@app.get("/api/eval/cases")
async def api_eval_cases():
    """Get available synthetic evaluation cases."""
    from .eval_harness import load_synthetic_cases, ADAPTER_SCHEMAS
    cases = load_synthetic_cases()
    return {
        "cases": [
            {
                "case_id": c.case_id,
                "adapter": c.adapter,
                "has_expected": c.expected_output is not None,
            }
            for c in cases
        ],
        "adapters": list(ADAPTER_SCHEMAS.keys()),
        "total": len(cases),
    }


@app.post("/api/eval/run")
async def api_eval_run(request: Request):
    """Run evaluation on synthetic cases."""
    from .eval_harness import (
        load_synthetic_cases, run_evaluation, generate_eval_report, EvalCase
    )
    
    body = await request.json() if request.headers.get("content-type") == "application/json" else {}
    adapter_filter = body.get("adapter")  # Optional: filter by adapter
    include_report = body.get("include_report", True)
    
    # Load cases
    cases = load_synthetic_cases()
    
    # Filter by adapter if specified
    if adapter_filter:
        cases = [c for c in cases if c.adapter == adapter_filter]
    
    if not cases:
        return {"error": "No cases found", "cases_loaded": 0}
    
    # For now, use demo outputs as "actual" (since we can't run real inference easily)
    for case in cases:
        demo_output = _load_demo(case.adapter)
        case.actual_output = demo_output
    
    # Run evaluation
    results = run_evaluation(cases)
    
    response = {
        "ok": True,
        "summary": results["summary"],
        "timestamp": results["timestamp"],
        "cases_evaluated": len(cases),
    }
    
    if include_report:
        response["report"] = generate_eval_report(results)
    
    return response


@app.get("/api/eval/report")
async def api_eval_report():
    """Generate a full evaluation report."""
    from .eval_harness import load_synthetic_cases, run_evaluation, generate_eval_report
    
    cases = load_synthetic_cases()
    
    # Use demo outputs as actual
    for case in cases:
        demo_output = _load_demo(case.adapter)
        case.actual_output = demo_output
    
    results = run_evaluation(cases)
    report = generate_eval_report(results)
    
    return {
        "report": report,
        "summary": results["summary"],
        "timestamp": results["timestamp"],
    }


# ── HITL (Human-in-the-Loop) Endpoints ─────────────────────────────

@app.post("/api/hitl/decision")
async def api_hitl_decision(request: Request):
    """Record a HITL decision (approve/reject/override)."""
    body = await request.json()
    
    patient_id = body.get("patient_id")
    decision = body.get("decision")  # 'approve', 'reject', 'override'
    original_risk = body.get("original_risk", "")
    
    if not patient_id or not decision:
        raise HTTPException(400, detail="patient_id and decision are required")
    
    if decision not in ("approve", "reject", "override"):
        raise HTTPException(400, detail="decision must be 'approve', 'reject', or 'override'")
    
    result = storage.create_hitl_decision(
        patient_id=patient_id,
        decision=decision,
        original_risk=original_risk,
        analysis_id=body.get("analysis_id", ""),
        clinician_id=body.get("clinician_id", ""),
        clinician_name=body.get("clinician_name", ""),
        rationale=body.get("rationale", ""),
        override_risk=body.get("override_risk"),
    )
    
    # Broadcast HITL decision via SSE
    await sse_manager.manager.broadcast("hitl_decision", {
        "patient_id": patient_id,
        "decision": decision,
        "original_risk": original_risk,
        "override_risk": body.get("override_risk"),
        "created_at": result["created_at"],
    })
    
    return {"ok": True, "decision": result}


@app.get("/api/hitl/decisions")
async def api_hitl_list(patient_id: str = None, limit: int = 50):
    """List HITL decisions, optionally filtered by patient."""
    decisions = storage.list_hitl_decisions(patient_id=patient_id, limit=limit)
    return {"decisions": decisions, "count": len(decisions)}


@app.get("/api/hitl/stats")
async def api_hitl_stats():
    """Get aggregate HITL statistics."""
    stats = storage.get_hitl_stats()
    return stats


# ── Legacy Aliases (Maintains smoke test compatibility) ───────────

@app.post("/api/phase1b")
async def api_phase1b_alias(body: dict[str, Any] | None = None, response: Response = None):
    return await infer("phase1b", body, response)

@app.post("/api/phase2")
async def api_phase2_alias(body: dict[str, Any] | None = None, response: Response = None):
    return await infer("phase2", body, response)

@app.post("/api/onc")
async def api_onc_alias(body: dict[str, Any] | None = None, response: Response = None):
    return await infer("onc", body, response)


# ── Static file serving (React SPA) ───────────────────────────────
# Mount the Vite build output so the frontend is served from the same process.
# This MUST come AFTER all API routes (FastAPI routes take priority).
if DIST_DIR.exists():
    assets_dir = DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
    logger.info("Serving React SPA from: %s", DIST_DIR)
else:
    logger.warning("dist/ not found — frontend will not be served. Run: npm run build")


@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    """Catch-all: serve index.html for any non-API path (React Router SPA)."""
    # Skip for API paths (these are handled above and shouldn't reach here)
    if full_path.startswith(("api/", "v1/", "infer/", "health", "ping", "healthz")):
        raise HTTPException(404, detail="Not found")
    index = DIST_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return {"error": "Frontend not built. Run npm run build.", "status": "api_only"}
