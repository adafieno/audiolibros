# packaging/gplay_spotify.py
# -*- coding: utf-8 -*-
"""
Exportación por capítulo para Google Play Books y Spotify.

Entrada:
- Lista ordenada de capítulos con (title, wav_path).
- Metadatos globales del álbum (book_title, author, year, publisher/label, description).
- Portada opcional (3000x3000 px).

Salida:
- MP3 CBR (p. ej., 256k) y/o FLAC por capítulo con tags embebidos.
- Sidecars: manifest JSON y CSV con orden, duraciones y rutas resultantes.

Requisitos:
  - ffmpeg instalado y en PATH.

CLI ejemplo:
  python -m packaging.gplay_spotify \
    --chapters-json analysis/chapters_list.json \
    --out-dir deliverables/gplay_spotify \
    --title "Puntajada" \
    --author "Autora X" \
    --year 2025 \
    --label "Tu Sello" \
    --description "Audiolibro..." \
    --cover art/cover_3000.jpg \
    --mp3 --bitrate 256k --sr 44100 --mono \
    --flac
"""

from __future__ import annotations

import csv
import json
import shutil
import subprocess
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

from core.errors import PackagingError
from core.logging import get_logger, log_span

_LOG = get_logger("packaging.gplay_spotify")


# ---------------- Utilidades ----------------

def _ensure_ffmpeg() -> str:
    ff = shutil.which("ffmpeg")
    if not ff:
        raise PackagingError("FFmpeg no encontrado en PATH; instálalo para exportar MP3/FLAC.")
    return ff

def _duration_seconds(wav_path: Path) -> float:
    # Intento rápido con ffprobe para no depender de más libs
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return 0.0
    cmd = [
        ffprobe, "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(wav_path)
    ]
    try:
        out = subprocess.check_output(cmd).decode("utf-8", "ignore").strip()
        return float(out)
    except Exception:
        return 0.0

def _safe_str(x: Any) -> str:
    return str(x) if x is not None else ""


# ---------------- Opciones ----------------

@dataclass
class AlbumMeta:
    book_title: str
    author: str
    year: Optional[int] = None
    label: Optional[str] = None      # publisher/label
    description: Optional[str] = None
    genre: Optional[str] = "Audiobook"

@dataclass
class MP3Options:
    bitrate: str = "256k"    # CBR recomendado (Google sugiere ≥128k; usar 256k para margen)
    sample_rate_hz: int = 44100
    channels: int = 1        # 1=mono, 2=stereo
    id3v: str = "v2.3"       # ffmpeg escribe ID3v2 por defecto; indicativo

@dataclass
class FLACOptions:
    sample_rate_hz: int = 44100
    channels: int = 1        # 1=mono, 2=stereo
    compression_level: int = 5


# ---------------- Transcodificadores ----------------

def _ffmpeg_mp3(
    in_wav: Path, out_mp3: Path, meta: AlbumMeta, track_title: str, track_no: int,
    cover_path: Optional[Path], opts: MP3Options
) -> Path:
    ffmpeg = _ensure_ffmpeg()
    out_mp3.parent.mkdir(parents=True, exist_ok=True)

    base_cmd = [
        ffmpeg, "-hide_banner", "-y",
        "-i", str(in_wav),
    ]
    # Portada (si hay), se mapea como attached_pic
    if cover_path and cover_path.exists():
        base_cmd += ["-i", str(cover_path)]

    # Metadata común
    tags = [
        "-metadata", f"title={track_title}",
        "-metadata", f"artist={meta.author}",
        "-metadata", f"album={meta.book_title}",
        "-metadata", f"album_artist={meta.author}",
        "-metadata", f"track={track_no}",
        "-metadata", f"date={_safe_str(meta.year)}",
        "-metadata", f"publisher={_safe_str(meta.label)}",
        "-metadata", f"genre={_safe_str(meta.genre)}",
    ]
    if meta.description:
        # Evita saltos excesivos
        desc = meta.description.replace("\n", " ").strip()
        tags += ["-metadata", f"comment={desc}"]

    # Mapas y códecs
    if cover_path and cover_path.exists():
        codec_section = [
            "-map", "0:a:0",
            "-map", "1:v:0",
            "-c:a", "libmp3lame", "-b:a", opts.bitrate,
            "-ar", str(opts.sample_rate_hz),
            "-ac", str(opts.channels),
            "-c:v", "mjpeg",
            "-disposition:v:0", "attached_pic",
        ]
    else:
        codec_section = [
            "-map", "0:a:0",
            "-c:a", "libmp3lame", "-b:a", opts.bitrate,
            "-ar", str(opts.sample_rate_hz),
            "-ac", str(opts.channels),
        ]

    cmd = base_cmd + tags + codec_section + [str(out_mp3)]
    _LOG.info("ffmpeg_mp3", extra={"cmd": " ".join(cmd)})
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise PackagingError("FFmpeg MP3 error", stderr=proc.stderr.decode("utf-8", "ignore")[-4000:])
    return out_mp3


def _ffmpeg_flac(
    in_wav: Path, out_flac: Path, meta: AlbumMeta, track_title: str, track_no: int,
    cover_path: Optional[Path], opts: FLACOptions
) -> Path:
    ffmpeg = _ensure_ffmpeg()
    out_flac.parent.mkdir(parents=True, exist_ok=True)

    base_cmd = [
        ffmpeg, "-hide_banner", "-y",
        "-i", str(in_wav),
    ]
    if cover_path and cover_path.exists():
        base_cmd += ["-i", str(cover_path)]

    tags = [
        "-metadata", f"title={track_title}",
        "-metadata", f"artist={meta.author}",
        "-metadata", f"album={meta.book_title}",
        "-metadata", f"album_artist={meta.author}",
        "-metadata", f"track={track_no}",
        "-metadata", f"date={_safe_str(meta.year)}",
        "-metadata", f"publisher={_safe_str(meta.label)}",
        "-metadata", f"genre={_safe_str(meta.genre)}",
    ]
    if meta.description:
        desc = meta.description.replace("\n", " ").strip()
        tags += ["-metadata", f"comment={desc}"]

    codec_section = [
        "-map", "0:a:0",
        "-c:a", "flac",
        "-compression_level", str(opts.compression_level),
        "-ar", str(opts.sample_rate_hz),
        "-ac", str(opts.channels),
    ]

    # Adjuntar portada como METADATA_BLOCK_PICTURE (ffmpeg lo maneja cuando mapeas la imagen)
    if cover_path and cover_path.exists():
        codec_section = [
            "-map", "0:a:0",
            "-map", "1:v:0",
            "-c:a", "flac",
            "-compression_level", str(opts.compression_level),
            "-ar", str(opts.sample_rate_hz),
            "-ac", str(opts.channels),
            "-c:v", "mjpeg",
            "-disposition:v:0", "attached_pic",
        ]

    cmd = base_cmd + tags + codec_section + [str(out_flac)]
    _LOG.info("ffmpeg_flac", extra={"cmd": " ".join(cmd)})
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise PackagingError("FFmpeg FLAC error", stderr=proc.stderr.decode("utf-8", "ignore")[-4000:])
    return out_flac


# ---------------- Manifiestos ----------------

def _write_manifest_json(rows: List[Dict[str, Any]], out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path

def _write_manifest_csv(rows: List[Dict[str, Any]], out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fields = ["track_no", "title", "duration_s", "mp3_path", "flac_path"]
    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fields})
    return out_path


# ---------------- API principal ----------------

def export_chapters(
    chapters: List[Dict[str, str]],
    *,
    out_dir: str | Path,
    album: AlbumMeta,
    cover_path: Optional[str | Path] = None,
    mp3: bool = True,
    flac: bool = False,
    mp3_opts: Optional[MP3Options] = None,
    flac_opts: Optional[FLACOptions] = None,
) -> Dict[str, Any]:
    """
    Transcodifica capítulos a MP3/FLAC con tags y genera manifiestos.
    chapters: [{"title":"Capítulo 1","path":"deliverables/tmp/ch01_norm.wav"}, ...] (ordenados)
    """
    if not chapters:
        raise PackagingError("No se recibieron capítulos para exportar.")
    _ensure_ffmpeg()

    out_root = Path(out_dir)
    out_mp3_dir = out_root / "mp3"
    out_flac_dir = out_root / "flac"
    out_root.mkdir(parents=True, exist_ok=True)
    cover = Path(cover_path).resolve() if cover_path else None

    mp3_opts = mp3_opts or MP3Options()
    flac_opts = flac_opts or FLACOptions()

    rows: List[Dict[str, Any]] = []

    with log_span("packaging.export_chapters", extra={"count": len(chapters), "mp3": mp3, "flac": flac}):
        for i, item in enumerate(chapters, start=1):
            title = str(item.get("title") or f"Capítulo {i}")
            wav = Path(item.get("path", "")).expanduser().resolve()
            if not wav.exists():
                raise PackagingError(f"WAV inexistente: {wav}")

            dur = _duration_seconds(wav)
            mp3_path = flac_path = ""

            if mp3:
                out_mp3 = out_mp3_dir / f"{i:02d} - {title}.mp3"
                _ffmpeg_mp3(wav, out_mp3, album, track_title=title, track_no=i, cover_path=cover, opts=mp3_opts)
                mp3_path = str(out_mp3)

            if flac:
                out_flac = out_flac_dir / f"{i:02d} - {title}.flac"
                _ffmpeg_flac(wav, out_flac, album, track_title=title, track_no=i, cover_path=cover, opts=flac_opts)
                flac_path = str(out_flac)

            rows.append({
                "track_no": i,
                "title": title,
                "duration_s": round(dur, 3),
                "mp3_path": mp3_path,
                "flac_path": flac_path,
            })

        # Manifiestos
        manifest_json = out_root / "chapters_manifest.json"
        manifest_csv = out_root / "chapters_manifest.csv"
        _write_manifest_json(rows, manifest_json)
        _write_manifest_csv(rows, manifest_csv)

    return {
        "album": asdict(album),
        "out_dir": str(out_root),
        "rows": rows,
        "manifest_json": str(manifest_json),
        "manifest_csv": str(manifest_csv),
    }


# ---------------- CLI ----------------

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Exporta capítulos a MP3/FLAC para Google Play y Spotify.")
    ap.add_argument("--chapters-json", required=True, help="Ruta a JSON: [{'title':'Capítulo 1','path':'...'},...] (ordenados)")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--author", required=True)
    ap.add_argument("--year", type=int)
    ap.add_argument("--label")
    ap.add_argument("--description")
    ap.add_argument("--cover")
    ap.add_argument("--mp3", action="store_true")
    ap.add_argument("--flac", action="store_true")
    ap.add_argument("--bitrate", default="256k")
    ap.add_argument("--sr", type=int, default=44100)
    ap.add_argument("--mono", action="store_true")
    ap.add_argument("--flac-sr", type=int, default=44100)
    ap.add_argument("--flac-mono", action="store_true")
    ap.add_argument("--flac-level", type=int, default=5)
    args = ap.parse_args()

    chapters = json.loads(Path(args.chapters_json).read_text(encoding="utf-8"))
    if not isinstance(chapters, list):
        raise SystemExit("El archivo --chapters-json debe ser una lista de objetos con {title, path}.")

    album = AlbumMeta(
        book_title=args.title,
        author=args.author,
        year=args.year,
        label=args.label,
        description=args.description,
    )

    mp3_opts = MP3Options(
        bitrate=args.bitrate,
        sample_rate_hz=args.sr,
        channels=1 if args.mono else 2,
    )

    flac_opts = FLACOptions(
        sample_rate_hz=args.flac_sr,
        channels=1 if args.flac_mono else 2,
        compression_level=args.flac_level,
    )

    res = export_chapters(
        chapters,
        out_dir=args.out_dir,
        album=album,
        cover_path=args.cover,
        mp3=args.mp3,
        flac=args.flac,
        mp3_opts=mp3_opts,
        flac_opts=flac_opts,
    )
    print(json.dumps(res, ensure_ascii=False, indent=2))
