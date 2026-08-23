from fastapi import APIRouter, Depends, HTTPException, status, WebSocket
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.core import timezone
from app.core.database import get_db
from app.api import deps
from app.models.models import User, PatientProfile, QueueToken, Department, DoctorProfile
from app.schemas.schemas import QueueTokenCreate, QueueTokenDetailedResponse, DepartmentResponse, SymptomAnalysisRequest, SymptomAnalysisResponse
from app.services.queue_engine import QueueEngine
from app.services.websocket import manager

router = APIRouter()

@router.get("/departments", response_model=List[DepartmentResponse])
def list_departments(db: Session = Depends(get_db)):
    return db.query(Department).all()

@router.get("/doctors", response_model=List[dict])
def list_doctors_for_patient(department_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(DoctorProfile)
    if department_id is not None:
        query = query.filter(DoctorProfile.department_id == department_id)
    doctors = query.all()
    return [
        {
            "id": doc.id,
            "name": doc.user.name,
            "department_id": doc.department_id,
            "specialization": doc.specialization,
            "is_available": doc.is_available
        }
        for doc in doctors if doc.user
    ]

@router.post("/book", response_model=QueueTokenDetailedResponse)
async def book_appointment(
    token_in: QueueTokenCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    # Ensure patient profile exists
    patient_profile = db.query(PatientProfile).filter(PatientProfile.user_id == current_user.id).first()
    if not patient_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User does not have an active patient profile"
        )
    
    # Verify department exists
    dept = db.query(Department).filter(Department.id == token_in.department_id).first()
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Selected department does not exist"
        )

    # Trigger token creation inside the Queue Engine
    token = await QueueEngine.create_token(
        db=db,
        patient_id=patient_profile.id,
        department_id=token_in.department_id,
        appointment_time=token_in.appointment_time,
        symptoms=token_in.symptoms,
        emergency_level=token_in.emergency_level
    )
    return token

@router.get("/my-tokens", response_model=List[QueueTokenDetailedResponse])
def get_my_tokens(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    patient_profile = db.query(PatientProfile).filter(PatientProfile.user_id == current_user.id).first()
    if not patient_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Patient profile not found"
        )
    
    return db.query(QueueToken).filter(
        QueueToken.patient_id == patient_profile.id
    ).order_by(QueueToken.created_at.desc()).all()

@router.post("/cancel/{token_id}", response_model=QueueTokenDetailedResponse)
async def cancel_token(
    token_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    patient_profile = db.query(PatientProfile).filter(PatientProfile.user_id == current_user.id).first()
    if not patient_profile and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to edit this token"
        )

    token = db.query(QueueToken).filter(QueueToken.id == token_id).first()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token not found"
        )

    if current_user.role == "patient" and token.patient_id != patient_profile.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to cancel this token"
        )

    updated_token = await QueueEngine.update_token_status(db, token_id, "cancelled")
    return updated_token

@router.get("/departments/{department_id}/live")
def get_live_queue(department_id: int, db: Session = Depends(get_db)):
    active_tokens = db.query(QueueToken).filter(
        QueueToken.department_id == department_id,
        QueueToken.status == "active"
    ).all()
    
    pending_tokens = db.query(QueueToken).filter(
        QueueToken.department_id == department_id,
        QueueToken.status == "pending"
    ).all()

    # Re-order pending tokens using the same priority logic
    tokens_list = [{
        "id": t.id,
        "token_number": t.token_number,
        "patient_name": t.patient.user.name,
        "priority_score": t.priority_score,
        "predicted_wait_time": t.predicted_wait_time,
        "appointment_time": t.appointment_time,
        "emergency_level": t.emergency_level,
        "created_at": t.created_at
    } for t in pending_tokens]

    def sort_key(x):
        time_diff = (x["appointment_time"] - timezone.now().replace(tzinfo=None)).total_seconds()
        return time_diff - x["priority_score"] * 900.0 - x["emergency_level"] * 1800.0

    sorted_payload = sorted(tokens_list, key=sort_key)
    
    return {
        "active": [{
            "id": a.id,
            "token_number": a.token_number,
            "doctor_name": a.doctor.user.name if a.doctor else "Unassigned",
            "room_number": a.doctor.room_number if a.doctor else "N/A",
            "patient_name": a.patient.user.name
        } for a in active_tokens],
        "pending": [{
            "id": x["id"],
            "token_number": x["token_number"],
            "patient_name": x["patient_name"],
            "predicted_wait_time": x["predicted_wait_time"]
        } for x in sorted_payload]
    }

@router.post("/symptoms/analyze", response_model=SymptomAnalysisResponse)
def analyze_patient_symptoms(
    payload: SymptomAnalysisRequest,
    current_user: User = Depends(deps.get_current_user)
):
    from app.services.ai_service import AIService
    return AIService.analyze_symptoms(symptoms=payload.symptoms, emergency_level=payload.emergency_level)


from fastapi.responses import StreamingResponse
import csv
from io import StringIO

@router.get("/tokens/{token_id}/prescription/pdf")
def download_prescription_pdf(
    token_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    token = db.query(QueueToken).filter(QueueToken.id == token_id).first()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
        
    # Check authorization: user must be patient of token, doctor assigned, or admin
    if current_user.role == "patient":
        patient_profile = db.query(PatientProfile).filter(PatientProfile.user_id == current_user.id).first()
        if not patient_profile or token.patient_id != patient_profile.id:
            raise HTTPException(status_code=403, detail="Not authorized to access this prescription")
    elif current_user.role == "doctor":
        doc_profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
        if not doc_profile or token.doctor_id != doc_profile.id:
            raise HTTPException(status_code=403, detail="Not authorized to access this prescription")
            
    from app.services.pdf_generator import PDFGenerator
    pdf_buffer = PDFGenerator.generate_prescription_pdf(token)
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=prescription_{token.token_number}.pdf"}
    )


@router.get("/history/export")
def export_consultation_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    # Retrieve tokens depending on user role
    if current_user.role == "patient":
        patient_profile = db.query(PatientProfile).filter(PatientProfile.user_id == current_user.id).first()
        if not patient_profile:
            raise HTTPException(status_code=400, detail="Patient profile not found")
        tokens = db.query(QueueToken).filter(QueueToken.patient_id == patient_profile.id).order_by(QueueToken.created_at.desc()).all()
    elif current_user.role == "doctor":
        doc_profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
        if not doc_profile:
            raise HTTPException(status_code=400, detail="Doctor profile not found")
        tokens = db.query(QueueToken).filter(QueueToken.doctor_id == doc_profile.id).order_by(QueueToken.created_at.desc()).all()
    elif current_user.role == "admin":
        tokens = db.query(QueueToken).order_by(QueueToken.created_at.desc()).all()
    else:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    # Generate CSV in memory
    f = StringIO()
    writer = csv.writer(f)
    # Header
    writer.writerow(["Token Number", "Department", "Doctor", "Patient", "Status", "Appointment Time", "Created At", "Wait Time (mins)", "Clinical Notes"])
    
    for t in tokens:
        dept_name = t.department.name if t.department else "N/A"
        doc_name = t.doctor.user.name if t.doctor and t.doctor.user else "Unassigned"
        pat_name = t.patient.user.name if t.patient and t.patient.user else "N/A"
        writer.writerow([
            t.token_number,
            dept_name,
            doc_name,
            pat_name,
            t.status,
            t.appointment_time.isoformat() if t.appointment_time else "N/A",
            t.created_at.isoformat() if t.created_at else "N/A",
            t.actual_wait_time if t.actual_wait_time is not None else (t.predicted_wait_time if t.predicted_wait_time else 0),
            t.consultation_notes or ""
        ])
        
    f.seek(0)
    return StreamingResponse(
        iter([f.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=consultation_history.csv"}
    )


# --- WebSockets Endpoint ---
@router.websocket("/ws")
async def websocket_global(websocket: WebSocket):
    await manager.connect(websocket, department_id=None)
    try:
        while True:
            # Maintain active connection
            await websocket.receive_text()
    except Exception:
        pass
    finally:
        manager.disconnect(websocket, department_id=None)

@router.websocket("/ws/{department_id}")
async def websocket_dept(websocket: WebSocket, department_id: int):
    await manager.connect(websocket, department_id=department_id)
    try:
        while True:
            # Maintain active connection
            await websocket.receive_text()
    except Exception:
        pass
    finally:
        manager.disconnect(websocket, department_id=department_id)
