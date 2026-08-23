import os
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

    print("\n2. Log in as doctor...")
    res = requests.post(f"{API_PREFIX}/auth/login", data={"username": "doctor@mediflow.com", "password": "doctor123"})
    if res.status_code != 200:
        print(f"Doctor login failed: {res.text}")
        return
    doctor_token = res.json()["access_token"]
    doctor_headers = {"Authorization": f"Bearer {doctor_token}"}

    print("\n3. Log in as admin...")
    res = requests.post(f"{API_PREFIX}/auth/login", data={"username": "admin@mediflow.com", "password": "admin123"})
    if res.status_code != 200:
        print(f"Admin login failed: {res.text}")
        return
    admin_token = res.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Test File upload (PDF)
    print("\n4. Uploading medical report as patient (PDF)...")
    file_data = b"%PDF-1.4\n%mock pdf report bytes\n"
    files = {"file": ("report_cardio.pdf", file_data, "application/pdf")}
    res = requests.post(f"{API_PREFIX}/reports/upload", headers=patient_headers, files=files)
    if res.status_code != 201:
        print(f"Report upload failed: {res.text}")
        return
    report = res.json()
    report_id = report["id"]
    print(f"Report uploaded successfully! ID: {report_id}, Name: {report['file_name']}, Mime: {report['mime_type']}")
    print(f"AI generated summary: {report['ai_summary']}")

    # Test File size validation
    print("\n5. Testing file size validation (exceeding 5MB limit)...")
    huge_data = b"0" * (6 * 1024 * 1024) # 6MB
    files_huge = {"file": ("huge_report.pdf", huge_data, "application/pdf")}
    res = requests.post(f"{API_PREFIX}/reports/upload", headers=patient_headers, files=files_huge)
    print(f"Response status: {res.status_code} (Expected: 400)")
    if res.status_code != 400:
        print(f"Error: Size validation was bypassed!")

    # Test File type validation
    print("\n6. Testing invalid file type validation...")
    exe_data = b"MZ..."
    files_exe = {"file": ("malware.exe", exe_data, "application/octet-stream")}
    res = requests.post(f"{API_PREFIX}/reports/upload", headers=patient_headers, files=files_exe)
    print(f"Response status: {res.status_code} (Expected: 400)")
    if res.status_code != 400:
        print(f"Error: Type validation was bypassed!")

    # Retrieve patient reports
    print("\n7. Listing my reports as patient...")
    res = requests.get(f"{API_PREFIX}/reports/my-reports", headers=patient_headers)
    reports = res.json()
    print(f"Patient has {len(reports)} reports registered.")

    # Doctor trying to view reports of a patient they are NOT consulting
    print("\n8. Doctor fetching reports of patient they are NOT consulting...")
    # Using dummy patient ID 999 who has no tokens with the doctor
    res = requests.get(f"{API_PREFIX}/reports/patient/999", headers=doctor_headers)
    print(f"Response status: {res.status_code} (Expected: 403)")
    if res.status_code == 200:
        print(f"Error: Doctor was able to bypass consultation guard!")

    # Doctor views patient reports after consulting
    print("\n9. Doctor fetching patient reports after consulting (active token)...")
    # Patient books a token for General Medicine (dept 2)
    import datetime
    book_res = requests.post(
        f"{API_PREFIX}/queue/book",
        headers=patient_headers,
        json={
            "department_id": 2,
            "symptoms": "Mild fever",
            "emergency_level": 2,
            "appointment_time": datetime.datetime.now().isoformat()
        }
    )
    if book_res.status_code != 200:
        print(f"Failed to book token for general medicine: {book_res.text}")
    else:
        token_id = book_res.json()["id"]
        # Doctor calls next patient (assumes GM doctor is logged in)
        call_res = requests.post(f"{API_PREFIX}/doctors/call-next", headers=doctor_headers)
        if call_res.status_code == 200:
            print("Doctor successfully active-consulted patient in queue.")
            # Now doctor tries to fetch reports again
            res = requests.get(f"{API_PREFIX}/reports/patient/1", headers=doctor_headers)
            print(f"Response status: {res.status_code} (Expected: 200)")
            if res.status_code == 200:
                print(f"Doctor successfully retrieved reports list: {len(res.json())} item(s).")
        # Cleanup token
        requests.post(f"{API_PREFIX}/queue/cancel/{token_id}", headers=patient_headers)

    # Download report
    print("\n10. Downloading report as patient...")
    res = requests.get(f"{API_PREFIX}/reports/download/{report_id}", headers=patient_headers)
    print(f"Response status: {res.status_code} (Expected: 200)")
    if res.status_code == 200 and res.content == file_data:
        print("Success: Downloaded bytes match uploaded bytes!")

    # Admin actions
    print("\n11. Admin querying all reports...")
    res = requests.get(f"{API_PREFIX}/reports/all", headers=admin_headers)
    print(f"Admin reports list status: {res.status_code}, count: {len(res.json())}")

    print("\n12. Admin checking report stats...")
    res = requests.get(f"{API_PREFIX}/reports/stats", headers=admin_headers)
    print(f"Stats response: {res.json()}")

    # Delete report
    print("\n13. Deleting report as patient...")
    res = requests.delete(f"{API_PREFIX}/reports/{report_id}", headers=patient_headers)
    print(f"Delete status: {res.status_code} (Expected: 200)")

    # Verify report is gone
    print("\n14. Verifying report is deleted from database...")
    res = requests.get(f"{API_PREFIX}/reports/my-reports", headers=patient_headers)
    print(f"Patient reports count: {len(res.json())} (Expected: 0)")

if __name__ == "__main__":
    run()
