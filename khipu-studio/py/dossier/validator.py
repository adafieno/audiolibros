# dossier/validator.py
# -*- coding: utf-8 -*-
"""
Validación de componentes del dossier contra JSON Schema (2020-12).

Requiere: jsonschema>=4.0
    pip install jsonschema

Funciones principales:
- load_schema(schema_path): carga un schema y resuelve $ref relativos.
- validate_component(data, schema_path): devuelve lista de errores (vacía si OK).
- validate_all(parts, schema_dir): valida todos los componentes presentes en `parts`
  contra los schemas esperados; retorna un Report con detalles.

Notas:
- Las verificaciones de referencias cruzadas (character_id, chapter_id, etc.)
  se implementan en dossier/refcheck.py.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple

from jsonschema import Draft202012Validator, RefResolver, exceptions as js_exceptions

from core.errors import DossierSchemaValidation, ErrorContext
from dossier.loader import DossierParts, Component


# ----------------- Helpers de schema -----------------

def load_schema(schema_path: Path) -> Dict[str, Any]:
    """
    Carga un JSON Schema desde disco y prepara $id relativo.
    """
    base_uri = schema_path.resolve().as_uri()
    schema: Dict[str, Any] = json.loads(schema_path.read_text(encoding="utf-8"))
    # Si el schema no trae $id, usamos el path como base
    schema.setdefault("$id", base_uri)
    return schema

def _validator_for(schema: Dict[str, Any], base_path: Path) -> Draft202012Validator:
    """
    Crea un validador con soporte a $ref relativos al directorio del schema.
    """
    resolver = RefResolver(base_uri=base_path.resolve().as_uri() + "/", referrer=schema)  # type: ignore[arg-type]
    return Draft202012Validator(schema, resolver=resolver)


# ----------------- API de validación -----------------

def validate_component(data: Dict[str, Any], schema_path: Path) -> List[str]:
    """
    Valida un dict `data` contra `schema_path`.
    Retorna una lista de mensajes de error (vacía si no hay errores).
    """
    schema = load_schema(schema_path)
    validator = _validator_for(schema, schema_path.parent)

    errors: List[str] = []
    for err in sorted(validator.iter_errors(data), key=str):
        loc = " → ".join(str(x) for x in err.path) if err.path else "<root>"
        errors.append(f"{loc}: {err.message}")
    return errors


@dataclass
class ValidationResult:
    component: str
    path: Optional[Path]
    ok: bool
    errors: List[str] = field(default_factory=list)

@dataclass
class ValidationReport:
    schema_dir: Path
    results: List[ValidationResult] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(r.ok for r in self.results)

    def summary(self) -> Dict[str, Any]:
        return {
            "ok": self.ok,
            "results": [
                {
                    "component": r.component,
                    "path": str(r.path) if r.path else None,
                    "ok": r.ok,
                    "errors": r.errors,
                }
                for r in self.results
            ],
        }


# Mapeo componente → nombre de schema (archivo)
_SCHEMA_MAP: Dict[str, str] = {
    "manifest":                 "manifest.schema.json",
    "book_meta":                "book.meta.schema.json",
    "narrative_structure":      "narrative.structure.schema.json",
    "paratext_front":           "paratext.front_matter.schema.json",
    "characters":               "characters.schema.json",
    "voices_cast":              "voices.cast.schema.json",
    "lexicon":                  "lexicon.schema.json",
    "stylepacks":               "stylepacks.schema.json",
    "sensitivity_rules":        "sensitivity.rules.schema.json",
    "pronunciations_sensitive": "pronunciations.sensitive.schema.json",
    "production_settings":      "production.settings.schema.json",
    "qc_checklist":             "qc.checklist.schema.json",
    "delivery_targets":         "delivery.targets.schema.json",
    # SSML plans por capítulo usan un único schema:
    # cada archivo en dossier/ssml.plan/*.plan.json → ssml.plan.chapter.schema.json
}

def _component_items(parts: DossierParts) -> List[Tuple[str, Optional[Component]]]:
    return [
        ("manifest", parts.manifest),
        ("book_meta", parts.book_meta),
        ("narrative_structure", parts.narrative_structure),
        ("paratext_front", parts.paratext_front),
        ("characters", parts.characters),
        ("voices_cast", parts.voices_cast),
        ("lexicon", parts.lexicon),
        ("stylepacks", parts.stylepacks),
        ("sensitivity_rules", parts.sensitivity_rules),
        ("pronunciations_sensitive", parts.pronunciations_sensitive),
        ("production_settings", parts.production_settings),
        ("qc_checklist", parts.qc_checklist),
        ("delivery_targets", parts.delivery_targets),
    ]


def validate_all(parts: DossierParts, schema_dir: Path | str) -> ValidationReport:
    """
    Valida todos los componentes presentes en `parts` contra schemas en `schema_dir`.
    No falla inmediatamente: acumula errores y devuelve un reporte completo.
    Lanza DossierSchemaValidation si faltan schemas requeridos.
    """
    schema_dir = Path(schema_dir)
    report = ValidationReport(schema_dir=schema_dir)

    # 1) top-level components
    for name, comp in _component_items(parts):
        if comp is None:
            # No está presente → se omite del reporte (no es error de schema)
            continue
        schema_name = _SCHEMA_MAP.get(name)
        if not schema_name:
            # Esto solo ocurriría si olvidamos mapear algo nuevo
            report.results.append(ValidationResult(component=name, path=comp.path, ok=False,
                                                   errors=[f"Schema no mapeado para componente '{name}'"]))
            continue

        schema_path = schema_dir / "dossier" / schema_name
        if not schema_path.exists():
            raise DossierSchemaValidation(
                f"Schema ausente: {schema_path}",
                context=ErrorContext(component="dossier", path=str(schema_path)),
            )

        errors = validate_component(comp.data, schema_path)
        report.results.append(ValidationResult(component=name, path=comp.path, ok=(len(errors) == 0), errors=errors))

    # 2) chapter SSML plans
    ssml_schema = (schema_dir / "dossier" / "ssml.plan.chapter.schema.json")
    if parts.ssml_plans and not ssml_schema.exists():
        raise DossierSchemaValidation(
            f"Schema ausente para SSML plans: {ssml_schema}",
            context=ErrorContext(component="dossier", path=str(ssml_schema)),
        )

    for plan in parts.ssml_plans:
        errors = validate_component(plan.data, ssml_schema) if ssml_schema.exists() else []
        report.results.append(ValidationResult(
            component=f"ssml.plan:{plan.chapter_id}",
            path=plan.path,
            ok=(len(errors) == 0),
            errors=errors
        ))

    return report
