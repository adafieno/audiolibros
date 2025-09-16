# Khipu Studio - Architectural Design Document

## Overview

Khipu Studio is an AI-powered audiobook production studio built as a desktop application using Electron. It provides a comprehensive workflow for converting manuscripts into professional audiobooks with multi-language support, advanced voice synthesis, and automated production processes.

## Technical Architecture

### Technology Stack

**Frontend:**
- **React 19.1.1** - Modern UI framework
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and development server
- **React Router DOM 7.8.2** - Client-side routing
- **Zustand 5.0.8** - Lightweight state management
- **React Hook Form 7.62.0** - Form validation and management

**Desktop Framework:**
- **Electron 38.0.0** - Cross-platform desktop application framework
- **Electron Builder 26.0.12** - Application packaging and distribution

**Internationalization:**
- **i18next 25.5.0** - Internationalization framework
- **react-i18next 15.7.3** - React integration
- **i18next-browser-languagedetector 8.2.0** - Language detection
- **i18next-icu 2.4.0** - ICU message format support

**Audio Processing:**
- **Howler.js 2.2.4** - Audio playback and management
- **WaveSurfer.js 7.10.1** - Audio waveform visualization
- **Azure Cognitive Services TTS** - Text-to-speech synthesis

**Data Management:**
- **Zod 4.1.5** - Schema validation
- **@tanstack/react-table 8.21.3** - Table management

**Development Tools:**
- **ESLint** - Code linting
- **Concurrently** - Running multiple processes
- **Cross-env** - Environment variable management

### Application Architecture

#### 1. Main Process (Electron)
The Electron main process handles:
- File system operations
- Project management
- Audio file processing
- Inter-process communication (IPC)
- External service integrations

#### 2. Renderer Process (React Frontend)
The React application provides:
- User interface components
- State management
- Audio preview and playback
- Form handling and validation
- Routing and navigation

#### 3. Core Services

**Project Service:**
- Project creation and management
- File structure initialization
- Recent projects tracking

**Audio Production Service:**
- Chapter audio metadata management
- Processing chain configuration
- Audio generation coordination

**Voice Service:**
- Voice inventory management
- TTS engine integration
- Voice assignment and casting

**Config Service:**
- Project configuration management
- Global settings management
- Validation and schema enforcement

### Folder Structure

```
khipu-studio/
├── app/                          # Main application
│   ├── src/
│   │   ├── components/           # Reusable UI components
│   │   ├── contexts/            # React contexts
│   │   ├── data/                # Static data files
│   │   ├── features/            # Feature-specific code
│   │   ├── hooks/               # Custom React hooks
│   │   ├── lib/                 # Core services and utilities
│   │   ├── locales/             # Internationalization files
│   │   ├── pages/               # Main application pages
│   │   ├── schemas/             # Zod validation schemas
│   │   ├── store/               # Zustand state stores
│   │   └── types/               # TypeScript type definitions
│   ├── electron/                # Electron main process
│   ├── public/                  # Static assets
│   └── package.json
├── py/                          # Python utilities and tools
├── assets/                      # Application assets
├── bin/                         # Binary dependencies (FFmpeg)
├── cache/                       # Audio processing cache
├── doc_refs/                    # Documentation references
├── project-templates/           # Project templates
├── reference-code/              # Reference implementations
├── sample/                      # Sample projects
├── ssml/                        # SSML processing utilities
├── temp/                        # Temporary files
└── test_scripts/                # Testing utilities
```

## Design Patterns and Principles

### 1. Single Source of Truth
- Editable text lives in `analysis/chapters_txt/*.txt` and dossier JSON
- Plans, SSML, audio, and exports are **derived** artifacts
- Ensures data consistency and reproducible builds

### 2. Deterministic Builds
- Given the same manuscript + dossier + settings, outputs are identical
- Enables reliable production workflows
- Supports version control and collaboration

### 3. Human-in-the-Loop
- Users can lock chunks, insert SFX, and select voices
- Text edits are done in chapter files
- AI suggestions can be accepted or overridden

### 4. Local-First Architecture
- Projects are stored locally on the user's machine
- External services (OpenAI, Azure TTS) are opt-in
- Offline capability for core functionality

### 5. Cascading Workflow
Navigation items become available as users complete specific workflow steps:
- **Stage 1:** Project Setup (Home, Settings)
- **Stage 2:** Manuscript completion unlocks Dossier, Planning, Casting
- **Stage 3:** Pre-production completion unlocks SSML
- **Stage 4:** SSML completion unlocks Voice/Audio Production
- **Stage 5:** Voice completion unlocks Export/Packaging

## Data Flow

### 1. Project Initialization
```
User Input → Project Template → File Structure Creation → Voice Inventory Bootstrap
```

### 2. Content Processing
```
Manuscript Text → Chapter Splitting → AI Analysis → Character Detection → Voice Assignment
```

### 3. Planning Workflow
```
Text Analysis → Segment Generation → Voice Mapping → Plan Validation → Lock/Unlock
```

### 4. Audio Production
```
Plan Segments → SSML Generation → TTS Processing → Audio Files → Processing Chains
```

### 5. Export Pipeline
```
Audio Files → Chapter Stitching → Mastering → Format Conversion → Package Creation
```

## State Management

### Zustand Stores

**Project Store (`store/project.ts`):**
- Current project root path
- Project metadata
- Global project state

**Audio Cache Store:**
- TTS result caching
- Audio playback management
- Performance optimization

### React Context

**Error Boundary Context:**
- Global error handling
- User-friendly error display
- Development debugging support

## Security Considerations

### File System Access
- Operations restricted to project root directory
- Path validation and sanitization
- Safe file I/O within project boundaries

### External Services
- API keys stored securely
- Optional service integration
- Fail-safe fallbacks for offline use

### User Data
- Local-first data storage
- No automatic cloud synchronization
- User controls data sharing

## Performance Optimization

### Audio Processing
- Intelligent caching of TTS results
- Lazy loading of audio files
- Background processing for large operations

### UI Responsiveness
- Virtualized lists for large datasets
- Debounced input handling
- Progressive loading strategies

### Memory Management
- Cleanup of audio resources
- Efficient state updates
- Garbage collection optimization

## Extensibility

### Plugin Architecture
- Service-based design enables extension
- Modular voice engine support
- Configurable processing chains

### Configuration System
- Schema-validated configurations
- Environment-specific settings
- User and project-level overrides

### Internationalization
- ICU message format support
- RTL language support preparation
- Cultural localization features

## Quality Assurance

### Type Safety
- Comprehensive TypeScript coverage
- Zod schema validation
- Runtime type checking

### Error Handling
- Graceful degradation
- User-friendly error messages
- Comprehensive logging

### Testing Strategy
- Unit tests for core services
- Integration tests for workflows
- End-to-end testing scenarios

## Deployment and Distribution

### Build Process
- Vite for optimized frontend builds
- Electron Builder for native packaging
- Cross-platform distribution support

### Platform Support
- Windows (primary target)
- macOS compatibility
- Linux compatibility

### Update Mechanism
- Planned auto-update capability
- Backward compatibility considerations
- Migration handling for data structures

---

*This document provides a comprehensive overview of Khipu Studio's architecture. For specific implementation details, refer to the feature specifications and user guides.*