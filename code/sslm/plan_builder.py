# ssml/plan_builder.py
# -*- coding: utf-8 -*-
"""
Planificador de SSML por capítulo.

Objetivo
--------
Partir el texto de un capítulo en "chunks" adecuados para Azure TTS, generando
un plan con offsets y metadatos mínimos (voice, stylepack). El plan evita cortes
bruscos dentro de frases y prefiere límites en signos de puntuación o cambios
de párrafo.

Entradas
--------
- chapter_id: str (p.ej. "ch01")
- chapter_text: str (texto plano del capítulo, con saltos de línea)
- default_voice: str (p.ej. "narrador" o "es-ES-ElviraNeural")
- default_stylepack: str (p.ej. "chapter_default")
- limits: dict con claves opcionales:
    - max_kb_per_request: int (ej. 48)
    - max_voice_tags_per_request: int (no se usa aquí; cortes no alternan voces)
- target_minutes: float (ej. 7.0)
- hard_cap_minutes: float (ej. 8.0)

Salidas
-------
dict con:
{
  "chapter_id": "ch01",
  "chunks": [
    {"id":"ch01_001","start_char":0,"end_char":1187,"voice":"narrador","stylepack":"chapter_default"},
    ...
  ]
}

Consideraciones
---------------
- Estimación de duración: WPM ~ 165 (es-PE, narración neutra). Ajustable.
- Estimación de KB: bytes ~ len(utf8)*1.15 (margen por etiquetas SSML), /1024.
- Cortes preferidos en:
  1) Doble salto de línea (fin de párrafo-bloque)
  2) Fin de oración (. ? ! …)
  3) Salto de línea simple
- Si no se alcanza ningún límite "amable", se forza corte en `hard_cap_minutes`.

CLI
---
python -m ssml.plan_builder \
  --chapter-id ch01 --in ch01.txt \
  --voice narrador --stylepack chapter_default \
  --target-min 7 --hard-cap-min 8 --max-kb 48 \
  --out dossier/ssml.plan/ch01.plan.json
"""
from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from core.logging import get_logger, log_span
from core.errors import SSMLPlanError

_LOG = get_logger("ssml.plan")


# -------------------- Heurísticas --------------------

WPM_DEFAULT = 165.0  # palabras/minuto aprox. para es-PE en narración neutra

_END_SENTENCE_RE = re.compile(r"[\.!\?…]+[\"”»)]*\s+", re.UNICODE)
# Consideramos bloque (párrafo largo) como dos saltos de línea
_BLOCK_BREAK_RE = re.compile(r"\n{2,}")
_LINE_BREAK_RE = re.compile(r"\n")  # fallback

def estimate_minutes(text: str, wpm: float = WPM_DEFAULT) -> float:
    words = max(1, len(re.findall(r"\b[\wÁÉÍÓÚÜÑáéíóúüñ'-]+\b", text)))
    return words / max(80.0, wpm)  # clamp inferior para evitar outliers

def estimate_kb(text: str, overhead: float = 0.15) -> int:
    """
    Estimación grosera del tamaño del SSML:
    - Bytes ~ len(UTF-8) * (1 + overhead) ; overhead por etiquetas SSML.
    """
    approx_bytes = int(len(text.encode("utf-8")) * (1.0 + max(0.0, overhead)))
    return math.ceil(approx_bytes / 1024)


# -------------------- Segmentadores --------------------

@dataclass
class Boundary:
    pos: int      # índice de carácter donde es seguro cortar DESPUÉS
    kind: str     # "block" | "sentence" | "line"

def _find_boundaries(text: str) -> List[Boundary]:
    """
    Encuentra posiciones razonables para cortar el capítulo.
    Prioridad: bloque >> oración >> línea.
    """
    bounds: List[Boundary] = []

    # 1) Bloques (dos o más saltos de línea)
    for m in _BLOCK_BREAK_RE.finditer(text):
        bounds.append(Boundary(pos=m.end(), kind="block"))

    # 2) Final de oración
    for m in _END_SENTENCE_RE.finditer(text):
        bounds.append(Boundary(pos=m.end(), kind="sentence"))

    # 3) Salto de línea simple (fallback)
    for m in _LINE_BREAK_RE.finditer(text):
        bounds.append(Boundary(pos=m.end(), kind="line"))

    # Ordenar por posición (ascendente) y prioridad de tipo implicitamente
    bounds.sort(key=lambda b: b.pos)
    return bounds


# -------------------- Construcción de chunks --------------------

def build_chapter_plan(
    chapter_id: str,
    chapter_text: str,
    *,
    default_voice: str,
    default_stylepack: str,
    limits: Optional[Dict[str, int]] = None,
    target_minutes: float = 7.0,
    hard_cap_minutes: float = 8.0,
    wpm: float = WPM_DEFAULT,
) -> Dict[str, object]:
    """
    Devuelve un plan de chunks para un capítulo.
    """
    if not chapter_id or not isinstance(chapter_id, str):
        raise SSMLPlanError("chapter_id inválido")

    text = (chapter_text or "").strip("\n")
    if not text:
        return {"chapter_id": chapter_id, "chunks": []}

    max_kb = int(limits.get("max_kb_per_request", 0)) if limits else 0

    # Precalcular boundaries
    boundaries = _find_boundaries(text)
    boundary_positions = [b.pos for b in boundaries]
    boundary_kinds = [b.kind for b in boundaries]

    chunks: List[Dict[str, object]] = []
    cursor = 0
    idx = 1

    with log_span("ssml.plan.build", extra={"chapter": chapter_id}):
        N = len(text)
        while cursor < N:
            # Objetivo: llegar a ~target_minutes, sin pasarnos del hard cap
            # Primero estimamos un tamaño de texto aproximado para target_minutes
            # usando WPM. Permitimos +/- 15% de elasticidad.
            approx_words_needed = target_minutes * wpm
            # mapeo palabras→caracteres aproximado (5.3 chars/word + 1 espacio)
            approx_chars_needed = int(approx_words_needed * 6.3)
            soft_end = min(N, cursor + max(1000, approx_chars_needed))

            # Buscamos el mejor boundary <= soft_end
            cut_pos, cut_kind = _best_cut(boundary_positions, boundary_kinds, start=cursor, preferred_end=soft_end)

            # En ausencia de boundary razonable, avanzamos hasta hard cap (duración) o fin
            segment = text[cursor:cut_pos] if cut_pos is not None else text[cursor:soft_end]
            minutes = estimate_minutes(segment, wpm=wpm)
            kb = estimate_kb(segment, overhead=0.15)

            # Si nos pasamos de KB, retrocedemos a un boundary anterior (más agresivo)
            if max_kb and kb > max_kb:
                cut_pos2, cut_kind2 = _backoff_by_kb(text, cursor, max_kb, start_guess=cut_pos or soft_end)
                if cut_pos2 is not None and cut_pos2 > cursor:
                    segment = text[cursor:cut_pos2]
                    kb = estimate_kb(segment, overhead=0.15)
                    minutes = estimate_minutes(segment, wpm=wpm)
                    cut_pos, cut_kind = cut_pos2, (cut_kind2 or "sentence")

            # En caso extremo, respetar hard cap por duración
            if minutes > hard_cap_minutes:
                # recortar a una cantidad de caracteres congruente con hard_cap
                factor = hard_cap_minutes / max(0.1, minutes)
                approx_len = int(len(segment) * factor * 0.95)
                if approx_len < 200:
                    approx_len = min(len(segment), 1200)  # evita trozos ridículos
                # buscar boundary lo más cerca posible de approx_len
                target_pos = cursor + approx_len
                cut_pos3, cut_kind3 = _best_cut(boundary_positions, boundary_kinds, start=cursor, preferred_end=target_pos)
                if cut_pos3 and cut_pos3 > cursor:
                    segment = text[cursor:cut_pos3]
                    cut_pos, cut_kind = cut_pos3, (cut_kind3 or "sentence")
                    minutes = estimate_minutes(segment, wpm=wpm)
                    kb = estimate_kb(segment, overhead=0.15)
                else:
                    # última opción: cortar a pelo
                    segment = text[cursor:cursor+approx_len]
                    cut_pos = cursor + approx_len
                    cut_kind = "force"

            end_pos = cut_pos if cut_pos is not None else min(N, cursor + len(segment))
            chunk_id = f"{chapter_id}_{idx:03d}"
            chunks.append({
                "id": chunk_id,
                "start_char": cursor,
                "end_char": end_pos - 1 if end_pos > 0 else 0,
                "voice": default_voice,
                "stylepack": default_stylepack,
                # Podrías añadir métricas de apoyo (no forman parte del schema):
                # "_est_minutes": round(minutes, 2),
                # "_est_kb": kb,
                # "_cut_kind": cut_kind,
            })
            _LOG.info("chunk", extra={
                "chapter": chapter_id, "chunk_id": chunk_id,
                "start": cursor, "end": end_pos, "kind": cut_kind,
                "minutes": round(minutes, 2), "kb": kb
            })

            idx += 1
            cursor = end_pos

            # Saltar espacios/saltos triviales al inicio del siguiente chunk
            while cursor < N and text[cursor].isspace():
                cursor += 1

    return {"chapter_id": chapter_id, "chunks": chunks}


def _best_cut(boundary_positions: List[int], boundary_kinds: List[str], *, start: int, preferred_end: int) -> Tuple[Optional[int], Optional[str]]:
    """
    Elige el mejor "cut" <= preferred_end, priorizando block > sentence > line.
    Si no hay boundary <= preferred_end, permite un pequeño lookahead.
    """
    if not boundary_positions:
        return preferred_end, "none"

    # Índices de boundaries dentro del rango [start, preferred_end]
    candidates = [(pos, kind) for pos, kind in zip(boundary_positions, boundary_kinds) if start < pos <= preferred_end]
    if candidates:
        # prioriza por tipo: block > sentence > line, y el último dentro del rango
        priority = {"block": 3, "sentence": 2, "line": 1}
        candidates.sort(key=lambda x: (priority.get(x[1], 0), x[0]))
        # Queremos el más cercano al final con mayor prioridad
        best = candidates[-1]
        return best[0], best[1]

    # Lookahead pequeño (hasta +1000 chars) para encontrar un boundary cercano
    lookahead = [(pos, kind) for pos, kind in zip(boundary_positions, boundary_kinds) if preferred_end < pos <= preferred_end + 1000]
    if lookahead:
        best = lookahead[0]  # el primero tras el preferred_end
        return best[0], best[1]

    return preferred_end, "fallback"


def _backoff_by_kb(text: str, start: int, max_kb: int, *, start_guess: int) -> Tuple[Optional[int], Optional[str]]:
    """
    Si excede KB, retrocede buscando un corte que cumpla.
    - start_guess: posición donde inicialmente pensabas cortar.
    """
    # Explora hacia atrás en pasos, buscando boundaries razonables por oración o línea
    step = 500
    pos = start_guess
    while pos > start + 500:
        pos -= step
        segment = text[start:pos]
        kb = estimate_kb(segment)
        if kb <= max_kb:
            # elegir boundary final más cercano a 'pos'
            # usa heurística de fin de oración en ese subrango
            sub = segment
            m = list(_END_SENTENCE_RE.finditer(sub))
            if m:
                return start + m[-1].end(), "sentence"
            # si no hay, cortar en salto de línea
            m2 = list(_LINE_BREAK_RE.finditer(sub))
            if m2:
                return start + m2[-1].end(), "line"
            return pos, "raw"
    # No se encontró manera: devolver start_guess (caller forzará ajuste/hard cap)
    return start_guess, "fallback"


# -------------------- CLI --------------------

def _main_cli():
    import argparse
    ap = argparse.ArgumentParser(description="Construye plan SSML por capítulo.")
    ap.add_argument("--chapter-id", required=True)
    ap.add_argument("--in", dest="infile", required=True, help="Ruta a TXT con el capítulo")
    ap.add_argument("--voice", default="narrador")
    ap.add_argument("--stylepack", default="chapter_default")
    ap.add_argument("--target-min", type=float, default=7.0)
    ap.add_argument("--hard-cap-min", type=float, default=8.0)
    ap.add_argument("--max-kb", type=int, default=48)
    ap.add_argument("--out", required=True, help="Ruta de salida .plan.json")
    args = ap.parse_args()

    text = Path(args.infile).read_text(encoding="utf-8")
    plan = build_chapter_plan(
        args.chapter_id, text,
        default_voice=args.voice,
        default_stylepack=args.stylepack,
        limits={"max_kb_per_request": args.max_kb},
        target_minutes=args.target_min,
        hard_cap_minutes=args.hard_cap_min,
    )
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Escrito {out_path}")

if __name__ == "__main__":
    _main_cli()
