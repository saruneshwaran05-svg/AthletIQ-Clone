# AthletIQ — AI-Powered Sports Performance and Practice Recommendation System

AthletIQ is an AI-powered sports performance tracking and personalized practice recommendation platform for students and their coaches. It enables student athletes to log practice sessions, track dynamic sport-specific performance metrics, identify recurring struggles, and receive evidence-backed AI recommendations generated using Python-based statistical and machine learning models.

---

## 🌟 Key Capabilities

1. **CRITICAL REQUIREMENT — START COMPLETELY EMPTY**:
   - Starts with a 100% empty database (0 users, 0 sports, 0 sessions, 0 fake stats).
   - Display informative, helpful empty states across all screens when no data exists.
2. **Two Primary User Roles**:
   - **STUDENT**: Log practice sessions, track dynamic metrics, view AI analytics & recommendations, set goals, link with coaches, download PDF performance reports.
   - **COACH**: Review connected students, inspect student logs & AI insights, provide professional feedback and drill assignments.
   - **Zero Academic Modules**: Purely sports and club activity focused.
3. **Indoor & Outdoor Sports System**:
   - Outdoor: Cricket, Football, Volleyball, Basketball, Tennis, Badminton, Athletics, Hockey, Kabaddi, Kho-Kho, Baseball, Handball, Rugby, Archery, Swimming, Boxing, Wrestling, Cycling.
   - Indoor & Clubs: Chess, Carrom, Table Tennis, Darts, Snooker, Billiards, Indoor Shooting, Esports, Coding Club, Music Club, Custom Activities.
4. **Dynamic Sport-Specific Metrics Forms**:
   - Adapts metrics form based on selected sport (e.g. Balls faced, Runs, Wickets, Wides for Cricket; Goals, Pass Accuracy % for Football; Serves & Kills for Volleyball; Blunders & Rating for Chess; Distance, Time & Pace for Athletics).
5. **Python AI Analytics & Recommendation Engine**:
   - Calculates statistical moving averages, linear trend regression, error frequencies, and consistency scores using Pandas, NumPy, and SciPy.
   - Empirical evidence tags back every recommendation.
   - Displays clear data sufficiency notifications if `< 1` practice sessions are logged.
6. **Coach-Student Connection & Feedback**:
   - Search coaches, send requests, accept/reject connection requests.
   - Secure authorization (coaches can ONLY access connected students).
   - Distinct tags for 🤖 **AI Recommendations** vs 🧑‍🏫 **Coach Feedback**.
7. **ReportLab PDF Performance Reports**:
   - Generates downloadable PDF reports built strictly from real user data.

---

## 🛠️ Technology Stack

- **Backend**: Python 3, FastAPI, Uvicorn, SQLite3, REST API, JWT Authentication.
- **AI / Analytics**: Python Pandas, NumPy, SciPy (Linear Trend Regression, Moving Averages, Anomaly Detection).
- **PDF Generator**: ReportLab.
- **Frontend**: HTML5, Modern CSS / Tailwind CSS, Chart.js, Lucide Icons, Vanilla JavaScript SPA Architecture.

---

## 🚀 How to Run the Application

### 1. Prerequisite
Ensure Python 3.10+ is installed.

### 2. Launch the Web Server
Run the launcher script:
```bash
python run.py
```
Or directly via Uvicorn:
```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Access in Browser
Open your browser and navigate to:
```
http://127.0.0.1:8000
```

---

## 🔒 Security & Privacy Architecture
- Passwords hashed using PBKDF2-HMAC-SHA256 with random 16-byte salt per user.
- Role-based authorization middleware enforcing strict separation between Student and Coach portals.
- Coach access gate ensuring coaches can ONLY view students who have explicitly linked with them.
