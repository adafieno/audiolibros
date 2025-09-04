# dossier/build_from_manuscript.py
# -*- coding: utf-8 -*-
"""
Construye el 'dossier' inicial desde los TXT por capítulo.

- Detección de personajes: LLM-ONLY (sin híbridos, sin validaciones eliminatorias).
- Cobertura amplia: muestreo por BLOQUES (secuencial) para no exceder tokens.
- Cada bloque aporta texto adicional; el LLM devuelve una lista ACUMULADA (sin unir personas).
- Guardia mínima: evitar 'dos personas en una' (p. ej., 'María y José').

Requiere:
    - analysis/chapters_txt/chXX.txt
    - dossier/narrative.structure.json
    - client.py con función chat_json(messages=[...], max_tokens=..., strict=..., temperature=?)

Uso:
    python -m dossier.build_from_manuscript \
        --chapters-dir analysis/chapters_txt \
        --structure dossier/narrative.structure.json \
        --dossier-dir dossier \
        --use-llm true|false \
        [--block-chars 9000] [--max-blocks 3] [--win 1400] [--per-ch 3]
"""
from __future__ import annotations
import json
import re
from collections import Counter
from pathlib import Path
from typing import Dict, Any, List, Tuple

# Cliente (debes proveerlo tú)
from client import chat_json

# -------------------- Utilidades básicas --------------------

def _read_json(p: Path) -> Dict[str, Any]:
    return json.loads(p.read_text(encoding="utf-8"))

def _write_json(p: Path, data: Dict[str, Any]) -> Path:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return p

def _load_chapters(ch_dir: Path, structure: Dict[str, Any]) -> List[Dict[str, Any]]:
    out = []
    for ch in structure.get("chapters", []):
        cid = ch.get("id")
        title = ch.get("title")
        p = ch_dir / f"{cid}.txt"
        if not p.exists():
            out.append({"id": cid, "title": title, "text": ""})
        else:
            out.append({"id": cid, "title": title, "text": p.read_text(encoding="utf-8")})
    return out

# -------------------- (Solo para fallbacks menores) --------------------

_WORD = re.compile(r"\b[\wÁÉÍÓÚÜÑáéíóúüñ'-]+\b")
_UPPER_NAME = re.compile(r"\b([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+){0,2})\b")

def _candidate_names(text: str) -> List[str]:
    cands = Counter()
    for m in _UPPER_NAME.finditer(text):
        name = m.group(1).strip()
        low = name.lower()
        if low in {"capítulo", "prólogo", "epílogo"}:
            continue
        cands[name] += 1
    return [n for n, _ in cands.most_common(20)]

def _proper_terms(text: str) -> List[str]:
    tokens = [t for t in _WORD.findall(text)]
    terms = [t for t in tokens if len(t) > 3 and not t.isdigit()]
    freq = Counter([t.lower() for t in terms])
    common = [w for w, _ in freq.most_common(100)]
    return common[:50]

# -------------------- Muestreo por BLOQUES --------------------

def _chapter_windows(text: str, win: int) -> List[str]:
    """
    Extrae hasta 3 ventanas por capítulo: inicio, medio, fin (si el cap. es largo).
    """
    t = text or ""
    n = len(t)
    if n == 0:
        return []
    if n <= win:
        return [t]
    mid = n // 2
    windows = [
        t[:win],                                  # inicio
        t[max(0, mid - win // 2): mid + win // 2] # mitad
    ]
    # fin (últimos win char) — solo si aporta nuevo contenido
    tail = t[-win:]
    if tail not in windows:
        windows.append(tail)
    return windows

def _build_blocks(chapters: List[Dict[str, Any]],
                  per_ch: int = 3,
                  win: int = 1400,
                  block_chars: int = 9000,
                  max_blocks: int = 3) -> List[str]:
    """
    Crea bloques concatenando pequeñas ventanas por capítulo, respetando un tope de caracteres por bloque.
    El orden favorece cobertura amplia a lo largo del libro.
    """
    # Precalcular ventanas por capítulo
    ch_windows: List[Tuple[str, str]] = []  # (chapter_id, window_text)
    for ch in chapters:
        cid = ch.get("id") or ""
        w = _chapter_windows(ch.get("text", "") or "", win=win)
        for s in w[:per_ch]:
            ch_windows.append((cid, s))

    # Distribuir en bloques
    blocks: List[str] = []
    cur: List[str] = []
    cur_len = 0
    for cid, s in ch_windows:
        header = f"\n\n=== CAPÍTULO {cid} ===\n"
        piece = header + s
        if cur_len + len(piece) > block_chars and cur:
            blocks.append("".join(cur))
            if len(blocks) >= max_blocks:
                break
            cur = []
            cur_len = 0
        cur.append(piece)
        cur_len += len(piece)

    if cur and len(blocks) < max_blocks:
        blocks.append("".join(cur))

    # Seguridad: nunca devolver bloques vacíos
    return [b for b in blocks if b.strip()][:max_blocks]

# -------------------- Prompts (LLM-ONLY) --------------------

_SYS_CHAR_BASE = (
    "Eres un editor profesional (es-PE). Tu tarea: extraer PERSONAJES PRINCIPALES del texto en bloques.\n"
    "Reglas OBLIGATORIAS:\n"
    "1) Devuelve JSON con esta forma EXACTA:\n"
    "   {\n"
    "     'characters': [\n"
    "        {'id':'string','display_name':'string','aliases':['...'],'bio':'breve'}\n"
    "     ],\n"
    "     'requires_review': true\n"
    "   }\n"
    "2) UN SOLO personaje por entrada (prohibido unir dos personas en una misma entrada).\n"
    "3) Si dudas de un nombre, omítelo. No inventes alias ni biografías.\n"
    "4) Mantén consistencia: si ya viste un personaje en bloques previos, respeta su 'display_name' y no lo dupliques.\n"
)

_USER_CHAR_FIRST = (
    "Procesa el BLOQUE 1/?. Identifica PERSONAJES PRINCIPALES (≈5–15) del texto a continuación.\n"
    "Devuelve la lista ACUMULADA de 'characters' encontrada hasta ahora (solo este bloque si es el primero).\n\n"
    "{snippet}"
)

_USER_CHAR_NEXT = (
    "Procesa el BLOQUE {k}/?. Ya tienes esta lista previa de personajes:\n"
    "{previous}\n\n"
    "A partir del nuevo texto, AÑADE solo personajes nuevos (NO dupliques, NO fusiones personas).\n"
    "Devuelve la lista ACUMULADA (los anteriores sin cambios + los nuevos de este bloque):\n\n"
    "{snippet}"
)

# -------------------- Guardia mínima anti-combinaciones --------------------

_SINGLE_PERSON_PAT = re.compile(
    r"^\s*(?:[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+){0,2})\s*$"
)

def _looks_like_two_people(name: str) -> bool:
    s = (name or "").strip()
    if not s:
        return False
    if re.search(r"\b(y|and)\b", s, flags=re.IGNORECASE):
        return True
    if "/" in s or "&" in s:
        return True
    if "," in s:
        parts = [p.strip() for p in s.split(",") if p.strip()]
        if len(parts) >= 2 and all(re.match(r"^[A-ZÁÉÍÓÚÜÑ]", p) for p in parts[:2]):
            return True
    return False

def _attempt_safe_split(name: str) -> List[str]:
    s = (name or "").strip()
    if not s:
        return []
    for sep in [r"\by\b", r"\band\b", r"/", r"&", ","]:
        parts = re.split(sep, s, flags=re.IGNORECASE)
        parts = [p.strip() for p in parts if p and p.strip()]
        if len(parts) == 2 and all(_SINGLE_PERSON_PAT.match(p) for p in parts):
            return parts
    return [s]

def _sanitize_llm_characters(raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    - NO elimina candidatos dudosos.
    - Evita uniones obvias ('X y Y') dividiendo en dos entradas separadas SOLO si es inequívoco.
    - Elimina duplicados EXACTOS por display_name (misma cadena).
    """
    out: List[Dict[str, Any]] = []
    seen = set()
    idx = 1
    for c in raw:
        name = (c.get("display_name") or "").strip()
        if not name:
            continue
        if _looks_like_two_people(name):
            parts = _attempt_safe_split(name)
            if len(parts) == 2:
                for n in parts:
                    key = n.lower()
                    if key in seen:
                        continue
                    out.append({
                        "id": c.get("id") or f"p{idx:02d}",
                        "display_name": n,
                        "aliases": c.get("aliases") or [],
                        "bio": c.get("bio") or ""
                    })
                    seen.add(key); idx += 1
                continue
        key = name.lower()
        if key in seen:
            continue
        out.append({
            "id": c.get("id") or f"p{idx:02d}",
            "display_name": name,
            "aliases": c.get("aliases") or [],
            "bio": c.get("bio") or ""
        })
        seen.add(key); idx += 1
    return out

# -------------------- LLM-ONLY por bloques (acumulativo) --------------------

def _llm_accumulate_characters(blocks: List[str]) -> List[Dict[str, Any]]:
    """
    Ejecuta el LLM secuencialmente por bloques. El propio LLM mantiene la lista ACUMULADA.
    No se aplican validaciones destructivas; solo se higieniza la salida final para evitar uniones obvias.
    """
    accumulated: List[Dict[str, Any]] = []
    sys_prompt = _SYS_CHAR_BASE

    for i, blk in enumerate(blocks, start=1):
        if i == 1:
            user_prompt = _USER_CHAR_FIRST.format(snippet=blk)
        else:
            previous_json = json.dumps({"characters": accumulated, "requires_review": True}, ensure_ascii=False)
            user_prompt = _USER_CHAR_NEXT.format(k=i, previous=previous_json, snippet=blk)

        # Llamada al LLM (temperatura 0 para extracción determinista)
        try:
            obj = chat_json(
                messages=[
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=1500,
                strict=True,
                temperature=0
            )
        except TypeError:
            obj = chat_json(
                messages=[
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=1500,
                strict=True
            )

        chars = obj.get("characters") if isinstance(obj, dict) else None
        if isinstance(chars, list) and chars:
            # Importante: tomamos la lista ACUMULADA que devuelve el modelo
            accumulated = chars

    return _sanitize_llm_characters(accumulated)

# -------------------- Generadores de dossier --------------------

_SYS_LEX = (
    "Eres un lingüista. Extrae 10–40 términos candidatos para un lexicón de pronunciación en español (Perú). "
    "Incluye nombres propios, topónimos y préstamos. Devuelve JSON "
    "{'terms':[{'grapheme','ipa'?:'','notes'?:''}], 'requires_review':true}."
)

_USER_LEX = (
    "Texto del libro (muestras). Proporciona candidatos (sin inventar IPA si no estás seguro). "
    "Incluye 'ipa' solo si es confiable.\n\n{snippet}"
)

def _build_characters(chapters: List[Dict[str, Any]], use_llm: bool,
                      per_ch: int, win: int, block_chars: int, max_blocks: int) -> Dict[str, Any]:
    """
    Detección LLM-ONLY con bloques secuenciales y acumulación en el propio LLM.
    """
    blocks = _build_blocks(chapters, per_ch=per_ch, win=win, block_chars=block_chars, max_blocks=max_blocks)
    if use_llm and _HAS_LLM and blocks:
        print(f"Enviando {len(blocks)} bloque(s) al LLM para personajes (LLM-ONLY, acumulativo)...")
        characters = _llm_accumulate_characters(blocks)
        if characters:
            return {"characters": characters, "requires_review": True, "source": "llm-blocks"}
    # Fallback mínimo si el LLM no devuelve nada utilizable
    small_sample = "\n\n".join((ch.get("text", "") or "")[:1500] for ch in chapters[:6])
    names = _candidate_names(small_sample)
    items = [{"id": f"p{i+1:02d}", "display_name": n, "aliases": [], "bio": ""} for i, n in enumerate(names)]
    return {"characters": items, "requires_review": True, "source": "heuristic"}

def _build_voices_cast(characters: Dict[str, Any]) -> Dict[str, Any]:
    cast = []
    narr = {"character_id": "narrador", "voice_id": "es-ES-ElviraNeural", "style": "narration-relaxed"}
    cast.append(narr)
    for i, c in enumerate(characters.get("characters", []), start=1):
        vid = "es-ES-AlvaroNeural" if i % 2 == 0 else "es-ES-ElviraNeural"
        cast.append({"character_id": c.get("id") or f"p{i:02d}", "display_name": c.get("display_name",""), "voice_id": vid})
    return {"cast": cast, "requires_review": True}

def _build_stylepacks() -> Dict[str, Any]:
    packs = [{
        "id": "chapter_default",
        "prosody": {"rate": "medium", "pitch": "default", "volume": "default"},
        "breaks": {"comma_ms": 250, "paragraph_ms": 900}
    },{
        "id": "dialogue",
        "prosody": {"rate": "medium", "pitch": "+0st"},
        "breaks": {"comma_ms": 150, "paragraph_ms": 600}
    }]
    return {"packs": packs, "requires_review": True}

def _build_lexicon(chapters: List[Dict[str, Any]], use_llm: bool,
                   per_ch: int, win: int, block_chars: int, max_blocks: int) -> Dict[str, Any]:
    # Reutilizamos el primer bloque (o concatenamos hasta ~1 bloque) para términos
    blocks = _build_blocks(chapters, per_ch=per_ch, win=win, block_chars=block_chars, max_blocks=1)
    sample = blocks[0] if blocks else "\n\n".join((ch.get("text","") or "")[:1500] for ch in chapters[:6])
    if use_llm and _HAS_LLM and sample.strip():
        try:
            obj = chat_json(
                messages=[
                    {"role":"system","content":_SYS_LEX},
                    {"role":"user","content":_USER_LEX.format(snippet=sample)}
                ],
                max_tokens=1100,
                strict=True,
                temperature=0
            )
        except TypeError:
            obj = chat_json(
                messages=[
                    {"role":"system","content":_SYS_LEX},
                    {"role":"user","content":_USER_LEX.format(snippet=sample)}
                ],
                max_tokens=1100,
                strict=True
            )
        terms = obj.get("terms") if isinstance(obj, dict) else None
        if isinstance(terms, list) and terms:
            return {"terms": terms, "requires_review": True, "source": "llm"}
    # Fallback
    cands = _proper_terms(sample)
    terms = [{"grapheme": t, "ipa": "", "notes": ""} for t in cands]
    return {"terms": terms, "requires_review": True, "source": "heuristic"}

def _build_pronunciations_sensitive(characters: Dict[str, Any]) -> Dict[str, Any]:
    items = []
    for c in characters.get("characters", []):
        dn = (c.get("display_name") or "").strip()
        if dn:
            items.append({"grapheme": dn, "ipa": "", "ssml_phoneme": "", "notes": "Verificar nombre propio"})
    return {"items": items, "requires_review": True}

def _normalize_structure(structure: Dict[str, Any], chapters_dir: Path) -> Dict[str, Any]:
    chs = []
    total = 0
    for i, ch in enumerate(structure.get("chapters", []), start=1):
        cid = ch.get("id") or f"ch{i:02d}"
        title = ch.get("title") or f"Capítulo {i}"
        p = chapters_dir / f"{cid}.txt"
        wc = 0
        if p.exists():
            txt = p.read_text(encoding="utf-8")
            wc = len(re.findall(r"\b[\wÁÉÍÓÚÜÑáéíóúüñ'-]+\b", txt))
        total += wc
        chs.append({"id": cid, "title": title, "word_count": wc})
    return {"source_file": structure.get("source_file",""), "chapters": chs, "total_words": total, "version": (structure.get("version") or 1)}

# -------------------- CLI --------------------

def main():
    import argparse
    ap = argparse.ArgumentParser(description="Construye el dossier inicial a partir de capítulos TXT.")
    ap.add_argument("--chapters-dir", required=True)
    ap.add_argument("--structure", required=True)
    ap.add_argument("--dossier-dir", required=True)
    ap.add_argument("--use-llm", required=True, type=str.lower, choices=("true","false"),
                    help="Obligatorio: 'true' para usar LLMs; 'false' para no usar LLMs.")
    # Parámetros de muestreo por bloques (tú los puedes ajustar sin tocar código)
    ap.add_argument("--block-chars", type=int, default=9000, help="Máx. chars por bloque enviado al LLM.")
    ap.add_argument("--max-blocks", type=int, default=3, help="Máx. bloques a enviar secuencialmente.")
    ap.add_argument("--win", type=int, default=1400, help="Tamaño de cada ventana por capítulo.")
    ap.add_argument("--per-ch", type=int, default=3, help="Ventanas por capítulo (inicio/mitad/fin).")

    args = ap.parse_args()
    ch_dir = Path(args.chapters_dir)
    ds_dir = Path(args.dossier_dir)
    struct = _read_json(Path(args.structure))
    chapters = _load_chapters(ch_dir, struct)

    llm_flag = (args.use_llm == "true")
    use_llm = llm_flag and _HAS_LLM

    # 1) characters (LLM-ONLY, bloques acumulativos)
    characters = _build_characters(
        chapters, use_llm,
        per_ch=args.per_ch, win=args.win,
        block_chars=args.block_chars, max_blocks=args.max_blocks
    )
    _write_json(ds_dir / "characters.json", characters)

    # 2) voices.cast
    voices = _build_voices_cast(characters)
    _write_json(ds_dir / "voices.cast.json", voices)

    # 3) stylepacks
    stylepacks = _build_stylepacks()
    _write_json(ds_dir / "stylepacks.json", stylepacks)

    # 4) lexicon + pronunciations.sensitive
    lexicon = _build_lexicon(
        chapters, use_llm,
        per_ch=args.per_ch, win=args.win,
        block_chars=args.block_chars, max_blocks=args.max_blocks
    )
    _write_json(ds_dir / "lexicon.json", lexicon)

    sensitive = _build_pronunciations_sensitive(characters)
    _write_json(ds_dir / "pronunciations.sensitive.json", sensitive)

    # 5) actualizar narrative.structure con conteos reales
    norm = _normalize_structure(struct, ch_dir)
    structure_path = Path(args.structure)
    backup_path = structure_path.with_suffix(structure_path.suffix + ".bak")
    if structure_path.exists():
        structure_path.replace(backup_path)
    _write_json(structure_path, norm)
    _write_json(Path(args.structure), norm)

    print("Dossier generado en:", ds_dir)

if __name__ == "__main__":
    _HAS_LLM = True
    main()
