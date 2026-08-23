from datetime import datetime, timedelta
from app.core import timezone
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.models import QueueToken, Department, DoctorProfile, PatientProfile
from app.services.ai_engine import ai_engine
from app.services.websocket import manager

class QueueEngine:
    @staticmethod
    def generate_token_number(db: Session, department_id: int) -> str:
        """
        Generates a token number sequentially for a department (e.g. CARD-001, ORTHO-042)
        """
        dept = db.query(Department).filter(Department.id == department_id).first()
        if not dept:
            raise ValueError("Department not found")
        
        prefix = "".join([word[0] for word in dept.name.split()]).upper()[:4]
        if not prefix:
            prefix = "DEPT"

        # Count tokens created today for this department to increment sequence
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0).replace(tzinfo=None)
        count = db.query(func.count(QueueToken.id)).filter(
            QueueToken.department_id == department_id,
            QueueToken.created_at >= today_start
        ).scalar()

        # Date prefix is added to make token_number globally unique across days (preventing SQLite/MySQL integrity errors)
        date_str = timezone.now().strftime("%y%m%d")
        token_number = f"{prefix}-{date_str}-{count + 1:03d}"
        return token_number

    @classmethod
    async def create_token(
        cls,
        db: Session,
        patient_id: int,
        department_id: int,
        appointment_time: datetime,
        symptoms: str = "",
        emergency_level: int = 1
    ) -> QueueToken:
        """
        Creates a new queue token, runs triage calculation, predicts initial wait time,
        and triggers a queue optimization refresh.
        """
        token_num = cls.generate_token_number(db, department_id)
        priority_score = ai_engine.calculate_priority_score(emergency_level, symptoms)

        # Get count of active/pending tokens in department
        active_pending_count = db.query(func.count(QueueToken.id)).filter(
            QueueToken.department_id == department_id,
            QueueToken.status.in_(["pending", "active"])
        ).scalar()

        dept = db.query(Department).filter(Department.id == department_id).first()
        avg_time = dept.average_consultation_time if dept else 15

        predicted_wait = ai_engine.predict_wait_time(
            active_queue_length=active_pending_count,
            avg_consultation_time=avg_time,
            emergency_level=emergency_level,
            priority_score=priority_score
        )

        db_token = QueueToken(
            token_number=token_num,
            appointment_time=timezone.to_ist(appointment_time).replace(tzinfo=None),
            status="pending",
            priority_score=priority_score,
            emergency_level=emergency_level,
            symptoms=symptoms,
            predicted_wait_time=predicted_wait,
            department_id=department_id,
            patient_id=patient_id
        )

        db.add(db_token)
        db.commit()
        db.refresh(db_token)

        # Recalculate queue order and broadcast
        await cls.optimize_and_broadcast(db, department_id)

        return db_token

    @classmethod
    async def call_next_patient(cls, db: Session, doctor_profile_id: int) -> QueueToken:
        """
        Called by a doctor. Completes their current active patient (if any),
        grabs the highest priority pending patient for their department, sets it to active,
        and broadcasts updates.
        """
        doctor = db.query(DoctorProfile).filter(DoctorProfile.id == doctor_profile_id).first()
        if not doctor:
            raise ValueError("Doctor not found")

        # 1. Complete existing active token for this doctor
        active_token = db.query(QueueToken).filter(
            QueueToken.doctor_id == doctor_profile_id,
            QueueToken.status == "active"
        ).first()

        if active_token:
            active_token.status = "completed"
            # Calculate actual wait time in minutes
            wait_diff = timezone.now().replace(tzinfo=None) - active_token.created_at
            active_token.actual_wait_time = int(max(1, wait_diff.total_seconds() / 60))
            db.commit()

        # 2. Get next pending token from optimized queue list
        pending_tokens = db.query(QueueToken).filter(
            QueueToken.department_id == doctor.department_id,
            QueueToken.status == "pending"
        ).all()

        if not pending_tokens:
            db.commit()
            # Broadcast update because we completed a token
            await cls.optimize_and_broadcast(db, doctor.department_id)
            return None

        # Convert to dictionary representation for our AI sorting method
        tokens_list = []
        for t in pending_tokens:
            tokens_list.append({
                "id": t.id,
                "appointment_time": t.appointment_time,
                "priority_score": t.priority_score,
                "emergency_level": t.emergency_level,
                "created_at": t.created_at
            })

        # Run AI sorting
        sorted_tokens = ai_engine.optimize_queue(tokens_list)
        next_token_meta = sorted_tokens[0]

        # Update the selected token to Active
        next_token = db.query(QueueToken).filter(QueueToken.id == next_token_meta["id"]).first()
        next_token.status = "active"
        next_token.doctor_id = doctor_profile_id
        db.commit()
        db.refresh(next_token)

        # 3. Recalculate remaining queue predictions and broadcast
        await cls.optimize_and_broadcast(db, doctor.department_id)

        return next_token

    @classmethod
    async def update_token_status(cls, db: Session, token_id: int, status: str, notes: str = None) -> QueueToken:
        """
        Updates token status to completed, skipped, or cancelled.
        """
        token = db.query(QueueToken).filter(QueueToken.id == token_id).first()
        if not token:
            raise ValueError("Token not found")

        token.status = status
        if notes is not None:
            token.consultation_notes = notes

        if status == "completed" and token.actual_wait_time is None:
            wait_diff = timezone.now().replace(tzinfo=None) - token.created_at
            token.actual_wait_time = int(max(1, wait_diff.total_seconds() / 60))

        db.commit()
        db.refresh(token)

        # Recalculate and broadcast
        await cls.optimize_and_broadcast(db, token.department_id)

        return token

    @classmethod
    async def optimize_and_broadcast(cls, db: Session, department_id: int):
        """
        Calculates optimal order of all pending tokens in a department, updates their predicted wait times,
        and broadcasts the new queue state to connected clients.
        """
        # Get count of active doctors in the department to divide load
        available_doctors = db.query(DoctorProfile).filter(
            DoctorProfile.department_id == department_id,
            DoctorProfile.is_available == True
        ).all()
        doctors_count = max(1, len(available_doctors))

        dept = db.query(Department).filter(Department.id == department_id).first()
        avg_consult_time = dept.average_consultation_time if dept else 15

        # Get all pending tokens in department
        pending_tokens = db.query(QueueToken).filter(
            QueueToken.department_id == department_id,
            QueueToken.status == "pending"
        ).all()

        if pending_tokens:
            tokens_list = [{
                "id": t.id,
                "appointment_time": t.appointment_time,
                "priority_score": t.priority_score,
                "emergency_level": t.emergency_level,
                "created_at": t.created_at
            } for t in pending_tokens]

            # Reorder
            sorted_meta = ai_engine.optimize_queue(tokens_list)

            # Update database records with the new wait times sequentially
            for rank, item in enumerate(sorted_meta):
                token = db.query(QueueToken).filter(QueueToken.id == item["id"]).first()
                if token:
                    # Expected wait time based on position and active workforce capacity
                    token.predicted_wait_time = int(round(((rank + 1) * avg_consult_time) / doctors_count))
            
            db.commit()

        # Build active + pending token summary payload for WebSocket broadcast
        active_tokens = db.query(QueueToken).filter(
            QueueToken.department_id == department_id,
            QueueToken.status == "active"
        ).all()

        updated_pending_tokens = db.query(QueueToken).filter(
            QueueToken.department_id == department_id,
            QueueToken.status == "pending"
        ).all()

        # Re-fetch and sort them for consistency
        payload_pending = []
        if updated_pending_tokens:
            meta_list = [{
                "id": t.id,
                "token_number": t.token_number,
                "patient_name": t.patient.user.name,
                "priority_score": t.priority_score,
                "predicted_wait_time": t.predicted_wait_time,
                "appointment_time": t.appointment_time,
                "emergency_level": t.emergency_level,
                "created_at": t.created_at
            } for t in updated_pending_tokens]

            # Re-sort for display consistency
            def sort_key(x):
                # Similar sorting key format for websocket consistency
                time_diff = (x["appointment_time"] - timezone.now().replace(tzinfo=None)).total_seconds()
                return time_diff - x["priority_score"] * 900.0 - x["emergency_level"] * 1800.0

            sorted_payload = sorted(meta_list, key=sort_key)
            payload_pending = [{
                "id": x["id"],
                "token_number": x["token_number"],
                "patient_name": x["patient_name"],
                "predicted_wait_time": x["predicted_wait_time"]
            } for x in sorted_payload]

        payload = {
            "type": "queue_update",
            "department_id": department_id,
            "active": [{
                "id": a.id,
                "token_number": a.token_number,
                "doctor_name": a.doctor.user.name if a.doctor else "Unassigned",
                "room_number": a.doctor.room_number if a.doctor else "N/A",
                "patient_name": a.patient.user.name
            } for a in active_tokens],
            "pending": payload_pending
        }

        # Broadcast message to this department room
        await manager.broadcast(payload, department_id=department_id)
        # Also broadcast globally to anyone connected (like global dashboards)
        await manager.broadcast(payload, department_id=None)
