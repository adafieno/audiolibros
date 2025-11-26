"""Test authentication endpoints."""
import requests
import json

API_BASE = "http://localhost:8000"
AUTH_BASE = f"{API_BASE}/api/v1"

def test_register():
    """Test user registration."""
    print("\n🔐 Testing Registration...")
    
    data = {
        "email": "test@khipu.com",
        "password": "TestPassword123!",
        "full_name": "Test User"
    }
    
    response = requests.post(f"{AUTH_BASE}/auth/register", json=data)
    print(f"Status: {response.status_code}")
    print(f"Response Text: {response.text}")
    try:
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    except:
        pass
    
    return response.status_code == 201

def test_login():
    """Test user login."""
    print("\n🔑 Testing Login...")
    
    data = {
        "email": "test@khipu.com",
        "password": "TestPassword123!"
    }
    
    response = requests.post(f"{AUTH_BASE}/auth/login", json=data)
    print(f"Status: {response.status_code}")
    result = response.json()
    print(f"Response: {json.dumps(result, indent=2)}")
    
    if response.status_code == 200:
        return result.get("access_token")
    return None

def test_me(access_token):
    """Test getting current user info."""
    print("\n👤 Testing /auth/me...")
    
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(f"{AUTH_BASE}/auth/me", headers=headers)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    return response.status_code == 200

def test_health():
    """Test health endpoint."""
    print("\n❤️ Testing Health Check...")
    
    response = requests.get(f"{API_BASE}/health")
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    return response.status_code == 200

if __name__ == "__main__":
    print("=" * 60)
    print("🧪 Khipu Cloud API - Authentication Tests")
    print("=" * 60)
    
    try:
        # Test health first
        if not test_health():
            print("\n❌ Health check failed!")
            exit(1)
        
        # Test registration
        if test_register():
            print("\n✅ Registration successful!")
        else:
            print("\n⚠️ Registration failed (might already exist)")
        
        # Test login
        access_token = test_login()
        if access_token:
            print("\n✅ Login successful!")
            
            # Test /me endpoint
            if test_me(access_token):
                print("\n✅ /auth/me successful!")
            else:
                print("\n❌ /auth/me failed!")
        else:
            print("\n❌ Login failed!")
        
        print("\n" + "=" * 60)
        print("✨ Test suite completed!")
        print("=" * 60)
        
    except requests.exceptions.ConnectionError:
        print("\n❌ Could not connect to API. Is it running?")
        print("Run: docker-compose up -d")
    except Exception as e:
        print(f"\n❌ Error: {e}")
