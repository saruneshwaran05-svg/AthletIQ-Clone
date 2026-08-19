from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from app.auth import require_student
from app.pdf_generator import generate_student_report_pdf

router = APIRouter(prefix="/api/reports", tags=["Reports"])

@router.get("/download-pdf")
def download_student_report(user: dict = Depends(require_student)):
    try:
        pdf_buffer = generate_student_report_pdf(user["user_id"])
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=AthletIQ_Report_{user['name'].replace(' ', '_')}.pdf"
            }
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to generate performance report PDF")
