import sys
try:
    import boto3
    import base64
except ImportError:
    print("Error: 'boto3' not found. Please run: pip install boto3 botocore")
    sys.exit(1)
import subprocess

def login():
    try:
        ecr = boto3.client('ecr', region_name='us-west-2')
        res = ecr.get_authorization_token()
        token = res['authorizationData'][0]['authorizationToken']
        proxy_endpoint = res['authorizationData'][0]['proxyEndpoint']
        
        decoded_token = base64.b64decode(token).decode('utf-8')
        username, password = decoded_token.split(':')
        
        cmd = f"docker login --username {username} --password-stdin {proxy_endpoint}"
        print(f"Logging into {proxy_endpoint}...")
        
        process = subprocess.Popen(['docker', 'login', '--username', username, '--password-stdin', proxy_endpoint], 
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = process.communicate(input=password)
        
        if process.returncode == 0:
            print(stdout)
            return True
        else:
            print(stderr)
            return False
            
    except Exception as e:
        print(f"ECR Login Failed: {e}")
        return False

if __name__ == "__main__":
    if login():
        sys.exit(0)
    else:
        sys.exit(1)
