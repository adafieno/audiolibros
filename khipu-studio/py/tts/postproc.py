# tts/postproc.py
# -*- coding: utf-8 -*-
"""
Post-procesamiento de TTS:
- Concatena WAVs de chunks → 1 WAV por capítulo.
- Inserta silencios de separación según configuración.
- Arregla desajustes sutiles de sample rate/canales si vinieran mezclados.

Requisitos:
  pip install pydub
  # y tener ffmpeg instalado en el sistema

API:
  concat_chunks(wav_paths, out_chapter_wav, *, gap_ms=700, sr_hz=44100, channels=1, sample_width_bytes=2) -> Path
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, List, Optional

from pydub import AudioSegment  # type: ignore

from core.log_utils import get_logger, log_span
from core.errors import AudiobookError

_LOG = get_logger("tts.postproc")


def _load_wav(path: Path) -> AudioSegment:
    """Carga WAV asegurando sample rate/canales consistentes al importar."""
    try:
        seg = AudioSegment.from_wav(path)
        return seg
    except Exception as e:
        raise AudiobookError(f"No se pudo cargar WAV: {path}", file=str(path), error=str(e))


def _ensure_format(seg: AudioSegment, *, sr_hz: int, channels: int, sample_width_bytes: int) -> AudioSegment:
    """Normaliza formato de audio (sr, canales, sample width)."""
    if seg.frame_rate != sr_hz:
        seg = seg.set_frame_rate(sr_hz)
    if seg.channels != channels:
        seg = seg.set_channels(channels)
    if seg.sample_width != sample_width_bytes:
        seg = seg.set_sample_width(sample_width_bytes)
    return seg


def concat_chunks(
    wav_paths: Iterable[str | Path],
    out_chapter_wav: str | Path,
    *,
    gap_ms: int = 700,
    sr_hz: int = 44100,
    channels: int = 1,
    sample_width_bytes: int = 2,
) -> Path:
    """
    Concatena en el orden provisto y escribe un único WAV.
    - gap_ms: silencio entre chunks (recomendado 600–1000 ms).
    - sr_hz/channels/sample_width_bytes: formato final.
    """
    wav_list: List[Path] = [Path(p) for p in wav_paths]
    if not wav_list:
        raise AudiobookError("No se recibieron WAVs para concatenar.")

    with log_span("tts.concat_chunks", extra={"count": len(wav_list), "gap_ms": gap_ms}):
        # Silencio entre piezas
        gap = AudioSegment.silent(duration=max(0, int(gap_ms)))

        acc: Optional[AudioSegment] = None
        for p in wav_list:
            seg = _ensure_format(_load_wav(p), sr_hz=sr_hz, channels=channels, sample_width_bytes=sample_width_bytes)
            if acc is None:
                acc = seg
            else:
                acc = acc + gap + seg

        assert acc is not None, "Acumulador vacío"
        outp = Path(out_chapter_wav)
        outp.parent.mkdir(parents=True, exist_ok=True)
        acc.export(outp, format="wav")
        _LOG.info("chapter_wav_built", extra={"file": str(outp), "ms": len(acc)})
        return outp


# ---------- CLI mínima ----------

if __name__ == "__main__":
    import argparse, json, sys
    ap = argparse.ArgumentParser(description="Concatena WAVs de chunks en un WAV por capítulo.")
    ap.add_argument("--list", required=True, help="Ruta a JSON con lista de paths WAV en orden.")
    ap.add_argument("--out", required=True, help="Ruta de salida WAV por capítulo.")
    ap.add_argument("--gap-ms", type=int, default=700)
    ap.add_argument("--sr", type=int, default=44100)
    ap.add_argument("--channels", type=int, default=1)
    ap.add_argument("--sample-width", type=int, default=2, help="bytes por muestra (2=16-bit)")
    args = ap.parse_args()

    paths = json.loads(Path(args.list).read_text(encoding="utf-8"))
    if not isinstance(paths, list):
        print("El archivo --list debe ser una lista JSON de rutas WAV.", file=sys.stderr)
        sys.exit(2)

    out = concat_chunks(paths, args.out, gap_ms=args.gap_ms, sr_hz=args.sr, channels=args.channels, sample_width_bytes=args.sample_width)
    print(f"Escrito: {out}")
