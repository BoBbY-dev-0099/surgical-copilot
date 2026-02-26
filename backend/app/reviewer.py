from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

reviewer_router = APIRouter()

# ─── Schemas ───────────────────────────────────────────────────────

class ReviewerRequest(BaseModel):
    mode: str  # "phase1b" | "phase2" | "oncology"
    case_payload: dict[str, Any]
    adapter_output: dict[str, Any]

class ReviewerResponse(BaseModel):
    reviewer_summary: str
    contradictions: List[str] = Field(default_factory=list)
    missed_red_flags: List[str] = Field(default_factory=list)
    hallucinations: List[str] = Field(default_factory=list)
    escalation_recommended: bool = False
    confidence: float = 0.0

# ─── Base Model Lazy Loader ────────────────────────────────────────

_base_model = None
_base_tokenizer = None

def _get_base_model():
    """Lazy load the BASE MedGemma model (no adapters)."""
    global _base_model, _base_tokenizer
    
    if os.getenv("DEMO_MODE", "false").lower() in ("1", "true", "yes"):
        return None, None

    if _base_model is not None:
        return _base_model, _base_tokenizer

    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        
        # Reuse same model ID as the causal model but load it raw
        model_id = os.getenv("MODEL_ID_CAUSAL", "google/medgemma-4b-text")
        device = os.getenv("DEVICE", "auto")
        hf_token = os.getenv("HF_TOKEN") or None
        dtype = torch.float16 if torch.cuda.is_available() else torch.float32

        logger.info("Loading base reviewer model: %s", model_id)
        _base_tokenizer = AutoTokenizer.from_pretrained(model_id, token=hf_token, trust_remote_code=True)
        _base_model = AutoModelForCausalLM.from_pretrained(
            model_id,
            token=hf_token,
            torch_dtype=dtype,
            device_map=device,
            trust_remote_code=True,
        )
        _base_model.eval()
        return _base_model, _base_tokenizer
    except Exception as exc:
        logger.error("Failed to load base reviewer model: %s", exc)
        return None, None

# ─── Inference Logic ───────────────────────────────────────────────

def _extract_json_from_text(text: str) -> dict | None:
    """Robust extraction of first JSON object from string."""
    try:
        # Look for { ... }
        match = re.search(r'(\{.*\})', text, re.DOTALL)
        if match:
            return json.loads(match.group(1))
    except Exception:
        pass
    return None

@reviewer_router.post("/infer/reviewer", response_model=ReviewerResponse)
async def infer_reviewer(req: ReviewerRequest):
    t0 = time.perf_counter()
    
    # SYSTEM PROMPT
    system_prompt = (
        "You are a SAFETY REVIEWER for a medical copilot. You DO NOT make a new diagnosis or plan.\n"
        "You ONLY audit the adapter_output for safety: contradictions, missing red flags, hallucinations, and whether escalation is required.\n"
        "Return ONLY valid JSON exactly matching the output schema. No markdown. No extra text."
    )
    
    # USER PROMPT
    user_prompt = (
        f"MODE: {req.mode}\n"
        f"CASE_PAYLOAD: {json.dumps(req.case_payload)}\n"
        f"ADAPTER_OUTPUT: {json.dumps(req.adapter_output)}\n\n"
        "Tasks:\n"
        "1) List contradictions between case_payload vs adapter_output.\n"
        "2) List missed red flags that should increase urgency/risk.\n"
        "3) List possible hallucinations or anatomy/condition mismatches.\n"
        "4) Decide escalation_recommended (true if any safety concern).\n"
        "5) Provide reviewer_summary + confidence."
    )

    model, tokenizer = _get_base_model()
    
    if model is None:
        # FALLBACK: Base model unavailable or DEMO_MODE
        if os.getenv("DEMO_MODE", "true").lower() in ("1", "true", "yes"):
            # realistic simulated demo response
            return ReviewerResponse(
                reviewer_summary="Reviewer (Demo Mode): Observations are consistent with adapter output.",
                contradictions=[],
                missed_red_flags=[],
                hallucinations=[],
                escalation_recommended=False,
                confidence=0.85
            )
        
        return ReviewerResponse(
            reviewer_summary="Base reviewer model unavailable (OOM or load failure).",
            confidence=0.0
        )

    try:
        inputs = tokenizer(f"{system_prompt}\n\n{user_prompt}", return_tensors="pt").to(model.device)
        import torch
        with torch.no_grad():
            outputs = model.generate(**inputs, max_new_tokens=400, do_sample=False)
        
        raw_text = tokenizer.decode(outputs[0][inputs['input_ids'].shape[1]:], skip_special_tokens=True)
        parsed = _extract_json_from_text(raw_text)
        
        if parsed:
            return ReviewerResponse(**parsed)
        
        return ReviewerResponse(
            reviewer_summary="Failed to parse structured JSON from reviewer model.",
            confidence=0.0
        )
        
    except Exception as exc:
        logger.error("Reviewer inference failed: %s", exc)
        return ReviewerResponse(
            reviewer_summary=f"Inference error: {str(exc)}",
            confidence=0.0
        )
