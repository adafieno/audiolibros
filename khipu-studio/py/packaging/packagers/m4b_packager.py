#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M4B Packager for Apple Books

Generates M4B audiobook format with:
- AAC audio encoding
- Chapter markers
- Cover art embedding
- ID3 metadata (title, author, narrator, etc.)
"""

from __future__ import annotations
import json
import sys
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional
import tempfile

# Try importing audio probing for fallback mode
try:
    import wave
    HAS_WAVE = True
except ImportError:
    HAS_WAVE = False

try:
    from pydub import AudioSegment  # type: ignore
    HAS_PYDUB = True
except ImportError:
    HAS_PYDUB = False


def _probe_audio_duration(audio_path: Path) -> Optional[float]:
    """
    Get duration of audio file in seconds.
    Used in fallback mode when manifest doesn't exist.
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
            return len(audio) / 1000.0
        except Exception:
            pass
    
    return None


def _load_project_data(project_root: Path) -> Dict[str, Any]:
    """
    Load project data from manifest or source files.
    Tries manifest first for performance, falls back to source files.
    """
    manifest_path = project_root / 'manifest.json'
    
    # Try to use manifest if available
    if manifest_path.exists():
        try:
            with open(manifest_path, 'r', encoding='utf-8') as f:
                manifest = json.load(f)
            print("[INFO] Using universal manifest", file=sys.stderr)
            return manifest
        except Exception as e:
            print(f"[WARNING] Failed to load manifest, falling back to source files: {e}", file=sys.stderr)
    else:
        print("[INFO] Manifest not found, reading source files directly", file=sys.stderr)
    
    # Fallback: Read source files directly
    project_config = {}
    config_path = project_root / 'project.khipu.json'
    if config_path.exists():
        with open(config_path, 'r', encoding='utf-8') as f:
            project_config = json.load(f)
    
    # Load book metadata
    book_metadata = {}
    book_meta_paths = [
        project_root / 'dossier' / 'book.json',
        project_root / 'book.meta.json'
    ]
    for path in book_meta_paths:
        if path.exists():
            with open(path, 'r', encoding='utf-8') as f:
                book_metadata = json.load(f)
                break
    
    # Load narrative structure
    chapters = []
    structure_path = project_root / 'dossier' / 'narrative.structure.json'
    if structure_path.exists():
        with open(structure_path, 'r', encoding='utf-8') as f:
            structure = json.load(f)
            chapters = structure.get('chapters', [])
    
    # Scan for audio files and probe durations
    audio_dir = project_root / 'audio' / 'wav'
    completed_chapters = 0
    missing_audio = []
    
    for idx, chapter in enumerate(chapters, start=1):
        chapter_id = chapter.get('id', f'ch{idx:02d}')
        audio_file = audio_dir / f'{chapter_id}_complete.wav'
        
        if audio_file.exists():
            duration = _probe_audio_duration(audio_file)
            chapter['audioFile'] = str(audio_file.relative_to(project_root))
            chapter['duration'] = duration
            chapter['hasAudio'] = True
            completed_chapters += 1
        else:
            chapter['audioFile'] = None
            chapter['duration'] = None
            chapter['hasAudio'] = False
            missing_audio.append(chapter_id)
    
    # Build manifest-like structure
    return {
        'project': {
            'name': project_config.get('name', 'Untitled Project')
        },
        'book': {
            'title': book_metadata.get('title', project_config.get('bookMeta', {}).get('title', 'Untitled')),
            'subtitle': book_metadata.get('subtitle'),
            'authors': book_metadata.get('authors', []),
            'narrators': book_metadata.get('narrators', []),
            'translators': book_metadata.get('translators', []),
            'adaptors': book_metadata.get('adaptors', []),
            'description': book_metadata.get('description'),
            'language': book_metadata.get('language', 'en'),
            'publisher': book_metadata.get('publisher'),
            'publicationDate': book_metadata.get('publicationDate'),
            'isbn': book_metadata.get('isbn'),
            'copyright': book_metadata.get('copyright'),
        },
        'cover': {
            'image': project_config.get('bookMeta', {}).get('coverImage')
        },
        'audio': {
            'chapterCount': len(chapters),
            'completedChapters': completed_chapters,
            'missingAudio': missing_audio
        },
        'chapters': chapters
    }


def _run_ffmpeg(args: list[str], description: str = "FFmpeg operation") -> bool:
    """
    Run FFmpeg command with error handling.
    Returns True on success, False on failure.
    """
    try:
        print(f"🎬 {description}...", file=sys.stderr)
        result = subprocess.run(
            ['ffmpeg', '-y'] + args,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            print(f"[ERROR] FFmpeg error: {result.stderr}", file=sys.stderr)
            return False
        
        print(f"[OK] {description} complete", file=sys.stderr)
        return True
    except FileNotFoundError:
        print("[ERROR] FFmpeg not found. Please install FFmpeg.", file=sys.stderr)
        return False
    except Exception as e:
        print(f"[ERROR] Error during {description}: {e}", file=sys.stderr)
        return False


def _create_ffmpeg_metadata(manifest: Dict[str, Any], output_path: Path) -> Path:
    """
    Create FFmpeg metadata file with chapter markers.
    Returns path to metadata file.
    """
    from datetime import datetime
    
    metadata_lines = [";FFMETADATA1"]
    
    # Add book metadata
    book = manifest.get('book', {})
    metadata_lines.append(f"title={book.get('title', 'Untitled')}")
    
    if book.get('authors'):
        metadata_lines.append(f"artist={', '.join(book['authors'])}")
    
    if book.get('narrators'):
        metadata_lines.append(f"album_artist={', '.join(book['narrators'])}")
    
    # Add translators and adaptors if present
    if book.get('translators'):
        metadata_lines.append(f"translator={', '.join(book['translators'])}")
    
    if book.get('adaptors'):
        metadata_lines.append(f"adaptor={', '.join(book['adaptors'])}")
    
    if book.get('description'):
        metadata_lines.append(f"comment={book['description']}")
    
    if book.get('copyright'):
        metadata_lines.append(f"copyright={book['copyright']}")
    
    if book.get('publicationDate'):
        # Extract year from date
        year = book['publicationDate'][:4] if len(book['publicationDate']) >= 4 else ''
        if year:
            metadata_lines.append(f"date={year}")
    
    metadata_lines.append("genre=Audiobook")
    
    # Add package creation timestamp
    creation_timestamp = datetime.now().isoformat()
    metadata_lines.append(f"creation_time={creation_timestamp}")
    metadata_lines.append("encoder=Khipu Studio M4B Packager")
    
    # Add chapter markers
    chapters = manifest.get('chapters', [])
    current_time_ms = 0
    
    for chapter in chapters:
        if not chapter.get('hasAudio') or chapter.get('duration') is None:
            continue
        
        duration_ms = int(chapter['duration'] * 1000)
        
        metadata_lines.append("")
        metadata_lines.append("[CHAPTER]")
        metadata_lines.append("TIMEBASE=1/1000")
        metadata_lines.append(f"START={current_time_ms}")
        metadata_lines.append(f"END={current_time_ms + duration_ms}")
        
        chapter_title = chapter.get('title', f"Chapter {chapter.get('index', 0)}")
        metadata_lines.append(f"title={chapter_title}")
        
        current_time_ms += duration_ms
    
    # Write metadata file
    metadata_path = output_path.parent / f"{output_path.stem}_metadata.txt"
    with open(metadata_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(metadata_lines))
    
    return metadata_path


def _create_concat_list(manifest: Dict[str, Any], project_root: Path, output_path: Path) -> Optional[Path]:
    """
    Create FFmpeg concat file listing all chapter audio files.
    Returns path to concat file, or None if no audio files found.
    """
    chapters = manifest.get('chapters', [])
    audio_files = []
    
    for chapter in chapters:
        if not chapter.get('hasAudio'):
            continue
        
        audio_rel_path = chapter.get('audioFile')
        if not audio_rel_path:
            continue
        
        audio_abs_path = project_root / audio_rel_path
        if audio_abs_path.exists():
            audio_files.append(audio_abs_path)
        else:
            print(f"[WARNING] Audio file not found: {audio_abs_path}", file=sys.stderr)
    
    if not audio_files:
        print("[ERROR] No audio files found for concatenation", file=sys.stderr)
        return None
    
    # Create concat list file
    concat_path = output_path.parent / f"{output_path.stem}_concat.txt"
    with open(concat_path, 'w', encoding='utf-8') as f:
        for audio_file in audio_files:
            # Escape single quotes in path for FFmpeg
            escaped_path = str(audio_file).replace("'", "'\\''")
            f.write(f"file '{escaped_path}'\n")
    
    print(f"[INFO] Created concat list with {len(audio_files)} audio files", file=sys.stderr)
    return concat_path


def package_m4b(
    project_root: str | Path,
    output_path: str | Path,
    audio_spec: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Package audiobook as M4B for Apple Books.
    
    Args:
        project_root: Path to project root directory
        output_path: Path where M4B file should be created
        audio_spec: Audio specifications (format, bitrate, sampleRate, channels)
                   If None, uses defaults: AAC, 128k, 44100, mono
    
    Returns:
        True if successful, False otherwise
    """
    project_root = Path(project_root)
    output_path = Path(output_path)
    
    print("📦 Packaging M4B for Apple Books", file=sys.stderr)
    print(f"   Project: {project_root}", file=sys.stderr)
    print(f"   Output: {output_path}", file=sys.stderr)
    
    # Load project data (from manifest or source files)
    try:
        manifest = _load_project_data(project_root)
    except Exception as e:
        print(f"[ERROR] Failed to load project data: {e}", file=sys.stderr)
        return False
    
    # Check if all chapters have audio
    audio_info = manifest.get('audio', {})
    if audio_info.get('completedChapters', 0) < audio_info.get('chapterCount', 0):
        missing = audio_info.get('missingAudio', [])
        print(f"[ERROR] Not all chapters have audio. Missing: {', '.join(missing)}", file=sys.stderr)
        return False
    
    # Create output directory
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Use provided audio spec or defaults
    if audio_spec is None:
        audio_spec = {}
    
    bitrate = audio_spec.get('bitrate', '128k')
    sample_rate = audio_spec.get('sampleRate', 44100)
    channels = audio_spec.get('channels', 1)
    
    print(f"[INFO] Audio spec: AAC {bitrate}, {sample_rate}Hz, {channels}ch", file=sys.stderr)
    
    # Create temporary directory for intermediate files
    with tempfile.TemporaryDirectory(prefix='m4b_packaging_') as temp_dir:
        temp_path = Path(temp_dir)
        
        # Step 1: Create concat list
        concat_path = _create_concat_list(manifest, project_root, output_path)
        if not concat_path:
            return False
        
        # Step 2: Create metadata file with chapters
        metadata_path = _create_ffmpeg_metadata(manifest, output_path)
        
        # Step 3: Concatenate audio files
        temp_audio = temp_path / 'concatenated.wav'
        if not _run_ffmpeg([
            '-f', 'concat',
            '-safe', '0',
            '-i', str(concat_path),
            '-c', 'copy',
            str(temp_audio)
        ], "Concatenating chapter audio"):
            return False
        
        # Step 4: Convert to M4B with AAC encoding and metadata
        ffmpeg_args = [
            '-i', str(temp_audio),
            '-i', str(metadata_path),
            '-map', '0:a',
            '-map_metadata', '1',
            '-c:a', 'aac',
            '-b:a', bitrate,
            '-ar', str(sample_rate),
            '-ac', str(channels),
        ]
        
        # Add cover art if available
        cover = manifest.get('cover', {}).get('image')
        if cover:
            cover_path = project_root / cover
            if cover_path.exists():
                print(f"🖼️  Adding cover art: {cover_path.name}", file=sys.stderr)
                ffmpeg_args.extend([
                    '-i', str(cover_path),
                    '-map', '2:v',
                    '-c:v', 'copy',
                    '-disposition:v:0', 'attached_pic'
                ])
        
        # Output file
        ffmpeg_args.append(str(output_path))
        
        if not _run_ffmpeg(ffmpeg_args, "Converting to M4B with metadata"):
            return False
        
        # Cleanup temp files
        try:
            concat_path.unlink()
            metadata_path.unlink()
        except Exception:
            pass
    
    # Verify output file was created
    if not output_path.exists():
        print("[ERROR] Output file was not created", file=sys.stderr)
        return
    
    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"[SUCCESS] M4B package created: {output_path.name} ({file_size_mb:.1f} MB)", file=sys.stderr)
    
    return True


def main():
    """CLI entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Package audiobook as M4B for Apple Books'
    )
    parser.add_argument(
        'project_root',
        help='Path to project root directory'
    )
    parser.add_argument(
        '--output',
        '-o',
        required=True,
        help='Output M4B file path'
    )
    parser.add_argument(
        '--bitrate',
        default='128k',
        help='AAC bitrate (default: 128k)'
    )
    parser.add_argument(
        '--sample-rate',
        type=int,
        default=44100,
        help='Sample rate in Hz (default: 44100)'
    )
    parser.add_argument(
        '--channels',
        type=int,
        default=1,
        help='Number of channels (default: 1 for mono)'
    )
    
    args = parser.parse_args()
    
    audio_spec = {
        'format': 'AAC',
        'bitrate': args.bitrate,
        'sampleRate': args.sample_rate,
        'channels': args.channels
    }
    
    success = package_m4b(args.project_root, args.output, audio_spec)
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())
