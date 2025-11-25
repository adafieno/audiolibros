# py/packaging/__init__.py
"""
Packaging module for Khipu Studio.

Handles creation of platform-specific audiobook packages from complete chapter audio files.
"""

from .manifest_generator import generate_universal_manifest

__all__ = ["generate_universal_manifest"]
