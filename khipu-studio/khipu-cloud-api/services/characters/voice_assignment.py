"""
Voice assignment service - uses LLM to match characters to voices
"""
import os
import json
import logging
from typing import Dict, List
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


VOICE_ASSIGNMENT_PROMPT = """You are an expert casting director for audiobook production with strict gender-matching requirements.

Your task is to assign the most appropriate voice to each character based on:
- Character traits (gender, age, personality, speaking style)
- Voice characteristics (gender, age, tone, style, pitch, rate)
- Overall casting balance (variety and contrast)

Available voices:
{voices_description}

Characters to cast:
{characters_description}

Return a JSON object with voice assignments:
{{
  "assignments": [
    {{
      "character_name": "Character Name",
      "voice_id": "voice-id",
      "pitch_adjustment": 0,
      "rate_adjustment": 0,
      "confidence": 0.95,
      "reasoning": "Brief explanation of why this voice fits"
    }}
  ]
}}

PITCH/RATE ADJUSTMENT GUIDELINES:
- pitch_adjustment: -50 to +50 (percentage adjustment from baseline)
  * Negative = lower pitch (deeper, more mature)
  * Positive = higher pitch (younger, more energetic)
  * Child characters: +10 to +30
  * Elderly characters: -10 to -20
  * Default: 0 (use voice's natural pitch)
- rate_adjustment: -50 to +50 (percentage adjustment from baseline)
  * Negative = slower (deliberate, thoughtful)
  * Positive = faster (energetic, excited)
  * Calm/wise characters: -10 to -20
  * Energetic characters: +10 to +20
  * Default: 0 (use voice's natural rate)

CRITICAL RULES (MUST FOLLOW):
1. GENDER MATCHING IS MANDATORY:
   - Male characters (M) → ONLY Male voices (M)
   - Female characters (F) → ONLY Female voices (F)
   - Neutral/Unknown (N) → Can use any voice
2. Age matching:
   - child → child/teen voices
   - teen → teen/young adult voices
   - adult → adult voices (most common)
   - elderly → adult voices with mature quality
3. Consider personality and speaking style for voice characteristics
4. Narrator should get a clear, versatile, professional voice
5. Provide variety - avoid assigning same voice to multiple characters unless necessary
6. ONLY use voices from the provided list
7. If no perfect match exists, prioritize gender match over other traits"""


def format_voices_for_prompt(voices: List[Dict]) -> str:
    """Format voices list for LLM prompt with complete metadata"""
    lines = []
    for voice in voices:
        name = voice.get('name', voice.get('id', 'unknown').split('-')[-1].replace('Neural', ''))
        line = f"- {voice.get('id', 'unknown')}: {name}"
        
        # Build attributes list
        attrs = []
        
        # Gender is CRITICAL for matching
        gender = voice.get('gender', 'N')
        attrs.append(f"gender={gender}")
        
        # Age/age_hint
        age = voice.get('age') or voice.get('age_hint', 'adult')
        attrs.append(f"age={age}")
        
        # Style/tone
        style = voice.get('style') or voice.get('tone', 'neutral')
        if isinstance(style, list):
            style = style[0] if style else 'neutral'
        attrs.append(f"style={style}")
        
        # Pitch (if available)
        if 'pitch' in voice:
            attrs.append(f"pitch={voice['pitch']}")
        
        # Rate (if available)
        if 'rate' in voice:
            attrs.append(f"rate={voice['rate']}")
        
        line += f" ({', '.join(attrs)})"
        
        # Add description if available
        if 'description' in voice:
            line += f" - {voice['description']}"
        
        lines.append(line)
    
    return "\n".join(lines)


def format_characters_for_prompt(characters: List[Dict]) -> str:
    """Format characters list for LLM prompt"""
    lines = []
    for char in characters:
        line = f"- {char.get('name', 'Unknown')}"
        
        traits = char.get('traits', {})
        if traits:
            details = []
            if 'gender' in traits:
                details.append(f"gender: {traits['gender']}")
            if 'age' in traits:
                details.append(f"age: {traits['age']}")
            if traits.get('personality'):
                details.append(f"personality: {', '.join(traits['personality'])}")
            if traits.get('speaking_style'):
                details.append(f"style: {', '.join(traits['speaking_style'])}")
            
            if details:
                line += f" ({', '.join(details)})"
        
        if char.get('isNarrator'):
            line += " [NARRATOR - needs versatile voice]"
        elif char.get('isMainCharacter'):
            line += " [MAIN CHARACTER]"
        
        if char.get('description'):
            line += f" - {char['description']}"
        
        lines.append(line)
    
    return "\n".join(lines)


async def assign_voices_with_llm(
    characters: List[Dict],
    available_voices: List[Dict],
    api_key: str,
    model: str = "gpt-4o-mini"
) -> List[Dict]:
    """
    Use LLM to assign voices to characters based on traits.
    
    Args:
        characters: List of character dictionaries
        available_voices: List of available voice dictionaries
        api_key: OpenAI API key
        model: LLM model to use
        
    Returns:
        Updated characters list with voice assignments
    """
    if not api_key:
        raise ValueError("OpenAI API key not provided")
    
    if not available_voices:
        raise ValueError("No voices available for assignment")
    
    logger.info(f"Starting LLM-based voice assignment for {len(characters)} characters")
    
    # Initialize OpenAI async client
    import httpx
    http_client = httpx.AsyncClient(timeout=60.0)
    client = AsyncOpenAI(api_key=api_key, http_client=http_client)
    
    # Format data for prompt
    voices_desc = format_voices_for_prompt(available_voices)
    characters_desc = format_characters_for_prompt(characters)
    
    # Build prompt
    prompt = VOICE_ASSIGNMENT_PROMPT.format(
        voices_description=voices_desc,
        characters_description=characters_desc
    )
    
    try:
        # Call LLM
        logger.info(f"Calling LLM ({model}) for voice assignment")
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert audiobook casting director with deep knowledge of voice acting and character portrayal."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.3,  # Lower temperature for more consistent matching
            max_tokens=2000,
            response_format={"type": "json_object"}
        )
        
        # Parse response
        import json
        result = response.choices[0].message.content
        assignments_data = json.loads(result)
        
        # Extract assignments
        assignments = assignments_data.get("assignments", [])
        
        logger.info(f"LLM returned {len(assignments)} voice assignments")
        
        # Log first assignment details for debugging
        if assignments:
            first = assignments[0]
            logger.info(f"First assignment sample: {first}")
        
        # Apply assignments to characters
        assignment_map = {
            a["character_name"]: {
                "voiceId": a["voice_id"],
                "pitch_pct": a.get("pitch_adjustment", 0),
                "rate_pct": a.get("rate_adjustment", 0),
                "confidence": a.get("confidence", 0.5),
                "reasoning": a.get("reasoning", ""),
                "method": "llm_auto"
            }
            for a in assignments
        }
        
        # Update characters with assignments
        updated_characters = []
        for char in characters:
            char_copy = char.copy()
            char_name = char["name"]
            
            if char_name in assignment_map:
                char_copy["voiceAssignment"] = assignment_map[char_name]
                logger.info(f"  ✓ {char_name} → {assignment_map[char_name]['voiceId']} (pitch: {assignment_map[char_name]['pitch_pct']}, rate: {assignment_map[char_name]['rate_pct']})")
            else:
                logger.warning(f"  ✗ No assignment for {char_name}")
            
            updated_characters.append(char_copy)
        
        return updated_characters
        
    except Exception as e:
        logger.error(f"Failed to assign voices with LLM: {e}")
        raise ValueError(f"Voice assignment failed: {str(e)}")
