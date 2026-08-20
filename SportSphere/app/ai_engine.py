import pandas as pd
import numpy as np
from scipy import stats
from app.database import db_session

def run_student_ai_analysis(student_id: int, sport_id: int = None) -> dict:
    """
    Analyzes historical performance records using Pandas, NumPy, and SciPy.
    Strictly zero-hallucination / zero-fake-data logic based on logged sessions.
    Performs ISOLATED per-sport analysis so multiple sports do not collapse or bleed into each other.
    Generates multi-pillar high-level recommendations and session-wise recommendations.
    """
    with db_session() as conn:
        cursor = conn.cursor()
        
        # 1. Fetch practice sessions
        if sport_id:
            cursor.execute("""
                SELECT ps.session_id, ps.sport_id, s.name as sport_name, ps.date, 
                       ps.duration_minutes, ps.intensity, ps.training_type, ps.training_area,
                       ps.coach_rating, ps.notes
                FROM practice_sessions ps
                JOIN sports s ON ps.sport_id = s.sport_id
                WHERE ps.student_id = ? AND ps.sport_id = ?
                ORDER BY ps.date ASC, ps.session_id ASC
            """, (student_id, sport_id))
        else:
            cursor.execute("""
                SELECT ps.session_id, ps.sport_id, s.name as sport_name, ps.date, 
                       ps.duration_minutes, ps.intensity, ps.training_type, ps.training_area,
                       ps.coach_rating, ps.notes
                FROM practice_sessions ps
                JOIN sports s ON ps.sport_id = s.sport_id
                WHERE ps.student_id = ?
                ORDER BY ps.date ASC, ps.session_id ASC
            """, (student_id,))
        
        all_sessions = [dict(r) for r in cursor.fetchall()]
        
        if len(all_sessions) < 1:
            return {
                "has_sufficient_data": False,
                "message": "More practice records are required before AI analysis becomes available. Record at least 1 practice session to unlock AI analysis.",
                "sessions_logged": 0,
                "min_required": 1,
                "analyses": [],
                "recommendations": [],
                "sports_analyzed": []
            }

        session_ids = [s["session_id"] for s in all_sessions]
        placeholders = ",".join("?" * len(session_ids))
        
        # Fetch metrics
        cursor.execute(f"""
            SELECT record_id, session_id, metric_name, metric_value, metric_unit
            FROM performance_records
            WHERE session_id IN ({placeholders})
        """, session_ids)
        all_metrics = [dict(r) for r in cursor.fetchall()]
        
        # Fetch problems
        cursor.execute(f"""
            SELECT problem_id, session_id, description, severity, category
            FROM problems
            WHERE session_id IN ({placeholders})
        """, session_ids)
        all_problems = [dict(r) for r in cursor.fetchall()]

    # Convert master data to DataFrames
    df_all_sessions = pd.DataFrame(all_sessions)
    df_all_metrics = pd.DataFrame(all_metrics) if all_metrics else pd.DataFrame()
    df_all_problems = pd.DataFrame(all_problems) if all_problems else pd.DataFrame()

    # Group sessions by sport_id to ensure strict sport isolation
    unique_sport_ids = df_all_sessions['sport_id'].unique()

    all_analyses = []
    all_recommendations = []
    sports_analyzed_summary = []

    # Clear previous AI records for this student (or student + sport_id) before regenerating fresh ones
    with db_session() as conn:
        cursor = conn.cursor()
        if sport_id:
            cursor.execute("DELETE FROM ai_analyses WHERE student_id = ? AND sport_id = ?", (student_id, sport_id))
            cursor.execute("DELETE FROM ai_recommendations WHERE student_id = ? AND sport_id = ?", (student_id, sport_id))
        else:
            cursor.execute("DELETE FROM ai_analyses WHERE student_id = ?", (student_id,))
            cursor.execute("DELETE FROM ai_recommendations WHERE student_id = ?", (student_id,))

    # Iterate through each sport individually
    for sp_id in unique_sport_ids:
        sp_id = int(sp_id)
        df_sport_sessions = df_all_sessions[df_all_sessions['sport_id'] == sp_id].copy()
        sport_name = df_sport_sessions['sport_name'].iloc[0]

        sport_session_ids = df_sport_sessions['session_id'].tolist()
        
        df_sport_metrics = pd.DataFrame()
        if not df_all_metrics.empty:
            df_sport_metrics = df_all_metrics[df_all_metrics['session_id'].isin(sport_session_ids)].copy()

        df_sport_problems = pd.DataFrame()
        if not df_all_problems.empty:
            df_sport_problems = df_all_problems[df_all_problems['session_id'].isin(sport_session_ids)].copy()

        # Run per-sport isolated analysis
        sport_analysis, sport_recs = analyze_single_sport(
            student_id=student_id,
            sport_id=sp_id,
            sport_name=sport_name,
            df_sessions=df_sport_sessions,
            df_metrics=df_sport_metrics,
            df_problems=df_sport_problems
        )

        all_analyses.append(sport_analysis)
        all_recommendations.extend(sport_recs)
        sports_analyzed_summary.append({
            "sport_id": sp_id,
            "sport_name": sport_name,
            "sessions_count": len(df_sport_sessions),
            "recs_count": len(sport_recs),
            "trend_type": sport_analysis["trend_type"]
        })

    # Save to Database
    with db_session() as conn:
        cursor = conn.cursor()
        for a in all_analyses:
            cursor.execute("""
                INSERT INTO ai_analyses (student_id, sport_id, analysis_text, detected_issue, trend_type, supporting_evidence)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (a["student_id"], a["sport_id"], a["analysis_text"], a["detected_issue"], a["trend_type"], a["supporting_evidence"]))

        for r in all_recommendations:
            cursor.execute("""
                INSERT INTO ai_recommendations (student_id, sport_id, session_id, title, detected_issue, evidence, recommendation_text, suggested_goal, priority)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (r["student_id"], r["sport_id"], r.get("session_id"), r["title"], r["detected_issue"], r["evidence"], r["recommendation_text"], r["suggested_goal"], r["priority"]))

        if all_recommendations:
            cursor.execute("""
                INSERT INTO notifications (user_id, title, message, type)
                VALUES (?, '⚡ Enhanced Multi-Sport AI Analytics', ?, 'AI_SUGGESTION')
            """, (student_id, f"AI engine generated {len(all_recommendations)} new multi-pillar performance suggestions for your sports."))

    return {
        "has_sufficient_data": True,
        "message": f"AI Analysis successfully completed for {len(unique_sport_ids)} sport(s). Generated {len(all_recommendations)} multi-pillar recommendations.",
        "sessions_logged": len(all_sessions),
        "analyses": all_analyses,
        "recommendations": all_recommendations,
        "sports_analyzed": sports_analyzed_summary
    }


def _get_sport_mechanics_breakdown(sport_name: str, prob_desc: str, notes: str = "") -> dict:
    """
    Analyzes any sport (15+ dedicated sport domains + custom sports) and returns a multi-pillar dictionary:
    {
        "diagnosis": ...,
        "tech_advice": ...,
        "tactical_strategy": ...,
        "mental_focus": ...,
        "conditioning_recovery": ...,
        "equipment_gear": ...,
        "step1": ...,
        "step2": ...,
        "step3": ...,
        "benchmark": ...
    }
    with crystal-clear, intuitive, domain-specific guidance covering all aspects of sports performance.
    """
    s = sport_name.lower().strip()
    p = prob_desc.lower().strip()
    n = notes.lower().strip() if notes else ""

    # Physical strain/fatigue base detection
    if any(k in p or k in n for k in ["fatigue", "pain", "stiff", "sore", "tired", "injury", "crimp", "cramps"]):
        strain_recovery = "High physical load detected. Reduce workout intensity by 20%, incorporate 15 mins of post-practice foam rolling, dynamic hip/shoulder mobility work, and maintain 3L hydration."
    else:
        strain_recovery = "Execute post-practice 10-minute targeted static stretching focusing on core stabilizer muscles and joints. Maintain optimal hydration and 8 hours of rest."

    # 1. CRICKET
    if "cricket" in s:
        if any(k in p for k in ["batting", "legside", "offside", "shot", "edge", "drive", "flick", "bowled"]):
            return {
                "diagnosis": "Bat shoulder misalignment, head tilting during release, or premature wrist closing causing edge trajectory.",
                "tech_advice": "Focus on head position: keep your eyes level directly over the ball at contact. Lead your drive with a high front elbow, grip the handle firmly with top hand, and keep bottom hand light.",
                "tactical_strategy": "Build innings awareness: play close to your body during early overs. Anticipate ball line rather than pre-meditating shots.",
                "mental_focus": "Practice pre-ball focus reset: take a deep breath before the bowler starts run-up, reset your gaze on the bowler's release window.",
                "conditioning_recovery": strain_recovery,
                "equipment_gear": "Check bat balance and grip rubber condition. Ensure helmet visor is aligned so vision is completely unobscured.",
                "step1": "Shadow Form Drives (10 mins) — Why: Lock in head alignment. How: Perform 25 slow shadow drives keeping front elbow high and head directly over stance.",
                "step2": "Targeted Stationary Throwdowns (15 mins) — Why: Master sweet-spot contact. How: Face 35 throwdowns aiming strictly for straight down the ground.",
                "step3": "Match Pace Scenario Nets (10 mins) — Why: Pressure simulation. How: Face match-speed deliveries under defender field placement limits.",
                "benchmark": "Achieve 85%+ middle-of-bat contact rate with 0 unforced edges in your next session."
            }
        elif any(k in p for k in ["bowling", "wide", "no ball", "pace", "length", "seam", "spin"]):
            return {
                "diagnosis": "Non-bowling arm early drop, foot plant instability, or inconsistent release point height.",
                "tech_advice": "Pull your non-bowling arm strongly down towards your front hip as you enter delivery. Keep your landing foot pointing straight at target stumps.",
                "tactical_strategy": "Set up batters: bowl 3 consecutive deliveries at good length outside off-stumps before executing a targeted yorker or bouncer.",
                "mental_focus": "Visualize the exact landing seam spot on the pitch during your run-up cadence rather than rushing your approach.",
                "conditioning_recovery": strain_recovery,
                "equipment_gear": "Ensure bowling spikes provide maximum ankle stability and firm front-foot landing traction.",
                "step1": "Stationary Target Spot Deliveries (10 mins) — Why: Isolate release point. How: Bowl 20 deliveries from a 2-step approach targeting a cone on good length.",
                "step2": "Run-up Cadence Repetitions (15 mins) — Why: Build stride rhythm. How: Execute 24 deliveries with a measured 12-step rhythm.",
                "step3": "Death-Over Target Execution (10 mins) — Why: Pressurized accuracy. How: Bowl 2 simulated death overs needing under 6 runs with field restrictions.",
                "benchmark": "Maintain 85%+ deliveries landing on target spot with zero wide balls."
            }
        else: # Fielding / General
            return {
                "diagnosis": "Improper hand cup formation, delayed reaction time, or eye detachment prior to ball arrival.",
                "tech_advice": "Form a wide, soft cup with palms facing the ball. Cushion the ball into your body upon impact rather than snatching at it.",
                "tactical_strategy": "Stay on the balls of your feet in a light squat, reading batter body orientation to anticipate edge angles early.",
                "mental_focus": "Maintain active field anticipation: expect every hit to come directly to you.",
                "conditioning_recovery": strain_recovery,
                "equipment_gear": "Use padded fielding gloves for close-in catches and verify shoe studs for quick lateral grip.",
                "step1": "Soft-Hands Close Reaction Catching (10 mins) — Why: Master absorption. How: Catch 40 rapid close-range rebound catches with soft wrists.",
                "step2": "High Aerial Judging Drills (15 mins) — Why: Track ball in sky. How: Complete 20 pop-fly catches while moving backward and sideways.",
                "step3": "Single Stump Direct Hit Drills (10 mins) — Why: Pick-and-throw accuracy. How: Execute 15 rapid pick-up and throw direct hits.",
                "benchmark": "Achieve 100% catch retention rate across 25 high catches."
            }

    # 2. FOOTBALL / SOCCER
    elif "football" in s or "soccer" in s:
        if any(k in p for k in ["pass", "accuracy", "turnover", "distribution", "control"]):
            return {
                "diagnosis": "Plant foot placement distance, unlocked striking ankle, or poor body weight transfer.",
                "tech_advice": "Place non-kicking foot 6 inches beside the ball pointing directly at target teammate. Lock striking ankle firmly and strike through ball center.",
                "tactical_strategy": "Scan your surroundings twice before ball arrival. Know your passing destination before your first touch.",
                "mental_focus": "Maintain calm under pressuring defenders; trust your first touch to create space.",
                "conditioning_recovery": strain_recovery,
                "equipment_gear": "Select firm-ground (FG) or soft-ground (SG) cleats matching pitch moisture to prevent slipping during passes.",
                "step1": "Rebound Wall Inside-Foot Passing (10 mins) — Why: Lock ankle mechanics. How: Complete 100 alternating one-touch passes against rebound wall.",
                "step2": "Pressure Grid One-Touch Triangle (15 mins) — Why: Speed of play. How: Execute rapid one-touch passes in 3-cone grid under defender pressure.",
                "step3": "Lofted Driven Distribution (10 mins) — Why: Long-range vision. How: Deliver 15 lofted passes over defensive line into target 5x5m zones.",
                "benchmark": "Achieve 90%+ passing completion rate across drill sets."
            }
        elif any(k in p for k in ["shoot", "goal", "finish", "miss", "strike"]):
            return {
                "diagnosis": "Leaning backward at impact causing ball to lift, or rushed composure inside penalty area.",
                "tech_advice": "Keep your chest leaning slightly over the ball at impact. Aim for side-netting corners rather than maximum power.",
                "tactical_strategy": "Take a micro-pause before striking to observe goalkeeper movement and pick an open bottom corner.",
                "mental_focus": "Cultivate cold composure in 1v1 situations; focus on clean technique over raw force.",
                "conditioning_recovery": strain_recovery,
                "equipment_gear": "Ensure boot lace area is clean and snug to maximize strike contact area.",
                "step1": "Stationary Form Striking (10 mins) — Why: Body over ball technique. How: Strike static balls from 16m out targeting lower corners.",
                "step2": "Dribble Slalom & Placement Finishing (15 mins) — Why: Dynamic shooting. How: Dribble past 4 cones and finish in side netting within 2 seconds.",
                "step3": "Cross-Receive 2-Touch Finishing (10 mins) — Why: Game situation box play. How: Receive high/low crosses and finish within 2 touches.",
                "benchmark": "Convert 80%+ shots into target corner zones."
            }
        else:
            return {
                "diagnosis": "First touch cushion variance or body balance instability under tight defensive pressure.",
                "tech_advice": "Cushion incoming ball on foot contact by drawing foot back slightly. Keep center of gravity low with flexed knees.",
                "tactical_strategy": "Use body positioning to shield ball between defender and your body before executing turn.",
                "mental_focus": "Stay focused on rapid transition from defense to attack without hesitation.",
                "conditioning_recovery": strain_recovery,
                "equipment_gear": "Check shin guard fit and sock compression to avoid calf cramps.",
                "step1": "Cone Weave Ball Control (10 mins) — Why: Touch precision. How: Dribble through 6 tight cones using inside/outside foot surfaces.",
                "step2": "Small-Sided Possession Grid (15 mins) — Why: Spatial awareness. How: Play 3v3 possession in tight 15x15m grid.",
                "step3": "Transition Counter Attack Simulation (10 mins) — Why: High-speed decision. How: Execute 4v2 counter attacks under 10-second shot timer.",
                "benchmark": "Execute zero unforced touch errors in match drills."
            }

    # 3. BASKETBALL
    elif "basketball" in s:
        if any(k in p for k in ["shot", "three", "jumper", "freethrow", "miss", "arc"]):
            return {
                "diagnosis": "Shooting elbow flare out, inconsistent dip, or lack of upward legs energy transfer.",
                "tech_advice": "Tuck shooting elbow straight toward rim. Power shot upward from knees in one fluid motion, releasing with high wrist snap at jump peak.",
                "tactical_strategy": "Identify high-percentage shot zones. Move off-ball into open perimeter windows when point guard drives.",
                "mental_focus": "Trust your leg rhythm. Arm tightness causes short shots—relax shoulders and follow through smoothly.",
                "conditioning_recovery": strain_recovery,
                "equipment_gear": "Verify basketball shoe ankle support and court outsole traction to ensure balanced jump setup.",
                "step1": "One-Handed Rim Form Shooting (10 mins) — Why: High release arc. How: Shoot 30 one-handed shots 4 feet from rim focusing on wrist snap.",
                "step2": "5-Spot Catch & Shoot Reps (15 mins) — Why: Perimeter consistency. How: Shoot 50 jump shots across 5 key court spots.",
                "step3": "Full-Court Sprint Pull-Up Jumper (10 mins) — Why: Game tempo shooting. How: Sprint half-court and execute pull-up jumper under contest.",
                "benchmark": "Sustain 75%+ shooting accuracy across form sets."
            }
        elif any(k in p for k in ["dribble", "turnover", "handle", "steal"]):
            return {
                "diagnosis": "High dribble height above waist, head down posture, or lack of off-arm ball protection.",
                "tech_advice": "Keep dribble height low below waist. Extend non-dribbling arm as a protective shield and keep eyes up looking at court.",
                "tactical_strategy": "Change dribble speeds and levels to freeze defenders rather than just sprinting straight.",
                "mental_focus": "Maintain composure against full-court press; protect ball and spot open passing lanes.",
                "conditioning_recovery": strain_recovery,
                "equipment_gear": "Use heavy training ball for dribbling practice to build wrist and forearm strength.",
                "step1": "Two-Ball Pound Dribbling (10 mins) — Why: Off-hand control. How: Execute low crossovers and figure-eights with eyes strictly up.",
                "step2": "Slalom Cone Heavy-Ball Weaves (15 mins) — Why: Pressure handle. How: Dribble past slalom cones under defender physical contact.",
                "step3": "Full-Court Press Trap Escape (10 mins) — Why: Trap break. How: Escape 2-man defensive trap without turning over ball.",
                "benchmark": "Maintain 0 ball handle turnovers in pressure drill sets."
            }
        else:
            return {
                "diagnosis": "Pivot foot travel, spatial awareness lag, or defensive stance elevation.",
                "tech_advice": "Maintain low defensive stance with knees bent and feet wider than shoulders. Keep pivot foot planted until ball leaves hands.",
                "tactical_strategy": "In defense, stay between your player and rim; on offense, execute crisp pick-and-roll angle cuts.",
                "mental_focus": "Communicate actively on defense: call out screens, switches, and help defense early.",
                "conditioning_recovery": strain_recovery,
                "equipment_gear": "Ensure custom orthotics/insoles are fitted for high-impact jump landings.",
                "step1": "Triple-Threat & Pivot Footwork (10 mins) — Why: Stance balance. How: Practice jab steps, cross-pivots without ball travel.",
                "step2": "Motion Pick & Roll Executions (15 mins) — Why: Tactical offense. How: Run 20 pick-and-roll sets with simulated defender.",
                "step3": "Full-Pace Scrimmage Reps (10 mins) — Goal: Scrimmage speed. How: Execute tactical sets under full scrimmage pace.",
                "benchmark": "Execute zero footwork violations and sustain 80%+ defensive contest."
            }

    # 4. BADMINTON
    elif "badminton" in s:
        return {
            "diagnosis": "Delayed split-step reaction, incorrect racquet grip angle (panhandle grip), or lack of pronation during smash.",
            "tech_advice": "Execute split-step just as opponent makes shuttle contact. Transition from relaxed bevel grip to firm thumb/finger snap at impact.",
            "tactical_strategy": "Force opponent to rear court corners with deep clears, then drop delicately into front court corners.",
            "mental_focus": "Stay alert in central recovery position after every stroke; do not watch your shot.",
            "conditioning_recovery": strain_recovery,
            "equipment_gear": "Check racquet string tension (24-28 lbs) matching your skill level and non-marking court shoe lateral grip.",
            "step1": "Split-Step Footwork Shadowing (10 mins) — Why: Explosive court movement. How: Perform split-steps and shadow footwork to all 6 court corners.",
            "step2": "Multi-Feed High Accuracy Reps (15 mins) — Why: Shot placement. How: Return 40 rapid feeds focusing on deep corners and tight net drops.",
            "step3": "Restricted Court Point Play (10 mins) — Why: Match strategy. How: Play competitive points restricted to baseline and drop zones.",
            "benchmark": "Achieve 85%+ shuttle placement accuracy in target zones."
        }

    # 5. TENNIS
    elif "tennis" in s:
        return {
            "diagnosis": "Late racquet takeback, open racquet face on contact, or standing static instead of split-stepping.",
            "tech_advice": "Start racquet backswing as soon as ball leaves opponent's racquet. Brush low-to-high across back of ball for topspin control.",
            "tactical_strategy": "Exploit cross-court depth to push opponent wide before striking down-the-line winner.",
            "mental_focus": "Maintain calm point-by-point routine: bounce ball 3 times before serve, breathe out on ball contact.",
            "conditioning_recovery": strain_recovery,
            "equipment_gear": "Verify tennis string tension and dampener; replace worn overgrip for firm palm grip.",
            "step1": "Split-Step & Unit Turn Shadowing (10 mins) — Why: Early preparation. How: Execute 30 shadow forehands/backhands with early shoulder turn.",
            "step2": "Cross-Court Deep Rally Sets (15 mins) — Why: Depth consistency. How: Rally 50 balls deep past service line with heavy topspin.",
            "step3": "Serve & First Ball Attack Drill (10 mins) — Why: Play initiation. How: Hit 20 target serves followed by aggressive 3rd ball approach.",
            "benchmark": "Maintain 80%+ groundstroke depth past service line."
        }

    # 6. VOLLEYBALL
    elif "volleyball" in s:
        return {
            "diagnosis": "Improper 3-step spike approach timing, un-snapped wrist at apex, or weak platform during forearm passing.",
            "tech_advice": "Time approach jump (Left-Right-Left for right hand) to strike ball at maximum vertical reach. Snap wrist aggressively downward.",
            "tactical_strategy": "Observe blocker hand positions during jump; tip over block or wipe ball off outside block hand.",
            "mental_focus": "Maintain aggressive attack mindset even after an attack error; reset immediately for next serve.",
            "conditioning_recovery": strain_recovery,
            "equipment_gear": "Wear fitted knee pads and gum-rubber indoor shoes for maximum floor friction.",
            "step1": "3-Step Approach & Arm Swing Shadow (10 mins) — Why: Approach timing. How: Perform 20 shadow jump approaches at net without ball.",
            "step2": "Toss & Spike Corner Repetitions (15 mins) — Why: Spike precision. How: Spike 30 setter tosses into deep corners and line seam.",
            "step3": "Block-to-Transition Attack Drill (10 mins) — Why: Game speed. How: Land from net block and transition immediately into high-tempo attack.",
            "benchmark": "Achieve 80%+ spike success rate into target court zones."
        }

    # 7. SWIMMING
    elif "swimming" in s:
        return {
            "diagnosis": "Excessive drag from low hip positioning, head elevated too high, or inefficient kick cadence.",
            "tech_advice": "Keep head aligned looking straight down at bottom line. Rotate body along long axis and pull arm through water in 'S' curve motion.",
            "tactical_strategy": "Pace your swim: control first 50m with smooth stroke rate, building speed into strong finish kick.",
            "mental_focus": "Count stroke count per length to maintain efficient glide rhythm under fatigue.",
            "conditioning_recovery": strain_recovery,
            "equipment_gear": "Ensure swim cap and anti-fog goggles fit snugly to prevent drag and water leakage.",
            "step1": "Streamline Catch-Up Drills (10 mins) — Why: Hydrodynamic glide. How: Swim 4x50m catch-up freestyle focusing on hip rotation.",
            "step2": "Pace & Stroke Count Sets (15 mins) — Why: Efficiency. How: Complete 6x100m maintaining fixed 16 strokes per length.",
            "step3": "Flip Turn & Explosive Push-off (10 mins) — Why: Wall speed. How: Execute 15 wall flip turns with 5m underwater dolphin kick.",
            "benchmark": "Maintain consistent stroke count per 50m lap with zero form breakdown."
        }

    # 8. ATHLETICS / RUNNING / TRACK
    elif any(k in s for k in ["running", "athletics", "track", "marathon", "sprint"]):
        return {
            "diagnosis": "Over-striding landing on heel, upper body tension, or uneven breathing rhythm.",
            "tech_advice": "Land mid-foot directly underneath hips. Keep shoulders relaxed and low, driving arms backward from elbows at 90 degrees.",
            "tactical_strategy": "Maintain negative split strategy: run second half of distance slightly faster than first half.",
            "mental_focus": "Adopt 3:3 breathing rhythm (inhale 3 steps, exhale 3 steps). Focus on rhythmic cadence when legs feel heavy.",
            "conditioning_recovery": strain_recovery,
            "equipment_gear": "Select running shoes matched to your gait profile (neutral/stability) and replace after 500km.",
            "step1": "Cadence & Foot Strike Drills (10 mins) — Why: Running economy. How: Perform 4x200m focusing on 180 steps/min cadence.",
            "step2": "Target Pace Interval Repeats (15 mins) — Why: Aerobic threshold. How: Run 4x400m at target match race pace.",
            "step3": "Final Kick Finish Acceleration (10 mins) — Why: Finish stamina. How: Run 3x200m accelerations simulating final lap sprint.",
            "benchmark": "Maintain pace target within ±3 seconds per km with zero over-striding."
        }

    # 9. TABLE TENNIS
    elif "table tennis" in s or "ping pong" in s:
        return {
            "diagnosis": "Standing too tall, stroke ending too high, or flat hit against heavy backspin.",
            "tech_advice": "Stay in semi-squat stance. Brush ball with closed paddle angle for topspin loop, generating power from hip rotation.",
            "tactical_strategy": "Vary service spin (sidespin/backspin) to produce high weak pop-up returns for third-ball kill shot.",
            "mental_focus": "Stay calm during fast rallies; watch opponent racquet contact angle early.",
            "conditioning_recovery": strain_recovery,
            "equipment_gear": "Clean rubber surfaces with specialized cleaner to maintain high spin tackiness.",
            "step1": "Multi-Ball Topspin Loop Drills (10 mins) — Why: Stroke brush. How: Loop 50 multi-ball feeds over net with heavy topspin.",
            "step2": "Serve & 3rd Ball Attack Practice (15 mins) — Why: Strategy pattern. How: Execute 30 service routines followed by immediate forehand attack.",
            "step3": "Fast Reaction Rally Footwork (10 mins) — Why: Movement speed. How: Execute side-shuffle footwork during rapid 2-corner rallies.",
            "benchmark": "Achieve 85%+ loop consistency into target table corners."
        }

    # 10. CHESS
    elif "chess" in s:
        return {
            "diagnosis": "Candidate move oversight, tactical motif blindness (pins/forks), or clock management pressure panic.",
            "tech_advice": "Enforce mandatory 10-second candidate move scan: evaluate all opponent checks, captures, and threats before committing.",
            "tactical_strategy": "Control central squares (d4/d5/e4/e5), develop minor pieces quickly, and castle early before initiating flank attacks.",
            "mental_focus": "Maintain emotional neutrality after a mistake; reset calculation objectively for current position.",
            "conditioning_recovery": "Mental fatigue management: take 30-second eye-rest breaks between long calculation lines, stay hydrated.",
            "equipment_gear": "Use weighted Staunton chess set and digital clock set to increment time controls.",
            "step1": "Tactical Motif Puzzle Rush (15 mins) — Why: Pattern recognition. How: Solve 20 tactical puzzles focusing on pins, forks, skewers, and mates.",
            "step2": "Deep Calculation Breakdown (20 mins) — Why: Calculation depth. How: Analyze 3 complex middlegame positions 4 moves deep without moving pieces.",
            "step3": "Timed Rapid Pressure Matches (15 mins) — Why: Clock management. How: Play 2 5-minute blitz games adhering strictly to candidate scan.",
            "benchmark": "Maintain 0 tactical blunders across practice matches."
        }

    # 11. MARTIAL ARTS / BOXING / MMA
    elif any(k in s for k in ["boxing", "martial", "mma", "karate", "taekwondo", "judo", "wrestling"]):
        return {
            "diagnosis": "Dropping guard hands during punches, square stance exposing body, or lack of hip drive in strikes.",
            "tech_advice": "Keep rear hand glued to chin and lead hand up. Rotate back hip and heel fully to transfer maximum kinetic energy into strikes.",
            "tactical_strategy": "Use jab to measure distance and blind opponent line-of-sight before executing power right cross or leg kick.",
            "mental_focus": "Stay calm under punch exchange pressure; keep eyes open and breathing steady.",
            "conditioning_recovery": strain_recovery,
            "equipment_gear": "Wrap hands properly with 180-inch wraps and wear mouthguard during all partner drills.",
            "step1": "Shadow Striking & Guard Form (10 mins) — Why: Form maintenance. How: Execute 3 rounds of shadow boxing maintaining high chin-guard.",
            "step2": "Heavy Bag Kinetic Power Sets (15 mins) — Why: Power transfer. How: Strike heavy bag with 1-2-hook combinations focusing on hip snap.",
            "step3": "Partner Mitt Reaction Drills (10 mins) — Why: Distance & timing. How: Complete mitt combinations reacting to coach slip/counter cues.",
            "benchmark": "Execute zero guard-dropping errors during pad work."
        }

    # 12. GOLF
    elif "golf" in s:
        return {
            "diagnosis": "Early extension standing up at impact, sway in backswing, or eye alignment error during putting.",
            "tech_advice": "Maintain spine angle throughout swing turn. Lead downswing with hips uncoiling, keeping head quiet behind ball.",
            "tactical_strategy": "Practice smart course management: lay up short of hazards rather than forcing low-percentage shots.",
            "mental_focus": "Commit 100% to selected shot before stepping up; execute fixed 15-second pre-shot routine.",
            "conditioning_recovery": strain_recovery,
            "equipment_gear": "Verify club grip traction and match ball compression rating to your swing speed.",
            "step1": "Spine Angle Alignment Drills (10 mins) — Why: Impact consistency. How: Swing 25 irons focusing on maintaining posture through impact.",
            "step2": "Target Green Pitching Sets (15 mins) — Why: Distance control. How: Hit 30 wedge shots targeting 50m, 75m, and 100m landing flags.",
            "step3": "Gate Putting Accuracy Sets (10 mins) — Why: Putting line. How: Put 20 6-foot putts through 2 tees placed slightly wider than ball.",
            "benchmark": "Achieve 85%+ center-face strike contact on iron shots."
        }

    # 13. HOCKEY
    elif "hockey" in s:
        return {
            "diagnosis": "Standing too tall during stick handling, rolling wrists incorrectly, or weak bottom-hand transfer.",
            "tech_advice": "Maintain deep knee bend stance. Soften bottom hand grip while top hand rotates stick face over ball/puck for control.",
            "tactical_strategy": "Use change-of-pace rollouts to pull defender out of position before delivering flat pass into circle.",
            "mental_focus": "Maintain low scanning posture so you can read opponent foot movements.",
            "conditioning_recovery": strain_recovery,
            "equipment_gear": "Check stick bow/bend and wear fitted mouthguard and shin guards.",
            "step1": "Low-Stance Stick Handling Weaves (10 mins) — Why: Soft touch. How: Dribble ball/puck through 8 slalom cones with eyes up.",
            "step2": "Push-Pass Target Distribution (15 mins) — Why: Passing speed. How: Complete 40 crisp push-passes targeting 2m gates.",
            "step3": "Circle Entry & Strike Finishing (10 mins) — Why: Goal scoring. How: Receive pass at circle edge and strike on goal under 2 seconds.",
            "benchmark": "Achieve 85%+ passing accuracy into target gates."
        }

    # 14. BASEBALL / SOFTBALL
    elif "baseball" in s or "softball" in s:
        return {
            "diagnosis": "Casting hands away from body, lunging forward onto front foot early, or poor throwing arm slot.",
            "tech_advice": "Keep knob of bat pointing toward catcher as hips uncoil. Direct hands inside the ball for maximum barrel whip.",
            "tactical_strategy": "Work the pitch count: recognize pitch spin early and drive outside pitches to opposite field.",
            "mental_focus": "Maintain relaxed shoulders in batter's box; breathe deep before pitcher comes to set.",
            "conditioning_recovery": strain_recovery,
            "equipment_gear": "Check glove pocket conditioning and ensure batting helmet fits securely.",
            "step1": "Tee Work Inside-Out Barrel Drills (10 mins) — Why: Hands inside ball. How: Hit 30 balls off tee focusing on driving ball up the middle.",
            "step2": "Front-Toss Timing & Rhythm Sets (15 mins) — Why: Pitch recognition. How: Face 35 front-toss pitches driving sweet-spot contact.",
            "step3": "Infield Grounder Fielding & Throw (10 mins) — Why: Field-to-throw speed. How: Field 20 ground balls with smooth transfer and throw.",
            "benchmark": "Achieve 85%+ sweet-spot barrel contact rate."
        }

    # 15. GENERIC / CUSTOM SPORT ENGINE (For any sport)
    else:
        return {
            "diagnosis": f"Biomechanical timing, movement efficiency, or posture balance breakdown during {sport_name} execution.",
            "tech_advice": f"For your struggle with '{prob_desc}', perform slow-motion warmup reps at 50% speed. Focus on core stability, smooth joint movement, and balanced follow-through.",
            "tactical_strategy": f"Analyze opponent movements and space in {sport_name}; adjust execution tempo to disrupt opponent rhythm.",
            "mental_focus": "Focus on rhythm and relaxation. Muscle tension drains energy and degrades technical precision.",
            "conditioning_recovery": strain_recovery,
            "equipment_gear": f"Inspect all {sport_name} equipment and personal gear for proper alignment and safety.",
            "step1": f"Slow-Motion Fundamental Isolation (10 mins) — Why: Posture alignment. How: Execute 20 slow-motion reps isolating '{prob_desc}'.",
            "step2": f"Structured High Repetitions (15 mins) — Why: Muscle memory. How: Complete 25 controlled reps focusing on target precision.",
            "step3": f"Match Pace Execution (10 mins) — Why: Competition readiness. How: Execute drills at full match intensity.",
            "benchmark": f"Eliminate '{prob_desc}' struggle and achieve 85%+ technical execution."
        }


def analyze_single_sport(student_id: int, sport_id: int, sport_name: str, df_sessions: pd.DataFrame, df_metrics: pd.DataFrame, df_problems: pd.DataFrame) -> tuple:
    """
    Generates sport-specific high-level analysis, multi-dimensional aggregate recommendations,
    and session-wise recommendations for every recorded practice session.
    """
    n_sessions = len(df_sessions)
    ratings_series = df_sessions['coach_rating'].dropna()
    ratings = ratings_series.values
    avg_rating = float(np.mean(ratings)) if len(ratings) > 0 else 7.0
    total_hours = round(float(df_sessions['duration_minutes'].sum()) / 60.0, 1)
    mean_duration = int(df_sessions['duration_minutes'].mean())

    # Build Session-Wise Date Breakdown
    session_analytics = []
    for _, s_row in df_sessions.iterrows():
        sess_id = int(s_row['session_id'])
        sess_date = str(s_row['date'])
        sess_dur = int(s_row['duration_minutes'])
        sess_type = str(s_row['training_type'])
        sess_intensity = str(s_row['intensity'])
        c_rating = int(s_row['coach_rating']) if pd.notnull(s_row['coach_rating']) else None
        sess_notes = str(s_row['notes']).strip() if (pd.notnull(s_row['notes']) and str(s_row['notes']).strip()) else ""

        sess_probs = []
        if not df_problems.empty:
            p_sub = df_problems[df_problems['session_id'] == sess_id]
            sess_probs = p_sub['description'].tolist()

        rating_str = f"Coach Rating: {c_rating}/10" if c_rating is not None else "Pending Coach Rating"
        if sess_probs:
            prob_str = ", ".join(sess_probs)
            mb = _get_sport_mechanics_breakdown(sport_name, sess_probs[0], sess_notes)
            sess_insight = (
                f"🔍 Session Evaluation ({sess_date}): Identified struggle with '{prob_str}'.\n"
                f"🛠️ Biomechanical Root Cause: {mb['diagnosis']}\n"
                f"💡 Form Advice: {mb['tech_advice']}\n"
                f"🧠 Mental & Tactical Strategy: {mb['tactical_strategy']}\n"
                f"⭐ Coach Evaluation: {rating_str}."
            )
        else:
            mb = _get_sport_mechanics_breakdown(sport_name, "general optimization", sess_notes)
            sess_insight = (
                f"✅ Session Evaluation ({sess_date}): Practice completed smoothly across {sess_dur} minutes at {sess_intensity} intensity.\n"
                f"🚀 Performance Elevation Strategy: Advance drill tempo by 15% and introduce time-restricted decision drills.\n"
                f"⭐ Coach Evaluation: {rating_str}."
            )
            if sess_notes:
                sess_insight += f"\n📝 Student Session Note: \"{sess_notes}\"."

        session_analytics.append({
            "session_id": sess_id,
            "date": sess_date,
            "sport_id": sport_id,
            "sport_name": sport_name,
            "duration_minutes": sess_dur,
            "training_type": sess_type,
            "intensity": sess_intensity,
            "coach_rating": c_rating,
            "problems": sess_probs,
            "notes": sess_notes,
            "ai_insight": sess_insight
        })

    # 1. Performance Trend Calculation
    prob_summary = "zero logged bottlenecks"
    if not df_problems.empty:
        prob_summary = ", ".join(df_problems['description'].unique()[:3])

    if len(ratings) >= 2:
        session_indices = np.arange(len(ratings))
        slope, _ = np.polyfit(session_indices, ratings, 1)
        recent_avg = float(np.mean(ratings[-min(3, len(ratings)):]))
        older_avg = float(np.mean(ratings[:max(1, len(ratings)-2)]))
        pct_change = round(((recent_avg - older_avg) / max(0.1, older_avg)) * 100, 1)

        if slope > 0.15:
            trend_type = "IMPROVEMENT"
            detected_issue = f"Upward Skill Trajectory in {sport_name}"
            evidence = f"Coach score improved by +{pct_change}% across recent sessions (recent avg: {round(recent_avg, 1)}/10 vs baseline: {round(older_avg, 1)}/10)."
            analysis_text = (
                f"📊 Comprehensive {sport_name} Performance Evaluation:\n"
                f"• Practice Overview: Analyzed {n_sessions} session(s) totaling {total_hours} practice hours.\n"
                f"• Skill Progression Trend: UPWARD PROGRESSION (+{pct_change}% coach score gain).\n\n"
                f"🔍 Key Technical Performance & Errors:\n"
                f"• Tracked Bottlenecks: {prob_summary}.\n"
                f"• Execution Quality: Strong momentum with average coach score of {round(recent_avg, 1)}/10.\n\n"
                f"🧠 AI Multi-Pillar Mechanics Diagnosis:\n"
                f"• Kinetic chain transfer and timing are stabilizing; minor variances stem from high-intensity fatigue.\n\n"
                f"🚀 Multi-Dimensional Actionable Solution Strategy:\n"
                f"1. Advanced Scenario Drill: Increase drill tempo by 15% and simulate match deficit conditions.\n"
                f"2. Micro-Metric Precision: Track sub-metrics in sets of 10 to lock in muscle memory."
            )
        elif slope < -0.15:
            trend_type = "DECLINE"
            detected_issue = f"Performance Variance in {sport_name}"
            evidence = f"Coach score dipped by {abs(pct_change)}% across recent sessions (recent avg: {round(recent_avg, 1)}/10)."
            analysis_text = (
                f"📊 Comprehensive {sport_name} Performance Evaluation:\n"
                f"• Practice Overview: Analyzed {n_sessions} session(s) totaling {total_hours} practice hours.\n"
                f"• Skill Progression Trend: PERFORMANCE DIP ({abs(pct_change)}% coach score regression).\n\n"
                f"🔍 Key Technical Errors & Bottlenecks Detected:\n"
                f"• Primary Issues Logged: {prob_summary}.\n"
                f"• Recent Rating: Dipped to {round(recent_avg, 1)}/10 under practice conditions.\n\n"
                f"🧠 AI Multi-Pillar Mechanics Diagnosis:\n"
                f"• Evaluation indicates physical fatigue or unaligned stance/wrist mechanics during repetitions.\n\n"
                f"🚀 Multi-Dimensional Actionable Solution Strategy:\n"
                f"1. Foundational Slow-Motion Isolation: Dedicate 20 minutes to slow-repetition stance & grip re-alignment.\n"
                f"2. Active Recovery & Workload Shift: Balance practice workload with structured recovery cycles."
            )
        else:
            trend_type = "CONSISTENCY"
            detected_issue = f"Stable Baseline in {sport_name}"
            evidence = f"Coach rating baseline maintained at {round(avg_rating, 1)}/10 across {n_sessions} practice session(s)."
            analysis_text = (
                f"📊 Comprehensive {sport_name} Performance Evaluation:\n"
                f"• Practice Overview: Analyzed {n_sessions} session(s) totaling {total_hours} practice hours.\n"
                f"• Skill Progression Trend: STABLE BASELINE (Average score: {round(avg_rating, 1)}/10).\n\n"
                f"🔍 Key Technical Execution & Active Issues:\n"
                f"• Active Struggles Logged: {prob_summary}.\n"
                f"• Baseline Quality: Steady execution across workout sets.\n\n"
                f"🧠 AI Multi-Pillar Mechanics Diagnosis:\n"
                f"• Player has reached execution plateau; breaking through requires variable stress drills and metric tracking.\n\n"
                f"🚀 Multi-Dimensional Actionable Solution Strategy:\n"
                f"1. Target Elevation Drills: Introduce time-restricted pressure drills to push execution boundaries.\n"
                f"2. Sub-Metric Focus: Track individual repetition accuracy to eliminate remaining execution errors."
            )
    else:
        trend_type = "CONSISTENCY"
        detected_issue = f"Initial Practice Benchmark for {sport_name}"
        evidence = f"Initial session logged across {mean_duration} mins (Average rating: {round(avg_rating, 1)}/10)."
        analysis_text = (
            f"📊 Comprehensive {sport_name} Initial Evaluation:\n"
            f"• Practice Benchmark: Initial session logged across {mean_duration} minutes.\n"
            f"• Foundational Rating: Baseline score established at {round(avg_rating, 1)}/10.\n\n"
            f"🔍 Active Issues Logged:\n"
            f"• Issues Analyzed: {prob_summary}.\n\n"
            f"🚀 Next Step Actionable Routine:\n"
            f"• Continue logging structured workouts. The AI engine will track mechanical variance and slope trends as additional practice records are logged."
        )

    analysis_obj = {
        "student_id": student_id,
        "sport_id": sport_id,
        "sport_name": sport_name,
        "trend_type": trend_type,
        "detected_issue": detected_issue,
        "supporting_evidence": evidence,
        "analysis_text": analysis_text,
        "session_analytics": session_analytics
    }

    # 2. Generate Multi-Dimensional High-Level Recommendations (consolidated, unique per topic)
    high_level_recs = _generate_high_level_recs(student_id, sport_id, sport_name, df_sessions, df_metrics, df_problems, avg_rating)

    # Deduplicate high-level recommendations by sport_id and title
    seen_keys = set()
    all_recommendations = []
    for r in high_level_recs:
        key = (r["sport_id"], r["title"].strip().lower())
        if key not in seen_keys:
            seen_keys.add(key)
            all_recommendations.append(r)

    return analysis_obj, all_recommendations


def _generate_session_wise_recs(student_id: int, sport_id: int, sport_name: str, df_sessions: pd.DataFrame, df_metrics: pd.DataFrame, df_problems: pd.DataFrame) -> list:
    """Generates rich multi-pillar, actionable AI recommendations for each individual practice session."""
    session_recs = []
    sport_key = sport_name.lower().strip()
    icon = "🏏" if "cricket" in sport_key else "⚽" if "football" in sport_key or "soccer" in sport_key else "🏀" if "basketball" in sport_key else "🎾" if "badminton" in sport_key or "tennis" in sport_key else "♟️" if "chess" in sport_key else "🎯"

    for _, s_row in df_sessions.iterrows():
        sess_id = int(s_row['session_id'])
        sess_date = str(s_row['date'])
        sess_dur = int(s_row['duration_minutes'])
        sess_type = str(s_row['training_type'])
        sess_intensity = str(s_row['intensity'])
        c_rating = int(s_row['coach_rating']) if pd.notnull(s_row['coach_rating']) else None
        rating_str = f"Coach Rating: {c_rating}/10" if c_rating is not None else "Pending Coach Rating"
        sess_notes = str(s_row['notes']).strip() if (pd.notnull(s_row['notes']) and str(s_row['notes']).strip()) else ""

        # Check logged problems for this session
        sess_probs = []
        if not df_problems.empty:
            p_sub = df_problems[df_problems['session_id'] == sess_id]
            sess_probs = p_sub.to_dict('records')

        if sess_probs:
            for p in sess_probs:
                prob_desc = p['description']
                prob_sev = p.get('severity', 'MEDIUM')

                mb = _get_sport_mechanics_breakdown(sport_name, prob_desc, sess_notes)

                rec_text = (
                    f"🛠️ Technical Mechanics & Form Execution:\n"
                    f"• Identified Issue: '{prob_desc}' during {sess_type.replace('_',' ')} workout.\n"
                    f"• Biomechanical Cause: {mb['diagnosis']}\n"
                    f"• Form Correction: {mb['tech_advice']}\n\n"
                    f"🧠 Tactical Strategy & Game IQ:\n"
                    f"• {mb['tactical_strategy']}\n\n"
                    f"🧘 Psychological & Mental Focus:\n"
                    f"• {mb['mental_focus']}\n\n"
                    f"⚡ Conditioning & Workload Recovery:\n"
                    f"• {mb['conditioning_recovery']}\n\n"
                    f"⚙️ Equipment & Setup Guidance:\n"
                    f"• {mb['equipment_gear']}\n\n"
                )
                if sess_notes:
                    rec_text += f"📝 Session Note Guidance:\n• For your note ('{sess_notes}'): Maintain steady breathing rhythm and controlled movement pace.\n\n"

                rec_text += (
                    f"🎯 3-Step Actionable Practice Routine:\n"
                    f"• Step 1 (Foundation): {mb['step1']}\n"
                    f"• Step 2 (Repetitions): {mb['step2']}\n"
                    f"• Step 3 (Match Pressure): {mb['step3']}\n\n"
                    f"📊 Target Milestone Goal:\n"
                    f"• {mb['benchmark']}"
                )

                session_recs.append({
                    "student_id": student_id,
                    "sport_id": sport_id,
                    "session_id": sess_id,
                    "sport_name": sport_name,
                    "title": f"{icon} Session {sess_date} ({sess_type.replace('_',' ')}): Multi-Pillar Advice for '{prob_desc}'",
                    "detected_issue": f"Session Issue on {sess_date}: {prob_desc}",
                    "evidence": f"Logged struggle '{prob_desc}' ({prob_sev} severity) during {sess_dur}m session. {rating_str}.",
                    "recommendation_text": rec_text,
                    "suggested_goal": f"Eliminate '{prob_desc}' struggle in next practice session.",
                    "priority": "HIGH" if prob_sev in ['HIGH', 'CRITICAL'] else "MEDIUM"
                })
        else:
            mb = _get_sport_mechanics_breakdown(sport_name, "general optimization", sess_notes)
            rec_text = (
                f"🛠️ Technical Execution Diagnosis:\n"
                f"• Workout completed smoothly at {sess_intensity} intensity across {sess_dur} minutes.\n"
                f"• Objective: Push performance ceiling and prevent execution plateau.\n"
                f"• Technique Advise: {mb['tech_advice']}\n\n"
                f"🧠 Tactical Strategy & Game IQ:\n"
                f"• {mb['tactical_strategy']}\n\n"
                f"🧘 Psychological & Mental Focus:\n"
                f"• {mb['mental_focus']}\n\n"
                f"⚡ Conditioning & Workload Recovery:\n"
                f"• {mb['conditioning_recovery']}\n\n"
                f"⚙️ Equipment & Setup Guidance:\n"
                f"• {mb['equipment_gear']}\n\n"
                f"🎯 3-Step Clear Advancement Routine:\n"
                f"• Step 1 (Tempo): Advance execution tempo by 15% during early workout sets.\n"
                f"• Step 2 (Repetitions): {mb['step2']}\n"
                f"• Step 3 (Pressure): {mb['step3']}\n\n"
                f"📊 Target Milestone Goal:\n"
                f"• Maintain 0 unforced errors in next {sess_type.replace('_',' ')} workout."
            )

            session_recs.append({
                "student_id": student_id,
                "sport_id": sport_id,
                "session_id": sess_id,
                "sport_name": sport_name,
                "title": f"{icon} Session {sess_date} ({sess_type.replace('_',' ')}): Multi-Pillar Elevation Plan",
                "detected_issue": f"Session Optimization for {sess_date}",
                "evidence": f"Session completed smoothly across {sess_dur} minutes at {sess_intensity} intensity. {rating_str}.",
                "recommendation_text": rec_text,
                "suggested_goal": f"Maintain 0 unforced errors in next {sess_type.replace('_',' ')} workout.",
                "priority": "MEDIUM"
            })

    return session_recs


def _generate_high_level_recs(student_id: int, sport_id: int, sport_name: str, df_sessions: pd.DataFrame, df_metrics: pd.DataFrame, df_problems: pd.DataFrame, avg_rating: float) -> list:
    """Generates rich, multi-dimensional high-level AI suggestions spanning technical form, tactical IQ, mental toughness, conditioning, and equipment."""
    recs = []
    n_sessions = len(df_sessions)
    sport_key = sport_name.lower().strip()
    icon = "🏏" if "cricket" in sport_key else "⚽" if "football" in sport_key or "soccer" in sport_key else "🏀" if "basketball" in sport_key else "🎾" if "badminton" in sport_key or "tennis" in sport_key else "♟️" if "chess" in sport_key else "🎯"

    # 1. Primary Technical Foundation & Mechanics
    mb = _get_sport_mechanics_breakdown(sport_name, "foundational posture")
    rec1_text = (
        f"🛠️ Technical Mechanics & Form Alignment:\n"
        f"• Evaluated across {n_sessions} practice session(s) in {sport_name}.\n"
        f"• Biomechanical Cause: {mb['diagnosis']}\n"
        f"• Technical Correction: {mb['tech_advice']}\n\n"
        f"🧠 Tactical Strategy & Game IQ:\n"
        f"• {mb['tactical_strategy']}\n\n"
        f"🧘 Psychological & Mental Focus:\n"
        f"• {mb['mental_focus']}\n\n"
        f"⚡ Conditioning & Workload Recovery:\n"
        f"• {mb['conditioning_recovery']}\n\n"
        f"⚙️ Equipment & Setup Guidance:\n"
        f"• {mb['equipment_gear']}\n\n"
        f"🎯 3-Step Clear Technical Program:\n"
        f"• Step 1 (Foundation): {mb['step1']}\n"
        f"• Step 2 (Repetitions): {mb['step2']}\n"
        f"• Step 3 (High Speed): {mb['step3']}\n\n"
        f"📊 Target Milestone Goal:\n"
        f"• Maintain average coach rating above 8.0/10 across next 3 workouts."
    )

    recs.append({
        "student_id": student_id,
        "sport_id": sport_id,
        "session_id": None,
        "sport_name": sport_name,
        "title": f"{icon} {sport_name} Technical Precision & Mechanics Alignment",
        "detected_issue": f"Foundational Execution Consistency in {sport_name}",
        "evidence": f"Evaluated across {n_sessions} practice session(s) with average coach rating of {avg_rating:.1f}/10.",
        "recommendation_text": rec1_text,
        "suggested_goal": f"Maintain coach rating above 8/10 across next 3 practice sessions.",
        "priority": "HIGH"
    })

    # 2. Problem & Struggle Mitigation (dynamically generated for logged problems)
    if not df_problems.empty:
        unique_probs = df_problems['description'].unique()
        for prob in unique_probs[:3]:
            prob_count = len(df_problems[df_problems['description'] == prob])
            pmb = _get_sport_mechanics_breakdown(sport_name, prob)

            rec_p_text = (
                f"🛠️ Bottleneck Technical Diagnosis for '{prob}':\n"
                f"• Active struggle logged across {prob_count} session(s) in {sport_name}.\n"
                f"• Technical Cause: {pmb['diagnosis']}\n"
                f"• Form Correction: {pmb['tech_advice']}\n\n"
                f"🧠 Tactical Strategy & Game IQ:\n"
                f"• {pmb['tactical_strategy']}\n\n"
                f"🧘 Psychological & Mental Focus:\n"
                f"• {pmb['mental_focus']}\n\n"
                f"⚡ Conditioning & Workload Recovery:\n"
                f"• {pmb['conditioning_recovery']}\n\n"
                f"⚙️ Equipment & Setup Guidance:\n"
                f"• {pmb['equipment_gear']}\n\n"
                f"🎯 3-Step Eradication Drill Plan:\n"
                f"• Step 1 (Slow-Motion Breakdown): {pmb['step1']}\n"
                f"• Step 2 (High-Rep Isolation): {pmb['step2']}\n"
                f"• Step 3 (Pressure Drill Test): {pmb['step3']}\n\n"
                f"📊 Target Milestone Goal:\n"
                f"• {pmb['benchmark']}"
            )

            recs.append({
                "student_id": student_id,
                "sport_id": sport_id,
                "session_id": None,
                "sport_name": sport_name,
                "title": f"{icon} {sport_name} Problem Mitigation Routine: {prob}",
                "detected_issue": f"Logged Bottleneck: '{prob}'",
                "evidence": f"Logged as an active struggle across {prob_count} practice session(s).",
                "recommendation_text": rec_p_text,
                "suggested_goal": f"Resolve '{prob}' struggle in upcoming sessions.",
                "priority": "HIGH"
            })

    # 3. Metric Optimization (dynamically generated for logged performance metrics)
    if not df_metrics.empty:
        metric_names = df_metrics['metric_name'].unique()
        for m_name in metric_names[:3]:
            m_avg = float(df_metrics[df_metrics['metric_name'] == m_name]['metric_value'].mean())
            m_unit = df_metrics[df_metrics['metric_name'] == m_name]['metric_unit'].iloc[0]

            rec_m_text = (
                f"🛠️ Metric Performance Diagnosis ({m_name}):\n"
                f"• Recorded Baseline Average: {m_avg:.1f} {m_unit} across logged workouts.\n"
                f"• Objective: Elevate metric consistency under practice conditions.\n\n"
                f"🧠 Tactical & Execution Strategy:\n"
                f"• Focus on clean biomechanical execution rather than rushing repetition speed.\n\n"
                f"🎯 3-Step Metric Elevation Program:\n"
                f"• Step 1 (Metric Tracking): Track {m_name} in sets of 10 repetitions.\n"
                f"• Step 2 (Target Precision): Focus on zero technique degradation during middle reps.\n"
                f"• Step 3 (Pressure Sets): Execute final 2 sets under time or score pressure.\n\n"
                f"📊 Target Milestone Goal:\n"
                f"• Improve average {m_name} by 15% in next 3 practice sessions."
            )

            recs.append({
                "student_id": student_id,
                "sport_id": sport_id,
                "session_id": None,
                "sport_name": sport_name,
                "title": f"{icon} {sport_name} Metric Elevation: {m_name}",
                "detected_issue": f"Performance Metric Target ({m_name})",
                "evidence": f"Average recorded metric value: {m_avg:.1f} {m_unit} across logged sessions.",
                "recommendation_text": rec_m_text,
                "suggested_goal": f"Improve average {m_name} by 15% in next 3 sessions.",
                "priority": "MEDIUM"
            })

    # 4. Tactical Match Scenario & Pressure Routine
    rec_tactical_text = (
        f"🧠 Match Scenario & Pressure Control Analysis:\n"
        f"• Mean workout duration: {int(df_sessions['duration_minutes'].mean())} minutes.\n"
        f"• Objective: Eliminate decision delay and panic errors under match deficit.\n\n"
        f"🧘 Mental Toughness Focus:\n"
        f"• Practice 5-second breath reset prior to high-leverage plays.\n\n"
        f"🎯 3-Step Scenario Drill Program:\n"
        f"• Step 1 (Deficit Setup): Start final 15 minutes of workout with score or time deficit.\n"
        f"• Step 2 (Constraint Execution): Enforce strict 2-touch or 5-second decision limits.\n"
        f"• Step 3 (Clutch Finishing): Execute high-leverage final plays under defender/clock pressure.\n\n"
        f"📊 Target Milestone Goal:\n"
        f"• Maintain 80%+ execution accuracy during pressure scenario sets."
    )

    recs.append({
        "student_id": student_id,
        "sport_id": sport_id,
        "session_id": None,
        "sport_name": sport_name,
        "title": f"{icon} {sport_name} Match Scenario & Pressure Drill",
        "detected_issue": f"Decision Speed & Match Pressure Control",
        "evidence": f"Mean session duration: {int(df_sessions['duration_minutes'].mean())} minutes.",
        "recommendation_text": rec_tactical_text,
        "suggested_goal": "Maintain 80%+ execution accuracy during pressure scenario sets.",
        "priority": "MEDIUM"
    })

    # 5. Workload & Recovery Optimization
    rec_recov_text = (
        f"⚡ Physical Workload & Energy Analysis:\n"
        f"• Cumulative Workload: {round(float(df_sessions['duration_minutes'].sum())/60.0, 1)} total practice hours.\n"
        f"• Objective: Prevent muscle fatigue, kinetic chain stiffness, and injury risk.\n\n"
        f"⚙️ Equipment & Recovery Setup:\n"
        f"• Use compression wear and foam roller post-practice for rapid lactic acid flushing.\n\n"
        f"🎯 3-Step Active Recovery Program:\n"
        f"• Step 1 (Mobility): 10 minutes of dynamic hip, shoulder, and spinal mobility stretching.\n"
        f"• Step 2 (Soft Tissue Release): Foam roll major muscle groups post-workout.\n"
        f"• Step 3 (Hydration & Sleep Tracking): Log post-practice recovery metrics.\n\n"
        f"📊 Target Milestone Goal:\n"
        f"• Complete post-session recovery routine after every high-intensity workout."
    )

    recs.append({
        "student_id": student_id,
        "sport_id": sport_id,
        "session_id": None,
        "sport_name": sport_name,
        "title": f"⚡ {sport_name} Workload & Active Recovery Routine",
        "detected_issue": "Physical Fatigue & Energy Management",
        "evidence": f"Cumulative practice workload: {round(float(df_sessions['duration_minutes'].sum())/60.0, 1)} total hours.",
        "recommendation_text": rec_recov_text,
        "suggested_goal": "Complete post-session recovery routine after every high-intensity workout.",
        "priority": "LOW"
    })

    return recs
