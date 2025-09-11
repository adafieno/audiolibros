#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test script to verify character assignment JSON output fix
"""

import json
import subprocess
import sys
from pathlib import Path

def test_character_assignment():
    """Test the character assignment script to verify JSON output is clean"""
    
    # Prepare the JSON payload that the frontend would send
    test_payload = {
        "chapterId": "ch01", 
        "chapterText": "Test chapter text for assignment",
        "availableCharacters": ["narrador", "Narrador", "desconocido"]
    }
    
    # Convert to JSON string
    json_payload = json.dumps(test_payload, ensure_ascii=False)
    
    # Set up the command
    script_path = Path(__file__).parent / "py" / "characters" / "assign_characters_to_segments.py"
    project_root = Path(__file__).parent / "sample"
    
    # Run the character assignment script
    cmd = [sys.executable, str(script_path), str(project_root)]
    
    try:
        result = subprocess.run(
            cmd,
            input=json_payload,
            text=True,
            encoding='utf-8',
            capture_output=True,
            timeout=60
        )
        
        print("=== STDOUT (should be valid JSON) ===")
        print(result.stdout)
        print("=== STDERR (logs) ===")
        print(result.stderr)
        print(f"=== RETURN CODE: {result.returncode} ===")
        
        # Try to parse the stdout as JSON
        if result.stdout.strip():
            try:
                parsed_result = json.loads(result.stdout)
                print("✅ SUCCESS: stdout is valid JSON")
                print(f"   Result type: {type(parsed_result)}")
                print(f"   Has success key: {'success' in parsed_result}")
                return True
            except json.JSONDecodeError as e:
                print(f"❌ FAILED: stdout is not valid JSON: {e}")
                return False
        else:
            print("❌ FAILED: no stdout output")
            return False
            
    except subprocess.TimeoutExpired:
        print("❌ FAILED: script timed out")
        return False
    except Exception as e:
        print(f"❌ FAILED: exception: {e}")
        return False

if __name__ == "__main__":
    test_character_assignment()
