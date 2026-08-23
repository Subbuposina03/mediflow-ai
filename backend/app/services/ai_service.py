import json
import logging
import requests
from typing import Optional, Dict, Any
from app.core.config import settings

logger = logging.getLogger("mediflow_ai")

class AIService:
    @staticmethod
    def _call_gemini(prompt: str, api_key: str) -> Optional[str]:
        """Calls the Google Gemini API via lightweight HTTP POST request."""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }]
        }
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=10)
            if response.status_code == 200:
                data = response.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                return text.strip()
            else:
                logger.error(f"Gemini API returned error code {response.status_code}: {response.text}")
        except Exception as e:
            logger.error(f"Failed calling Gemini API: {e}")
        return None

    @staticmethod
    def _call_openai(prompt: str, api_key: str) -> Optional[str]:
        """Calls the OpenAI API via lightweight HTTP POST request."""
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
        payload = {
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.5
        }
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=10)
            if response.status_code == 200:
                data = response.json()
                text = data["choices"][0]["message"]["content"]
                return text.strip()
            else:
                logger.error(f"OpenAI API returned error code {response.status_code}: {response.text}")
        except Exception as e:
            logger.error(f"Failed calling OpenAI API: {e}")
        return None

    @classmethod
    def _generate_text(cls, prompt: str) -> Optional[str]:
        """Orchestrates API calls, preferring Gemini, then OpenAI, returning None if disabled."""
        if settings.GEMINI_API_KEY:
            res = cls._call_gemini(prompt, settings.GEMINI_API_KEY)
            if res:
                return res
        if settings.OPENAI_API_KEY:
            res = cls._call_openai(prompt, settings.OPENAI_API_KEY)
            if res:
                return res
        return None

    @classmethod
    def analyze_symptoms(cls, symptoms: str, emergency_level: int) -> Dict[str, Any]:
        """
        Analyzes a patient's symptoms using AI, returning structured advice, risk level, and suggestions.
        """
        prompt = (
            f"Analyze the following patient symptoms. Emergency severity level selected by user is {emergency_level}/5.\n"
            f"Symptoms: {symptoms}\n\n"
            "Return a raw JSON response (without markdown formatting) containing the following fields:\n"
            "- risk_level: ('Low', 'Moderate', 'High', 'Critical')\n"
            "- triage_advice: (Short clinical guidance for the patient)\n"
            "- recommended_specialty: (Suggested department, e.g. 'Cardiology', 'Pediatrics', 'General Medicine')\n"
            "- self_care_steps: (List of 2-3 basic self-care steps while they wait)"
        )
        
        result_text = cls._generate_text(prompt)
        if result_text:
            try:
                # Clean up potential markdown formatting code blocks if LLM ignored instructions
                cleaned = result_text.replace("```json", "").replace("```", "").strip()
                parsed = json.loads(cleaned)
                return {
                    "risk_level": parsed.get("risk_level", "Moderate"),
                    "triage_advice": parsed.get("triage_advice", "Please wait for your token to be called."),
                    "recommended_specialty": parsed.get("recommended_specialty", "General Medicine"),
                    "self_care_steps": parsed.get("self_care_steps", ["Rest comfortably", "Stay hydrated"])
                }
            except Exception as e:
                logger.warning(f"Could not parse LLM JSON response for symptom analysis: {e}. Output: {result_text}")

        # Local rule-based fallback
        risk = "Critical" if emergency_level >= 5 else "High" if emergency_level >= 4 else "Moderate" if emergency_level >= 3 else "Low"
        dept_suggestion = "General Medicine"
        symptoms_lower = symptoms.lower()
        if "heart" in symptoms_lower or "chest" in symptoms_lower or "cardio" in symptoms_lower:
            dept_suggestion = "Cardiology"
        elif "child" in symptoms_lower or "kid" in symptoms_lower or "baby" in symptoms_lower or "pediatric" in symptoms_lower:
            dept_suggestion = "Pediatrics"

        return {
            "risk_level": risk,
            "triage_advice": "Local Fallback Advice: Maintain sitting posture, monitor breathing, and call emergency help immediately if symptoms intensify.",
            "recommended_specialty": dept_suggestion,
            "self_care_steps": ["Ensure your vitals are checked", "Relax and avoid physical exertion", "Inform receptionist if pain scales increase"]
        }

    @classmethod
    def recommend_department(cls, symptoms: str) -> Dict[str, Any]:
        """
        Recommends the best department based on symptoms.
        """
        prompt = (
            f"You are a medical triage AI routing assistant. Analyze the patient's symptoms and recommend the most appropriate department.\n"
            f"Supported departments: 'Cardiology', 'Pediatrics', 'General Medicine'.\n\n"
            f"Symptoms: {symptoms}\n\n"
            "Return a raw JSON response (do not use markdown formatting tags, output only valid JSON string) matching this exact schema:\n"
            "{\n"
            '  "department_name": "Cardiology or Pediatrics or General Medicine",\n'
            '  "confidence": integer between 0 and 100,\n'
            '  "reasoning": "Brief clinical reasoning for this recommendation"\n'
            "}"
        )
        
        result_text = cls._generate_text(prompt)
        if result_text:
            try:
                cleaned = result_text.replace("```json", "").replace("```", "").strip()
                parsed = json.loads(cleaned)
                dept_name = parsed.get("department_name", "General Medicine")
                if dept_name not in ["Cardiology", "Pediatrics", "General Medicine"]:
                    dept_name = "General Medicine"
                confidence = parsed.get("confidence", 80)
                if confidence < 50:
                    dept_name = "General Medicine"
                return {
                    "department_name": dept_name,
                    "confidence": confidence,
                    "reasoning": parsed.get("reasoning", "Recommended based on symptom profile.")
                }
            except Exception as e:
                logger.warning(f"Could not parse LLM response for department recommendation: {e}")

        # Local rule-based fallback
        symptoms_lower = symptoms.lower()
        dept_name = "General Medicine"
        confidence = 90
        reasoning = "General medical consult suggested."

        if "chest" in symptoms_lower or "heart" in symptoms_lower or "palpitations" in symptoms_lower or "cardio" in symptoms_lower or "blood pressure" in symptoms_lower:
            dept_name = "Cardiology"
            confidence = 95
            reasoning = "Symptoms indicate potential cardiovascular concerns."
        elif "child" in symptoms_lower or "kid" in symptoms_lower or "baby" in symptoms_lower or "pediatric" in symptoms_lower:
            dept_name = "Pediatrics"
            confidence = 95
            reasoning = "Symptom profile relates to a pediatric patient."

        return {
            "department_name": dept_name,
            "confidence": confidence,
            "reasoning": reasoning
        }

    @classmethod
    def generate_patient_summary(
        cls, name: str, age: Optional[str], gender: Optional[str], symptoms: str, history: str, priority_score: float
    ) -> str:
        """
        Generates a professional clinical brief of the patient's context for the doctor.
        """
        prompt = (
            f"Generate a professional clinical summary for the attending doctor.\n"
            f"Patient Name: {name}\n"
            f"Age: {age or 'N/A'}, Gender: {gender or 'N/A'}\n"
            f"Reported Symptoms: {symptoms}\n"
            f"Chronic Medical History: {history or 'None reported'}\n"
            f"Triage Priority Score: {priority_score:.1f}\n\n"
            "Format the summary as a concise paragraphs outlining presenting condition, potential risks, and recommendations."
        )

        result_text = cls._generate_text(prompt)
        if result_text:
            return result_text

        # Heuristic local fallback
        summary_parts = []
        summary_parts.append(f"Patient {name} ({gender or 'Unknown'}, Age: {age or 'N/A'}).")
        
        if symptoms:
            summary_parts.append(f"Presents with: {symptoms.strip()}.")
        else:
            summary_parts.append("Presents for routine consultation.")

        if history:
            summary_parts.append(f"Relevant History: {history.strip()}.")
        else:
            summary_parts.append("No medical history reported.")

        if priority_score >= 6.0:
            summary_parts.append("Triage Assessment: CRITICAL/URGENT. Highly recommended immediate clinical attendance.")
        elif priority_score >= 3.0:
            summary_parts.append("Triage Assessment: MODERATE. Standard queue routing.")
        else:
            summary_parts.append("Triage Assessment: ROUTINE.")

        return " ".join(summary_parts)

    @classmethod
    def draft_prescription(cls, symptoms: str, history: str, diagnosis: str) -> str:
        """
        Drafts a suggested prescription using AI based on symptoms and diagnosis notes.
        """
        prompt = (
            f"Draft a suggested medical prescription for a patient based on the clinical details below.\n"
            f"Symptoms: {symptoms}\n"
            f"Patient Medical History: {history or 'None reported'}\n"
            f"Attending Doctor Diagnosis/Notes: {diagnosis or 'General consult'}\n\n"
            "Format the response using this exact structure:\n"
            "Prescription:\n"
            "1. [Medicine Name] [Dosage] - [Frequency] [Duration] (Instructions)\n"
            "2. [Medicine Name] ...\n\n"
            "Do not include any extra introductory text, conversational remarks, or general disclaimers. Provide only the prescription list."
        )
        
        result_text = cls._generate_text(prompt)
        if result_text:
            return result_text
            
        # Fallback local prescription template based on symptoms keywords
        fallback_lines = ["Prescription:"]
        symptoms_lower = symptoms.lower()
        if "fever" in symptoms_lower or "pain" in symptoms_lower or "headache" in symptoms_lower:
            fallback_lines.append("1. Tab Paracetamol 650mg - Twice daily after meals for 3 days")
        if "cough" in symptoms_lower or "cold" in symptoms_lower or "throat" in symptoms_lower:
            fallback_lines.append("2. Syrup Cetirizine 10ml - Once daily before bed for 5 days")
        if len(fallback_lines) == 1:
            fallback_lines.append("1. Tab Multivitamin - Once daily after breakfast for 10 days")
            
        return "\n".join(fallback_lines)
