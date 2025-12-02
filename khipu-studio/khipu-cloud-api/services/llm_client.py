"""Reusable LLM client utilities for IPA suggestion.

Minimal wrapper around OpenAI chat completions so the router stays lean.
"""
from __future__ import annotations
from typing import Dict, Any, Optional, Tuple

from openai import AsyncOpenAI
import httpx  # noqa: F401 (version introspection in caller)
import pkg_resources  # noqa: F401
import re

class LLMError(Exception):
    """Domain error for LLM operations."""
    def __init__(self, message: str, code: str = "LLMError"):
        super().__init__(message)
        self.code = code

async def fetch_ipa(word: str, language: str, settings: Dict[str, Any]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Fetch IPA for a word using project settings.

    Returns (ipa, error_message, error_code).
    """
    creds = settings.get("creds", {}).get("llm", {}).get("openai", {}) if isinstance(settings, dict) else {}
    api_key = creds.get("apiKey")
    base_url = creds.get("baseUrl")
    llm_settings = settings.get("llm", {}) if isinstance(settings, dict) else {}
    llm_engine = llm_settings.get("engine", {}) if isinstance(llm_settings, dict) else {}
    model = llm_engine.get("model", "gpt-4o")

    if not api_key:
        return None, "OpenAI API key missing in project settings (creds.llm.openai.apiKey).", "MissingOpenAIKey"

    system_message = (
        "You are a concise expert phonetics assistant. Given a single word "
        "and an optional language/locale, respond with only the IPA "
        "transcription for that word. Do NOT include explanations, markup, "
        "or additional text—only the IPA characters. If unsure, return an empty string."
    )
    user_message = (
        f"Provide the IPA transcription (only the IPA) for the single word: \"{word}\". "
        f"Book locale: {language}. Respond with a single short line containing only the IPA."
    )
    messages = [
        {"role": "system", "content": system_message},
        {"role": "user", "content": user_message},
    ]

    # Workaround: OpenAI SDK 1.54.4 passes 'proxies' to httpx, but httpx 0.26.0 still accepts it
    # Explicitly create an httpx client without proxies to avoid any SDK auto-detection issues
    import httpx as _httpx
    http_client = _httpx.AsyncClient(timeout=60.0)
    
    client_kwargs = {"api_key": api_key, "http_client": http_client}
    if base_url:
        client_kwargs["base_url"] = base_url
    client = AsyncOpenAI(**client_kwargs)

    try:
        resp = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.0,
            max_tokens=80,
        )
    except Exception as e:
        return None, f"OpenAI call failed: {e}", e.__class__.__name__

    raw = resp.choices[0].message.content.strip() if resp.choices else ""
    ipa = raw.strip().strip('"').strip("'")
    if ipa.startswith("/") and ipa.endswith("/") and len(ipa) > 2:
        ipa = ipa[1:-1].strip()
    # Try /ipa/ pattern if still noisy
    m = re.search(r"/([^/]+)/", ipa)
    if m:
        ipa = m.group(1).strip()

    ipa = ipa.strip()
    if not ipa:
        return None, "Empty IPA response", "EmptyResponse"
    return ipa, None, None
