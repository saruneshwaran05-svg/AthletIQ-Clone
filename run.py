import os
import sys
import uvicorn

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ATHLETIQ_DIR = os.path.join(CURRENT_DIR, "SportSphere") if os.path.basename(CURRENT_DIR) != "SportSphere" else CURRENT_DIR

if ATHLETIQ_DIR not in sys.path:
    sys.path.insert(0, ATHLETIQ_DIR)

curr_python_path = os.environ.get("PYTHONPATH", "")
if ATHLETIQ_DIR not in curr_python_path:
    os.environ["PYTHONPATH"] = f"{ATHLETIQ_DIR};{curr_python_path}" if curr_python_path else ATHLETIQ_DIR

os.chdir(ATHLETIQ_DIR)

if __name__ == "__main__":
    print("Starting AthletIQ AI-Powered Sports Performance Tracking Platform on http://127.0.0.1:8000 ...")
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_dirs=[ATHLETIQ_DIR],
        reload_excludes=["*.db", "*.db-wal", "*.db-shm", "*.pyc", "__pycache__", ".git"]
    )

