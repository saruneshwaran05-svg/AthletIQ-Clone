import os
import sys
import uvicorn

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ATHLETIQ_DIR = os.path.join(CURRENT_DIR, "SportSphere")

if ATHLETIQ_DIR not in sys.path:
    sys.path.insert(0, ATHLETIQ_DIR)

os.chdir(ATHLETIQ_DIR)

if __name__ == "__main__":
    print("Starting AthletIQ AI-Powered Sports Performance Tracking Platform on http://127.0.0.1:8000 ...")
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
