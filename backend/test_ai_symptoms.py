import requests

BASE_URL = "http://127.0.0.1:8005"
API_PREFIX = f"{BASE_URL}/api/v1"

def run():
    print("1. Log in as patient...")
    res = requests.post(f"{API_PREFIX}/auth/login", data={"username": "patient@mediflow.com", "password": "patient123"})
    if res.status_code != 200:
        print(f"Patient login failed: {res.text}")
        return
    patient_token = res.json()["access_token"]
    patient_headers = {"Authorization": f"Bearer {patient_token}"}

    print("\n2. Querying AI Symptom Analysis endpoint (/symptoms/analyze)...")
    res = requests.post(
        f"{API_PREFIX}/queue/symptoms/analyze",
        headers=patient_headers,
        json={
            "symptoms": "Severe pain in chest radiating to left arm. Feeling short of breath.",
            "emergency_level": 4
        }
    )
    if res.status_code != 200:
        print(f"AI Symptom Analysis failed: {res.text}")
        return
    analysis = res.json()
    print("Symptom Analysis Response:")
    print(f"  - Risk Level: {analysis['risk_level']}")
    print(f"  - Triage Advice: {analysis['triage_advice']}")
    print(f"  - Specialty Suggestion: {analysis['recommended_specialty']}")
    print(f"  - Self-Care Steps: {', '.join(analysis['self_care_steps'])}")

    print("\n3. Log in as doctor...")
    res = requests.post(f"{API_PREFIX}/auth/login", data={"username": "doctor@mediflow.com", "password": "doctor123"})
    if res.status_code != 200:
        print(f"Doctor login failed: {res.text}")
        return
    doctor_token = res.json()["access_token"]
    doctor_headers = {"Authorization": f"Bearer {doctor_token}"}

    print("\n4. Fetching AI Patient Summary for patient ID 1...")
    res = requests.get(f"{API_PREFIX}/doctors/patient-summary/1", headers=doctor_headers)
    if res.status_code != 200:
        print(f"AI Patient Summary fetch failed: {res.text}")
        return
    summary_data = res.json()
    print("Patient Summary Brief:")
    print(f"  {summary_data['summary']}")

if __name__ == "__main__":
    run()
