# Optimized Project Metadata Structure

## Problem Analysis
Current structure has metadata scattered across multiple files with unclear boundaries between project settings and book information.

## Proposed Structure

### 1. project.khipu.json (Technical Configuration Only)
```json
{
  "version": 1,
  "language": "es-PE",
  "paths": {
    "bookMeta": "book.meta.json",
    "production": "production.settings.json",
    "cover": "art/cover_3000.jpg",
    "manuscript": "analysis/chapters_txt",
    "audio": "audio",
    "exports": "exports",
    "cache": "cache"
  },
  "planning": {
    "maxKb": 48,
    "llmAttribution": "off"
  },
  "ssml": {},
  "tts": {
    "engine": {
      "name": "azure",
      "voice": "es-PE-CamilaNeural"
    },
    "cache": true
  },
  "llm": {
    "engine": {
      "name": "openai",
      "model": "gpt-4o"
    }
  },
  "export": {
    "outputDir": "exports",
    "platforms": {
      "apple": true,
      "google": true,
      "spotify": true
    }
  },
  "creds": {
    "useAppAzure": false,
    "useAppOpenAI": false
  },
  "workflow": {
    "characters": { "complete": true, "completedAt": "..." },
    "project": { "complete": true, "completedAt": "..." }
  }
}
```

### 2. book.meta.json (Book Information Only)
```json
{
  "title": "Puntajada",
  "subtitle": "Misterios ancestrales",
  "authors": ["Agustín Da Fieno Delucchi"],
  "narrators": [],
  "language": "es-PE",
  "description": "El pueblo dormía con los ojos abiertos...",
  "keywords": [],
  "categories": [],
  "publisher": "Agustín Da Fieno Delucchi",
  "publication_date": "2025-09-08",
  "rights": "",
  "series": {
    "name": "",
    "number": null
  },
  "sku": "",
  "isbn": "",
  "coverImage": "art/cover_3000.jpg",
  "disclosure_digital_voice": true
}
```

## Key Improvements

### 1. Clear Separation of Concerns
- **project.khipu.json**: Technical configuration, workflows, engines, credentials
- **book.meta.json**: Publishing metadata, author info, cover, description

### 2. Comprehensive Path Tracking
- All important paths tracked in `project.paths` section
- Relative paths from project root
- Easy to relocate assets by updating paths

### 3. Single Source of Truth
- Book metadata only in book.meta.json
- No duplication between files
- Cover image path properly tracked

### 4. Migration Strategy
1. Move book metadata from project.khipu.json to book.meta.json
2. Add comprehensive paths section to project.khipu.json
3. Update all code references to use proper file
4. Remove duplicate bookMeta section from project.khipu.json

## File Purpose Clarity
- **project.khipu.json**: "How to build this project"  
- **book.meta.json**: "What is this book about"
- **production.settings.json**: "How to produce audio"
