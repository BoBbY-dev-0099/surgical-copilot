import urllib.request
import json

def check_alb():
    url = "http://newload-824129200.us-west-2.elb.amazonaws.com/api/phase1b"
    data = {"case_text": "test inference logic"}
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            res = json.loads(resp.read().decode())
            print(json.dumps(res, indent=2))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_alb()
