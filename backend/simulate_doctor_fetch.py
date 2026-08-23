import requests

BASE_URL = "http://127.0.0.1:8005"
API_PREFIX = f"{BASE_URL}/api/v1"

# 1. Login as doctor
res = requests.post(
    f"{API_PREFIX}/auth/login",
    data={"username": "doctor@mediflow.com", "password": "doctor123"}
)
if res.status_code != 200:
    print(f"Doctor login failed: {res.text}")
    exit(1)

token = res.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# 2. Get Doctor Profile
res = requests.get(f"{API_PREFIX}/doctors/profile", headers=headers)
profile = res.json()
print("Doctor Profile:", profile)

# 3. Get Active Token
res = requests.get(f"{API_PREFIX}/doctors/active-token", headers=headers)
print("Active Token:", res.json())

# 4. Get Live Queue for doctor's department
dept_id = profile.get("department_id")
if dept_id:
    res = requests.get(f"{API_PREFIX}/queue/departments/{dept_id}/live")
    print(f"Live Queue for Department {dept_id}:", res.json())
else:
    print("Doctor has no department_id!")
