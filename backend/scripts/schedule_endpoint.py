"""
schedule_endpoint.py — Schedule SageMaker endpoint on/off using
EventBridge + Lambda (cost saving).

Usage:
    python scripts/schedule_endpoint.py --endpoint-name surgical-copilot-endpoint

This creates:
  1. A Lambda function that starts/stops the endpoint
  2. Two EventBridge rules:
     - Start at 09:00 UTC (configurable)
     - Stop at 23:00 UTC (configurable)

If the exact judging window is unknown, you can:
  - Keep the endpoint running 24/7 (skip this script)
  - Adjust the schedule later via AWS Console or re-run with new times
  - Set a wider window (e.g., 06:00-02:00) to cover all timezones

Note: Starting an endpoint takes 5-10 minutes. Schedule the start
time early enough before judges are expected.
"""

import argparse
import json
import textwrap

import boto3

DEFAULTS = {
    "region": "us-east-1",
    "endpoint_name": "surgical-copilot-endpoint",
    "start_hour_utc": 3,   # 09:00 NPT = 03:15 UTC (rounded to 03:00)
    "stop_hour_utc": 17,   # 23:00 NPT = 17:15 UTC (rounded to 17:00)
    "lambda_name": "surgical-copilot-scheduler",
}

LAMBDA_CODE = textwrap.dedent("""\
import json
import os
import boto3

def handler(event, context):
    sm = boto3.client("sagemaker")
    endpoint_name = os.environ["ENDPOINT_NAME"]
    action = event.get("action", "describe")

    if action == "start":
        # Re-create endpoint from existing config
        try:
            config_name = f"{endpoint_name}-config"
            sm.create_endpoint(
                EndpointName=endpoint_name,
                EndpointConfigName=config_name,
            )
            return {"status": "starting", "endpoint": endpoint_name}
        except Exception as e:
            if "Cannot create already existing" in str(e):
                return {"status": "already_running", "endpoint": endpoint_name}
            raise

    elif action == "stop":
        try:
            sm.delete_endpoint(EndpointName=endpoint_name)
            return {"status": "stopping", "endpoint": endpoint_name}
        except Exception as e:
            if "Could not find endpoint" in str(e):
                return {"status": "already_stopped", "endpoint": endpoint_name}
            raise

    else:
        resp = sm.describe_endpoint(EndpointName=endpoint_name)
        return {"status": resp["EndpointStatus"], "endpoint": endpoint_name}
""")


def main():
    parser = argparse.ArgumentParser(description="Schedule SageMaker endpoint on/off")
    parser.add_argument("--region", default=DEFAULTS["region"])
    parser.add_argument("--endpoint-name", default=DEFAULTS["endpoint_name"])
    parser.add_argument("--start-hour-utc", type=int, default=DEFAULTS["start_hour_utc"],
                        help="Hour (UTC) to start endpoint (default: 3 = ~09:00 NPT)")
    parser.add_argument("--stop-hour-utc", type=int, default=DEFAULTS["stop_hour_utc"],
                        help="Hour (UTC) to stop endpoint (default: 17 = ~23:00 NPT)")
    parser.add_argument("--lambda-role-arn", required=True,
                        help="IAM role for Lambda (needs sagemaker:* permissions)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be created without creating anything")
    args = parser.parse_args()

    start_cron = f"cron(0 {args.start_hour_utc} * * ? *)"
    stop_cron = f"cron(0 {args.stop_hour_utc} * * ? *)"

    print(f"Endpoint:   {args.endpoint_name}")
    print(f"Start:      {start_cron} (UTC hour {args.start_hour_utc})")
    print(f"Stop:       {stop_cron} (UTC hour {args.stop_hour_utc})")
    print()

    if args.dry_run:
        print("DRY RUN — no resources created")
        print(f"\nLambda code:\n{LAMBDA_CODE}")
        return

    lam = boto3.client("lambda", region_name=args.region)
    events = boto3.client("events", region_name=args.region)

    # Create Lambda function
    print(f"→ Creating Lambda: {args.lambda_name}")
    import zipfile
    import io
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("lambda_function.py", LAMBDA_CODE)
    buf.seek(0)

    try:
        lam.create_function(
            FunctionName=args.lambda_name,
            Runtime="python3.11",
            Role=args.lambda_role_arn,
            Handler="lambda_function.handler",
            Code={"ZipFile": buf.read()},
            Timeout=300,
            Environment={"Variables": {"ENDPOINT_NAME": args.endpoint_name}},
        )
        print(f"  ✅ Lambda created")
    except lam.exceptions.ResourceConflictException:
        print(f"  ⚠️  Lambda already exists — updating code...")
        buf.seek(0)
        lam.update_function_code(
            FunctionName=args.lambda_name,
            ZipFile=buf.read(),
        )

    lambda_arn = lam.get_function(FunctionName=args.lambda_name)["Configuration"]["FunctionArn"]

    # Create EventBridge rules
    for action, cron, suffix in [("start", start_cron, "start"), ("stop", stop_cron, "stop")]:
        rule_name = f"{args.endpoint_name}-{suffix}"
        print(f"→ Creating EventBridge rule: {rule_name} ({cron})")

        events.put_rule(
            Name=rule_name,
            ScheduleExpression=cron,
            State="ENABLED",
        )

        events.put_targets(
            Rule=rule_name,
            Targets=[{
                "Id": f"{suffix}-target",
                "Arn": lambda_arn,
                "Input": json.dumps({"action": action}),
            }],
        )

        # Add Lambda invoke permission
        try:
            lam.add_permission(
                FunctionName=args.lambda_name,
                StatementId=f"eventbridge-{suffix}",
                Action="lambda:InvokeFunction",
                Principal="events.amazonaws.com",
                SourceArn=events.describe_rule(Name=rule_name)["Arn"],
            )
        except lam.exceptions.ResourceConflictException:
            pass  # permission already exists

        print(f"  ✅ Rule created")

    print(f"\n✅ Scheduling configured!")
    print(f"   Start: {start_cron}")
    print(f"   Stop:  {stop_cron}")
    print(f"\nTo keep the endpoint running 24/7, disable these rules in the AWS Console")
    print(f"or delete them: aws events delete-rule --name {args.endpoint_name}-start")


if __name__ == "__main__":
    main()
