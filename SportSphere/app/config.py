import os

from app.database import DB_PATH

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "athletiq_super_secret_jwt_key_2026_mca_project")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")
PROJECT_NAME = "AthletIQ"
