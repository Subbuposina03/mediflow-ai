from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import Base, engine, SessionLocal
from app.api import auth, queue, doctors, admin, patients, reports, payments
from app.models.models import User, Department, DoctorProfile, PatientProfile
from app.core.security import get_password_hash
from datetime import datetime, timezone

# Initialize tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Set up CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8005",
        "http://127.0.0.1:8005",
        "http://localhost:8085",
        "http://127.0.0.1:8085",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(
    auth.router,
    prefix="/api/auth",
    tags=["auth-alias"],
    include_in_schema=False
)
app.include_router(queue.router, prefix=f"{settings.API_V1_STR}/queue", tags=["queue"])
app.include_router(doctors.router, prefix=f"{settings.API_V1_STR}/doctors", tags=["doctors"])
app.include_router(admin.router, prefix=f"{settings.API_V1_STR}/admin", tags=["admin"])
app.include_router(
    patients.router,
    prefix=f"{settings.API_V1_STR}/patient",
    tags=["patient"]
)
app.include_router(
    reports.router,
    prefix=f"{settings.API_V1_STR}/reports",
    tags=["reports"]
)
app.include_router(
    payments.router,
    prefix=f"{settings.API_V1_STR}/payments",
    tags=["payments"]
)
app.include_router(
    payments.router,
    prefix="/api/payments",
    tags=["payments-alias"],
    include_in_schema=False
)

import os
os.makedirs("uploads", exist_ok=True)

@app.on_event("startup")
def seed_database():
    """
    Auto-seeds standard system parameters, admins, doctors, and patient profiles
    idempotently if they don't already exist.
    """
    db = SessionLocal()
    try:
        # Check if consultation_fee column exists in departments (SQLite/MySQL dynamic migration)
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        columns = [c["name"] for c in inspector.get_columns("departments")]
        if "consultation_fee" not in columns:
            db.execute(text("ALTER TABLE departments ADD COLUMN consultation_fee INTEGER DEFAULT 500"))
            db.commit()

        # Check payments table for Stripe columns
        payment_columns = [c["name"] for c in inspector.get_columns("payments")]
        if "stripe_checkout_session_id" not in payment_columns:
            db.execute(text("ALTER TABLE payments ADD COLUMN stripe_checkout_session_id VARCHAR(255)"))
            db.commit()
        if "stripe_payment_intent_id" not in payment_columns:
            db.execute(text("ALTER TABLE payments ADD COLUMN stripe_payment_intent_id VARCHAR(255)"))
            db.commit()
        if "updated_at" not in payment_columns:
            db.execute(text("ALTER TABLE payments ADD COLUMN updated_at DATETIME"))
            db.commit()

        # 1. Create/Update Departments
        cardiology = db.query(Department).filter(Department.name == "Cardiology").first()
        if not cardiology:
            cardiology = Department(name="Cardiology", description="Heart health and cardiovascular therapy.", average_consultation_time=20, consultation_fee=800)
            db.add(cardiology)
        else:
            cardiology.consultation_fee = 800
            
        gen_med = db.query(Department).filter(Department.name == "General Medicine").first()
        if not gen_med:
            gen_med = Department(name="General Medicine", description="General outpatient consultation and triage.", average_consultation_time=15, consultation_fee=500)
            db.add(gen_med)
        else:
            gen_med.consultation_fee = 500
            
        pediatrics = db.query(Department).filter(Department.name == "Pediatrics").first()
        if not pediatrics:
            pediatrics = Department(name="Pediatrics", description="Child health care and vaccination routines.", average_consultation_time=12, consultation_fee=600)
            db.add(pediatrics)
        else:
            pediatrics.consultation_fee = 600
        
        db.commit()
        db.refresh(cardiology)
        db.refresh(gen_med)
        db.refresh(pediatrics)

        # 2. Create Users
        # Admin User
        admin_user = db.query(User).filter(User.email == "admin@mediflow.com").first()
        if not admin_user:
            admin_user = User(
                email="admin@mediflow.com",
                hashed_password=get_password_hash("admin123"),
                role="admin",
                name="System Admin",
                phone="+1 (555) 010-0001"
            )
            db.add(admin_user)
            
        # Doctor User (General Medicine)
        doctor_user = db.query(User).filter(User.email == "doctor@mediflow.com").first()
        if not doctor_user:
            doctor_user = User(
                email="doctor@mediflow.com",
                hashed_password=get_password_hash("doctor123"),
                role="doctor",
                name="Dr. Sarah Jenkins",
                phone="+1 (555) 010-0002"
            )
            db.add(doctor_user)
            
        # Doctor User (Cardiology)
        doctor_cardio = db.query(User).filter(User.email == "cardiology@mediflow.com").first()
        if not doctor_cardio:
            doctor_cardio = User(
                email="cardiology@mediflow.com",
                hashed_password=get_password_hash("doctor123"),
                role="doctor",
                name="Dr. Michael Brown",
                phone="+1 (555) 010-0004"
            )
            db.add(doctor_cardio)

        # Doctor User (Pediatrics)
        doctor_pediatrics = db.query(User).filter(User.email == "pediatrics@mediflow.com").first()
        if not doctor_pediatrics:
            doctor_pediatrics = User(
                email="pediatrics@mediflow.com",
                hashed_password=get_password_hash("doctor123"),
                role="doctor",
                name="Dr. Emily Wilson",
                phone="+1 (555) 010-0005"
            )
            db.add(doctor_pediatrics)
            
        # Patient User
        patient_user = db.query(User).filter(User.email == "patient@mediflow.com").first()
        if not patient_user:
            patient_user = User(
                email="patient@mediflow.com",
                hashed_password=get_password_hash("patient123"),
                role="patient",
                name="John Doe",
                phone="+1 (555) 010-0003"
            )
            db.add(patient_user)
        
        db.commit()
        if doctor_user:
            db.refresh(doctor_user)
        if doctor_cardio:
            db.refresh(doctor_cardio)
        if doctor_pediatrics:
            db.refresh(doctor_pediatrics)
        if patient_user:
            db.refresh(patient_user)

        # 3. Create Profiles
        if doctor_user:
            doctor_profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == doctor_user.id).first()
            if not doctor_profile:
                doctor_profile = DoctorProfile(
                    user_id=doctor_user.id,
                    department_id=gen_med.id,
                    specialization="Internal Medicine",
                    room_number="Room 101",
                    is_available=True
                )
                db.add(doctor_profile)

        if doctor_cardio:
            doctor_profile_cardio = db.query(DoctorProfile).filter(DoctorProfile.user_id == doctor_cardio.id).first()
            if not doctor_profile_cardio:
                doctor_profile_cardio = DoctorProfile(
                    user_id=doctor_cardio.id,
                    department_id=cardiology.id,
                    specialization="Cardiology",
                    room_number="Room 202",
                    is_available=True
                )
                db.add(doctor_profile_cardio)

        if doctor_pediatrics:
            doctor_profile_peds = db.query(DoctorProfile).filter(DoctorProfile.user_id == doctor_pediatrics.id).first()
            if not doctor_profile_peds:
                doctor_profile_peds = DoctorProfile(
                    user_id=doctor_pediatrics.id,
                    department_id=pediatrics.id,
                    specialization="Pediatrics",
                    room_number="Room 303",
                    is_available=True
                )
                db.add(doctor_profile_peds)
        
        if patient_user:
            patient_profile = db.query(PatientProfile).filter(PatientProfile.user_id == patient_user.id).first()
            if not patient_profile:
                patient_profile = PatientProfile(
                    user_id=patient_user.id,
                    date_of_birth="1990-05-15",
                    gender="Male",
                    blood_group="O+",
                    medical_history="Mild seasonal allergies. Chronic history of controlled hypertension."
                )
                db.add(patient_profile)

        db.commit()

    except Exception as e:
        print(f"Error during database seed: {e}")
        db.rollback()
    finally:
        db.close()


@app.get("/")
def read_root():
    return {
        "status": "online",
        "app": settings.PROJECT_NAME,
        "version": "1.0.0",
        "endpoints": {
            "docs": "/docs",
            "api": settings.API_V1_STR
        }
    }
