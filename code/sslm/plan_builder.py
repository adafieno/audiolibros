# ssml/plan_builder.py
# -*- coding: utf-8 -*-
"""
Planificador de SSML por capítulo — con detección de diálogos y LLM para desambiguar speakers.

Qué hace:
- Crea chunks con límites naturales (párrafos/oraciones/kB/duración).
- Dentro de cada chunk, añade `lines[]` con voz por línea:
  * Heurísticas rápidas para detectar diálogos (—, “”, «», "") y atribuir speaker (verbos: dijo, preguntó, etc.).
  * Si sigue siendo desconocido (o si se pide), consulta un LLM para elegir speaker entre personajes conocidos.
- Usa dossier/characters.json para mapear alias → nombre canónico.
- Escribe plan JSON compatible con el xml_generator actual.

LLM:
- Usa tu cliente unificado `chat_json` (sin pasar modelo).
- Cachea resultados en dossier/.cache/llm_speaker_cache.json (clave por texto+contexto+candidatos).
- Umbral de confianza configurable; si el LLM no está seguro, mantiene 'desconocido'.

CLI (ejemplos):
  # 1) Normal, LLM sólo para líneas desconocidas
  python -m ssml.plan_builder --analysis-dir analysis --out-dir dossier/ssml.plan \
    --dossier dossier --voice narrador --stylepack chapter_default --llm-attribution unknown

  # 2) Forzar LLM en todas las líneas de diálogo
  python -m ssml.plan_builder --analysis-dir analysis --out-dir dossier/ssml.plan \
    --dossier dossier --llm-attribution all --llm-threshold 0.7 --llm-window-chars 240
"""
from __future__ import annotations

import json
import math
import re
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Iterable

# repo-level logging/errors (deja como estaban en tu proyecto)
from core.logging import get_logger, log_span
from core.errors import SSMLPlanError
_LOG = get_logger("ssml.plan")

# ------------------ LLM unified client ------------------
try:
    # si está empaquetado
    from dossier.client import chat_json  # type: ignore
except Exception:
    # fallback a client.py en root
    from dossier.client import chat_json  # type: ignore

# ------------------ Parámetros y regex ------------------

WPM_DEFAULT = 165.0  # palabras/min para narrativa es*
_END_SENTENCE_RE = re.compile(r"[\.!\?…]+[\"”»)]*\s+", re.UNICODE)
_BLOCK_BREAK_RE   = re.compile(r"\n{2,}")
_LINE_BREAK_RE    = re.compile(r"\n")

EM_DASH = "—"
QUOTE   = r"[«“\"]"
UNQUOTE = r"[»”\"]"

# verbos de atribución (extiende si hace falta)
SAY_VERBS = r"(dijo|preguntó|respondió|susurró|murmuró|exclamó|replicó|contestó|añadió|gritó|insistió|afirmó|observó|apuntó|indicó|comentó)"
VERB_RE   = re.compile(SAY_VERBS, re.IGNORECASE | re.UNICODE)

# ------------------ Utilidades ------------------

def estimate_minutes(text: str, wpm: float = WPM_DEFAULT) -> float:
    words = max(1, len(re.findall(r"\b[\wÁÉÍÓÚÜÑáéíóúüñ'-]+\b", text)))
    return words / max(80.0, wpm)

def estimate_kb(text: str, overhead: float = 0.15) -> int:
    approx_bytes = int(len(text.encode("utf-8")) * (1.0 + max(0.0, overhead)))
    return math.ceil(approx_bytes / 1024)

@dataclass
class Boundary:
    pos: int
    kind: str  # "block" | "sentence" | "line"

def _find_boundaries(text: str) -> List[Boundary]:
    bounds: List[Boundary] = []
    for m in _BLOCK_BREAK_RE.finditer(text):
        bounds.append(Boundary(pos=m.end(), kind="block"))
    for m in _END_SENTENCE_RE.finditer(text):
        bounds.append(Boundary(pos=m.end(), kind="sentence"))
    for m in _LINE_BREAK_RE.finditer(text):
        bounds.append(Boundary(pos=m.end(), kind="line"))
    bounds.sort(key=lambda b: b.pos)
    return bounds

def _best_cut(boundary_positions: List[int], boundary_kinds: List[str], *, start: int, preferred_end: int) -> Tuple[Optional[int], Optional[str]]:
    if not boundary_positions:
        return preferred_end, "none"
    candidates = [(pos, kind) for pos, kind in zip(boundary_positions, boundary_kinds) if start < pos <= preferred_end]
    if candidates:
        priority = {"block": 3, "sentence": 2, "line": 1}
        candidates.sort(key=lambda x: (priority.get(x[1], 0), x[0]))
        return candidates[-1][0], candidates[-1][1]
    lookahead = [(pos, kind) for pos, kind in zip(boundary_positions, boundary_kinds) if preferred_end < pos <= preferred_end + 1000]
    if lookahead:
        return lookahead[0][0], lookahead[0][1]
    return preferred_end, "fallback"

def _backoff_by_kb(text: str, start: int, max_kb: int, *, start_guess: int) -> Tuple[Optional[int], Optional[str]]:
    step = 500
    pos = start_guess
    while pos > start + 500:
        pos -= step
        segment = text[start:pos]
        kb = estimate_kb(segment)
        if kb <= max_kb:
            sub = segment
            m = list(_END_SENTENCE_RE.finditer(sub))
            if m:
                return start + m[-1].end(), "sentence"
            m2 = list(_LINE_BREAK_RE.finditer(sub))
            if m2:
                return start + m2[-1].end(), "line"
            return pos, "raw"
    return start_guess, "fallback"

# ------------------ Diálogo / Heurística ------------------

def _load_json(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))

def _build_name_lexicon(characters_json: dict) -> Dict[str, str]:
    """
    alias_lower -> display_name. Espera dossier/characters.json con:
      {"characters":[{"id","display_name","aliases":[...]}, ...]}
    """
    out: Dict[str, str] = {}
    for c in characters_json.get("characters", []):
        disp = c.get("display_name") or c.get("id")
        if not disp:
            continue
        out[disp.lower()] = disp
        for a in c.get("aliases") or []:
            out[str(a).lower()] = disp
    return out

def _find_dialogue_spans(text: str) -> List[Tuple[int,int]]:
    spans: List[Tuple[int,int]] = []
    # líneas con raya
    for m in re.finditer(rf"(^|\n)\s*{EM_DASH}([^\n]+)", text, flags=re.UNICODE):
        s = m.start(2)
        eol = text.find("\n", s)
        e = (eol if eol != -1 else len(text)) - 1
        spans.append((s, max(s, e)))
    # entre comillas
    for m in re.finditer(rf"{QUOTE}(.+?){UNQUOTE}", text, flags=re.UNICODE | re.DOTALL):
        spans.append((m.start(1), m.end(1)-1))
    return sorted({(s,e) for s,e in spans})

def _nearest_attr_window(text: str, end_idx: int, max_chars: int = 160) -> str:
    return text[end_idx+1 : min(len(text), end_idx + 1 + max_chars)]

def _guess_speaker(text: str, span: Tuple[int,int], name_lex: Dict[str,str]) -> Optional[str]:
    s, e = span
    window = _nearest_attr_window(text, e)
    # verbo + Nombre
    m = re.search(rf"{SAY_VERBS}\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÜÑáéíóúüñ'-]+)", window, flags=re.UNICODE|re.IGNORECASE)
    if m:
        cand = m.group(2).lower()
        return name_lex.get(cand)
    # Nombre + verbo
    m = re.search(rf"([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÜÑáéíóúüñ'-]+)\s+{SAY_VERBS}", window, flags=re.UNICODE|re.IGNORECASE)
    if m:
        cand = m.group(1).lower()
        return name_lex.get(cand)
    # mirar un poco hacia atrás (—dijo Rosa.)
    back = text[max(0, s-120):s]
    m = re.search(rf"{SAY_VERBS}\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÜÑáéíóúüñ'-]+)$", back, flags=re.UNICODE|re.IGNORECASE)
    if m:
        cand = m.group(2).lower()
        return name_lex.get(cand)
    return None

def _subtract_spans(total_s: int, total_e: int, spans: List[Tuple[int,int]]) -> List[Tuple[int,int]]:
    gaps: List[Tuple[int,int]] = []
    pos = total_s
    for s,e in [sp for sp in spans if sp[0] <= total_e and sp[1] >= total_s]:
        s = max(s, total_s); e = min(e, total_e)
        if s > pos:
            gaps.append((pos, s-1))
        pos = max(pos, e+1)
    if pos <= total_e:
        gaps.append((pos, total_e))
    return gaps

# ------------------ LLM attribution layer ------------------

def _sha(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()

def _load_cache(p: Path) -> Dict[str, dict]:
    try:
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}

def _save_cache(p: Path, obj: Dict[str, dict]) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

def _llm_choose_speaker(
    speech_text: str,
    context_left: str,
    context_right: str,
    allowed: List[str],
) -> dict:
    """
    Llama a tu cliente unificado para elegir speaker. Retorna dict:
      {"speaker": "<uno de allowed|desconocido>", "confidence": 0..1, "reason": "..."}
    """
    system = (
        "Eres un etiquetador de turnos de diálogo para una novela en español. "
        "Debes identificar QUIÉN habla en el fragmento de diálogo dado, "
        "eligiendo únicamente de la lista de 'candidatos'. No inventes nombres. "
        "Si no es posible saberlo, usa 'desconocido'. Responde SOLO JSON válido."
    )
    user = {
        "dialogo": speech_text.strip(),
        "contexto_izquierda": context_left.strip(),
        "contexto_derecha": context_right.strip(),
        "candidatos": allowed,
        "instrucciones": [
            "Elige un único 'speaker' que esté en 'candidatos' o 'desconocido'.",
            "Devuelve también 'confidence' entre 0 y 1.",
            "Usa el contexto para pistas como 'dijo Rosa', 'preguntó Sánchez'.",
            "Si el narrador habla (monólogo sin comillas), podría ser 'narrador'."
        ]
    }
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
    ]
    # Tu cliente unificado gestiona el modelo y parámetros:
    return chat_json(messages, strict=True)  # -> dict con keys esperadas

def _refine_speakers_with_llm(
    lines: List[Dict[str, object]],
    chapter_text: str,
    *,
    allowed_speakers: List[str],
    threshold: float,
    mode: str,                  # "unknown" | "all"
    max_lines: int,
    window_chars: int,
    cache_path: Optional[Path],
    unknown_label: str,
) -> List[Dict[str, object]]:
    if not lines:
        return lines

    cache = _load_cache(cache_path) if cache_path else {}
    refined: List[Dict[str, object]] = []
    processed = 0

    for ln in lines:
        v = str(ln.get("voice") or "")
        is_dialogue_span = "start_char" in ln and "end_char" in ln
        if not is_dialogue_span:
            refined.append(ln); continue

        # Selección de cuándo llamar al LLM
        call_llm = (mode == "all") or (mode == "unknown" and v == unknown_label)
        if not call_llm:
            refined.append(ln); continue
        if processed >= max_lines:
            refined.append(ln); continue

        sc = int(ln["start_char"]); ec = int(ln["end_char"])
        speech_text = chapter_text[sc:ec+1]
        left = chapter_text[max(0, sc - window_chars):sc]
        right = chapter_text[ec+1: ec+1+window_chars]

        # cache key = sha1 of inputs
        key = _sha(json.dumps({
            "speech": speech_text, "L": left, "R": right, "allowed": allowed_speakers
        }, ensure_ascii=False))
        if key in cache:
            res = cache[key]
        else:
            try:
                res = _llm_choose_speaker(speech_text, left, right, allowed_speakers)
            except Exception as e:
                _LOG.warning("LLM attribution failed; keeping original", extra={"err": str(e)})
                refined.append(ln); continue
            cache[key] = res
            if cache_path:
                _save_cache(cache_path, cache)

        speaker = str(res.get("speaker") or unknown_label)
        conf = float(res.get("confidence") or 0.0)
        # normaliza a candidato válido
        if speaker not in allowed_speakers and speaker != unknown_label:
            speaker = unknown_label

        if conf >= threshold:
            ln2 = dict(ln); ln2["voice"] = speaker; refined.append(ln2)
        else:
            refined.append(ln)
        processed += 1

    return refined

# ------------------ Construcción del plan ------------------

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
    dossier_dir: Optional[Path] = None,
    dialogue: bool = True,
    unknown_voice_label: str = "desconocido",
    # --- LLM options ---
    llm_attribution: str = "unknown",   # "off" | "unknown" | "all"
    llm_threshold: float = 0.66,
    llm_max_lines: int = 200,
    llm_window_chars: int = 240,
) -> Dict[str, object]:
    """
    Devuelve un plan de chunks; si dialogue=True añade lines[] por voz,
    y si llm_attribution != 'off' usa LLM para mejorar speakers.
    """
    if not chapter_id or not isinstance(chapter_id, str):
        raise SSMLPlanError("chapter_id inválido")

    text = (chapter_text or "").strip("\n")
    if not text:
        return {"chapter_id": chapter_id, "chunks": []}

    # cargar nombres
    name_lex: Dict[str,str] = {}
    if dossier_dir:
        chars_p = Path(dossier_dir) / "characters.json"
        if chars_p.exists():
            try:
                name_lex = _build_name_lexicon(_load_json(chars_p))
            except Exception as e:
                _LOG.warning("No se pudo leer characters.json", extra={"err": str(e)})

    # candidatos (cast + narrador + desconocido)
    allowed_speakers = sorted(set(list(name_lex.values()) + [default_voice, "narrador", unknown_voice_label]))

    max_kb = int(limits.get("max_kb_per_request", 0)) if limits else 0
    boundaries = _find_boundaries(text)
    positions = [b.pos for b in boundaries]
    kinds     = [b.kind for b in boundaries]

    dialogue_spans: List[Tuple[int,int]] = _find_dialogue_spans(text) if dialogue else []

    chunks: List[Dict[str, object]] = []
    cursor = 0
    idx = 1
    N = len(text)

    cache_path = (Path(dossier_dir) / ".cache/llm_speaker_cache.json") if dossier_dir else None
    use_llm = llm_attribution.lower() in ("unknown", "all")

    with log_span("ssml.plan.build", extra={"chapter": chapter_id}):
        while cursor < N:
            approx_chars_needed = int(target_minutes * wpm * 6.3)
            soft_end = min(N, cursor + max(1000, approx_chars_needed))

            cut_pos, cut_kind = _best_cut(positions, kinds, start=cursor, preferred_end=soft_end)
            segment = text[cursor:(cut_pos if cut_pos is not None else soft_end)]
            minutes = estimate_minutes(segment, wpm=wpm)
            kb      = estimate_kb(segment, overhead=0.15)

            if max_kb and kb > max_kb:
                cut_pos2, cut_kind2 = _backoff_by_kb(text, cursor, max_kb, start_guess=cut_pos or soft_end)
                if cut_pos2 and cut_pos2 > cursor:
                    segment = text[cursor:cut_pos2]
                    kb = estimate_kb(segment); minutes = estimate_minutes(segment, wpm=wpm)
                    cut_pos, cut_kind = cut_pos2, (cut_kind2 or "sentence")

            if minutes > hard_cap_minutes:
                factor = hard_cap_minutes / max(0.1, minutes)
                approx_len = int(len(segment) * factor * 0.95)
                if approx_len < 200: approx_len = min(len(segment), 1200)
                target_pos = cursor + approx_len
                cut_pos3, cut_kind3 = _best_cut(positions, kinds, start=cursor, preferred_end=target_pos)
                if cut_pos3 and cut_pos3 > cursor:
                    segment = text[cursor:cut_pos3]
                    cut_pos, cut_kind = cut_pos3, (cut_kind3 or "sentence")
                    minutes = estimate_minutes(segment, wpm=wpm)
                    kb      = estimate_kb(segment)
                else:
                    segment = text[cursor:cursor+approx_len]
                    cut_pos = cursor + approx_len
                    cut_kind = "force"

            end_pos = cut_pos if cut_pos is not None else min(N, cursor + len(segment))
            chunk_id = f"{chapter_id}_{idx:03d}"

            # construir lines[] (heurística)
            lines: List[Dict[str, object]] = []
            if dialogue:
                in_chunk = [(ds,de) for (ds,de) in dialogue_spans if not (de < cursor or ds > end_pos - 1)]
                in_chunk.sort()
                # narrador para huecos
                for gs, ge in _subtract_spans(cursor, end_pos - 1, in_chunk):
                    seg = text[gs:ge+1].strip()
                    if seg:
                        lines.append({"voice": default_voice, "start_char": gs, "end_char": ge})
                # diálogos con heurística
                for ds,de in in_chunk:
                    spk = _guess_speaker(text, (ds,de), name_lex) or "desconocido"
                    lines.append({"voice": spk, "start_char": ds, "end_char": de})
                lines.sort(key=lambda d: d.get("start_char", 0))

                # LLM refinement (opcional)
                if use_llm and lines:
                    lines = _refine_speakers_with_llm(
                        lines, text,
                        allowed_speakers=allowed_speakers,
                        threshold=float(llm_threshold),
                        mode=llm_attribution.lower(),
                        max_lines=int(llm_max_lines),
                        window_chars=int(llm_window_chars),
                        cache_path=cache_path,
                        unknown_label="desconocido",
                    )

            chunk_obj: Dict[str, object] = {
                "id": chunk_id,
                "start_char": cursor,
                "end_char": end_pos - 1 if end_pos > 0 else 0,
                "voice": default_voice,
                "stylepack": default_stylepack,
            }
            if lines:
                chunk_obj["lines"] = lines

            chunks.append(chunk_obj)
            _LOG.info("chunk", extra={
                "chapter": chapter_id, "chunk_id": chunk_id,
                "start": cursor, "end": end_pos, "kind": cut_kind,
                "minutes": round(minutes, 2), "kb": kb,
                "lines": len(lines), "llm": use_llm
            })

            idx += 1
            cursor = end_pos
            while cursor < N and text[cursor].isspace():
                cursor += 1

    return {"chapter_id": chapter_id, "chunks": chunks}

# ------------------ Batch helper ------------------

def _sort_key_natural(p: Path) -> tuple:
    parts = re.split(r"(\d+)", p.stem)
    return tuple(int(x) if x.isdigit() else x.lower() for x in parts)

def build_plans_from_dir(
    analysis_dir: Path,
    out_dir: Path,
    *,
    default_voice: str = "narrador",
    default_stylepack: str = "chapter_default",
    target_minutes: float = 7.0,
    hard_cap_minutes: float = 8.0,
    max_kb: int = 48,
    wpm: Optional[float] = None,
    pattern: str = "*.txt",
    dossier_dir: Optional[Path] = None,
    dialogue: bool = True,
    unknown_voice_label: str = "desconocido",
    llm_attribution: str = "unknown",
    llm_threshold: float = 0.66,
    llm_max_lines: int = 200,
    llm_window_chars: int = 240,
) -> List[Path]:
    if not analysis_dir.exists():
        raise SSMLPlanError(f"Directorio no existe: {analysis_dir}")
    out_dir.mkdir(parents=True, exist_ok=True)
    if wpm is None:
        wpm = WPM_DEFAULT

    txt_files: Iterable[Path] = sorted(analysis_dir.rglob(pattern), key=_sort_key_natural)
    written: List[Path] = []

    for txt in txt_files:
        if not txt.is_file():
            continue
        chapter_id = txt.stem
        text = txt.read_text(encoding="utf-8")

        plan = build_chapter_plan(
            chapter_id,
            text,
            default_voice=default_voice,
            default_stylepack=default_stylepack,
            limits={"max_kb_per_request": max_kb},
            target_minutes=target_minutes,
            hard_cap_minutes=hard_cap_minutes,
            wpm=wpm,
            dossier_dir=dossier_dir,
            dialogue=dialogue,
            unknown_voice_label=unknown_voice_label,
            llm_attribution=llm_attribution,
            llm_threshold=llm_threshold,
            llm_max_lines=llm_max_lines,
            llm_window_chars=llm_window_chars,
        )

        out_path = out_dir / f"{chapter_id}.plan.json"
        out_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
        _LOG.info("escrito", extra={"chapter": chapter_id, "out": str(out_path)})
        written.append(out_path)

    if not written:
        _LOG.warning("No se encontraron archivos .txt.", extra={"dir": str(analysis_dir)})
    return written

# ------------------ CLI ------------------

def _main_cli():
    import argparse
    ap = argparse.ArgumentParser(description="Construye plan SSML (con diálogos) y LLM para speakers (opcional).")

    # single
    ap.add_argument("--chapter-id", help="ID del capítulo (p.ej. ch01)")
    ap.add_argument("--in", dest="infile", help="Ruta a TXT con el capítulo")
    ap.add_argument("--out", help="Ruta de salida .plan.json (archivo)")

    # batch
    ap.add_argument("--analysis-dir", help="Directorio con .txt")
    ap.add_argument("--out-dir", help="Directorio de salida para *.plan.json")

    # shared
    ap.add_argument("--voice", default="narrador")
    ap.add_argument("--stylepack", default="chapter_default")
    ap.add_argument("--target-min", type=float, default=7.0)
    ap.add_argument("--hard-cap-min", type=float, default=8.0)
    ap.add_argument("--max-kb", type=int, default=48)
    ap.add_argument("--wpm", type=float, default=None)
    ap.add_argument("--pattern", default="*.txt")

    ap.add_argument("--dossier", default="dossier", help="Carpeta con characters.json")
    ap.add_argument("--no-dialogue", action="store_true", help="No añadir lines[] (modo legacy)")
    ap.add_argument("--unknown-voice", default="desconocido", help="Etiqueta para desconocidos")

    # LLM
    ap.add_argument("--llm-attribution", choices=["off", "unknown", "all"], default="unknown",
                    help="Cuándo usar LLM: nunca | sólo desconocidos | todas las líneas de diálogo")
    ap.add_argument("--llm-threshold", type=float, default=0.66, help="Umbral de confianza para aceptar la predicción")
    ap.add_argument("--llm-max-lines", type=int, default=200, help="Líneas máximas a consultar al LLM por capítulo")
    ap.add_argument("--llm-window-chars", type=int, default=240, help="Contexto (chars) antes/después de la cita")

    args = ap.parse_args()
    dossier_dir = Path(args.dossier) if args.dossier else None
    dialogue = not args.no_dialogue

    # batch
    if args.analysis_dir:
        if not args.out_dir:
            raise SSMLPlanError("En modo batch especifica --out-dir")
        written = build_plans_from_dir(
            analysis_dir=Path(args.analysis_dir),
            out_dir=Path(args.out_dir),
            default_voice=args.voice,
            default_stylepack=args.stylepack,
            target_minutes=args.target_min,
            hard_cap_minutes=args.hard_cap_min,
            max_kb=args.max_kb,
            wpm=(args.wpm if args.wpm is not None else WPM_DEFAULT),
            pattern=args.pattern,
            dossier_dir=dossier_dir,
            dialogue=dialogue,
            unknown_voice_label=args.unknown_voice,
            llm_attribution=args.llm_attribution,
            llm_threshold=args.llm_threshold,
            llm_max_lines=args.llm_max_lines,
            llm_window_chars=args.llm_window_chars,
        )
        print(f"Escritos {len(written)} planes en {args.out_dir}")
        return

    # single
    if not (args.chapter_id and args.infile and args.out):
        raise SSMLPlanError("Modo capítulo único requiere --chapter-id, --in y --out")

    text = Path(args.infile).read_text(encoding="utf-8")
    plan = build_chapter_plan(
        args.chapter_id, text,
        default_voice=args.voice,
        default_stylepack=args.stylepack,
        limits={"max_kb_per_request": args.max_kb},
        target_minutes=args.target_min,
        hard_cap_minutes=args.hard_cap_min,
        wpm=(args.wpm if args.wpm is not None else WPM_DEFAULT),
        dossier_dir=dossier_dir,
        dialogue=dialogue,
        unknown_voice_label=args.unknown_voice,
        llm_attribution=args.llm_attribution,
        llm_threshold=args.llm_threshold,
        llm_max_lines=args.llm_max_lines,
        llm_window_chars=args.llm_window_chars,
    )
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Escrito {out_path}")

if __name__ == "__main__":
    _main_cli()
