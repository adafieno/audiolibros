"""Chapters Service Router."""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import tempfile
import subprocess
from pathlib import Path
import json

from shared.db.database import get_db
from shared.models import Chapter, Project, User
from shared.schemas.chapters import (
    ChapterCreate,
    ChapterUpdate,
    ChapterResponse,
    ChapterListResponse,
)
from shared.auth import get_current_active_user
from shared.auth.permissions import Permission, require_project_permission

router = APIRouter()


def count_words(text: str) -> int:
    """Count words in text."""
    return len(text.split())


def count_characters(text: str) -> int:
    """Count characters in text (excluding whitespace)."""
    return len(text.replace(" ", "").replace("\n", "").replace("\t", ""))


@router.post("/", response_model=ChapterResponse, status_code=status.HTTP_201_CREATED)
async def create_chapter(
    project_id: str,
    chapter_data: ChapterCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new chapter. Requires WRITE permission."""
    # Get project
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.tenant_id == current_user.tenant_id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check permission
    await require_project_permission(current_user, project, Permission.WRITE, db)
    
    # Calculate word and character counts
    word_count = count_words(chapter_data.content)
    character_count = count_characters(chapter_data.content)
    
    # Create chapter
    chapter = Chapter(
        project_id=project_id,
        title=chapter_data.title,
        content=chapter_data.content,
        order=chapter_data.order,
        is_complete=chapter_data.is_complete,
        word_count=word_count,
        character_count=character_count
    )
    
    db.add(chapter)
    await db.commit()
    await db.refresh(chapter)
    
    return chapter


@router.get("/", response_model=ChapterListResponse)
async def list_chapters(
    project_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """List all chapters in a project. Requires READ permission."""
    # Get project
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.tenant_id == current_user.tenant_id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check permission
    await require_project_permission(current_user, project, Permission.READ, db)
    
    # Get chapters ordered by order field
    result = await db.execute(
        select(Chapter).where(
            Chapter.project_id == project_id
        ).order_by(Chapter.order)
    )
    chapters = result.scalars().all()
    
    return ChapterListResponse(
        items=chapters,
        total=len(chapters)
    )


@router.get("/{chapter_id}", response_model=ChapterResponse)
async def get_chapter(
    project_id: str,
    chapter_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific chapter by ID. Requires READ permission."""
    # Get project
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.tenant_id == current_user.tenant_id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check permission
    await require_project_permission(current_user, project, Permission.READ, db)
    
    # Get chapter
    result = await db.execute(
        select(Chapter).where(
            Chapter.id == chapter_id,
            Chapter.project_id == project_id
        )
    )
    chapter = result.scalar_one_or_none()
    
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chapter not found"
        )
    
    return chapter


@router.put("/{chapter_id}", response_model=ChapterResponse)
async def update_chapter(
    project_id: str,
    chapter_id: str,
    chapter_data: ChapterUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a chapter. Requires WRITE permission."""
    # Get project
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.tenant_id == current_user.tenant_id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check permission
    await require_project_permission(current_user, project, Permission.WRITE, db)
    
    # Get chapter
    result = await db.execute(
        select(Chapter).where(
            Chapter.id == chapter_id,
            Chapter.project_id == project_id
        )
    )
    chapter = result.scalar_one_or_none()
    
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chapter not found"
        )
    
    # Update fields
    update_data = chapter_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "content" and value is not None:
            # Recalculate word and character counts when content changes
            chapter.word_count = count_words(value)
            chapter.character_count = count_characters(value)
        setattr(chapter, field, value)
    
    await db.commit()
    await db.refresh(chapter)
    
    return chapter


@router.delete("/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chapter(
    project_id: str,
    chapter_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a chapter. Requires WRITE permission."""
    # Get project
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.tenant_id == current_user.tenant_id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check permission
    await require_project_permission(current_user, project, Permission.WRITE, db)
    
    # Get chapter
    result = await db.execute(
        select(Chapter).where(
            Chapter.id == chapter_id,
            Chapter.project_id == project_id
        )
    )
    chapter = result.scalar_one_or_none()
    
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chapter not found"
        )
    
    await db.delete(chapter)
    await db.commit()
    
    return None


@router.post("/manuscript/upload", status_code=status.HTTP_200_OK)
async def upload_manuscript(
    project_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload a manuscript file (DOCX or TXT). Stores temporarily for parsing. Requires WRITE permission."""
    # Get project
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.tenant_id == current_user.tenant_id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check permission
    await require_project_permission(current_user, project, Permission.WRITE, db)
    
    # Validate file type
    allowed_extensions = ['.docx', '.doc', '.txt']
    file_ext = Path(file.filename).suffix.lower() if file.filename else ''
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}"
        )
    
    # Create temp directory for this project if it doesn't exist
    temp_dir = Path(tempfile.gettempdir()) / "khipu-manuscripts" / project_id
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    # Save uploaded file
    file_path = temp_dir / file.filename
    content = await file.read()
    file_path.write_bytes(content)
    
    return {
        "message": "File uploaded successfully",
        "filename": file.filename,
        "size": len(content)
    }


@router.post("/manuscript/parse", status_code=status.HTTP_200_OK)
async def parse_manuscript(
    project_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Parse uploaded manuscript and create chapters from detected structure. Requires WRITE permission."""
    # Get project
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.tenant_id == current_user.tenant_id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check permission
    await require_project_permission(current_user, project, Permission.WRITE, db)
    
    # Find the uploaded manuscript file
    temp_dir = Path(tempfile.gettempdir()) / "khipu-manuscripts" / project_id
    if not temp_dir.exists():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No manuscript file found. Please upload a file first."
        )
    
    # Find the most recent file
    files = list(temp_dir.glob("*"))
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No manuscript file found. Please upload a file first."
        )
    
    manuscript_file = max(files, key=lambda p: p.stat().st_mtime)
    
    # Parse the manuscript using the Python parser
    try:
        # Create temp output directory
        output_dir = temp_dir / "parsed"
        output_dir.mkdir(exist_ok=True)
        
        # Call the manuscript parser
        parser_script = Path(__file__).parent.parent.parent.parent / "py" / "ingest" / "manuscript_parser.py"
        
        if manuscript_file.suffix.lower() in ['.docx', '.doc']:
            cmd = [
                "python", str(parser_script),
                "--docx", str(manuscript_file),
                "--out-dir", str(output_dir)
            ]
        else:  # .txt
            cmd = [
                "python", str(parser_script),
                "--txt", str(manuscript_file),
                "--out-dir", str(output_dir)
            ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode != 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to parse manuscript: {result.stderr}"
            )
        
        # Read the generated chapters
        chapters_dir = output_dir / "chapters_txt"
        if not chapters_dir.exists():
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Parser did not generate chapter files"
            )
        
        # Delete existing chapters for this project
        result = await db.execute(
            select(Chapter).where(Chapter.project_id == project_id)
        )
        existing_chapters = result.scalars().all()
        for chapter in existing_chapters:
            await db.delete(chapter)
        
        # Create new chapters from parsed files
        chapter_files = sorted(chapters_dir.glob("ch*.txt"))
        chapters_created = 0
        
        for idx, chapter_file in enumerate(chapter_files):
            content = chapter_file.read_text(encoding='utf-8')
            title = f"Chapter {idx + 1}"  # Simple title, could be extracted from content
            
            # Extract title from first line if it looks like a title
            lines = content.strip().split('\n')
            if lines and len(lines[0]) < 100 and not lines[0].endswith('.'):
                title = lines[0].strip()
                content = '\n'.join(lines[1:]).strip()
            
            word_count = count_words(content)
            character_count = count_characters(content)
            
            chapter = Chapter(
                project_id=project_id,
                title=title,
                content=content,
                order=idx,
                is_complete=True,
                word_count=word_count,
                character_count=character_count
            )
            
            db.add(chapter)
            chapters_created += 1
        
        await db.commit()
        
        # Clean up temp files
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
        
        return {
            "message": "Manuscript parsed successfully",
            "chapters_detected": chapters_created
        }
        
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Manuscript parsing timed out"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error parsing manuscript: {str(e)}"
        )

