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

| Platform                          | Audio Format & Quality                                                                                | File / Chapter Constraints                                                                                                                                                 | Packaging & Manifest                                                                                                                                         | Metadata & Identifiers                                                                                                                                             | Cover Art                                                                             | Submission Notes                                                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Apple Books**                   | MP3, **256 kbps CBR**, 44.1 kHz, Stereo                                                               | • One file per chapter/section <br>• Max 700 MB per file <br>• Max ~2h per file (recommended shorter) <br>• Start with 0.5–1s silence <br>• LUFS –18 to –23, peaks ≤ –3 dB | Delivered as **ZIP** with audio + cover + metadata <br>• Metadata via **ONIX 3.0 feed** (from aggregator) <br>• Sequence/order controlled in manifest (ONIX) | • ISBN required (Apple does not assign free ISBNs) <br>• Title, Subtitle, Author(s), Narrator(s), Publisher, Language, BISAC subject, Date                         | JPEG, RGB <br>• Min 2400×2400 px <br>• Max 10 MB <br>• Square, 1:1 ratio              | • Must distribute via **approved aggregator** (Findaway, Ingram, Draft2Digital) <br>• No direct upload <br>• Global distribution, no exclusivity             |
| **Google Play Books**             | MP3, AAC, FLAC, WAV <br>• MP3/AAC: ≥128 kbps mono, ≥256 kbps stereo <br>• FLAC/WAV: 16-bit, ≥44.1 kHz | • Each file < 2 GB <br>• Audiobook min 5 min, max 100 h <br>• Naming: `ID_XofY.ext` (e.g. ISBN_1of10.mp3) <br>• ZIP option for bulk                                        | **ZIP container** accepted <br>• Implicit manifest via file naming/ordering <br>• Partner portal metadata entry                                              | • ISBN strongly encouraged (required in most markets) <br>• Title, Author(s), Narrator(s), Language, Rights, Description <br>• Optional supplemental PDF (<100 MB) | JPG/PNG <br>• Min 1024×1024 px <br>• Max 7200 px <br>• Square, 1:1 ratio              | • Upload via Google Books Partner Center <br>• Supports **auto-narrated audiobooks** (TTS) <br>• Distribution rights controlled per territory                |
| **Spotify (Spotify for Authors)** | MP3, WAV, FLAC (not as rigidly specified)                                                             | • One file per chapter recommended <br>• Preview/sample file required <br>• Duration/file size limits not publicly specified                                               | Delivered via **Spotify for Authors** UI <br>• Internal manifest mapping handled by Spotify <br>• Optional cross-distribution via INaudio partner            | • Title, Author, Narrator, Description entered at upload <br>• ISBN not required (Spotify does not enforce)                                                        | PNG/JPEG <br>• 3000×3000 px recommended <br>• Square, 1:1 ratio                       | • Upload free via Spotify for Authors <br>• New uploads take up to 72h to go live <br>• Non-exclusive rights <br>• Linked distribution available via INaudio |
| **ACX / Audible / Amazon**        | MP3, **192 kbps CBR**, 44.1 kHz (mono or stereo)                                                      | • One file per chapter/section <br>• Max ~120 min per file <br>• RMS –23 to –18 dB <br>• Noise floor ≤ –60 dB RMS <br>• Peaks ≤ –3 dB <br>• 0.5–1s room tone head/tail     | Files uploaded individually to ACX portal <br>• ACX validates automatically + human QA                                                                       | • ISBN optional (Audible assigns ASIN if none) <br>• Title, Subtitle, Author(s), Narrator(s), Publisher, Rights                                                    | JPG <br>• Min 2400×2400 px <br>• Max 10 MB <br>• Square, 1:1 ratio                    | • Upload directly via ACX portal <br>• Global distribution via Audible, Amazon, iTunes <br>• Optional **exclusive contract** with higher royalties           |
| **Kobo Writing Life**             | MP3 only <br>• Standard retail quality (≥192 kbps CBR, 44.1 kHz)                                      | • One file per chapter/section <br>• Max file size 200 MB <br>• Total audiobook size ≤ 2 GB <br>• Max ~1500 files per audiobook                                            | Requires **manifest file** (JSON or Excel sheet) that lists chapter order and metadata <br>• Delivered with audio + cover + metadata                         | • ISBN required <br>• Title, Subtitle, Author(s), Narrator(s), Language, Publisher, Description                                                                    | JPG/PNG <br>• Square, 1:1 ratio <br>• Min 1400×1400 px <br>• Recommended 2400×2400 px | • Upload directly via Kobo Writing Life portal <br>• Manifest maps chapter files to metadata <br>• Distribution global via Kobo + partners                   |

📝 Special Notes

Apple Books

Requires ISBN. Apple never assigns one.

Delivery is via aggregators; ONIX feed acts as the “manifest.”

Google Play Books

Implicit manifest: ordering is derived from naming conventions (ID_XofY).

Supports both human- and auto-narrated audiobooks.

Spotify

Specs are less strict; most distribution still happens via aggregators.

Preview/sample file is mandatory.

ISBN is not required.

ACX / Audible

The strictest audio quality standards (RMS, noise floor, peaks).

ISBN is optional — if you don’t provide one, Amazon generates an ASIN.

Kobo Writing Life

Requires a manifest file (JSON or Excel) to map audio files to book structure.

ISBN is mandatory.

File size limits are tighter (200 MB/file, 2 GB total).



Excellent. Here’s a **universal audiobook manifest template** you can adopt as your **single source of truth**, built on the **W3C Audiobooks JSON-LD** schema. Then, I’ll show you how to transform it for **Apple (ONIX), Kobo (JSON/Excel), Google (naming/ZIP), ACX (portal), and Spotify (portal)**.

---

# 📖 Universal Audiobook Manifest (JSON-LD, W3C)

```json
{
  "@context": ["https://www.w3.org/ns/pub-context"],
  "type": "Audiobook",
  "id": "urn:isbn:9780000000001",
  "name": "Sample Audiobook Title",
  "author": [
    { "type": "Person", "name": "Jane Doe" }
  ],
  "narrator": [
    { "type": "Person", "name": "John Smith" }
  ],
  "publisher": { "type": "Organization", "name": "Example Publishing" },
  "inLanguage": "en",
  "datePublished": "2025-01-01",
  "duration": "PT8H30M",  
  "readingOrder": [
    { "url": "chapter01.mp3", "name": "Chapter 1", "duration": "PT12M30S" },
    { "url": "chapter02.mp3", "name": "Chapter 2", "duration": "PT15M45S" }
  ],
  "resources": [
    { "url": "cover.jpg", "rel": "cover" },
    { "url": "booklet.pdf", "rel": "supplemental" }
  ],
  "links": [
    { "url": "https://publisher.com/sample", "rel": "preview" }
  ]
}
```

---

# 🔄 Platform-Specific Adaptations

## 1. **Apple Books (via ONIX 3.0)**

* Transform JSON → ONIX `<Product>` entry.
* Mapping:

  * `id` → `<ProductIdentifier><ProductIDType>15</ProductIDType><IDValue>` (ISBN)
  * `name` → `<TitleDetail><TitleElement><TitleText>`
  * `author` → `<Contributor><ContributorRole>A01</ContributorRole>`
  * `narrator` → `<Contributor><ContributorRole>A06</ContributorRole>`
  * `readingOrder` → `<SupportingResource>` with `<ResourceVersionFeature>` listing tracks.
  * `resources.cover` → `<SupportingResource><ResourceContentType>01</ResourceContentType>` (cover).

👉 Output: **ONIX XML package** submitted via aggregator.

---

## 2. **Kobo Writing Life**

* Kobo accepts JSON or Excel manifest.
* Example (Excel equivalent):

| File Name     | Chapter Title | Duration | Order |
| ------------- | ------------- | -------- | ----- |
| chapter01.mp3 | Chapter 1     | 00:12:30 | 1     |
| chapter02.mp3 | Chapter 2     | 00:15:45 | 2     |

👉 Transformation: export the `readingOrder` array into this tabular manifest.
👉 ISBN, metadata, and cover embedded in metadata form + manifest file.

---

## 3. **Google Play Books**

* Google uses **implicit ordering** via file naming.
* Transformation rules:

  * `readingOrder[0]` → `9780000000001_1of2.mp3`
  * `readingOrder[1]` → `9780000000001_2of2.mp3`
* Package all files + cover in `9780000000001.zip`.
* Metadata fields (title, author, narrator, ISBN) → filled in Partner Center.

👉 No explicit manifest; JSON → **naming convention + ZIP**.

---

## 4. **ACX / Audible**

* No manifest upload; requires **manual portal entry**.
* Transformation: export JSON fields into upload form:

  * `id` → ISBN (optional; if missing Amazon assigns ASIN)
  * `name` → Book Title
  * `author`, `narrator`, `publisher` → typed into portal fields
  * `readingOrder` → sequential file uploads (chapters)
  * Cover → uploaded separately (JPEG, 2400×2400)

👉 ACX is **form-driven**; manifest helps you prefill.

---

## 5. **Spotify (Spotify for Authors)**

* Metadata minimal; requires upload order.
* Transformation:

  * `name`, `author`, `narrator`, `publisher`, `description` → portal fields
  * `readingOrder` → file upload order (chapter01.mp3, chapter02.mp3, etc.)
  * Cover → uploaded (JPEG/PNG 3000×3000)
  * Preview → select one chapter or sample clip

👉 Manifest → **internal checklist** to ensure order/metadata consistency.

---

# 📝 Special Notes on Alignment

* **Kobo** is closest to W3C spec (explicit manifest).
* **Apple** uses **ONIX XML**, richer than W3C but more complex.
* **Google & ACX** rely on **implicit ordering** (naming or portal UI).
* **Spotify** is the loosest — basically metadata form + file order.

---




