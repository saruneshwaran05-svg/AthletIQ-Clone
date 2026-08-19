from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from app.schemas import PracticeSessionCreate
from app.auth import require_student, get_current_user
from app.database import db_session

router = APIRouter(prefix="/api/practice", tags=["Practice Tracking"])

SPORT_TEMPLATES = {
    "cricket": [
        {"name": "balls_faced", "label": "Balls Faced", "unit": "balls", "type": "number"},
        {"name": "runs", "label": "Runs Scored", "unit": "runs", "type": "number"},
        {"name": "boundaries", "label": "Boundaries (4s & 6s)", "unit": "count", "type": "number"},
        {"name": "overs_bowled", "label": "Overs Bowled", "unit": "overs", "type": "number"},
        {"name": "runs_conceded", "label": "Runs Conceded", "unit": "runs", "type": "number"},
        {"name": "wickets", "label": "Wickets Taken", "unit": "wickets", "type": "number"},
        {"name": "wides", "label": "Wides Bowled", "unit": "wides", "type": "number"},
        {"name": "no_balls", "label": "No Balls", "unit": "count", "type": "number"},
        {"name": "dot_balls", "label": "Dot Balls", "unit": "count", "type": "number"},
        {"name": "catches", "label": "Catches Taken", "unit": "count", "type": "number"},
        {"name": "missed_catches", "label": "Missed Catches", "unit": "count", "type": "number"},
        {"name": "run_outs", "label": "Run Outs Executed", "unit": "count", "type": "number"}
    ],
    "football": [
        {"name": "goals", "label": "Goals Scored", "unit": "goals", "type": "number"},
        {"name": "assists", "label": "Assists", "unit": "assists", "type": "number"},
        {"name": "shots", "label": "Total Shots", "unit": "shots", "type": "number"},
        {"name": "shots_on_target", "label": "Shots on Target", "unit": "shots", "type": "number"},
        {"name": "pass_accuracy", "label": "Pass Accuracy", "unit": "%", "type": "number"},
        {"name": "tackles", "label": "Successful Tackles", "unit": "tackles", "type": "number"},
        {"name": "interceptions", "label": "Interceptions", "unit": "count", "type": "number"},
        {"name": "dribbles", "label": "Successful Dribbles", "unit": "count", "type": "number"},
        {"name": "errors", "label": "Unforced Errors / Turnovers", "unit": "errors", "type": "number"}
    ],
    "volleyball": [
        {"name": "serves", "label": "Total Serves", "unit": "serves", "type": "number"},
        {"name": "successful_serves", "label": "Successful Serves", "unit": "serves", "type": "number"},
        {"name": "service_errors", "label": "Service Errors", "unit": "errors", "type": "number"},
        {"name": "attacks", "label": "Total Spikes / Attacks", "unit": "attacks", "type": "number"},
        {"name": "successful_attacks", "label": "Successful Attacks", "unit": "kills", "type": "number"},
        {"name": "blocks", "label": "Blocks", "unit": "blocks", "type": "number"},
        {"name": "receives", "label": "Good Digs / Receives", "unit": "count", "type": "number"},
        {"name": "errors", "label": "General Errors", "unit": "errors", "type": "number"}
    ],
    "basketball": [
        {"name": "points", "label": "Points Scored", "unit": "pts", "type": "number"},
        {"name": "field_goals", "label": "Field Goals Made", "unit": "fg", "type": "number"},
        {"name": "three_pointers", "label": "3-Pointers Made", "unit": "3pm", "type": "number"},
        {"name": "free_throws", "label": "Free Throws Made", "unit": "ft", "type": "number"},
        {"name": "rebounds", "label": "Rebounds", "unit": "reb", "type": "number"},
        {"name": "assists", "label": "Assists", "unit": "ast", "type": "number"},
        {"name": "steals", "label": "Steals", "unit": "stl", "type": "number"},
        {"name": "turnovers", "label": "Turnovers", "unit": "to", "type": "number"}
    ],
    "badminton": [
        {"name": "matches", "label": "Matches Played", "unit": "matches", "type": "number"},
        {"name": "wins", "label": "Matches Won", "unit": "wins", "type": "number"},
        {"name": "unforced_errors", "label": "Unforced Errors", "unit": "errors", "type": "number"},
        {"name": "smash_success", "label": "Smash Success Rate", "unit": "%", "type": "number"},
        {"name": "service_errors", "label": "Service Errors", "unit": "errors", "type": "number"},
        {"name": "net_errors", "label": "Net Faults", "unit": "errors", "type": "number"}
    ],
    "chess": [
        {"name": "games", "label": "Games Played", "unit": "games", "type": "number"},
        {"name": "wins", "label": "Wins", "unit": "wins", "type": "number"},
        {"name": "losses", "label": "Losses", "unit": "losses", "type": "number"},
        {"name": "draws", "label": "Draws", "unit": "draws", "type": "number"},
        {"name": "rating", "label": "Chess Rating / Performance", "unit": "elo", "type": "number"},
        {"name": "blunders", "label": "Tactical Blunders", "unit": "blunders", "type": "number"},
        {"name": "opening_mistakes", "label": "Opening Mistakes", "unit": "mistakes", "type": "number"}
    ],
    "athletics": [
        {"name": "distance_meters", "label": "Running Distance", "unit": "meters", "type": "number"},
        {"name": "time_seconds", "label": "Time Taken", "unit": "seconds", "type": "number"},
        {"name": "pace_min_km", "label": "Pace", "unit": "min/km", "type": "number"},
        {"name": "long_jump_best", "label": "Long Jump Best Distance", "unit": "meters", "type": "number"},
        {"name": "high_jump_best", "label": "High Jump Best Height", "unit": "meters", "type": "number"}
    ]
}

@router.get("/templates/{sport_name}")
def get_metric_template(sport_name: str):
    key = sport_name.lower().strip()
    return SPORT_TEMPLATES.get(key, [
        {"name": "repetitions", "label": "Repetitions / Sets", "unit": "reps", "type": "number"},
        {"name": "accuracy", "label": "Execution Accuracy", "unit": "%", "type": "number"},
        {"name": "errors", "label": "Errors / Faults", "unit": "count", "type": "number"}
    ])

from app.ai_engine import run_student_ai_analysis

@router.post("/sessions")
def create_practice_session(req: PracticeSessionCreate, user: dict = Depends(require_student)):
    with db_session() as conn:
        cursor = conn.cursor()
        
        # Ensure sport exists
        cursor.execute("SELECT sport_id FROM sports WHERE sport_id = ?", (req.sport_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Selected sport not found")
            
        cursor.execute("""
            INSERT INTO practice_sessions 
            (student_id, sport_id, date, duration_minutes, intensity, training_type, training_area, coach_rating, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user["user_id"], req.sport_id, req.date, req.duration_minutes,
            req.intensity, req.training_type, req.training_area, req.coach_rating, req.notes
        ))
        
        session_id = cursor.lastrowid
        
        # Save dynamic performance metrics
        for m in req.metrics:
            cursor.execute("""
                INSERT INTO performance_records (session_id, metric_name, metric_value, metric_unit)
                VALUES (?, ?, ?, ?)
            """, (session_id, m.metric_name, m.metric_value, m.metric_unit))
            
        # Save problems / struggles
        for p in req.problems:
            cursor.execute("""
                INSERT INTO problems (session_id, description, severity, category)
                VALUES (?, ?, ?, ?)
            """, (session_id, p.description, p.severity, p.category))

        # Check if student achieved any active AI goals
        _check_student_goals_achievement(cursor, user["user_id"], req.sport_id)

    # Automatically trigger AI analysis generation for student
    try:
        run_student_ai_analysis(user["user_id"], req.sport_id)
    except Exception as e:
        print("AI analysis auto-trigger error:", e)

    return {
        "message": "Practice session recorded successfully",
        "session_id": session_id
    }

def _check_student_goals_achievement(cursor, student_id: int, sport_id: int):
    cursor.execute("""
        SELECT g.goal_id, g.title, g.target_value, g.current_value, g.status
        FROM goals g
        WHERE g.student_id = ? AND g.sport_id = ? AND g.status = 'IN_PROGRESS'
    """, (student_id, sport_id))
    active_goals = [dict(r) for r in cursor.fetchall()]

    if not active_goals:
        return

    cursor.execute("SELECT COUNT(*) as session_count FROM practice_sessions WHERE student_id = ? AND sport_id = ?", (student_id, sport_id))
    row = cursor.fetchone()
    session_count = row["session_count"] if row else 1

    new_progress = min(100.0, float(session_count * 35.0))

    cursor.execute("SELECT name FROM users WHERE user_id = ?", (student_id,))
    student_row = cursor.fetchone()
    student_name = student_row["name"] if student_row else "Student"

    for g in active_goals:
        goal_id = g["goal_id"]
        goal_title = g["title"]

        cursor.execute("UPDATE goals SET current_value = ? WHERE goal_id = ?", (new_progress, goal_id))

        if new_progress >= 100.0:
            cursor.execute("UPDATE goals SET status = 'COMPLETED', current_value = 100.0 WHERE goal_id = ?", (goal_id,))

            # 1. Notify Student
            cursor.execute("""
                INSERT INTO notifications (user_id, title, message, type)
                VALUES (?, '🎉 Goal Achieved!', ?, 'GOAL_ACHIEVED')
            """, (student_id, f"Congratulations! You accomplished your target goal: '{goal_title}'! Great practice performance."))

            # 2. Notify connected coach if any
            cursor.execute("""
                SELECT coach_id FROM coach_connections WHERE student_id = ? AND status = 'ACCEPTED'
            """, (student_id,))
            coaches = cursor.fetchall()
            for c in coaches:
                cursor.execute("""
                    INSERT INTO notifications (user_id, title, message, type)
                    VALUES (?, '🏆 Student Achieved Goal!', ?, 'GOAL_ACHIEVED')
                """, (c["coach_id"], f"Student {student_name} achieved their AI target goal: '{goal_title}'!"))

@router.get("/sessions")
def list_practice_sessions(
    sport_id: Optional[int] = None,
    training_type: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    with db_session() as conn:
        cursor = conn.cursor()
        query = """
            SELECT ps.session_id, ps.student_id, ps.sport_id, s.name as sport_name, s.category,
                   ps.date, ps.duration_minutes, ps.intensity, ps.training_type, ps.training_area, 
                   ps.coach_rating, ps.notes, ps.created_at
            FROM practice_sessions ps
            JOIN sports s ON ps.sport_id = s.sport_id
            WHERE ps.student_id = ?
        """
        params = [user["user_id"]]
        
        if sport_id:
            query += " AND ps.sport_id = ?"
            params.append(sport_id)
        if training_type:
            query += " AND ps.training_type = ?"
            params.append(training_type)
            
        query += " ORDER BY ps.date DESC, ps.session_id DESC"
        cursor.execute(query, params)
        sessions = [dict(r) for r in cursor.fetchall()]
        
        # Attach metrics and problems to each session
        for s in sessions:
            cursor.execute("SELECT metric_name, metric_value, metric_unit FROM performance_records WHERE session_id = ?", (s["session_id"],))
            s["metrics"] = [dict(r) for r in cursor.fetchall()]
            
            cursor.execute("SELECT description, severity, category FROM problems WHERE session_id = ?", (s["session_id"],))
            s["problems"] = [dict(r) for r in cursor.fetchall()]

        return sessions

@router.delete("/sessions/{session_id}")
def delete_practice_session(session_id: int, user: dict = Depends(require_student)):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM practice_sessions WHERE session_id = ? AND student_id = ?", (session_id, user["user_id"]))
        return {"message": "Practice session deleted successfully"}
