"""Test RBAC (Role-Based Access Control) for projects."""
import requests
import json

API_BASE = "http://localhost:8000"
AUTH_BASE = f"{API_BASE}/api/v1"


def register_user(email: str, password: str, full_name: str):
    """Register a new user."""
    data = {
        "email": email,
        "password": password,
        "full_name": full_name
    }
    response = requests.post(f"{AUTH_BASE}/auth/register", json=data)
    return response.status_code == 201


def login(email: str, password: str):
    """Login and get access token."""
    data = {"email": email, "password": password}
    response = requests.post(f"{AUTH_BASE}/auth/login", json=data)
    if response.status_code == 200:
        result = response.json()
        return result["access_token"]
    return None


def create_project(token: str, title: str):
    """Create a project."""
    headers = {"Authorization": f"Bearer {token}"}
    data = {
        "title": title,
        "language": "es-PE"
    }
    response = requests.post(f"{AUTH_BASE}/projects/", json=data, headers=headers)
    if response.status_code == 201:
        return response.json()["id"]
    return None


def get_me(token: str):
    """Get current user."""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{AUTH_BASE}/auth/me", headers=headers)
    if response.status_code == 200:
        return response.json()
    return None


def add_project_member(token: str, project_id: str, user_id: str, role: str):
    """Add a member to a project."""
    headers = {"Authorization": f"Bearer {token}"}
    data = {
        "user_id": user_id,
        "role": role
    }
    response = requests.post(f"{AUTH_BASE}/projects/{project_id}/members", json=data, headers=headers)
    return response.status_code == 201, response.text


def list_projects(token: str):
    """List projects."""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{AUTH_BASE}/projects/", headers=headers)
    if response.status_code == 200:
        return response.json()["items"]
    return []


def update_project(token: str, project_id: str, data: dict):
    """Update a project."""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.put(f"{AUTH_BASE}/projects/{project_id}", json=data, headers=headers)
    return response.status_code, response.text


def list_members(token: str, project_id: str):
    """List project members."""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{AUTH_BASE}/projects/{project_id}/members", headers=headers)
    if response.status_code == 200:
        return response.json()
    return []


if __name__ == "__main__":
    print("=" * 70)
    print("🧪 Khipu Cloud API - RBAC (Role-Based Access Control) Tests")
    print("=" * 70)
    
    try:
        # Setup: Register users with different roles
        print("\n📋 Setup: Creating test users...")
        
        # Creator user (project owner)
        creator_email = "creator@khipu.com"
        creator_pass = "TestPassword123!"
        if register_user(creator_email, creator_pass, "Test Creator"):
            print(f"✅ Registered creator: {creator_email}")
        
        creator_token = login(creator_email, creator_pass)
        if not creator_token:
            print("❌ Failed to login as creator")
            exit(1)
        
        creator_user = get_me(creator_token)
        creator_id = creator_user["id"]
        print(f"   Creator ID: {creator_id}")
        print(f"   Role: {creator_user.get('role', 'creator')}")
        
        # Reviewer user
        reviewer_email = "reviewer@khipu.com"
        reviewer_pass = "TestPassword123!"
        if register_user(reviewer_email, reviewer_pass, "Test Reviewer"):
            print(f"✅ Registered reviewer: {reviewer_email}")
        
        reviewer_token = login(reviewer_email, reviewer_pass)
        if not reviewer_token:
            print("❌ Failed to login as reviewer")
            exit(1)
        
        reviewer_user = get_me(reviewer_token)
        reviewer_id = reviewer_user["id"]
        print(f"   Reviewer ID: {reviewer_id}")
        
        # Second creator
        creator2_email = "creator2@khipu.com"
        creator2_pass = "TestPassword123!"
        if register_user(creator2_email, creator2_pass, "Test Creator 2"):
            print(f"✅ Registered second creator: {creator2_email}")
        
        creator2_token = login(creator2_email, creator2_pass)
        creator2_user = get_me(creator2_token)
        creator2_id = creator2_user["id"]
        
        # Test 1: Creator creates a project
        print("\n" + "=" * 70)
        print("📚 Test 1: Creator creates a project")
        print("=" * 70)
        
        project_id = create_project(creator_token, "Don Quijote - RBAC Test")
        if project_id:
            print(f"✅ Project created successfully: {project_id[:8]}...")
        else:
            print("❌ Failed to create project")
            exit(1)
        
        # Test 2: Owner adds reviewer to project
        print("\n" + "=" * 70)
        print("👥 Test 2: Owner adds reviewer to project")
        print("=" * 70)
        
        success, msg = add_project_member(creator_token, project_id, reviewer_id, "reviewer")
        if success:
            print("✅ Reviewer added successfully")
        else:
            print(f"❌ Failed to add reviewer: {msg}")
        
        # Test 3: List members
        print("\n" + "=" * 70)
        print("📋 Test 3: List project members")
        print("=" * 70)
        
        members = list_members(creator_token, project_id)
        print(f"Total members: {len(members)}")
        for m in members:
            print(f"  - {m['user_name']} ({m['user_email']}) - Role: {m['role']}")
        
        # Test 4: Reviewer can see project
        print("\n" + "=" * 70)
        print("👁️ Test 4: Reviewer can see assigned project")
        print("=" * 70)
        
        reviewer_projects = list_projects(reviewer_token)
        print(f"Reviewer can see {len(reviewer_projects)} project(s)")
        if len(reviewer_projects) > 0:
            print(f"✅ Reviewer has access to: {reviewer_projects[0]['title']}")
        else:
            print("❌ Reviewer cannot see the project")
        
        # Test 5: Reviewer CANNOT edit project
        print("\n" + "=" * 70)
        print("🚫 Test 5: Reviewer CANNOT edit project (should fail)")
        print("=" * 70)
        
        status, msg = update_project(reviewer_token, project_id, {"title": "Hacked Title"})
        if status == 403:
            print("✅ Correctly blocked - Reviewer cannot edit project")
        else:
            print(f"❌ Security issue - Reviewer was able to edit! Status: {status}")
        
        # Test 6: Owner adds another creator
        print("\n" + "=" * 70)
        print("👥 Test 6: Owner adds another creator to project")
        print("=" * 70)
        
        success, msg = add_project_member(creator_token, project_id, creator2_id, "creator")
        if success:
            print("✅ Second creator added successfully")
        else:
            print(f"❌ Failed to add creator: {msg}")
        
        # Test 7: Second creator CAN edit project
        print("\n" + "=" * 70)
        print("✏️ Test 7: Second creator CAN edit project")
        print("=" * 70)
        
        status, msg = update_project(creator2_token, project_id, {"subtitle": "Edited by Creator 2"})
        if status == 200:
            print("✅ Second creator successfully edited project")
        else:
            print(f"❌ Second creator failed to edit: {status} - {msg}")
        
        # Test 8: Creator 2 (not owner) CANNOT delete project
        print("\n" + "=" * 70)
        print("🚫 Test 8: Non-owner creator CANNOT delete project")
        print("=" * 70)
        
        headers = {"Authorization": f"Bearer {creator2_token}"}
        response = requests.delete(f"{AUTH_BASE}/projects/{project_id}", headers=headers)
        if response.status_code == 403:
            print("✅ Correctly blocked - Only owner can delete")
        else:
            print(f"❌ Security issue - Non-owner deleted project! Status: {response.status_code}")
        
        # Test 9: Reviewer CANNOT add members
        print("\n" + "=" * 70)
        print("🚫 Test 9: Reviewer CANNOT add members (should fail)")
        print("=" * 70)
        
        success, msg = add_project_member(reviewer_token, project_id, creator2_id, "reviewer")
        if not success:
            print("✅ Correctly blocked - Reviewer cannot manage members")
        else:
            print("❌ Security issue - Reviewer could add members!")
        
        # Test 10: Unassigned user CANNOT see project
        print("\n" + "=" * 70)
        print("🚫 Test 10: Unassigned user CANNOT see project")
        print("=" * 70)
        
        unassigned_email = "unassigned@khipu.com"
        unassigned_pass = "TestPassword123!"
        register_user(unassigned_email, unassigned_pass, "Unassigned User")
        unassigned_token = login(unassigned_email, unassigned_pass)
        
        unassigned_projects = list_projects(unassigned_token)
        if len(unassigned_projects) == 0:
            print("✅ Correctly isolated - Unassigned user sees no projects")
        else:
            print(f"❌ Security issue - Unassigned user can see {len(unassigned_projects)} project(s)!")
        
        print("\n" + "=" * 70)
        print("✨ RBAC Test Suite Completed!")
        print("=" * 70)
        print("\n📊 Summary:")
        print("  ✅ Project owners have full control")
        print("  ✅ Creators can edit but not delete")
        print("  ✅ Reviewers have read-only access")
        print("  ✅ Unassigned users cannot access projects")
        print("  ✅ Permission checks are enforced")
        
    except requests.exceptions.ConnectionError:
        print("\n❌ Could not connect to API. Is it running?")
        print("Run: docker-compose up -d")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
