# core/errors.py
# -*- coding: utf-8 -*-
"""
Errores de dominio para el flujo de audiolibros.

Objetivos:
- Proveer clases de excepción específicas por capa (dossier, LLM, SSML, TTS, audio, empaquetado).
- Transportar metadatos relevantes (chapter_id, chunk_id, path, component) sin perder el traceback.
- Ofrecer helpers para envolver funciones con contexto consistente.

Uso:
    from core.errors import DossierSchemaValidation, with_context

    try:
        validate_component(...)
    except jsonschema.ValidationError as e:
        raise DossierSchemaValidation("Estructura inválida", path=comp_path) from e
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional, Dict, Any, Callable, TypeVar, cast
import functools

# --------- Base ---------

@dataclass
class ErrorContext:
    component: Optional[str] = None      # p.ej. "dossier", "ssml", "tts"
    path: Optional[str] = None           # archivo/dir relevante
    chapter_id: Optional[str] = None     # ch01...
    chunk_id: Optional[str] = None       # ch01_003...
    extra: Optional[Dict[str, Any]] = None

class AudiobookError(Exception):
    """Base de todas las excepciones de dominio."""
    def __init__(self, message: str, *, context: Optional[ErrorContext] = None, **kwargs: Any) -> None:
        # kwargs se fusiona a context.extra para conveniencia
        self.context = context or ErrorContext()
        if kwargs:
            self.context.extra = {**(self.context.extra or {}), **kwargs}
        super().__init__(message)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "message": str(self),
            "context": {
                "component": self.context.component,
                "path": self.context.path,
                "chapter_id": self.context.chapter_id,
                "chunk_id": self.context.chunk_id,
                "extra": self.context.extra or {},
            },
            "type": self.__class__.__name__,
        }

# --------- Dossier / Validación ---------

class DossierNotFound(AudiobookError):
    """No se encontró el directorio/archivo dossier esperado."""

class DossierSchemaValidation(AudiobookError):
    """Un componente del dossier no cumple su JSON Schema."""

class DossierReferenceError(AudiobookError):
    """Referencia cruzada inválida (character_id/stylepack/chapter_id inexistente)."""

# --------- LLM ---------

class LLMCallError(AudiobookError):
    """Fallo en la llamada al LLM (timeout, parsing JSON, etc.)."""

class LLMContractViolation(AudiobookError):
    """Salida del LLM no cumple el contrato esperado (campos faltantes, tipos)."""

# --------- SSML ---------

class SSMLPlanError(AudiobookError):
    """Generación de plan SSML fallida (offsets, superposiciones, etc.)."""

class SSMLRenderError(AudiobookError):
    """Render de SSML XML fallido (etiquetas mal formadas, límites)."""

class SSMLAzureLimitExceeded(AudiobookError):
    """SSML excede límites de Azure (KB, número de etiquetas, duración estimada)."""

# --------- TTS / Azure ---------

class TTSAuthError(AudiobookError):
    """Credenciales o permisos inválidos en Azure TTS."""

class TTSRateLimit(AudiobookError):
    """Rate limit / throttling de Azure TTS."""

class TTSSynthesisError(AudiobookError):
    """Error de síntesis (HTTP 5xx, fallo de conexión, etc.)."""

# --------- Audio ---------

class AudioAnalyzeError(AudiobookError):
    """Fallo al medir métricas de audio (RMS, pico, ruido)."""

class AudioMasteringError(AudiobookError):
    """Fallo en normalización/masterización."""

# --------- Empaquetado / Publicación ---------

class PackagingError(AudiobookError):
    """Fallo al crear entregables (m4b, mp3/flac, metadatos)."""

class DeliveryTargetError(AudiobookError):
    """Configuración de plataforma inválida o incompatible."""

# --------- Helper de contexto ---------

F = TypeVar("F", bound=Callable[..., Any])

def with_context(
    *,
    component: Optional[str] = None,
    path: Optional[str] = None,
    chapter_id: Optional[str] = None,
    chunk_id: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Callable[[F], F]:
    """
    Decorador: inyecta ErrorContext en AudiobookError si la función lanza una.
    No cambia el tipo de excepción; solo enriquece el contexto si falta.
    """
    def decorator(fn: F) -> F:
        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any):
            try:
                return fn(*args, **kwargs)
            except AudiobookError as e:
                # Preserva contexto existente y completa campos vacíos
                ctx = e.context or ErrorContext()
                e.context = ErrorContext(
                    component=ctx.component or component,
                    path=ctx.path or path,
                    chapter_id=ctx.chapter_id or chapter_id,
                    chunk_id=ctx.chunk_id or chunk_id,
                    extra={**(ctx.extra or {}), **(extra or {})},
                )
                raise
        return cast(F, wrapper)
    return decorator
