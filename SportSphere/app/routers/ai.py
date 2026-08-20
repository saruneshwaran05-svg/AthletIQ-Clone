from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.auth import get_current_user
from app.ai_engine import run_student_ai_analysis
from app.database import db_session

router = APIRouter(prefix="/api/ai", tags=["AI Recommendation Engine"])

def _get_coach_sport_clause(cursor, coach_id: int):
    """Returns SQL snippet and params to filter sports by coach specialization."""
    cursor.execute("SELECT coaching_specialization FROM users WHERE user_id = ? AND role = 'COACH'", (coach_id,))
    row = cursor.fetchone()
    if not row or not row["coaching_specialization"]:
        return "", []
    spec = row["coaching_specialization"].strip().lower()
    # If coach specialization is 'all' or empty, don't filter
    if spec in ['all', 'general', 'general coach']:
        return "", []
    
    # Clean spec (e.g. 'Cricket Coach' -> 'Cricket')
    clean_spec = spec.replace('coach', '').replace('specialist', '').strip()
    term = f"%{clean_spec}%"
    clause = " AND (LOWER(s.name) LIKE ? OR LOWER(?) LIKE '%' || LOWER(s.name) || '%')"
    return clause, [term, spec]

@router.post("/analyze")
def trigger_ai_analysis(sport_id: Optional[int] = Query(None), student_id: Optional[int] = Query(None), user: dict = Depends(get_current_user)):
    target_student_id = student_id if (user["role"] == "COACH" and student_id) else user["user_id"]
    
    # If coach is calling, enforce sport_id filter or coach's specialization
    if user["role"] == "COACH":
        with db_session() as conn:
            cursor = conn.cursor()
            clause, params = _get_coach_sport_clause(cursor, user["user_id"])
            if clause and not sport_id:
                # Find matching sport_id for coach
                cursor.execute(f"SELECT s.sport_id FROM sports s WHERE 1=1 {clause} LIMIT 1", params)
                sp_row = cursor.fetchone()
                if sp_row:
                    sport_id = sp_row["sport_id"]
                    
    result = run_student_ai_analysis(target_student_id, sport_id)
    return result

@router.get("/recommendations")
def get_ai_recommendations(sport_id: Optional[int] = Query(None), session_id: Optional[int] = Query(None), student_id: Optional[int] = Query(None), user: dict = Depends(get_current_user)):
    target_student_id = student_id if (user["role"] == "COACH" and student_id) else user["user_id"]
    
    with db_session() as conn:
        cursor = conn.cursor()
        coach_clause = ""
        coach_params = []
        if user["role"] == "COACH":
            coach_clause, coach_params = _get_coach_sport_clause(cursor, user["user_id"])

        if session_id:
            query = f"""
                SELECT ar.recommendation_id, ar.sport_id, ar.session_id, ar.title, ar.detected_issue, ar.evidence, 
                       ar.recommendation_text, ar.suggested_goal, ar.priority, ar.created_at,
                       ar.coach_suggestion, ar.coach_suggested_at, ar.coach_id,
                       u.name as coach_name, u.profile_photo as coach_photo,
                       s.name as sport_name, s.category as sport_category
                FROM ai_recommendations ar
                JOIN sports s ON ar.sport_id = s.sport_id
                LEFT JOIN users u ON ar.coach_id = u.user_id
                WHERE ar.student_id = ? AND ar.session_id = ? {coach_clause}
                ORDER BY ar.created_at DESC, ar.priority ASC
            """
            cursor.execute(query, [target_student_id, session_id] + coach_params)
        elif sport_id:
            query = f"""
                SELECT ar.recommendation_id, ar.sport_id, ar.session_id, ar.title, ar.detected_issue, ar.evidence, 
                       ar.recommendation_text, ar.suggested_goal, ar.priority, ar.created_at,
                       ar.coach_suggestion, ar.coach_suggested_at, ar.coach_id,
                       u.name as coach_name, u.profile_photo as coach_photo,
                       s.name as sport_name, s.category as sport_category
                FROM ai_recommendations ar
                JOIN sports s ON ar.sport_id = s.sport_id
                LEFT JOIN users u ON ar.coach_id = u.user_id
                WHERE ar.student_id = ? AND ar.sport_id = ? {coach_clause}
                ORDER BY ar.created_at DESC, ar.priority ASC
            """
            cursor.execute(query, [target_student_id, sport_id] + coach_params)
        else:
            query = f"""
                SELECT ar.recommendation_id, ar.sport_id, ar.session_id, ar.title, ar.detected_issue, ar.evidence, 
                       ar.recommendation_text, ar.suggested_goal, ar.priority, ar.created_at,
                       ar.coach_suggestion, ar.coach_suggested_at, ar.coach_id,
                       u.name as coach_name, u.profile_photo as coach_photo,
                       s.name as sport_name, s.category as sport_category
                FROM ai_recommendations ar
                JOIN sports s ON ar.sport_id = s.sport_id
                LEFT JOIN users u ON ar.coach_id = u.user_id
                WHERE ar.student_id = ? {coach_clause}
                ORDER BY s.name ASC, ar.priority ASC, ar.created_at DESC
            """
            cursor.execute(query, [target_student_id] + coach_params)
            
        recs = [dict(r) for r in cursor.fetchall()]
        
        # Deduplicate recommendations by (sport_id, normalized topic) to prevent repetitive cards
        import re
        seen = set()
        unique_recs = []
        for r in recs:
            title_clean = (r.get("title") or "").strip().lower()
            title_clean = re.sub(r"^.*?session \d{4}-\d{2}-\d{2}.*?:\s*", "", title_clean)
            issue_clean = (r.get("detected_issue") or "").strip().lower()
            issue_clean = re.sub(r"^session issue on \d{4}-\d{2}-\d{2}:\s*", "", issue_clean)

            topic_key = title_clean if title_clean else issue_clean
            key = (r["sport_id"], topic_key)
            if key not in seen:
                seen.add(key)
                unique_recs.append(r)

        return unique_recs

from app.schemas import CoachAiSuggestionInput
from app.auth import require_coach
from fastapi import HTTPException

@router.post("/recommendations/{recommendation_id}/coach-suggestion")
def add_coach_ai_suggestion(recommendation_id: int, req: CoachAiSuggestionInput, user: dict = Depends(require_coach)):
    with db_session() as conn:
        cursor = conn.cursor()
        
        cursor.execute("SELECT recommendation_id, student_id, title FROM ai_recommendations WHERE recommendation_id = ?", (recommendation_id,))
        rec = cursor.fetchone()
        if not rec:
            raise HTTPException(status_code=404, detail="AI Recommendation not found")
        rec = dict(rec)

        cursor.execute("SELECT connection_id FROM coach_connections WHERE coach_id = ? AND student_id = ? AND status = 'ACCEPTED'", (user["user_id"], rec["student_id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=403, detail="Access denied. You can only provide suggestions for connected students.")

        cursor.execute("""
            UPDATE ai_recommendations 
            SET coach_suggestion = ?, coach_suggested_at = CURRENT_TIMESTAMP, coach_id = ?
            WHERE recommendation_id = ?
        """, (req.coach_suggestion, user["user_id"], recommendation_id))

        cursor.execute("""
            INSERT INTO notifications (user_id, title, message, type)
            VALUES (?, 'Coach Added Suggestion to AI Finding', ?, 'COACH_SUGGESTION')
        """, (rec["student_id"], f"Coach {user['name']} added personalized guidance on AI recommendation '{rec['title']}'."))

        return {
            "message": "Coach suggestion attached to AI recommendation successfully",
            "coach_suggestion": req.coach_suggestion,
            "coach_name": user["name"]
        }

@router.get("/analyses")
def get_ai_analyses(sport_id: Optional[int] = Query(None), student_id: Optional[int] = Query(None), user: dict = Depends(get_current_user)):
    target_student_id = student_id if (user["role"] == "COACH" and student_id) else user["user_id"]
    
    with db_session() as conn:
        cursor = conn.cursor()
        coach_clause = ""
        coach_params = []
        if user["role"] == "COACH":
            coach_clause, coach_params = _get_coach_sport_clause(cursor, user["user_id"])

        if sport_id:
            query = f"""
                SELECT aa.analysis_id, aa.sport_id, aa.analysis_text, aa.detected_issue, aa.trend_type, 
                       aa.supporting_evidence, aa.created_at, s.name as sport_name, s.category as sport_category
                FROM ai_analyses aa
                JOIN sports s ON aa.sport_id = s.sport_id
                WHERE aa.student_id = ? AND aa.sport_id = ? {coach_clause}
                ORDER BY aa.created_at DESC
            """
            cursor.execute(query, [target_student_id, sport_id] + coach_params)
        else:
            query = f"""
                SELECT aa.analysis_id, aa.sport_id, aa.analysis_text, aa.detected_issue, aa.trend_type, 
                       aa.supporting_evidence, aa.created_at, s.name as sport_name, s.category as sport_category
                FROM ai_analyses aa
                JOIN sports s ON aa.sport_id = s.sport_id
                WHERE aa.student_id = ? {coach_clause}
                ORDER BY s.name ASC, aa.created_at DESC
            """
            cursor.execute(query, [target_student_id] + coach_params)
            
        analyses = [dict(r) for r in cursor.fetchall()]
        
        # Deduplicate analyses by (sport_id, trend_type)
        seen = set()
        unique_analyses = []
        for a in analyses:
            key = (a["sport_id"], a["trend_type"])
            if key not in seen:
                seen.add(key)
                unique_analyses.append(a)

        return unique_analyses

@router.get("/sports")
def get_ai_sports(student_id: Optional[int] = Query(None), user: dict = Depends(get_current_user)):
    """Returns distinct sports that have recorded sessions for this student, filtered by coach specialization if user is coach."""
    target_student_id = student_id if (user["role"] == "COACH" and student_id) else user["user_id"]
    with db_session() as conn:
        cursor = conn.cursor()
        coach_clause = ""
        coach_params = []
        if user["role"] == "COACH":
            coach_clause, coach_params = _get_coach_sport_clause(cursor, user["user_id"])

        query = f"""
            SELECT DISTINCT s.sport_id, s.name as sport_name, s.category as sport_category,
                   COUNT(ps.session_id) as session_count
            FROM practice_sessions ps
            JOIN sports s ON ps.sport_id = s.sport_id
            WHERE ps.student_id = ? {coach_clause}
            GROUP BY s.sport_id, s.name, s.category
            ORDER BY s.name ASC
        """
        cursor.execute(query, [target_student_id] + coach_params)
        sports = [dict(r) for r in cursor.fetchall()]
        return sports

@router.get("/session-analytics")
def get_session_wise_ai_analytics(student_id: Optional[int] = Query(None), sport_id: Optional[int] = Query(None), user: dict = Depends(get_current_user)):
    """Returns session-wise practice session records with dates, coach ratings, metrics, problems, and AI session feedback."""
    if hasattr(student_id, 'default'):
        student_id = None
    if hasattr(sport_id, 'default'):
        sport_id = None

    target_student_id = student_id if (user["role"] == "COACH" and student_id) else user["user_id"]
    with db_session() as conn:
        cursor = conn.cursor()
        coach_clause = ""
        coach_params = []
        if user["role"] == "COACH":
            coach_clause, coach_params = _get_coach_sport_clause(cursor, user["user_id"])

        query = f"""
            SELECT ps.session_id, ps.student_id, ps.sport_id, s.name as sport_name, s.category,
                   ps.date, ps.duration_minutes, ps.intensity, ps.training_type, ps.training_area,
                   ps.coach_rating, ps.notes, ps.created_at
            FROM practice_sessions ps
            JOIN sports s ON ps.sport_id = s.sport_id
            WHERE ps.student_id = ? {coach_clause}
        """
        params = [target_student_id] + coach_params
        if sport_id:
            query += " AND ps.sport_id = ?"
            params.append(sport_id)

        query += " ORDER BY ps.date DESC, ps.session_id DESC"
        cursor.execute(query, params)
        sessions = [dict(r) for r in cursor.fetchall()]

        for s in sessions:
            cursor.execute("SELECT metric_name, metric_value, metric_unit FROM performance_records WHERE session_id = ?", (s["session_id"],))
            s["metrics"] = [dict(r) for r in cursor.fetchall()]

            cursor.execute("SELECT description, severity, category FROM problems WHERE session_id = ?", (s["session_id"],))
            s["problems"] = [dict(r) for r in cursor.fetchall()]

            # Fetch session-wise AI recommendations generated for this session
            cursor.execute("""
                SELECT recommendation_id, title, detected_issue, evidence, recommendation_text, suggested_goal, priority, created_at
                FROM ai_recommendations
                WHERE session_id = ?
                ORDER BY priority ASC, recommendation_id DESC
            """, (s["session_id"],))
            raw_s_recs = [dict(r) for r in cursor.fetchall()]
            seen_r = set()
            uniq_s_recs = []
            for r in raw_s_recs:
                t_key = r["title"].strip().lower() if r.get("title") else ""
                if t_key not in seen_r:
                    seen_r.add(t_key)
                    uniq_s_recs.append(r)
            s["session_recommendations"] = uniq_s_recs

            # Fetch coach feedbacks submitted for this session or sport
            cursor.execute("""
                SELECT cf.feedback_id, cf.coach_id, u.name as coach_name, u.coaching_specialization,
                       cf.observed_strength, cf.observed_weakness, cf.feedback_text,
                       cf.recommended_drill, cf.practice_duration_minutes, cf.priority,
                       cf.student_reply, cf.student_reply_at, cf.created_at
                FROM coach_feedback cf
                JOIN users u ON cf.coach_id = u.user_id
                WHERE cf.student_id = ? AND (cf.session_id = ? OR (cf.session_id IS NULL AND cf.sport_id = ?))
                ORDER BY cf.created_at DESC
            """, (target_student_id, s["session_id"], s["sport_id"]))
            s["coach_feedbacks"] = [dict(r) for r in cursor.fetchall()]

            # Build session AI feedback string
            probs_str = ", ".join([p["description"] for p in s["problems"]]) if s["problems"] else None
            c_rating_str = f"{s['coach_rating']}/10" if s['coach_rating'] is not None else "Pending Coach Rating"
            if probs_str:
                s["ai_session_feedback"] = f"Session Date: {s['date']} ({s['duration_minutes']}m {s['training_type'].replace('_',' ')}). Detected Issue: '{probs_str}'. Coach Rating: {c_rating_str}."
            else:
                s["ai_session_feedback"] = f"Session Date: {s['date']} ({s['duration_minutes']}m {s['training_type'].replace('_',' ')}). Execution smooth at {s['intensity']} intensity. Coach Rating: {c_rating_str}."

        return sessions

