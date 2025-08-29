# Dossier – Especificaciones por componente

> Esta guía describe **qué es**, **para qué sirve**, **cómo se edita/valida** y **cómo se relaciona** cada archivo JSON del **dossier**. Incluye campos obligatorios, reglas, ejemplos y “do’s & don’ts”. Los equipos editorial, audio y tech pueden usarla como contrato operativo.

---

## Estructura

```bash
/dossier/
  manifest.json                 # Índice maestro (versiones, checksums, compatibilidad)
  book.meta.json                # Metadatos del libro
  narrative.structure.json      # Estructura de capítulos
  paratext.front_matter.json    # Paratexto
  characters.json               # Personajes (id, nombre, aliases, rol, notas culturales)
  voices.cast.json              # Casting de voces (Azure TTS)
  lexicon.json                  # Términos y pronunciaciones
  stylepacks.json               # Paquetes SSML (prosodia, pausas, énfasis)
  sensitivity.rules.json        # Reglas culturales / de sensibilidad
  pronunciations.sensitive.json # Pronunciaciones de alta sensibilidad
  ssml.plan/
    ch01.plan.json
    ch02.plan.json
    ...
  production.settings.json      # Parámetros de TTS, masterización, chunking
  qc.checklist.json             # Hoja de control (estados de QA)
  delivery.targets.json         # Formatos de exportación por plataforma

```

## 1) `manifest.json`

**Propósito**
Índice maestro del dossier. Enumera todos los componentes, sus esquemas de validación, checksums, y límites globales (p. ej., restricciones SSML de Azure).

**Productor →** Integrador/DevOps
**Consumidor →** Compilador, validadores CI

**Campos obligatorios**

* `version` (semver del dossier).
* `components[]` (cada item describe un JSON del dossier).
* `compat.ssml_limits` (límites críticos para generación SSML/TTS).

**Reglas**

* Todos los archivos presentes en `/dossier` deben listarse en `components`.
* `checksum` es SHA-256 del archivo correspondiente.
* Si cambian `stylepacks`, `characters` o `voices.cast`, marcar en CI si hay que recompilar planes SSML.

**Ejemplo (recortado)**

```json
{
  "version": "0.3.0",
  "components": [
    {
      "name": "book.meta",
      "path": "book.meta.json",
      "schema": "schemas/dossier/book.meta.schema.json",
      "checksum": "9a6c...e1",
      "updated_at": "2025-08-29T18:45:02Z"
    }
  ],
  "compat": {
    "min_compiler": ">=0.2",
    "ssml_limits": { "max_kb_per_request": 48, "max_voice_tags_per_request": 40 }
  }
}
```

**Checklist de validación**

* [ ] Todos los componentes existen y abren.
* [ ] Checksums concuerdan.
* [ ] `ssml_limits` ≥ a los límites reales de Azure TTS (si dudas, deja margen).

**Anti-patrones**

* ❌ Omitir un archivo del dossier.
* ❌ Subir `manifest.json` sin actualizar checksums.

---

## 2) `book.meta.json`

**Propósito**
Metadatos editoriales y legales.

**Productor →** Editorial / Producción
**Consumidor →** Compilador, empaquetadores de distribución

**Campos clave**

* `book_id` (slug estable), `title`, `language` (ej. `es-PE`).
* `authors[]`, `isbn`, `rights`, `description`.

**Ejemplo**

```json
{
  "book_id": "puntajada",
  "title": "Puntajada",
  "language": "es-PE",
  "authors": ["Nombre Autora"],
  "isbn": "978-1-23456-789-7",
  "rights": "© 2025 Autora. Todos los derechos reservados.",
  "description": "Novela ambientada en la costa peruana..."
}
```

**Checklist**

* [ ] `book_id` se usa como prefijo en rutas/salidas.
* [ ] Idioma correcto (ISO + país si aplica).
* [ ] Derechos claros.

**Anti-patrones**

* ❌ Cambiar `book_id` a mitad de proyecto.
* ❌ Descripciones con spoilers si se usarán en tiendas.

---

## 3) `narrative.structure.json`

**Propósito**
Estructura de capítulos, con `word_count` para planificación de chunking/SSML.

**Productor →** Parser/Equipo editorial
**Consumidor →** Compilador, planificador SSML, LLM por capítulo

**Campos**

* `chapters[]` con `{ id, title, word_count, cast_presence? }`.

**Reglas**

* `id`: `ch01`, `ch02`, … (orden estable).
* `word_count` es del **texto narrable** (no incluye paratexto, a menos que se decida narrarlo).

**Ejemplo**

```json
{
  "chapters": [
    { "id": "ch01", "title": "La marea manda", "word_count": 3921 },
    { "id": "ch02", "title": "El regreso", "word_count": 3480 }
  ]
}
```

**Checklist**

* [ ] Títulos 1:1 con el manuscrito.
* [ ] Conteos realistas (revisar saltos anómalos).

**Anti-patrones**

* ❌ Insertar “Partes/Secciones” como capítulos si no se narran.

---

## 4) `paratext.front_matter.json`

**Propósito**
Paratexto (portadilla, copyright, dedicatoria, índice…) separado de la narración principal.

**Productor →** Parser
**Consumidor →** Compilador, planificador (para decidir si se narra)

**Campos**

* `word_count`
* `spans[]` con `{ text, italics_ranges?, source_offsets? }`.

**Ejemplo**

```json
{
  "word_count": 185,
  "spans": [
    { "text": "© 2025 Autora", "italics_ranges": [], "source_offsets": [0, 12] }
  ]
}
```

**Checklist**

* [ ] Confirmar si se narrará o no (y con qué voz).
* [ ] Revisar derechos antes de publicar audio de paratexto.

---

## 5) `characters.json`

**Propósito**
Lista canónica de personajes con alias y notas culturales.

**Productor →** Editorial / LLM (+ edición)
**Consumidor →** Casting TTS, SSML Planner, QA

**Campos**

* `characters[]` `{ id, name, aliases[], role, voice_traits, cultural_notes, requires_review }`.

**Reglas**

* `id`: minúsculas con guiones bajos (ej. `don_severino`).
* Mantener **alias** para coincidencias (ej. “Severino”, “Sr. Severino”).

**Ejemplo**

```json
{
  "characters": [
    {
      "id": "don_severino",
      "name": "Don Severino",
      "aliases": ["Severino", "Sr. Severino"],
      "role": "Patriarca pescador; voz de autoridad",
      "voice_traits": "hombre, grave, +60, es-PE costeño",
      "cultural_notes": "Evitar caricaturas de acentos; respeto a léxico local.",
      "requires_review": true
    }
  ]
}
```

**Checklist**

* [ ] ¿Todos los hablantes reales están listados?
* [ ] Alias cubren diminutivos y apelativos (“Mamá”, “Tía Charo”).

**Anti-patrones**

* ❌ Fusionar personas distintas bajo un mismo `id`.
* ❌ “voice\_traits” sin revisión cultural.

---

## 6) `voices.cast.json`

**Propósito**
Mapa personaje→voz TTS + estilo/alternativas.

**Productor →** Dirección de voces
**Consumidor →** Planificador SSML, motor TTS

**Campos**

* `cast[]` `{ character_id, voice_id, style?, alternatives[], requires_review }`.

**Reglas**

* `character_id` debe existir en `characters.json`.
* `voice_id` es un nombre válido de Azure TTS (ej. `es-ES-ElviraNeural`).

**Ejemplo**

```json
{
  "cast": [
    {
      "character_id": "don_severino",
      "voice_id": "es-ES-ArnauNeural",
      "style": "narration-neutral",
      "alternatives": ["es-MX-JorgeNeural"],
      "requires_review": true
    }
  ]
}
```

**Checklist**

* [ ] Acento y timbre alineados con `voice_traits`.
* [ ] Alternativas listas por si se cambia la voz principal.

**Anti-patrones**

* ❌ Usar voces es-ES para personajes que se definieron explícitamente como adolescentes peruanos sin validar el resultado.

---

## 7) `lexicon.json`

**Propósito**
Pronunciaciones, préstamos y términos que requieran control.

**Productor →** Editorial/QA (con apoyo LLM)
**Consumidor →** Generador SSML (etiquetas `<phoneme>`/reglas)

**Campos**

* `locale` (ej. `es-PE`)
* `terms[]` `{ grapheme, ipa?, rules?, type, requires_review }`

**Ejemplo**

```json
{
  "locale": "es-PE",
  "terms": [
    { "grapheme": "Chorrillos", "type": "toponimo", "requires_review": true },
    { "grapheme": "Qhapaq Ñan", "ipa": "kʰaˈpak ɲan", "type": "toponimo", "requires_review": true }
  ]
}
```

**Checklist**

* [ ] Topónimos y antropónimos sensibles cubiertos.
* [ ] ¿Hay fuentes/justificación para IPA? (ver archivo de pronunciaciones sensibles).

**Anti-patrones**

* ❌ Mezclar IPA y reglas contradictorias.
* ❌ Dejar “type” = “desconocido” cuando sí se conoce.

---

## 8) `stylepacks.json`

**Propósito**
Paquetes SSML reutilizables (prosodia, pausas, énfasis) para mantener consistencia.

**Productor →** Dirección de audio/SSML
**Consumidor →** Plan SSML por capítulo

**Campos**

* `packs[]` con `{ id, prosody{ rate/pitch/volume }, breaks{ comma_ms/paragraph_ms }, notes? }`

**Ejemplo**

```json
{
  "packs": [
    {
      "id": "chapter_default",
      "prosody": { "rate": "medium", "pitch": "+0st" },
      "breaks": { "comma_ms": 250, "paragraph_ms": 900 },
      "notes": "Ritmo contemplativo, aire de costa."
    }
  ]
}
```

**Checklist**

* [ ] `comma_ms` y `paragraph_ms` testeados con TTS de destino.
* [ ] Notas claras para directores.

**Anti-patrones**

* ❌ Crear un pack por cada capricho: fomentar reutilización.

---

## 9) `sensitivity.rules.json`

**Propósito**
Guía cultural: expresiones a evitar o adaptar, con razones.

**Productor →** Editor cultural
**Consumidor →** LLM (paráfrasis opcional), QA

**Campos**

* `reviewer` (responsable)
* `banned_phrases[]` (opcional)
* `adapt_phrases[]` `{ from, to, rationale }`

**Ejemplo**

```json
{
  "reviewer": "Editor Cultural",
  "banned_phrases": ["Expresión X"],
  "adapt_phrases": [
    { "from": "chamba", "to": "trabajo", "rationale": "Neutralidad regional en este pasaje." }
  ]
}
```

**Checklist**

* [ ] Racional claro; no censurar sin motivo.
* [ ] Alineado a `book.meta.language`.

**Anti-patrones**

* ❌ Sustituciones que cambien el sentido del autor.

---

## 10) `pronunciations.sensitive.json`

**Propósito**
Pronunciaciones de alta sensibilidad (indígenas, poco documentadas) con trazabilidad.

**Productor →** QA lingüística / Asesoría externa
**Consumidor →** Generador SSML, QA final

**Campos**

* `items[]` `{ grapheme, ipa|ssml_phoneme, note?, source? }`

**Ejemplo**

```json
{
  "items": [
    {
      "grapheme": "Qhapaq Ñan",
      "ipa": "kʰaˈpak ɲan",
      "note": "Consulta con lingüista",
      "source": "Diccionario X"
    }
  ]
}
```

**Checklist**

* [ ] Al menos una forma: `ipa` o `ssml_phoneme`.
* [ ] Fuente documentada cuando sea posible.

**Anti-patrones**

* ❌ Inventar IPA sin validar.

---

## 11) `ssml.plan/chXX.plan.json`

**Propósito**
Plan de cortes por capítulo con offsets (en caracteres) y asignación de voz/pack.

**Productor →** Planificador SSML (semi-auto + revisión humana)
**Consumidor →** Generador SSML y motor TTS

**Campos**

* `chapter_id`
* `chunks[]` `{ id, start_char, end_char, voice, stylepack, notes? }`

**Reglas**

* `end_char` > `start_char`.
* Respetar límites de Azure: tamaño (KB) y número de etiquetas; si se excede, partir en más `chunks`.

**Ejemplo**

```json
{
  "chapter_id": "ch01",
  "chunks": [
    { "id": "ch01_001", "start_char": 0, "end_char": 1200, "voice": "don_severino", "stylepack": "chapter_default" },
    { "id": "ch01_002", "start_char": 1201, "end_char": 2500, "voice": "narrador", "stylepack": "chapter_default" }
  ]
}
```

**Checklist**

* [ ] Duración objetivo \~7–8 min / chunk (o lo definido en `production.settings`).
* [ ] No cortar a mitad de diálogo crucial (revisar “límites semánticos”).

**Anti-patrones**

* ❌ Poner voces distintas dentro del mismo parlamento sin necesidad.

---

## 12) `production.settings.json`

**Propósito**
Contrato técnico para TTS, WAV y masterización.

**Productor →** Audio Lead / Integración
**Consumidor →** Generador SSML, render TTS, masterización

**Campos**

* `tts_engine`: `"Azure TTS"`.
* `wav_spec`: `{ sr_hz, bit_depth, channels }`.
* `chunking`: `{ target_minutes, hard_cap_minutes, azure_soft_limit_kb }`.
* `loudness?`: `{ rms_dbfs_min, rms_dbfs_max, true_peak_dbfs_max, noise_floor_dbfs_max }`.

**Ejemplo**

```json
{
  "tts_engine": "Azure TTS",
  "wav_spec": { "sr_hz": 44100, "bit_depth": 16, "channels": 1 },
  "chunking": { "target_minutes": 7.0, "hard_cap_minutes": 8.0, "azure_soft_limit_kb": 48 },
  "loudness": { "rms_dbfs_min": -23, "rms_dbfs_max": -18, "true_peak_dbfs_max": -3, "noise_floor_dbfs_max": -60 }
}
```

**Checklist**

* [ ] Especificaciones homogéneas entre capítulos.
* [ ] Límites Azure conservadores (mejor sobrar que faltar).

**Anti-patrones**

* ❌ Cambiar `sr_hz` entre capítulos.

---

## 13) `qc.checklist.json`

**Propósito**
Hoja de control de QA con estados y auditoría mínima.

**Productor →** QA / Coordinación
**Consumidor →** Gestión de proyecto, release

**Campos**

* `items[]` `{ id, label, owner?, status, notes? }`
* `audit_trail[]` `{ timestamp, action, by }` (opcional)

**Ejemplo**

```json
{
  "items": [
    { "id": "qc_lex", "label": "Lexicón validado", "owner": "Editor", "status": "doing" },
    { "id": "qc_mix", "label": "Masterización revisada", "status": "todo" }
  ],
  "audit_trail": [
    { "timestamp": "2025-08-29T19:12:00Z", "action": "items.qc_lex → doing", "by": "Editor" }
  ]
}
```

**Checklist**

* [ ] Estados consistentes (`todo|doing|done|na`).
* [ ] Auditoría básica en milestones.

**Anti-patrones**

* ❌ Cambiar estados sin notas cuando se rechaza algo importante.

---

## 14) `delivery.targets.json`

**Propósito**
Requisitos de exportación por plataforma.

**Productor →** Integración/Publishing
**Consumidor →** Empaquetadores, validadores previos a publicación

**Campos**

* `apple`: `{ format: "m4b", cover_px, chapter_markers }`
* `google`: `{ format, cover_px }`
* `spotify`: `{ format, cover_px, digital_voice }`
* `audible_kdp`: `{ virtual_voice }`

**Ejemplo**

```json
{
  "apple": { "format": "m4b", "cover_px": 3000, "chapter_markers": true },
  "google": { "format": "mp3_256_cbr", "cover_px": 3000 },
  "spotify": { "format": "mp3_256_cbr", "cover_px": 3000, "digital_voice": true },
  "audible_kdp": { "virtual_voice": false }
}
```

**Checklist**

* [ ] Portadas 3000×3000 px RGB.
* [ ] Marcadores de capítulo presentes donde aplique.
* [ ] Marcar “voz digital” (Spotify) si corresponde.

**Anti-patrones**

* ❌ Entregar WAV a Apple Books (requerirá m4b).
* ❌ MP3 VBR cuando la tienda exige CBR.

---

# Reglas de orquestación y dependencias

* **Orden típico de edición**

  1. `book.meta` → 2) `narrative.structure` + `paratext.front_matter` →
  2. `characters` → 4) `voices.cast` → 5) `lexicon` + `pronunciations.sensitive` →
  3. `stylepacks` → 7) `ssml.plan/*` → 8) `production.settings` →
  4. `delivery.targets` → 10) `qc.checklist`.

* **Triggers recomendados**

  * Cambia `characters` → marcar `voices.cast` como “requires\_review” y recomponer `ssml.plan`.
  * Cambia `stylepacks` → recompilar `ssml.plan`.
  * Cambia `production.settings.chunking` → re-particionar `ssml.plan`.

* **Validación en CI**

  * Validar cada archivo contra su **JSON Schema**.
  * Comprobar referencias cruzadas (`character_id`, `chapter_id`).
  * Verificar límites SSML de `manifest.compat.ssml_limits`.

---

# Sugerencias de edición segura

* Usa PRs por archivo (granular).
* Mantén ejemplos y notas dentro de `notes`/`cultural_notes`, nunca como “texto suelto”.
* Prefiere **ids estables** y evita renombrarlos; si renombres, migra referencias.

---

Si quieres, en el siguiente paso te genero **un ZIP con estas especificaciones en `.md` individuales** (uno por archivo) para que tu equipo los lea/consulte sin tocar código.
