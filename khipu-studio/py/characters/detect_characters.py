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

def consolidate_characters_with_llm(characters: List[Dict[str, Any]], llm_model: str) -> List[Dict[str, Any]]:
    """Use LLM to intelligently consolidate similar characters based on names and descriptions"""
    if len(characters) <= 1:
        return characters
    
    # Prepare character data for LLM analysis
    character_data = []
    for i, char in enumerate(characters):
        character_data.append({
            "id": i,
            "name": char.get("name", ""),
            "description": char.get("description", ""),
            "personality": char.get("personality", []),
            "speaking_style": char.get("speaking_style", []),
            "gender": char.get("gender", ""),
            "age": char.get("age", ""),
            "type": char.get("type", ""),
            "importance": char.get("importance", "")
        })
    
    consolidation_prompt = f"""You are an expert at character analysis for audiobook production. 

Analyze this list of characters and identify which ones represent the SAME PERSON who should be consolidated:

{json.dumps(character_data, indent=2, ensure_ascii=False)}

CONSOLIDATION METHODOLOGY:
1. PRIMARY ANALYSIS - Character Descriptions:
   - Compare character descriptions carefully
   - Characters with identical or very similar descriptions are likely the same person
   - Look for overlapping roles, relationships, and character traits
   - Consider context clues that suggest the same individual

2. NAME VARIATION ANALYSIS:
   - Consider common name variations: nicknames, formal/informal versions, titles
   - Family relationship terms: "Mamá", "Papá", "Abuela" may refer to the same person
   - Professional titles: "Doctor", "Profesor", "Señor/Señora" with same base name
   - Articles and honorifics: "Don/Doña", "El/La" are often just variations

3. CONSOLIDATION CRITERIA (ALL must be met):
   - Descriptions are compatible (not contradictory)
   - Names suggest the same person (variations, not different people)
   - No conflicting information (age, gender, role, relationships)
   - Same or compatible personality traits and speaking styles

4. KEEP SEPARATE when:
   - Descriptions clearly indicate different people
   - Names suggest family members (parent vs child, siblings)
   - Contradictory information (different ages, genders, roles)
   - Characters interact with each other in the text

5. PRESERVE ORIGINAL LANGUAGE:
   - Maintain character information in the original language of the text
   - Use the most complete and descriptive name as canonical

Return a JSON object with consolidation groups:
{{
  "consolidations": [
    {{
      "primary_id": 0,
      "merge_ids": [2, 5],
      "reason": "Same person - descriptions indicate identical role and characteristics, names are variations of the same individual",
      "consolidated_name": "[Most complete name]"
    }}
  ],
  "keep_separate": [
    {{
      "ids": [1, 3],
      "reason": "Different people - descriptions indicate distinct individuals with different roles/relationships"
    }}
  ]
}}

Be LIBERAL with consolidation for name variations of the same person, but CONSERVATIVE for truly different people."""

    try:
        if _LOG:
            _LOG.info("Starting LLM-based character consolidation...")
        
        messages = [
            {"role": "system", "content": "You are an expert character analyst. Focus on character descriptions as the primary method for identifying duplicates. Be thorough in your analysis but only consolidate when evidence clearly indicates the same person."},
            {"role": "user", "content": consolidation_prompt}
        ]
        
        llm_response = chat_json(messages, model=llm_model, temperature=0.1, max_tokens=2000)
        
        if not isinstance(llm_response, dict) or "consolidations" not in llm_response:
            if _LOG:
                _LOG.warning("LLM consolidation failed - no valid response")
            return characters
            
        consolidations = llm_response.get("consolidations", [])
        
        if _LOG:
            _LOG.info(f"LLM suggested {len(consolidations)} consolidations")
        
        # Apply consolidations
        consolidated_characters = []
        used_ids = set()
        
        # Process consolidations
        for consolidation in consolidations:
            primary_id = consolidation.get("primary_id")
            merge_ids = consolidation.get("merge_ids", [])
            reason = consolidation.get("reason", "")
            consolidated_name = consolidation.get("consolidated_name", "")
            
            if primary_id is None or not merge_ids:
                continue
                
            if primary_id in used_ids or any(mid in used_ids for mid in merge_ids):
                continue  # Skip if already processed
                
            # Merge characters
            primary_char = characters[primary_id].copy()
            primary_char["name"] = consolidated_name or primary_char["name"]
            
            # Merge information from other characters
            for merge_id in merge_ids:
                if merge_id < len(characters):
                    merge_char = characters[merge_id]
                    
                    # Use longer description
                    if len(merge_char.get("description", "")) > len(primary_char.get("description", "")):
                        primary_char["description"] = merge_char["description"]
                    
                    # Merge personality traits
                    primary_personality = set(primary_char.get("personality", []))
                    merge_personality = set(merge_char.get("personality", []))
                    primary_char["personality"] = list(primary_personality.union(merge_personality))[:4]
                    
                    # Merge speaking styles
                    primary_styles = set(primary_char.get("speaking_style", []))
                    merge_styles = set(merge_char.get("speaking_style", []))
                    primary_char["speaking_style"] = list(primary_styles.union(merge_styles))[:3]
                    
                    # Use highest confidence
                    primary_char["confidence"] = max(
                        primary_char.get("confidence", 0.0),
                        merge_char.get("confidence", 0.0)
                    )
                    
                    # Increase frequency for multiple appearances
                    primary_char["frequency"] = min(1.0, 
                        primary_char.get("frequency", 0.0) + 0.1
                    )
            
            consolidated_characters.append(primary_char)
            used_ids.add(primary_id)
            used_ids.update(merge_ids)
            
            if _LOG:
                _LOG.info(f"Consolidated characters: {reason}")
        
        # Add non-consolidated characters
        for i, char in enumerate(characters):
            if i not in used_ids:
                consolidated_characters.append(char)
        
        if _LOG:
            _LOG.info(f"Character consolidation complete: {len(characters)} -> {len(consolidated_characters)} characters")
        
        return consolidated_characters
        
    except Exception as e:
        if _LOG:
            _LOG.error(f"LLM consolidation failed: {e}")
        return characters

def load_project_config(workspace_root: Path) -> Dict[str, Any]:
    """Load project-specific configuration that might override global LLM settings."""
    project_config_path = workspace_root / "project.khipu.json"
    if _LOG:
        _LOG.info(f"Looking for project config at: {project_config_path}")
        _LOG.info(f"Config file exists: {project_config_path.exists()}")
    
    if project_config_path.exists():
        try:
            with open(project_config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                if _LOG:
                    _LOG.info(f"Successfully loaded config with keys: {list(config.keys())}")
                return config
        except Exception as e:
            if _LOG:
                _LOG.warning(f"Failed to load project config: {e}")
    return {}

def get_effective_llm_model(workspace_root: Path) -> str:
    """Get the LLM model to use from project-specific config only."""
    project_config = load_project_config(workspace_root)
    
    # Debug logging
    if _LOG:
        _LOG.info(f"Project config loaded: {project_config}")
    
    # Check if project config specifies an LLM model
    if "llm" in project_config and "engine" in project_config["llm"]:
        engine = project_config["llm"]["engine"]
        if _LOG:
            _LOG.info(f"Found LLM engine config: {engine}")
        if isinstance(engine, dict) and engine.get("name") == "openai" and "model" in engine:
            model = engine["model"]
            if _LOG:
                _LOG.info(f"Using project-specific LLM model: {model}")
            return model
    
    # No valid project config found - fail gracefully
    error_msg = "No valid project-specific LLM model configuration found. Please check your project.khipu.json file."
    if _LOG:
        _LOG.error(error_msg)
    raise ValueError(error_msg)

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
- description: Brief description including their role and relevance to the story. The description must be provided in the same language as the source text.
- importance: "primary", "secondary", "minor"
- frequency: Estimated speaking/appearance frequency (0.0 to 1.0)

IMPORTANT: Cast a wide net - include even briefly mentioned characters if they have names or clear roles. 
Audiobooks need voice actors for every speaking part, no matter how small.

Text to analyze:
"""

# Per-chapter character detection prompt (more focused)
CHAPTER_DETECTION_PROMPT = """Analyze this chapter text and identify characters who ACTUALLY SPEAK in dialogue or have significant presence.

CRITICAL LANGUAGE REQUIREMENT: 
- You MUST write ALL character names and descriptions in THE SAME LANGUAGE as the source text
- If the text is in Spanish, write names and descriptions in Spanish
- If the text is in English, write names and descriptions in English  
- PRESERVE the exact character names as they appear in the original text
- DO NOT translate names or descriptions to English

CHARACTER IDENTIFICATION:
- Characters who have direct dialogue (speaking lines in quotes)
- Characters who actively participate in scenes (not just mentioned)
- The narrator (if present)
- Characters with clear speaking roles for audiobook production

For each character, provide:
- name: EXACT name as it appears in the source text (preserve original language)
- description: Brief description in the SAME LANGUAGE as the source text
- confidence: 0.0 to 1.0 based on dialogue presence and scene participation

EXAMPLES:
- If text has "Mamá de Lucía", use "Mamá de Lucía" (not "Lucía's mother")
- If text has "Don Carlos", use "Don Carlos" (not "Mr. Carlos")
- If character speaks in Spanish, describe them in Spanish

Text to analyze:
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
        
        # Get workspace root - find the directory containing project.khipu.json
        # Start from manuscript dir and go up until we find project.khipu.json
        workspace_root = manuscript_path
        while workspace_root.parent != workspace_root:  # Not at filesystem root
            workspace_root = workspace_root.parent
            if (workspace_root / "project.khipu.json").exists():
                break
        else:
            # If we didn't find project.khipu.json, use the parent of manuscript dir as fallback
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
        all_characters = []  # Use list instead of dict for initial collection
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
                {"role": "system", "content": "You are an expert literary character analyst. CRITICAL: Preserve the original language of the text - if the text is in Spanish, write ALL character names and descriptions in Spanish. If English, use English. Do NOT translate to English unless the source is English."},
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
                
                # Add high-confidence characters to our collection
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
                            # Add confidence and dialogue info
                            char["confidence"] = confidence
                            char["has_dialogue"] = has_dialogue
                            all_characters.append(char)
                
                print(f"  Found {len(chapter_characters)} characters in {txt_file.name}", file=sys.stderr)
                
            except Exception as e:
                print(f"Warning: Failed to analyze {txt_file.name}: {e}", file=sys.stderr)
                continue
        
        if not all_characters:
            print("No characters detected from any chapter", file=sys.stderr)
            return _get_fallback_narrator()
        
        # Use LLM-based consolidation to merge similar characters intelligently
        print(f"Starting intelligent character consolidation for {len(all_characters)} characters...", file=sys.stderr)
        consolidated_characters = consolidate_characters_with_llm(all_characters, llm_model)
        
        # Enhance consolidated characters
        enhanced_characters = []
        for char in consolidated_characters:
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
