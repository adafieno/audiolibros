"""Test audio production API response"""
import requests
import json

# Use your actual token
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZWIxMzUyMC1kZWYxLTRjOTItODI2ZS1iNjBiMmZlNjNhOGMiLCJ0ZW5hbnRfaWQiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEiLCJyb2xlIjoidGVuYW50X2FkbWluIiwiZXhwIjoxNzY3MTQzNjUwfQ.cTa8VbPHCvl2p8xqYjOEHNfIc5PuJv0H1BU7aaE9KG0"

# Test endpoint
url = "http://localhost:8000/api/v1/projects/bb476fec-2c2d-4bc5-b3b5-25ae502a81f7/chapters/2/audio-production"

headers = {
    "Authorization": f"Bearer {TOKEN}"
}

try:
    response = requests.get(url, headers=headers)
    print(f"Status Code: {response.status_code}")
    
    if response.ok:
        data = response.json()
        print(f"\nTotal Segments: {len(data['segments'])}")
        
        # Show first 3 segments with durations
        for i, seg in enumerate(data['segments'][:5]):
            print(f"\nSegment {i}:")
            print(f"  ID: {seg['segment_id']}")
            print(f"  Type: {seg['type']}")
            print(f"  Text: {seg.get('text', '')[:50]}...")
            print(f"  Has Audio: {seg['has_audio']}")
            print(f"  Duration: {seg.get('duration')} seconds")
            print(f"  URL: {seg.get('raw_audio_url', 'None')[:60]}...")
    else:
        print(f"Error: {response.text}")
        
except Exception as e:
    print(f"Exception: {e}")
