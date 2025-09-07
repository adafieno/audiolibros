# py/characters/__init__.py
"""
Character detection and management module for Khipu Studio.

This module provides character detection from manuscripts and voice assignment
capabilities, integrating with the existing dossier and SSML systems.
"""

from .detect_characters import detect_characters_from_manuscript

__all__ = ["detect_characters_from_manuscript"]
