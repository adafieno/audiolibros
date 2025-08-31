# ssml/xml_generator.py
# -*- coding: utf-8 -*-
"""
SSML XML generator (Azure TTS) — dossier-aware, sentence cadence, per-line voices.

What it does
- Supports plan chunks with optional lines[] (multi-voice switching inside a chunk).
- Sentence-level cadence: wraps sentences in <s> and injects <break> for punctuation.
- Applies style/styledegree (mstts:express-as) and per-character prosody deltas.
- Uses voices.variants.json to assign voices for “desconocido” / minor roles.
- Resolves default voice and locale from dossier config or inferred from voice id.
- Skips punctuation-only lines (e.g., a stray “—”) to avoid narrator speaking them.

Optional config: dossier/stylepacks.json
  {
    "default": {
      "prosody": {"rate":"0%","pitch":"0%","volume":"medium"},
      "cadence": {
        "comma_ms": 50, "period_ms": 70, "colon_ms": 80, "ellipsis_ms": 70,
        "dash_ms": 50, "sentence_ms": 0, "paragraph_ms": 500, "after_block_ms": 500,
        "long_word_threshold": 35, "long_rate": "-3%"
      }
    }
  }
"""
from __future__ import annotations
import json
import re
import os, sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import xml.etree.ElementTree as ET

_pkg_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _pkg_root not in sys.path:
    sys.path.insert(0, _pkg_root)

# ------------------------------- Errors -------------------------------

class SSMLRenderError(Exception):
    def __init__(self, message: str, **ctx):
        super().__init__(message)
        self.ctx = ctx

# ------------------------------- IO utils -----------------------------

def read_json(p: Path, *, allow_jsonc: bool = True, required_keys: Optional[List[str]] = None, label: str = "JSON"):
    if not p.exists():
        raise SSMLRenderError(f"{label} not found", path=str(p))
    raw = p.read_text(encoding="utf-8", errors="strict")
    if not raw.strip():
        raise SSMLRenderError(f"{label} is empty", path=str(p))
    if allow_jsonc:
        raw = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
        raw = re.sub(r"(?m)//.*?$", "", raw)
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError as e:
        snippet = raw[max(0, e.pos-40):e.pos+40]
        raise SSMLRenderError(f"Invalid {label} at line {e.lineno} col {e.colno}", path=str(p), snippet=snippet)
    if required_keys:
        for k in required_keys:
            if k not in obj:
                raise SSMLRenderError(f"{label} missing key '{k}'", path=str(p))
    return obj

# ------------------------------- Namespaces ---------------------------

SSML_NS = "http://www.w3.org/2001/10/synthesis"
MSTTS_NS = "https://www.w3.org/2001/mstts"
XML_NS = "http://www.w3.org/XML/1998/namespace"
ET.register_namespace("", SSML_NS)
ET.register_namespace("mstts", MSTTS_NS)

# --------------------------- Stylepacks / Cadence ---------------------

_DEFAULT_STYLEPACK = {
    "default": {
        "prosody": {},
        "breaks": { "paragraph_ms": 0 },  # legacy compat
        "cadence": {
            "comma_ms": 50,
            "period_ms": 70,
            "colon_ms": 80,
            "ellipsis_ms": 70,
            "dash_ms": 50,
            "sentence_ms": 0,
            "paragraph_ms": 500,
            "after_block_ms": 500,
            "long_word_threshold": 35,
            "long_rate": "-3%"
        }
    }
}

def _deep_merge(dst: Dict[str, Any], src: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(dst)
    for k, v in (src or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out

def pack_for(stylepack_id: str, stylepacks: Dict[str, Any]) -> Dict[str, Any]:
    base = stylepacks if isinstance(stylepacks, dict) else {}
    merged_default = _deep_merge(_DEFAULT_STYLEPACK["default"], base.get("default") or {})
    pack = base.get(stylepack_id) or {}
    return _deep_merge(merged_default, pack)

# --------------------------- Cadence helpers --------------------------

def _words_count(s: str) -> int:
    return len(re.findall(r"\w+", s, flags=re.UNICODE))

def _inject_break_markup(text: str, cad: Dict[str, Any]) -> str:
    # ellipsis
    text = re.sub(r"\.\.\.", f'<break time="{cad["ellipsis_ms"]}ms"/>…', text)
    text = re.sub(r"…",        f'<break time="{cad["ellipsis_ms"]}ms"/>…', text)
    # em-dash
    text = re.sub(r"—\s*", f'—<break time="{cad["dash_ms"]}ms"/> ', text)
    # sentence end
    text = re.sub(r'(?<=\S)([.?!])\s+', rf'\1 <break time="{cad["period_ms"]}ms"/> ', text)
    # comma/colon
    text = re.sub(r',\s+', f', <break time="{cad["comma_ms"]}ms"/> ', text)
    text = re.sub(r':\s+', f': <break time="{cad["colon_ms"]}ms"/> ', text)
    return text

def _split_to_s_sentences(text: str) -> List[str]:
    parts = re.split(r'(?<=[.?!])\s+(?=[A-ZÁÉÍÓÚÑ0-9"“(—])', text)
    return [p.strip() for p in parts if p.strip()]

def _string_to_nodes(fragment_xml: str) -> List[ET.Element]:
    # Wrap to allow <break/> fragments to be parsed as XML nodes
    root = ET.fromstring(f"<wrap>{fragment_xml}</wrap>")
    return list(root)

def _build_s_nodes(text: str, cad: Dict[str, Any]) -> List[ET.Element]:
    text = _inject_break_markup(text, cad)
    sentences = _split_to_s_sentences(text)
    nodes: List[ET.Element] = []
    for s in sentences:
        s_el = ET.Element(f"{{{SSML_NS}}}s")
        for child in _string_to_nodes(s):
            s_el.append(child)
        nodes.append(s_el)
        if cad.get("sentence_ms", 0):
            nodes.append(ET.Element(f"{{{SSML_NS}}}break", attrib={"time": f'{int(cad["sentence_ms"])}ms'}))
    return nodes

def build_content_nodes(text: str, *, cadence: Dict[str, Any]) -> List[ET.Element]:
    parts = re.split(r"\n\s*\n", text.strip())
    out: List[ET.Element] = []
    for i, para in enumerate(parts):
        if not para.strip():
            continue
        nodes = _build_s_nodes(para.strip(), cadence)
        wc = _words_count(para)
        if wc >= int(cadence.get("long_word_threshold", 10)):
            pros = ET.Element(f"{{{SSML_NS}}}prosody", attrib={"rate": cadence.get("long_rate", "-3%")})
            for n in nodes: pros.append(n)
            out.append(pros)
        else:
            out.extend(nodes)
        if i < len(parts)-1 and cadence.get("paragraph_ms", 0):
            out.append(ET.Element(f"{{{SSML_NS}}}break", attrib={"time": f'{int(cadence["paragraph_ms"])}ms'}))
    return out

# --------------------------- Voice resolution -------------------------

def _lookup_cast_profile(voices_cast: Dict[str, Any], key: str) -> Optional[Dict[str, Any]]:
    if not voices_cast:
        return None
    # Map-style cast: {"Rosa": {...}, "Sánchez": {...}}
    if isinstance(voices_cast, dict) and "cast" not in voices_cast:
        if key in voices_cast and isinstance(voices_cast[key], dict):
            return voices_cast[key]
        low = key.lower()
        for k, v in voices_cast.items():
            if isinstance(v, dict) and k.lower() == low:
                return v
        for v in voices_cast.values():
            if isinstance(v, dict) and v.get("id", "").split("::")[-1].lower() == low:
                return v
        return None
    # List-style cast: {"cast":[{character_id, voice_id, ...}, ...]}
    for it in (voices_cast.get("cast") or []):
        if it.get("character_id") == key:
            return {
                "voice": it.get("voice_id"),
                "style": it.get("style"),
                "styledegree": it.get("styledegree"),
                "rate_pct": it.get("rate_pct", 0),
                "pitch_pct": it.get("pitch_pct", 0),
            }
    return None

def _stable_index(key: str, n: int, seed: int = 17) -> int:
    import hashlib
    h = hashlib.sha1((str(seed) + "|" + key).encode("utf-8")).hexdigest()
    return int(h[:8], 16) % max(1, n)

def _pick_variant_for(name: str, variants: Dict[str, Any], *, seed: int, chapter_usage: Dict[str, int]) -> Optional[Dict[str, Any]]:
    if not variants or "pools" not in variants:
        return None
    policy = variants.get("policy") or {}
    pool_name = policy.get("default_pool") or "neutral_any"
    pool = (variants.get("pools") or {}).get(pool_name) or []
    if not pool:
        pools = variants.get("pools") or {}
        if pools:
            pool = next(iter(pools.values()))
    if not pool:
        return None
    idx = _stable_index(name or "?", len(pool), seed=policy.get("assignment", {}).get("hash_seed", seed))
    cand = pool[idx]
    max_reuse = (policy.get("assignment", {}) or {}).get("max_reuse_per_chapter", 999999)
    spins = 0
    while chapter_usage.get(cand["id"], 0) >= max_reuse and spins < len(pool):
        idx = (idx + 1) % len(pool); cand = pool[idx]; spins += 1
    chapter_usage[cand["id"]] = chapter_usage.get(cand["id"], 0) + 1
    return cand

def resolve_voice(
    voice_field: str,
    voices_cast: Dict[str, Any],
    *,
    default_voice: str,
    use_variants: bool,
    variants: Optional[Dict[str, Any]] = None,
    seed: int = 17,
    chapter_usage: Optional[Dict[str, int]] = None,
) -> Tuple[str, Optional[str], Optional[float], int, int, str]:
    # If voice_field is a direct Azure voice id, use it verbatim
    if isinstance(voice_field, str) and "Neural" in voice_field and "-" in voice_field:
        return voice_field, None, None, 0, 0, "direct"
    # Else, try cast lookup by character key
    prof = _lookup_cast_profile(voices_cast or {}, voice_field)
    if prof:
        return (
            prof.get("voice") or default_voice,
            prof.get("style"),
            prof.get("styledegree"),
            int(prof.get("rate_pct", 0) or 0),
            int(prof.get("pitch_pct", 0) or 0),
            "cast"
        )
    # Else variants for unknown/minor roles
    if use_variants and variants:
        chosen = _pick_variant_for(voice_field, variants, seed=seed, chapter_usage=(chapter_usage or {}))
        if chosen:
            return (
                chosen.get("voice") or default_voice,
                chosen.get("style"),
                chosen.get("styledegree"),
                int(chosen.get("rate_pct", 0) or 0),
                int(chosen.get("pitch_pct", 0) or 0),
                "variant"
            )
    # Fallback
    return default_voice, None, None, 0, 0, "default"

# -------------------- Defaults from dossier (voice & locale) ----------

def _infer_locale_from_voice_id(voice_id: Optional[str]) -> Optional[str]:
    if not voice_id or not isinstance(voice_id, str):
        return None
    m = re.match(r"^([a-z]{2,3}-[A-Z]{2})-", voice_id)
    return m.group(1) if m else None

def resolve_default_voice(
    dossier_dir: Path,
    voices_cast: Optional[Dict[str, Any]],
    cli_default: Optional[str] = None,
    hard_fallback: str = "es-PE-AlexNeural"
) -> str:
    def _try_from_config_file(fname: str) -> Optional[str]:
        p = dossier_dir / fname
        if not p.exists():
            return None
        cfg = read_json(p, allow_jsonc=True, label=fname)
        dv = cfg.get("default_voice") or cfg.get("narrator_default_voice") or cfg.get("voice")
        if isinstance(dv, str):
            if "Neural" in dv and "-" in dv:
                return dv
            if voices_cast:
                prof = _lookup_cast_profile(voices_cast, dv)
                if prof and isinstance(prof.get("voice"), str):
                    return prof["voice"]
        return None
    for fname in ("ssml.config.json", "book.config.json", "book.json", "config.json"):
        val = _try_from_config_file(fname)
        if val: return val
    narrator_keys = ("NARRADOR","Narrador","narrador","Narrator","NARRATOR","Narración","Narracion","Narración Principal")
    if voices_cast:
        for key in narrator_keys:
            prof = _lookup_cast_profile(voices_cast, key)
            if prof and isinstance(prof.get("voice"), str):
                return prof["voice"]
    if cli_default:
        return cli_default
    return hard_fallback

def resolve_locale(
    dossier_dir: Path,
    voices_cast: Optional[Dict[str, Any]],
    default_voice_resolved: Optional[str] = None,
    cli_locale: Optional[str] = None,
    hard_fallback: str = "es-PE"
) -> str:
    def _try_cfg(fname: str) -> Optional[str]:
        p = dossier_dir / fname
        if not p.exists():
            return None
        cfg = read_json(p, allow_jsonc=True, label=fname)
        for k in ("locale","xml_lang","language","lang"):
            v = cfg.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return None
    for fname in ("ssml.config.json", "book.config.json", "book.json", "config.json"):
        val = _try_cfg(fname)
        if val: return val
    loc = _infer_locale_from_voice_id(default_voice_resolved)
    if loc: return loc
    if cli_locale and cli_locale.strip():
        return cli_locale.strip()
    return hard_fallback

# --------------------------- SSML building ----------------------------

# Punctuation-only safeguard (so we never voice a lone em-dash, etc.)
_PUNCT_ONLY_RE = re.compile(r'^[\s\.,!?:;«»"“”\'\(\)\[\]\{\}/\\\-–—…]+$', re.UNICODE)
def _is_punct_only(s: str) -> bool:
    s = (s or "").strip()
    return (not s) or bool(_PUNCT_ONLY_RE.match(s))

def _begin_speak(locale: str) -> ET.Element:
    speak = ET.Element(f"{{{SSML_NS}}}speak", attrib={"version": "1.0"})
    speak.set(f"{{{XML_NS}}}lang", locale)
    return speak

def _append_voiced_block(
    parent: ET.Element,
    *,
    voice_id: str,
    cast_style: Optional[str],
    cast_styledeg: Optional[float],
    base_prosody: Dict[str, Any],
    deltas: Dict[str, str],
    content_nodes: List[ET.Element],
) -> None:
    voice_el = ET.SubElement(parent, f"{{{SSML_NS}}}voice", attrib={"name": voice_id})
    container = voice_el
    if cast_style:
        attrs = {"style": cast_style}
        if cast_styledeg is not None:
            attrs["styledegree"] = str(cast_styledeg)
        container = ET.SubElement(container, f"{{{MSTTS_NS}}}express-as", attrib=attrs)
    attrib = {k: v for k, v in {
        "rate": base_prosody.get("rate"),
        "pitch": base_prosody.get("pitch"),
        "volume": base_prosody.get("volume"),
    }.items() if v}
    if attrib:
        container = ET.SubElement(container, f"{{{SSML_NS}}}prosody", attrib=attrib)
    if deltas:
        container = ET.SubElement(container, f"{{{SSML_NS}}}prosody", attrib=deltas)
    for n in content_nodes:
        container.append(n)

def _resolve_deltas(rate_pct: int, pitch_pct: int) -> Dict[str, str]:
    delta = {}
    if rate_pct:  delta["rate"]  = f"{rate_pct:+d}%"
    if pitch_pct: delta["pitch"] = f"{pitch_pct:+d}%"
    return delta

def _render_lines_in_chunk(
    chapter_text: str,
    lines: List[Dict[str, Any]],
    *,
    locale: str,
    voices_cast: Optional[Dict[str, Any]],
    stylepacks: Dict[str, Any],
    cadence: Dict[str, Any],
    default_voice: str,
    use_variants: bool,
    variants: Optional[Dict[str, Any]],
    seed: int,
    chapter_usage: Dict[str, int],
) -> str:
    speak = _begin_speak(locale)
    for ln in lines:
        ltype = (ln.get("type") or "").lower()
        if ltype in ("sfx", "audio"):
            src = ln.get("src")
            if src:
                ET.SubElement(speak, f"{{{SSML_NS}}}audio", attrib={"src": src})
            if cadence.get("after_block_ms", 0):
                ET.SubElement(speak, f"{{{SSML_NS}}}break", attrib={"time": f'{int(cadence["after_block_ms"])}ms'})
            continue

        text: Optional[str] = ln.get("text")
        if text is None:
            sc = int(ln.get("start_char", -1)); ec = int(ln.get("end_char", -2))
            text = chapter_text[sc:ec+1] if ec >= sc >= 0 else ""

        # NEW: skip punctuation-only / blank fragments
        if _is_punct_only(text):
            continue

        stylepack_id = ln.get("stylepack") or "default"
        pack = pack_for(stylepack_id, stylepacks)
        prosody = pack.get("prosody", {}) or {}

        voice_key = ln.get("voice") or ""
        v_id, cast_style, cast_styledeg, rate_pct, pitch_pct, _src = resolve_voice(
            voice_key, voices_cast or {}, default_voice=default_voice, use_variants=use_variants,
            variants=variants, seed=seed, chapter_usage=chapter_usage
        )

        content_nodes = build_content_nodes(text, cadence=cadence)
        _append_voiced_block(
            speak,
            voice_id=v_id,
            cast_style=cast_style,
            cast_styledeg=cast_styledeg,
            base_prosody=prosody,
            deltas=_resolve_deltas(rate_pct, pitch_pct),
            content_nodes=content_nodes,
        )
        if cadence.get("after_block_ms", 0):
            ET.SubElement(speak, f"{{{SSML_NS}}}break", attrib={"time": f'{int(cadence["after_block_ms"])}ms'})
    return ET.tostring(speak, encoding="utf-8").decode("utf-8")

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
    lexicon: Optional[Dict[str, Any]] = None,                  # reserved for future use
    pronunciations_sensitive: Optional[Dict[str, Any]] = None, # reserved for future use
    default_voice: str = "es-PE-AlexNeural",
    use_variants: bool = True,
    variants: Optional[Dict[str, Any]] = None,
    seed: int = 17,
    chapter_usage: Optional[Dict[str, int]] = None,
    lines: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """
    Generate SSML for a chunk.
    - If `lines[]` is present, alternate voices per line.
    - Otherwise, render the whole chunk with one voice, sentence-level cadence.
    """
    pack = pack_for(stylepack_id, stylepacks)
    prosody = pack.get("prosody", {}) or {}
    cadence = pack.get("cadence", {}) or {}
    chapter_usage = chapter_usage or {}

    if lines:
        return _render_lines_in_chunk(
            chapter_text, lines,
            locale=locale, voices_cast=voices_cast, stylepacks=stylepacks,
            cadence=cadence, default_voice=default_voice, use_variants=use_variants,
            variants=variants, seed=seed, chapter_usage=chapter_usage
        )

    if end_char < start_char:
        raise SSMLRenderError("Invalid chunk range", start_char=start_char, end_char=end_char)
    segment = chapter_text[start_char:end_char+1]

    v_id, cast_style, cast_styledeg, rate_pct, pitch_pct, _ = resolve_voice(
        voice, voices_cast or {}, default_voice=default_voice, use_variants=use_variants,
        variants=variants, seed=seed, chapter_usage=chapter_usage
    )

    speak = ET.Element(f"{{{SSML_NS}}}speak", attrib={"version": "1.0"})
    speak.set(f"{{{XML_NS}}}lang", locale)

    content_nodes = build_content_nodes(segment, cadence=cadence)
    deltas = _resolve_deltas(rate_pct, pitch_pct)
    _append_voiced_block(
        speak,
        voice_id=v_id,
        cast_style=cast_style,
        cast_styledeg=cast_styledeg,
        base_prosody=prosody,
        deltas=deltas,
        content_nodes=content_nodes,
    )
    return ET.tostring(speak, encoding="utf-8").decode("utf-8")

# ---------------------------- Top-level API ---------------------------

def render_plan_to_files(
    plan: Dict[str, Any],
    chapter_text: str,
    out_dir: Path,
    *,
    locale: str,
    voices_cast: Optional[Dict[str, Any]],
    stylepacks: Dict[str, Any],
    lexicon: Optional[Dict[str, Any]] = None,
    pronunciations_sensitive: Optional[Dict[str, Any]] = None,
    default_voice: str = "es-PE-AlexNeural",
    dossier_dir: Optional[Path] = None,
    use_variants: bool = True,
    seed: int = 17,
) -> List[Path]:
    out_dir = Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    dossier = dossier_dir or Path(".")
    default_voice_resolved = resolve_default_voice(dossier, voices_cast, cli_default=default_voice)
    locale_resolved = resolve_locale(dossier, voices_cast, default_voice_resolved, cli_locale=locale)

    variants = None
    if use_variants:
        var_path = dossier / "voices.variants.json"
        if var_path.exists():
            variants = read_json(var_path, allow_jsonc=True, label="voices.variants.json")

    chapter_usage: Dict[str, int] = {}
    chapter_id = plan.get("chapter_id") or "chapter"

    out_paths: List[Path] = []
    for ch in plan.get("chunks", []):
        chunk_id = ch.get("id") or f"{ch.get('start_char')}_{ch.get('end_char')}"
        xml = render_chunk_xml(
            chapter_text,
            start_char=int(ch["start_char"]),
            end_char=int(ch["end_char"]),
            voice=ch.get("voice") or "",
            stylepack_id=ch.get("stylepack") or "default",
            locale=locale_resolved,
            voices_cast=voices_cast,
            stylepacks=stylepacks,
            lexicon=lexicon,
            pronunciations_sensitive=pronunciations_sensitive,
            default_voice=default_voice_resolved,
            use_variants=use_variants,
            variants=variants,
            seed=seed,
            chapter_usage=chapter_usage,
            lines=ch.get("lines") if isinstance(ch.get("lines"), list) else None,
        )
        out_path = out_dir / f"{chapter_id}.{chunk_id}.ssml.xml"
        out_path.write_text(xml, encoding="utf-8")
        out_paths.append(out_path)
    return out_paths

# ------------------------------- CLI ----------------------------------

def _main_cli():
    import argparse
    ap = argparse.ArgumentParser(description="Genera SSML por chunk (Azure TTS) con voces por línea.")
    ap.add_argument("--plan", required=True, help="Ruta al plan JSON del capítulo")
    ap.add_argument("--text", required=True, help="Ruta al texto del capítulo (utf-8)")
    ap.add_argument("--out", required=True, help="Directorio de salida para los XML")
    ap.add_argument("--dossier", default="dossier", help="Dossier (voices.cast.json, variants, stylepacks, config)")
    ap.add_argument("--locale", help="xml:lang (opcional). Si no, se lee de config o se infiere.")
    ap.add_argument("--default-voice", help="Voz de fallback (opcional). Si no, se lee de config/cast.")
    ap.add_argument("--use-variants", action="store_true", help="Usar voices.variants.json para desconocidos/minores")
    ap.add_argument("--seed", type=int, default=17, help="Semilla determinista para variantes")
    args = ap.parse_args()

    plan = read_json(Path(args.plan), allow_jsonc=True, label="plan")
    chapter_text = Path(args.text).read_text(encoding="utf-8")

    dossier = Path(args.dossier)
    cast_path = dossier / "voices.cast.json"
    voices = read_json(cast_path, allow_jsonc=True, label="voices.cast.json") if cast_path.exists() else {}
    sp_path = dossier / "stylepacks.json"
    stylepacks = read_json(sp_path, allow_jsonc=True, label="stylepacks.json") if sp_path.exists() else {"default":{}}
    lex_path = dossier / "lexicon.json"
    sens_path = dossier / "pronunciations.sensitive.json"
    lexicon = read_json(lex_path, allow_jsonc=True, label="lexicon.json") if lex_path.exists() else None
    sensitive = read_json(sens_path, allow_jsonc=True, label="pronunciations.sensitive.json") if sens_path.exists() else None

    cli_default = args.default_voice if args.default_voice else None
    default_voice_resolved = resolve_default_voice(dossier, voices, cli_default=cli_default)
    locale_resolved = resolve_locale(dossier, voices, default_voice_resolved, cli_locale=args.locale)

    out_paths = render_plan_to_files(
        plan, chapter_text, Path(args.out),
        locale=locale_resolved,
        voices_cast=voices,
        stylepacks=stylepacks,
        lexicon=lexicon,
        pronunciations_sensitive=sensitive,
        default_voice=default_voice_resolved,
        dossier_dir=dossier,
        use_variants=args.use_variants,
        seed=args.seed,
    )
    print("\n".join(str(p) for p in out_paths))

if __name__ == "__main__":
    _main_cli()
