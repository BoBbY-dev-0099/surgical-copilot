import urllib.request
import json
import time

def check(name, url, payload):
    print(f"\n=== Testing {name} ===")
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        start = time.time()
        with urllib.request.urlopen(req, timeout=70) as resp:
            res = json.loads(resp.read().decode())
            dur = time.time() - start
            print(f"Status: OK ({dur:.1f}s)")
            print(f"Mode:   {res.get('mode')}")
            print(f"Parsed: {json.dumps(res.get('parsed'), indent=2)}")
    except Exception as e:
        print(f"Error: {e}")

ALB = "http://newload-824129200.us-west-2.elb.amazonaws.com"

check("Phase 1b", f"{ALB}/api/phase1b", {"case_text": "POD3 partial nephrectomy, WBC 14, fever 101, wound red"})
check("Phase 2", f"{ALB}/api/phase2", {"case_text": "Patient reports severe pain and vomiting 2 days after discharge."})
check("Onco", f"{ALB}/api/onc", {"case_text": "Follow-up CT shows new 2cm liver lesion."})
