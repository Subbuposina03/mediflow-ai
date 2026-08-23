from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.core import timezone

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)  # admin, doctor, patient
    name = Column(String(100), nullable=False)
    phone = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=timezone.now)

    # Relationships
    patient_profile = relationship("PatientProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    doctor_profile = relationship("DoctorProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    average_consultation_time = Column(Integer, default=15)  # in minutes
    consultation_fee = Column(Integer, default=500, nullable=False)
    created_at = Column(DateTime, default=timezone.now)

    # Relationships
    doctors = relationship("DoctorProfile", back_populates="department")
    tokens = relationship("QueueToken", back_populates="department")


class DoctorProfile(Base):
    __tablename__ = "doctor_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    specialization = Column(String(100), nullable=True)
    room_number = Column(String(20), nullable=True)
    is_available = Column(Boolean, default=True)

    # Relationships
    user = relationship("User", back_populates="doctor_profile")
    department = relationship("Department", back_populates="doctors")
    tokens = relationship("QueueToken", back_populates="doctor")


class PatientProfile(Base):
    __tablename__ = "patient_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    date_of_birth = Column(String(20), nullable=True)
    gender = Column(String(10), nullable=True)
    blood_group = Column(String(10), nullable=True)
    medical_history = Column(Text, nullable=True)

    # Relationships
    user = relationship("User", back_populates="patient_profile")
    tokens = relationship("QueueToken", back_populates="patient")
    medical_reports = relationship("MedicalReport", back_populates="patient", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="patient", cascade="all, delete-orphan")


class QueueToken(Base):
    __tablename__ = "queue_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token_number = Column(String(20), unique=True, index=True, nullable=False)
    appointment_time = Column(DateTime, nullable=False)
    
    # Status: pending, active, completed, skipped, cancelled
    status = Column(String(20), default="pending", nullable=False)
    
    # Triage and AI inputs
    priority_score = Column(Float, default=1.0, nullable=False)
    emergency_level = Column(Integer, default=1, nullable=False)  # 1 (low) to 5 (critical)
    symptoms = Column(Text, nullable=True)
    
    # Dynamic fields calculated by AI Engine
    predicted_wait_time = Column(Integer, default=15)  # in minutes
    actual_wait_time = Column(Integer, nullable=True)  # in minutes
    
    # Relationships & Foreign Keys
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("doctor_profiles.id", ondelete="SET NULL"), nullable=True)
    patient_id = Column(Integer, ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False)
    
    consultation_notes = Column(Text, nullable=True, default="")
    created_at = Column(DateTime, default=timezone.now)
    updated_at = Column(DateTime, default=timezone.now, onupdate=timezone.now)

    # Relationships
    department = relationship("Department", back_populates="tokens")
    doctor = relationship("DoctorProfile", back_populates="tokens")
    patient = relationship("PatientProfile", back_populates="tokens")
    payment = relationship("Payment", back_populates="appointment", uselist=False, cascade="all, delete-orphan")


class MedicalReport(Base):
    __tablename__ = "medical_reports"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    mime_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=False)
    ai_summary = Column(Text, nullable=True, default="")
    created_at = Column(DateTime, default=timezone.now)

    # Relationships
    patient = relationship("PatientProfile", back_populates="medical_reports")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    appointment_id = Column(Integer, ForeignKey("queue_tokens.id", ondelete="CASCADE"), nullable=True)
    patient_id = Column(Integer, ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False)
    payment_method = Column(String(50), default="PAY_AT_COUNTER", nullable=False)  # PAY_AT_COUNTER

    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="INR", nullable=False)
    payment_status = Column(String(50), default="Pending", nullable=False)  # Pending, Paid, Failed, Cancelled, Pending at Counter, Verified, Rejected
    razorpay_order_id = Column(String(100), nullable=True)
    razorpay_payment_id = Column(String(100), nullable=True)
    stripe_checkout_session_id = Column(String(255), nullable=True, index=True)
    stripe_payment_intent_id = Column(String(255), nullable=True, index=True)
    receipt_number = Column(String(100), nullable=False)
    utr_number = Column(String(100), nullable=True)
    screenshot_path = Column(String(500), nullable=True)
    admin_remarks = Column(String(1000), nullable=True)
    verified_by = Column(String(100), nullable=True)
    verified_time = Column(DateTime, nullable=True)
    
    # Booking details for pending payments
    department_id = Column(Integer, nullable=True)
    doctor_id = Column(Integer, nullable=True)
    appointment_time = Column(DateTime, nullable=True)
    symptoms = Column(String(1000), nullable=True)
    emergency_level = Column(Integer, default=1, nullable=True)
    
    created_time = Column(DateTime, default=timezone.now)
    updated_at = Column(DateTime, default=timezone.now, onupdate=timezone.now)

    # Relationships
    patient = relationship("PatientProfile", back_populates="payments")
    appointment = relationship("QueueToken", back_populates="payment")

    @property
    def patient_name(self) -> str:
        return self.patient.user.name if self.patient and self.patient.user else "Patient"
