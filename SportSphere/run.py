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
    base_dir = os.path.dirname(os.path.abspath(__file__))
    if base_dir not in sys.path:
        sys.path.insert(0, base_dir)
    curr_python_path = os.environ.get("PYTHONPATH", "")
    if base_dir not in curr_python_path:
        os.environ["PYTHONPATH"] = f"{base_dir};{curr_python_path}" if curr_python_path else base_dir

    print("Starting AthletIQ AI-Powered Sports Performance Tracking Platform on http://127.0.0.1:8000 ...")
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_dirs=[base_dir],
        reload_excludes=["*.db", "*.db-wal", "*.db-shm", "*.pyc", "__pycache__", ".git"]
    )

