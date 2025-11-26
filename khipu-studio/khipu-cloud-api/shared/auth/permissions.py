"""Role-based access control utilities."""
from enum import Enum
from typing import List
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from shared.models import User, Project, ProjectMember


class UserRole(str, Enum):
    """User roles at tenant level."""
    ADMIN = "admin"  # Tenant admin - full access to all projects
    CREATOR = "creator"  # Can create projects and manage their own
    REVIEWER = "reviewer"  # Read-only access to assigned projects


class ProjectRole(str, Enum):
    """Roles within a specific project."""
    OWNER = "owner"  # Project owner (creator)
    CREATOR = "creator"  # Can edit project
    REVIEWER = "reviewer"  # Can review and annotate deliverables


class Permission(str, Enum):
    """Project-level permissions."""
    READ = "read"  # View project
    WRITE = "write"  # Edit project
    DELETE = "delete"  # Delete/archive project
    REVIEW = "review"  # Review deliverables
    ANNOTATE = "annotate"  # Add annotations/feedback
    APPROVE = "approve"  # Approve deliverables
    MANAGE_MEMBERS = "manage_members"  # Add/remove team members


# Role to permissions mapping
ROLE_PERMISSIONS = {
    ProjectRole.OWNER: [
        Permission.READ,
        Permission.WRITE,
        Permission.DELETE,
        Permission.REVIEW,
        Permission.ANNOTATE,
        Permission.APPROVE,
        Permission.MANAGE_MEMBERS,
    ],
    ProjectRole.CREATOR: [
        Permission.READ,
        Permission.WRITE,
        Permission.REVIEW,
        Permission.ANNOTATE,
        Permission.MANAGE_MEMBERS,
    ],
    ProjectRole.REVIEWER: [
        Permission.READ,
        Permission.REVIEW,
        Permission.ANNOTATE,
    ],
}


async def get_user_project_role(
    user: User,
    project: Project,
    db: AsyncSession
) -> ProjectRole:
    """
    Determine user's role in a project.
    
    Priority:
    1. Tenant admin -> Full access
    2. Project owner -> Owner role
    3. Project member -> Member's role
    4. None -> No access
    """
    # Tenant admins have full access
    if user.role == UserRole.ADMIN:
        return ProjectRole.OWNER
    
    # Project owner
    if str(project.owner_id) == str(user.id):
        return ProjectRole.OWNER
    
    # Check project membership
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == user.id
        )
    )
    member = result.scalar_one_or_none()
    
    if member:
        return ProjectRole(member.role)
    
    return None


async def check_project_permission(
    user: User,
    project: Project,
    required_permission: Permission,
    db: AsyncSession
) -> bool:
    """Check if user has required permission for a project."""
    role = await get_user_project_role(user, project, db)
    
    if role is None:
        return False
    
    # Get permissions for role
    role_perms = ROLE_PERMISSIONS.get(role, [])
    return required_permission in role_perms


async def require_project_permission(
    user: User,
    project: Project,
    required_permission: Permission,
    db: AsyncSession
):
    """Raise exception if user doesn't have required permission."""
    has_permission = await check_project_permission(user, project, required_permission, db)
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You don't have permission to perform this action on this project"
        )


def can_manage_tenant_users(user: User) -> bool:
    """Check if user can manage users within their tenant."""
    return user.role == UserRole.ADMIN


def require_tenant_admin(user: User):
    """Raise exception if user is not a tenant admin."""
    if not can_manage_tenant_users(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action requires tenant administrator privileges"
        )
