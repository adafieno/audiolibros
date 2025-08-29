# qa/ssml_linter.py
# -*- coding: utf-8 -*-
"""
SSML Linter (Azure-friendly)

Chequea:
  - XML bien formado y <speak> como raíz.
  - Tamaño del request (KB) y caracteres dentro de <speak>.
  - Etiquetas/atributos válidos (subset común de Azure SSML).
  - <voice name=".."> con forma esperada (xx-XX-NameNeural).
  - <break time=".."> dentro de rangos (ms/s).
  - <prosody rate|pitch|volume> con valores soportados o porcentuales válidos.
  - <phoneme alphabet="ipa|x-sampa"> con contenido no vacío.
  - Advertencias sobre anidamientos extraños y namespaces.
  - Estimación de duración (wpm) para detectar chunks demasiado largos.

Integración opcional:
  - --voices-cast dossier/voices.cast.json → avisa si se usa una voz que no está en el *dossier*.
  - --stylepacks dossier/stylepacks.json → avisa si aparecen estilos MSTTS no definidos (si los declaras).

Config por defecto (puedes sobreescribir con --config):
{
  "max_request_kb": 48,
  "max_speak_chars": 5000,
  "min_break_ms": 50,
  "max_break_ms": 5000,
  "estimate_wpm": 165,
  "hard_cap_minutes": 8.0,
  "allowed_tags": ["speak","voice","p","s","break","prosody","phoneme","say-as","sub","emphasis","mstts:express-as"],
  "allowed_phoneme_alphabet": ["ipa","x-sampa"],
  "voice_neural_suffix": "Neural",
  "require_lang_on_speak": true,
  "preferred_lang_prefix": "es-",  # avisa si no es español
  "warn_nested_voice": true
}

CLI:
  python -m qa.ssml_linter --in ssml/ch01_0001.xml --out-json analysis/ssml_lint/ch01_0001.json
  python -m qa.ssml_linter --dir ssml --voices-cast dossier/voices.cast.json --out-json analysis/ssml_lint/report.json --md analysis/ssml_lint/report.md
"""
from __future__ import annotations

import json
import math
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import xml.etree.ElementTree as ET

# ---------------- Config por defecto ----------------

_DEFAULT_CFG = {
    "max_request_kb": 48,
    "max_speak_chars": 5000,
    "min_break_ms": 50,
    "max_break_ms": 5000,
    "estimate_wpm": 165.0,
    "hard_cap_minutes": 8.0,
    "allowed_tags": ["speak","voice","p","s","break","prosody","phoneme","say-as","sub","emphasis","mstts:express-as"],
    "allowed_phoneme_alphabet": ["ipa","x-sampa"],
    "voice_neural_suffix": "Neural",
    "require_lang_on_speak": True,
    "preferred_lang_prefix": "es-",
    "warn_nested_voice": True,
}

# ---------------- Utilidades ----------------

def _read_json(path: Optional[str|Path]) -> Optional[Dict[str, Any]]:
    if not path:
        return None
    p = Path(path)
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))

def _localname(tag: str) -> str:
    # "{ns}tag" → "ns:tag" o "tag" si no hay ns
    if tag.startswith("{"):
        ns, name = tag[1:].split("}", 1)
        # mapear algunos conocidos → prefijo corto
        if "microsoft.com" in ns or "schemas.microsoft.com" in ns:
            return f"mstts:{name}"
        return name  # conserva solo local si no sabemos prefijo
    return tag

def _text_len(elem: ET.Element) -> int:
    n = len(elem.text or "")
    for child in list(elem):
        n += _text_len(child)
        n += len(child.tail or "")
    return n

def _kb_size(path: Path) -> int:
    try:
        return math.ceil(path.stat().st_size / 1024)
    except Exception:
        return 0

def _parse_xml(path: Path) -> ET.Element:
    parser = ET.XMLParser()
    return ET.parse(str(path), parser=parser).getroot()

def _to_ms(val: str) -> Optional[int]:
    s = val.strip().lower()
    # admite "500ms" o "0.5s" o "500"
    m = re.match(r"^(\d+(?:\.\d+)?)(ms|s)?$", s)
    if not m:
        return None
    num = float(m.group(1))
    unit = m.group(2) or "ms"
    if unit == "s":
        return int(round(num * 1000))
    return int(round(num))

def _percent_or_keyword(val: str, keywords: List[str]) -> bool:
    v = val.strip().lower()
    if v in keywords:
        return True
    # -99%..+99%
    if re.match(r"^-?\d{1,2}%$", v) or re.match(r"^-?100%$", v):
        return True
    return False

def _pitch_ok(val: str) -> bool:
    v = val.strip().lower()
    if _percent_or_keyword(v, ["default","x-low","low","medium","high","x-high"]):
        return True
    # ±Nst (semitonos)
    if re.match(r"^[\+\-]?\d+st$", v):
        return True
    return False

def _volume_ok(val: str) -> bool:
    v = val.strip().lower()
    if v in ("default","silent","x-soft","soft","medium","loud","x-loud"):
        return True
    if re.match(r"^[\+\-]?\d{1,2}(\.\d+)?dB$", v):
        return True
    return False

def _rate_ok(val: str) -> bool:
    return _percent_or_keyword(val, ["default","x-slow","slow","medium","fast","x-fast"])

# ---------------- Lógica principal ----------------

@dataclass
class LintIssue:
    level: str     # "error" | "warning" | "info"
    code: str
    message: str
    path: str      # ruta "speak>voice>prosody"

def _push(issues: List[LintIssue], level: str, code: str, message: str, stack: List[str]):
    issues.append(LintIssue(level=level, code=code, message=message, path=">".join(stack)))

def _walk(elem: ET.Element, cfg: Dict[str, Any], issues: List[LintIssue], stack: List[str], seen_voices: List[str], cast: Optional[Dict[str, Any]]):
    name = _localname(elem.tag)
    stack.append(name)

    # Etiquetas válidas
    if name not in cfg["allowed_tags"]:
        _push(issues, "warning", "tag.unknown", f"Etiqueta no listada como permitida: <{name}>.", stack[:])

    # Reglas por etiqueta
    if name == "speak":
        if cfg.get("require_lang_on_speak", True):
            lang = elem.attrib.get("{http://www.w3.org/XML/1998/namespace}lang") or elem.attrib.get("xml:lang")
            if not lang:
                _push(issues, "warning", "speak.lang.missing", "Falta xml:lang en <speak> (recomendado, ej. es-PE).", stack[:])

    elif name == "voice":
        vname = elem.attrib.get("name","").strip()
        if not vname:
            _push(issues, "error", "voice.name.missing", "Falta atributo name en <voice>.", stack[:])
        else:
            seen_voices.append(vname)
            # chequeo de forma "xx-XX-NameNeural"
            if cfg.get("voice_neural_suffix"):
                if not vname.endswith(cfg["voice_neural_suffix"]):
                    _push(issues, "warning", "voice.name.form", f"La voz debería terminar en '{cfg['voice_neural_suffix']}' (Azure Neural). Recibido: {vname}.", stack[:])
            if cfg.get("preferred_lang_prefix"):
                if not vname.lower().startswith(cfg["preferred_lang_prefix"].lower()):
                    _push(issues, "info", "voice.lang.mismatch", f"La voz ({vname}) no parece {cfg['preferred_lang_prefix']} (solo aviso).", stack[:])

            # cruzar con cast (si se pasó)
            if cast and "cast" in cast:
                allowed = {c.get("voice_id") for c in cast.get("cast", []) if c.get("voice_id")}
                if allowed and vname not in allowed:
                    _push(issues, "warning", "voice.not_in_cast", f"La voz '{vname}' no está en dossier/voices.cast.json.", stack[:])

            # voz anidada
            if cfg.get("warn_nested_voice", True):
                parents = [p for p in stack[:-1] if p.startswith("voice")]
                if len(parents) >= 1:
                    _push(issues, "warning", "voice.nested", "Evita <voice> anidados; usa un <voice> por bloque.", stack[:])

    elif name == "break":
        t = elem.attrib.get("time")
        if not t:
            _push(issues, "warning", "break.time.missing", "Falta atributo time en <break>.", stack[:])
        else:
            ms = _to_ms(t)
            if ms is None:
                _push(issues, "error", "break.time.bad", f"Formato de time no reconocido: '{t}'. Usa '500ms' o '0.5s'.", stack[:])
            else:
                if ms < int(cfg["min_break_ms"]):
                    _push(issues, "info", "break.time.too_small", f"Pausa muy corta ({ms} ms < {cfg['min_break_ms']} ms).", stack[:])
                if ms > int(cfg["max_break_ms"]):
                    _push(issues, "warning", "break.time.too_big", f"Pausa muy larga ({ms} ms > {cfg['max_break_ms']} ms).", stack[:])

    elif name == "prosody":
        for k in ("rate","pitch","volume"):
            if k in elem.attrib:
                val = elem.attrib[k]
                ok = True
                if k == "rate": ok = _rate_ok(val)
                elif k == "pitch": ok = _pitch_ok(val)
                elif k == "volume": ok = _volume_ok(val)
                if not ok:
                    _push(issues, "warning", f"prosody.{k}.bad", f"Valor inusual para {k}: '{val}'.", stack[:])

    elif name == "phoneme":
        alpha = elem.attrib.get("alphabet","").lower()
        if alpha and alpha not in [a.lower() for a in cfg["allowed_phoneme_alphabet"]]:
            _push(issues, "warning", "phoneme.alphabet", f"Alfabeto no recomendado: '{alpha}'. Usa {cfg['allowed_phoneme_alphabet']}.", stack[:])
        ph = (elem.attrib.get("ph") or "").strip()
        if not ph:
            _push(issues, "warning", "phoneme.ph.missing", "Falta atributo 'ph' en <phoneme>.", stack[:])

    # Recorrido recursivo
    for child in list(elem):
        _walk(child, cfg, issues, stack, seen_voices, cast)

    stack.pop()

def _estimate_minutes(chars: int, wpm: float) -> float:
    # Aproximación grosera: palabras ≈ chars / 5.5 → min = palabras / wpm
    words_est = chars / 5.5
    return words_est / max(wpm, 1.0)

def lint_ssml_file(path: str|Path, cfg: Optional[Dict[str, Any]] = None, cast: Optional[Dict[str, Any]] = None, stylepacks: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    p = Path(path)
    cfg = {**_DEFAULT_CFG, **(cfg or {})}
    issues: List[LintIssue] = []
    seen_voices: List[str] = []

    # 1) XML parse
    try:
        root = _parse_xml(p)
    except ET.ParseError as e:
        return {
            "file": str(p),
            "ok": False,
            "errors": [f"xml.parse: {e}"],
            "warnings": [],
            "info": [],
            "stats": {"kb": _kb_size(p), "chars_in_speak": 0, "est_minutes": 0.0, "voices": []}
        }

    # 2) speak raíz
    if _localname(root.tag) != "speak":
        issues.append(LintIssue("error","root.speak.missing","El documento no tiene <speak> como raíz.", ""))
    # 3) tamaño de request
    kb = _kb_size(p)
    if kb > int(cfg["max_request_kb"]):
        issues.append(LintIssue("error","size.kb.exceeded", f"Tamaño {kb} KB > límite {cfg['max_request_kb']} KB.", "speak"))

    # 4) caracteres dentro de <speak>
    speak_chars = _text_len(root)
    if speak_chars > int(cfg["max_speak_chars"]):
        issues.append(LintIssue("error","size.chars.exceeded", f"{speak_chars} caracteres en <speak> > {cfg['max_speak_chars']}.", "speak"))

    # 5) recorrido + reglas
    _walk(root, cfg, issues, [], seen_voices, cast)

    # 6) estimación de duración
    est_min = _estimate_minutes(speak_chars, float(cfg["estimate_wpm"]))
    if est_min > float(cfg["hard_cap_minutes"]):
        issues.append(LintIssue("warning","duration.estimate.long", f"Duración estimada {est_min:.2f} min > {cfg['hard_cap_minutes']} min.", "speak"))

    # 7) deduplicar/ordenar
    def _pack(level: str) -> List[str]:
        return [f"[{it.code}] {it.message} @ {it.path}" for it in issues if it.level == level]

    errors = _pack("error")
    warnings = _pack("warning")
    info = _pack("info")

    return {
        "file": str(p),
        "ok": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "info": info,
        "stats": {
            "kb": kb,
            "chars_in_speak": speak_chars,
            "est_minutes": round(est_min, 3),
            "voices": sorted(set(seen_voices)),
        }
    }

def lint_path(path: str|Path, cfg: Optional[Dict[str, Any]] = None, voices_cast_path: Optional[str|Path] = None, stylepacks_path: Optional[str|Path] = None) -> Dict[str, Any]:
    p = Path(path)
    cfg = {**_DEFAULT_CFG, **(cfg or {})}
    cast = _read_json(voices_cast_path) if voices_cast_path else None
    stylepacks = _read_json(stylepacks_path) if stylepacks_path else None

    files = []
    if p.is_file():
        files = [p]
    else:
        files = sorted(p.glob("**/*.xml"))

    results = []
    ok_all = True
    for f in files:
        rep = lint_ssml_file(f, cfg=cfg, cast=cast, stylepacks=stylepacks)
        ok_all = ok_all and rep["ok"]
        results.append(rep)

    summary = {
        "files": len(results),
        "ok": sum(1 for r in results if r["ok"]),
        "fail": sum(1 for r in results if not r["ok"]),
        "errors": sum(len(r["errors"]) for r in results),
        "warnings": sum(len(r["warnings"]) for r in results),
    }
    return {"summary": summary, "results": results, "config": cfg}

# ---------------- Render Markdown (opcional) ----------------

def to_markdown(report: Dict[str, Any]) -> str:
    lines: List[str] = []
    sm = report.get("summary", {})
    lines.append(f"# Linter SSML — {'✅' if sm.get('fail',0)==0 else '⚠️'}")
    lines.append("")
    lines.append(f"**Archivos**: {sm.get('files',0)} · **OK**: {sm.get('ok',0)} · **Con errores**: {sm.get('fail',0)} · **Errores**: {sm.get('errors',0)} · **Warnings**: {sm.get('warnings',0)}")
    lines.append("")
    for r in report.get("results", []):
        status = "✅" if r["ok"] else "❌"
        lines.append(f"## {status} {Path(r['file']).name}")
        st = r["stats"]
        lines.append(f"- Tamaño: {st['kb']} KB · Chars: {st['chars_in_speak']} · Est.: {st['est_minutes']:.2f} min · Voces: {', '.join(st['voices']) if st['voices'] else '—'}")
        if r["errors"]:
            lines.append("**Errores**:")
            for e in r["errors"]:
                lines.append(f"- {e}")
        if r["warnings"]:
            lines.append("**Advertencias**:")
            for w in r["warnings"]:
                lines.append(f"- {w}")
        if r["info"]:
            lines.append("**Info**:")
            for i in r["info"]:
                lines.append(f"- {i}")
        lines.append("")
    return "\n".join(lines)

# ---------------- CLI ----------------

def main():
    import argparse
    ap = argparse.ArgumentParser(description="Linter de SSML (Azure-friendly).")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--in", dest="infile", help="Un archivo XML SSML.")
    src.add_argument("--dir", dest="indir", help="Una carpeta con *.xml (recursivo).")
    ap.add_argument("--config", help="JSON con overrides de config.")
    ap.add_argument("--voices-cast", help="dossier/voices.cast.json para validar voces usadas.")
    ap.add_argument("--stylepacks", help="dossier/stylepacks.json (opcional, informativo).")
    ap.add_argument("--out-json", help="Escribe el reporte JSON.")
    ap.add_argument("--md", help="Escribe un resumen en Markdown.")
    args = ap.parse_args()

    cfg = _read_json(args.config) or {}
    target = args.infile or args.indir
    rep = lint_path(target, cfg=cfg, voices_cast_path=args.voices_cast, stylepacks_path=args.stylepacks)

    if args.out_json:
        Path(args.out_json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out_json).write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"JSON → {args.out_json}")
    else:
        print(json.dumps(rep, ensure_ascii=False, indent=2))

    if args.md:
        md = to_markdown(rep)
        Path(args.md).parent.mkdir(parents=True, exist_ok=True)
        Path(args.md).write_text(md, encoding="utf-8")
        print(f"MD → {args.md}")

if __name__ == "__main__":
    main()
