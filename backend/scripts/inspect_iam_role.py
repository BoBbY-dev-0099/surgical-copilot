import boto3
import json

def inspect_role():
    iam = boto3.client('iam')
    role_name = "sc-gateway-task-role"
    
    print(f"Policies for role: {role_name}")
    
    # List attached policies
    res = iam.list_attached_role_policies(RoleName=role_name)
    for p in res['AttachedPolicies']:
        print(f" - Attached Policy: {p['PolicyName']} ({p['PolicyArn']})")
        
    # List inline policies
    res = iam.list_role_policies(RoleName=role_name)
    for p_name in res['PolicyNames']:
        print(f" - Inline Policy: {p_name}")
        p_res = iam.get_role_policy(RoleName=role_name, PolicyName=p_name)
        print(json.dumps(p_res['PolicyDocument'], indent=2))

if __name__ == "__main__":
    inspect_role()
