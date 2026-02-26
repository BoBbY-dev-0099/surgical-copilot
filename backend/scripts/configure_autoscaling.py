"""
configure_autoscaling.py — Set up target-tracking autoscaling for a
SageMaker Real-Time Endpoint.

Usage:
    python scripts/configure_autoscaling.py --endpoint-name surgical-copilot-endpoint

Scaling policy:
  - Metric: SageMakerVariantInvocationsPerInstance
  - Target: 5 invocations/instance (conservative for 4B model, ~1-3s per request)
  - MinCapacity: 1
  - MaxCapacity: 3  (handles bursts up to ~15 concurrent)
  - Scale-in cooldown: 600s (10 min — avoid thrashing)
  - Scale-out cooldown: 120s (2 min — fast response to load)

Sizing rationale for ~15 concurrent users:
  - MedGemma 4B with MAX_NEW_TOKENS=512: ~1-3s per inference
  - At 5 invocations/instance target, each instance handles ~2-5 req/s
  - 15 concurrent users → ~5-8 req/s peak → 2 instances handle it
  - MaxCapacity=3 provides headroom for burst traffic
"""

import argparse

import boto3

DEFAULTS = {
    "region": "us-east-1",
    "endpoint_name": "surgical-copilot-endpoint",
    "variant_name": "AllTraffic",
    "min_capacity": 1,
    "max_capacity": 3,
    "target_value": 5.0,  # invocations per instance
    "scale_in_cooldown": 600,
    "scale_out_cooldown": 120,
}


def main():
    parser = argparse.ArgumentParser(description="Configure SageMaker autoscaling")
    parser.add_argument("--region", default=DEFAULTS["region"])
    parser.add_argument("--endpoint-name", default=DEFAULTS["endpoint_name"])
    parser.add_argument("--variant-name", default=DEFAULTS["variant_name"])
    parser.add_argument("--min-capacity", type=int, default=DEFAULTS["min_capacity"])
    parser.add_argument("--max-capacity", type=int, default=DEFAULTS["max_capacity"])
    parser.add_argument("--target-value", type=float, default=DEFAULTS["target_value"])
    parser.add_argument("--scale-in-cooldown", type=int, default=DEFAULTS["scale_in_cooldown"])
    parser.add_argument("--scale-out-cooldown", type=int, default=DEFAULTS["scale_out_cooldown"])
    args = parser.parse_args()

    resource_id = (
        f"endpoint/{args.endpoint_name}/variant/{args.variant_name}"
    )

    aas = boto3.client("application-autoscaling", region_name=args.region)

    # Step 1: Register scalable target
    print(f"→ Registering scalable target: {resource_id}")
    aas.register_scalable_target(
        ServiceNamespace="sagemaker",
        ResourceId=resource_id,
        ScalableDimension="sagemaker:variant:DesiredInstanceCount",
        MinCapacity=args.min_capacity,
        MaxCapacity=args.max_capacity,
    )
    print(f"  ✅ Min={args.min_capacity}, Max={args.max_capacity}")

    # Step 2: Create target-tracking scaling policy
    policy_name = f"{args.endpoint_name}-invocations-scaling"
    print(f"→ Creating scaling policy: {policy_name}")
    aas.put_scaling_policy(
        PolicyName=policy_name,
        ServiceNamespace="sagemaker",
        ResourceId=resource_id,
        ScalableDimension="sagemaker:variant:DesiredInstanceCount",
        PolicyType="TargetTrackingScaling",
        TargetTrackingScalingPolicyConfiguration={
            "TargetValue": args.target_value,
            "PredefinedMetricSpecification": {
                "PredefinedMetricType": "SageMakerVariantInvocationsPerInstance",
            },
            "ScaleInCooldown": args.scale_in_cooldown,
            "ScaleOutCooldown": args.scale_out_cooldown,
        },
    )
    print(f"  ✅ Target: {args.target_value} invocations/instance")
    print(f"  ✅ Scale-out cooldown: {args.scale_out_cooldown}s")
    print(f"  ✅ Scale-in cooldown: {args.scale_in_cooldown}s")

    print(f"\n✅ Autoscaling configured for {args.endpoint_name}")
    print(f"\nTo adjust for more users, increase --max-capacity or --target-value")
    print(f"Example: --max-capacity 5 --target-value 8")


if __name__ == "__main__":
    main()
