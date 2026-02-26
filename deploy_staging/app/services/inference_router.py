import json
import logging
import os
import uuid
import boto3
from botocore.config import Config
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from ..compliance import ComplianceGate, DataSource, DeIdentificationLogger

load_dotenv(dotenv_path=os.path.join(os.getcwd(), '.env'))

logger = logging.getLogger(__name__)

# Constants (mirrored from gateway for compatibility)
AWS_REGION = os.getenv("AWS_REGION", "us-west-2")
SM_CONNECT_TIMEOUT = 3
SM_READ_TIMEOUT = 60 # User-compliant 60s

# Lazy client
_sm_client = None

# Compliance gate instance (default to synthetic for demo mode)
_compliance_gate = None
_deident_logger = None

def get_compliance_gate() -> ComplianceGate:
    """Get or create the compliance gate instance."""
    global _compliance_gate
    if _compliance_gate is None:
        # Default to SYNTHETIC for demo/development; can be overridden via env
        source_str = os.getenv("DATA_SOURCE", "synthetic").lower()
        source_map = {
            "synthetic": DataSource.SYNTHETIC,
            "demo": DataSource.DEMO,
            "mimic": DataSource.MIMIC,
            "tcia": DataSource.TCIA,
            "clinical": DataSource.CLINICAL,
        }
        data_source = source_map.get(source_str, DataSource.SYNTHETIC)
        _compliance_gate = ComplianceGate(data_source)
    return _compliance_gate

def get_deident_logger() -> DeIdentificationLogger:
    """Get or create the de-identification audit logger."""
    global _deident_logger
    if _deident_logger is None:
        log_path = os.getenv("DEIDENT_LOG_PATH", "deidentification_audit.jsonl")
        _deident_logger = DeIdentificationLogger(log_path)
    return _deident_logger

def get_sm_client():
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

def _extract_json_from_text(text: str) -> Optional[Dict]:
    """Balanced brace JSON extraction."""
    if not text: return None
    try:
        start = text.find('{')
        if start == -1: return None
        stack = 0
        for i in range(start, len(text)):
            if text[i] == '{': stack += 1
            elif text[i] == '}':
                stack -= 1
                if stack == 0:
                    json_str = text[start : i + 1]
                    try: return json.loads(json_str)
                    except: pass
    except: pass
    return None

async def run_inference(phase: str, endpoint_name: str, payload: Dict[str, Any], locked_prompt: str) -> Dict[str, Any]:
    """
    Executes real inference or returns fallback if failed/disabled.
    Includes compliance checking before inference.
    Returns the standard wrapper schema.
    """
    request_id = f"req-{uuid.uuid4().hex[:8]}"
    
    # Payload Construction
    case_text = payload.get("case_text", json.dumps(payload))
    
    # Compliance check before inference
    gate = get_compliance_gate()
    compliance_report = gate.check_text(case_text)
    
    if not compliance_report.passed:
        logger.warning(f"Compliance check failed for {request_id}: {compliance_report.warnings}")
        # Log the compliance failure
        deident_logger = get_deident_logger()
        deident_logger.log_check(
            input_hash=DeIdentificationLogger.hash_input(case_text),
            data_source=gate.data_source,
            report=compliance_report,
            action_taken="blocked"
        )
        return {
            "ok": False,
            "request_id": request_id,
            "mode": "blocked",
            "fallback_used": False,
            "raw_text": "",
            "parsed_data": {},
            "error": f"Compliance check failed: {compliance_report.warnings}",
            "compliance": {
                "passed": False,
                "phi_count": len(compliance_report.phi_findings),
                "warnings": compliance_report.warnings,
            }
        }
    
    # Check if external LLM is allowed based on data source
    inference_mode = gate.get_inference_mode()
    
    sm_payload = {
        "inputs": f"{locked_prompt}\n\nCase Data:\n{case_text}\n\nAnalysis and JSON:",
        "parameters": {
            "max_new_tokens": 800,
            "temperature": 0.1,
            "stop": ["\n\n"]
        }
    }

    try:
        # Check if SageMaker is enabled
        if os.getenv("SAGEMAKER_MODE", "true").lower() not in ("1", "true", "yes"):
            raise Exception("SAGEMAKER_MODE is false")
        
        # Check if inference mode allows external calls
        if inference_mode == "local_only":
            logger.info(f"Local-only mode for {request_id}, using demo fallback")
            raise Exception("Data source requires local-only processing")

        sm = get_sm_client()
        response = sm.invoke_endpoint(
            EndpointName=endpoint_name,
            ContentType="application/json",
            Body=json.dumps(sm_payload),
        )
        
        raw_body = response["Body"].read().decode("utf-8")
        result = json.loads(raw_body)
        
        # Handle SM LLM response wrapping
        raw_text = ""
        if isinstance(result, list) and len(result) > 0: # Some models return a list
             result = result[0]
             
        if isinstance(result, dict):
            raw_text = result.get("generated_text") or result.get("text") or str(result)
        else:
            raw_text = str(result)
            
        parsed = _extract_json_from_text(raw_text) or result
        
        # Log successful inference
        deident_logger = get_deident_logger()
        deident_logger.log_check(
            input_hash=DeIdentificationLogger.hash_input(case_text),
            data_source=gate.data_source,
            report=compliance_report,
            action_taken="inference_completed"
        )
        
        return {
            "ok": True,
            "request_id": request_id,
            "mode": "real",
            "fallback_used": False,
            "raw_text": raw_text,
            "parsed_data": parsed,
            "error": None,
            "compliance": {
                "passed": True,
                "inference_mode": inference_mode,
            }
        }

    except Exception as e:
        logger.error(f"Inference failed for {phase}: {e}")
        # Deterministic Fallback Data
        return {
            "ok": True, # Still true because we have a valid demo fallback
            "request_id": request_id,
            "mode": "demo",
            "fallback_used": True,
            "fallback_reason": str(e),
            "raw_text": "FALLBACK_DEMO_OUTPUT",
            "parsed_data": {}, # Will be filled by the caller with route-specific defaults
            "error": str(e),
            "compliance": {
                "passed": True,
                "inference_mode": inference_mode if 'inference_mode' in dir() else "standard",
            }
        }
