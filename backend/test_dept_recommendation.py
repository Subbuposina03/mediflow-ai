import requests

BASE_URL = "http://127.0.0.1:8005"
API_PREFIX = f"{BASE_URL}/api/v1"

def run():
    print("1. Log in as patient John Doe...")
    res = requests.post(f"{API_PREFIX}/auth/login", data={"username": "patient@mediflow.com", "password": "patient123"})
    assert res.status_code == 200
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Test Case 1: Cardiology (Chest pain)
    print("\n2. Testing Cardiology symptom recommendation...")
    res = requests.post(f"{API_PREFIX}/patient/recommend-department", headers=headers, json={"symptoms": "Experiencing severe chest pain and breath shortness"})
    assert res.status_code == 200
    data = res.json()
    print(f"  Recommended: {data['department_name']} (ID: {data['department_id']}, Confidence: {data['confidence']}%)")
    print(f"  Reasoning: {data['reasoning']}")
    assert data["department_name"] == "Cardiology"
    assert data["department_id"] == 1

    # Test Case 2: Pediatrics (Child fever)
    print("\n3. Testing Pediatrics symptom recommendation...")
    res = requests.post(f"{API_PREFIX}/patient/recommend-department", headers=headers, json={"symptoms": "My young child has high fever and cough"})
    assert res.status_code == 200
    data = res.json()
    print(f"  Recommended: {data['department_name']} (ID: {data['department_id']}, Confidence: {data['confidence']}%)")
    print(f"  Reasoning: {data['reasoning']}")
    assert data["department_name"] == "Pediatrics"
    assert data["department_id"] == 3

    # Test Case 3: General Medicine (Fever)
    print("\n4. Testing General Medicine symptom recommendation...")
    res = requests.post(f"{API_PREFIX}/patient/recommend-department", headers=headers, json={"symptoms": "Having standard high fever and cold since last night"})
    assert res.status_code == 200
    data = res.json()
    print(f"  Recommended: {data['department_name']} (ID: {data['department_id']}, Confidence: {data['confidence']}%)")
    print(f"  Reasoning: {data['reasoning']}")
    assert data["department_name"] == "General Medicine"
    assert data["department_id"] == 2

    # Test Case 4: General Medicine (Headache)
    print("\n5. Testing General Medicine headache recommendation...")
    res = requests.post(f"{API_PREFIX}/patient/recommend-department", headers=headers, json={"symptoms": "A mild headache and body pain"})
    assert res.status_code == 200
    data = res.json()
    print(f"  Recommended: {data['department_name']} (ID: {data['department_id']}, Confidence: {data['confidence']}%)")
    print(f"  Reasoning: {data['reasoning']}")
    assert data["department_name"] == "General Medicine"
    assert data["department_id"] == 2

    print("\nAll AI Department Recommendation tests passed successfully!")

if __name__ == "__main__":
    run()
