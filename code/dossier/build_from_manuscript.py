# dossier/build_from_manuscript.py
# -*- coding: utf-8 -*-
"""
Construye el 'dossier' inicial desde los TXT por capítulo.

Requiere:
    - analysis/chapters_txt/chXX.txt
    - dossier/narrative.structure.json (emitido por ingest/manuscript_parser.py)
    - client.py con función chat_json(messages=[...], max_tokens=..., strict=...)

Uso:
    python -m dossier.build_from_manuscript \
        --chapters-dir analysis/chapters_txt \
        --structure dossier/narrative.structure.json \
        --dossier-dir dossier \
        --use-llm true|false
        (obligatorio) --use-llm true = usar LLMs; --use-llm false = no usar LLMs
"""
from __future__ import annotations
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Any, List, Optional
from client import chat_json  # tu cliente unificado (OpenAI/otros)

       

# -------------- Utilidades básicas --------------

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
                        # omite, pero deja registro mínimo
                        out.append({"id": cid, "title": title, "text": ""})
                else:
                        out.append({"id": cid, "title": title, "text": p.read_text(encoding="utf-8")})
        return out

# -------------- Extracciones rápidas sin LLM --------------

_WORD = re.compile(r"\b[\wÁÉÍÓÚÜÑáéíóúüñ'-]+\b")
_UPPER_NAME = re.compile(r"\b([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+){0,2})\b")
def _candidate_names(text: str) -> List[str]:
        # nombres propios aproximados (palabras capitalizadas no al inicio de oración)
        # heurística sencilla: secuencias Capitalizadas de 1-3 palabras
        cands = Counter()
        for m in _UPPER_NAME.finditer(text):
                name = m.group(1).strip()
                if len(name) < 2:
                        continue
                if name.lower() in ("capítulo", "prólogo", "epílogo"):
                        continue
                cands[name] += 1
        # top n
        return [n for n, _ in cands.most_common(20)]

def _proper_terms(text: str) -> List[str]:
        # términos potenciales para lexicón (no puramente funcionales)
        tokens = [t for t in _WORD.findall(text)]
        # filtra tokens muy cortos y números puros
        terms = [t for t in tokens if len(t) > 3 and not t.isdigit()]
        # más frecuentes
        freq = Counter([t.lower() for t in terms])
        common = [w for w, c in freq.most_common(100)]
        return common[:50]

# -------------- LLM prompts --------------

_SYS = ("Eres un editor en español (Perú). Extrae personajes principales (5–15), sin inventar, "
                "con breves rasgos y relaciones. Devuelve JSON con 'characters': "
                "[{'id','display_name','aliases':[],'bio':'...'}] y 'requires_review':true.")
_USER_CHAR = ("Texto del libro (muestras de varios capítulos). Identifica PERSONAJES PRINCIPALES y ALIASES. "
                            "No inventes; si no estás seguro de un nombre, omítelo.\n\n{snippet}")

_SYS_LEX = ("Eres un lingüista. Extrae 10–40 términos candidatos para un lexicón de pronunciación en español (Perú). "
                        "Incluye nombres propios, topónimos y préstamos. Devuelve JSON {'terms':[{'grapheme','ipa'?:'','notes'?:''}], 'requires_review':true}.")
_USER_LEX = ("Texto del libro (muestras). Proporciona candidatos (sin inventar IPA si no estás seguro). Incluye 'ipa' solo si es confiable.\n\n{snippet}")

# -------------- Generadores de dossier --------------

def _build_characters(chapters: List[Dict[str, Any]], use_llm: bool) -> Dict[str, Any]:
        # snippet: concatenar comienzos de capítulos (capados)
        sample = "\n\n".join(ch["text"][:1500] for ch in chapters[:6])
        if use_llm and _HAS_LLM and sample.strip():
                print("Enviando solicitud LLM para personajes...")
                obj = chat_json(
                        messages=[{"role":"system","content":_SYS},
                                            {"role":"user","content":_USER_CHAR.format(snippet=sample)}],
                        max_tokens=1100,
                        strict=False,
                )
                chars = obj.get("characters") if isinstance(obj, dict) else None
                if isinstance(chars, list) and chars:
                        return {"characters": chars, "requires_review": True, "source": "llm"}
        # fallback heurístico
        names = _candidate_names(sample)
        items = [{"id": f"p{i+1:02d}", "display_name": n, "aliases": [], "bio": ""} for i, n in enumerate(names)]
        return {"characters": items, "requires_review": True, "source": "heuristic"}

def _build_voices_cast(characters: Dict[str, Any]) -> Dict[str, Any]:
        cast = []
        # Sugerir voz base femenina neutra para narrador; personajes alternan masculino/femenino por orden
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

def _build_lexicon(chapters: List[Dict[str, Any]], use_llm: bool) -> Dict[str, Any]:
        sample = "\n\n".join(ch["text"][:1500] for ch in chapters[:6])
        if use_llm and _HAS_LLM and sample.strip():
                obj = chat_json(
                        messages=[{"role":"system","content":_SYS_LEX},
                                            {"role":"user","content":_USER_LEX.format(snippet=sample)}],
                        max_tokens=1100,
                        strict=False,
                )
                terms = obj.get("terms") if isinstance(obj, dict) else None
                if isinstance(terms, list) and terms:
                        return {"terms": terms, "requires_review": True, "source": "llm"}
        # fallback: términos frecuentes (sin IPA)
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

# -------------- CLI --------------

def main():
        import argparse
        ap = argparse.ArgumentParser(description="Construye el dossier inicial a partir de capítulos TXT.")
        ap.add_argument("--chapters-dir", required=True)
        ap.add_argument("--structure", required=True)
        ap.add_argument("--dossier-dir", required=True)
        # --use-llm is now required and must be either 'true' or 'false' (case-insensitive)
        ap.add_argument(
                "--use-llm",
                required=True,
                type=str.lower,
                choices=("true", "false"),
                help="Obligatorio: 'true' para usar LLMs; 'false' para no usar LLMs (case-insensitive)."
        )
        args = ap.parse_args()

        ch_dir = Path(args.chapters_dir)
        ds_dir = Path(args.dossier_dir)
        struct = _read_json(Path(args.structure))
        chapters = _load_chapters(ch_dir, struct)
        llm_flag = (args.use_llm == "true")
        # use_llm is True only if the user allows LLMs (--use-llm true) and the client is available
        use_llm = llm_flag and _HAS_LLM

        # 1) characters
        characters = _build_characters(chapters, use_llm)
        _write_json(ds_dir / "characters.json", characters)

        # 2) voices.cast (sugerido)
        voices = _build_voices_cast(characters)
        _write_json(ds_dir / "voices.cast.json", voices)

        # 3) stylepacks base
        stylepacks = _build_stylepacks()
        _write_json(ds_dir / "stylepacks.json", stylepacks)

        # 4) lexicon + pronunciations.sensitive
        lexicon = _build_lexicon(chapters, use_llm)
        _write_json(ds_dir / "lexicon.json", lexicon)

        sensitive = _build_pronunciations_sensitive(characters)
        _write_json(ds_dir / "pronunciations.sensitive.json", sensitive)
        # 5) actualizar narrative.structure con conteos reales
        norm = _normalize_structure(struct, ch_dir)
        # Backup original structure file before overwriting
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
