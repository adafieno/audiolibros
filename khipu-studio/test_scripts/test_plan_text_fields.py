#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test script to verify that plan files include text fields
"""

import json
from pathlib import Path

def test_plan_file_text_fields():
    """Test that plan files have text fields in line objects"""
    
    plan_file = Path(__file__).parent / "sample" / "ssml" / "plans" / "ch01.plan.json"
    
    if not plan_file.exists():
        print(f"❌ Plan file not found: {plan_file}")
        return False
    
    try:
        with open(plan_file, 'r', encoding='utf-8') as f:
            plan_data = json.load(f)
        
        print(f"✅ Loaded plan file: {plan_file}")
        print(f"   Chapter ID: {plan_data.get('chapter_id')}")
        print(f"   Chunks: {len(plan_data.get('chunks', []))}")
        
        # Check if chunks have lines with text fields
        for chunk_idx, chunk in enumerate(plan_data.get('chunks', [])):
            print(f"   Chunk {chunk_idx + 1}: {chunk.get('id')}")
            lines = chunk.get('lines', [])
            print(f"     Lines: {len(lines)}")
            
            for line_idx, line in enumerate(lines):
                has_text = 'text' in line
                text_content = line.get('text', '<MISSING>')
                print(f"     Line {line_idx + 1}: has_text={has_text}, text='{text_content[:50]}{'...' if len(text_content) > 50 else ''}'")
        
        # Check if all lines have text fields
        total_lines = 0
        lines_with_text = 0
        
        for chunk in plan_data.get('chunks', []):
            for line in chunk.get('lines', []):
                total_lines += 1
                if 'text' in line and line['text']:
                    lines_with_text += 1
        
        print(f"\n📊 Summary:")
        print(f"   Total lines: {total_lines}")
        print(f"   Lines with text: {lines_with_text}")
        
        if total_lines > 0 and lines_with_text == total_lines:
            print(f"✅ SUCCESS: All lines have text fields!")
            return True
        else:
            print(f"❌ FAILED: {total_lines - lines_with_text} lines missing text fields")
            return False
            
    except Exception as e:
        print(f"❌ Error reading plan file: {e}")
        return False

if __name__ == "__main__":
    test_plan_file_text_fields()
