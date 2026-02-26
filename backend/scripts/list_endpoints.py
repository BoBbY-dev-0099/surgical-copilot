import boto3

def list_endpoints():
    sm = boto3.client('sagemaker', region_name='us-west-2')
    res = sm.list_endpoints()
    print("InService Endpoints:")
    for ep in res['Endpoints']:
        print(f" - {ep['EndpointName']}")

if __name__ == "__main__":
    list_endpoints()
