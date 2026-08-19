from fastapi import APIRouter, HTTPException, Depends
from app.schemas import StudentSportCreate, SportCreate
from app.auth import get_current_user, require_student
from app.database import db_session

router = APIRouter(prefix="/api/sports", tags=["Sports Management"])

DEFAULT_SPORTS = [
    # Outdoor
    {"name": "Cricket", "category": "OUTDOOR"},
    {"name": "Football", "category": "OUTDOOR"},
    {"name": "Volleyball", "category": "OUTDOOR"},
    {"name": "Basketball", "category": "OUTDOOR"},
    {"name": "Tennis", "category": "OUTDOOR"},
    {"name": "Badminton", "category": "OUTDOOR"},
    {"name": "Athletics", "category": "OUTDOOR"},
    {"name": "Hockey", "category": "OUTDOOR"},
    {"name": "Kabaddi", "category": "OUTDOOR"},
    {"name": "Kho-Kho", "category": "OUTDOOR"},
    {"name": "Baseball", "category": "OUTDOOR"},
    {"name": "Handball", "category": "OUTDOOR"},
    {"name": "Rugby", "category": "OUTDOOR"},
    {"name": "Archery", "category": "OUTDOOR"},
    {"name": "Swimming", "category": "OUTDOOR"},
    {"name": "Boxing", "category": "OUTDOOR"},
    {"name": "Wrestling", "category": "OUTDOOR"},
    {"name": "Cycling", "category": "OUTDOOR"},
    # Indoor
    {"name": "Chess", "category": "INDOOR"},
    {"name": "Carrom", "category": "INDOOR"},
    {"name": "Table Tennis", "category": "INDOOR"},
    {"name": "Darts", "category": "INDOOR"},
    {"name": "Snooker", "category": "INDOOR"},
    {"name": "Billiards", "category": "INDOOR"},
    {"name": "Indoor shooting", "category": "INDOOR"},
    {"name": "Esports", "category": "INDOOR"},
    {"name": "Coding club", "category": "INDOOR"},
    {"name": "Music club", "category": "INDOOR"}
]

@router.get("/categories")
def get_sports_categories():
    """Returns available indoor & outdoor sports choices for selection."""
    return DEFAULT_SPORTS

@router.get("/student")
def get_student_sports(user: dict = Depends(require_student)):
    """Returns ONLY sports explicitly added by the logged-in student."""
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT ss.id as student_sport_id, s.sport_id, s.name, s.category, 
                   ss.skill_level, ss.experience_years, ss.training_goal, ss.start_date,
                   (SELECT COUNT(*) FROM practice_sessions ps WHERE ps.student_id = ? AND ps.sport_id = s.sport_id) as sessions_count
            FROM student_sports ss
            JOIN sports s ON ss.sport_id = s.sport_id
            WHERE ss.student_id = ?
            ORDER BY ss.created_at DESC
        """, (user["user_id"], user["user_id"]))
        rows = [dict(r) for r in cursor.fetchall()]
        return rows

@router.post("/student")
def add_student_sport(req: StudentSportCreate, user: dict = Depends(require_student)):
    """Allows student to select or create an indoor/outdoor sport."""
    with db_session() as conn:
        cursor = conn.cursor()
        sport_id = req.sport_id
        
        # If sport_name is provided instead of sport_id, find or insert into sports
        if not sport_id and req.sport_name:
            cursor.execute("SELECT sport_id FROM sports WHERE LOWER(name) = LOWER(?)", (req.sport_name.strip(),))
            existing = cursor.fetchone()
            if existing:
                sport_id = existing["sport_id"]
            else:
                cursor.execute("""
                    INSERT INTO sports (name, category, is_custom, created_by)
                    VALUES (?, ?, 1, ?)
                """, (req.sport_name.strip(), req.category.upper(), user["user_id"]))
                sport_id = cursor.lastrowid
                
        if not sport_id:
            raise HTTPException(status_code=400, detail="Please select or enter a valid sport name")
            
        # Check if already added
        cursor.execute("SELECT id FROM student_sports WHERE student_id = ? AND sport_id = ?", (user["user_id"], sport_id))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Sport is already added to your sports list")
            
        cursor.execute("""
            INSERT INTO student_sports (student_id, sport_id, skill_level, experience_years, training_goal, start_date)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user["user_id"], sport_id, req.skill_level, req.experience_years, req.training_goal, req.start_date))
        
        return {"message": "Sport successfully added to your profile", "sport_id": sport_id}

@router.delete("/student/{sport_id}")
def remove_student_sport(sport_id: int, user: dict = Depends(require_student)):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM student_sports WHERE student_id = ? AND sport_id = ?", (user["user_id"], sport_id))
        return {"message": "Sport removed from profile"}
