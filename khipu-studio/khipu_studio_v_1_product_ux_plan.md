# Khipu Studio — v1 Product & UX Plan

## 0) Why this doc
A compact, working plan to (a) reset scope, (b) professionalize the UX, and (c) realign to the original audiobook pipeline. It’s designed to be executed in small, shippable slices.

---
## 1) Guiding principles
- **Single source of truth**: Editable text lives in `analysis/chapters_txt/*.txt` and dossier JSON. Plans, SSML, audio, and exports are **derived** artifacts.
- **Deterministic builds**: Given the same manuscript+dossier+settings, outputs are identical.
- **Human-in-the-loop**: Users can lock chunks, insert SFX, and select voices; text edits are done in chapter files.
- **Local-first**: Projects are local; external services are opt-in (OpenAI, Azure TTS).
- **Safety & clarity**: Clear states, consistent actions, safe file IO within project root, reversible operations.
- **Performance**: Large projects remain responsive (virtualized lists, caching, streaming logs).

---
## 2) Information architecture (IA)
Left navigation (persistent):
1. **Home** – open/create project, recents.
2. **Overview** – project health (chapters found, dossier status, last build), quick actions.
3. **Manuscript** – chapter list, chapter editor, import tool.
4. **Dossier** – characters, places, styles; casting map; validation.
5. **Planning** – build/regenerate plan; Plan Board (read-only text, locks, SFX, overrides).
6. **SSML** – generate per chunk, lints & fixes, preview.
7. **Audio** – TTS preview, render queue, stitching, loudness.
8. **Export** – Google Play, Apple Books (M4B), Spotify; validators and wizards.
9. **Settings** – keys, regions, model choices, paths; project + global.

---
## 3) Primary user flows
1) **Start a project** → pick folder → initialize template → import manuscript → split to chapters.
2) **Edit chapter** → open text → save → **Regenerate plan**.
3) **Review plan** → lock/unlock, add SFX markers (no overlap), set casting overrides.
4) **Build SSML** → run lints → fix or accept.
5) **Preview voice** → cached TTS per chunk → adjust voice/style.
6) **Render chapter** → queue → stitch → normalized WAV.
7) **Export book** → choose platform → package + validate.

---
## 4) Screens (v1)
### 4.1 Home / Project picker
- Recent projects; Create new → scaffolds `analysis/`, `dossier/`, `ssml/`, `audio/`, `cache/`.

### 4.2 Overview
- Cards: Chapters detected, Dossier status, Last plan build, Audio cache size.
- CTA: Edit manuscript / Regenerate plan / Open Plan Board.

### 4.3 Manuscript
- Chapter list (virtualized). Actions: open, duplicate, rename.
- Editor (monospace, soft-wrap, word count). Toolbar: Save, Revert, Find/Replace.

### 4.4 Dossier
- Forms for characters/places/styles with JSON schema validation. Inline errors. Import from LLM or CSV.

### 4.5 Planning
- Header: chapter selector + “Regenerate plan”.
- Plan Board: grid of chunks (ID, Lock, Text **read-only**, SFX, Actions).
- Actions: Lock/Unlock; Add SFX (file picker; gap control); casting override (voice dropdown). No text edits here.

### 4.6 SSML
- Generate per chunk/chapter. Lint messages (severity, fix-it hints).
- Preview SSML (syntax highlight) and quick fixes.

### 4.7 Audio
- Per-chunk preview with waveform, cached TTS (hash = voice+SSML+params).
- Chapter render queue with progress and resume; loudness normalization and silences.

### 4.8 Export
- Platform picker (Google, Apple, Spotify). Requirements checklist, packaging steps, output folder.

### 4.9 Settings
- Project: language, default narrator voice, speed/pitch, model IDs.
- Global: API keys, default paths.

---
## 5) Data model (files on disk)
```
project/
  project.khipu.json                  # settings, versions
  analysis/
    chapters_txt/
      ch01.txt
  dossier/
    characters.json
    casting.json
  ssml/
    plans/
      ch01.plan.json                  # { chapter_id, chunks: [{id, text, locked, sfxAfter?, source?}] }
    xml/
      ch01/
        ch01_001.xml
  cache/
    tts/<hash>.wav
  audio/
    chapters/ch01.wav
    book/book.m4b
  exports/
    apple/...
    google/...
```

---
## 6) IPC contract (v1)
- `project:choose()` → `string | null`
- `fs:read({ projectRoot, relPath, json })` → `unknown`
- `fs:write({ projectRoot, relPath, json, content })` → `boolean`
- `plan:build({ projectRoot, chapterId, infile, out, opts })` → `number`
- **Next**:
  - `ssml:build({ projectRoot, chapterId, onlyChunks? })`
  - `tts:renderChunk({ projectRoot, ssmlRel, voice, cacheKey })`
  - `render:chapter({ projectRoot, chapterId })`
  - `export:{apple|google|spotify}({ projectRoot, manifest })`

All paths are **relative to projectRoot**; main process resolves absolute and enforces sandbox.

---
## 7) Tech & UI system
- **React + Vite + TypeScript**.
- **Tailwind + shadcn/ui + Radix** for a clean, accessible design system.
- **Zustand** for app state (project, settings); **TanStack Query** where async caching helps.
- **Howler/Wavesurfer** for audio preview.
- Icons: **lucide-react**.
- Routing: **React Router** (left-nav + nested routes).

Design tokens:
- Dark default. Gray-900 backgrounds, gray-100 text, accent teal.
- 8px spacing grid. Card shadows, rounded-2xl.
- Consistent empty/error/loading states.

---
## 8) Implementation plan (4 milestones)
**M1 — Foundations (1–2 days)**
- Scaffold layout (left nav, header, content). Routing for 6 primary sections.
- Project picker & recent projects. Project template init.
- Global error boundary; toasts; logging panel.

**M2 — Manuscript & Planning (2–4 days)**
- Chapter list + Editor (save/read via IPC).
- Regenerate Plan. Plan Board (read-only text, lock/unlock, SFX placeholders).

**M3 — SSML & Audio preview (3–5 days)**
- SSML generation & lint listing.
- TTS per-chunk with hashing cache. Waveform preview.

**M4 — Render & Export (4–7 days)**
- Chapter render queue + stitching + loudness.
- Export wizards (Apple M4B, Google zip). Validators.

Deliver each milestone in a branch with a demo and acceptance checklist.

---
## 9) Refactor & structure
**Frontend**
```
app/src/
  app.tsx
  routes/
    overview.tsx
    manuscript/
      index.tsx
      editor.tsx
    planning/
      index.tsx
      board.tsx
    ssml/
      index.tsx
    audio/
      index.tsx
    export/
      index.tsx
  components/
    layout/
    inputs/
    tables/
  store/
  lib/
```
**Main**
```
app/electron/
  main.cjs
  preload.cjs
```
**Python** (unchanged layout under `py/`), with CLI entry points per task.

---
## 10) Acceptance & QA
- **DoD per screen**: keyboard navigable, error states visible, no unhandled promise rejections, file writes atomic.
- **Scenario tests**: sample book renders a chapter end-to-end.
- **Performance**: Plan Board handles 2k+ chunks at 60fps (virtualized list if needed).

---
## 11) Guardrails to stay aligned
- Plan text is **not editable** in UI.
- Every action shows a clear status and where outputs land.
- All disk ops are relative to `projectRoot` and validated in main process.
- Locks, SFX, and casting are the only per-chunk edits allowed in Plan.

---
## 12) Next actions
1) Create branch `feat/ui-foundation`.
2) Add Tailwind + shadcn/ui + Router + Zustand; scaffold the new layout.
3) Port existing working IPC as-is; wire to new routes.
4) Cut a short demo of M1; iterate.

