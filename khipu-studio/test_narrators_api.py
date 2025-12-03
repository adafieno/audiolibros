"""Test script to verify narrators field persistence via API"""
import requests
import json

API_BASE = "http://localhost:8000/api/v1"

# Login first
login_data = {
    "email": "admin@example.com",
    "password": "password123"
}

print("1. Logging in...")
login_response = requests.post(f"{API_BASE}/auth/login", json=login_data)
if login_response.status_code != 200:
    print(f"Login failed: {login_response.status_code}")
    print(login_response.text)
    exit(1)

token = login_response.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}
print("✓ Logged in successfully\n")

# Get first project
print("2. Getting first project...")
projects_response = requests.get(f"{API_BASE}/projects/", headers=headers)
if projects_response.status_code != 200:
    print(f"Failed to get projects: {projects_response.status_code}")
    exit(1)

projects = projects_response.json()["items"]
if not projects:
    print("No projects found")
    exit(1)

project = projects[0]
project_id = project["id"]
print(f"✓ Using project: {project['title']} (ID: {project_id})")
print(f"  Current narrators: {project.get('narrators')}\n")

# Update with narrators
print("3. Updating project with narrators=['Test Narrator One', 'Test Narrator Two']...")
update_data = {
    "narrators": ["Test Narrator One", "Test Narrator Two"]
}
update_response = requests.put(
    f"{API_BASE}/projects/{project_id}",
    headers=headers,
    json=update_data
)

if update_response.status_code != 200:
    print(f"Update failed: {update_response.status_code}")
    print(update_response.text)
    exit(1)

updated_project = update_response.json()
print(f"✓ Update successful")
print(f"  Response narrators: {updated_project.get('narrators')}\n")

# Fetch again to verify persistence
print("4. Fetching project again to verify...")
verify_response = requests.get(f"{API_BASE}/projects/{project_id}", headers=headers)
if verify_response.status_code != 200:
    print(f"Fetch failed: {verify_response.status_code}")
    exit(1)

verified_project = verify_response.json()
print(f"✓ Fetch successful")
print(f"  Verified narrators: {verified_project.get('narrators')}\n")

# Check if it persisted
if verified_project.get('narrators') == ["Test Narrator One", "Test Narrator Two"]:
    print("✅ SUCCESS: Narrators field persisted correctly!")
else:
    print(f"❌ FAIL: Narrators did not persist correctly")
    print(f"   Expected: ['Test Narrator One', 'Test Narrator Two']")
    print(f"   Got: {verified_project.get('narrators')}")
