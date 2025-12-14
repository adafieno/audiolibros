"""
Character models for database
"""
from typing import Optional
from pydantic import BaseModel


class CharacterTraits(BaseModel):
    """Character traits"""
    gender: Optional[str] = None  # "M", "F", "N"
    age: Optional[str] = None  # "child", "teen", "adult", "elderly"
    personality: Optional[list[str]] = None
    speaking_style: Optional[list[str]] = None


class VoiceAssignment(BaseModel):
    """Voice assignment for a character"""
    voiceId: str
    style: Optional[str] = None
    styledegree: Optional[float] = 1.0
    rate_pct: Optional[int] = 0
    pitch_pct: Optional[int] = 0
    method: Optional[str] = "manual"  # "manual" or "llm_auto"


class Character(BaseModel):
    """Character model"""
    id: str
    name: str
    description: Optional[str] = None
    frequency: Optional[float] = 0.0
    traits: Optional[CharacterTraits] = None
    quotes: Optional[list[str]] = None
    isNarrator: Optional[bool] = False
    isMainCharacter: Optional[bool] = False
    voiceAssignment: Optional[VoiceAssignment] = None
