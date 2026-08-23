import re
from datetime import datetime
import numpy as np
from typing import List, Dict, Any
from sklearn.linear_model import LinearRegression, LogisticRegression

class AIEngine:
    def __init__(self):
        # We initialize simple models that can be retrained.
        # Wait time predictor: features = [queue_length, avg_consultation_time, emergency_level, priority_score]
        self._wait_time_model = LinearRegression()
        # Pre-fit with some basic coefficients so it works immediately
        X_init = np.array([[1, 15, 1, 1.0], [5, 15, 1, 1.0], [2, 20, 3, 3.5], [10, 10, 5, 7.5]])
        y_init = np.array([15, 75, 25, 45])  # expected wait times in minutes
        self._wait_time_model.fit(X_init, y_init)

        # No-show predictor: features = [lead_time_hours, historic_no_show_ratio, hour_of_day]
        self._noshow_model = LogisticRegression()
        X_ns = np.array([[2, 0.0, 9], [24, 0.1, 14], [168, 0.5, 17], [0.5, 0.0, 10]])
        y_ns = np.array([0, 0, 1, 0])  # 1 = no-show, 0 = show
        self._noshow_model.fit(X_ns, y_ns)

    def calculate_priority_score(self, emergency_level: int, symptoms: str) -> float:
        """
        Calculates triage priority score.
        Emergency level is 1 to 5.
        Symptom text analysis adds gravity weight.
        """
        score = float(emergency_level)
        if not symptoms:
            return score

        # Keyword mapping for emergency weighting
        critical_keywords = {
            r"chest\s*pain|heart\s*attack|myocardial": 3.0,
            r"stroke|paralysis|numbness": 3.0,
            r"breath|dyspnea|suffocating|choking": 2.5,
            r"unconscious|passed\s*out|faint": 2.5,
            r"bleed|hemorrhage|blood": 2.0,
            r"fracture|broken\s*bone|trauma": 2.0,
            r"fever|infection|pain": 0.5,
        }

        symptoms_lower = symptoms.lower()
        for pattern, weight in critical_keywords.items():
            if re.search(pattern, symptoms_lower):
                score += weight

        return round(score, 2)

    def predict_wait_time(self, active_queue_length: int, avg_consultation_time: int, emergency_level: int, priority_score: float) -> int:
        """
        Predicts wait time in minutes for a new patient joining the queue.
        Uses a pre-trained regression model, ensuring it remains positive.
        """
        features = np.array([[active_queue_length, avg_consultation_time, emergency_level, priority_score]])
        predicted = self._wait_time_model.predict(features)[0]
        # Queue wait time cannot be less than 0. If active queue length is 0, wait time is 0.
        if active_queue_length == 0:
            return 0
        return max(5, int(round(predicted)))

    def predict_no_show_probability(self, lead_time_hours: float, patient_past_cancelled_ratio: float, appointment_hour: int) -> float:
        """
        Predicts probability of a patient not showing up for their appointment.
        """
        features = np.array([[lead_time_hours, patient_past_cancelled_ratio, appointment_hour]])
        prob = self._noshow_model.predict_proba(features)[0][1]
        return round(float(prob), 3)

    def optimize_queue(self, pending_tokens: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Orders the queue based on priority score, appointment time, and emergency level.
        High priority scores bubble to the top, but we keep an appointment_time factor to avoid starvation.
        
        Each item in pending_tokens should have:
        - 'id'
        - 'appointment_time' (datetime)
        - 'priority_score' (float)
        - 'emergency_level' (int)
        - 'created_at' (datetime)
        """
        if not pending_tokens:
            return []

        # We create a sorting key that combines appointment seniority and priority score.
        # A priority score of 1.0 is standard. Higher scores (e.g. 5.0+) subtract seconds from the effective sort time,
        # booking them earlier in the processing queue.
        from app.core import timezone
        now = timezone.now().replace(tzinfo=None)
        
        def get_sort_score(token):
            app_time = token['appointment_time']
            time_diff_seconds = (app_time - now).total_seconds()
            
            # 1 priority point is worth 15 minutes (900 seconds) of waiting buffer
            priority_bonus_seconds = token['priority_score'] * 900.0
            
            # Emergency levels (1 to 5) add a secondary direct override
            emergency_bonus_seconds = token['emergency_level'] * 1800.0
            
            # Lower score means higher priority in the list
            return time_diff_seconds - priority_bonus_seconds - emergency_bonus_seconds

        sorted_tokens = sorted(pending_tokens, key=get_sort_score)
        return sorted_tokens

    def generate_patient_summary(self, name: str, age_str: str, gender: str, symptoms: str, medical_history: str, priority_score: float) -> str:
        """
        Generates clinical brief for the doctor using NLP rules.
        """
        from app.services.ai_service import AIService
        return AIService.generate_patient_summary(
            name=name,
            age=age_str,
            gender=gender,
            symptoms=symptoms,
            history=medical_history,
            priority_score=priority_score
        )

    def retrain_models(self, wait_time_data: List[Dict[str, Any]], no_show_data: List[Dict[str, Any]]):
        """
        Dynamic online retraining method.
        Called by background worker or admin tasks to update coefficients based on real hospital events.
        """
        if len(wait_time_data) >= 10:
            X = []
            y = []
            for item in wait_time_data:
                X.append([item['queue_length'], item['avg_consultation_time'], item['emergency_level'], item['priority_score']])
                y.append(item['actual_wait_time'])
            self._wait_time_model.fit(np.array(X), np.array(y))

        if len(no_show_data) >= 10:
            X = []
            y = []
            for item in no_show_data:
                X.append([item['lead_time_hours'], item['historic_no_show_ratio'], item['appointment_hour']])
                y.append(item['did_not_show'])
            self._noshow_model.fit(np.array(X), np.array(y))

ai_engine = AIEngine()
