# Khipu Studio - Feature Specifications

## Overview

This document provides detailed technical specifications for all features in Khipu Studio, an AI-powered audiobook production application.

---

## 1. Project Management

### 1.1 Home / Project Hub

**Purpose:** Central hub for project creation, selection, and recent project access.

**Key Components:**
- Recent Projects List with metadata display
- Create New Project wizard
- Open Existing Project dialog
- Project cover image management

**Technical Implementation:**
- Recent projects stored in application settings
- Project metadata loaded from `project.khipu.json` and `book.meta.json`
- Cover image loading with multiple fallback options
- Async project validation and enrichment

**Data Structures:**
```typescript
interface RecentItem {
  path: string;
  name: string;
  title?: string;
  authors?: string[];
  language?: string;
  coverImage?: string;
}
```

**Features:**
- Visual project cards with cover images
- Metadata display (title, authors, language)
- Quick project access
- Project health indicators

---

## 2. Book Metadata Management

### 2.1 Book Configuration

**Purpose:** Define book metadata, cover art, and publication details.

**Key Components:**
- Book title and subtitle fields
- Author information management
- Language and locale settings
- Cover image selection and management
- Publication metadata (ISBN, publisher, etc.)

**Technical Implementation:**
- Dual storage system: `project.khipu.json` (legacy) and `book.meta.json` (optimized)
- Image validation and processing
- Schema validation with Zod
- Real-time form validation

**Data Structures:**
```typescript
interface BookMeta {
  title: string;
  subtitle?: string;
  authors: string[];
  language: string;
  isbn?: string;
  publisher?: string;
  coverImage?: string;
  description?: string;
  keywords?: string[];
}
```

**Features:**
- Multi-author support
- Cover image preview
- Language-specific settings
- Export metadata generation

---

## 3. Project Setup and Structure

### 3.1 Project Initialization

**Purpose:** Create standardized project structure with required folders and configuration files.

**Key Components:**
- Project template application
- Directory structure creation
- Default configuration generation
- Voice inventory bootstrap

**Technical Implementation:**
- Template-based project creation
- Atomic folder structure creation
- Configuration file generation from schemas
- Voice inventory initialization from comprehensive database

**Project Structure:**
```
project_name/
├── analysis/
│   └── chapters_txt/          # Editable chapter text files
├── art/                       # Cover images and artwork
├── audio/                     # Generated audio files
├── dossier/                   # Character and world information
├── ssml/                      # Generated SSML files
├── project.khipu.json         # Project configuration
└── book.meta.json             # Book metadata
```

**Features:**
- Template-based initialization
- Atomic operations (all-or-nothing)
- Default settings application
- Validation of required structure

---

## 4. Manuscript Management

### 4.1 Chapter Management

**Purpose:** Import, organize, and edit manuscript content by chapter.

**Key Components:**
- Chapter file listing and status
- Text import and export
- Chapter editor with syntax highlighting
- File validation and health checks

**Technical Implementation:**
- File system integration via Electron IPC
- Text encoding detection and handling
- Real-time file watching for external changes
- Chapter status computation

**Data Structures:**
```typescript
interface Chapter {
  id: string;
  title?: string;
  relPath: string;
}

interface ChapterStatus {
  hasText: boolean;
  hasPlan: boolean;
  isComplete: boolean;
}
```

**Features:**
- Drag-and-drop chapter import
- In-app text editing
- Chapter reordering
- External file synchronization

---

## 5. Character and Voice Management

### 5.1 Character Definition (Dossier)

**Purpose:** Define characters, their descriptions, and voice characteristics for consistent casting.

**Key Components:**
- Character profile creation
- Voice characteristic definition
- Relationship mapping
- Character validation

**Technical Implementation:**
- JSON-based character storage
- Schema validation for character data
- Voice assignment integration
- Character conflict resolution

**Data Structures:**
```typescript
interface Character {
  id: string;
  name: string;
  description?: string;
  voiceAssignment: VoiceAssignment;
  isNarrator?: boolean;
}

interface VoiceAssignment {
  voiceId: string;
  style?: string;
  styledegree?: number;
  rate_pct?: number;
  pitch_pct?: number;
}
```

**Features:**
- Character profile management
- Voice preference definition
- Narrator identification
- Casting consistency validation

### 5.2 Voice Casting

**Purpose:** Assign specific voices to characters with style and delivery parameters.

**Key Components:**
- Voice inventory management
- Character-to-voice mapping
- Voice audition system
- Casting validation

**Technical Implementation:**
- Azure TTS voice integration
- Voice filtering by language/engine
- Real-time audition generation
- Casting conflict detection

**Features:**
- Comprehensive voice library
- Voice audition with custom text
- Style and rate adjustments
- Multi-engine support

---

## 6. Content Planning and Segmentation

### 6.1 AI-Powered Planning

**Purpose:** Automatically segment chapters into TTS-optimized chunks with speaker detection.

**Key Components:**
- AI-powered text analysis
- Segment size optimization
- Speaker detection and assignment
- Plan validation and editing

**Technical Implementation:**
- OpenAI integration for text analysis
- Segment size calculation with TTS limits
- Character detection and assignment
- Plan serialization and caching

**Data Structures:**
```typescript
interface Segment {
  segment_id: number;
  text: string;
  voice: string;
  start_idx: number;
  end_idx: number;
  locked?: boolean;
}

interface PlanFile {
  chapter_id: string;
  segments: Segment[];
  generation_timestamp: string;
}
```

**Features:**
- Automatic text segmentation
- AI speaker detection
- Segment size optimization
- Manual override capabilities

### 6.2 Plan Board

**Purpose:** Visual interface for reviewing, editing, and validating generated plans.

**Key Components:**
- Segment grid display
- Lock/unlock functionality
- Voice assignment override
- SFX insertion points
- Segment operations (split, merge, move)

**Technical Implementation:**
- Table virtualization for performance
- Real-time validation
- Undo/redo functionality
- Batch operations support

**Features:**
- Visual segment editing
- Voice audition from plan
- Segment manipulation tools
- Validation feedback

---

## 7. Audio Production

### 7.1 TTS Generation

**Purpose:** Convert text segments to high-quality audio using advanced TTS engines.

**Key Components:**
- Multi-engine TTS support (Azure, others)
- Voice style and parameter control
- Audio caching system
- Batch processing capabilities

**Technical Implementation:**
- Azure Cognitive Services integration
- Intelligent caching with content hashing
- Processing chain application
- Error handling and retry logic

**Data Structures:**
```typescript
interface AudioSegmentRow {
  chunkId: string;
  segmentType: 'plan' | 'sfx';
  text: string;
  voice: string;
  audioFile?: string;
  hasAudio: boolean;
  displayOrder: number;
  revisionMarked?: boolean;
}
```

**Features:**
- High-quality TTS synthesis
- Voice style customization
- Intelligent audio caching
- Progress tracking

### 7.2 Audio Processing Chains

**Purpose:** Apply professional audio processing to enhance TTS output quality.

**Key Components:**
- Noise reduction
- EQ and filtering
- Dynamic range compression
- Spatial enhancement
- Mastering and normalization

**Technical Implementation:**
- Configurable processing pipeline
- Per-segment chain customization
- Real-time preview
- Processing chain serialization

**Processing Chain Structure:**
```typescript
interface ProcessingChain {
  noiseReduction: NoiseReductionConfig;
  equalizer: EqualizerConfig;
  dynamics: DynamicsConfig;
  spatialEnhancement: SpatialConfig;
  mastering: MasteringConfig;
}
```

**Features:**
- Professional audio processing
- Real-time parameter adjustment
- A/B comparison tools
- Preset management

### 7.3 Sound Effects (SFX)

**Purpose:** Insert and manage sound effects at specific points in the audio production.

**Key Components:**
- SFX file import and validation
- Insertion point management
- Volume and timing control
- SFX library management

**Technical Implementation:**
- Audio file validation
- Timing synchronization
- Volume normalization
- Metadata tracking

**Features:**
- Custom SFX insertion
- Timing precision control
- Volume balancing
- SFX library management

---

## 8. Quality Control and Review

### 8.1 Audio Preview System

**Purpose:** Preview and review generated audio with visual feedback and editing controls.

**Key Components:**
- Waveform visualization
- Playback controls
- Segment-level navigation
- Revision marking system

**Technical Implementation:**
- WaveSurfer.js integration
- Audio streaming optimization
- Keyboard shortcuts
- Visual feedback systems

**Features:**
- Visual waveform display
- Precise playback control
- Segment-specific review
- Revision tracking

### 8.2 Revision Management

**Purpose:** Track and manage audio segments that need revision or re-recording.

**Key Components:**
- Revision marking interface
- Status tracking
- Batch operations
- Progress reporting

**Technical Implementation:**
- Dual storage (plan and audio metadata)
- Status synchronization
- Bulk operations support
- Change tracking

**Features:**
- Visual revision indicators
- Batch revision marking
- Progress tracking
- Status reporting

---

## 9. Export and Packaging

### 9.1 Chapter Audio Assembly

**Purpose:** Combine individual segments into complete chapter audio files.

**Key Components:**
- Audio concatenation
- Gap insertion
- Volume normalization
- Quality validation

**Technical Implementation:**
- FFmpeg integration
- Audio processing pipeline
- Quality control checks
- Metadata preservation

**Features:**
- Seamless audio stitching
- Professional audio standards
- Quality assurance
- Metadata embedding

### 9.2 Book Assembly and Export

**Purpose:** Create final audiobook packages for various distribution platforms.

**Key Components:**
- Multi-format support (M4B, ZIP)
- Metadata embedding
- Chapter marking
- Platform-specific optimization

**Technical Implementation:**
- Format-specific encoders
- Metadata standardization
- Chapter point insertion
- Validation systems

**Supported Formats:**
- M4B (Apple Books/iTunes)
- ZIP with MP3 (Google Play Books)
- Other platform-specific formats

**Features:**
- Multi-platform export
- Automated metadata inclusion
- Quality validation
- Distribution-ready packages

---

## 10. Cost Tracking and Analytics

### 10.1 Usage Analytics

**Purpose:** Track TTS usage, costs, and project metrics for budgeting and optimization.

**Key Components:**
- TTS usage tracking
- Cost calculation
- Performance metrics
- Usage reporting

**Technical Implementation:**
- Service usage monitoring
- Cost calculation algorithms
- Metrics aggregation
- Report generation

**Features:**
- Real-time cost tracking
- Usage analytics
- Budget monitoring
- Performance insights

---

## 11. Settings and Configuration

### 11.1 Global Settings

**Purpose:** Manage application-wide settings, API credentials, and preferences.

**Key Components:**
- API credential management
- Default preferences
- Language and locale settings
- Audio processing defaults

**Technical Implementation:**
- Encrypted credential storage
- Configuration validation
- Settings migration
- Environment detection

**Features:**
- Secure credential storage
- Preference management
- Multi-language support
- Default value management

### 11.2 Project Settings

**Purpose:** Project-specific configuration overrides and customizations.

**Key Components:**
- TTS engine selection
- Voice preferences
- Processing defaults
- Export settings

**Technical Implementation:**
- Configuration inheritance
- Override management
- Validation schemas
- Settings synchronization

**Features:**
- Project-specific overrides
- Configuration inheritance
- Validation and error handling
- Settings backup and restore

---

*This document provides comprehensive technical specifications for all Khipu Studio features. For user-oriented guidance, refer to the User Guide and Feature Guides.*