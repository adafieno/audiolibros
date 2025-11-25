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
            encoding='utf-8',
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
            encoding='utf-8',
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
            encoding='utf-8',
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
    
    # Add package file info
    file_stats = path.stat()
    specs['fileSize'] = file_stats.st_size
    specs['fileSizeMB'] = round(file_stats.st_size / (1024 * 1024), 2)
    specs['createdAt'] = file_stats.st_ctime
    specs['modifiedAt'] = file_stats.st_mtime
    
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
        
        # Check for album (optional for audiobooks - used for series info)
        # Skip album validation - not applicable for audiobooks
        # Audiobooks use title/artist/narrator metadata, not album
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


def validate_zip_mp3_package(
    package_path: str,
    platform_id: str,
    expected_specs: Optional[Dict[str, Any]] = None
) -> ValidationResult:
    """
    Validate ZIP+MP3 package for Google Play Books, Spotify, or ACX.
    
    Checks:
    - ZIP file structure
    - MP3 files with proper naming (chapter_NNN.mp3)
    - MP3 audio specs (bitrate, sample rate, channels)
    - ID3 metadata tags
    - Optional metadata.json validity
    """
    import zipfile
    import tempfile
    import shutil
    
    path = Path(package_path)
    issues = []
    specs = {}
    
    # Add package file info
    file_stats = path.stat()
    specs['fileSize'] = file_stats.st_size
    specs['fileSizeMB'] = round(file_stats.st_size / (1024 * 1024), 2)
    specs['createdAt'] = file_stats.st_ctime
    specs['modifiedAt'] = file_stats.st_mtime
    
    # Check if ZIP file is valid
    if not zipfile.is_zipfile(path):
        issues.append(ValidationIssue(
            severity='error',
            category='structure',
            message='Invalid ZIP file',
            details='Package is not a valid ZIP archive'
        ))
        return ValidationResult(
            valid=False,
            platform=platform_id,
            package_path=package_path,
            issues=issues,
            specs=specs
        )
    
    # Extract ZIP to temp directory for analysis
    temp_dir = Path(tempfile.mkdtemp(prefix='khipu_validate_'))
    try:
        with zipfile.ZipFile(path, 'r') as zf:
            zf.extractall(temp_dir)
        
        # Find all MP3 files
        mp3_files = sorted(temp_dir.glob('*.mp3'))
        
        if not mp3_files:
            issues.append(ValidationIssue(
                severity='error',
                category='structure',
                message='No MP3 files found in package',
                details='ZIP archive must contain MP3 audio files'
            ))
        else:
            specs['chapterCount'] = len(mp3_files)
            
            # Validate each MP3 file
            total_duration = 0.0
            bitrates = []
            sample_rates = []
            channels_list = []
            
            for idx, mp3_file in enumerate(mp3_files, 1):
                # Check naming convention (chapter_NNN.mp3)
                expected_name = f'chapter_{idx:03d}.mp3'
                if mp3_file.name != expected_name:
                    issues.append(ValidationIssue(
                        severity='warning',
                        category='structure',
                        message=f'Non-standard file name: {mp3_file.name}',
                        details=f'Expected: {expected_name}'
                    ))
                
                # Probe MP3 specs
                audio_info = _probe_audio_with_ffprobe(mp3_file)
                if audio_info:
                    bitrates.append(audio_info['bitrate'])
                    sample_rates.append(audio_info['sampleRate'])
                    channels_list.append(audio_info['channels'])
                    total_duration += audio_info.get('duration', 0.0)
                    
                    # Check ID3 metadata
                    metadata = _check_m4b_metadata(mp3_file)
                    if metadata:
                        # Check required tags
                        if not metadata.get('title'):
                            issues.append(ValidationIssue(
                                severity='warning',
                                category='metadata',
                                message=f'Missing title in {mp3_file.name}',
                                details='ID3 title tag not set'
                            ))
                        if not metadata.get('artist'):
                            issues.append(ValidationIssue(
                                severity='warning',
                                category='metadata',
                                message=f'Missing artist in {mp3_file.name}',
                                details='ID3 artist tag not set'
                            ))
                else:
                    issues.append(ValidationIssue(
                        severity='error',
                        category='audio',
                        message=f'Failed to read audio specs from {mp3_file.name}',
                        details='Could not probe MP3 file with FFprobe'
                    ))
            
            # Average specs
            if bitrates:
                avg_bitrate = sum(bitrates) // len(bitrates)
                specs['bitrate'] = avg_bitrate
                specs['bitrateKbps'] = f'{avg_bitrate}k'
            
            if sample_rates:
                specs['sampleRate'] = sample_rates[0]  # Should all be same
            
            if channels_list:
                specs['channels'] = channels_list[0]  # Should all be same
            
            specs['duration'] = round(total_duration, 2)
            specs['durationMinutes'] = round(total_duration / 60, 1)
            
            # Check against expected specs if provided
            if expected_specs:
                # Bitrate check
                expected_bitrate_str = expected_specs.get('bitrate', '')
                expected_bitrate = int(expected_bitrate_str.replace('k', '')) if expected_bitrate_str else None
                if expected_bitrate and avg_bitrate < expected_bitrate:
                    issues.append(ValidationIssue(
                        severity='warning',
                        category='spec',
                        message=f'Bitrate below expected: {avg_bitrate}kbps < {expected_bitrate}kbps',
                        details=f'Expected {expected_bitrate}kbps for {platform_id}'
                    ))
                
                # Sample rate check
                expected_sr = expected_specs.get('sampleRate')
                if expected_sr and sample_rates and sample_rates[0] != expected_sr:
                    issues.append(ValidationIssue(
                        severity='warning',
                        category='spec',
                        message=f'Sample rate mismatch: {sample_rates[0]}Hz != {expected_sr}Hz',
                        details=f'Expected {expected_sr}Hz for {platform_id}'
                    ))
                
                # Channels check
                expected_ch = expected_specs.get('channels')
                if expected_ch and channels_list and channels_list[0] != expected_ch:
                    issues.append(ValidationIssue(
                        severity='warning',
                        category='spec',
                        message=f'Channel count mismatch: {channels_list[0]} != {expected_ch}',
                        details=f'Expected {expected_ch} channel(s) for {platform_id}'
                    ))
        
        # Check for metadata.json (optional but nice to have)
        metadata_json = temp_dir / 'metadata.json'
        if metadata_json.exists():
            try:
                with open(metadata_json, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
                    specs['hasMetadataJson'] = True
                    specs['title'] = metadata.get('title', 'Unknown')
                    specs['authors'] = metadata.get('authors', [])
            except Exception as e:
                issues.append(ValidationIssue(
                    severity='info',
                    category='metadata',
                    message='metadata.json is invalid',
                    details=str(e)
                ))
        else:
            issues.append(ValidationIssue(
                severity='info',
                category='metadata',
                message='No metadata.json found in package',
                details='Optional metadata file not included'
            ))
    
    finally:
        # Cleanup temp directory
        shutil.rmtree(temp_dir, ignore_errors=True)
    
    # Package is valid if no errors (warnings/info are ok)
    valid = not any(issue.severity == 'error' for issue in issues)
    
    result = ValidationResult(
        valid=valid,
        platform=platform_id,
        package_path=package_path,
        issues=issues,
        specs=specs
    )
    
    return result


def validate_epub3_package(
    package_path: str,
    expected_specs: Optional[Dict[str, Any]] = None
) -> ValidationResult:
    """
    Validate EPUB3 package for Kobo.
    
    Checks:
    - EPUB file structure (mimetype, META-INF, OEBPS)
    - MP3 audio files with proper specs
    - SMIL synchronization files
    - Package OPF structure
    """
    import zipfile
    import tempfile
    import shutil
    
    path = Path(package_path)
    issues = []
    specs = {}
    
    # Add package file info
    file_stats = path.stat()
    specs['fileSize'] = file_stats.st_size
    specs['fileSizeMB'] = round(file_stats.st_size / (1024 * 1024), 2)
    specs['createdAt'] = file_stats.st_ctime
    specs['modifiedAt'] = file_stats.st_mtime
    
    # Check if EPUB file is valid ZIP
    if not zipfile.is_zipfile(path):
        issues.append(ValidationIssue(
            severity='error',
            category='structure',
            message='Invalid EPUB file',
            details='Package is not a valid ZIP archive'
        ))
        return ValidationResult(
            valid=False,
            platform='kobo',
            package_path=package_path,
            issues=issues,
            specs=specs
        )
    
    # Extract EPUB to temp directory for analysis
    temp_dir = Path(tempfile.mkdtemp(prefix='khipu_validate_epub_'))
    try:
        with zipfile.ZipFile(path, 'r') as zf:
            zf.extractall(temp_dir)
        
        # Check for required EPUB structure
        if not (temp_dir / 'mimetype').exists():
            issues.append(ValidationIssue(
                severity='error',
                category='structure',
                message='Missing mimetype file',
                details='EPUB must contain mimetype file at root'
            ))
        
        if not (temp_dir / 'META-INF' / 'container.xml').exists():
            issues.append(ValidationIssue(
                severity='error',
                category='structure',
                message='Missing META-INF/container.xml',
                details='EPUB must contain container.xml'
            ))
        
        if not (temp_dir / 'OEBPS' / 'package.opf').exists():
            issues.append(ValidationIssue(
                severity='error',
                category='structure',
                message='Missing OEBPS/package.opf',
                details='EPUB must contain package.opf'
            ))
        
        # Find all MP3 files in audio directory
        audio_dir = temp_dir / 'OEBPS' / 'audio'
        if not audio_dir.exists():
            issues.append(ValidationIssue(
                severity='error',
                category='structure',
                message='Missing audio directory',
                details='EPUB must contain OEBPS/audio directory'
            ))
        else:
            mp3_files = sorted(audio_dir.glob('*.mp3'))
            
            if not mp3_files:
                issues.append(ValidationIssue(
                    severity='error',
                    category='structure',
                    message='No MP3 files found',
                    details='EPUB audio directory must contain MP3 files'
                ))
            else:
                specs['chapterCount'] = len(mp3_files)
                
                # Validate audio specs for first file (assume all same)
                audio_info = _probe_audio_with_ffprobe(mp3_files[0])
                if audio_info:
                    specs['bitrate'] = audio_info['bitrate']
                    specs['bitrateKbps'] = f"{audio_info['bitrate']}k"
                    specs['sampleRate'] = audio_info['sampleRate']
                    specs['channels'] = audio_info['channels']
                    
                    # Check against expected specs
                    if expected_specs:
                        expected_bitrate_str = expected_specs.get('bitrate', '')
                        expected_bitrate = int(expected_bitrate_str.replace('k', '')) if expected_bitrate_str else None
                        if expected_bitrate and audio_info['bitrate'] < expected_bitrate:
                            issues.append(ValidationIssue(
                                severity='warning',
                                category='spec',
                                message=f"Bitrate below expected: {audio_info['bitrate']}kbps < {expected_bitrate}kbps",
                                details=f'Expected {expected_bitrate}kbps for Kobo'
                            ))
                        
                        expected_sr = expected_specs.get('sampleRate')
                        if expected_sr and audio_info['sampleRate'] != expected_sr:
                            issues.append(ValidationIssue(
                                severity='warning',
                                category='spec',
                                message=f"Sample rate mismatch: {audio_info['sampleRate']}Hz != {expected_sr}Hz",
                                details=f'Expected {expected_sr}Hz for Kobo'
                            ))
        
        # Check for SMIL files
        smil_dir = temp_dir / 'OEBPS' / 'smil'
        if not smil_dir.exists():
            issues.append(ValidationIssue(
                severity='warning',
                category='structure',
                message='Missing SMIL directory',
                details='Media Overlays require SMIL synchronization files'
            ))
        else:
            smil_files = list(smil_dir.glob('*.smil'))
            if not smil_files:
                issues.append(ValidationIssue(
                    severity='warning',
                    category='structure',
                    message='No SMIL files found',
                    details='Media Overlays require SMIL synchronization files'
                ))
            else:
                specs['smilCount'] = len(smil_files)
        
        # Check for text files
        text_dir = temp_dir / 'OEBPS' / 'text'
        if not text_dir.exists():
            issues.append(ValidationIssue(
                severity='warning',
                category='structure',
                message='Missing text directory',
                details='EPUB should contain XHTML text files'
            ))
        else:
            xhtml_files = list(text_dir.glob('*.xhtml'))
            specs['xhtmlCount'] = len(xhtml_files)
    
    finally:
        # Cleanup temp directory
        shutil.rmtree(temp_dir, ignore_errors=True)
    
    # Package is valid if no errors (warnings/info are ok)
    valid = not any(issue.severity == 'error' for issue in issues)
    
    result = ValidationResult(
        valid=valid,
        platform='kobo',
        package_path=package_path,
        issues=issues,
        specs=specs
    )
    
    return result


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
    
    elif platform_id in ['google', 'spotify', 'acx']:
        return validate_zip_mp3_package(package_path, platform_id, expected_specs)
    
    elif platform_id == 'kobo':
        return validate_epub3_package(package_path, expected_specs)
    
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
