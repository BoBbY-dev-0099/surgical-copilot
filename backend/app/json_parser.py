"""
Robust JSON extraction from noisy LLM output.

Handles:
- Markdown code fences (```json ... ```)
- Multiple JSON objects (picks the FIRST complete one)
- Repeated / trailing JSON after the first valid object
- Pipe-delimited strings inside lists (splits "a|b|c" → ["a", "b", "c"])
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


def strip_code_fences(text: str) -> str:
    """Remove ```json ... ``` or ``` ... ``` wrappers."""
    text = re.sub(r"```(?:json)?\s*\n?", "", text)
    return text.strip()


def extract_first_json_object(text: str) -> str | None:
    """
    Scan for the first balanced { ... } in *text*.

    Uses a depth counter; handles strings (including escaped quotes)
    so braces inside JSON string values don't confuse us.
    """
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape_next = False

    for i in range(start, len(text)):
        ch = text[i]

        if escape_next:
            escape_next = False
            continue

        if ch == "\\":
            if in_string:
                escape_next = True
            continue

        if ch == '"':
            in_string = not in_string
            continue

        if in_string:
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]

    return None  # unbalanced braces


def _split_pipe_values(obj: Any) -> Any:
    """
    Walk parsed JSON and split pipe-delimited strings inside lists.

    Example:
        ["a|b|c", "d"] → ["a", "b", "c", "d"]

    Only applies to lists whose elements are strings.  Nested dicts
    are traversed recursively.
    """
    if isinstance(obj, dict):
        return {k: _split_pipe_values(v) for k, v in obj.items()}
    if isinstance(obj, list):
        expanded: list[Any] = []
        for item in obj:
            if isinstance(item, str) and "|" in item:
                expanded.extend(part.strip() for part in item.split("|") if part.strip())
            else:
                expanded.append(_split_pipe_values(item))
        return expanded
    return obj


def parse_model_output(raw_text: str) -> tuple[dict[str, Any] | None, str | None]:
    """
    Parse raw LLM text into a JSON dict.

    Returns (parsed_dict, None) on success, or (None, error_message) on failure.
    """
    if not raw_text or not raw_text.strip():
        return None, "Empty model output"

    cleaned = strip_code_fences(raw_text)
    json_str = extract_first_json_object(cleaned)

    if json_str is None:
        logger.warning("No JSON object found in model output (length=%d)", len(raw_text))
        return None, "No JSON object found in model output"

    try:
        parsed = json.loads(json_str)
    except json.JSONDecodeError as exc:
        logger.warning("JSON decode failed: %s", exc)
        return None, f"JSON decode error: {exc}"

    if not isinstance(parsed, dict):
        return None, f"Expected JSON object, got {type(parsed).__name__}"

    # Split any pipe-delimited strings inside list fields
    parsed = _split_pipe_values(parsed)

    return parsed, None
