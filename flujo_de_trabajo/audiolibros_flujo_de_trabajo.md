# Guía Integral del Flujo de Trabajo de Producción y Publicación de Audiolibros con Voces Sintéticas 

**Contexto:** Esta guía actualiza el proceso para producir y publicar un audiolibro con Azure TTS, integrando el nuevo concepto de **Dossier** (antes “biblia”) y los **módulos de código** que automatizan cada fase. Plataformas objetivo: **Apple Books, Google Play Books, Spotify** y (opcional) **Audible** vía **KDP Virtual Voice**.

---

## 0) Dossier: fuente oficial

El **Dossier** es un conjunto de archivos **JSON** versionables que centralizan dirección creativa, reglas técnicas y artefactos de producción. Se revisa por editores y guía la automatización.

**Estructura recomendada (carpeta `dossier/`):**

* `narrative.structure.json` — índice canónico: capítulos, títulos, orden y conteo de palabras.
* `characters.json` — personajes canónicos, aliases, relaciones (\*borrador si proviene de LLM).
* `voices.cast.json` — casting: narrador y mapeo personaje → voz Azure (+estilos base).
* `stylepacks.json` — paquetes de prosodia/pausas (IDs y parámetros).
* `lexicon.json` — términos con pronunciaciones (IPA/x-sampa opcional, notas).
* `pronunciations.sensitive.json` — nombres/topónimos de alta sensibilidad para control humano.
* `production.settings.json` — límites y parámetros de producción (SR, formato, targets de loudness, límites SSML/KB/tiempo, WPM, etc.).
* `book.meta.json` — metadatos editoriales para tiendas (título, autores, lenguaje BCP-47, keywords, categorías,
  publisher, disclosure de voz digital, fechas, derechos, serie, SKU/ISBN).

> **Principios:** granular, auditable, “requires\_review: true” donde aplique, y utilizable por los linters/validadores.

---

## 1) Ingesta del manuscrito

**Entrada:** `manuscript/*.docx|.txt`

**Automatización:**

* **`ingest/manuscript_parser.py`** → detecta capítulos con reglas conservadoras y emite:

  * `analysis/chapters_txt/chXX.txt` (un TXT por capítulo)
  * `dossier/narrative.structure.json` (ids, títulos, conteo)

**Revisión humana:** verificar títulos, capítulos “fantasma” y cortes.

---

## 2) Construcción del Dossier inicial (borradores)

**Automatización (opcional con LLM):**

* **`dossier/build_from_manuscript.py`** → a partir de `chapters_txt/` genera borradores con `requires_review: true`:

  * `characters.json`, `voices.cast.json` (sugerido), `stylepacks.json`, `lexicon.json`, `pronunciations.sensitive.json`.
  * Actualiza `narrative.structure.json` con conteos reales.

**Revisión humana:** curaduría de personajes, casting definitivo, reglas culturales, léxico sensible.

---

## 3) Planificación de SSML por capítulo (chunking consciente)

**Objetivo:** dividir cada capítulo en **subsegmentos** seguros para Azure (p. ej. ≤ **8 min**, ≤ **50 KB** por request, ≤ **40** `<voice>` por bloque; parametrizable en `production.settings.json`).

**Automatización:**

* **`ssml/plan_builder.py`** → crea `{chXX}.plan.json` con chunks, asignación de voces y “stylepacks”.
* **`qa/ssml_linter.py`** (previo a síntesis) → valida XML/SSML, límites y consistencia con el Dossier.

---

## 4) Generación de SSML (XML)

**Automatización:**

* **`ssml/xml_generator.py`** → renderiza cada chunk a `ssml/{chXX_####}.xml` usando:

  * `voices.cast.json` (voz por personaje/narrador)
  * `stylepacks.json` (prosodia, breaks)
  * `lexicon*.json` (phoneme/ipa opcional en palabras específicas)

> **Nota:** En esta guía **SSML se maneja solo como XML** (no YAML/alternativas).

---

## 5) Síntesis TTS (Azure)

**Automatización:**

* **`tts/azure_client.py`** → `ssml/*.xml` → WAV por chunk (44.1 kHz, 16-bit, mono).
* **`core/cache.py`** → caché por **chunk** (clave = hash de SSML normalizado + voz + opts + deps).
* **`tts/postproc.py`** → concatena chunks → `audio/wav/chapters/{chXX}.wav` (con gap ajustable).

**Buenas prácticas:** reintentos con backoff, telemetría de chars y latencias, uso de Batch TTS si el capítulo es largo.

---

## 6) Mejora sutil y Masterización

**Automatización:**

* **`audio/enhance.py`** → filtros mínimos no destructivos (HPF, de-esser, tilt EQ suave, expander leve).
* **`audio/mastering.py`** → normaliza a RMS objetivo (p. ej., −20 dBFS) con techo de pico (−3 dBFS) y chequeos de ruido.
* **`audio/qc_report.py`** → métricas por capítulo (pico, RMS, duraciones, flags). Exporta JSON/MD.

> Ambos pasos usan caché de transformación (hash del input + config).

---

## 7) Empaquetado por plataforma

**Apple Books**

* **`packaging/apple_m4b.py`** → mezcla capítulos y genera `.m4b` (AAC) con marcas de capítulo y portada.

**Google Play Books / Spotify**

* **`packaging/gplay_spotify.py`** → exporta por capítulo a **MP3 CBR** (p. ej., 256 kbps) y/o **FLAC**, embebe metadatos/portada y genera `chapters_manifest.{json,csv}`.

**Audible (KDP Virtual Voice – ruta A, opcional)**

* Carga asistida (manual) desde KDP: seleccionar voz, ajustar pronunciaciones, fijar precio.

**Entrega**

* **`delivery/package_manifest.py`** (opcional) → ZIP por plataforma con audio, portada, meta, reportes y checksums.

---

## 8) Validaciones previas a publicación

* **`qa/metadata_validator.py`** → valida `book.meta.json`, portada (3000×3000 RGB) y archivos (SR, canales, bitrate recomendado).
* **`qa/ssml_linter.py`** → ya usado antes de TTS, puede re-ejecutarse para regresiones.
* **`qa/pronunciation_audit.py`** (opcional) → cruza texto vs. lexicón y sensibles.
* **`qa/ethics_flags.py`** (opcional) → reglas culturales/localismos (es-PE) para revisión humana.

---

## 9) Publicación

* **Apple Books**: subir `.m4b` mediante **Books/Authors Connect**.
* **Google Play Books**: subir tracks MP3/FLAC con metadatos vía **Partner Center**.
* **Spotify**: subir tracks y marcar **narración con voz digital** donde aplique.
* **Audible (KDP VV)**: crear desde el eBook en KDP y seguir el flujo de **Virtual Voice**.

> **Stubs de subida:** `delivery/uploader_stubs.py` (opcional) — valida artefactos, abre portales y guía campos obligatorios.

---

## 10) Operación, costos y mantenimiento

* **`ops/costs.py`** → estimación/auditoría de costos (TTS, LLM, almacenamiento, egress, CPU-min).
* **`core/cache_cli.py`** (opcional) → estadísticas, prune LRU por tamaño, purge por namespace.
* **`core/config.py`** → gestión de `.env` y perfiles dev/stage/prod.
* **`core/logging.py` / `core/telemetry.py`** → logs JSON y métricas por etapa.

---

## 11) Árbol de carpetas sugerido

```
/puntajada
  /manuscript/Puntajada.docx
  /dossier/
    narrative.structure.json
    characters.json
    voices.cast.json
    stylepacks.json
    lexicon.json
    pronunciations.sensitive.json
    production.settings.json
    book.meta.json
  /analysis/
    /chapters_txt/chXX.txt
    /qc/*.report.{json,md}
    costs/
  /ssml/*.xml
  /audio/wav/chunks/
  /audio/wav/chapters/
  /deliverables/
    /apple/*.m4b
    /gplay_spotify/{mp3,flac}/ + chapters_manifest.{json,csv}
  /art/cover_3000.jpg
  /admin/sku_map.json
  /.cache/ (TTS/LLM/audio/packaging)
```

---

## 12) Hoja de control (publicación)

* [ ] `narrative.structure.json` revisado (ids/títulos/orden/words).
* [ ] `characters.json` curado por editores.
* [ ] `voices.cast.json` acordado (narrador y reparto), con estilos por escena.
* [ ] `stylepacks.json` aprobado (pausas y prosodia estándar/diálogo).
* [ ] `lexicon.json` y `pronunciations.sensitive.json` validados (IPA cuando sea seguro).
* [ ] `production.settings.json` con límites Azure (KB/tiempo/voices) y audio targets.
* [ ] `book.meta.json` pasado por `qa/metadata_validator.py`.
* [ ] `ssml/*.xml` pasado por `qa/ssml_linter.py` sin errores.
* [ ] WAV por capítulo (`audio/wav/chapters/`) mejorado y masterizado.
* [ ] Empaquetado Apple `.m4b` verificado.
* [ ] Exportación Google/Spotify (MP3/FLAC) con manifiestos.
* [ ] Portada 3000×3000 RGB validada.
* [ ] (Opcional) KDP Virtual Voice configurado y disclosure presente.
* [ ] QA humano final (pronunciaciones, ritmo, naturalidad, coherencia cultural).
* [ ] `admin/sku_map.json` actualizado.

---

## 13) Orquestación fin-a-fin

**`orchestration/pipeline_cli.py`** — etapas disponibles:

* `ssml_plan` → `{ch}.plan.json`
* `ssml_xml` → `ssml/*.xml`
* `tts` → WAVs por chunk
* `concat` → WAV por capítulo
* `enhance` → mejora sutil
* `master` → normalización técnica
* `qc` → reportes de calidad
* `package_apple` → `.m4b`
* `package_gplay_spotify` → MP3/FLAC + manifiestos
* `all` → todo en cadena

> Integra caché por etapa y lectura de `dossier/*.json`.

---

## 14) Buenas prácticas de “toque humano”

* Prólogo/epílogo **humanos**.
* Interludios/ambientes **sutiles** y con licencia clara.
* Controles culturales y de accesibilidad (pausas mínimas, claridad de títulos, nivelación de capítulos).
* Múltiples voces **coherentes** con el Dossier para humanizar la narración.

---

## 15) Anexos (módulos principales)

* **Ingesta**: `ingest/manuscript_parser.py`
* **Dossier**: `dossier/build_from_manuscript.py`
* **SSML**: `ssml/plan_builder.py`, `ssml/xml_generator.py`
* **Calidad SSML**: `qa/ssml_linter.py`
* **TTS**: `tts/azure_client.py`, `tts/postproc.py`
* **Audio**: `audio/enhance.py`, `audio/mastering.py`, `audio/qc_report.py`
* **Packaging**: `packaging/apple_m4b.py`, `packaging/gplay_spotify.py`
* **Validación meta**: `qa/metadata_validator.py`
* **Costos**: `ops/costs.py`
* **Orquestación**: `orchestration/pipeline_cli.py`
* **Caché**: `core/cache.py`, `core/cache_cli.py`

---

**Conclusión:** El **Dossier** aporta control editorial y repetibilidad técnica. Acoplado a linters, caché y orquestación, permite producir audiolibros con voces sintéticas de forma ágil sin perder el toque humano ni el rigor técnico.
