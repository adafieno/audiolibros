#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Character voice assignment script that integrates with the existing voice casting logic.
This script assigns voices to characters and returns the assignments for UI display.
"""

import json
import sys
import os
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any

# Disable logging to stdout to prevent interference with JSON output
logging.getLogger().setLevel(logging.CRITICAL)
logging.getLogger("audiobooks").setLevel(logging.CRITICAL)
logging.getLogger("audiobooks.span").setLevel(logging.CRITICAL)

# Add parent directory to path for imports
_pkg_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _pkg_root not in sys.path:
    sys.path.insert(0, _pkg_root)

# Import the voice assignment logic
from ssml.voices_from_characters import derive_cast_with_llm

def load_project_config(project_root: str) -> Dict[str, Any]:
    """Load project configuration to get LLM settings."""
    try:
        project_path = Path(project_root)
        config_file = project_path / "project.khipu.json"
        
        if config_file.exists():
            with open(config_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        
        return {}
    except Exception:
        return {}

def set_llm_config_from_project(project_config: Dict[str, Any]) -> Optional[str]:
    """Set LLM configuration environment variables from project config. Returns the model to use."""
    try:
        llm_config = project_config.get("llm", {})
        engine = llm_config.get("engine", {})
        
        project_model = None
        if engine.get("name") == "openai":
            # Set the model from project config
            model = engine.get("model")
            if model:
                project_model = model
                os.environ["OPENAI_MODEL"] = model
            
            # Set credentials if available
            creds = project_config.get("creds", {})
            openai_creds = creds.get("openai", {})
            
            if openai_creds.get("apiKey"):
                os.environ["OPENAI_API_KEY"] = openai_creds["apiKey"]
            
            if openai_creds.get("baseUrl"):
                os.environ["OPENAI_BASE_URL"] = openai_creds["baseUrl"]
        
        return project_model
                
    except Exception as e:
        # If there's an error setting config, continue with defaults
        return None

def assign_voices_to_characters(project_root: str) -> Dict[str, Any]:
    """
    Assign voices to characters using the existing LLM-based logic.
    Returns character data with voice assignments.
    """
    original_model = None
    try:
        project_path = Path(project_root)
        
        # Load project configuration and set LLM settings
        project_config = load_project_config(project_root)
        project_model = set_llm_config_from_project(project_config)
        
        # If we have a project-specific model, override the global LLM client defaults
        if project_model:
            # Import the LLM client and override its defaults
            from dossier.client import _DEFAULTS
            original_model = _DEFAULTS["model"]
            _DEFAULTS["model"] = project_model
            
            # Also update credentials if needed
            creds = project_config.get("creds", {})
            openai_creds = creds.get("openai", {})
            if openai_creds.get("apiKey"):
                os.environ["OPENAI_API_KEY"] = openai_creds["apiKey"]
            if openai_creds.get("baseUrl"):
                os.environ["OPENAI_BASE_URL"] = openai_creds["baseUrl"]
        
        # Check if required files exist
        characters_file = project_path / "dossier" / "characters.json"
        voice_inventory_file = project_path / "voice_inventory.json"
        
        if not characters_file.exists():
            return {
                "success": False,
                "error": f"Characters file not found: {characters_file}"
            }
        
        if not voice_inventory_file.exists():
            return {
                "success": False,
                "error": f"Voice inventory file not found: {voice_inventory_file}. Please complete voice casting first."
            }
        
        # Load current characters
        with open(characters_file, 'r', encoding='utf-8') as f:
            characters_data = json.load(f)
        
        # Handle both formats: list of characters or dict with "characters" key
        if isinstance(characters_data, list):
            # Direct list of characters
            characters = characters_data
            characters_data = {"characters": characters}  # Wrap in dict for consistency
        elif isinstance(characters_data, dict):
            # Dict format - extract characters
            characters = characters_data.get("characters", [])
            if not isinstance(characters, list):
                return {
                    "success": False,
                    "error": f"Characters data 'characters' field has invalid format. Expected list, got {type(characters).__name__}"
                }
        else:
            return {
                "success": False,
                "error": f"Characters file has invalid format. Expected dict or list, got {type(characters_data).__name__}"
            }
        
        # Ensure all characters have sequential IDs (character_001, character_002, etc.)
        for i, character in enumerate(characters):
            # Debug: Check character type
            if not isinstance(character, dict):
                return {
                    "success": False,
                    "error": f"Character at index {i} has invalid format. Expected dict, got {type(character).__name__}: {character}"
                }
            # Always use sequential IDs for consistency
            character["id"] = f"character_{i+1:03d}"
        
        # Load voice inventory to get only the selected voices from casting
        with open(voice_inventory_file, 'r', encoding='utf-8') as f:
            voice_inventory = json.load(f)
        
        # Debug: Check voice inventory structure
        if not isinstance(voice_inventory, dict):
            return {
                "success": False,
                "error": f"Voice inventory file has invalid format. Expected dict, got {type(voice_inventory).__name__}"
            }
        
        # Get only the selected voices from casting (not the full inventory)
        selected_voice_ids = voice_inventory.get("selectedVoiceIds", [])
        if not selected_voice_ids:
            return {
                "success": False,
                "error": "No voices selected in casting. Please complete voice casting first and select voices."
            }
        
        # Filter voices to only include selected ones
        all_voices = voice_inventory.get("voices", [])
        if not isinstance(all_voices, list):
            return {
                "success": False,
                "error": f"Voice inventory 'voices' field has invalid format. Expected list, got {type(all_voices).__name__}"
            }
        
        selected_voices = [voice for voice in all_voices if voice.get("id") in selected_voice_ids]
        
        if not selected_voices:
            return {
                "success": False,
                "error": "Selected voices not found in inventory. Please check voice casting."
            }
        
        # Use the existing voice assignment logic
        dossier_dir = project_path / "dossier"
        
        # Debug: Check parameters before calling derive_cast_with_llm
        debug_info = {
            "book_root": str(project_path),
            "dossier_dir": str(dossier_dir),
            "inventory_path": str(voice_inventory_file),
            "characters_count": len(characters),
            "selected_voices_count": len(selected_voices),
            "llm_model_used": project_model if project_model else "default"
        }
        
        try:
            # Temporarily save characters in dictionary format for derive_cast_with_llm
            temp_characters_data = {"characters": characters}
            with open(characters_file, 'w', encoding='utf-8') as f:
                json.dump(temp_characters_data, f, ensure_ascii=False, indent=2)
            
            cast_path, variants_path, log_path = derive_cast_with_llm(
                book_root=project_path,
                lang="es",
                dossier_dir=dossier_dir,
                inventory_path=voice_inventory_file
            )
        except Exception as e:
            return {
                "success": False,
                "error": f"Error in derive_cast_with_llm: {str(e)}",
                "debug_info": debug_info
            }
        
        # Load the generated cast assignments
        with open(cast_path, 'r', encoding='utf-8') as f:
            cast_assignments = json.load(f)
        
        # Debug: Check cast assignments structure
        if not isinstance(cast_assignments, dict):
            return {
                "success": False,
                "error": f"Cast assignments file has invalid format. Expected dict, got {type(cast_assignments).__name__}: {cast_assignments}"
            }
        
        # Merge voice assignments into character data
        for character in characters:
            if not isinstance(character, dict):
                return {
                    "success": False,
                    "error": f"Character item has invalid format. Expected dict, got {type(character).__name__}: {character}"
                }
                
            char_id = character.get("id", "")
            char_name = character.get("name", "")
            char_display_name = character.get("display_name", char_name)
            
            # Look for assignment by ID first, then by name or display_name
            assignment = None
            if char_id:
                assignment = cast_assignments.get(char_id)
            if not assignment and char_name:
                assignment = cast_assignments.get(char_name) or cast_assignments.get(char_display_name)
            
            if assignment:
                if not isinstance(assignment, dict):
                    return {
                        "success": False,
                        "error": f"Assignment for character '{char_name}' (ID: {char_id}) has invalid format. Expected dict, got {type(assignment).__name__}: {assignment}"
                    }
                    
                character["voiceAssignment"] = {
                    "voiceId": assignment.get("voice"),
                    "style": assignment.get("style"),
                    "styledegree": assignment.get("styledegree", 0.6),
                    "rate_pct": assignment.get("rate_pct", 0),
                    "pitch_pct": assignment.get("pitch_pct", 0),
                    "confidence": 0.9,  # High confidence for LLM assignments
                    "method": "llm_auto"
                }
        
        # Save updated characters with voice assignments in dictionary format for backend compatibility
        characters_data["characters"] = characters
        with open(characters_file, 'w', encoding='utf-8') as f:
            json.dump(characters_data, f, ensure_ascii=False, indent=2)
        
        return {
            "success": True,
            "message": f"Successfully assigned voices to {len([c for c in characters if c.get('voiceAssignment')])} out of {len(characters)} characters",
            "total_characters": len(characters),
            "characters_with_assignments": len([c for c in characters if c.get('voiceAssignment')]),
            "llm_model_used": project_model if project_model else "default"
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"Voice assignment failed: {str(e)}"
        }
    finally:
        # Restore original model if we changed it
        if original_model:
            try:
                from dossier.client import _DEFAULTS
                _DEFAULTS["model"] = original_model
            except Exception:
                pass  # Ignore cleanup errors

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: assign_voices.py <project_root>"
        }))
        sys.exit(1)
    
    project_root = sys.argv[1]
    result = assign_voices_to_characters(project_root)
    print(json.dumps(result, ensure_ascii=False, indent=2))
