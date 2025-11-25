#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Universal Manifest Generator for Khipu Studio Packaging

Generates a standardized manifest.json file containing all metadata needed
for platform-specific packaging operations.

Inputs:
- project.khipu.json (project configuration)
- dossier/book.json (book metadata)
- dossier/narrative.structure.json (chapter structure)
- audio/wav/*_complete.wav (complete chapter audio files)

Output:
- manifest.json (universal packaging manifest)
"""

from __future__ import annotations
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional
from datetime import datetime

# Try importing audio probing utilities
try:
    import wave
    HAS_WAVE = True
except ImportError:
    HAS_WAVE = False

try:
    from pydub import AudioSegment
    HAS_PYDUB = True
except ImportError:
    HAS_PYDUB = False


def _probe_audio_duration(audio_path: Path) -> Optional[float]:
    """
    Get duration of audio file in seconds.
    Returns None if unable to determine.
    """
    if not audio_path.exists():
        return None
    
    # Try wave module first (fastest for WAV files)
    if HAS_WAVE and audio_path.suffix.lower() == '.wav':
        try:
            with wave.open(str(audio_path), 'rb') as wf:
                frames = wf.getnframes()
                rate = wf.getframerate()
                return frames / float(rate)
        except Exception:
            pass
    
    # Fallback to pydub
    if HAS_PYDUB:
        try:
            audio = AudioSegment.from_file(str(audio_path))
            return len(audio) / 1000.0  # Convert ms to seconds
        except Exception:
            pass
    
    return None


def _load_json(path: Path) -> Dict[str, Any]:
    """Load JSON file with error handling."""
    if not path.exists():
        return {}
    
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Warning: Failed to load {path}: {e}", file=sys.stderr)
        return {}


def _find_complete_audio_files(project_root: Path) -> Dict[str, Path]:
    """
    Find all complete chapter audio files.
    Returns dict mapping chapter_id -> audio_file_path
    """
    audio_files = {}
    
    # Check common audio directories
    audio_dirs = [
        project_root / 'audio' / 'wav',
        project_root / 'audio' / 'chapters',
        project_root / 'audio' / 'book',
        project_root / 'audio',
    ]
    
    for audio_dir in audio_dirs:
        if not audio_dir.exists():
            continue
        
        # Look for *_complete.wav or *.wav files
        for audio_file in audio_dir.glob('*.wav'):
            # Extract chapter ID from filename
            filename = audio_file.stem
            
            # Remove _complete suffix if present
            if filename.endswith('_complete'):
                chapter_id = filename[:-9]  # Remove '_complete'
            else:
                chapter_id = filename
            
            # Only add if looks like a chapter file (chXX pattern)
            if chapter_id.startswith('ch') and chapter_id[2:].isdigit():
                # Prefer _complete files over regular files
                if chapter_id not in audio_files or filename.endswith('_complete'):
                    audio_files[chapter_id] = audio_file
    
    return audio_files


def generate_universal_manifest(project_root: str | Path) -> Dict[str, Any]:
    """
    Generate universal packaging manifest for a project.
    
    Args:
        project_root: Path to project root directory
        
    Returns:
        Dictionary containing the universal manifest
    """
    project_root = Path(project_root)
    
    if not project_root.exists():
        raise ValueError(f"Project root does not exist: {project_root}")
    
    print(f"📦 Generating universal manifest for: {project_root}", file=sys.stderr)
    
    # Load project configuration
    project_config = _load_json(project_root / 'project.khipu.json')
    
    # Load book metadata - try multiple locations
    book_metadata = _load_json(project_root / 'dossier' / 'book.json')
    if not book_metadata or not book_metadata.get('title'):
        # Try legacy location
        book_meta_legacy = _load_json(project_root / 'book.meta.json')
        if book_meta_legacy:
            book_metadata = book_meta_legacy
    
    # Load narrative structure (chapter info)
    narrative_structure = _load_json(project_root / 'dossier' / 'narrative.structure.json')
    
    # Find complete audio files
    audio_files = _find_complete_audio_files(project_root)
    
    print(f"📁 Found {len(audio_files)} complete chapter audio files", file=sys.stderr)
    
    # Build chapter list with audio information
    chapters = []
    total_duration = 0.0
    missing_audio = []
    
    structure_chapters = narrative_structure.get('chapters', [])
    
    for idx, chapter_info in enumerate(structure_chapters, start=1):
        chapter_id = chapter_info.get('id', f'ch{idx:02d}')
        chapter_title = chapter_info.get('title', f'Chapter {idx}')
        chapter_type = chapter_info.get('chapterType', 'chapter')
        
        # Find audio file for this chapter
        audio_file = audio_files.get(chapter_id)
        
        if audio_file:
            # Get audio duration
            duration = _probe_audio_duration(audio_file)
            
            chapter_entry = {
                'id': chapter_id,
                'title': chapter_title,
                'type': chapter_type,
                'index': idx,
                'audioFile': str(audio_file.relative_to(project_root)),
                'duration': duration,
                'hasAudio': True
            }
            
            if duration:
                total_duration += duration
        else:
            chapter_entry = {
                'id': chapter_id,
                'title': chapter_title,
                'type': chapter_type,
                'index': idx,
                'audioFile': None,
                'duration': None,
                'hasAudio': False
            }
            missing_audio.append(chapter_id)
        
        chapters.append(chapter_entry)
    
    # Build manifest
    manifest = {
        'version': '1.0',
        'generated': datetime.utcnow().isoformat() + 'Z',
        'project': {
            'name': project_config.get('name', 'Untitled Project'),
        },
        'book': {
            'title': book_metadata.get('title', project_config.get('bookMeta', {}).get('title', 'Untitled')),
            'subtitle': book_metadata.get('subtitle', project_config.get('bookMeta', {}).get('subtitle')),
            'authors': book_metadata.get('authors', project_config.get('bookMeta', {}).get('authors', [])),
            'narrators': book_metadata.get('narrators', project_config.get('bookMeta', {}).get('narrators', [])),
            'translators': book_metadata.get('translators', project_config.get('bookMeta', {}).get('translators', [])),
            'adaptors': book_metadata.get('adaptors', project_config.get('bookMeta', {}).get('adaptors', [])),
            'description': book_metadata.get('description', project_config.get('bookMeta', {}).get('description')),
            'language': book_metadata.get('language', project_config.get('bookMeta', {}).get('language', 'en')),
            'publisher': book_metadata.get('publisher', project_config.get('bookMeta', {}).get('publisher')),
            'publicationDate': book_metadata.get('publicationDate', project_config.get('bookMeta', {}).get('publicationDate')),
            'isbn': book_metadata.get('isbn', project_config.get('bookMeta', {}).get('isbn')),
            'genres': book_metadata.get('genres', project_config.get('bookMeta', {}).get('genres', [])),
            'keywords': book_metadata.get('keywords', project_config.get('bookMeta', {}).get('keywords', [])),
            'copyright': book_metadata.get('copyright', project_config.get('bookMeta', {}).get('copyright')),
        },
        'cover': {
            'image': project_config.get('bookMeta', {}).get('coverImage'),
        },
        'audio': {
            'totalDuration': total_duration if total_duration > 0 else None,
            'totalDurationFormatted': _format_duration(total_duration) if total_duration > 0 else None,
            'chapterCount': len(chapters),
            'completedChapters': len(chapters) - len(missing_audio),
            'missingAudio': missing_audio,
        },
        'chapters': chapters,
    }
    
    # Write manifest to project root
    manifest_path = project_root / 'manifest.json'
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Generated manifest: {manifest_path}", file=sys.stderr)
    print(f"📊 Total duration: {_format_duration(total_duration)}", file=sys.stderr)
    print(f"📚 Chapters: {len(chapters)} total, {len(chapters) - len(missing_audio)} with audio", file=sys.stderr)
    
    if missing_audio:
        print(f"⚠️  Missing audio for: {', '.join(missing_audio)}", file=sys.stderr)
    
    return manifest


def _format_duration(seconds: float) -> str:
    """Format duration in seconds to HH:MM:SS format."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def main():
    """CLI entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Generate universal packaging manifest for Khipu Studio project'
    )
    parser.add_argument(
        'project_root',
        help='Path to project root directory'
    )
    parser.add_argument(
        '--output',
        '-o',
        help='Output manifest file path (default: project_root/manifest.json)'
    )
    
    args = parser.parse_args()
    
    try:
        manifest = generate_universal_manifest(args.project_root)
        
        if args.output:
            output_path = Path(args.output)
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(manifest, f, indent=2, ensure_ascii=False)
            print(f"✅ Manifest written to: {output_path}")
        
        return 0
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
