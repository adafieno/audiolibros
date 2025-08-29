# dossier/loader.py
# -*- coding: utf-8 -*-
"""
Loader del Dossier (estructura granular de producción).

Responsabilidades:
- Cargar componentes JSON del dossier desde un directorio raíz.
- Devolver un contenedor tipado (DossierParts) con los datos y metadatos (checksum, path).
- Enumerar planes SSML por capítulo (archivos *.plan.json en dossier/ssml.plan/).
- NO valida contra JSON Schema (use dossier/validator.py para eso).

Convenciones:
- Directorio raíz (PathsCfg.dossier_dir): contiene manifest.json, book.meta.json, etc.
- Carpeta de planes: dossier/ssml.plan/*.plan.json

Uso:
    from core.config import load_config
    from dossier.loader import load_all

    cfg = load_config()
    parts = load_all(cfg.paths.dossier_dir)
"""

from __future__ import annotations

import json
import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from core.errors import DossierNotFound, AudiobookError, ErrorContext


# ---------- Helpers de E/S ----------

def _sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def _read_json(path: Path) -> Tuple[Dict[str, Any], str]:
    """Lee JSON como dict y devuelve (data, sha256-hex)."""
    raw = path.read_bytes()
    checksum = _sha256_bytes(raw)
    data = json.loads(raw.decode("utf-8"))
    return data, checksum

def _optional_json(root: Path, rel: str) -> Optional[Tuple[Dict[str, Any], str, Path]]:
    p = (root / rel)
    if not p.exists():
        return None
    data, sha = _read_json(p)
    return data, sha, p


# ---------- Dataclasses de salida ----------

@dataclass
class Component:
    path: Path
    checksum: str
    data: Dict[str, Any]

@dataclass
class SsmlPlan:
    chapter_id: str
    path: Path
    checksum: str
    data: Dict[str, Any]

@dataclass
class DossierParts:
    root: Path
    manifest: Optional[Component] = None
    book_meta: Optional[Component] = None
    narrative_structure: Optional[Component] = None
    paratext_front: Optional[Component] = None
    characters: Optional[Component] = None
    voices_cast: Optional[Component] = None
    lexicon: Optional[Component] = None
    stylepacks: Optional[Component] = None
    sensitivity_rules: Optional[Component] = None
    pronunciations_sensitive: Optional[Component] = None
    production_settings: Optional[Component] = None
    qc_checklist: Optional[Component] = None
    delivery_targets: Optional[Component] = None
    ssml_plans: List[SsmlPlan] = field(default_factory=list)

    def get_plan_by_chapter(self, chapter_id: str) -> Optional[SsmlPlan]:
        for p in self.ssml_plans:
            if p.chapter_id == chapter_id:
                return p
        return None

    def to_summary(self) -> Dict[str, Any]:
        def present(x: Optional[Component]) -> bool:
            return x is not None
        return {
            "root": str(self.root),
            "manifest": present(self.manifest),
            "book_meta": present(self.book_meta),
            "narrative_structure": present(self.narrative_structure),
            "paratext_front": present(self.paratext_front),
            "characters": present(self.characters),
            "voices_cast": present(self.voices_cast),
            "lexicon": present(self.lexicon),
            "stylepacks": present(self.stylepacks),
            "sensitivity_rules": present(self.sensitivity_rules),
            "pronunciations_sensitive": present(self.pronunciations_sensitive),
            "production_settings": present(self.production_settings),
            "qc_checklist": present(self.qc_checklist),
            "delivery_targets": present(self.delivery_targets),
            "ssml_plans_count": len(self.ssml_plans),
        }


# ---------- Carga principal ----------

def load_all(root: Path | str) -> DossierParts:
    """
    Carga todos los componentes disponibles en `root` y devuelve DossierParts.
    Lanza DossierNotFound si la carpeta base no existe.
    No lanza si faltan componentes: esos campos quedan en None.
    """
    root = Path(root)
    if not root.exists():
        raise DossierNotFound(f"No existe el directorio dossier: {root}", context=ErrorContext(component="dossier", path=str(root)))

    parts = DossierParts(root=root)

    def add_component(attr: str, rel_path: str) -> None:
        opt = _optional_json(root, rel_path)
        if opt is None:
            return
        data, sha, p = opt
        setattr(parts, attr, Component(path=p, checksum=sha, data=data))

    # Componentes "top-level"
    add_component("manifest", "manifest.json")
    add_component("book_meta", "book.meta.json")
    add_component("narrative_structure", "narrative.structure.json")
    add_component("paratext_front", "paratext.front_matter.json")
    add_component("characters", "characters.json")
    add_component("voices_cast", "voices.cast.json")
    add_component("lexicon", "lexicon.json")
    add_component("stylepacks", "stylepacks.json")
    add_component("sensitivity_rules", "sensitivity.rules.json")
    add_component("pronunciations_sensitive", "pronunciations.sensitive.json")
    add_component("production_settings", "production.settings.json")
    add_component("qc_checklist", "qc.checklist.json")
    add_component("delivery_targets", "delivery.targets.json")

    # Planes SSML
    plans_dir = root / "ssml.plan"
    if plans_dir.exists():
        for p in sorted(plans_dir.glob("*.plan.json")):
            try:
                data, sha = _read_json(p)
                # Intentar inferir chapter_id desde el contenido; fallback por nombre
                chapter_id = data.get("chapter_id")
                if not chapter_id:
                    # nombre esperado: ch01.plan.json -> ch01
                    stem = p.stem  # "ch01.plan"
                    if "." in stem:
                        chapter_id = stem.split(".", 1)[0]
                    else:
                        chapter_id = stem
                parts.ssml_plans.append(SsmlPlan(chapter_id=chapter_id, path=p, checksum=sha, data=data))
            except Exception as e:
                # No aborta la carga completa; deja pista mínima
                raise AudiobookError(
                    f"Error al leer SSML plan: {p.name}",
                    context=ErrorContext(component="dossier", path=str(p)),
                    reason=str(e),
                )

    return parts


# ---------- Helpers de conveniencia ----------

def load_required(parts: DossierParts, name: str) -> Component:
    """
    Obtiene un componente obligatorio por nombre de atributo.
    Lanza AudiobookError si no está presente.
    """
    comp = getattr(parts, name, None)
    if comp is None:
        raise AudiobookError(
            f"Componente requerido no encontrado: {name}",
            context=ErrorContext(component="dossier", path=str(parts.root)),
        )
    return comp


def list_missing_required(parts: DossierParts, required: List[str]) -> List[str]:
    """Devuelve la lista de nombres de componentes faltantes."""
    missing: List[str] = []
    for name in required:
        if getattr(parts, name, None) is None:
            missing.append(name)
    return missing
