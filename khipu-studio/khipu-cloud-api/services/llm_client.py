"""Reusable LLM client utilities for IPA suggestion.

Minimal wrapper around OpenAI chat completions so the router stays lean.
"""
from __future__ import annotations
from typing import Dict, Any, Optional, Tuple

from openai import AsyncOpenAI, AsyncAzureOpenAI
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
    llm_settings = settings.get("llm", {}) if isinstance(settings, dict) else {}
    llm_engine = llm_settings.get("engine", {}) if isinstance(llm_settings, dict) else {}
    engine_name = llm_engine.get("name", "openai")
    model = llm_engine.get("model", "gpt-4o")

    # Get credentials based on engine type
    creds = settings.get("creds", {}).get("llm", {}) if isinstance(settings, dict) else {}
    
    if engine_name == "azure-openai":
        azure_creds = creds.get("azure", {})
        api_key = azure_creds.get("apiKey")
        endpoint = azure_creds.get("endpoint")
        api_version = azure_creds.get("apiVersion", "2024-10-21")
        
        if not api_key or not endpoint:
            return None, "Azure OpenAI credentials missing (creds.llm.azure.apiKey and endpoint required).", "MissingAzureOpenAIKey"
    else:
        openai_creds = creds.get("openai", {})
        api_key = openai_creds.get("apiKey")
        base_url = openai_creds.get("baseUrl")
        
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

    # Create HTTP client
    import httpx as _httpx
    http_client = _httpx.AsyncClient(timeout=60.0)
    
    # Create appropriate client based on engine
    if engine_name == "azure-openai":
        client = AsyncAzureOpenAI(
            api_key=api_key,
            azure_endpoint=endpoint,
            api_version=api_version,
            http_client=http_client
        )
    else:
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
