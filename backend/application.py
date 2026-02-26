import os
import sys

# Standard Azure Python pathing
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

print(f"BOOTSTRAP: application.py starting from {_HERE}")
print(f"BOOTSTRAP: sys.path: {sys.path}")

# Granular dependency checking
dependencies = ["fastapi", "uvicorn", "dotenv", "boto3", "botocore"]
for dep in dependencies:
    try:
        __import__(dep)
        print(f"BOOTSTRAP: OK - {dep} found")
    except ImportError:
        print(f"BOOTSTRAP: MISSING - {dep}")

try:
    print("BOOTSTRAP: Importing 'app' from 'app.gateway'...")
    from app.gateway import app
    print("BOOTSTRAP: SUCCESS - App imported.")
except Exception as e:
    print(f"BOOTSTRAP CRITICAL ERROR: {e}")
    import traceback
    traceback.print_exc()
    raise

__all__ = ["app"]
