# orchestration/pipeline_cli.py
# -*- coding: utf-8 -*-
"""
CLI de orquestación del pipeline de audiolibros.

Etapas disponibles:
  - ssml_plan         : construye planes SSML por capítulo (.plan.json)
  - ssml_xml          : genera XMLs SSML por chunk
  - tts               : sintetiza XMLs → WAVs de chunk
  - concat            : concatena WAVs de chunk → WAV por capítulo
  - enhance           : mejora sutil del capítulo (HPF, de-esser, tilt, expander)
  - master            : normalización técnica (RMS objetivo + ceiling de pico)
  - qc                : reporte QC (JSON/MD)
  - package_apple     : empaqueta .m4b con capítulos y portada
  - package_gplay_spotify : exporta MP3/FLAC por capítulo + manifiestos
  - all               : corre todas en orden

Requisitos:
  - Módulos previos del proyecto (llm, ssml, tts, audio, packaging, dossier, core)
  - FFmpeg en PATH para empaquetado y exportaciones
  - Claves/config en core.config (Azure TTS, OpenAI, etc.)

Uso rápido:
  python -m orchestration.pipeline_cli all \
      --project-root . \
      --dossier-dir dossier \
      --chapters-dir analysis/chapters_txt \
      --ssml-out ssml \
      --tts-out audio/wav/chunks \
      --chapters-wav-out audio/wav/chapters \
      --tmp-out deliverables/tmp \
      --apple-out deliverables/apple/Puntajada.m4b \
      --gplay-spotify-out deliverables/gplay_spotify \
      --cover art/cover_3000.jpg \
      --book-title "Puntajada" --author "Autora X" --year 2025

Notas:
  - Este CLI espera tener los textos de capítulos como TXT (uno por archivo).
    Si no los tienes aún, genera esos TXT con tu módulo de ingestión.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

# --- Módulos del proyecto (ya implementados en pasos anteriores) ---
from ssml.plan_builder import build_chapter_plan
from ssml.xml_generator import render_plan_to_files
from tts.azure_client import batch_synthesize
from tts.postproc import concat_chunks
from audio.enhance import enhance_voice, EnhanceConfig
from audio.mastering import normalize
from audio.qc_report import build_report, to_markdown
from packaging.apple_m4b import build_m4b, M4BOptions
from packaging.gplay_spotify import export_chapters, AlbumMeta, MP3Options, FLACOptions

# Opcionalmente, si tienes loaders de dossier:
def _read_json(p: Path) -> Dict[str, Any]:
    return json.loads(p.read_text(encoding="utf-8"))

# ------------------------------
# Utilidades de paths y helpers
# ------------------------------

@dataclass
class Paths:
    project_root: Path
    dossier_dir: Path
    chapters_txt_dir: Path
    ssml_out_dir: Path
    ssml_xml_out_dir: Path
    tts_chunks_out_dir: Path
    chapters_wav_out_dir: Path
    tmp_out_dir: Path
    apple_out_file: Optional[Path]
    gplay_spotify_dir: Optional[Path]
    cover_path: Optional[Path]

def _ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)

def _chapter_txt_path(paths: Paths, chapter_id: str) -> Path:
    # Convención: {chapter_id}.txt (ej. ch01.txt)
    return paths.chapters_txt_dir / f"{chapter_id}.txt"

def _plan_json_path(paths: Paths, chapter_id: str) -> Path:
    return paths.ssml_out_dir / f"{chapter_id}.plan.json"

def _ssml_xml_dir(paths: Paths) -> Path:
    return paths.ssml_xml_out_dir

def _tts_chunk_path(paths: Paths, chunk_id: str) -> Path:
    return paths.tts_chunks_out_dir / f"{chunk_id}.wav"

def _chapter_wav_path(paths: Paths, chapter_id: str) -> Path:
    return paths.chapters_wav_out_dir / f"{chapter_id}.wav"

def _chapter_enh_path(paths: Paths, chapter_id: str) -> Path:
    return paths.tmp_out_dir / f"{chapter_id}_enh.wav"

def _chapter_norm_path(paths: Paths, chapter_id: str) -> Path:
    return paths.tmp_out_dir / f"{chapter_id}_norm.wav"

def _qc_json_path(paths: Paths, chapter_id: str) -> Path:
    return paths.project_root / "analysis" / "qc" / f"{chapter_id}.report.json"

def _qc_md_path(paths: Paths, chapter_id: str) -> Path:
    return paths.project_root / "analysis" / "qc" / f"{chapter_id}.report.md"

# ------------------------------
# Carga de componentes del dossier
# ------------------------------

@dataclass
class Dossier:
    narrative_structure: Dict[str, Any]
    voices_cast: Optional[Dict[str, Any]]
    stylepacks: Optional[Dict[str, Any]]
    lexicon: Optional[Dict[str, Any]]
    sensitive: Optional[Dict[str, Any]]
    production: Optional[Dict[str, Any]]

def _load_dossier(dossier_dir: Path) -> Dossier:
    def _opt(name: str) -> Optional[Dict[str, Any]]:
        p = dossier_dir / f"{name}.json"
        return _read_json(p) if p.exists() else None

    ns = _opt("narrative.structure")
    if not ns:
        raise SystemExit("Falta dossier/narrative.structure.json (lista de capítulos).")
    return Dossier(
        narrative_structure=ns,
        voices_cast=_opt("voices.cast"),
        stylepacks=_opt("stylepacks"),
        lexicon=_opt("lexicon"),
        sensitive=_opt("pronunciations.sensitive"),
        production=_opt("production.settings"),
    )

def _chapters_from_structure(ns: Dict[str, Any]) -> List[Dict[str, Any]]:
    chs = ns.get("chapters") or []
    out = []
    for i, ch in enumerate(chs, start=1):
        cid = ch.get("id") or f"ch{i:02d}"
        title = ch.get("title") or f"Capítulo {i}"
        out.append({"id": cid, "title": title})
    if not out:
        raise SystemExit("narrative.structure.json no contiene capítulos.")
    return out

# ------------------------------
# Etapas
# ------------------------------

def stage_ssml_plan(paths: Paths, dossier: Dossier, *, force: bool, target_minutes: float, hard_cap_minutes: float, max_kb: int, default_voice: str, default_stylepack: str, wpm: float) -> None:
    _ensure_dir(paths.ssml_out_dir)
    chapters = _chapters_from_structure(dossier.narrative_structure)
    for ch in chapters:
        cid = ch["id"]
        txt_path = _chapter_txt_path(paths, cid)
        if not txt_path.exists():
            raise SystemExit(f"No existe el capítulo TXT requerido: {txt_path}. Genera los .txt antes de esta etapa.")
        plan_path = _plan_json_path(paths, cid)
        if plan_path.exists() and not force:
            print(f"[plan] OK (skip) {cid}")
            continue
        text = txt_path.read_text(encoding="utf-8")
        plan = build_chapter_plan(
            cid, text,
            default_voice=default_voice,
            default_stylepack=default_stylepack,
            limits={"max_kb_per_request": max_kb} if max_kb else None,
            target_minutes=target_minutes,
            hard_cap_minutes=hard_cap_minutes,
            wpm=wpm,
        )
        plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[plan] escrito {plan_path}")

def stage_ssml_xml(paths: Paths, dossier: Dossier, *, force: bool, locale: str, default_voice: str) -> None:
    _ensure_dir(_ssml_xml_dir(paths))
    chapters = _chapters_from_structure(dossier.narrative_structure)
    for ch in chapters:
        cid = ch["id"]
        txt_path = _chapter_txt_path(paths, cid)
        plan_path = _plan_json_path(paths, cid)
        if not plan_path.exists():
            raise SystemExit(f"Falta plan SSML del capítulo {cid}: {plan_path}")
        # Renderiza todos los chunks a XML (si algún XML existe y no hay force, se reescribe igual; es cheap)
        text = Path(txt_path).read_text(encoding="utf-8")
        plan = _read_json(plan_path)
        out_paths = render_plan_to_files(
            plan, text, _ssml_xml_dir(paths),
            locale=locale,
            voices_cast=dossier.voices_cast,
            stylepacks=dossier.stylepacks,
            lexicon=dossier.lexicon,
            pronunciations_sensitive=dossier.sensitive,
            default_voice=default_voice,
        )
        print(f"[ssml] {cid}: {len(out_paths)} XML")

def stage_tts(paths: Paths, *, force: bool, timeout_s: int, retries: int, max_workers: int) -> None:
    _ensure_dir(paths.tts_chunks_out_dir)
    # Παresear todos los XML y preparar pares (xml -> wav)
    xml_paths = sorted((p for p in _ssml_xml_dir(paths).glob("*.xml")), key=lambda x: x.name)
    pairs: List[Tuple[str, str]] = []
    for xml in xml_paths:
        # chunk_id = nombre de archivo sin .xml
        chunk_id = xml.stem
        out_wav = _tts_chunk_path(paths, chunk_id)
        if out_wav.exists() and not force:
            continue
        pairs.append((str(xml), str(out_wav)))
    if not pairs:
        print("[tts] nada para sintetizar (skip)")
        return
    out_wavs = batch_synthesize(pairs, timeout_s=timeout_s, retries=retries, max_workers=max_workers)
    print(f"[tts] sintetizados {len(out_wavs)} chunks")

def stage_concat(paths: Paths, dossier: Dossier, *, force: bool, gap_ms: int, sr_hz: int, channels: int, sample_width_bytes: int) -> None:
    _ensure_dir(paths.chapters_wav_out_dir)
    chapters = _chapters_from_structure(dossier.narrative_structure)
    for ch in chapters:
        cid = ch["id"]
        out_wav = _chapter_wav_path(paths, cid)
        if out_wav.exists() and not force:
            print(f"[concat] OK (skip) {cid}")
            continue
        # reúnir los chunk WAVs en orden, según plan
        plan_path = _plan_json_path(paths, cid)
        if not plan_path.exists():
            raise SystemExit(f"Falta plan SSML del capítulo {cid} para concatenar WAVs.")
        plan = _read_json(plan_path)
        chunk_ids = [c["id"] for c in (plan.get("chunks") or [])]
        wavs = [str(_tts_chunk_path(paths, ck)) for ck in chunk_ids]
        missing = [w for w in wavs if not Path(w).exists()]
        if missing:
            raise SystemExit(f"Faltan WAVs de chunk para {cid}:\n  " + "\n  ".join(missing))
        res = concat_chunks(wavs, out_wav, gap_ms=gap_ms, sr_hz=sr_hz, channels=channels, sample_width_bytes=sample_width_bytes)
        print(f"[concat] {cid} → {res}")

def stage_enhance(paths: Paths, dossier: Dossier, *, force: bool, enhance_cfg: Dict[str, Any]) -> None:
    _ensure_dir(paths.tmp_out_dir)
    chapters = _chapters_from_structure(dossier.narrative_structure)
    for ch in chapters:
        cid = ch["id"]
        in_wav = _chapter_wav_path(paths, cid)
        out_wav = _chapter_enh_path(paths, cid)
        if out_wav.exists() and not force:
            print(f"[enhance] OK (skip) {cid}")
            continue
        res = enhance_voice(in_wav, out_wav, cfg=enhance_cfg)
        print(f"[enhance] {cid} → peak {res['out']['peak_dbfs']:.2f} dBFS")

def stage_master(paths: Paths, dossier: Dossier, *, force: bool, rms_target_dbfs: float, peak_ceiling_dbfs: float) -> None:
    _ensure_dir(paths.tmp_out_dir)
    chapters = _chapters_from_structure(dossier.narrative_structure)
    for ch in chapters:
        cid = ch["id"]
        in_wav = _chapter_enh_path(paths, cid)
        if not in_wav.exists():
            # si no hay enhance, intentar masterizar directamente el WAV crudo
            in_wav = _chapter_wav_path(paths, cid)
        out_wav = _chapter_norm_path(paths, cid)
        if out_wav.exists() and not force:
            print(f"[master] OK (skip) {cid}")
            continue
        res = normalize(in_wav, out_wav, rms_target_dbfs=rms_target_dbfs, peak_ceiling_dbfs=peak_ceiling_dbfs)
        print(f"[master] {cid} → RMS {res['out']['rms_dbfs']:.2f} dBFS, TruePeak {res['out']['true_peak_dbfs']:.2f} dBFS")

def stage_qc(paths: Paths, dossier: Dossier, *, force: bool) -> None:
    qc_dir = paths.project_root / "analysis" / "qc"
    _ensure_dir(qc_dir)
    chapters = _chapters_from_structure(dossier.narrative_structure)
    for ch in chapters:
        cid = ch["id"]
        raw_wav = _chapter_wav_path(paths, cid)
        enh_wav = _chapter_enh_path(paths, cid)
        norm_wav = _chapter_norm_path(paths, cid)
        rep = build_report(cid, raw_wav=str(raw_wav) if raw_wav.exists() else None,
                                enhanced_wav=str(enh_wav) if enh_wav.exists() else None,
                                normalized_wav=str(norm_wav) if norm_wav.exists() else None)
        _qc_json_path(paths, cid).write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
        _qc_md_path(paths, cid).write_text(to_markdown(rep), encoding="utf-8")
        print(f"[qc] {cid} → ok={rep['ok']} issues={len(rep['issues'])}")

def stage_package_apple(paths: Paths, dossier: Dossier, *, force: bool, book_title: str, author: str, year: Optional[int], publisher: Optional[str], description: Optional[str], cover: Optional[Path], aac_bitrate: str, sr: int, channels: int) -> None:
    if not paths.apple_out_file:
        raise SystemExit("--apple-out es requerido para package_apple")
    out = paths.apple_out_file
    if out.exists() and not force:
        print("[apple] OK (skip)")
        return
    chapters = _chapters_from_structure(dossier.narrative_structure)
    rows = []
    for i, ch in enumerate(chapters, start=1):
        cid = ch["id"]
        title = ch["title"]
        norm = _chapter_norm_path(paths, cid)
        src = norm if norm.exists() else _chapter_wav_path(paths, cid)
        if not src.exists():
            raise SystemExit(f"Falta WAV por capítulo para Apple: {src}")
        rows.append({"title": title, "path": str(src)})
    m4b = build_m4b(
        rows, out_path=str(out), book_title=book_title, author=author, year=year,
        publisher=publisher, description=description, cover_path=str(cover) if cover else None,
        opts=M4BOptions(aac_bitrate=aac_bitrate, sample_rate_hz=sr, channels=channels)
    )
    print(f"[apple] escrito {m4b}")

def stage_package_gplay_spotify(paths: Paths, dossier: Dossier, *, force: bool, out_dir: Path, album_meta: AlbumMeta, cover: Optional[Path], mp3_bitrate: str, sr: int, channels: int, flac: bool) -> None:
    _ensure_dir(out_dir)
    manifest_json = out_dir / "chapters_manifest.json"
    if manifest_json.exists() and not force:
        print("[gplay_spotify] OK (skip)")
        return
    chapters = _chapters_from_structure(dossier.narrative_structure)
    rows = []
    for i, ch in enumerate(chapters, start=1):
        cid = ch["id"]
        title = ch["title"]
        norm = _chapter_norm_path(paths, cid)
        src = norm if norm.exists() else _chapter_wav_path(paths, cid)
        if not src.exists():
            raise SystemExit(f"Falta WAV por capítulo para exportación: {src}")
        rows.append({"title": title, "path": str(src)})
    res = export_chapters(
        rows,
        out_dir=str(out_dir),
        album=album_meta,
        cover_path=str(cover) if cover else None,
        mp3=True, flac=flac,
        mp3_opts=MP3Options(bitrate=mp3_bitrate, sample_rate_hz=sr, channels=channels),
        flac_opts=None,
    )
    print(f"[gplay_spotify] manifest → {res['manifest_json']}")

# ------------------------------
# CLI
# ------------------------------

def _parse_args(argv: List[str]) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Orquestación del pipeline de audiolibros")
    ap.add_argument("stage", choices=[
        "ssml_plan","ssml_xml","tts","concat","enhance","master","qc",
        "package_apple","package_gplay_spotify","all"
    ])

    ap.add_argument("--project-root", required=True)
    ap.add_argument("--dossier-dir", required=True)
    ap.add_argument("--chapters-dir", required=True, help="Carpeta con {chapter_id}.txt")
    ap.add_argument("--ssml-out", required=True, help="Carpeta donde guardar *.plan.json")
    ap.add_argument("--ssml-xml-out", default="ssml", help="Carpeta para XMLs SSML (por chunk)")
    ap.add_argument("--tts-out", required=True, help="Carpeta WAVs por chunk")
    ap.add_argument("--chapters-wav-out", required=True, help="Carpeta WAV por capítulo")
    ap.add_argument("--tmp-out", required=True, help="Carpeta temporales (enh/norm)")
    ap.add_argument("--apple-out", help="Ruta final .m4b")
    ap.add_argument("--gplay-spotify-out", help="Carpeta raíz exportación GP/Spotify")
    ap.add_argument("--cover", help="Portada 3000x3000 px")

    # Parámetros de SSML plan
    ap.add_argument("--target-min", type=float, default=7.0)
    ap.add_argument("--hard-cap-min", type=float, default=8.0)
    ap.add_argument("--max-kb", type=int, default=48)
    ap.add_argument("--default-voice", default="es-ES-ElviraNeural")
    ap.add_argument("--default-stylepack", default="chapter_default")
    ap.add_argument("--wpm", type=float, default=165.0)
    ap.add_argument("--locale", default="es-PE")

    # TTS
    ap.add_argument("--tts-timeout", type=int, default=30)
    ap.add_argument("--tts-retries", type=int, default=4)
    ap.add_argument("--tts-workers", type=int, default=4)

    # Concat
    ap.add_argument("--gap-ms", type=int, default=700)
    ap.add_argument("--sr", type=int, default=44100)
    ap.add_argument("--channels", type=int, default=1)
    ap.add_argument("--sample-width", type=int, default=2)

    # Enhance (flags básicos; si quieres algo avanzado, edita aquí)
    ap.add_argument("--no-deess", action="store_true")
    ap.add_argument("--no-tilt", action="store_true")
    ap.add_argument("--no-expander", action="store_true")

    # Mastering
    ap.add_argument("--rms-target", type=float, default=-20.0)
    ap.add_argument("--peak-ceiling", type=float, default=-3.0)

    # Apple
    ap.add_argument("--book-title")
    ap.add_argument("--author")
    ap.add_argument("--year", type=int)
    ap.add_argument("--publisher")
    ap.add_argument("--description")
    ap.add_argument("--aac-bitrate", default="128k")

    # GPlay/Spotify
    ap.add_argument("--mp3-bitrate", default="256k")
    ap.add_argument("--flac", action="store_true")

    ap.add_argument("--force", action="store_true", help="Rehacer outputs existentes")
    return ap.parse_args(argv)

def main(argv: Optional[List[str]] = None) -> int:
    args = _parse_args(argv or sys.argv[1:])

    paths = Paths(
        project_root=Path(args.project_root).resolve(),
        dossier_dir=Path(args.dossier_dir).resolve(),
        chapters_txt_dir=Path(args.chapters_dir).resolve(),
        ssml_out_dir=Path(args.ssml_out).resolve(),
        ssml_xml_out_dir=Path(args.ssml_xml_out).resolve(),
        tts_chunks_out_dir=Path(args.tts_out).resolve(),
        chapters_wav_out_dir=Path(args.chapters_wav_out).resolve(),
        tmp_out_dir=Path(args.tmp_out).resolve(),
        apple_out_file=Path(args.apple_out).resolve() if args.apple_out else None,
        gplay_spotify_dir=Path(args.gplay_spotify_out).resolve() if args.gplay_spotify_out else None,
        cover_path=Path(args.cover).resolve() if args.cover else None,
    )
    dossier = _load_dossier(paths.dossier_dir)

    # Enhance config rápido (puedes integrarlo con production.settings si lo prefieres)
    enh_cfg = {
        "enable_deesser": (not args.no_deess),
        "enable_tilt":    (not args.no_tilt),
        "enable_expander":(not args.no_expander),
    }

    # Ejecutar etapa(s)
    if args.stage in ("ssml_plan","all"):
        stage_ssml_plan(paths, dossier, force=args.force,
                        target_minutes=args.target_min, hard_cap_minutes=args.hard_cap_min,
                        max_kb=args.max_kb, default_voice=args.default_voice,
                        default_stylepack=args.default_stylepack, wpm=args.wpm)

    if args.stage in ("ssml_xml","all"):
        stage_ssml_xml(paths, dossier, force=args.force, locale=args.locale, default_voice=args.default_voice)

    if args.stage in ("tts","all"):
        stage_tts(paths, force=args.force, timeout_s=args.tts_timeout, retries=args.tts_retries, max_workers=args.tts_workers)

    if args.stage in ("concat","all"):
        stage_concat(paths, dossier, force=args.force, gap_ms=args.gap_ms, sr_hz=args.sr, channels=args.channels, sample_width_bytes=args.sample_width)

    if args.stage in ("enhance","all"):
        stage_enhance(paths, dossier, force=args.force, enhance_cfg=enh_cfg)

    if args.stage in ("master","all"):
        stage_master(paths, dossier, force=args.force, rms_target_dbfs=args.rms_target, peak_ceiling_dbfs=args.peak_ceiling)

    if args.stage in ("qc","all"):
        stage_qc(paths, dossier, force=args.force)

    if args.stage in ("package_apple","all"):
        if not (args.book_title and args.author and paths.apple_out_file):
            raise SystemExit("Para package_apple necesitas --book-title --author --apple-out")
        stage_package_apple(paths, dossier, force=args.force, book_title=args.book_title, author=args.author,
                            year=args.year, publisher=args.publisher, description=args.description,
                            cover=paths.cover_path, aac_bitrate=args.aac_bitrate, sr=args.sr, channels=args.channels)

    if args.stage in ("package_gplay_spotify","all"):
        if not (args.book_title and args.author and paths.gplay_spotify_dir):
            raise SystemExit("Para package_gplay_spotify necesitas --book-title --author --gplay-spotify-out")
        album = AlbumMeta(book_title=args.book_title, author=args.author, year=args.year, label=args.publisher, description=args.description)
        stage_package_gplay_spotify(paths, dossier, force=args.force, out_dir=paths.gplay_spotify_dir, album_meta=album,
                                    cover=paths.cover_path, mp3_bitrate=args.mp3_bitrate, sr=args.sr, channels=args.channels, flac=args.flac)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
