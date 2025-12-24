"""
ZIP+MP3 Packager for Google Play Books, Spotify, and ACX (Cloud Version)

Creates a ZIP archive containing MP3 files with embedded metadata.

Platform Requirements:
- Google Play Books: MP3, 256kbps, 44.1kHz, stereo
- Spotify: MP3, 256kbps, 44.1kHz, stereo (max 2h per file)
- ACX: MP3, 192kbps CBR, 44.1kHz, stereo (strict audio specs)
"""

import asyncio
import zipfile
from pathlib import Path
from typing import Dict, List, Optional, Callable
import json


class ZipMP3Packager:
    """Packages audiobook as ZIP containing MP3 files."""
    
    def __init__(self):
        self.ffmpeg_path = "ffmpeg"
        
    async def package(
        self,
        chapter_audio: Dict[str, Path],
        chapters_info: List[Dict],
        book_metadata: Dict,
        cover_image_path: Optional[Path],
        output_path: Path,
        audio_spec: Dict,
        platform_id: str,
        progress_callback: Optional[Callable[[str, int], None]] = None
    ) -> Dict:
        """
        Create ZIP+MP3 package from chapter audio files.
        
        Args:
            chapter_audio: Dict mapping chapter_id -> audio file path
            chapters_info: List of chapter info with title, chapter_number
            book_metadata: Book metadata (title, authors, narrators, etc.)
            cover_image_path: Path to cover image file
            output_path: Where to write the ZIP file
            audio_spec: Audio specification (codec, bitrate_kbps, sample_rate_hz, channels)
            platform_id: Platform identifier (google, spotify, acx)
            progress_callback: Optional callback(message, percent)
        
        Returns:
            Package info dict with file_path, size_bytes, chapter_count
        """
        
        if progress_callback:
            await progress_callback("Preparing ZIP+MP3 package", 0)
        
        import tempfile
        with tempfile.TemporaryDirectory(prefix=f'zip_mp3_{platform_id}_') as temp_dir:
            temp_path = Path(temp_dir)
            mp3_dir = temp_path / "mp3_files"
            mp3_dir.mkdir()
            
            # Convert each chapter to MP3
            total_chapters = len(chapters_info)
            mp3_files = []
            
            for i, chapter in enumerate(sorted(chapters_info, key=lambda c: c.get('chapter_number', 0))):
                chapter_id = chapter['chapter_id']
                
                if chapter_id not in chapter_audio:
                    continue
                
                if progress_callback:
                    percent = 10 + int((i / total_chapters) * 70)
                    await progress_callback(f"Converting chapter {i+1}/{total_chapters} to MP3", percent)
                
                chapter_num = chapter.get('chapter_number', i + 1)
                mp3_filename = f"chapter_{chapter_num:03d}.mp3"
                mp3_path = mp3_dir / mp3_filename
                
                # Convert to MP3 with metadata
                await self._convert_to_mp3(
                    input_path=chapter_audio[chapter_id],
                    output_path=mp3_path,
                    audio_spec=audio_spec,
                    metadata={
                        'title': chapter['title'],
                        'track': str(chapter_num),
                        'album': book_metadata.get('title', 'Untitled'),
                        'artist': ', '.join(book_metadata.get('narrators', [])),
                        'album_artist': ', '.join(book_metadata.get('authors', [])),
                        'genre': 'Audiobook',
                        'date': book_metadata.get('publicationDate', '')[:4] if book_metadata.get('publicationDate') else ''
                    }
                )
                
                mp3_files.append(mp3_path)
            
            # Create ZIP archive
            if progress_callback:
                await progress_callback("Creating ZIP archive", 85)
            
            await self._create_zip(
                mp3_files=mp3_files,
                cover_image=cover_image_path,
                book_metadata=book_metadata,
                output_path=output_path,
                platform_id=platform_id
            )
            
            # Get final info
            if progress_callback:
                await progress_callback("ZIP+MP3 package complete", 100)
            
            size_bytes = output_path.stat().st_size
            
            return {
                "file_path": str(output_path),
                "size_bytes": size_bytes,
                "format": "zip",
                "chapter_count": len(mp3_files),
                "platform": platform_id
            }
    
    async def _convert_to_mp3(
        self,
        input_path: Path,
        output_path: Path,
        audio_spec: Dict,
        metadata: Dict[str, str]
    ):
        """Convert audio file to MP3 with specified settings and metadata."""
        
        bitrate_kbps = audio_spec.get('bitrate_kbps', 256)
        sample_rate = audio_spec.get('sample_rate_hz', 44100)
        channels = audio_spec.get('channels', 2)
        
        cmd = [
            self.ffmpeg_path,
            '-i', str(input_path),
            '-codec:a', 'libmp3lame',
            '-b:a', f'{bitrate_kbps}k',
            '-ar', str(sample_rate),
            '-ac', str(channels),
        ]
        
        # Add metadata tags
        for key, value in metadata.items():
            if value:
                cmd.extend(['-metadata', f"{key}={value}"])
        
        cmd.extend(['-y', str(output_path)])
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        _, stderr = await process.communicate()
        
        if process.returncode != 0:
            raise RuntimeError(f"FFmpeg MP3 conversion failed: {stderr.decode()}")
    
    async def _create_zip(
        self,
        mp3_files: List[Path],
        cover_image: Optional[Path],
        book_metadata: Dict,
        output_path: Path,
        platform_id: str
    ):
        """Create ZIP archive with MP3 files, cover, and metadata."""
        
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Add MP3 files
            for mp3_file in mp3_files:
                zf.write(mp3_file, mp3_file.name)
            
            # Add cover image if provided
            if cover_image and cover_image.exists():
                zf.write(cover_image, f"cover{cover_image.suffix}")
            
            # Add metadata.json
            metadata_content = {
                "title": book_metadata.get('title', 'Untitled'),
                "authors": book_metadata.get('authors', []),
                "narrators": book_metadata.get('narrators', []),
                "description": book_metadata.get('description', ''),
                "isbn": book_metadata.get('isbn', ''),
                "publisher": book_metadata.get('publisher', ''),
                "publicationDate": book_metadata.get('publicationDate', ''),
                "language": book_metadata.get('language', 'en'),
                "platform": platform_id,
                "chapterCount": len(mp3_files),
                "packageDate": str(asyncio.get_event_loop().time())
            }
            
            zf.writestr('metadata.json', json.dumps(metadata_content, indent=2, ensure_ascii=False))
