# M4B Packager for Apple Books

## Overview

The M4B packager converts a completed audiobook project into Apple Books' M4B format with embedded chapter markers, metadata, and cover art.

## Features

- **AAC Audio Encoding**: Configurable bitrate (default 128k)
- **Chapter Markers**: Automatic chapter markers from manifest
- **Metadata Embedding**: Title, author, narrator, description, copyright, year
- **Cover Art**: Embeds cover image as attached picture
- **Mono/Stereo**: Configurable channel count
- **Sample Rate**: Configurable (default 44.1 kHz)

## Technical Details

### Audio Processing Pipeline

```
1. Read manifest.json
   ↓
2. Create FFmpeg concat list (all chapter WAV files)
   ↓
3. Create FFmpeg metadata file (book info + chapter markers)
   ↓
4. Concatenate all chapters into single WAV
   ↓
5. Convert to AAC with metadata:
   - Encode to AAC at specified bitrate
   - Embed chapter markers
   - Add ID3 tags (title, artist, album_artist, etc.)
   - Attach cover art
   ↓
6. Output: {bookTitle}.m4b in exports/apple/
```

### FFmpeg Commands Used

**Concatenation:**
```bash
ffmpeg -f concat -safe 0 -i concat_list.txt -c copy concatenated.wav
```

**M4B Conversion:**
```bash
ffmpeg -i concatenated.wav \
       -i metadata.txt \
       -i cover.jpg \
       -map 0:a \
       -map_metadata 1 \
       -map 2:v \
       -c:a aac \
       -b:a 128k \
       -ar 44100 \
       -ac 1 \
       -c:v copy \
       -disposition:v:0 attached_pic \
       output.m4b
```

### Metadata Format

FFmpeg metadata file (`;FFMETADATA1` format):

```ini
;FFMETADATA1
title=Book Title
artist=Author Name
album_artist=Narrator Name
translator=Translator Name
adaptor=Adaptor Name
comment=Book description
copyright=Copyright notice
date=2025
genre=Audiobook

[CHAPTER]
TIMEBASE=1/1000
START=0
END=823450
title=Chapter 1: Beginning

[CHAPTER]
TIMEBASE=1/1000
START=823450
END=1279230
title=Chapter 2: Rising Action
```

## Usage

### From Python

```python
from py.packaging.packagers import package_m4b

success = package_m4b(
    project_root='/path/to/project',
    output_path='/path/to/output.m4b',
    audio_spec={
        'format': 'AAC',
        'bitrate': '128k',
        'sampleRate': 44100,
        'channels': 1
    }
)
```

### From Command Line

```bash
python py/packaging/packagers/m4b_packager.py \
    /path/to/project \
    --output /path/to/output.m4b \
    --bitrate 128k \
    --sample-rate 44100 \
    --channels 1
```

### From UI

1. Navigate to **Packaging** page
2. Ensure **Apple Books** platform is enabled
3. Verify all chapters have complete audio
4. Click **Generate Manifest** (if not already generated)
5. Click **Prepare** under Apple Books section
6. Output: `exports/apple/{bookTitle}.m4b`

## Configuration

Audio specifications are read from `production.settings.json`:

```json
{
  "packaging": {
    "apple": {
      "aac_bitrate": "128k"
    }
  }
}
```

If not configured, defaults are used:
- **Bitrate**: 128k
- **Sample Rate**: 44100 Hz
- **Channels**: 1 (mono)

## Requirements

### System Dependencies

- **FFmpeg**: Must be installed and in PATH
  - Windows: Download from https://ffmpeg.org/download.html
  - macOS: `brew install ffmpeg`
  - Linux: `apt install ffmpeg` or `yum install ffmpeg`

### Project Requirements

Before packaging, ensure:
1. ✅ Universal manifest generated (`manifest.json`)
2. ✅ All chapters have complete audio (`{chapterId}_complete.wav`)
3. ✅ Book metadata complete (title, author, narrator)
4. ✅ Cover image exists (optional but recommended)

## Output Structure

```
project_root/
├── manifest.json
└── exports/
    └── apple/
        └── BookTitle.m4b
```

## Chapter Marker Format

Chapters are embedded using FFmpeg's chapter metadata format:

- **Timestamp**: Milliseconds from start
- **Title**: Chapter title from manifest (or "Chapter N" as fallback)
- **Type awareness**: Includes special chapter types (intro, prologue, epilogue, credits, outro)

Example chapter markers:
```
00:00:00 - Introduction
00:02:35 - Chapter 1: The Beginning
00:15:42 - Chapter 2: Rising Action
01:23:18 - Epilogue
```

## Error Handling

### Common Errors

**FFmpeg Not Found**
```
❌ FFmpeg not found. Please install FFmpeg.
```
**Solution**: Install FFmpeg and ensure it's in PATH

**Missing Audio Files**
```
❌ Not all chapters have audio. Missing: ch01, ch05
```
**Solution**: Generate complete audio for missing chapters in Audio Production page

**Manifest Not Found**
```
❌ Manifest not found: /path/to/manifest.json
```
**Solution**: Click "Generate Manifest" in Packaging page first

**Output Directory Error**
```
❌ Failed to create output directory
```
**Solution**: Check disk space and write permissions

## Quality Settings

### Bitrate Recommendations

- **64k**: Lower quality, smallest file size (~40 MB/hour)
- **96k**: Good quality, balanced size (~60 MB/hour)
- **128k**: High quality, recommended default (~80 MB/hour)
- **192k**: Very high quality, larger files (~120 MB/hour)
- **256k**: Maximum quality, largest files (~160 MB/hour)

### Sample Rate

- **44100 Hz**: Standard CD quality (recommended)
- **48000 Hz**: Higher quality, slightly larger files

### Channels

- **1 (Mono)**: Recommended for voice-only audiobooks
- **2 (Stereo)**: Use if audio has spatial effects or music

## Apple Books Specifications

According to Apple Books requirements:
- **Format**: M4B (MPEG-4 Audio Book)
- **Codec**: AAC
- **Sample Rate**: 44.1 kHz or 48 kHz
- **Bit Depth**: 16-bit minimum
- **Bitrate**: 64-128 kbps (mono), 96-256 kbps (stereo)
- **Metadata**: ID3v2 tags
- **Chapters**: Embedded chapter markers
- **Cover Art**: JPEG or PNG, 1400x1400 px minimum

## Troubleshooting

### Large File Size

If the output M4B is too large:
1. Lower bitrate (e.g., 96k instead of 128k)
2. Use mono instead of stereo
3. Ensure sample rate is 44.1 kHz (not 48 kHz)

### Poor Audio Quality

If audio quality is unsatisfactory:
1. Increase bitrate (e.g., 192k or 256k)
2. Check source WAV files are high quality
3. Verify sample rate matches source files

### Missing Chapters

If some chapters don't appear in the M4B:
1. Check `manifest.json` lists all chapters
2. Verify audio files exist and are named correctly
3. Ensure `hasAudio: true` for all chapters in manifest

### Metadata Not Showing

If metadata doesn't appear in Apple Books:
1. Check `manifest.json` has complete book metadata
2. Verify cover image path is correct
3. Test M4B in iTunes/Music app on desktop first

## Testing

### Verify M4B Output

**Using FFmpeg:**
```bash
ffmpeg -i output.m4b
```
Shows: codec, bitrate, duration, metadata

**Using FFprobe:**
```bash
ffprobe -show_chapters output.m4b
```
Shows: chapter markers with timestamps and titles

**In iTunes/Music:**
1. Import M4B into iTunes/Music app
2. Check metadata displays correctly
3. Verify chapter markers appear
4. Test playback quality

## Performance

Typical packaging times:
- **1-hour audiobook**: 1-2 minutes
- **5-hour audiobook**: 5-10 minutes
- **10-hour audiobook**: 10-20 minutes

Factors affecting speed:
- Source file format (WAV is fastest)
- Bitrate (higher = slower)
- CPU speed
- Disk I/O speed

## Future Enhancements

Planned features:
- Variable bitrate (VBR) encoding for better quality/size ratio
- Multi-threaded FFmpeg encoding for faster processing
- Preview audio sample before full packaging
- Automatic quality validation
- Direct upload to Apple Books Connect API

---

**Status**: ✅ Implemented  
**Version**: 1.0  
**Last Updated**: 2025-01-24
