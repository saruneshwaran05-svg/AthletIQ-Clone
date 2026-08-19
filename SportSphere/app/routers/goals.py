from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from app.schemas import GoalCreate, GoalUpdate
from app.auth import require_student, get_current_user
from app.database import db_session

router = APIRouter(prefix="/api/goals", tags=["Goals & Progress"])

@router.post("")
def create_goal(req: GoalCreate, user: dict = Depends(require_student)):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO goals (student_id, sport_id, title, description, metric_name, target_value, unit, deadline)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user["user_id"], req.sport_id, req.title, req.description,
            req.metric_name, req.target_value, req.unit, req.deadline
        ))
        goal_id = cursor.lastrowid
        return {"message": "Goal created successfully", "goal_id": goal_id}

@router.post("/from-ai/{recommendation_id}")
def adopt_ai_recommendation_goal(recommendation_id: int, user: dict = Depends(require_student)):
    with db_session() as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT recommendation_id, sport_id, title, recommendation_text, suggested_goal, priority
            FROM ai_recommendations
            WHERE recommendation_id = ? AND student_id = ?
        """, (recommendation_id, user["user_id"]))
        rec = cursor.fetchone()
        if not rec:
            raise HTTPException(status_code=404, detail="AI Recommendation not found")
        rec = dict(rec)

        # Check if already set as active goal
        cursor.execute("SELECT goal_id, status FROM goals WHERE student_id = ? AND title = ?", (user["user_id"], rec["title"]))
        existing = cursor.fetchone()
        if existing:
            return {"message": "Goal is already set for this AI suggestion", "goal_id": existing["goal_id"], "status": existing["status"]}

        # Create goal target from AI suggestion
        cursor.execute("""
            INSERT INTO goals (student_id, sport_id, title, description, metric_name, initial_value, current_value, target_value, unit, deadline, status)
            VALUES (?, ?, ?, ?, ?, 0, 0, 100, '%', date('now', '+30 days'), 'IN_PROGRESS')
        """, (
            user["user_id"], rec["sport_id"], rec["title"], rec["recommendation_text"],
            rec["suggested_goal"] or "AI Performance Target"
        ))
        goal_id = cursor.lastrowid

        # Insert notification for student
        cursor.execute("""
            INSERT INTO notifications (user_id, title, message, type)
            VALUES (?, '🎯 New Target Goal Set from AI', ?, 'GOAL_ADOPTED')
        """, (user["user_id"], f"Goal target '{rec['title']}' is active! Complete practice sessions to achieve it."))

        return {"message": "Goal target set from AI suggestion successfully!", "goal_id": goal_id, "status": "IN_PROGRESS"}

@router.get("")
def list_goals(user: dict = Depends(get_current_user)):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT g.goal_id, g.sport_id, s.name as sport_name, g.title, g.description,
                   g.metric_name, g.initial_value, g.current_value, g.target_value,
                   g.unit, g.deadline, g.status, g.created_at
            FROM goals g
            JOIN sports s ON g.sport_id = s.sport_id
            WHERE g.student_id = ?
            ORDER BY g.deadline ASC
        """, (user["user_id"],))
        goals = [dict(r) for r in cursor.fetchall()]
        
        # Calculate dynamic progress
        for g in goals:
            if g["target_value"] > 0:
                progress = min(100.0, round((g["current_value"] / g["target_value"]) * 100, 1))
            else:
                progress = 0.0
            g["progress_percentage"] = progress
            if progress >= 100.0 and g["status"] == "IN_PROGRESS":
                cursor.execute("UPDATE goals SET status = 'COMPLETED' WHERE goal_id = ?", (g["goal_id"],))
                g["status"] = "COMPLETED"
                
        return goals

@router.put("/{goal_id}")
def update_goal(goal_id: int, req: GoalUpdate, user: dict = Depends(require_student)):
    with db_session() as conn:
        cursor = conn.cursor()
        updates = []
        params = []
        if req.current_value is not None:
            updates.append("current_value = ?")
            params.append(req.current_value)
        if req.status is not None:
            updates.append("status = ?")
            params.append(req.status)
            
        if updates:
            params.append(goal_id)
            params.append(user["user_id"])
            cursor.execute(f"UPDATE goals SET {', '.join(updates)} WHERE goal_id = ? AND student_id = ?", params)
            
        return {"message": "Goal updated successfully"}

@router.delete("/{goal_id}")
def delete_goal(goal_id: int, user: dict = Depends(require_student)):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM goals WHERE goal_id = ? AND student_id = ?", (goal_id, user["user_id"]))
        return {"message": "Goal deleted successfully"}
