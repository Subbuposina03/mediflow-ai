import requests
from datetime import datetime, timezone, timedelta

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

    print("\n2. Book an appointment for General Medicine (dept 2)...")
    book_time = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    res = requests.post(
        f"{API_PREFIX}/queue/book",
        headers=patient_headers,
        json={
            "department_id": 2,
            "symptoms": "Mild cough and minor fatigue.",
            "emergency_level": 2,
            "appointment_time": book_time
        }
    )
    if res.status_code != 200:
        print(f"Patient booking failed: {res.text}")
        return
    booked_token = res.json()
    print(f"Booked Token Details: ID: {booked_token['id']}, Number: {booked_token['token_number']}, Status: {booked_token['status']}, DeptID: {booked_token['department_id']}")

    print("\n3. Log in as doctor...")
    res = requests.post(f"{API_PREFIX}/auth/login", data={"username": "doctor@mediflow.com", "password": "doctor123"})
    if res.status_code != 200:
        print(f"Doctor login failed: {res.text}")
        return
    doctor_token = res.json()["access_token"]
    doctor_headers = {"Authorization": f"Bearer {doctor_token}"}

    print("\n4. Fetch doctor profile...")
    res = requests.get(f"{API_PREFIX}/doctors/profile", headers=doctor_headers)
    if res.status_code != 200:
        print(f"Fetch doctor profile failed: {res.text}")
        return
    doctor_profile = res.json()
    print(f"Doctor Profile: ID: {doctor_profile['id']}, DeptID: {doctor_profile['department_id']}, Available: {doctor_profile['is_available']}")

    print("\n5. Fetch Live Queue for doctor's department...")
    res = requests.get(f"{API_PREFIX}/queue/departments/{doctor_profile['department_id']}/live")
    if res.status_code != 200:
        print(f"Fetch live queue failed: {res.text}")
        return
    live_queue = res.json()
    print("Active Tokens in Live Queue:")
    for a in live_queue["active"]:
        print(f"  - Token: {a['token_number']}, Patient: {a['patient_name']}, Room: {a['room_number']}")
    print("Pending Tokens in Live Queue:")
    for p in live_queue["pending"]:
        print(f"  - Token: {p['token_number']}, Patient: {p['patient_name']}, Wait: ~{p['predicted_wait_time']}m")

    # Clean up by canceling the token we just booked so we don't pollute the db
    print("\n6. Clean up: cancel the booked token...")
    res = requests.post(f"{API_PREFIX}/queue/cancel/{booked_token['id']}", headers=patient_headers)
    if res.status_code == 200:
        print("Token cancelled successfully.")
    else:
        print(f"Failed to cancel token: {res.text}")

if __name__ == "__main__":
    run()
