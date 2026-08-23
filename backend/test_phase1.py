import requests

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

    print("\n2. Requesting AI Prescription Draft...")
    # Using token ID 1
    res = requests.post(
        f"{API_PREFIX}/doctors/consultations/1/draft-prescription",
        headers=doctor_headers,
        json={"diagnosis": "Mild cough, slight fever, fatigue."}
    )
    if res.status_code != 200:
        print(f"AI Prescription Draft failed: {res.text}")
        return
    draft_data = res.json()
    print("AI Prescription Draft Output:")
    print(draft_data["draft"])

    print("\n3. Downloading Prescription PDF...")
    res = requests.get(f"{API_PREFIX}/queue/tokens/1/prescription/pdf", headers=doctor_headers)
    if res.status_code != 200:
        print(f"Prescription PDF download failed: {res.text}")
        return
    print(f"PDF Download Success: Received {len(res.content)} bytes of PDF content.")
    # Check PDF magic number
    if res.content.startswith(b"%PDF"):
        print("Verified: Content is a valid PDF document.")
    else:
        print("Warning: Content does not start with PDF signature.")

    print("\n4. Exporting Consultation History (CSV)...")
    res = requests.get(f"{API_PREFIX}/queue/history/export", headers=doctor_headers)
    if res.status_code != 200:
        print(f"History CSV export failed: {res.text}")
        return
    csv_text = res.text
    print(f"CSV Export Success: Received {len(res.content)} bytes of CSV content.")
    lines = csv_text.split("\n")
    print(f"First line (Headers): {lines[0]}")
    if len(lines) > 1:
        print(f"Second line (Row 1): {lines[1]}")

if __name__ == "__main__":
    run()
