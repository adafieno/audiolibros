# audio/metrics.py
# -*- coding: utf-8 -*-
"""
Métricas técnicas de audio para control de calidad.

Requisitos recomendados:
  pip install soundfile numpy
Opcional (fallback):
  pip install pydub

Métricas:
- rms_dbfs: nivel RMS en dBFS (canal mezclado a mono)
- true_peak_dbfs: pico aproximado en dBFS (oversampling x4)
- noise_floor_dbfs: piso de ruido estimado (percentil 10 de energía por ventanas)
- lufs_like: estimación rápida tipo LUFS (no EBU-compliant)
- clipped: bool (si se detecta clipping digital)

API:
  analyze(path) -> dict

CLI:
  python -m audio.metrics --in audio/wav/ch01.wav
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

import numpy as np

try:
    import soundfile as sf  # type: ignore
except Exception:
    sf = None

try:
    from pydub import AudioSegment  # type: ignore
except Exception:
    AudioSegment = None


# -------------------- Helpers de E/S --------------------

def _load_audio(path: Path) -> Tuple[np.ndarray, int]:
    """
    Carga audio como np.float32 en rango [-1,1], shape (num_samples, channels).
    Prioriza soundfile. Fallback: pydub.
    """
    if sf is not None:
        data, sr = sf.read(str(path), always_2d=True)  # (N, C)
        # Convertir a float32 [-1,1] si viene en int
        if np.issubdtype(data.dtype, np.integer):
            max_int = np.iinfo(data.dtype).max
            data = data.astype(np.float32) / max_int
        else:
            data = data.astype(np.float32)
        return data, int(sr)
    elif AudioSegment is not None:
        seg = AudioSegment.from_file(path)
        sr = seg.frame_rate
        ch = seg.channels
        arr = np.array(seg.get_array_of_samples(), dtype=np.float32)
        if ch > 1:
            arr = arr.reshape((-1, ch))
        else:
            arr = arr.reshape((-1, 1))
        # Escalar según sample_width
        max_int = float(2 ** (8 * seg.sample_width - 1))
        data = (arr / max_int).astype(np.float32)
        return data, int(sr)
    else:
        raise RuntimeError("No hay backend de audio disponible. Instala 'soundfile' o 'pydub'.")


def _mix_to_mono(x: np.ndarray) -> np.ndarray:
    if x.shape[1] == 1:
        return x[:, 0]
    return np.mean(x, axis=1)


# -------------------- Métricas --------------------

def _rms_dbfs(x: np.ndarray, eps: float = 1e-12) -> float:
    rms = np.sqrt(np.mean(np.square(x), dtype=np.float64))
    return 20.0 * math.log10(max(rms, eps))

def _true_peak_dbfs(x: np.ndarray, oversample: int = 4, eps: float = 1e-12) -> float:
    """
    Pico aproximado por oversampling simple (interpolación FIR básica con sinc).
    No es un medidor ITU-R BS.1770 exacto, pero es útil para QA.
    """
    if oversample <= 1:
        peak = float(np.max(np.abs(x)))
        return 20 * math.log10(max(peak, eps))
    # Upsample por inserción de ceros + filtro lowpass (sinc windowed)
    n = len(x)
    up = np.zeros(n * oversample, dtype=np.float32)
    up[::oversample] = x
    # Filtro FIR lowpass
    # Corte a 0.9*(pi/oversample)
    taps = 64 * oversample
    t = np.arange(-taps//2, taps//2 + 1, dtype=np.float32)
    sinc = np.sinc(t / oversample)
    window = np.hamming(len(sinc)).astype(np.float32)
    h = (sinc * window).astype(np.float32)
    h /= np.sum(h)
    y = np.convolve(up, h, mode="same")
    peak = float(np.max(np.abs(y)))
    return 20 * math.log10(max(peak, eps))

def _noise_floor_dbfs(x: np.ndarray, sr: int, win_ms: int = 400) -> float:
    """
    Piso de ruido estimado: percentil 10 del RMS por ventana.
    """
    win = max(1, int(sr * win_ms / 1000))
    if len(x) < win:
        return _rms_dbfs(x)
    # Ventaneo sin solape
    frames = x[: len(x) - (len(x) % win)].reshape(-1, win)
    rms_frames = np.sqrt(np.mean(frames ** 2, axis=1) + 1e-12)
    p10 = np.percentile(rms_frames, 10)
    return 20 * math.log10(max(float(p10), 1e-12))

def _lufs_like(x: np.ndarray, sr: int) -> float:
    """
    Estimación rápida tipo LUFS aplicando un filtro K-weighting simplificado
    y gating grosero. Útil para comparativa interna (NO para certificación).
    """
    # K-weighting (simplificado): filtro high-shelf ~ +4 dB above 1 kHz
    # Implementación burda: derivada + mezcla
    # (Esto es un placeholder razonable; para EBU exacto usa pyloudnorm)
    y = np.copy(x).astype(np.float64)
    # highpass 150 Hz (IIR simple)
    alpha = math.exp(-2 * math.pi * 150.0 / sr)
    hp = np.zeros_like(y)
    prev = 0.0
    for i in range(len(y)):
        prev = alpha * prev + (1 - alpha) * y[i]
        hp[i] = y[i] - prev
    # RMS global post-filtro
    rms = np.sqrt(np.mean(hp ** 2) + 1e-12)
    lufs = 20 * math.log10(rms + 1e-12)  # offset ignorado
    return float(lufs)


# -------------------- API pública --------------------

def analyze(path: str | Path) -> Dict[str, Any]:
    """
    Devuelve métricas clave para QA técnico.
    """
    p = Path(path)
    data, sr = _load_audio(p)
    mono = _mix_to_mono(data)

    rms = _rms_dbfs(mono)
    tpeak = _true_peak_dbfs(mono, oversample=4)
    noise = _noise_floor_dbfs(mono, sr=sr)
    lufs = _lufs_like(mono, sr=sr)

    clipped = (tpeak >= -0.1)  # umbral cercano a 0 dBFS

    return {
        "path": str(p),
        "sr_hz": int(sr),
        "duration_s": round(len(mono) / sr, 3),
        "rms_dbfs": round(rms, 2),
        "true_peak_dbfs": round(tpeak, 2),
        "noise_floor_dbfs": round(noise, 2),
        "lufs_like": round(lufs, 2),
        "clipped": bool(clipped),
    }


# -------------------- CLI --------------------

if __name__ == "__main__":
    import argparse, json
    ap = argparse.ArgumentParser(description="Métricas técnicas para QA.")
    ap.add_argument("--in", dest="infile", required=True)
    args = ap.parse_args()
    res = analyze(args.infile)
    print(json.dumps(res, ensure_ascii=False, indent=2))
