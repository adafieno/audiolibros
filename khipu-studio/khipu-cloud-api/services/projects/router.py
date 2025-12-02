"""Projects Service Router."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from uuid import UUID  # noqa: F401 (may be used elsewhere or kept for consistency)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from shared.db.database import get_db
from shared.models import Project, User, ProjectMember
from shared.schemas.projects import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectListResponse,
)
from shared.schemas.project_members import (
    ProjectMemberAdd,
    
    ProjectMemberResponse,
)
from shared.auth import get_current_active_user
from shared.auth.permissions import (
    Permission,
    UserRole,
    require_project_permission,
    
    ROLE_PERMISSIONS,
)

router = APIRouter()


class SuggestIPARequest(BaseModel):
    word: str


class SuggestIPAResponse(BaseModel):
    success: bool
    ipa: Optional[str] = None
    error: Optional[str] = None
    examples: Optional[list[str]] = None
    source: Optional[str] = None
    error_code: Optional[str] = None


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new project."""
    project = Project(
        tenant_id=current_user.tenant_id,
        owner_id=current_user.id,
        title=project_data.title,
        subtitle=project_data.subtitle,
        authors=project_data.authors or [],
        narrators=project_data.narrators or [],
        translators=project_data.translators or [],
        adaptors=project_data.adaptors or [],
        language=project_data.language,
        description=project_data.description,
        publisher=project_data.publisher,
        publish_date=project_data.publish_date,
        isbn=project_data.isbn,
        status="draft",
        workflow_completed={},
        settings={}
    )
    
    db.add(project)
    await db.commit()
    await db.refresh(project)
    
    return project


@router.get("/", response_model=ProjectListResponse)
async def list_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    show_archived: bool = Query(False, description="Include archived projects"),
    archived_only: bool = Query(False, description="Show only archived projects"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List projects accessible to the current user.
    
    - **Tenant admins** see all projects in their tenant
    - **Creators** see projects they own or are members of
    - **Reviewers** see projects they are assigned to
    
    By default, archived projects are excluded unless show_archived or archived_only is True.
    """
    # Base query for tenant
    if current_user.role == UserRole.ADMIN:
        # Admins see all projects in tenant
        query = select(Project).where(Project.tenant_id == current_user.tenant_id)
    else:
        # Non-admins see only their projects or projects they're members of
        member_subquery = select(ProjectMember.project_id).where(
            ProjectMember.user_id == current_user.id
        )
        query = select(Project).where(
            Project.tenant_id == current_user.tenant_id,
            or_(
                Project.owner_id == current_user.id,
                Project.id.in_(member_subquery)
            )
        )
    
    # Apply filters
    if status_filter:
        query = query.where(Project.status == status_filter)
    
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                Project.title.ilike(search_pattern),
                Project.subtitle.ilike(search_pattern),
                Project.description.ilike(search_pattern)
            )
        )
    
    # Handle archived filter
    if archived_only:
        # Show only archived projects
        query = query.where(Project.archived_at.isnot(None))
    elif not show_archived:
        # Default: exclude archived projects
        query = query.where(Project.archived_at.is_(None))
    # If show_archived is True, no filter (show all)
    
    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # Apply pagination
    query = query.order_by(Project.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    # Execute query
    result = await db.execute(query)
    projects = result.scalars().all()
    
    # Calculate pages
    pages = (total + page_size - 1) // page_size if total > 0 else 0
    
    return ProjectListResponse(
        items=projects,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific project by ID. Requires READ permission."""
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
    
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    project_data: ProjectUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a project. Requires WRITE permission."""
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
    
    # Archived projects are read-only (except for admins who can unarchive)
    if project.archived_at and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify archived projects. Contact an admin to restore."
        )
    
    update_data = project_data.model_dump(exclude_unset=True)
    
    # DEBUG: Log update data
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[UPDATE PROJECT] Received update_data: {update_data}")
    logger.info(f"[UPDATE PROJECT] Current project narrators: {project.narrators}")
    
    # Status validation logic
    if 'status' in update_data:
        new_status = update_data['status']
        current_status = project.status
        workflow = update_data.get('workflow_completed', project.workflow_completed) or {}
        
        # Cannot set status back to 'draft' via UI
        if new_status == 'draft':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot set status to 'draft' manually"
            )
        
        # 'completed' requires all workflow steps to be completed
        if new_status == 'completed':
            required_steps = ['project', 'manuscript', 'casting', 'characters', 'planning', 'voice', 'export']
            missing_steps = [step for step in required_steps if not workflow.get(step)]
            if missing_steps:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot mark as completed. Missing workflow steps: {', '.join(missing_steps)}"
                )
        
        # 'published' requires status to be 'completed' first
        if new_status == 'published' and current_status not in ['completed', 'published']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project must be 'completed' before it can be published"
            )
        
        # Set completed_at timestamp when marking as completed
        if new_status == 'completed' and current_status != 'completed':
            from datetime import datetime
            project.completed_at = datetime.utcnow()
    
    # Handle archiving
    if 'status' in update_data and update_data['status'] == 'archived':
        from datetime import datetime
        project.archived_at = datetime.utcnow()
        update_data.pop('status')  # Don't update status field, use archived_at instead
    
    # Auto-transition to 'in_progress' if currently 'draft' and any field is being updated
    # (except workflow_completed or settings which don't constitute "editing")
    if project.status == 'draft' and 'status' not in update_data:
        # Check if any content fields are being updated
        content_fields = ['title', 'subtitle', 'authors', 'narrators', 'translators', 
                         'adaptors', 'language', 'description', 'publisher', 'publish_date', 'isbn']
        if any(field in update_data for field in content_fields):
            project.status = 'in_progress'
    
    # Update fields
    for field, value in update_data.items():
        setattr(project, field, value)
    
    # DEBUG: Log after update
    logger.info(f"[UPDATE PROJECT] After setattr, project narrators: {project.narrators}")
    
    await db.commit()
    await db.refresh(project)
    
    # DEBUG: Log after commit
    logger.info(f"[UPDATE PROJECT] After commit/refresh, project narrators: {project.narrators}")
    
    return project


@router.post("/{project_id}/unarchive", response_model=ProjectResponse)
async def unarchive_project(
    project_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Unarchive a project and set status to 'in_progress'.
    Only admins can unarchive projects.
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can unarchive projects"
        )
    
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
    
    if not project.archived_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project is not archived"
        )
    
    # Unarchive and set status to in_progress
    project.archived_at = None
    project.status = 'in_progress'
    
    await db.commit()
    await db.refresh(project)
    
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete (archive) a project. Requires DELETE permission."""
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
    await require_project_permission(current_user, project, Permission.DELETE, db)
    
    # Soft delete by setting archived_at
    from datetime import datetime
    project.archived_at = datetime.utcnow()
    
    await db.commit()
    
    return None


# ==================== Project Team Management ====================

@router.post("/{project_id}/members", response_model=ProjectMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_project_member(
    project_id: str,
    member_data: ProjectMemberAdd,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Add a member to a project. Requires MANAGE_MEMBERS permission.
    
    - **Tenant admins** can add anyone
    - **Project owners** and **creators** can add members
    """
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
    await require_project_permission(current_user, project, Permission.MANAGE_MEMBERS, db)
    
    # Verify user exists and is in same tenant
    result = await db.execute(
        select(User).where(
            User.id == member_data.user_id,
            User.tenant_id == current_user.tenant_id
        )
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found in your tenant"
        )
    
    # Check if already a member
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == member_data.user_id
        )
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already a member of this project"
        )
    
    # Get permissions for role
    permissions = member_data.permissions
    if not permissions:
        # Default permissions based on role
        from shared.auth.permissions import ProjectRole
        role_enum = ProjectRole(member_data.role)
        permissions = [p.value for p in ROLE_PERMISSIONS.get(role_enum, [])]
    
    # Create member
    member = ProjectMember(
        project_id=project_id,
        user_id=member_data.user_id,
        role=member_data.role,
        permissions=permissions,
        added_by=current_user.id
    )
    
    db.add(member)
    await db.commit()
    await db.refresh(member)
    
    # Load user details for response
    await db.refresh(member, ["user"])
    
    return ProjectMemberResponse(
        id=str(member.id),
        project_id=str(member.project_id),
        user_id=str(member.user_id),
        role=member.role,
        permissions=member.permissions,
        added_at=member.added_at,
        added_by=str(member.added_by) if member.added_by else None,
        user_email=user.email,
        user_name=user.full_name
    )


@router.get("/{project_id}/members", response_model=list[ProjectMemberResponse])
async def list_project_members(
    project_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """List all members of a project. Requires READ permission."""
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
    
    # Get members with user details
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id
        ).options(selectinload(ProjectMember.user))
    )
    members = result.scalars().all()
    
    return [
        ProjectMemberResponse(
            id=str(m.id),
            project_id=str(m.project_id),
            user_id=str(m.user_id),
            role=m.role,
            permissions=m.permissions,
            added_at=m.added_at,
            added_by=str(m.added_by) if m.added_by else None,
            user_email=m.user.email if m.user else None,
            user_name=m.user.full_name if m.user else None
        )
        for m in members
    ]


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_member(
    project_id: str,
    user_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove a member from a project. Requires MANAGE_MEMBERS permission."""
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
    await require_project_permission(current_user, project, Permission.MANAGE_MEMBERS, db)
    
    # Get member
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id
        )
    )
    member = result.scalar_one_or_none()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a member of this project"
        )
    
    await db.delete(member)
    await db.commit()
    
    return None


@router.post("/{project_id}/suggest-ipa", response_model=SuggestIPAResponse)
async def suggest_ipa(
    project_id: str,
    request: SuggestIPARequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Suggest IPA transcription for a word using the project's language and LLM."""
    # Get project
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check permission (at least read access)
    await require_project_permission(current_user, project, Permission.READ, db)
    
    # Get word and project settings
    word = request.word.strip()
    if not word:
        return SuggestIPAResponse(success=False, error="Word is required")
    
    settings = project.settings or {}
    pronunciation_map = settings.get("pronunciationMap", {})
    language = project.language or "en-US"

    # Validate settings structure for OpenAI credentials early
    creds_section = (
        settings.get("creds", {})
        .get("llm", {})
        .get("openai", {})
        if isinstance(settings, dict)
        else {}
    )
    if not (isinstance(creds_section, dict) and creds_section.get("apiKey")):
        return SuggestIPAResponse(
            success=False,
            error=(
                "OpenAI API key missing in project settings. Expected at "
                "creds.llm.openai.apiKey. Update Project Properties (LLM credentials)."
            ),
            source="config",
            error_code="MissingOpenAIKey"
        )
    
    # Check if word already exists in pronunciation map
    if word in pronunciation_map:
        existing_ipa = pronunciation_map[word]
        if existing_ipa:
            return SuggestIPAResponse(
                success=True,
                ipa=existing_ipa,
                source="project"
            )
    
    # LLM-first design: skip local tables/wordlists and go straight to LLM

    # LLM-based IPA suggestion (OpenAI-first; model and key from project settings)
    try:
                from services.llm_client import fetch_ipa
                print(f"[IPA-LLM] Attempting LLM for word: {word}")
                ipa, err, err_code = await fetch_ipa(word, language, settings)
                if ipa:
                    return SuggestIPAResponse(success=True, ipa=ipa, source="llm")
                return SuggestIPAResponse(success=False, error=err or "IPA not generated", source="llm", error_code=err_code)
    except Exception as e:
        import traceback
        # Try to classify OpenAI error for clearer UX
        error_code = e.__class__.__name__
        reason = "LLM call failed; please check server logs."
        debug_detail = None
        try:
            from openai import APIConnectionError, AuthenticationError, RateLimitError, BadRequestError
            if isinstance(e, AuthenticationError):
                reason = "Azure OpenAI authentication failed. Check API key and endpoint."
            elif isinstance(e, APIConnectionError):
                reason = "Cannot reach Azure OpenAI endpoint. Check endpoint URL/network."
            elif isinstance(e, BadRequestError):
                reason = "Azure OpenAI request invalid. Verify deployment name and API version."
            elif isinstance(e, RateLimitError):
                reason = "Azure OpenAI rate limited. Please retry shortly."
        except Exception:
            pass
        try:
            from shared.config import Settings as _S
            if _S().DEBUG:
                debug_detail = str(e)
        except Exception:
            pass
        print(f"LLM IPA suggestion error [{error_code}]: {e}")
        print(traceback.format_exc())
        return SuggestIPAResponse(
            success=False,
            error=(reason + (f" Detail: {debug_detail}" if debug_detail else "")),
            source="llm",
            error_code=error_code
        )
    
    # Unreachable with returns above; keep for safety
    # If we get here, something unexpected happened
    return SuggestIPAResponse(
        success=False,
        error=f"IPA not found for '{word}'. Please enter the IPA notation manually in the field above.",
        source="unknown"
    )
