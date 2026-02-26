import boto3
import sys

def update_ecs_env():
    family = "sc-gateway"
    cluster = "surgical-copilot2"
    service = "sc-gateway-svc"
    region = "us-west-2"

    ecs = boto3.client('ecs', region_name=region)

    # 1. Get current task definition
    print(f"Fetching latest task definition for {family}...")
    try:
        describe_res = ecs.describe_task_definition(taskDefinition=family)
        task_def = describe_res['taskDefinition']
    except Exception as e:
        print(f"Error fetching task definition: {e}")
        return

    # 2. Update environment variables
    env_updates = {
        "SAGEMAKER_MODE": "true",
        "PHASE1B_ENDPOINT": "sc-phase1b-20260219-084556-cfg",
        "PHASE2_ENDPOINT": "sc-phase2-cfg-20260219-090810",
        "ONC_ENDPOINT": "sc-onc-cfg-20260219-091417"
    }
    
    container_def = task_def["containerDefinitions"][0]
    existing_env = container_def.get("environment", [])
    
    # Remove old/typo variables
    new_env = [item for item in existing_env if item["name"] not in env_updates and item["name"] != "SAGEMAKER_MOD"]
    
    # Add new/corrected variables
    for name, value in env_updates.items():
        new_env.append({"name": name, "value": value})
        
    container_def["environment"] = new_env
    print("Updated environment variables:")
    for item in new_env:
        print(f" - {item['name']}={item['value']}")

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
        return

    # 4. Update service
    print(f"Updating service {service} to use {new_rev}...")
    try:
        ecs.update_service(
            cluster=cluster,
            service=service,
            taskDefinition=new_rev,
            forceNewDeployment=True
        )
        print("Service update initiated. Waiting for stability...")
        waiter = ecs.get_waiter('services_stable')
        waiter.wait(cluster=cluster, services=[service])
        print("\n--- ENVIRONMENT FIXED AND DEPLOYED ---")
    except Exception as e:
        print(f"Error updating service: {e}")

if __name__ == "__main__":
    update_ecs_env()
