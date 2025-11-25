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
import shutil


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
            print(f"❌ FFmpeg error: {result.stderr}", file=sys.stderr)
            return False
        
        print(f"✅ {description} complete", file=sys.stderr)
        return True
    except FileNotFoundError:
        print("❌ FFmpeg not found. Please install FFmpeg.", file=sys.stderr)
        return False
    except Exception as e:
        print(f"❌ Error during {description}: {e}", file=sys.stderr)
        return False


def _create_ffmpeg_metadata(manifest: Dict[str, Any], output_path: Path) -> Path:
    """
    Create FFmpeg metadata file with chapter markers.
    Returns path to metadata file.
    """
    metadata_lines = [";FFMETADATA1"]
    
    # Add book metadata
    book = manifest.get('book', {})
    metadata_lines.append(f"title={book.get('title', 'Untitled')}")
    
    if book.get('authors'):
        metadata_lines.append(f"artist={', '.join(book['authors'])}")
    
    if book.get('narrators'):
        metadata_lines.append(f"album_artist={', '.join(book['narrators'])}")
    
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
            print(f"⚠️  Audio file not found: {audio_abs_path}", file=sys.stderr)
    
    if not audio_files:
        print("❌ No audio files found for concatenation", file=sys.stderr)
        return None
    
    # Create concat list file
    concat_path = output_path.parent / f"{output_path.stem}_concat.txt"
    with open(concat_path, 'w', encoding='utf-8') as f:
        for audio_file in audio_files:
            # Escape single quotes in path for FFmpeg
            escaped_path = str(audio_file).replace("'", "'\\''")
            f.write(f"file '{escaped_path}'\n")
    
    print(f"📋 Created concat list with {len(audio_files)} audio files", file=sys.stderr)
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
    
    print(f"📦 Packaging M4B for Apple Books", file=sys.stderr)
    print(f"   Project: {project_root}", file=sys.stderr)
    print(f"   Output: {output_path}", file=sys.stderr)
    
    # Load manifest
    manifest_path = project_root / 'manifest.json'
    if not manifest_path.exists():
        print(f"❌ Manifest not found: {manifest_path}", file=sys.stderr)
        return False
    
    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
    except Exception as e:
        print(f"❌ Failed to load manifest: {e}", file=sys.stderr)
        return False
    
    # Check if all chapters have audio
    audio_info = manifest.get('audio', {})
    if audio_info.get('completedChapters', 0) < audio_info.get('chapterCount', 0):
        missing = audio_info.get('missingAudio', [])
        print(f"❌ Not all chapters have audio. Missing: {', '.join(missing)}", file=sys.stderr)
        return False
    
    # Create output directory
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Use provided audio spec or defaults
    if audio_spec is None:
        audio_spec = {}
    
    bitrate = audio_spec.get('bitrate', '128k')
    sample_rate = audio_spec.get('sampleRate', 44100)
    channels = audio_spec.get('channels', 1)
    
    print(f"🎵 Audio spec: AAC {bitrate}, {sample_rate}Hz, {channels}ch", file=sys.stderr)
    
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
        print("❌ Output file was not created", file=sys.stderr)
        return False
    
    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"✅ M4B package created: {output_path.name} ({file_size_mb:.1f} MB)", file=sys.stderr)
    
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
