from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from app.auth import get_current_user
from app.database import db_session

router = APIRouter(prefix="/api/analytics", tags=["Performance Analytics"])

@router.get("/overview")
def get_analytics_overview(sport_id: Optional[int] = None, student_id: Optional[int] = None, user: dict = Depends(get_current_user)):
    target_student_id = student_id if (user["role"] == "COACH" and student_id) else user["user_id"]
    
    with db_session() as conn:
        cursor = conn.cursor()
        
        query = """
            SELECT COUNT(*) as session_count, 
                   COALESCE(SUM(duration_minutes), 0) as total_minutes,
                   COALESCE(AVG(coach_rating), 0) as avg_rating
            FROM practice_sessions
            WHERE student_id = ?
        """
        params = [target_student_id]
        if sport_id:
            query += " AND sport_id = ?"
            params.append(sport_id)

        cursor.execute(query, params)
        row = dict(cursor.fetchone())
        
        # Active sports
        cursor.execute("SELECT COUNT(DISTINCT sport_id) as sports_count FROM student_sports WHERE student_id = ?", (target_student_id,))
        sports_count = cursor.fetchone()["sports_count"]
        
        session_count = row["session_count"]
        total_hours = round(row["total_minutes"] / 60.0, 1)
        avg_rating = round(row["avg_rating"], 1)
        
        # Improvement Score computation
        improvement_score = 0
        if session_count >= 2:
            query_ratings = """
                SELECT coach_rating FROM practice_sessions 
                WHERE student_id = ? AND coach_rating IS NOT NULL
            """
            params_r = [target_student_id]
            if sport_id:
                query_ratings += " AND sport_id = ?"
                params_r.append(sport_id)
            query_ratings += " ORDER BY date ASC, session_id ASC"
            cursor.execute(query_ratings, params_r)
            ratings = [r["coach_rating"] for r in cursor.fetchall() if r["coach_rating"] is not None]
            if len(ratings) >= 2:
                recent = sum(ratings[-3:]) / len(ratings[-3:])
                older = sum(ratings[:max(1, len(ratings)-3)]) / len(ratings[:max(1, len(ratings)-3)])
                improvement_score = round(((recent - older) / max(1, older)) * 100, 1)

        sport_name = None
        if sport_id:
            cursor.execute("SELECT name FROM sports WHERE sport_id = ?", (sport_id,))
            sp_row = cursor.fetchone()
            if sp_row:
                sport_name = sp_row["name"]

        return {
            "total_practice_hours": total_hours,
            "total_sessions": session_count,
            "active_sports": sports_count,
            "sport_name": sport_name,
            "average_rating": avg_rating,
            "improvement_score": improvement_score,
            "has_data": session_count > 0
        }

@router.get("/charts")
def get_analytics_charts(sport_id: Optional[int] = None, student_id: Optional[int] = None, user: dict = Depends(get_current_user)):
    target_student_id = student_id if (user["role"] == "COACH" and student_id) else user["user_id"]

    with db_session() as conn:
        cursor = conn.cursor()
        
        query = """
            SELECT ps.session_id, ps.sport_id, ps.date, s.name as sport_name, ps.duration_minutes, ps.coach_rating, ps.intensity
            FROM practice_sessions ps
            JOIN sports s ON ps.sport_id = s.sport_id
            WHERE ps.student_id = ?
        """
        params = [target_student_id]
        if sport_id:
            query += " AND ps.sport_id = ?"
            params.append(sport_id)

        query += " ORDER BY ps.date ASC, ps.session_id ASC"
        cursor.execute(query, params)
        sessions = [dict(r) for r in cursor.fetchall()]
        
        if not sessions:
            return {
                "has_data": False,
                "message": "Not enough data for trend analysis. Please record practice sessions first.",
                "dates": [],
                "practice_hours": [],
                "ratings": [],
                "sports": [],
                "by_sport": [],
                "sports_breakdown": {},
                "problems_breakdown": []
            }
            
        all_unique_dates = sorted(list(set(s["date"] for s in sessions)))

        # Group sessions per sport for isolated per-sport datasets
        sports_map = {}
        for s in sessions:
            sp_id = s["sport_id"]
            if sp_id not in sports_map:
                sports_map[sp_id] = {
                    "sport_id": sp_id,
                    "sport_name": s["sport_name"],
                    "sessions": []
                }
            sports_map[sp_id]["sessions"].append(s)

        by_sport_list = []
        for sp_id, sp_info in sports_map.items():
            sp_sessions = sp_info["sessions"]
            sp_dates = [s["date"] for s in sp_sessions]
            sp_hours = [round(s["duration_minutes"] / 60.0, 2) for s in sp_sessions]
            sp_ratings = [s["coach_rating"] if s["coach_rating"] is not None else 0 for s in sp_sessions]
            
            by_sport_list.append({
                "sport_id": sp_id,
                "sport_name": sp_info["sport_name"],
                "dates": sp_dates,
                "practice_hours": sp_hours,
                "ratings": sp_ratings
            })

        if sport_id:
            dates = [s["date"] for s in sessions]
            practice_hours = [round(s["duration_minutes"] / 60.0, 2) for s in sessions]
            ratings = [s["coach_rating"] if s["coach_rating"] is not None else 0 for s in sessions]
        else:
            dates = all_unique_dates
            practice_hours = []
            ratings = []

        # Sports breakdown
        query_breakdown = """
            SELECT s.name as sport_name, SUM(ps.duration_minutes) as total_mins
            FROM practice_sessions ps
            JOIN sports s ON ps.sport_id = s.sport_id
            WHERE ps.student_id = ?
        """
        params_b = [target_student_id]
        if sport_id:
            query_breakdown += " AND ps.sport_id = ?"
            params_b.append(sport_id)
        query_breakdown += " GROUP BY s.name"
        cursor.execute(query_breakdown, params_b)
        sports_breakdown = {r["sport_name"]: round(r["total_mins"] / 60.0, 1) for r in cursor.fetchall()}
        
        # Problems frequency
        query_probs = """
            SELECT p.description, COUNT(*) as problem_count
            FROM problems p
            JOIN practice_sessions ps ON p.session_id = ps.session_id
            WHERE ps.student_id = ?
        """
        params_p = [target_student_id]
        if sport_id:
            query_probs += " AND ps.sport_id = ?"
            params_p.append(sport_id)
        query_probs += " GROUP BY p.description ORDER BY problem_count DESC LIMIT 5"
        cursor.execute(query_probs, params_p)
        problems_breakdown = [{"problem": r["description"], "count": r["problem_count"]} for r in cursor.fetchall()]

        return {
            "has_data": True,
            "dates": dates,
            "practice_hours": practice_hours,
            "ratings": ratings,
            "sports": [s["sport_name"] for s in sessions],
            "by_sport": by_sport_list,
            "sports_breakdown": sports_breakdown,
            "problems_breakdown": problems_breakdown
        }

@router.get("/sports-statistics")
def get_per_sport_statistics(student_id: Optional[int] = None, user: dict = Depends(get_current_user)):
    target_student_id = user["user_id"]
    if user["role"] == "COACH":
        if not student_id:
            raise HTTPException(status_code=400, detail="Student ID required for coach view")
        with db_session() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT connection_id FROM coach_connections WHERE coach_id = ? AND student_id = ? AND status = 'ACCEPTED'", (user["user_id"], student_id))
            if not cursor.fetchone():
                raise HTTPException(status_code=403, detail="Access denied. You are not connected with this student.")
        target_student_id = student_id

    with db_session() as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT DISTINCT s.sport_id, s.name as sport_name, s.category, ss.skill_level, ss.experience_years, ss.training_goal
            FROM sports s
            LEFT JOIN student_sports ss ON s.sport_id = ss.sport_id AND ss.student_id = ?
            WHERE s.sport_id IN (
                SELECT sport_id FROM student_sports WHERE student_id = ?
                UNION
                SELECT sport_id FROM practice_sessions WHERE student_id = ?
            )
            ORDER BY s.name ASC
        """, (target_student_id, target_student_id, target_student_id))
        
        sports_rows = [dict(r) for r in cursor.fetchall()]
        
        sports_stats = []
        for sp in sports_rows:
            sp_id = sp["sport_id"]
            
            cursor.execute("""
                SELECT COUNT(*) as session_count,
                       COALESCE(SUM(duration_minutes), 0) as total_minutes,
                       COALESCE(AVG(coach_rating), 0) as avg_rating,
                       MAX(date) as last_practice_date
                FROM practice_sessions
                WHERE student_id = ? AND sport_id = ?
            """, (target_student_id, sp_id))
            sess_row = dict(cursor.fetchone())
            
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
            """, (target_student_id, sp_id))
            metric_stats = []
            for mr in cursor.fetchall():
                metric_stats.append({
                    "metric_name": mr["metric_name"],
                    "average": round(mr["avg_val"], 2),
                    "max": round(mr["max_val"], 2),
                    "min": round(mr["min_val"], 2),
                    "total_records": mr["total_records"],
                    "unit": mr["metric_unit"] or "count"
                })

            cursor.execute("""
                SELECT intensity, COUNT(*) as cnt
                FROM practice_sessions
                WHERE student_id = ? AND sport_id = ?
                GROUP BY intensity
            """, (target_student_id, sp_id))
            intensity_counts = {r["intensity"]: r["cnt"] for r in cursor.fetchall()}

            cursor.execute("""
                SELECT p.description, COUNT(*) as cnt
                FROM problems p
                JOIN practice_sessions ps ON p.session_id = ps.session_id
                WHERE ps.student_id = ? AND ps.sport_id = ?
                GROUP BY p.description
                ORDER BY cnt DESC LIMIT 3
            """, (target_student_id, sp_id))
            struggles = [{"issue": r["description"], "count": r["cnt"]} for r in cursor.fetchall()]

            cursor.execute("""
                SELECT coach_rating FROM practice_sessions
                WHERE student_id = ? AND sport_id = ? AND coach_rating IS NOT NULL
                ORDER BY date ASC, session_id ASC
            """, (target_student_id, sp_id))
            ratings = [r["coach_rating"] for r in cursor.fetchall()]
            improvement = 0.0
            if len(ratings) >= 2:
                recent = sum(ratings[-3:]) / len(ratings[-3:])
                older = sum(ratings[:max(1, len(ratings)-3)]) / len(ratings[:max(1, len(ratings)-3)])
                improvement = round(((recent - older) / max(1, older)) * 100, 1)

            sports_stats.append({
                "sport_id": sp_id,
                "sport_name": sp["sport_name"],
                "category": sp["category"],
                "skill_level": sp["skill_level"] or "Unspecified",
                "experience_years": sp["experience_years"] or 0,
                "training_goal": sp["training_goal"] or "General Practice",
                "session_count": sess_row["session_count"],
                "total_hours": round(sess_row["total_minutes"] / 60.0, 1),
                "average_rating": round(sess_row["avg_rating"], 1),
                "last_practice_date": sess_row["last_practice_date"] or "N/A",
                "improvement_score": improvement,
                "intensity_breakdown": intensity_counts,
                "metrics": metric_stats,
                "struggles": struggles
            })
            
        return {
            "student_id": target_student_id,
            "total_sports": len(sports_stats),
            "sports": sports_stats
        }

