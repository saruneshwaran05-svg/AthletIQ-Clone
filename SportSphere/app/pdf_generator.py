from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from app.database import db_session

def generate_student_report_pdf(student_id: int) -> BytesIO:
    """
    Generates a PDF performance report strictly from real user data.
    If no data exists, raises ValueError.
    """
    with db_session() as conn:
        cursor = conn.cursor()
        
        # Student info
        cursor.execute("SELECT name, email, preferred_sport, created_at FROM users WHERE user_id = ?", (student_id,))
        student = cursor.fetchone()
        if not student:
            raise ValueError("Student profile not found.")
        student = dict(student)
        
        # Practice sessions
        cursor.execute("""
            SELECT ps.date, s.name as sport_name, ps.duration_minutes, ps.intensity, 
                   ps.training_type, ps.coach_rating, ps.notes
            FROM practice_sessions ps
            JOIN sports s ON ps.sport_id = s.sport_id
            WHERE ps.student_id = ?
            ORDER BY ps.date DESC
        """, (student_id,))
        sessions = [dict(r) for r in cursor.fetchall()]
        
        if not sessions:
            raise ValueError("Report cannot be generated because no performance data is available.")
            
        # AI Recommendations
        cursor.execute("""
            SELECT ar.title, ar.detected_issue, ar.evidence, ar.recommendation_text, ar.suggested_goal, s.name as sport_name
            FROM ai_recommendations ar
            JOIN sports s ON ar.sport_id = s.sport_id
            WHERE ar.student_id = ?
            ORDER BY ar.created_at DESC LIMIT 5
        """, (student_id,))
        ai_recs = [dict(r) for r in cursor.fetchall()]

        # Coach Feedback
        cursor.execute("""
            SELECT cf.feedback_text, cf.recommended_drill, cf.observed_strength, cf.observed_weakness, 
                   u.name as coach_name, s.name as sport_name, cf.created_at
            FROM coach_feedback cf
            JOIN users u ON cf.coach_id = u.user_id
            JOIN sports s ON cf.sport_id = s.sport_id
            WHERE cf.student_id = ?
            ORDER BY cf.created_at DESC LIMIT 5
        """, (student_id,))
        coach_feedbacks = [dict(r) for r in cursor.fetchall()]

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=22,
        textColor=colors.HexColor('#1E3A8A'),
        spaceAfter=6
    )
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        textColor=colors.HexColor('#4B5563'),
        spaceAfter=12
    )
    section_style = ParagraphStyle(
        'DocSection',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=14,
        textColor=colors.HexColor('#1E3A8A'),
        spaceBefore=14,
        spaceAfter=8
    )
    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        textColor=colors.HexColor('#1F2937'),
        leading=12
    )
    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        textColor=colors.white
    )

    elements = []

    # Title Banner
    elements.append(Paragraph("AthletIQ — Student Performance Report", title_style))
    elements.append(Paragraph(f"<b>Student:</b> {student['name']} &nbsp;|&nbsp; <b>Email:</b> {student['email']} &nbsp;|&nbsp; <b>Primary Sport:</b> {student.get('preferred_sport') or 'Multi-Sport'}", subtitle_style))
    elements.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#2563EB'), spaceAfter=15))

    # Overview Metrics
    total_hours = round(sum(s['duration_minutes'] for s in sessions) / 60.0, 1)
    rated_sessions = [s['coach_rating'] for s in sessions if s['coach_rating'] is not None]
    avg_rating = round(sum(rated_sessions) / len(rated_sessions), 1) if rated_sessions else "N/A"
    sports_count = len(set(s['sport_name'] for s in sessions))

    summary_data = [
        [Paragraph("<b>Total Practice Hours</b>", body_style), Paragraph(f"<b>{total_hours} hrs</b>", body_style)],
        [Paragraph("<b>Practice Sessions Logged</b>", body_style), Paragraph(f"<b>{len(sessions)}</b>", body_style)],
        [Paragraph("<b>Average Coach Rating</b>", body_style), Paragraph(f"<b>{avg_rating}{' / 10' if avg_rating != 'N/A' else ''}</b>", body_style)],
        [Paragraph("<b>Active Sports Tracked</b>", body_style), Paragraph(f"<b>{sports_count}</b>", body_style)]
    ]
    t_summary = Table(summary_data, colWidths=[200, 300])
    t_summary.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F3F4F6')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E5E7EB')),
    ]))
    elements.append(t_summary)
    elements.append(Spacer(1, 15))

    # Practice History Table
    elements.append(Paragraph("Recent Practice Sessions", section_style))
    history_headers = [
        Paragraph("Date", table_header_style),
        Paragraph("Sport", table_header_style),
        Paragraph("Duration", table_header_style),
        Paragraph("Type", table_header_style),
        Paragraph("Coach Rating", table_header_style),
        Paragraph("Notes", table_header_style)
    ]
    history_rows = [history_headers]

    for s in sessions[:10]:
        c_rating_str = f"{s['coach_rating']}/10" if s['coach_rating'] is not None else "Unrated"
        history_rows.append([
            Paragraph(s['date'], body_style),
            Paragraph(s['sport_name'], body_style),
            Paragraph(f"{s['duration_minutes']}m", body_style),
            Paragraph(s['training_type'].replace('_', ' '), body_style),
            Paragraph(c_rating_str, body_style),
            Paragraph((s['notes'] or 'N/A')[:40], body_style)
        ])


    t_history = Table(history_rows, colWidths=[65, 80, 55, 85, 45, 210])
    t_history.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E3A8A')),
        ('PADDING', (0,0), (-1,-1), 5),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#D1D5DB')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#F9FAFB')]),
    ]))
    elements.append(t_history)
    elements.append(Spacer(1, 15))

    # AI Recommendations Section
    if ai_recs:
        elements.append(Paragraph("AI-Powered Practice Recommendations", section_style))
        for r in ai_recs:
            rec_text = f"<b>[{r['sport_name']}] {r['title']}</b><br/>" \
                       f"<i>Issue Detected:</i> {r['detected_issue']}<br/>" \
                       f"<i>Evidence:</i> {r['evidence']}<br/>" \
                       f"<i>Recommendation:</i> {r['recommendation_text']}<br/>" \
                       f"<i>Suggested Goal:</i> {r['suggested_goal'] or 'N/A'}"
            elements.append(Paragraph(rec_text, body_style))
            elements.append(Spacer(1, 6))

    # Coach Feedback Section
    if coach_feedbacks:
        elements.append(Paragraph("Coach Professional Feedback", section_style))
        for cf in coach_feedbacks:
            fb_text = f"<b>Coach {cf['coach_name']} ({cf['sport_name']})</b> — {cf['created_at'][:10]}<br/>" \
                      f"<i>Feedback:</i> {cf['feedback_text']}<br/>" \
                      f"<i>Recommended Drill:</i> {cf['recommended_drill'] or 'N/A'} ({cf.get('practice_duration_minutes', 20)} mins)"
            elements.append(Paragraph(fb_text, body_style))
            elements.append(Spacer(1, 6))

    doc.build(elements)
    buffer.seek(0)
    return buffer
