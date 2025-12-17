"""
Character detection service - uses LLM to analyze manuscript and extract characters
"""
import logging
from typing import Dict, List, Optional
from openai import AsyncOpenAI, AsyncAzureOpenAI

logger = logging.getLogger(__name__)


CHAPTER_DETECTION_PROMPT = """You are an expert at analyzing literary texts to identify characters for audiobook production.

Analyze the provided text and identify key characters that appear, including:
- Named characters (e.g., "Patricia", "Don Cipriano")
- Characters with roles (e.g., "la bibliotecaria", "Carmen la enfermera")
- The narrator (ALWAYS include the narrator as a character for audiobook casting)

Return a JSON array with this format:
[
  {
    "name": "Character Name",
    "type": "protagonist|secondary|narrator",
    "importance": "primary|secondary|minor",
    "gender": "M|F|N",
    "age": "child|teen|adult|elderly",
    "description": "Brief description",
    "personality": ["trait1", "trait2"],
    "speaking_style": ["style1", "style2"],
    "confidence": 0.95,
    "has_dialogue": true
  }
]

IMPORTANT FOR AUDIOBOOKS: 
- ALWAYS include the narrator as a character (type: "narrator", importance: "primary")
- The narrator reads all narrative text and descriptions
- Only include characters with confidence >= 0.95
- Prioritize characters who speak (has_dialogue: true)
- Use original language (if Spanish text, keep names in Spanish)

TEXT TO ANALYZE:"""


async def detect_characters_from_chapters(
    chapters: List[Dict], 
    api_key: str, 
    model: str = "gpt-4o-mini",
    engine_name: str = "openai",
    azure_endpoint: Optional[str] = None,
    azure_api_version: str = "2024-10-21"
) -> List[Dict]:
    """
    Detect characters from manuscript chapters using LLM analysis.
    
    Args:
        chapters: List of chapter dictionaries with 'content' field
        api_key: OpenAI or Azure OpenAI API key
        model: LLM model to use
        engine_name: "openai" or "azure-openai"
        azure_endpoint: Azure OpenAI endpoint (required if engine_name is "azure-openai")
        azure_api_version: Azure OpenAI API version
        
    Returns:
        List of detected character dictionaries
    """
    if not api_key:
        raise ValueError("API key not provided")
    
    logger.info(f"Starting LLM-based character detection from {len(chapters)} chapters (engine: {engine_name})")
    
    # Initialize appropriate client
    import httpx
    http_client = httpx.AsyncClient(timeout=60.0)
    
    if engine_name == "azure-openai":
        if not azure_endpoint:
            raise ValueError("Azure endpoint required for Azure OpenAI")
        client = AsyncAzureOpenAI(
            api_key=api_key,
            azure_endpoint=azure_endpoint,
            api_version=azure_api_version,
            http_client=http_client
        )
    else:
        client = AsyncOpenAI(api_key=api_key, http_client=http_client)
    
    # Track character appearances across chapters
    character_appearances = {}
    total_chapters = len(chapters)
    
    for idx, chapter in enumerate(chapters, 1):
        content = chapter.get('content', '')
        if not content.strip():
            continue
        
        logger.info(f"Processing chapter {idx}/{total_chapters}")
        
        # Limit chapter text to reasonable size (6K characters per chapter)
        if len(content) > 6000:
            content = content[:6000] + "\n[... chapter continues ...]"
        
        try:
            # Call LLM for this chapter
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert literary character analyst. CRITICAL: Preserve the original language of the text - if the text is in Spanish, write ALL character names and descriptions in Spanish. If English, use English. Do NOT translate to English unless the source is English."
                    },
                    {
                        "role": "user",
                        "content": CHAPTER_DETECTION_PROMPT + "\n\n" + content
                    }
                ],
                temperature=0.1,
                max_tokens=1500,
                response_format={"type": "json_object"}
            )
            
            # Parse response
            result = response.choices[0].message.content
            import json
            chapter_characters = json.loads(result)
            
            # Handle both direct array and {"characters": [...]} format
            if isinstance(chapter_characters, dict):
                chapter_characters = chapter_characters.get("characters", [])
            
            # Track character appearances
            for char in chapter_characters:
                if not isinstance(char, dict) or "name" not in char:
                    continue
                
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
                    # Track character appearances
                    if char_name not in character_appearances:
                        character_appearances[char_name] = {
                            "character_data": char,
                            "chapters": set(),
                            "total_confidence": 0.0,
                            "appearance_count": 0
                        }
                    
                    # Update appearance tracking
                    character_appearances[char_name]["chapters"].add(chapter.get('title', f'Chapter {idx}'))
                    character_appearances[char_name]["total_confidence"] += confidence
                    character_appearances[char_name]["appearance_count"] += 1
                    
                    # Keep the most complete character data (highest confidence)
                    if confidence > character_appearances[char_name]["character_data"].get("confidence", 0):
                        character_appearances[char_name]["character_data"] = char
            
            logger.info(f"  Found {len(chapter_characters)} characters in chapter {idx}")
            
        except Exception as e:
            logger.error(f"Failed to analyze chapter {idx}: {e}")
            continue
    
    # Convert character appearances to final character list with frequency
    all_characters = []
    for char_name, appearance_data in character_appearances.items():
        char = appearance_data["character_data"].copy()
        
        # Calculate frequency as percentage of chapters where character appears
        frequency = (appearance_data["appearance_count"] / total_chapters) * 100
        char["frequency"] = round(frequency, 2)
        
        # Add appearance details
        char["chapters"] = list(appearance_data["chapters"])
        char["average_confidence"] = appearance_data["total_confidence"] / appearance_data["appearance_count"]
        
        all_characters.append(char)
    
    # Sort by frequency (most frequent first)
    all_characters.sort(key=lambda c: c.get("frequency", 0), reverse=True)
    
    # Convert to storage format
    characters = []
    for idx, char in enumerate(all_characters[:20], 1):  # Limit to top 20
        character = {
            "id": f"char_{idx:03d}",
            "name": char.get("name", ""),
            "description": char.get("description"),
            "frequency": char.get("frequency", 0),
            "traits": {
                "gender": char.get("gender", "N"),
                "age": char.get("age", "adult"),
                "personality": char.get("personality", []),
                "speaking_style": char.get("speaking_style", [])
            },
            "quotes": [],
            "isNarrator": char.get("type") == "narrator",
            "isMainCharacter": char.get("importance") == "primary",
            "voiceAssignment": None
        }
        characters.append(character)
    
    logger.info(f"Detection complete: {len(characters)} characters found")
    return characters
