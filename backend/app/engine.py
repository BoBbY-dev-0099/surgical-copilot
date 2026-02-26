"""
MedGemma Inference Engine — loads 27B (text, LoRA adapters) + 4B (vision, enrichment).

27B model (google/medgemma-27b-text-it):
  • phase1b (surgical triage)
  • phase2 (post-discharge monitoring)
  • onco (oncology surveillance)

4B model (google/medgemma-4b-it):
  • Enrichment: follow-up questions, evidence, SBAR, patient message,
    clinical explanation from the 27B core output
  • Vision: wound/image analysis from patient-uploaded photos

Concurrency is serialised via asyncio.Locks so adapter switching
and generation are atomic.

Fallback behaviour (AUTO_FALLBACK_TO_DEMO):
  When real inference fails (OOM, timeout, adapter error, etc.),
  the engine returns demo output with mode="demo" and fallback_used=true
  instead of crashing.  CUDA memory is cleaned up on error.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import time
from io import BytesIO
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────
MAX_NEW_TOKENS = {
    "phase1b": 1024,
    "phase2": 2048,  # Increased from 1536 to handle complex cases
    "onco": 2048,
}
DEFAULT_MAX_TOKENS = 1024
ENRICH_MAX_TOKENS = 2048

# Optimized 4B generation parameters per adapter
ENRICH_GEN_PARAMS = {
    "phase1b": {
        "max_new_tokens": 1800,
        "do_sample": True,
        "temperature": 0.7,
        "top_p": 0.9,
        "top_k": 40,
        "repetition_penalty": 1.1,
    },
    "phase2": {
        "max_new_tokens": 2560,  # Increased for RED cases
        "do_sample": True,
        "temperature": 0.65,
        "top_p": 0.92,
        "top_k": 50,
        "repetition_penalty": 1.15,
    },
    "onco": {
        "max_new_tokens": 2200,
        "do_sample": True,
        "temperature": 0.6,
        "top_p": 0.95,
        "top_k": 45,
        "repetition_penalty": 1.12,
    },
}

DEMO_MODE: bool = os.getenv("DEMO_MODE", "false").lower() in ("1", "true", "yes")
AUTO_FALLBACK_TO_DEMO: bool = os.getenv("AUTO_FALLBACK_TO_DEMO", "false").lower() in ("1", "true", "yes")
INFER_TIMEOUT_SECONDS: int = int(os.getenv("INFER_TIMEOUT_SECONDS", "120"))
ENRICH_TIMEOUT_SECONDS: int = int(os.getenv("ENRICH_TIMEOUT_SECONDS", "90"))

# ── System prompts (must match training) ──────────────────────────
SYSTEM_PROMPTS = {
    "phase1b": (
        'You are a surgical triage AI. Output ONLY a single raw JSON object — '
        'no markdown, no code fences, no explanation. '
        'The JSON must contain the key "label_class" with value '
        '"operate_now", "watch_wait", or "avoid".'
    ),
    "phase2": (
        'You are SAFEGUARD, a post-discharge recovery monitoring AI. '
        'CRITICAL: Output ONLY a single raw JSON object starting with { and ending with }. '
        'NO explanations, NO markdown, NO code fences, NO text before or after the JSON. '
        'Start your response with { immediately. '
        'The JSON must contain "risk_level" with value "green", "amber", or "red".'
    ),
    "onco": (
        'You are an oncology surveillance AI. Output ONLY a single raw JSON object — '
        'no markdown, no code fences, no explanation. '
        'The JSON must contain the key "risk_level" with value "green", "amber", or "red", '
        'and "recist_alignment" with value "CR", "PR", "SD", or "PD".'
    ),
}

# ── Enrichment system prompt (used by 4B) ────────────────────────

ENRICH_SYSTEM_PROMPT = (
    'You are a clinical documentation AI assistant. Given a core clinical decision '
    'from a surgical AI triage system and the original case details, generate '
    'supporting clinical documentation fields.\n\n'
    'Output ONLY a single raw JSON object — no markdown, no code fences, no explanation.\n\n'
    'The JSON must contain ALL of these keys:\n'
    '  "followup_questions": array of 3-5 clinically relevant follow-up questions to ask the patient\n'
    '  "evidence": array of objects with keys "source", "domain", "snippet" — cite specific evidence from the case text that supports the decision\n'
    '  "patient_message": object with keys "summary" (plain-language 1-2 sentence summary for the patient), '
    '"self_care" (array of self-care instructions), "next_checkin" (when to check in next)\n'
    '  "sbar": object with keys "situation", "background", "assessment", "recommendation" — '
    'a structured clinical handoff narrative following SBAR format\n'
    '  "clinical_explanation": string — detailed clinical reasoning explaining the decision, '
    'referencing specific findings from the case\n'
)

ENRICH_IMAGE_ADDENDUM = (
    '\n\nYou are also provided with patient-uploaded images (wound photos, imaging, etc.). '
    'Analyze each image and include an additional key in your JSON output:\n'
    '  "image_analysis": object with keys "wound_status" (e.g. "clean", "erythematous", '
    '"purulent", "dehisced"), "findings" (array of specific observations), '
    '"concerns" (array of clinical concerns based on the images), '
    '"recommendation" (string — what to do based on image findings)\n'
)

# ── Demo-mode mock outputs (27B expanded schema) ──

DEMO_PHASE1B = json.dumps({
    "label_class": "operate_now",
    "trajectory": "deteriorating",
    "red_flag_triggered": True,
    "red_flags": ["hypotension", "lactate_high", "wbc_very_high", "peritonitis"],
    "news2": {
        "news2_score": 9,
        "news2_risk_band": "high",
        "news2_clinical_response": "Emergency response — continuous monitoring, urgent senior clinical review",
        "news2_components": {"rr": 2, "spo2": 1, "sbp": 3, "hr": 2, "temperature": 1, "consciousness": 0},
        "news2_parameters_available": 6,
    },
    "sepsis_screen": {
        "qsofa_score": 2,
        "qsofa_criteria_met": ["SBP 88 ≤100 mmHg", "RR 24 ≥22/min"],
        "sepsis_markers": ["Lactate 3.8 ≥2 (elevated)", "WBC 19.2 (abnormal)", "Temp 38.9°C (abnormal)"],
        "sepsis_likelihood": "high",
        "sepsis_action": "Activate sepsis protocol. Blood cultures, lactate, broad-spectrum antibiotics within 1 hour. Assess for source control.",
        "surviving_sepsis_aligned": True,
    },
    "extracted_vitals": {"temp_c": 38.9, "hr": 118, "sbp": 88, "rr": 24, "spo2": 94, "avpu": "alert"},
    "extracted_labs": {"wbc": 19.2, "lactate": 3.8},
})

DEMO_PHASE2 = json.dumps({
    "doc_type": "daily_triage",
    "risk_level": "red",
    "risk_score": 0.91,
    "timeline_deviation": "severe",
    "trigger_reason": [
        "pain_escalation",
        "fever_persistent",
        "vomiting_new_onset",
        "no_bowel_function_48h",
    ],
    "domain_flags": [
        {"domain": "pain", "level": "red", "evidence": ["Pain escalated from 3/10 to 8/10 over 24h", "unresponsive to oral analgesia"]},
        {"domain": "fever", "level": "red", "evidence": ["Temp 38.8°C persistent x3 days", "night sweats reported"]},
        {"domain": "gi", "level": "amber", "evidence": ["No bowel movement for 48 hours", "nausea with two vomiting episodes"]},
        {"domain": "wound", "level": "green", "evidence": ["No drainage or redness reported at incision site"]},
    ],
    "wearable_analysis": {
        "wearable_data_available": True,
        "signals": {
            "steps": {"value": 650, "baseline": 4200, "unit": "steps/day", "pct_change": -84.5},
            "resting_hr": {"value": 108, "baseline": 68, "unit": "bpm", "elevation": 40},
            "sleep": {"hours": 3, "quality": "poor"},
        },
        "deviations": [
            {"signal": "steps", "severity": "high", "finding": "Step count dropped 84% from baseline", "clinical_concern": "Significant reduction in mobility — may indicate pain, fatigue, or early complication"},
            {"signal": "resting_hr", "severity": "high", "finding": "Resting HR elevated 40 bpm above baseline", "clinical_concern": "Significant tachycardia at rest — may indicate infection, pain, dehydration, or bleeding"},
            {"signal": "sleep", "severity": "medium", "finding": "Only 3 hours of sleep", "clinical_concern": "Severely disrupted sleep — often correlates with pain or anxiety"},
        ],
        "wearable_risk_level": "high",
        "wearable_action": "Wearable data indicates significant deviation — prioritize clinical review",
        "passive_signal_count": 3,
        "deviation_count": 3,
        "clinical_note": "Passive wearable signals can detect deterioration 12-24h before symptom self-report",
    },
    "fused_risk": {
        "self_reported_risk": "red",
        "wearable_risk": "high",
        "fused_risk_level": "red",
        "risk_upgraded": False,
        "upgrade_reason": None,
    },
    "adherence_recommendations": [
        "Continue wearing your device — passive monitoring is working",
        "Sync your device before each check-in for best accuracy",
    ],
    "copilot_transfer": {
        "send_to_clinician": True,
    },
    "phase1b_compat": {
        "label_class": "operate_now",
        "trajectory": "deteriorating",
        "red_flag_triggered": True,
        "red_flags": ["fever_persistent", "pain_escalation", "bowel_obstruction"],
    },
    "safety": {
        "uncertainty": "low",
        "needs_human_review": True,
    },
})

DEMO_ONCO = json.dumps({
    "doc_type": "oncology_multimodal_surveillance",
    "risk_level": "amber",
    "risk_score": 0.61,
    "progression_status": "possible_progression",
    "recist_alignment": "SD",
    "trigger_reason": ["progression_suspected", "cea_rising"],
    "nccn_surveillance": {
        "schedule_period": "Years 2-3",
        "months_post_resection": 18,
        "schedule": {
            "cea": {"frequency": "every 3-6 months", "rationale": "Continued surveillance"},
            "ct_chest_abd_pelvis": {"frequency": "every 6-12 months", "rationale": "Detect late recurrence"},
            "colonoscopy": {"frequency": "at 3 years", "rationale": "Adenoma surveillance"},
            "clinical_exam": {"frequency": "every 3-6 months", "rationale": "Symptom assessment"},
        },
    },
    "recist_details": {
        "name": "Stable Disease",
        "definition": "Neither PR nor PD criteria met",
        "action": "Continue current management, standard surveillance interval",
    },
    "guideline_followup": {
        "urgency": "expedited",
        "cea": {"timing": "Repeat in 4 weeks", "rationale": "Confirm rising trend"},
        "imaging": {"timing": "Short-interval CT in 6-8 weeks", "rationale": "Assess for interval change"},
        "oncology_review": {"timing": "Within 2 weeks", "rationale": "Discuss surveillance findings"},
        "colonoscopy": {"timing": "Consider if anastomotic concern", "rationale": "Direct visualization"},
        "nccn_reference": "NCCN Guidelines support short-interval imaging for equivocal findings",
    },
    "clinical_action_summary": {
        "recist_response": "Stable Disease",
        "recist_action": "Continue current management, standard surveillance interval",
        "surveillance_period": "Years 2-3",
        "next_cea": "Repeat in 4 weeks",
        "next_imaging": "Short-interval CT in 6-8 weeks",
        "guideline_source": "NCCN Guidelines for Colon Cancer v2.2024",
    },
    "copilot_transfer": {
        "send_to_oncologist": True,
        "urgency": "same_week",
    },
    "recommended_actions": [
        "short_interval_imaging_4_weeks",
        "oncology_consultation",
        "repeat_CEA_in_3_weeks",
        "assess_chemotherapy_tolerance_neuropathy",
    ],
    "safety_flags": {
        "new_lesion": False,
        "rapid_growth": False,
        "organ_compromise": False,
        "neurologic_emergency": False,
    },
    "phase1b_compat": {
        "red_flag_triggered": False,
    },
})

# ═══════════════════════════════════════════════════════════════════════


class InferenceEngine:
    """Wraps MedGemma-27B (LoRA adapters) + MedGemma-4B (vision/enrichment)."""

    def __init__(self) -> None:
        self.demo_mode: bool = DEMO_MODE

        self._model_lock = asyncio.Lock()
        self._model_4b_lock = asyncio.Lock()

        # 27B model + tokenizer
        self.model = None
        self.tokenizer = None
        self._loaded_adapters: set[str] = set()

        # 4B model + processor (multimodal)
        self.model_4b = None
        self.processor_4b = None

        logger.info(f"DEMO_MODE env: {os.getenv('DEMO_MODE', 'true')}")
        logger.info(f"demo_mode resolved: {self.demo_mode}")

        if self.demo_mode:
            logger.info("DEMO_MODE=true — using mock model outputs (no GPU required)")
        else:
            logger.info("Loading real models...")
            self._load_models()

    # ── Model Loading ─────────────────────────────────────────────

    def _load_models(self) -> None:
        """Load MedGemma-27B (LoRA) + MedGemma-4B (vision/enrichment)."""
        import torch
        from peft import PeftModel
        from transformers import AutoModelForCausalLM, AutoTokenizer, AutoProcessor

        device = os.getenv("DEVICE", "auto")
        hf_token = os.getenv("HF_TOKEN") or None
        dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32

        # ── 27B text model ────────────────────────────────────────
        model_id = os.getenv("MODEL_ID", "google/medgemma-27b-text-it")
        logger.info("Loading MedGemma-27B model: %s", model_id)

        self.tokenizer = AutoTokenizer.from_pretrained(
            model_id, token=hf_token, use_fast=True,
        )
        if self.tokenizer.pad_token_id is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
            self.tokenizer.pad_token_id = self.tokenizer.eos_token_id

        self.model = AutoModelForCausalLM.from_pretrained(
            model_id,
            token=hf_token,
            torch_dtype=dtype,
            device_map=device,
            low_cpu_mem_usage=True,
            attn_implementation="sdpa",
        )
        self.model.eval()

        adapter_1b = os.getenv("ADAPTER_PHASE1B_PATH", "/mnt/fresh/adapter2/phase1b")
        adapter_2 = os.getenv("ADAPTER_PHASE2_PATH", "/mnt/fresh/adapter2/phase2")
        adapter_onco = os.getenv("ADAPTER_ONCO_PATH", "/mnt/fresh/adapter2/onco")

        # Validate adapter paths exist (unless it's a Hugging Face repo ID)
        for name, path in [("phase1b", adapter_1b), ("phase2", adapter_2), ("onco", adapter_onco)]:
            # Simple heuristic: if it looks like a local path (starts with / or ./ or has \), check it locally.
            # Otherwise assume it's a HuggingFace repo (e.g., 'bobby07007/surgicalcopilot-phase1b-27b')
            is_local = path.startswith("/") or path.startswith("./") or "\\" in path
            if is_local:
                if not os.path.exists(path):
                    raise FileNotFoundError(f"Adapter path not found: {path}")
                config_file = os.path.join(path, "adapter_config.json")
                if not os.path.exists(config_file):
                    raise FileNotFoundError(
                        f"adapter_config.json not found in {path}. "
                        f"Expected files: adapter_config.json, adapter_model.safetensors"
                    )

        logger.info("Loading phase1b adapter from: %s", adapter_1b)
        self.model = PeftModel.from_pretrained(
            self.model, adapter_1b, adapter_name="phase1b",
        )
        logger.info("Loading phase2 adapter from: %s", adapter_2)
        self.model.load_adapter(adapter_2, adapter_name="phase2")
        logger.info("Loading onco adapter from: %s", adapter_onco)
        self.model.load_adapter(adapter_onco, adapter_name="onco")

        self._loaded_adapters.update({"phase1b", "phase2", "onco"})
        self.model.config.use_cache = True
        logger.info("All 27B adapters loaded: %s", self._loaded_adapters)

        # ── 4B vision/enrichment model ────────────────────────────
        model_4b_id = os.getenv("MODEL_4B_ID", "google/medgemma-4b-it")
        logger.info("Loading MedGemma-4B model: %s", model_4b_id)

        self.processor_4b = AutoProcessor.from_pretrained(
            model_4b_id, token=hf_token,
        )
        self.model_4b = AutoModelForCausalLM.from_pretrained(
            model_4b_id,
            token=hf_token,
            torch_dtype=dtype,
            device_map=device,
            low_cpu_mem_usage=True,
        )
        self.model_4b.eval()
        logger.info("MedGemma-4B loaded successfully")

    # ── Stop Token Resolution ─────────────────────────────────────

    def _resolve_stop_token(self, tokenizer=None) -> Optional[int]:
        """Find <end_of_turn> token id, falling back to eos_token_id."""
        tok = tokenizer or self.tokenizer
        eot = tok.convert_tokens_to_ids("<end_of_turn>")
        if isinstance(eot, int) and eot != tok.unk_token_id:
            return eot
        return tok.eos_token_id

    def _build_chat_prompt(self, user_text: str, adapter_name: str) -> str:
        """Build chat-formatted prompt matching training format."""
        system_prompt = SYSTEM_PROMPTS.get(adapter_name, SYSTEM_PROMPTS["phase1b"])
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text},
        ]
        return self.tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )

    async def _generate(
        self,
        prompt: str,
        adapter_name: str,
    ) -> str:
        """Switch adapter on 27B, generate text, decode, return raw string."""
        import torch

        max_tokens = MAX_NEW_TOKENS.get(adapter_name, DEFAULT_MAX_TOKENS)
        stop_token_id = self._resolve_stop_token()
        chat_prompt = self._build_chat_prompt(prompt, adapter_name)

        async with self._model_lock:
            self.model.set_adapter(adapter_name)
            logger.info("Adapter set to '%s' — starting generation (max_tokens=%d)", adapter_name, max_tokens)

            inputs = self.tokenizer(chat_prompt, return_tensors="pt", padding=True, truncation=True)
            input_ids = inputs["input_ids"].to(self.model.device)
            attention_mask = inputs.get("attention_mask")
            if attention_mask is not None:
                attention_mask = attention_mask.to(self.model.device)

            gen_kwargs: dict[str, Any] = {
                "input_ids": input_ids,
                "max_new_tokens": max_tokens,
                "do_sample": False,
                "pad_token_id": self.tokenizer.pad_token_id,
            }
            if attention_mask is not None:
                gen_kwargs["attention_mask"] = attention_mask
            if stop_token_id is not None:
                gen_kwargs["eos_token_id"] = stop_token_id

            with torch.no_grad():
                ctx = torch.amp.autocast("cuda", dtype=torch.bfloat16) if torch.cuda.is_available() else _nullcontext()
                with ctx:
                    output_ids = self.model.generate(**gen_kwargs)

            new_tokens = output_ids[0, input_ids.shape[1]:]
            decoded = self.tokenizer.decode(new_tokens, skip_special_tokens=True)

            eot_marker = "<end_of_turn>"
            if eot_marker in decoded:
                decoded = decoded[:decoded.index(eot_marker)]

            logger.info(
                "Generation complete for '%s' — %d new tokens",
                adapter_name, len(new_tokens),
            )
            return decoded.strip()

    # ── 4B Enrichment Generation ──────────────────────────────────

    async def _generate_4b(
        self,
        user_content: list[dict],
        system_prompt: str,
        adapter: str = "phase1b",
    ) -> str:
        """Run MedGemma 4B with multimodal content (text + optional images)."""
        import torch

        stop_token_id = self._resolve_stop_token(self.processor_4b.tokenizer)

        messages = [
            {"role": "system", "content": [{"type": "text", "text": system_prompt}]},
            {"role": "user", "content": user_content},
        ]

        inputs = self.processor_4b.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
        ).to(self.model_4b.device)

        # Get adapter-specific generation parameters
        gen_params = ENRICH_GEN_PARAMS.get(adapter, {
            "max_new_tokens": ENRICH_MAX_TOKENS,
            "do_sample": True,
            "temperature": 0.7,
            "top_p": 0.9,
            "repetition_penalty": 1.1,
        })

        gen_kwargs: dict[str, Any] = {
            **inputs,
            **gen_params,
        }
        if stop_token_id is not None:
            gen_kwargs["eos_token_id"] = stop_token_id

        async with self._model_4b_lock:
            logger.info("MedGemma-4B enrichment — adapter=%s, starting generation with optimized params", adapter)

            with torch.no_grad():
                ctx = torch.amp.autocast("cuda", dtype=torch.bfloat16) if torch.cuda.is_available() else _nullcontext()
                with ctx:
                    output_ids = self.model_4b.generate(**gen_kwargs)

            input_len = inputs["input_ids"].shape[1]
            new_tokens = output_ids[0, input_len:]
            decoded = self.processor_4b.tokenizer.decode(new_tokens, skip_special_tokens=True)

            eot_marker = "<end_of_turn>"
            if eot_marker in decoded:
                decoded = decoded[:decoded.index(eot_marker)]

            logger.info("4B enrichment complete — %d new tokens", len(new_tokens))
            return decoded.strip()

    # ── CUDA Cleanup ──────────────────────────────────────────────

    @staticmethod
    def _cuda_cleanup() -> None:
        """Release GPU memory on failure."""
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                logger.info("CUDA cache cleared after error")
        except Exception:
            pass

    # ── Public Inference Methods (27B adapters) ───────────────────

    async def infer_phase1b(self, case_text: str, patient_history: list | None = None) -> tuple[str, float, str, bool, str | None]:
        """Returns (raw_text, elapsed_seconds, mode, fallback_used, fallback_reason)."""
        t0 = time.perf_counter()
        if self.demo_mode:
            await asyncio.sleep(0.3)
            return DEMO_PHASE1B, time.perf_counter() - t0, "demo", False, None

        prompt = case_text
        # Patient history context injection temporarily disabled for optimization

        try:
            raw = await asyncio.wait_for(
                self._generate(prompt, "phase1b"),
                timeout=INFER_TIMEOUT_SECONDS,
            )
            return raw, time.perf_counter() - t0, "real", False, None
        except Exception as exc:
            self._cuda_cleanup()
            reason = f"{type(exc).__name__}: {exc}"
            logger.error("phase1b inference failed: %s", reason)
            if AUTO_FALLBACK_TO_DEMO:
                logger.info("Falling back to demo output for phase1b")
                return DEMO_PHASE1B, time.perf_counter() - t0, "demo", True, reason
            raise

    async def infer_phase2(
        self,
        case_text: str,
        post_op_day: int | None = None,
        checkin: dict | None = None,
        patient_history: list | None = None,
    ) -> tuple[str, float, str, bool, str | None]:
        t0 = time.perf_counter()
        if self.demo_mode:
            await asyncio.sleep(0.5)
            return DEMO_PHASE2, time.perf_counter() - t0, "demo", False, None

        prompt = case_text
        if post_op_day is not None:
            prompt = f"Post-operative day {post_op_day}.\n{prompt}"
        
        # Patient history context injection temporarily disabled for optimization
        
        if checkin:
            prompt += f"\n\nCurrent Check-in Data:\n{json.dumps(checkin, indent=2)}"

        try:
            raw = await asyncio.wait_for(
                self._generate(prompt, "phase2"),
                timeout=INFER_TIMEOUT_SECONDS,
            )
            return raw, time.perf_counter() - t0, "real", False, None
        except Exception as exc:
            self._cuda_cleanup()
            reason = f"{type(exc).__name__}: {exc}"
            logger.error("phase2 inference failed: %s", reason)
            if AUTO_FALLBACK_TO_DEMO:
                logger.info("Falling back to demo output for phase2")
                return DEMO_PHASE2, time.perf_counter() - t0, "demo", True, reason
            raise

    async def infer_onco(self, case_text: str, patient_history: list | None = None) -> tuple[str, float, str, bool, str | None]:
        t0 = time.perf_counter()
        if self.demo_mode:
            await asyncio.sleep(0.4)
            return DEMO_ONCO, time.perf_counter() - t0, "demo", False, None

        prompt = case_text
        # Patient history context injection temporarily disabled for optimization

        try:
            raw = await asyncio.wait_for(
                self._generate(prompt, "onco"),
                timeout=INFER_TIMEOUT_SECONDS,
            )
            return raw, time.perf_counter() - t0, "real", False, None
        except Exception as exc:
            self._cuda_cleanup()
            reason = f"{type(exc).__name__}: {exc}"
            logger.error("onco inference failed: %s", reason)
            if AUTO_FALLBACK_TO_DEMO:
                logger.info("Falling back to demo output for onco")
                return DEMO_ONCO, time.perf_counter() - t0, "demo", True, reason
            raise

    # ── Public Enrichment Method (4B) ─────────────────────────────

    async def infer_enrich(
        self,
        adapter: str,
        core_output: dict,
        case_text: str,
        images_b64: list[str] | None = None,
    ) -> tuple[str, float, str]:
        """
        Use MedGemma-4B to generate enrichment fields from 27B core output.
        Returns (raw_text, elapsed_seconds, mode).
        """
        t0 = time.perf_counter()

        if self.demo_mode:
            await asyncio.sleep(0.3)
            # Find if images were provided to tailor the demo output
            has_images = bool(images_b64)
            
            # Fix SBAR for LAR cases in demo mode
            is_lar_case = case_text and ("LAR" in case_text or "low anterior resection" in case_text.lower())
            
            demo_data = {
                "followup_questions": [
                    "Is the redness spreading beyond the initial area marked?",
                    "Are you experiencing any new rigors or shaking chills?",
                    "Have you noticed any change in the odor or consistency of the drainage?",
                    "Are you able to tolerate oral fluids and light meals?"
                ],
                "evidence": [
                    {"source": "Incision Site", "domain": "Wound", "snippet": "erythematous margins with localized warmth noted"},
                    {"source": "Vital Signs", "domain": "Systemic", "snippet": "Temp 38.4°C (persistent), HR 105 bpm"},
                    {"source": "Patient Report", "domain": "Symptomatic", "snippet": "Pain escalated from 3/10 to 7/10 over the last 12 hours"}
                ],
                "patient_message": {
                    "summary": "Your recovery trajectory shows signs of early localized inflammation at the incision site that requiring close monitoring.",
                    "self_care": [
                        "Keep the incision area clean and dry, using only the prescribed dressing.",
                        "Monitor your temperature every 4-6 hours.",
                        "Report any new nausea or persistent vomiting immediately.",
                        "Continue gentle mobilization as tolerated."
                    ],
                    "next_checkin": "Your surgical team will contact you via phone tomorrow morning before 10 AM."
                },
                "sbar": {
                    "situation": "POD8 patient presenting with significant fever (38.9°C), tachycardia (112 bpm), and feculent drainage. Patient reports severe pain (8/10).",
                    "background": "62M underwent low anterior resection (LAR) for rectal cancer. Discharged POD3 with stable parameters." if is_lar_case else "Patient underwent robotic-assisted anterior resection. Discharged on POD 3 with stable parameters.",
                    "assessment": "High likelihood of anastomotic leak with feculent drainage. Clinical findings suggest urgent intervention required. Trajectory is deteriorating.",
                    "recommendation": "Immediate transfer to ED for CT scan to confirm anastomotic leak. Prepare for potential return to OR. Start broad-spectrum antibiotics, NPO status, and surgical consultation STAT."
                },
                "clinical_explanation": (
                    "The combination of moderate per-incisional erythema and a persistent low-grade fever (38.4°C) "
                    "raises concern for early localized infection. While systemic inflammatory markers are not yet "
                    "critically elevated, the rapid escalation in pain 7/10 warrants an 'Amber' escalation level. "
                    "Vision analysis confirms erythematous margins which further supports this escalation."
                )
            }
            
            if has_images:
                demo_data["image_analysis"] = {
                    "wound_status": "erythematous",
                    "concern_level": "medium",
                    "findings": [
                        "Circumferential erythema extending 2cm from incision margins",
                        "No frank purulence or active dehiscence visible",
                        "Skin appears taut with mild localized edema"
                    ],
                    "concerns": ["localized inflammation", "early surgical site infection (SSI)"],
                    "recommendation": "Track margins of erythema; repeat photography in 8 hours to assess for spread."
                }
            
            return json.dumps(demo_data), time.perf_counter() - t0, "demo"

        has_images = bool(images_b64)
        system = ENRICH_SYSTEM_PROMPT + (ENRICH_IMAGE_ADDENDUM if has_images else "")

        user_text = (
            f"Adapter: {adapter}\n\n"
            f"Core clinical decision (from MedGemma-27B):\n"
            f"{json.dumps(core_output, indent=2)}\n\n"
            f"Original case text:\n{case_text}"
        )

        user_content: list[dict] = [{"type": "text", "text": user_text}]

        if has_images:
            from PIL import Image
            for i, img_b64 in enumerate(images_b64):
                try:
                    img_data = base64.b64decode(img_b64)
                    img = Image.open(BytesIO(img_data)).convert("RGB")
                    user_content.append({"type": "image", "image": img})
                    logger.info("Attached image %d (%dx%d) to enrichment request", i, img.width, img.height)
                except Exception as e:
                    logger.warning("Failed to decode image %d: %s", i, e)

        try:
            raw = await asyncio.wait_for(
                self._generate_4b(user_content, system, adapter),
                timeout=ENRICH_TIMEOUT_SECONDS,
            )
            return raw, time.perf_counter() - t0, "real"
        except Exception as exc:
            self._cuda_cleanup()
            logger.error("4B enrichment failed: %s", exc)
            return "{}", time.perf_counter() - t0, "error"


# ── Utility ───────────────────────────────────────────────────────

class _nullcontext:
    """Minimal no-op context manager for non-CUDA paths."""
    def __enter__(self):
        return self
    def __exit__(self, *_):
        pass
