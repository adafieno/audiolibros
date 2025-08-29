# tts/azure_client.py
# -*- coding: utf-8 -*-
"""
Azure TTS (REST) – Síntesis de SSML a WAV.

Requisitos:
  pip install requests

Entradas clave:
  - ssml_xml: cadena SSML válida (namespaces correctos).
  - out_wav_path: ruta donde guardar el WAV.
  - cfg: instancia de AzureTTSCfg (ver core.config).

Características:
  - Autenticación por token (emitido por región).
  - Selección de formato WAV según sr/bit/ch config.
  - Reintentos con backoff ante 429/5xx y errores de red.
  - batch_synthesize: procesa múltiples (ssml->wav) en paralelo.

Nota:
  - Si prefieres el SDK oficial, puedes crear un cliente alternativo.
  - Este cliente REST es suficiente para pipelines headless/CI.

"""

from __future__ import annotations

import io
import time
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional, Tuple, Dict, Any
import requests

from core.config import load_config, AzureTTSCfg
from core.errors import TTSAuthError, TTSSynthesisError, TTSRateLimit
from core.logging import get_logger, log_span

_LOG = get_logger("tts.azure")


# -------------------------------------------------------------------
# Utilidades de formato de audio
# -------------------------------------------------------------------

def _audio_format_from_cfg(cfg: AzureTTSCfg) -> str:
    """
    Mapea la config a un formato de salida Azure.
    Ejemplos válidos:
      - riff-44100hz-16bit-mono-pcm
      - riff-48000hz-16bit-mono-pcm
      - riff-44100hz-24bit-mono-pcm
    """
    sr = int(cfg.sample_rate_hz or 44100)
    bit = int(cfg.bit_depth or 16)
    ch = int(cfg.channels or 1)
    ch_s = "mono" if ch == 1 else "stereo"
    return f"riff-{sr}hz-{bit}bit-{ch_s}-pcm"


# -------------------------------------------------------------------
# Token y endpoints
# -------------------------------------------------------------------

def _token_endpoint(region: str) -> str:
    # Endpoint clásico de emisión de token:
    # (nota: algunas regiones usan 'issuetoken' todo en minúscula)
    return f"https://{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken"

def _tts_endpoint(region: str) -> str:
    # Endpoint de síntesis (text-to-speech)
    return f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"


@dataclass
class _AuthState:
    token: Optional[str] = None
    expires_at: float = 0.0  # epoch seconds


def _fetch_token(region: str, key: str, timeout: int = 10) -> str:
    """
    Solicita un token de acceso (válido ~10 minutos).
    """
    url = _token_endpoint(region)
    headers = {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Length": "0",
    }
    resp = requests.post(url, headers=headers, timeout=timeout)
    if resp.status_code != 200:
        raise TTSAuthError(f"Fallo al obtener token Azure TTS: {resp.status_code}", url=url, body=resp.text[:200])
    return resp.text.strip()


# -------------------------------------------------------------------
# Backoff / reintentos
# -------------------------------------------------------------------

def _sleep_backoff(attempt: int, base: float = 0.75, cap: float = 8.0) -> None:
    delay = min(cap, base * (2 ** attempt)) * (0.6 + random.random() * 0.8)
    time.sleep(delay)

_RETRY_STATUS = {408, 429, 500, 502, 503, 504}


# -------------------------------------------------------------------
# API pública
# -------------------------------------------------------------------

def synthesize_ssml(
    ssml_xml: str,
    out_wav_path: str | Path,
    cfg: Optional[AzureTTSCfg] = None,
    *,
    timeout_s: int = 30,
    retries: int = 4,
) -> Path:
    """
    Sintetiza un SSML a WAV (bloqueante). Devuelve la ruta escrita.
    - Maneja el ciclo de token automáticamente.
    - Reintenta ante rate-limit/errores transitorios.
    """
    app_cfg = load_config()
    az = cfg or app_cfg.azure_tts
    az.require()

    auth = _AuthState()
    fmt = _audio_format_from_cfg(az)
    outp = Path(out_wav_path)
    outp.parent.mkdir(parents=True, exist_ok=True)

    with log_span("tts.synthesize", extra={"out": str(outp), "fmt": fmt}):
        last_exc: Optional[Exception] = None

        for attempt in range(retries + 1):
            try:
                # Renovar token si es necesario
                now = time.time()
                if not auth.token or now >= auth.expires_at:
                    token = _fetch_token(az.region, az.key, timeout=timeout_s)
                    auth.token = token
                    auth.expires_at = now + 9 * 60  # 9 min para margen

                # POST de síntesis
                headers = {
                    "Authorization": f"Bearer {auth.token}",
                    "Content-Type": "application/ssml+xml",
                    "X-Microsoft-OutputFormat": fmt,
                    "User-Agent": "AudiobooksPipeline/1.0",
                }
                url = _tts_endpoint(az.region)
                resp = requests.post(url, data=ssml_xml.encode("utf-8"), headers=headers, timeout=timeout_s)

                # Manejo de respuestas
                if resp.status_code == 200:
                    # WAV binario en resp.content
                    outp.write_bytes(resp.content)
                    _LOG.info("tts_written", extra={"file": str(outp), "bytes": len(resp.content)})
                    return outp

                # Tokens caducos pueden venir como 401/403
                if resp.status_code in (401, 403):
                    # fuerza renovación para el siguiente intento
                    auth.token = None
                    auth.expires_at = 0.0

                if resp.status_code == 429:
                    last_exc = TTSRateLimit(f"429 Rate limit (Azure TTS): retrying…", retry_after=resp.headers.get("Retry-After"))
                    _sleep_backoff(attempt)
                    continue

                if resp.status_code in _RETRY_STATUS:
                    last_exc = TTSSynthesisError(f"HTTP {resp.status_code} transitorio en Azure TTS", status=resp.status_code, body=resp.text[:200])
                    _sleep_backoff(attempt)
                    continue

                # Errores no recuperables
                raise TTSSynthesisError(
                    f"Fallo de síntesis Azure TTS (HTTP {resp.status_code})",
                    status=resp.status_code,
                    body=resp.text[:500]
                )

            except (requests.Timeout, requests.ConnectionError) as e:
                last_exc = e
                _sleep_backoff(attempt)
                continue
            except TTSAuthError as e:
                # Autenticación fallida: no tiene sentido reintentar muchas veces
                raise
            except Exception as e:
                last_exc = e
                _sleep_backoff(attempt)
                continue

        # Si llegamos aquí, agotamos reintentos
        raise TTSSynthesisError("Agotados los reintentos de síntesis Azure TTS", last_error=str(last_exc) if last_exc else "unknown")


def batch_synthesize(
    items: Iterable[Tuple[str | Path, str | Path]],
    *,
    cfg: Optional[AzureTTSCfg] = None,
    timeout_s: int = 30,
    retries: int = 4,
    max_workers: int = 4,
) -> List[Path]:
    """
    Sintetiza múltiples SSML en paralelo (ThreadPoolExecutor).
    `items` = iterable de (ssml_path, wav_out_path).
    Devuelve lista de WAVs generados (en orden de finalización).
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    az = cfg or load_config().azure_tts
    az.require()
    results: List[Path] = []

    def _task(ssml_path: str | Path, out_wav: str | Path) -> Path:
        xml = Path(ssml_path).read_text(encoding="utf-8")
        return synthesize_ssml(xml, out_wav, cfg=az, timeout_s=timeout_s, retries=retries)

    with log_span("tts.batch", extra={"count": len(list(items))}):
        # Convertimos a lista para logging y seguridad (por si es un generador de una sola pasada)
        pairs = [(str(a), str(b)) for a, b in items]
        with ThreadPoolExecutor(max_workers=max_workers) as ex:
            futs = [ex.submit(_task, a, b) for a, b in pairs]
            for f in as_completed(futs):
                p = f.result()
                results.append(p)
                _LOG.info("tts_done", extra={"file": str(p)})

    return results
