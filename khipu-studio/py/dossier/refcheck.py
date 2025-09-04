# dossier/refcheck.py
# -*- coding: utf-8 -*-
"""
Chequeos de referencias cruzadas y consistencia global del dossier.

- Verifica que character_id en voices.cast exista en characters.json.
- Verifica que chapter_id de ssml.plan/* exista en narrative.structure.
- Verifica que voice (de chunk) exista: o bien es un character_id (multivoces)
  o bien coincide con alguna voz del narrador/voice_id declarada (según criterio del proyecto).
- Verifica que stylepack usado en ssml.plan exista en stylepacks.json.
- Verifica límites globales (Azure): tamaño estimado (KB) y nº de etiquetas por chunk (si se provee estimador).
- Señala warnings útiles (p. ej., cast sin personaje o personajes sin cast).

NOTA: Este módulo no parsea SSML real; trabaja sobre los JSON del dossier.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Any, Set, Tuple

from core.errors import DossierReferenceError, ErrorContext
from dossier.loader import DossierParts, Component, SsmlPlan


@dataclass
class RefIssue:
    level: str           # "error" | "warning"
    component: str       # p.ej. "voices.cast", "ssml.plan:ch01"
    message: str
    context: Dict[str, Any] = field(default_factory=dict)

@dataclass
class RefReport:
    issues: List[RefIssue] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(i.level != "error" for i in self.issues)

    def add(self, level: str, component: str, message: str, **ctx: Any) -> None:
        self.issues.append(RefIssue(level, component, message, ctx))

    def errors(self) -> List[RefIssue]:
        return [i for i in self.issues if i.level == "error"]

    def warnings(self) -> List[RefIssue]:
        return [i for i in self.issues if i.level == "warning"]

    def summary(self) -> Dict[str, Any]:
        return {
            "ok": self.ok,
            "errors": len(self.errors()),
            "warnings": len(self.warnings()),
            "details": [i.__dict__ for i in self.issues],
        }


# -------- Helpers de extracción --------

def _ids_characters(characters: Optional[Component]) -> Set[str]:
    ids: Set[str] = set()
    if characters:
        for c in characters.data.get("characters", []):
            cid = c.get("id")
            if isinstance(cid, str):
                ids.add(cid)
    return ids

def _ids_stylepacks(stylepacks: Optional[Component]) -> Set[str]:
    ids: Set[str] = set()
    if stylepacks:
        for p in stylepacks.data.get("packs", []):
            pid = p.get("id")
            if isinstance(pid, str):
                ids.add(pid)
    return ids

def _ids_chapters(narrative_structure: Optional[Component]) -> Set[str]:
    ids: Set[str] = set()
    if narrative_structure:
        for ch in narrative_structure.data.get("chapters", []):
            cid = ch.get("id")
            if isinstance(cid, str):
                ids.add(cid)
    return ids

def _cast_map(voices_cast: Optional[Component]) -> Dict[str, Dict[str, Any]]:
    m: Dict[str, Dict[str, Any]] = {}
    if voices_cast:
        for item in voices_cast.data.get("cast", []):
            cid = item.get("character_id")
            if isinstance(cid, str):
                m[cid] = item
    return m


# -------- Reglas principales --------

def check_references(parts: DossierParts, *, ssml_limits: Optional[Dict[str, int]] = None) -> RefReport:
    """
    Ejecuta chequeos de referencias cruzadas y límites.
    - ssml_limits opcional: {"max_kb_per_request": int, "max_voice_tags_per_request": int}
    Devuelve RefReport con errores/warnings agregados.
    """
    report = RefReport()

    char_ids = _ids_characters(parts.characters)
    style_ids = _ids_stylepacks(parts.stylepacks)
    chapter_ids = _ids_chapters(parts.narrative_structure)
    cast_by_char = _cast_map(parts.voices_cast)

    # voices.cast → characters
    if parts.voices_cast:
        for item in parts.voices_cast.data.get("cast", []):
            cid = item.get("character_id")
            if not isinstance(cid, str) or cid not in char_ids:
                report.add(
                    "error", "voices.cast",
                    f"character_id inexistente en characters.json: {cid!r}",
                    character_id=cid
                )

    # characters sin cast (warning)
    if parts.characters:
        for cid in char_ids:
            if cid not in cast_by_char:
                report.add(
                    "warning", "voices.cast",
                    f"Personaje sin voz asignada: {cid}",
                    character_id=cid
                )

    # ssml.plan/* → chapter_id existente + stylepack válido
    for plan in parts.ssml_plans:
        comp_name = f"ssml.plan:{plan.chapter_id}"
        # capítulo
        if plan.chapter_id not in chapter_ids:
            report.add(
                "error", comp_name,
                f"chapter_id '{plan.chapter_id}' no existe en narrative.structure.json"
            )
        # chunks
        chunks = plan.data.get("chunks", [])
        if not isinstance(chunks, list) or not chunks:
            report.add("error", comp_name, "No hay 'chunks' definidos")
            continue

        for ch in chunks:
            chunk_id = ch.get("id")
            # stylepack
            sp = ch.get("stylepack")
            if isinstance(sp, str) and sp not in style_ids:
                report.add("error", comp_name, f"stylepack inexistente: {sp}", chunk_id=chunk_id)

            # voice: admitimos dos variantes de proyecto:
            #   a) 'voice' es un character_id (multivoces)
            #   b) 'voice' es un literal de voz Azure (ej. es-ES-ElviraNeural)
            v = ch.get("voice")
            if not isinstance(v, str) or not v:
                report.add("error", comp_name, "Campo 'voice' vacío", chunk_id=chunk_id)
            else:
                # heurística: si se parece a Azure voice → OK; si no, exigir que sea character_id válido
                looks_azure = "-" in v and "Neural" in v
                if not looks_azure and v not in char_ids:
                    report.add(
                        "warning", comp_name,
                        f"voice '{v}' no es Azure ni character_id conocido (verifica intención)",
                        chunk_id=chunk_id
                    )

        # límites SSML (si provees estimador real, reemplaza estas heurísticas)
        if ssml_limits:
            max_kb = int(ssml_limits.get("max_kb_per_request", 0) or 0)
            max_voice_tags = int(ssml_limits.get("max_voice_tags_per_request", 0) or 0)
            if max_kb or max_voice_tags:
                # Estimaciones aproximadas por chunk (sin render SSML real):
                # - Longitud textual ~ bytes → KB ~ len/1024
                # - voice tags ~ 1 por chunk (mínimo), más si alternas voces
                for ch in chunks:
                    tid = ch.get("id")
                    # bytes por rango (si tuvieses el texto real, calcula mejor); placeholder:
                    approx_bytes = (ch.get("end_char", 0) - ch.get("start_char", 0)) * 1.2
                    approx_kb = int(max(0, approx_bytes) / 1024)
                    if max_kb and approx_kb > max_kb:
                        report.add(
                            "warning", comp_name,
                            f"Chunk {tid} ~{approx_kb}KB supera límite estimado {max_kb}KB (divide el chunk).",
                            chunk_id=tid, approx_kb=approx_kb, limit_kb=max_kb
                        )
                    if max_voice_tags and max_voice_tags < 1:
                        report.add(
                            "warning", comp_name,
                            "max_voice_tags_per_request configurado < 1 (revisar compat)."
                        )

    return report
