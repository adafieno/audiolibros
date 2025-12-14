"""
Character API schemas
"""
from typing import Optional
from pydantic import BaseModel
from .models import CharacterTraits, VoiceAssignment


class CharacterCreateRequest(BaseModel):
    """Request to create a new character"""
    name: str = "New Character"
    description: Optional[str] = None
    traits: Optional[CharacterTraits] = None


class CharacterUpdateRequest(BaseModel):
    """Request to update a character"""
    name: Optional[str] = None
    description: Optional[str] = None
    frequency: Optional[float] = None
    traits: Optional[CharacterTraits] = None
    quotes: Optional[list[str]] = None
    isNarrator: Optional[bool] = None
    isMainCharacter: Optional[bool] = None
    voiceAssignment: Optional[VoiceAssignment] = None


class CharacterResponse(BaseModel):
    """Character response"""
    id: str
    name: str
    description: Optional[str] = None
    frequency: Optional[float] = 0.0
    traits: Optional[CharacterTraits] = None
    quotes: Optional[list[str]] = None
    isNarrator: Optional[bool] = False
    isMainCharacter: Optional[bool] = False
    voiceAssignment: Optional[VoiceAssignment] = None
