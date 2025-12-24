"""
M4B Packager for Apple Books (Cloud Version)

Creates M4B audiobook with:
- AAC audio encoding
- Chapter markers
- Cover art embedding
- Metadata
"""

import asyncio
from pathlib import Path
from typing import Dict, List, Optional, Callable
from datetime import datetime
import tempfile


class M4BPackager:
    """Packages audiobook as M4B format for Apple Books."""
    
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
        progress_callback: Optional[Callable[[str, int], None]] = None
    ) -> Dict:
        """
        Create M4B package from chapter audio files.
        
        Args:
            chapter_audio: Dict mapping chapter_id -> audio file path
            chapters_info: List of chapter info with start_time_ms, duration_ms, title
            book_metadata: Book metadata (title, authors, narrators, etc.)
            cover_image_path: Path to cover image file
            output_path: Where to write the M4B file
            audio_spec: Audio specification (codec, bitrate_kbps, sample_rate_hz, channels)
            progress_callback: Optional callback(message, percent)
        
        Returns:
            Package info dict with file_path, size_bytes, duration_ms
        """
        
        if progress_callback:
            await progress_callback("Preparing M4B package", 0)
        
        with tempfile.TemporaryDirectory(prefix='m4b_cloud_') as temp_dir:
            temp_path = Path(temp_dir)
            
            # Step 1: Concatenate all chapter audio into single file
            if progress_callback:
                await progress_callback("Concatenating chapter audio", 20)
            
            concat_audio = await self._concatenate_audio(
                chapter_audio,
                chapters_info,
                temp_path
            )
            
            # Step 2: Create metadata file with chapter markers
            if progress_callback:
                await progress_callback("Creating chapter markers", 40)
            
            metadata_file = self._create_metadata_file(
                chapters_info,
                book_metadata,
                temp_path
            )
            
            # Step 3: Encode to M4B with metadata
            if progress_callback:
                await progress_callback("Encoding to M4B format", 60)
            
            await self._encode_m4b(
                concat_audio,
                metadata_file,
                cover_image_path,
                output_path,
                audio_spec
            )
            
            # Step 4: Get final file info
            if progress_callback:
                await progress_callback("Finalizing package", 90)
            
            size_bytes = output_path.stat().st_size
            duration_ms = sum(ch['duration_ms'] for ch in chapters_info)
            
            if progress_callback:
                await progress_callback("M4B package complete", 100)
            
            return {
                "file_path": str(output_path),
                "size_bytes": size_bytes,
                "duration_ms": duration_ms,
                "format": "m4b",
                "chapter_count": len(chapters_info)
            }
    
    async def _concatenate_audio(
        self,
        chapter_audio: Dict[str, Path],
        chapters_info: List[Dict],
        temp_path: Path
    ) -> Path:
        """Concatenate chapter audio files into single file."""
        
        # Create concat file list
        concat_list = temp_path / "concat_list.txt"
        with open(concat_list, 'w', encoding='utf-8') as f:
            for chapter in sorted(chapters_info, key=lambda c: c['start_time_ms']):
                chapter_id = chapter['chapter_id']
                if chapter_id in chapter_audio:
                    audio_path = chapter_audio[chapter_id]
                    f.write(f"file '{audio_path.absolute()}'\n")
        
        # Concatenate using FFmpeg
        output_audio = temp_path / "concatenated.m4a"
        
        cmd = [
            self.ffmpeg_path,
            '-f', 'concat',
            '-safe', '0',
            '-i', str(concat_list),
            '-c', 'copy',
            '-y',
            str(output_audio)
        ]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        _, stderr = await process.communicate()
        
        if process.returncode != 0:
            raise RuntimeError(f"FFmpeg concat failed: {stderr.decode()}")
        
        return output_audio
    
    def _create_metadata_file(
        self,
        chapters_info: List[Dict],
        book_metadata: Dict,
        temp_path: Path
    ) -> Path:
        """Create FFmpeg metadata file with chapter markers and tags."""
        
        metadata_file = temp_path / "metadata.txt"
        lines = [";FFMETADATA1"]
        
        # Global metadata
        title = book_metadata.get('title', 'Untitled')
        lines.append(f"title={title}")
        
        if book_metadata.get('authors'):
            lines.append(f"artist={', '.join(book_metadata['authors'])}")
        
        if book_metadata.get('narrators'):
            lines.append(f"album_artist={', '.join(book_metadata['narrators'])}")
        
        if book_metadata.get('description'):
            lines.append(f"comment={book_metadata['description']}")
        
        lines.append("genre=Audiobook")
        
        # Add creation timestamp
        lines.append(f"creation_time={datetime.now().isoformat()}")
        lines.append("encoder=Khipu Cloud M4B Packager")
        
        # Chapter markers
        for chapter in sorted(chapters_info, key=lambda c: c['start_time_ms']):
            start_ms = chapter['start_time_ms']
            end_ms = start_ms + chapter['duration_ms']
            
            lines.append("")
            lines.append("[CHAPTER]")
            lines.append("TIMEBASE=1/1000")
            lines.append(f"START={start_ms}")
            lines.append(f"END={end_ms}")
            lines.append(f"title={chapter['title']}")
        
        metadata_file.write_text('\n'.join(lines), encoding='utf-8')
        return metadata_file
    
    async def _encode_m4b(
        self,
        input_audio: Path,
        metadata_file: Path,
        cover_image: Optional[Path],
        output_path: Path,
        audio_spec: Dict
    ):
        """Encode audio to M4B with metadata and cover art."""
        
        bitrate_kbps = audio_spec.get('bitrate_kbps', 128)
        sample_rate = audio_spec.get('sample_rate_hz', 44100)
        channels = audio_spec.get('channels', 1)
        
        cmd = [
            self.ffmpeg_path,
            '-i', str(input_audio),
            '-i', str(metadata_file),
            '-map', '0:a',
            '-map_metadata', '1',
            '-codec:a', 'aac',
            '-b:a', f'{bitrate_kbps}k',
            '-ar', str(sample_rate),
            '-ac', str(channels),
        ]
        
        # Add cover art if provided
        if cover_image and cover_image.exists():
            cmd.extend([
                '-i', str(cover_image),
                '-map', '2:v',
                '-c:v', 'copy',
                '-disposition:v', 'attached_pic'
            ])
        
        cmd.extend([
            '-f', 'mp4',
            '-movflags', '+faststart',
            '-y',
            str(output_path)
        ])
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        _, stderr = await process.communicate()
        
        if process.returncode != 0:
            raise RuntimeError(f"FFmpeg M4B encoding failed: {stderr.decode()}")
        
        # Rename .mp4 to .m4b
        if output_path.suffix == '.mp4':
            m4b_path = output_path.with_suffix('.m4b')
            output_path.rename(m4b_path)
