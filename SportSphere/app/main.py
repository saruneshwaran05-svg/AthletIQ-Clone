from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import os

from app.database import init_db
from app.routers import auth, sports, practice, analytics, ai, coach, goals, notifications, reports

app = FastAPI(
    title="AthletIQ — AI-Powered Sports Performance Tracking Platform",
    description="Full-Stack Web Platform for Student Sports Tracking, AI Analytics, and Coach Feedback.",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Database on startup
@app.on_event("startup")
def on_startup():
    init_db()

# Mount Static Files & Templates
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

# Include API Routers
app.include_router(auth.router)
app.include_router(sports.router)
app.include_router(practice.router)
app.include_router(analytics.router)
app.include_router(ai.router)
app.include_router(coach.router)
app.include_router(goals.router)
app.include_router(notifications.router)
app.include_router(reports.router)

@app.get("/")
def read_root(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "database": "empty_initialized"}
