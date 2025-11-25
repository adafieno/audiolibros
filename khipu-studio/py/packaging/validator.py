#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Package Validator

Validates generated audiobook packages against platform specifications.
Checks technical audio specs, metadata completeness, file structure, etc.
"""

from __future__ import annotations
from pathlib import Path
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict
import subprocess
import json


@dataclass
class ValidationIssue:
    """Single validation issue."""
    severity: str  # 'error', 'warning', 'info'
    category: str  # 'audio', 'metadata', 'structure', 'spec'
    message: str
    details: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ValidationResult:
    """Result of package validation."""
    valid: bool  # Overall pass/fail
    platform: str
    package_path: str
    issues: List[ValidationIssue]
    specs: Dict[str, Any]  # Detected specs
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'valid': self.valid,
            'platform': self.platform,
            'packagePath': self.package_path,
            'issues': [issue.to_dict() for issue in self.issues],
            'specs': self.specs
        }
    
    @property
    def has_errors(self) -> bool:
        return any(issue.severity == 'error' for issue in self.issues)
    
    @property
    def has_warnings(self) -> bool:
        return any(issue.severity == 'warning' for issue in self.issues)


def _probe_audio_with_ffprobe(file_path: Path) -> Optional[Dict[str, Any]]:
    """
    Use ffprobe to extract audio technical specs.
    Returns dict with: codec, bitrate, sampleRate, channels, duration, etc.
    """
    if not file_path.exists():
        return None
    
    try:
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-show_format',
            '-show_streams',
            '-of', 'json',
            str(file_path)
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True
        )
        
        data = json.loads(result.stdout)
        
        # Extract audio stream info
        audio_streams = [s for s in data.get('streams', []) if s.get('codec_type') == 'audio']
        if not audio_streams:
            return None
        
        stream = audio_streams[0]
        format_info = data.get('format', {})
        
        # Parse bitrate (can be in stream or format)
        bitrate_str = stream.get('bit_rate') or format_info.get('bit_rate', '0')
        bitrate_bps = int(bitrate_str)
        bitrate_kbps = bitrate_bps // 1000
        
        return {
            'codec': stream.get('codec_name', 'unknown'),
            'bitrate': bitrate_kbps,  # in kbps
            'sampleRate': int(stream.get('sample_rate', 0)),
            'channels': int(stream.get('channels', 0)),
            'duration': float(format_info.get('duration', 0)),
            'fileSize': int(format_info.get('size', 0)),
            'format': format_info.get('format_name', 'unknown')
        }
    
    except Exception as e:
        print(f"ffprobe failed: {e}")
        return None


def _check_m4b_chapters(file_path: Path) -> Optional[List[Dict[str, Any]]]:
    """Extract chapter information from M4B file."""
    try:
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-show_chapters',
            '-of', 'json',
            str(file_path)
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True
        )
        
        data = json.loads(result.stdout)
        chapters = data.get('chapters', [])
        
        return [
            {
                'title': ch.get('tags', {}).get('title', f"Chapter {i+1}"),
                'start': float(ch.get('start_time', 0)),
                'end': float(ch.get('end_time', 0))
            }
            for i, ch in enumerate(chapters)
        ]
    
    except Exception:
        return None


def _check_m4b_metadata(file_path: Path) -> Optional[Dict[str, str]]:
    """Extract ID3/metadata tags from M4B file."""
    try:
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-show_format',
            '-of', 'json',
            str(file_path)
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True
        )
        
        data = json.loads(result.stdout)
        tags = data.get('format', {}).get('tags', {})
        
        return {
            'title': tags.get('title', tags.get('TITLE', '')),
            'artist': tags.get('artist', tags.get('ARTIST', '')),
            'album': tags.get('album', tags.get('ALBUM', '')),
            'composer': tags.get('composer', tags.get('COMPOSER', '')),
            'comment': tags.get('comment', tags.get('COMMENT', '')),
            'genre': tags.get('genre', tags.get('GENRE', '')),
            'date': tags.get('date', tags.get('DATE', ''))
        }
    
    except Exception:
        return None


def validate_m4b_package(package_path: str, expected_specs: Optional[Dict[str, Any]] = None) -> ValidationResult:
    """
    Validate M4B package for Apple Books.
    
    Checks:
    - Audio codec (AAC required)
    - Bitrate (64-256 kbps)
    - Sample rate (44.1 or 48 kHz)
    - Channels (1 or 2)
    - Metadata completeness
    - Chapter markers present
    - File size reasonable
    """
    path = Path(package_path)
    issues: List[ValidationIssue] = []
    specs: Dict[str, Any] = {}
    
    # Check file exists
    if not path.exists():
        issues.append(ValidationIssue(
            severity='error',
            category='structure',
            message='Package file not found',
            details=f'File does not exist: {package_path}'
        ))
        return ValidationResult(
            valid=False,
            platform='apple',
            package_path=package_path,
            issues=issues,
            specs=specs
        )
    
    # Probe audio specs
    audio_info = _probe_audio_with_ffprobe(path)
    if not audio_info:
        issues.append(ValidationIssue(
            severity='error',
            category='audio',
            message='Failed to read audio file',
            details='ffprobe could not analyze the file'
        ))
        return ValidationResult(
            valid=False,
            platform='apple',
            package_path=package_path,
            issues=issues,
            specs=specs
        )
    
    specs = audio_info.copy()
    
    # Validate codec (must be AAC)
    if audio_info['codec'] != 'aac':
        issues.append(ValidationIssue(
            severity='error',
            category='spec',
            message=f"Invalid codec: {audio_info['codec']}",
            details='Apple Books requires AAC codec'
        ))
    
    # Validate bitrate (64-256 kbps recommended)
    bitrate = audio_info['bitrate']
    if bitrate < 64:
        issues.append(ValidationIssue(
            severity='warning',
            category='spec',
            message=f'Low bitrate: {bitrate} kbps',
            details='Apple Books recommends 64-128 kbps for mono, 96-256 kbps for stereo'
        ))
    elif bitrate > 256:
        issues.append(ValidationIssue(
            severity='warning',
            category='spec',
            message=f'High bitrate: {bitrate} kbps',
            details='Consider reducing bitrate to decrease file size'
        ))
    
    # Validate sample rate (44.1 or 48 kHz)
    sample_rate = audio_info['sampleRate']
    if sample_rate not in [44100, 48000]:
        issues.append(ValidationIssue(
            severity='warning',
            category='spec',
            message=f'Non-standard sample rate: {sample_rate} Hz',
            details='Apple Books recommends 44100 Hz or 48000 Hz'
        ))
    
    # Validate channels (1 or 2)
    channels = audio_info['channels']
    if channels not in [1, 2]:
        issues.append(ValidationIssue(
            severity='error',
            category='spec',
            message=f'Invalid channel count: {channels}',
            details='Apple Books requires mono (1) or stereo (2)'
        ))
    
    # Check file size (warn if > 4GB)
    file_size_gb = audio_info['fileSize'] / (1024 ** 3)
    specs['fileSizeGB'] = round(file_size_gb, 2)
    if file_size_gb > 4:
        issues.append(ValidationIssue(
            severity='warning',
            category='spec',
            message=f'Large file size: {file_size_gb:.1f} GB',
            details='Consider reducing bitrate or splitting into volumes'
        ))
    
    # Check duration (warn if > 24 hours)
    duration_hours = audio_info['duration'] / 3600
    specs['durationHours'] = round(duration_hours, 2)
    if duration_hours > 24:
        issues.append(ValidationIssue(
            severity='info',
            category='spec',
            message=f'Long audiobook: {duration_hours:.1f} hours',
            details='Consider splitting into multiple volumes for better user experience'
        ))
    
    # Check chapters
    chapters = _check_m4b_chapters(path)
    if chapters is None:
        issues.append(ValidationIssue(
            severity='warning',
            category='structure',
            message='Could not read chapter markers',
            details='ffprobe failed to extract chapter information'
        ))
    elif len(chapters) == 0:
        issues.append(ValidationIssue(
            severity='error',
            category='structure',
            message='No chapter markers found',
            details='Apple Books requires embedded chapter markers'
        ))
    else:
        specs['chapterCount'] = len(chapters)
        if len(chapters) < 2:
            issues.append(ValidationIssue(
                severity='warning',
                category='structure',
                message=f'Only {len(chapters)} chapter(s) found',
                details='Most audiobooks have multiple chapters'
            ))
    
    # Check metadata
    metadata = _check_m4b_metadata(path)
    if metadata:
        specs['metadata'] = metadata
        
        # Check required metadata fields
        if not metadata.get('title'):
            issues.append(ValidationIssue(
                severity='error',
                category='metadata',
                message='Missing title metadata',
                details='Title tag is required for Apple Books'
            ))
        
        if not metadata.get('artist') and not metadata.get('composer'):
            issues.append(ValidationIssue(
                severity='warning',
                category='metadata',
                message='Missing author/narrator metadata',
                details='Artist or Composer tag should contain author/narrator name'
            ))
        
        if not metadata.get('album'):
            issues.append(ValidationIssue(
                severity='warning',
                category='metadata',
                message='Missing album metadata',
                details='Album tag typically contains book title or series'
            ))
    else:
        issues.append(ValidationIssue(
            severity='warning',
            category='metadata',
            message='Could not read metadata tags',
            details='Metadata tags may be missing or malformed'
        ))
    
    # Compare against expected specs if provided
    if expected_specs:
        exp_bitrate = expected_specs.get('bitrate', '').replace('k', '')
        if exp_bitrate and exp_bitrate.isdigit():
            exp_bitrate_int = int(exp_bitrate)
            if abs(bitrate - exp_bitrate_int) > 10:  # Allow 10 kbps variance
                issues.append(ValidationIssue(
                    severity='info',
                    category='spec',
                    message=f'Bitrate mismatch: {bitrate} kbps vs expected {exp_bitrate_int} kbps',
                    details='Actual bitrate differs from project settings'
                ))
        
        exp_sr = expected_specs.get('sampleRate')
        if exp_sr and sample_rate != exp_sr:
            issues.append(ValidationIssue(
                severity='warning',
                category='spec',
                message=f'Sample rate mismatch: {sample_rate} Hz vs expected {exp_sr} Hz',
                details='Actual sample rate differs from project settings'
            ))
    
    # Determine overall validity
    has_errors = any(issue.severity == 'error' for issue in issues)
    valid = not has_errors
    
    return ValidationResult(
        valid=valid,
        platform='apple',
        package_path=package_path,
        issues=issues,
        specs=specs
    )


def validate_package(
    platform_id: str,
    package_path: str,
    expected_specs: Optional[Dict[str, Any]] = None
) -> ValidationResult:
    """
    Main validation entry point.
    Routes to platform-specific validator.
    """
    if platform_id == 'apple':
        return validate_m4b_package(package_path, expected_specs)
    
    # TODO: Add validators for other platforms
    # elif platform_id in ['google', 'spotify', 'acx']:
    #     return validate_zip_mp3_package(package_path, expected_specs)
    # elif platform_id == 'kobo':
    #     return validate_epub3_package(package_path, expected_specs)
    
    # Fallback for unimplemented platforms
    return ValidationResult(
        valid=False,
        platform=platform_id,
        package_path=package_path,
        issues=[ValidationIssue(
            severity='error',
            category='structure',
            message=f'Validator not implemented for platform: {platform_id}',
            details='This platform does not have a validator yet'
        )],
        specs={}
    )


def main():
    """CLI entry point for testing."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Validate audiobook package')
    parser.add_argument('platform', choices=['apple', 'google', 'spotify', 'acx', 'kobo'],
                        help='Target platform')
    parser.add_argument('package', help='Path to package file')
    parser.add_argument('--specs', help='JSON file with expected specs')
    
    args = parser.parse_args()
    
    expected_specs = None
    if args.specs:
        with open(args.specs, 'r') as f:
            expected_specs = json.load(f)
    
    result = validate_package(args.platform, args.package, expected_specs)
    
    print(json.dumps(result.to_dict(), indent=2))
    
    return 0 if result.valid else 1


if __name__ == '__main__':
    import sys
    sys.exit(main())
