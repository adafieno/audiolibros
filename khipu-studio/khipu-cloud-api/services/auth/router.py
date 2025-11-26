"""Authentication Service Router - Placeholder"""
from fastapi import APIRouter

router = APIRouter()

@router.get("/")
async def auth_root():
    return {"message": "Auth service - TODO: Implement"}
