try:
    import boto3
except ImportError:
    import sys
    print("Error: 'boto3' not found. Please run: pip install boto3 botocore")
    sys.exit(1)
import sys

def check_aws():
    try:
        sts = boto3.client('sts')
        identity = sts.get_caller_identity()
        print(f"AWS Identity: {identity['Arn']}")
        
        ecr = boto3.client('ecr', region_name='us-west-2')
        res = ecr.describe_repositories(repositoryNames=['sc-backend'])
        print(f"ECR Repo Found: {res['repositories'][0]['repositoryUri']}")
        return True
    except Exception as e:
        print(f"AWS Check Failed: {e}")
        return False

if __name__ == "__main__":
    if check_aws():
        sys.exit(0)
    else:
        sys.exit(1)
