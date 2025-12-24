"""
Platform-specific packaging configurations and specifications.

Defines requirements, audio specs, and validation rules for each supported platform.
"""

from typing import Dict, List, Optional
from pydantic import BaseModel


class AudioSpecConfig(BaseModel):
    """Audio encoding specification for a platform."""
    codec: str
    bitrate_kbps: int
    sample_rate_hz: int
    channels: int  # 1=mono, 2=stereo
    
    
class ValidationRule(BaseModel):
    """A validation rule for package quality."""
    rule_id: str
    description: str
    severity: str  # 'error' or 'warning'
    

class PlatformConfig(BaseModel):
    """Complete configuration for a packaging platform."""
    platform_id: str
    display_name: str
    package_format: str  # 'm4b', 'zip', 'epub3'
    audio_spec: AudioSpecConfig
    
    # Requirements
    requires_isbn: bool
    requires_cover: bool
    min_cover_width: Optional[int] = None
    min_cover_height: Optional[int] = None
    
    # File size limits
    max_file_size_mb: Optional[int] = None
    max_chapter_duration_seconds: Optional[int] = None
    
    # Validation rules
    validation_rules: List[ValidationRule] = []
    
    # Special requirements (platform-specific notes)
    special_requirements: List[str] = []
    
    # Default enabled state
    enabled_by_default: bool = True


# Platform Specifications Database
PLATFORM_SPECS: Dict[str, PlatformConfig] = {
    "apple": PlatformConfig(
        platform_id="apple",
        display_name="Apple Books",
        package_format="m4b",
        audio_spec=AudioSpecConfig(
            codec="aac",
            bitrate_kbps=128,
            sample_rate_hz=44100,
            channels=1  # mono
        ),
        requires_isbn=False,
        requires_cover=True,
        min_cover_width=1400,
        min_cover_height=1400,
        max_file_size_mb=None,  # No explicit limit for M4B
        max_chapter_duration_seconds=None,
        validation_rules=[
            ValidationRule(
                rule_id="cover_size",
                description="Cover image must be at least 1400x1400 pixels",
                severity="error"
            ),
            ValidationRule(
                rule_id="chapter_markers",
                description="M4B must contain chapter markers",
                severity="error"
            ),
            ValidationRule(
                rule_id="audio_quality",
                description="Audio should be AAC 128kbps, 44.1kHz, mono",
                severity="warning"
            )
        ],
        special_requirements=[
            "Chapter markers are embedded in M4B container",
            "Cover art embedded in M4B file",
            "Recommended: Square cover art (1400x1400 or larger)"
        ]
    ),
    
    "google": PlatformConfig(
        platform_id="google",
        display_name="Google Play Books",
        package_format="zip",
        audio_spec=AudioSpecConfig(
            codec="mp3",
            bitrate_kbps=256,
            sample_rate_hz=44100,
            channels=2  # stereo
        ),
        requires_isbn=False,  # Can use GGKEY if no ISBN
        requires_cover=True,
        min_cover_width=None,  # No specific minimum stated
        min_cover_height=None,
        max_file_size_mb=None,
        max_chapter_duration_seconds=None,
        validation_rules=[
            ValidationRule(
                rule_id="mp3_format",
                description="Audio files must be MP3 format",
                severity="error"
            ),
            ValidationRule(
                rule_id="bitrate_check",
                description="MP3 bitrate should be 256kbps for optimal quality",
                severity="warning"
            ),
            ValidationRule(
                rule_id="ggkey_or_isbn",
                description="Either ISBN or GGKEY identifier required",
                severity="error"
            )
        ],
        special_requirements=[
            "ZIP contains individual MP3 files per chapter",
            "Use GGKEY if ISBN not available",
            "Cover image included in ZIP"
        ]
    ),
    
    "spotify": PlatformConfig(
        platform_id="spotify",
        display_name="Spotify Audiobooks",
        package_format="zip",
        audio_spec=AudioSpecConfig(
            codec="mp3",
            bitrate_kbps=256,
            sample_rate_hz=44100,
            channels=2  # stereo
        ),
        requires_isbn=True,
        requires_cover=True,
        min_cover_width=None,
        min_cover_height=None,
        max_file_size_mb=None,
        max_chapter_duration_seconds=7200,  # 2 hours max per file
        validation_rules=[
            ValidationRule(
                rule_id="chapter_duration",
                description="No single audio file can exceed 2 hours",
                severity="error"
            ),
            ValidationRule(
                rule_id="digital_voice_disclosure",
                description="Must include digital voice disclosure if AI-generated",
                severity="error"
            ),
            ValidationRule(
                rule_id="isbn_required",
                description="ISBN-13 required for Spotify",
                severity="error"
            )
        ],
        special_requirements=[
            "Maximum 2 hours per audio file",
            "Digital voice disclosure required for AI narration",
            "ISBN-13 mandatory"
        ]
    ),
    
    "acx": PlatformConfig(
        platform_id="acx",
        display_name="ACX/Audible",
        package_format="zip",
        audio_spec=AudioSpecConfig(
            codec="mp3",
            bitrate_kbps=192,
            sample_rate_hz=44100,
            channels=2  # stereo
        ),
        requires_isbn=False,
        requires_cover=True,
        min_cover_width=2400,
        min_cover_height=2400,
        max_file_size_mb=None,
        max_chapter_duration_seconds=None,
        validation_rules=[
            ValidationRule(
                rule_id="rms_level",
                description="RMS level must be between -23dB and -18dB",
                severity="error"
            ),
            ValidationRule(
                rule_id="peak_level",
                description="Peak level must not exceed -3dB",
                severity="error"
            ),
            ValidationRule(
                rule_id="noise_floor",
                description="Noise floor must be below -60dB",
                severity="error"
            ),
            ValidationRule(
                rule_id="format_spec",
                description="Must be MP3, 192kbps CBR, 44.1kHz, stereo",
                severity="error"
            ),
            ValidationRule(
                rule_id="cover_requirements",
                description="Cover must be 2400x2400 pixels, square, RGB, JPEG",
                severity="error"
            )
        ],
        special_requirements=[
            "Strict audio mastering requirements (RMS, peak, noise floor)",
            "ACX Check tool validation recommended",
            "Square cover art 2400x2400 required",
            "Opening and closing credits may be required"
        ]
    ),
    
    "kobo": PlatformConfig(
        platform_id="kobo",
        display_name="Kobo Audiobooks",
        package_format="epub3",
        audio_spec=AudioSpecConfig(
            codec="mp3",
            bitrate_kbps=192,
            sample_rate_hz=44100,
            channels=2  # stereo
        ),
        requires_isbn=True,
        requires_cover=True,
        min_cover_width=None,
        min_cover_height=None,
        max_file_size_mb=200,  # EPUB3 package limit
        max_chapter_duration_seconds=None,
        validation_rules=[
            ValidationRule(
                rule_id="epub3_structure",
                description="Must be valid EPUB3 with MediaOverlay",
                severity="error"
            ),
            ValidationRule(
                rule_id="package_size",
                description="Total EPUB3 package must not exceed 200MB",
                severity="error"
            ),
            ValidationRule(
                rule_id="media_overlay",
                description="SMIL files required for audio-text synchronization",
                severity="error"
            ),
            ValidationRule(
                rule_id="isbn_required",
                description="ISBN required for Kobo distribution",
                severity="error"
            )
        ],
        special_requirements=[
            "EPUB3 with MediaOverlay (audio-text sync)",
            "SMIL files for chapter synchronization",
            "200MB total package size limit",
            "ISBN mandatory"
        ]
    )
}


def get_platform_config(platform_id: str) -> Optional[PlatformConfig]:
    """Get configuration for a specific platform."""
    return PLATFORM_SPECS.get(platform_id)


def get_all_platforms() -> List[PlatformConfig]:
    """Get list of all supported platforms."""
    return list(PLATFORM_SPECS.values())


def get_enabled_platforms() -> List[PlatformConfig]:
    """Get list of platforms enabled by default."""
    return [p for p in PLATFORM_SPECS.values() if p.enabled_by_default]


def validate_platform_id(platform_id: str) -> bool:
    """Check if a platform ID is valid."""
    return platform_id in PLATFORM_SPECS


def get_platforms_by_format(package_format: str) -> List[PlatformConfig]:
    """Get all platforms that use a specific package format."""
    return [p for p in PLATFORM_SPECS.values() if p.package_format == package_format]


# Platform groupings for optimization
DEDUPLICATABLE_PLATFORMS = {
    "google_spotify": ["google", "spotify"],  # Can share same ZIP if specs match
}


def can_deduplicate(platform_id_1: str, platform_id_2: str) -> bool:
    """
    Check if two platforms can share the same package file.
    
    Currently, Google and Spotify can share the same ZIP+MP3 package
    if both use 256kbps audio spec.
    """
    for group_platforms in DEDUPLICATABLE_PLATFORMS.values():
        if platform_id_1 in group_platforms and platform_id_2 in group_platforms:
            # Check if audio specs match
            config1 = get_platform_config(platform_id_1)
            config2 = get_platform_config(platform_id_2)
            if config1 and config2:
                return (config1.audio_spec == config2.audio_spec and 
                        config1.package_format == config2.package_format)
    return False
