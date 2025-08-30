# llm/client.py
# -*- coding: utf-8 -*-
"""
Cliente LLM para extracción/atribución (OpenAI o Azure OpenAI).

Requisitos:
  pip install openai

Config:
  - Usa core.config.load_config() para llaves/base_url/modelo.
  - JSON mode activable (cfg.openai.json_mode).
  - Reintentos exponenciales con jitter ante errores transitorios.

API:
  chat_json(messages, *, model=None, temperature=None, max_tokens=None, timeout_s=60) -> dict
  chat_text(messages, *, model=None, temperature=None, max_tokens=None, timeout_s=60) -> str

Mensajes: [{"role":"system|user|assistant", "content":"..."}]
"""

from __future__ import annotations

import json
import random
import time
from typing import Any, Dict, List, Optional, Tuple

from openai import OpenAI, APIConnectionError, RateLimitError, APIError, BadRequestError  # type: ignore

import os
import sys

# Ensure the project root (parent directory of this file) is on sys.path so the "core" package can be imported
# when running this file directly (e.g., python client.py).
_pkg_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _pkg_root not in sys.path:
    sys.path.insert(0, _pkg_root)

from core.config import load_config
from core.errors import LLMCallError, LLMContractViolation
from core.logging import get_logger, log_span, set_component

_LOG = get_logger("llm")


# --------------- Inicialización del cliente ---------------

def _build_client() -> Tuple[OpenAI, Dict[str, Any]]:
    """
    Construye el cliente OpenAI (sirve tanto para api.openai.com como para Azure OpenAI).
    Devuelve (client, defaults).
    """
    cfg = load_config()
    oa = cfg.openai

    kwargs: Dict[str, Any] = {"api_key": oa.api_key}
    if oa.base_url:
        # Azure OpenAI (o proxy compatible)
        kwargs["base_url"] = oa.base_url

    client = OpenAI(**kwargs)
    defaults = {
        "model": oa.model,
        "temperature": oa.temperature,
        "json_mode": oa.json_mode,
    }
    return client, defaults


_CLIENT, _DEFAULTS = _build_client()
set_component("llm")


# --------------- Helpers internos ---------------

def _sleep_backoff(attempt: int, base: float = 0.75, cap: float = 8.0) -> None:
    # Exponential backoff with jitter
    delay = min(cap, base * (2 ** attempt)) * (0.6 + random.random() * 0.8)
    time.sleep(delay)

def _finalize_content(choice) -> str:
    # OpenAI Python SDK v1: objects, not dicts
    if hasattr(choice, "message"):
        msg = choice.message  # ChatCompletionMessage or None
        content = getattr(msg, "content", None)

        # If content comes back as structured parts, flatten any text parts
        if isinstance(content, list):
            parts = []
            for p in content:
                # p may be an object or a dict
                t = getattr(p, "type", None) or (p.get("type") if isinstance(p, dict) else None)
                if t == "text":
                    parts.append(getattr(p, "text", None) or (p.get("text") if isinstance(p, dict) else ""))
            return "".join(parts)

        return content or ""

    # Fallback for dict-shaped responses (older codepaths/mocks)
    return (choice.get("message", {}) or {}).get("content", "") or ""


# --------------- API pública ---------------

def chat_text(
    messages: List[Dict[str, str]],
    *,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    timeout_s: int = 60,
    retries: int = 4,
) -> str:
    """
    Llama al modelo y devuelve texto libre (no fuerza JSON).
    Levanta LLMCallError si agota reintentos.
    """
    client = _CLIENT
    model = model or _DEFAULTS["model"]
    temperature = _DEFAULTS["temperature"] if temperature is None else temperature

    with log_span("llm.chat_text", extra={"model": model}):
        last_exc: Optional[Exception] = None
        for attempt in range(retries + 1):
            try:
                resp = client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    timeout=timeout_s,
                )
                content = _finalize_content(resp.choices[0])
                return content or ""
            except (RateLimitError, APIConnectionError) as e:
                last_exc = e
                _LOG.warning("Rate/connection issue, retrying...", extra={"attempt": attempt, "type": e.__class__.__name__})
                _sleep_backoff(attempt)
            except APIError as e:
                last_exc = e
                if getattr(e, "status_code", 500) >= 500:
                    _LOG.warning("Server error, retrying...", extra={"attempt": attempt, "status": getattr(e, 'status_code', None)})
                    _sleep_backoff(attempt)
                else:
                    break
            except BadRequestError as e:
                # Prompt demasiado largo, tokens, etc. → no reintentar
                last_exc = e
                break
            except Exception as e:
                last_exc = e
                _sleep_backoff(attempt)
        raise LLMCallError(f"Fallo chat_text con modelo {model}", error=str(last_exc) if last_exc else "unknown")


def chat_json(
    messages: List[Dict[str, str]],
    *,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    timeout_s: int = 60,
    retries: int = 4,
    strict: bool = False,
) -> Dict[str, Any]:
    """
    Llama al modelo esperando **JSON** (response_format JSON si está habilitado).
    - Si la respuesta no es JSON válido, intenta recuperar el objeto (busca primer {...}).
    - strict=True hace que una respuesta no-JSON lance LLMContractViolation sin intento de recuperación.
    """
    client = _CLIENT
    model = model or _DEFAULTS["model"]
    temperature = _DEFAULTS["temperature"] if temperature is None else temperature
    json_mode = bool(_DEFAULTS["json_mode"])

    with log_span("llm.chat_json", extra={"model": model, "json_mode": json_mode}):
        last_exc: Optional[Exception] = None
        for attempt in range(retries + 1):
            try:
                kwargs: Dict[str, Any] = dict(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    timeout=timeout_s,
                )
                if json_mode:
                    kwargs["response_format"] = {"type": "json_object"}

                resp = client.chat.completions.create(**kwargs)
                content = _finalize_content(resp.choices[0]) or ""

                # Intentar parseo directo
                try:
                    return json.loads(content)
                except Exception:
                    if strict:
                        raise LLMContractViolation("Respuesta no es JSON válido (strict=True)", content_preview=content[:240])
                    # Recuperación: localizar primer objeto JSON
                    start = content.find("{")
                    end = content.rfind("}")
                    if start >= 0 and end > start:
                        try:
                            return json.loads(content[start : end + 1])
                        except Exception as e:
                            raise LLMContractViolation("JSON recuperado inválido", error=str(e), content_preview=content[start:start+240])
                    raise LLMContractViolation("No se encontró objeto JSON en la respuesta", content_preview=content[:240])

            except (RateLimitError, APIConnectionError) as e:
                last_exc = e
                _LOG.warning("Rate/connection issue, retrying...", extra={"attempt": attempt, "type": e.__class__.__name__})
                _sleep_backoff(attempt)
            except APIError as e:
                last_exc = e
                if getattr(e, "status_code", 500) >= 500:
                    _LOG.warning("Server error, retrying...", extra={"attempt": attempt, "status": getattr(e, 'status_code', None)})
                    _sleep_backoff(attempt)
                else:
                    break
            except BadRequestError as e:
                last_exc = e
                break
            except LLMContractViolation:
                # Contrato roto: no reintentar (a menos que quieras permitir 1 retry)
                raise
            except Exception as e:
                last_exc = e
                _sleep_backoff(attempt)

        raise LLMCallError(f"Fallo chat_json con modelo {model}", error=str(last_exc) if last_exc else "unknown")
