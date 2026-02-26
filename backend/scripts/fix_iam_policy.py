import boto3
import json

def fix_iam():
    iam = boto3.client('iam')
    role_name = "sc-gateway-task-role"
    policy_name = "SageMakerInvokeEndpoints"
    
    new_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "sagemaker:InvokeEndpoint"
                ],
                "Resource": "*"
            }
        ]
    }
    
    print(f"Updating IAM inline policy '{policy_name}' for role '{role_name}'...")
    try:
        iam.put_role_policy(
            RoleName=role_name,
            PolicyName=policy_name,
            PolicyDocument=json.dumps(new_policy)
        )
        print("IAM Policy updated successfully.")
    except Exception as e:
        print(f"Error updating IAM policy: {e}")

if __name__ == "__main__":
    fix_iam()
