"""
Alert notification system.

Supports:
  - In-app alerts (always created via storage)
  - SMS via Twilio (if TWILIO_* env vars configured)
  - Push notifications (stubbed behind interface)

Alert triggers:
  - risk severity >= SEV2 after saving a note
  - model output indicates red_flag_triggered
  - inference failed + demo fallback used AND risk is amber/red
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

# ── Twilio configuration ──────────────────────────────────────────

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")

_twilio_client = None


def _get_twilio_client():
    global _twilio_client
    if _twilio_client is not None:
        return _twilio_client
    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER]):
        return None
    try:
        from twilio.rest import Client
        _twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        return _twilio_client
    except ImportError:
        logger.info("twilio package not installed — SMS disabled")
        return None
    except Exception as e:
        logger.warning("Failed to init Twilio client: %s", e)
        return None


# ── Notification interface ────────────────────────────────────────

def send_sms(to: str, message: str) -> bool:
    """Send SMS via Twilio. Returns True if sent, False otherwise."""
    if not to or not to.strip():
        logger.debug("No phone number provided — skipping SMS")
        return False

    client = _get_twilio_client()
    if client is None:
        logger.info("SMS not configured — would send to %s: %s", to, message[:80])
        return False

    try:
        msg = client.messages.create(
            body=message,
            from_=TWILIO_FROM_NUMBER,
            to=to,
        )
        logger.info("SMS sent to %s (sid=%s)", to, msg.sid)
        return True
    except Exception as e:
        logger.error("SMS send failed to %s: %s", to, e)
        return False


def send_push(token: str, payload: dict[str, Any]) -> bool:
    """Stub for push notifications. Returns False (not implemented)."""
    logger.debug("Push notification stub — token=%s payload=%s", token[:20] if token else "", payload)
    return False


# ── Alert creation logic ──────────────────────────────────────────

def build_alert_message(
    patient_name: str,
    patient_id: str,
    severity: str,
    triggers: list[str],
    risk_level: str,
    is_demo_fallback: bool = False,
) -> str:
    """Build a concise, actionable alert message."""
    parts = [f"⚠ Surgical Copilot Alert [{severity}]"]
    parts.append(f"Patient: {patient_name} ({patient_id})")
    parts.append(f"Risk: {risk_level.upper()}")

    if is_demo_fallback:
        parts.append("Note: Inference used demo fallback — verify manually.")

    if triggers:
        parts.append(f"Triggers: {', '.join(triggers[:5])}")

    if severity == "SEV1":
        parts.append("ACTION: Immediate clinical review required.")
    elif severity == "SEV2":
        parts.append("ACTION: Review within 1 hour.")

    return "\n".join(parts)


def should_alert(
    risk_eval: dict[str, Any],
    inference_result: dict[str, Any] | None = None,
    is_demo_fallback: bool = False,
) -> tuple[bool, str]:
    """
    Determine if an alert should be created.

    Returns (should_create, kind) where kind is the alert type.
    """
    severity = risk_eval.get("severity_recommended", "SEV3")
    risk_level = risk_eval.get("risk_level", "green")

    # SEV2 or SEV1 → always alert
    if severity in ("SEV1", "SEV2"):
        return True, "risk_threshold"

    # Model says red_flag_triggered
    if inference_result:
        data = inference_result.get("data") or inference_result
        if data.get("red_flag_triggered"):
            return True, "model_red_flag"

    # Demo fallback + amber/red risk
    if is_demo_fallback and risk_level in ("amber", "red"):
        return True, "demo_fallback_risk"

    return False, ""


def process_alerts(
    patient: dict[str, Any],
    risk_eval: dict[str, Any],
    inference_result: dict[str, Any] | None = None,
    is_demo_fallback: bool = False,
) -> list[dict[str, Any]]:
    """
    Check if alerts should be created and send notifications.

    Returns list of alert records created (via storage).
    """
    from app.storage import create_alert

    do_alert, kind = should_alert(risk_eval, inference_result, is_demo_fallback)
    if not do_alert:
        return []

    severity = risk_eval.get("severity_recommended", "SEV3")
    triggers = risk_eval.get("triggers", [])
    risk_level = risk_eval.get("risk_level", "green")

    message = build_alert_message(
        patient_name=patient.get("name", "Unknown"),
        patient_id=patient.get("id", "?"),
        severity=severity,
        triggers=triggers,
        risk_level=risk_level,
        is_demo_fallback=is_demo_fallback,
    )

    channels: list[str] = ["in_app"]

    # Send SMS to clinician and nurse
    clinician_phone = patient.get("clinician_phone", "")
    nurse_phone = patient.get("nurse_phone", "")

    if send_sms(clinician_phone, message):
        channels.append("sms_clinician")
    if send_sms(nurse_phone, message):
        channels.append("sms_nurse")

    alert = create_alert(
        patient_id=patient["id"],
        severity=severity,
        kind=kind,
        message=message,
        channels_sent=channels,
    )

    return [alert]
