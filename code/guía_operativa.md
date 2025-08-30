# Guía operativa: de cero a publicación

## 1) Prerrequisitos del sistema

**macOS**

```bash
brew install ffmpeg sox coreutils m4b-tool
```

**Ubuntu/Debian**

```bash
sudo apt update
sudo apt install -y ffmpeg sox jq git python3-venv
# m4b-tool: ver repo oficial (phar o docker) si lo necesitas
```

**Windows**

* Instala **Python 3.10–3.12** y **FFmpeg** (agrega a PATH).

Verifica:

```bash
ffmpeg -version
python3 --version
```

## 2) Crear proyecto y entorno

```bash
mkdir -p ~/audiolibros/puntajada && cd ~/audiolibros/puntajada
bash bootstrap.sh   # en Linux/macOS
# o
powershell -ExecutionPolicy Bypass -File .\bootstrap_win.ps1   # en Windows

source .venv/bin/activate   # (Windows: .venv\Scripts\Activate.ps1)
```

## 3) Coloca tus archivos

* Manuscrito: `manuscript/Puntajada.docx`
* Portada: `art/cover_3000.jpg` (3000×3000, RGB)

## 4) Dossier mínimo (ya lo deja el bootstrap)

* `dossier/production.settings.json` (límites SSML/Azure, audio, packaging)
* `dossier/book.meta.json` (metadatos editoriales)
* Carpeta de trabajo creada: `analysis/`, `ssml/`, `audio/`, `deliverables/`, etc.

## 5) Probar TTS (humo)

```bash
# el bootstrap crea ssml/test.xml
python - <<'PY'
from pathlib import Path; print("Existe test.xml:", Path("ssml/test.xml").exists())
PY
```

Ejecuta tu cliente TTS (cuando lo tengas en `tts/azure_client.py`) sobre `ssml/test.xml`. La segunda corrida debe ser un **cache hit**.

## 6) Producción paso a paso

**6.1 Ingesta (capítulos + estructura)**

```bash
python -m ingest.manuscript_parser \
  --in manuscript/Puntajada.docx \
  --out-chapters analysis/chapters_txt \
  --out-structure dossier/narrative.structure.json \
  --min-words 300
```

**6.2 Dossier inicial (borradores)**

```bash
# Con LLM (OPENAI_API_KEY en .env)
python -m dossier.build_from_manuscript \
  --chapters-dir analysis/chapters_txt \
  --structure dossier/narrative.structure.json \
  --dossier-dir dossier
# O sin LLM (heurístico)
python -m dossier.build_from_manuscript \
  --chapters-dir analysis/chapters_txt \
  --structure dossier/narrative.structure.json \
  --dossier-dir dossier --no-llm
```

> Edita a mano: `characters.json`, `voices.cast.json`, `stylepacks.json`, `lexicon.json`, `pronunciations.sensitive.json`.

**6.3 Plan SSML (chunking seguro)**

```bash
python -m ssml.plan_builder \
  --chapters-dir analysis/chapters_txt \
  --structure dossier/narrative.structure.json \
  --out-dir analysis/ssml_plans
```

**6.4 Generar SSML (XML)**

```bash
python -m ssml.xml_generator \
  --plans analysis/ssml_plans \
  --dossier dossier \
  --out-dir ssml
```

**6.5 Lint SSML (Azure-friendly)**

```bash
python -m qa.ssml_linter \
  --dir ssml \
  --voices-cast dossier/voices.cast.json \
  --out-json analysis/ssml_lint/report.json \
  --md analysis/ssml_lint/report.md
```

**6.6 Síntesis + concatenado**

```bash
python -m tts.azure_client \
  --ssml-dir ssml \
  --out-chunks audio/wav/chunks \
  --max-workers 4

python -m tts.postproc concat \
  --in-chunks audio/wav/chunks \
  --out-chapters audio/wav/chapters \
  --gap-ms 700
```

**6.7 Enhance → Master → QC**

```bash
python -m audio.enhance --in audio/wav/chapters --out audio/wav/chapters
python -m audio.mastering --in audio/wav/chapters --out audio/wav/chapters --rms -20 --peak -3
python -m audio.qc_report --in audio/wav/chapters --out analysis/qc
```

**6.8 Empaquetado**

```bash
# Apple Books (.m4b)
python -m packaging.apple_m4b \
  --in audio/wav/chapters \
  --out deliverables/apple/Puntajada.m4b \
  --cover art/cover_3000.jpg \
  --book-meta dossier/book.meta.json

# Google Play Books / Spotify (MP3 y/o FLAC)
python -m packaging.gplay_spotify \
  --in audio/wav/chapters \
  --out deliverables/gplay_spotify \
  --cover art/cover_3000.jpg \
  --book-meta dossier/book.meta.json \
  --mp3-bitrate 256k
```

**6.9 Validación previa**

```bash
python -m qa.metadata_validator \
  --platform apple_books \
  --meta dossier/book.meta.json \
  --cover art/cover_3000.jpg \
  --audio-list deliverables/gplay_spotify/chapters_manifest.json \
  --out analysis/validation_report.apple.json

python -m qa.metadata_validator --platform google_play_books --meta dossier/book.meta.json --cover art/cover_3000.jpg --out analysis/validation_report.gplay.json
python -m qa.metadata_validator --platform spotify --meta dossier/book.meta.json --cover art/cover_3000.jpg --out analysis/validation_report.spotify.json
```

**6.10 Publicación**

* **Apple Books:** sube `.m4b` en Books/Authors Connect.
* **Google Play Books:** sube MP3/FLAC en Partner Center.
* **Spotify:** sube MP3/FLAC y marca “narración con voz digital”.
* **(Opcional) Audible KDP Virtual Voice:** desde tu eBook en KDP.

## 7) Costos (opcional)

```bash
python -m ops.costs estimate \
  --chapters-dir analysis/chapters_txt \
  --pricing ops/costs.pricing.json \
  --out-json analysis/costs/report.json \
  --out-csv analysis/costs/chapters.csv
```

## 8) Consejos rápidos

* Portada **cuadrada 3000×3000** y **RGB**.
* SSML: ≤ **8 min**, ≤ **50 KB**, ≤ **40** `<voice>` por bloque.
* Corre siempre el **linter** antes de TTS.
* El **caché** evita pagar dos veces por lo mismo: no lo borres salvo que cambies reglas.

---

# bootstrap.sh

Pega esto en `bootstrap.sh` en la raíz de tu proyecto y ejecútalo con `bash bootstrap.sh`.

```bash
#!/usr/bin/env bash
set -euo pipefail

# 0) Rutas
ROOT="$(pwd)"
echo "Bootstrap en: $ROOT"

# 1) Carpetas
mkdir -p manuscript dossier analysis/chapters_txt ssml \
         audio/wav/{chunks,chapters} deliverables/{apple,gplay_spotify} \
         art admin .cache ops qa packaging tts ssml ingest dossier audio orchestration core review

# 2) Python venv + requirements
python3 -m venv .venv
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  .venv\\Scripts\\python -m pip install --upgrade pip
else
  source .venv/bin/activate
  python -m pip install --upgrade pip
fi

cat > requirements.txt <<'REQ'
python-docx
pydub
soundfile
numpy
scipy
mutagen
Pillow
tqdm
click
python-dotenv
openai>=1.40.0
# azure speech sdk (opcional; puedes usar REST)
azure-cognitiveservices-speech
REQ

pip install -r requirements.txt

# 3) .env plantilla (edítalo)
cat > .env <<'ENV'
# OpenAI (opcional para Dossier asistido)
OPENAI_API_KEY=
OPENAI_BASE=
OPENAI_MODEL=gpt-4o-mini

# Azure TTS
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=eastus
AZURE_TTS_VOICE_DEFAULT=es-ES-ElviraNeural
ENV

# 4) Dossier seeds
cat > dossier/production.settings.json <<'JSON'
{
  "ssml": {
    "target_minutes": 7.0,
    "hard_cap_minutes": 8.0,
    "max_kb_per_request": 48,
    "default_voice": "es-ES-ElviraNeural",
    "default_stylepack": "chapter_default",
    "wpm": 165.0,
    "locale": "es-PE"
  },
  "tts": { "timeout_s": 30, "retries": 4, "max_workers": 4 },
  "concat": { "gap_ms": 700, "sr_hz": 44100, "channels": 1, "sample_width_bytes": 2 },
  "enhance": { "enable_deesser": true, "enable_tilt": true, "enable_expander": true },
  "master": { "rms_target_dbfs": -20.0, "peak_ceiling_dbfs": -3.0 },
  "packaging": {
    "apple": { "aac_bitrate": "128k" },
    "gplay_spotify": { "mp3_bitrate": "256k", "flac": false, "sr_hz": 44100, "channels": 1 }
  }
}
JSON

cat > dossier/book.meta.json <<'JSON'
{
  "title": "Puntajada",
  "subtitle": "",
  "authors": ["Autora X"],
  "narrators": ["Narración con voz digital"],
  "language": "es-PE",
  "description": "Novela ambientada en Lima...",
  "keywords": ["novela","Lima","suspenso"],
  "categories": ["FICTION / Literary"],
  "publisher": "Tu Sello",
  "publication_date": "2025-09-01",
  "rights": "© 2025 Tu Sello",
  "series": {"name": "", "number": null},
  "sku": "PUNT-2025-AB",
  "isbn": "",
  "disclosure_digital_voice": true
}
JSON

# 5) SSML de prueba
cat > ssml/test.xml <<'XML'
<speak xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-PE">
  <voice name="es-ES-ElviraNeural">
    <p>Prueba de síntesis para el pipeline de audiolibros.</p>
  </voice>
</speak>
XML

# 6) Makefile (comodín)
cat > Makefile <<'MK'
INGEST=python -m ingest.manuscript_parser --in manuscript/Puntajada.docx --out-chapters analysis/chapters_txt --out-structure dossier/narrative.structure.json --min-words 300
DOSSIER=python -m dossier.build_from_manuscript --chapters-dir analysis/chapters_txt --structure dossier/narrative.structure.json --dossier-dir dossier
PLAN=python -m ssml.plan_builder --chapters-dir analysis/chapters_txt --structure dossier/narrative.structure.json --out-dir analysis/ssml_plans
XML=python -m ssml.xml_generator --plans analysis/ssml_plans --dossier dossier --out-dir ssml
LINT=python -m qa.ssml_linter --dir ssml --voices-cast dossier/voices.cast.json --out-json analysis/ssml_lint/report.json
TTS=python -m tts.azure_client --ssml-dir ssml --out-chunks audio/wav/chunks
CONCAT=python -m tts.postproc concat --in-chunks audio/wav/chunks --out-chapters audio/wav/chapters
ENH=python -m audio.enhance --in audio/wav/chapters --out audio/wav/chapters
MASTER=python -m audio.mastering --in audio/wav/chapters --out audio/wav/chapters --rms -20 --peak -3
QC=python -m audio.qc_report --in audio/wav/chapters --out analysis/qc

all: ingest dossier ssml tts audio pack
ingest: ; $(INGEST)
dossier: ; $(DOSSIER)
ssml: plan xml lint
plan: ; $(PLAN)
xml: ; $(XML)
lint: ; $(LINT)
tts: ; $(TTS) && $(CONCAT)
audio: ; $(ENH) && $(MASTER) && $(QC)
MK

echo "✅ Bootstrap completado. Edita .env y coloca tu manuscrito en manuscript/"
```

**Cómo usarlo:**

```bash
chmod +x bootstrap.sh
bash bootstrap.sh
source .venv/bin/activate
# coloca manuscript/Puntajada.docx y art/cover_3000.jpg
```

---

# bootstrap\_win.ps1

```powershell
<# 
  Bootstrap para Windows (PowerShell)
  - Crea estructura de carpetas
  - Configura venv de Python
  - Instala requirements
  - Genera seeds del Dossier, .env y SSML de prueba
#>

# --- Utilidades ---
function Write-Info($msg) { Write-Host "[*] $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "[✓] $msg" -ForegroundColor Green }
function Die($msg)        { Write-Host "[x] $msg" -ForegroundColor Red; exit 1 }

$ErrorActionPreference = "Stop"
$root = Get-Location

Write-Info "Bootstrap en: $root"

# --- 0) Requisitos básicos ---
# Python
$py = (Get-Command python -ErrorAction SilentlyContinue) ?? (Get-Command py -ErrorAction SilentlyContinue)
if (-not $py) { Die "No se encontró Python en PATH. Instala Python 3.10–3.12 e inténtalo de nuevo." }

# FFmpeg (opcionalmente intenta instalar con winget si no está)
$ff = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ff) {
  Write-Info "FFmpeg no encontrado. Intentando instalar con winget (requiere Windows 10/11)…"
  try {
    winget install -e --id Gyan.FFmpeg -h
    Write-OK "FFmpeg instalado."
  } catch {
    Write-Host "[!] No se pudo instalar FFmpeg automáticamente. Instálalo manualmente y asegúrate de agregarlo al PATH." -ForegroundColor Yellow
  }
}

# --- 1) Carpetas ---
$dirs = @(
  "manuscript", "dossier", "analysis/chapters_txt", "ssml",
  "audio/wav/chunks", "audio/wav/chapters",
  "deliverables/apple", "deliverables/gplay_spotify",
  "art", "admin", ".cache",
  "ops","qa","packaging","tts","ingest","audio","orchestration","core","review"
)
foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
Write-OK "Estructura de carpetas creada."

# --- 2) Entorno virtual ---
Write-Info "Creando entorno virtual .venv…"
python -m venv .venv
if (-not (Test-Path ".\.venv\Scripts\Activate.ps1")) { Die "No se pudo crear el venv." }
Write-OK "Entorno virtual creado."

# --- 3) Requirements ---
$requirements = @"
python-docx
pydub
soundfile
numpy
scipy
mutagen
Pillow
tqdm
click
python-dotenv
openai>=1.40.0
# Azure Speech SDK (puedes usar REST en su lugar, esto es opcional)
azure-cognitiveservices-speech
"@
Set-Content -LiteralPath "requirements.txt" -Value $requirements -Encoding utf8
Write-Info "Instalando requirements (puede tardar)…"
& .\.venv\Scripts\python -m pip install --upgrade pip
& .\.venv\Scripts\pip install -r requirements.txt
Write-OK "Dependencias instaladas."

# --- 4) .env plantilla ---
$envFile = @"
# OpenAI (opcional para Dossier asistido)
OPENAI_API_KEY=
OPENAI_BASE=
OPENAI_MODEL=gpt-4o-mini

# Azure TTS
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=eastus
AZURE_TTS_VOICE_DEFAULT=es-ES-ElviraNeural
"@
Set-Content -LiteralPath ".env" -Value $envFile -Encoding utf8
Write-OK ".env creado (edítalo con tus claves)."

# --- 5) Dossier seeds ---
$prodSettings = @"
{
  "ssml": {
    "target_minutes": 7.0,
    "hard_cap_minutes": 8.0,
    "max_kb_per_request": 48,
    "default_voice": "es-ES-ElviraNeural",
    "default_stylepack": "chapter_default",
    "wpm": 165.0,
    "locale": "es-PE"
  },
  "tts": { "timeout_s": 30, "retries": 4, "max_workers": 4 },
  "concat": { "gap_ms": 700, "sr_hz": 44100, "channels": 1, "sample_width_bytes": 2 },
  "enhance": { "enable_deesser": true, "enable_tilt": true, "enable_expander": true },
  "master": { "rms_target_dbfs": -20.0, "peak_ceiling_dbfs": -3.0 },
  "packaging": {
    "apple": { "aac_bitrate": "128k" },
    "gplay_spotify": { "mp3_bitrate": "256k", "flac": false, "sr_hz": 44100, "channels": 1 }
  }
}
"@
Set-Content -LiteralPath "dossier\production.settings.json" -Value $prodSettings -Encoding utf8

$bookMeta = @"
{
  "title": "Puntajada",
  "subtitle": "",
  "authors": ["Autora X"],
  "narrators": ["Narración con voz digital"],
  "language": "es-PE",
  "description": "Novela ambientada en Lima...",
  "keywords": ["novela","Lima","suspenso"],
  "categories": ["FICTION / Literary"],
  "publisher": "Tu Sello",
  "publication_date": "2025-09-01",
  "rights": "© 2025 Tu Sello",
  "series": {"name": "", "number": null},
  "sku": "PUNT-2025-AB",
  "isbn": "",
  "disclosure_digital_voice": true
}
"@
Set-Content -LiteralPath "dossier\book.meta.json" -Value $bookMeta -Encoding utf8
Write-OK "Seeds de Dossier creados."

# --- 6) SSML de prueba ---
$ssmlTest = @"
<speak xmlns=""http://www.w3.org/2001/10/synthesis"" xml:lang=""es-PE"">
  <voice name=""es-ES-ElviraNeural"">
    <p>Prueba de síntesis para el pipeline de audiolibros.</p>
  </voice>
</speak>
"@
Set-Content -LiteralPath "ssml\test.xml" -Value $ssmlTest -Encoding utf8
Write-OK "SSML de prueba listo en ssml\test.xml"

Write-Host ""
Write-OK "Bootstrap completado."
Write-Host "Siguiente:"
Write-Host "1) Abre '.env' y coloca tus claves (OPENAI_API_KEY opcional, AZURE_SPEECH_KEY/REGION obligatorias)."
Write-Host "2) Coloca el manuscrito en 'manuscript\Puntajada.docx' y la portada en 'art\cover_3000.jpg' (3000x3000 RGB)."
Write-Host "3) Activa el entorno: .\.venv\Scripts\Activate.ps1"
Write-Host "4) Ejecuta tus módulos (ingesta → dossier → ssml → tts → audio → packaging)."

```

Guarda este archivo como `bootstrap_win.ps1` y ejecútalo en PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\bootstrap_win.ps1
```

Este script replica la lógica de `bootstrap.sh` para Windows: crea carpetas, venv, requirements, `.env`, seeds de dossier y `ssml/test.xml`. Luego activa el entorno con:

```powershell
.\.venv\Scripts\Activate.ps1
```

Coloca tu manuscrito en `manuscript\Puntajada.docx` y la portada en `art\cover_3000.jpg`.
