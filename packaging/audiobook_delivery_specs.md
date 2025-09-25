# Audiobook Delivery & Metadata Specs
**Targets:** Apple Books, Google Play Books, Spotify (Spotify for Authors)  
**Audience:** Production engineers & content ops (audiobook pipeline)  
**Scope:** Packaging, audio & cover specs, identifiers, metadata schema, and per‑store deltas—ready to implement.

---

## TL;DR (What to Ship Every Time)
- **Per‑chapter audio files** in `audio/` (MP3 44.1k/16‑bit, ≥192 kbps CBR recommended).  
- **Opening credits** and **closing credits** as standalone tracks.  
- **Square cover art** in `art/` (3000×3000 PNG preferred; ≥2400×2400 acceptable for Google).  
- **Retail sample** ≤ 5 min in `audio/sample.mp3`.  
- A single **`manifest.json`** as source of truth for metadata + file map.  
- (If distributing beyond a single store) **ISBN‑13 for the audiobook** is strongly recommended/required by some channels.

---

## 1) Portable Delivery Package (Pipeline Output)
A store‑agnostic bundle you can generate once and adapt to each platform.

```
/<PROJECT>/
  /audio/
    000_opening_credits.mp3
    001_chapter_01.mp3
    002_chapter_02.mp3
    ...
    998_acknowledgments.mp3      (optional end matter)
    999_closing_credits.mp3      (recommended; required by Spotify)
    sample.mp3                   (≤ ~5 min retail preview)
  /art/
    cover_3000x3000.png          (preferred; 1:1)
  /docs/
    rights.txt                   (© text for book and audio)
    readme.txt                   (build info / change log)
  manifest.json                  (metadata + file map; schema below)
```

### 1.1 Audio Targets (safe across stores)
- **Format:** MP3 CBR preferred (WAV/FLAC also acceptable where supported).  
- **Rate/Depth:** 44.1 kHz / 16‑bit.  
- **Bitrate:** ≥ **192 kbps** (CBR).  
- **Channel:** Mono or stereo (be consistent across files).  
- **Granularity:** **One chapter per file**; **no file > 2 hours** (Spotify rule; a good universal cap).  
- **Head/Tail silence:** ~0.5–1.0 s head; ~1–5 s tail.  
- **Dynamics (recommendation):** RMS around −20 dB; noise floor below −60 dB.  
- **Front matter:** Opening credits as its own track; if you have foreword/preface/introduction, place as separate files **before** Chapter 1.  
- **Back matter:** Closing credits as its own track; acknowledgments/about author may be end matter.

> **Tip:** If you need **exact LUFS**, normalize with `ffmpeg loudnorm` after SoX processing.

### 1.2 Cover Art
- **Aspect:** Square 1:1.  
- **Preferred:** **3000×3000** PNG, 24‑bit color (Spotify‑friendly).  
- **Minimum (Google):** **2400×2400** JPEG/PNG.  
- Avoid borders/letterboxing. For Spotify, include **title & author text** on the art (house style).

---

## 2) Platform Deltas (What Changes by Store)

### 2.1 Google Play Books (Audiobooks)
**Identifiers**
- **ISBN is not required.** If missing, Google assigns an internal **GGKEY** (not an ISBN).

**Audio**
- Accepts **M4A (AAC)**, **MP3**, **FLAC**, **WAV**.  
- Typical thresholds: MP3 mono ≥128 kbps / stereo ≥256 kbps; WAV/FLAC ≥44.1 kHz/16‑bit.  
- **Total runtime:** 5 minutes to 100 hours.

**Chapters / Files**
- Upload as **one file or multiple files**. With multiple files, you can name each chapter and reorder.

**Cover**
- **Square** JPEG/PNG, ideally **2400×2400**, file size < 2 GB.

**Metadata**
- **Narrator** is required for audiobooks.  
- Must indicate **narration type** (**human** vs **synthesized**).  
- Standard book fields: title, contributors, description, genres, language, etc.

**Automation**
- Supports **automated ingestion** (batch fetching) for content/metadata/rights when enabled.

---

### 2.2 Spotify (Spotify for Authors)
**Identifiers**
- For **Spotify‑only** availability, you can upload without an ISBN.  
- For **distribution to retail partners** (e.g., Apple, Google) via Spotify’s network, a **13‑digit ISBN (978/979)** is **required**. Spotify does **not** issue free ISBNs.

**Audio**
- Preferred: **MP3 ≥192 kbps CBR, 44.1 kHz / 16‑bit**. Also accepts WAV/FLAC.  
- **Per‑file duration:** **≤ 2 hours**.  
- **File granularity:** **Each chapter = separate file**.  
- **Opening/closing credits:** **Required** as standalone files.  
- **Silence:** Head ~0.5–1 s; tail ~1–5 s.  
- **Mono vs stereo:** Use one consistently across the production.

**Cover**
- **PNG 3000×3000**, 24‑bit color, 1:1; avoid borders.  
- Include **Title & Author** text on the cover (style guidance).

**Metadata highlights**
- Title + Subtitle: **< 256 chars**.  
- Description: **< 2000 chars** (HTML counts toward limit).  
- Contributors: Author(s), Narrator(s), Publisher/Imprint.  
- **BISAC**: up to **3** categories.  
- Copyright lines: use **©** (text) and **℗** (audio) with year and holder.

**Pricing**
- Set list prices per territory (retail vs library price bands supported).

---

### 2.3 Apple Books
**Delivery Path**
- Most independents deliver through an **approved aggregator/distribution partner** (e.g., Draft2Digital, PublishDrive, Spotify/Findaway/INaudio routes). The partner handles the audiobook ingestion tech.

**Identifiers**
- Apple can list without an ISBN in some workflows, but **Apple does not issue free ISBNs**.  
- Many partners **require** an ISBN for wide distribution and library systems—recommended best practice.

**Cover**
- Provide a **custom square cover**. In some flows (e.g., digital narration), Apple may square a rectangular ebook cover, but supplying a square master is best.

**Metadata**
- Ensure strict **metadata alignment** between assets and listing (title, author, series, language, description, categories, etc.).

> **Tip:** If you distribute Apple via **Spotify for Authors / partner**, follow the Spotify packaging (per‑chapter files, ≤2h/file, required credits, 3000×3000 cover).

---

## 3) `manifest.json` (Single Source of Truth)
Use one JSON manifest your pipeline emits; map it to each store’s UI/API on upload.

```json
{
  "identifiers": {
    "isbn_audio": "9781234567890",
    "google_internal_ok": true,
    "proprietary_id": "your-internal-id"
  },
  "title": "Book Title",
  "subtitle": "Optional Subtitle",
  "series": { "name": "Series Name", "number": "2" },
  "contributors": {
    "authors": ["First Last"],
    "narrators": ["First Last"],
    "translator": [],
    "publisher": "Your Imprint"
  },
  "language": "en",
  "description": { "html": "<p>Back‑cover style copy...</p>" },
  "classifications": {
    "bisac": ["FIC019000", "FIC027000"],
    "keywords": ["tag1", "tag2"]
  },
  "copyright": {
    "text_c": "© 2025 Author Name",
    "audio_p": "℗ 2025 Your Imprint"
  },
  "edition": { "abridgment": "Unabridged" },
  "narration": { "type": "human" },
  "territories": { "include": ["WORLD"] },
  "pricing": [
    { "currency": "USD", "list": 19.99, "library": 39.99 },
    { "currency": "EUR", "list": 17.99, "library": 35.99 }
  ],
  "assets": {
    "cover": { "path": "art/cover_3000x3000.png", "width": 3000, "height": 3000, "format": "PNG" },
    "sample": { "path": "audio/sample.mp3", "max_minutes": 5 },
    "audio_files": [
      { "order": 0, "role": "opening_credits", "path": "audio/000_opening_credits.mp3", "duration_sec": 25 },
      { "order": 1, "role": "chapter", "display": "Chapter 1", "path": "audio/001_chapter_01.mp3", "duration_sec": 1800 },
      { "order": 2, "role": "chapter", "display": "Chapter 2", "path": "audio/002_chapter_02.mp3", "duration_sec": 2100 },
      { "order": 999, "role": "closing_credits", "path": "audio/999_closing_credits.mp3", "duration_sec": 20 }
    ]
  },
  "audio_spec": {
    "format": "MP3",
    "bitrate_kbps": 192,
    "sample_rate_hz": 44100,
    "bit_depth": 16,
    "mono_or_stereo": "mono",
    "max_file_minutes": 120,
    "head_silence_sec": 0.8,
    "tail_silence_sec": 2.0,
    "rms_db": -20,
    "noise_floor_db": -60
  }
}
```

### Field Notes
- `identifiers.isbn_audio` — Required for certain partner distributions (e.g., Spotify → Apple/Google). Optional for Google direct (GGKEY assigned if absent).  
- `narration.type` — Use `"human"` or `"synthesized"` (Google requires the distinction).  
- `classifications.bisac` — Spotify supports up to **3** BISAC codes.  
- `assets.audio_files[].role` — Use `"opening_credits"`, `"chapter"`, `"closing_credits"` (and optionally `"foreword"`, `"preface"`, `"introduction"`, `"acknowledgments"`, `"about_author"`).  
- `audio_spec.max_file_minutes` — Keep **≤ 120** for cross‑store compliance.

---

## 4) Preflight Checklists

### 4.1 Google Play Books
- [ ] Audio format meets thresholds (MP3/M4A/FLAC/WAV; sample rate/bitrate OK).  
- [ ] Total runtime 5 min – 100 h.  
- [ ] Chapters uploaded as one or multiple files; if naming one chapter, **name all**; order confirmed.  
- [ ] **Narrator** set; **human vs synthesized** set.  
- [ ] Cover is **1:1**, ideally **2400×2400**.  
- [ ] ISBN optional; GGKEY will be assigned if absent.

### 4.2 Spotify (Spotify for Authors)
- [ ] MP3 ≥192 kbps CBR (or WAV/FLAC); **≤2 h per file**; **chapter‑per‑file** enforced.  
- [ ] **Opening** & **Closing credits** provided as standalone files.  
- [ ] Consistent mono/stereo across files; head/tail silences present.  
- [ ] **Cover**: PNG **3000×3000**, includes Title & Author text.  
- [ ] Title+Subtitle < 256 chars; Description < 2000 chars (HTML counts).  
- [ ] **BISAC** up to 3; Contributors set (Author/Narrator/Publisher).  
- [ ] **ISBN** present if distributing to retail partners via Spotify.

### 4.3 Apple Books
- [ ] Delivery path via approved **aggregator/partner** selected.  
- [ ] **Square cover** supplied; metadata aligned with assets.  
- [ ] **ISBN** available if required by partner (Apple does not issue free ISBNs).

---

## 5) Single‑File Masters (When/Why)
- **Google** allows a **single file** upload; however, you lose per‑chapter file naming granularity. Prefer multi‑file for discoverability and UX.  
- **Spotify & Apple (via partners)**: Flows assume **per‑chapter files** and a **2‑hour cap** per file; use multi‑file packaging.

> If you must deliver a single master elsewhere (e.g., archival **M4B**), also export the **multi‑file** package for stores.

---

## 6) Optional: Validation Workflow (CLI‑Ready Outline)

1. **Scan audio/**: verify codec, rate, depth, bitrate; compute duration; enforce `≤ 120 min`/file.  
2. **Check head/tail silences**: ensure min head/tail values; normalize peak with headroom.  
3. **Verify cover**: square 1:1; min dimension & format; optional OCR to confirm “Title/Author” present (Spotify style).  
4. **Validate manifest**: required fields present; BISAC count ≤ 3; description length ≤ 2000 chars (if targeting Spotify).  
5. **Identifiers**: if distributing beyond one store, require `isbn_audio`.  
6. **Emit preflight report**: human‑readable + machine JSON with pass/fail and remediation tips.

---

## 7) Front/Back Matter Script Templates

**Opening credits (neutral)**  
> *Title*, by *Author*. Narrated by *Narrator*. Published by *Publisher*.

**Opening credits (with copyright)**  
> *Title*, by *Author*. Narrated by *Narrator*. © *Year* *Rights Holder*. Published by *Publisher*.

**Synthetic voice disclosure (if used/required)**  
> This audiobook was produced using professional synthetic narration.

**Closing credits**  
> *Title*, by *Author*. Narrated by *Narrator*. © *Year* *Rights Holder*. Production by *Studio/Imprint*.

---

## 8) Notes & Good Practices
- Keep the **opening credits under ~30–45 seconds**.  
- Avoid a spoken “Table of Contents”; markers/tracks are your TOC.  
- Use **consistent processing presets** across chapters to avoid tonal shifts.  
- Track **license & rights** in `docs/rights.txt` (book © vs audio ℗).  
- Store your **retail sample** as a separate file (≤ 5 minutes).  
- Prefer **per‑chapter files** for all platforms; it simplifies QC and replacement if a chapter needs a fix.

---

*This spec is designed to be stable across minor platform updates. When stores update constraints (e.g., cover sizes, description limits), adjust field validation in your exporter and keep `manifest.json` as your single source of truth.*
