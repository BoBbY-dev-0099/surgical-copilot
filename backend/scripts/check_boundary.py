import boto3

def check_boundary():
    iam = boto3.client('iam')
    role_name = "sc-gateway-task-role"
    
    res = iam.get_role(RoleName=role_name)
    role = res['Role']
    boundary = role.get('PermissionsBoundary', {})
    if boundary:
        print(f"Permissions Boundary attached: {boundary['PermissionsBoundaryArn']}")
        # Fetch the boundary policy
        pol_res = iam.get_policy(PolicyArn=boundary['PermissionsBoundaryArn'])
        ver_res = iam.get_policy_version(
            PolicyArn=boundary['PermissionsBoundaryArn'],
            VersionId=pol_res['Policy']['DefaultVersionId']
        )
        import json
        print("Boundary Document:")
        print(json.dumps(ver_res['PolicyVersion']['Document'], indent=2))
    else:
        print("No Permissions Boundary attached.")

if __name__ == "__main__":
    check_boundary()
