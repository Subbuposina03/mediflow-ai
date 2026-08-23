from pydantic import BaseModel, EmailStr, Field, field_serializer
from typing import Optional, List
from datetime import datetime
from app.core.timezone import IST

class ISTBaseModel(BaseModel):
    @field_serializer("created_at", "updated_at", "appointment_time", check_fields=False)
    def serialize_dt(self, dt: datetime) -> Optional[str]:
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=IST)
        else:
            dt = dt.astimezone(IST)
        return dt.isoformat()

# --- Token & Auth Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    user_id: Optional[str] = None


# --- User Schemas ---
class UserBase(ISTBaseModel):
    email: EmailStr
    name: str
    phone: Optional[str] = None

class UserCreate(UserBase):
    password: str
    role: str = "patient" # admin, doctor, patient

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None

class UserResponse(UserBase):
    id: int
    role: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Profile Schemas ---
class PatientProfileBase(ISTBaseModel):
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    medical_history: Optional[str] = None

class PatientProfileCreate(PatientProfileBase):
    pass

class PatientProfileResponse(PatientProfileBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True

class PatientFullResponse(ISTBaseModel):
    id: int
    user: UserResponse
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    medical_history: Optional[str] = None

    class Config:
        from_attributes = True


class PaymentResponseSchema(BaseModel):
    id: int
    appointment_id: Optional[int] = None
    patient_id: int
    payment_method: str
    amount: float
    currency: str
    payment_status: str
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    stripe_checkout_session_id: Optional[str] = None
    stripe_payment_intent_id: Optional[str] = None
    receipt_number: str
    utr_number: Optional[str] = None
    screenshot_path: Optional[str] = None
    admin_remarks: Optional[str] = None
    patient_name: Optional[str] = None
    verified_by: Optional[str] = None
    verified_time: Optional[datetime] = None
    created_time: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DoctorProfileBase(ISTBaseModel):
    specialization: Optional[str] = None
    room_number: Optional[str] = None
    is_available: bool = True

class DoctorProfileCreate(DoctorProfileBase):
    department_id: int

class DoctorProfileResponse(DoctorProfileBase):
    id: int
    user_id: int
    department_id: Optional[int] = None

    class Config:
        from_attributes = True

class DoctorFullResponse(ISTBaseModel):
    id: int
    user: UserResponse
    department_id: Optional[int] = None
    specialization: Optional[str] = None
    room_number: Optional[str] = None
    is_available: bool

    class Config:
        from_attributes = True


class DoctorAdminUpdate(ISTBaseModel):
    department_id: Optional[int] = None
    specialization: Optional[str] = None
    room_number: Optional[str] = None
    is_available: Optional[bool] = None


# --- Department Schemas ---
class DepartmentBase(ISTBaseModel):
    name: str
    description: Optional[str] = None
    average_consultation_time: int = 15
    consultation_fee: int = 500

class DepartmentCreate(DepartmentBase):
    pass

class DepartmentResponse(DepartmentBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- Queue Token Schemas ---
class QueueTokenBase(ISTBaseModel):
    symptoms: Optional[str] = None
    emergency_level: int = Field(default=1, ge=1, le=5)

class QueueTokenCreate(QueueTokenBase):
    department_id: int
    appointment_time: datetime

class QueueTokenUpdateStatus(ISTBaseModel):
    status: str # pending, active, completed, skipped, cancelled
    consultation_notes: Optional[str] = None

class QueueTokenResponse(ISTBaseModel):
    id: int
    token_number: str
    appointment_time: datetime
    status: str
    priority_score: float
    emergency_level: int
    symptoms: Optional[str] = None
    predicted_wait_time: int
    actual_wait_time: Optional[int] = None
    department_id: int
    doctor_id: Optional[int] = None
    patient_id: int
    consultation_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    payment: Optional[PaymentResponseSchema] = None

    class Config:
        from_attributes = True

class QueueTokenDetailedResponse(QueueTokenResponse):
    patient: PatientFullResponse
    doctor: Optional[DoctorFullResponse] = None
    department: DepartmentResponse

    class Config:
        from_attributes = True


# --- Analytics & Dashboard Schemas ---
class AdminDashboardMetrics(ISTBaseModel):
    total_patients: int
    total_doctors: int
    total_tokens_today: int
    average_wait_time: int
    completed_tokens: int
    skipped_tokens: int
    cancelled_tokens: int
    department_loads: List[dict] # name, active_count, avg_wait


# --- Symptom Analysis Schemas ---
class SymptomAnalysisRequest(ISTBaseModel):
    symptoms: str
    emergency_level: int = Field(default=1, ge=1, le=5)

class SymptomAnalysisResponse(ISTBaseModel):
    risk_level: str
    triage_advice: str
    recommended_specialty: str
    self_care_steps: List[str]


# --- Medical Report Schemas ---
class MedicalReportResponse(ISTBaseModel):
    id: int
    patient_id: int
    file_name: str
    mime_type: str
    file_size: int
    ai_summary: Optional[str] = ""
    created_at: datetime

    class Config:
        from_attributes = True


class MedicalReportStats(ISTBaseModel):
    total_reports: int
    total_size_bytes: int
    type_counts: dict


# --- AI Patient Summary Schema ---
class AIPatientSummaryResponse(ISTBaseModel):
    patient_info: dict
    medical_history: dict
    previous_consultations: dict
    current_visit: dict
    previous_prescriptions: List[str]
    medical_reports: dict
    risk_assessment: str
    ai_recommendation: List[str]


# --- AI Department Recommendation Schemas ---
class DepartmentRecommendationRequest(BaseModel):
    symptoms: str


class DepartmentRecommendationResponse(BaseModel):
    department_name: str
    department_id: int
    confidence: int
    reasoning: str


# --- Counter Payment Integration ---

class CounterSubmitRequest(BaseModel):
    department_id: int
    doctor_id: Optional[int] = None
    appointment_time: datetime
    symptoms: Optional[str] = None
    emergency_level: int = 1

class AdminVerifyPaymentRequest(BaseModel):
    remarks: Optional[str] = None



class AdminPaymentDashboardResponse(BaseModel):
    today_revenue: float
    monthly_revenue: float
    successful_payments: int
    failed_payments: int
    revenue_by_department: List[dict]
    recent_transactions: List[dict]

class DepartmentUpdateSchema(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    average_consultation_time: Optional[int] = None
    consultation_fee: Optional[int] = None
