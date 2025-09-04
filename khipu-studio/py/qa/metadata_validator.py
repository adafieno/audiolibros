# qa/metadata_validator.py
# -*- coding: utf-8 -*-
"""
Validador de metadatos de audiolibros (por plataforma):
- apple_books
- google_play_books
- spotify
- audible_kdp_virtual_voice

Entradas:
  - meta: dict con metadatos del título (ver esquema ejemplo más abajo)
  - cover_path: (opcional) ruta a JPG/PNG
  - audio_files: (opcional) lista de rutas a archivos por capítulo (MP3/WAV/FLAC)
  - platform: una de {"apple_books","google_play_books","spotify","audible_kdp_virtual_voice"}

Salidas:
  dict con:
    {
      "platform": "...",
      "ok": bool,
      "errors": [..],
      "warnings": [..],
      "normalized": { ... meta normalizado ... },
      "cover": {"ok":bool,"issues":[..],"details":{...}} (si se valida),
      "audio": {"ok":bool,"issues":[..],"summary":[..]} (si se valida)
    }

Requisitos opcionales:
  - Pillow (PIL) para validar portada: pip install pillow
  - soundfile para validar WAV/FLAC: pip install soundfile
  - ffprobe (de FFmpeg) opcional para leer bitrate de MP3

CLI:
  python -m qa.metadata_validator \
    --platform apple_books \
    --meta dossier/book.meta.json \
    --cover art/cover_3000.jpg \
    --audio-list analysis/chapters_list.json \
    --out analysis/validation_report.json

Ejemplo de schema 'meta' (JSON):
{
  "title": "Puntajada",
  "subtitle": "",
  "authors": ["Autora X"],
  "narrators": ["Narración con voz digital"],
  "language": "es-PE",
  "description": "…",
  "keywords": ["novela", "Lima", "suspenso"],
  "categories": ["FICTION / Literary"],
  "publisher": "Tu Sello",
  "publication_date": "2025-08-15",
  "rights": "© 2025 Tu Sello",
  "series": {"name": "", "number": null},
  "sku": "PUNT-2025-AB",
  "isbn": "",
  "disclosure_digital_voice": true
}
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# --------- Dependencias opcionales ---------
try:
    from PIL import Image  # type: ignore
    _HAS_PIL = True
except Exception:
    _HAS_PIL = False

try:
    import soundfile as sf  # type: ignore
    _HAS_SF = True
except Exception:
    _HAS_SF = False


# --------- Reglas por plataforma (tuneables) ---------

@dataclass
class PlatformRules:
    name: str
    title_max: int = 200
    subtitle_max: int = 200
    author_required: bool = True
    narrator_required: bool = False
    description_min: int = 50
    description_max: int = 4000
    keywords_min: int = 0
    keywords_max: int = 30
    categories_min: int = 0
    require_language_bcp47: bool = True
    allow_empty_subtitle: bool = True
    require_disclosure_digital_voice: bool = False  # exigir divulgación explícita
    cover_square_min_px: int = 3000                 # recomendado 3000x3000
    cover_formats: Tuple[str, ...] = ("jpg","jpeg","png")
    cover_color_spaces: Tuple[str, ...] = ("RGB",)  # preferido RGB
    audio_sr_allowed: Tuple[int, ...] = (44100, 48000)
    audio_channels_allowed: Tuple[int, ...] = (1, 2)

APPLE = PlatformRules(
    name="apple_books",
    narrator_required=False,
    require_disclosure_digital_voice=False,
)
GOOGLE = PlatformRules(
    name="google_play_books",
    narrator_required=False,
    keywords_max=15,
)
SPOTIFY = PlatformRules(
    name="spotify",
    narrator_required=False,
    keywords_max=20,
)
AUDIBLE = PlatformRules(
    name="audible_kdp_virtual_voice",
    narrator_required=False,
    require_disclosure_digital_voice=True,  # recomendable en KDP VV
)

_RULESETS = {
    "apple_books": APPLE,
    "google_play_books": GOOGLE,
    "spotify": SPOTIFY,
    "audible_kdp_virtual_voice": AUDIBLE,
}


# --------- Utils de normalización/validación ---------

_BCP47 = re.compile(r"^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-[A-Z]{2}|\d{3})?(?:-[A-Za-z0-9]{5,8})*$")
_CTRL = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F]")

def _norm_str(s: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())

def _has_ctrl(s: str) -> bool:
    return bool(_CTRL.search(s))

def _dedup_list(xs: List[str]) -> List[str]:
    seen = set()
    out = []
    for x in xs:
        k = _norm_str(x)
        if k and k.lower() not in seen:
            out.append(k)
            seen.add(k.lower())
    return out

def _validate_bcp47(code: str) -> bool:
    return bool(_BCP47.match(code))

def _is_all_caps_word(s: str) -> bool:
    return s.isupper() and len(s) > 3

def _check_len(field: str, s: str, min_len: int, max_len: int, errors: List[str], warnings: List[str]) -> None:
    if len(s) < min_len:
        warnings.append(f"{field}: muy corto ({len(s)} < {min_len}).")
    if len(s) > max_len:
        errors.append(f"{field}: demasiado largo ({len(s)} > {max_len}).")

def _ensure_rules(platform: str) -> PlatformRules:
    if platform not in _RULESETS:
        raise SystemExit(f"Plataforma desconocida: {platform}. Usa una de: {', '.join(_RULESETS.keys())}")
    return _RULESETS[platform]


# --------- Validación de portada ---------

def _validate_cover(cover_path: Optional[str], rules: PlatformRules) -> Dict[str, Any]:
    if not cover_path:
        return {"ok": False, "issues": ["Falta portada."], "details": {}}

    p = Path(cover_path)
    issues: List[str] = []
    details: Dict[str, Any] = {"path": str(p)}

    if not p.exists():
        return {"ok": False, "issues": [f"Portada no encontrada: {p}"], "details": details}

    ext = p.suffix.lower().lstrip(".")
    if ext not in rules.cover_formats:
        issues.append(f"Formato no recomendado: .{ext}. Usa: {', '.join(rules.cover_formats)}")

    if not _HAS_PIL:
        issues.append("No se pudo analizar la imagen (instala 'Pillow' para validación completa).")
        return {"ok": len(issues) == 0, "issues": issues, "details": details}

    try:
        with Image.open(p) as im:
            w, h = im.size
            mode = im.mode
            details.update({"width": w, "height": h, "mode": mode})
            if w != h:
                issues.append(f"La portada debe ser cuadrada. Actual: {w}x{h}.")
            if min(w, h) < rules.cover_square_min_px:
                issues.append(f"Resolución insuficiente: mínimo {rules.cover_square_min_px}px por lado.")
            if rules.cover_color_spaces and mode not in rules.cover_color_spaces:
                issues.append(f"Espacio de color recomendado {rules.cover_color_spaces}; actual: {mode}.")
    except Exception as e:
        issues.append(f"No se pudo abrir la imagen: {e!r}")

    return {"ok": len(issues) == 0, "issues": issues, "details": details}


# --------- Validación de audio (opcional) ---------

def _ffprobe_bitrate(path: Path) -> Optional[int]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None
    try:
        out = subprocess.check_output([
            ffprobe, "-v", "error", "-select_streams", "a:0",
            "-show_entries", "stream=bit_rate", "-of", "default=noprint_wrappers=1:nokey=1", str(path)
        ], stderr=subprocess.STDOUT).decode("utf-8", "ignore").strip()
        return int(out) if out.isdigit() else None
    except Exception:
        return None

def _validate_audio_files(audio_files: Optional[List[str]], rules: PlatformRules) -> Dict[str, Any]:
    if not audio_files:
        return {"ok": True, "issues": [], "summary": []}  # opcional

    issues: List[str] = []
    summary: List[Dict[str, Any]] = []
    for i, f in enumerate(audio_files, start=1):
        p = Path(f)
        if not p.exists():
            issues.append(f"[{i}] no existe: {p}")
            continue
        ext = p.suffix.lower()
        det: Dict[str, Any] = {"path": str(p), "ext": ext}
        try:
            if ext in (".wav", ".flac") and _HAS_SF:
                info = sf.info(str(p))
                det.update({"samplerate": info.samplerate, "channels": info.channels, "format": info.format, "subtype": info.subtype})
                if info.samplerate not in rules.audio_sr_allowed:
                    issues.append(f"[{i}] SR no recomendado ({info.samplerate} Hz). Usa {rules.audio_sr_allowed}.")
                if info.channels not in rules.audio_channels_allowed:
                    issues.append(f"[{i}] canales no recomendados ({info.channels}). Usa {rules.audio_channels_allowed}.")
            elif ext == ".mp3":
                br = _ffprobe_bitrate(p)
                if br:
                    det["bitrate_kbps"] = round(br/1000)
                    if br < 128000:
                        issues.append(f"[{i}] MP3 con bitrate bajo (~{round(br/1000)} kbps). Recomendado ≥ 128 kbps (mejor 256 kbps).")
                else:
                    det["bitrate_kbps"] = None
            # otros formatos: no se valida a fondo aquí
        except Exception as e:
            issues.append(f"[{i}] error al leer audio: {e!r}")
        summary.append(det)

    return {"ok": len(issues) == 0, "issues": issues, "summary": summary}


# --------- Validación de metadatos ---------

def validate_metadata(meta: Dict[str, Any], platform: str, *, cover_path: Optional[str] = None, audio_files: Optional[List[str]] = None) -> Dict[str, Any]:
    rules = _ensure_rules(platform)
    errors: List[str] = []
    warnings: List[str] = []

    # Normalización básica
    title = _norm_str(meta.get("title"))
    subtitle = _norm_str(meta.get("subtitle"))
    authors = _dedup_list(list(meta.get("authors") or []))
    narrators = _dedup_list(list(meta.get("narrators") or []))
    language = _norm_str(meta.get("language") or "es-PE")
    description = _norm_str(meta.get("description"))
    keywords = _dedup_list(list(meta.get("keywords") or []))
    categories = _dedup_list(list(meta.get("categories") or []))
    publisher = _norm_str(meta.get("publisher"))
    publication_date = _norm_str(meta.get("publication_date"))
    rights = _norm_str(meta.get("rights"))
    sku = _norm_str(meta.get("sku"))
    isbn = _norm_str(meta.get("isbn"))
    disclosure = bool(meta.get("disclosure_digital_voice", False))
    series = meta.get("series") or {}
    series_name = _norm_str(series.get("name") if isinstance(series, dict) else "")
    series_number = series.get("number") if isinstance(series, dict) else None

    # Campos obligatorios
    if not title:
        errors.append("title: requerido.")
    _check_len("title", title, 2, rules.title_max, errors, warnings)
    if _has_ctrl(title):
        errors.append("title: contiene caracteres de control no permitidos.")

    if not rules.allow_empty_subtitle and not subtitle:
        warnings.append("subtitle: vacío (permitido, pero considera agregar uno).")
    if subtitle:
        _check_len("subtitle", subtitle, 2, rules.subtitle_max, errors, warnings)
        if subtitle and subtitle.lower() == title.lower():
            warnings.append("subtitle: igual al título; evalúa eliminarlo.")
    if rules.author_required and not authors:
        errors.append("authors: se requiere al menos un autor.")
    if rules.narrator_required and not narrators:
        warnings.append("narrators: vacío; agrega crédito de narración si aplica.")

    if rules.require_language_bcp47 and (not language or not _validate_bcp47(language)):
        errors.append(f"language: debe ser BCP-47 (ej. 'es-PE'). Recibido: '{language}'.")

    if not description:
        errors.append("description: requerido.")
    else:
        _check_len("description", description, rules.description_min, rules.description_max, errors, warnings)

    if len(keywords) > rules.keywords_max:
        warnings.append(f"keywords: demasiadas ({len(keywords)} > {rules.keywords_max}).")
    if len(keywords) < rules.keywords_min:
        warnings.append(f"keywords: muy pocas ({len(keywords)} < {rules.keywords_min}).")

    # Categorías (no imponemos BISAC estricta, solo presencia opcional)
    if rules is GOOGLE and not categories:
        warnings.append("categories: Google Play Books rinde mejor con 1–3 categorías (BISAC/tema).")

    # Publisher / fecha / derechos
    if not publisher:
        warnings.append("publisher: vacío.")
    if publication_date and not re.match(r"^\d{4}-\d{2}-\d{2}$", publication_date):
        errors.append("publication_date: formato esperado YYYY-MM-DD.")
    if rights and len(rights) < 5:
        warnings.append("rights: muy corto; incluye '© YYYY Titular'.")

    # Serie
    if series_name and series_number is None:
        warnings.append("series: nombre sin número; agrega 'number' si aplica (entero).")

    # SKU/ISBN
    if not sku and not isbn:
        warnings.append("Identificador: agrega 'sku' (interno) o 'isbn' si lo tienes.")
    if isbn and not re.match(r"^(97(8|9))?\d{9}(\d|X)$", isbn.replace("-", "").replace(" ", "")):
        warnings.append("isbn: formato atípico; verifica dígitos y guiones.")

    # Divulgación de voz sintética
    if rules.require_disclosure_digital_voice and not disclosure:
        warnings.append("disclosure_digital_voice: KDP Virtual Voice suele requerir una divulgación clara en la ficha/descripcion.")

    # MAYÚSCULAS excesivas
    if _is_all_caps_word(title):
        warnings.append("title: parece TODO MAYÚSCULAS; evita bloque de mayúsculas.")
    for a in authors:
        if _is_all_caps_word(a):
            warnings.append(f"authors: '{a}' parece TODO MAYÚSCULAS.")

    # Duplicidades
    if subtitle and subtitle.lower() in title.lower():
        warnings.append("subtitle: redundante (incluido en el título).")
    if keywords:
        clash = [k for k in keywords if k.lower() in title.lower()]
        if clash:
            warnings.append(f"keywords: duplican partes del título ({', '.join(clash[:3])}).")

    # Validaciones de portada y audio
    cover_result = _validate_cover(cover_path, rules) if cover_path else None
    audio_result = _validate_audio_files(audio_files, rules) if audio_files else None

    # Meta normalizado
    normalized = {
        "title": title,
        "subtitle": subtitle,
        "authors": authors,
        "narrators": narrators,
        "language": language,
        "description": description,
        "keywords": keywords,
        "categories": categories,
        "publisher": publisher,
        "publication_date": publication_date,
        "rights": rights,
        "series": {"name": series_name, "number": series_number} if series_name or series_number else None,
        "sku": sku,
        "isbn": isbn,
        "disclosure_digital_voice": disclosure,
    }

    # Recolecta issues agregando portada/audio
    if cover_result:
        if not cover_result["ok"]:
            errors.extend([f"cover: {m}" for m in cover_result["issues"]])
        else:
            warnings.extend([f"cover: {m}" for m in cover_result["issues"] if m])
    if audio_result:
        if not audio_result["ok"]:
            warnings.extend([f"audio: {m}" for m in audio_result["issues"]])  # suelen ser recomendaciones
        else:
            warnings.extend([f"audio: {m}" for m in audio_result["issues"] if m])

    ok = len(errors) == 0

    return {
        "platform": platform,
        "ok": ok,
        "errors": errors,
        "warnings": warnings,
        "normalized": normalized,
        "cover": cover_result,
        "audio": audio_result,
    }


# --------- CLI ---------

def _read_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))

def main():
    import argparse
    ap = argparse.ArgumentParser(description="Validador de metadatos de audiolibros.")
    ap.add_argument("--platform", required=True, choices=list(_RULESETS.keys()))
    ap.add_argument("--meta", required=True, help="Ruta a JSON con metadatos.")
    ap.add_argument("--cover", help="Ruta a imagen de portada (JPG/PNG).")
    ap.add_argument("--audio-list", help="Ruta a JSON con lista de rutas de audio por capítulo (opcional).")
    ap.add_argument("--out", help="Ruta para escribir el reporte JSON.")
    args = ap.parse_args()

    meta = _read_json(args.meta)
    audio_files = None
    if args.audio_list:
        af = _read_json(args.audio_list)
        if isinstance(af, list):
            audio_files = [str(x) for x in af]
        elif isinstance(af, dict) and "rows" in af:
            # p.ej., manifest de packaging.gplay_spotify
            audio_files = [r.get("mp3_path") or r.get("flac_path") or "" for r in af.get("rows", [])]
            audio_files = [x for x in audio_files if x]
        else:
            print("WARN: --audio-list no es una lista ni un manifest conocido; se ignora.")

    rep = validate_metadata(meta, args.platform, cover_path=args.cover, audio_files=audio_files)

    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Reporte → {args.out}")
    else:
        print(json.dumps(rep, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
