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
- Copy order values EXACTLY as provided
- If unsure about a segment, still include it with your best guess

Required JSON format for ALL {segment_count} segments:
[
  {{
    "order": "copy_exact_order_from_above",
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
        from openai import AsyncOpenAI, AsyncAzureOpenAI
    except ImportError:
        logger.error("OpenAI library not installed")
        raise HTTPException(
            status_code=500,
            detail="OpenAI library not installed. Install with: pip install openai"
        )
    
    # Get LLM configuration
    api_key = None
    model = "gpt-4o-mini"  # Default model
    engine_name = "openai"  # Default engine
    
    if project_settings:
        llm_settings = project_settings.get("llm", {})
        llm_engine = llm_settings.get("engine", {})
        engine_name = llm_engine.get("name", "openai")
        model = llm_engine.get("model", model)
        
        creds = project_settings.get("creds", {}).get("llm", {})
        
        if engine_name == "azure-openai":
            azure_creds = creds.get("azure", {})
            api_key = azure_creds.get("apiKey")
            endpoint = azure_creds.get("endpoint")
            api_version = azure_creds.get("apiVersion", "2024-10-21")
            
            if not api_key or not endpoint:
                logger.error("Azure OpenAI credentials not configured")
                raise Exception(
                    "Azure OpenAI credentials not configured. Please add apiKey and endpoint to project settings at creds.llm.azure"
                )
            
            client = AsyncAzureOpenAI(
                api_key=api_key,
                azure_endpoint=endpoint,
                api_version=api_version
            )
        else:
            openai_creds = creds.get("openai", {})
            api_key = openai_creds.get("apiKey")
            
            # Fallback to environment variable for regular OpenAI
            if not api_key:
                api_key = os.environ.get("OPENAI_API_KEY")
            
            if not api_key:
                logger.error("OpenAI API key not configured")
                raise Exception(
                    "OpenAI API key not configured. Please add it to project settings at creds.llm.openai.apiKey"
                )
            
            client = AsyncOpenAI(api_key=api_key)
    else:
        # No project settings - try environment variable
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            logger.error("OpenAI API key not configured")
            raise Exception(
                "OpenAI API key not configured. Please add it to project settings or environment variable"
            )
        client = AsyncOpenAI(api_key=api_key)
    
    logger.info(f"🤖 Starting LLM character assignment for {len(segments)} segments")
    logger.info(f"📋 Using engine: {engine_name}, model: {model}")
    logger.info(f"👥 Available characters: {available_characters}")
    
    # Prepare segments for LLM (use 'order' for sequential reference, keep 'id' for identity)
    segments_for_llm = []
    for seg in segments:
        segments_for_llm.append({
            "order": seg["order"],  # Use order (0, 1, 2...) for LLM - easier to reference
            "text": seg["text"],
            "start_idx": seg.get("start_idx", 0),
            "end_idx": seg.get("end_idx", 0)
        })
    
    # Build prompt
    prompt = ASSIGNMENT_PROMPT.format(
        characters=", ".join(available_characters),
        chapter_text=chapter_text,  # Use full chapter text for context (matches desktop app)
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
        elif isinstance(llm_response, dict) and 'order' in llm_response:
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
            
            # Get orders of segments that were assigned
            assigned_orders = {a.get("order") for a in assignments_list if isinstance(a, dict) and "order" in a}
            
            # Process missing segments individually
            for seg in segments_for_llm:
                if seg["order"] not in assigned_orders:
                    logger.info(f"Processing missing segment order {seg['order']} individually...")
                    individual_prompt = f"""Assign the most appropriate character to this single text segment.

Available Characters: {", ".join(available_characters)}

Chapter Text (for context):
{chapter_text}

Segment to process:
{json.dumps(seg, ensure_ascii=False, indent=2)}

Rules:
- Use specific character names only for their actual dialogue
- Use "narrador" for narrative/descriptive text
- Use "desconocido" only if it's clearly dialogue but character is unknown

Return a JSON object with this exact structure:
{{
  "order": {seg['order']},
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
                        if isinstance(individual_result, dict) and "order" in individual_result:
                            assignments_list.append(individual_result)
                            logger.info(f"✅ Processed segment at order {seg['order']} individually")
                        else:
                            logger.warning(f"⚠️ Invalid individual response for segment at order {seg['order']}")
                            # Add fallback assignment
                            assignments_list.append({
                                "order": seg["order"],
                                "assigned_character": "narrador",
                                "confidence": 0.5,
                                "reasoning": "Fallback due to invalid response"
                            })
                    except Exception as e:
                        logger.error(f"❌ Failed to process segment at order {seg['order']}: {e}")
                        # Add fallback assignment
                        assignments_list.append({
                            "order": seg["order"],
                            "assigned_character": "narrador",
                            "confidence": 0.3,
                            "reasoning": "Fallback due to error"
                        })
        
        # Create order-to-id mapping (LLM uses order, we need to map to stable id)
        order_to_id = {seg["order"]: seg["id"] for seg in segments}
        
        # Create assignment map (keyed by segment id for stable identity)
        assignment_map = {}
        logger.info(f"🔍 Building assignment_map from {len(assignments_list)} assignments")
        for assignment in assignments_list:
            if isinstance(assignment, dict) and "order" in assignment and "assigned_character" in assignment:
                order = assignment["order"]
                character = assignment["assigned_character"]
                seg_id = order_to_id.get(order)  # Map order to stable UUID
                if not seg_id:
                    logger.warning(f"⚠️ Order {order} not found in segments")
                    continue
                logger.debug(f"   Processing assignment: order={order}, id={seg_id}, character={character}")
                
                # Skip empty or None assignments
                if not character or not character.strip():
                    logger.warning(f"⚠️ Segment at order {order} (id {seg_id}) has empty assigned_character, using narrador as default")
                    assignment_map[seg_id] = NARRATOR_NAME
                    continue
                
                # Case-insensitive matching: find the actual character name from available list
                character_lower = character.lower().strip()
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
                    
                logger.info(f"   ✅ Order {order} (id {seg_id[:8]}...): {character} → {assignment_map[seg_id]}")
        
        # Apply assignments to segments (using stable id)
        updated_segments = []
        logger.info(f"🔍 Applying assignments to {len(segments)} segments")
        logger.info(f"🔍 Assignment_map has {len(assignment_map)} entries")
        for idx, seg in enumerate(segments):
            seg_id = seg["id"]  # Use stable UUID
            order = seg["order"]
            assigned_character = assignment_map.get(seg_id, NARRATOR_NAME)
            if idx < 5 or idx >= len(segments) - 3:  # Log first 5 and last 3
                logger.debug(f"   Segment order={order}, id={seg_id[:8]}..., assigned={assigned_character}, in_map={seg_id in assignment_map}")
            
            # Ensure we never assign empty strings - use NARRATOR_NAME as fallback
            if not assigned_character or not assigned_character.strip():
                assigned_character = NARRATOR_NAME
            
            # Create updated segment with assignment
            updated_seg = {**seg}
            updated_seg["voice"] = assigned_character
            updated_segments.append(updated_seg)
        
        # Log a few sample assignments for debugging
        logger.info(f"✅ Successfully assigned characters to {len(updated_segments)} segments")
        logger.info(f"📝 Sample assignments: seg 80={updated_segments[50]['voice'] if len(updated_segments) > 50 else 'N/A'}, seg 86={updated_segments[56]['voice'] if len(updated_segments) > 56 else 'N/A'}, seg 90={updated_segments[60]['voice'] if len(updated_segments) > 60 else 'N/A'}")
        logger.info(f"📝 Assignment map keys: {sorted(assignment_map.keys())[:10]}... (showing first 10)")
        return updated_segments
        
    except Exception as e:
        logger.error(f"LLM API call failed: {e}")
        raise
