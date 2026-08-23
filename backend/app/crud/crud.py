from sqlalchemy.orm import Session
from app.models.models import User, PatientProfile, DoctorProfile, Department, QueueToken
from app.schemas.schemas import UserCreate, DepartmentCreate, UserUpdate
from app.core.security import get_password_hash

# --- User CRUD ---
def get_user(db: Session, user_id: int):
    return db.query(User).filter(User.id == user_id).first()

def get_user_by_email(db: Session, email: str):
    if not email:
        return None
    from sqlalchemy import func
    return db.query(User).filter(func.lower(User.email) == email.strip().lower()).first()

def create_user(db: Session, user_in: UserCreate):
    hashed_password = get_password_hash(user_in.password)
    db_user = User(
        email=user_in.email,
        hashed_password=hashed_password,
        role=user_in.role,
        name=user_in.name,
        phone=user_in.phone
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    # Initialize profiles depending on the role
    if user_in.role == "patient":
        db_patient = PatientProfile(user_id=db_user.id)
        db.add(db_patient)
    elif user_in.role == "doctor":
        # By default, not assigned to a department; administrator will configure
        db_doctor = DoctorProfile(user_id=db_user.id)
        db.add(db_doctor)

    db.commit()
    db.refresh(db_user)
    return db_user


# --- Department CRUD ---
def get_departments(db: Session):
    return db.query(Department).all()

def get_department(db: Session, department_id: int):
    return db.query(Department).filter(Department.id == department_id).first()

def get_department_by_name(db: Session, name: str):
    return db.query(Department).filter(Department.name == name).first()

def create_department(db: Session, dept_in: DepartmentCreate):
    db_dept = Department(
        name=dept_in.name,
        description=dept_in.description,
        average_consultation_time=dept_in.average_consultation_time
    )
    db.add(db_dept)
    db.commit()
    db.refresh(db_dept)
    return db_dept


# --- Patient Profile CRUD ---
def get_patient_profile_by_user(db: Session, user_id: int):
    return db.query(PatientProfile).filter(PatientProfile.user_id == user_id).first()


# --- Doctor Profile CRUD ---
def get_doctor_profile_by_user(db: Session, user_id: int):
    return db.query(DoctorProfile).filter(DoctorProfile.user_id == user_id).first()

def get_doctors_list(db: Session):
    return db.query(DoctorProfile).all()
