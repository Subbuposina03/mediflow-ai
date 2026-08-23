from app.core.database import SessionLocal
from app.models.models import QueueToken, DoctorProfile, Department, User, PatientProfile

db = SessionLocal()
try:
    print("--- DEPARTMENTS ---")
    depts = db.query(Department).all()
    for d in depts:
        print(f"ID: {d.id}, Name: {d.name}")

    print("\n--- DOCTORS ---")
    docs = db.query(DoctorProfile).all()
    for doc in docs:
        print(f"ID: {doc.id}, UserID: {doc.user_id}, Name: {doc.user.name}, Email: {doc.user.email}, DeptID: {doc.department_id}, Available: {doc.is_available}")

    print("\n--- PATIENTS ---")
    pats = db.query(PatientProfile).all()
    for pat in pats:
        print(f"ID: {pat.id}, UserID: {pat.user_id}, Name: {pat.user.name}, Email: {pat.user.email}")

    print("\n--- TOKENS (ALL STATUSES) ---")
    tokens = db.query(QueueToken).all()
    for t in tokens:
        print(f"ID: {t.id}, TokenNum: {t.token_number}, Status: {t.status}, DeptID: {t.department_id}, PatientID: {t.patient_id}, DoctorID: {t.doctor_id}")

finally:
    db.close()
