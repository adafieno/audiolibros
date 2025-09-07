#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Character detection script for manuscript analysis.
Uses LLM to detect characters from text files and extract traits.
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Any

# Add the project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

try:
    from dossier.client import chat_json
    from core.config import load_config
    from core.log_utils import get_logger
    HAS_LLM = True
except ImportError as e:
    print(f"Warning: LLM integration not available: {e}", file=sys.stderr)
    HAS_LLM = False

_LOG = get_logger("characters") if HAS_LLM else None

def load_project_config(workspace_root: Path) -> Dict[str, Any]:
    """Load project-specific configuration that might override global LLM settings."""
    project_config_path = workspace_root / "project.khipu.json"
    if project_config_path.exists():
        try:
            with open(project_config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            if _LOG:
                _LOG.warning(f"Failed to load project config: {e}")
    return {}

def get_effective_llm_model(workspace_root: Path) -> str:
    """Get the LLM model to use, preferring project-specific config over global."""
    project_config = load_project_config(workspace_root)
    
    # Check if project config specifies an LLM model
    if "llm" in project_config and "engine" in project_config["llm"]:
        engine = project_config["llm"]["engine"]
        if engine.get("name") == "openai" and "model" in engine:
            model = engine["model"]
            if _LOG:
                _LOG.info(f"Using project-specific LLM model: {model}")
            return model
    
    # Fall back to global config
    global_config = load_config()
    model = global_config.openai.model
    if _LOG:
        _LOG.info(f"Using global LLM model: {model}")
    return model

# Character detection prompt for LLM
CHARACTER_DETECTION_PROMPT = """You are an expert at analyzing literary texts to identify characters for audiobook production.

Analyze the provided text and identify key characters that appear, including:
- Named characters (e.g., "Patricia", "Don Cipriano")
- Characters with roles (e.g., "la bibliotecaria", "Carmen la enfermera")
- The narrator (if present)

Return a JSON array with this format:
[
  {
    "name": "Character Name",
    "type": "protagonist|secondary|narrator",
    "importance": "primary|secondary|minor",
    "description": "Brief description"
  }
]

TEXT TO ANALYZE:
- Characters mentioned in conversations or backstory
- Professional or community roles (librarian, nurse, fisherman, etc.)
- Family members of main characters
- Local residents who contribute to the plot

For each character, provide:
- name: The character's name or clear identifier (use display names like "Doña Esperanza", "Carmen la enfermera")
- type: "narrator", "protagonist", "antagonist", "supporting", "minor"
- gender: "male", "female", "neutral", "unknown"
- age: "child", "teenager", "young_adult", "adult", "elderly", "unknown"
- personality: Array of 2-4 personality traits (e.g., ["worried", "protective"], ["knowledgeable", "helpful"])
- speaking_style: Array of 2-3 speaking style descriptors (e.g., ["concerned", "motherly"], ["professional", "informative"])
- description: Brief description including their role and relevance to the story
- importance: "primary", "secondary", "minor"
- frequency: Estimated speaking/appearance frequency (0.0 to 1.0)

IMPORTANT: Cast a wide net - include even briefly mentioned characters if they have names or clear roles. 
Audiobooks need voice actors for every speaking part, no matter how small.

Text to analyze:
"""

# Per-chapter character detection prompt (more focused)
CHAPTER_DETECTION_PROMPT = """Analyze this chapter text and identify characters who ACTUALLY SPEAK in dialogue or have significant presence, not just those mentioned in passing.

Focus on:
- Characters who have direct dialogue (speaking lines in quotes)
- Characters who actively participate in scenes (not just mentioned)
- The narrator (if present)
- Characters with clear speaking roles for audiobook production

Do NOT include:
- Characters only briefly mentioned in passing
- Groups or collective entities unless they speak
- Historical figures or mythical beings unless they have dialogue
- Characters mentioned in backstory without current presence

For each character, provide a confidence level (0.0 to 1.0) based on:
- 1.0: Character has multiple dialogue lines or major scene presence
- 0.9: Character has dialogue or significant interaction
- 0.8: Character appears actively in scene but limited dialogue
- 0.7: Character has minor dialogue or brief active presence
- Below 0.7: Should generally not be included

Return valid JSON in this exact format:
{
  "characters": [
    {
      "name": "Character Name",
      "type": "narrator|protagonist|secondary|minor",
      "importance": "primary|secondary|minor", 
      "gender": "male|female|neutral|unknown",
      "age": "child|teenager|young_adult|adult|elderly|unknown",
      "description": "Brief description of role and dialogue in this chapter",
      "personality": ["trait1", "trait2"],
      "speaking_style": ["style1", "style2"],
      "confidence": 0.95,
      "has_dialogue": true,
      "dialogue_frequency": "high|medium|low"
    }
  ]
}

Only include characters you are confident (>0.9) actually speak or have significant scene presence.

CHAPTER TEXT:
"""

def detect_characters_from_manuscript(manuscript_dir: str) -> List[Dict[str, Any]]:
    """
    Detect characters from manuscript text files using per-chapter LLM analysis.
    
    Args:
        manuscript_dir: Path to directory containing .txt chapter files
        
    Returns:
        List of character dictionaries with name, traits, personality, etc.
    """
    if not HAS_LLM:
        print("Warning: LLM not available, using fallback", file=sys.stderr)
        return _get_fallback_narrator()
    
    try:
        manuscript_path = Path(manuscript_dir)
        if not manuscript_path.exists():
            raise ValueError(f"Manuscript directory does not exist: {manuscript_dir}")
        
        # Get workspace root (parent of manuscript dir)
        workspace_root = manuscript_path.parent
        
        # Get the effective LLM model (project-specific or global)
        llm_model = get_effective_llm_model(workspace_root)
        print(f"Using LLM model: {llm_model}", file=sys.stderr)
        
        # Read all text files
        txt_files = sorted(manuscript_path.glob("*.txt"))
        
        if not txt_files:
            raise ValueError(f"No .txt files found in {manuscript_dir}")
        
        print(f"Analyzing {len(txt_files)} chapter files individually for character detection...", file=sys.stderr)
        
        # Collect characters from each chapter
        all_characters = {}  # Use dict to automatically handle duplicates by name
        chapter_count = 0
        
        for txt_file in txt_files:
            chapter_count += 1
            content = txt_file.read_text(encoding="utf-8")
            if not content.strip():
                continue
                
            print(f"Processing {txt_file.name} ({chapter_count}/{len(txt_files)})...", file=sys.stderr)
            
            # Limit chapter text to reasonable size (6K characters per chapter)
            if len(content) > 6000:
                content = content[:6000] + "\n[... chapter continues ...]"
            
            # Call LLM for this chapter
            messages = [
                {"role": "system", "content": "You are an expert literary character analyst. Identify ALL characters that appear or are mentioned in this chapter text, including minor ones."},
                {"role": "user", "content": CHAPTER_DETECTION_PROMPT + content}
            ]
            
            try:
                # Use smaller token limit per chapter
                llm_response = chat_json(messages, model=llm_model, temperature=0.1, max_tokens=1500)
                
                if isinstance(llm_response, list):
                    chapter_characters = llm_response
                elif isinstance(llm_response, dict) and "characters" in llm_response:
                    chapter_characters = llm_response["characters"]
                else:
                    print(f"Warning: Unexpected response format for {txt_file.name}", file=sys.stderr)
                    continue
                
                # Add characters to our collection, merging duplicates
                for char in chapter_characters:
                    if isinstance(char, dict) and "name" in char:
                        char_name = char["name"].strip()
                        confidence = char.get("confidence", 0.5)
                        has_dialogue = char.get("has_dialogue", False)
                        
                        # Apply confidence filter - only include high-confidence characters
                        if confidence < 0.95:
                            continue
                            
                        # Prioritize characters with dialogue for audiobook production
                        if not has_dialogue and char.get("type") != "narrator" and confidence < 0.98:
                            continue
                        
                        if char_name:
                            # If we've seen this character before, merge the information
                            if char_name in all_characters:
                                existing_char = all_characters[char_name]
                                # Update confidence to highest seen
                                existing_char["confidence"] = max(existing_char.get("confidence", 0.0), confidence)
                                # Update description if this one is more detailed
                                if len(char.get("description", "")) > len(existing_char.get("description", "")):
                                    existing_char["description"] = char.get("description", existing_char.get("description", ""))
                                # Update dialogue status
                                existing_char["has_dialogue"] = existing_char.get("has_dialogue", False) or has_dialogue
                                # Increase frequency if seen in multiple chapters
                                existing_char["frequency"] = min(1.0, existing_char.get("frequency", 0.0) + 0.1)
                                # Merge personality traits (avoid duplicates)
                                existing_personality = set(existing_char.get("personality", []))
                                new_personality = set(char.get("personality", []))
                                existing_char["personality"] = list(existing_personality.union(new_personality))[:4]
                            else:
                                # New character - add confidence and dialogue info
                                char["confidence"] = confidence
                                char["has_dialogue"] = has_dialogue
                                all_characters[char_name] = char
                
                print(f"  Found {len(chapter_characters)} characters in {txt_file.name}", file=sys.stderr)
                
            except Exception as e:
                print(f"Warning: Failed to analyze {txt_file.name}: {e}", file=sys.stderr)
                continue
        
        # Convert to list and enhance characters
        enhanced_characters = []
        for char_name, char in all_characters.items():
            if isinstance(char, dict) and "name" in char:
                # Only include high-confidence characters
                confidence = char.get("confidence", 0.0)
                if confidence >= 0.95:
                    enhanced_char = _enhance_character_traits(char)
                    # Preserve confidence and dialogue information
                    enhanced_char["confidence"] = confidence
                    enhanced_char["has_dialogue"] = char.get("has_dialogue", False)
                    enhanced_char["dialogue_frequency"] = char.get("dialogue_frequency", "unknown")
                    enhanced_characters.append(enhanced_char)
        
        if not enhanced_characters:
            print("No high-confidence speaking characters detected, using fallback narrator", file=sys.stderr)
            return _get_fallback_narrator()
        
        # Sort by confidence and importance for consistent output
        enhanced_characters.sort(key=lambda x: (x.get("confidence", 0.0), x.get("frequency", 0.0)), reverse=True)
        
        print(f"Successfully detected {len(enhanced_characters)} high-confidence speaking characters", file=sys.stderr)
        print(f"Average confidence: {sum(c.get('confidence', 0) for c in enhanced_characters) / len(enhanced_characters):.2f}", file=sys.stderr)
        return enhanced_characters
        
    except Exception as e:
        print(f"Error in character detection: {e}", file=sys.stderr)
        return _get_fallback_narrator()

def _get_fallback_narrator() -> List[Dict[str, Any]]:
    """Return fallback narrator character."""
    return [{
        "name": "Narrator",
        "type": "narrator",
        "gender": "neutral", 
        "age": "adult",
        "personality": ["observant", "thoughtful"],
        "speaking_style": ["descriptive", "measured"],
        "frequency": 1.0,
        "importance": "primary",
        "accent": "neutral",
        "description": "The story narrator",
        "confidence": 1.0,
        "has_dialogue": True,
        "dialogue_frequency": "high"
    }]

def _enhance_character_traits(character: Dict[str, Any]) -> Dict[str, Any]:
    """
    Enhance character with additional traits needed for voice casting.
    """
    enhanced = character.copy()
    
    # Ensure required fields exist with defaults
    enhanced.setdefault("personality", _infer_personality(character))
    enhanced.setdefault("speaking_style", _infer_speaking_style(character))
    enhanced.setdefault("frequency", _infer_frequency(character))
    enhanced.setdefault("accent", "neutral")
    enhanced.setdefault("description", f"Character: {character.get('name', 'Unknown')}")
    enhanced.setdefault("type", "supporting")
    enhanced.setdefault("gender", "unknown")
    enhanced.setdefault("age", "adult")
    enhanced.setdefault("importance", "secondary")
    
    # Ensure arrays are lists
    if isinstance(enhanced["personality"], str):
        enhanced["personality"] = [enhanced["personality"]]
    if isinstance(enhanced["speaking_style"], str):
        enhanced["speaking_style"] = [enhanced["speaking_style"]]
    
    return enhanced

def _infer_personality(character: Dict[str, Any]) -> List[str]:
    """Infer personality traits from character description."""
    description = character.get("description", "").lower()
    char_type = character.get("type", "").lower()
    traits = []
    
    # Type-based inference
    if char_type == "narrator":
        traits.extend(["observant", "analytical"])
    elif char_type == "protagonist":
        traits.extend(["determined", "complex"])
    elif char_type == "antagonist":
        traits.extend(["challenging", "compelling"])
    
    # Description-based inference
    if any(word in description for word in ["young", "child", "kid"]):
        traits.extend(["energetic", "curious"])
    elif any(word in description for word in ["old", "elder", "mayor"]):
        traits.extend(["wise", "experienced"])
    
    if any(word in description for word in ["love", "romantic", "romance"]):
        traits.extend(["passionate", "gentle"])
    elif any(word in description for word in ["villain", "bad", "evil"]):
        traits.extend(["cunning", "intimidating"])
    
    return traits[:4] if traits else ["neutral", "balanced"]

def _infer_speaking_style(character: Dict[str, Any]) -> List[str]:
    """Infer speaking style from character type and description."""
    char_type = character.get("type", "").lower()
    description = character.get("description", "").lower()
    age = character.get("age", "").lower()
    
    if char_type == "narrator":
        return ["descriptive", "measured", "clear"]
    elif age in ["child", "teenager"] or any(word in description for word in ["child", "young", "kid"]):
        return ["animated", "energetic", "excited"]
    elif age == "elderly" or any(word in description for word in ["wise", "old", "elder"]):
        return ["thoughtful", "deliberate", "measured"]
    else:
        return ["conversational", "natural"]

def _infer_frequency(character: Dict[str, Any]) -> float:
    """Infer character frequency based on importance and type."""
    char_type = character.get("type", "").lower()
    importance = character.get("importance", "secondary").lower()
    
    if char_type == "narrator":
        return 1.0
    elif char_type == "protagonist":
        return 0.8
    elif importance == "primary":
        return 0.7
    elif importance == "secondary":
        return 0.4
    else:
        return 0.2

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python detect_characters.py <manuscript_dir>")
        sys.exit(1)
    
    manuscript_dir = sys.argv[1]
    characters = detect_characters_from_manuscript(manuscript_dir)
    
    # Save to project dossier for character management
    project_root = Path(manuscript_dir).parent if Path(manuscript_dir).parent.name != "sample" else Path(manuscript_dir).parent.parent
    output_file = project_root / "dossier" / "characters.json"
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(characters, f, indent=2, ensure_ascii=False)
    
    print(f"Saved {len(characters)} characters to {output_file}", file=sys.stderr)
    
    # Print JSON for immediate use
    print(json.dumps(characters, ensure_ascii=False, indent=2))
