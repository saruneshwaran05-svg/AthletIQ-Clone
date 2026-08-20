from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

# Authentication & Users
class StudentRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=6)
    confirm_password: str
    date_of_birth: Optional[str] = None
    preferred_sport: Optional[str] = None
    profile_photo: Optional[str] = None

class CoachRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=6)
    confirm_password: str
    coaching_specialization: str
    experience_years: float = 0.0
    certification: Optional[str] = None
    profile_photo: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str
    role: Optional[str] = None

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    date_of_birth: Optional[str] = None
    preferred_sport: Optional[str] = None
    coaching_specialization: Optional[str] = None
    experience_years: Optional[float] = None
    certification: Optional[str] = None
    profile_photo: Optional[str] = None

class ForgotPasswordRequest(BaseModel):
    email: str


# Sports Management
class SportCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=50)
    category: str  # INDOOR or OUTDOOR

class StudentSportCreate(BaseModel):
    sport_id: Optional[int] = None
    sport_name: Optional[str] = None
    category: Optional[str] = "OUTDOOR"
    skill_level: str  # BEGINNER, INTERMEDIATE, ADVANCED, ELITE
    experience_years: float = 0.0
    training_goal: Optional[str] = None
    start_date: Optional[str] = None

# Practice Sessions
class PerformanceMetricInput(BaseModel):
    metric_name: str
    metric_value: float
    metric_unit: Optional[str] = "count"

class ProblemInput(BaseModel):
    description: str
    severity: str = "MEDIUM"  # LOW, MEDIUM, HIGH, CRITICAL
    category: Optional[str] = "General"

class PracticeSessionCreate(BaseModel):
    sport_id: int
    date: str
    duration_minutes: int = Field(..., gt=0)
    intensity: str = "MEDIUM"  # LOW, MEDIUM, HIGH, MAXIMUM
    training_type: str = "SOLO_DRILL"  # SOLO_DRILL, TEAM_PRACTICE, MATCH_PLAY, FITNESS, STRATEGY
    training_area: Optional[str] = None
    coach_rating: Optional[int] = Field(None, ge=1, le=10)
    notes: Optional[str] = None
    metrics: List[PerformanceMetricInput] = []
    problems: List[ProblemInput] = []

class SessionRatingInput(BaseModel):
    coach_rating: int = Field(..., ge=1, le=10)


# Coach Feedback
class CoachFeedbackCreate(BaseModel):
    student_id: int
    sport_id: int
    session_id: Optional[int] = None
    observed_strength: Optional[str] = None
    observed_weakness: Optional[str] = None
    feedback_text: str
    recommended_drill: Optional[str] = None
    practice_duration_minutes: Optional[int] = 20
    priority: str = "MEDIUM"  # LOW, MEDIUM, HIGH

class StudentFeedbackReplyInput(BaseModel):
    reply_text: str

# Goals
class GoalCreate(BaseModel):
    sport_id: int
    title: str
    description: Optional[str] = None
    metric_name: Optional[str] = None
    target_value: float
    unit: Optional[str] = "count"
    deadline: str

class GoalUpdate(BaseModel):
    current_value: Optional[float] = None
    status: Optional[str] = None

class CoachAiSuggestionInput(BaseModel):
    coach_suggestion: str

