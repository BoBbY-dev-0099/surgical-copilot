import subprocess
import time
import sys
import os
import http.client
import json

IMAGE_NAME = "sc-backend:verify"
CONTAINER_NAME = "sc-verify"
PORT = 8010

def run_command(cmd, shell=True):
    print(f"Running: {cmd}")
    result = subprocess.run(cmd, shell=shell, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        return None
    return result.stdout

def check_url(path):
    conn = http.client.HTTPConnection("127.0.0.1", PORT)
    try:
        conn.request("GET", path)
        res = conn.getresponse()
        data = res.read().decode()
        return res.status, data
    except Exception as e:
        print(f"Request failed: {e}")
        return None, None
    finally:
        conn.close()

def main():
    # 1. Build image
    print("Building Docker image...")
    run_command(f"docker build -t {IMAGE_NAME} -f backend/Dockerfile .")

    # 2. Run container
    print("Starting container...")
    # Clean up old container if exists
    run_command(f"docker rm -f {CONTAINER_NAME}")
    run_command(f"docker run -d --name {CONTAINER_NAME} -p {PORT}:8000 {IMAGE_NAME}")

    try:
        # 3. Wait for readiness
        print("Waiting for container to start...")
        for _ in range(10):
            status, _ = check_url("/health")
            if status == 200:
                print("Container is healthy!")
                break
            time.sleep(2)
        else:
            print("Container failed to start or health check timed out.")
            return

        # 4. Verify /api/locked
        print("Verifying /api/locked...")
        status, data = check_url("/api/locked")
        if status == 200:
            print("SUCCESS: /api/locked returned 200")
        else:
            print(f"FAIL: /api/locked returned {status}")
            sys.exit(1)

        # 5. Verify /healthz
        print("Verifying /healthz...")
        status, _ = check_url("/healthz")
        if status == 200:
            print("SUCCESS: /healthz returned 200")
        else:
            print(f"FAIL: /healthz returned {status}")
            sys.exit(1)

        # 6. Verify openapi.json
        print("Verifying /openapi.json...")
        status, data = check_url("/openapi.json")
        if status == 200:
            if "/api/locked" in data:
                print("SUCCESS: openapi.json contains /api/locked")
            else:
                print("FAIL: openapi.json does NOT contain /api/locked")
                sys.exit(1)
        else:
            print(f"FAIL: /openapi.json returned {status}")
            sys.exit(1)

        # 7. Check file content inside container
        print("Checking gateway.py content inside container...")
        content = run_command(f"docker exec {CONTAINER_NAME} head -n 150 app/gateway.py")
        if content and "/api/locked" in content:
            print("SUCCESS: Found /api/locked in gateway.py content inside container")
        else:
            print("FAIL: Could NOT find /api/locked in gateway.py content inside container")
            sys.exit(1)

    finally:
        # 8. Clean up
        print("Cleaning up container...")
        run_command(f"docker rm -f {CONTAINER_NAME}")

    print("\n--- ALL TESTS PASSED ---")

if __name__ == "__main__":
    main()
