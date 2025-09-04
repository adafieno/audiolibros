# core/log_utils.py
# -*- coding: utf-8 -*-
"""
Logging estructurado para el pipeline de audiolibros.

Características:
- Formato JSON (opcional) o texto legible.
- Correlation ID (request/job) propagado vía contextvars.
- Spans temporales con context manager (mide duración en ms).
- Helper para registrar excepciones con traceback.
- Config por variables de entorno:
    LOG_LEVEL=INFO|DEBUG|WARNING|ERROR
    LOG_JSON=1|0
    LOG_NAME=audiobooks
    LOG_SILENCE_LIBS=1|0   # silencia librerías ruidosas (urllib3, etc.)
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
import traceback
import uuid
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Dict, Optional

# ------- Contexto de correlación -------

_correlation_id: ContextVar[str] = ContextVar("correlation_id", default="")
_component: ContextVar[str] = ContextVar("component", default="core")

def set_correlation_id(cid: Optional[str] = None) -> str:
    """Fija (o genera) un correlation id y lo devuelve."""
    if not cid:
        cid = uuid.uuid4().hex
    _correlation_id.set(cid)
    return cid

def get_correlation_id() -> str:
    return _correlation_id.get()

def set_component(name: str) -> None:
    _component.set(name or "core")

def get_component() -> str:
    return _component.get()

# ------- Formateadores -------

class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "ts": int(time.time() * 1000),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "cid": get_correlation_id(),
            "component": get_component(),
        }
        # Extra fields (record.__dict__ may include args)
        for k in ("filename", "lineno", "funcName"):
            payload[k] = getattr(record, k, None)
        # Merge extras passed via logger.[level](..., extra={})
        # Python logging moves extras into record.__dict__
        for k, v in record.__dict__.items():
            if k in payload or k.startswith("_"):
                continue
            # filter noisy internal attributes
            if k in ("args", "msg", "exc_info", "exc_text", "stack_info"):
                continue
            payload[k] = v
        return json.dumps(payload, ensure_ascii=False)

class PlainFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        cid = get_correlation_id()
        comp = get_component()
        prefix = f"[{record.levelname:<7}] {comp} cid={cid} {record.name}: "
        base = record.getMessage()
        if record.exc_info:
            base += "\n" + "".join(traceback.format_exception(*record.exc_info))
        return prefix + base

# ------- Configuración global -------

_DEFAULT_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
_JSON_MODE = os.environ.get("LOG_JSON", "1") == "1"
_LOGGER_NAME = os.environ.get("LOG_NAME", "audiobooks")
_SILENCE_LIBS = os.environ.get("LOG_SILENCE_LIBS", "1") == "1"

_configured = False

def _silence_noisy_libs() -> None:
    # Evita ruido en salidas (especialmente en JSON)
    noisy = ["urllib3", "botocore", "azure", "openai", "httpx"]
    for name in noisy:
        logging.getLogger(name).setLevel(logging.WARNING)

def configure(level: str = _DEFAULT_LEVEL, json_mode: bool = _JSON_MODE, stream=None) -> logging.Logger:
    """
    Configura el logger raíz del proyecto. Idempotente.
    """
    global _configured
    if _configured:
        return logging.getLogger(_LOGGER_NAME)

    logger = logging.getLogger(_LOGGER_NAME)
    logger.setLevel(getattr(logging, level, logging.INFO))
    handler = logging.StreamHandler(stream or sys.stdout)
    handler.setLevel(getattr(logging, level, logging.INFO))
    handler.setFormatter(JsonFormatter() if json_mode else PlainFormatter())
    logger.addHandler(handler)
    logger.propagate = False

    if _SILENCE_LIBS:
        _silence_noisy_libs()

    # Asegura un correlation id al inicio
    if not get_correlation_id():
        set_correlation_id()

    _configured = True
    return logger

def get_logger(name: Optional[str] = None) -> logging.Logger:
    """
    Obtiene un logger hijo del logger de proyecto.
    """
    if not _configured:
        configure()
    base = logging.getLogger(_LOGGER_NAME)
    return base.getChild(name or "app")

# ------- Spans temporales -------

@dataclass
class Span:
    name: str
    start_ms: int
    end_ms: Optional[int] = None

    @property
    def duration_ms(self) -> Optional[int]:
        if self.end_ms is None:
            return None
        return self.end_ms - self.start_ms

class log_span:
    """
    Context manager para medir y loggear la duración de un bloque:

    with log_span("ssml.generate", extra={"chapter":"ch01"}):
        do_work()
    """
    def __init__(self, name: str, level: int = logging.INFO, extra: Optional[Dict[str, Any]] = None):
        self.name = name
        self.level = level
        self.extra = extra or {}
        self.logger = get_logger("span")
        self._start = 0

    def __enter__(self):
        self._start = int(time.time() * 1000)
        self.logger.log(self.level, f"start {self.name}", extra={**self.extra, "event": "span_start"})
        return self

    def __exit__(self, exc_type, exc, tb):
        end = int(time.time() * 1000)
        dur = end - self._start
        payload = {**self.extra, "event": "span_end", "duration_ms": dur}
        if exc:
            payload["error"] = repr(exc)
            self.logger.error(f"error {self.name}", extra=payload)
            return False  # re-raise
        else:
            self.logger.log(self.level, f"end {self.name}", extra=payload)
            return False

# ------- Helpers de excepciones -------

def log_exception(logger: Optional[logging.Logger] = None, msg: str = "Unhandled exception", **extra: Any) -> None:
    """
    Registra una excepción con traceback activo (llamar dentro de except).
    """
    lg = logger or get_logger("errors")
    lg.error(msg, exc_info=True, extra=extra)

# ------- Ejecución directa (demo) -------

if __name__ == "__main__":
    logger = configure()
    set_component("demo")
    set_correlation_id("demo-" + uuid.uuid4().hex[:8])

    logger.info("Hola logging")
    with log_span("work.example", extra={"chapter": "ch01"}):
        time.sleep(0.05)

    try:
        1 / 0
    except ZeroDivisionError:
        log_exception(msg="Falla controlada", step="demo")
