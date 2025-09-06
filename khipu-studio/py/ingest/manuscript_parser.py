#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Khipu Studio - Manuscript parser (non-LLM, no keywords)

Parses a .docx (or .txt) manuscript into:
  - analysis/chapters_txt/chXX.txt
  - dossier/narrative.structure.json

Heuristics (no “Capítulo/Chapter” keywords):
  1) DOCX Heading-1 style (robust matcher for localized/variant names)
  2) Spanish-friendly “titleish” line (short, no terminal punctuation, content-words capitalized)
  3) Numeral-only line (e.g., “III”, “12”)

A block starts a chapter when any 2 of those 3 signals fire.
"""

from __future__ import annotations
import argparse, json, os, re, sys, traceback
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from pathlib import Path
import json

def _load_effective_config(project_root: Optional[Path], cfg_json_path: Optional[Path]) -> dict:
    eff: dict = {}
    # optional JSON blob handed in by the app (temp file)
    if cfg_json_path and cfg_json_path.is_file():
        try:
            eff.update(json.loads(cfg_json_path.read_text(encoding="utf-8")))
        except Exception:
            pass
    # optional project root (you might later read project.khipu.json here)
    if project_root:
        pj = project_root / "project.khipu.json"
        try:
            if pj.is_file():
                eff.setdefault("project", {})
                eff["project"].update(json.loads(pj.read_text(encoding="utf-8")))
        except Exception:
            pass
    return eff


# ----------------------------- Logging (JSONL) -----------------------------

def jlog(event: str, **kw: Any) -> None:
    obj = {"event": event}
    obj.update(kw)
    print(json.dumps(obj, ensure_ascii=False), flush=True)

def fail(code: int, msg: str) -> int:
    jlog("error", note=msg)
    return code

# ----------------------------- Utilities ----------------------------------

_SP_STOPWORDS = {"a","al","de","del","la","las","el","los","y","o","en","con","por","para",
                 "un","una","uno","unos","unas","que","se","e"}

RE_ROMAN = re.compile(
    r"^(?=[IVXLCDM]+$)I{0,3}(?:IV|VI{0,3}|IX|X{0,3})(?:L|XL|LX|XC|C{0,3})(?:D|CD|DC|CM|M{0,4})$",
    re.IGNORECASE,
)

def _strip_bom(s: str) -> str:
    return s.lstrip("\ufeff").strip()

def _safe_read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")

# ----------------------------- DOCX loader --------------------------------

def _require_python_docx():
    try:
        import docx  # python-docx
        return docx
    except Exception as e:
        raise SystemExit("Falta 'python-docx'. Instala: pip install python-docx") from e

def _is_h1_style(style_name: Optional[str]) -> bool:
    """
    Robust detector for Heading 1 variants (localized/Char-style forms).
    """
    if not style_name:
        return False
    s = style_name.strip().lower()
    # normalize diacritics for matching
    s = (s.replace("í","i").replace("ú","u").replace("ó","o")
           .replace("é","e").replace("á","a").replace("ñ","n"))

    # explicit matches
    if re.search(r"\bheading\s*1\b", s): return True
    if re.search(r"\btitulo\s*1\b", s):  return True
    if re.search(r"\btitle\s*1\b", s):   return True
    if re.search(r"\btitre\s*1\b", s):   return True
    if re.search(r"\bcapitulo\s*1\b", s):return True

    # character-style variants (e.g., “… 1 char/car”)
    if ("1" in s) and any(k in s for k in ["heading","titulo","title","titre","capitulo"]):
        return True

    # generic “top heading” names sometimes used by templates
    if s in ("heading", "titulo", "title", "titre", "capitulo"):
        return True

    return False

def _paragraphs_from_docx(infile: Path) -> List[Tuple[str, str, Dict[str, bool]]]:
    """
    Returns list of (text, style_name, fmt_flags) for each paragraph.
    fmt_flags: {'has_bold': bool, 'all_caps': bool, 'center': bool}
    Empty paragraphs are preserved with empty text.
    """
    docx = _require_python_docx()
    doc = docx.Document(str(infile))
    out: List[Tuple[str, str, Dict[str, bool]]] = []

    for p in doc.paragraphs:
        t = _strip_bom(p.text or "")
        style = ""
        try:
            style = getattr(p.style, "name", "") or ""
        except Exception:
            style = ""

        # light typography hints
        has_bold = False
        all_caps = False
        for r in p.runs:
            try:
                if r.bold:
                    has_bold = True
                if r.text and r.text.isupper():
                    all_caps = True
            except Exception:
                pass
        center = False
        try:
            align = getattr(getattr(p, "paragraph_format", None), "alignment", None)
            # 1 == CENTER in python-docx, but compare by name if available
            center = (str(align).endswith(".CENTER") or align == 1)
        except Exception:
            pass

        out.append((t, style, {"has_bold": has_bold, "all_caps": all_caps, "center": bool(center)}))

    return out

# ----------------------------- TXT loader ---------------------------------

def _blocks_from_txt(path: Path) -> List[str]:
    raw = _safe_read(path)
    blocks = [b.strip() for b in re.split(r"\n{2,}", raw) if b.strip()]
    return blocks

# ----------------------------- Block builder ------------------------------

@dataclass
class Block:
    text: str
    first_style: str
    fmt: Dict[str, bool]  # from first paragraph
    start_para: int
    end_para: int

def _build_blocks_from_docx(paras: List[Tuple[str, str, Dict[str, bool]]]) -> List[Block]:
    """
    Group paragraphs into blocks:
      - split on blank paragraphs
      - ALSO start a new block whenever we hit a paragraph with H1-style
        (even if there wasn't a preceding blank line), so we don't swallow headings.
    The 'first paragraph' metadata is captured per block.
    """
    blocks: List[Block] = []
    i = 0
    n = len(paras)
    while i < n:
        t, style, fmt = paras[i]
        if t == "":
            i += 1
            continue

        # If this is an H1-style, skip any consecutive H1-style paragraphs (only treat the first as a boundary)
        if _is_h1_style(style):
            # Find the end of the run of consecutive H1-style paragraphs
            j = i + 1
            while j < n and _is_h1_style(paras[j][1]):
                j += 1
            # The block is just the first H1 paragraph (chapter title)
            block_text = paras[i][0].strip()
            blocks.append(Block(text=block_text, first_style=style, fmt=fmt, start_para=i, end_para=i))
            i = j
            continue

        # Start a new block at i (normal logic)
        j = i + 1
        while j < n:
            tj, sj, _ = paras[j]
            if tj == "":
                # natural block boundary
                break
            # force a new block if the next paragraph is an H1-style
            # (so the current block ends before the next heading)
            if _is_h1_style(sj):
                break
            j += 1

        block_text = "\n".join([paras[k][0] for k in range(i, j)]).strip()
        blocks.append(Block(text=block_text, first_style=style, fmt=fmt, start_para=i, end_para=j - 1))
        i = j + 1 if j < n and paras[j][0] == "" else j  # skip the blank separator if present

    return blocks

def _build_blocks_from_txt(blocks_text: List[str]) -> List[Block]:
    blocks: List[Block] = []
    for idx, b in enumerate(blocks_text):
        blocks.append(Block(text=b, first_style="", fmt={"has_bold": False, "all_caps": b.isupper(), "center": False},
                            start_para=idx, end_para=idx))
    return blocks

# ----------------------- Keyword-free title heuristic ---------------------

def _is_probable_title(line: str) -> bool:
    s = (line or "").strip()

    if not s or len(s) > 80:
        return False
    # reject sentence-like lines
    if s.endswith((".", "…", "?", "!", ":", ";")):
        return False

    # numeral-only: arabic or roman (e.g., "III", "12")
    if re.fullmatch(r"\d{1,3}", s):
        return True
    if RE_ROMAN.fullmatch(s):
        return True

    # ALL CAPS short lines are often headings
    if s.isupper() and len(s) >= 3:
        return True

    words = re.findall(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+", s)
    if not words:
        return False

    def is_capitalized(w: str) -> bool:
        return w[:1].isupper()

    content = [w for w in words if w.lower() not in _SP_STOPWORDS]
    caps = sum(1 for w in content if is_capitalized(w))
    # Most content words capitalized OR short “First & Last” capitalized
    if content and (caps / max(1, len(content)) >= 0.6):
        return True
    if len(words) <= 5 and is_capitalized(words[0]) and is_capitalized(words[-1]):
        return True

    return False

# ----------------------- Scoring & boundary decision ----------------------

@dataclass
class Chapter:
    title: str
    text: str
    start_block: int
    end_block: int

def _signals_for_block(b: Block) -> Tuple[bool, bool, bool]:
    """
    Returns (is_h1_style, is_titleish, is_numeral_only)
    """
    first_line = b.text.splitlines()[0] if b.text else ""
    is_h1 = _is_h1_style(b.first_style)
    is_title = _is_probable_title(first_line)
    is_num = bool(re.fullmatch(r"\d{1,3}", first_line) or RE_ROMAN.fullmatch(first_line))
    return (is_h1, is_title, is_num)

def _choose_boundaries(blocks: List[Block]) -> List[int]:
    """
    Pick chapter-start block indexes. Use consensus: any 2 of the 3 signals.
    Also enforce minimum gap between starts to avoid jitter (>= 1 block).
    """
    # Force a chapter boundary at every H1-style block
    starts: List[int] = [i for i, b in enumerate(blocks) if _is_h1_style(b.first_style)]
    if not starts:
        # fallback: original consensus logic
        last_start = -999
        for i, b in enumerate(blocks):
            s_h1, s_title, s_num = _signals_for_block(b)
            score = int(s_h1) + int(s_title) + int(s_num)
            if score >= 2 and i > last_start:
                starts.append(i)
                last_start = i
        if not starts:
            for i, b in enumerate(blocks):
                s_h1, s_title, s_num = _signals_for_block(b)
                if s_h1 or s_title or s_num:
                    starts.append(i)
            starts = sorted(set(starts))
    if starts and starts[0] != 0:
        # if first block looks like front-matter, keep as preface unless it's very short, else prepend 0
        pass
    return sorted(starts)

def _chapters_from_blocks(blocks: List[Block], min_words: int) -> List[Chapter]:
    starts = _choose_boundaries(blocks)
    if not starts:
        # single chapter fallback
        return [Chapter(title="Inicio", text="\n\n".join(b.text for b in blocks).strip(), start_block=0, end_block=len(blocks)-1)]

    chapters: List[Chapter] = []
    for idx, s in enumerate(starts):
        e = (starts[idx + 1] - 1) if idx + 1 < len(starts) else len(blocks) - 1
        chunk = blocks[s:e+1]
        text = "\n\n".join(b.text for b in chunk).strip()
        title = (chunk[0].text.splitlines()[0] if chunk and chunk[0].text else f"Capítulo {len(chapters)+1}").strip()
        chapters.append(Chapter(title=title, text=text, start_block=s, end_block=e))

    # Merge too-short chapters forward
    def _word_count(s: str) -> int:
        return len(re.findall(r"\w+", s, flags=re.UNICODE))

    merged: List[Chapter] = []
    i = 0
    while i < len(chapters):
        ch = chapters[i]
        if _word_count(ch.text) < min_words and i + 1 < len(chapters):
            nxt = chapters[i+1]
            merged_text = (ch.text + "\n\n" + nxt.text).strip()
            merged.append(Chapter(title=ch.title, text=merged_text, start_block=ch.start_block, end_block=nxt.end_block))
            i += 2
        else:
            merged.append(ch)
            i += 1

    return merged

# ----------------------------- I/O helpers --------------------------------

def _ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)

def _write_chapters(out_dir: Path, chapters: List[Chapter]) -> List[str]:
    _ensure_dir(out_dir)
    out_paths: List[str] = []
    for i, ch in enumerate(chapters, start=1):
        name = f"ch{i:02d}.txt"
        dst = out_dir / name
        dst.write_text(ch.text, encoding="utf-8")
        out_paths.append(str(dst))
    return out_paths

def _write_structure(out_json: Path, chapters: List[Chapter]) -> None:
    _ensure_dir(out_json.parent)
    items = []
    for i, ch in enumerate(chapters, start=1):
        words = len(re.findall(r"\w+", ch.text, flags=re.UNICODE))
        items.append({
            "id": f"ch{i:02d}",
            "title": ch.title,
            "words": words,
            "start_block": ch.start_block,
            "end_block": ch.end_block,
            "file": f"analysis/chapters_txt/ch{i:02d}.txt",
        })
    payload = {
        "chapters": items,
        "total_words": sum(it["words"] for it in items),
        "count": len(items),
        "version": 1,
    }
    out_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

# ------------------------------- CLI --------------------------------------

def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Parse manuscript into chapters & structure (no LLM, no keywords).")
    ap.add_argument("--in", dest="infile", required=True, help="Input file (.docx or .txt)")
    ap.add_argument("--out-chapters", dest="out_chapters", required=True, help="Output dir for chXX.txt")
    ap.add_argument("--out-structure", dest="out_structure", required=True, help="Output JSON (narrative.structure.json)")
    ap.add_argument("--min-words", dest="min_words", type=int, default=300, help="Min words per chapter (merge tiny ones)")
    ap.add_argument("--project-root", dest="project_root", default=None, help="(opcional) Raíz del proyecto Khipu; usado para leer config si se desea")
    ap.add_argument("--config-json", dest="config_json", default=None, help="(opcional) Ruta a un JSON temporal con opciones efectivas")
    args = ap.parse_args(argv)

    try:
        src = Path(args.infile)
        out_dir = Path(args.out_chapters)
        out_json = Path(args.out_structure)
        jlog("start", infile=str(src))

        if not src.exists():
            return fail(2, f"No existe el archivo de entrada: {src}")

        if src.suffix.lower() == ".docx":
            paras = _paragraphs_from_docx(src)
            blocks = _build_blocks_from_docx(paras)
        else:
            blocks_txt = _blocks_from_txt(src)
            blocks = _build_blocks_from_txt(blocks_txt)

        jlog("progress", note=f"Bloques leídos: {len(blocks)}")
        chapters = _chapters_from_blocks(blocks, args.min_words)
        jlog("progress", note=f"Capítulos detectados: {len(chapters)}")

        out_paths = _write_chapters(out_dir, chapters)
        _write_structure(out_json, chapters)
        jlog("done", ok=True, chapters=len(chapters), files=out_paths, structure=str(out_json))
        return 0

    except SystemExit as se:
        # propagated dependency error (e.g., python-docx)
        jlog("error", note=str(se))
        return int(getattr(se, "code", 1) or 1)
    except Exception:
        jlog("error", note="Excepción no controlada", detail=traceback.format_exc())
        return 1

if __name__ == "__main__":
    sys.exit(main())
