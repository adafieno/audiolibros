# ssml/xml_generator.py
# -*- coding: utf-8 -*-
"""
Generación de SSML XML por chunk para Azure TTS.

Entradas (por chunk):
- Texto fuente del capítulo (para recortar por offsets start_char:end_char).
- Plan SSML del capítulo: {"chapter_id","chunks":[{id,start_char,end_char,voice,stylepack}]}
- Dossier parcial:
    - voices.cast.json (mapa character_id -> voice_id Azure + style opcional)
    - stylepacks.json (rate/pitch/volume y breaks)
    - lexicon.json + pronunciations.sensitive.json (IPA / ssml_phoneme)

Salida:
- Cadena XML con <speak> ... <voice name="..."><mstts:express-as ...><prosody ...> ... </prosody></mstts:express-as></voice></speak>
- Función para escribir a disco todos los chunks de un capítulo.

Notas:
- Usa xml.etree.ElementTree con namespaces (SSML y mstts).
- Inyecta <break> tras comas según stylepack.breaks.comma_ms.
- Entre párrafos añade <break> (paragraph_ms) además del <p> (por robustez).
- Coincidencias de lexicón: case-insensitive exacta por palabra.
"""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from core.logging import get_logger, log_span
from core.errors import SSMLRenderError
from ssml.plan_builder import estimate_kb  # reusamos estimador de tamaño

_LOG = get_logger("ssml.xml")

# Namespaces SSML / Azure
SSML_NS = "http://www.w3.org/2001/10/synthesis"
MSTTS_NS = "https://www.w3.org/2001/mstts"
XML_NS = "http://www.w3.org/XML/1998/namespace"
ET.register_namespace("", SSML_NS)
ET.register_namespace("mstts", MSTTS_NS)


# -------------------------- Utilidades de casting y packs --------------------------

def resolve_voice(voice_field: str, voices_cast: Dict[str, Any], default_voice: str) -> Tuple[str, Optional[str]]:
    """
    Determina la voz Azure a usar y un estilo (mstts:express-as) opcional.
    - Si `voice_field` tiene pinta de voz Azure (contiene 'Neural'), úsalo literal.
    - Si no, se interpreta como character_id y se busca en voices_cast.
    Devuelve (voice_id, style_or_None).
    """
    if "Neural" in voice_field and "-" in voice_field:
        return voice_field, None
    # character_id
    style = None
    item = None
    for it in (voices_cast.get("cast") or []):
        if it.get("character_id") == voice_field:
            item = it
            break
    if item:
        vid = item.get("voice_id") or default_voice
        style = item.get("style")
        return vid, style
    return default_voice, None


def pack_for(stylepack_id: str, stylepacks: Dict[str, Any]) -> Dict[str, Any]:
    """
    Devuelve el dict de pack por id, o uno neutro.
    """
    packs = stylepacks.get("packs") or []
    for p in packs:
        if p.get("id") == stylepack_id:
            return p
    # neutro
    return {"prosody": {"rate": "medium"}, "breaks": {"comma_ms": 250, "paragraph_ms": 900}}


# -------------------------- Lexicón / pronunciaciones --------------------------

def build_lexicon_map(lexicon: Optional[Dict[str, Any]], sensitive: Optional[Dict[str, Any]]) -> Dict[str, Dict[str, str]]:
    """
    Construye un mapa grapheme(lower) -> {"ipa": "..."} o {"ssml_phoneme": "<phoneme ...>...</phoneme>"}.
    - Prioriza IPA si está disponible.
    """
    m: Dict[str, Dict[str, str]] = {}

    if lexicon:
        for t in lexicon.get("terms", []):
            g = str(t.get("grapheme", "")).strip()
            if not g:
                continue
            key = g.lower()
            ipa = (t.get("ipa") or "").strip()
            rules = (t.get("rules") or "").strip()
            if ipa:
                m[key] = {"ipa": ipa}
            elif rules:
                # opción avanzada: insertar reglas SSML prehechas (no IPA)
                m[key] = {"ssml_phoneme": rules}

    if sensitive:
        for it in sensitive.get("items", []):
            g = str(it.get("grapheme", "")).strip()
            if not g:
                continue
            key = g.lower()
            ipa = (it.get("ipa") or "").strip()
            ssml = (it.get("ssml_phoneme") or "").strip()
            if ipa:
                m[key] = {"ipa": ipa}
            elif ssml:
                m[key] = {"ssml_phoneme": ssml}

    return m


_WORD_RE = re.compile(r"[\wÁÉÍÓÚÜÑáéíóúüñ]+", re.UNICODE)

def tokenize_mixed(text: str) -> List[Tuple[str, bool]]:
    """
    Divide en tokens (palabra / no-palabra). Devuelve lista de (token, is_word).
    """
    out: List[Tuple[str, bool]] = []
    i = 0
    n = len(text)
    for m in _WORD_RE.finditer(text):
        if m.start() > i:
            out.append((text[i:m.start()], False))
        out.append((m.group(0), True))
        i = m.end()
    if i < n:
        out.append((text[i:], False))
    return out


def apply_lexicon_and_breaks(paragraph_text: str, lexmap: Dict[str, Dict[str, str]], comma_ms: Optional[int]) -> List[Any]:
    """
    Convierte el texto plano de un párrafo en una secuencia de nodos (strings y elementos <phoneme>/<break>).
    - Inserta <phoneme> para palabras que coinciden con lexmap (case-insensitive).
    - Inserta <break time="Xms"/> inmediatamente después de comas (,) si comma_ms está definido.
    Devuelve una lista de 'piezas' aptas para construir contenido mixto (text + tags).
    """
    pieces: List[Any] = []
    tokens = tokenize_mixed(paragraph_text)

    for tok, is_word in tokens:
        if is_word:
            entry = lexmap.get(tok.lower())
            if entry and "ipa" in entry:
                el = ET.Element(f"{{{SSML_NS}}}phoneme", attrib={"alphabet": "ipa", "ph": entry["ipa"]})
                el.text = tok
                pieces.append(el)
            elif entry and "ssml_phoneme" in entry:
                # ssml preformateado: intentamos parsearlo; si falla, lo dejamos como texto literal
                try:
                    el = ET.fromstring(entry["ssml_phoneme"])
                    # si el preformateado no incluye el grafema, lo envolvemos
                    if el.text in (None, ""):
                        el.text = tok
                    pieces.append(el)
                except Exception:
                    pieces.append(tok)
            else:
                pieces.append(tok)
        else:
            # es no-palabra: puede incluir comas, espacios, etc.
            pieces.append(tok)
            if comma_ms and "," in tok:
                # si hay múltiples comas en el token (raro), insertamos un break por cada una
                commas = tok.count(",")
                for _ in range(commas):
                    br = ET.Element(f"{{{SSML_NS}}}break", attrib={"time": f"{int(comma_ms)}ms"})
                    pieces.append(br)
    return pieces


# -------------------------- Construcción SSML --------------------------

def _append_mixed(parent: ET.Element, pieces: List[Any]) -> None:
    """
    Inserta 'pieces' (str o ET.Element) dentro de 'parent' respetando el modelo de .text/.tail.
    """
    prev_el: Optional[ET.Element] = None
    for item in pieces:
        if isinstance(item, ET.Element):
            parent.append(item)
            prev_el = item
        else:
            # cadena
            if len(parent) == 0 and (parent.text is None):
                parent.text = (item or "")
            else:
                # adjunta a tail del último elemento si existe; sino, del último hijo
                if prev_el is not None:
                    prev_el.tail = (prev_el.tail or "") + (item or "")
                else:
                    # si no hay prev_el pero sí hay hijos, usar tail del último
                    if len(parent):
                        last = parent[-1]
                        last.tail = (last.tail or "") + (item or "")
                    else:
                        parent.text = (parent.text or "") + (item or "")


def render_chunk_xml(
    chapter_text: str,
    *,
    start_char: int,
    end_char: int,
    voice: str,
    stylepack_id: str,
    locale: str,
    voices_cast: Optional[Dict[str, Any]],
    stylepacks: Dict[str, Any],
    lexicon: Optional[Dict[str, Any]] = None,
    pronunciations_sensitive: Optional[Dict[str, Any]] = None,
    default_voice: str = "es-ES-ElviraNeural",
) -> str:
    """
    Genera SSML para un rango de texto (chunk). Devuelve XML como UTF-8 (str).
    """
    # 1) Recorte de contenido
    if end_char < start_char:
        raise SSMLRenderError("Rango inválido en chunk", start_char=start_char, end_char=end_char)
    segment = chapter_text[start_char:end_char + 1]

    # 2) Resoluciones
    voice_id, cast_style = resolve_voice(voice, voices_cast or {}, default_voice)
    pack = pack_for(stylepack_id, stylepacks)
    prosody = pack.get("prosody", {}) or {}
    breaks = pack.get("breaks", {}) or {}
    comma_ms = breaks.get("comma_ms")
    paragraph_ms = breaks.get("paragraph_ms")

    # 3) Lexicón combinado
    lexmap = build_lexicon_map(lexicon, pronunciations_sensitive)

    # 4) Construcción de árbol SSML
    speak = ET.Element(f"{{{SSML_NS}}}speak", attrib={"version": "1.0"})
    speak.set(f"{{{XML_NS}}}lang", locale)

    voice_el = ET.SubElement(speak, f"{{{SSML_NS}}}voice", attrib={"name": voice_id})

    container = voice_el  # por defecto, contenedor directo
    # Si hay estilo (de casting), envolver en mstts:express-as
    style_to_apply = cast_style
    if style_to_apply and isinstance(style_to_apply, str) and style_to_apply.strip():
        container = ET.SubElement(voice_el, f"{{{MSTTS_NS}}}express-as", attrib={"style": style_to_apply})

    # Prosodia
    prosody_attrib = {k: v for k, v in {
        "rate": prosody.get("rate"),
        "pitch": prosody.get("pitch"),
        "volume": prosody.get("volume"),
    }.items() if v}
    if prosody_attrib:
        container = ET.SubElement(container, f"{{{SSML_NS}}}prosody", attrib=prosody_attrib)

    # Párrafos: split por doble salto de línea; si no hay, usar texto completo como 1 p
    paragraphs = re.split(r"\n{2,}", segment) or [segment]

    first_p = True
    for p_text in paragraphs:
        p_el = ET.SubElement(container, f"{{{SSML_NS}}}p")
        pieces = apply_lexicon_and_breaks(p_text, lexmap, comma_ms=comma_ms)
        _append_mixed(p_el, pieces)
        # Pausa entre párrafos (además del <p>), si hay más
        if not first_p and paragraph_ms:
            ET.SubElement(container, f"{{{SSML_NS}}}break", attrib={"time": f"{int(paragraph_ms)}ms"})
        first_p = False

    # 5) Serialización
    xml_bytes = ET.tostring(speak, encoding="utf-8", xml_declaration=True, method="xml")
    # Validación ligera: tamaño estimado
    kb = estimate_kb(xml_bytes.decode("utf-8"))
    _LOG.info("ssml_chunk_built", extra={"voice": voice_id, "kb": kb})
    return xml_bytes.decode("utf-8")


def render_plan_to_files(
    plan: Dict[str, Any],
    chapter_text: str,
    out_dir: str | Path,
    *,
    locale: str = "es-PE",
    voices_cast: Optional[Dict[str, Any]] = None,
    stylepacks: Optional[Dict[str, Any]] = None,
    lexicon: Optional[Dict[str, Any]] = None,
    pronunciations_sensitive: Optional[Dict[str, Any]] = None,
    default_voice: str = "es-ES-ElviraNeural",
) -> List[Path]:
    """
    Recorre los chunks de un plan y escribe un XML por chunk en `out_dir`.
    Devuelve las rutas escritas.
    """
    outp = Path(out_dir)
    outp.mkdir(parents=True, exist_ok=True)
    written: List[Path] = []

    stylepacks = stylepacks or {"packs": [{"id": "chapter_default", "prosody": {"rate": "medium"}, "breaks": {"comma_ms": 250, "paragraph_ms": 900}}]}

    with log_span("ssml.render_plan", extra={"chapter": plan.get("chapter_id"), "chunks": len(plan.get("chunks", []))}):
        for ch in (plan.get("chunks") or []):
            try:
                xml = render_chunk_xml(
                    chapter_text,
                    start_char=int(ch["start_char"]),
                    end_char=int(ch["end_char"]),
                    voice=str(ch["voice"]),
                    stylepack_id=str(ch["stylepack"]),
                    locale=locale,
                    voices_cast=voices_cast,
                    stylepacks=stylepacks,
                    lexicon=lexicon,
                    pronunciations_sensitive=pronunciations_sensitive,
                    default_voice=default_voice,
                )
            except Exception as e:
                raise SSMLRenderError("Fallo al renderizar chunk",
                                      chunk_id=ch.get("id"),
                                      chapter_id=plan.get("chapter_id"),
                                      error=str(e))

            fname = f"{plan.get('chapter_id','ch')}_{ch.get('id','chunk')}.xml"
            # Para evitar nombres larguísimos, si ch['id'] ya incluye chapter, respétalo:
            if str(ch.get("id","")).startswith(str(plan.get("chapter_id",""))):
                fname = f"{ch['id']}.xml"

            fpath = outp / fname
            fpath.write_text(xml, encoding="utf-8")
            written.append(fpath)
            _LOG.info("ssml_written", extra={"file": str(fpath)})

    return written


# -------------------------- CLI mínima --------------------------

def _main_cli():
    import argparse
    ap = argparse.ArgumentParser(description="Genera SSML XML por plan de capítulo.")
    ap.add_argument("--plan", required=True, help="Ruta a chXX.plan.json")
    ap.add_argument("--chapter-text", required=True, help="Ruta a texto plano del capítulo")
    ap.add_argument("--dossier", required=False, help="Ruta a carpeta dossier (para leer voices/stylepacks/lexicon)")
    ap.add_argument("--out", required=True, help="Directorio de salida para XML")
    ap.add_argument("--locale", default="es-PE")
    ap.add_argument("--default-voice", default="es-ES-ElviraNeural")
    args = ap.parse_args()

    plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))
    chapter_text = Path(args.chapter_text).read_text(encoding="utf-8")

    voices = stylepacks = lexicon = sensitive = None
    if args.dossier:
        droot = Path(args.dossier)
        def _opt(path):
            p = droot / path
            return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None
        voices = _opt("voices.cast.json")
        stylepacks = _opt("stylepacks.json")
        lexicon = _opt("lexicon.json")
        sensitive = _opt("pronunciations.sensitive.json")

    out_paths = render_plan_to_files(
        plan, chapter_text, args.out,
        locale=args.locale,
        voices_cast=voices,
        stylepacks=stylepacks,
        lexicon=lexicon,
        pronunciations_sensitive=sensitive,
        default_voice=args.default_voice,
    )
    print("\n".join(str(p) for p in out_paths))

if __name__ == "__main__":
    _main_cli()
