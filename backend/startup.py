import subprocess
import sys
import os

print("Surgical Copilot Python-Startup v7 Initiated.")

def run(cmd):
    print(f"RUNNING: {cmd}")
    result = subprocess.run(cmd, shell=True)
    if result.returncode != 0:
        print(f"ERROR: Command failed with exit code {result.returncode}")
    return result.returncode

# 1. Install dependencies to user site-packages
run(f"{sys.executable} -m pip install --user uvicorn gunicorn fastapi python-dotenv python-multipart aiofiles boto3 botocore")

# 2. Add user site-packages to path
user_site = subprocess.check_output([sys.executable, "-m", "site", "--user-site"]).decode().strip()
if user_site not in sys.path:
    sys.path.append(user_site)

# 3. Locate uvicorn
# We can run it as a module
print("STARTING APPLICATION...")
os.environ["PYTHONPATH"] = os.getcwd()
subprocess.run([sys.executable, "-m", "uvicorn", "application:app", "--host", "0.0.0.0", "--port", "8000"])
