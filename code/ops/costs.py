# ops/costs.py
# -*- coding: utf-8 -*-
"""
Modelo de costos para el pipeline de audiolibros.

Fuentes de costo modeladas:
  - TTS (Azure u otro): por 1M caracteres (o por segundo). Incluye ratio de reintentos y %hits de caché.
  - LLM (OpenAI u otro): precio por 1K tokens (prompt/completion), con totales por etapa (extracciones, stylepacks, etc.).
  - Almacenamiento: GB·mes para WAV/MP3/FLAC/M4B y arte.
  - Transcodificación: costo aproximado por CPU-min (opcional, si usas cómputo de nube tarifado).
  - Transferencia: GB salientes (descargas/subidas).

Entradas:
  - Config de precios (JSON/YAML) o parámetros CLI.
  - Fuentes de volumen:
      a) Estimación: capítulos TXT (conteo de caracteres/palabras) o valores agregados.
      b) Auditoría: manifests (gplay_spotify), QC, o logs de telemetría en JSON.

Salidas:
  - Reporte JSON con desgloses.
  - CSV por capítulo.
  - Totales y sensibilidad (variando ±X% precios/volúmenes).

CLI ejemplos:
  # Estimar desde TXT + precios por defecto:
  python -m ops.costs \
    estimate \
    --chapters-dir analysis/chapters_txt \
    --out-json analysis/costs/report.json \
    --out-csv analysis/costs/chapters.csv

  # Auditar desde manifiesto y telemetría:
  python -m ops.costs \
    audit \
    --manifest deliverables/gplay_spotify/chapters_manifest.json \
    --telemetry analysis/telemetry.json \
    --out-json analysis/costs/report.audit.json

NOTA IMPORTANTE:
  Los precios varían con el tiempo y por región. Este módulo usa valores
  CONFIGURABLES. Ajusta ops/costs.pricing.json con tus tarifas reales.
"""

from __future__ import annotations

import csv
import json
import math
import os
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

try:
    import yaml  # opcional: pip install pyyaml
    _HAS_YAML = True
except Exception:
    _HAS_YAML = False

# ---------- Utilidades básicas ----------

def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")

def _safe_load_config(path: Optional[str|Path]) -> Dict[str, Any]:
    if not path:
        return {}
    p = Path(path)
    if not p.exists():
        raise SystemExit(f"No se encontró config de precios: {p}")
    if p.suffix.lower() in (".yml", ".yaml") and _HAS_YAML:
        return yaml.safe_load(_read_text(p)) or {}
    return json.loads(_read_text(p))

def _count_chars_words(text: str) -> Tuple[int, int]:
    import re
    words = re.findall(r"\b[\wÁÉÍÓÚÜÑáéíóúüñ'-]+\b", text)
    return len(text), len(words)

def _filesize_bytes(path: Path) -> int:
    try:
        return path.stat().st_size
    except Exception:
        return 0

# ---------- Modelos de precio (parametrizables) ----------

@dataclass
class TTSPrice:
    # Modelo típico: $X por 1M chars. Ajustable a $/segundo si prefieres.
    usd_per_1M_chars: float = 16.0        # <-- AJUSTA según tu plan Azure
    avg_chars_per_second: float = 18.0    # ≈ tasa de habla TTS (chars/s)
    retry_overhead_pct: float = 5.0       # % de reintentos (adds cost)
    cache_hit_rate_pct: float = 40.0      # % solicitudes servidas desde caché (reduce cost)

@dataclass
class LLMPrice:
    # Precios por 1K tokens (prompt/completion). Ajusta por modelo.
    model: str = "gpt-4o-mini"
    usd_per_1k_prompt: float = 0.15       # <-- AJUSTA
    usd_per_1k_completion: float = 0.60   # <-- AJUSTA

@dataclass
class StoragePrice:
    usd_per_GB_month: float = 0.023       # almacenamiento tipo object storage estándar

@dataclass
class ComputePrice:
    usd_per_cpu_min: float = 0.003        # costo referencial por CPU-min (opcional)

@dataclass
class TransferPrice:
    usd_per_GB_egress: float = 0.09       # salida (egress) por GB

@dataclass
class PricingConfig:
    tts: TTSPrice = TTSPrice()
    llm_default: LLMPrice = LLMPrice()
    storage: StoragePrice = StoragePrice()
    compute: ComputePrice = ComputePrice()
    transfer: TransferPrice = TransferPrice()
    # Precios específicos por modelo (override)
    llm_models: Dict[str, LLMPrice] = None

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "PricingConfig":
        def _mk(cls, key, default):
            return cls(**d.get(key, {})) if isinstance(d.get(key, {}), dict) else default
        cfg = PricingConfig(
            tts=_mk(TTSPrice, "tts", TTSPrice()),
            llm_default=_mk(LLMPrice, "llm_default", LLMPrice()),
            storage=_mk(StoragePrice, "storage", StoragePrice()),
            compute=_mk(ComputePrice, "compute", ComputePrice()),
            transfer=_mk(TransferPrice, "transfer", TransferPrice()),
        )
        models = d.get("llm_models") or {}
        out = {}
        for name, md in models.items():
            out[name] = LLMPrice(model=name, **md)
        cfg.llm_models = out
        return cfg

    def llm_for(self, model: Optional[str]) -> LLMPrice:
        if model and self.llm_models and model in self.llm_models:
            return self.llm_models[model]
        return self.llm_default

# ---------- Cálculo TTS ----------

def estimate_tts_cost(total_chars: int, pricing: PricingConfig) -> Dict[str, Any]:
    t = pricing.tts
    # Ajuste por caché: solo se paga la fracción no cacheada
    uncached = total_chars * (1.0 - t.cache_hit_rate_pct/100.0)
    # Overhead por reintentos (solo sobre lo no cacheado)
    effective = uncached * (1.0 + t.retry_overhead_pct/100.0)
    usd = (effective / 1_000_000.0) * t.usd_per_1M_chars
    seconds = total_chars / max(t.avg_chars_per_second, 1.0)
    return {
        "input_chars": total_chars,
        "cache_hit_rate_pct": t.cache_hit_rate_pct,
        "retry_overhead_pct": t.retry_overhead_pct,
        "billable_chars": round(effective),
        "est_synthesis_seconds": round(seconds),
        "usd": round(usd, 4),
        "unit": f"${t.usd_per_1M_chars}/1M chars"
    }

# ---------- Cálculo LLM ----------

def estimate_llm_cost(usages: List[Dict[str, Any]], pricing: PricingConfig) -> Dict[str, Any]:
    """
    usages: lista de dicts con {"stage":"characters|lexicon|...","model":"gpt-4o-mini","prompt_tokens":N,"completion_tokens":M}
    """
    total = 0.0
    rows = []
    for u in usages:
        model = u.get("model") or None
        pr = pricing.llm_for(model)
        ptok = int(u.get("prompt_tokens") or 0)
        ctok = int(u.get("completion_tokens") or 0)
        usd = (ptok/1000.0)*pr.usd_per_1k_prompt + (ctok/1000.0)*pr.usd_per_1k_completion
        rows.append({
            "stage": u.get("stage",""),
            "model": pr.model,
            "prompt_tokens": ptok,
            "completion_tokens": ctok,
            "usd": round(usd, 4),
            "unit_prompt": pr.usd_per_1k_prompt,
            "unit_completion": pr.usd_per_1k_completion,
        })
        total += usd
    return {"usd": round(total, 4), "rows": rows}

# ---------- Almacenamiento, Compute, Transfer ----------

def estimate_storage_cost(file_paths: List[str], pricing: PricingConfig, months: float = 1.0) -> Dict[str, Any]:
    total_bytes = sum(_filesize_bytes(Path(p)) for p in file_paths if p)
    gb = total_bytes / (1024**3)
    usd = gb * pricing.storage.usd_per_GB_month * max(months, 0)
    return {"gb": round(gb, 4), "months": months, "usd": round(usd, 4), "unit": f"${pricing.storage.usd_per_GB_month}/GB·mes"}

def estimate_compute_cost(cpu_minutes: float, pricing: PricingConfig) -> Dict[str, Any]:
    usd = cpu_minutes * pricing.compute.usd_per_cpu_min
    return {"cpu_minutes": round(cpu_minutes, 2), "usd": round(usd, 4), "unit": f"${pricing.compute.usd_per_cpu_min}/CPU·min"}

def estimate_transfer_cost(gb_egress: float, pricing: PricingConfig) -> Dict[str, Any]:
    usd = gb_egress * pricing.transfer.usd_per_GB_egress
    return {"gb": round(gb_egress, 3), "usd": round(usd, 4), "unit": f"${pricing.transfer.usd_per_GB_egress}/GB egress"}

# ---------- Estimación desde textos ----------

def estimate_from_chapters(chapters_dir: str|Path, avg_prompt_tok_per_kchar: float = 500.0, avg_completion_tok_per_kchar: float = 120.0, pricing: Optional[PricingConfig] = None, llm_model: Optional[str] = None) -> Dict[str, Any]:
    """
    Aproxima tokens LLM proporcional a caracteres (regla del pulgar):
      - prompt ≈ 500 tokens por 1K caracteres de entrada a prompts editoriales
      - completion ≈ 120 tokens por 1K caracteres de salida generada
    Ajusta estos factores según tu práctica real.
    """
    cfg = pricing or PricingConfig()
    ch_dir = Path(chapters_dir)
    txts = sorted(ch_dir.glob("ch*.txt"))
    chapters = []
    total_chars = 0
    ptoks = 0.0
    ctoks = 0.0
    for i, p in enumerate(txts, start=1):
        text = _read_text(p)
        nchar, nwords = _count_chars_words(text)
        total_chars += nchar
        ptok = (nchar/1000.0)*avg_prompt_tok_per_kchar
        ctok = (nchar/1000.0)*avg_completion_tok_per_kchar
        ptoks += ptok
        ctoks += ctok
        chapters.append({"id": f"ch{i:02d}", "file": str(p), "chars": nchar, "words": nwords})
    tts = estimate_tts_cost(total_chars, cfg)
    llm = estimate_llm_cost([{"stage":"dossier_build","model": llm_model or cfg.llm_default.model, "prompt_tokens": int(ptoks), "completion_tokens": int(ctoks)}], cfg)
    return {"chapters": chapters, "totals": {"chars": total_chars, "llm_tokens_prompt": int(ptoks), "llm_tokens_completion": int(ctoks)}, "costs": {"tts": tts, "llm": llm}}

# ---------- Auditoría desde manifiestos/logs ----------

def audit_from_artifacts(manifest_json: Optional[str|Path] = None, telemetry_json: Optional[str|Path] = None, pricing: Optional[PricingConfig] = None) -> Dict[str, Any]:
    """
    - manifest_json: salida de packaging.gplay_spotify (tiene duraciones por capítulo, rutas MP3/FLAC).
    - telemetry_json: un JSON opcional de tu pipeline con contadores (tts_chars, llm_tokens por etapa, cpu_min, gb_egress, etc.).
    """
    cfg = pricing or PricingConfig()
    tts_chars = None
    llm_rows: List[Dict[str, Any]] = []
    storage_files: List[str] = []
    gb_egress = 0.0
    cpu_min = 0.0

    if manifest_json and Path(manifest_json).exists():
        man = json.loads(_read_text(Path(manifest_json)))
        rows = man.get("rows") or []
        # No sabemos chars desde manifest, pero sí duraciones y archivos (para storage/transfer)
        for r in rows:
            if r.get("mp3_path"):
                storage_files.append(r["mp3_path"])
            if r.get("flac_path"):
                storage_files.append(r["flac_path"])

    if telemetry_json and Path(telemetry_json).exists():
        tel = json.loads(_read_text(Path(telemetry_json)))
        # Estas claves son orientativas; ajusta a tu formato real
        tts_chars = int(tel.get("tts_input_chars") or 0)
        gb_egress = float(tel.get("egress_gb") or 0.0)
        cpu_min = float(tel.get("cpu_minutes") or 0.0)
        llm_usages = tel.get("llm_usages") or []
        for u in llm_usages:
            llm_rows.append({
                "stage": u.get("stage",""),
                "model": u.get("model",""),
                "prompt_tokens": int(u.get("prompt_tokens") or 0),
                "completion_tokens": int(u.get("completion_tokens") or 0),
            })

    costs = {}
    if tts_chars:
        costs["tts"] = estimate_tts_cost(tts_chars, cfg)
    if llm_rows:
        costs["llm"] = estimate_llm_cost(llm_rows, cfg)
    if storage_files:
        costs["storage_1mo"] = estimate_storage_cost(storage_files, cfg, months=1.0)
    if gb_egress:
        costs["egress"] = estimate_transfer_cost(gb_egress, cfg)
    if cpu_min:
        costs["compute"] = estimate_compute_cost(cpu_min, cfg)

    return {"artifacts": {"manifest": manifest_json, "telemetry": telemetry_json}, "costs": costs}

# ---------- Sensibilidad ----------

def sensitivity(base_report: Dict[str, Any], factor_pct: float = 10.0) -> Dict[str, Any]:
    """
    Varía ±factor% los precios TTS/LLM y entrega impacto.
    """
    def _adj(v, pct): return round(v*(1.0+pct/100.0), 4)
    out = {"+pct": factor_pct, "-pct": -factor_pct, "variants": []}
    for sign in (+factor_pct, -factor_pct):
        var = {"delta_pct": sign, "est": {}}
        costs = base_report.get("costs") or base_report
        for key, blk in costs.items():
            if not isinstance(blk, dict) or "usd" not in blk:
                continue
            var["est"][key] = {"usd": _adj(float(blk["usd"]), sign)}
        out["variants"].append(var)
    return out

# ---------- Reporte CSV ----------

def write_chapters_csv(chapters: List[Dict[str, Any]], path: str|Path) -> Path:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    fields = ["id","file","chars","words"]
    with p.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in chapters:
            w.writerow({k: row.get(k,"") for k in fields})
    return p

# ---------- CLI ----------

def _load_pricing(pricing_path: Optional[str|Path]) -> PricingConfig:
    d = _safe_load_config(pricing_path)
    return PricingConfig.from_dict(d) if d else PricingConfig()

def main():
    import argparse
    ap = argparse.ArgumentParser(description="Modelo/Auditor de costos del pipeline.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    # estimate
    est = sub.add_parser("estimate", help="Estimar costos desde capítulos TXT.")
    est.add_argument("--chapters-dir", required=True)
    est.add_argument("--pricing", help="JSON/YAML con precios (tts/llm/storage/compute/transfer).")
    est.add_argument("--llm-model", default=None)
    est.add_argument("--prompt-tok-per-kchar", type=float, default=500.0)
    est.add_argument("--completion-tok-per-kchar", type=float, default=120.0)
    est.add_argument("--out-json")
    est.add_argument("--out-csv")

    # audit
    aud = sub.add_parser("audit", help="Auditar costos desde manifest/telemetry.")
    aud.add_argument("--manifest", help="deliverables/gplay_spotify/chapters_manifest.json")
    aud.add_argument("--telemetry", help="analysis/telemetry.json (con llm_usages, tts_chars, egress, cpu_minutes)")
    aud.add_argument("--pricing", help="JSON/YAML con precios")
    aud.add_argument("--out-json")

    # sensitivity
    sen = sub.add_parser("sensitivity", help="Variación ±% de precios sobre un reporte JSON.")
    sen.add_argument("--in-json", required=True)
    sen.add_argument("--pct", type=float, default=10.0)
    sen.add_argument("--out-json")

    args = ap.parse_args()

    if args.cmd == "estimate":
        pricing = _load_pricing(args.pricing)
        rep = estimate_from_chapters(
            args.chapters_dir,
            avg_prompt_tok_per_kchar=args.prompt_tok_per_kchar,
            avg_completion_tok_per_kchar=args.completion_tok_per_kchar,
            pricing=pricing,
            llm_model=args.llm_model,
        )
        # costo total directo (tts+llm)
        total_usd = (rep["costs"]["tts"]["usd"] + rep["costs"]["llm"]["usd"])
        rep["costs"]["total_usd"] = round(total_usd, 4)
        if args.out_csv:
            write_chapters_csv(rep["chapters"], args.out_csv)
            print(f"CSV capítulos → {args.out_csv}")
        if args.out_json:
            Path(args.out_json).parent.mkdir(parents=True, exist_ok=True)
            Path(args.out_json).write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"Reporte → {args.out_json}")
        else:
            print(json.dumps(rep, ensure_ascii=False, indent=2))

    elif args.cmd == "audit":
        pricing = _load_pricing(args.pricing)
        rep = audit_from_artifacts(args.manifest, args.telemetry, pricing=pricing)
        # suma total si están ambos
        total = 0.0
        for blk in (rep.get("costs") or {}).values():
            if isinstance(blk, dict) and "usd" in blk:
                total += float(blk["usd"])
        rep["total_usd"] = round(total, 4)
        if args.out_json:
            Path(args.out_json).parent.mkdir(parents=True, exist_ok=True)
            Path(args.out_json).write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"Reporte → {args.out_json}")
        else:
            print(json.dumps(rep, ensure_ascii=False, indent=2))

    elif args.cmd == "sensitivity":
        base = json.loads(Path(args.in_json).read_text(encoding="utf-8"))
        rep = sensitivity(base, factor_pct=args.pct)
        if args.out_json:
            Path(args.out_json).parent.mkdir(parents=True, exist_ok=True)
            Path(args.out_json).write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"Sensibilidad → {args.out_json}")
        else:
            print(json.dumps(rep, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
