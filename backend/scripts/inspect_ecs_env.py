import boto3
import json

def inspect():
    ecs = boto3.client('ecs', region_name='us-west-2')
    res = ecs.describe_task_definition(taskDefinition='sc-gateway')
    td = res['taskDefinition']
    container = td['containerDefinitions'][0]
    print(f"Task Role:      {td.get('taskRoleArn')}")
    print(f"Execution Role: {td.get('executionRoleArn')}")
    print("Environment:")
    print(json.dumps(container.get('environment', []), indent=2))

if __name__ == "__main__":
    inspect()
