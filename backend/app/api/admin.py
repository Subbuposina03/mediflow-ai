from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.core import timezone
from app.core.database import get_db
from app.api import deps
from app.models.models import User, DoctorProfile, PatientProfile, Department, QueueToken
from app.schemas.schemas import AdminDashboardMetrics, DepartmentCreate, DepartmentResponse, DoctorFullResponse, PatientFullResponse, DoctorAdminUpdate, DepartmentUpdateSchema
from app.core.security import get_password_hash

router = APIRouter()

@router.get("/metrics", response_model=AdminDashboardMetrics)
def get_admin_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_admin)
):
    today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0).replace(tzinfo=None)
    
    total_patients = db.query(func.count(PatientProfile.id)).scalar() or 0
    total_doctors = db.query(func.count(DoctorProfile.id)).scalar() or 0
    total_tokens_today = db.query(func.count(QueueToken.id)).filter(QueueToken.created_at >= today_start).scalar() or 0
    
    completed_tokens = db.query(func.count(QueueToken.id)).filter(QueueToken.status == "completed").scalar() or 0
    skipped_tokens = db.query(func.count(QueueToken.id)).filter(QueueToken.status == "skipped").scalar() or 0
    cancelled_tokens = db.query(func.count(QueueToken.id)).filter(QueueToken.status == "cancelled").scalar() or 0
    
    # Calculate average actual wait time for completed tokens today/overall
    avg_wait = db.query(func.avg(QueueToken.actual_wait_time)).filter(
        QueueToken.status == "completed"
    ).scalar()
    avg_wait_minutes = int(round(avg_wait)) if avg_wait else 0

    # Department loads
    departments = db.query(Department).all()
    dept_loads = []
    for dept in departments:
        active_count = db.query(func.count(QueueToken.id)).filter(
            QueueToken.department_id == dept.id,
            QueueToken.status.in_(["pending", "active"])
        ).scalar() or 0
        
        avg_p_wait = db.query(func.avg(QueueToken.predicted_wait_time)).filter(
            QueueToken.department_id == dept.id,
            QueueToken.status == "pending"
        ).scalar()
        avg_p_wait_minutes = int(round(avg_p_wait)) if avg_p_wait else 0

        dept_loads.append({
            "name": dept.name,
            "active_count": active_count,
            "avg_wait": avg_p_wait_minutes
        })

    return {
        "total_patients": total_patients,
        "total_doctors": total_doctors,
        "total_tokens_today": total_tokens_today,
        "average_wait_time": avg_wait_minutes,
        "completed_tokens": completed_tokens,
        "skipped_tokens": skipped_tokens,
        "cancelled_tokens": cancelled_tokens,
        "department_loads": dept_loads
    }


# --- Department CRUD ---
@router.post("/departments", response_model=DepartmentResponse)
def create_department(
    dept_in: DepartmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_admin)
):
    exists = db.query(Department).filter(Department.name == dept_in.name).first()
    if exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department with this name already exists"
        )
    
    db_dept = Department(
        name=dept_in.name,
        description=dept_in.description,
        average_consultation_time=dept_in.average_consultation_time
    )
    db.add(db_dept)
    db.commit()
    db.refresh(db_dept)
    return db_dept

@router.delete("/departments/{dept_id}")
def delete_department(
    dept_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_admin)
):
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found"
        )
    db.delete(dept)
    db.commit()
    return {"detail": "Department deleted successfully"}

@router.put("/departments/{dept_id}", response_model=DepartmentResponse)
def update_department(
    dept_id: int,
    dept_in: DepartmentUpdateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_admin)
):
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found"
        )
    if dept_in.name is not None:
        dept.name = dept_in.name
    if dept_in.description is not None:
        dept.description = dept_in.description
    if dept_in.average_consultation_time is not None:
        dept.average_consultation_time = dept_in.average_consultation_time
    if dept_in.consultation_fee is not None:
        dept.consultation_fee = dept_in.consultation_fee
    db.commit()
    db.refresh(dept)
    return dept


# --- Doctor CRUD ---
@router.get("/doctors", response_model=List[DoctorFullResponse])
def get_all_doctors(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_admin)
):
    return db.query(DoctorProfile).all()

@router.put("/doctors/{doctor_profile_id}", response_model=DoctorFullResponse)
def update_doctor_profile_admin(
    doctor_profile_id: int,
    payload: DoctorAdminUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_admin)
):
    profile = db.query(DoctorProfile).filter(DoctorProfile.id == doctor_profile_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor profile not found"
        )
    
    if payload.department_id is not None:
        # Verify department exists
        dept = db.query(Department).filter(Department.id == payload.department_id).first()
        if not dept:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Department not found"
            )
        profile.department_id = payload.department_id
        
    if payload.specialization is not None:
        profile.specialization = payload.specialization
    if payload.room_number is not None:
        profile.room_number = payload.room_number
    if payload.is_available is not None:
        profile.is_available = payload.is_available
        
    db.commit()
    db.refresh(profile)
    return profile


# --- Patient CRUD ---
@router.get("/patients", response_model=List[PatientFullResponse])
def get_all_patients(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_admin)
):
    return db.query(PatientProfile).all()

@router.put("/patients/{patient_profile_id}", response_model=PatientFullResponse)
def update_patient_profile_admin(
    patient_profile_id: int,
    date_of_birth: Optional[str] = None,
    gender: Optional[str] = None,
    blood_group: Optional[str] = None,
    medical_history: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_admin)
):
    profile = db.query(PatientProfile).filter(PatientProfile.id == patient_profile_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient profile not found"
        )
    
    if date_of_birth is not None:
        profile.date_of_birth = date_of_birth
    if gender is not None:
        profile.gender = gender
    if blood_group is not None:
        profile.blood_group = blood_group
    if medical_history is not None:
        profile.medical_history = medical_history
        
    db.commit()
    db.refresh(profile)
    return profile
@router.put("/patient/profile")
def update_my_profile(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    profile = db.query(PatientProfile).filter(
        PatientProfile.user_id == current_user.id
    ).first()

    if not profile:
        raise HTTPException(
            status_code=404,
            detail="Patient profile not found"
        )

    profile.gender = data.get("gender", profile.gender)
    profile.blood_group = data.get("blood_group", profile.blood_group)
    profile.medical_history = data.get("medical_history", profile.medical_history)

    db.commit()
    db.refresh(profile)

    return profile