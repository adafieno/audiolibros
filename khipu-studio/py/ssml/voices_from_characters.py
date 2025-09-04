# ssml/voices_from_characters_llm.py
# -*- coding: utf-8 -*-
"""
Derive book-specific voice casting from dossier/characters.json using your unified LLM client,
match against dossier/voice_inventory.json, and emit dossier/voices.cast.json + dossier/voices.variants.json.

Inputs (default locations under --book-root):
  - dossier/characters.json
  - dossier/voice_inventory.json
  - dossier/voice.features.json  (optional; if missing, falls back to config/voice.features.json)

Outputs (under dossier/):
  - voices.cast.json
  - voices.variants.json
  - voices.derivation.log
  - .cache/llm_char_traits.cache.json   (LLM trait classification cache keyed by characters.json hash)

Notes
- No hardcoded voice SKUs: the inventory is entirely book-owned (dossier/voice_inventory.json).
- LLM is only used to infer neutral traits per character (gender/age/register/energy/accent/default_style, and tiny prosody nudges).
- Voice selection is deterministic and auditable (scoring + stable hashing + least-used tie-break).
"""

from __future__ import annotations
import json
import hashlib
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import os, sys


_pkg_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _pkg_root not in sys.path:
    sys.path.insert(0, _pkg_root)


# --- import your unified client (support both module layouts) ---
try:
    # Preferred package-style import (if placed under llm/client.py)
    from dossier.client import chat_json  # type: ignore
except Exception:
    # Fallback to local file (client.py at repo root)
    from dossier.client import chat_json  # type: ignore

# Long-form safe guardrails (keep voices distinct but intelligible)
SAFE = {
    "rate_min": -12, "rate_max": 8,
    "pitch_min": -8, "pitch_max": 6,
    "styledegree_min": 0.3, "styledegree_max": 0.9
}

# ----------------------------- small utils -----------------------------

def _sha(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()

def _read_json(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))

def _write_json(p: Path, obj: dict) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))

def _stable_index(key: str, n: int, seed: int = 17) -> int:
    h = hashlib.sha1((str(seed) + "|" + key).encode("utf-8")).hexdigest()
    return int(h[:8], 16) % max(1, n)

# ------------------------- scoring & validation -------------------------

def _style_supported(voice_id: str, style: Optional[str], features: dict, inventory_voices: List[dict]) -> bool:
    """Check if a style is supported by voice (prefer dossier/voice.features.json; otherwise inventory.styles)."""
    if not style or style == "none":
        return True
    supported = set((features.get(voice_id) or {}).get("styles", []))
    if not supported:
        v = next((v for v in inventory_voices if v.get("id") == voice_id), None)
        supported = set((v or {}).get("styles", []))
    return style in supported

def _score_voice(v: dict, t: dict, lang: str, features: dict) -> int:
    """Heuristic scoring to match character traits to an inventory voice."""
    s = 0
    if t.get("gender") != "U" and v.get("gender") == t.get("gender"):
        s += 3
    if v.get("age_hint") == t.get("age_range"):
        s += 2
    if t.get("accent_hint") and t["accent_hint"] in (v.get("accent_tags") or []):
        s += 3
    if _style_supported(v.get("id", ""), t.get("default_style"), features, []):
        s += 2
    if v.get("locale", "").startswith(lang):
        s += 1
    return s

# ------------------------- main derivation API --------------------------

def derive_cast_with_llm(
    book_root: Path,
    lang: str = "es",
    *,
    dossier_dir: Optional[Path] = None,
    seed: int = 17,
    inventory_path: Optional[Path] = None,
    features_path: Optional[Path] = None,
    cache_path: Optional[Path] = None,
) -> Tuple[Path, Path, Path]:
    """
    Derive dossier/voices.cast.json and dossier/voices.variants.json from dossier/characters.json
    using your unified LLM client and dossier/voice_inventory.json.

    Returns: (cast_path, variants_path, log_path)
    """
    dossier = dossier_dir or (book_root / "dossier")
    chars_p = dossier / "characters.json"
    if not chars_p.exists():
        raise SystemExit(f"Missing {chars_p}")

    inv_p = inventory_path or (dossier / "voice_inventory.json")
    if not inv_p.exists():
        raise SystemExit(f"Missing voice inventory file: {inv_p}")

    # features: prefer dossier/voice.features.json, then config/voice.features.json
    if features_path:
        features_p = features_path
    else:
        candidate = dossier / "voice.features.json"
        features_p = candidate if candidate.exists() else (book_root / "config/voice.features.json")
    features = _read_json(features_p) if (features_p and features_p.exists()) else {}

    # load characters
    characters_doc = _read_json(chars_p)
    charlist: List[dict] = characters_doc.get("characters") or []
    if not charlist:
        raise SystemExit("characters.json has no 'characters' array.")

    # --- LLM trait classification (cached) ---
    ch_json_str = json.dumps(charlist, ensure_ascii=False, sort_keys=True)
    cache_key = _sha(ch_json_str)  # model-independent cache key
    cache_p = cache_path or (dossier / ".cache/llm_char_traits.cache.json")
    traits_map: Dict[str, dict] = {}
    if cache_p.exists():
        try:
            cached = _read_json(cache_p)
            if cached.get("cache_key") == cache_key:
                traits_map = cached.get("traits_map", {})
        except Exception:
            traits_map = {}

    if not traits_map:
        system = (
            "Eres un etiquetador para casting de voces de audiolibros. "
            "Devuelve SOLO JSON válido con la clave 'characters' = lista."
        )
        schema_hint = {
            "characters": [{
                "id": "string",
                "display_name": "string",
                "gender": "F|M|U",
                "age_range": "child|teen|young_adult|adult|senior",
                "accent_hint": "none|peru|ecuador|mexico|us_latam|bolivia|spain|regional_other",
                "register": "formal|neutral|colloquial",
                "energy": "low|medium|high",
                "default_style": "serious|empathetic|narration-relaxed|hopeful|calm|none",
                "styledegree": 0.6,
                "rate_pct": 0,
                "pitch_pct": 0,
                "notes": ""
            }]}
        user = (
            "A partir de este JSON de personajes, infiere rasgos neutrales y explicables. "
            "Usa 'U' si el género no es claro. Mantén rate/pitch pequeños (−4..+4). "
            "Elige default_style SOLO de {serious, empathetic, narration-relaxed, hopeful, calm, none}. "
            "RESPONDE EXACTAMENTE en el esquema indicado.\n\n"
            f"CHARACTERS_JSON:\n{json.dumps(charlist, ensure_ascii=False)}\n\n"
            f"SCHEMA_HINT:\n{json.dumps(schema_hint, ensure_ascii=False)}"
        )
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ]
        # Your unified client handles model selection & temperature internally.
        result = chat_json(messages, strict=True)  # -> dict
        traits_map = { (c.get("display_name") or c.get("id")): c for c in result.get("characters", []) }
        _write_json(cache_p, {"cache_key": cache_key, "traits_map": traits_map})

    # --- load inventory & match voices deterministically ---
    inventory = _read_json(inv_p)
    voices: List[dict] = inventory.get("voices") or []
    if not voices:
        raise SystemExit(f"{inv_p} has no 'voices' array.")

    assignments: Dict[str, dict] = {}
    usage: Dict[str, int] = {}

    for ch in charlist:
        name = ch.get("display_name") or ch.get("id")
        traits = traits_map.get(name) or {
            "gender": "U",
            "age_range": "adult",
            "accent_hint": "none",
            "register": "neutral",
            "energy": "medium",
            "default_style": "none",
            "styledegree": 0.6,
            "rate_pct": 0,
            "pitch_pct": 0
        }

        ranked = sorted(
            voices,
            key=lambda v: (
                -_score_voice(v, traits, lang, features),
                usage.get(v["id"], 0),
                _stable_index(name + v["id"], 10, seed)
            )
        )
        best = ranked[0]
        usage[best["id"]] = usage.get(best["id"], 0) + 1

        # clamp & validate prosody/style
        rate = int(_clamp(traits.get("rate_pct", 0), SAFE["rate_min"], SAFE["rate_max"]))
        pitch = int(_clamp(traits.get("pitch_pct", 0), SAFE["pitch_min"], SAFE["pitch_max"]))
        degree = float(_clamp(traits.get("styledegree", 0.6), SAFE["styledegree_min"], SAFE["styledegree_max"]))
        style = traits.get("default_style")
        if not _style_supported(best["id"], style, features, voices):
            style = None

        assignments[name] = {
            "id": f"principal::{ch.get('id') or name}",
            "voice": best["id"],
            "style": None if style in (None, "none") else style,
            "styledegree": round(degree, 2),
            "rate_pct": rate,
            "pitch_pct": pitch,
            "_traits": traits
        }

    # variants: voices not used by principals (for minors/extras; neutral baseline)
    used_ids = {a["voice"] for a in assignments.values()}
    leftovers = [v for v in voices if v["id"] not in used_ids]
    variants = {
        "pools": {
            "neutral_any": [
                {
                    "id": f"var::{v['id']}",
                    "voice": v["id"],
                    "style": None,
                    "styledegree": 0.0,
                    "rate_pct": 0,
                    "pitch_pct": 0,
                    "tags": ["auto", "neutral"]
                } for v in leftovers
            ]
        },
        "policy": {
            "default_pool": "neutral_any",
            "assignment": {
                "hash_seed": seed,
                "reuse_strategy": "sticky",
                "max_reuse_per_chapter": 4,
                "min_scene_gap_sec": 30
            },
            "routing_rules": [],
            "safety": {
                "rate_bounds_pct": [SAFE["rate_min"], SAFE["rate_max"]],
                "pitch_bounds_pct": [SAFE["pitch_min"], SAFE["pitch_max"]],
                "allow_styles_for_long_spans": ["serious", "empathetic", "narration-relaxed", "hopeful", "calm"],
                "short_span_styles_only": ["shouting", "terrified", "angry", "whispering"]
            }
        }
    }

    # write artifacts to dossier/
    cast_p = dossier / "voices.cast.json"
    var_p = dossier / "voices.variants.json"
    log_p = dossier / "voices.derivation.log"
    _write_json(cast_p, assignments)
    _write_json(var_p, variants)
    _write_json(log_p, {
        "inventory": str(inv_p),
        "features": (str(features_p) if features else None),
        "cache_key": cache_key,
        "notes": "Traits by LLM via unified client; deterministic matcher picked voices from dossier/voice_inventory.json."
    })
    return cast_p, var_p, log_p

# -------------------------------- CLI ---------------------------------

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(
        description="Derive dossier/voices.cast.json & voices.variants.json from dossier/characters.json "
                    "using unified LLM client + dossier/voice_inventory.json"
    )
    ap.add_argument("--book-root", required=True, help="Project root (contains dossier/)")
    ap.add_argument("--lang", default="es", help="Language family for preference scoring (e.g., es, pt, en)")
    ap.add_argument("--dossier-dir", help="Override dossier directory (default: <book-root>/dossier)")
    ap.add_argument("--seed", type=int, default=17)
    ap.add_argument("--inventory", help="Explicit path to voice inventory JSON (default: dossier/voice_inventory.json)")
    ap.add_argument("--features", help="Explicit path to voice.features.json (default: dossier/, then config/)")
    ap.add_argument("--cache", help="Explicit path to trait cache (default: dossier/.cache/llm_char_traits.cache.json)")
    args = ap.parse_args()

    root = Path(args.book_root)
    dossier_dir = Path(args.dossier_dir) if args.dossier_dir else (root / "dossier")

    derive_cast_with_llm(
        root,
        lang=args.lang,
        dossier_dir=dossier_dir,
        seed=args.seed,
        inventory_path=(Path(args.inventory) if args.inventory else None),
        features_path=(Path(args.features) if args.features else None),
        cache_path=(Path(args.cache) if args.cache else None),
    )
