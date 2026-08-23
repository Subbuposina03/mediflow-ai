import os
import uuid
import logging
import shutil
from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api import deps
from app.models.models import User, PatientProfile, DoctorProfile, MedicalReport, QueueToken
from app.schemas.schemas import MedicalReportResponse, MedicalReportStats
from app.services.ai_service import AIService

logger = logging.getLogger("mediflow_ai")

router = APIRouter()

UPLOAD_DIR = "uploads"
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_MIME_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png"
}

def get_patient_profile(user_id: int, db: Session) -> PatientProfile:
    profile = db.query(PatientProfile).filter(PatientProfile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    return profile

def get_doctor_profile(user_id: int, db: Session) -> DoctorProfile:
    profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Doctor profile not found")
    return profile

@router.post("/upload", response_model=MedicalReportResponse, status_code=status.HTTP_201_CREATED)
def upload_medical_report(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    # Only patients can upload reports
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="Only patients can upload medical reports")
        
    patient_profile = get_patient_profile(current_user.id, db)
    
    # 1. Type validation
    content_type = file.content_type
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {content_type}. Allowed: PDF, JPG, JPEG, PNG"
        )
        
    # Ensure upload folder exists
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    
    # 2. File size validation (Read chunk by chunk to prevent loading huge files in memory)
    unique_filename = f"{uuid.uuid4()}{ALLOWED_MIME_TYPES[content_type]}"
    temp_file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    total_size = 0
    try:
        with open(temp_file_path, "wb") as buffer:
            while chunk := file.file.read(8192):
                total_size += len(chunk)
                if total_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=400,
                        detail="File exceeds maximum allowed size of 5MB"
                    )
                buffer.write(chunk)
    except HTTPException:
        # Clean up temp file on size rejection
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise
    except Exception as e:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        logger.error(f"Upload failed writing to disk: {e}")
        raise HTTPException(status_code=500, detail="Failed to save report to server disk")

    # 3. AI Summary Generation
    ai_summary = ""
    try:
        # Prompt model with report details
        prompt = (
            f"Generate a clinical summary brief for a patient report.\n"
            f"File Name: {file.filename}\n"
            f"Mime Type: {content_type}\n"
            f"File Size: {total_size / 1024:.1f} KB\n\n"
            "Format: Write a single, brief sentence describing the file type and acknowledging that this diagnostic report has been logged and is ready for clinical assessment. Keep it highly professional."
        )
        summary_result = AIService._generate_text(prompt)
        if summary_result:
            ai_summary = summary_result.strip()
        else:
            ai_summary = f"Logged {ALLOWED_MIME_TYPES[content_type].upper()[1:]} report ({total_size / 1024:.1f} KB) ready for physician review."
    except Exception as e:
        logger.warning(f"AI report summary generation failed: {e}")
        ai_summary = f"Logged report ready for review."

    # 4. Save metadata record
    report = MedicalReport(
        patient_id=patient_profile.id,
        file_name=file.filename,
        file_path=temp_file_path,
        mime_type=content_type,
        file_size=total_size,
        ai_summary=ai_summary
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report

@router.get("/my-reports", response_model=List[MedicalReportResponse])
def get_my_medical_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="Only patients can view their report list")
        
    patient_profile = get_patient_profile(current_user.id, db)
    reports = db.query(MedicalReport).filter(MedicalReport.patient_id == patient_profile.id).order_by(MedicalReport.created_at.desc()).all()
    return reports

@router.get("/patient/{patient_id}", response_model=List[MedicalReportResponse])
def get_patient_reports_for_doctor(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    if current_user.role not in ["doctor", "admin"]:
        raise HTTPException(status_code=403, detail="Only doctors and administrators can access patient records")
        
    if current_user.role == "doctor":
        doc_profile = get_doctor_profile(current_user.id, db)
        # Check authorization: Doctor must be consulting this patient
        token_check = db.query(QueueToken).filter(
            QueueToken.patient_id == patient_id,
            QueueToken.doctor_id == doc_profile.id
        ).first()
        if not token_check:
            raise HTTPException(status_code=403, detail="Access denied. You are not consulting this patient.")
            
    reports = db.query(MedicalReport).filter(MedicalReport.patient_id == patient_id).order_by(MedicalReport.created_at.desc()).all()
    return reports

@router.get("/all", response_model=List[MedicalReportResponse])
def get_all_reports_for_admin(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access restricted to administrators")
    reports = db.query(MedicalReport).order_by(MedicalReport.created_at.desc()).all()
    return reports

@router.get("/download/{report_id}")
def download_medical_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    report = db.query(MedicalReport).filter(MedicalReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Medical report not found")
        
    # Authorization checks
    if current_user.role == "patient":
        patient_profile = get_patient_profile(current_user.id, db)
        if report.patient_id != patient_profile.id:
            raise HTTPException(status_code=403, detail="Access denied. You do not own this report.")
    elif current_user.role == "doctor":
        doc_profile = get_doctor_profile(current_user.id, db)
        # Verify consulting doctor status
        token_check = db.query(QueueToken).filter(
            QueueToken.patient_id == report.patient_id,
            QueueToken.doctor_id == doc_profile.id
        ).first()
        if not token_check:
            raise HTTPException(status_code=403, detail="Access denied. You are not consulting this patient.")
            
    # File exists on disk?
    if not os.path.exists(report.file_path):
        raise HTTPException(status_code=404, detail="File missing from storage server disk")
        
    return FileResponse(
        report.file_path,
        media_type=report.mime_type,
        filename=report.file_name
    )

@router.delete("/{report_id}", status_code=status.HTTP_200_OK)
def delete_medical_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    report = db.query(MedicalReport).filter(MedicalReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
    # Authorization checks
    if current_user.role == "patient":
        patient_profile = get_patient_profile(current_user.id, db)
        if report.patient_id != patient_profile.id:
            raise HTTPException(status_code=403, detail="You do not own this medical report")
    elif current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only the report owner or administrators can delete reports")
        
    # Delete from disk
    if os.path.exists(report.file_path):
        try:
            os.remove(report.file_path)
        except Exception as e:
            logger.error(f"Failed to remove file from disk: {e}")
            
    db.delete(report)
    db.commit()
    return {"detail": "Medical report deleted successfully"}

@router.get("/stats", response_model=MedicalReportStats)
def get_report_statistics_for_admin(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access restricted to administrators")
        
    reports = db.query(MedicalReport).all()
    total_size = sum(r.file_size for r in reports)
    
    # MIME distribution counts
    type_counts = {}
    for r in reports:
        ext = ALLOWED_MIME_TYPES.get(r.mime_type, "other")
        type_counts[ext] = type_counts.get(ext, 0) + 1
        
    return {
        "total_reports": len(reports),
        "total_size_bytes": total_size,
        "type_counts": type_counts
    }
