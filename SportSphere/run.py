import os
import sys

try:
    import uvicorn
except ModuleNotFoundError:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(base_dir, "..", "..", "venv", "Scripts", "python.exe"),
        os.path.join(base_dir, "..", "venv", "Scripts", "python.exe"),
        os.path.join(base_dir, "venv", "Scripts", "python.exe"),
    ]
    venv_py = next((p for p in candidates if os.path.exists(p)), None)
    if venv_py:
        os.execv(venv_py, [venv_py] + sys.argv)
    else:
        raise

if __name__ == "__main__":
    print("Starting AthletIQ AI-Powered Sports Performance Tracking Platform on http://127.0.0.1:8000 ...")
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)

