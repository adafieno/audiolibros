# llm/attribution.py
# -*- coding: utf-8 -*-
"""
Atribución de hablantes en diálogo usando LLM.

Flujo:
1) Recibe bloques de diálogo (lista de dicts con {"i": int, "text": str}).
2) Hint de nombres conocidos (characters) para evitar "inventos".
3) Llama al LLM por lotes, en modo JSON.
4) Devuelve lines[] con speaker (o null), confidence (0..1) y rationale breve.

Requisitos:
  - llm/client.py
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from llm.client import chat_json
from core.logging import get_logger, log_span

_LOG = get_logger("llm.attribution")

# ------------- Heurísticas y normalización -------------

DIALOGUE_PREFIX = re.compile(r"^\s*[—\-«]")

def is_dialogue_line(s: str) -> bool:
    """Heurística simple para detectar líneas de diálogo."""
    return bool(DIALOGUE_PREFIX.match((s or "").strip()))

def normalize_quotes_and_dashes(s: str) -> str:
    s = (s or "")
    s = s.replace("“", "\"").replace("”", "\"").replace("’", "'").replace("‘", "'")
    s = s.replace("\u2014", "—").replace("\u2013", "—")
    return s

# ------------- Prompts -------------

_SYS_PROMPT = (
    "Eres un editor de guiones en español (Perú). Recibirás líneas de diálogo que "
    "comienzan con guión largo (—) o comillas angulares (« »). Debes asignar el 'speaker' "
    "a cada línea usando SOLO la lista de personajes conocidos o apelativos familiares como Mamá, Papá, Abuela.\n\n"
    "Reglas:\n"
    "- Si el hablante NO es inequívoco, usa null en 'speaker' y explica en 'rationale' (máx. 1 línea).\n"
    "- No inventes nombres; respeta títulos (Don/Doña + Nombre) como parte del nombre.\n"
    "- Devuelve SOLO JSON con 'lines': [{ 'i', 'text', 'speaker', 'confidence', 'rationale' }].\n"
    "- 'confidence' ∈ [0,1]."
)

_USER_TEMPLATE = (
    "Personajes conocidos (usa EXACTAMENTE estos nombres si aplican; si no, usa null):\n"
    "{known}\n\n"
    "Diálogos (formato: indice: texto):\n{payload}"
)

# ------------- API principal -------------

def attribute_dialogues(
    dialogue_blocks: List[Dict[str, Any]],
    known_names: List[str],
    *,
    batch_size: int = 24,
    max_tokens: int = 1200,
) -> Dict[str, Any]:
    """
    Atribuye hablantes por lotes. dialogue_blocks = [{"i": int, "text": str}, ...]
    known_names: lista canónica de nombres válidos (characters.json).
    """
    lines_out: List[Dict[str, Any]] = []
    names_hint = ", ".join(n for n in known_names if n)[:2000] or "(ninguno)"

    # Pre-normalizar y filtrar solo diálogo
    clean_blocks: List[Dict[str, Any]] = []
    for b in dialogue_blocks:
        i = b.get("i")
        t = normalize_quotes_and_dashes(b.get("text", ""))
        if isinstance(i, int) and isinstance(t, str) and t.strip() and is_dialogue_line(t):
            clean_blocks.append({"i": i, "text": t})

    def chunks(lst, n):
        for k in range(0, len(lst), n):
            yield lst[k:k+n]

    with log_span("attribution.batched", extra={"total": len(clean_blocks), "batch_size": batch_size}):
        for batch in chunks(clean_blocks, batch_size):
            payload = "\n".join(f"{b['i']}: {b['text']}" for b in batch)
            user = _USER_TEMPLATE.format(known=names_hint, payload=payload)

            obj = chat_json(
                messages=[{"role": "system", "content": _SYS_PROMPT},
                          {"role": "user", "content": user}],
                max_tokens=max_tokens,
                strict=False,
            )
            batch_lines = _coerce_lines(obj)
            lines_out.extend(batch_lines)

    return {"lines": lines_out}

# ------------- Normalización de salida -------------

def _coerce_lines(obj: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Asegura la forma estándar de salida y tipos esperados.
    """
    out: List[Dict[str, Any]] = []
    items = obj.get("lines", []) if isinstance(obj, dict) else []
    for it in items:
        i = it.get("i")
        text = it.get("text")
        sp = it.get("speaker", None)
        conf = it.get("confidence", 0.0)
        rat = it.get("rationale", "")

        if not isinstance(i, int) or not isinstance(text, str):
            continue
        if sp is not None and not isinstance(sp, str):
            sp = None
        try:
            conf = float(conf)
        except Exception:
            conf = 0.0
        conf = max(0.0, min(1.0, conf))

        out.append({"i": i, "text": text, "speaker": sp, "confidence": conf, "rationale": str(rat or "")[:280]})
    return out


# ------------- CLI mínima -------------

if __name__ == "__main__":
    import argparse, json
    from pathlib import Path

    ap = argparse.ArgumentParser(description="Atribuye hablantes a líneas de diálogo.")
    ap.add_argument("--dialogues-json", required=True, help="Ruta a JSON con [{'i':int,'text':str},...]")
    ap.add_argument("--known-names", required=False, default="", help="Nombres conocidos separados por '||'")
    ap.add_argument("--batch-size", type=int, default=24)
    ap.add_argument("--out", default="analysis/llm_attribution.json")
    args = ap.parse_args()

    blocks = json.loads(Path(args.dialogues_json).read_text(encoding="utf-8"))
    if isinstance(blocks, dict) and "blocks" in blocks:
        blocks = blocks["blocks"]
    if not isinstance(blocks, list):
        raise SystemExit("dialogues-json inválido (se espera lista de bloques)")

    known = [s.strip() for s in (args.known_names.split("||") if args.known_names else []) if s.strip()]

    result = attribute_dialogues(blocks, known_names=known, batch_size=args.batch_size)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Guardado: {args.out}")
