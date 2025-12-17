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
from services.actions.action_logger import log_action

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
    
    # Get plan completion status for each chapter
    from shared.models import ChapterPlan
    plan_result = await db.execute(
        select(ChapterPlan).where(
            ChapterPlan.project_id == project_id
        )
    )
    plans = {plan.chapter_id: plan for plan in plan_result.scalars().all()}
    
    # Add orchestration_complete status to chapters
    chapter_responses = []
    for chapter in chapters:
        chapter_dict = {
            'id': chapter.id,
            'project_id': chapter.project_id,
            'title': chapter.title,
            'content': chapter.content,
            'order': chapter.order,
            'chapter_type': chapter.chapter_type,
            'is_complete': chapter.is_complete,
            'word_count': chapter.word_count,
            'character_count': chapter.character_count,
            'created_at': chapter.created_at,
            'updated_at': chapter.updated_at,
            'orchestration_complete': plans.get(chapter.id).is_complete if chapter.id in plans else False
        }
        chapter_responses.append(chapter_dict)
    
    return ChapterListResponse(
        items=chapter_responses,
        total=len(chapter_responses)
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
    
    # Capture previous state
    previous_state = {}
    for field in update_data.keys():
        if hasattr(chapter, field):
            previous_state[field] = getattr(chapter, field)
    
    # Debug logging for content updates
    if "content" in update_data:
        print(f"[CHAPTER UPDATE] Updating chapter {chapter_id} content")
        print(f"[CHAPTER UPDATE] Old content length: {len(chapter.content) if chapter.content else 0}")
        print(f"[CHAPTER UPDATE] New content length: {len(update_data['content']) if update_data['content'] else 0}")
        print(f"[CHAPTER UPDATE] Contents are equal: {chapter.content == update_data['content']}")
        print(f"[CHAPTER UPDATE] Old first 100 chars: {repr(chapter.content[:100]) if chapter.content else 'None'}")
        print(f"[CHAPTER UPDATE] New first 100 chars: {repr(update_data['content'][:100]) if update_data['content'] else 'None'}")
    
    for field, value in update_data.items():
        if field == "content" and value is not None:
            # Force update by explicitly marking as modified
            chapter.content = value
            # Recalculate word and character counts when content changes
            chapter.word_count = count_words(value)
            chapter.character_count = count_characters(value)
        else:
            setattr(chapter, field, value)
    
    # Force flush to database
    await db.flush()
    await db.commit()
    await db.refresh(chapter)
    
    # Verify the update
    if "content" in update_data:
        print(f"[CHAPTER UPDATE] After commit - content length: {len(chapter.content) if chapter.content else 0}")
        print(f"[CHAPTER UPDATE] After commit first 100 chars: {repr(chapter.content[:100]) if chapter.content else 'None'}")
    
    # Check what actually changed
    actually_changed = {}
    for field, new_value in update_data.items():
        old_value = previous_state.get(field)
        if old_value != new_value:
            actually_changed[field] = new_value
    
    # Only log if something changed
    if actually_changed:
        from uuid import UUID
        action_desc = f"Updated chapter '{chapter.title}': {list(actually_changed.keys())}"
        await log_action(
            db=db,
            user=current_user,
            project_id=UUID(project_id),
            action_type="chapter_update",
            action_description=action_desc,
            resource_type="chapter",
            resource_id=UUID(chapter_id),
            previous_state={k: previous_state[k] for k in actually_changed.keys()},
            new_state=actually_changed
        )
        print(f"[CHAPTER UPDATE] Action logged for undo/redo: {action_desc}")
    else:
        print(f"[CHAPTER UPDATE] No actual changes detected, skipping action log")
    
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
    print(f"[UPLOAD] Starting upload for project {project_id}, file: {file.filename}")
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
    print(f"[UPLOAD] File saved successfully to {file_path}")
    
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
    print(f"[PARSE] Starting parse for project {project_id}")
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
        
        # Call the manuscript parser script directly
        import sys
        python_executable = sys.executable
        
        # Get repo root and parser script path
        # In Docker, /workspace is the parent directory, /app is khipu-cloud-api
        repo_root = Path("/workspace") if Path("/workspace/py").exists() else Path(__file__).parent.parent.parent.parent
        parser_script = repo_root / "py" / "ingest" / "manuscript_parser.py"
        
        print(f"[PARSE] __file__ = {__file__}")
        print(f"[PARSE] repo_root = {repo_root}")
        print(f"[PARSE] parser_script = {parser_script}")
        print(f"[PARSE] parser_script exists? {parser_script.exists()}")
        
        # Prepare output paths
        chapters_dir = output_dir / "chapters_txt"
        structure_out = output_dir / "narrative.structure.json"
        chapters_dir.mkdir(exist_ok=True)
        
        cmd = [
            python_executable, str(parser_script),
            "--in", str(manuscript_file),
            "--out-chapters", str(chapters_dir),
            "--out-structure", str(structure_out),
            "--min-words", "20"
        ]
        
        print(f"[PARSE] Running command: {' '.join(cmd)}")
        print(f"[PARSE] Working directory: {repo_root}")
        
        # Add repo root to PYTHONPATH so py.ingest module can be found
        import os
        env = os.environ.copy()
        env['PYTHONPATH'] = str(repo_root)
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60, cwd=str(repo_root), env=env)
        
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
        
        # Read structure.json to get chapter metadata including chapter_type
        structure_file = output_dir / "structure.json"
        structure_data = {}
        if structure_file.exists():
            structure_content = structure_file.read_text(encoding='utf-8')
            print(f"[PARSE] structure.json content: {structure_content[:500]}")
            structure_data = json.loads(structure_content)
            print(f"[PARSE] Parsed structure data keys: {structure_data.keys()}")
            if 'chapters' in structure_data:
                print(f"[PARSE] Chapters in structure: {list(structure_data['chapters'].keys())[:5]}")
        else:
            print(f"[PARSE] structure.json not found at {structure_file}")
        
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
            chapter_type = "chapter"  # Default type
            
            # Get metadata from structure.json if available
            if structure_data and 'chapters' in structure_data:
                chapter_info = structure_data['chapters'].get(str(idx), {})
                print(f"[PARSE] Chapter {idx} info: {chapter_info}")
                if 'title' in chapter_info:
                    title = chapter_info['title']
                if 'chapterType' in chapter_info:
                    chapter_type = chapter_info['chapterType']
                    print(f"[PARSE] Setting chapter {idx} type to: {chapter_type}")
            else:
                # Fallback: Extract title from first line if it looks like a title
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
                chapter_type=chapter_type,
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
        import traceback
        error_details = traceback.format_exc()
        print(f"ERROR parsing manuscript: {error_details}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error parsing manuscript: {str(e)}"
        )

