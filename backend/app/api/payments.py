import os
import uuid
import shutil
import random
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Request
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.api import deps
from app.core.config import settings
from app.core import timezone
from app.models.models import User, PatientProfile, QueueToken, Department, DoctorProfile, Payment
from app.schemas.schemas import (
    PaymentResponseSchema, 
    AdminPaymentDashboardResponse, 
    CounterSubmitRequest
)
from app.services.queue_engine import QueueEngine
from app.services.pdf_generator import PDFGenerator

router = APIRouter()


UPLOAD_DIR = "uploads"
SCREENSHOT_DIR = os.path.join(UPLOAD_DIR, "screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "application/pdf": ".pdf"
}


# ==========================================
# PAY AT COUNTER FLOW
# ==========================================

@router.post("/counter-submit", response_model=PaymentResponseSchema)
async def counter_submit(
    req: CounterSubmitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Initiates booking immediately under Pay at Counter flow.
    """
    patient_profile = db.query(PatientProfile).filter(PatientProfile.user_id == current_user.id).first()
    if not patient_profile:
        raise HTTPException(status_code=400, detail="Patient profile not found.")

    dept = db.query(Department).filter(Department.id == req.department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")

    # Calculate consultation amount
    consultation_fee = dept.consultation_fee
    gst_tax = round(consultation_fee * 0.18, 2)
    total_amount = round(consultation_fee + gst_tax, 2)

    receipt_no = f"RCPT-{int(datetime.utcnow().timestamp())}-{random.randint(1000, 9999)}"

    # Generate appointment and token immediately
    try:
        token = await QueueEngine.create_token(
            db=db,
            patient_id=patient_profile.id,
            department_id=req.department_id,
            appointment_time=req.appointment_time,
            symptoms=req.symptoms,
            emergency_level=req.emergency_level
        )
        if req.doctor_id:
            token.doctor_id = req.doctor_id
            db.add(token)
            db.commit()
            db.refresh(token)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate queue token: {str(err)}"
        )

    payment = Payment(
        patient_id=patient_profile.id,
        appointment_id=token.id,
        payment_method="PAY_AT_COUNTER",
        amount=total_amount,
        currency="INR",
        payment_status="Pending",
        receipt_number=receipt_no,
        department_id=req.department_id,
        doctor_id=req.doctor_id,
        appointment_time=req.appointment_time,
        symptoms=req.symptoms,
        emergency_level=req.emergency_level
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    return payment



# ==========================================
# ADMIN VERIFICATION & DASHBOARD
# ==========================================

@router.post("/{payment_id}/approve", response_model=PaymentResponseSchema)
async def approve_payment(
    payment_id: int,
    remarks: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Approves a payment (e.g. Counter payments settled at reception).
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")

    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found.")

    if payment.payment_status not in ["Pending Verification", "Pending at Counter", "Pending"]:
        raise HTTPException(status_code=400, detail="Only pending payments can be approved.")

    # Generate appointment token if not already linked
    if not payment.appointment_id:
        try:
            token = await QueueEngine.create_token(
                db=db,
                patient_id=payment.patient_id,
                department_id=payment.department_id,
                appointment_time=payment.appointment_time,
                symptoms=payment.symptoms,
                emergency_level=payment.emergency_level
            )
            if payment.doctor_id:
                token.doctor_id = payment.doctor_id
                db.add(token)
                db.commit()
                db.refresh(token)
            payment.appointment_id = token.id
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate queue token during approval: {str(err)}"
            )

    payment.payment_status = "Paid"
    payment.admin_remarks = remarks
    payment.verified_by = current_user.email
    payment.verified_time = timezone.now().replace(tzinfo=None)
    db.commit()
    db.refresh(payment)

    return payment


@router.post("/{payment_id}/reject", response_model=PaymentResponseSchema)
def reject_payment(
    payment_id: int,
    remarks: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Rejects a pending payment.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")

    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found.")

    payment.payment_status = "Rejected"
    payment.admin_remarks = remarks
    db.commit()
    db.refresh(payment)

    return payment


@router.get("/history", response_model=List[PaymentResponseSchema])
def get_payment_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Gets transaction logs for the logged-in patient.
    """
    patient_profile = db.query(PatientProfile).filter(PatientProfile.user_id == current_user.id).first()
    if not patient_profile:
        raise HTTPException(status_code=400, detail="Patient profile not found.")

    return db.query(Payment).filter(Payment.patient_id == patient_profile.id).order_by(Payment.created_time.desc()).all()


@router.get("/receipt/{payment_id}/pdf")
def download_receipt_pdf(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Generates and downloads invoice receipts.
    """
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found.")

    # Access control check
    if current_user.role != "admin":
        patient_profile = db.query(PatientProfile).filter(PatientProfile.user_id == current_user.id).first()
        if not patient_profile or payment.patient_id != patient_profile.id:
            raise HTTPException(status_code=403, detail="Access denied to payment receipt.")

    pdf_buffer = PDFGenerator.generate_receipt_pdf(payment, db)
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=receipt_{payment.receipt_number}.pdf"}
    )


@router.get("/admin/pending", response_model=List[PaymentResponseSchema])
def get_admin_pending_payments(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Lists all payments awaiting admin review.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")

    return db.query(Payment).filter(Payment.payment_status.in_(["Pending Verification", "Pending at Counter", "Pending"])).order_by(Payment.created_time.desc()).all()


@router.get("/admin/dashboard", response_model=AdminPaymentDashboardResponse)
def get_admin_payment_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Computes revenue statistics and audit trails for payment modules.
    Only paid/verified transactions count towards revenue.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin authorization required.")

    now = timezone.now()
    today_start = datetime(now.year, now.month, now.day)
    month_start = datetime(now.year, now.month, 1)

    # Today's Revenue (Only Paid/Verified)
    today_rev = db.query(func.sum(Payment.amount)).filter(
        Payment.payment_status.in_(["Paid", "Verified"]),
        Payment.created_time >= today_start
    ).scalar() or 0.0

    # Monthly Revenue (Only Paid/Verified)
    monthly_rev = db.query(func.sum(Payment.amount)).filter(
        Payment.payment_status.in_(["Paid", "Verified"]),
        Payment.created_time >= month_start
    ).scalar() or 0.0

    # Counts
    successful_count = db.query(Payment).filter(Payment.payment_status.in_(["Paid", "Verified"])).count()
    failed_count = db.query(Payment).filter(Payment.payment_status.in_(["Failed", "Rejected", "Cancelled"])).count()

    # Revenue by Department
    dept_revenue_query = db.query(
        Department.name,
        func.sum(Payment.amount)
    ).join(
        QueueToken, Payment.appointment_id == QueueToken.id
    ).join(
        Department, QueueToken.department_id == Department.id
    ).filter(
        Payment.payment_status.in_(["Paid", "Verified"])
    ).group_by(
        Department.name
    ).all()

    revenue_by_department = [
        {"name": row[0], "revenue": float(row[1])} for row in dept_revenue_query
    ]
    
    # Fill missing seeded departments
    all_depts = db.query(Department.name).all()
    existing_dept_names = {r["name"] for r in revenue_by_department}
    for d in all_depts:
        if d[0] not in existing_dept_names:
            revenue_by_department.append({"name": d[0], "revenue": 0.0})

    # Recent Transactions list
    payments = db.query(Payment).order_by(Payment.created_time.desc()).limit(20).all()
    recent_transactions = []
    for p in payments:
        patient_name = p.patient.user.name if p.patient and p.patient.user else "Patient"
        dept_name = "N/A"
        doctor_name = "N/A"
        
        if p.appointment_id:
            token = db.query(QueueToken).filter(QueueToken.id == p.appointment_id).first()
            if token:
                dept_name = token.department.name if token.department else "N/A"
                doctor_name = f"Dr. {token.doctor.user.name}" if token.doctor and token.doctor.user else "General Pool"
        else:
            dept = db.query(Department).filter(Department.id == p.department_id).first()
            if dept:
                dept_name = dept.name
            if p.doctor_id:
                doc_profile = db.query(DoctorProfile).filter(DoctorProfile.id == p.doctor_id).first()
                if doc_profile and doc_profile.user:
                    doctor_name = f"Dr. {doc_profile.user.name}"

        recent_transactions.append({
            "id": p.id,
            "patient_name": patient_name,
            "department": dept_name,
            "doctor": doctor_name,
            "payment_method": p.payment_method,
            "amount": p.amount,
            "status": p.payment_status,
            "utr_number": p.stripe_payment_intent_id or p.stripe_checkout_session_id or p.utr_number,
            "remarks": p.admin_remarks,
            "created_time": p.created_time.isoformat()
        })

    return {
        "today_revenue": float(today_rev),
        "monthly_revenue": float(monthly_rev),
        "successful_payments": successful_count,
        "failed_payments": failed_count,
        "revenue_by_department": revenue_by_department,
        "recent_transactions": recent_transactions
    }


# ==========================================
# LEGACY UPI / SCREENSHOT ENDPOINTS (MAINTAINED FOR HISTORICAL ACCESS)
# ==========================================

@router.get("/config")
def get_payment_config():
    """
    Returns payment configuration.
    """
    return {
        "stripe_enabled": False,
        "payment_method": "PAY_AT_COUNTER",
        "currency": "INR",
        "hospital_name": settings.HOSPITAL_NAME
    }


@router.get("/screenshot/{payment_id}")
def serve_screenshot(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Serves historical payment screenshots with access control.
    """
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found.")

    if current_user.role != "admin":
        patient_profile = db.query(PatientProfile).filter(PatientProfile.user_id == current_user.id).first()
        if not patient_profile or payment.patient_id != patient_profile.id:
            raise HTTPException(status_code=403, detail="Unauthorized access.")

    if not payment.screenshot_path:
        raise HTTPException(status_code=404, detail="No screenshot uploaded for this transaction.")

    full_path = os.path.abspath(payment.screenshot_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Screenshot file missing on server disk.")

    mime_type = "image/png"
    if full_path.endswith(".jpg") or full_path.endswith(".jpeg"):
        mime_type = "image/jpeg"
    elif full_path.endswith(".pdf"):
        mime_type = "application/pdf"

    return FileResponse(full_path, media_type=mime_type)
