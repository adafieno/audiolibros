# audio/qc_report.py
# -*- coding: utf-8 -*-
"""
QC consolidado por capítulo.

Pipeline sugerido:
  1) WAV capítulo crudo (post-concat):           audio/wav/ch01.wav
  2) WAV mejorado (enhance):                     deliverables/tmp/ch01_enh.wav
  3) WAV normalizado (mastering):                deliverables/tmp/ch01_norm.wav

Este módulo:
  - Mide métricas (RMS, true-peak, noise, lufs_like, clipped) en las 3 etapas si están presentes.
  - Aplica reglas de validación (umbrales configurables).
  - Emite JSON + (opcional) Markdown.

Requisitos:
  pip install soundfile numpy  # (y/o pydub como fallback para metrics)

CLI:
  python -m audio.qc_report \
      --chapter-id ch01 \
      --raw audio/wav/ch01.wav \
      --enh deliverables/tmp/ch01_enh.wav \
      --norm deliverables/tmp/ch01_norm.wav \
      --json analysis/qc/ch01.report.json \
      --md analysis/qc/ch01.report.md
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Any, Optional, List

from audio.metrics import analyze


# ---------------- Config de umbrales ----------------

@dataclass
class QCRules:
    rms_min_dbfs: float = -23.0      # rango recomendado: [-23, -18] dBFS
    rms_max_dbfs: float = -18.0
    true_peak_max_dbfs: float = -3.0
    noise_floor_max_dbfs: float = -60.0  # piso de ruido debe ser <= -60
    lufs_min_db: float = -23.0
    lufs_max_db: float = -18.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ---------------- Reporte y helpers ----------------

@dataclass
class StageMetrics:
    path: str
    sr_hz: int
    duration_s: float
    rms_dbfs: float
    true_peak_dbfs: float
    noise_floor_dbfs: float
    lufs_like: float
    clipped: bool

def _safe_analyze(p: Optional[str]) -> Optional[StageMetrics]:
    if not p:
        return None
    pp = Path(p)
    if not pp.exists():
        return None
    m = analyze(pp)
    return StageMetrics(**m)  # mismo contrato

def _flag(condition: bool, code: str, message: str) -> Optional[Dict[str, Any]]:
    return {"code": code, "message": message} if condition else None


def _evaluate_stage(m: StageMetrics, rules: QCRules, label: str) -> List[Dict[str, Any]]:
    issues: List[Dict[str, Any]] = []
    f = issues.append

    # RMS
    if m.rms_dbfs < rules.rms_min_dbfs:
        f({"level": "warning", "code": f"{label}.rms_low", "message": f"RMS bajo ({m.rms_dbfs} dBFS < {rules.rms_min_dbfs})."})
    if m.rms_dbfs > rules.rms_max_dbfs:
        f({"level": "warning", "code": f"{label}.rms_high", "message": f"RMS alto ({m.rms_dbfs} dBFS > {rules.rms_max_dbfs})."})

    # True peak
    if m.true_peak_dbfs > rules.true_peak_max_dbfs:
        f({"level": "error", "code": f"{label}.peak_over", "message": f"Pico {m.true_peak_dbfs} dBFS > ceiling {rules.true_peak_max_dbfs} dBFS."})

    # Noise floor
    if m.noise_floor_dbfs > rules.noise_floor_max_dbfs:
        f({"level": "warning", "code": f"{label}.noise_floor", "message": f"Piso de ruido {m.noise_floor_dbfs} dBFS > {rules.noise_floor_max_dbfs} dBFS (demasiado alto)."})

    # LUFS aproximado
    if m.lufs_like < rules.lufs_min_db or m.lufs_like > rules.lufs_max_db:
        f({"level": "info", "code": f"{label}.lufs_out", "message": f"LUFS-like {m.lufs_like} fuera de [{rules.lufs_min_db}, {rules.lufs_max_db}] (solo referencia rápida)."})

    # Clipping
    if m.clipped:
        f({"level": "error", "code": f"{label}.clipped", "message": "Clipping detectado (true-peak ≈ 0 dBFS)."})

    return issues


# ---------------- API pública ----------------

def build_report(
    chapter_id: str,
    *,
    raw_wav: Optional[str] = None,
    enhanced_wav: Optional[str] = None,
    normalized_wav: Optional[str] = None,
    rules: Optional[QCRules] = None,
) -> Dict[str, Any]:
    """
    Genera reporte con métricas y flags por etapa.
    """
    rules = rules or QCRules()

    raw_m = _safe_analyze(raw_wav)
    enh_m = _safe_analyze(enhanced_wav)
    norm_m = _safe_analyze(normalized_wav)

    stages = {
        "raw": raw_m,
        "enhanced": enh_m,
        "normalized": norm_m,
    }

    issues: List[Dict[str, Any]] = []
    for label, m in stages.items():
        if m:
            issues.extend(_evaluate_stage(m, rules, label))

    ok = all(i["level"] != "error" for i in issues)

    return {
        "chapter_id": chapter_id,
        "rules": rules.to_dict(),
        "stages": {
            k: (asdict(v) if v else None) for k, v in stages.items()
        },
        "issues": issues,
        "ok": ok,
    }


def to_markdown(report: Dict[str, Any]) -> str:
    """
    Render mínimo a Markdown legible para editores.
    """
    ch = report.get("chapter_id")
    ok = report.get("ok")
    issues = report.get("issues", [])
    stages = report.get("stages", {})

    lines: List[str] = []
    lines.append(f"# QC Capítulo {ch} {'✅' if ok else '⚠️'}")
    lines.append("")
    def _stage_table(name: str, m: Optional[Dict[str, Any]]):
        lines.append(f"## {name.capitalize()}")
        if not m:
            lines.append("_sin archivo_")
            lines.append("")
            return
        lines.append("| Métrica | Valor |")
        lines.append("|---|---:|")
        lines.append(f"| Duración (s) | {m['duration_s']:.3f} |")
        lines.append(f"| RMS (dBFS) | {m['rms_dbfs']:.2f} |")
        lines.append(f"| True peak (dBFS) | {m['true_peak_dbfs']:.2f} |")
        lines.append(f"| Piso de ruido (dBFS) | {m['noise_floor_dbfs']:.2f} |")
        lines.append(f"| LUFS-like | {m['lufs_like']:.2f} |")
        lines.append(f"| Clipped | {'Sí' if m['clipped'] else 'No'} |")
        lines.append("")
        lines.append(f"_Archivo_: `{m['path']}`")
        lines.append("")

    _stage_table("raw", stages.get("raw"))
    _stage_table("enhanced", stages.get("enhanced"))
    _stage_table("normalized", stages.get("normalized"))

    if issues:
        lines.append("## Observaciones")
        for it in issues:
            tag = {"error":"❌","warning":"⚠️","info":"ℹ️"}.get(it["level"], "•")
            lines.append(f"- {tag} **{it['code']}** — {it['message']}")
    else:
        lines.append("## Observaciones")
        lines.append("Sin observaciones. ✅")

    return "\n".join(lines)


# ---------------- CLI ----------------

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Reporte QC por capítulo")
    ap.add_argument("--chapter-id", required=True)
    ap.add_argument("--raw")
    ap.add_argument("--enh")
    ap.add_argument("--norm")
    ap.add_argument("--json", dest="json_out")
    ap.add_argument("--md", dest="md_out")
    args = ap.parse_args()

    rep = build_report(
        args.chapter_id,
        raw_wav=args.raw,
        enhanced_wav=args.enh,
        normalized_wav=args.norm
    )

    if args.json_out:
        Path(args.json_out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json_out).write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"JSON → {args.json_out}")

    if args.md_out:
        md = to_markdown(rep)
        Path(args.md_out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.md_out).write_text(md, encoding="utf-8")
        print(f"MD → {args.md_out}")

    if not args.json_out and not args.md_out:
        print(json.dumps(rep, ensure_ascii=False, indent=2))
