from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
from app.core.database import get_db
from app.api import deps
from app.models.models import User, DoctorProfile, QueueToken, PatientProfile
from app.schemas.schemas import DoctorProfileResponse, QueueTokenDetailedResponse, QueueTokenUpdateStatus, AIPatientSummaryResponse
from app.services.queue_engine import QueueEngine
from app.services.ai_engine import ai_engine

router = APIRouter()

@router.get("/profile", response_model=DoctorProfileResponse)
def get_doctor_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_doctor)
):
    profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor profile not found"
        )
    return profile

@router.put("/profile", response_model=DoctorProfileResponse)
def update_doctor_profile(
    room_number: Optional[str] = None,
    specialization: Optional[str] = None,
    is_available: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_doctor)
):
    profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor profile not found"
        )
    
    if room_number is not None:
        profile.room_number = room_number
    if specialization is not None:
        profile.specialization = specialization
    if is_available is not None:
        profile.is_available = is_available
        
    db.commit()
    db.refresh(profile)
    
    # Trigger a recalculation since availability status changed
    if is_available is not None and profile.department_id:
        import asyncio
        from app.services.queue_engine import QueueEngine
        # Running async operation inside synchronous routing handler
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(QueueEngine.optimize_and_broadcast(db, profile.department_id))
        except Exception:
            pass

    return profile

@router.get("/active-token", response_model=Optional[QueueTokenDetailedResponse])
def get_active_token(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_doctor)
):
    doc_profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not doc_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor profile not found"
        )
    return db.query(QueueToken).filter(
        QueueToken.doctor_id == doc_profile.id,
        QueueToken.status == "active"
    ).first()

@router.post("/call-next", response_model=Optional[QueueTokenDetailedResponse])
async def call_next(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_doctor)
):
    doc_profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not doc_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor profile not found"
        )
    
    next_token = await QueueEngine.call_next_patient(db, doc_profile.id)
    return next_token

@router.post("/complete", response_model=QueueTokenDetailedResponse)
async def complete_consultation(
    token_id: int,
    payload: QueueTokenUpdateStatus,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_doctor)
):
    doc_profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not doc_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor profile not found"
        )

    token = db.query(QueueToken).filter(QueueToken.id == token_id).first()
    if not token or token.doctor_id != doc_profile.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active token not found or not assigned to you"
        )

    updated = await QueueEngine.update_token_status(
        db=db,
        token_id=token_id,
        status="completed",
        notes=payload.consultation_notes
    )
    return updated

@router.post("/skip", response_model=QueueTokenDetailedResponse)
async def skip_patient(
    token_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_doctor)
):
    doc_profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not doc_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor profile not found"
        )

    token = db.query(QueueToken).filter(QueueToken.id == token_id).first()
    if not token or token.doctor_id != doc_profile.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token not found or not assigned to you"
        )

    updated = await QueueEngine.update_token_status(db, token_id, "skipped")
    return updated

@router.get("/history", response_model=List[QueueTokenDetailedResponse])
def get_consultation_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_doctor)
):
    doc_profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not doc_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor profile not found"
        )
    return db.query(QueueToken).filter(
        QueueToken.doctor_id == doc_profile.id,
        QueueToken.status.in_(["completed", "skipped"])
    ).order_by(QueueToken.updated_at.desc()).all()

@router.get("/patient-summary/{patient_id}")
def get_summary(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_doctor)
):
    doc_profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not doc_profile:
        raise HTTPException(status_code=403, detail="Doctor profile not found")

    # Security check: Doctor must be consulting this patient
    authorized = db.query(QueueToken).filter(
        QueueToken.patient_id == patient_id,
        QueueToken.doctor_id == doc_profile.id
    ).first()
    if not authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to access this patient's records"
        )

    # Ensure patient exists
    patient = db.query(PatientProfile).filter(PatientProfile.id == patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )
    
    # Get active or last token for priority
    last_token = db.query(QueueToken).filter(
        QueueToken.patient_id == patient_id,
        QueueToken.doctor_id == doc_profile.id
    ).order_by(QueueToken.created_at.desc()).first()

    priority = last_token.priority_score if last_token else 1.0
    symptoms = last_token.symptoms if last_token else ""
    
    summary = ai_engine.generate_patient_summary(
        name=patient.user.name,
        age_str=patient.date_of_birth,
        gender=patient.gender,
        symptoms=symptoms,
        medical_history=patient.medical_history,
        priority_score=priority
    )
    
    return {"summary": summary}


@router.post("/consultations/{token_id}/draft-prescription")
def draft_prescription_endpoint(
    token_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_doctor)
):
    doc_profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not doc_profile:
        raise HTTPException(status_code=404, detail="Doctor profile not found")
        
    token = db.query(QueueToken).filter(QueueToken.id == token_id).first()
    if not token or token.doctor_id != doc_profile.id:
        raise HTTPException(status_code=404, detail="Consultation token not found or not assigned to you")
        
    patient = token.patient
    history = patient.medical_history if patient else ""
    
    from app.services.ai_service import AIService
    draft = AIService.draft_prescription(
        symptoms=token.symptoms or "",
        history=history,
        diagnosis=payload.get("diagnosis", "")
    )
    return {"draft": draft}


@router.get("/patient-ai-summary/{patient_id}", response_model=AIPatientSummaryResponse)
def get_patient_ai_summary(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_doctor)
):
    import json
    import re
    
    doc_profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not doc_profile:
        raise HTTPException(status_code=403, detail="Doctor profile not found")

    # Security check: Doctor must be consulting this patient
    authorized = db.query(QueueToken).filter(
        QueueToken.patient_id == patient_id,
        QueueToken.doctor_id == doc_profile.id
    ).first()
    if not authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to access this patient's records"
        )

    # Ensure patient exists
    patient = db.query(PatientProfile).filter(PatientProfile.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")
        
    # Get active or last token for current visit details
    active_token = db.query(QueueToken).filter(
        QueueToken.patient_id == patient_id,
        QueueToken.status == "active"
    ).order_by(QueueToken.created_at.desc()).first()
    
    if not active_token:
        # Fallback to last token if no active token
        active_token = db.query(QueueToken).filter(
            QueueToken.patient_id == patient_id
        ).order_by(QueueToken.created_at.desc()).first()

    # 1. Demographics
    dob = patient.date_of_birth or "N/A"
    age = "N/A"
    if dob != "N/A":
        try:
            birth_date = datetime.strptime(dob, "%Y-%m-%d")
            today = datetime.now()
            age = str(today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day)))
        except Exception:
            age = dob # Fallback directly if not standard date format
            
    patient_info = {
        "name": patient.user.name,
        "age": age,
        "gender": patient.gender or "N/A",
        "blood_group": patient.blood_group or "N/A"
    }

    # 2. Medical History
    history_text = patient.medical_history or ""

    # 3. Previous Consultations
    completed_tokens = db.query(QueueToken).filter(
        QueueToken.patient_id == patient_id,
        QueueToken.status == "completed"
    ).order_by(QueueToken.created_at.desc()).all()
    
    total_visits = len(completed_tokens)
    last_visit_date = "N/A"
    previous_doctors = []
    
    if completed_tokens:
        last_token = completed_tokens[0]
        last_visit_date = last_token.created_at.strftime("%d-%b-%Y")
        
        # Collect unique doctor names
        for t in completed_tokens:
            if t.doctor and t.doctor.user:
                doc_name = t.doctor.user.name
                if doc_name not in previous_doctors:
                    previous_doctors.append(doc_name)
                    
    previous_consultations = {
        "total_visits": total_visits,
        "last_visit_date": last_visit_date,
        "previous_doctors": ", ".join(previous_doctors) if previous_doctors else "N/A"
    }

    # 4. Previous Prescriptions
    from app.services.pdf_generator import parse_prescription_sections
    previous_prescriptions = []
    for t in completed_tokens:
        if t.consultation_notes:
            _, meds_text = parse_prescription_sections(t.consultation_notes)
            if meds_text:
                for line in meds_text.split("\n"):
                    cleaned = line.strip()
                    cleaned = re.sub(r"^(\d+\.|\-|\*)\s*", "", cleaned).strip()
                    if cleaned and cleaned not in previous_prescriptions:
                        previous_prescriptions.append(cleaned)
                        
    previous_prescriptions = previous_prescriptions[:5]

    # 5. Medical Reports
    from app.models.models import MedicalReport
    reports = db.query(MedicalReport).filter(MedicalReport.patient_id == patient_id).all()
    report_count = len(reports)
    report_findings = "; ".join(r.ai_summary for r in reports if r.ai_summary)
    
    medical_reports = {
        "count": report_count,
        "findings_summary": report_findings or ("No reports uploaded." if report_count == 0 else "No summary available.")
    }

    # 6. Current Visit details
    current_symptoms = active_token.symptoms if active_token else "No symptoms registered."
    current_visit = {
        "symptoms": current_symptoms,
        "risk_level": "Moderate",
        "triage_advice": "No triage advice registered."
    }
    
    if active_token:
        from app.services.ai_service import AIService
        triage_data = AIService.analyze_symptoms(
            symptoms=active_token.symptoms or "",
            emergency_level=active_token.emergency_level
        )
        current_visit["risk_level"] = triage_data.get("risk_level", "Moderate")
        current_visit["triage_advice"] = triage_data.get("triage_advice", "")

    # 7. AI Summary Generation
    prompt = (
        f"You are an expert clinical AI. Analyze the patient medical data below and compile a structured clinical patient summary for the attending doctor.\n\n"
        f"Patient Information: Name: {patient_info['name']}, Age: {patient_info['age']}, Gender: {patient_info['gender']}, Blood Group: {patient_info['blood_group']}\n"
        f"Chronic History / Medical Record: {history_text or 'No chronic history reported.'}\n"
        f"Past Visits: Total completed visits: {total_visits}. Last visit date: {last_visit_date}. Attended doctors: {previous_consultations['previous_doctors']}\n"
        f"Past Prescriptions: {', '.join(previous_prescriptions) if previous_prescriptions else 'None recorded.'}\n"
        f"Medical Files Uploaded: Total {report_count} reports. Extracted findings: {medical_reports['findings_summary']}\n"
        f"Current Visit: Symptoms: {current_visit['symptoms']}, Triage Risk Level: {current_visit['risk_level']}\n\n"
        "Compile this information and return a raw JSON response (do not use markdown tags, output only the valid JSON string) matching this exact schema:\n"
        "{\n"
        '  "medical_history": {"chronic_diseases": "brief summary of chronic conditions", "allergies": "allergies list or None", "previous_diagnoses": "brief list of previous diagnoses"},\n'
        '  "medical_reports": {"count": ' + str(report_count) + ', "findings_summary": "brief summary of critical findings across uploaded reports or None"},\n'
        '  "risk_assessment": "Low or Medium or High",\n'
        '  "ai_recommendation": ["ECG / Blood test / consultation recommendation 1", "recommendation 2"]\n'
        "}\n"
    )

    try:
        from app.services.ai_service import AIService
        ai_res = AIService._generate_text(prompt)
        if ai_res:
            cleaned = ai_res.replace("```json", "").replace("```", "").strip()
            parsed = json.loads(cleaned)
            return {
                "patient_info": patient_info,
                "medical_history": {
                    "chronic_diseases": parsed.get("medical_history", {}).get("chronic_diseases", "None reported"),
                    "allergies": parsed.get("medical_history", {}).get("allergies", "None reported"),
                    "previous_diagnoses": parsed.get("medical_history", {}).get("previous_diagnoses", "None reported")
                },
                "previous_consultations": previous_consultations,
                "current_visit": current_visit,
                "previous_prescriptions": previous_prescriptions,
                "medical_reports": {
                    "count": report_count,
                    "findings_summary": parsed.get("medical_reports", {}).get("findings_summary", medical_reports["findings_summary"])
                },
                "risk_assessment": parsed.get("risk_assessment", "Low" if active_token and active_token.emergency_level < 3 else "Medium"),
                "ai_recommendation": parsed.get("ai_recommendation", ["Monitor patient vitals", "General medicine evaluation"])
            }
    except Exception as e:
        import logging
        logging.getLogger("mediflow_ai").warning(f"AI Patient Summary generation failed: {e}")

    # Fallback clinical rules
    chronic = "None reported"
    allergies = "None reported"
    diagnoses = "None reported"
    if history_text:
        history_lower = history_text.lower()
        if "allergy" in history_lower or "allergic" in history_lower:
            allergies = history_text
        else:
            chronic = history_text
            
    if completed_tokens:
        diagnoses = ", ".join(t.symptoms for t in completed_tokens if t.symptoms)[:100]

    risk = "Medium"
    recs = ["Check patient blood pressure", "Evaluate standard symptoms"]
    if active_token:
        if active_token.emergency_level >= 4:
            risk = "High"
            recs = ["Recommend ECG immediately", "Refer to specialized clinic", "Check emergency oxygen saturation"]
        elif active_token.emergency_level <= 2:
            risk = "Low"
            recs = ["Continue current medication", "Follow up if symptoms persist"]

    return {
        "patient_info": patient_info,
        "medical_history": {
            "chronic_diseases": chronic,
            "allergies": allergies,
            "previous_diagnoses": diagnoses or "None recorded"
        },
        "previous_consultations": previous_consultations,
        "current_visit": current_visit,
        "previous_prescriptions": previous_prescriptions,
        "medical_reports": medical_reports,
        "risk_assessment": risk,
        "ai_recommendation": recs
    }

