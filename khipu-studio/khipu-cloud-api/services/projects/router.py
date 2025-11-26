"""Projects Service Router - Placeholder"""
from fastapi import APIRouter

router = APIRouter()

@router.get("/")
async def projects_root():
    return {"message": "Projects service - TODO: Implement"}
