from fastapi import APIRouter, Depends
from app.auth import get_current_user
from app.database import db_session

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

@router.get("")
def get_notifications(user: dict = Depends(get_current_user)):
    with db_session() as conn:
        cursor = conn.cursor()
        
        # Get notifications for this user
        cursor.execute("""
            SELECT notification_id, title, message, type, is_read, created_at
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC LIMIT 20
        """, (user["user_id"],))
        notifications = [dict(r) for r in cursor.fetchall()]
        
        unread_notifs = sum(1 for n in notifications if not n["is_read"])
        pending_requests = []
        
        # If user is a coach, fetch active pending student connection requests
        if user.get("role") == "COACH":
            cursor.execute("""
                SELECT cc.connection_id, cc.student_id, cc.status, cc.created_at,
                       u.name as student_name, u.email as student_email, u.preferred_sport, u.profile_photo
                FROM coach_connections cc
                JOIN users u ON cc.student_id = u.user_id
                WHERE cc.coach_id = ? AND cc.status = 'PENDING'
                ORDER BY cc.created_at DESC
            """, (user["user_id"],))
            pending_requests = [dict(r) for r in cursor.fetchall()]
            
        unread_count = unread_notifs + len(pending_requests)
        
        return {
            "notifications": notifications,
            "pending_requests": pending_requests,
            "unread_count": unread_count
        }

@router.put("/read-all")
def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", (user["user_id"],))
        return {"message": "All notifications marked as read"}

@router.put("/{notification_id}/read")
def mark_notification_read(notification_id: int, user: dict = Depends(get_current_user)):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE notifications SET is_read = 1 WHERE notification_id = ? AND user_id = ?", (notification_id, user["user_id"]))
        return {"message": "Notification marked as read"}
