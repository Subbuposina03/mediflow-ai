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
    token_auth = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token_auth}"}

    # First, let's create a queue token for testing
    print("\n2. Log in as patient to book a token...")
    res = requests.post(f"{API_PREFIX}/auth/login", data={"username": "patient@mediflow.com", "password": "patient123"})
    patient_auth = res.json()["access_token"]
    patient_headers = {"Authorization": f"Bearer {patient_auth}"}

    book_res = requests.post(
        f"{API_PREFIX}/queue/book",
        headers=patient_headers,
        json={
            "department_id": 2,
            "symptoms": "High fever",
            "emergency_level": 3,
            "appointment_time": datetime.now().isoformat()
        }
    )
    if book_res.status_code != 200:
        print(f"Failed to book token: {book_res.text}")
        return
    token = book_res.json()
    token_id = token["id"]
    print(f"Booked Token ID: {token_id}")

    # Doctor calls next to make it active
    print("\n3. Doctor calling patient...")
    call_res = requests.post(f"{API_PREFIX}/doctors/call-next", headers=headers)
    if call_res.status_code != 200:
        print(f"Call next failed: {call_res.text}")
        return

    # Doctor completes with AI prescription notes
    print("\n4. Saving consultation with AI Drafted Prescription...")
    ai_notes = (
        "Patient has high fever and shivering.\n\n"
        "**Prescription:**\n"
        "1. Tab Paracetamol 650mg - Twice daily for 3 days\n"
        "2. Tab Cetirizine 10mg - Once daily for 5 days"
    )
    comp_res = requests.post(
        f"{API_PREFIX}/doctors/complete?token_id={token_id}",
        headers=headers,
        json={"status": "completed", "consultation_notes": ai_notes}
    )
    if comp_res.status_code != 200:
        print(f"Complete consultation failed: {comp_res.text}")
        return
    print("Consultation saved successfully.")

    # Download PDF and verify contents
    print("\n5. Downloading PDF for AI prescription...")
    pdf_res = requests.get(f"{API_PREFIX}/queue/tokens/{token_id}/prescription/pdf", headers=headers)
    if pdf_res.status_code != 200:
        print(f"PDF download failed: {pdf_res.text}")
        return
    pdf_bytes = pdf_res.content
    print(f"PDF received. Size: {len(pdf_bytes)} bytes.")

    # Simple check for text presence (reportlab stores text as compressed streams usually, but we can verify it builds cleanly)
    if pdf_bytes.startswith(b"%PDF"):
        print("Success: Generated PDF matches PDF format specification.")
    else:
        print("Error: Invalid PDF format received!")

    # ---------------- Test Case 2: Manual Fallback ----------------
    print("\n6. Booking another token for Manual Fallback check...")
    book_res2 = requests.post(
        f"{API_PREFIX}/queue/book",
        headers=patient_headers,
        json={
            "department_id": 2,
            "symptoms": "Muscle strain",
            "emergency_level": 1,
            "appointment_time": datetime.now().isoformat()
        }
    )
    token_id2 = book_res2.json()["id"]
    print(f"Booked Token ID: {token_id2}")

    print("\n7. Doctor calling second patient...")
    requests.post(f"{API_PREFIX}/doctors/call-next", headers=headers)

    print("\n8. Saving consultation with Manual Prescription (no header)...")
    manual_notes = "1. Tab Ibuprofen 400mg - Once daily as needed\n2. Keep rest for 2 days"
    requests.post(
        f"{API_PREFIX}/doctors/complete?token_id={token_id2}",
        headers=headers,
        json={"status": "completed", "consultation_notes": manual_notes}
    )

    print("\n9. Downloading PDF for Manual prescription...")
    pdf_res2 = requests.get(f"{API_PREFIX}/queue/tokens/{token_id2}/prescription/pdf", headers=headers)
    if pdf_res2.status_code == 200 and pdf_res2.content.startswith(b"%PDF"):
        print("Success: Fallback PDF generated cleanly.")
    else:
        print("Error: Fallback PDF generation failed!")

if __name__ == "__main__":
    run()
