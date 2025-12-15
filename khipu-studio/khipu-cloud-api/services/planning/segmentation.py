"""
Text segmentation service for breaking down chapter text into manageable chunks.
Based on Azure TTS limits and delimiter detection.
"""
import re
from typing import List, Dict, Any

# Azure TTS limits
AZURE_MAX_KB = 100  # Hard limit in kilobytes
AZURE_HARD_CAP_MIN = 10 * 60  # 10 minutes in seconds
AZURE_WPM = 180  # Words per minute
AZURE_OVERHEAD = 1.15  # 15% overhead for SSML

# Delimiters for segmentation (in order of preference)
DELIMITERS = [
    ('EOF', r'\Z'),  # End of file
    ('para', r'\n\n+'),  # Paragraph break (2+ newlines)
    ('newline', r'\n'),  # Single newline
    ('period', r'\.(?:\s|$)'),  # Period followed by space or end
    ('comma', r',\s'),  # Comma followed by space
    ('space', r'\s+'),  # Any whitespace
]


def estimate_audio_duration(text: str) -> float:
    """
    Estimate audio duration in seconds based on word count and WPM.
    """
    word_count = len(text.split())
    duration = (word_count / AZURE_WPM) * 60  # Convert to seconds
    return duration * AZURE_OVERHEAD


def find_best_delimiter_at_position(text: str, position: int, search_window: int = 200) -> tuple:
    """
    Find the best delimiter near a target position.
    Returns (delimiter_name, actual_position, matched_text)
    """
    start = max(0, position - search_window)
    end = min(len(text), position + search_window)
    search_text = text[start:end]
    
    # Try each delimiter type in order of preference
    for delim_name, delim_pattern in DELIMITERS:
        if delim_name == 'EOF':
            if position >= len(text) - 10:  # Near end of text
                return ('EOF', len(text), '')
            continue
        
        matches = list(re.finditer(delim_pattern, search_text))
        if matches:
            # Find the match closest to our target position
            target_offset = position - start
            closest_match = min(matches, key=lambda m: abs(m.start() - target_offset))
            actual_position = start + closest_match.end()
            return (delim_name, actual_position, closest_match.group())
    
    # Fallback: break at position
    return ('space', position, ' ')


def segment_text(text: str, max_kb: int = AZURE_MAX_KB) -> List[Dict[str, Any]]:
    """
    Segment text into chunks that fit within Azure TTS limits.
    
    Args:
        text: The full chapter text to segment
        max_kb: Maximum size in kilobytes (default: Azure's 100KB limit)
    
    Returns:
        List of segment dictionaries with structure:
        {
            'segment_id': int,
            'start_idx': int,
            'end_idx': int,
            'text': str,
            'delimiter': str,
            'voice': None,
            'needsRevision': False
        }
    """
    segments = []
    segment_id = 1
    current_pos = 0
    text_length = len(text)
    
    # Calculate max characters per segment (accounting for encoding)
    # 1 KB = 1024 bytes, UTF-8 can use up to 4 bytes per char
    # Use conservative estimate: 1 char ≈ 2 bytes on average
    max_chars = (max_kb * 1024) // 2
    
    # Also enforce time limit
    max_duration = AZURE_HARD_CAP_MIN
    
    while current_pos < text_length:
        # Calculate remaining text
        remaining = text_length - current_pos
        
        if remaining <= max_chars:
            # Last segment - take everything
            segment_text = text[current_pos:]
            end_pos = text_length
            delimiter = 'EOF'
        else:
            # Find optimal break point
            target_pos = current_pos + max_chars
            
            # Also check duration constraint
            test_text = text[current_pos:target_pos]
            duration = estimate_audio_duration(test_text)
            
            if duration > max_duration:
                # Adjust target based on duration
                ratio = max_duration / duration
                target_pos = current_pos + int(max_chars * ratio * 0.9)  # 90% to be safe
            
            # Find best delimiter
            delimiter, break_pos, _ = find_best_delimiter_at_position(text, target_pos)
            
            segment_text = text[current_pos:break_pos]
            end_pos = break_pos
        
        # Create segment
        segment = {
            'segment_id': segment_id,
            'start_idx': current_pos,
            'end_idx': end_pos - 1,  # Inclusive end
            'text': segment_text,
            'delimiter': delimiter,
            'voice': None,
            'needsRevision': False
        }
        
        segments.append(segment)
        segment_id += 1
        current_pos = end_pos
    
    return segments


def merge_segments(segments: List[Dict[str, Any]], segment_ids: List[int]) -> List[Dict[str, Any]]:
    """
    Merge consecutive segments by their IDs.
    """
    if len(segment_ids) < 2:
        return segments
    
    # Sort IDs to ensure consecutive merge
    segment_ids = sorted(segment_ids)
    
    # Find segments to merge
    to_merge = [s for s in segments if s['segment_id'] in segment_ids]
    if len(to_merge) != len(segment_ids):
        raise ValueError("Some segment IDs not found")
    
    # Verify they are consecutive
    for i in range(len(to_merge) - 1):
        if to_merge[i]['end_idx'] + 1 != to_merge[i + 1]['start_idx']:
            raise ValueError("Segments must be consecutive to merge")
    
    # Create merged segment
    merged = {
        'segment_id': to_merge[0]['segment_id'],
        'start_idx': to_merge[0]['start_idx'],
        'end_idx': to_merge[-1]['end_idx'],
        'text': ''.join(s['text'] for s in to_merge),
        'delimiter': to_merge[-1]['delimiter'],
        'voice': to_merge[0]['voice'],  # Keep first voice
        'needsRevision': any(s.get('needsRevision', False) for s in to_merge)
    }
    
    # Rebuild segments list
    result = []
    skip_ids = set(segment_ids)
    merged_added = False
    
    for seg in segments:
        if seg['segment_id'] in skip_ids:
            if not merged_added:
                result.append(merged)
                merged_added = True
        else:
            result.append(seg)
    
    # Renumber segments
    for i, seg in enumerate(result, 1):
        seg['segment_id'] = i
    
    return result


def split_segment(segments: List[Dict[str, Any]], segment_id: int, split_position: int) -> List[Dict[str, Any]]:
    """
    Split a segment at a given position within its text.
    """
    segment = next((s for s in segments if s['segment_id'] == segment_id), None)
    if not segment:
        raise ValueError(f"Segment {segment_id} not found")
    
    # Validate split position
    text = segment['text']
    if split_position <= 0 or split_position >= len(text):
        raise ValueError("Invalid split position")
    
    # Calculate absolute position in full text
    abs_position = segment['start_idx'] + split_position
    
    # Find best delimiter at split point
    delimiter, actual_split, _ = find_best_delimiter_at_position(text, split_position, search_window=50)
    
    # Create two new segments
    first_segment = {
        'segment_id': segment['segment_id'],
        'start_idx': segment['start_idx'],
        'end_idx': segment['start_idx'] + actual_split - 1,
        'text': text[:actual_split],
        'delimiter': delimiter,
        'voice': segment['voice'],
        'needsRevision': False
    }
    
    second_segment = {
        'segment_id': segment['segment_id'] + 1,
        'start_idx': segment['start_idx'] + actual_split,
        'end_idx': segment['end_idx'],
        'text': text[actual_split:],
        'delimiter': segment['delimiter'],
        'voice': segment['voice'],
        'needsRevision': False
    }
    
    # Rebuild segments list
    result = []
    for seg in segments:
        if seg['segment_id'] == segment_id:
            result.append(first_segment)
            result.append(second_segment)
        else:
            result.append(seg)
    
    # Renumber segments
    for i, seg in enumerate(result, 1):
        seg['segment_id'] = i
    
    return result
