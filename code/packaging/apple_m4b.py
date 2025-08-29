# packaging/apple_m4b.py
# -*- coding: utf-8 -*-
"""
Empaquetado para Apple Books (.m4b) usando FFmpeg + FFMETADATA.

Entrada:
- Lista ordenada de capítulos con (title, wav_path).
- Metadatos globales (book_title, author, year, publisher, description).
- Portada opcional (3000x3000 px recomendado, JPG/PNG).

Salida:
- Un único archivo .m4b con:
  - Audio AAC (configurable), 44.1 kHz, mono por defecto.
  - Capítulos embebidos (FFMETADATA [CHAPTER]).
  - Cover art adjunto como "attached_pic".
  - Tags básicos (title/album/artist/date/comment).

Requisitos:
  - ffmpeg instalado y en PATH.
  - soundfile (o wave/pydub como fallback) para medir duraciones.

CLI:
  python -m packaging.apple_m4b \
    --title "Puntajada" \
    --author "Autora X" \
    --year 2025 \
    --cover art/cover_3000.jpg \
    --out deliverables/apple/puntajada.m4b \
    --chapters-json analysis/chapters_list.json
  # analysis/chapters_list.json:
  # [{"title":"Capítulo 1","path":"deliverables/tmp/ch01_norm.wav"}, ...]
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

from core.errors import PackagingError
from core.logging import get_logger, log_span

_LOG = get_logger("packaging.m4b")

try:
    import soundfile as sf  # rápido/preciso
    _HAS_SF = True
except Exception:
    _HAS_SF = False
    import wave
    import contextlib


# ---------------- Duraciones ----------------

def _duration_seconds(wav_path: Path) -> float:
    if _HAS_SF:
        info = sf.info(str(wav_path))
        return float(info.frames) / float(info.samplerate)
    # Fallback con wave (PCM 16/24/32)
    with contextlib.closing(wave.open(str(wav_path), "rb")) as wf:  # type: ignore
        frames = wf.getnframes()
        sr = wf.getframerate()
        return frames / float(sr)


# ---------------- Archivos temporales (concat + ffmetadata) ----------------

def _write_concat_list(chapters: List[Tuple[str, Path]], folder: Path) -> Path:
    """
    Crea list.txt para el demuxer 'concat'.
    """
    p = folder / "list.txt"
    with p.open("w", encoding="utf-8") as f:
        for _, wav in chapters:
            f.write(f"file '{wav.as_posix()}'\n")
    return p

def _write_ffmetadata(chapters: List[Tuple[str, Path]], meta: Dict[str, Any], folder: Path) -> Path:
    """
    Crea FFMETADATA con capítulos y tags globales.
    TIMEBASE=1/1000 (ms). START/END en ms (enteros).
    """
    # Timestamps
    starts_ms: List[int] = []
    ends_ms: List[int] = []
    titles: List[str] = []
    t = 0.0
    for title, wav in chapters:
        dur = _duration_seconds(wav)
        start = int(round(t * 1000))
        end = int(round((t + dur) * 1000))
        starts_ms.append(start)
        ends_ms.append(end)
        titles.append(title)
        t += dur

    p = folder / "ffmetadata.txt"
    with p.open("w", encoding="utf-8") as f:
        f.write(";FFMETADATA1\n")
        # Global tags
        if meta.get("book_title"):
            f.write(f"title={meta['book_title']}\n")
            f.write(f"album={meta['book_title']}\n")
        if meta.get("author"):
            f.write(f"artist={meta['author']}\n")
        if meta.get("publisher"):
            f.write(f"publisher={meta['publisher']}\n")
        if meta.get("year"):
            f.write(f"date={meta['year']}\n")
        if meta.get("description"):
            # Evita saltos de línea (ffmetadata soporta \n escapado; aquí simplificamos)
            desc = str(meta['description']).replace("\n", " ").strip()
            f.write(f"comment={desc}\n")

        # Chapters
        for i, (start, end, title) in enumerate(zip(starts_ms, ends_ms, titles), start=1):
            f.write("\n[CHAPTER]\n")
            f.write("TIMEBASE=1/1000\n")
            f.write(f"START={start}\n")
            f.write(f"END={end}\n")
            f.write(f"title={title}\n")
    return p


# ---------------- FFmpeg helpers ----------------

def _ensure_ffmpeg() -> str:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise PackagingError("FFmpeg no encontrado en PATH; instálalo para crear .m4b.")
    return ffmpeg

def _run(cmd: List[str]) -> None:
    _LOG.info("ffmpeg_cmd", extra={"cmd": " ".join(cmd)})
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise PackagingError("FFmpeg error", stdout=proc.stdout.decode("utf-8", "ignore")[-4000:], stderr=proc.stderr.decode("utf-8", "ignore")[-4000:])


# ---------------- API pública ----------------

@dataclass
class M4BOptions:
    aac_bitrate: str = "128k"   # "96k", "128k", "192k"...
    sample_rate_hz: int = 44100
    channels: int = 1           # 1=mono, 2=stereo
    faststart: bool = True      # -movflags +faststart
    rename_to_m4b: bool = True  # salida .m4b (contenedor idéntico a m4a)


def build_m4b(
    chapters: List[Dict[str, str]],
    *,
    out_path: str | Path,
    book_title: str,
    author: str,
    year: Optional[int] = None,
    publisher: Optional[str] = None,
    description: Optional[str] = None,
    cover_path: Optional[str | Path] = None,
    opts: Optional[M4BOptions] = None,
) -> Path:
    """
    Construye un .m4b con capítulos y portada embebidos.
    chapters: [{ "title": "...", "path": "/ruta/chXX_norm.wav" }, ...] (ordenados)
    """
    if not chapters:
        raise PackagingError("No se recibieron capítulos para empaquetar.")

    ffmpeg = _ensure_ffmpeg()
    opts = opts or M4BOptions()

    # Normaliza entradas
    ch_list: List[Tuple[str, Path]] = []
    for item in chapters:
        title = str(item.get("title") or "").strip() or "Capítulo"
        p = Path(item.get("path", "")).expanduser().resolve()
        if not p.exists():
            raise PackagingError(f"WAV inexistente: {p}")
        ch_list.append((title, p))

    outp = Path(out_path).expanduser().resolve()
    outp.parent.mkdir(parents=True, exist_ok=True)
    tmp_dir = Path(tempfile.mkdtemp(prefix="m4b_build_"))
    tmp_m4a = tmp_dir / "book_tmp.m4a"

    meta = {
        "book_title": book_title,
        "author": author,
        "year": year,
        "publisher": publisher,
        "description": description,
    }

    with log_span("packaging.m4b", extra={"out": str(outp), "chapters": len(ch_list)}):
        list_txt = _write_concat_list(ch_list, tmp_dir)
        ffmeta = _write_ffmetadata(ch_list, meta, tmp_dir)

        # Construir comando FFmpeg
        cmd: List[str] = [
            ffmpeg, "-hide_banner", "-y",
            "-f", "concat", "-safe", "0", "-i", str(list_txt),     # entrada audio (concat)
            "-i", str(ffmeta),                                     # metadata/chapters
            "-map_metadata", "1",                                  # mapear metadata del ffmetadata (2º input)
            "-map", "0:a:0",                                       # mapa de audio
            "-c:a", "aac", "-b:a", opts.aac_bitrate,
            "-ar", str(opts.sample_rate_hz),
            "-ac", str(opts.channels),
        ]

        # Portada (opcional)
        if cover_path:
            cov = Path(cover_path).expanduser().resolve()
            if not cov.exists():
                raise PackagingError(f"Portada no encontrada: {cov}")
            cmd = [
                ffmpeg, "-hide_banner", "-y",
                "-f", "concat", "-safe", "0", "-i", str(list_txt),
                "-i", str(cov),
                "-i", str(ffmeta),
                "-map_metadata", "2",        # ffmetadata es el 3er input ahora
                "-map", "0:a:0",
                "-map", "1:v:0",
                "-c:a", "aac", "-b:a", opts.aac_bitrate,
                "-ar", str(opts.sample_rate_hz),
                "-ac", str(opts.channels),
                "-c:v", "mjpeg",
                "-disposition:v:0", "attached_pic",
            ]

        if opts.faststart:
            cmd += ["-movflags", "+faststart"]

        cmd += [str(tmp_m4a)]
        _run(cmd)

        # Renombrar a .m4b si aplica
        final_path = outp
        if opts.rename_to_m4b and final_path.suffix.lower() != ".m4b":
            final_path = final_path.with_suffix(".m4b")

        shutil.move(str(tmp_m4a), str(final_path))
        _LOG.info("m4b_built", extra={"file": str(final_path)})

        # Limpieza best-effort
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass

    return final_path


# ---------------- CLI ----------------

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Empaqueta un .m4b (Apple Books) con capítulos y portada.")
    ap.add_argument("--chapters-json", required=True, help="Ruta a JSON: [{'title':'Capítulo 1','path':'...'},...] (ordenados)")
    ap.add_argument("--out", required=True, help="Ruta de salida .m4b")
    ap.add_argument("--title", required=True)
    ap.add_argument("--author", required=True)
    ap.add_argument("--year", type=int)
    ap.add_argument("--publisher")
    ap.add_argument("--description")
    ap.add_argument("--cover")
    ap.add_argument("--bitrate", default="128k")
    ap.add_argument("--sr", type=int, default=44100)
    ap.add_argument("--channels", type=int, default=1)
    args = ap.parse_args()

    chapters = json.loads(Path(args.chapters_json).read_text(encoding="utf-8"))
    if not isinstance(chapters, list):
        raise SystemExit("El archivo --chapters-json debe ser una lista de objetos con {title, path}.")

    path = build_m4b(
        chapters,
        out_path=args.out,
        book_title=args.title,
        author=args.author,
        year=args.year,
        publisher=args.publisher,
        description=args.description,
        cover_path=args.cover,
        opts=M4BOptions(aac_bitrate=args.bitrate, sample_rate_hz=args.sr, channels=args.channels),
    )
    print(str(path))
