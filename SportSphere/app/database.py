import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.getenv("DATABASE_PATH", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "athletiq.db"))
db_dir = os.path.dirname(DB_PATH)
if db_dir and not os.path.exists(db_dir):
    os.makedirs(db_dir, exist_ok=True)


def delete_database_files():
    """Completely removes main SQLite database and WAL journal files (-wal, -shm)."""
    for ext in ["", "-wal", "-shm"]:
        target_path = DB_PATH + ext
        if os.path.exists(target_path):
            try:
                os.remove(target_path)
                print(f"Deleted database file: {target_path}")
            except Exception as e:
                print(f"Warning: Could not remove {target_path}: {e}")



def get_db_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

@contextmanager
def db_session():
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def init_db():
    """Initializes the database schema and indexes."""
    with db_session() as conn:
        cursor = conn.cursor()
        
        # 1. Users table (Students and Coaches)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL CHECK (role IN ('STUDENT', 'COACH')),
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            date_of_birth TEXT,
            coaching_specialization TEXT,
            experience_years REAL DEFAULT 0,
            certification TEXT,
            bio TEXT,
            preferred_sport TEXT,
            profile_photo TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # 2. Sports Master table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS sports (
            sport_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL CHECK (category IN ('INDOOR', 'OUTDOOR')),
            is_custom INTEGER DEFAULT 0,
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE
        );
        """)

        # 3. Student Selected Sports
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS student_sports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            sport_id INTEGER NOT NULL,
            skill_level TEXT CHECK (skill_level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ELITE')),
            experience_years REAL DEFAULT 0,
            training_goal TEXT,
            start_date TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE CASCADE,
            FOREIGN KEY (sport_id) REFERENCES sports(sport_id) ON DELETE CASCADE,
            UNIQUE(student_id, sport_id)
        );
        """)

        # 4. Practice Sessions
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS practice_sessions (
            session_id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            sport_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            duration_minutes INTEGER NOT NULL,
            intensity TEXT CHECK (intensity IN ('LOW', 'MEDIUM', 'HIGH', 'MAXIMUM')),
            training_type TEXT NOT NULL,
            training_area TEXT,
            coach_rating INTEGER CHECK (coach_rating BETWEEN 1 AND 10),
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE CASCADE,
            FOREIGN KEY (sport_id) REFERENCES sports(sport_id) ON DELETE CASCADE
        );
        """)

        # Auto-migrate existing practice_sessions table if personal_rating column exists
        cursor.execute("PRAGMA table_info(practice_sessions);")
        ps_columns = [row[1] for row in cursor.fetchall()]
        if 'personal_rating' in ps_columns and 'coach_rating' not in ps_columns:
            cursor.execute("ALTER TABLE practice_sessions RENAME COLUMN personal_rating TO coach_rating;")
        elif 'coach_rating' not in ps_columns:
            cursor.execute("ALTER TABLE practice_sessions ADD COLUMN coach_rating INTEGER CHECK (coach_rating BETWEEN 1 AND 10);")

        # 5. Dynamic Sport Performance Records
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS performance_records (
            record_id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            metric_name TEXT NOT NULL,
            metric_value REAL NOT NULL,
            metric_unit TEXT DEFAULT 'count',
            FOREIGN KEY (session_id) REFERENCES practice_sessions(session_id) ON DELETE CASCADE
        );
        """)

        # 6. Session Problems / Struggles
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS problems (
            problem_id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            description TEXT NOT NULL,
            severity TEXT CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
            category TEXT,
            FOREIGN KEY (session_id) REFERENCES practice_sessions(session_id) ON DELETE CASCADE
        );
        """)

        # 7. AI Performance Analyses
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_analyses (
            analysis_id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            sport_id INTEGER NOT NULL,
            analysis_text TEXT NOT NULL,
            detected_issue TEXT,
            trend_type TEXT CHECK (trend_type IN ('IMPROVEMENT', 'DECLINE', 'CONSISTENCY', 'WEAKNESS')),
            supporting_evidence TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE CASCADE,
            FOREIGN KEY (sport_id) REFERENCES sports(sport_id) ON DELETE CASCADE
        );
        """)

        # 8. AI Recommendations
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_recommendations (
            recommendation_id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            sport_id INTEGER NOT NULL,
            session_id INTEGER,
            title TEXT NOT NULL,
            detected_issue TEXT NOT NULL,
            evidence TEXT NOT NULL,
            recommendation_text TEXT NOT NULL,
            suggested_goal TEXT,
            priority TEXT DEFAULT 'MEDIUM',
            coach_suggestion TEXT,
            coach_suggested_at TIMESTAMP,
            coach_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE CASCADE,
            FOREIGN KEY (sport_id) REFERENCES sports(sport_id) ON DELETE CASCADE,
            FOREIGN KEY (session_id) REFERENCES practice_sessions(session_id) ON DELETE CASCADE,
            FOREIGN KEY (coach_id) REFERENCES users(user_id) ON DELETE SET NULL
        );
        """)

        # Auto-migrate existing ai_recommendations table
        cursor.execute("PRAGMA table_info(ai_recommendations);")
        air_columns = [row[1] for row in cursor.fetchall()]
        if 'coach_suggestion' not in air_columns:
            cursor.execute("ALTER TABLE ai_recommendations ADD COLUMN coach_suggestion TEXT;")
        if 'coach_suggested_at' not in air_columns:
            cursor.execute("ALTER TABLE ai_recommendations ADD COLUMN coach_suggested_at TIMESTAMP;")
        if 'coach_id' not in air_columns:
            cursor.execute("ALTER TABLE ai_recommendations ADD COLUMN coach_id INTEGER;")

        # 9. Coach-Student Connections
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS coach_connections (
            connection_id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            coach_id INTEGER NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE CASCADE,
            FOREIGN KEY (coach_id) REFERENCES users(user_id) ON DELETE CASCADE,
            UNIQUE(student_id, coach_id)
        );
        """)

        # 10. Coach Professional Feedback
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS coach_feedback (
            feedback_id INTEGER PRIMARY KEY AUTOINCREMENT,
            coach_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            sport_id INTEGER NOT NULL,
            session_id INTEGER,
            observed_strength TEXT,
            observed_weakness TEXT,
            feedback_text TEXT NOT NULL,
            recommended_drill TEXT,
            practice_duration_minutes INTEGER,
            priority TEXT DEFAULT 'MEDIUM',
            student_reply TEXT,
            student_reply_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (coach_id) REFERENCES users(user_id) ON DELETE CASCADE,
            FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE CASCADE,
            FOREIGN KEY (sport_id) REFERENCES sports(sport_id) ON DELETE CASCADE,
            FOREIGN KEY (session_id) REFERENCES practice_sessions(session_id) ON DELETE SET NULL
        );
        """)

        # Auto-migrate existing coach_feedback table for student_reply columns
        cursor.execute("PRAGMA table_info(coach_feedback);")
        cf_columns = [row[1] for row in cursor.fetchall()]
        if 'student_reply' not in cf_columns:
            cursor.execute("ALTER TABLE coach_feedback ADD COLUMN student_reply TEXT;")
        if 'student_reply_at' not in cf_columns:
            cursor.execute("ALTER TABLE coach_feedback ADD COLUMN student_reply_at TIMESTAMP;")

        # 11. Goals Tracking
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS goals (
            goal_id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            sport_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            metric_name TEXT,
            initial_value REAL DEFAULT 0,
            current_value REAL DEFAULT 0,
            target_value REAL NOT NULL,
            unit TEXT DEFAULT 'count',
            deadline TEXT NOT NULL,
            status TEXT DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'EXPIRED')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE CASCADE,
            FOREIGN KEY (sport_id) REFERENCES sports(sport_id) ON DELETE CASCADE
        );
        """)

        # 12. Notifications
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
        );
        """)

        # 13. AI Conversations
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_conversations (
            conversation_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('STUDENT', 'COACH')),
            sport_id INTEGER,
            student_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
            FOREIGN KEY (sport_id) REFERENCES sports(sport_id) ON DELETE SET NULL,
            FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE CASCADE
        );
        """)

        # 14. AI Messages
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_messages (
            message_id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL,
            sender TEXT NOT NULL CHECK (sender IN ('user', 'assistant', 'system')),
            message TEXT NOT NULL,
            message_type TEXT DEFAULT 'text',
            sources TEXT,
            suggested_questions TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES ai_conversations(conversation_id) ON DELETE CASCADE
        );
        """)

        # Performance & Security Indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ps_student_sport ON practice_sessions(student_id, sport_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ai_recs_student ON ai_recommendations(student_id, sport_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ai_analyses_student ON ai_analyses(student_id, sport_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_student_sports ON student_sports(student_id, sport_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_perf_records_session ON performance_records(session_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_problems_session ON problems(session_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversations(user_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ai_msg_conv ON ai_messages(conversation_id);")

        seed_default_sports(cursor)
        print("Database schema initialized and hardened at:", DB_PATH)


def seed_default_sports(cursor):
    """Populates standard sports if sports table is empty."""
    cursor.execute("SELECT COUNT(*) as count FROM sports")
    if cursor.fetchone()["count"] == 0:
        default_sports = [
            ("Cricket", "OUTDOOR"),
            ("Football", "OUTDOOR"),
            ("Basketball", "INDOOR"),
            ("Badminton", "INDOOR"),
            ("Tennis", "OUTDOOR"),
            ("Volleyball", "INDOOR"),
            ("Swimming", "INDOOR"),
            ("Athletics", "OUTDOOR"),
            ("Table Tennis", "INDOOR"),
            ("Chess", "INDOOR"),
            ("Boxing", "INDOOR"),
            ("Golf", "OUTDOOR"),
            ("Hockey", "OUTDOOR"),
            ("Baseball", "OUTDOOR")
        ]
        cursor.executemany("INSERT INTO sports (name, category, is_custom) VALUES (?, ?, 0)", default_sports)


def clear_all_data():
    """Wipes all data from all tables cleanly."""
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = OFF;")
        tables = [
            "ai_messages", "ai_conversations", "notifications", "goals", "coach_feedback", "coach_connections",
            "ai_recommendations", "ai_analyses", "problems", "performance_records",
            "practice_sessions", "student_sports", "sports", "users"
        ]
        for t in tables:
            cursor.execute(f"DELETE FROM {t};")
            cursor.execute(f"DELETE FROM sqlite_sequence WHERE name='{t}';")
        cursor.execute("PRAGMA foreign_keys = ON;")
        seed_default_sports(cursor)
        print("All database records cleared successfully.")

