# ssml/plan_builder.py
# -*- coding: utf-8 -*-
"""
Planificador de SSML por capítulo — con detección de diálogos y LLM para speakers.
Parcheado para:
  - Incluir la raya de diálogo (y espacios previos) dentro del span del diálogo.
  - No crear líneas del narrador que sean SOLO puntuación (p.ej. "—").
"""

from __future__ import annotations

import json
import math
import re
import hashlib
import os, sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Iterable

_pkg_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _pkg_root not in sys.path:
    sys.path.insert(0, _pkg_root)


from core.log_utils import get_logger, log_span
from core.errors import SSMLPlanError
_LOG = get_logger("ssml.plan")

# ------------------ LLM unified client ------------------
try:
    from dossier.client import chat_json  # type: ignore
except Exception:
    from dossier.client import chat_json  # type: ignore

# ------------------ Parámetros y regex ------------------

WPM_DEFAULT = 165.0
_END_SENTENCE_RE = re.compile(r"[\.!\?…]+[\"”»)]*\s+", re.UNICODE)
_BLOCK_BREAK_RE   = re.compile(r"\n{2,}")
_LINE_BREAK_RE    = re.compile(r"\n")

EM_DASH = "—"
QUOTE   = r"[«“\"]"
UNQUOTE = r"[»”\"]"

SAY_VERBS = r"(dijo|preguntó|respondió|susurró|murmuró|exclamó|replicó|contestó|añadió|gritó|insistió|afirmó|observó|apuntó|indicó|comentó)"
VERB_RE   = re.compile(SAY_VERBS, re.IGNORECASE | re.UNICODE)

# Sólo puntuación (sin letras ni dígitos)
_PUNCT_ONLY_RE = re.compile(r'^[\s\.,!?:;«»"“”\'\(\)\[\]\{\}/\\\-–—…]+$', re.UNICODE)

# ------------------ Utilidades ------------------

def estimate_minutes(text: str, wpm: float = WPM_DEFAULT) -> float:
    words = max(1, len(re.findall(r"\b[\wÁÉÍÓÚÜÑáéíóúüñ'-]+\b", text)))
    return words / max(80.0, wpm)

def estimate_kb(text: str, overhead: float = 0.15) -> int:
    approx_bytes = int(len(text.encode("utf-8")) * (1.0 + max(0.0, overhead)))
    return math.ceil(approx_bytes / 1024)

def _is_punct_only(s: str) -> bool:
    s = (s or "").strip()
    return (not s) or bool(_PUNCT_ONLY_RE.match(s))

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
    out: Dict[str, str] = {}
    for c in characters_json.get("characters", []):
        disp = c.get("display_name") or c.get("id")
        if not disp:
            continue
        out[disp.lower()] = disp
        for a in c.get("aliases") or []:
            out[str(a).lower()] = disp
    return out

def _emit_progress(stage: str, percent: int, note: str = ""):
    """Emit progress as JSON for the frontend"""
    progress_data = {
        "event": "progress",
        "stage": stage,
        "pct": percent,
        "note": note
    }
    print(json.dumps(progress_data), flush=True)

def _apply_segmentation_heuristics(text: str) -> List[Dict[str, object]]:
    """
    Simple initial segmentation:
    1. Linebreaks ALWAYS determine new segments
    2. Detect full sentences within lines
    NO character splitting here - let LLM handle that
    """
    print(f"[KHIPU] Starting heuristic segmentation on {len(text)} characters", file=sys.stderr)
    segments = []
    current_pos = 0
    
    # Step 1: LINEBREAKS ALWAYS CREATE NEW SEGMENTS
    lines = text.split('\n')
    print(f"[KHIPU] Split text into {len(lines)} lines", file=sys.stderr)
    
    for line_num, line in enumerate(lines, 1):
        if not line.strip():  # Skip empty lines
            print(f"[KHIPU] Line {line_num}: Empty, skipping", file=sys.stderr)
            current_pos += len(line) + 1
            continue
            
        line_start = current_pos
        print(f"[KHIPU] Line {line_num}: Processing '{line[:50]}...' at position {line_start}", file=sys.stderr)
        
        # Step 2: DETECT FULL SENTENCES within this line
        sentence_ends = []
        for match in re.finditer(r'[.!?]+(?:\s|$)', line):
            sentence_ends.append(match.end())
        
        if not sentence_ends:
            sentence_ends = [len(line)]  # Treat whole line as one sentence
            print(f"[KHIPU] Line {line_num}: No sentence endings found, treating as one segment", file=sys.stderr)
        else:
            print(f"[KHIPU] Line {line_num}: Found {len(sentence_ends)} sentence endings", file=sys.stderr)
            
        sentence_start = 0
        for sentence_end in sentence_ends:
            sentence_text = line[sentence_start:sentence_end].strip()
            if not sentence_text:
                sentence_start = sentence_end
                continue
                
            # Add sentence as segment - fix coordinate calculation
            actual_start = line_start + sentence_start
            actual_end = line_start + sentence_start + len(sentence_text) - 1
            segments.append({
                "text": sentence_text,
                "start_offset": actual_start,
                "end_offset": actual_end,
                "speaker": "narrador",
                "type": "narration"
            })
            print(f"[KHIPU] Line {line_num}, Sentence {len(segments)}: '{sentence_text[:30]}...' [{actual_start}-{actual_end}] ({len(sentence_text)} chars)", file=sys.stderr)
            
            sentence_start = sentence_end
        
        current_pos += len(line) + 1  # +1 for the \n
    
    print(f"[KHIPU] Heuristic segmentation complete: {len(segments)} initial segments created", file=sys.stderr)
    return segments

def _find_dialogue_spans_llm(text: str, allowed_speakers: List[str], window_chars: int = 200) -> List[Dict[str, object]]:
    """
    LLM-based comprehensive dialogue detection and parsing.
    Processes text chunks to identify and properly segment all dialogue with accurate speaker attribution.
    """
    _emit_progress("🧠 LLM Analysis", 5, "Preparing text for dialogue detection")
    
    # Split text into manageable chunks for LLM processing (to avoid timeouts and token limits)
    chunk_size = 2000  # Characters per chunk - balance between context and processing time
    overlap = 300     # Overlap between chunks to maintain context
    
    all_segments = []
    text_len = len(text)
    
    # Process text in overlapping chunks
    start = 0
    chunk_num = 0
    
    while start < text_len:
        chunk_num += 1
        end = min(start + chunk_size, text_len)
        
        # Adjust chunk boundary to avoid cutting in middle of dialogue
        if end < text_len:
            # Look for next paragraph or dialogue break
            next_para = text.find('\n\n', end - 100)
            next_dialogue = text.find(f'\n{EM_DASH}', end - 100) 
            
            if next_para != -1 and next_para < end + 200:
                end = next_para + 1
            elif next_dialogue != -1 and next_dialogue < end + 200:
                end = next_dialogue
        
        chunk_text = text[start:end]
        
        total_chunks_estimate = (text_len // chunk_size) + 1
        
        # Progress: LLM analysis (5-70%)
        llm_progress = 5 + int((chunk_num / total_chunks_estimate) * 65)
        _emit_progress("🧠 LLM Analysis", llm_progress, f"Analyzing dialogue in chunk {chunk_num}/{total_chunks_estimate}")
        
        _LOG.info(f"Processing LLM dialogue chunk {chunk_num}/{total_chunks_estimate}: {len(chunk_text)} chars, position {start}-{end}")
        print(f"[KHIPU] Processing dialogue chunk {chunk_num}: {len(chunk_text)} characters at position {start}-{end}")
        print(f"[KHIPU] Chunk {chunk_num} text preview: '{chunk_text[:100]}...''")
        
        try:
            print(f"[KHIPU] ========== Chunk {chunk_num} Processing ==========")
            # Use comprehensive LLM parsing
            result = _llm_parse_dialogue_comprehensive(
                chunk_text, 
                allowed_speakers,
                max_tts_chars=3000  # TTS length constraint
            )
            print(f"[KHIPU] ========== Chunk {chunk_num} LLM Complete ==========")
            
            if result.get("success") and "segments" in result:
                _LOG.info(f"Chunk {chunk_num} processed successfully: {len(result['segments'])} dialogue segments found")
                print(f"[KHIPU] Chunk {chunk_num} complete: {len(result['segments'])} dialogue segments extracted")
                for segment in result["segments"]:
                    # Convert chunk-relative positions to absolute positions
                    abs_start = start + segment["start_offset"]
                    abs_end = start + segment["end_offset"]
                    
                    print(f"[KHIPU] Debug segment: chunk_start={start}, relative_start={segment['start_offset']}, relative_end={segment['end_offset']}, abs_start={abs_start}, abs_end={abs_end}")
                    
                    # Skip segments that are too small or invalid
                    if abs_end <= abs_start or abs_end - abs_start < 5:
                        print(f"[KHIPU] Skipping invalid segment: abs_end({abs_end}) <= abs_start({abs_start})")
                        continue
                    
                    # Convert to the expected format for compatibility
                    segment_result = {
                        "start_char": abs_start,
                        "end_char": abs_end - 1,  # Inclusive end for compatibility
                        "voice": segment["speaker"],
                        "type": segment["type"],
                        "confidence": segment["confidence"]
                    }
                    all_segments.append(segment_result)
                    print(f"[KHIPU] Added segment: {segment_result}")
                    
                
            else:
                _LOG.warning(f"Chunk {chunk_num} LLM processing failed: {result.get('error', 'Unknown error')}")
                print(f"[KHIPU] Chunk {chunk_num} failed, using regex fallback: {result.get('error', 'Unknown error')}")
                # Fallback: basic regex detection for this chunk
                chunk_segments = _find_dialogue_spans_regex_fallback(chunk_text, start, allowed_speakers)
                all_segments.extend(chunk_segments)
                
        except Exception as e:
            _LOG.error(f"Error processing chunk {chunk_num}: {e}")
            print(f"[KHIPU] Error in chunk {chunk_num}: {e}")
            # Fallback: basic regex detection for this chunk
            chunk_segments = _find_dialogue_spans_regex_fallback(chunk_text, start, allowed_speakers)
            all_segments.extend(chunk_segments)
        
        # Move to next chunk with overlap
        if end >= text_len:
            break
        start = max(start + 1, end - overlap)
    
    # Remove overlapping segments and merge adjacent ones
    all_segments = _deduplicate_and_merge_segments(all_segments)
    
    _LOG.info(f"LLM dialogue processing complete: {len(all_segments)} total segments from {chunk_num} chunks")
    print(f"[KHIPU] Dialogue processing complete: {len(all_segments)} segments extracted from {chunk_num} text chunks")
    return all_segments

def _find_dialogue_spans_regex_fallback(chunk_text: str, offset: int, allowed_speakers: List[str]) -> List[Dict[str, object]]:
    """Fallback regex-based dialogue detection for when LLM processing fails."""
    segments = []
    
    # Find em-dash dialogue
    for m in re.finditer(rf"(^|\n)\s*{EM_DASH}([^\n]+)", chunk_text, flags=re.UNICODE):
        start = offset + m.start()
        end = offset + m.end()
        segments.append({
            "start_char": start,
            "end_char": end - 1,
            "voice": "desconocido",
            "type": "dialogue", 
            "confidence": 0.3
        })
    
    # Find quoted dialogue
    for m in re.finditer(rf"{QUOTE}(.+?){UNQUOTE}", chunk_text, flags=re.UNICODE | re.DOTALL):
        start = offset + m.start()
        end = offset + m.end()
        segments.append({
            "start_char": start,
            "end_char": end - 1,
            "voice": "desconocido",
            "type": "dialogue",
            "confidence": 0.3
        })
    
    return segments

def _deduplicate_and_merge_segments(segments: List[Dict[str, object]]) -> List[Dict[str, object]]:
    """Remove overlapping segments and merge adjacent ones from the same speaker."""
    if not segments:
        return segments
    
    # Sort by start position
    segments.sort(key=lambda x: x["start_char"])
    
    merged = [segments[0]]
    
    for current in segments[1:]:
        last = merged[-1]
        
        # Check for overlap
        if current["start_char"] <= last["end_char"] + 1:
            # Overlapping or adjacent segments
            if (current["voice"] == last["voice"] and 
                current["type"] == last["type"]):
                # Merge segments from same speaker
                last["end_char"] = max(last["end_char"], current["end_char"])
                last["confidence"] = max(last["confidence"], current["confidence"])
            else:
                # Different speakers - keep the one with higher confidence
                if current["confidence"] > last["confidence"]:
                    merged[-1] = current
        else:
            # No overlap - add as new segment
            merged.append(current)
    
    return merged

def _find_dialogue_spans(text: str) -> List[Tuple[int,int]]:
    """Legacy regex-based dialogue detection - kept for compatibility"""
    spans: List[Tuple[int,int]] = []
    # líneas con raya; capturamos el contenido (sin la raya) ...
    for m in re.finditer(rf"(^|\n)\s*{EM_DASH}([^\n]+)", text, flags=re.UNICODE):
        s = m.start(2)  # empieza DESPUÉS de la raya
        eol = text.find("\n", s)
        e = (eol if eol != -1 else len(text)) - 1
        spans.append((s, max(s, e)))
    # ... y diálogos entre comillas (solo contenido interno)
    for m in re.finditer(rf"{QUOTE}(.+?){UNQUOTE}", text, flags=re.UNICODE | re.DOTALL):
        spans.append((m.start(1), m.end(1)-1))
    spans = sorted({(s,e) for s,e in spans})
    return spans

def _expand_dialogue_spans_swallow_leading_delims(text: str, spans: List[Tuple[int,int]]) -> List[Tuple[int,int]]:
    """
    Extiende cada span hacia la izquierda para incluir delimitadores recientes:
      espacios, em/en dash, guion, y NO cruza saltos de línea.
    Así evitamos que la raya '—' quede como hueco del narrador.
    """
    if not spans:
        return spans
    delims = set([" ", "\t", EM_DASH, "–", "-"])
    out: List[Tuple[int,int]] = []
    for (s, e) in spans:
        ss = s
        while ss > 0 and text[ss-1] in delims and text[ss-1] != "\n":
            ss -= 1
        out.append((ss, e))
    return out

def _nearest_attr_window(text: str, end_idx: int, max_chars: int = 160) -> str:
    return text[end_idx+1 : min(len(text), end_idx + 1 + max_chars)]

def _guess_speaker(text: str, span: Tuple[int,int], name_lex: Dict[str,str]) -> Optional[str]:
    s, e = span
    window = _nearest_attr_window(text, e)
    m = re.search(rf"{SAY_VERBS}\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÜÑáéíóúüñ'-]+)", window, flags=re.UNICODE|re.IGNORECASE)
    if m:
        return name_lex.get(m.group(2).lower())
    m = re.search(rf"([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÜÑáéíóúüñ'-]+)\s+{SAY_VERBS}", window, flags=re.UNICODE|re.IGNORECASE)
    if m:
        return name_lex.get(m.group(1).lower())
    back = text[max(0, s-120):s]
    m = re.search(rf"{SAY_VERBS}\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÜÑáéíóúüñ'-]+)$", back, flags=re.UNICODE|re.IGNORECASE)
    if m:
        return name_lex.get(m.group(2).lower())
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
        if p and p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}

def _save_cache(p: Path, obj: Dict[str, dict]) -> None:
    if not p:
        return
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

def _llm_parse_dialogue_comprehensive(text_chunk: str, allowed_speakers: List[str], max_tts_chars: int = 3000) -> dict:
    """
    Simple LLM approach: Get initial segments, then let LLM further split for dialogue and length.
    """
    print(f"[KHIPU] ========== LLM Processing Start ==========")
    print(f"[KHIPU] Chunk size: {len(text_chunk)} characters")
    print(f"[KHIPU] Available speakers: {allowed_speakers}")
    print(f"[KHIPU] Max TTS chars: {max_tts_chars}")
    
    try:
        # Get initial line/sentence segments  
        print(f"[KHIPU] Step 1: Running heuristic segmentation...")
        base_segments = _apply_segmentation_heuristics(text_chunk)
        print(f"[KHIPU] Step 1 Complete: {len(base_segments)} initial segments created")
        
        # Simple LLM prompt - further split and assign speakers
        print(f"[KHIPU] Step 2: Preparing LLM request...")
        system = """Split text segments for audiobook TTS. You can:
1. Further split segments that contain dialogue or are too long (>300 chars)
2. Assign correct speakers (use available_speakers or 'narrador')
3. Keep line boundaries intact

Return JSON array of segments with: text, start_offset, end_offset, speaker, type"""
        
        user_prompt = {
            "segments": base_segments,
            "available_speakers": allowed_speakers,
            "max_chars": max_tts_chars
        }

        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user_prompt, ensure_ascii=False)}
        ]
        
        print(f"[KHIPU] Step 2: Sending request to LLM (timeout: 15s)...")
        result = chat_json(messages, strict=True, timeout_s=15)
        print(f"[KHIPU] Step 2 Complete: LLM responded successfully")
        
        if isinstance(result, dict) and "segments" in result:
            final_segments = result["segments"]
            print(f"[KHIPU] Step 3: LLM returned {len(final_segments)} refined segments")
            for i, seg in enumerate(final_segments[:5]):  # Show first 5
                print(f"[KHIPU] Segment {i+1}: '{seg.get('text', '')[:30]}...' speaker='{seg.get('speaker', 'unknown')}' [{seg.get('start_offset', '?')}-{seg.get('end_offset', '?')}]")
            if len(final_segments) > 5:
                print(f"[KHIPU] ... and {len(final_segments) - 5} more segments")
            print(f"[KHIPU] ========== LLM Processing Complete ==========")
            return {"success": True, "segments": final_segments}
        else:
            print(f"[KHIPU] LLM returned invalid format, using heuristic segments")
            print(f"[KHIPU] ========== LLM Processing Complete (Fallback) ==========")
            return {"success": True, "segments": base_segments}
            
    except Exception as e:
        print(f"[KHIPU] LLM processing failed: {e}")
        print(f"[KHIPU] Falling back to heuristic segmentation only...")
        base_segments = _apply_segmentation_heuristics(text_chunk)
        print(f"[KHIPU] ========== LLM Processing Complete (Error Fallback) ==========")
        return {"success": True, "segments": base_segments}



def _llm_choose_speaker(speech_text: str, context_left: str, context_right: str, allowed: List[str]) -> dict:
    """Legacy function - now prefer _llm_parse_dialogue_comprehensive for better results"""
    system = (
        "Eres un etiquetador de turnos de diálogo para una novela en español. "
        "Elige un único 'speaker' desde la lista de 'candidatos' o 'desconocido'. "
        "Responde SOLO JSON válido."
    )
    user = {
        "dialogo": speech_text.strip(),
        "contexto_izquierda": context_left.strip(),
        "contexto_derecha": context_right.strip(),
        "candidatos": allowed,
        "instrucciones": [
            "Devuelve campos: speaker (string), confidence (0..1), reason (string corta).",
            "Usa el contexto y pistas como 'dijo Rosa'.",
            "No inventes nombres; si dudas, 'desconocido'."
        ]
    }
    messages = [{"role":"system","content":system},{"role":"user","content":json.dumps(user, ensure_ascii=False)}]
    return chat_json(messages, strict=True)

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
    cache = _load_cache(cache_path)
    refined: List[Dict[str, object]] = []
    processed = 0
    for ln in lines:
        v = str(ln.get("voice") or "")
        is_dialogue_span = "start_char" in ln and "end_char" in ln
        if not is_dialogue_span:
            refined.append(ln); continue
        call_llm = (mode == "all") or (mode == "unknown" and v == unknown_label)
        if not call_llm or processed >= max_lines:
            refined.append(ln); continue

        sc = int(ln["start_char"]); ec = int(ln["end_char"])
        speech_text = chapter_text[sc:ec+1]
        if _is_punct_only(speech_text):  # NO llamar al LLM por basura de puntuación
            refined.append(ln); continue

        left = chapter_text[max(0, sc - window_chars):sc]
        right = chapter_text[ec+1: ec+1+window_chars]
        key = _sha(json.dumps({"speech": speech_text, "L": left, "R": right, "allowed": allowed_speakers}, ensure_ascii=False))
        if key in cache:
            res = cache[key]
        else:
            try:
                res = _llm_choose_speaker(speech_text, left, right, allowed_speakers)
            except Exception as e:
                _LOG.warning("LLM attribution failed; keeping original", extra={"err": str(e)})
                refined.append(ln); continue
            cache[key] = res
            _save_cache(cache_path, cache)

        speaker = str(res.get("speaker") or unknown_label)
        conf = float(res.get("confidence") or 0.0)
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
    llm_attribution: str = "unknown",   # "off" | "unknown" | "all"
    llm_threshold: float = 0.66,
    llm_max_lines: int = 200,
    llm_window_chars: int = 240,
) -> Dict[str, object]:
    if not chapter_id or not isinstance(chapter_id, str):
        raise SSMLPlanError("chapter_id inválido")

    _emit_progress("📖 Reading Chapter", 0, f"Loading text for {chapter_id}")
    
    text = (chapter_text or "").strip("\n")
    if not text:
        return {"chapter_id": chapter_id, "chunks": []}

    _emit_progress("📖 Reading Chapter", 3, "Loading character definitions")
    
    name_lex: Dict[str,str] = {}
    if dossier_dir:
        chars_p = Path(dossier_dir) / "characters.json"
        if chars_p.exists():
            try:
                name_lex = _build_name_lexicon(_load_json(chars_p))
            except Exception as e:
                _LOG.warning("No se pudo leer characters.json", extra={"err": str(e)})

    allowed_speakers = sorted(set(list(name_lex.values()) + [default_voice, "narrador", unknown_voice_label]))

    max_kb = int(limits.get("max_kb_per_request", 0)) if limits else 0
    boundaries = _find_boundaries(text)
    positions = [b.pos for b in boundaries]
    kinds     = [b.kind for b in boundaries]

    # Always use comprehensive LLM-based dialogue parsing when dialogue is enabled
    if dialogue:
        _LOG.info("Using comprehensive LLM-based dialogue detection, splitting, and speaker attribution")
        print(f"[KHIPU] ========== DIALOGUE PROCESSING START ==========")
        print(f"[KHIPU] Chapter: {chapter_id}")
        print(f"[KHIPU] Text length: {len(text)} characters") 
        print(f"[KHIPU] Available speakers: {allowed_speakers}")
        print(f"[KHIPU] LLM window chars: {llm_window_chars}")
        
        # Get detailed dialogue segments with proper speaker assignment from LLM  
        detailed_dialogue_segments = _find_dialogue_spans_llm(text, allowed_speakers, llm_window_chars)
        
        print(f"[KHIPU] ========== DIALOGUE PROCESSING COMPLETE ==========")
        print(f"[KHIPU] Total segments extracted: {len(detailed_dialogue_segments)}")
    else:
        _LOG.info("No dialogue processing requested")
        print(f"[KHIPU] Dialogue processing disabled, using narrator only")
        detailed_dialogue_segments = []

    chunks: List[Dict[str, object]] = []
    cursor = 0
    idx = 1
    N = len(text)

    # Legacy variables removed - now using LLM-only approach

    with log_span("ssml.plan.build", extra={"chapter": chapter_id}):
        total_chunks_estimate = (N // int(target_minutes * wpm * 6.3)) + 1
        print(f"[KHIPU] Starting chapter {chapter_id} processing: {N} characters, estimated {total_chunks_estimate} chunks")
        
        _emit_progress("✂️ Building Chunks", 70, f"Creating audio segments (0/{total_chunks_estimate})")
        
        print(f"[KHIPU] ========== CHUNK BUILDING START ==========")
        print(f"[KHIPU] Text length: {N} characters")
        print(f"[KHIPU] Estimated chunks: {total_chunks_estimate}")
        print(f"[KHIPU] Available dialogue segments: {len(detailed_dialogue_segments) if detailed_dialogue_segments else 0}")
        
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
            
            progress_percent = (cursor / N) * 100
            chunk_progress = 70 + int((idx / total_chunks_estimate) * 25)  # 70-95% for chunk building
            _emit_progress("✂️ Building Chunks", chunk_progress, f"Creating audio chunk {idx}/{total_chunks_estimate}")
            
            print(f"[KHIPU] ---------- Chunk {chunk_id} Start ----------")
            print(f"[KHIPU] Building audio chunk {chunk_id} ({idx}/{total_chunks_estimate}): {progress_percent:.1f}% complete, {end_pos - cursor} chars")
            print(f"[KHIPU] Chunk boundaries: {cursor} to {end_pos-1}")
            print(f"[KHIPU] Cut kind: {cut_kind}, Minutes: {minutes:.2f}, KB: {kb:.2f}")

            lines: List[Dict[str, object]] = []
            if dialogue and detailed_dialogue_segments:
                # Use LLM-processed dialogue segments - DON'T clip to chunk boundaries
                print(f"[KHIPU] Processing chunk {chunk_id} with LLM dialogue segments")
                in_chunk_segments = [seg for seg in detailed_dialogue_segments 
                                   if not (seg["end_char"] < cursor or seg["start_char"] >= end_pos)]
                
                # Use LLM segments exactly as provided - no clipping or gap filling
                for segment in in_chunk_segments:
                    # Use original LLM coordinates - don't force into chunk boundaries
                    seg_start = segment["start_char"] 
                    seg_end = segment["end_char"]
                    
                    # Only include if segment actually overlaps with chunk
                    if seg_end >= cursor and seg_start < end_pos:
                        # Adjust only if segment extends beyond chunk
                        actual_start = max(seg_start, cursor)
                        actual_end = min(seg_end, end_pos - 1)
                        
                        if actual_end >= actual_start:
                            seg_text = text[actual_start:actual_end + 1]
                            if not _is_punct_only(seg_text):
                                lines.append({
                                    "voice": segment["voice"],
                                    "start_char": actual_start,
                                    "end_char": actual_end
                                })
                                print(f"[KHIPU] Added LLM segment: voice={segment['voice']}, start={actual_start}, end={actual_end}, text='{seg_text[:50]}...'")
                
                # If no segments found in chunk, use narrator for whole chunk
                if not lines:
                    lines.append({"voice": default_voice, "start_char": cursor, "end_char": end_pos - 1})
                    print(f"[KHIPU] No LLM segments in chunk {chunk_id}, using full narrator")
            elif dialogue:
                # Dialogue requested but no LLM segments available, use all narrator
                lines.append({"voice": default_voice, "start_char": cursor, "end_char": end_pos - 1})
                print(f"[KHIPU] No LLM segments available for chunk {chunk_id}, using full narrator")

            chunk_obj: Dict[str, object] = {
                "id": chunk_id,
                "start_char": cursor,
                "end_char": end_pos - 1,  # Consistent end indexing
                "voice": default_voice,
                "stylepack": default_stylepack,
            }
            if lines:
                chunk_obj["lines"] = lines

            chunks.append(chunk_obj)
            print(f"[KHIPU] Chunk {chunk_id} complete: {len(lines)} lines created")
            print(f"[KHIPU] ---------- Chunk {chunk_id} End ----------")
            
            _LOG.info("chunk", extra={
                "chapter": chapter_id, "chunk_id": chunk_id,
                "start": cursor, "end": end_pos, "kind": cut_kind,
                "minutes": round(minutes, 2), "kb": kb,
                "lines": len(lines), "llm": True  # Always using LLM now
            })

            idx += 1
            cursor = end_pos
            while cursor < N and text[cursor].isspace():
                cursor += 1

    _emit_progress("💾 Saving Plan", 95, "Finalizing chapter plan")
    
    print(f"[KHIPU] Chapter {chapter_id} completed: {len(chunks)} audio chunks generated")
    _LOG.info(f"Chapter {chapter_id} processing complete: {len(chunks)} chunks, {cursor} characters processed")
    
    _emit_progress("✅ Complete", 100, f"Chapter {chapter_id} ready - {len(chunks)} audio segments")
    
    return {"chapter_id": chapter_id, "chunks": chunks}

# ------------------ Batch + CLI (igual que antes) ------------------

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

def _main_cli():
    import argparse
    ap = argparse.ArgumentParser(description="Construye plan SSML (con diálogos) y LLM para speakers (opcional).")

    ap.add_argument("--chapter-id")
    ap.add_argument("--in", dest="infile")
    ap.add_argument("--out")

    ap.add_argument("--analysis-dir")
    ap.add_argument("--out-dir")

    ap.add_argument("--voice", default="narrador")
    ap.add_argument("--stylepack", default="chapter_default")
    ap.add_argument("--target-min", type=float, default=7.0)
    ap.add_argument("--hard-cap-min", type=float, default=8.0)
    ap.add_argument("--max-kb", type=int, default=48)
    ap.add_argument("--wpm", type=float, default=None)
    ap.add_argument("--pattern", default="*.txt")

    ap.add_argument("--dossier", default="dossier")
    ap.add_argument("--no-dialogue", action="store_true")
    ap.add_argument("--unknown-voice", default="desconocido")

    ap.add_argument("--llm-attribution", choices=["off", "unknown", "all"], default="unknown")
    ap.add_argument("--llm-threshold", type=float, default=0.66)
    ap.add_argument("--llm-max-lines", type=int, default=200)
    ap.add_argument("--llm-window-chars", type=int, default=240)

    args = ap.parse_args()
    dossier_dir = Path(args.dossier) if args.dossier else None
    dialogue = not args.no_dialogue

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
