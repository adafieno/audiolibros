"""
LLM-based character assignment for planning segments.
"""
import logging
import os
from typing import List, Dict, Any
import json
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# Default narrator name for non-dialogue segments
NARRATOR_NAME = "narrador"
UNKNOWN_CHARACTER = "desconocido"


ASSIGNMENT_PROMPT = """You are an expert at analyzing literary text for audiobook production. Your task is to assign characters to text segments.

CRITICAL REQUIREMENT: You MUST process ALL segments provided below. This is mandatory - no exceptions.

Given the full chapter text for context and a list of available characters, you need to assign the most appropriate character/voice to EACH AND EVERY segment listed.

IMPORTANT RULES:
1. Assign specific characters only to their actual dialogue
2. Use "narrador" for narrative/descriptive text (not dialogue)  
3. Use "desconocido" only if it's clearly dialogue but you can't determine which character
4. Consider the full chapter context to make intelligent assignments
5. Pay attention to speech attribution (e.g., "dijo María", "respondió Juan")

Available Characters: {characters}

Chapter Text:
{chapter_text}

SEGMENTS TO PROCESS (ALL {segment_count} MUST BE PROCESSED):
{segments}

MANDATORY OUTPUT REQUIREMENTS:
- Return a JSON array with EXACTLY {segment_count} objects
- Process EVERY segment listed above - DO NOT SKIP ANY
- Each object must include all required fields
- Copy segment_id values EXACTLY as provided
- If unsure about a segment, still include it with your best guess

Required JSON format for ALL {segment_count} segments:
[
  {{
    "segment_id": "copy_exact_id_from_above",
    "assigned_character": "character_name_from_available_list_or_narrador", 
    "confidence": 0.95,
    "reasoning": "brief explanation"
  }}
]

VALIDATION CHECK: Your response must be a JSON array containing exactly {segment_count} assignment objects."""


async def assign_characters_with_llm(
    chapter_text: str,
    segments: List[Dict[str, Any]],
    available_characters: List[str],
    project_settings: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    Assign characters to segments using LLM analysis.
    
    Args:
        chapter_text: Full chapter text for context
        segments: List of segment dictionaries
        available_characters: List of available character names
        project_settings: Project settings containing LLM configuration
        
    Returns:
        Updated segments list with character assignments
    """
    try:
        from openai import AsyncOpenAI
    except ImportError:
        logger.error("OpenAI library not installed")
        raise HTTPException(
            status_code=500,
            detail="OpenAI library not installed. Install with: pip install openai"
        )
    
    # Get OpenAI configuration
    api_key = None
    model = "gpt-4o-mini"  # Default model
    
    if project_settings:
        creds = project_settings.get("creds", {}).get("llm", {}).get("openai", {})
        api_key = creds.get("apiKey")
        llm_settings = project_settings.get("llm", {})
        llm_engine = llm_settings.get("engine", {})
        model = llm_engine.get("model", model)
    
    # Fallback to environment variable
    if not api_key:
        api_key = os.environ.get("OPENAI_API_KEY")
    
    if not api_key:
        logger.error("OpenAI API key not configured")
        raise Exception(
            "OpenAI API key not configured. Please add it to project settings at creds.llm.openai.apiKey"
        )
    
    client = AsyncOpenAI(api_key=api_key)
    
    logger.info(f"🤖 Starting LLM character assignment for {len(segments)} segments")
    logger.info(f"📋 Using model: {model}")
    logger.info(f"👥 Available characters: {available_characters}")
    
    # Prepare segments for LLM (include only relevant fields)
    segments_for_llm = []
    for seg in segments:
        segments_for_llm.append({
            "segment_id": seg["segment_id"],
            "text": seg["text"],
            "start_idx": seg.get("start_idx", 0),
            "end_idx": seg.get("end_idx", 0)
        })
    
    # Build prompt
    prompt = ASSIGNMENT_PROMPT.format(
        characters=", ".join(available_characters),
        chapter_text=chapter_text[:5000],  # Limit context to first 5000 chars to save tokens
        segments=json.dumps(segments_for_llm, ensure_ascii=False, indent=2),
        segment_count=len(segments_for_llm)
    )
    
    logger.info(f"Calling OpenAI with prompt for {len(segments_for_llm)} segments...")
    
    try:
        # Call OpenAI API
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are an expert at analyzing literary text for audiobook production. You MUST process every single segment provided - no exceptions."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.3
        )
        
        # Parse response
        content = response.choices[0].message.content
        
        # Try to extract JSON from response (matching desktop app logic)
        llm_response = None
        try:
            llm_response = json.loads(content)
        except json.JSONDecodeError:
            logger.error(f"Failed to parse LLM response as JSON: {content[:200]}")
            raise
        
        # Extract assignments array from response (handle multiple formats)
        assignments_list = None
        if isinstance(llm_response, dict) and 'result' in llm_response:
            assignments_list = llm_response['result']
        elif isinstance(llm_response, dict) and 'assignments' in llm_response:
            assignments_list = llm_response['assignments']
        elif isinstance(llm_response, dict) and 'segments' in llm_response:
            assignments_list = llm_response['segments']
        elif isinstance(llm_response, list):
            # Response is already a list
            assignments_list = llm_response
        elif isinstance(llm_response, dict) and 'segment_id' in llm_response:
            # Single assignment object - wrap in array
            logger.info("Single assignment detected, wrapping in array")
            assignments_list = [llm_response]
        else:
            # Try to find any list value in the response object
            if isinstance(llm_response, dict):
                for key, value in llm_response.items():
                    if isinstance(value, list) and len(value) > 0:
                        logger.info(f"Found array under key '{key}'")
                        assignments_list = value
                        break
        
        if not assignments_list:
            logger.error(f"Could not extract assignments from LLM response. Keys: {list(llm_response.keys()) if isinstance(llm_response, dict) else 'Not a dict'}")
            logger.error(f"Response preview: {str(llm_response)[:500]}")
            raise Exception("Invalid LLM response format - could not find assignments array")
        
        # Check if we got assignments for all segments
        if len(assignments_list) < len(segments_for_llm):
            logger.warning(f"⚠️ LLM returned only {len(assignments_list)} assignments for {len(segments_for_llm)} segments. Processing remaining segments individually...")
            
            # Get IDs of segments that were assigned
            assigned_ids = {a.get("segment_id") for a in assignments_list if isinstance(a, dict) and "segment_id" in a}
            
            # Process missing segments individually
            for seg in segments_for_llm:
                if seg["segment_id"] not in assigned_ids:
                    logger.info(f"Processing missing segment {seg['segment_id']} individually...")
                    individual_prompt = f"""Assign the most appropriate character to this single text segment.

Available Characters: {", ".join(available_characters)}

Segment text: "{seg['text'][:200]}..."

Rules:
- Use specific character names only for their actual dialogue
- Use "narrador" for narrative/descriptive text
- Use "desconocido" only if it's clearly dialogue but character is unknown

Return a JSON object with this exact structure:
{{
  "segment_id": {seg['segment_id']},
  "assigned_character": "character_name",
  "confidence": 0.95,
  "reasoning": "brief explanation"
}}"""
                    
                    try:
                        individual_response = await client.chat.completions.create(
                            model=model,
                            messages=[
                                {"role": "system", "content": "You are an expert at analyzing literary text for audiobook production."},
                                {"role": "user", "content": individual_prompt}
                            ],
                            response_format={"type": "json_object"},
                            temperature=0.3
                        )
                        
                        individual_content = individual_response.choices[0].message.content
                        individual_result = json.loads(individual_content)
                        
                        # Extract the assignment object
                        if isinstance(individual_result, dict) and "segment_id" in individual_result:
                            assignments_list.append(individual_result)
                            logger.info(f"✅ Processed segment {seg['segment_id']} individually")
                        else:
                            logger.warning(f"⚠️ Invalid individual response for segment {seg['segment_id']}")
                            # Add fallback assignment
                            assignments_list.append({
                                "segment_id": seg["segment_id"],
                                "assigned_character": "narrador",
                                "confidence": 0.5,
                                "reasoning": "Fallback due to invalid response"
                            })
                    except Exception as e:
                        logger.error(f"❌ Failed to process segment {seg['segment_id']}: {e}")
                        # Add fallback assignment
                        assignments_list.append({
                            "segment_id": seg["segment_id"],
                            "assigned_character": "narrador",
                            "confidence": 0.3,
                            "reasoning": "Fallback due to error"
                        })
        
        # Create assignment map
        assignment_map = {}
        for assignment in assignments_list:
            if isinstance(assignment, dict) and "segment_id" in assignment and "assigned_character" in assignment:
                seg_id = assignment["segment_id"]
                character = assignment["assigned_character"]
                
                # Case-insensitive matching: find the actual character name from available list
                character_lower = character.lower()
                actual_character = None
                for avail_char in available_characters:
                    if avail_char.lower() == character_lower:
                        actual_character = avail_char
                        break
                
                # If not found in available characters, keep original (might be narrador/desconocido)
                if actual_character:
                    assignment_map[seg_id] = actual_character
                else:
                    assignment_map[seg_id] = character
                    
                logger.info(f"   ✅ Segment {seg_id}: {character} → {assignment_map[seg_id]}")
        
        # Apply assignments to segments
        updated_segments = []
        for seg in segments:
            seg_id = seg["segment_id"]
            assigned_character = assignment_map.get(seg_id, NARRATOR_NAME)
            
            # Create updated segment with assignment
            updated_seg = {**seg}
            updated_seg["voice"] = assigned_character if assigned_character else None
            updated_segments.append(updated_seg)
        
        logger.info(f"✅ Successfully assigned characters to {len(updated_segments)} segments")
        return updated_segments
        
    except Exception as e:
        logger.error(f"LLM API call failed: {e}")
        raise
