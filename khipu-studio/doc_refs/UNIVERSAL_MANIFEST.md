# Universal Manifest System

## Overview

The Universal Manifest is an **optional** centralized JSON file (`manifest.json`) that pre-aggregates all metadata, chapter information, and audio file paths for faster platform-specific audiobook packaging.

**Key Design Principle**: The manifest is NOT required for packaging. Platform packagers can operate in two modes:
1. **Fast path**: Use pre-generated manifest if available (avoids redundant scanning and probing)
2. **Fallback path**: Read source files directly if manifest is missing or stale

This design provides performance optimization while maintaining simplicity and robustness.

## Why Optional?

**Advantages of generating manifest:**
- ⚡ **Performance**: Scans audio directory and probes durations once, not on each packaging operation
- 🔄 **Consistency**: All platforms use identical aggregated data
- ✅ **Early validation**: Detects missing audio files before any packaging attempt
- 📊 **Multi-platform efficiency**: Export to 5 platforms = 1 scan instead of 5

**Advantages of making it optional:**
- 🎯 **Simplicity**: Users can package immediately without extra workflow steps
- 🔄 **Flexibility**: No risk of stale manifest when source files change
- 🛠️ **Robustness**: Packagers always work, even if manifest generation fails
- 🚀 **Quick iteration**: Metadata changes don't require regenerating manifest

## When to Generate

**Generate the manifest when:**
- Packaging for multiple platforms (avoid redundant scanning)
- Working with large projects where duration probing is slow (20+ chapters)
- You want early validation of chapter audio completeness
- Optimizing CI/CD pipelines for repeated packaging

**Skip manifest generation when:**
- Packaging for a single platform once
- Rapidly iterating on metadata changes
- Working with small projects (< 10 chapters)
- Testing or debugging packaging issues

## Architecture

### Packaging Flow (with optional manifest)

```
User clicks "Prepare" for a platform
    ↓
Backend: packaging:create IPC handler
    ↓
Check: Does manifest.json exist?
    ├─ YES → Platform packager uses manifest (fast path)
    └─ NO  → Platform packager reads source files directly (fallback path)
    ↓
Platform-specific packager (M4B, ZIP+MP3, EPUB3)
```

### Manifest Generation Flow (when user explicitly generates)

```
User clicks "Generate Manifest"
    ↓
Backend: packaging:generateManifest IPC handler
    ↓
Python: manifest_generator.py
    ↓
Reads: project.khipu.json, book.meta.json, narrative.structure.json
    ↓
Scans: audio/wav/*_complete.wav files
    ↓
Probes: audio duration using wave/pydub libraries
    ↓
Writes: manifest.json to project root
```

### File Locations

- **Generator Script**: `py/packaging/manifest_generator.py`
- **M4B Packager**: `py/packaging/packagers/m4b_packager.py` (supports both manifest and fallback)
- **Output File**: `{projectRoot}/manifest.json`
- **Backend Integration**: `app/electron/main.cjs` (packaging:create and packaging:generateManifest handlers)

## Manifest Structure

```json
{
  "version": "1.0",
  "generated": "2025-11-25T01:42:10.429804Z",
  "project": {
    "name": "Project Name"
  },
  "book": {
    "title": "Book Title",
    "subtitle": "Optional Subtitle",
    "authors": ["Author Name"],
    "narrators": ["Narrator Name"],
    "translators": ["Translator Name"],
    "adaptors": ["Adaptor Name"],
    "description": "Book description",
    "language": "en",
    "publisher": "Publisher Name",
    "publicationDate": "2025-01-01",
    "isbn": "978-1234567890",
    "genres": ["Fiction", "Mystery"],
    "keywords": ["keyword1", "keyword2"],
    "copyright": "Copyright notice"
  },
  "cover": {
    "image": "path/to/cover.jpg"
  },
  "audio": {
    "totalDuration": 12345.67,
    "totalDurationFormatted": "03:25:45",
    "chapterCount": 15,
    "completedChapters": 15,
    "missingAudio": []
  },
  "chapters": [
    {
      "id": "ch01",
      "title": "Chapter 1: Beginning",
      "type": "chapter",
      "index": 1,
      "audioFile": "audio/wav/ch01_complete.wav",
      "duration": 823.45,
      "hasAudio": true
    },
    {
      "id": "ch02",
      "title": "Introduction",
      "type": "intro",
      "index": 2,
      "audioFile": "audio/wav/ch02_complete.wav",
      "duration": 156.78,
      "hasAudio": true
    }
  ]
}
```

### Design Principles

**Portability**: All file paths are relative to the project root. No absolute paths are stored, making the manifest portable across different machines and environments.

**Self-Contained**: The manifest contains all metadata needed for packaging. Packagers receive the project root path at runtime and resolve relative paths.

**Platform-Agnostic**: This is Khipu Studio's internal format, not an industry standard. Each platform (Apple Books, Google Play, ACX, etc.) has its own format, which is why we need platform-specific packagers to convert this manifest into their required formats.

## Implementation Details

### Python Script (`manifest_generator.py`)

**Key Functions:**

- `generate_universal_manifest(project_root)`: Main entry point
- `_load_json(path)`: Safe JSON loading with error handling
- `_find_complete_audio_files(project_root)`: Scans for `*_complete.wav` files
- `_probe_audio_duration(audio_path)`: Gets duration using wave/pydub
- `_format_duration(seconds)`: Formats duration as HH:MM:SS

**Input Sources:**

1. `project.khipu.json` - Project configuration
2. `dossier/book.json` or `book.meta.json` - Book metadata
3. `dossier/narrative.structure.json` - Chapter structure
4. `audio/wav/*_complete.wav` - Complete chapter audio files

**Audio File Discovery:**

Searches in multiple locations:
- `audio/wav/`
- `audio/chapters/`
- `audio/book/`
- `audio/`

Filename patterns:
- `{chapterId}_complete.wav` (preferred)
- `{chapterId}.wav` (fallback)

### Backend Integration (`main.cjs`)

**IPC Handler**: `packaging:create`

```javascript
// Spawns Python script to generate manifest
const manifestScriptPath = path.join(__dirname, '../../py/packaging/manifest_generator.py');
const proc = spawn(getPythonExe(), [manifestScriptPath, projectRoot]);

// Verifies manifest was created
if (!fs.existsSync(universalManifestPath)) {
  throw new Error('Universal manifest file was not created');
}
```

**New IPC Handler**: `fs:openExternal`

Opens files in system default application using `shell.openPath()`.

### UI Integration (`Packaging.tsx`)

**Universal Manifest Section:**

- Displays description of manifest purpose
- **View Manifest** button opens `manifest.json` in default JSON viewer
- Shows file location: "manifest.json in project root"
- Checks file existence before attempting to open

**Translation Keys:**

- `packaging.universalManifest` - Section title
- `packaging.manifestDescription` - Explanation text
- `packaging.actions.viewManifest` - Button label
- `packaging.manifestLocation` - File location text
- `packaging.manifestNotFound` - Error message

## Usage

### For Users

1. Navigate to **Packaging** page
2. Ensure all chapters have complete audio (visible in Chapter Audio Status)
3. Click **Prepare** for desired platform
4. Manifest is automatically generated
5. Click **View Manifest** to inspect the generated file

### For Developers

**Generating Manifest Manually:**

```bash
python py/packaging/manifest_generator.py /path/to/project
```

**Reading Manifest in Platform Packagers:**

```python
import json
from pathlib import Path

def package_for_platform(project_root: Path):
    manifest_path = project_root / 'manifest.json'
    with open(manifest_path) as f:
        manifest = json.load(f)
    
    # Access metadata
    title = manifest['book']['title']
    chapters = manifest['chapters']
    
    # Process each chapter
    for chapter in chapters:
        if chapter['hasAudio']:
            audio_file = project_root / chapter['audioFile']
            duration = chapter['duration']
            # ... platform-specific processing
```

## Dependencies

### Python Libraries

- **wave** (stdlib): Fast WAV duration probing
- **pydub** (optional): Fallback for non-WAV or problematic files
- **json**, **pathlib**, **datetime** (stdlib)

### Audio Format Requirements

- Input: WAV files (PCM, any sample rate/bit depth)
- Naming: `{chapterId}_complete.wav` or `{chapterId}.wav`
- Location: Primarily in `audio/wav/` directory

## Error Handling

### Missing Files

- Returns empty structures for missing metadata files
- Logs warnings but continues processing
- `missingAudio` array lists chapters without audio files

### Duration Probing Failures

- Sets `duration: null` if unable to probe
- Calculates total duration only from successfully probed files
- Continues processing remaining chapters

### Manifest Generation Failures

- Backend handler catches and reports errors
- UI displays "Failed to prepare package" message
- Detailed errors logged to console

## Future Enhancements

### Planned Features

1. **Manifest Validation**: Check for required fields before packaging
2. **Incremental Updates**: Only regenerate if source files changed
3. **Manifest Versioning**: Support for format evolution
4. **Extended Metadata**: Cover art dimensions, audio specs, file hashes
5. **Multi-format Support**: Include alternate audio formats (MP3, M4A)

### Platform Packagers (To Be Implemented)

- **M4B Packager** (Apple Books): AAC encoding, chapter markers, ID3 tags
- **ZIP+MP3 Packager** (Google/Spotify/ACX): MP3 conversion, platform metadata
- **EPUB3 Packager** (Kobo): EPUB structure, audio manifest, NCX

## Testing

### Manual Testing

```bash
# Navigate to repo root
cd /path/to/khipu-studio

# Test with sample project
python py/packaging/manifest_generator.py sample

# Verify output
cat sample/manifest.json | jq .
```

### Expected Output

- File created at `sample/manifest.json`
- Valid JSON structure
- All chapters listed (even without audio)
- Duration values for available audio files

## Troubleshooting

### "Manifest not yet generated"

- Click **Prepare** for any platform first
- Check console for Python script errors
- Verify Python environment is activated

### Missing Chapter Audio

- Generate complete chapter audio in **Audio Production** page
- Files must be named `{chapterId}_complete.wav`
- Place in `audio/wav/` directory

### Duration Shows as `null`

- Install pydub: `pip install pydub`
- Verify WAV file is valid (not corrupted)
- Check file permissions (readable)

## Related Documentation

- [PACKAGING_MODULE.md](./PACKAGING_MODULE.md) - Overall packaging architecture
- [CHAPTER_TYPES.md](./CHAPTER_TYPES.md) - Chapter type classification system
- [AUDIO_PRODUCTION.md](./AUDIO_PRODUCTION.md) - Chapter audio generation

---

**Status**: ✅ Implemented (v1.0)  
**Last Updated**: 2025-01-24  
**Author**: Khipu Studio Development Team
