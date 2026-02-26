"""
SageMaker Inference Toolkit entrypoint for Surgical Copilot.

This module provides the four functions expected by the SageMaker
Multi-Model Server (MMS) toolkit:

  model_fn   →  load/init the InferenceEngine
  input_fn   →  parse the incoming JSON request
  predict_fn →  run inference
  output_fn  →  serialise the response

Usage:
  Set SAGEMAKER_PROGRAM=sagemaker_inference.py in the container env
  OR simply use the FastAPI approach (/ping + /invocations) which the
  existing main.py already supports.

The FastAPI approach is RECOMMENDED for this project because it supports
all three adapters, structured parsed output, and the auto-fallback system.
This file is provided for teams that prefer the Toolkit interface.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

logger = logging.getLogger(__name__)


def model_fn(model_dir: str) -> Any:
    """Initialise the InferenceEngine (loads models + adapters)."""
    from app.engine import InferenceEngine
    logger.info("model_fn: initialising InferenceEngine from %s", model_dir)
    engine = InferenceEngine()
    logger.info("model_fn: engine ready (demo_mode=%s)", engine.demo_mode)
    return engine


def input_fn(request_body: str | bytes, content_type: str = "application/json") -> dict:
    """Parse the incoming JSON payload.

    Expected shape:
      {
        "route": "phase1b" | "phase2" | "onco",
        "case_text": "...",
        "patient_id": "...",          // optional
        "post_op_day": 3,             // optional (phase2)
        "checkin": { ... }            // optional (phase2)
      }
    """
    if content_type != "application/json":
        raise ValueError(f"Unsupported content type: {content_type}")

    if isinstance(request_body, bytes):
        request_body = request_body.decode("utf-8")

    data = json.loads(request_body)

    if "route" not in data or "case_text" not in data:
        raise ValueError("Payload must include 'route' and 'case_text' fields.")

    return data


def predict_fn(input_data: dict, engine: Any) -> dict:
    """Run inference using the engine, return structured dict."""
    from app.json_parser import parse_model_output

    route = input_data["route"].lower().strip()
    case_text = input_data["case_text"]
    request_id = str(uuid.uuid4())

    if route == "phase1b":
        raw, elapsed, mode, fallback_used, fallback_reason = asyncio.run(
            engine.infer_phase1b(case_text)
        )
    elif route == "phase2":
        raw, elapsed, mode, fallback_used, fallback_reason = asyncio.run(
            engine.infer_phase2(
                case_text,
                post_op_day=input_data.get("post_op_day"),
                checkin=input_data.get("checkin"),
            )
        )
    elif route == "onco":
        raw, elapsed, mode, fallback_used, fallback_reason = asyncio.run(
            engine.infer_onco(case_text)
        )
    else:
        return {
            "request_id": request_id,
            "mode": "real",
            "fallback_used": False,
            "fallback_reason": None,
            "raw_text": "",
            "parsed": None,
            "error": f"Unknown route: {route!r}. Use phase1b, phase2, or onco.",
        }

    parsed, error = parse_model_output(raw)

    return {
        "request_id": request_id,
        "mode": mode,
        "fallback_used": fallback_used,
        "fallback_reason": fallback_reason,
        "raw_text": raw,
        "parsed": parsed,
        "error": error,
    }


def output_fn(prediction: dict, accept: str = "application/json") -> str:
    """Serialise the prediction dict to JSON."""
    return json.dumps(prediction, default=str)
