from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api import deps
from app.models.models import PatientProfile, User, Department
from app.schemas.schemas import DepartmentRecommendationRequest, DepartmentRecommendationResponse

router = APIRouter()


@router.get("/profile")
def get_my_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_patient)
):
    profile = db.query(PatientProfile).filter(
        PatientProfile.user_id == current_user.id
    ).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    return profile


@router.post("/recommend-department", response_model=DepartmentRecommendationResponse)
def recommend_department_endpoint(
    payload: DepartmentRecommendationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_patient)
):
    from app.services.ai_service import AIService
    
    symptoms = payload.symptoms or ""
    if not symptoms.strip():
        default_dept = db.query(Department).filter(Department.name == "General Medicine").first()
        return {
            "department_name": "General Medicine",
            "department_id": default_dept.id if default_dept else 2,
            "confidence": 100,
            "reasoning": "No symptoms provided. Recommending General Medicine as default."
        }
        
    result = AIService.recommend_department(symptoms)
    dept_name = result["department_name"]
    
    # Query database to match name and get ID
    dept = db.query(Department).filter(Department.name == dept_name).first()
    if not dept:
        dept = db.query(Department).filter(Department.name.like(f"%{dept_name}%")).first()
        
    if not dept:
        dept = db.query(Department).filter(Department.name == "General Medicine").first()
        
    return {
        "department_name": dept.name if dept else "General Medicine",
        "department_id": dept.id if dept else 2,
        "confidence": result["confidence"],
        "reasoning": result["reasoning"]
    }