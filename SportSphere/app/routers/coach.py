from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from app.schemas import CoachFeedbackCreate, SessionRatingInput, StudentFeedbackReplyInput
from app.auth import get_current_user, require_student, require_coach
from app.database import db_session
from app.ai_engine import run_student_ai_analysis

router = APIRouter(prefix="/api/coach", tags=["Coach Management"])

def _get_coach_spec(cursor, coach_id: int) -> str:
    cursor.execute("SELECT coaching_specialization FROM users WHERE user_id = ?", (coach_id,))
    row = cursor.fetchone()
    if not row or not row["coaching_specialization"]:
        return ""
    spec = row["coaching_specialization"].strip().lower()
    if spec in ['all', 'general', 'general coach']:
        return ""
    return spec.replace('coach', '').replace('specialist', '').strip()


def _is_student_eligible_for_coach(cursor, student_id: int, coach_id: int) -> tuple:
    """
    Checks if a student has logged practice sessions (or active sports) in the specialized sport of a coach.
    Returns (is_eligible, coach_sport_display, student_logged_sports_display_list).
    """
    cursor.execute("SELECT coaching_specialization FROM users WHERE user_id = ? AND role = 'COACH'", (coach_id,))
    coach_row = cursor.fetchone()
    if not coach_row or not coach_row["coaching_specialization"]:
        return True, "General", []

    coach_spec_raw = coach_row["coaching_specialization"].strip()
    coach_spec_lower = coach_spec_raw.lower()

    if coach_spec_lower in ['all', 'general', 'general coach']:
        return True, "General", []

    clean_coach_sport = coach_spec_raw.replace('Coach', '').replace('coach', '').replace('Specialist', '').replace('specialist', '').strip()
    clean_coach_lower = clean_coach_sport.lower()

    # 1. Fetch sports where the student has recorded practice sessions
    logged_sports_set = set()
    logged_sports_display = []

    cursor.execute("""
        SELECT DISTINCT s.name 
        FROM practice_sessions ps
        JOIN sports s ON ps.sport_id = s.sport_id
        WHERE ps.student_id = ?
    """, (student_id,))
    for r in cursor.fetchall():
        sp_name = r["name"].strip()
        logged_sports_set.add(sp_name.lower())
        if sp_name not in logged_sports_display:
            logged_sports_display.append(sp_name)

    # 2. Fallback to student_sports / preferred_sport if no sessions logged yet
    if not logged_sports_set:
        cursor.execute("SELECT preferred_sport FROM users WHERE user_id = ?", (student_id,))
        u_row = cursor.fetchone()
        if u_row and u_row["preferred_sport"]:
            pref = u_row["preferred_sport"].strip()
            logged_sports_set.add(pref.lower())
            if pref not in logged_sports_display:
                logged_sports_display.append(pref)

        cursor.execute("""
            SELECT s.name 
            FROM student_sports ss
            JOIN sports s ON ss.sport_id = s.sport_id
            WHERE ss.student_id = ?
        """, (student_id,))
        for r in cursor.fetchall():
            sp_name = r["name"].strip()
            logged_sports_set.add(sp_name.lower())
            if sp_name not in logged_sports_display:
                logged_sports_display.append(sp_name)

    is_eligible = False
    for st_sport in logged_sports_set:
        if clean_coach_lower in st_sport or st_sport in clean_coach_lower:
            is_eligible = True
            break

    return is_eligible, clean_coach_sport, logged_sports_display


@router.get("/search")
def search_coaches(q: Optional[str] = None, user: dict = Depends(get_current_user)):
    with db_session() as conn:
        cursor = conn.cursor()
        query = "SELECT user_id, name, email, coaching_specialization, experience_years, certification, bio, profile_photo FROM users WHERE role = 'COACH'"
        params = []
        if q:
            query += " AND (LOWER(name) LIKE ? OR LOWER(coaching_specialization) LIKE ?)"
            term = f"%{q.lower().strip()}%"
            params.extend([term, term])
            
        cursor.execute(query, params)
        coaches = [dict(r) for r in cursor.fetchall()]
        
        # Check connection status and sport eligibility for each coach if logged in as student
        if user["role"] == "STUDENT":
            for c in coaches:
                cursor.execute("SELECT connection_id, status FROM coach_connections WHERE student_id = ? AND coach_id = ?", (user["user_id"], c["user_id"]))
                conn_row = cursor.fetchone()
                c["connection_status"] = conn_row["status"] if conn_row else "NONE"
                c["connection_id"] = conn_row["connection_id"] if conn_row else None
                
                is_eligible, coach_sport, student_sports = _is_student_eligible_for_coach(cursor, user["user_id"], c["user_id"])
                c["is_eligible"] = is_eligible
                c["coach_sport"] = coach_sport
                c["student_sports"] = student_sports
                if not is_eligible:
                    st_str = ", ".join(student_sports) or "Cricket"
                    c["lock_reason"] = f"Requires logged sessions in {coach_sport}. (Your logged/active sports: {st_str})"

        return coaches

@router.post("/connect/{coach_id}")
def send_connection_request(coach_id: int, user: dict = Depends(require_student)):
    with db_session() as conn:
        cursor = conn.cursor()
        
        # Verify coach
        cursor.execute("SELECT user_id, name, coaching_specialization FROM users WHERE user_id = ? AND role = 'COACH'", (coach_id,))
        coach = cursor.fetchone()
        if not coach:
            raise HTTPException(status_code=404, detail="Coach not found")
        coach = dict(coach)
            
        # Check sport eligibility
        is_eligible, coach_sport, student_sports = _is_student_eligible_for_coach(cursor, user["user_id"], coach_id)
        if not is_eligible:
            st_sports_str = ", ".join(student_sports) or "Cricket"
            raise HTTPException(
                status_code=400,
                detail=f"Connection locked! You have logged sessions/active profile in '{st_sports_str}'. To connect with Coach {coach['name']}, log a practice session in '{coach_sport}'."
            )

        # Check existing connection
        cursor.execute("SELECT connection_id, status FROM coach_connections WHERE student_id = ? AND coach_id = ?", (user["user_id"], coach_id))
        existing = cursor.fetchone()
        if existing:
            raise HTTPException(status_code=400, detail=f"Connection request already exists (Status: {existing['status']})")
            
        cursor.execute("""
            INSERT INTO coach_connections (student_id, coach_id, status)
            VALUES (?, ?, 'PENDING')
        """, (user["user_id"], coach_id))
        
        # Create notification for coach
        cursor.execute("""
            INSERT INTO notifications (user_id, title, message, type)
            VALUES (?, 'New Connection Request', ?, 'COACH_REQUEST')
        """, (coach_id, f"Student {user['name']} sent you a coaching connection request."))
        
        return {"message": f"Connection request sent to Coach {coach['name']}"}

@router.get("/requests")
def get_connection_requests(user: dict = Depends(require_coach)):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT cc.connection_id, cc.student_id, cc.status, cc.created_at,
                   u.name as student_name, u.email as student_email, u.preferred_sport, u.profile_photo
            FROM coach_connections cc
            JOIN users u ON cc.student_id = u.user_id
            WHERE cc.coach_id = ? AND cc.status = 'PENDING'
            ORDER BY cc.created_at DESC
        """, (user["user_id"],))
        requests = [dict(r) for r in cursor.fetchall()]

        for req in requests:
            is_eligible, coach_sport, student_sports = _is_student_eligible_for_coach(cursor, req["student_id"], user["user_id"])
            req["is_eligible"] = is_eligible
            req["student_sports"] = student_sports
            if not is_eligible:
                st_str = ", ".join(student_sports) or req.get("preferred_sport") or "Cricket"
                req["eligibility_warning"] = f"Ineligible: Student {req['student_name']} is only in '{st_str}' and does not participate in {coach_sport}."

        return requests

@router.post("/requests/{connection_id}/respond")
def respond_connection_request(connection_id: int, accept: bool, user: dict = Depends(require_coach)):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT cc.student_id, cc.coach_id, u.name as student_name
            FROM coach_connections cc
            JOIN users u ON cc.student_id = u.user_id
            WHERE cc.connection_id = ? AND cc.coach_id = ?
        """, (connection_id, user["user_id"]))
        conn_row = cursor.fetchone()
        if not conn_row:
            raise HTTPException(status_code=404, detail="Connection request not found")
        conn_row = dict(conn_row)

        if accept:
            is_eligible, coach_sport, student_sports = _is_student_eligible_for_coach(cursor, conn_row["student_id"], user["user_id"])
            if not is_eligible:
                st_str = ", ".join(student_sports) or "Cricket"
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot accept request: Student {conn_row['student_name']} is only in '{st_str}' and does not participate in {coach_sport} sessions."
                )

        new_status = "ACCEPTED" if accept else "REJECTED"
        cursor.execute("UPDATE coach_connections SET status = ? WHERE connection_id = ?", (new_status, connection_id))
        
        # Notify student
        cursor.execute("""
            INSERT INTO notifications (user_id, title, message, type)
            VALUES (?, 'Coach Connection Update', ?, 'COACH_REQUEST')
        """, (conn_row["student_id"], f"Coach {user['name']} has {new_status.lower()} your connection request."))
        
        return {"message": f"Request {new_status.lower()} successfully"}

@router.get("/students")
def get_connected_students(user: dict = Depends(require_coach)):
    with db_session() as conn:
        cursor = conn.cursor()
        spec = _get_coach_spec(cursor, user["user_id"])
        
        if spec:
            sport_clause = " JOIN sports s ON ps.sport_id = s.sport_id WHERE ps.student_id = u.user_id AND (LOWER(s.name) LIKE ? OR LOWER(?) LIKE '%' || LOWER(s.name) || '%')"
            sport_params = [f"%{spec}%", spec]
            
            cursor.execute(f"""
                SELECT cc.connection_id, cc.student_id, u.user_id,
                       u.name as student_name, u.email as student_email,
                       u.name, u.email,
                       u.preferred_sport, u.profile_photo, cc.created_at,
                       (SELECT COUNT(*) FROM practice_sessions ps {sport_clause}) as total_sessions,
                       (SELECT COALESCE(SUM(ps.duration_minutes), 0) FROM practice_sessions ps {sport_clause}) as total_minutes
                FROM coach_connections cc
                JOIN users u ON cc.student_id = u.user_id
                WHERE cc.coach_id = ? AND cc.status = 'ACCEPTED'
                ORDER BY cc.created_at DESC
            """, sport_params + sport_params + [user["user_id"]])
        else:
            cursor.execute("""
                SELECT cc.connection_id, cc.student_id, u.user_id,
                       u.name as student_name, u.email as student_email,
                       u.name, u.email,
                       u.preferred_sport, u.profile_photo, cc.created_at,
                       (SELECT COUNT(*) FROM practice_sessions ps WHERE ps.student_id = u.user_id) as total_sessions,
                       (SELECT COALESCE(SUM(ps.duration_minutes), 0) FROM practice_sessions ps WHERE ps.student_id = u.user_id) as total_minutes
                FROM coach_connections cc
                JOIN users u ON cc.student_id = u.user_id
                WHERE cc.coach_id = ? AND cc.status = 'ACCEPTED'
                ORDER BY cc.created_at DESC
            """, (user["user_id"],))
            
        students = [dict(r) for r in cursor.fetchall()]
        for s in students:
            s["total_hours"] = round(s["total_minutes"] / 60.0, 1)
            s["total_practice_hours"] = s["total_hours"]
        return students

@router.get("/students/{student_id}")
def get_coach_student_detail(student_id: int, user: dict = Depends(require_coach)):
    with db_session() as conn:
        cursor = conn.cursor()
        
        # Verify active connection
        cursor.execute("SELECT connection_id FROM coach_connections WHERE coach_id = ? AND student_id = ? AND status = 'ACCEPTED'", (user["user_id"], student_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=403, detail="Access denied. You are not connected with this student.")
            
        # Get student info
        cursor.execute("SELECT user_id, name, email, preferred_sport, bio, profile_photo FROM users WHERE user_id = ?", (student_id,))
        student_row = cursor.fetchone()
        if not student_row:
            raise HTTPException(status_code=404, detail="Student record not found.")
        student = dict(student_row)
        
        spec = _get_coach_spec(cursor, user["user_id"])
        sport_clause = ""
        sport_params = []
        if spec:
            sport_clause = " AND (LOWER(s.name) LIKE ? OR LOWER(?) LIKE '%' || LOWER(s.name) || '%')"
            sport_params = [f"%{spec}%", spec]

        # Get student sports (from student_sports OR from logged practice sessions, filtered by coach specialization if defined)
        query_sports = f"""
            SELECT DISTINCT s.sport_id, s.name, s.category,
                   COALESCE(ss.skill_level, 'ACTIVE') as skill_level,
                   COALESCE(ss.experience_years, 0.0) as experience_years,
                   ss.training_goal
            FROM sports s
            LEFT JOIN student_sports ss ON s.sport_id = ss.sport_id AND ss.student_id = ?
            WHERE s.sport_id IN (
                SELECT sport_id FROM student_sports WHERE student_id = ?
                UNION
                SELECT sport_id FROM practice_sessions WHERE student_id = ?
            ) {sport_clause}
        """
        cursor.execute(query_sports, [student_id, student_id, student_id] + sport_params)
        sports = [dict(r) for r in cursor.fetchall()]
        
        # Fallback if sports list is empty and no specialization filter blocked it: query all sports for student
        if not sports and not spec:
            cursor.execute("""
                SELECT DISTINCT s.sport_id, s.name, s.category
                FROM sports s
                WHERE s.sport_id IN (
                    SELECT sport_id FROM student_sports WHERE student_id = ?
                    UNION
                    SELECT sport_id FROM practice_sessions WHERE student_id = ?
                )
            """, (student_id, student_id))
            sports = [dict(r) for r in cursor.fetchall()]

        # Get practice sessions for coached sports
        query_sessions = f"""
            SELECT ps.session_id, ps.sport_id, s.name as sport_name, ps.date, ps.duration_minutes,
                   ps.intensity, ps.training_type, ps.coach_rating, ps.notes
            FROM practice_sessions ps
            JOIN sports s ON ps.sport_id = s.sport_id
            WHERE ps.student_id = ? {sport_clause}
            ORDER BY ps.date DESC LIMIT 20
        """
        cursor.execute(query_sessions, [student_id] + sport_params)
        sessions = [dict(r) for r in cursor.fetchall()]
        
        # Attach metrics and problems to each session
        for s in sessions:
            cursor.execute("SELECT metric_name, metric_value, metric_unit FROM performance_records WHERE session_id = ?", (s["session_id"],))
            s["metrics"] = [dict(r) for r in cursor.fetchall()]

            cursor.execute("SELECT description, severity, category FROM problems WHERE session_id = ?", (s["session_id"],))
            s["problems"] = [dict(r) for r in cursor.fetchall()]

        # Get AI Recommendations filtered by coach specialization
        query_recs = f"""
            SELECT ar.recommendation_id, ar.sport_id, ar.title, ar.detected_issue, ar.evidence,
                   ar.recommendation_text, ar.suggested_goal, ar.priority, ar.created_at,
                   s.name as sport_name
            FROM ai_recommendations ar
            JOIN sports s ON ar.sport_id = s.sport_id
            WHERE ar.student_id = ? {sport_clause}
            ORDER BY ar.created_at DESC
        """
        cursor.execute(query_recs, [student_id] + sport_params)
        ai_recommendations = [dict(r) for r in cursor.fetchall()]

        # Get AI Analyses filtered by coach specialization
        query_anal = f"""
            SELECT aa.analysis_id, aa.sport_id, aa.analysis_text, aa.detected_issue, aa.trend_type,
                   aa.supporting_evidence, aa.created_at, s.name as sport_name
            FROM ai_analyses aa
            JOIN sports s ON aa.sport_id = s.sport_id
            WHERE aa.student_id = ? {sport_clause}
            ORDER BY aa.created_at DESC
        """
        cursor.execute(query_anal, [student_id] + sport_params)
        ai_analyses = [dict(r) for r in cursor.fetchall()]

        # Get Coach Feedback / Drill Suggestions submitted to this student
        query_fb = f"""
            SELECT cf.feedback_id, cf.sport_id, s.name as sport_name, cf.observed_strength, cf.observed_weakness,
                   cf.feedback_text, cf.recommended_drill, cf.practice_duration_minutes, cf.priority,
                   cf.student_reply, cf.student_reply_at, cf.created_at
            FROM coach_feedback cf
            JOIN sports s ON cf.sport_id = s.sport_id
            WHERE cf.student_id = ? AND cf.coach_id = ? {sport_clause}
            ORDER BY cf.created_at DESC
        """
        cursor.execute(query_fb, [student_id, user["user_id"]] + sport_params)
        coach_feedbacks = [dict(r) for r in cursor.fetchall()]

        # Compute per-sport statistics for the student (filtered by coach specialization if defined)
        query_per_sport = f"""
            SELECT DISTINCT s.sport_id, s.name as sport_name, s.category, ss.skill_level, ss.experience_years, ss.training_goal
            FROM sports s
            LEFT JOIN student_sports ss ON s.sport_id = ss.sport_id AND ss.student_id = ?
            WHERE s.sport_id IN (
                SELECT sport_id FROM student_sports WHERE student_id = ?
                UNION
                SELECT sport_id FROM practice_sessions WHERE student_id = ?
            ) {sport_clause}
            ORDER BY s.name ASC
        """
        cursor.execute(query_per_sport, [student_id, student_id, student_id] + sport_params)
        all_sports_rows = [dict(r) for r in cursor.fetchall()]
        sports_statistics = []
        for sp in all_sports_rows:
            sp_id = sp["sport_id"]
            
            cursor.execute("""
                SELECT COUNT(*) as session_count,
                       COALESCE(SUM(duration_minutes), 0) as total_minutes,
                       COALESCE(AVG(coach_rating), 0) as avg_rating,
                       MIN(coach_rating) as min_rating,
                       MAX(coach_rating) as max_rating,
                       MAX(date) as last_practice_date
                FROM practice_sessions
                WHERE student_id = ? AND sport_id = ?
            """, (student_id, sp_id))
            sess_row_raw = cursor.fetchone()
            sess_row = dict(sess_row_raw) if sess_row_raw else {"session_count": 0, "total_minutes": 0, "avg_rating": 0, "min_rating": None, "max_rating": None, "last_practice_date": "N/A"}
            
            cursor.execute("""
                SELECT coach_rating
                FROM practice_sessions
                WHERE student_id = ? AND sport_id = ? AND coach_rating IS NOT NULL
                ORDER BY date ASC, session_id ASC
            """, (student_id, sp_id))
            all_ratings = [r["coach_rating"] for r in cursor.fetchall()]

            cursor.execute("""
                SELECT pr.metric_name, 
                       AVG(pr.metric_value) as avg_val,
                       MAX(pr.metric_value) as max_val,
                       MIN(pr.metric_value) as min_val,
                       COUNT(pr.metric_value) as total_records,
                       pr.metric_unit
                FROM performance_records pr
                JOIN practice_sessions ps ON pr.session_id = ps.session_id
                WHERE ps.student_id = ? AND ps.sport_id = ?
                GROUP BY pr.metric_name
                ORDER BY pr.metric_name ASC
            """, (student_id, sp_id))
            metric_stats = []
            for mr in cursor.fetchall():
                m_name = mr["metric_name"]
                cursor.execute("""
                    SELECT pr.metric_value
                    FROM performance_records pr
                    JOIN practice_sessions ps ON pr.session_id = ps.session_id
                    WHERE ps.student_id = ? AND ps.sport_id = ? AND pr.metric_name = ?
                    ORDER BY ps.date ASC, ps.session_id ASC
                """, (student_id, sp_id, m_name))
                all_metric_values = [round(r["metric_value"], 2) for r in cursor.fetchall() if r["metric_value"] is not None]

                metric_stats.append({
                    "metric_name": m_name,
                    "average": round(mr["avg_val"], 2) if mr["avg_val"] is not None else 0.0,
                    "max": round(mr["max_val"], 2) if mr["max_val"] is not None else 0.0,
                    "min": round(mr["min_val"], 2) if mr["min_val"] is not None else 0.0,
                    "total_records": mr["total_records"],
                    "unit": mr["metric_unit"] or "count",
                    "all_values": all_metric_values
                })

            cursor.execute("""
                SELECT p.description, COUNT(*) as cnt
                FROM problems p
                JOIN practice_sessions ps ON p.session_id = ps.session_id
                WHERE ps.student_id = ? AND ps.sport_id = ?
                GROUP BY p.description
                ORDER BY cnt DESC LIMIT 3
            """, (student_id, sp_id))
            struggles = [{"issue": r["description"], "count": r["cnt"]} for r in cursor.fetchall()]

            improvement = 0.0
            if len(all_ratings) >= 2:
                recent = sum(all_ratings[-3:]) / len(all_ratings[-3:])
                older = sum(all_ratings[:max(1, len(all_ratings)-3)]) / len(all_ratings[:max(1, len(all_ratings)-3)])
                improvement = round(((recent - older) / max(1, older)) * 100, 1)

            sports_statistics.append({
                "sport_id": sp_id,
                "sport_name": sp["sport_name"],
                "category": sp["category"],
                "skill_level": sp["skill_level"] or "Unspecified",
                "session_count": sess_row["session_count"],
                "total_hours": round(sess_row["total_minutes"] / 60.0, 1),
                "average_rating": round(sess_row["avg_rating"], 1) if sess_row["avg_rating"] is not None else 0.0,
                "min_rating": round(sess_row["min_rating"], 1) if sess_row["min_rating"] is not None else None,
                "max_rating": round(sess_row["max_rating"], 1) if sess_row["max_rating"] is not None else None,
                "all_ratings": all_ratings,
                "last_practice_date": sess_row["last_practice_date"] or "N/A",
                "improvement_score": improvement,
                "metrics": metric_stats,
                "struggles": struggles
            })

        return {
            "student": student,
            "coached_sport_filter": spec or "All Sports",
            "sports": sports,
            "sessions": sessions,
            "ai_recommendations": ai_recommendations,
            "ai_analyses": ai_analyses,
            "coach_feedbacks": coach_feedbacks,
            "sports_statistics": sports_statistics
        }

@router.post("/sessions/{session_id}/rate")
def rate_student_session(session_id: int, req: SessionRatingInput, user: dict = Depends(require_coach)):
    with db_session() as conn:
        cursor = conn.cursor()
        
        # Fetch session
        cursor.execute("""
            SELECT ps.session_id, ps.student_id, ps.sport_id, ps.date, s.name as sport_name
            FROM practice_sessions ps
            JOIN sports s ON ps.sport_id = s.sport_id
            WHERE ps.session_id = ?
        """, (session_id,))
        sess = cursor.fetchone()
        if not sess:
            raise HTTPException(status_code=404, detail="Practice session not found")
        sess = dict(sess)

        # Verify active connection between coach and student
        cursor.execute("SELECT connection_id FROM coach_connections WHERE coach_id = ? AND student_id = ? AND status = 'ACCEPTED'", (user["user_id"], sess["student_id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=403, detail="Access denied. You can only rate sessions for connected students.")

        # Verify coach specialization eligibility
        spec = _get_coach_spec(cursor, user["user_id"])
        if spec and not (spec.lower() in sess["sport_name"].lower() or sess["sport_name"].lower() in spec.lower()):
            raise HTTPException(status_code=403, detail=f"Access denied. As a {user.get('coaching_specialization', 'specialized')} Coach, you can only rate {spec.capitalize()} practice sessions.")

        # Update coach rating
        cursor.execute("UPDATE practice_sessions SET coach_rating = ? WHERE session_id = ?", (req.coach_rating, session_id))

        # Create notification for student
        cursor.execute("""
            INSERT INTO notifications (user_id, title, message, type)
            VALUES (?, 'Session Rated by Coach', ?, 'COACH_RATING')
        """, (sess["student_id"], f"Coach {user['name']} rated your {sess['sport_name']} practice session on {sess['date']} as {req.coach_rating}/10."))

    # Trigger re-analysis for student
    run_student_ai_analysis(sess["student_id"], sess["sport_id"])

    return {"message": f"Coach rating {req.coach_rating}/10 generated successfully for session on {sess['date']}"}


@router.post("/feedback")
def add_coach_feedback(req: CoachFeedbackCreate, user: dict = Depends(require_coach)):
    with db_session() as conn:
        cursor = conn.cursor()
        
        # Verify connection
        cursor.execute("SELECT connection_id FROM coach_connections WHERE coach_id = ? AND student_id = ? AND status = 'ACCEPTED'", (user["user_id"], req.student_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=403, detail="You can only provide feedback to connected students.")

        # Verify coach specialization eligibility
        spec = _get_coach_spec(cursor, user["user_id"])
        if spec:
            cursor.execute("SELECT name FROM sports WHERE sport_id = ?", (req.sport_id,))
            sp_row = cursor.fetchone()
            if sp_row and not (spec.lower() in sp_row["name"].lower() or sp_row["name"].lower() in spec.lower()):
                raise HTTPException(status_code=403, detail=f"Access denied. As a {user.get('coaching_specialization', 'specialized')} Coach, you can only provide feedback for {spec.capitalize()}.")
            
        cursor.execute("""
            INSERT INTO coach_feedback
            (coach_id, student_id, sport_id, session_id, observed_strength, observed_weakness, feedback_text, recommended_drill, practice_duration_minutes, priority)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user["user_id"], req.student_id, req.sport_id, req.session_id,
            req.observed_strength, req.observed_weakness, req.feedback_text,
            req.recommended_drill, req.practice_duration_minutes, req.priority
        ))
        
        # Notify student
        cursor.execute("""
            INSERT INTO notifications (user_id, title, message, type)
            VALUES (?, 'New Coach Feedback', ?, 'FEEDBACK')
        """, (req.student_id, f"Coach {user['name']} submitted new professional feedback and a drill recommendation."))
        
        return {"message": "Coach feedback successfully submitted"}

@router.get("/feedback")
def get_student_feedback(sport_id: Optional[int] = Query(None), user: dict = Depends(get_current_user)):
    with db_session() as conn:
        cursor = conn.cursor()
        
        target_student_id = user["user_id"]
        query = """
            SELECT cf.feedback_id, cf.sport_id, cf.observed_strength, cf.observed_weakness, cf.feedback_text,
                   cf.recommended_drill, cf.practice_duration_minutes, cf.priority, cf.student_reply,
                   cf.student_reply_at, cf.created_at, u.name as coach_name, u.coaching_specialization, s.name as sport_name
            FROM coach_feedback cf
            JOIN users u ON cf.coach_id = u.user_id
            JOIN sports s ON cf.sport_id = s.sport_id
            WHERE cf.student_id = ?
        """
        params = [target_student_id]
        if sport_id:
            query += " AND cf.sport_id = ?"
            params.append(sport_id)

        query += " ORDER BY cf.created_at DESC"
        cursor.execute(query, params)
        feedbacks = [dict(r) for r in cursor.fetchall()]
        return feedbacks

@router.post("/feedback/{feedback_id}/reply")
def reply_to_coach_feedback(feedback_id: int, req: StudentFeedbackReplyInput, user: dict = Depends(require_student)):
    with db_session() as conn:
        cursor = conn.cursor()
        
        cursor.execute("SELECT feedback_id, coach_id, student_id, recommended_drill FROM coach_feedback WHERE feedback_id = ? AND student_id = ?", (feedback_id, user["user_id"]))
        fb = cursor.fetchone()
        if not fb:
            raise HTTPException(status_code=404, detail="Feedback item not found")
        fb = dict(fb)

        cursor.execute("""
            UPDATE coach_feedback
            SET student_reply = ?, student_reply_at = CURRENT_TIMESTAMP
            WHERE feedback_id = ?
        """, (req.reply_text, feedback_id))

        # Create notification for coach
        cursor.execute("""
            INSERT INTO notifications (user_id, title, message, type)
            VALUES (?, 'Student Reply to Drill Suggestion', ?, 'STUDENT_REPLY')
        """, (fb["coach_id"], f"Student {user['name']} replied: '{req.reply_text}'"))

        return {"message": "Reply sent to coach successfully"}

@router.delete("/connections/{connection_id}")
def remove_connection(connection_id: int, user: dict = Depends(get_current_user)):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM coach_connections WHERE connection_id = ? AND (student_id = ? OR coach_id = ?)", (connection_id, user["user_id"], user["user_id"]))
        return {"message": "Connection removed successfully"}
