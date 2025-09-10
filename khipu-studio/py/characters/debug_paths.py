#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Debug script to check what paths are being used
"""

import json
import sys
import os
from pathlib import Path

# Add parent directory to path for imports
_pkg_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _pkg_root not in sys.path:
    sys.path.insert(0, _pkg_root)

def debug_paths(project_root: str):
    """Debug what paths are being used"""
    try:
        project_path = Path(project_root)
        print(f"Project root: {project_path}")
        
        # Check characters file path
        characters_file = project_path / "dossier" / "characters.json"
        print(f"Expected characters file: {characters_file}")
        print(f"Characters file exists: {characters_file.exists()}")
        
        # Check alternative path that might be created
        alt_characters_file = project_path / "analysis" / "dossier" / "characters.json"
        print(f"Alternative characters file: {alt_characters_file}")
        print(f"Alternative file exists: {alt_characters_file.exists()}")
        
        # Check voice inventory path
        voice_inventory_file = project_path / "voice_inventory.json"
        print(f"Voice inventory file: {voice_inventory_file}")
        print(f"Voice inventory exists: {voice_inventory_file.exists()}")
        
        # Also check old dossier location for debugging
        old_voice_inventory_file = project_path / "dossier" / "voice_inventory.json"
        print(f"Old voice inventory location: {old_voice_inventory_file}")
        print(f"Old voice inventory exists: {old_voice_inventory_file.exists()}")
        
        # If characters file exists, show its timestamp
        if characters_file.exists():
            stat = characters_file.stat()
            print(f"Characters file modified: {stat.st_mtime}")
            print(f"Characters file size: {stat.st_size} bytes")
        
        if alt_characters_file.exists():
            stat = alt_characters_file.stat()
            print(f"Alt characters file modified: {stat.st_mtime}")
            print(f"Alt characters file size: {stat.st_size} bytes")
        
        return {
            "success": True,
            "project_path": str(project_path),
            "characters_file": str(characters_file),
            "characters_exists": characters_file.exists(),
            "alt_characters_file": str(alt_characters_file),
            "alt_exists": alt_characters_file.exists()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"Debug failed: {str(e)}"
        }

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: debug_paths.py <project_root>"
        }))
        sys.exit(1)
    
    project_root = sys.argv[1]
    result = debug_paths(project_root)
    print(json.dumps(result, ensure_ascii=False, indent=2))
