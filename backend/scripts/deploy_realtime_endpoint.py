"""
deploy_realtime_endpoint.py — Create a SageMaker Real-Time Inference endpoint.

Usage:
    python scripts/deploy_realtime_endpoint.py

This script:
  1. Creates a SageMaker Model pointing to your ECR image
  2. Creates an EndpointConfig with GPU instance type
  3. Creates (or updates) the Endpoint

Prerequisites:
  - Docker image pushed to ECR (see create_ecr_repo_and_push.sh)
  - IAM role with SageMaker + ECR permissions
  - boto3 installed: pip install boto3
"""

import argparse
import sys
import time

import boto3

# ── Configuration ─────────────────────────────────────────────
DEFAULTS = {
    "region": "us-east-1",
    "model_name": "surgical-copilot-model",
    "endpoint_config_name": "surgical-copilot-config",
    "endpoint_name": "surgical-copilot-endpoint",
    "instance_type": "ml.g5.xlarge",  # 1× A10G, 24 GB VRAM — fits 4B model
    "instance_count": 1,
    "ecr_repo": "surgical-copilot-inference",
    "image_tag": "latest",
}


def get_ecr_image_uri(account_id: str, region: str, repo: str, tag: str) -> str:
    return f"{account_id}.dkr.ecr.{region}.amazonaws.com/{repo}:{tag}"


def create_model(sm_client, model_name: str, image_uri: str, role_arn: str):
    """Create SageMaker Model."""
    print(f"→ Creating model: {model_name}")
    try:
        sm_client.create_model(
            ModelName=model_name,
            PrimaryContainer={
                "Image": image_uri,
                "Environment": {
                    "DEMO_MODE": "false",
                    "AUTO_FALLBACK_TO_DEMO": "true",
                    "INFER_TIMEOUT_SECONDS": "60",
                },
            },
            ExecutionRoleArn=role_arn,
        )
        print(f"  ✅ Model created: {model_name}")
    except sm_client.exceptions.ClientError as e:
        if "Cannot create already existing model" in str(e):
            print(f"  ⚠️  Model already exists: {model_name}")
        else:
            raise


def create_endpoint_config(sm_client, config_name: str, model_name: str,
                           instance_type: str, instance_count: int):
    """Create EndpointConfig with production variant."""
    print(f"→ Creating endpoint config: {config_name}")
    try:
        sm_client.create_endpoint_config(
            EndpointConfigName=config_name,
            ProductionVariants=[
                {
                    "VariantName": "AllTraffic",
                    "ModelName": model_name,
                    "InstanceType": instance_type,
                    "InitialInstanceCount": instance_count,
                    "InitialVariantWeight": 1.0,
                    "ContainerStartupHealthCheckTimeoutInSeconds": 600,
                },
            ],
        )
        print(f"  ✅ Endpoint config created: {config_name}")
    except sm_client.exceptions.ClientError as e:
        if "Cannot create already existing" in str(e):
            print(f"  ⚠️  Config already exists: {config_name}")
        else:
            raise


def create_or_update_endpoint(sm_client, endpoint_name: str, config_name: str):
    """Create new endpoint or update existing one."""
    print(f"→ Creating/updating endpoint: {endpoint_name}")
    try:
        sm_client.create_endpoint(
            EndpointName=endpoint_name,
            EndpointConfigName=config_name,
        )
        print(f"  ✅ Endpoint creation initiated: {endpoint_name}")
    except sm_client.exceptions.ClientError as e:
        if "Cannot create already existing" in str(e):
            print(f"  ⚠️  Endpoint exists — updating to new config...")
            sm_client.update_endpoint(
                EndpointName=endpoint_name,
                EndpointConfigName=config_name,
            )
            print(f"  ✅ Endpoint update initiated: {endpoint_name}")
        else:
            raise


def wait_for_endpoint(sm_client, endpoint_name: str, timeout: int = 900):
    """Wait for endpoint to be InService."""
    print(f"\n⏳ Waiting for endpoint to be InService (timeout: {timeout}s)...")
    start = time.time()
    while time.time() - start < timeout:
        resp = sm_client.describe_endpoint(EndpointName=endpoint_name)
        status = resp["EndpointStatus"]
        print(f"  Status: {status} ({int(time.time() - start)}s elapsed)")
        if status == "InService":
            print(f"\n✅ Endpoint is InService: {endpoint_name}")
            return
        if status == "Failed":
            reason = resp.get("FailureReason", "Unknown")
            print(f"\n❌ Endpoint failed: {reason}")
            sys.exit(1)
        time.sleep(30)
    print(f"\n⏰ Timeout waiting for endpoint")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Deploy SageMaker Real-Time Endpoint")
    parser.add_argument("--region", default=DEFAULTS["region"])
    parser.add_argument("--model-name", default=DEFAULTS["model_name"])
    parser.add_argument("--endpoint-config-name", default=DEFAULTS["endpoint_config_name"])
    parser.add_argument("--endpoint-name", default=DEFAULTS["endpoint_name"])
    parser.add_argument("--instance-type", default=DEFAULTS["instance_type"])
    parser.add_argument("--instance-count", type=int, default=DEFAULTS["instance_count"])
    parser.add_argument("--ecr-repo", default=DEFAULTS["ecr_repo"])
    parser.add_argument("--image-tag", default=DEFAULTS["image_tag"])
    parser.add_argument("--role-arn", required=True, help="IAM role ARN for SageMaker execution")
    parser.add_argument("--no-wait", action="store_true", help="Don't wait for InService")
    args = parser.parse_args()

    sts = boto3.client("sts", region_name=args.region)
    account_id = sts.get_caller_identity()["Account"]

    image_uri = get_ecr_image_uri(account_id, args.region, args.ecr_repo, args.image_tag)
    print(f"Image URI: {image_uri}")
    print(f"Instance:  {args.instance_type} × {args.instance_count}")
    print()

    sm = boto3.client("sagemaker", region_name=args.region)

    create_model(sm, args.model_name, image_uri, args.role_arn)
    create_endpoint_config(sm, args.endpoint_config_name, args.model_name,
                           args.instance_type, args.instance_count)
    create_or_update_endpoint(sm, args.endpoint_name, args.endpoint_config_name)

    if not args.no_wait:
        wait_for_endpoint(sm, args.endpoint_name)


if __name__ == "__main__":
    main()
