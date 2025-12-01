"""Projects Service Router."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
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
    ProjectMemberUpdate,
    ProjectMemberResponse,
)
from shared.auth import get_current_active_user
from shared.auth.permissions import (
    Permission,
    UserRole,
    require_project_permission,
    require_tenant_admin,
    get_user_project_role,
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
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List projects accessible to the current user.
    
    - **Tenant admins** see all projects in their tenant
    - **Creators** see projects they own or are members of
    - **Reviewers** see projects they are assigned to
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
    
    # Only show non-archived by default
    query = query.where(Project.archived_at.is_(None))
    
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
    
    # Update fields
    update_data = project_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)
    
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
    print(f"[IPA] suggest_ipa called for project {project_id}, word: {request.word}")
    
    # TEMPORARY: Return test response to verify endpoint works
    return SuggestIPAResponse(
        success=True,
        ipa="TEST-IPA",
        source="test",
        error=None
    )
    
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
    
    print(f"[IPA] Project language: {language}")
    print(f"[IPA] Existing pronunciation map: {pronunciation_map}")
    
    # Check if word already exists in pronunciation map
    if word in pronunciation_map:
        existing_ipa = pronunciation_map[word]
        if existing_ipa:
            return SuggestIPAResponse(
                success=True,
                ipa=existing_ipa,
                source="project"
            )
    
    # Try to get IPA from local table first
    import json
    from pathlib import Path
    
    try:
        # Load IPA tables
        # router.py is in khipu-cloud-api/services/projects/
        # We need to go up to khipu-studio root, then into py/resources
        resources_dir = Path(__file__).resolve().parents[3] / "py" / "resources"
        default_table_path = resources_dir / "ipa_table.json"
        table = {}
        
        if default_table_path.exists():
            table = json.loads(default_table_path.read_text(encoding="utf-8") or "{}")
        else:
            print(f"IPA table not found at: {default_table_path}")
            print(f"Router file location: {Path(__file__).resolve()}")
            print(f"Resources dir: {resources_dir}")
        
        # Try language-specific tables
        if language:
            lang_code = language.split("-")[0] if "-" in language else language
            lang_table_path = resources_dir / f"ipa_table.{lang_code}.json"
            if lang_table_path.exists():
                lang_table = json.loads(lang_table_path.read_text(encoding="utf-8") or "{}")
                table.update(lang_table)
        
        # Check if word exists in table
        word_lower = word.lower()
        print(f"[IPA] Checking table for word: {word_lower}")
        print(f"[IPA] Table has {len(table)} entries")
        print(f"[IPA] Word in table: {word_lower in table}")
        
        if word_lower in table:
            entry = table[word_lower]
            print(f"[IPA] Found entry: {entry}")
            if isinstance(entry, str):
                ipa_result = entry
                if ipa_result:  # Make sure IPA is not empty
                    print(f"[IPA] Returning string IPA: {ipa_result}")
                    return SuggestIPAResponse(
                        success=True,
                        ipa=ipa_result,
                        source="table"
                    )
            elif isinstance(entry, dict):
                ipa_result = entry.get("ipa", "")
                if ipa_result:  # Make sure IPA is not empty
                    print(f"[IPA] Returning dict IPA: {ipa_result}")
                    return SuggestIPAResponse(
                        success=True,
                        ipa=ipa_result,
                        examples=entry.get("examples"),
                        source="table"
                    )
    except Exception as e:
        # If table lookup fails, continue to LLM
        import traceback
        print(f"Table lookup error: {e}")
        print(traceback.format_exc())
    
    # LLM-based IPA suggestion
    try:
        from openai import AsyncAzureOpenAI
        from shared.config import Settings
        
        config = Settings()
        
        # Get LLM configuration from project settings
        llm_settings = settings.get("llm", {})
        llm_engine = llm_settings.get("engine", {})
        llm_model = llm_engine.get("model", "gpt-4o")
        
        # Build system prompt with IPA rules from table if available
        rules = ""
        if table:
            keys = sorted(list(table.keys()), key=lambda k: -len(k))
            lines = []
            for k in keys[:50]:  # Limit to first 50 rules to keep prompt manageable
                v = table.get(k)
                ipa_v = None
                if isinstance(v, str):
                    ipa_v = v
                elif isinstance(v, dict):
                    ipa_v = v.get("ipa")
                if ipa_v:
                    lines.append(f"{k} -> {ipa_v}")
            if lines:
                rules = "Grapheme to IPA rules:\n" + "\n".join(lines)
        
        system_message = (
            "You are a concise expert phonetics assistant. Given a single word "
            "and an optional language/locale, respond with only the IPA "
            "transcription for that word. Do NOT include explanations, markup, "
            "or additional text—only the IPA characters. If unsure, return "
            "an empty string. Use the IPA standard for the language when possible."
        )
        
        user_message = (
            f"Provide the IPA transcription (only the IPA) for the single word: "
            f'"{word}". '
            f"Book locale: {language}. "
            f"If book locale is empty, use locale inferred from the word. "
            f"Respond with a single short line containing only the IPA. "
            f"Do not include explanations or extra text."
        )
        
        messages = []
        if rules:
            messages.append({"role": "system", "content": rules})
        messages.append({"role": "system", "content": system_message})
        messages.append({"role": "user", "content": user_message})
        
        # Create Azure OpenAI client
        client = AsyncAzureOpenAI(
            api_version=config.AZURE_OPENAI_API_VERSION,
            azure_endpoint=config.AZURE_OPENAI_ENDPOINT,
            api_key=config.AZURE_OPENAI_API_KEY
        )
        
        # Call LLM
        response = await client.chat.completions.create(
            model=llm_model,
            messages=messages,
            temperature=0.0,
            max_tokens=80
        )
        
        # Extract IPA from response
        raw_ipa = response.choices[0].message.content.strip() if response.choices else ""
        
        # Clean up IPA: remove slashes, brackets, quotes
        import re
        ipa = raw_ipa
        if ipa.startswith("/") and ipa.endswith("/") and len(ipa) > 2:
            ipa = ipa[1:-1].strip()
        elif ipa.startswith("[") and ipa.endswith("]") and len(ipa) > 2:
            ipa = ipa[1:-1].strip()
        
        # Try to find IPA between slashes
        match = re.search(r"/([^/]+)/", ipa)
        if match:
            ipa = match.group(1).strip()
        
        # Remove quotes and extra whitespace
        ipa = ipa.strip().strip('"').strip("'").strip()
        
        if ipa:
            return SuggestIPAResponse(
                success=True,
                ipa=ipa,
                source="llm"
            )
    except Exception as e:
        import traceback
        print(f"LLM IPA suggestion error: {e}")
        print(traceback.format_exc())
        # Fall through to error response
    
    # If we get here, both table and LLM failed
    return SuggestIPAResponse(
        success=False,
        error=f"IPA not found for '{word}'. Please enter the IPA notation manually in the field above."
    )
