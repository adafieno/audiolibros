# ingest/manuscript_parser.py
# -*- coding: utf-8 -*-
"""
Parsea un manuscrito (DOCX o TXT), detecta capítulos y emite:
    - analysis/chapters_txt/chXX.txt
    - dossier/narrative.structure.json

Uso:
    python -m ingest.manuscript_parser \
        --in /ruta/Puntajada.docx \
        --out-chapters analysis/chapters_txt \
        --out-structure dossier/narrative.structure.json \
        --min-words 300

Se añadió detección preferente de capítulos a partir del estilo "Heading 1" en DOCX.
"""
from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Tuple, Optional

# ----------------- Lectura DOCX/TXT -----------------

def _read_docx(path: Path) -> Tuple[List[str], List[bool]]:
        """
        Lee un .docx y devuelve:
            - blocks: lista de bloques de texto (separados por párrafos en blanco)
            - heading_flags: lista booleana (por bloque) True si el primer párrafo del bloque tiene estilo Heading 1
        La detección del estilo intenta ser robusta ante nombres localizados ('Heading 1', 'Título 1', etc).
        """
        try:
                import docx  # python-docx
        except Exception as e:
                raise SystemExit("Instala 'python-docx' para procesar .docx (pip install python-docx)") from e

        doc = docx.Document(str(path))
        paras: List[str] = []
        para_heading_flags: List[bool] = []

        def _style_looks_like_h1(style_name: Optional[str]) -> bool:
                if not style_name:
                        return False
                s = style_name.strip().lower()
                # explicit patterns for common localized names
                if re.search(r'heading\s*1', s) or re.search(r'\bt[ií]tulo\s*1\b', s) or re.search(r'\btitle\s*1\b', s) or re.search(r'\btitre\s*1\b', s) or re.search(r'\bcap[ií]tulo\s*1\b', s):
                        return True
                # if style contains a known heading word and '1' somewhere
                if '1' in s and any(k in s for k in ['heading', 'título', 'titulo', 'title', 'titre', 'capítulo', 'capitulo']):
                        return True
                # accept generic names that often map to a top-level heading/title
                if s in ('heading', 'title', 'titulo', 'título', 'titre', 'capítulo', 'capitulo'):
                        return True
                return False

        for p in doc.paragraphs:
                t = p.text.replace("\r", "").strip()
                if t:
                        paras.append(t)
                        try:
                                style_name = getattr(p.style, "name", "") or ""
                        except Exception:
                                style_name = ""
                        para_heading_flags.append(_style_looks_like_h1(style_name))
                else:
                        # preserva saltos
                        paras.append("")
                        para_heading_flags.append(False)

        # compacta a bloques usando párrafos en blanco como separadores
        blocks: List[str] = []
        block_heading_flags: List[bool] = []
        i = 0
        n = len(paras)
        while i < n:
                if paras[i] == "":
                        i += 1
                        continue
                # inicia bloque
                j = i
                first_para_heading = para_heading_flags[i]
                lines: List[str] = []
                while j < n and paras[j] != "":
                        lines.append(paras[j])
                        j += 1
                blocks.append("\n".join(lines).strip())
                block_heading_flags.append(first_para_heading)
                i = j

        return blocks, block_heading_flags

def _read_txt(path: Path) -> Tuple[List[str], List[bool]]:
        raw = path.read_text(encoding="utf-8", errors="ignore")
        blocks = re.split(r"\n{2,}", raw)
        blocks = [b.strip() for b in blocks if b.strip()]
        heading_flags = [False] * len(blocks)
        return blocks, heading_flags

def _load_blocks(path: Path) -> Tuple[List[str], List[bool]]:
        if path.suffix.lower() == ".docx":
                return _read_docx(path)
        return _read_txt(path)

# ----------------- Heurísticas de capítulo -----------------

_ROMAN = r"(?:M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3}))"
_NUM = r"(?:[0-9]{1,3})"
_WORDNUM = r"(?:Uno|Dos|Tres|Cuatro|Cinco|Seis|Siete|Ocho|Nueve|Diez|Once|Doce|Trece|Catorce|Quince|Dieciséis|Diecisiete|Dieciocho|Diecinueve|Veinte)"
_CHAP_PREFIX = r"(?:Cap[ií]tulo|Chapter)\s*(?:\:|\-)?\s*"
_CHAP_LINE = re.compile(rf"^(?:{_CHAP_PREFIX}(?:{_NUM}|{_ROMAN}|{_WORDNUM})|(?:{_CHAP_PREFIX})$)", re.IGNORECASE)

_UPPER_TITLE = re.compile(r"^[A-ZÁÉÍÓÚÜÑ0-9][A-ZÁÉÍÓÚÜÑ0-9\s\.\-:,;\'\"¡!¿?\(\)]{4,80}$")
_BARE_NUMERAL = re.compile(rf"^({_NUM}|{_ROMAN})$", re.IGNORECASE)

_TOC_HINT = re.compile(r"(índice|contenido|tabla de contenido|table of contents)", re.IGNORECASE)
_PRO_EPILOGUE = re.compile(r"^(pr[oó]logo|ep[íi]logo|ap[ée]ndice)$", re.IGNORECASE)

@dataclass
class Chapter:
        id: str
        title: str
        start_idx: int
        end_idx: int
        word_count: int

def _is_probably_title(line: str) -> bool:
        s = line.strip()
        if _CHAP_LINE.match(s):
                return True
        if _UPPER_TITLE.match(s) and not _TOC_HINT.search(s):
                return True
        if _BARE_NUMERAL.match(s):
                return True
        return False

def _word_count(text: str) -> int:
        return len(re.findall(r"\b[\wÁÉÍÓÚÜÑáéíóúüñ'-]+\b", text))

def _normalize_title(raw: str) -> str:
        s = re.sub(r"\s+", " ", raw.strip())
        # Capitaliza “Capítulo” + número
        m = _CHAP_LINE.match(s)
        if m:
                # Formatea “Capítulo N”
                num = s.split()[-1]
                return f"Capítulo {num}"
        return s[:120]

def _detect_chapters(blocks: List[str], min_words_per_chapter: int, heading_flags: Optional[List[bool]] = None) -> List[Chapter]:
        """
        Detecta capítulos. Si heading_flags contiene al menos un True, prioriza
        las marcas de Heading 1 del DOCX como candidatos de capítulo.
        """
        candidates: List[int] = []

        # Preferir encabezados tipo Heading 1 si están disponibles
        if heading_flags and any(heading_flags):
                candidates = [i for i, f in enumerate(heading_flags) if f]
                # asegura inicio si no hay candidato al principio
                if 0 not in candidates:
                        if len(blocks) > 0 and heading_flags[0]:
                                candidates.insert(0, 0)
                        else:
                                if _word_count(blocks[0]) >= min(200, min_words_per_chapter // 2):
                                        candidates.insert(0, 0)
        else:
                # heurística anterior basada en contenido
                for i, b in enumerate(blocks):
                        first_line = b.splitlines()[0].strip()
                        if _is_probably_title(first_line):
                                candidates.append(i)

                # asegura inicio si no hay candidato al principio
                if 0 not in candidates:
                        # si el primer bloque es muy corto y parece título, acéptalo
                        if len(blocks) > 0 and _is_probably_title(blocks[0].splitlines()[0]):
                                candidates.insert(0, 0)
                        else:
                                # crea pseudo-título "Prólogo" si primer bloque es grande
                                if _word_count(blocks[0]) >= min(200, min_words_per_chapter // 2):
                                        candidates.insert(0, 0)

        # construir capítulos por rangos [start, next_start)
        chapters: List[Chapter] = []
        for j, start in enumerate(candidates):
                end = candidates[j + 1] if j + 1 < len(candidates) else len(blocks)
                content_blocks = blocks[start:end]
                # título: primera línea si cumple criterio, si no, genera uno
                first_line = content_blocks[0].splitlines()[0].strip()
                is_heading_style = bool(heading_flags and start < len(heading_flags) and heading_flags[start])

                if is_heading_style or _is_probably_title(first_line):
                        title = _normalize_title(first_line)
                        # si el "título" es sólo número romano/arábigo, prefija "Capítulo"
                        if _BARE_NUMERAL.match(first_line) or first_line.upper().startswith("CHAPTER"):
                                title = f"Capítulo {first_line.strip()}"
                else:
                        # si el bloque es inicial y parece prólogo
                        title = "Prólogo" if _PRO_EPILOGUE.match(first_line) else f"Sección {j+1}"

                # texto sin la primera línea si era título “puro”
                body_blocks = content_blocks[:]
                if (is_heading_style or _is_probably_title(first_line)) and len(content_blocks) > 1:
                        # Si el bloque de título NO contiene más que la línea de título, ignóralo en cuerpo
                        if is_heading_style or _CHAP_LINE.match(first_line) or _BARE_NUMERAL.match(first_line) or _UPPER_TITLE.match(first_line):
                                body_blocks = content_blocks[1:]

                body_text = "\n\n".join(body_blocks).strip()
                wc = _word_count(body_text)

                # Filtros anti-fantasma:
                if wc < min_words_per_chapter and not _PRO_EPILOGUE.match(title):
                        # Saltar micro-secciones (p.ej., un índice)
                        continue
                if _TOC_HINT.search(title):
                        continue

                cid = f"ch{len(chapters)+1:02d}"
                chapters.append(Chapter(id=cid, title=title, start_idx=start, end_idx=end-1, word_count=wc))

        # Si por filtros nos quedamos sin nada, crea un único capítulo
        if not chapters and blocks:
                cid = "ch01"
                wc = _word_count("\n\n".join(blocks))
                chapters = [Chapter(id=cid, title="Capítulo 1", start_idx=0, end_idx=len(blocks)-1, word_count=wc)]

        return chapters

# ----------------- Escritura de salidas -----------------

def _write_chapter_txts(chapters: List[Chapter], blocks: List[str], out_dir: Path, heading_flags: Optional[List[bool]] = None) -> List[Path]:
        """
        Escribe archivos de texto por capítulo. Si heading_flags indica
        que el inicio de capítulo proviene de un Heading 1, se quita esa línea
        del cuerpo para evitar duplicados con el título.
        """
        out_dir.mkdir(parents=True, exist_ok=True)
        paths: List[Path] = []
        for ch in chapters:
                # cuerpo = bloques del rango, excluyendo la primera línea si era título puro ya extraído
                seg = blocks[ch.start_idx: ch.end_idx + 1]
                # detectar si el primer bloque tenía estilo heading1
                first = seg[0].splitlines()
                is_heading_style = bool(heading_flags and ch.start_idx < len(heading_flags) and heading_flags[ch.start_idx])

                if first and ( _is_probably_title(first[0]) or is_heading_style ):
                        # si solo era la línea, quítalo
                        if len(first) == 1:
                                seg = seg[1:] if len(seg) > 1 else seg
                        else:
                                # quita esa primera línea del primer bloque
                                first = first[1:]
                                seg[0] = "\n".join(first).strip()
                body = "\n\n".join([s for s in seg if s.strip()]).strip()
                p = out_dir / f"{ch.id}.txt"
                p.write_text(body, encoding="utf-8")
                paths.append(p)
        return paths

def _write_structure_json(chapters: List[Chapter], out_path: Path, manuscript_path: Path) -> Path:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        data = {
                "source_file": str(manuscript_path),
                "chapters": [asdict(ch) for ch in chapters],
                "total_words": sum(ch.word_count for ch in chapters),
                "version": 1,
        }
        out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return out_path

# ----------------- CLI -----------------

def main():
        import argparse
        ap = argparse.ArgumentParser(description="Parser de manuscrito a capítulos TXT + estructura narrativa JSON.")
        ap.add_argument("--in", dest="infile", required=True)
        ap.add_argument("--out-chapters", required=True)
        ap.add_argument("--out-structure", required=True)
        ap.add_argument("--min-words", type=int, default=300, help="Mínimo de palabras por capítulo (evita capítulos fantasma).")
        args = ap.parse_args()

        in_path = Path(args.infile)
        blocks, heading_flags = _load_blocks(in_path)
        chapters = _detect_chapters(blocks, min_words_per_chapter=max(120, args.min_words), heading_flags=heading_flags)

        out_ch_dir = Path(args.out_chapters)
        _ = _write_chapter_txts(chapters, blocks, out_ch_dir, heading_flags=heading_flags)

        out_struct = _write_structure_json(chapters, Path(args.out_structure), in_path)
        print(f"Capítulos: {len(chapters)}")
        print(f"Estructura: {out_struct}")

if __name__ == "__main__":
        main()
