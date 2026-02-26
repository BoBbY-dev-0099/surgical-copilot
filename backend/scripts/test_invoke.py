"""
test_invoke.py — Send a test request to a SageMaker Real-Time endpoint.

Usage:
    python scripts/test_invoke.py
    python scripts/test_invoke.py --route onco --endpoint-name my-endpoint
"""

import argparse
import json
import sys

import boto3

DEFAULTS = {
    "region": "us-west-2",
    "endpoint_name": "sc-phase1b-20260219-084556-cfg",
}

SAMPLE_PAYLOADS = {
    "phase1b": {
        "route": "phase1b",
        "case_text": (
            "Post-operative day 3 partial nephrectomy. HR 98, temp 37.8°C, "
            "WBC 12.3, creatinine 1.4, drain output 180mL. Wound erythema "
            "expanding. Patient reports moderate pain 6/10."
        ),
        "patient_id": "PT-TEST-001",
    },
    "phase2": {
        "route": "phase2",
        "case_text": (
            "Day 8 post sigmoid resection. Worsening abdominal pain 7/10, "
            "fever 38.5°C for 3 days, vomiting, no bowel movement for 48 hours."
        ),
        "patient_id": "PT-TEST-002",
        "post_op_day": 8,
    },
    "onco": {
        "route": "onco",
        "case_text": (
            "Stage IIB colon adenocarcinoma, 3 months post-resection. "
            "CEA: 4.5 → 3.2 → 2.8. CT negative. MSS, 0/18 nodes. "
            "CAPOX cycle 2 tolerated well. QoL 78/100."
        ),
        "patient_id": "PT-TEST-003",
    },
}


def main():
    parser = argparse.ArgumentParser(description="Test SageMaker endpoint invocation")
    parser.add_argument("--region", default=DEFAULTS["region"])
    parser.add_argument("--endpoint-name", default=DEFAULTS["endpoint_name"])
    parser.add_argument("--route", default="phase1b", choices=["phase1b", "phase2", "onco"])
    parser.add_argument("--custom-payload", type=str, help="JSON string payload (overrides sample)")
    args = parser.parse_args()

    if args.custom_payload:
        payload = json.loads(args.custom_payload)
    else:
        sample = SAMPLE_PAYLOADS[args.route]
        # Standard SageMaker format often expects "inputs"
        payload = {
            "inputs": f"Prompt: You are a surgical copilot. Analyze this case and return JSON.\nCase: {sample['case_text']}",
            "parameters": {"max_new_tokens": 512, "temperature": 0.1}
        }

    print(f"Endpoint: {args.endpoint_name}")
    print(f"Route:    {args.route}")
    print(f"Payload (wrapped): {json.dumps(payload, indent=2)}")
    print()

    runtime = boto3.client("sagemaker-runtime", region_name=args.region)

    try:
        response = runtime.invoke_endpoint(
            EndpointName=args.endpoint_name,
            ContentType="application/json",
            Body=json.dumps(payload),
        )

        raw_body = response["Body"].read().decode("utf-8")
        with open("backend/scripts/last_response.raw", "w") as f:
            f.write(raw_body)
        
        result = json.loads(raw_body)
        with open("backend/scripts/last_response.json", "w") as f:
            json.dump(result, f, indent=2)

        print(f"Success! Response saved to backend/scripts/last_response.json")
        print(f"Keys found: {list(result.keys()) if isinstance(result, dict) else 'Not a dict'}")

    except Exception as e:
        print(f"❌ Invocation failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
