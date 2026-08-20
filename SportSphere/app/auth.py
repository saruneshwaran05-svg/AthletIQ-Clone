import hmac
import hashlib
import os
import json
import time
import base64
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import SECRET_KEY, ACCESS_TOKEN_EXPIRE_MINUTES
from app.database import db_session

security = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return salt.hex() + ':' + key.hex()

def verify_password(password: str, hashed: str) -> bool:
    try:
        salt_hex, key_hex = hashed.split(':')
        salt = bytes.fromhex(salt_hex)
        expected_key = bytes.fromhex(key_hex)
        key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
        return hmac.compare_digest(key, expected_key)
    except Exception:
        return False

def _b64_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')

def _b64_decode(data_str: str) -> bytes:
    padding = '=' * (4 - (len(data_str) % 4))
    return base64.urlsafe_b64decode(data_str + padding)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = int(time.time()) + (ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    to_encode.update({"exp": expire})
    
    header = {"alg": "HS256", "typ": "JWT"}
    h_b64 = _b64_encode(json.dumps(header).encode('utf-8'))
    p_b64 = _b64_encode(json.dumps(to_encode).encode('utf-8'))
    sig_input = f"{h_b64}.{p_b64}".encode('utf-8')
    signature = hmac.new(SECRET_KEY.encode('utf-8'), sig_input, hashlib.sha256).digest()
    sig_b64 = _b64_encode(signature)
    return f"{h_b64}.{p_b64}.{sig_b64}"

def decode_access_token(token: str) -> dict:
    parts = token.split('.')
    if len(parts) != 3:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token format"
        )
    h_b64, p_b64, sig_b64 = parts
    sig_input = f"{h_b64}.{p_b64}".encode('utf-8')
    expected_sig = _b64_encode(hmac.new(SECRET_KEY.encode('utf-8'), sig_input, hashlib.sha256).digest())
    if not hmac.compare_digest(sig_b64, expected_sig):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token signature"
        )
    try:
        payload = json.loads(_b64_decode(p_b64).decode('utf-8'))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not parse token payload"
        )
    if payload.get("exp") and time.time() > payload["exp"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired"
        )
    return payload

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication header"
        )
    payload = decode_access_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
    
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT user_id, role, name, email, date_of_birth, coaching_specialization, 
                   experience_years, certification, bio, preferred_sport, profile_photo, created_at 
            FROM users WHERE user_id = ?
        """, (user_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account no longer exists"
            )
        return dict(row)

def require_student(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "STUDENT":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted to students only"
        )
    return user

def require_coach(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "COACH":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted to coaches only"
        )
    return user
