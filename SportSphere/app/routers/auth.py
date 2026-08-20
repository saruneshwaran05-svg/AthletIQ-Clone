from fastapi import APIRouter, HTTPException, Depends, status
from app.schemas import StudentRegister, CoachRegister, LoginRequest, ProfileUpdate
from app.auth import hash_password, verify_password, create_access_token, get_current_user
from app.database import db_session

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/register/student")
def register_student(req: StudentRegister):
    if req.password != req.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    
    clean_email = (req.email or "").strip().lower()
    clean_name = (req.name or "").strip()
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM users WHERE email = ?", (clean_email,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Email is already registered")
        
        hashed = hash_password(req.password)
        cursor.execute("""
            INSERT INTO users (role, name, email, password_hash, date_of_birth, preferred_sport, profile_photo)
            VALUES ('STUDENT', ?, ?, ?, ?, ?, ?)
        """, (clean_name, clean_email, hashed, req.date_of_birth, req.preferred_sport, req.profile_photo or "avatar_student_default.png"))
        
        user_id = cursor.lastrowid
        token = create_access_token({"sub": str(user_id), "role": "STUDENT"})
        return {
            "message": "Student registration successful",
            "access_token": token,
            "user": {
                "user_id": user_id,
                "name": clean_name,
                "email": clean_email,
                "role": "STUDENT",
                "preferred_sport": req.preferred_sport
            }
        }

@router.post("/register/coach")
def register_coach(req: CoachRegister):
    if req.password != req.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    
    clean_email = (req.email or "").strip().lower()
    clean_name = (req.name or "").strip()
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM users WHERE email = ?", (clean_email,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Email is already registered")
        
        hashed = hash_password(req.password)
        cursor.execute("""
            INSERT INTO users (role, name, email, password_hash, coaching_specialization, experience_years, certification, profile_photo)
            VALUES ('COACH', ?, ?, ?, ?, ?, ?, ?)
        """, (clean_name, clean_email, hashed, req.coaching_specialization, req.experience_years, req.certification, req.profile_photo or "avatar_coach_default.png"))
        
        user_id = cursor.lastrowid
        token = create_access_token({"sub": str(user_id), "role": "COACH"})
        return {
            "message": "Coach registration successful",
            "access_token": token,
            "user": {
                "user_id": user_id,
                "name": clean_name,
                "email": clean_email,
                "role": "COACH",
                "coaching_specialization": req.coaching_specialization
            }
        }

@router.post("/login")
def login(req: LoginRequest):
    clean_email = (req.email or "").strip().lower()
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (clean_email,))
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
        if req.date_of_birth is not None:
            updates.append("date_of_birth = ?")
            params.append(req.date_of_birth)
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

@router.get("/profile/{target_user_id}")
def get_user_profile(target_user_id: int, user: dict = Depends(get_current_user)):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT user_id, role, name, email, date_of_birth, coaching_specialization,
                   experience_years, certification, bio, preferred_sport, profile_photo, created_at
            FROM users WHERE user_id = ?
        """, (target_user_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User profile not found")
        
        target = dict(row)
        
        if target["role"] == "COACH":
            cursor.execute("SELECT COUNT(*) as count FROM coach_connections WHERE coach_id = ? AND status = 'ACCEPTED'", (target_user_id,))
            target["total_students"] = cursor.fetchone()["count"]
            cursor.execute("SELECT COUNT(*) as count FROM coach_feedback WHERE coach_id = ?", (target_user_id,))
            target["total_feedback"] = cursor.fetchone()["count"]
            
            if user["role"] == "STUDENT":
                cursor.execute("SELECT connection_id, status FROM coach_connections WHERE student_id = ? AND coach_id = ?", (user["user_id"], target_user_id))
                conn_row = cursor.fetchone()
                target["connection_status"] = conn_row["status"] if conn_row else "NONE"
                target["connection_id"] = conn_row["connection_id"] if conn_row else None
                
        elif target["role"] == "STUDENT":
            cursor.execute("SELECT COUNT(*) as total_sessions, COALESCE(SUM(duration_minutes), 0) as total_minutes FROM practice_sessions WHERE student_id = ?", (target_user_id,))
            sess_row = cursor.fetchone()
            target["total_sessions"] = sess_row["total_sessions"] if sess_row else 0
            target["total_hours"] = round((sess_row["total_minutes"] if sess_row else 0) / 60.0, 1)
            
            cursor.execute("""
                SELECT s.sport_id, s.name as sport_name, s.category,
                       COALESCE(ss.skill_level, 'BEGINNER') as skill_level,
                       COALESCE(ss.experience_years, 0.0) as experience_years,
                       ss.training_goal, ss.start_date
                FROM student_sports ss
                JOIN sports s ON ss.sport_id = s.sport_id
                WHERE ss.student_id = ?
                ORDER BY ss.created_at ASC
            """, (target_user_id,))
            target["sports"] = [dict(s) for s in cursor.fetchall()]
            
            cursor.execute("SELECT COUNT(*) as count FROM goals WHERE student_id = ? AND status != 'COMPLETED'", (target_user_id,))
            target["active_goals_count"] = cursor.fetchone()["count"]
            
            if user["role"] == "COACH":
                cursor.execute("SELECT connection_id, status FROM coach_connections WHERE coach_id = ? AND student_id = ?", (user["user_id"], target_user_id))
                conn_row = cursor.fetchone()
                target["connection_status"] = conn_row["status"] if conn_row else "NONE"
                target["connection_id"] = conn_row["connection_id"] if conn_row else None

        return target

from app.schemas import StudentRegister, CoachRegister, LoginRequest, ProfileUpdate, ForgotPasswordRequest

@router.post("/forgot-password")
def forgot_password(req: Optional[ForgotPasswordRequest] = None, email: Optional[str] = None):
    target_email = (req.email if req and req.email else email)
    if not target_email:
        raise HTTPException(status_code=400, detail="Email is required")
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM users WHERE email = ?", (target_email.lower().strip(),))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Account with this email does not exist")
        new_hash = hash_password("password123")
        cursor.execute("UPDATE users SET password_hash = ? WHERE user_id = ?", (new_hash, row["user_id"]))
    return {"message": "Password has been reset to: password123. You may now log in."}

