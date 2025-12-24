"""
Packaging worker - Background processor for packaging jobs.

This worker:
1. Polls for queued packaging jobs
2. Downloads and assembles audio segments
3. Runs the appropriate packager
4. Uploads the package to blob storage
5. Updates job status and creates package record
"""

import asyncio
from uuid import UUID, uuid4
from pathlib import Path
from datetime import datetime, UTC
from typing import Optional
import traceback

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from shared.db.database import AsyncSessionLocal
from shared.models import PackagingJob, Package, Project, Book
from shared.services.blob_storage import BlobStorageService
from shared.config import settings

from .job_manager import JobStatus, update_job_status
from .audio_assembler import AudioAssembler
from .version_manager import VersionManager
from .storage_tier_manager import StorageTierManager
from .platform_configs import get_platform_config
from .packagers import M4BPackager, ZipMP3Packager, EPUB3Packager


class PackagingWorker:
    """Background worker that processes packaging jobs."""
    
    def __init__(
        self,
        blob_service: BlobStorageService,
        poll_interval: int = 5
    ):
        """
        Initialize packaging worker.
        
        Args:
            blob_service: Blob storage service for uploads/downloads
            poll_interval: Seconds between job polling
        """
        self.blob_service = blob_service
        self.poll_interval = poll_interval
        self.running = False
        
        # Initialize packagers
        self.m4b_packager = M4BPackager()
        self.zip_mp3_packager = ZipMP3Packager()
        self.epub3_packager = EPUB3Packager()
    
    async def start(self):
        """Start the worker loop."""
        self.running = True
        print("📦 Packaging worker started")
        
        while self.running:
            try:
                async with AsyncSessionLocal() as db:
                    # Get next queued job
                    job = await self._get_next_job(db)
                    
                    if job:
                        print(f"🔨 Processing job {job.id} for platform {job.platform_id}")
                        await self._process_job(db, job)
                    else:
                        # No jobs, wait before polling again
                        await asyncio.sleep(self.poll_interval)
            
            except Exception as e:
                print(f"❌ Worker error: {e}")
                traceback.print_exc()
                await asyncio.sleep(self.poll_interval)
    
    def stop(self):
        """Stop the worker loop."""
        self.running = False
        print("🛑 Packaging worker stopped")
    
    async def _get_next_job(self, db: AsyncSession) -> Optional[PackagingJob]:
        """Get next queued job (FIFO)."""
        query = select(PackagingJob).where(
            PackagingJob.status == JobStatus.QUEUED
        ).order_by(PackagingJob.created_at.asc()).limit(1)
        
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    async def _process_job(self, db: AsyncSession, job: PackagingJob):
        """Process a single packaging job."""
        
        try:
            # Update status to downloading
            await update_job_status(
                db=db,
                job_id=job.id,
                status=JobStatus.DOWNLOADING_AUDIO,
                progress_percent=0,
                current_step="Downloading audio segments"
            )
            
            # Get project and book metadata
            project = await self._get_project(db, job.project_id)
            book = await self._get_book(db, project.book_id) if project.book_id else None
            
            if not project:
                raise ValueError(f"Project {job.project_id} not found")
            
            # Initialize audio assembler
            assembler = AudioAssembler(
                db=db,
                blob_service=self.blob_service
            )
            
            # Progress callback
            async def progress_callback(message: str, percent: int):
                await update_job_status(
                    db=db,
                    job_id=job.id,
                    status=job.status,
                    progress_percent=percent,
                    current_step=message
                )
            
            # Assemble audio
            chapter_audio = await assembler.assemble_project_audio(
                project_id=job.project_id,
                tenant_id=job.tenant_id,
                audio_format="mp3",
                progress_callback=progress_callback
            )
            
            # Get chapter timestamps for M4B
            chapters_info = await assembler.get_chapter_timestamps(chapter_audio)
            
            # Update status to processing
            await update_job_status(
                db=db,
                job_id=job.id,
                status=JobStatus.PROCESSING,
                progress_percent=50,
                current_step="Creating package"
            )
            
            # Get platform config
            platform_config = get_platform_config(job.platform_id)
            if not platform_config:
                raise ValueError(f"Unknown platform: {job.platform_id}")
            
            # Prepare output path
            import tempfile
            with tempfile.TemporaryDirectory(prefix='packaging_output_') as temp_dir:
                temp_path = Path(temp_dir)
                
                # Get cover image path if exists
                cover_path = None
                if project.cover_image_path:
                    cover_path = temp_path / "cover.jpg"
                    # Download cover from blob storage
                    try:
                        await self.blob_service.download_blob_to_file(
                            container=project.blob_container,
                            blob_name=project.cover_image_path,
                            destination_path=str(cover_path)
                        )
                    except Exception:
                        cover_path = None
                
                # Build book metadata
                book_metadata = {
                    "title": book.title if book else project.title,
                    "authors": book.authors if book else [],
                    "narrators": book.narrators if book else [],
                    "description": book.description if book else "",
                    "isbn": book.isbn if book else "",
                    "publisher": book.publisher if book else "",
                    "publicationDate": str(book.publication_date) if book and book.publication_date else "",
                    "language": book.language if book else "en"
                }
                
                # Audio spec
                audio_spec = {
                    "codec": platform_config.audio_spec.codec,
                    "bitrate_kbps": platform_config.audio_spec.bitrate_kbps,
                    "sample_rate_hz": platform_config.audio_spec.sample_rate_hz,
                    "channels": platform_config.audio_spec.channels
                }
                
                # Run appropriate packager
                package_info = await self._run_packager(
                    platform_id=job.platform_id,
                    platform_config=platform_config,
                    chapter_audio=chapter_audio,
                    chapters_info=chapters_info,
                    book_metadata=book_metadata,
                    cover_path=cover_path,
                    temp_path=temp_path,
                    audio_spec=audio_spec,
                    progress_callback=progress_callback
                )
                
                # Upload to blob storage
                await update_job_status(
                    db=db,
                    job_id=job.id,
                    status=JobStatus.UPLOADING,
                    progress_percent=90,
                    current_step="Uploading package to storage"
                )
                
                blob_path = await self._upload_package(
                    package_path=Path(package_info['file_path']),
                    project_id=job.project_id,
                    platform_id=job.platform_id,
                    tenant_id=job.tenant_id
                )
                
                # Create package record
                package = await self._create_package_record(
                    db=db,
                    job=job,
                    package_info=package_info,
                    blob_path=blob_path,
                    audio_spec=audio_spec
                )
                
                # Cleanup temp files
                assembler.cleanup(Path(chapter_audio[list(chapter_audio.keys())[0]]).parent.parent)
                
                # Mark job as completed
                await update_job_status(
                    db=db,
                    job_id=job.id,
                    status=JobStatus.COMPLETED,
                    progress_percent=100,
                    current_step="Package created successfully",
                    package_id=package.id
                )
                
                print(f"✅ Job {job.id} completed. Package: {package.id}")
        
        except Exception as e:
            # Mark job as failed
            error_msg = f"{type(e).__name__}: {str(e)}"
            print(f"❌ Job {job.id} failed: {error_msg}")
            traceback.print_exc()
            
            await update_job_status(
                db=db,
                job_id=job.id,
                status=JobStatus.FAILED,
                current_step="Failed",
                error_message=error_msg[:500]  # Truncate long errors
            )
    
    async def _get_project(self, db: AsyncSession, project_id: UUID) -> Optional[Project]:
        """Get project record."""
        query = select(Project).where(Project.id == project_id)
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    async def _get_book(self, db: AsyncSession, book_id: UUID) -> Optional[Book]:
        """Get book record."""
        query = select(Book).where(Book.id == book_id)
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    async def _run_packager(
        self,
        platform_id: str,
        platform_config,
        chapter_audio: dict,
        chapters_info: list,
        book_metadata: dict,
        cover_path: Optional[Path],
        temp_path: Path,
        audio_spec: dict,
        progress_callback
    ) -> dict:
        """Run the appropriate packager for the platform."""
        
        output_filename = f"{book_metadata['title']}.{platform_config.package_format}"
        output_path = temp_path / output_filename
        
        if platform_id == "apple":
            # M4B for Apple Books
            return await self.m4b_packager.package(
                chapter_audio=chapter_audio,
                chapters_info=chapters_info,
                book_metadata=book_metadata,
                cover_image_path=cover_path,
                output_path=output_path,
                audio_spec=audio_spec,
                progress_callback=progress_callback
            )
        
        elif platform_id in ["google", "spotify", "acx"]:
            # ZIP+MP3 for Google, Spotify, ACX
            return await self.zip_mp3_packager.package(
                chapter_audio=chapter_audio,
                chapters_info=chapters_info,
                book_metadata=book_metadata,
                cover_image_path=cover_path,
                output_path=output_path,
                audio_spec=audio_spec,
                platform_id=platform_id,
                progress_callback=progress_callback
            )
        
        elif platform_id == "kobo":
            # EPUB3 for Kobo
            return await self.epub3_packager.package(
                chapter_audio=chapter_audio,
                chapters_info=chapters_info,
                book_metadata=book_metadata,
                cover_image_path=cover_path,
                output_path=output_path,
                audio_spec=audio_spec,
                progress_callback=progress_callback
            )
        
        else:
            raise ValueError(f"Unsupported platform: {platform_id}")
    
    async def _upload_package(
        self,
        package_path: Path,
        project_id: UUID,
        platform_id: str,
        tenant_id: UUID
    ) -> str:
        """Upload package to blob storage."""
        
        # Blob path structure: {tenant_id}/packages/{project_id}/{platform_id}_{timestamp}.{ext}
        timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        ext = package_path.suffix
        blob_name = f"{tenant_id}/packages/{project_id}/{platform_id}_{timestamp}{ext}"
        
        # Upload
        await self.blob_service.upload_blob_from_file(
            container=settings.AZURE_STORAGE_CONTAINER,
            blob_name=blob_name,
            file_path=str(package_path)
        )
        
        return blob_name
    
    async def _create_package_record(
        self,
        db: AsyncSession,
        job: PackagingJob,
        package_info: dict,
        blob_path: str,
        audio_spec: dict
    ) -> Package:
        """Create package database record."""
        
        # Get next version number
        version_manager = VersionManager(db)
        version_number = await version_manager.get_next_version_number(
            project_id=job.project_id,
            platform_id=job.platform_id
        )
        
        # Enforce version limit
        await version_manager.enforce_version_limit(
            project_id=job.project_id,
            platform_id=job.platform_id,
            tenant_id=job.tenant_id
        )
        
        # Create package
        package = Package(
            id=uuid4(),
            tenant_id=job.tenant_id,
            project_id=job.project_id,
            platform_id=job.platform_id,
            version_number=version_number,
            package_format=package_info['format'],
            blob_path=blob_path,
            blob_container=settings.AZURE_STORAGE_CONTAINER,
            storage_tier="temp",
            size_bytes=package_info['size_bytes'],
            audio_spec=audio_spec,
            is_validated=False,
            created_by=job.created_by,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC)
        )
        
        db.add(package)
        
        # Set expiration (temp = 24 hours)
        storage_manager = StorageTierManager(db)
        package = await storage_manager.create_temp_package(package)
        
        await db.commit()
        await db.refresh(package)
        
        return package


# Standalone function to run worker
async def run_packaging_worker():
    """Run the packaging worker (for standalone execution)."""
    
    blob_service = BlobStorageService(settings)
    worker = PackagingWorker(blob_service)
    
    try:
        await worker.start()
    except KeyboardInterrupt:
        print("\n⏸️  Received interrupt signal")
        worker.stop()


if __name__ == "__main__":
    from uuid import uuid4
    asyncio.run(run_packaging_worker())
