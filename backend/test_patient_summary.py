import requests
from datetime import datetime

BASE_URL = "http://127.0.0.1:8005"
API_PREFIX = f"{BASE_URL}/api/v1"

def run():
    print("1. Log in as doctor...")
    res = requests.post(f"{API_PREFIX}/auth/login", data={"username": "doctor@mediflow.com", "password": "doctor123"})
    if res.status_code != 200:
        print(f"Doctor login failed: {res.text}")
        return
    doctor_token = res.json()["access_token"]
    doctor_headers = {"Authorization": f"Bearer {doctor_token}"}

    # Fetch summary for patient 1 (nithin)
    print("\n2. Fetching structured AI Patient Summary for patient ID 1...")
    res = requests.get(f"{API_PREFIX}/doctors/patient-ai-summary/1", headers=doctor_headers)
    if res.status_code != 200:
        print(f"Failed to fetch AI Patient Summary: {res.text}")
        return
    
    summary = res.json()
    print("AI Patient Summary retrieved successfully!")
    
    print("\n3. Verifying demographics:")
    print(f"  Name: {summary['patient_info']['name']}")
    print(f"  Age: {summary['patient_info']['age']}")
    print(f"  Gender: {summary['patient_info']['gender']}")
    print(f"  Blood Group: {summary['patient_info']['blood_group']}")
    
    print("\n4. Verifying medical history:")
    print(f"  Chronic Diseases: {summary['medical_history']['chronic_diseases']}")
    print(f"  Allergies: {summary['medical_history']['allergies']}")
    print(f"  Previous Diagnoses: {summary['medical_history']['previous_diagnoses']}")

    print("\n5. Verifying previous visits info:")
    print(f"  Total Visits: {summary['previous_consultations']['total_visits']}")
    print(f"  Last Visit Date: {summary['previous_consultations']['last_visit_date']}")
    print(f"  Previous Attending Doctors: {summary['previous_consultations']['previous_doctors']}")

    print("\n6. Verifying previous prescriptions:")
    print(f"  Prescriptions list: {summary['previous_prescriptions']}")

    print("\n7. Verifying medical reports counts & findings:")
    print(f"  Reports count: {summary['medical_reports']['count']}")
    print(f"  Findings: {summary['medical_reports']['findings_summary']}")

    print("\n8. Verifying clinical risk assessment:")
    print(f"  Risk level: {summary['risk_assessment']}")

    print("\n9. Verifying AI Recommendations:")
    print(f"  Recommendations: {summary['ai_recommendation']}")
    
    # Assert type checks to ensure it complies strictly with Pydantic model
    assert isinstance(summary['patient_info'], dict)
    assert isinstance(summary['medical_history'], dict)
    assert isinstance(summary['previous_consultations'], dict)
    assert isinstance(summary['current_visit'], dict)
    assert isinstance(summary['previous_prescriptions'], list)
    assert isinstance(summary['medical_reports'], dict)
    assert isinstance(summary['risk_assessment'], str)
    assert isinstance(summary['ai_recommendation'], list)
    
    print("\nAll schema properties and Pydantic types verified successfully!")

if __name__ == "__main__":
    run()
