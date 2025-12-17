"""
Streaming version of character assignment that yields progress updates.
"""
import logging
import os
from typing import List, Dict, Any, AsyncIterator
import json
from services.planning.character_assignment import (
    ASSIGNMENT_PROMPT,
    NARRATOR_NAME
)

logger = logging.getLogger(__name__)


async def assign_characters_streaming(
    chapter_text: str,
    segments: List[Dict[str, Any]],
    available_characters: List[str],
    project_settings: Dict[str, Any]
) -> AsyncIterator[Dict[str, Any]]:
    """
    Stream character assignment progress as segments are processed.
    
    Yields progress dictionaries with:
    - current: number of segments processed
    - total: total segments
    - message: status message
    - complete: True when done (with 'segments' key containing results)
    """
    try:
        from openai import AsyncOpenAI
    except ImportError:
        logger.error("OpenAI library not installed")
        raise Exception("OpenAI library not installed")
    
    # Get OpenAI configuration
    api_key = None
    model = "gpt-4o-mini"
    
    if project_settings:
        creds = project_settings.get("creds", {}).get("llm", {}).get("openai", {})
        api_key = creds.get("apiKey")
        llm_settings = project_settings.get("llm", {})
        llm_engine = llm_settings.get("engine", {})
        model = llm_engine.get("model", model)
    
    if not api_key:
        api_key = os.environ.get("OPENAI_API_KEY")
    
    if not api_key:
        raise Exception("OpenAI API key not configured")
    
    client = AsyncOpenAI(api_key=api_key)
    
    total_segments = len(segments)
    logger.info(f"🤖 Starting streaming LLM character assignment for {total_segments} segments")
    logger.info(f"📋 Using model: {model}")
    logger.info(f"👥 Available characters: {available_characters}")
    
    # Prepare segments for LLM (without UUID, use order for reference)
    segments_for_llm = []
    for seg in segments:
        segments_for_llm.append({
            "order": seg["order"],
            "text": seg["text"],
            "start_idx": seg.get("start_idx"),
            "end_idx": seg.get("end_idx")
        })
    
    # Build prompt
    segments_json = json.dumps(segments_for_llm, ensure_ascii=False, indent=2)
    prompt = ASSIGNMENT_PROMPT.format(
        characters=", ".join(available_characters),
        chapter_text=chapter_text[:15000],
        segments=segments_json,
        segment_count=len(segments_for_llm)
    )
    
    # Try to get all assignments in one call
    yield {"current": 0, "total": total_segments, "message": "Analyzing all segments with AI..."}
    
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are an expert at analyzing literary text for audiobook production."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.3
        )
        
        content = response.choices[0].message.content
        llm_response = json.loads(content)
        
        # Extract assignments
        assignments_list = None
        if isinstance(llm_response, dict):
            for key in ['result', 'assignments', 'segments']:
                if key in llm_response:
                    assignments_list = llm_response[key]
                    break
            
            if not assignments_list and 'order' in llm_response:
                assignments_list = [llm_response]
            
            if not assignments_list:
                for value in llm_response.values():
                    if isinstance(value, list) and len(value) > 0:
                        assignments_list = value
                        break
        elif isinstance(llm_response, list):
            assignments_list = llm_response
        
        if not assignments_list:
            raise Exception("Could not extract assignments from LLM response")
        
        # Check if we need to process more segments individually
        if len(assignments_list) < len(segments_for_llm):
            logger.warning(f"⚠️ LLM returned only {len(assignments_list)} assignments for {len(segments_for_llm)} segments")
            
            assigned_orders = {a.get("order") for a in assignments_list if isinstance(a, dict) and "order" in a}
            missing_segments = [seg for seg in segments_for_llm if seg["order"] not in assigned_orders]
            
            logger.info(f"Processing {len(missing_segments)} missing segments individually...")
            
            # Process each missing segment and yield progress
            initial_count = len(assignments_list)
            for idx, seg in enumerate(missing_segments, start=1):
                current_progress = initial_count + idx
                # Ensure we never exceed total
                if current_progress > total_segments:
                    current_progress = total_segments
                    
                yield {
                    "current": current_progress,
                    "total": total_segments,
                    "message": f"Processing segment {current_progress}/{total_segments}..."
                }
                
                individual_prompt = f"""Assign the most appropriate character to this single text segment.

Available Characters: {", ".join(available_characters)}

Chapter Text (for context):
{chapter_text[:5000]}

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
                    
                    if isinstance(individual_result, dict) and "order" in individual_result:
                        assignments_list.append(individual_result)
                        logger.info(f"✅ Processed segment at order {seg['order']}")
                    else:
                        assignments_list.append({
                            "order": seg["order"],
                            "assigned_character": "narrador",
                            "confidence": 0.5,
                            "reasoning": "Fallback"
                        })
                except Exception as e:
                    logger.error(f"❌ Failed to process segment at order {seg['order']}: {e}")
                    assignments_list.append({
                        "order": seg["order"],
                        "assigned_character": "narrador",
                        "confidence": 0.3,
                        "reasoning": "Fallback due to error"
                    })
        else:
            # All segments assigned in one call
            yield {
                "current": total_segments,
                "total": total_segments,
                "message": "All segments assigned by AI"
            }
        
        # Build assignment map and apply to segments
        order_to_id = {seg["order"]: seg["id"] for seg in segments}
        assignment_map = {}
        
        for assignment in assignments_list:
            if isinstance(assignment, dict) and "order" in assignment and "assigned_character" in assignment:
                order = assignment["order"]
                character = assignment["assigned_character"]
                seg_id = order_to_id.get(order)
                
                if not seg_id:
                    continue
                
                if not character or not character.strip():
                    assignment_map[seg_id] = NARRATOR_NAME
                    continue
                
                # Case-insensitive matching
                character_lower = character.lower().strip()
                actual_character = None
                for avail_char in available_characters:
                    if avail_char.lower() == character_lower:
                        actual_character = avail_char
                        break
                
                assignment_map[seg_id] = actual_character if actual_character else character
        
        # Apply assignments to segments
        updated_segments = []
        for seg in segments:
            seg_id = seg["id"]
            assigned_character = assignment_map.get(seg_id, NARRATOR_NAME)
            
            if not assigned_character or not assigned_character.strip():
                assigned_character = NARRATOR_NAME
            
            updated_seg = {**seg}
            updated_seg["voice"] = assigned_character
            updated_segments.append(updated_seg)
        
        logger.info(f"✅ Successfully assigned characters to {len(updated_segments)} segments")
        
        # Yield completion with segments
        yield {
            "current": total_segments,
            "total": total_segments,
            "message": "Character assignment complete",
            "complete": True,
            "segments": updated_segments
        }
        
    except Exception as e:
        logger.error(f"LLM API call failed: {e}")
        raise
