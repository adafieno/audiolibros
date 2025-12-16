"""
Text segmentation service for breaking down chapter text into manageable chunks.
Simple segmentation: splits on newline and em-dash (matching desktop app logic).
"""
import uuid
from typing import List, Dict, Any

# Azure TTS limits (for reference, not enforced in this simple segmenter)
AZURE_MAX_KB = 100  # Hard limit in kilobytes
AZURE_HARD_CAP_MIN = 10 * 60  # 10 minutes in seconds
AZURE_WPM = 180  # Words per minute
AZURE_OVERHEAD = 1.15  # 15% overhead for SSML

# Em-dash character
EM_DASH = "—"


def estimate_audio_duration(text: str) -> float:
    """
    Estimate audio duration in seconds based on word count and WPM.
    """
    word_count = len(text.split())
    duration = (word_count / AZURE_WPM) * 60  # Convert to seconds
    return duration * AZURE_OVERHEAD


def segment_text(text: str, max_kb: int = AZURE_MAX_KB, split_on_em_dash: bool = True) -> List[Dict[str, Any]]:
    """
    Segment text by splitting on newlines and optionally em-dashes.
    This matches the desktop app's simple_plan_builder.py logic.
    
    Args:
        text: The full chapter text to segment
        max_kb: Maximum size in kilobytes (not enforced, kept for API compatibility)
        split_on_em_dash: Whether to split on em-dash characters (default: True)
    
    Returns:
        List of segment dictionaries with structure:
        {
            'id': str (UUID),           # Stable identifier
            'order': int,               # Sequential: 0, 1, 2, 3...
            'start_idx': int,
            'end_idx': int,
            'text': str,
            'delimiter': str,
            'voice': None,
            'needsRevision': False
        }
    """
    segments = []
    n = len(text)
    start = 0
    i = 0
    order = 0
    
    def add_segment(start_idx: int, end_idx: int, delim: str):
        nonlocal order
        if end_idx > start_idx:  # Only add non-empty segments
            segment_text = text[start_idx:end_idx]
            segments.append({
                'id': str(uuid.uuid4()),  # UUID for stable identity
                'order': order,           # Sequential ordering
                'start_idx': start_idx,
                'end_idx': end_idx - 1,  # Make end_idx inclusive for consistency
                'text': segment_text,
                'delimiter': delim,
                'voice': None,
                'needsRevision': False
            })
            order += 1
    
    while i < n:
        ch = text[i]
        
        # Handle \r\n (Windows line ending)
        if ch == "\r":
            if i + 1 < n and text[i + 1] == "\n":
                add_segment(start, i, "newline")
                i += 2
                start = i
                continue
            else:
                add_segment(start, i, "newline")
                i += 1
                start = i
                continue
        
        # Handle \n (Unix line ending)
        if ch == "\n":
            add_segment(start, i, "newline")
            i += 1
            start = i
            continue
        
        # Handle em-dash
        if split_on_em_dash and ch == EM_DASH:
            add_segment(start, i, "em-dash")
            i += 1
            start = i
            continue
        
        i += 1
    
    # Add final segment if any text remains
    if start < n:
        add_segment(start, n, "EOF")
    
    return segments


def merge_segments(segments: List[Dict[str, Any]], segment_ids: List[str]) -> List[Dict[str, Any]]:
    """
    Merge consecutive segments by their IDs (UUIDs).
    """
    if len(segment_ids) < 2:
        return segments
    
    # Find segments to merge (maintain order)
    to_merge = [s for s in segments if s['id'] in segment_ids]
    if len(to_merge) != len(segment_ids):
        raise ValueError("Some segment IDs not found")
    
    # Sort by order to ensure consecutive merge
    to_merge = sorted(to_merge, key=lambda s: s['order'])
    
    # Verify they are consecutive
    for i in range(len(to_merge) - 1):
        if to_merge[i]['end_idx'] + 1 != to_merge[i + 1]['start_idx']:
            raise ValueError("Segments must be consecutive to merge")
    
    # Create merged segment with new UUID but keeping first order
    merged = {
        'id': str(uuid.uuid4()),  # New UUID for merged segment
        'order': to_merge[0]['order'],
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
        if seg['id'] in skip_ids:
            if not merged_added:
                result.append(merged)
                merged_added = True
        else:
            result.append(seg)
    
    # Renumber order to be sequential
    for i, seg in enumerate(result):
        seg['order'] = i
    
    return result


def split_segment(segments: List[Dict[str, Any]], segment_id: str, split_position: int) -> List[Dict[str, Any]]:
    """
    Split a segment at a given position within its text.
    segment_id: UUID of the segment to split
    """
    segment = next((s for s in segments if s['id'] == segment_id), None)
    if not segment:
        raise ValueError(f"Segment {segment_id} not found")
    
    # Validate split position
    text = segment['text']
    if split_position <= 0 or split_position >= len(text):
        raise ValueError("Invalid split position")
    
    # Find best split point (word boundary)
    actual_split = split_position
    
    # Try to find nearby word boundary
    if split_position < len(text) and text[split_position] != ' ':
        # Look backward for space
        for i in range(split_position, max(0, split_position - 20), -1):
            if text[i] == ' ':
                actual_split = i
                break
    
    delimiter = 'space'
    
    # Create two new segments with new UUIDs
    first_segment = {
        'id': str(uuid.uuid4()),
        'order': segment['order'],
        'start_idx': segment['start_idx'],
        'end_idx': segment['start_idx'] + actual_split - 1,
        'text': text[:actual_split],
        'delimiter': delimiter,
        'voice': segment['voice'],
        'needsRevision': False
    }
    
    second_segment = {
        'id': str(uuid.uuid4()),
        'order': segment['order'] + 1,
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
        if seg['id'] == segment_id:
            result.append(first_segment)
            result.append(second_segment)
        else:
            result.append(seg)
    
    # Renumber order to be sequential
    for i, seg in enumerate(result):
        seg['order'] = i
    
    return result
