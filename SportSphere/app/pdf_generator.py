import re
from datetime import datetime
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from app.database import db_session


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute and print 'Page X of Y' 
    along with running header and footer branding on every page.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        page_width, page_height = letter
        margin = 36

        # Running Header (pages 2+)
        if self._pageNumber > 1:
            self.saveState()
            self.setStrokeColor(colors.HexColor('#CBD5E1'))
            self.setLineWidth(0.75)
            self.line(margin, page_height - 28, page_width - margin, page_height - 28)
            
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(colors.HexColor('#1E3A8A'))
            self.drawString(margin, page_height - 24, "AthletIQ — Student Performance & AI Analytics Report")
            
            self.setFont("Helvetica", 8)
            self.setFillColor(colors.HexColor('#64748B'))
            self.drawRightString(page_width - margin, page_height - 24, "CONFIDENTIAL & OFFICIAL")
            self.restoreState()

        # Running Footer (all pages)
        self.saveState()
        self.setStrokeColor(colors.HexColor('#E2E8F0'))
        self.setLineWidth(0.75)
        self.line(margin, 32, page_width - margin, 32)

        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor('#64748B'))
        self.drawString(margin, 20, "AthletIQ Platform — Verified Athletic Performance Data & AI Guidance")

        page_str = f"Page {self._pageNumber} of {page_count}"
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor('#334155'))
        self.drawRightString(page_width - margin, 20, page_str)
        self.restoreState()


def clean_text_for_pdf(text: str) -> str:
    """Removes unicode emojis and symbols that render as broken squares in standard ReportLab Helvetica."""
    if not text:
        return ""
    # Strip common emoji characters and variation selectors
    text = re.sub(r'[\U00010000-\U0010ffff]', '', text)
    text = re.sub(r'[\u2600-\u27BF]', '', text)
    text = re.sub(r'[\uFE00-\uFE0F]', '', text)
    text = re.sub(r'[■□▪▫▶►▼▲★☆]', '', text)
    return text.strip()


def format_ai_recommendation_for_pdf(rec_text: str) -> str:
    """
    Parses unformatted AI text containing bullets and headers into clean HTML for ReportLab Paragraphs.
    """
    if not rec_text:
        return ""
    
    cleaned = clean_text_for_pdf(rec_text)
    lines = [l.strip() for l in cleaned.split('\n') if l.strip()]
    formatted_blocks = []

    for line in lines:
        # Check if line looks like a header (e.g. ends with colon or contains keyword)
        if any(h in line for h in [
            'Technical Mechanics', 'Technical Execution', 'Bottleneck Technical', 
            'Tactical Strategy', 'Psychological', 'Mental Focus', 'Mental Toughness',
            'Conditioning & Workload', 'Physical Workload', 'Equipment & Setup',
            '3-Step', 'Eradication Drill', 'Advancement Routine', 'Scenario Drill',
            'Target Milestone Goal', 'Session Note Guidance'
        ]) and (line.endswith(':') or 'Routine:' in line or 'Program:' in line or 'Diagnosis:' in line):
            hdr = line.rstrip(':')
            formatted_blocks.append(f'<font color="#1E3A8A"><b>{hdr}</b></font>')
        elif line.startswith('•') or line.startswith('-') or line.startswith('*'):
            bullet_content = line.lstrip('•-* ').strip()
            formatted_blocks.append(f'&nbsp;&nbsp;&bull;&nbsp;{bullet_content}')
        elif re.match(r'^\d+\.', line):
            formatted_blocks.append(f'&nbsp;&nbsp;<b>{line[:2]}</b>&nbsp;{line[2:].strip()}')
        else:
            formatted_blocks.append(line)

    return '<br/>'.join(formatted_blocks)


def generate_student_report_pdf(student_id: int) -> BytesIO:
    """
    Generates a beautifully aligned, executive-ready PDF performance report from real user data.
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
            SELECT ar.title, ar.detected_issue, ar.evidence, ar.recommendation_text, ar.suggested_goal, 
                   ar.priority, s.name as sport_name, ar.created_at
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
    # Usable width = 612 - 72 = 540 pt
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=42
    )
    styles = getSampleStyleSheet()

    # --- TYPOGRAPHY STYLES ---
    title_brand_style = ParagraphStyle(
        'DocBrandTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#0F172A')
    )
    badge_style = ParagraphStyle(
        'DocBadge',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        alignment=2, # Right aligned
        textColor=colors.HexColor('#2563EB')
    )
    meta_label_style = ParagraphStyle(
        'DocMetaLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor('#64748B')
    )
    meta_value_style = ParagraphStyle(
        'DocMetaVal',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#1E293B')
    )
    section_heading_style = ParagraphStyle(
        'DocSectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        textColor=colors.HexColor('#0F172A'),
        spaceBefore=12,
        spaceAfter=6
    )
    kpi_number_style = ParagraphStyle(
        'KpiNumber',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=16,
        alignment=1, # Center
        textColor=colors.HexColor('#1E3A8A')
    )
    kpi_label_style = ParagraphStyle(
        'KpiLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9,
        alignment=1, # Center
        textColor=colors.HexColor('#64748B')
    )
    kpi_sub_style = ParagraphStyle(
        'KpiSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7,
        leading=8,
        alignment=1, # Center
        textColor=colors.HexColor('#94A3B8')
    )
    th_style = ParagraphStyle(
        'TableHeaderCell',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white
    )
    th_center_style = ParagraphStyle(
        'TableHeaderCenter',
        parent=th_style,
        alignment=1
    )
    td_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor('#334155')
    )
    td_bold_style = ParagraphStyle(
        'TableCellBold',
        parent=td_style,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor('#0F172A')
    )
    td_center_style = ParagraphStyle(
        'TableCellCenter',
        parent=td_style,
        alignment=1
    )
    td_notes_style = ParagraphStyle(
        'TableCellNotes',
        parent=td_style,
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor('#475569')
    )
    card_title_style = ParagraphStyle(
        'CardTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=12,
        textColor=colors.HexColor('#0F172A')
    )
    card_priority_style = ParagraphStyle(
        'CardPriority',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=10,
        alignment=2,
        textColor=colors.HexColor('#2563EB')
    )
    card_meta_style = ParagraphStyle(
        'CardMeta',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor('#334155')
    )
    card_body_style = ParagraphStyle(
        'CardBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor('#1E293B')
    )
    goal_callout_style = ParagraphStyle(
        'GoalCallout',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor('#065F46')
    )

    elements = []

    # =========================================================================
    # 1. HERO HEADER SECTION
    # =========================================================================
    now_str = datetime.now().strftime("%B %d, %Y • %I:%M %p")
    header_table_data = [
        [
            Paragraph("<b>AthletIQ</b> <font size=11 color='#2563EB'>| Student Performance & AI Analytics Report</font>", title_brand_style),
            Paragraph("<b>OFFICIAL PERFORMANCE DOSSIER</b><br/><font color='#64748B' size=7>VERIFIED METRICS ENGINE</font>", badge_style)
        ]
    ]
    t_header = Table(header_table_data, colWidths=[380, 160])
    t_header.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    elements.append(t_header)

    # Accent Divider
    elements.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#2563EB'), spaceAfter=8, spaceBefore=4))

    # Student Profile Information Box
    meta_rows = [
        [
            Paragraph("<b>Student Name:</b>", meta_label_style),
            Paragraph(student['name'], meta_value_style),
            Paragraph("<b>Generated On:</b>", meta_label_style),
            Paragraph(now_str, meta_value_style)
        ],
        [
            Paragraph("<b>Email Address:</b>", meta_label_style),
            Paragraph(student['email'], meta_value_style),
            Paragraph("<b>Primary Discipline:</b>", meta_label_style),
            Paragraph(student.get('preferred_sport') or 'Multi-Sport Athlete', meta_value_style)
        ]
    ]
    t_meta = Table(meta_rows, colWidths=[90, 180, 110, 160])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('BOX', (0,0), (-1,-1), 0.75, colors.HexColor('#E2E8F0')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#F1F5F9')),
        ('PADDING', (0,0), (-1,-1), 5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE')
    ]))
    elements.append(t_meta)
    elements.append(Spacer(1, 8))

    # =========================================================================
    # 2. EXECUTIVE KPI DASHBOARD (4 METRIC CARDS)
    # =========================================================================
    total_hours = round(sum(s['duration_minutes'] for s in sessions) / 60.0, 1)
    rated_sessions = [s['coach_rating'] for s in sessions if s['coach_rating'] is not None]
    avg_rating = round(sum(rated_sessions) / len(rated_sessions), 1) if rated_sessions else "N/A"
    min_rating = min(rated_sessions) if rated_sessions else "N/A"
    max_rating = max(rated_sessions) if rated_sessions else "N/A"
    sports_count = len(set(s['sport_name'] for s in sessions))

    kpi_data = [
        [
            Paragraph("TOTAL WORKLOAD", kpi_label_style),
            Paragraph("COACH RATING", kpi_label_style),
            Paragraph("RATING SPREAD", kpi_label_style),
            Paragraph("DISCIPLINES", kpi_label_style)
        ],
        [
            Paragraph(f"{total_hours} <font size=8 color='#475569'>hrs</font>", kpi_number_style),
            Paragraph(f"{avg_rating} <font size=8 color='#475569'>/ 10</font>" if avg_rating != "N/A" else "N/A", kpi_number_style),
            Paragraph(f"{min_rating} - {max_rating}" if min_rating != "N/A" else "N/A", kpi_number_style),
            Paragraph(f"{sports_count} <font size=8 color='#475569'>active</font>", kpi_number_style)
        ],
        [
            Paragraph(f"{len(sessions)} logged workouts", kpi_sub_style),
            Paragraph("Average coach score", kpi_sub_style),
            Paragraph("Min / Max variance", kpi_sub_style),
            Paragraph("Sports tracked", kpi_sub_style)
        ]
    ]
    t_kpis = Table(kpi_data, colWidths=[135, 135, 135, 135])
    t_kpis.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,-1), colors.HexColor('#EFF6FF')), # Blue tint
        ('BACKGROUND', (1,0), (1,-1), colors.HexColor('#F0FDF4')), # Emerald tint
        ('BACKGROUND', (2,0), (2,-1), colors.HexColor('#EEF2FF')), # Indigo tint
        ('BACKGROUND', (3,0), (3,-1), colors.HexColor('#FFFBEB')), # Amber tint
        ('BOX', (0,0), (0,-1), 0.75, colors.HexColor('#BFDBFE')),
        ('BOX', (1,0), (1,-1), 0.75, colors.HexColor('#BBF7D0')),
        ('BOX', (2,0), (2,-1), 0.75, colors.HexColor('#C7D2FE')),
        ('BOX', (3,0), (3,-1), 0.75, colors.HexColor('#FDE68A')),
        ('PADDING', (0,0), (-1,-1), 3),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    elements.append(t_kpis)
    elements.append(Spacer(1, 10))

    # =========================================================================
    # 3. RECENT PRACTICE SESSIONS TABLE
    # =========================================================================
    elements.append(Paragraph("1. Recent Practice Sessions & Performance Log", section_heading_style))
    
    history_headers = [
        Paragraph("DATE", th_style),
        Paragraph("SPORT", th_style),
        Paragraph("DURATION", th_center_style),
        Paragraph("TRAINING TYPE", th_style),
        Paragraph("SCORE", th_center_style),
        Paragraph("FIELD NOTES & SUMMARY", th_style)
    ]
    history_rows = [history_headers]

    for s in sessions[:8]:
        c_rating_str = f"<b>{s['coach_rating']}</b> / 10" if s['coach_rating'] is not None else "<font color='#94A3B8'>Unrated</font>"
        notes_clean = clean_text_for_pdf(s['notes'] or 'Standard session completed.')
        
        history_rows.append([
            Paragraph(s['date'], td_style),
            Paragraph(s['sport_name'], td_bold_style),
            Paragraph(f"{s['duration_minutes']} min", td_center_style),
            Paragraph(s['training_type'].replace('_', ' ').title(), td_style),
            Paragraph(c_rating_str, td_center_style),
            Paragraph(notes_clean, td_notes_style)
        ])

    # Col Widths sum = 60 + 75 + 50 + 95 + 55 + 205 = 540 pt
    t_history = Table(history_rows, colWidths=[60, 75, 50, 95, 55, 205])
    t_history.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0F172A')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('PADDING', (0,0), (-1,-1), 4),
        ('BOX', (0,0), (-1,-1), 0.75, colors.HexColor('#CBD5E1')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#F8FAFC')]),
    ]))
    elements.append(t_history)
    elements.append(Spacer(1, 10))

    # =========================================================================
    # 4. AI-POWERED PRACTICE RECOMMENDATIONS (CARD STRUCTURE)
    # =========================================================================
    if ai_recs:
        elements.append(Paragraph("2. AI Biomechanical & Tactical Recommendations", section_heading_style))
        for r in ai_recs:
            clean_title = clean_text_for_pdf(r['title'])
            clean_issue = clean_text_for_pdf(r['detected_issue'])
            clean_evidence = clean_text_for_pdf(r['evidence'])
            clean_goal = clean_text_for_pdf(r.get('suggested_goal') or 'Maintain execution consistency across workouts.')
            priority_tag = (r.get('priority') or 'MEDIUM').upper()
            priority_color = '#DC2626' if priority_tag in ['HIGH', 'CRITICAL'] else '#2563EB'
            
            body_html = format_ai_recommendation_for_pdf(r['recommendation_text'])

            rec_card_data = [
                # Row 1: Header (Sport & Title + Priority Badge)
                [
                    Paragraph(f"<b>[{r['sport_name'].upper()}]</b> {clean_title}", card_title_style),
                    Paragraph(f"<font color='{priority_color}'><b>{priority_tag} PRIORITY</b></font>", card_priority_style)
                ],
                # Row 2: Detected Issue & Supporting Evidence Context
                [
                    Paragraph(f"<b>Detected Issue:</b> {clean_issue}<br/><b>Evidence:</b> {clean_evidence}", card_meta_style),
                    Paragraph("", card_meta_style)
                ],
                # Row 3: Full Structured Multi-Pillar Action Plan
                [
                    Paragraph(body_html, card_body_style),
                    Paragraph("", card_body_style)
                ],
                # Row 4: Goal Callout Banner
                [
                    Paragraph(f"<b>Target Milestone Goal:</b> {clean_goal}", goal_callout_style),
                    Paragraph("", goal_callout_style)
                ]
            ]

            t_card = Table(rec_card_data, colWidths=[430, 110])
            t_card.setStyle(TableStyle([
                # Row 1: Card Header
                ('SPAN', (0,0), (0,0)),
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F1F5F9')),
                ('BOX', (0,0), (-1,-1), 0.75, colors.HexColor('#CBD5E1')),
                ('PADDING', (0,0), (-1,0), 5),
                
                # Row 2: Context Bar
                ('SPAN', (0,1), (1,1)),
                ('BACKGROUND', (0,1), (-1,1), colors.HexColor('#F8FAFC')),
                ('LINEBELOW', (0,1), (-1,1), 0.5, colors.HexColor('#E2E8F0')),
                ('PADDING', (0,1), (-1,1), 4),
                
                # Row 3: Body
                ('SPAN', (0,2), (1,2)),
                ('BACKGROUND', (0,2), (-1,2), colors.white),
                ('PADDING', (0,2), (-1,2), 6),
                
                # Row 4: Goal Callout
                ('SPAN', (0,3), (1,3)),
                ('BACKGROUND', (0,3), (-1,3), colors.HexColor('#ECFDF5')),
                ('LINEABOVE', (0,3), (-1,3), 0.75, colors.HexColor('#A7F3D0')),
                ('PADDING', (0,3), (-1,3), 5),
            ]))

            elements.append(KeepTogether([t_card, Spacer(1, 8)]))

    # =========================================================================
    # 5. COACH PROFESSIONAL FEEDBACK SECTION
    # =========================================================================
    if coach_feedbacks:
        elements.append(Paragraph("3. Coach Professional Feedback & Prescribed Drills", section_heading_style))
        for cf in coach_feedbacks:
            c_name = clean_text_for_pdf(cf['coach_name'])
            c_sport = clean_text_for_pdf(cf['sport_name'])
            c_date = str(cf['created_at'])[:10] if cf.get('created_at') else "Recent"
            c_fb = clean_text_for_pdf(cf['feedback_text'])
            c_drill = clean_text_for_pdf(cf.get('recommended_drill') or 'Standard tactical workout')
            c_str = clean_text_for_pdf(cf.get('observed_strength') or 'Solid form foundation')
            c_weak = clean_text_for_pdf(cf.get('observed_weakness') or 'None logged')

            fb_card_data = [
                [
                    Paragraph(f"<b>Coach Evaluation: {c_name}</b> ({c_sport})", card_title_style),
                    Paragraph(f"<font color='#64748B'>Logged on {c_date}</font>", card_priority_style)
                ],
                [
                    Paragraph(
                        f"<b>Observed Strength:</b> <font color='#065F46'>{c_str}</font><br/>"
                        f"<b>Area for Focus:</b> <font color='#991B1B'>{c_weak}</font><br/>"
                        f"<b>Coach Commentary:</b> {c_fb}<br/>"
                        f"<b>Prescribed Drill:</b> <font color='#1E3A8A'><b>{c_drill}</b></font>",
                        card_meta_style
                    ),
                    Paragraph("", card_meta_style)
                ]
            ]
            t_fb = Table(fb_card_data, colWidths=[420, 120])
            t_fb.setStyle(TableStyle([
                ('SPAN', (0,0), (0,0)),
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F8FAFC')),
                ('BOX', (0,0), (-1,-1), 0.75, colors.HexColor('#CBD5E1')),
                ('PADDING', (0,0), (-1,0), 5),
                ('SPAN', (0,1), (1,1)),
                ('BACKGROUND', (0,1), (-1,1), colors.white),
                ('PADDING', (0,1), (-1,1), 6),
            ]))
            elements.append(KeepTogether([t_fb, Spacer(1, 8)]))

    doc.build(elements, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer
