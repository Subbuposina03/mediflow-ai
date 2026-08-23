import requests
from datetime import datetime

BASE_URL = "http://127.0.0.1:8005"
API_PREFIX = f"{BASE_URL}/api/v1"

def run():
    print("1. Logging in as Patient John Doe...")
    res = requests.post(f"{API_PREFIX}/auth/login", data={"username": "patient@mediflow.com", "password": "patient123"})
    if res.status_code != 200:
        print(f"Patient login failed: {res.text}")
        return
    patient_token = res.json()["access_token"]
    patient_headers = {"Authorization": f"Bearer {patient_token}"}

    # Book a General Medicine token (Department ID 2)
    print("\n2. Booking General Medicine token...")
    book_gen = requests.post(
        f"{API_PREFIX}/queue/book",
        headers=patient_headers,
        json={
            "department_id": 2,
            "symptoms": "General cold symptoms",
            "emergency_level": 1,
            "appointment_time": datetime.now().isoformat()
        }
    )
    assert book_gen.status_code == 200
    token_gen_id = book_gen.json()["id"]
    token_gen_num = book_gen.json()["token_number"]
    print(f"Booked General Medicine: {token_gen_num} (ID: {token_gen_id})")

    # Book a Cardiology token (Department ID 1)
    print("\n3. Booking Cardiology token...")
    book_cardio = requests.post(
        f"{API_PREFIX}/queue/book",
        headers=patient_headers,
        json={
            "department_id": 1,
            "symptoms": "Chest pressure",
            "emergency_level": 4,
            "appointment_time": datetime.now().isoformat()
        }
    )
    assert book_cardio.status_code == 200
    token_cardio_id = book_cardio.json()["id"]
    token_cardio_num = book_cardio.json()["token_number"]
    print(f"Booked Cardiology: {token_cardio_num} (ID: {token_cardio_id})")

    # Book a Pediatrics token (Department ID 3)
    print("\n4. Booking Pediatrics token...")
    book_peds = requests.post(
        f"{API_PREFIX}/queue/book",
        headers=patient_headers,
        json={
            "department_id": 3,
            "symptoms": "Child mild fever",
            "emergency_level": 2,
            "appointment_time": datetime.now().isoformat()
        }
    )
    assert book_peds.status_code == 200
    token_peds_id = book_peds.json()["id"]
    token_peds_num = book_peds.json()["token_number"]
    print(f"Booked Pediatrics: {token_peds_num} (ID: {token_peds_id})")

    # ---------------- TEST GENERAL MEDICINE DOCTOR ----------------
    print("\n5. Logging in as General Medicine Doctor (Dr. Sarah Jenkins)...")
    res = requests.post(f"{API_PREFIX}/auth/login", data={"username": "doctor@mediflow.com", "password": "doctor123"})
    assert res.status_code == 200
    doc_gen_headers = {"Authorization": f"Bearer {res.json()['access_token']}"}

    print("  Checking General Medicine live queue...")
    res_queue = requests.get(f"{API_PREFIX}/queue/departments/2/live", headers=doc_gen_headers)
    assert res_queue.status_code == 200
    pending = [x["id"] for x in res_queue.json()["pending"]]
    print(f"  GM Pending IDs: {pending}")
    assert token_gen_id in pending
    assert token_cardio_id not in pending
    assert token_peds_id not in pending
    print("  Verification Succeeded: General Medicine doctor only sees General Medicine patients!")

    print("  Dr. Sarah Jenkins calling next patient...")
    res_call = requests.post(f"{API_PREFIX}/doctors/call-next", headers=doc_gen_headers)
    assert res_call.status_code == 200
    print(f"  Called patient token: {res_call.json()['token_number']}")
    assert res_call.json()["id"] == token_gen_id

    # ---------------- TEST CARDIOLOGY DOCTOR ----------------
    print("\n6. Logging in as Cardiology Doctor (Dr. Michael Brown)...")
    res = requests.post(f"{API_PREFIX}/auth/login", data={"username": "cardiology@mediflow.com", "password": "doctor123"})
    assert res.status_code == 200
    doc_cardio_headers = {"Authorization": f"Bearer {res.json()['access_token']}"}

    print("  Checking Cardiology live queue...")
    res_queue = requests.get(f"{API_PREFIX}/queue/departments/1/live", headers=doc_cardio_headers)
    assert res_queue.status_code == 200
    pending = [x["id"] for x in res_queue.json()["pending"]]
    print(f"  Cardiology Pending IDs: {pending}")
    assert token_cardio_id in pending
    assert token_gen_id not in pending
    assert token_peds_id not in pending
    print("  Verification Succeeded: Cardiology doctor only sees Cardiology patients!")

    print("  Dr. Michael Brown calling next patient...")
    res_call = requests.post(f"{API_PREFIX}/doctors/call-next", headers=doc_cardio_headers)
    assert res_call.status_code == 200
    print(f"  Called patient token: {res_call.json()['token_number']}")
    assert res_call.json()["id"] == token_cardio_id

    # ---------------- TEST PEDIATRICS DOCTOR ----------------
    print("\n7. Logging in as Pediatrics Doctor (Dr. Emily Wilson)...")
    res = requests.post(f"{API_PREFIX}/auth/login", data={"username": "pediatrics@mediflow.com", "password": "doctor123"})
    assert res.status_code == 200
    doc_peds_headers = {"Authorization": f"Bearer {res.json()['access_token']}"}

    print("  Checking Pediatrics live queue...")
    res_queue = requests.get(f"{API_PREFIX}/queue/departments/3/live", headers=doc_peds_headers)
    assert res_queue.status_code == 200
    pending = [x["id"] for x in res_queue.json()["pending"]]
    print(f"  Pediatrics Pending IDs: {pending}")
    assert token_peds_id in pending
    assert token_gen_id not in pending
    assert token_cardio_id not in pending
    print("  Verification Succeeded: Pediatrics doctor only sees Pediatrics patients!")

    print("  Dr. Emily Wilson calling next patient...")
    res_call = requests.post(f"{API_PREFIX}/doctors/call-next", headers=doc_peds_headers)
    assert res_call.status_code == 200
    print(f"  Called patient token: {res_call.json()['token_number']}")
    assert res_call.json()["id"] == token_peds_id

    # Complete all consultations to clean up queue
    print("\n8. Cleaning up active consultations...")
    requests.post(f"{API_PREFIX}/doctors/complete?token_id={token_gen_id}", headers=doc_gen_headers, json={"status": "completed", "consultation_notes": "Prescription:\n1. Drink water"})
    requests.post(f"{API_PREFIX}/doctors/complete?token_id={token_cardio_id}", headers=doc_cardio_headers, json={"status": "completed", "consultation_notes": "Prescription:\n1. Rest"})
    requests.post(f"{API_PREFIX}/doctors/complete?token_id={token_peds_id}", headers=doc_peds_headers, json={"status": "completed", "consultation_notes": "Prescription:\n1. Syrup cetirizine"})
    
    print("\nAll Multi-Doctor Isolation & Department Routing tests passed successfully!")

if __name__ == "__main__":
    run()
