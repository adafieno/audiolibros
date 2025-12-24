"""
Audio assembler for packaging.

Handles the process of:
1. Downloading segment audio files from blob storage
2. Concatenating segments into chapter/book audio in temp directory
3. Cleaning up temp files after packaging complete
"""

import tempfile
import asyncio
from typing import List, Dict, Optional
from uuid import UUID
from pathlib import Path
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Segment, Chapter
from shared.services.blob_storage import BlobStorageService


class AudioAssembler:
    """
    Assembles audio segments into complete audio files for packaging.
    
    Workflow:
    1. Create temp directory for this assembly job
    2. Download all segment audio files from blob storage
    3. Concatenate segments in chapter order using FFmpeg
    4. Return paths to assembled audio files
    5. Caller packages the audio and uploads
    6. Cleanup temp directory
    """
    
    def __init__(
        self,
        db: AsyncSession,
        blob_service: BlobStorageService,
        temp_base_dir: Optional[str] = None
    ):
        """
        Initialize audio assembler.
        
        Args:
            db: Database session
            blob_service: Blob storage service for downloading segments
            temp_base_dir: Base directory for temp files (default: system temp)
        """
        self.db = db
        self.blob_service = blob_service
        self.temp_base_dir = temp_base_dir or tempfile.gettempdir()
        
    async def assemble_project_audio(
        self,
        project_id: UUID,
        tenant_id: UUID,
        audio_format: str = "mp3",
        progress_callback: Optional[callable] = None
    ) -> Dict[str, Path]:
        """
        Assemble all audio for a project, organized by chapter.
        
        Args:
            project_id: Project ID
            tenant_id: Tenant ID (for security/blob path)
            audio_format: Output format (mp3, m4a, wav)
            progress_callback: Optional callback(step: str, percent: int)
        
        Returns:
            Dict mapping chapter_id -> assembled audio file path
            {
                "chapter_uuid_1": Path("/tmp/khipu_packaging_xxx/chapter_1.mp3"),
                "chapter_uuid_2": Path("/tmp/khipu_packaging_xxx/chapter_2.mp3"),
                ...
            }
        """
        
        # Create temp working directory
        work_dir = self._create_work_dir(project_id)
        
        try:
            # Get all chapters with segments
            chapters = await self._get_project_chapters(project_id, tenant_id)
            
            if not chapters:
                raise ValueError(f"No chapters found for project {project_id}")
            
            # Report progress
            if progress_callback:
                await progress_callback("Downloading audio segments", 10)
            
            # Download all segment audio files
            segment_files = await self._download_all_segments(
                project_id,
                tenant_id,
                work_dir,
                progress_callback
            )
            
            # Report progress
            if progress_callback:
                await progress_callback("Concatenating audio by chapter", 50)
            
            # Concatenate segments by chapter
            chapter_audio = await self._concatenate_by_chapter(
                chapters,
                segment_files,
                work_dir,
                audio_format,
                progress_callback
            )
            
            # Report progress
            if progress_callback:
                await progress_callback("Audio assembly complete", 90)
            
            return chapter_audio
            
        except Exception:
            # Cleanup on failure
            self._cleanup_work_dir(work_dir)
            raise
    
    async def assemble_single_file(
        self,
        project_id: UUID,
        tenant_id: UUID,
        output_path: Path,
        audio_format: str = "mp3",
        progress_callback: Optional[callable] = None
    ) -> Path:
        """
        Assemble all project audio into a single continuous file.
        
        Used for M4B packaging where we want one audio file with chapter markers.
        
        Args:
            project_id: Project ID
            tenant_id: Tenant ID
            output_path: Where to write the assembled file
            audio_format: Output format (mp3, m4a, wav)
            progress_callback: Optional progress callback
        
        Returns:
            Path to assembled single audio file
        """
        
        # Get chapter audio files
        chapter_audio = await self.assemble_project_audio(
            project_id,
            tenant_id,
            audio_format,
            progress_callback
        )
        
        # Concatenate all chapter audio into one file
        chapter_files = sorted(chapter_audio.values(), key=lambda p: p.name)
        
        await self._concatenate_audio_files(
            chapter_files,
            output_path,
            audio_format
        )
        
        return output_path
    
    def _create_work_dir(self, project_id: UUID) -> Path:
        """Create temporary working directory for this assembly job."""
        work_dir = Path(self.temp_base_dir) / f"khipu_packaging_{project_id}"
        work_dir.mkdir(parents=True, exist_ok=True)
        return work_dir
    
    def _cleanup_work_dir(self, work_dir: Path):
        """Remove temporary working directory and all contents."""
        if work_dir.exists():
            import shutil
            shutil.rmtree(work_dir, ignore_errors=True)
    
    async def _get_project_chapters(
        self,
        project_id: UUID,
        tenant_id: UUID
    ) -> List[Chapter]:
        """Get all chapters for a project, ordered by chapter_number."""
        query = select(Chapter).where(
            and_(
                Chapter.project_id == project_id,
                Chapter.tenant_id == tenant_id
            )
        ).order_by(Chapter.chapter_number)
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def _download_all_segments(
        self,
        project_id: UUID,
        tenant_id: UUID,
        work_dir: Path,
        progress_callback: Optional[callable] = None
    ) -> Dict[UUID, Path]:
        """
        Download all segment audio files from blob storage.
        
        Returns:
            Dict mapping segment_id -> local file path
        """
        
        # Get all segments with audio
        segments_query = select(Segment).where(
            and_(
                Segment.project_id == project_id,
                Segment.blob_path.isnot(None),
                Segment.blob_path != ''
            )
        ).order_by(Segment.chapter_id, Segment.segment_number)
        
        result = await self.db.execute(segments_query)
        segments = list(result.scalars().all())
        
        if not segments:
            raise ValueError(f"No audio segments found for project {project_id}")
        
        # Download each segment
        segment_files = {}
        segments_dir = work_dir / "segments"
        segments_dir.mkdir(exist_ok=True)
        
        for i, segment in enumerate(segments):
            # Determine file extension from blob_path
            ext = Path(segment.blob_path).suffix or ".mp3"
            local_path = segments_dir / f"segment_{segment.id}{ext}"
            
            # Download from blob storage
            await self.blob_service.download_blob_to_file(
                container=segment.blob_container,
                blob_name=segment.blob_path,
                destination_path=str(local_path)
            )
            
            segment_files[segment.id] = local_path
            
            # Report progress
            if progress_callback and (i % 10 == 0 or i == len(segments) - 1):
                percent = 10 + int((i / len(segments)) * 40)  # 10-50% range
                await progress_callback(f"Downloaded {i+1}/{len(segments)} segments", percent)
        
        return segment_files
    
    async def _concatenate_by_chapter(
        self,
        chapters: List[Chapter],
        segment_files: Dict[UUID, Path],
        work_dir: Path,
        audio_format: str,
        progress_callback: Optional[callable] = None
    ) -> Dict[str, Path]:
        """
        Concatenate segments into chapter audio files.
        
        Returns:
            Dict mapping chapter_id -> chapter audio file path
        """
        
        chapter_audio = {}
        chapters_dir = work_dir / "chapters"
        chapters_dir.mkdir(exist_ok=True)
        
        for i, chapter in enumerate(chapters):
            # Get segments for this chapter
            chapter_segments = await self._get_chapter_segments(chapter.id)
            
            # Get segment file paths in order
            segment_paths = []
            for segment in chapter_segments:
                if segment.id in segment_files:
                    segment_paths.append(segment_files[segment.id])
            
            if not segment_paths:
                # Chapter has no audio segments, skip
                continue
            
            # Output path for this chapter
            chapter_output = chapters_dir / f"chapter_{chapter.chapter_number:03d}.{audio_format}"
            
            # Concatenate segments
            await self._concatenate_audio_files(
                segment_paths,
                chapter_output,
                audio_format
            )
            
            chapter_audio[str(chapter.id)] = chapter_output
            
            # Report progress
            if progress_callback:
                percent = 50 + int((i / len(chapters)) * 40)  # 50-90% range
                await progress_callback(f"Assembled chapter {i+1}/{len(chapters)}", percent)
        
        return chapter_audio
    
    async def _get_chapter_segments(self, chapter_id: UUID) -> List[Segment]:
        """Get all segments for a chapter, ordered by segment_number."""
        query = select(Segment).where(
            Segment.chapter_id == chapter_id
        ).order_by(Segment.segment_number)
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def _concatenate_audio_files(
        self,
        input_files: List[Path],
        output_file: Path,
        audio_format: str
    ):
        """
        Concatenate multiple audio files using FFmpeg.
        
        Uses FFmpeg's concat demuxer for lossless concatenation.
        """
        
        if not input_files:
            raise ValueError("No input files to concatenate")
        
        # Create concat file list
        concat_file = output_file.parent / f"concat_{output_file.stem}.txt"
        with open(concat_file, 'w') as f:
            for input_file in input_files:
                # FFmpeg concat format: file 'path'
                f.write(f"file '{input_file.absolute()}'\n")
        
        # Run FFmpeg concatenation
        ffmpeg_cmd = [
            "ffmpeg",
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_file),
            "-c", "copy",  # Copy codec (lossless)
            "-y",  # Overwrite output
            str(output_file)
        ]
        
        process = await asyncio.create_subprocess_exec(
            *ffmpeg_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown FFmpeg error"
            raise RuntimeError(f"FFmpeg concatenation failed: {error_msg}")
        
        # Cleanup concat file
        concat_file.unlink(missing_ok=True)
    
    def cleanup(self, work_dir: Path):
        """Public cleanup method to remove temporary files."""
        self._cleanup_work_dir(work_dir)
    
    async def get_chapter_timestamps(
        self,
        chapter_audio: Dict[str, Path]
    ) -> List[Dict[str, any]]:
        """
        Get chapter timestamps for M4B chapter markers.
        
        Returns list of chapter info with start times:
        [
            {"chapter_id": "uuid", "title": "Chapter 1", "start_time_ms": 0, "duration_ms": 12345},
            {"chapter_id": "uuid", "title": "Chapter 2", "start_time_ms": 12345, "duration_ms": 23456},
            ...
        ]
        """
        
        chapters_info = []
        cumulative_time_ms = 0
        
        for chapter_id, audio_path in sorted(chapter_audio.items()):
            # Get audio duration using FFprobe
            duration_ms = await self._get_audio_duration(audio_path)
            
            # Get chapter from database
            chapter_query = select(Chapter).where(Chapter.id == UUID(chapter_id))
            result = await self.db.execute(chapter_query)
            chapter = result.scalar_one_or_none()
            
            chapters_info.append({
                "chapter_id": chapter_id,
                "title": chapter.title if chapter else f"Chapter {len(chapters_info) + 1}",
                "start_time_ms": cumulative_time_ms,
                "duration_ms": duration_ms
            })
            
            cumulative_time_ms += duration_ms
        
        return chapters_info
    
    async def _get_audio_duration(self, audio_path: Path) -> int:
        """Get audio file duration in milliseconds using FFprobe."""
        
        ffprobe_cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(audio_path)
        ]
        
        process = await asyncio.create_subprocess_exec(
            *ffprobe_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            raise RuntimeError(f"FFprobe failed: {stderr.decode() if stderr else 'Unknown error'}")
        
        duration_seconds = float(stdout.decode().strip())
        return int(duration_seconds * 1000)
