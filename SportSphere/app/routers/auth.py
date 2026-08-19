from fastapi import APIRouter, HTTPException, Depends, status
from app.schemas import StudentRegister, CoachRegister, LoginRequest, ProfileUpdate
from app.auth import hash_password, verify_password, create_access_token, get_current_user
from app.database import db_session

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/register/student")
def register_student(req: StudentRegister):
    if req.password != req.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM users WHERE email = ?", (req.email.lower(),))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Email is already registered")
        
        hashed = hash_password(req.password)
        cursor.execute("""
            INSERT INTO users (role, name, email, password_hash, date_of_birth, preferred_sport, profile_photo)
            VALUES ('STUDENT', ?, ?, ?, ?, ?, ?)
        """, (req.name, req.email.lower(), hashed, req.date_of_birth, req.preferred_sport, req.profile_photo or "avatar_student_default.png"))
        
        user_id = cursor.lastrowid
        token = create_access_token({"sub": str(user_id), "role": "STUDENT"})
        return {
            "message": "Student registration successful",
            "access_token": token,
            "user": {
                "user_id": user_id,
                "name": req.name,
                "email": req.email.lower(),
                "role": "STUDENT",
                "preferred_sport": req.preferred_sport
            }
        }

@router.post("/register/coach")
def register_coach(req: CoachRegister):
    if req.password != req.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM users WHERE email = ?", (req.email.lower(),))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Email is already registered")
        
        hashed = hash_password(req.password)
        cursor.execute("""
            INSERT INTO users (role, name, email, password_hash, coaching_specialization, experience_years, certification, profile_photo)
            VALUES ('COACH', ?, ?, ?, ?, ?, ?, ?)
        """, (req.name, req.email.lower(), hashed, req.coaching_specialization, req.experience_years, req.certification, req.profile_photo or "avatar_coach_default.png"))
        
        user_id = cursor.lastrowid
        token = create_access_token({"sub": str(user_id), "role": "COACH"})
        return {
            "message": "Coach registration successful",
            "access_token": token,
            "user": {
                "user_id": user_id,
                "name": req.name,
                "email": req.email.lower(),
                "role": "COACH",
                "coaching_specialization": req.coaching_specialization
            }
        }

@router.post("/login")
def login(req: LoginRequest):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (req.email.lower(),))
        user_row = cursor.fetchone()
        if not user_row:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        user = dict(user_row)
        if not verify_password(req.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        req_role_upper = (req.role or "").upper()
        user_role_upper = user["role"].upper()

        if req_role_upper and req_role_upper != user_role_upper:
            if req_role_upper == "COACH":
                raise HTTPException(
                    status_code=400,
                    detail="This email is registered as a Student. Please switch to the Student Login tab."
                )
            else:
                raise HTTPException(
                    status_code=400,
                    detail="This email is registered as a Coach. Please switch to the Coach Login tab."
                )

        token = create_access_token({"sub": str(user["user_id"]), "role": user["role"]})
        return {
            "access_token": token,
            "user": {
                "user_id": user["user_id"],
                "name": user["name"],
                "email": user["email"],
                "role": user["role"],
                "preferred_sport": user.get("preferred_sport"),
                "coaching_specialization": user.get("coaching_specialization"),
                "profile_photo": user.get("profile_photo")
            }
        }

@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    return user

@router.put("/profile")
def update_profile(req: ProfileUpdate, user: dict = Depends(get_current_user)):
    with db_session() as conn:
        cursor = conn.cursor()
        updates = []
        params = []
        if req.name is not None:
            updates.append("name = ?")
            params.append(req.name)
        if req.bio is not None:
            updates.append("bio = ?")
            params.append(req.bio)
        if req.preferred_sport is not None:
            updates.append("preferred_sport = ?")
            params.append(req.preferred_sport)
        if req.coaching_specialization is not None:
            updates.append("coaching_specialization = ?")
            params.append(req.coaching_specialization)
        if req.experience_years is not None:
            updates.append("experience_years = ?")
            params.append(req.experience_years)
        if req.certification is not None:
            updates.append("certification = ?")
            params.append(req.certification)
        if req.profile_photo is not None:
            updates.append("profile_photo = ?")
            params.append(req.profile_photo)
            
        if updates:
            params.append(user["user_id"])
            cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE user_id = ?", params)
            
    return {"message": "Profile updated successfully"}

@router.post("/forgot-password")
def forgot_password(email: str):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM users WHERE email = ?", (email.lower(),))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Account with this email does not exist")
    return {"message": "Password reset instructions sent to your email address"}
