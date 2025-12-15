# Orchestration Module Implementation Plan - Web App

## Executive Summary

The Orchestration module (Planning page in desktop app) is the most complex page in Khipu Studio. It serves as the central workflow hub for converting manuscript chapters into production-ready audio plans with character assignments, segmentation, and quality review capabilities.

**Current Status:**
- Desktop app: ✅ Fully implemented (`app/src/pages/Planning.tsx`, 2626 lines)
- Web app: ❌ Stub only (`khipu-web/src/routes/projects.$projectId.orchestration.tsx`, 30 lines)

---

## 1. Core Features to Implement

### 1.1 Plan Management
- [ ] **Single Chapter Plan Generation**: Generate plan for one chapter at a time using Azure TTS constraints
- [ ] **Segment Segmentation**: Automatically divide chapter text into segments respecting Azure TTS limits (max 48KB)
- [ ] **Character Assignment**: LLM-powered automatic character/voice assignment to dialogue segments
- [ ] **Chapter Completion Tracking**: Mark individual chapters as complete and track global planning workflow status
- [ ] **Revision Marking**: Mark segments that need revision with visual flags

### 1.2 Segment Operations
- [ ] **Split Segments**: Split a segment at cursor position with smart word boundary detection
- [ ] **Merge Segments**: Merge adjacent segments (forward/backward)
- [ ] **Delete Segments**: Remove segments (prevents deleting last segment)
- [ ] **Edit Segments**: Inline text editing with live preview
- [ ] **Undo Operations**: Maintain history of last 50 segment operations with undo capability

### 1.3 Audio Features
- [ ] **Segment Audition**: Preview how a segment sounds with assigned character voice
- [ ] **Audio Caching**: Intelligent audio cache with invalidation on text changes
- [ ] **Character Voice Preview**: Use full character voice assignment (voice ID, style, rate, pitch, styledegree)
- [ ] **SSML Phoneme Injection**: Apply project pronunciation map to audition text

---

## 2. Frontend Implementation

### 2.1 React Components

#### Main Page Component
**File:** `khipu-web/src/routes/projects.$projectId.orchestration.tsx`

**Required State:**
```typescript
// Chapter management
const [chapters, setChapters] = useState<Chapter[]>([]);
const [selectedChapter, setSelectedChapter] = useState<string>("");
const [chapterStatus, setChapterStatus] = useState<Map<string, ChapterStatus>>(new Map());

// Segment management
const [segments, setSegments] = useState<Segment[] | null>(null);
const [segmentHistory, setSegmentHistory] = useState<Segment[][]>([]);
const [historyIndex, setHistoryIndex] = useState(-1);

// Characters and configuration
const [availableCharacters, setAvailableCharacters] = useState<string[]>([]);
const [charactersData, setCharactersData] = useState<CharacterData[]>([]);
const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);

// Operation states
const [loading, setLoading] = useState(false);
const [running, setRunning] = useState(false);
const [assigningCharacters, setAssigningCharacters] = useState(false);
const [message, setMessage] = useState<string>("");
const [planProgress, setPlanProgress] = useState<{current: number, total: number, stage: string} | null>(null);
const [characterAssignmentProgress, setCharacterAssignmentProgress] = useState<{current: number, total: number, stage: string} | null>(null);

// UI state
const [onlyUnknown, setOnlyUnknown] = useState(false);
const [selIndex, setSelIndex] = useState(0);
const [revisionMarks, setRevisionMarks] = useState<Set<string>>(new Set());
const [auditioningSegments, setAuditioningSegments] = useState<Set<number>>(new Set());
```

#### EditablePreview Component
**Purpose:** Display and edit segment text with operations

**Required State:**
```typescript
const [isEditing, setIsEditing] = useState(false);
const [editedText, setEditedText] = useState("");
const [cursorPosition, setCursorPosition] = useState(0);
const [message, setMessage] = useState<string>("");
```

**Features:**
- Text display with formatted rendering
- Edit mode with textarea and cursor tracking
- Inline statistics (words, chars, KB)
- Action buttons (Edit, Save, Cancel, Split, Merge, Delete, Audition)
- Keyboard shortcuts (Esc, Ctrl+Enter)

#### SegmentTable Component
**Purpose:** Display all segments in a scrollable table

**Columns:**
- Selection indicator (▶)
- Revision flag toggle (🏳/🚩)
- Segment ID
- Delimiter type
- Start/End character indices
- Length
- Character dropdown (inline editing)

### 2.2 Utility Functions

#### Segment Validation
```typescript
function estimateKBSize(text: string): number;
function countWords(text: string): number;
function validateSegmentSize(text: string): { valid: boolean; reason?: string; stats: { chars: number; words: number; kb: number } };
```

#### Segment Operations
```typescript
function splitSegmentAtPosition(segments: Segment[], segmentId: number, position: number, t: Function): SegmentOpResult;
function mergeSegments(segments: Segment[], segmentId: number, direction: 'forward' | 'backward', t: Function): SegmentOpResult;
function deleteSegment(segments: Segment[], segmentId: number, t: Function): SegmentOpResult;
```

### 2.3 Custom Hooks

#### useAudioCache Hook
Already exists in desktop app, needs web adaptation:
```typescript
const { isPlaying, isLoading, error, playAudition, stopAudio, clearError } = useAudioCache();
```

#### useSegmentOperations Hook (New)
```typescript
const {
  segments,
  setSegments,
  canUndo,
  undoOperation,
  splitSegment,
  mergeSegment,
  deleteSegment,
  updateSegmentVoice
} = useSegmentOperations(initialSegments);
```

### 2.4 TypeScript Types

**File:** `khipu-web/src/types/planning.ts`
```typescript
export interface Segment {
  segment_id: number;
  start_idx: number;
  end_idx: number;
  delimiter: string;
  text: string;
  originalText?: string;
  voice?: string;
  needsRevision?: boolean;
}

export interface PlanRow {
  rowKey: string;
  segmentId: number;
  start: number;
  end: number;
  length: number;
  voice: string;
  delimiter: string;
}

export interface ChapterStatus {
  hasText: boolean;
  hasPlan: boolean;
  isComplete: boolean;
}

export interface SegmentOpResult {
  success: boolean;
  message?: string;
  newSegments?: Segment[];
}

export interface AzureCaps {
  maxKB: number;
  hardCapMin: number;
  wpm: number;
  overhead: number;
}
```

---

## 3. Backend Implementation

### 3.1 New API Endpoints

#### Planning/Orchestration Router
**File:** `khipu-cloud-api/services/planning/router.py` (NEW)

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

# ============================================
# PLAN MANAGEMENT ENDPOINTS
# ============================================

@router.post("/{project_id}/chapters/{chapter_id}/plan/generate")
async def generate_chapter_plan(
    project_id: str,
    chapter_id: str,
    options: PlanGenerateOptions,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> PlanGenerateResponse:
    """
    Generate TTS-compliant plan for a chapter.
    - Calls Python segmentation service
    - Respects Azure TTS 48KB limit
    - Returns array of segments
    """
    pass

@router.get("/{project_id}/chapters/{chapter_id}/plan")
async def get_chapter_plan(
    project_id: str,
    chapter_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> ChapterPlanResponse:
    """
    Retrieve existing plan for a chapter.
    """
    pass

@router.put("/{project_id}/chapters/{chapter_id}/plan")
async def update_chapter_plan(
    project_id: str,
    chapter_id: str,
    segments: List[SegmentUpdate],
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> ChapterPlanResponse:
    """
    Update segments in a chapter plan.
    - Auto-saves on client debounce
    - Updates segment text, voice assignments
    """
    pass

# ============================================
# SEGMENT OPERATIONS ENDPOINTS
# ============================================

@router.post("/{project_id}/chapters/{chapter_id}/plan/segments/{segment_id}/split")
async def split_segment(
    project_id: str,
    chapter_id: str,
    segment_id: int,
    split_data: SplitSegmentRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> SegmentOperationResponse:
    """
    Split a segment at a specified position.
    - Smart word boundary detection
    - Validates resulting segment sizes
    - Returns updated segments array
    """
    pass

@router.post("/{project_id}/chapters/{chapter_id}/plan/segments/{segment_id}/merge")
async def merge_segments(
    project_id: str,
    chapter_id: str,
    segment_id: int,
    merge_data: MergeSegmentRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> SegmentOperationResponse:
    """
    Merge segment with adjacent segment.
    - Direction: forward or backward
    - Validates merged size
    """
    pass

@router.delete("/{project_id}/chapters/{chapter_id}/plan/segments/{segment_id}")
async def delete_segment(
    project_id: str,
    chapter_id: str,
    segment_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> SegmentOperationResponse:
    """
    Delete a segment from plan.
    - Prevents deleting last segment
    """
    pass

# ============================================
# CHARACTER ASSIGNMENT ENDPOINTS
# ============================================

@router.post("/{project_id}/chapters/{chapter_id}/plan/assign-characters")
async def assign_characters_to_segments(
    project_id: str,
    chapter_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> CharacterAssignmentResponse:
    """
    Use LLM to assign characters to segments.
    - Loads chapter text and character list
    - Calls LLM service
    - Updates segment voice assignments
    - Returns assignments with confidence scores
    """
    pass

# ============================================
# COMPLETION TRACKING ENDPOINTS
# ============================================

@router.post("/{project_id}/chapters/{chapter_id}/complete")
async def mark_chapter_complete(
    project_id: str,
    chapter_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> CompletionResponse:
    """
    Mark a chapter as complete.
    - Saves completion marker
    - Checks if all chapters complete
    - Updates global workflow status if needed
    """
    pass

@router.get("/{project_id}/chapters/status")
async def get_chapters_status(
    project_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> ChaptersStatusResponse:
    """
    Get status of all chapters (hasText, hasPlan, isComplete).
    """
    pass

# ============================================
# REVISION MARKING ENDPOINTS
# ============================================

@router.post("/{project_id}/chapters/{chapter_id}/plan/segments/{segment_id}/revision")
async def toggle_revision_mark(
    project_id: str,
    chapter_id: str,
    segment_id: int,
    mark: bool,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> RevisionMarkResponse:
    """
    Toggle revision flag on a segment.
    """
    pass
```

### 3.2 Database Models

#### Plan Storage Model
**File:** `khipu-cloud-api/shared/models/plan.py` (NEW)

```python
from sqlalchemy import Column, String, Integer, Text, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from .base import Base
import datetime

class ChapterPlan(Base):
    """Stores chapter plans with segments."""
    __tablename__ = "chapter_plans"
    
    id = Column(String(36), primary_key=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    chapter_id = Column(String(36), ForeignKey("chapters.id"), nullable=False, unique=True)
    
    segments = Column(JSON, nullable=False)  # Array of Segment objects
    
    is_complete = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    # Relationships
    project = relationship("Project", back_populates="chapter_plans")
    chapter = relationship("Chapter", back_populates="plan", uselist=False)
```

**Note:** Segments are stored as JSON array for flexibility. Each segment has:
```json
{
  "segment_id": 1,
  "start_idx": 0,
  "end_idx": 150,
  "delimiter": "paragraph",
  "text": "...",
  "originalText": "...",
  "voice": "character_name",
  "needsRevision": false
}
```

### 3.3 Python Backend Services

#### Segmentation Service
**File:** `khipu-cloud-api/services/planning/segmentation.py` (NEW)

```python
"""Chapter text segmentation service."""
import re
from typing import List, Dict

MAX_KB = 48
OVERHEAD = 0.15
RECOMMENDED_CHARS = 2800

def estimate_kb_size(text: str) -> float:
    """Estimate byte size with SSML overhead."""
    text_bytes = len(text.encode('utf-8'))
    return (text_bytes * (1 + OVERHEAD)) / 1024

def segment_chapter_text(
    chapter_text: str,
    max_kb: int = MAX_KB
) -> List[Dict]:
    """
    Segment chapter text into TTS-compliant segments.
    
    Args:
        chapter_text: Full chapter text
        max_kb: Maximum KB per segment
        
    Returns:
        List of segment dictionaries
    """
    # Split by paragraphs first
    paragraphs = chapter_text.split('\n\n')
    
    segments = []
    current_segment = ""
    segment_id = 1
    start_idx = 0
    
    for para in paragraphs:
        # Check if adding this paragraph would exceed limit
        test_text = current_segment + "\n\n" + para if current_segment else para
        
        if estimate_kb_size(test_text) > max_kb:
            # Save current segment
            if current_segment:
                segments.append({
                    "segment_id": segment_id,
                    "start_idx": start_idx,
                    "end_idx": start_idx + len(current_segment),
                    "delimiter": "paragraph",
                    "text": current_segment.strip(),
                    "originalText": current_segment.strip()
                })
                segment_id += 1
                start_idx += len(current_segment) + 2  # +2 for \n\n
            
            # Check if single paragraph is too large
            if estimate_kb_size(para) > max_kb:
                # Split by sentences
                sentences = split_sentences(para)
                for sentence in sentences:
                    segments.append({
                        "segment_id": segment_id,
                        "start_idx": start_idx,
                        "end_idx": start_idx + len(sentence),
                        "delimiter": "sentence",
                        "text": sentence.strip(),
                        "originalText": sentence.strip()
                    })
                    segment_id += 1
                    start_idx += len(sentence) + 1
                current_segment = ""
            else:
                current_segment = para
        else:
            current_segment = test_text
    
    # Add final segment
    if current_segment:
        segments.append({
            "segment_id": segment_id,
            "start_idx": start_idx,
            "end_idx": start_idx + len(current_segment),
            "delimiter": "paragraph",
            "text": current_segment.strip(),
            "originalText": current_segment.strip()
        })
    
    return segments

def split_sentences(text: str) -> List[str]:
    """Split text into sentences."""
    # Simple sentence splitting (can be enhanced)
    return re.split(r'(?<=[.!?])\s+', text)
```

#### Character Assignment Service
**File:** `khipu-cloud-api/services/planning/character_assignment.py` (NEW)

```python
"""LLM-powered character assignment to segments."""
from typing import List, Dict
from ..llm_client import LLMClient

async def assign_characters_to_segments(
    chapter_text: str,
    segments: List[Dict],
    available_characters: List[str],
    llm_client: LLMClient
) -> List[Dict]:
    """
    Use LLM to assign characters to dialogue segments.
    
    Args:
        chapter_text: Full chapter text for context
        segments: List of segment dicts
        available_characters: List of character names
        llm_client: LLM client instance
        
    Returns:
        List of assignments with confidence scores
    """
    prompt = f"""
Analyze this chapter and assign character names to each dialogue segment.

Available characters: {', '.join(available_characters)}

Chapter text:
{chapter_text[:2000]}... [truncated]

Segments:
{format_segments_for_llm(segments)}

Return a JSON array with assignments:
[
  {{
    "segment_id": 1,
    "assigned_character": "character_name",
    "confidence": 0.95,
    "reasoning": "Brief explanation"
  }},
  ...
]
"""
    
    response = await llm_client.chat(prompt, response_format="json")
    assignments = parse_llm_response(response)
    
    return assignments

def format_segments_for_llm(segments: List[Dict]) -> str:
    """Format segments for LLM prompt."""
    formatted = []
    for seg in segments[:50]:  # Limit to first 50 for token efficiency
        formatted.append(f"Segment {seg['segment_id']}: {seg['text'][:200]}...")
    return "\n".join(formatted)
```

### 3.4 WebSocket Support (Optional but Recommended)

For real-time progress updates during long-running operations:

**File:** `khipu-cloud-api/services/planning/websocket.py` (NEW)

```python
from fastapi import WebSocket
from typing import Dict

class PlanningProgressManager:
    def __init__(self):
        self.connections: Dict[str, WebSocket] = {}
    
    async def connect(self, client_id: str, websocket: WebSocket):
        await websocket.accept()
        self.connections[client_id] = websocket
    
    def disconnect(self, client_id: str):
        if client_id in self.connections:
            del self.connections[client_id]
    
    async def send_progress(self, client_id: str, progress: Dict):
        if client_id in self.connections:
            await self.connections[client_id].send_json(progress)

progress_manager = PlanningProgressManager()
```

---

## 4. API Client Integration

### 4.1 Frontend API Service
**File:** `khipu-web/src/api/planning.ts` (NEW)

```typescript
import apiClient from './client';
import type { Segment, ChapterStatus, PlanGenerateOptions } from '../types/planning';

export const planningApi = {
  // Plan management
  generatePlan: async (projectId: string, chapterId: string, options: PlanGenerateOptions) => {
    const response = await apiClient.post(
      `/api/projects/${projectId}/chapters/${chapterId}/plan/generate`,
      options
    );
    return response.data;
  },

  getPlan: async (projectId: string, chapterId: string) => {
    const response = await apiClient.get(
      `/api/projects/${projectId}/chapters/${chapterId}/plan`
    );
    return response.data;
  },

  updatePlan: async (projectId: string, chapterId: string, segments: Segment[]) => {
    const response = await apiClient.put(
      `/api/projects/${projectId}/chapters/${chapterId}/plan`,
      { segments }
    );
    return response.data;
  },

  // Segment operations
  splitSegment: async (
    projectId: string,
    chapterId: string,
    segmentId: number,
    position: number
  ) => {
    const response = await apiClient.post(
      `/api/projects/${projectId}/chapters/${chapterId}/plan/segments/${segmentId}/split`,
      { position }
    );
    return response.data;
  },

  mergeSegments: async (
    projectId: string,
    chapterId: string,
    segmentId: number,
    direction: 'forward' | 'backward'
  ) => {
    const response = await apiClient.post(
      `/api/projects/${projectId}/chapters/${chapterId}/plan/segments/${segmentId}/merge`,
      { direction }
    );
    return response.data;
  },

  deleteSegment: async (projectId: string, chapterId: string, segmentId: number) => {
    const response = await apiClient.delete(
      `/api/projects/${projectId}/chapters/${chapterId}/plan/segments/${segmentId}`
    );
    return response.data;
  },

  // Character assignment
  assignCharacters: async (projectId: string, chapterId: string) => {
    const response = await apiClient.post(
      `/api/projects/${projectId}/chapters/${chapterId}/plan/assign-characters`
    );
    return response.data;
  },

  // Completion tracking
  markChapterComplete: async (projectId: string, chapterId: string) => {
    const response = await apiClient.post(
      `/api/projects/${projectId}/chapters/${chapterId}/complete`
    );
    return response.data;
  },

  getChaptersStatus: async (projectId: string) => {
    const response = await apiClient.get(
      `/api/projects/${projectId}/chapters/status`
    );
    return response.data;
  },

  // Revision marks
  toggleRevisionMark: async (
    projectId: string,
    chapterId: string,
    segmentId: number,
    mark: boolean
  ) => {
    const response = await apiClient.post(
      `/api/projects/${projectId}/chapters/${chapterId}/plan/segments/${segmentId}/revision`,
      { mark }
    );
    return response.data;
  },
};
```

---

## 5. Audio System Integration

### 5.1 Audio Cache Service (Web Adaptation)

The desktop app has a sophisticated audio cache system. For the web app, we need to adapt it:

**File:** `khipu-web/src/lib/audio-cache.ts` (NEW)

```typescript
import { generateAudition } from '../api/voices';
import type { Voice, ProjectConfig } from '../types';

interface CacheEntry {
  audioBlob: Blob;
  timestamp: number;
  cacheKey: string;
}

// In-memory cache for the session
const audioCache = new Map<string, CacheEntry>();

// Maximum cache size (in MB)
const MAX_CACHE_SIZE_MB = 100;
const MAX_CACHE_AGE_MS = 30 * 60 * 1000; // 30 minutes

export function generateCacheKey(params: {
  voice: Voice;
  config: ProjectConfig;
  text: string;
  style?: string;
  styledegree?: number;
  rate_pct?: number;
  pitch_pct?: number;
}): string {
  const { voice, text, style, styledegree, rate_pct, pitch_pct } = params;
  
  // Create deterministic cache key
  const key = JSON.stringify({
    voiceId: voice.id,
    text: text.substring(0, 200), // First 200 chars
    textHash: simpleHash(text), // Full text hash
    style,
    styledegree,
    rate_pct,
    pitch_pct,
  });
  
  return btoa(key); // Base64 encode
}

export async function getOrGenerateAudio(
  params: {
    voice: Voice;
    config: ProjectConfig;
    text: string;
    style?: string;
    styledegree?: number;
    rate_pct?: number;
    pitch_pct?: number;
  },
  useCache: boolean = true
): Promise<Blob> {
  const cacheKey = generateCacheKey(params);
  
  // Check cache
  if (useCache) {
    const cached = audioCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < MAX_CACHE_AGE_MS) {
      console.log('🎵 Cache hit:', cacheKey);
      return cached.audioBlob;
    }
  }
  
  // Generate new audio
  console.log('🎤 Generating audio:', cacheKey);
  const audioBlob = await generateAudition(
    params.voice.id,
    params.text,
    params.style,
    params.styledegree,
    params.rate_pct,
    params.pitch_pct
  );
  
  // Cache it
  if (useCache) {
    audioCache.set(cacheKey, {
      audioBlob,
      timestamp: Date.now(),
      cacheKey,
    });
    
    // Cleanup if cache is too large
    cleanupCache();
  }
  
  return audioBlob;
}

export function deleteAudioCacheEntry(cacheKey: string): boolean {
  return audioCache.delete(cacheKey);
}

export function clearAudioCache(): void {
  audioCache.clear();
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

function cleanupCache(): void {
  // Remove oldest entries if cache is too large
  const entries = Array.from(audioCache.entries());
  
  // Sort by timestamp (oldest first)
  entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
  
  // Calculate total size (approximate)
  let totalSize = 0;
  for (const [, entry] of entries) {
    totalSize += entry.audioBlob.size;
  }
  
  // Remove oldest entries until under limit
  while (totalSize > MAX_CACHE_SIZE_MB * 1024 * 1024 && entries.length > 0) {
    const [key, entry] = entries.shift()!;
    totalSize -= entry.audioBlob.size;
    audioCache.delete(key);
  }
}
```

### 5.2 Audio Playback Hook
**File:** `khipu-web/src/hooks/useAudioCache.ts` (NEW)

```typescript
import { useState, useCallback, useRef } from 'react';
import { getOrGenerateAudio, deleteAudioCacheEntry } from '../lib/audio-cache';
import type { Voice, ProjectConfig } from '../types';

export function useAudioCache() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const playAudition = useCallback(async (
    params: {
      voice: Voice;
      config: ProjectConfig;
      text: string;
      style?: string;
      styledegree?: number;
      rate_pct?: number;
      pitch_pct?: number;
      page?: string;
    },
    useCache: boolean = true
  ) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      
      // Get or generate audio
      const audioBlob = await getOrGenerateAudio(params, useCache);
      
      // Create audio element and play
      const audio = new Audio(URL.createObjectURL(audioBlob));
      audioRef.current = audio;
      
      audio.onplay = () => setIsPlaying(true);
      audio.onended = () => {
        setIsPlaying(false);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setError('Failed to play audio');
        setIsPlaying(false);
        audioRef.current = null;
      };
      
      await audio.play();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Audio playback error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
    }
  }, []);
  
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  
  return {
    isPlaying,
    isLoading,
    error,
    playAudition,
    stopAudio,
    clearError,
  };
}
```

---

## 6. Migration Considerations

### 6.1 Data Format Compatibility

The desktop app uses file-based storage, while the web app uses database storage. We need to ensure compatibility:

**Desktop Format (File: `ssml/plans/{chapterId}.plan.json`):**
```json
[
  {
    "segment_id": 1,
    "start_idx": 0,
    "end_idx": 150,
    "delimiter": "paragraph",
    "text": "...",
    "originalText": "...",
    "voice": "character_name",
    "needsRevision": false
  }
]
```

**Web Format (Database: `chapter_plans.segments` JSON column):**
Same structure, stored as JSON array in database.

### 6.2 Feature Parity Checklist

| Feature | Desktop | Web | Notes |
|---------|---------|-----|-------|
| Generate Plan | ✅ | ❌ | Needs Python segmentation service |
| Load Plan | ✅ | ❌ | Needs API endpoint |
| Save Plan | ✅ | ❌ | Auto-save with debounce |
| Split Segment | ✅ | ❌ | Client-side + server validation |
| Merge Segment | ✅ | ❌ | Client-side + server validation |
| Delete Segment | ✅ | ❌ | Client-side + server validation |
| Edit Segment | ✅ | ❌ | Client-side only, save on blur |
| Undo Operations | ✅ | ❌ | Client-side history stack |
| Character Assignment | ✅ | ❌ | Needs LLM service |
| Segment Audition | ✅ | ❌ | Needs audio cache |
| Revision Marking | ✅ | ❌ | Needs API endpoint |
| Completion Tracking | ✅ | ❌ | Needs API endpoint |
| Progress Tracking | ✅ | ❌ | WebSocket or polling |
| Keyboard Navigation | ✅ | ❌ | Client-side |
| Chapter Status Icons | ✅ | ❌ | Client-side |

---

## 7. Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Create database models (`ChapterPlan`)
- [ ] Create backend router structure (`services/planning/router.py`)
- [ ] Create frontend API client (`api/planning.ts`)
- [ ] Create TypeScript types (`types/planning.ts`)
- [ ] Set up basic page structure with chapter selector

### Phase 2: Core Functionality (Week 2-3)
- [ ] Implement plan generation endpoint
- [ ] Implement Python segmentation service
- [ ] Implement segment loading and display
- [ ] Implement segment table component
- [ ] Implement EditablePreview component
- [ ] Add keyboard navigation

### Phase 3: Segment Operations (Week 4)
- [ ] Implement split segment (frontend + backend)
- [ ] Implement merge segments (frontend + backend)
- [ ] Implement delete segment (frontend + backend)
- [ ] Implement undo functionality (frontend only)
- [ ] Add segment size validation

### Phase 4: Character Assignment (Week 5)
- [ ] Implement LLM character assignment service
- [ ] Create character assignment endpoint
- [ ] Add character dropdown to table
- [ ] Implement progress tracking

### Phase 5: Audio Integration (Week 6)
- [ ] Implement audio cache system
- [ ] Create useAudioCache hook
- [ ] Add audition buttons to UI
- [ ] Integrate with voice API
- [ ] Add cache invalidation on edits

### Phase 6: Advanced Features (Week 7)
- [ ] Implement revision marking
- [ ] Add completion tracking
- [ ] Implement chapter status checking
- [ ] Add progress indicators
- [ ] Implement WebSocket for real-time updates (optional)

### Phase 7: Polish & Testing (Week 8)
- [ ] Add loading states and error handling
- [ ] Implement debounced auto-save
- [ ] Add keyboard shortcuts
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Performance optimization
- [ ] Documentation

---

## 8. Testing Strategy

### 8.1 Unit Tests

**Frontend:**
- Segment validation functions
- Segment operation functions
- Cache key generation
- Component rendering
- Hook behavior

**Backend:**
- Segmentation algorithm
- Character assignment logic
- Segment validation
- Database operations

### 8.2 Integration Tests

- Plan generation end-to-end
- Character assignment end-to-end
- Segment operations with database
- Audio cache behavior
- Auto-save functionality

### 8.3 E2E Tests

- Complete workflow: select chapter → generate plan → assign characters → edit segments → mark complete
- Keyboard navigation
- Audio playback
- Error recovery

---

## 9. Performance Considerations

### 9.1 Optimization Strategies

1. **Debounced Auto-save**: Save plan 2 seconds after last change
2. **Virtual Scrolling**: For chapters with 100+ segments
3. **Audio Cache**: In-memory blob cache with size limits
4. **Lazy Loading**: Load character data only when needed
5. **Memoization**: Use React.memo for segment rows
6. **WebSocket**: For real-time progress updates (avoid polling)

### 9.2 Expected Performance

- **Plan Generation**: 5-30 seconds depending on chapter size
- **Character Assignment**: 10-60 seconds depending on LLM response time
- **Segment Operations**: < 100ms (client-side)
- **Audio Generation**: 2-5 seconds per segment
- **Audio Playback**: Instant (from cache)

---

## 10. Security Considerations

1. **Permission Checks**: All endpoints require READ or WRITE permission
2. **Input Validation**: Validate segment text, position, direction parameters
3. **Rate Limiting**: Limit LLM calls to prevent abuse
4. **Tenant Isolation**: Ensure plans are scoped to tenant
5. **Audio Cache**: Store in secure, tenant-specific directories

---

## 11. Documentation Requirements

1. **User Guide**: How to use orchestration page
2. **API Documentation**: OpenAPI spec for all endpoints
3. **Developer Guide**: Component architecture, state flow
4. **Migration Guide**: Desktop → Web data migration

---

## 12. Dependencies

### Frontend
- React Query (for API state management)
- Tanstack Router (already in use)
- React Hooks (useState, useEffect, useMemo, useCallback, useRef)

### Backend
- FastAPI (already in use)
- SQLAlchemy (already in use)
- Python text processing libraries
- LLM client (already exists)

---

## 13. Success Criteria

✅ **Feature Complete**: All desktop features working in web app
✅ **Performance**: Operations complete within expected time ranges
✅ **Reliability**: 99%+ success rate for all operations
✅ **User Experience**: Smooth, responsive UI with keyboard shortcuts
✅ **Data Integrity**: No data loss during operations
✅ **Test Coverage**: 80%+ code coverage

---

## 14. Open Questions

1. **Audio Storage**: Should we store generated audio in cloud storage or regenerate on demand?
   - **Recommendation**: Regenerate on demand, use session cache only
   
2. **Undo/Redo**: Should we persist undo history across sessions?
   - **Recommendation**: No, keep it session-only for simplicity
   
3. **Concurrent Editing**: How to handle multiple users editing same plan?
   - **Recommendation**: Last write wins for MVP, add conflict detection later
   
4. **Large Chapters**: How to handle chapters with 500+ segments?
   - **Recommendation**: Virtual scrolling + pagination

---

## 15. References

- Desktop Implementation: `app/src/pages/Planning.tsx` (2626 lines)
- Desktop Types: `app/src/types/plan.ts`
- Desktop Audio Cache: `app/src/lib/audio-cache.ts`
- Desktop Audio Hook: `app/src/hooks/useAudioCache.ts`
- Characters Service: `khipu-cloud-api/services/characters/`
- Voices Service: `khipu-cloud-api/services/voices/`

---

## Conclusion

The Orchestration module is the most complex page in Khipu Studio, requiring careful implementation across frontend, backend, and integration layers. This plan provides a comprehensive roadmap for achieving feature parity between desktop and web applications.

**Estimated Total Effort**: 8-10 weeks for a single full-stack developer

**Priority**: HIGH - This is a critical workflow bottleneck

**Risk Level**: MEDIUM - Complex LLM integration and audio handling

**Dependencies**: Requires Characters and Voices services to be complete
