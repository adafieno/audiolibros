# audio/mastering.py
# -*- coding: utf-8 -*-
"""
Mastering técnico para audiolibros:
1) Calcula RMS actual y aplica ganancia para alcanzar un objetivo.
2) Aplica ceiling de picos (headroom) para garantizar margen (ej., -3 dBFS).
3) Verifica métricas post-proceso.

Requisitos:
  pip install soundfile numpy
  # opcional (fallback/IO): pip install pydub  (y ffmpeg instalado)

API:
  normalize(
      in_wav: str|Path,
      out_wav: str|Path,
      *,
      rms_target_dbfs=(-20.0, rango aceptable),
      peak_ceiling_dbfs=-3.0,
      max_gain_db=+12.0,
      min_gain_db=-20.0,
      true_peak_oversample=4
  ) -> dict   # métricas antes/después y ganancia aplicada

CLI:
  python -m audio.mastering --in audio/wav/ch01.wav --out deliverables/tmp/ch01_norm.wav \
         --rms -20 --ceiling -3
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Dict, Any, Tuple

import numpy as np

try:
    import soundfile as sf  # type: ignore
except Exception:
    sf = None

try:
    from pydub import AudioSegment  # type: ignore
except Exception:
    AudioSegment = None

from audio.metrics import analyze  # reutilizamos métricas (RMS, true-peak aprox., etc.)


# -------------------- E/S helpers --------------------

def _load_float_pcm(path: Path) -> Tuple[np.ndarray, int]:
    """
    Devuelve (audio, sr). Audio en float32 rango [-1,1], shape (N, C).
    """
    if sf is None:
        if AudioSegment is None:
            raise RuntimeError("Necesitas 'soundfile' o 'pydub' para procesar audio.")
        seg = AudioSegment.from_file(path)
        sr = seg.frame_rate
        ch = seg.channels
        arr = np.array(seg.get_array_of_samples(), dtype=np.float32)
        if ch > 1:
            arr = arr.reshape((-1, ch))
        else:
            arr = arr.reshape((-1, 1))
        max_int = float(2 ** (8 * seg.sample_width - 1))
        x = (arr / max_int).astype(np.float32)
        return x, int(sr)

    data, sr = sf.read(str(path), always_2d=True)
    if np.issubdtype(data.dtype, np.integer):
        max_int = np.iinfo(data.dtype).max
        data = data.astype(np.float32) / max_int
    else:
        data = data.astype(np.float32)
    return data, int(sr)


def _write_float_pcm(path: Path, x: np.ndarray, sr: int) -> None:
    """
    Escribe WAV 16-bit PCM desde array float32 [-1,1].
    """
    x = np.clip(x, -1.0, 1.0)
    if sf is not None:
        sf.write(str(path), x, sr, subtype="PCM_16")
        return
    # fallback a pydub
    if AudioSegment is None:
        raise RuntimeError("No hay backend para escribir WAV. Instala 'soundfile' o 'pydub'.")
    # pydub espera int16
    y = (x * 32767.0).astype(np.int16)
    if y.ndim == 2 and y.shape[1] == 2:
        samples = y.reshape((-1,))
        seg = AudioSegment(
            samples.tobytes(),
            frame_rate=sr,
            sample_width=2,
            channels=2,
        )
    elif y.ndim == 2 and y.shape[1] == 1:
        seg = AudioSegment(
            y[:, 0].tobytes(),
            frame_rate=sr,
            sample_width=2,
            channels=1,
        )
    else:
        raise ValueError("Forma de audio no soportada para pydub.")
    seg.export(str(path), format="wav")


# -------------------- DSP helpers --------------------

def _db_to_lin(db: float) -> float:
    return 10.0 ** (db / 20.0)

def _lin_to_db(lin: float, eps: float = 1e-12) -> float:
    return 20.0 * math.log10(max(lin, eps))

def _rms(x: np.ndarray, eps: float = 1e-12) -> float:
    if x.ndim == 2:
        x_mono = np.mean(x, axis=1, dtype=np.float32)
    else:
        x_mono = x
    return float(np.sqrt(np.mean(x_mono**2) + eps))

def _apply_gain(x: np.ndarray, gain_db: float) -> np.ndarray:
    return (x * _db_to_lin(gain_db)).astype(np.float32)

def _peak(x: np.ndarray) -> float:
    return float(np.max(np.abs(x))) if x.size else 0.0


# -------------------- Mastering core --------------------

def normalize(
    in_wav: str | Path,
    out_wav: str | Path,
    *,
    rms_target_dbfs: float = -20.0,
    peak_ceiling_dbfs: float = -3.0,
    max_gain_db: float = +12.0,
    min_gain_db: float = -20.0,
    true_peak_oversample: int = 4,
) -> Dict[str, Any]:
    """
    Ajusta la ganancia a un RMS objetivo y garantiza headroom de pico.
    Notas:
    - Si alcanzar el RMS rompería el ceiling de pico, se recorta la ganancia.
    - No aplica compresión; solo ganancia lineal y (si hiciera falta) *soft ceiling*.
    """
    in_path = Path(in_wav)
    out_path = Path(out_wav)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Cargamos
    x, sr = _load_float_pcm(in_path)
    pre = analyze(in_path)  # métricas iniciales

    # --- Paso 1: ganancia por RMS ---
    current_rms = _rms(x)
    current_rms_db = _lin_to_db(current_rms)
    needed_db = float(rms_target_dbfs - current_rms_db)
    # clamp de seguridad
    needed_db = max(min_gain_db, min(max_gain_db, needed_db))

    x1 = _apply_gain(x, needed_db)

    # --- Paso 2: ceiling de picos ---
    # Medimos pico “digital” (aprox. true peak se evalúa con analyze luego).
    peak_abs = _peak(x1)
    peak_db = _lin_to_db(peak_abs) if peak_abs > 0 else -100.0
    if peak_db > peak_ceiling_dbfs:
        # Reducir ganancia para acomodar headroom sin clip.
        reduce_db = peak_db - peak_ceiling_dbfs
        x1 = _apply_gain(x1, -reduce_db)

        # Recalcula ganancia total efectiva aplicada
        needed_db = needed_db - reduce_db

    # (Opcional) Soft ceiling muy suave si queda 0.5 dB por encima por overshoot:
    # Aquí preferimos no colorear; confiar en ajuste de ganancia.

    # Escribimos
    _write_float_pcm(out_path, x1, sr)

    # Métricas post
    post = analyze(out_path)

    return {
        "in": pre,
        "out": post,
        "gain_db_applied": round(needed_db, 2),
        "ceiling_dbfs": peak_ceiling_dbfs,
        "ok": (
            (post["rms_dbfs"] <= rms_target_dbfs + 0.8) and
            (post["rms_dbfs"] >= rms_target_dbfs - 1.2) and
            (post["true_peak_dbfs"] <= peak_ceiling_dbfs + 0.4) and
            (not post["clipped"])
        )
    }


# -------------------- CLI --------------------

if __name__ == "__main__":
    import argparse, json
    ap = argparse.ArgumentParser(description="Normalización técnica (RMS + pico ceiling).")
    ap.add_argument("--in", dest="infile", required=True)
    ap.add_argument("--out", dest="outfile", required=True)
    ap.add_argument("--rms", type=float, default=-20.0, help="Objetivo RMS (dBFS)")
    ap.add_argument("--ceiling", type=float, default=-3.0, help="Ceiling de pico (dBFS)")
    ap.add_argument("--max-gain", type=float, default=+12.0)
    ap.add_argument("--min-gain", type=float, default=-20.0)
    args = ap.parse_args()

    res = normalize(
        args.infile, args.outfile,
        rms_target_dbfs=args.rms,
        peak_ceiling_dbfs=args.ceiling,
        max_gain_db=args.max_gain,
        min_gain_db=args.min_gain,
    )
    print(json.dumps(res, ensure_ascii=False, indent=2))
