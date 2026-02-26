"""
Surgical Copilot - Evaluation Harness
=====================================
Simplified evaluation harness for running adapter evaluations.
Based on the enhanced evaluation suite aligned with DECIDE-AI framework.
"""

import json
from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional
from datetime import datetime


@dataclass
class EvalCase:
    """A single evaluation case"""
    case_id: str
    adapter: str
    input_data: Dict[str, Any]
    expected_output: Dict[str, Any]
    actual_output: Optional[Dict[str, Any]] = None
    passed: Optional[bool] = None
    errors: Optional[List[str]] = None


@dataclass
class EvalMetrics:
    """Evaluation metrics summary"""
    adapter: str
    total_cases: int
    passed_cases: int
    failed_cases: int
    parse_rate: float
    schema_rate: float
    high_risk_recall: float
    accuracy: float
    run_timestamp: str


# Adapter schema requirements
ADAPTER_SCHEMAS = {
    "phase1b": {
        "required_keys": ["label_class", "trajectory", "red_flag_triggered"],
        "label_key": "label_class",
        "valid_labels": ["operate_now", "watch_wait", "avoid"],
        "high_risk_label": "operate_now",
    },
    "phase2": {
        "required_keys": ["label_class", "risk_score", "trajectory"],
        "label_key": "label_class", 
        "valid_labels": ["green", "amber", "red"],
        "high_risk_label": "red",
    },
    "onco": {
        "required_keys": ["label_class", "progression_status"],
        "label_key": "label_class",
        "valid_labels": ["stable_disease", "possible_progression", "confirmed_progression"],
        "high_risk_label": "confirmed_progression",
    },
}


def validate_output_schema(adapter: str, output: Dict[str, Any]) -> tuple[bool, List[str]]:
    """Validate that output matches expected schema for adapter."""
    schema = ADAPTER_SCHEMAS.get(adapter)
    if not schema:
        return False, [f"Unknown adapter: {adapter}"]
    
    errors = []
    
    # Check required keys
    for key in schema["required_keys"]:
        if key not in output:
            errors.append(f"Missing required key: {key}")
    
    # Check label validity
    label_key = schema["label_key"]
    if label_key in output:
        label = output[label_key]
        if label not in schema["valid_labels"]:
            errors.append(f"Invalid {label_key}: {label}. Expected one of {schema['valid_labels']}")
    
    return len(errors) == 0, errors


def compare_outputs(expected: Dict[str, Any], actual: Dict[str, Any], adapter: str) -> tuple[bool, List[str]]:
    """Compare expected vs actual output for an adapter."""
    schema = ADAPTER_SCHEMAS.get(adapter, {})
    label_key = schema.get("label_key", "label_class")
    
    errors = []
    
    # Primary label match
    expected_label = expected.get(label_key)
    actual_label = actual.get(label_key)
    
    if expected_label != actual_label:
        errors.append(f"Label mismatch: expected {expected_label}, got {actual_label}")
    
    # Trajectory match (if present)
    if "trajectory" in expected and "trajectory" in actual:
        if expected["trajectory"] != actual["trajectory"]:
            errors.append(f"Trajectory mismatch: expected {expected['trajectory']}, got {actual['trajectory']}")
    
    # Red flag match for phase1b
    if adapter == "phase1b":
        expected_rf = expected.get("red_flag_triggered", False)
        actual_rf = actual.get("red_flag_triggered", False)
        if expected_rf != actual_rf:
            errors.append(f"Red flag mismatch: expected {expected_rf}, got {actual_rf}")
    
    return len(errors) == 0, errors


def run_evaluation(cases: List[EvalCase], run_inference_fn=None) -> Dict[str, Any]:
    """
    Run evaluation on a list of cases.
    
    Args:
        cases: List of EvalCase objects with input_data and expected_output
        run_inference_fn: Optional async function to run inference. 
                         If None, uses actual_output from cases.
    
    Returns:
        Dictionary with metrics and detailed results
    """
    results_by_adapter = {}
    
    for case in cases:
        adapter = case.adapter
        if adapter not in results_by_adapter:
            results_by_adapter[adapter] = {
                "cases": [],
                "total": 0,
                "passed": 0,
                "failed": 0,
                "parse_errors": 0,
                "schema_errors": 0,
                "high_risk_expected": 0,
                "high_risk_correct": 0,
            }
        
        stats = results_by_adapter[adapter]
        stats["total"] += 1
        
        # Get actual output (either from case or by running inference)
        actual = case.actual_output
        if actual is None and run_inference_fn:
            # Would need to be called async - for now skip
            case.errors = ["No actual output and no inference function"]
            case.passed = False
            stats["failed"] += 1
            stats["cases"].append(asdict(case))
            continue
        
        if actual is None:
            case.errors = ["No actual output provided"]
            case.passed = False
            stats["failed"] += 1
            stats["parse_errors"] += 1
            stats["cases"].append(asdict(case))
            continue
        
        # Validate schema
        schema_valid, schema_errors = validate_output_schema(adapter, actual)
        if not schema_valid:
            stats["schema_errors"] += 1
        
        # Compare outputs
        match, compare_errors = compare_outputs(case.expected_output, actual, adapter)
        
        # Track high-risk recall
        schema = ADAPTER_SCHEMAS.get(adapter, {})
        high_risk_label = schema.get("high_risk_label")
        label_key = schema.get("label_key", "label_class")
        
        if case.expected_output.get(label_key) == high_risk_label:
            stats["high_risk_expected"] += 1
            if actual.get(label_key) == high_risk_label:
                stats["high_risk_correct"] += 1
        
        # Record result
        case.passed = match and schema_valid
        case.errors = schema_errors + compare_errors if not case.passed else []
        
        if case.passed:
            stats["passed"] += 1
        else:
            stats["failed"] += 1
        
        stats["cases"].append(asdict(case))
    
    # Calculate metrics per adapter
    metrics = {}
    for adapter, stats in results_by_adapter.items():
        total = stats["total"]
        metrics[adapter] = EvalMetrics(
            adapter=adapter,
            total_cases=total,
            passed_cases=stats["passed"],
            failed_cases=stats["failed"],
            parse_rate=1.0 - (stats["parse_errors"] / total) if total > 0 else 0,
            schema_rate=1.0 - (stats["schema_errors"] / total) if total > 0 else 0,
            high_risk_recall=(
                stats["high_risk_correct"] / stats["high_risk_expected"]
                if stats["high_risk_expected"] > 0 else 1.0
            ),
            accuracy=stats["passed"] / total if total > 0 else 0,
            run_timestamp=datetime.utcnow().isoformat(),
        )
    
    return {
        "summary": {adapter: asdict(m) for adapter, m in metrics.items()},
        "details": results_by_adapter,
        "timestamp": datetime.utcnow().isoformat(),
    }


def load_synthetic_cases() -> List[EvalCase]:
    """Load the 9 synthetic cases for evaluation."""
    import os
    from pathlib import Path
    
    # Try to load from JSONL file
    jsonl_paths = [
        Path(__file__).parent.parent.parent.parent / "synthetic_cases_9_reality_anchored.jsonl",
        Path("c:/Users/aayus/Downloads/synthetic_cases_9_reality_anchored.jsonl"),
    ]
    
    cases = []
    
    for jsonl_path in jsonl_paths:
        if jsonl_path.exists():
            with open(jsonl_path, 'r') as f:
                for line in f:
                    if line.strip():
                        data = json.loads(line)
                        cases.append(EvalCase(
                            case_id=data.get("case_id", "unknown"),
                            adapter=data.get("adapter", "phase1b"),
                            input_data=data.get("input", {}),
                            expected_output=data.get("expected_output", {}),
                        ))
            break
    
    return cases


def generate_eval_report(results: Dict[str, Any]) -> str:
    """Generate a human-readable evaluation report."""
    lines = [
        "=" * 60,
        "SURGICAL COPILOT EVALUATION REPORT",
        f"Generated: {results['timestamp']}",
        "=" * 60,
        "",
    ]
    
    for adapter, metrics in results["summary"].items():
        lines.extend([
            f"ADAPTER: {adapter.upper()}",
            "-" * 40,
            f"  Total Cases:      {metrics['total_cases']}",
            f"  Passed:           {metrics['passed_cases']}",
            f"  Failed:           {metrics['failed_cases']}",
            f"  Parse Rate:       {metrics['parse_rate']:.1%}",
            f"  Schema Rate:      {metrics['schema_rate']:.1%}",
            f"  High-Risk Recall: {metrics['high_risk_recall']:.1%}",
            f"  Accuracy:         {metrics['accuracy']:.1%}",
            "",
        ])
    
    lines.append("=" * 60)
    return "\n".join(lines)
