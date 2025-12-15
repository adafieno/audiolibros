"""Planning/Orchestration API Router."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.database import get_db
from shared.models import User
from shared.auth import get_current_active_user

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint for planning service."""
    return {"status": "ok", "service": "planning"}
