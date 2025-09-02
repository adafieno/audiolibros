# tools/paratext_ssml.py
# -*- coding: utf-8 -*-
"""
Generate SSML for audiobook paratext:
- Book title / subtitle / author
- Per-chapter announcements: "Capítulo N. {title}"

Reads metadata from dossier:
  - book.config.json or book.json  (keys tried: title, subtitle, author, chapters[])
  - voices.cast.json               (to resolve narrator/default voice)
  - ssml.plan/*.plan.json          (fallback source for chapter_id/chapter_title)

Outputs:
  - ssml/interstitials/00_book_title.ssml.xml
  - ssml/interstitials/{chapter_id}.title.ssml.xml
  - ssml/interstitials/manifest.paratext.json

Optional:
  --synthesize → also renders WAV files via azure_client (if available)

CLI:
  python -m tools.paratext_ssml --dossier dossier --ssml-out ssml/interstitials --synthesize --wav-out audio/wav/interstitials
"""
from __future__ import annotations
import json, re, os, sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import xml.etree.ElementTree as ET

# ---------------- XML namespaces ----------------
SSML_NS = "http://www.w3.org/2001/10/synthesis"
MSTTS_NS = "https://www.w3.org/2001/mstts"
XML_NS = "http://www.w3.org/XML/1998/namespace"
ET.register_namespace("", SSML_NS)
ET.register_namespace("mstts", MSTTS_NS)

# -------------- JSON (with // and /* */) --------------
def read_jsonc(p: Path) -> Dict[str, Any]:
    raw = p.read_text(encoding="utf-8")
    raw = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
    raw = re.sub(r"(?m)//.*?$", "", raw)
    return json.loads(raw)

# -------------- Voice & locale resolution --------------
def _lookup_cast_profile(voices_cast: Dict[str, Any], key: str) -> Optional[Dict[str, Any]]:
    if not voices_cast:
        return None
    # map-style
    if isinstance(voices_cast, dict) and "cast" not in voices_cast:
        v = voices_cast.get(key)
        if isinstance(v, dict):
            return v
        # case-insensitive match
        low = key.lower()
        for k, val in voices_cast.items():
            if isinstance(val, dict) and k.lower() == low:
                return val
        # id field
        for val in voices_cast.values():
            if isinstance(val, dict) and val.get("id","").split("::")[-1].lower() == low:
                return val
        return None
    # list-style
    for it in voices_cast.get("cast", []):
        if it.get("character_id") == key:
            return {"voice": it.get("voice_id")}
    return None

def _infer_locale_from_voice_id(voice_id: Optional[str]) -> Optional[str]:
    if not isinstance(voice_id, str):
        return None
    m = re.match(r"^([a-z]{2,3}-[A-Z]{2})-", voice_id)
    return m.group(1) if m else None

def resolve_default_voice(dossier: Path, voices_cast: Dict[str, Any], cli_default: Optional[str] = None) -> str:
    # 1) config files can pin a default narrator
    for fname in ("ssml.config.json", "book.config.json", "book.json", "config.json"):
        p = dossier / fname
        if p.exists():
            cfg = read_jsonc(p)
            dv = cfg.get("default_voice") or cfg.get("narrator_default_voice") or cfg.get("voice")
            if isinstance(dv, str) and "Neural" in dv:
                return dv
            if isinstance(dv, str):
                prof = _lookup_cast_profile(voices_cast, dv) or {}
                if isinstance(prof.get("voice"), str):
                    return prof["voice"]
    # 2) voices.cast.json contains common narrator keys
    for key in ("NARRADOR","Narrador","narrador","Narrator","NARRATOR"):
        prof = _lookup_cast_profile(voices_cast, key)
        if prof and isinstance(prof.get("voice"), str):
            return prof["voice"]
    # 3) CLI override or hard fallback
    if cli_default:
        return cli_default
    return "es-PE-AlexNeural"

def resolve_locale(dossier: Path, voices_cast: Dict[str, Any], default_voice: str, cli_locale: Optional[str] = None) -> str:
    for fname in ("ssml.config.json", "book.config.json", "book.json", "config.json"):
        p = dossier / fname
        if p.exists():
            cfg = read_jsonc(p)
            for k in ("locale","xml_lang","language","lang"):
                v = cfg.get(k)
                if isinstance(v, str) and v.strip():
                    return v.strip()
    loc = _infer_locale_from_voice_id(default_voice)
    if loc:
        return loc
    return cli_locale or "es-PE"

# -------------- SSML helpers (no top-level <break>) --------------
def _begin_speak(locale: str) -> ET.Element:
    speak = ET.Element(f"{{{SSML_NS}}}speak", attrib={"version": "1.0"})
    speak.set(f"{{{XML_NS}}}lang", locale)
    return speak

def _append_voiced(parent: ET.Element, voice_id: str, *, style: Optional[str] = None, styledegree: Optional[float] = None,
                   prosody: Optional[Dict[str,str]] = None) -> ET.Element:
    v = ET.SubElement(parent, f"{{{SSML_NS}}}voice", attrib={"name": voice_id})
    container = v
    if style:
        attrs = {"style": style}
        if styledegree is not None:
            attrs["styledegree"] = str(styledegree)
        container = ET.SubElement(container, f"{{{MSTTS_NS}}}express-as", attrib=attrs)
    if prosody:
        container = ET.SubElement(container, f"{{{SSML_NS}}}prosody", attrib=prosody)
    return container

def _s(text: str) -> ET.Element:
    s = ET.Element(f"{{{SSML_NS}}}s")
    s.text = text
    return s

def _break(container: ET.Element, ms: int) -> None:
    ET.SubElement(container, f"{{{SSML_NS}}}break", attrib={"time": f"{int(ms)}ms"})

# -------------- Metadata discovery --------------
@dataclass
class BookMeta:
    title: str
    subtitle: Optional[str]
    author: Optional[str]

@dataclass
class ChapterMeta:
    id: str
    index: int
    title: Optional[str]

def _load_book_meta(dossier: Path) -> BookMeta:
    for fname in ("book.config.json","book.json"):
        p = dossier / fname
        if p.exists():
            j = read_jsonc(p)
            title = j.get("title") or j.get("book_title") or ""
            subtitle = j.get("subtitle") or j.get("book_subtitle")
            author = j.get("author") or j.get("author_name") or j.get("by")
            if title:
                return BookMeta(title=title, subtitle=subtitle, author=author)
    # fallback minimal
    return BookMeta(title="Título", subtitle=None, author=None)

def _load_chapters(dossier: Path) -> List[ChapterMeta]:
    # 1) book config may contain chapters: [{id, title}, ...]
    for fname in ("book.config.json","book.json"):
        p = dossier / fname
        if p.exists():
            j = read_jsonc(p)
            chs = j.get("chapters") or j.get("toc") or []
            out: List[ChapterMeta] = []
            for i, it in enumerate(chs, start=1):
                if isinstance(it, dict):
                    cid = it.get("id") or it.get("chapter_id") or f"ch{i:02d}"
                    out.append(ChapterMeta(id=str(cid), index=i, title=it.get("title")))
                elif isinstance(it, str):
                    out.append(ChapterMeta(id=f"ch{i:02d}", index=i, title=it))
            if out:
                return out
    # 2) fallback: scan ssml.plan/*.plan.json
    plans_dir = dossier / "ssml.plan"
    if plans_dir.exists():
        plans = sorted(plans_dir.glob("*.plan.json"))
    else:
        plans = []
    out: List[ChapterMeta] = []
    for i, p in enumerate(plans, start=1):
        j = read_jsonc(p)
        cid = j.get("chapter_id") or p.stem.replace(".plan","")
        title = j.get("chapter_title")
        out.append(ChapterMeta(id=str(cid), index=i, title=title))
    return out

# -------------- Builders --------------
def build_book_title_ssml(meta: BookMeta, voice_id: str, locale: str,
                          *, style: Optional[str]=None, styledegree: Optional[float]=None,
                          title_pause_ms: int=800, between_ms: int=300) -> str:
    speak = _begin_speak(locale)
    container = _append_voiced(speak, voice_id, style=style, styledegree=styledegree)
    # Title
    container.append(_s(meta.title))
    _break(container, title_pause_ms)
    # Subtitle if any
    if meta.subtitle:
        container.append(_s(meta.subtitle))
        _break(container, between_ms)
    # Author if any
    if meta.author:
        container.append(_s(f"Por {meta.author}."))
    return ET.tostring(speak, encoding="utf-8").decode("utf-8")

def build_chapter_title_ssml(ch: ChapterMeta, voice_id: str, locale: str,
                             *, style: Optional[str]=None, styledegree: Optional[float]=None,
                             lead_ms: int=300, after_ms: int=300) -> str:
    speak = _begin_speak(locale)
    container = _append_voiced(speak, voice_id, style=style, styledegree=styledegree)
    # "Capítulo N." (neutral; you can localize this)
    container.append(_s(f"Capítulo {ch.index}."))
    _break(container, lead_ms)
    # Title (if any)
    if ch.title:
        container.append(_s(ch.title))
        _break(container, after_ms)
    return ET.tostring(speak, encoding="utf-8").decode("utf-8")

# -------------- Main API --------------
def generate_paratext(dossier_dir: Path, ssml_out: Path,
                      *, narrator_voice: Optional[str]=None, locale: Optional[str]=None,
                      style: Optional[str]=None, styledegree: Optional[float]=None) -> Dict[str, Any]:
    dossier = Path(dossier_dir)
    ssml_out = Path(ssml_out); ssml_out.mkdir(parents=True, exist_ok=True)

    # voices.cast.json (optional but recommended)
    cast_path = dossier / "voices.cast.json"
    voices_cast = read_jsonc(cast_path) if cast_path.exists() else {}

    # narrator + locale
    default_voice = resolve_default_voice(dossier, voices_cast, cli_default=narrator_voice)
    xml_lang = resolve_locale(dossier, voices_cast, default_voice, cli_locale=locale)

    # meta + chapters
    meta = _load_book_meta(dossier)
    chapters = _load_chapters(dossier)

    # emit book title ssml
    title_xml = build_book_title_ssml(meta, default_voice, xml_lang, style=style, styledegree=styledegree)
    title_path = ssml_out / "00_book_title.ssml.xml"
    title_path.write_text(title_xml, encoding="utf-8")

    # emit chapter titles
    chapter_paths: List[Tuple[str, str]] = []
    for ch in chapters:
        xml = build_chapter_title_ssml(ch, default_voice, xml_lang, style=style, styledegree=styledegree)
        outp = ssml_out / f"{ch.id}.title.ssml.xml"
        outp.write_text(xml, encoding="utf-8")
        chapter_paths.append((ch.id, str(outp)))

    manifest = {
        "narrator_voice": default_voice,
        "xml_lang": xml_lang,
        "book": {"title": meta.title, "subtitle": meta.subtitle, "author": meta.author},
        "paths": {
            "book_title": str(title_path),
            "chapter_titles": [{"id": cid, "ssml": path} for cid, path in chapter_paths],
        },
    }
    (ssml_out / "manifest.paratext.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest

# -------------- Optional synthesis --------------
def synthesize_with_azure(manifest: Dict[str, Any], wav_out_dir: Path,
                          *, workers: int = 4, sidecar: bool = True) -> List[str]:
    try:
        # lazy import to keep this file standalone if tts client isn't present
        from tts.azure_client import batch_synthesize
    except Exception:
        print("⚠️ Azure client not available. Skip synthesis.", file=sys.stderr)
        return []

    wav_out_dir = Path(wav_out_dir); wav_out_dir.mkdir(parents=True, exist_ok=True)
    items: List[Tuple[Path, Path]] = []

    mpaths = manifest["paths"]
    # book title
    title_xml = Path(mpaths["book_title"])
    title_wav = wav_out_dir / Path(title_xml.name).with_suffix("").with_suffix(".wav")
    items.append((title_xml, title_wav))
    # chapter titles
    for ent in mpaths["chapter_titles"]:
        ssml = Path(ent["ssml"])
        wav = wav_out_dir / Path(ssml.name).with_suffix("").with_suffix(".wav")
        items.append((ssml, wav))

    outs = batch_synthesize(items, max_workers=workers, write_sidecar_json=sidecar)
    return [str(p) for p in outs]

# -------------- CLI --------------
def _main_cli():
    import argparse
    ap = argparse.ArgumentParser(description="Generate SSML for book/chapters titles from dossier metadata.")
    ap.add_argument("--dossier", default="dossier", help="Dossier folder (book.config.json, voices.cast.json, ssml.plan/)")
    ap.add_argument("--ssml-out", default="ssml/interstitials", help="Where to write SSML outputs")
    ap.add_argument("--voice", help="Override narrator voice (Azure voice id)")
    ap.add_argument("--locale", help="Override xml:lang (e.g., es-PE)")
    ap.add_argument("--style", help="Optional mstts:express-as style (use only if supported by your voice)")
    ap.add_argument("--styledegree", type=float, help="Optional styledegree (0.0–2.0)")
    ap.add_argument("--synthesize", action="store_true", help="Also synthesize WAV files with Azure")
    ap.add_argument("--wav-out", default="audio/wav/interstitials", help="Where to write WAVs (when --synthesize)")
    ap.add_argument("--workers", type=int, default=4, help="Azure synthesis parallelism")
    args = ap.parse_args()

    dossier = Path(args.dossier)
    ssml_out = Path(args.ssml_out)

    manifest = generate_paratext(
        dossier, ssml_out,
        narrator_voice=args.voice,
        locale=args.locale,
        style=args.style,
        styledegree=args.styledegree,
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))

    if args.synthesize:
        outs = synthesize_with_azure(manifest, Path(args.wav_out), workers=args.workers, sidecar=True)
        print("\n".join(outs))

if __name__ == "__main__":
    _main_cli()
