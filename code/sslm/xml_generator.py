# ssml/xml_generator.py
# -*- coding: utf-8 -*-
"""
SSML XML generator (Azure TTS) — dossier-aware, book-config-first defaults.

What this version does:
- Reads principals from dossier/voices.cast.json (NEW map format) with legacy support.
- Assigns minors/extras from dossier/voices.variants.json deterministically (--use-variants).
- Applies style/styledegree (mstts:express-as) + small per-character prosody deltas (rate/pitch)
  layered on top of stylepack prosody.
- Resolves defaults in this order:
    DEFAULT VOICE:
      1) dossier/ssml.config.json (or book.config.json / book.json / config.json) → default_voice
         (accepts either an Azure voice id or a character key present in voices.cast.json)
      2) narrator-like entries in voices.cast.json (e.g., "Narrador", "Narrator", etc.)
      3) --default-voice CLI flag (if provided)
      4) "es-ES-ElviraNeural"
    LOCALE:
      1) same config files as above → keys: locale | xml_lang | language | lang
      2) inferred from resolved default voice id (e.g., "es-PE-*" → "es-PE")
      3) --locale CLI flag (if provided)
      4) "es-ES"

Inputs
- Plan JSON: {"chapter_id","chunks":[{id,start_char,end_char,voice,stylepack}]}
- Chapter text
- Dossier files:
    dossier/voices.cast.json
    dossier/voices.variants.json   (optional)
    dossier/stylepacks.json
    dossier/ssml.config.json       (optional; may contain {"default_voice": "...", "locale": "..."} )
    dossier/lexicon.json           (optional)
    dossier/pronunciations.sensitive.json (optional)

Output
- One SSML file per chunk to --out dir.
"""

from __future__ import annotations
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import xml.etree.ElementTree as ET

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
        raw = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)       # /* ... */
        raw = re.sub(r"(?m)//.*?$", "", raw)                  # // ...
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

# ------------------------------- SSML NS ------------------------------

SSML_NS = "http://www.w3.org/2001/10/synthesis"
MSTTS_NS = "https://www.w3.org/2001/mstts"
XML_NS = "http://www.w3.org/XML/1998/namespace"
ET.register_namespace("", SSML_NS)
ET.register_namespace("mstts", MSTTS_NS)

# ------------------------- Stylepacks / Lexicon ------------------------

def pack_for(stylepack_id: str, stylepacks: Dict[str, Any]) -> Dict[str, Any]:
    default = stylepacks.get("default") or {}
    if not stylepack_id:
        return default
    pack = stylepacks.get(stylepack_id) or {}
    # shallow merge: pack overrides default
    merged = {}
    merged.update(default)
    for k, v in pack.items():
        if isinstance(v, dict) and isinstance(default.get(k), dict):
            dv = dict(default.get(k))
            dv.update(v)
            merged[k] = dv
        else:
            merged[k] = v
    return merged

def apply_lexicon_and_breaks(text: str, *, breaks: Dict[str, Any]) -> List[ET.Element]:
    """
    Extremely light touch:
      - splits paragraphs by double newline
      - inserts <break time="...ms"> between paragraphs if configured
    Returns a list of SSML <p> nodes (already populated with text and breaks).
    """
    parts = re.split(r"\n\s*\n", text.strip())
    paragraphs: List[ET.Element] = []
    for i, para in enumerate(parts):
        p = ET.Element(f"{{{SSML_NS}}}p")
        p.text = para
        paragraphs.append(p)
        if i < len(parts)-1 and breaks.get("paragraph_ms"):
            br = ET.Element(f"{{{SSML_NS}}}break", attrib={"time": f'{int(breaks["paragraph_ms"])}ms'})
            p.append(br)
    return paragraphs

# ------------------------- Voice resolution ---------------------------

def _lookup_cast_profile(voices_cast: Dict[str, Any], key: str) -> Optional[Dict[str, Any]]:
    """
    Supports:
      NEW: { "<display_name>": {...} }
      LEGACY: { "cast":[{"character_id": "...", "voice_id": "...", "style": "..."}] }
    """
    if not voices_cast:
        return None
    # NEW map
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
    # LEGACY list
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
    """Deterministically pick from variants['pools']['neutral_any'] honoring (softly) max_reuse_per_chapter."""
    if not variants or "pools" not in variants:
        return None
    policy = variants.get("policy") or {}
    pool_name = policy.get("default_pool") or "neutral_any"
    pool = (variants.get("pools") or {}).get(pool_name) or []
    if not pool:
        # fall back to any first pool
        pools = variants.get("pools") or {}
        if pools:
            pool = next(iter(pools.values()))
    if not pool:
        return None

    idx = _stable_index(name or "?", len(pool), seed=policy.get("assignment", {}).get("hash_seed", seed))
    cand = pool[idx]

    # soft reuse limit
    max_reuse = (policy.get("assignment", {}) or {}).get("max_reuse_per_chapter", 999999)
    spins = 0
    while chapter_usage.get(cand["id"], 0) >= max_reuse and spins < len(pool):
        idx = (idx + 1) % len(pool)
        cand = pool[idx]
        spins += 1
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
    """
    Returns (voice_id, style, styledegree, rate_pct, pitch_pct, source)
    - If voice_field looks like an Azure voice id (contains 'Neural'), use as-is.
    - Else try to resolve from voices_cast map.
    - Else if use_variants, pick from voices.variants.json deterministically.
    - Else fall back to default_voice.
    """
    # direct Azure id?
    if isinstance(voice_field, str) and "Neural" in voice_field and "-" in voice_field:
        return voice_field, None, None, 0, 0, "direct"

    # cast lookup
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

    # variants (minors)
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

    # default
    return default_voice, None, None, 0, 0, "default"

# -------------------- Default voice & locale from config ---------------

def _infer_locale_from_voice_id(voice_id: Optional[str]) -> Optional[str]:
    if not voice_id or not isinstance(voice_id, str):
        return None
    # Expect patterns like: es-ES-ElviraNeural, en-US-JennyNeural, pt-BR-AntonioNeural
    m = re.match(r"^([a-z]{2,3}-[A-Z]{2})-", voice_id)
    if m:
        return m.group(1)
    return None

def resolve_default_voice(
    dossier_dir: Path,
    voices_cast: Optional[Dict[str, Any]],
    cli_default: Optional[str] = None,
    hard_fallback: str = "es-PE-AlexNeural"
) -> str:
    """
    Resolve default narrator voice with the following precedence:
      1) dossier/ssml.config.json (or book.config.json / book.json / config.json) → default_voice
         - If value is an Azure voice id, return it.
         - If value is a character key present in voices_cast, return that character's voice.
      2) Narrator-like keys in voices_cast (e.g., "Narrador", "Narrator", etc.)
      3) CLI-provided default voice (if any)
      4) Hard fallback.
    """
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

    # 1) try known config files
    for fname in ("ssml.config.json", "book.config.json", "book.json", "config.json"):
        val = _try_from_config_file(fname)
        if val:
            return val

    # 2) narrator-like keys inside cast
    narrator_keys = ("NARRADOR", "Narrador", "narrador", "Narrator", "NARRATOR", "Narración", "Narracion", "Narración Principal")
    if voices_cast:
        for key in narrator_keys:
            prof = _lookup_cast_profile(voices_cast, key)
            if prof and isinstance(prof.get("voice"), str):
                return prof["voice"]

    # 3) CLI default if present
    if cli_default:
        return cli_default

    # 4) hard fallback
    return hard_fallback

def resolve_locale(
    dossier_dir: Path,
    voices_cast: Optional[Dict[str, Any]],
    default_voice_resolved: Optional[str] = None,
    cli_locale: Optional[str] = None,
    hard_fallback: str = "es-PE"
) -> str:
    """
    Resolve xml:lang locale with the following precedence:
      1) dossier/ssml.config.json (or book.config.json / book.json / config.json):
         keys: 'locale' | 'xml_lang' | 'language' | 'lang'
      2) inferred from default_voice_resolved (e.g., 'es-PE-AlexNeural' → 'es-PE')
      3) CLI-provided --locale (if any)
      4) Hard fallback ('es-PE')
    """
    def _try_cfg(fname: str) -> Optional[str]:
        p = dossier_dir / fname
        if not p.exists():
            return None
        cfg = read_json(p, allow_jsonc=True, label=fname)
        for k in ("locale", "xml_lang", "language", "lang"):
            v = cfg.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return None

    # 1) configs
    for fname in ("ssml.config.json", "book.config.json", "book.json", "config.json"):
        val = _try_cfg(fname)
        if val:
            return val

    # 2) infer from default voice id
    loc = _infer_locale_from_voice_id(default_voice_resolved)
    if loc:
        return loc

    # 3) CLI locale
    if cli_locale and cli_locale.strip():
        return cli_locale.strip()

    # 4) fallback
    return hard_fallback

# --------------------------- SSML building ----------------------------

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
    default_voice: str = "es-PE-AlexNeural",
    use_variants: bool = True,
    variants: Optional[Dict[str, Any]] = None,
    seed: int = 17,
    chapter_usage: Optional[Dict[str, int]] = None,
) -> str:
    """Generate SSML for a text span (chunk)."""
    if end_char < start_char:
        raise SSMLRenderError("Invalid chunk range", start_char=start_char, end_char=end_char)
    segment = chapter_text[start_char:end_char+1]

    # resolve voice
    v_id, cast_style, cast_styledeg, rate_pct, pitch_pct, source = resolve_voice(
        voice, voices_cast or {}, default_voice=default_voice, use_variants=use_variants,
        variants=variants, seed=seed, chapter_usage=chapter_usage
    )
    pack = pack_for(stylepack_id, stylepacks)
    prosody = pack.get("prosody", {}) or {}
    breaks = pack.get("breaks", {}) or {}

    # root
    speak = ET.Element(f"{{{SSML_NS}}}speak", attrib={"version": "1.0"})
    speak.set(f"{{{XML_NS}}}lang", locale)

    voice_el = ET.SubElement(speak, f"{{{SSML_NS}}}voice", attrib={"name": v_id})
    container = voice_el

    # style (mstts:express-as) from cast/variant
    if cast_style:
        attrs = {"style": cast_style}
        if cast_styledeg is not None:
            attrs["styledegree"] = str(cast_styledeg)
        container = ET.SubElement(container, f"{{{MSTTS_NS}}}express-as", attrib=attrs)

    # stylepack prosody
    prosody_attrib = {k: v for k, v in {
        "rate": prosody.get("rate"),
        "pitch": prosody.get("pitch"),
        "volume": prosody.get("volume"),
    }.items() if v}
    if prosody_attrib:
        container = ET.SubElement(container, f"{{{SSML_NS}}}prosody", attrib=prosody_attrib)

    # character deltas (small percent shifts)
    delta = {}
    if rate_pct:
        delta["rate"] = f"{rate_pct:+d}%"
    if pitch_pct:
        delta["pitch"] = f"{pitch_pct:+d}%"
    if delta:
        container = ET.SubElement(container, f"{{{SSML_NS}}}prosody", attrib=delta)

    # paragraphs and optional breaks
    for node in apply_lexicon_and_breaks(segment, breaks=breaks):
        container.append(node)

    # done
    xml_bytes = ET.tostring(speak, encoding="utf-8")
    return xml_bytes.decode("utf-8")

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
    default_voice: str = "es-ES-ElviraNeural",
    dossier_dir: Optional[Path] = None,
    use_variants: bool = True,
    seed: int = 17,
) -> List[Path]:
    """
    Given a plan JSON and chapter text, render one XML file per chunk to out_dir.
    If `use_variants` is True, tries dossier/voices.variants.json to resolve unknown speakers.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    dossier = dossier_dir or Path(".")
    # resolve default narrator voice from config/cast/cli
    default_voice_resolved = resolve_default_voice(dossier, voices_cast, cli_default=default_voice)
    # resolve locale (config → infer from voice → CLI → fallback)
    locale_resolved = resolve_locale(dossier, voices_cast, default_voice_resolved, cli_locale=locale)

    # load variants if requested
    variants = None
    if use_variants:
        var_path = dossier / "voices.variants.json"
        if var_path.exists():
            try:
                variants = read_json(var_path, allow_jsonc=True, label="voices.variants.json")
            except Exception as e:
                raise SSMLRenderError("Failed to read variants", error=str(e), path=str(var_path))

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
        )
        out_path = out_dir / f"{chapter_id}.{chunk_id}.ssml.xml"
        out_path.write_text(xml, encoding="utf-8")
        out_paths.append(out_path)
    return out_paths

# ------------------------------- CLI ----------------------------------

def _main_cli():
    import argparse
    ap = argparse.ArgumentParser(description="Generate SSML XML files per chunk (Azure TTS)")
    ap.add_argument("--plan", required=True, help="Path to plan JSON for chapter")
    ap.add_argument("--text", required=True, help="Path to full chapter text (utf-8)")
    ap.add_argument("--out", required=True, help="Output directory for SSML files")
    ap.add_argument("--dossier", default="dossier", help="Dossier directory (voices.cast.json, voices.variants.json, stylepacks.json, etc)")
    ap.add_argument("--locale", help="xml:lang locale (optional). If omitted, read from dossier config or infer from voice.")
    ap.add_argument("--default-voice", help="Fallback Azure voice id (optional). If omitted, read from dossier config/cast.")
    ap.add_argument("--use-variants", action="store_true", help="Use dossier/voices.variants.json when speaker not in cast")
    ap.add_argument("--seed", type=int, default=17, help="Deterministic seed for variant assignment")
    args = ap.parse_args()

    plan = read_json(Path(args.plan), allow_jsonc=True, label="plan")
    chapter_text = Path(args.text).read_text(encoding="utf-8")

    dossier = Path(args.dossier)
    # cast
    cast_path = dossier / "voices.cast.json"
    voices = read_json(cast_path, allow_jsonc=True, label="voices.cast.json") if cast_path.exists() else {}
    # stylepacks
    sp_path = dossier / "stylepacks.json"
    stylepacks = read_json(sp_path, allow_jsonc=True, label="stylepacks.json") if sp_path.exists() else {"default":{}}
    # lexicons (optional)
    lex_path = dossier / "lexicon.json"
    sens_path = dossier / "pronunciations.sensitive.json"
    lexicon = read_json(lex_path, allow_jsonc=True, label="lexicon.json") if lex_path.exists() else None
    sensitive = read_json(sens_path, allow_jsonc=True, label="pronunciations.sensitive.json") if sens_path.exists() else None

    # resolve defaults using book configuration first
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
