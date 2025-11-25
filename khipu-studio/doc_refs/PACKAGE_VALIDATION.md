# Package Validation System

## Overview

The Package Validation system ensures that generated audiobook packages meet platform specifications before upload. It performs automated quality checks on technical specs, metadata completeness, and file structure.

## Features

### Automated Validation

- **Technical Specs**: Verifies codec, bitrate, sample rate, channels
- **Metadata Completeness**: Checks for required ID3/metadata tags
- **Chapter Markers**: Ensures embedded chapter information exists
- **File Size**: Warns about unusually large files
- **Platform Compliance**: Validates against platform-specific requirements

### Validation Levels

**Errors** (❌): Critical issues that prevent platform acceptance
- Wrong codec (e.g., MP3 instead of AAC for Apple)
- Missing chapter markers
- Invalid channel count
- Missing required metadata

**Warnings** (⚠️): Issues that may cause problems but aren't fatal
- Bitrate outside recommended range
- Non-standard sample rate
- Missing optional metadata
- Large file size

**Info** (ℹ️): Informational notices
- Bitrate mismatch with project settings
- Unusually long duration
- Performance suggestions

## Usage

### From UI

1. Navigate to **Packaging** page
2. Ensure a platform is enabled and packaged
3. Click the **🔍 Validate** button next to the package
4. Review validation results displayed below package info

### Validation Results Display

**Passed Validation** (Green):
```
✅ Validation Passed
Technical Specs ▼
  codec: aac
  bitrate: 128
  sampleRate: 44100
  channels: 1
  chapterCount: 15
  durationHours: 8.5
```

**Failed Validation** (Red):
```
❌ Validation Failed
❌ Invalid codec: mp3
   Apple Books requires AAC codec
⚠️ Low bitrate: 48 kbps
   Apple Books recommends 64-128 kbps for mono
```

### From Command Line

```bash
# Validate M4B package for Apple Books
python py/packaging/validator.py apple path/to/book.m4b

# With expected specs
python py/packaging/validator.py apple path/to/book.m4b --specs specs.json
```

**specs.json format:**
```json
{
  "bitrate": "128k",
  "sampleRate": 44100,
  "channels": 1
}
```

## Platform-Specific Validators

### Apple Books (M4B)

**Required:**
- Format: M4B (MPEG-4 Audio Book)
- Codec: AAC
- Sample Rate: 44100 Hz or 48000 Hz
- Channels: 1 (mono) or 2 (stereo)
- Bitrate: 64-128 kbps (mono), 96-256 kbps (stereo)
- Chapter markers: Required
- Metadata: Title, Artist/Author

**Checked:**
- ✓ Audio codec is AAC
- ✓ Bitrate in acceptable range
- ✓ Sample rate is 44.1 or 48 kHz
- ✓ Channels are 1 or 2
- ✓ Chapter markers present and valid
- ✓ Required metadata tags exist
- ✓ File size reasonable (< 4 GB recommended)

### Google Play Books (ZIP+MP3)

*Coming soon*

### Spotify (ZIP+MP3)

*Coming soon*

### ACX (ZIP+MP3)

*Coming soon*

### Kobo (EPUB3)

*Coming soon*

## Technical Details

### Validator Architecture

```
┌─────────────────┐
│  Packaging UI   │
└────────┬────────┘
         │ packaging:validate IPC
         ▼
┌─────────────────┐
│  Electron Main  │
│  - Load specs   │
│  - Spawn Python │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  validator.py   │
│  - ffprobe      │
│  - Check specs  │
│  - Return JSON  │
└────────┬────────┘
         │
         ▼
   ValidationResult
```

### FFprobe Integration

The validator uses `ffprobe` (part of FFmpeg) to extract technical specs:

```bash
# Get audio streams
ffprobe -v error -show_format -show_streams -of json file.m4b

# Get chapters
ffprobe -v error -show_chapters -of json file.m4b
```

**Extracted Data:**
- Codec name (aac, mp3, etc.)
- Bitrate (in kbps)
- Sample rate (in Hz)
- Channel count
- Duration (in seconds)
- File size
- Metadata tags
- Chapter markers

### Validation Result Schema

```typescript
{
  valid: boolean;
  platform: string;
  packagePath: string;
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    category: 'audio' | 'metadata' | 'structure' | 'spec';
    message: string;
    details?: string;
  }>;
  specs: {
    codec?: string;
    bitrate?: number;          // kbps
    sampleRate?: number;       // Hz
    channels?: number;
    duration?: number;         // seconds
    fileSize?: number;         // bytes
    fileSizeGB?: number;
    durationHours?: number;
    chapterCount?: number;
    metadata?: Record<string, string>;
  };
}
```

## Implementation

### Python Validator

**File:** `py/packaging/validator.py`

**Functions:**
- `validate_package()`: Main entry point, routes to platform validator
- `validate_m4b_package()`: Apple Books M4B validation
- `_probe_audio_with_ffprobe()`: Extract audio specs
- `_check_m4b_chapters()`: Extract chapter markers
- `_check_m4b_metadata()`: Extract ID3 tags

**Classes:**
- `ValidationIssue`: Single validation issue
- `ValidationResult`: Complete validation result

### Backend IPC Handler

**File:** `app/electron/main.cjs`

**Handler:** `packaging:validate`

**Flow:**
1. Check package file exists
2. Load production settings for expected specs
3. Create temporary specs file if needed
4. Spawn Python validator with arguments
5. Parse JSON output
6. Return validation result to UI

### UI Integration

**File:** `app/src/pages/Packaging.tsx`

**State:**
- `validating`: Track which platforms are being validated
- `validationResults`: Store validation results per platform

**Functions:**
- `validatePlatform()`: Trigger validation for a platform
- Display validation results below package info
- Color-coded issues (red=error, orange=warning, blue=info)

**UI Elements:**
- 🔍 Validate button (appears when package exists)
- Validation status indicator (✅ passed / ❌ failed)
- Expandable issue list
- Collapsible technical specs

## Best Practices

### When to Validate

1. **After First Package**: Validate immediately after creating a package for the first time
2. **Before Upload**: Always validate before uploading to platform
3. **After Settings Change**: Re-validate if you change bitrate, sample rate, or other audio settings
4. **Before Distribution**: Final validation before distributing to multiple platforms

### Interpreting Results

**All Green (✅):**
- Package ready for upload
- Meets all platform requirements
- No technical issues

**Warnings Only (⚠️):**
- Package likely acceptable
- Review warnings carefully
- Consider addressing for optimal quality
- Platform may still accept the file

**Errors Present (❌):**
- Package will likely be rejected
- Must fix errors before upload
- Re-package after fixing issues
- Validate again after fixes

### Common Issues & Solutions

**Issue:** `Invalid codec: mp3`
- **Solution:** Platform requires AAC. Check production settings and re-package.

**Issue:** `Low bitrate: 48 kbps`
- **Solution:** Increase bitrate in production settings (recommend 128k for mono).

**Issue:** `No chapter markers found`
- **Solution:** Ensure chapters are defined in narrative structure. Regenerate package.

**Issue:** `Missing title metadata`
- **Solution:** Fill in book metadata in Book page. Regenerate package.

**Issue:** `Non-standard sample rate: 22050 Hz`
- **Solution:** Set sample rate to 44100 Hz in production settings. Re-package.

**Issue:** `Large file size: 4.5 GB`
- **Solution:** Reduce bitrate or split into multiple volumes.

## Troubleshooting

### Validation Fails to Run

**Symptom:** No validation results appear, or error message

**Possible Causes:**
1. FFmpeg/ffprobe not installed
2. Python validator script missing
3. Package file path incorrect

**Solutions:**
- Ensure FFmpeg is installed and in PATH
- Check console logs for detailed error messages
- Verify package file exists in exports folder

### Incorrect Validation Results

**Symptom:** Validation passes but platform rejects package

**Possible Causes:**
1. Platform specs changed
2. Validator doesn't check all requirements
3. Platform has additional non-technical requirements

**Solutions:**
- Check platform documentation for latest specs
- Report issue to development team
- Manually verify package with platform tools

### Performance Issues

**Symptom:** Validation takes very long

**Possible Causes:**
1. Very large package file (> 2 GB)
2. Slow disk I/O
3. FFprobe extracting all chapters/metadata

**Solutions:**
- Be patient with large files (validation can take 10-30 seconds)
- Close other disk-intensive applications
- Normal for first validation (subsequent validations are faster)

## Future Enhancements

**Planned:**
- ZIP+MP3 validator for Google/Spotify/ACX
- EPUB3 validator for Kobo
- Batch validation (validate all platforms at once)
- Audio quality analysis (noise floor, clipping, etc.)
- Cover art validation (dimensions, format, quality)
- Automatic fix suggestions
- Pre-packaging validation (check before packaging)

**Under Consideration:**
- Waveform analysis for quality issues
- Loudness normalization verification
- Silence detection at chapter boundaries
- Automated comparison with source files
- Integration with platform upload APIs for real-time validation

---

**Status**: ✅ Implemented (M4B only)  
**Version**: 1.0  
**Last Updated**: 2025-01-24
