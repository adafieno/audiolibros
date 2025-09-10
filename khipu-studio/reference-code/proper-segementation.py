from __future__ import annotations
from dataclasses import dataclass, asdict
from typing import Iterable, List, Union, Sequence, Optional
import argparse
import pathlib
import pandas as pd

EM_DASH = "—"

@dataclass
class Segment:
    """A segment of the original text."""
    segment_id: int
    start_idx: int            # inclusive, 0-based
    end_idx: int              # exclusive
    delimiter: str            # "newline", "em-dash", or "EOF"
    text: str

def iter_segments(
    text: str,
    *,
    split_on_em_dash: bool = True,
    include_empty: bool = False,
) -> Iterable[Segment]:
    """
    Yield segments split on newline(s) and (optionally) em-dashes, with original offsets.
    - Newlines handled: CRLF (\r\n) as a single separator, LF (\n), CR (\r).
    - If `include_empty` is False, adjacent separators won't produce empty segments.
    - End indices are exclusive (Python slicing-friendly).
    """
    n = len(text)
    segments: List[Segment] = []
    start = 0
    i = 0

    def add_segment(start_idx: int, end_idx: int, delim: str):
        nonlocal segments
        if end_idx > start_idx or include_empty:
            segments.append(Segment(
                segment_id=len(segments) + 1,
                start_idx=start_idx,
                end_idx=end_idx,
                delimiter=delim,
                text=text[start_idx:end_idx],
            ))

    while i < n:
        ch = text[i]

        # Handle CRLF
        if ch == "\r":
            if i + 1 < n and text[i + 1] == "\n":
                add_segment(start, i, "newline")
                i += 2
                start = i
                continue
            else:
                add_segment(start, i, "newline")
                i += 1
                start = i
                continue

        # Handle LF
        if ch == "\n":
            add_segment(start, i, "newline")
            i += 1
            start = i
            continue

        # Handle em-dash
        if split_on_em_dash and ch == EM_DASH:
            add_segment(start, i, "em-dash")
            i += 1
            start = i
            continue

        i += 1

    # Trailing segment (EOF)
    if start < n or include_empty:
        add_segment(start, n, "EOF")

    return segments

def segments_to_dataframe(segments: Sequence[Segment]) -> pd.DataFrame:
    """Convert a list of Segment objects to a tidy DataFrame with previews."""
    rows = []
    for s in segments:
        rows.append({
            "segment_id": s.segment_id,
            "start_idx": s.start_idx,
            "end_idx": s.end_idx,
            "length": s.end_idx - s.start_idx,
            "delimiter": s.delimiter,
            "text": s.text,
        })
    return pd.DataFrame(rows, columns=["segment_id","start_idx","end_idx","length","delimiter","text"])

def segment_file(
    path: Union[str, pathlib.Path],
    *,
    encoding: str = "utf-8",
    split_on_em_dash: bool = True,
    include_empty: bool = False,
) -> List[Segment]:
    """Read a text file and return segments using the same logic."""
    p = pathlib.Path(path)
    text = p.read_text(encoding=encoding)
    return list(iter_segments(text, split_on_em_dash=split_on_em_dash, include_empty=include_empty))

def save_csv_bom(df: pd.DataFrame, out_path: Union[str, pathlib.Path]) -> None:
    """Save DataFrame as CSV with UTF-8 BOM (for Excel compatibility on Windows)."""
    pathlib.Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False, encoding="utf-8-sig")

def save_xlsx(df: pd.DataFrame, out_path: Union[str, pathlib.Path]) -> None:
    """Save DataFrame as Excel workbook."""
    pathlib.Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    df.to_excel(out_path, index=False)

# -----------------------------
# CLI
# -----------------------------
def _build_arg_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        description="Split text into segments on line breaks and em-dashes, preserving offsets."
    )
    ap.add_argument("input", help="A .txt file or a directory containing .txt files.")
    ap.add_argument("--encoding", default="utf-8", help="File encoding (default: utf-8).")
    ap.add_argument("--no-em-dash", action="store_true", help="Do NOT split on em-dash (—).")
    ap.add_argument("--include-empty", action="store_true", help="Include empty segments.")
    ap.add_argument("--out-dir", default="segments_out", help="Output directory (default: segments_out).")
    ap.add_argument("--xlsx", action="store_true", help="Also export .xlsx for each file.")
    return ap

def _process_one_file(
    in_file: pathlib.Path,
    out_dir: pathlib.Path,
    *,
    encoding: str,
    split_on_em_dash: bool,
    include_empty: bool,
    export_xlsx: bool,
) -> None:
    segs = segment_file(
        in_file,
        encoding=encoding,
        split_on_em_dash=split_on_em_dash,
        include_empty=include_empty,
    )
    df = segments_to_dataframe(segs)

    stem = in_file.stem
    csv_path = out_dir / f"{stem}_segments_utf8_bom.csv"
    save_csv_bom(df, csv_path)

    if export_xlsx:
        xlsx_path = out_dir / f"{stem}_segments.xlsx"
        save_xlsx(df, xlsx_path)

    print(f"[OK] {in_file.name}: {len(df)} segments → {csv_path}" + (f", {xlsx_path}" if export_xlsx else ""))

def main():
    ap = _build_arg_parser()
    args = ap.parse_args()

    in_path = pathlib.Path(args.input)
    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    split_on_em_dash = not args.no_em_dash  # default is True
    export_xlsx = bool(args.xlsx)

    if in_path.is_file():
        _process_one_file(
            in_path, out_dir,
            encoding=args.encoding,
            split_on_em_dash=split_on_em_dash,
            include_empty=args.include_empty,
            export_xlsx=export_xlsx,
        )
    else:
        # Process all .txt files in the directory (non-recursive)
        for f in sorted(in_path.glob("*.txt")):
            _process_one_file(
                f, out_dir,
                encoding=args.encoding,
                split_on_em_dash=split_on_em_dash,
                include_empty=args.include_empty,
                export_xlsx=export_xlsx,
            )

if __name__ == "__main__":
    main()
