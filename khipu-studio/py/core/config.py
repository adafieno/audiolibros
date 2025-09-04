# core/config.py
# -*- coding: utf-8 -*-
"""
Configuración central del proyecto Audiobooks.

- Lee variables de entorno (con soporte opcional de .env).
- Expone dataclasses para OpenAI, Azure TTS y rutas de trabajo.
- Incluye utilidades para asegurar/crear directorios y para validaciones simples.
- No requiere dependencias externas; si existe `python-dotenv`, se usa automáticamente.

Variables de entorno comunes:
  # OpenAI / Azure OpenAI
  OPENAI_API_KEY=sk-...
  OPENAI_BASE_URL=https://<resource>.openai.azure.com/v1   # (opcional; Azure)
  OPENAI_API_VERSION=2024-02-15-preview                    # (opcional; Azure)
  OPENAI_MODEL=gpt-4o-mini

  # Azure TTS
  AZURE_TTS_KEY=...
  AZURE_TTS_REGION=eastus                                  # ej: eastus, brazilsouth, westeurope
  AZURE_TTS_DEFAULT_VOICE=es-ES-ElviraNeural

  # Rutas (opcional; si no, se infieren en ./)
  PROJECT_ROOT=.
  DOSSIER_DIR=./dossier
  ANALYSIS_DIR=./analysis
  SSML_DIR=./ssml
  AUDIO_WAV_DIR=./audio/wav
  DELIVERABLES_DIR=./deliverables
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional, Dict, Any


# Cargar .env si está disponible (opcional)
def _maybe_load_dotenv() -> None:
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv()
    except Exception:
        # Silencioso si no está instalado
        pass


_maybe_load_dotenv()


# Helpers de entorno
def _env_str(name: str, default: Optional[str] = None) -> Optional[str]:
    val = os.environ.get(name)
    return val if (val is not None and val != "") else default


def _env_int(name: str, default: Optional[int] = None) -> Optional[int]:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except Exception:
        return default


def _env_float(name: str, default: Optional[float] = None) -> Optional[float]:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except Exception:
        return default


# Dataclasses de configuración
@dataclass
class OpenAICfg:
    api_key: Optional[str]
    base_url: Optional[str] = None  # Azure OpenAI si aplica
    api_version: Optional[str] = None  # para Azure
    model: str = "gpt-4o-mini"
    temperature: float = 0.2
    json_mode: bool = True

    @property
    def is_azure(self) -> bool:
        return bool(self.base_url)

    def require(self) -> None:
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY no configurado.")


@dataclass
class AzureTTSCfg:
    key: Optional[str]
    region: Optional[str]
    default_voice: str = "es-PE-AlexNeural"
    sample_rate_hz: int = 44100
    bit_depth: int = 16
    channels: int = 1

    def require(self) -> None:
        if not self.key or not self.region:
            raise RuntimeError("AZURE_TTS_KEY o AZURE_TTS_REGION no configurados.")


@dataclass
class PathsCfg:
    project_root: Path
    dossier_dir: Path
    analysis_dir: Path
    ssml_dir: Path
    audio_wav_dir: Path
    deliverables_dir: Path

    def ensure_dirs(self) -> None:
        for p in [
            self.project_root,
            self.dossier_dir,
            self.analysis_dir,
            self.ssml_dir,
            self.audio_wav_dir,
            self.deliverables_dir,
        ]:
            p.mkdir(parents=True, exist_ok=True)


@dataclass
class AppConfig:
    openai: OpenAICfg
    azure_tts: AzureTTSCfg
    paths: PathsCfg

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        # Paso de Path a str para serializar
        d["paths"] = {k: str(v) for k, v in d["paths"].items()}
        return d

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=indent)


# Carga principal
def load_config() -> AppConfig:
    # OpenAI / Azure OpenAI
    openai_cfg = OpenAICfg(
        api_key=_env_str("OPENAI_API_KEY"),
        base_url=_env_str("OPENAI_BASE_URL"),
        api_version=_env_str("OPENAI_API_VERSION"),
        model=_env_str("OPENAI_MODEL", "gpt-4o-mini"),
        temperature=_env_float("OPENAI_TEMPERATURE", 0.2) or 0.2,
        json_mode=(_env_str("OPENAI_JSON_MODE", "1") == "1"),
    )

    # Azure TTS
    azure_cfg = AzureTTSCfg(
        key=_env_str("AZURE_TTS_KEY"),
        region=_env_str("AZURE_TTS_REGION"),
        default_voice=_env_str("AZURE_TTS_DEFAULT_VOICE", "es-PE-AlexNeural") or "es-PE-AlexNeural",
        sample_rate_hz=_env_int("AZURE_TTS_SR_HZ", 44100) or 44100,
        bit_depth=_env_int("AZURE_TTS_BIT_DEPTH", 16) or 16,
        channels=_env_int("AZURE_TTS_CHANNELS", 1) or 1,
    )

    # Rutas
    root = Path(_env_str("PROJECT_ROOT", ".") or ".").resolve()
    paths = PathsCfg(
        project_root=root,
        dossier_dir=(root / (_env_str("DOSSIER_DIR", "dossier") or "dossier")).resolve(),
        analysis_dir=(root / (_env_str("ANALYSIS_DIR", "analysis") or "analysis")).resolve(),
        ssml_dir=(root / (_env_str("SSML_DIR", "ssml") or "ssml")).resolve(),
        audio_wav_dir=(root / (_env_str("AUDIO_WAV_DIR", "audio/wav") or "audio/wav")).resolve(),
        deliverables_dir=(root / (_env_str("DELIVERABLES_DIR", "deliverables") or "deliverables")).resolve(),
    )

    return AppConfig(openai=openai_cfg, azure_tts=azure_cfg, paths=paths)


# Utilidades extra
def assert_dossier_exists(paths: PathsCfg) -> None:
    if not paths.dossier_dir.exists():
        raise FileNotFoundError(f"No se encontró el directorio dossier: {paths.dossier_dir}")


def summarize_environment(cfg: AppConfig) -> str:
    """Resumen legible (oculta llaves)."""
    oa = cfg.openai
    az = cfg.azure_tts
    lines = [
        "[OpenAI]",
        f"  Base URL: {oa.base_url or '(api.openai.com)'}",
        f"  Modelo: {oa.model}",
        f"  JSON mode: {oa.json_mode}",
        "",
        "[Azure TTS]",
        f"  Región: {az.region or '(sin configurar)'}",
        f"  Voz por defecto: {az.default_voice}",
        f"  WAV: {az.sample_rate_hz} Hz / {az.bit_depth} bit / {az.channels} ch",
        "",
        "[Rutas]",
        f"  Root: {cfg.paths.project_root}",
        f"  Dossier: {cfg.paths.dossier_dir}",
        f"  Analysis: {cfg.paths.analysis_dir}",
        f"  SSML: {cfg.paths.ssml_dir}",
        f"  WAV: {cfg.paths.audio_wav_dir}",
        f"  Deliverables: {cfg.paths.deliverables_dir}",
    ]
    return "\n".join(lines)


# Ejecución directa para diagnóstico rápido
if __name__ == "__main__":
    cfg = load_config()
    cfg.paths.ensure_dirs()
    print(summarize_environment(cfg))
