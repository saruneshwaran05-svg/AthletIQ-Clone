import os
import sys

# Ensure app package is in python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import init_db, clear_all_data, db_session
from app.auth import hash_password
from app.ai_engine import run_student_ai_analysis

def reset_and_seed():
    print("Initializing Database and clearing existing data...")
    init_db()
    clear_all_data()

    with db_session() as conn:
        cursor = conn.cursor()

        # 1. Create Student sarun@gmail.com
        pwd_hash = hash_password("7572@Arun")
        cursor.execute("""
            INSERT INTO users (role, name, email, password_hash, preferred_sport, profile_photo)
            VALUES ('STUDENT', 'Arunesh', 'sarun@gmail.com', ?, 'Cricket', 'avatar_student_default.png')
        """, (pwd_hash,))
        student_id = cursor.lastrowid

        # 2. Create Coach arun@gmail.com
        coach_pwd = hash_password("password123")
        cursor.execute("""
            INSERT INTO users (role, name, email, password_hash, coaching_specialization, experience_years, certification, profile_photo)
            VALUES ('COACH', 'Arun Coach', 'arun@gmail.com', ?, 'Cricket', 5, 'BCCI Level 2 Coach', 'avatar_coach_default.png')
        """, (coach_pwd,))
        coach_id = cursor.lastrowid

        # Get Cricket sport_id
        cursor.execute("SELECT sport_id FROM sports WHERE LOWER(name) = 'cricket'")
        sp_row = cursor.fetchone()
        cricket_id = sp_row["sport_id"] if sp_row else 1

        # Enroll student in Cricket
        cursor.execute("""
            INSERT INTO student_sports (student_id, sport_id, skill_level, experience_years, training_goal, start_date)
            VALUES (?, ?, 'INTERMEDIATE', 2.0, 'Master batting drive and bowling line/length', '2026-01-10')
        """, (student_id, cricket_id))

        # Connect Coach and Student
        cursor.execute("""
            INSERT INTO coach_connections (student_id, coach_id, status)
            VALUES (?, ?, 'ACCEPTED')
        """, (student_id, coach_id))

        # Add 3 initial practice sessions for sarun@gmail.com so AI Analytics has solid trend data
        sessions_data = [
            {
                "date": "2026-08-10",
                "duration": 60,
                "intensity": "MEDIUM",
                "type": "NET_PRACTICE",
                "area": "Batting Drives & Footwork",
                "rating": 7,
                "notes": "Practiced cover drives against pace bowling. Stance felt slightly wide.",
                "metrics": [("balls_faced", 45, "balls"), ("runs", 32, "runs"), ("boundaries", 5, "count")],
                "problems": [("Batting edge on drive shots", "MEDIUM", "TECHNICAL")]
            },
            {
                "date": "2026-08-14",
                "duration": 90,
                "intensity": "HIGH",
                "type": "MATCH_SIMULATION",
                "area": "Match Overs & Bowling Spells",
                "rating": 8,
                "notes": "Bowled 4 overs in match simulation. Good length consistency.",
                "metrics": [("overs_bowled", 4, "overs"), ("runs_conceded", 18, "runs"), ("wickets", 2, "wickets"), ("dot_balls", 14, "count")],
                "problems": [("Bowling wide on outside off-stump", "LOW", "TECHNICAL")]
            },
            {
                "date": "2026-08-18",
                "duration": 75,
                "intensity": "HIGH",
                "type": "TECHNICAL_DRILLS",
                "area": "Fielding & High Catches",
                "rating": 9,
                "notes": "Focused on high aerial catches and rapid pick-and-throw.",
                "metrics": [("catches", 12, "count"), ("run_outs", 2, "count")],
                "problems": []
            }
        ]

        for s in sessions_data:
            cursor.execute("""
                INSERT INTO practice_sessions (student_id, sport_id, date, duration_minutes, intensity, training_type, training_area, coach_rating, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (student_id, cricket_id, s["date"], s["duration"], s["intensity"], s["type"], s["area"], s["rating"], s["notes"]))
            sess_id = cursor.lastrowid

            for m_name, m_val, m_unit in s["metrics"]:
                cursor.execute("""
                    INSERT INTO performance_records (session_id, metric_name, metric_value, metric_unit)
                    VALUES (?, ?, ?, ?)
                """, (sess_id, m_name, m_val, m_unit))

            for p_desc, p_sev, p_cat in s["problems"]:
                cursor.execute("""
                    INSERT INTO problems (session_id, description, severity, category)
                    VALUES (?, ?, ?, ?)
                """, (sess_id, p_desc, p_sev, p_cat))

        print("Created clean Student (sarun@gmail.com) and Coach (arun@gmail.com) with 3 practice sessions!")

    # 3. Generate AI Analytics for student
    res = run_student_ai_analysis(student_id, cricket_id)
    print("AI Engine initialized analytics successfully:", res["message"])
    print("Reset and seeding completed clean!")

if __name__ == "__main__":
    reset_and_seed()
