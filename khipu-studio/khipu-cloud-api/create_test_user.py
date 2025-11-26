"""
Create a test user for Khipu Cloud API
"""
import requests

API_BASE_URL = "http://localhost:8000/api/v1"

# Test user data
test_user = {
    "email": "admin@example.com",
    "password": "password123",
    "full_name": "Test Admin",
    "tenant_name": "Khipu Test Organization",
    "subdomain": "khipu-test"
}

def create_test_user():
    """Register a test user"""
    print("Creating test user...")
    print(f"Email: {test_user['email']}")
    print(f"Password: {test_user['password']}")
    print(f"Organization: {test_user['tenant_name']}")
    print()
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/auth/register",
            json=test_user
        )
        
        if response.status_code in (200, 201):
            data = response.json()
            print("✓ User created successfully!")
            print(f"User ID: {data.get('user', data).get('id')}")
            print(f"Tenant ID: {data.get('user', data).get('tenant_id')}")
            print(f"Role: {data.get('user', data).get('role', 'admin')}")
            print()
            print("Login credentials:")
            print(f"  Email: {test_user['email']}")
            print(f"  Password: {test_user['password']}")
        else:
            print(f"✗ Failed to create user: {response.status_code}")
            print(response.text)
    
    except requests.exceptions.ConnectionError:
        print("✗ Cannot connect to API. Make sure the API server is running on http://localhost:8000")
    except Exception as e:
        print(f"✗ Error: {e}")

if __name__ == "__main__":
    create_test_user()
