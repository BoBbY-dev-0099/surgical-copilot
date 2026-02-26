import json
import sys
import os
try:
    import boto3
except ImportError:
    print("Error: 'boto3' not found. Please run: pip install boto3 botocore")
    sys.exit(1)
import time

def main():
    if len(sys.argv) < 2:
        print("Usage: python deploy_ecs.py <tag>")
        sys.exit(1)

    tag = sys.argv[1]
    family = "sc-gateway"
    cluster = "surgical-copilot2"
    service = "sc-gateway-svc"
    account_id = "318724430879"
    region = "us-west-2"
    repo = f"{account_id}.dkr.ecr.{region}.amazonaws.com/sc-backend"
    new_image = f"{repo}:{tag}"

    ecs = boto3.client('ecs', region_name=region)

    # 1. Get current task definition
    print(f"Fetching latest task definition for {family}...")
    try:
        describe_res = ecs.describe_task_definition(taskDefinition=family)
        task_def = describe_res['taskDefinition']
    except Exception as e:
        print(f"Error fetching task definition: {e}")
        sys.exit(1)

    # 2. Extract container definitions and update image
    container_definitions = task_def["containerDefinitions"]
    updated = False
    for container in container_definitions:
        if "sc-backend" in container["image"] or "sc-gateway" in container["name"]:
            print(f"Updating image for container {container['name']} to {new_image}")
            container["image"] = new_image
            updated = True
    
    if not updated:
        print("Warning: Could not find matching container to update image. Updating first container by default.")
        container_definitions[0]["image"] = new_image

    # 3. Register new task definition
    valid_keys = [
        "family", "taskRoleArn", "executionRoleArn", "networkMode",
        "containerDefinitions", "volumes", "placementConstraints",
        "requiresCompatibilities", "cpu", "memory", "proxyConfiguration",
        "inferenceAccelerators", "runtimePlatform", "ipcMode", "pidMode", "ephemeralStorage"
    ]
    new_task_def_args = {k: v for k, v in task_def.items() if k in valid_keys}

    print("Registering new task definition...")
    try:
        reg_res = ecs.register_task_definition(**new_task_def_args)
        new_rev = reg_res["taskDefinition"]["taskDefinitionArn"]
        print(f"Registered new revision: {new_rev}")
    except Exception as e:
        print(f"Error registering task definition: {e}")
        sys.exit(1)

    # 4. Update service
    print(f"Updating service {service} to use {new_rev}...")
    try:
        ecs.update_service(
            cluster=cluster,
            service=service,
            taskDefinition=new_rev,
            forceNewDeployment=True
        )
    except Exception as e:
        print(f"Error updating service: {e}")
        sys.exit(1)

    print("Waiting for service to stabilize...")
    try:
        waiter = ecs.get_waiter('services_stable')
        waiter.wait(cluster=cluster, services=[service])
        print("\n--- DEPLOYMENT COMPLETE ---")
    except Exception as e:
        print(f"Error waiting for stability: {e}")
        # Service might still be updating, but waiter timed out or failed
        print("Please check ECS console for final status.")

if __name__ == "__main__":
    main()
