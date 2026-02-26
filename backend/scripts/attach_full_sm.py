import boto3

def attach_full():
    iam = boto3.client('iam')
    role_name = "sc-gateway-task-role"
    policy_arn = "arn:aws:iam::aws:policy/AmazonSageMakerFullAccess"
    
    print(f"Attaching {policy_arn} to {role_name}...")
    try:
        iam.attach_role_policy(
            RoleName=role_name,
            PolicyArn=policy_arn
        )
        print("Policy attached successfully.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    attach_full()
