#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LLM-based character assignment script for planning segments.
Intelligently assigns characters to text segments using AI analysis with full chapter context.
"""

import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional

# Configure UTF-8 encoding for all I/O operations
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')
if hasattr(sys.stdin, 'reconfigure'):
    sys.stdin.reconfigure(encoding='utf-8')

# Add the py directory to Python path (where the modules are located)
py_root = Path(__file__).parent.parent  # This should be the 'py' directory
sys.path.insert(0, str(py_root))

try:
    from dossier.client import chat_json
    from core.config import load_config
    from core.log_utils import get_logger
    HAS_LLM = True
except ImportError as e:
    print(f"Warning: LLM integration not available: {e}", file=sys.stderr)
    HAS_LLM = False

_LOG = get_logger("character_assignment") if HAS_LLM else None

def get_effective_llm_model(workspace_root: Path) -> str:
    """Get the effective LLM model from project or global config"""
    try:
        # Try to load project-specific config first
        project_config_path = workspace_root / "project.khipu.json"
        if project_config_path.exists():
            with open(project_config_path, 'r', encoding='utf-8') as f:
                project_config = json.load(f)
                # Check for llm.engine structure
                if "llm" in project_config and "engine" in project_config["llm"]:
                    engine_config = project_config["llm"]["engine"]
                    engine_name = engine_config.get("name", "openai")
                    
                    # Validate engine support
                    if engine_name != "openai":
                        print(f"Warning: LLM engine '{engine_name}' not supported, falling back to OpenAI", file=sys.stderr)
                    
                    model = engine_config.get("model")
                    if model:
                        print(f"📋 Using project LLM model: {model} (engine: {engine_name})", file=sys.stderr)
                        return model
                
                # Legacy support for flat llm_model
                if "llm_model" in project_config:
                    print(f"📋 Using legacy project LLM model: {project_config['llm_model']}", file=sys.stderr)
                    return project_config["llm_model"]
        
        # Fallback to global config
        global_config = load_config()
        print(f"📋 Using global config LLM model: {global_config.openai.model}", file=sys.stderr)
        return global_config.openai.model
    except Exception as e:
        print(f"Warning: Could not load LLM model config: {e}", file=sys.stderr)
        # If all else fails, use global config default
        try:
            global_config = load_config()
            return global_config.openai.model
        except Exception:
            # Final fallback - should rarely be reached
            print(f"Warning: All config loading failed, using hardcoded fallback", file=sys.stderr)
            return "gpt-4o-mini"

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

def assign_characters_to_plan_lines(
    chapter_text: str,
    plan_data: Dict[str, Any],
    available_characters: List[str],
    llm_model: str,
    force_reassign: bool = True
) -> Dict[str, Any]:
    """
    Assign characters to plan file lines using LLM analysis.
    
    Args:
        chapter_text: Full chapter text for context
        plan_data: Plan file data with chunks and lines
        available_characters: List of available character names
        llm_model: LLM model to use
        force_reassign: If True, reassign all lines regardless of existing assignments
        
    Returns:
        Updated plan data with LLM-based character assignments
    """
    if not HAS_LLM:
        print("⚠️ LLM integration not available, keeping existing assignments", file=sys.stderr)
        return plan_data
    
    print(f"🔄 Starting LLM-based character assignment for plan", file=sys.stderr)
    print(f"🤖 Using model: {llm_model}", file=sys.stderr)
    print(f"📋 Available characters: {available_characters}", file=sys.stderr)
    
    updated_plan = json.loads(json.dumps(plan_data))  # Deep copy
    total_lines_processed = 0
    
    # Process each chunk
    for chunk_idx, chunk in enumerate(updated_plan.get("chunks", [])):
        chunk_id = chunk.get("id", f"chunk_{chunk_idx}")
        print(f"\n🔍 Processing chunk: {chunk_id}", file=sys.stderr)
        
        lines = chunk.get("lines", [])
        if not lines:
            print(f"   ⚠️  No lines in chunk {chunk_id}", file=sys.stderr)
            continue
        
        # Prepare segments data for LLM
        segments_for_llm = []
        for line_idx, line in enumerate(lines):
            start_char = line.get("start_char", 0)
            end_char = line.get("end_char", 0)
            line_text = chapter_text[start_char:end_char] if end_char <= len(chapter_text) else ""
            
            segments_for_llm.append({
                "segment_id": f"{chunk_id}_line_{line_idx}",
                "text": line_text,
                "start_char": start_char,
                "end_char": end_char
            })
        
        # After processing lines, update chunk voice based on line assignments
        def update_chunk_voice():
            if not lines:
                return
            
            # Count voice frequencies in lines
            voice_counts = {}
            for line in lines:
                voice = line.get("voice", "narrador")
                voice_counts[voice] = voice_counts.get(voice, 0) + 1
            
            if not voice_counts:
                return
            
            # Determine appropriate chunk voice
            old_chunk_voice = chunk.get("voice", "narrador")
            
            # If there's only one voice type, use it
            if len(voice_counts) == 1:
                chunk_voice = list(voice_counts.keys())[0]
                reason = "single voice type"
            else:
                # Multiple voices - prioritize narrador if present, otherwise use "mixed"
                if "narrador" in voice_counts and voice_counts["narrador"] >= max(voice_counts.values()):
                    chunk_voice = "narrador"
                    reason = "narrator present (default for mixed content)"
                else:
                    # Find most common non-narrator voice
                    non_narrator_counts = {k: v for k, v in voice_counts.items() if k != "narrador"}
                    if non_narrator_counts:
                        chunk_voice = max(non_narrator_counts.items(), key=lambda x: x[1])[0]
                        reason = "most common character voice"
                    else:
                        chunk_voice = "narrador"
                        reason = "fallback to narrator"
            
            chunk["voice"] = chunk_voice
            print(f"   🔧 Updated chunk voice: {old_chunk_voice} → {chunk_voice} ({reason})", file=sys.stderr)
        
        # Call LLM for character assignment
        try:
            print(f"   🤖 Calling LLM for {len(segments_for_llm)} segments...", file=sys.stderr)
            
            # For force_reassign, try individual segment processing if batch fails
            if force_reassign and len(segments_for_llm) > 1:
                print(f"   🔄 Force reassign mode: processing segments individually for complete coverage", file=sys.stderr)
                assignments_list = []
                
                for segment in segments_for_llm:
                    individual_prompt = f"""You are an expert at analyzing literary text for audiobook production. 

Assign the most appropriate character to this single text segment:

Available Characters: {", ".join(available_characters)}

Chapter Text (for context):
{chapter_text}

Segment to process:
{json.dumps(segment, ensure_ascii=False, indent=2)}

Rules:
- Use specific character names only for their actual dialogue
- Use "narrador" for narrative/descriptive text  
- Use "desconocido" only if it's clearly dialogue but character is unknown

Return exactly one JSON object:
{{
  "segment_id": "{segment['segment_id']}",
  "assigned_character": "character_name", 
  "confidence": 0.95,
  "reasoning": "brief explanation"
}}"""
                    
                    try:
                        individual_response = chat_json(
                            messages=[{"role": "user", "content": individual_prompt}],
                            model=llm_model
                        )
                        
                        if isinstance(individual_response, dict) and 'segment_id' in individual_response:
                            assignments_list.append(individual_response)
                            print(f"   ✅ Processed segment {segment['segment_id']}", file=sys.stderr)
                        else:
                            print(f"   ⚠️ Invalid response for segment {segment['segment_id']}", file=sys.stderr)
                            # Fallback assignment
                            assignments_list.append({
                                "segment_id": segment['segment_id'],
                                "assigned_character": "narrador",
                                "confidence": 0.5,
                                "reasoning": "Fallback due to invalid LLM response"
                            })
                    except Exception as e:
                        print(f"   ❌ Failed to process segment {segment['segment_id']}: {e}", file=sys.stderr)
                        # Fallback assignment
                        assignments_list.append({
                            "segment_id": segment['segment_id'],
                            "assigned_character": "narrador",
                            "confidence": 0.3,
                            "reasoning": "Fallback due to LLM error"
                        })
            else:
                # Original batch processing approach
                prompt = ASSIGNMENT_PROMPT.format(
                    characters=", ".join(available_characters),
                    chapter_text=chapter_text,
                    segments=json.dumps(segments_for_llm, ensure_ascii=False, indent=2),
                    segment_count=len(segments_for_llm)
                )
                
                llm_response = chat_json(
                    messages=[{"role": "user", "content": prompt}],
                    model=llm_model
                )
            
                # Parse LLM response for batch processing - handle different formats
                if isinstance(llm_response, dict) and 'result' in llm_response:
                    assignments_list = llm_response['result']
                elif isinstance(llm_response, dict) and 'assignments' in llm_response:
                    assignments_list = llm_response['assignments']
                elif isinstance(llm_response, dict) and 'segments' in llm_response:
                    assignments_list = llm_response['segments']
                elif isinstance(llm_response, list):
                    assignments_list = llm_response
                elif isinstance(llm_response, dict) and 'segment_id' in llm_response:
                    # Single assignment object - wrap in array
                    print(f"   🔧 Single assignment detected, wrapping in array", file=sys.stderr)
                    assignments_list = [llm_response]
                else:
                    print(f"   ⚠️ Invalid LLM response format, keeping existing assignments", file=sys.stderr)
                    print(f"   🔍 Response keys: {list(llm_response.keys()) if isinstance(llm_response, dict) else 'Not a dict'}", file=sys.stderr)
                    continue
            
            # Validate we got assignments for all segments
            if len(assignments_list) != len(segments_for_llm):
                print(f"   ⚠️ LLM returned {len(assignments_list)} assignments but expected {len(segments_for_llm)}", file=sys.stderr)
                
                # If incomplete and force_reassign is True, try a more explicit retry
                if force_reassign and len(assignments_list) < len(segments_for_llm):
                    print(f"   🔄 Attempting retry with more explicit prompt...", file=sys.stderr)
                    
                    # Create a more direct prompt focusing on the missing segments
                    missing_segments = segments_for_llm[len(assignments_list):]
                    retry_prompt = f"""Complete the character assignment task. You provided {len(assignments_list)} assignments but I need ALL {len(segments_for_llm)} segments processed.

Here are the remaining {len(missing_segments)} segments that still need character assignments:
{json.dumps(missing_segments, ensure_ascii=False, indent=2)}

Available Characters: {", ".join(available_characters)}

Return a JSON array with exactly {len(missing_segments)} assignment objects for these remaining segments:"""

                    try:
                        retry_response = chat_json(
                            messages=[{"role": "user", "content": retry_prompt}],
                            model=llm_model
                        )
                        
                        # Process retry response
                        if isinstance(retry_response, list):
                            assignments_list.extend(retry_response)
                            print(f"   ✅ Retry successful - got {len(retry_response)} additional assignments", file=sys.stderr)
                        elif isinstance(retry_response, dict) and 'segment_id' in retry_response:
                            assignments_list.append(retry_response)
                            print(f"   ✅ Retry successful - got 1 additional assignment", file=sys.stderr)
                    except Exception as retry_error:
                        print(f"   ❌ Retry failed: {retry_error}", file=sys.stderr)
                
                if force_reassign:
                    print(f"   🔄 Force reassign enabled - will update what we can", file=sys.stderr)
            
            # Apply LLM assignments
            for assignment in assignments_list:
                segment_id = assignment.get("segment_id", "")
                assigned_character = assignment.get("assigned_character", "narrador")
                confidence = assignment.get("confidence", 0.0)
                reasoning = assignment.get("reasoning", "")
                
                # Find corresponding line by segment_id
                if segment_id.startswith(f"{chunk_id}_line_"):
                    line_idx = int(segment_id.split("_")[-1])
                    if 0 <= line_idx < len(lines):
                        old_voice = lines[line_idx].get("voice", "narrador")
                        lines[line_idx]["voice"] = assigned_character
                        
                        print(f"   📝 Line {line_idx + 1}: {old_voice} → {assigned_character} (confidence: {confidence:.2f})", file=sys.stderr)
                        if reasoning:
                            print(f"      💭 Reasoning: {reasoning}", file=sys.stderr)
                        
                        total_lines_processed += 1
            
            # If force reassign and we didn't get all assignments, warn about unprocessed lines
            if force_reassign and len(assignments_list) < len(segments_for_llm):
                unprocessed_count = len(segments_for_llm) - len(assignments_list)
                print(f"   ⚠️ {unprocessed_count} lines were not reassigned by LLM (keeping existing assignments)", file=sys.stderr)
        
        except Exception as e:
            print(f"   ❌ LLM call failed: {e}", file=sys.stderr)
            print(f"   🔄 Keeping existing assignments for chunk {chunk_id}", file=sys.stderr)
            # Continue with next chunk instead of failing entirely
            continue
        
        # Update chunk voice based on line assignments
        update_chunk_voice()
    
    print(f"\n✅ LLM-based character assignment completed!", file=sys.stderr)
    print(f"📊 Processed {total_lines_processed} lines total", file=sys.stderr)
    
    return updated_plan


def main():
    """Main function for command line usage"""
    if len(sys.argv) != 2:
        print("Usage: python assign_characters_to_segments.py <project_root>", file=sys.stderr)
        sys.exit(1)
    
    project_root = sys.argv[1]
    
    try:
        # Read input from stdin (JSON payload from IPC) with proper UTF-8 handling
        # Reconfigure stdin to use UTF-8 encoding explicitly
        if hasattr(sys.stdin, 'reconfigure'):
            sys.stdin.reconfigure(encoding='utf-8')
        
        stdin_content = sys.stdin.read()
        input_data = json.loads(stdin_content)
        
        chapter_id = input_data["chapterId"]
        # Don't use chapter_text from JSON - read it directly from source to avoid UTF-8 corruption
        available_characters = input_data["availableCharacters"]
        # Note: segments are no longer needed as input - we read from the plan file
        
        # Get workspace root
        workspace_root = Path(project_root)
        llm_model = get_effective_llm_model(workspace_root)
        
        print(f"Assigning characters for chapter {chapter_id} using {llm_model}...", file=sys.stderr)
        
        # Read chapter text directly from the source file to avoid UTF-8 corruption
        chapter_text_path = workspace_root / "analysis" / "chapters_txt" / f"{chapter_id}.txt"
        if chapter_text_path.exists():
            with open(chapter_text_path, 'r', encoding='utf-8') as f:
                chapter_text = f.read()
            print(f"📖 Read chapter text from source file: {chapter_text_path}", file=sys.stderr)
        else:
            # Fallback to text from JSON input (may be corrupted)
            chapter_text = input_data.get("chapterText", "")
            print(f"⚠️ Chapter text file not found, using input text (may have UTF-8 issues)", file=sys.stderr)
        
        # Load the existing plan file
        plan_file_path = workspace_root / "ssml" / "plans" / f"{chapter_id}.plan.json"
        if not plan_file_path.exists():
            raise FileNotFoundError(f"Plan file not found: {plan_file_path}")
        
        with open(plan_file_path, 'r', encoding='utf-8') as f:
            plan_data = json.load(f)
        
        print(f"📄 Loaded plan file: {plan_file_path}", file=sys.stderr)
        
        # Validate plan format
        if not isinstance(plan_data, dict) or "chunks" not in plan_data:
            raise ValueError(f"Invalid plan file format. Expected chunks/lines structure, got: {type(plan_data)}")
        
        print(f"📊 Plan format validated: {len(plan_data.get('chunks', []))} chunks", file=sys.stderr)
        
        # Perform character assignment refinement
        updated_plan = assign_characters_to_plan_lines(
            chapter_text=chapter_text,
            plan_data=plan_data,
            available_characters=available_characters,
            llm_model=llm_model,
            force_reassign=True
        )
        
        # Save updated plan file
        with open(plan_file_path, 'w', encoding='utf-8') as f:
            json.dump(updated_plan, f, ensure_ascii=False, indent=2)
        
        print(f"💾 Updated plan file saved: {plan_file_path}", file=sys.stderr)
        
        # Output results as JSON
        result = {
            "success": True,
            "chapterId": chapter_id,
            "updated_plan": updated_plan
        }
        
        print(json.dumps(result, ensure_ascii=False, indent=2))
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(error_result, ensure_ascii=False, indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()
