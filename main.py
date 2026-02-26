import os
import sys

# Ensure the 'backend' directory is in the path so we can import 'app'
_HERE = os.path.dirname(os.path.abspath(__file__))
backend_path = os.path.join(_HERE, "backend")
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

# Import the FastAPI app from the gateway
from app.gateway import app

# For uvicorn/gunicorn auto-detection
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
