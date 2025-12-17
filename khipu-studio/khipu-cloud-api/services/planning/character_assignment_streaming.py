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
        from openai import AsyncOpenAI, AsyncAzureOpenAI
    except ImportError:
        logger.error("OpenAI library not installed")
        raise Exception("OpenAI library not installed")
    
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
    
    total_segments = len(segments)
    logger.info(f"🤖 Starting streaming LLM character assignment for {total_segments} segments")
    logger.info(f"📋 Using engine: {engine_name}, model: {model}")
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
    
    # Process in batches for real-time progress feedback
    BATCH_SIZE = 20  # Process 20 segments at a time for better progress updates
    assignments_list = []
    
    total_batches = (len(segments_for_llm) + BATCH_SIZE - 1) // BATCH_SIZE
    
    for batch_idx in range(total_batches):
        start_idx = batch_idx * BATCH_SIZE
        end_idx = min(start_idx + BATCH_SIZE, len(segments_for_llm))
        batch_segments = segments_for_llm[start_idx:end_idx]
        
        current_progress = start_idx
        yield {
            "current": current_progress,
            "total": total_segments,
            "message": f"Analyzing segments {start_idx + 1}-{end_idx} with AI..."
        }
        
        # Build prompt for this batch
        segments_json = json.dumps(batch_segments, ensure_ascii=False, indent=2)
        prompt = ASSIGNMENT_PROMPT.format(
            characters=", ".join(available_characters),
            chapter_text=chapter_text[:15000],
            segments=segments_json,
            segment_count=len(batch_segments)
        )
        
        try:
            logger.info(f"🔵 Calling LLM for batch {batch_idx + 1}/{total_batches} with {len(batch_segments)} segments")
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
            logger.info(f"🔵 Raw LLM response (first 500 chars): {content[:500]}")
            llm_response = json.loads(content)
            logger.info(f"🔵 Parsed response type: {type(llm_response)}")
            logger.info(f"🔵 Response keys: {list(llm_response.keys()) if isinstance(llm_response, dict) else 'N/A'}")
            
            # Extract assignments from this batch
            batch_assignments = None
            if isinstance(llm_response, dict):
                for key in ['result', 'assignments', 'segments']:
                    if key in llm_response:
                        batch_assignments = llm_response[key]
                        logger.info(f"🔵 Found assignments under key '{key}': {len(batch_assignments) if isinstance(batch_assignments, list) else 'not a list'}")
                        break
                
                if not batch_assignments and 'order' in llm_response:
                    batch_assignments = [llm_response]
                    logger.info("🔵 Single assignment object detected")
                
                if not batch_assignments:
                    for value in llm_response.values():
                        if isinstance(value, list) and len(value) > 0:
                            batch_assignments = value
                            logger.info(f"🔵 Found assignments in dict value: {len(batch_assignments)}")
                            break
            elif isinstance(llm_response, list):
                batch_assignments = llm_response
                logger.info(f"🔵 Response is a list with {len(batch_assignments)} items")
            
            if batch_assignments:
                # Log first assignment for debugging
                if batch_assignments and len(batch_assignments) > 0:
                    logger.info(f"🔵 First assignment sample: {batch_assignments[0]}")
                assignments_list.extend(batch_assignments)
                logger.info(f"✅ Processed batch {batch_idx + 1}/{total_batches}: {len(batch_assignments)} assignments")
            else:
                logger.warning(f"⚠️ No assignments extracted from batch {batch_idx + 1}")
                logger.warning(f"⚠️ Full response was: {llm_response}")
                # Add fallback assignments for this batch
                for seg in batch_segments:
                    assignments_list.append({
                        "order": seg["order"],
                        "assigned_character": NARRATOR_NAME,
                        "confidence": 0.5,
                        "reasoning": "Fallback - no response from LLM"
                    })
            
            # Yield progress after each batch
            yield {
                "current": end_idx,
                "total": total_segments,
                "message": f"Processed {end_idx}/{total_segments} segments"
            }
            
        except Exception as e:
            logger.error(f"❌ Error processing batch {batch_idx + 1}: {e}")
            # Add fallback assignments for failed batch
            for seg in batch_segments:
                assignments_list.append({
                    "order": seg["order"],
                    "assigned_character": NARRATOR_NAME,
                    "confidence": 0.3,
                    "reasoning": f"Fallback due to error: {str(e)[:100]}"
                })
    
    # Check if we're missing any segments
    assigned_orders = {a.get("order") for a in assignments_list if isinstance(a, dict) and "order" in a}
    missing_segments = [seg for seg in segments_for_llm if seg["order"] not in assigned_orders]
    
    if missing_segments:
        logger.warning(f"⚠️ {len(missing_segments)} segments still missing, processing individually...")
        
        for idx, seg in enumerate(missing_segments, start=1):
            current_progress = len(assignments_list)
            
            yield {
                "current": current_progress,
                "total": total_segments,
                "message": f"Processing missing segment {current_progress}/{total_segments}..."
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
                    logger.info(f"✅ Processed missing segment at order {seg['order']}")
                else:
                    assignments_list.append({
                        "order": seg["order"],
                        "assigned_character": NARRATOR_NAME,
                        "confidence": 0.5,
                        "reasoning": "Fallback"
                    })
            except Exception as e:
                logger.error(f"❌ Failed to process segment at order {seg['order']}: {e}")
                assignments_list.append({
                    "order": seg["order"],
                    "assigned_character": NARRATOR_NAME,
                    "confidence": 0.3,
                    "reasoning": "Fallback due to error"
                })
    
    logger.info(f"🔵 Building assignment map from {len(assignments_list)} assignments")
    logger.info(f"🔵 Available characters: {available_characters}")
    
    # Build order to segment ID mapping
    order_to_id = {seg["order"]: seg["id"] for seg in segments}
    assignment_map = {}
    
    for assignment in assignments_list:
        if isinstance(assignment, dict) and "order" in assignment and "assigned_character" in assignment:
            order = assignment["order"]
            character = assignment["assigned_character"]
            seg_id = order_to_id.get(order)
            
            logger.info(f"🔵 Processing assignment: order={order}, character='{character}', seg_id={seg_id}")
            
            if not seg_id:
                logger.warning(f"⚠️ No segment ID found for order {order}")
                continue
            
            if not character or not character.strip():
                logger.info(f"🔵 Empty character, assigning {NARRATOR_NAME}")
                assignment_map[seg_id] = NARRATOR_NAME
                continue
            
            # Case-insensitive matching
            character_lower = character.lower().strip()
            actual_character = None
            for avail_char in available_characters:
                if avail_char.lower() == character_lower:
                    actual_character = avail_char
                    logger.info(f"🔵 Matched '{character}' to '{actual_character}'")
                    break
            
            if not actual_character:
                logger.warning(f"⚠️ No match found for '{character}', using as-is")
            
            assignment_map[seg_id] = actual_character if actual_character else character
        else:
            logger.warning(f"⚠️ Invalid assignment format: {assignment}")
    
    logger.info(f"🔵 Final assignment map has {len(assignment_map)} entries")
    logger.info(f"🔵 Sample assignments (first 5): {dict(list(assignment_map.items())[:5])}")
    
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
