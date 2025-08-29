# llm/characters_extract.py
# -*- coding: utf-8 -*-
"""
Extracción de personajes (canónica) a partir del manuscrito.

Flujo:
1) Cargar párrafos del manuscrito (DOCX o lista de strings ya pre-procesada).
2) Seleccionar k "ventanas" de texto largas a lo largo del libro (contexto amplio).
3) Llamar al LLM con prompt en es-PE para devolver JSON con `characters`.
4) Normalizar a contrato `dossier/characters.json`.

Requisitos:
  - python-docx (si usas DOCX)
  - llm/client.py

Salida:
  dict: {"characters": [ {id, name, aliases, role, voice_traits, cultural_notes, requires_review} ]}
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Dict, Any, Optional

try:
    import docx  # type: ignore
except Exception:
    docx = None

from llm.client import chat_json
from core.logging import get_logger, log_span

_LOG = get_logger("llm.characters")


# -------------------- Utilidades --------------------

def _normalize_quotes(s: str) -> str:
    return (s or "").replace("“","\"").replace("”","\"").replace("’","'").replace("‘","'").replace("\u2013","—").replace("\u2014","—")

def _read_docx_paragraphs(path: Path) -> List[str]:
    if docx is None:
        raise RuntimeError("python-docx no está instalado.")
    d = docx.Document(str(path))
    paras = [(p.text or "").strip() for p in d.paragraphs]
    return [p for p in paras if p]

def _sample_long_snippets(paragraphs: List[str], k: int = 5, span: int = 50) -> List[str]:
    n = len(paragraphs)
    if n == 0:
        return []
    anchors = [int(n * (i + 1) / (k + 1)) for i in range(k)]
    snippets: List[str] = []
    for a in anchors:
        s = max(0, a - span // 2)
        e = min(n, s + span)
        text = "\n".join(_normalize_quotes(p) for p in paragraphs[s:e])
        snippets.append(text)
    return snippets

def _slugify_name(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r"[áàäâ]", "a", s)
    s = re.sub(r"[éèëê]", "e", s)
    s = re.sub(r"[íìïî]", "i", s)
    s = re.sub(r"[óòöô]", "o", s)
    s = re.sub(r"[úùüû]", "u", s)
    s = re.sub(r"ñ", "n", s)
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s

# -------------------- Prompt base --------------------

_SYS_PROMPT = (
    "Eres un editor de guiones en español (Perú). A partir del texto proporcionado, "
    "identifica PERSONAJES reales de la historia (no lugares ni cosas) y devuelve JSON con:\n"
    "- characters: [ { name, aliases, role, voice_traits, cultural_notes } ]\n"
    "Reglas: no inventes; agrupa diminutivos y apelativos familiares como aliases; "
    "mantén 'Don/Doña + Nombre' como parte del name cuando aplique; evita spoilers."
)

_USER_PREFIX = "Texto de referencia (muestras del manuscrito):\n\n"

# -------------------- API principal --------------------

def extract_characters_from_docx(path: str | Path, *, k_snippets: int = 5, span_paragraphs: int = 50) -> Dict[str, Any]:
    """
    Lee un DOCX y devuelve dict listo para dossier/characters.json.
    """
    with log_span("characters.extract.docx", extra={"path": str(path)}):
        paragraphs = _read_docx_paragraphs(Path(path))
        return extract_characters_from_paragraphs(paragraphs, k_snippets=k_snippets, span_paragraphs=span_paragraphs)

def extract_characters_from_paragraphs(paragraphs: List[str], *, k_snippets: int = 5, span_paragraphs: int = 50) -> Dict[str, Any]:
    """
    Usa snippets del manuscrito para construir un set canónico de personajes vía LLM.
    """
    with log_span("characters.extract", extra={"k": k_snippets, "span": span_paragraphs}):
        snippets = _sample_long_snippets(paragraphs, k=k_snippets, span=span_paragraphs)
        joined = ("\n\n---\n\n").join(snippets)[:12000]  # control de tamaño
        messages = [
            {"role": "system", "content": _SYS_PROMPT},
            {"role": "user", "content": _USER_PREFIX + joined}
        ]
        obj = chat_json(messages, strict=False, max_tokens=1200)
        raw_chars = obj.get("characters", []) if isinstance(obj, dict) else []
        normalized = _normalize_to_dossier(raw_chars)
        return {"characters": normalized}

# -------------------- Normalización al contrato dossier --------------------

def _normalize_to_dossier(raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Transforma items arbitrarios {name, aliases, role, voice_traits, cultural_notes}
    al contrato dossier/characters.json, generando `id` y marcando requires_review.
    """
    out: List[Dict[str, Any]] = []
    seen_ids = set()
    for item in raw:
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        cid = _slugify_name(name)
        # Evitar colisiones simples
        base = cid; suffix = 2
        while cid in seen_ids:
            cid = f"{base}_{suffix}"
            suffix += 1
        seen_ids.add(cid)
        out.append({
            "id": cid,
            "name": name,
            "aliases": [a for a in (item.get("aliases") or []) if isinstance(a, str) and a.strip()],
            "role": str(item.get("role", "") or ""),
            "voice_traits": str(item.get("voice_traits", "") or ""),
            "cultural_notes": str(item.get("cultural_notes", "") or ""),
            "requires_review": True
        })
    return out


# -------------------- CLI mínima --------------------

if __name__ == "__main__":
    import argparse, json, sys
    ap = argparse.ArgumentParser(description="Extrae personajes canónicos desde un manuscrito.")
    ap.add_argument("--docx", help="Ruta al DOCX", required=False)
    ap.add_argument("--txt", help="Ruta a un TXT con un párrafo por línea", required=False)
    ap.add_argument("--k", type=int, default=5, help="Número de snippets")
    ap.add_argument("--span", type=int, default=50, help="Párrafos por snippet")
    ap.add_argument("--out", default="analysis/llm_characters.json")
    args = ap.parse_args()

    if not args.docx and not args.txt:
        print("Debes pasar --docx o --txt", file=sys.stderr)
        sys.exit(2)

    if args.docx:
        result = extract_characters_from_docx(args.docx, k_snippets=args.k, span_paragraphs=args.span)
    else:
        lines = [l.strip() for l in Path(args.txt).read_text(encoding="utf-8").splitlines() if l.strip()]
        result = extract_characters_from_paragraphs(lines, k_snippets=args.k, span_paragraphs=args.span)

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(__import__("json").dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Guardado: {args.out}")
