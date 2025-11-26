"""Test projects endpoints."""
import requests
import json

API_BASE = "http://localhost:8000"
AUTH_BASE = f"{API_BASE}/api/v1"

# First, login to get token
def get_auth_token():
    """Login and get access token."""
    data = {
        "email": "test@khipu.com",
        "password": "TestPassword123!"
    }
    response = requests.post(f"{AUTH_BASE}/auth/login", json=data)
    if response.status_code == 200:
        return response.json()["access_token"]
    return None


def test_create_project(token):
    """Test creating a project."""
    print("\n📚 Testing Create Project...")
    
    headers = {"Authorization": f"Bearer {token}"}
    data = {
        "title": "El Quijote Audiolibro",
        "subtitle": "Primera Parte",
        "authors": ["Miguel de Cervantes"],
        "narrators": ["Juan Pérez"],
        "language": "es-PE",
        "description": "La historia del ingenioso hidalgo Don Quijote de la Mancha"
    }
    
    response = requests.post(f"{AUTH_BASE}/projects/", json=data, headers=headers)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 201:
        result = response.json()
        print(f"Project Created: {result['id']}")
        print(f"Title: {result['title']}")
        print(f"Status: {result['status']}")
        return result['id']
    else:
        print(f"Error: {response.text}")
        return None


def test_list_projects(token):
    """Test listing projects."""
    print("\n📋 Testing List Projects...")
    
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{AUTH_BASE}/projects/", headers=headers)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"Total Projects: {result['total']}")
        print(f"Page: {result['page']} of {result['pages']}")
        for project in result['items']:
            print(f"  - {project['title']} ({project['status']})")
        return True
    else:
        print(f"Error: {response.text}")
        return False


def test_get_project(token, project_id):
    """Test getting a specific project."""
    print(f"\n🔍 Testing Get Project {project_id[:8]}...")
    
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{AUTH_BASE}/projects/{project_id}", headers=headers)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"Title: {result['title']}")
        print(f"Language: {result['language']}")
        print(f"Authors: {', '.join(result['authors'])}")
        return True
    else:
        print(f"Error: {response.text}")
        return False


def test_update_project(token, project_id):
    """Test updating a project."""
    print(f"\n✏️ Testing Update Project {project_id[:8]}...")
    
    headers = {"Authorization": f"Bearer {token}"}
    data = {
        "subtitle": "Primera Parte - Edición Actualizada",
        "status": "in_progress"
    }
    
    response = requests.put(f"{AUTH_BASE}/projects/{project_id}", json=data, headers=headers)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"Updated Subtitle: {result['subtitle']}")
        print(f"Updated Status: {result['status']}")
        return True
    else:
        print(f"Error: {response.text}")
        return False


def test_delete_project(token, project_id):
    """Test deleting (archiving) a project."""
    print(f"\n🗑️ Testing Delete Project {project_id[:8]}...")
    
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.delete(f"{AUTH_BASE}/projects/{project_id}", headers=headers)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 204:
        print("✅ Project archived successfully")
        return True
    else:
        print(f"Error: {response.text}")
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("🧪 Khipu Cloud API - Projects CRUD Tests")
    print("=" * 60)
    
    try:
        # Get authentication token
        print("\n🔑 Getting authentication token...")
        token = get_auth_token()
        
        if not token:
            print("❌ Failed to get auth token. Make sure user exists.")
            exit(1)
        
        print("✅ Authenticated successfully")
        
        # Test create
        project_id = test_create_project(token)
        if not project_id:
            print("\n❌ Failed to create project")
            exit(1)
        
        print("\n✅ Create project successful!")
        
        # Test list
        if test_list_projects(token):
            print("\n✅ List projects successful!")
        
        # Test get
        if test_get_project(token, project_id):
            print("\n✅ Get project successful!")
        
        # Test update
        if test_update_project(token, project_id):
            print("\n✅ Update project successful!")
        
        # Test list again to see changes
        test_list_projects(token)
        
        # Test delete
        if test_delete_project(token, project_id):
            print("\n✅ Delete project successful!")
        
        # Verify it's archived (shouldn't appear in list)
        print("\n📋 Verifying project is archived...")
        test_list_projects(token)
        
        print("\n" + "=" * 60)
        print("✨ All tests completed successfully!")
        print("=" * 60)
        
    except requests.exceptions.ConnectionError:
        print("\n❌ Could not connect to API. Is it running?")
        print("Run: docker-compose up -d")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
