"""
Pydantic v2 schemas for Surgical Copilot inference API (MedGemma-27B).

Every /infer/* endpoint returns:
  {
    "request_id": str,        # uuid4
    "mode": "real"|"demo",
    "fallback_used": bool,
    "fallback_reason": str|null,
    "raw_text": str,
    "parsed": <model-specific dict | null>,
    "error": str | null
  }

Updated for 27B adapter outputs with expanded schemas.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════════════════
# REQUEST MODELS
# ═══════════════════════════════════════════════════════════════════════

class Phase1bRequest(BaseModel):
    case_text: str
    patient_id: Optional[str] = None


class Phase2Request(BaseModel):
    case_text: str
    patient_id: Optional[str] = None
    post_op_day: Optional[int] = None
    checkin: Optional[dict[str, Any]] = None
    patient_history: Optional[list[dict[str, Any]]] = None


class OncoRequest(BaseModel):
    case_text: str
    patient_id: Optional[str] = None


class InvocationRequest(BaseModel):
    """SageMaker /invocations compatible payload."""
    task: str  # "phase1b" | "phase2" | "onco"
    case_text: str
    patient_id: Optional[str] = None
    post_op_day: Optional[int] = None
    checkin: Optional[dict[str, Any]] = None


# ═══════════════════════════════════════════════════════════════════════
# SHARED MODELS
# ═══════════════════════════════════════════════════════════════════════

class SBARNote(BaseModel):
    situation: str = ""
    background: str = ""
    assessment: str = ""
    recommendation: str = ""


class CopilotTransfer(BaseModel):
    send_to_clinician: bool = False
    priority: str = Field(default="routine", description="routine | urgent | immediate")
    sbar: Optional[SBARNote] = None


class AuditBlock(BaseModel):
    confidence: str = Field(default="medium", description="low | medium | high")
    key_evidence: list[str] = Field(default_factory=list)
    uncertainty_reason: Optional[str] = None
    needs_human_review: bool = False


# ═══════════════════════════════════════════════════════════════════════
# RESPONSE MODELS — Phase 1B (27B expanded schema)
# ═══════════════════════════════════════════════════════════════════════

class Phase1bParsed(BaseModel):
    """Phase 1B parsed output - flexible to accept various model outputs."""
    label_class: str = Field(description="watch_wait | operate_now | avoid")
    trajectory: str = Field(default="stable", description="improving | stable | deteriorating")
    red_flag_triggered: bool = False
    red_flags: list[str] = Field(default_factory=list)
    # Additional fields the model may output
    peritonitis: Optional[bool] = None
    imaging_free_fluid: Optional[bool] = None
    hb_drop: Optional[bool] = None
    source_control: Optional[bool] = None
    # Agent-added fields
    watch_parameters: list[str] = Field(default_factory=list)
    reassess_in_hours: int = Field(default=24)
    copilot_transfer: Optional[CopilotTransfer] = None
    audit: Optional[AuditBlock] = None
    
    class Config:
        extra = "allow"  # Allow additional fields from model output


class Phase1bResponse(BaseModel):
    request_id: str = ""
    mode: Literal["real", "demo"] = "real"
    fallback_used: bool = False
    fallback_reason: Optional[str] = None
    raw_text: str = ""
    parsed: Optional[Phase1bParsed] = None
    error: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════
# RESPONSE MODELS — Phase 2 (27B expanded schema)
# ═══════════════════════════════════════════════════════════════════════

class DomainFlag(BaseModel):
    domain: str = ""
    level: str = Field(default="green", description="green | amber | red")
    evidence: Any = Field(default="", description="Can be string or list")
    
    class Config:
        extra = "allow"


class PatientMessage(BaseModel):
    summary: str = ""
    self_care: list[str] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)
    next_checkin: str = ""


class Phase1bCompat(BaseModel):
    label_class: str = "watch_wait"
    trajectory: str = "stable"
    red_flag_triggered: bool = False
    red_flags: list[str] = Field(default_factory=list)


class Phase2Parsed(BaseModel):
    """Phase 2 parsed output - flexible to accept various model outputs."""
    doc_type: str = "daily_triage"
    risk_level: str = Field(default="green", description="green | amber | red")
    risk_score: float = Field(ge=0.0, le=1.0, default=0.0)
    timeline_deviation: str = Field(
        default="none",
        description="none | mild | moderate | severe",
    )
    trajectory: str = Field(default="stable", description="improving | stable | deteriorating")
    trigger_reason: list[str] = Field(default_factory=list)
    domain_flags: list[DomainFlag] = Field(default_factory=list)
    patient_message: Optional[PatientMessage] = None
    copilot_transfer: Optional[CopilotTransfer] = None
    followup_questions: list[str] = Field(default_factory=list)
    evidence: list[Any] = Field(default_factory=list, description="Can be list of strings or dicts")
    phase1b_compat: Optional[Phase1bCompat] = None
    audit: Optional[AuditBlock] = None
    
    class Config:
        extra = "allow"  # Allow additional fields from model output


class Phase2Response(BaseModel):
    request_id: str = ""
    mode: Literal["real", "demo"] = "real"
    fallback_used: bool = False
    fallback_reason: Optional[str] = None
    raw_text: str = ""
    parsed: Optional[Phase2Parsed] = None
    error: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════
# RESPONSE MODELS — Onco (27B expanded schema with 16 keys)
# ═══════════════════════════════════════════════════════════════════════

class CopilotOncoTransfer(BaseModel):
    send_to_oncologist: bool = False
    urgency: str = Field(default="routine", description="routine | urgent | immediate")
    sbar: Optional[SBARNote] = None


class SafetyFlags(BaseModel):
    new_lesion: bool = False
    rapid_growth: bool = False
    organ_compromise: bool = False
    neurologic_emergency: bool = False


class DomainSummary(BaseModel):
    imaging: str = ""
    labs: str = ""
    symptoms: str = ""


class FollowupPlan(BaseModel):
    next_imaging: str = ""
    next_labs: str = ""
    next_visit: str = ""


class Phase1bCompatOnco(BaseModel):
    red_flag_triggered: bool = False
    label_class: Optional[str] = None
    trajectory: Optional[str] = None


class OncoParsed(BaseModel):
    """Onco parsed output - flexible to accept various model outputs."""
    doc_type: str = "oncology_multimodal_surveillance"
    risk_level: str = Field(default="green", description="green | amber | red")
    risk_score: float = Field(ge=0.0, le=1.0, default=0.0)
    progression_status: str = Field(
        default="stable_disease",
        description="stable_disease | confirmed_progression | complete_response | partial_response",
    )
    recist_alignment: str = Field(default="SD", description="SD | PD | CR | PR | NE")
    pct_change_sum_diam: Optional[float] = Field(default=None, description="Percent change in sum of diameters")
    surveillance_trend: str = Field(default="stable", description="improving | stable | worsening")
    trigger_reason: list[str] = Field(default_factory=list)
    copilot_transfer: Optional[CopilotOncoTransfer] = None
    recommended_actions: list[str] = Field(default_factory=list)
    clinical_explanation: str = ""
    safety_flags: Optional[SafetyFlags] = None
    domain_summary: Optional[DomainSummary] = None
    followup_plan: Optional[FollowupPlan] = None
    phase1b_compat: Optional[Phase1bCompatOnco] = None
    audit: Optional[AuditBlock] = None
    
    class Config:
        extra = "allow"  # Allow additional fields from model output


class OncoResponse(BaseModel):
    request_id: str = ""
    mode: Literal["real", "demo"] = "real"
    fallback_used: bool = False
    fallback_reason: Optional[str] = None
    raw_text: str = ""
    parsed: Optional[OncoParsed] = None
    error: Optional[str] = None
