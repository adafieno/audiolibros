# tools/stitch_playlist.py
# -*- coding: utf-8 -*-
"""
Build a stitch playlist that auto-inserts paratext (book title & per-chapter slates).

Inputs
- dossier/
    - book.config.json or book.json (title/author/chapters order, optional)
    - ssml.plan/*.plan.json (fallback for chapter order & chunk order)
    - ssml/interstitials/manifest.paratext.json (from tools/paratext_ssml.py)
- audio/wav/                        (chapter content WAVs)
- audio/wav/interstitials/          (paratext WAVs, if synthesized)

Outputs
- stitch/playlist.json         (canonical JSON plan)
- stitch/playlist.m3u8         (simple playback)
- stitch/playlist.ffconcat     (ffmpeg concat demuxer)
- audio/wav/_silence/*.wav     (generated silence files, if --emit-silence)

Usage
  python -m tools.stitch_playlist \
    --dossier dossier \
    --audio-dir audio/wav \
    --out-dir stitch \
    --paratext-manifest ssml/interstitials/manifest.paratext.json \
    --insert-gaps 300 \
    --emit-silence
"""
from __future__ import annotations
import json, re, os, sys, hashlib, wave, contextlib, struct
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# -------------- JSON with // and /* ... */ --------------
def read_jsonc(p: Path) -> Dict[str, Any]:
    raw = p.read_text(encoding="utf-8")
    raw = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
    raw = re.sub(r"(?m)//.*?$", "", raw)
    return json.loads(raw)

# -------------- WAV duration helper --------------
def wav_duration_ms(path: Path) -> Optional[int]:
    try:
        with contextlib.closing(wave.open(str(path), "rb")) as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            if rate <= 0: return None
            return int(round(frames * 1000.0 / rate))
    except Exception:
        return None

# -------------- Silence WAV generator (PCM16 mono by default) --------------
def ensure_silence_wav(out_dir: Path, ms: int, *, sr: int = 44100, ch: int = 1, bit: int = 16) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    key = f"silence_{sr}_{ch}_{bit}_{ms}ms"
    name = hashlib.sha1(key.encode("utf-8")).hexdigest()[:12] + f"_{ms}ms.wav"
    outp = out_dir / name
    if outp.exists():
        return outp
    n_samples = int(round(sr * (ms / 1000.0)))
    sampwidth = 2 if bit == 16 else (3 if bit == 24 else 1)
    silence_frame = b"\x00" * sampwidth * ch
    with contextlib.closing(wave.open(str(outp), "wb")) as wf:
        wf.setnchannels(ch)
        wf.setsampwidth(sampwidth)
        wf.setframerate(sr)
        wf.writeframes(silence_frame * n_samples)
    return outp

# -------------- Model --------------
@dataclass
class Track:
    kind: str           # "book_title" | "chapter_title" | "content" | "silence"
    chapter_id: str     # "" for book_title
    path: str
    duration_ms: Optional[int] = None
    gap_after_ms: int = 0
    gain_db: float = 0.0

@dataclass
class StitchPlan:
    book_title: Optional[str]
    author: Optional[str]
    order: List[str]                # ordered chapter IDs
    tracks: List[Track]             # in playback order

    def to_dict(self) -> Dict[str, Any]:
        return {
            "book_title": self.book_title,
            "author": self.author,
            "order": self.order,
            "tracks": [asdict(t) for t in self.tracks],
        }

# -------------- Discovery --------------
def load_book_meta(dossier: Path) -> Tuple[Optional[str], Optional[str]]:
    for fname in ("book.config.json","book.json"):
        p = dossier / fname
        if p.exists():
            j = read_jsonc(p)
            return (j.get("title") or j.get("book_title"), j.get("author") or j.get("author_name"))
    return (None, None)

def discover_chapter_order(dossier: Path) -> List[str]:
    # Prefer explicit order in book config
    for fname in ("book.config.json","book.json"):
        p = dossier / fname
        if p.exists():
            j = read_jsonc(p)
            chapters = j.get("chapters") or j.get("toc")
            if isinstance(chapters, list) and chapters:
                out: List[str] = []
                for i, it in enumerate(chapters, start=1):
                    if isinstance(it, dict):
                        cid = it.get("id") or it.get("chapter_id") or f"ch{i:02d}"
                    else:
                        cid = str(it)
                    out.append(str(cid))
                return out
    # Fallback: read plan files in ssml.plan/
    plan_dir = dossier / "ssml.plan"
    plans = sorted(plan_dir.glob("*.plan.json")) if plan_dir.exists() else []
    ids: List[str] = []
    for p in plans:
        j = read_jsonc(p)
        cid = j.get("chapter_id") or p.stem.replace(".plan","")
        ids.append(str(cid))
    return ids

def load_plan_chunks(dossier: Path, chapter_id: str) -> List[str]:
    """
    Return chunk_ids for a chapter in order, from ssml.plan/<chapter>.plan.json.
    chunk_id defaults to "{start_char}_{end_char}" if not provided.
    """
    p = dossier / "ssml.plan" / f"{chapter_id}.plan.json"
    if not p.exists():
        return []
    j = read_jsonc(p)
    out: List[str] = []
    for ch in j.get("chunks", []):
        cid = ch.get("id")
        if not cid:
            sc = ch.get("start_char"); ec = ch.get("end_char")
            cid = f"{sc}_{ec}"
        out.append(str(cid))
    return out

def find_content_wavs(audio_dir: Path, chapter_id: str, chunk_order: List[str]) -> List[Path]:
    """
    Content WAVs are expected as: audio_dir/{chapter_id}.{chunk_id}.wav
    We'll honor plan chunk order; any extra matching files will be appended sorted.
    """
    candidates = {cid: audio_dir / f"{chapter_id}.{cid}.wav" for cid in chunk_order}
    out: List[Path] = []
    for cid in chunk_order:
        fp = candidates.get(cid)
        if fp and fp.exists():
            out.append(fp)

    # pick up any stray files that match 'chapter_id.*.wav' and weren't in plan
    globbed = sorted(audio_dir.glob(f"{chapter_id}.*.wav"))
    seen = {p.name for p in out}
    for p in globbed:
        if p.name not in seen:
            out.append(p)
    return out

def load_paratext_manifest(path: Path) -> Dict[str, Any]:
    return read_jsonc(path)

# -------------- Builders --------------
def build_stitch_plan(
    dossier: Path,
    audio_dir: Path,
    paratext_manifest: Dict[str, Any],
    *,
    insert_gap_ms: int = 300,
    silence_dir: Optional[Path] = None,
) -> StitchPlan:
    book_title, author = load_book_meta(dossier)
    order = discover_chapter_order(dossier)
    tracks: List[Track] = []

    # Book title (if present)
    book_title_ssml = paratext_manifest.get("paths", {}).get("book_title")
    if book_title_ssml:
        # expect matching WAV next to interstitials in audio folder
        bt_wav = audio_dir / "interstitials" / (Path(book_title_ssml).name.replace(".ssml.xml", ".wav"))
        if bt_wav.exists():
            dur = wav_duration_ms(bt_wav)
            tracks.append(Track(kind="book_title", chapter_id="", path=str(bt_wav), duration_ms=dur, gap_after_ms=insert_gap_ms))

            if insert_gap_ms and silence_dir:
                gap = ensure_silence_wav(silence_dir, insert_gap_ms)
                tracks.append(Track(kind="silence", chapter_id="", path=str(gap), duration_ms=wav_duration_ms(gap)))

    # Per-chapter sequence
    chapter_title_map: Dict[str, str] = {}
    for ent in paratext_manifest.get("paths", {}).get("chapter_titles", []):
        chapter_title_map[str(ent["id"])] = ent["ssml"]

    for cid in order:
        # Chapter slate (if WAV exists)
        ct_ssml = chapter_title_map.get(cid)
        if ct_ssml:
            ct_wav = audio_dir / "interstitials" / (Path(ct_ssml).name.replace(".ssml.xml", ".wav"))
            if ct_wav.exists():
                dur = wav_duration_ms(ct_wav)
                tracks.append(Track(kind="chapter_title", chapter_id=cid, path=str(ct_wav), duration_ms=dur, gap_after_ms=insert_gap_ms))
                if insert_gap_ms and silence_dir:
                    gap = ensure_silence_wav(silence_dir, insert_gap_ms)
                    tracks.append(Track(kind="silence", chapter_id=cid, path=str(gap), duration_ms=wav_duration_ms(gap)))

        # Chapter content
        chunk_ids = load_plan_chunks(dossier, cid)
        wavs = find_content_wavs(audio_dir, cid, chunk_ids)
        for w in wavs:
            tracks.append(Track(kind="content", chapter_id=cid, path=str(w), duration_ms=wav_duration_ms(w)))

    return StitchPlan(book_title=book_title, author=author, order=order, tracks=tracks)

# -------------- Writers --------------
def write_playlist_json(plan: StitchPlan, out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(plan.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path

def write_m3u8(plan: StitchPlan, out_path: Path) -> Path:
    lines: List[str] = ["#EXTM3U"]
    if plan.book_title:
        lines.append(f"# {plan.book_title} — {plan.author or ''}".strip())
    for t in plan.tracks:
        label = f"{t.kind} {('['+t.chapter_id+']') if t.chapter_id else ''}".strip()
        if t.duration_ms is not None:
            lines.append(f"#EXTINF:{int(round(t.duration_ms/1000))},{label}")
        lines.append(t.path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return out_path

def write_ffconcat(plan: StitchPlan, out_path: Path) -> Path:
    """
    ffmpeg concat demuxer file.
    All WAVs must share format (your Azure client already enforces that).
    """
    lines = ["ffconcat version 1.0"]
    for t in plan.tracks:
        lines.append(f"file '{Path(t.path).as_posix()}'")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return out_path

# -------------- CLI --------------
def _main_cli():
    import argparse
    ap = argparse.ArgumentParser(description="Build a stitch playlist with paratext inserts.")
    ap.add_argument("--dossier", default="dossier", help="Dossier folder")
    ap.add_argument("--audio-dir", default="audio/wav", help="Where chapter WAVs live")
    ap.add_argument("--paratext-manifest", default="ssml/interstitials/manifest.paratext.json", help="Paratext manifest JSON")
    ap.add_argument("--out-dir", default="stitch", help="Where to write playlist files")
    ap.add_argument("--insert-gaps", type=int, default=300, help="Gap (ms) after title slates")
    ap.add_argument("--emit-silence", action="store_true", help="Create real silence WAVs for gaps (recommended for concat)")
    args = ap.parse_args()

    dossier = Path(args.dossier)
    audio_dir = Path(args.audio_dir)
    out_dir = Path(args.out_dir)
    man_path = Path(args.paratext_manifest)

    if not man_path.exists():
        raise SystemExit(f"Paratext manifest not found: {man_path}\nRun tools/paratext_ssml.py first (and synthesize WAVs).")

    manifest = load_paratext_manifest(man_path)
    silence_dir = audio_dir / "_silence" if args.emit_silence else None

    plan = build_stitch_plan(
        dossier, audio_dir, manifest,
        insert_gap_ms=max(0, int(args.insert_gaps)),
        silence_dir=silence_dir
    )

    json_p = write_playlist_json(plan, out_dir / "playlist.json")
    m3u_p  = write_m3u8(plan, out_dir / "playlist.m3u8")
    ffc_p  = write_ffconcat(plan, out_dir / "playlist.ffconcat")

    print(str(json_p))
    print(str(m3u_p))
    print(str(ffc_p))
    print("\nHint: ffmpeg -f concat -safe 0 -i stitch/playlist.ffconcat -c copy deliverables/book_full.wav")

if __name__ == "__main__":
    _main_cli()
