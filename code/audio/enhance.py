# audio/enhance.py
# -*- coding: utf-8 -*-
"""
Mejoras sutiles para voz TTS antes del mastering.

Cadena por defecto (toda opcional y parametrizable):
  1) High-pass IIR (quita rumble/subgraves).
  2) Notch hum 50/60 Hz (y armónicas) si se habilita.
  3) De-esser simple (banda 5–9 kHz con ganancia dinámica).
  4) Tilt EQ leve (+1 dB/8k, -1 dB/200 Hz aprox.) — opcional.
  5) Downward expander leve (suaviza respiraciones/ambiente).
  6) Mezcla dry/wet por etapa y global.

Requisitos:
  pip install soundfile scipy numpy

Uso:
  from audio.enhance import enhance_voice
  enhance_voice("in.wav","out_enh.wav", cfg={...})
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Dict, Any, Tuple, Optional, List
from pathlib import Path
import math
import numpy as np

try:
    import soundfile as sf  # type: ignore
    from scipy import signal as sp  # type: ignore
except Exception as e:
    raise RuntimeError("Instala 'soundfile' y 'scipy' para usar audio/enhance.py") from e


# ==========================
# Utilidades de E/S y mezcla
# ==========================

def _read_float_pcm(path: Path) -> Tuple[np.ndarray, int]:
    x, sr = sf.read(str(path), always_2d=True, dtype="float32")
    return x, int(sr)

def _write_float_pcm(path: Path, x: np.ndarray, sr: int) -> None:
    x = np.clip(x, -1.0, 1.0).astype(np.float32)
    sf.write(str(path), x, sr, subtype="PCM_16")

def _to_mono(x: np.ndarray) -> np.ndarray:
    return np.mean(x, axis=1, dtype=np.float32) if x.shape[1] > 1 else x[:, 0]

def _mono_to_channels(x: np.ndarray, ch: int) -> np.ndarray:
    if ch == 1:
        return x.reshape(-1, 1)
    return np.stack([x]*ch, axis=1)

def _mix(dry: np.ndarray, wet: np.ndarray, amt: float) -> np.ndarray:
    amt = float(min(1.0, max(0.0, amt)))
    return (1.0 - amt) * dry + amt * wet


# ==========================
# Filtros básicos
# ==========================

def _butter_hp(sr: int, fcut: float, order: int = 2):
    sos = sp.butter(order, fcut / (sr/2.0), btype="highpass", output="sos")
    return sos

def _biquad_notch(sr: int, f0: float, Q: float = 35.0):
    # notch IIR en forma SOS
    w0 = 2.0 * math.pi * f0 / sr
    alpha = math.sin(w0)/(2.0*Q)
    b0 = 1.0
    b1 = -2.0*math.cos(w0)
    b2 = 1.0
    a0 = 1.0 + alpha
    a1 = -2.0*math.cos(w0)
    a2 = 1.0 - alpha
    b = np.array([b0, b1, b2], dtype=np.float64) / a0
    a = np.array([1.0, a1/a0, a2/a0], dtype=np.float64)
    sos = sp.tf2sos(b, a)
    return sos

def _apply_sos(x: np.ndarray, sos: np.ndarray) -> np.ndarray:
    return sp.sosfilt(sos, x).astype(np.float32)


# ==========================
# De-esser simple (banda sibilante)
# ==========================

def _bandpass(sr: int, f1: float, f2: float, order: int = 4):
    sos = sp.butter(order, [f1/(sr/2.0), f2/(sr/2.0)], btype="bandpass", output="sos")
    return sos

def _deesser(x: np.ndarray, sr: int, f1=5000.0, f2=9000.0, thresh_db=-28.0, ratio=3.0, makeup_db=0.0) -> np.ndarray:
    """
    De-esser básico por detección de energía en banda (RMS ventana corta) y reducción suave.
    - thresh_db: umbral en dBFS aprox. de banda sibilante
    - ratio: compresión por encima del umbral
    """
    sos = _bandpass(sr, f1, f2, order=4)
    sib = _apply_sos(x, sos)
    # medidor RMS móvil (ventana 5 ms)
    win = max(8, int(sr * 0.005))
    # energía por ventana (sin solape; luego upsample simple)
    n = len(sib)
    pad = (win - (n % win)) % win
    pad_sig = np.pad(sib, (0, pad), mode="constant")
    frames = pad_sig.reshape(-1, win)
    rms = np.sqrt(np.mean(frames**2, axis=1) + 1e-12).astype(np.float32)
    # a dBFS
    rms_db = 20.0 * np.log10(np.clip(rms, 1e-9, 1.0))
    # ganancia por frame
    over = np.maximum(0.0, rms_db - thresh_db)
    gain_db = -(over * (1.0 - 1.0/ratio))  # reducción creciente
    # makeup (en banda) opcional
    gain_db += float(makeup_db)
    gain_lin = 10.0 ** (gain_db / 20.0)
    # expandir a longitud original
    gain = np.repeat(gain_lin, win)[:len(pad_sig)]
    gain = gain[:n]
    # aplicar como multibanda (sustrae componente sibilante comprimida)
    wet = x - sib + (sib * gain.astype(np.float32))
    return wet.astype(np.float32)


# ==========================
# Tilt EQ leve (shelf +1 dB @8k / -1 dB @200 Hz aprox.)
# ==========================

def _first_order_shelf(sr: int, f0: float, gain_db: float, high: bool = True):
    """
    Shelf de 1er orden (suave). Para tilt combinamos un low-shelf y un high-shelf.
    """
    A = 10.0 ** (gain_db / 40.0)
    w0 = 2.0 * math.pi * f0 / sr
    alpha = math.sin(w0)/2.0 * math.sqrt((A + 1/A) * (1/0.707 - 1) + 2)
    cosw = math.cos(w0)

    if high:
        b0 =    A*((A+1) + (A-1)*cosw + 2*math.sqrt(A)*alpha)
        b1 = -2*A*((A-1) + (A+1)*cosw)
        b2 =    A*((A+1) + (A-1)*cosw - 2*math.sqrt(A)*alpha)
        a0 =        (A+1) - (A-1)*cosw + 2*math.sqrt(A)*alpha
        a1 =    2*((A-1) - (A+1)*cosw)
        a2 =        (A+1) - (A-1)*cosw - 2*math.sqrt(A)*alpha
    else:
        b0 =    A*((A+1) - (A-1)*cosw + 2*math.sqrt(A)*alpha)
        b1 =  2*A*((A-1) - (A+1)*cosw)
        b2 =    A*((A+1) - (A-1)*cosw - 2*math.sqrt(A)*alpha)
        a0 =        (A+1) + (A-1)*cosw + 2*math.sqrt(A)*alpha
        a1 =   -2*((A-1) + (A+1)*cosw)
        a2 =        (A+1) + (A-1)*cosw - 2*math.sqrt(A)*alpha

    sos = sp.tf2sos([b0/a0, b1/a0, b2/a0], [1.0, a1/a0, a2/a0])
    return sos

def _apply_tilt(x: np.ndarray, sr: int, low_db: float = -1.0, high_db: float = +1.0, f_low: float = 200.0, f_high: float = 8000.0) -> np.ndarray:
    low = _apply_sos(x, _first_order_shelf(sr, f_low, low_db, high=False))
    out = _apply_sos(low, _first_order_shelf(sr, f_high, high_db, high=True))
    return out


# ==========================
# Expander simple (downward)
# ==========================

def _downward_expander(x: np.ndarray, thresh_db=-48.0, ratio=1.6, makeup_db=0.0, sr: int = 44100) -> np.ndarray:
    """
    Reduce niveles por debajo del umbral (suave). Útil para respiraciones y ruido leve.
    """
    # nivel instantáneo con ventana 10 ms
    win = max(16, int(sr * 0.01))
    n = len(x)
    pad = (win - (n % win)) % win
    pad_sig = np.pad(x, (0, pad), mode="constant")
    frames = pad_sig.reshape(-1, win)
    rms = np.sqrt(np.mean(frames**2, axis=1) + 1e-12).astype(np.float32)
    rms_db = 20.0 * np.log10(np.clip(rms, 1e-9, 1.0))

    below = np.maximum(0.0, thresh_db - rms_db)
    # más por debajo ⇒ más reducción (ratio > 1)
    gain_db = -(below * (1.0 - 1.0/ratio)) + float(makeup_db)
    gain = 10.0 ** (gain_db / 20.0)
    gain = np.repeat(gain, win)[:len(pad_sig)]
    gain = gain[:n]
    return (x * gain.astype(np.float32)).astype(np.float32)


# ==========================
# Config y motor
# ==========================

@dataclass
class EnhanceConfig:
    # 1) HPF
    enable_hp: bool = True
    hp_fcut_hz: float = 80.0
    hp_order: int = 2
    hp_mix: float = 1.0

    # 2) Hum notch (y armónicas)
    enable_hum: bool = False
    hum_base_hz: float = 50.0   # 60.0 para países 60 Hz
    hum_harmonics: int = 3
    hum_Q: float = 35.0
    hum_mix: float = 1.0

    # 3) De-esser
    enable_deesser: bool = True
    deess_f1_hz: float = 5000.0
    deess_f2_hz: float = 9000.0
    deess_thresh_db: float = -28.0
    deess_ratio: float = 3.0
    deess_makeup_db: float = 0.0
    deess_mix: float = 0.8

    # 4) Tilt EQ
    enable_tilt: bool = True
    tilt_low_db: float = -1.0
    tilt_high_db: float = +1.0
    tilt_f_low_hz: float = 200.0
    tilt_f_high_hz: float = 8000.0
    tilt_mix: float = 0.6

    # 5) Expander
    enable_expander: bool = True
    exp_thresh_db: float = -48.0
    exp_ratio: float = 1.6
    exp_makeup_db: float = 0.0
    exp_mix: float = 0.7

    # 6) Mezcla global
    global_mix: float = 1.0  # 0=solo dry, 1=solo wet


def enhance_voice(
    in_wav: str | Path,
    out_wav: str | Path,
    cfg: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Aplica la cadena de mejoras con parámetros por defecto seguros.
    Devuelve resumen con config efectiva y picos antes/después.
    """
    ec = EnhanceConfig(**(cfg or {}))
    in_path = Path(in_wav)
    out_path = Path(out_wav)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    x, sr = _read_float_pcm(in_path)
    ch = x.shape[1]
    mono = _to_mono(x)

    dry = mono.copy()
    wet = mono.copy()

    # 1) HPF
    if ec.enable_hp:
        sos = _butter_hp(sr, ec.hp_fcut_hz, ec.hp_order)
        hp = _apply_sos(wet, sos)
        wet = _mix(wet, hp, ec.hp_mix)

    # 2) HUM notch
    if ec.enable_hum:
        w = wet
        for h in range(1, ec.hum_harmonics + 1):
            sos = _biquad_notch(sr, ec.hum_base_hz * h, Q=ec.hum_Q)
            w = _apply_sos(w, sos)
        wet = _mix(wet, w, ec.hum_mix)

    # 3) De-esser
    if ec.enable_deesser:
        de = _deesser(wet, sr, ec.deess_f1_hz, ec.deess_f2_hz, ec.deess_thresh_db, ec.deess_ratio, ec.deess_makeup_db)
        wet = _mix(wet, de, ec.deess_mix)

    # 4) Tilt EQ
    if ec.enable_tilt:
        tl = _apply_tilt(wet, sr, ec.tilt_low_db, ec.tilt_high_db, ec.tilt_f_low_hz, ec.tilt_f_high_hz)
        wet = _mix(wet, tl, ec.tilt_mix)

    # 5) Expander
    if ec.enable_expander:
        ex = _downward_expander(wet, ec.exp_thresh_db, ec.exp_ratio, ec.exp_makeup_db, sr=sr)
        wet = _mix(wet, ex, ec.exp_mix)

    # Mezcla global
    y = _mix(dry, wet, ec.global_mix)
    y = np.clip(y, -1.0, 1.0).astype(np.float32)
    y_st = _mono_to_channels(y, ch)

    _write_float_pcm(out_path, y_st, sr)

    # Métricas básicas
    def _peak_db(z: np.ndarray) -> float:
        p = float(np.max(np.abs(z))) if z.size else 0.0
        return 20.0 * math.log10(max(p, 1e-9))

    return {
        "in": {"path": str(in_path), "peak_dbfs": _peak_db(dry)},
        "out": {"path": str(out_path), "peak_dbfs": _peak_db(y)},
        "sr_hz": sr,
        "channels": ch,
        "config": asdict(ec),
    }


# -------------- CLI mínima --------------

if __name__ == "__main__":
    import argparse, json
    ap = argparse.ArgumentParser(description="Mejoras sutiles para voz TTS (pre-master).")
    ap.add_argument("--in", dest="infile", required=True)
    ap.add_argument("--out", dest="outfile", required=True)
    ap.add_argument("--hum", action="store_true", help="Activar notch de hum (50 Hz por defecto).")
    ap.add_argument("--hum-base", type=float, default=50.0)
    ap.add_argument("--hum-harm", type=int, default=3)
    ap.add_argument("--deess", action="store_true")
    ap.add_argument("--tilt", action="store_true")
    ap.add_argument("--expander", action="store_true")
    ap.add_argument("--mix", type=float, default=1.0)
    args = ap.parse_args()

    cfg = {
        "enable_hum": args.hum,
        "hum_base_hz": args.hum_base,
        "hum_harmonics": args.hum_harm,
        "enable_deesser": True if args.deess else False,
        "enable_tilt": True if args.tilt else False,
        "enable_expander": True if args.expander else False,
        "global_mix": args.mix,
    }
    res = enhance_voice(args.infile, args.outfile, cfg=cfg)
    print(json.dumps(res, ensure_ascii=False, indent=2))
