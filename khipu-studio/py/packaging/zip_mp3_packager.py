"""
ZIP+MP3 Packager for Google Play Books, Spotify, and ACX
Creates a ZIP archive containing MP3 files with embedded metadata.

Platform Requirements:
- Google Play Books: MP3, 256kbps, 44.1kHz, mono/stereo
- Spotify: MP3, 256kbps, 44.1kHz, mono/stereo  
- ACX: MP3, 192kbps, 44.1kHz, mono/stereo

Output: {title}.zip containing:
  - chapter_001.mp3
  - chapter_002.mp3
  - ...
  - metadata.json (optional manifest)
"""

import json
import shutil
import subprocess
from pathlib import Path
from typing import Optional, Dict
from dataclasses import dataclass


@dataclass
class PackagingResult:
    success: bool
    output_path: Optional[str] = None
    error: Optional[str] = None
    chapter_count: int = 0
    total_duration: float = 0.0
    total_size: int = 0


def _get_audio_duration(file_path: Path) -> float:
    """Get audio file duration in seconds using ffprobe."""
    try:
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            str(file_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', check=True)
        return float(result.stdout.strip())
    except Exception:
        return 0.0


def _convert_to_mp3(
    input_path: Path,
    output_path: Path,
    bitrate: str,
    sample_rate: int,
    channels: int,
    metadata: Optional[Dict[str, str]] = None
) -> bool:
    """Convert audio file to MP3 with specified settings and metadata."""
    try:
        cmd = [
            'ffmpeg',
            '-i', str(input_path),
            '-codec:a', 'libmp3lame',
            '-b:a', bitrate,
            '-ar', str(sample_rate),
            '-ac', str(channels),
            '-y'  # Overwrite output file
        ]
        
        # Add metadata tags
        if metadata:
            if metadata.get('title'):
                cmd.extend(['-metadata', f"title={metadata['title']}"])
            if metadata.get('artist'):
                cmd.extend(['-metadata', f"artist={metadata['artist']}"])
            if metadata.get('album'):
                cmd.extend(['-metadata', f"album={metadata['album']}"])
            if metadata.get('track'):
                cmd.extend(['-metadata', f"track={metadata['track']}"])
            if metadata.get('date'):
                cmd.extend(['-metadata', f"date={metadata['date']}"])
            if metadata.get('genre'):
                cmd.extend(['-metadata', f"genre={metadata['genre']}"])
            if metadata.get('comment'):
                cmd.extend(['-metadata', f"comment={metadata['comment']}"])
        
        cmd.append(str(output_path))
        
        subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding='utf-8',
            check=True
        )
        
        return output_path.exists()
    
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg conversion failed: {e.stderr}")
        return False
    except Exception as e:
        print(f"Conversion error: {e}")
        return False


def create_zip_mp3_package(
    project_root: str,
    platform_id: str,
    bitrate: str = "192k",
    sample_rate: int = 44100,
    channels: int = 1,
    use_manifest: bool = True
) -> PackagingResult:
    """
    Create ZIP+MP3 package for Google Play Books, Spotify, or ACX.
    
    Args:
        project_root: Path to project root directory
        platform_id: 'google', 'spotify', or 'acx'
        bitrate: MP3 bitrate (e.g., '192k', '256k')
        sample_rate: Sample rate in Hz (44100 or 48000)
        channels: Number of audio channels (1 or 2)
        use_manifest: Include metadata.json in package
    
    Returns:
        PackagingResult with success status and output path
    """
    root = Path(project_root)
    
    # Load project configuration
    project_config_path = root / 'project.khipu.json'
    if not project_config_path.exists():
        return PackagingResult(success=False, error='Project configuration not found')
    
    try:
        with open(project_config_path, 'r', encoding='utf-8') as f:
            project_config = json.load(f)
    except Exception as e:
        return PackagingResult(success=False, error=f'Failed to load project config: {e}')
    
    # Get book metadata
    book_meta = project_config.get('bookMeta', {})
    title = book_meta.get('title', 'Untitled')
    authors = book_meta.get('authors', [])
    narrators = book_meta.get('narrators', [])
    
    # Sanitize title for filename
    safe_title = "".join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in title)
    safe_title = safe_title.replace(' ', '_')
    
    # Create output directory
    output_dir = root / 'exports' / platform_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Create temporary directory for MP3 files
    temp_dir = output_dir / 'temp_mp3'
    temp_dir.mkdir(exist_ok=True)
    
    try:
        # Load manifest if available
        manifest_path = root / 'manifest.json'
        manifest = None
        if manifest_path.exists():
            try:
                with open(manifest_path, 'r', encoding='utf-8') as f:
                    manifest = json.load(f)
            except Exception:
                pass
        
        # Get chapters from manifest or load from chapters directory
        chapters = []
        if manifest and 'chapters' in manifest:
            chapters = manifest['chapters']
        else:
            # Scan chapters directory
            chapters_dir = root / 'chapters'
            if not chapters_dir.exists():
                return PackagingResult(success=False, error='Chapters directory not found')
            
            chapter_files = sorted(chapters_dir.glob('*.khipu.json'))
            for chapter_file in chapter_files:
                try:
                    with open(chapter_file, 'r', encoding='utf-8') as f:
                        chapter_data = json.load(f)
                        chapters.append({
                            'id': chapter_data.get('id', chapter_file.stem),
                            'title': chapter_data.get('title', 'Untitled Chapter')
                        })
                except Exception:
                    continue
        
        if not chapters:
            return PackagingResult(success=False, error='No chapters found')
        
        # Process each chapter
        converted_files = []
        total_duration = 0.0
        
        for idx, chapter in enumerate(chapters, 1):
            chapter_id = chapter.get('id', f'chapter_{idx:03d}')
            chapter_title = chapter.get('title', f'Chapter {idx}')
            
            # Find audio file for this chapter
            # Audio production saves files to audio/wav/{chapterId}_complete.wav
            audio_wav_dir = root / 'audio' / 'wav'
            
            # Look for complete audio file in audio/wav/ directory
            # Priority: {chapterId}_complete.wav (production output) > fallbacks
            audio_file = audio_wav_dir / f'{chapter_id}_complete.wav'
            if not audio_file.exists():
                audio_file = audio_wav_dir / f'{chapter_id}.wav'
            
            # Fallback: check audio/chapters/ directory (legacy)
            if not audio_file.exists():
                audio_chapters_dir = root / 'audio' / 'chapters'
                audio_file = audio_chapters_dir / f'{chapter_id}_complete.wav'
            if not audio_file.exists():
                audio_file = audio_chapters_dir / f'{chapter_id}.wav'
            
            if not audio_file.exists():
                print(f"Warning: No audio file found for {chapter_id}")
                print(f"  Expected: {audio_wav_dir / f'{chapter_id}_complete.wav'}")
                continue
            
            # Output MP3 filename
            output_mp3 = temp_dir / f'chapter_{idx:03d}.mp3'
            
            # Prepare metadata for this chapter
            chapter_metadata = {
                'title': chapter_title,
                'artist': ', '.join(narrators) if narrators else ', '.join(authors),
                'album': title,
                'track': f'{idx}/{len(chapters)}',
                'date': book_meta.get('publicationDate', ''),
                'genre': book_meta.get('genre', 'Audiobook'),
                'comment': f'Chapter {idx} of {len(chapters)}'
            }
            
            # Convert to MP3
            print(f"Converting {chapter_id} to MP3...")
            success = _convert_to_mp3(
                audio_file,
                output_mp3,
                bitrate,
                sample_rate,
                channels,
                chapter_metadata
            )
            
            if success:
                converted_files.append(output_mp3)
                duration = _get_audio_duration(output_mp3)
                total_duration += duration
                print(f"  [OK] {output_mp3.name} ({duration:.1f}s)")
            else:
                print(f"  [FAIL] Failed to convert {chapter_id}")
        
        if not converted_files:
            return PackagingResult(success=False, error='No audio files were converted')
        
        # Create metadata.json if requested
        if use_manifest:
            from datetime import datetime
            
            metadata_json = {
                'title': title,
                'authors': authors,
                'narrators': narrators,
                'chapters': [
                    {
                        'file': f.name,
                        'title': chapters[i].get('title', f'Chapter {i+1}'),
                        'duration': _get_audio_duration(f)
                    }
                    for i, f in enumerate(converted_files)
                ],
                'total_chapters': len(converted_files),
                'total_duration': total_duration,
                'audio_format': 'MP3',
                'bitrate': bitrate,
                'sample_rate': sample_rate,
                'channels': channels,
                'package_created': datetime.now().isoformat(),
                'packager': 'Khipu Studio ZIP+MP3 Packager',
                'platform': platform_id
            }
            
            metadata_path = temp_dir / 'metadata.json'
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata_json, f, indent=2, ensure_ascii=False)
        
        # Create ZIP archive
        zip_path = output_dir / f'{safe_title}.zip'
        print(f"\nCreating ZIP archive: {zip_path}")
        
        shutil.make_archive(
            str(zip_path.with_suffix('')),  # Remove .zip as make_archive adds it
            'zip',
            temp_dir
        )
        
        # Calculate total size
        total_size = sum(f.stat().st_size for f in converted_files)
        
        # Clean up temp directory
        shutil.rmtree(temp_dir)
        
        return PackagingResult(
            success=True,
            output_path=str(zip_path),
            chapter_count=len(converted_files),
            total_duration=total_duration,
            total_size=total_size
        )
    
    except Exception as e:
        # Clean up on error
        if temp_dir.exists():
            shutil.rmtree(temp_dir)
        return PackagingResult(success=False, error=str(e))


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Create ZIP+MP3 package for audiobook distribution')
    parser.add_argument('project_root', help='Path to project root directory')
    parser.add_argument('platform', choices=['google', 'spotify', 'acx'], help='Target platform')
    parser.add_argument('--bitrate', default='192k', help='MP3 bitrate (default: 192k)')
    parser.add_argument('--sample-rate', type=int, default=44100, help='Sample rate in Hz (default: 44100)')
    parser.add_argument('--channels', type=int, default=1, help='Number of channels (default: 1)')
    parser.add_argument('--no-manifest', action='store_true', help='Skip metadata.json creation')
    
    args = parser.parse_args()
    
    result = create_zip_mp3_package(
        args.project_root,
        args.platform,
        args.bitrate,
        args.sample_rate,
        args.channels,
        not args.no_manifest
    )
    
    if result.success:
        print("\n[SUCCESS] Package created successfully!")
        print(f"   Output: {result.output_path}")
        print(f"   Chapters: {result.chapter_count}")
        print(f"   Duration: {result.total_duration/60:.1f} minutes")
        print(f"   Size: {result.total_size/(1024*1024):.1f} MB")
    else:
        print(f"\n[ERROR] Packaging failed: {result.error}")
        exit(1)
