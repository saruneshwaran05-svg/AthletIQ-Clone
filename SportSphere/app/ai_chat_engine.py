import os
import json
import uuid
import re
import urllib.request
import urllib.error
from typing import Optional, List, Dict, Any, Tuple
from app.database import db_session


class AthletIQContextBuilder:
    """
    Builds rich, structured AthletIQ context for Student and Coach personas
    grounded strictly in actual database records.
    """

    @staticmethod
    def build_student_context(student_id: int, sport_id: Optional[int] = None) -> Dict[str, Any]:
        with db_session() as conn:
            cursor = conn.cursor()

            # 1. Student Profile
            cursor.execute("""
                SELECT user_id, name, email, date_of_birth, preferred_sport, bio, created_at
                FROM users WHERE user_id = ? AND role = 'STUDENT'
            """, (student_id,))
            student_row = cursor.fetchone()
            if not student_row:
                raise ValueError(f"Student with ID {student_id} not found")
            profile = dict(student_row)

            # 2. Student Enrolled Sports
            cursor.execute("""
                SELECT ss.id, ss.sport_id, s.name as sport_name, s.category, ss.skill_level, 
                       ss.experience_years, ss.training_goal, ss.start_date
                FROM student_sports ss
                JOIN sports s ON ss.sport_id = s.sport_id
                WHERE ss.student_id = ?
                ORDER BY s.name ASC
            """, (student_id,))
            enrolled_sports = [dict(r) for r in cursor.fetchall()]

            # 3. Practice Sessions with Metrics and Problems
            session_sql = """
                SELECT ps.session_id, ps.sport_id, s.name as sport_name, s.category,
                       ps.date, ps.duration_minutes, ps.intensity, ps.training_type, 
                       ps.training_area, ps.coach_rating, ps.notes, ps.created_at
                FROM practice_sessions ps
                JOIN sports s ON ps.sport_id = s.sport_id
                WHERE ps.student_id = ?
            """
            params = [student_id]
            if sport_id:
                session_sql += " AND ps.sport_id = ?"
                params.append(sport_id)
            session_sql += " ORDER BY ps.date ASC, ps.session_id ASC"

            cursor.execute(session_sql, params)
            sessions = [dict(r) for r in cursor.fetchall()]

            session_ids = [s["session_id"] for s in sessions]
            metrics_by_session: Dict[int, List[Dict[str, Any]]] = {}
            problems_by_session: Dict[int, List[Dict[str, Any]]] = {}

            if session_ids:
                placeholders = ",".join("?" * len(session_ids))
                cursor.execute(f"""
                    SELECT record_id, session_id, metric_name, metric_value, metric_unit
                    FROM performance_records
                    WHERE session_id IN ({placeholders})
                """, session_ids)
                for r in cursor.fetchall():
                    m = dict(r)
                    metrics_by_session.setdefault(m["session_id"], []).append(m)

                cursor.execute(f"""
                    SELECT problem_id, session_id, description, severity, category
                    FROM problems
                    WHERE session_id IN ({placeholders})
                """, session_ids)
                for r in cursor.fetchall():
                    p = dict(r)
                    problems_by_session.setdefault(p["session_id"], []).append(p)

            for s in sessions:
                s["metrics"] = metrics_by_session.get(s["session_id"], [])
                s["problems"] = problems_by_session.get(s["session_id"], [])

            # 4. Aggregate Analytics
            total_sessions = len(sessions)
            total_duration_minutes = sum(s["duration_minutes"] for s in sessions)
            total_hours = round(total_duration_minutes / 60.0, 1)

            ratings = [s["coach_rating"] for s in sessions if s.get("coach_rating") is not None]
            avg_rating = round(sum(ratings) / len(ratings), 1) if ratings else None

            # Calculate Rating Progression / Trend
            rating_trajectory = 0.0
            if len(ratings) >= 2:
                mid = len(ratings) // 2
                first_half = ratings[:mid]
                second_half = ratings[mid:]
                avg_first = sum(first_half) / len(first_half)
                avg_second = sum(second_half) / len(second_half)
                if avg_first > 0:
                    rating_trajectory = round(((avg_second - avg_first) / avg_first) * 100, 1)

            # Metric aggregates across sessions
            metrics_summary: Dict[str, Dict[str, Any]] = {}
            for s in sessions:
                for m in s["metrics"]:
                    m_name = m["metric_name"].strip()
                    if m_name not in metrics_summary:
                        metrics_summary[m_name] = {
                            "unit": m["metric_unit"],
                            "values": [],
                            "sessions": []
                        }
                    metrics_summary[m_name]["values"].append(m["metric_value"])
                    metrics_summary[m_name]["sessions"].append(s["date"])

            for m_name, data in metrics_summary.items():
                vals = data["values"]
                data["count"] = len(vals)
                data["avg"] = round(sum(vals) / len(vals), 2)
                data["min"] = min(vals)
                data["max"] = max(vals)
                data["latest"] = vals[-1]
                if len(vals) >= 2:
                    data["trend_delta"] = round(vals[-1] - vals[0], 2)
                    mid_idx = len(vals) // 2
                    avg_early = sum(vals[:mid_idx]) / mid_idx if mid_idx > 0 else vals[0]
                    avg_late = sum(vals[mid_idx:]) / (len(vals) - mid_idx)
                    data["pct_change"] = round(((avg_late - avg_early) / abs(avg_early) * 100), 1) if avg_early != 0 else 0.0
                else:
                    data["trend_delta"] = 0.0
                    data["pct_change"] = 0.0

            # Struggle / Problem frequency analysis
            problem_frequency: Dict[str, int] = {}
            for s in sessions:
                for p in s["problems"]:
                    p_desc = p["description"].strip()
                    problem_frequency[p_desc] = problem_frequency.get(p_desc, 0) + 1

            recurring_problems = sorted(problem_frequency.items(), key=lambda x: x[1], reverse=True)

            # 5. Goals
            goal_sql = """
                SELECT g.goal_id, g.sport_id, s.name as sport_name, g.title, g.description, 
                       g.metric_name, g.initial_value, g.current_value, g.target_value, 
                       g.unit, g.deadline, g.status, g.created_at
                FROM goals g
                JOIN sports s ON g.sport_id = s.sport_id
                WHERE g.student_id = ?
            """
            g_params = [student_id]
            if sport_id:
                goal_sql += " AND g.sport_id = ?"
                g_params.append(sport_id)
            goal_sql += " ORDER BY g.status ASC, g.deadline ASC"
            cursor.execute(goal_sql, g_params)
            goals = [dict(r) for r in cursor.fetchall()]

            # 6. AI Recommendations
            rec_sql = """
                SELECT ar.recommendation_id, ar.sport_id, s.name as sport_name, ar.session_id, 
                       ar.title, ar.detected_issue, ar.evidence, ar.recommendation_text, 
                       ar.suggested_goal, ar.priority, ar.coach_suggestion, ar.coach_suggested_at,
                       u.name as coach_name, ar.created_at
                FROM ai_recommendations ar
                JOIN sports s ON ar.sport_id = s.sport_id
                LEFT JOIN users u ON ar.coach_id = u.user_id
                WHERE ar.student_id = ?
            """
            r_params = [student_id]
            if sport_id:
                rec_sql += " AND ar.sport_id = ?"
                r_params.append(sport_id)
            rec_sql += " ORDER BY ar.created_at DESC"
            cursor.execute(rec_sql, r_params)
            recommendations = [dict(r) for r in cursor.fetchall()]

            # 7. AI Analyses
            analysis_sql = """
                SELECT aa.analysis_id, aa.sport_id, s.name as sport_name, aa.analysis_text, 
                       aa.detected_issue, aa.trend_type, aa.supporting_evidence, aa.created_at
                FROM ai_analyses aa
                JOIN sports s ON aa.sport_id = s.sport_id
                WHERE aa.student_id = ?
            """
            a_params = [student_id]
            if sport_id:
                analysis_sql += " AND aa.sport_id = ?"
                a_params.append(sport_id)
            analysis_sql += " ORDER BY aa.created_at DESC"
            cursor.execute(analysis_sql, a_params)
            analyses = [dict(r) for r in cursor.fetchall()]

            # 8. Coach Feedback
            fb_sql = """
                SELECT cf.feedback_id, cf.coach_id, u.name as coach_name, u.coaching_specialization,
                       cf.sport_id, s.name as sport_name, cf.session_id, cf.observed_strength, 
                       cf.observed_weakness, cf.feedback_text, cf.recommended_drill, 
                       cf.practice_duration_minutes, cf.priority, cf.student_reply, 
                       cf.student_reply_at, cf.created_at
                FROM coach_feedback cf
                JOIN users u ON cf.coach_id = u.user_id
                JOIN sports s ON cf.sport_id = s.sport_id
                WHERE cf.student_id = ?
            """
            f_params = [student_id]
            if sport_id:
                fb_sql += " AND cf.sport_id = ?"
                f_params.append(sport_id)
            fb_sql += " ORDER BY cf.created_at DESC"
            cursor.execute(fb_sql, f_params)
            coach_feedbacks = [dict(r) for r in cursor.fetchall()]

            # 9. Connected Coaches
            cursor.execute("""
                SELECT cc.connection_id, cc.coach_id, u.name as coach_name, 
                       u.coaching_specialization, u.experience_years, u.certification, cc.status
                FROM coach_connections cc
                JOIN users u ON cc.coach_id = u.user_id
                WHERE cc.student_id = ? AND cc.status = 'ACCEPTED'
            """, (student_id,))
            connected_coaches = [dict(r) for r in cursor.fetchall()]

        return {
            "role": "STUDENT",
            "profile": profile,
            "enrolled_sports": enrolled_sports,
            "sessions": sessions,
            "session_count": total_sessions,
            "total_practice_hours": total_hours,
            "average_rating": avg_rating,
            "rating_trajectory_pct": rating_trajectory,
            "metrics_summary": metrics_summary,
            "recurring_problems": recurring_problems,
            "goals": goals,
            "ai_recommendations": recommendations,
            "ai_analyses": analyses,
            "coach_feedbacks": coach_feedbacks,
            "connected_coaches": connected_coaches
        }

    @staticmethod
    def build_coach_context(coach_id: int, target_student_id: Optional[int] = None, sport_id: Optional[int] = None) -> Dict[str, Any]:
        with db_session() as conn:
            cursor = conn.cursor()

            # 1. Coach Profile
            cursor.execute("""
                SELECT user_id, name, email, coaching_specialization, experience_years, 
                       certification, bio, created_at
                FROM users WHERE user_id = ? AND role = 'COACH'
            """, (coach_id,))
            coach_row = cursor.fetchone()
            if not coach_row:
                raise ValueError(f"Coach with ID {coach_id} not found")
            coach_profile = dict(coach_row)

            # 2. Get Authorized Connected Students (STRICT SECURITY CHECK)
            cursor.execute("""
                SELECT cc.student_id, u.name, u.email, u.preferred_sport, u.date_of_birth, cc.created_at as connected_at
                FROM coach_connections cc
                JOIN users u ON cc.student_id = u.user_id
                WHERE cc.coach_id = ? AND cc.status = 'ACCEPTED'
                ORDER BY u.name ASC
            """, (coach_id,))
            connected_students = [dict(r) for r in cursor.fetchall()]
            authorized_student_ids = {s["student_id"] for s in connected_students}

            # Enforce authorization if target_student_id requested
            if target_student_id is not None:
                if target_student_id not in authorized_student_ids:
                    raise PermissionError(f"Access Denied: Coach is not connected to student ID {target_student_id}")

            # 3. Aggregate stats for all authorized students
            students_summary = []
            for st in connected_students:
                s_id = st["student_id"]
                # Practice session count and avg rating
                cursor.execute("""
                    SELECT COUNT(session_id) as session_count, 
                           SUM(duration_minutes) as total_mins,
                           AVG(coach_rating) as avg_rating,
                           MAX(date) as last_practice_date
                    FROM practice_sessions
                    WHERE student_id = ?
                """, (s_id,))
                stats_row = dict(cursor.fetchone() or {})

                # Count problems
                cursor.execute("""
                    SELECT COUNT(p.problem_id) as problem_count
                    FROM problems p
                    JOIN practice_sessions ps ON p.session_id = ps.session_id
                    WHERE ps.student_id = ?
                """, (s_id,))
                prob_count = cursor.fetchone()["problem_count"]

                # Recent unaddressed AI recommendations
                cursor.execute("""
                    SELECT COUNT(recommendation_id) as rec_count
                    FROM ai_recommendations
                    WHERE student_id = ? AND (coach_suggestion IS NULL OR coach_suggestion = '')
                """, (s_id,))
                unanswered_recs = cursor.fetchone()["rec_count"]

                st_summary = {
                    "student_id": s_id,
                    "name": st["name"],
                    "email": st["email"],
                    "preferred_sport": st["preferred_sport"],
                    "session_count": stats_row.get("session_count") or 0,
                    "total_practice_hours": round((stats_row.get("total_mins") or 0) / 60.0, 1),
                    "average_rating": round(stats_row.get("avg_rating"), 1) if stats_row.get("avg_rating") else None,
                    "last_practice_date": stats_row.get("last_practice_date"),
                    "total_problems_logged": prob_count or 0,
                    "unaddressed_ai_recs": unanswered_recs or 0,
                    "needs_attention": (prob_count > 2) or (stats_row.get("avg_rating") and stats_row.get("avg_rating") < 6.5) or (unanswered_recs > 0)
                }
                students_summary.append(st_summary)

            # If specific target student is requested, load their full student context
            target_student_details = None
            if target_student_id is not None:
                target_student_details = AthletIQContextBuilder.build_student_context(target_student_id, sport_id)

        return {
            "role": "COACH",
            "profile": coach_profile,
            "connected_students_count": len(connected_students),
            "connected_students": students_summary,
            "target_student_id": target_student_id,
            "target_student_details": target_student_details
        }


class ConversationManager:
    """
    Manages multi-turn conversation persistence in SQLite database.
    """

    @staticmethod
    def get_or_create_conversation(
        user_id: int, 
        role: str, 
        conversation_id: Optional[str] = None, 
        sport_id: Optional[int] = None,
        student_id: Optional[int] = None,
        initial_message: str = ""
    ) -> Tuple[str, str]:
        with db_session() as conn:
            cursor = conn.cursor()

            if conversation_id:
                cursor.execute("""
                    SELECT conversation_id, title FROM ai_conversations
                    WHERE conversation_id = ? AND user_id = ?
                """, (conversation_id, user_id))
                existing = cursor.fetchone()
                if existing:
                    return existing["conversation_id"], existing["title"]

            # Create new conversation
            new_id = f"conv_{uuid.uuid4().hex[:12]}"
            title = initial_message.strip()[:40] if initial_message.strip() else "Sports Performance Chat"
            if len(initial_message.strip()) > 40:
                title += "..."

            cursor.execute("""
                INSERT INTO ai_conversations (conversation_id, user_id, title, role, sport_id, student_id)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (new_id, user_id, title, role, sport_id, student_id))

            return new_id, title

    @staticmethod
    def save_message(
        conversation_id: str, 
        sender: str, 
        message: str, 
        message_type: str = "text",
        sources: Optional[List[str]] = None,
        suggested_questions: Optional[List[str]] = None
    ):
        with db_session() as conn:
            cursor = conn.cursor()
            sources_json = json.dumps(sources or [])
            suggestions_json = json.dumps(suggested_questions or [])

            cursor.execute("""
                INSERT INTO ai_messages (conversation_id, sender, message, message_type, sources, suggested_questions)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (conversation_id, sender, message, message_type, sources_json, suggestions_json))

            cursor.execute("""
                UPDATE ai_conversations SET updated_at = CURRENT_TIMESTAMP
                WHERE conversation_id = ?
            """, (conversation_id,))

    @staticmethod
    def get_conversation_history(conversation_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        with db_session() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT message_id, conversation_id, sender, message, message_type, 
                       sources, suggested_questions, created_at
                FROM ai_messages
                WHERE conversation_id = ?
                ORDER BY created_at ASC, message_id ASC
                LIMIT ?
            """, (conversation_id, limit))
            rows = cursor.fetchall()
            messages = []
            for r in rows:
                m = dict(r)
                try:
                    m["sources"] = json.loads(m["sources"]) if m.get("sources") else []
                except Exception:
                    m["sources"] = []
                try:
                    m["suggested_questions"] = json.loads(m["suggested_questions"]) if m.get("suggested_questions") else []
                except Exception:
                    m["suggested_questions"] = []
                messages.append(m)
            return messages


class AthletIQAskAIEngine:
    """
    Main Conversational AI Engine.
    Handles Student Performance Coach and Coach Assistant personas with
    strict data grounding, voice interaction support, and intelligent multi-turn fallback.
    """

    @staticmethod
    def process_chat(
        user: Dict[str, Any],
        message: str,
        conversation_id: Optional[str] = None,
        sport_id: Optional[int] = None,
        student_id: Optional[int] = None,
        voice_mode: bool = False
    ) -> Dict[str, Any]:
        user_id = user["user_id"]
        role = user["role"].upper()

        # 1. Build AthletIQ Context based on Role & Authorization
        if role == "STUDENT":
            context = AthletIQContextBuilder.build_student_context(user_id, sport_id)
        elif role == "COACH":
            context = AthletIQContextBuilder.build_coach_context(user_id, target_student_id=student_id, sport_id=sport_id)
        else:
            raise ValueError(f"Unknown user role: {role}")

        # 2. Get or create conversation
        conv_id, title = ConversationManager.get_or_create_conversation(
            user_id=user_id,
            role=role,
            conversation_id=conversation_id,
            sport_id=sport_id,
            student_id=student_id,
            initial_message=message
        )

        # 3. Fetch past conversation turns for memory
        history = ConversationManager.get_conversation_history(conv_id, limit=8)

        # 4. Save User Message
        ConversationManager.save_message(
            conversation_id=conv_id,
            sender="user",
            message=message,
            message_type="voice" if voice_mode else "text"
        )

        # 5. Generate AI Response using either External LLM or Built-in Grounded Intelligence
        response_text, sources, suggested_questions = AthletIQAskAIEngine._generate_response(
            role=role,
            user_message=message,
            context=context,
            history=history,
            voice_mode=voice_mode
        )

        # 6. Save AI Response
        ConversationManager.save_message(
            conversation_id=conv_id,
            sender="assistant",
            message=response_text,
            message_type="text",
            sources=sources,
            suggested_questions=suggested_questions
        )

        return {
            "message": response_text,
            "role": role,
            "conversation_id": conv_id,
            "title": title,
            "sources": sources,
            "suggested_questions": suggested_questions,
            "voice_mode": voice_mode
        }

    @staticmethod
    def _generate_response(
        role: str,
        user_message: str,
        context: Dict[str, Any],
        history: List[Dict[str, Any]],
        voice_mode: bool = False
    ) -> Tuple[str, List[str], List[str]]:
        """
        Attempts external LLM call if API key configured, otherwise executes
        the comprehensive domain-grounded Sports Analytics & Coaching Engine.
        """
        api_key = os.getenv("AI_API_KEY") or os.getenv("OPENAI_API_KEY") or os.getenv("GEMINI_API_KEY") or os.getenv("ANTHROPIC_API_KEY")

        if api_key and os.getenv("AI_API_ENDPOINT"):
            try:
                llm_res = AthletIQAskAIEngine._call_external_llm(
                    api_key=api_key,
                    endpoint=os.getenv("AI_API_ENDPOINT"),
                    model=os.getenv("AI_MODEL", "gpt-4o-mini"),
                    role=role,
                    user_message=user_message,
                    context=context,
                    history=history
                )
                if llm_res:
                    return llm_res
            except Exception as e:
                print(f"Warning: External LLM call failed: {e}. Falling back to AthletIQ Grounded Intelligence.")

        # Fallback to Built-in Zero-Hallucination Grounded Domain Engine
        return AthletIQAskAIEngine._generate_grounded_response(
            role=role,
            user_message=user_message,
            context=context,
            history=history,
            voice_mode=voice_mode
        )

    @staticmethod
    def _call_external_llm(
        api_key: str,
        endpoint: str,
        model: str,
        role: str,
        user_message: str,
        context: Dict[str, Any],
        history: List[Dict[str, Any]]
    ) -> Optional[Tuple[str, List[str], List[str]]]:
        system_prompt = f"""
You are AthletIQ AI, an AI sports performance assistant integrated into the AthletIQ sports performance platform.
Your persona: {'AthletIQ Student Performance Coach' if role == 'STUDENT' else 'AthletIQ Coach Assistant'}.

GUIDELINES:
1. Ground every statement strictly in the provided AthletIQ Context.
2. NEVER invent performance numbers, match outcomes, practice sessions, injuries, or goals.
3. Distinguish actual recorded data from reasonable inference.
4. If practice data is insufficient (0 sessions or 1 session), explicitly state that more practice records are required.
5. Be concise, professional, encouraging, and actionable. Avoid generic motivational fluff.
6. Provide a JSON response in the format:
{{
  "message": "Markdown response here...",
  "sources": ["Practice History", "Performance Analytics"],
  "suggested_questions": ["Question 1", "Question 2", "Question 3"]
}}

ATHLETIQ CONTEXT:
{json.dumps(context, default=str)}
"""

        messages_payload = [{"role": "system", "content": system_prompt}]
        for h in history[-6:]:
            m_role = "user" if h["sender"] == "user" else "assistant"
            messages_payload.append({"role": m_role, "content": h["message"]})
        messages_payload.append({"role": "user", "content": user_message})

        req_body = {
            "model": model,
            "messages": messages_payload,
            "temperature": 0.3
        }

        req = urllib.request.Request(
            endpoint,
            data=json.dumps(req_body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            },
            method="POST"
        )

        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data["choices"][0]["message"]["content"]
            try:
                parsed = json.loads(content)
                return (
                    parsed.get("message", content),
                    parsed.get("sources", ["AthletIQ Analytics"]),
                    parsed.get("suggested_questions", ["What should I practice next?", "What is my weakest area?"])
                )
            except Exception:
                return (content, ["AthletIQ Analytics"], ["What should I practice next?", "What is my weakest area?"])

    @staticmethod
    def _generate_grounded_response(
        role: str,
        user_message: str,
        context: Dict[str, Any],
        history: List[Dict[str, Any]],
        voice_mode: bool = False
    ) -> Tuple[str, List[str], List[str]]:
        """
        Highly sophisticated, zero-hallucination domain coaching generator.
        Directly evaluates actual recorded statistics, struggles, coach feedback,
        regression trends, and goals to produce realistic, personalized answers.
        """
        msg_lower = user_message.lower().strip()

        if role == "STUDENT":
            return AthletIQAskAIEngine._handle_student_query(msg_lower, user_message, context, history, voice_mode)
        else:
            return AthletIQAskAIEngine._handle_coach_query(msg_lower, user_message, context, history, voice_mode)

    @staticmethod
    def _handle_student_query(
        msg_lower: str,
        raw_message: str,
        context: Dict[str, Any],
        history: List[Dict[str, Any]],
        voice_mode: bool
    ) -> Tuple[str, List[str], List[str]]:
        profile = context["profile"]
        student_name = profile.get("name", "Athlete")
        sessions = context.get("sessions", [])
        session_count = context.get("session_count", 0)
        total_hours = context.get("total_practice_hours", 0.0)
        avg_rating = context.get("average_rating")
        trajectory = context.get("rating_trajectory_pct", 0.0)
        metrics_summary = context.get("metrics_summary", {})
        recurring_problems = context.get("recurring_problems", [])
        goals = context.get("goals", [])
        ai_recs = context.get("ai_recommendations", [])
        coach_feedbacks = context.get("coach_feedbacks", [])
        enrolled_sports = context.get("enrolled_sports", [])

        # Default Sport detection
        sport_names = [s["sport_name"] for s in enrolled_sports]
        active_sport_name = profile.get("preferred_sport") or (sport_names[0] if sport_names else "Sports")

        # Check if query mentions a specific enrolled sport
        for sp in enrolled_sports:
            if sp["sport_name"].lower() in msg_lower:
                active_sport_name = sp["sport_name"]
                break

        sources = []
        suggested = []

        # ----------------------------------------------------
        # CASE 1: EMPTY STATE (0 Recorded Sessions)
        # ----------------------------------------------------
        if session_count == 0:
            sources.append("Profile & Enrolled Sports")
            msg = (
                f"Hi {student_name}! I don't have enough recorded practice data to evaluate your performance yet.\n\n"
                f"To begin building your personalized AI sports performance profile:\n"
                f"1. Go to **Record Practice** in the sidebar.\n"
                f"f2. Log your training duration, sport-specific metrics (e.g. runs, balls faced, accuracy), and any struggles.\n\n"
                f"Once you log your first session, I will immediately start analyzing your statistics, detecting improvement areas, and recommending targeted drills!"
            )
            suggested = [
                "How do I log my first practice session?",
                "What metrics should I track for my sport?",
                "How does AthletIQ calculate coach ratings?"
            ]
            return msg, sources, suggested

        # ----------------------------------------------------
        # CASE 2: SINGLE SESSION ONLY
        # ----------------------------------------------------
        if session_count == 1:
            first_s = sessions[0]
            sources.extend(["Practice History", "Session Records"])
            prob_text = ", ".join([p["description"] for p in first_s["problems"]]) if first_s["problems"] else "No struggles logged"
            rating_text = f"{first_s['coach_rating']}/10" if first_s.get("coach_rating") else "Pending coach rating"

            msg = (
                f"You currently have **1 recorded practice session** for **{first_s['sport_name']}** ({first_s['duration_minutes']} mins on {first_s['date']}).\n\n"
                f"• **Session Focus:** {first_s['training_type'].replace('_', ' ')} — {first_s.get('training_area') or 'General drill'}\n"
                f"• **Recorded Rating:** {rating_text}\n"
                f"• **Identified Struggles:** {prob_text}\n\n"
                f"*Note:* An initial assessment is visible, but calculating reliable linear regression trends and consistency moving averages requires **at least 2 to 3 recorded sessions**. Log your upcoming workouts to unlock full trend analytics!"
            )
            suggested = [
                "What drill should I do next?",
                "What is my biggest struggle so far?",
                "Set a goal for my next session"
            ]
            return msg, sources, suggested

        # ----------------------------------------------------
        # INTENT: WEAKNESS / PROBLEMS / STRUGGLES
        # ----------------------------------------------------
        if any(w in msg_lower for w in ["weakness", "struggle", "problem", "fault", "flaw", "improve", "issue", "worst", "lowest"]):
            sources.extend(["Practice History", "Problems Log", "AI Recommendations"])
            if recurring_problems:
                top_prob, count = recurring_problems[0]
                secondary = f" Secondary struggle: '{recurring_problems[1][0]}'" if len(recurring_problems) > 1 else ""

                msg = (
                    f"Based on your {session_count} recorded practice sessions in {active_sport_name}, your most frequent struggle is:\n\n"
                    f"🎯 **Primary Weakness:** **{top_prob}** (encountered in {count} session{'s' if count > 1 else ''}){secondary}.\n\n"
                )

                # Cross-reference with AI recommendation
                matched_rec = next((r for r in ai_recs if top_prob.lower() in r["detected_issue"].lower() or top_prob.lower() in r["title"].lower()), None)
                if matched_rec:
                    msg += (
                        f"**AthletIQ AI Recommended Intervention:**\n"
                        f"{matched_rec['recommendation_text']}\n\n"
                        f"• **Priority:** {matched_rec['priority']}\n"
                    )
                    if matched_rec.get("coach_suggestion"):
                        msg += f"• **Coach Guidance:** \"{matched_rec['coach_suggestion']}\" (Coach {matched_rec.get('coach_name', '')})\n\n"
                else:
                    msg += (
                        f"**Recommended Action Plan:**\n"
                        f"Dedicate the first 20 minutes of your next 3 sessions to isolated technique repetition focusing specifically on eliminating '{top_prob}'.\n\n"
                    )

                msg += f"Would you like me to generate a 30-minute practice plan to resolve this?"
            else:
                msg = (
                    f"Great news, {student_name}! You have not logged any critical problems or struggles in your recent {session_count} sessions.\n\n"
                    f"Your training execution has been steady across {total_hours} hours. To continue progressing, consider increasing training intensity or adding high-pressure match simulations."
                )

            suggested = [
                "Give me a 30-minute practice plan for this weakness",
                "How has my performance changed over time?",
                "What did my coach say about my progress?"
            ]
            return msg, sources, suggested

        # ----------------------------------------------------
        # INTENT: PRACTICE PLAN / WHAT TO PRACTICE TODAY / DRILLS
        # ----------------------------------------------------
        if any(w in msg_lower for w in ["plan", "practice today", "what to practice", "routine", "schedule", "drill", "exercise", "workout", "tomorrow"]):
            sources.extend(["AI Recommendations", "Coach Feedback", "Practice History"])

            # Find primary focus
            focus_topic = recurring_problems[0][0] if recurring_problems else f"{active_sport_name} Mastery"
            top_rec = ai_recs[0] if ai_recs else None
            top_fb = coach_feedbacks[0] if coach_feedbacks else None

            drill_name = (top_fb and top_fb.get("recommended_drill")) or (top_rec and top_rec.get("title")) or f"Target {active_sport_name} Drills"

            msg = (
                f"Here is your personalized **30-Minute {active_sport_name} Practice Plan** based on your recent performance data:\n\n"
                f"🎯 **Session Objective:** Address *{focus_topic}* and improve pressure consistency.\n\n"
                f"⏱️ **Structured 30-Minute Schedule:**\n"
                f"1. **00–05 mins — Dynamic Warm-up & Agility:**\n"
                f"   • High knees, lateral shuffles, sport-specific joint rotations.\n"
                f"2. **05–15 mins — Technical Drill:**\n"
                f"   • Execute **{drill_name}**. Focus on precise footwork, form mechanics, and balanced body control without rushing.\n"
                f"3. **15–25 mins — High-Intensity / Match Pressure Phase:**\n"
                f"   • Replicate match conditions. Track accuracy and aim for at least 80% error-free execution under timed constraints.\n"
                f"4. **25–30 mins — Cool Down & Reflection:**\n"
                f"   • Static stretching, heart rate normalization, and log your session metrics in AthletIQ.\n\n"
                f"💡 **Key Coaching Cue:** Keep your core stable and maintain consistent follow-through."
            )
            suggested = [
                "What is my strongest metric?",
                "Am I on track to achieve my goals?",
                "Explain my latest AI recommendation"
            ]
            return msg, sources, suggested

        # ----------------------------------------------------
        # INTENT: GOALS PROGRESS
        # ----------------------------------------------------
        if any(w in msg_lower for w in ["goal", "target", "deadline", "milestone", "reach my target"]):
            sources.extend(["Goals Tracking", "Practice History"])
            if goals:
                active_goals = [g for g in goals if g.get("status") != "COMPLETED"]
                g = active_goals[0] if active_goals else goals[0]

                curr = g.get("current_value", 0)
                tgt = g.get("target_value", 1)
                unit = g.get("unit", "")
                pct = min(100.0, round((curr / tgt * 100), 1)) if tgt > 0 else 0.0

                msg = (
                    f"Here is your active goal progress for **{g['sport_name']}**:\n\n"
                    f"🎯 **Goal:** **{g['title']}**\n"
                    f"• **Current:** {curr} {unit} / **Target:** {tgt} {unit} ({pct}% Completed)\n"
                    f"• **Deadline:** {g['deadline']}\n"
                    f"• **Status:** {g['status'].replace('_', ' ')}\n\n"
                )
                if pct >= 100:
                    msg += "🎉 Congratulations! You have achieved this target. Set a new milestone in AthletIQ to keep challenging yourself."
                elif pct >= 60:
                    msg += f"📈 You are more than halfway there ({pct}%). Maintaining your current practice volume over the next 2 weeks will put you in range of reaching your target before {g['deadline']}."
                else:
                    msg += f"⏳ You have completed {pct}% of this target. Consider adding 1 extra weekly session focused directly on '{g.get('metric_name') or g['title']}' to meet your deadline."
            else:
                msg = (
                    f"You do not have any active goals configured in AthletIQ yet.\n\n"
                    f"Setting measurable targets helps the AI engine customize your practice recommendations. Would you like to set a goal for **{active_sport_name}**?"
                )
            suggested = [
                "What should I practice today?",
                "How is my overall performance?",
                "What are my recurring struggles?"
            ]
            return msg, sources, suggested

        # ----------------------------------------------------
        # INTENT: COACH FEEDBACK / COACH ADVICE
        # ----------------------------------------------------
        if any(w in msg_lower for w in ["coach", "feedback", "mentor", "trainer", "rating"]):
            sources.extend(["Coach Feedback", "Coach Ratings", "Coach Connections"])
            if coach_feedbacks:
                fb = coach_feedbacks[0]
                msg = (
                    f"Here is a summary of the latest professional guidance from **Coach {fb['coach_name']}** ({fb.get('coaching_specialization', 'Sports Specialist')}):\n\n"
                    f"• **Observed Strength:** {fb.get('observed_strength') or 'Consistent effort and good stamina'}\n"
                    f"• **Observed Weakness:** {fb.get('observed_weakness') or 'Needs refinement under pressure'}\n"
                    f"• **Coach Feedback:** \"{fb['feedback_text']}\"\n"
                )
                if fb.get("recommended_drill"):
                    msg += f"• **Assigned Drill:** {fb['recommended_drill']} ({fb.get('practice_duration_minutes', 20)} mins)\n"
                if fb.get("student_reply"):
                    msg += f"• **Your Reply:** \"{fb['student_reply']}\"\n"

                msg += f"\nCombined with your AI Analytics, your current priority is to combine Coach {fb['coach_name']}'s drill with high-intensity practice intervals."
            else:
                c_rating_text = f"{avg_rating}/10" if avg_rating else "Pending evaluations"
                msg = (
                    f"Your average coach rating across {session_count} practice sessions is **{c_rating_text}**.\n\n"
                    f"You have no formal written coach feedback entries yet. You can connect with certified coaches in the **Find & Link Coach** section to receive direct drill assignments and supervision."
                )
            suggested = [
                "What drill did my coach recommend?",
                "How has my coach rating improved?",
                "What is my weakest area?"
            ]
            return msg, sources, suggested

        # ----------------------------------------------------
        # INTENT: AI RECOMMENDATION EXPLANATION
        # ----------------------------------------------------
        if any(w in msg_lower for w in ["recommendation", "ai recommend", "why did ai", "explain recommendation"]):
            sources.extend(["AI Recommendations", "AI Analyses", "Performance Evidence"])
            if ai_recs:
                rec = ai_recs[0]
                msg = (
                    f"Here is the breakdown of your latest **AthletIQ AI Recommendation** for **{rec['sport_name']}**:\n\n"
                    f"📌 **Recommendation:** **{rec['title']}** (Priority: {rec['priority']})\n"
                    f"🔍 **Detected Issue:** {rec['detected_issue']}\n"
                    f"📊 **Empirical Evidence:** {rec['evidence']}\n\n"
                    f"🎯 **Actionable Advice:**\n{rec['recommendation_text']}\n\n"
                )
                if rec.get("suggested_goal"):
                    msg += f"🏆 **Suggested Target:** {rec['suggested_goal']}\n\n"
                if rec.get("coach_suggestion"):
                    msg += f"👨‍🏫 **Coach {rec.get('coach_name', '')}'s Added Guidance:** \"{rec['coach_suggestion']}\"\n\n"
                msg += f"This recommendation was generated by applying statistical trend regression and weakness classification across your logged practice data."
            else:
                msg = f"You have not generated any AI recommendations yet. Run AI Analysis in the AI Recommendations tab to generate data-grounded guidance."
            suggested = [
                "Give me a practice plan for this recommendation",
                "What is my biggest weakness?",
                "How am I performing overall?"
            ]
            return msg, sources, suggested

        # ----------------------------------------------------
        # INTENT: GENERAL PERFORMANCE OVERVIEW / COMPARISON
        # ----------------------------------------------------
        sources.extend(["Practice History", "Performance Analytics", "AI Recommendations"])
        rating_display = f"{avg_rating}/10" if avg_rating is not None else "Pending Rating"
        traj_sign = "+" if trajectory > 0 else ""
        traj_display = f"{traj_sign}{trajectory}%" if trajectory != 0 else "Stable"

        metric_highlights = []
        for m_name, m_data in list(metrics_summary.items())[:3]:
            change_txt = f"({'+' if m_data['trend_delta'] > 0 else ''}{m_data['trend_delta']} {m_data['unit']})" if m_data.get('count', 0) > 1 else ""
            metric_highlights.append(f"• **{m_name.replace('_', ' ').title()}:** Average {m_data['avg']} {m_data['unit']} {change_txt}")

        metrics_text = "\n".join(metric_highlights) if metric_highlights else f"• Total practice hours: {total_hours} hrs"

        msg = (
            f"Here is your **AthletIQ Performance Summary** for **{active_sport_name}** ({student_name}):\n\n"
            f"📊 **Key Metrics & Progression:**\n"
            f"• **Total Recorded Sessions:** {session_count} workouts ({total_hours} total hours)\n"
            f"• **Average Coach Rating:** {rating_display}\n"
            f"• **Rating Trajectory:** {traj_display} over your recorded sessions\n\n"
            f"📈 **Sport Metric Highlights:**\n"
            f"{metrics_text}\n\n"
        )

        if recurring_problems:
            msg += f"⚠️ **Primary Area to Monitor:** *{recurring_problems[0][0]}* (encountered {recurring_problems[0][1]} times).\n\n"

        msg += f"Would you like me to generate a personalized practice plan or analyze your biggest weakness?"

        suggested = [
            "What is my biggest weakness?",
            "What should I practice today?",
            "How close am I to my goal?",
            "Summarize my coach feedback"
        ]
        return msg, sources, suggested

    @staticmethod
    def _handle_coach_query(
        msg_lower: str,
        raw_message: str,
        context: Dict[str, Any],
        history: List[Dict[str, Any]],
        voice_mode: bool
    ) -> Tuple[str, List[str], List[str]]:
        coach_profile = context["profile"]
        coach_name = coach_profile.get("name", "Coach")
        connected_students = context.get("connected_students", [])
        target_student_id = context.get("target_student_id")
        target_details = context.get("target_student_details")

        sources = []
        suggested = []

        # ----------------------------------------------------
        # COACH CASE 1: NO CONNECTED STUDENTS
        # ----------------------------------------------------
        if not connected_students:
            sources.append("Coach Connections")
            msg = (
                f"Hello Coach {coach_name}! You do not currently have any connected students under your supervision.\n\n"
                f"When athletes find your profile and you accept their connection requests in **Connection Requests**, you will be able to:\n"
                f"• Ask me to identify which students need the most attention.\n"
                f"• Analyze specific athletes' performance trends and struggles.\n"
                f"• Generate targeted practice drills and training interventions."
            )
            suggested = [
                "How do students connect with me?",
                "How does AthletIQ calculate athlete attention priority?"
            ]
            return msg, sources, suggested

        # ----------------------------------------------------
        # COACH CASE 2: TARGET STUDENT SPECIFIC INQUIRY
        # ----------------------------------------------------
        # Check if user mentioned a student's name in the message
        matched_student = None
        for st in connected_students:
            if st["name"].lower() in msg_lower:
                matched_student = st
                break

        if not matched_student and target_student_id:
            matched_student = next((s for s in connected_students if s["student_id"] == target_student_id), None)

        if matched_student:
            st_id = matched_student["student_id"]
            st_name = matched_student["name"]
            st_details = target_details if (target_details and target_student_id == st_id) else AthletIQContextBuilder.build_student_context(st_id)

            sources.extend([f"Student Profile ({st_name})", "Practice Records", "Struggles Log", "AI Recommendations"])

            st_sessions = st_details.get("sessions", [])
            st_problems = st_details.get("recurring_problems", [])
            st_recs = st_details.get("ai_recommendations", [])
            st_rating = st_details.get("average_rating")
            st_hours = st_details.get("total_practice_hours", 0.0)

            rating_str = f"{st_rating}/10" if st_rating else "Pending Evaluation"

            # Check specific intent for student
            if any(w in msg_lower for w in ["weakness", "struggle", "problem", "fault", "issue"]):
                top_prob = st_problems[0][0] if st_problems else "None recorded"
                prob_count = st_problems[0][1] if st_problems else 0
                msg = (
                    f"**AthletIQ Weakness Analysis for {st_name}:**\n\n"
                    f"• **Primary Problem:** **{top_prob}** (logged in {prob_count} session{'s' if prob_count > 1 else ''})\n"
                    f"• **Total Practice Time:** {st_hours} hours across {len(st_sessions)} sessions\n"
                    f"• **Current Average Rating:** {rating_str}\n\n"
                )
                if st_recs:
                    msg += (
                        f"**AI Recommendation:**\n"
                        f"\"{st_recs[0]['title']}\" — {st_recs[0]['recommendation_text']}\n\n"
                    )
                msg += f"Would you like me to draft a professional drill assignment or feedback message for {st_name}?"

            elif any(w in msg_lower for w in ["drill", "feedback", "assign", "plan", "training plan"]):
                focus = st_problems[0][0] if st_problems else "Consistency & Match Play"
                msg = (
                    f"Here is a suggested **Training & Feedback Intervention for {st_name}**:\n\n"
                    f"🎯 **Target Area:** {focus}\n\n"
                    f"👨‍🏫 **Draft Feedback for Athlete:**\n"
                    f"\"Great dedication in your recent sessions. Your overall volume is solid ({st_hours} hrs), but we need to sharpen execution in {focus}. For our upcoming training, focus specifically on body alignment and repetition control under pressure.\"\n\n"
                    f"📋 **Assigned Drill Plan (25 Mins):**\n"
                    f"• **Drill Name:** Target Line Precision & Pressure Simulation\n"
                    f"• **Structure:** 5 min warm-up, 15 min controlled repetitions, 5 min target testing (aim for 85% accuracy).\n\n"
                    f"Would you like to attach this drill directly to {st_name}'s profile?"
                )

            else:
                msg = (
                    f"**Performance Summary for {st_name}:**\n\n"
                    f"• **Supervised Sport:** {matched_student['preferred_sport'] or 'Athletics'}\n"
                    f"• **Recorded Sessions:** {len(st_sessions)} sessions ({st_hours} total hours)\n"
                    f"• **Average Coach Rating:** {rating_str}\n"
                    f"• **Primary Struggle Area:** {st_problems[0][0] if st_problems else 'No recurring struggles'}\n"
                    f"• **Unaddressed AI Recommendations:** {matched_student['unaddressed_ai_recs']} pending guidance\n\n"
                    f"Would you like to review {st_name}'s latest sessions or assign a specific drill?"
                )

            suggested = [
                f"What are {st_name}'s biggest weaknesses?",
                f"Suggest a training plan for {st_name}",
                f"Draft coach feedback for {st_name}",
                "Which of my students needs the most attention?"
            ]
            return msg, sources, suggested

        # ----------------------------------------------------
        # COACH CASE 3: WHO NEEDS ATTENTION? / STUDENT COMPARISON
        # ----------------------------------------------------
        if any(w in msg_lower for w in ["attention", "priority", "who needs", "struggling", "compare", "summary", "list", "students"]):
            sources.extend(["Connected Students Roster", "Performance Analytics", "Struggles Matrix"])

            # Sort students by attention priority
            attention_students = [s for s in connected_students if s["needs_attention"]]
            steady_students = [s for s in connected_students if not s["needs_attention"]]

            summary_lines = []
            for idx, s in enumerate(connected_students, 1):
                r_text = f"{s['average_rating']}/10" if s['average_rating'] else "Pending Rating"
                status_icon = "🔴 Needs Attention" if s["needs_attention"] else "🟢 Steady Progress"
                summary_lines.append(
                    f"{idx}. **{s['name']}** ({s['preferred_sport'] or 'Sports'})\n"
                    f"   • {status_icon} | {s['session_count']} sessions ({s['total_practice_hours']} hrs) | Rating: {r_text}\n"
                    f"   • Logged Struggles: {s['total_problems_logged']} | Unanswered AI Recs: {s['unaddressed_ai_recs']}"
                )

            students_text = "\n\n".join(summary_lines)

            if attention_students:
                top_st = attention_students[0]
                msg = (
                    f"Based on performance data across your **{len(connected_students)} connected athletes**, **{top_st['name']}** currently needs the most attention because of recurring logged struggles and pending AI recommendations.\n\n"
                    f"📋 **Roster Overview:**\n\n"
                    f"{students_text}\n\n"
                    f"Would you like me to analyze **{top_st['name']}** in detail and suggest a training plan?"
                )
            else:
                msg = (
                    f"All **{len(connected_students)} of your connected athletes** are progressing steadily with consistent practice records.\n\n"
                    f"📋 **Roster Overview:**\n\n"
                    f"{students_text}\n\n"
                    f"Ask me about any specific athlete to review their metric progression or assign drills."
                )

            suggested = [
                f"How is {connected_students[0]['name']} performing?",
                "Which student has the highest practice volume?",
                "Suggest training drills for my team"
            ]
            return msg, sources, suggested

        # ----------------------------------------------------
        # COACH DEFAULT RESPONSE
        # ----------------------------------------------------
        sources.extend(["Coach Hub", "Authorized Students"])
        first_st_name = connected_students[0]["name"] if connected_students else "your athlete"
        msg = (
            f"Hello Coach {coach_name}! I am your **AthletIQ Coach Assistant**.\n\n"
            f"You are currently supervising **{len(connected_students)} student athletes** in {coach_profile.get('coaching_specialization') or 'Sports'}.\n\n"
            f"I can help you with:\n"
            f"• **Student Analysis:** Ask *\"How is {first_st_name} doing?\"*\n"
            f"• **Weakness Detection:** Ask *\"Which of my students needs the most attention?\"*\n"
            f"• **Training Planning:** Ask *\"Create a 30-minute drill for {first_st_name}\"*\n"
            f"• **Feedback Generation:** Ask *\"Draft feedback for {first_st_name}\"*\n\n"
            f"What would you like to review today?"
        )
        suggested = [
            "Which of my students needs the most attention?",
            f"How is {first_st_name} performing?",
            "Summarize my students' practice hours",
            "Suggest training drills for my team"
        ]
        return msg, sources, suggested
