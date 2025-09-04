# tts/azure_client.py
# -*- coding: utf-8 -*-
"""
Azure TTS (REST) – Síntesis de SSML a WAV.

Requisitos:
  pip install requests

Características clave
- Autenticación por token (caché ~9 min).
- Formato WAV configurable a partir de cfg (sr/bit/ch).
- Reintentos con honor a Retry-After + backoff con jitter.
- Preflight del SSML (vacío / BOM / tamaño).
- batch_synthesize: paralelo (N workers).
- batch_synthesize_dir: sintetiza *.ssml.xml de una carpeta.
- CLI para 1 archivo o carpeta completa.
- (Opcional) sidecar JSON con metadatos de respuesta.

Depende de:
  core.config.load_config, AzureTTSCfg
  core.errors: TTSAuthError, TTSSynthesisError, TTSRateLimit
  core.logging: get_logger, log_span
"""

from __future__ import annotations

import io
import time
import random
import email.utils as eut
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional, Tuple, Dict, Any
import requests
import os
import sys

_pkg_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _pkg_root not in sys.path:
    sys.path.insert(0, _pkg_root)


from core.config import load_config, AzureTTSCfg
from core.errors import TTSAuthError, TTSSynthesisError, TTSRateLimit
from core.logging import get_logger, log_span

_LOG = get_logger("tts.azure")


# -------------------------------------------------------------------
# Utilidades de formato de audio
# -------------------------------------------------------------------

def _audio_format_from_cfg(cfg: AzureTTSCfg) -> str:
    """
    Mapea la config a un formato de salida Azure (WAV PCM).
    Ejemplos válidos:
      - riff-44100hz-16bit-mono-pcm
      - riff-48000hz-16bit-stereo-pcm
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
    return f"https://{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken"

def _tts_endpoint(region: str) -> str:
    return f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"


@dataclass
class _AuthState:
    token: Optional[str] = None
    expires_at: float = 0.0  # epoch seconds


def _fetch_token(region: str, key: str, timeout: int = 10) -> str:
    url = _token_endpoint(region)
    headers = {"Ocp-Apim-Subscription-Key": key, "Content-Length": "0"}
    resp = requests.post(url, headers=headers, timeout=timeout)
    if resp.status_code != 200:
        raise TTSAuthError(
            f"Fallo al obtener token Azure TTS: {resp.status_code}",
            url=url, body=resp.text[:200]
        )
    return resp.text.strip()


# -------------------------------------------------------------------
# Backoff / reintentos
# -------------------------------------------------------------------

def _sleep_backoff(attempt: int, base: float = 0.75, cap: float = 8.0) -> None:
    delay = min(cap, base * (2 ** attempt)) * (0.6 + random.random() * 0.8)
    time.sleep(delay)

def _sleep_retry_after(hdr: Optional[str]) -> bool:
    """
    Si hay Retry-After en headers, dormir exactamente lo indicado.
    Acepta segundos o HTTP-date. Devuelve True si durmió.
    """
    if not hdr:
        return False
    s = hdr.strip()
    # numeric seconds
    if s.isdigit():
        time.sleep(max(0, int(s)))
        return True
    # HTTP-date
    try:
        ts = eut.parsedate_to_datetime(s)
        if ts:
            dt = ts.timestamp() - time.time()
            if dt > 0:
                time.sleep(dt)
            return True
    except Exception:
        pass
    return False

_RETRY_STATUS = {408, 429, 500, 502, 503, 504}


# -------------------------------------------------------------------
# Preflight SSML
# -------------------------------------------------------------------

def _strip_bom(s: str) -> str:
    if s and s[0] == "\ufeff":
        return s[1:]
    return s

def _preflight_ssml(ssml_xml: str, *, max_chars: int = 5000) -> str:
    """
    Sanitiza condiciones simples antes de enviar a Azure:
    - quitar BOM
    - validar no vacío
    - advertir si supera max_chars (no bloquea)
    """
    x = _strip_bom(ssml_xml or "")
    if not x.strip():
        raise TTSSynthesisError("SSML vacío o sólo espacios")
    if len(x) > max_chars:
        _LOG.warning("ssml_long", extra={"chars": len(x), "max": max_chars})
    return x


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
    write_sidecar_json: bool = False,
) -> Path:
    """
    Sintetiza un SSML a WAV (bloqueante). Devuelve la ruta escrita.
    - Maneja el ciclo de token automáticamente.
    - Reintenta ante rate-limit/errores transitorios.
    - Respeta Retry-After si está presente.
    - Opcional: guarda sidecar JSON con headers/latencia.
    """
    app_cfg = load_config()
    az = cfg or app_cfg.azure_tts
    az.require()

    auth = _AuthState()
    fmt = _audio_format_from_cfg(az)
    outp = Path(out_wav_path)
    outp.parent.mkdir(parents=True, exist_ok=True)

    ssml_xml = _preflight_ssml(ssml_xml)

    with log_span("tts.synthesize", extra={"out": str(outp), "fmt": fmt}):
        last_exc: Optional[Exception] = None
        t_start = time.time()

        for attempt in range(retries + 1):
            try:
                # Renovar token si es necesario
                now = time.time()
                if not auth.token or now >= auth.expires_at:
                    token = _fetch_token(az.region, az.key, timeout=timeout_s)
                    auth.token = token
                    auth.expires_at = now + 9 * 60  # 9 min margen

                # POST de síntesis
                headers = {
                    "Authorization": f"Bearer {auth.token}",
                    "Content-Type": "application/ssml+xml; charset=utf-8",
                    "X-Microsoft-OutputFormat": fmt,
                    "User-Agent": "AudiobooksPipeline/1.1",
                    "Accept": "*/*",
                    "Connection": "keep-alive",
                }
                url = _tts_endpoint(az.region)
                resp = requests.post(url, data=ssml_xml.encode("utf-8"), headers=headers, timeout=timeout_s)

                # Manejo de respuestas
                if resp.status_code == 200:
                    outp.write_bytes(resp.content)
                    elapsed = time.time() - t_start
                    _LOG.info("tts_written", extra={
                        "file": str(outp), "bytes": len(resp.content),
                        "ms": int(elapsed * 1000), "reqid": resp.headers.get("X-Microsoft-RequestId") or resp.headers.get("X-RequestId")
                    })
                    if write_sidecar_json:
                        side = {
                            "status": resp.status_code,
                            "bytes": len(resp.content),
                            "elapsed_ms": int(elapsed * 1000),
                            "headers": dict(resp.headers),
                        }
                        Path(str(outp) + ".json").write_text(
                            __import__("json").dumps(side, ensure_ascii=False, indent=2), encoding="utf-8"
                        )
                    return outp

                # Tokens caducos pueden venir como 401/403
                if resp.status_code in (401, 403):
                    auth.token = None
                    auth.expires_at = 0.0

                # 429: respeta Retry-After si lo hay
                if resp.status_code == 429:
                    _LOG.warning("tts_rate_limit", extra={"retry_after": resp.headers.get("Retry-After")})
                    if not _sleep_retry_after(resp.headers.get("Retry-After")):
                        _sleep_backoff(attempt)
                    last_exc = TTSRateLimit("429 Rate limit (Azure TTS)")
                    continue

                # 408/5xx: backoff
                if resp.status_code in _RETRY_STATUS:
                    last_exc = TTSSynthesisError(
                        f"HTTP {resp.status_code} transitorio en Azure TTS",
                        status=resp.status_code, body=resp.text[:200]
                    )
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
            except TTSAuthError:
                # Autenticación fallida: no tiene sentido reintentar muchas veces
                raise
            except Exception as e:
                last_exc = e
                _sleep_backoff(attempt)
                continue

        # Si llegamos aquí, agotamos reintentos
        raise TTSSynthesisError(
            "Agotados los reintentos de síntesis Azure TTS",
            last_error=str(last_exc) if last_exc else "unknown"
        )


def synthesize_file(
    ssml_path: str | Path,
    out_wav_path: str | Path,
    *,
    cfg: Optional[AzureTTSCfg] = None,
    timeout_s: int = 30,
    retries: int = 4,
    write_sidecar_json: bool = False,
) -> Path:
    xml = Path(ssml_path).read_text(encoding="utf-8")
    return synthesize_ssml(
        xml, out_wav_path, cfg=cfg,
        timeout_s=timeout_s, retries=retries,
        write_sidecar_json=write_sidecar_json
    )


def batch_synthesize(
    items: Iterable[Tuple[str | Path, str | Path]],
    *,
    cfg: Optional[AzureTTSCfg] = None,
    timeout_s: int = 30,
    retries: int = 4,
    max_workers: int = 4,
    write_sidecar_json: bool = False,
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
        return synthesize_file(
            ssml_path, out_wav, cfg=az, timeout_s=timeout_s,
            retries=retries, write_sidecar_json=write_sidecar_json
        )

    pairs = [(str(a), str(b)) for a, b in items]
    with log_span("tts.batch", extra={"count": len(pairs), "workers": max_workers}):
        with ThreadPoolExecutor(max_workers=max_workers) as ex:
            futs = [ex.submit(_task, a, b) for a, b in pairs]
            for f in as_completed(futs):
                p = f.result()
                results.append(p)
                _LOG.info("tts_done", extra={"file": str(p)})

    return results


def batch_synthesize_dir(
    in_dir: str | Path,
    out_dir: str | Path,
    *,
    pattern: str = "**/*.ssml.xml",
    cfg: Optional[AzureTTSCfg] = None,
    timeout_s: int = 30,
    retries: int = 4,
    max_workers: int = 4,
    write_sidecar_json: bool = False,
) -> List[Path]:
    """
    Recorre `in_dir` buscando *.ssml.xml y sintetiza a WAV en `out_dir`.
    El nombre de salida reemplaza '.ssml.xml' por '.wav'.
    """
    in_dir = Path(in_dir)
    out_dir = Path(out_dir)
    items: List[Tuple[Path, Path]] = []
    for ssml in sorted(in_dir.glob(pattern)):
        rel = ssml.relative_to(in_dir)
        out_path = out_dir / rel.with_suffix("").with_suffix(".wav")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        items.append((ssml, out_path))
    return batch_synthesize(
        items, cfg=cfg, timeout_s=timeout_s, retries=retries,
        max_workers=max_workers, write_sidecar_json=write_sidecar_json
    )


# -------------------------------------------------------------------
# CLI
# -------------------------------------------------------------------

def _main_cli():
    import argparse, json as _json
    ap = argparse.ArgumentParser(description="Azure TTS (REST) — SSML → WAV")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--in", dest="infile", help="Archivo SSML de entrada.")
    src.add_argument("--dir", dest="indir", help="Carpeta con SSML (*.ssml.xml).")
    ap.add_argument("--out", dest="outfile", help="WAV de salida (modo --in).")
    ap.add_argument("--out-dir", dest="outdir", help="Carpeta de salida (modo --dir).")
    ap.add_argument("--pattern", default="**/*.ssml.xml", help="Glob de búsqueda (modo --dir).")
    ap.add_argument("--timeout", type=int, default=30, help="Timeout por request (s).")
    ap.add_argument("--retries", type=int, default=4, help="Reintentos ante 429/5xx.")
    ap.add_argument("--workers", type=int, default=4, help="Paralelismo (modo --dir).")
    ap.add_argument("--sidecar", action="store_true", help="Escribir sidecar JSON con metadatos.")
    args = ap.parse_args()

    if args.infile:
        if not args.outfile:
            raise SystemExit("--out es obligatorio en modo --in")
        p = synthesize_file(
            args.infile, args.outfile,
            timeout_s=args.timeout, retries=args.retries,
            write_sidecar_json=bool(args.sidecar)
        )
        print(str(p))
        return

    if args.indir:
        if not args.outdir:
            raise SystemExit("--out-dir es obligatorio en modo --dir")
        outs = batch_synthesize_dir(
            args.indir, args.outdir, pattern=args.pattern,
            timeout_s=args.timeout, retries=args.retries,
            max_workers=args.workers, write_sidecar_json=bool(args.sidecar)
        )
        print("\n".join(str(p) for p in outs))

if __name__ == "__main__":
    _main_cli()
