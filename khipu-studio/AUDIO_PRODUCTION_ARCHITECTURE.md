# Audio Production Pipeline Architecture

## Overview

The Audio Production system generates, caches, and manages TTS audio for orchestrated segments. It provides real-time playback, processing chain management, and duration tracking.

---

## System Components

### 1. Database Schema

#### **AudioCache** (L2 Cache Storage)
- **Purpose**: Stores TTS audio metadata and blob references
- **Key Fields**:
  - `cache_key` (unique): Hash of (text + voice_id + voice_settings)
  - `audio_blob_path`: Azure Blob Storage path
  - `audio_duration_seconds`: Duration extracted from WAV file
  - `tenant_id`: Multi-tenancy isolation
  - `hit_count`: Cache usage tracking
  - `last_accessed_at`: LRU eviction

#### **AudioSegmentMetadata** (Segment-to-Cache Link)
- **Purpose**: Links orchestrated segments to cached audio
- **Key Fields**:
  - `project_id`, `chapter_id`, `segment_id`: Segment identity
  - `raw_audio_cache_key`: References AudioCache.cache_key
  - `duration_seconds`: Copy of duration for fast access
  - `processing_chain`: JSON audio processing settings
  - `preset_id`: Reference to AudioPreset
  - `needs_revision`: Manual revision flag

#### **SfxSegment** (Sound Effects)
- **Purpose**: Stores uploaded sound effect segments
- **Key Fields**:
  - `project_id`, `chapter_id`: Location
  - `display_order`: Position in segment list (integer)
  - `blob_path`: Azure Blob Storage path
  - `duration_seconds`: SFX file duration
  - `filename`: Original filename

---

## Audio Generation Pipeline

### Step 1: Generate Audio Request
```
Frontend → POST /api/v1/projects/{id}/chapters/{id}/segments/{id}/audio
Body: { text, voice, prosody: { style, rate_pct, pitch_pct } }
```

### Step 2: Cache Key Generation
```python
cache_key = hashlib.sha256(
    f"{text}|{voice_id}|{json.dumps(voice_settings, sort_keys=True)}"
).hexdigest()
```

### Step 3: Cache Lookup (L2: Database + Blob)
```python
# Query AudioCache table
cache_entry = db.query(AudioCache).filter(
    AudioCache.cache_key == cache_key,
    AudioCache.tenant_id == tenant_id
).first()

if cache_entry:
    # Cache HIT
    audio_bytes = await blob_service.download_audio(cache_entry.audio_blob_path)
    duration = cache_entry.audio_duration_seconds
    
    # If duration missing, extract and backfill
    if not duration:
        duration = get_audio_duration(audio_bytes)
        cache_entry.audio_duration_seconds = duration
        db.commit()
else:
    # Cache MISS - generate new audio
    audio_bytes = await azure_tts.generate(text, voice_id, voice_settings)
    
    # Extract duration from WAV file
    duration = get_audio_duration(audio_bytes)
    
    # Store in blob storage
    blob_path = await blob_service.upload_audio(audio_bytes)
    
    # Create cache entry
    cache_entry = AudioCache(
        cache_key=cache_key,
        audio_blob_path=blob_path,
        audio_duration_seconds=duration,
        tenant_id=tenant_id,
        ...
    )
    db.add(cache_entry)
    db.commit()
```

### Step 4: Update Segment Metadata
```python
# Link segment to cached audio
metadata = db.query(AudioSegmentMetadata).filter(
    AudioSegmentMetadata.segment_id == segment_id,
    AudioSegmentMetadata.project_id == project_id,
    AudioSegmentMetadata.chapter_id == chapter_id
).first()

if metadata:
    metadata.raw_audio_cache_key = cache_key
    metadata.duration_seconds = duration
else:
    metadata = AudioSegmentMetadata(
        segment_id=segment_id,
        project_id=project_id,
        chapter_id=chapter_id,
        raw_audio_cache_key=cache_key,
        duration_seconds=duration
    )
    db.add(metadata)

db.commit()
```

### Step 5: Return Response
```json
{
  "success": true,
  "raw_audio_url": "https://blob.../audio.mp3?sas=...",
  "cache_status": "HIT" | "MISS",
  "duration": 3.45
}
```

---

## Chapter Audio Production Data Loading

### Endpoint: GET /projects/{id}/chapters/{id}/audio-production

Returns all segments with their audio status, URLs, and durations.

```python
# 1. Get orchestrated segments from ChapterPlan
plan_segments = chapter_plan.segments

# 2. Get all AudioSegmentMetadata for chapter
metadata_list = db.query(AudioSegmentMetadata).filter(
    project_id == project_id,
    chapter_id == chapter_id
).all()
metadata_dict = {m.segment_id: m for m in metadata_list}

# 3. Get SFX segments
sfx_segments = db.query(SfxSegment).filter(...).all()

# 4. Setup blob storage (project-specific credentials)
blob_service = BlobStorageService(...)

# 5. Build segment response
segments = []
for seg in plan_segments:
    metadata = metadata_dict.get(seg.id)
    
    # Determine if audio exists
    has_audio = metadata is not None and metadata.raw_audio_cache_key is not None
    
    # Get audio URL and duration from AudioCache
    raw_audio_url = None
    duration = metadata.duration_seconds if metadata else None
    
    if has_audio:
        cache_entry = db.query(AudioCache).filter(
            AudioCache.cache_key == metadata.raw_audio_cache_key,
            AudioCache.tenant_id == tenant_id
        ).first()
        
        if cache_entry:
            raw_audio_url = blob_service.get_blob_url(cache_entry.audio_blob_path)
            
            # Backfill duration if missing from metadata
            if not duration and cache_entry.audio_duration_seconds:
                duration = cache_entry.audio_duration_seconds
                metadata.duration_seconds = duration
                db.commit()
    
    segments.append({
        "segment_id": seg.id,
        "type": "plan",
        "text": seg.text,
        "voice": seg.voice,
        "has_audio": has_audio,
        "raw_audio_url": raw_audio_url,
        "duration": duration,
        "processing_chain": metadata.processing_chain if metadata else None,
        "needs_revision": metadata.needs_revision if metadata else False
    })

# 6. Add SFX segments
for sfx in sfx_segments:
    segments.append({
        "segment_id": str(sfx.id),
        "type": "sfx",
        "text": f"[SFX: {sfx.filename}]",
        "voice": "SFX",
        "has_audio": True,
        "raw_audio_url": blob_service.get_blob_url(sfx.blob_path),
        "duration": sfx.duration_seconds,
        ...
    })

return {"segments": segments}
```

---

## Duration Extraction

### WAV File Analysis
```python
import wave
import io

def get_audio_duration(audio_bytes: bytes) -> Optional[float]:
    """Extract duration from WAV audio bytes."""
    try:
        with io.BytesIO(audio_bytes) as audio_file:
            with wave.open(audio_file, 'rb') as wav:
                frames = wav.getnframes()
                rate = wav.getframerate()
                return frames / float(rate)
    except Exception as e:
        logger.warning(f"Failed to extract audio duration: {e}")
        return None
```

**When Duration is Extracted:**
1. ✅ On audio generation (cache MISS)
2. ✅ On cache retrieval if duration is NULL (backfill)
3. ✅ On chapter data loading if metadata exists but duration is NULL

---

## Frontend Audio Playback

### useAudioProduction Hook
```typescript
// Load chapter data
const loadChapterData = async () => {
  const data = await audioProductionApi.getChapterAudioProduction(projectId, chapterId);
  setSegments(data.segments);
  // Segments now have: has_audio, raw_audio_url, duration
};

// Generate audio for a segment
const generateSegmentAudio = async (segmentId, request) => {
  const response = await audioProductionApi.generateSegmentAudio(
    projectId, chapterId, segmentId, request
  );
  
  // Update local state with new audio
  setSegments(prev => prev.map(seg => 
    seg.segment_id === segmentId
      ? { ...seg, has_audio: true, raw_audio_url: response.raw_audio_url, duration: response.duration }
      : seg
  ));
};
```

### Playback Flow
1. User clicks Play button on segment
2. Frontend checks `has_audio` flag
3. If `has_audio: true`:
   - Use `raw_audio_url` to load audio
   - Display `duration` in UI
4. If `has_audio: false`:
   - Call `generateSegmentAudio()` first
   - Then play the audio

---

## Sound Effects (SFX) System

### Upload Flow
1. User selects segment, clicks "Insert Sound Effect"
2. User uploads WAV/MP3 file
3. Backend:
   - Validates file type
   - Uploads to blob storage
   - Extracts duration
   - Inserts SfxSegment at `display_order = selected_segment.display_order`
   - Shifts all existing segments with `display_order >= insertion_point` forward by 1
4. Frontend reloads chapter data

### Display Order
- Plan segments: `order * 100` (0, 100, 200, 300...)
- SFX segments: Any integer (can be inserted at 50, 150, 250...)
- This allows SFX to be inserted between plan segments

---

## Critical Data Relationships

```
ChapterPlan.segments (JSON)
  └─> Contains orchestration data (id, text, voice, order)
  
AudioSegmentMetadata (Database)
  ├─> segment_id: Links to ChapterPlan.segments[].id
  ├─> raw_audio_cache_key: Links to AudioCache.cache_key
  └─> duration_seconds: Copy of duration for fast access
  
AudioCache (Database)
  ├─> cache_key: Deterministic hash of TTS input
  ├─> audio_blob_path: Location in Azure Blob Storage
  └─> audio_duration_seconds: Extracted from WAV file

Azure Blob Storage
  └─> Stores actual audio bytes (WAV/MP3)
```

**Critical Rule**: A segment only has audio if:
1. AudioSegmentMetadata exists for that segment_id
2. AudioSegmentMetadata.raw_audio_cache_key is not NULL
3. AudioCache entry exists for that cache_key
4. Blob exists at AudioCache.audio_blob_path

---

## Common Issues & Solutions

### Issue: Segments show `has_audio: false` but audio exists in cache
**Cause**: Missing AudioSegmentMetadata records (old segments generated before metadata system)

**Solution**: Regenerate audio for affected segments OR create a migration script:
```python
# Migration: Link orphaned cache entries to segments
for segment in chapter_plan.segments:
    metadata = get_metadata(segment.id)
    if metadata:
        continue  # Already linked
    
    # Generate cache key
    cache_key = generate_cache_key(segment.text, segment.voice, {})
    
    # Check if cache exists
    cache_entry = db.query(AudioCache).filter(
        AudioCache.cache_key == cache_key
    ).first()
    
    if cache_entry:
        # Create metadata link
        metadata = AudioSegmentMetadata(
            segment_id=segment.id,
            raw_audio_cache_key=cache_key,
            duration_seconds=cache_entry.audio_duration_seconds
        )
        db.add(metadata)

db.commit()
```

### Issue: Duration shows 00:00 for existing segments
**Cause**: Duration not extracted during original generation

**Solution**: Backfill implemented - duration is extracted on next chapter load if NULL

### Issue: Play button doesn't update duration in grid
**Cause**: Frontend doesn't reload after playback

**Solution**: Add `await loadChapterData()` after `playSegment()` completes

---

## Performance Considerations

### Cache Efficiency
- Cache key includes prosody settings → separate cache per voice style
- Duration stored in both AudioCache and AudioSegmentMetadata for redundancy
- Blob URLs generated with SAS tokens (time-limited)

### Query Optimization
- AudioSegmentMetadata queried once per chapter load (batch)
- AudioCache queried only when has_audio=true
- Blob service reused across segments

---

## Testing Checklist

### Generate New Audio
- [ ] Cache MISS: Creates AudioCache entry with duration
- [ ] Cache MISS: Creates AudioSegmentMetadata with cache_key
- [ ] Cache HIT: Reuses existing AudioCache entry
- [ ] Cache HIT: Updates AudioSegmentMetadata.raw_audio_cache_key
- [ ] Duration extracted from WAV bytes
- [ ] Duration stored in both tables

### Load Chapter Data
- [ ] Segments with metadata show has_audio=true
- [ ] Segments without metadata show has_audio=false
- [ ] raw_audio_url generated from blob_path
- [ ] Duration displayed in grid
- [ ] SFX segments included with proper display_order

### Playback
- [ ] Audio loads from raw_audio_url
- [ ] Duration displays in playback bar
- [ ] VU meters work
- [ ] Waveform visualization appears

### SFX Upload
- [ ] File uploads to blob storage
- [ ] Duration extracted
- [ ] SfxSegment created with correct display_order
- [ ] Existing segments shifted forward
- [ ] Grid updates with [SFX: filename.wav]

---

## Future Enhancements

1. **L1 Redis Cache**: Add in-memory cache layer before database
2. **Batch Audio Generation**: Generate all segments in background job
3. **Duration Migration Script**: Backfill all NULL durations
4. **Metadata Repair Tool**: Link orphaned cache entries to segments
5. **Cache Invalidation**: Clear cache when voice settings change
6. **Audio Format Options**: Support MP3 output from TTS
7. **SFX Duration Extraction**: Extract duration during upload (currently hardcoded to 0.0)

---

## API Reference

### POST /api/v1/projects/{id}/chapters/{id}/segments/{id}/audio
Generate or retrieve cached audio for a segment.

**Request**:
```json
{
  "text": "Hello world",
  "voice": "es-PE-AlexNeural",
  "prosody": {
    "style": "cheerful",
    "rate_pct": 0,
    "pitch_pct": 0
  }
}
```

**Response**:
```json
{
  "success": true,
  "raw_audio_url": "https://blob.../audio.mp3?sas=...",
  "cache_status": "HIT",
  "duration": 2.34
}
```

### GET /api/v1/projects/{id}/chapters/{id}/audio-production
Get all segments with audio status, URLs, and durations.

**Response**:
```json
{
  "segments": [
    {
      "segment_id": "uuid",
      "type": "plan",
      "display_order": 0,
      "text": "Hello",
      "voice": "Narrator",
      "character_name": "Narrator",
      "has_audio": true,
      "raw_audio_url": "https://...",
      "duration": 1.23,
      "processing_chain": {...},
      "needs_revision": false
    },
    {
      "segment_id": "uuid",
      "type": "sfx",
      "display_order": 50,
      "text": "[SFX: door.wav]",
      "voice": "SFX",
      "has_audio": true,
      "raw_audio_url": "https://...",
      "duration": 0.5
    }
  ]
}
```

### POST /api/v1/projects/{id}/chapters/{id}/sfx
Upload sound effect file.

**Request**: multipart/form-data
- `file`: WAV or MP3 file
- `display_order`: Integer position

**Response**:
```json
{
  "sfx_id": "uuid",
  "filename": "door.wav",
  "duration": 0.5,
  "display_order": 50
}
```

---

## Environment Configuration

### Azure Blob Storage (Project-Specific)
```json
project.settings.creds.storage.azure = {
  "accountName": "cacheblob",
  "accessKey": "...",
  "containerName": "audios"
}
```

### Azure TTS
```json
project.settings = {
  "azure_tts_key": "...",
  "azure_tts_region": "eastus"
}
```

---

**Document Version**: 1.0  
**Last Updated**: December 2025  
**Author**: Architecture Documentation  
**Status**: Current Implementation
