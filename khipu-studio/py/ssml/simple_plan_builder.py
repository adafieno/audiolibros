# simple_plan_builder.py
# -*- coding: utf-8 -*-
"""
Pure segmenter: split on newline and em-dash, output flat segment list (JSON or CSV).
Reference parity with proper-segementation.py.
"""
from dataclasses import dataclass, asdict
from typing import List, Optional
import argparse, json, sys
from pathlib import Path

EM_DASH = "—"

@dataclass
class Segment:
    segment_id: int
    start_idx: int   # inclusive
    end_idx: int     # exclusive
    delimiter: str   # newline | em-dash | EOF
    text: str

def iter_segments(text: str, *, split_on_em_dash: bool = True, include_empty: bool = False) -> List[Segment]:
    n = len(text)
    segments: List[Segment] = []
    start = 0
    i = 0
    def add_segment(start_idx: int, end_idx: int, delim: str):
        if end_idx > start_idx or include_empty:
            segment_text = text[start_idx:end_idx]
            segment_id = len(segments) + 1
            print(f"🔍 SEGMENT DETECTED #{segment_id}: [{start_idx}:{end_idx}] delim='{delim}' text='{segment_text}'", file=sys.stderr)
            segments.append(Segment(
                segment_id=segment_id,
                start_idx=start_idx,
                end_idx=end_idx,
                delimiter=delim,
                text=segment_text,
            ))
    while i < n:
        ch = text[i]
        if ch == "\r":
            if i + 1 < n and text[i + 1] == "\n":
                add_segment(start, i, "newline"); i += 2; start = i; continue
            else:
                add_segment(start, i, "newline"); i += 1; start = i; continue
        if ch == "\n":
            add_segment(start, i, "newline"); i += 1; start = i; continue
        if split_on_em_dash and ch == EM_DASH:
            add_segment(start, i, "em-dash"); i += 1; start = i; continue
        i += 1
    if start < n or include_empty:
        add_segment(start, n, "EOF")
    return segments

def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Pure segmenter: split on newline and em-dash, output flat segment list.")
    ap.add_argument("--in", dest="infile", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--no-em-dash", action="store_true", help="Disable em-dash splitting")
    ap.add_argument("--include-empty", action="store_true", help="Include empty segments")
    ap.add_argument("--as-csv", action="store_true", help="Output CSV instead of JSON")
    args, _unknown = ap.parse_known_args(argv)

    text = Path(args.infile).read_text(encoding="utf-8")
    print(f"🔍 INPUT TEXT LENGTH: {len(text)} chars", file=sys.stderr)
    print(f"🔍 SPLIT OPTIONS: em-dash={not args.no_em_dash}, include_empty={args.include_empty}", file=sys.stderr)
    segments = iter_segments(text, split_on_em_dash=not args.no_em_dash, include_empty=args.include_empty)
    print(f"🔍 TOTAL SEGMENTS FOUND: {len(segments)}", file=sys.stderr)

    if args.as_csv:
        import csv
        print(f"🔍 WRITING {len(segments)} SEGMENTS TO CSV: {args.out}", file=sys.stderr)
        with open(args.out, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["segment_id","start_idx","end_idx","length","delimiter","text"])
            for s in segments:
                print(f"🔍 CSV RECORD #{s.segment_id}: [{s.start_idx}:{s.end_idx}] delim='{s.delimiter}' text='{s.text}'", file=sys.stderr)
                writer.writerow([s.segment_id, s.start_idx, s.end_idx, s.end_idx-s.start_idx, s.delimiter, s.text])
        print(f"🔍 CSV FILE WRITTEN SUCCESSFULLY", file=sys.stderr)
    else:
        print(f"🔍 WRITING {len(segments)} SEGMENTS TO JSON: {args.out}", file=sys.stderr)
        
        # Generate new hierarchical format with chunks and lines
        import hashlib
        from datetime import datetime, timezone
        
        # Calculate manuscript metadata for segmentation_meta
        manuscript_sha1 = hashlib.sha1(text.encode('utf-8')).hexdigest()
        manuscript_first40 = text[:40] if len(text) > 40 else text
        
        # Extract chapter ID from output filename (e.g., "ch01.plan.json" -> "ch01")
        chapter_id = Path(args.out).stem.replace('.plan', '')
        
        # Create chunks - for now, put all segments in one chunk
        # This maintains the same segmentation but in the new structure
        lines = []
        for s in segments:
            line = {
                "voice": "narrador",  # Default voice assignment
                "start_char": s.start_idx,
                "end_char": s.end_idx,
                "delimiter": s.delimiter,
                "line_type": "line",
                "text": s.text  # Include actual segment text for Preview display
            }
            lines.append(line)
            print(f"🔍 LINE #{len(lines)}: [{s.start_idx}:{s.end_idx}] delim='{s.delimiter}' voice='narrador' text='{s.text}'", file=sys.stderr)
        
        chunk = {
            "id": f"{chapter_id}_001",
            "start_char": segments[0].start_idx if segments else 0,
            "end_char": segments[-1].end_idx if segments else 0,
            "voice": "narrador",  # Default chunk voice
            "stylepack": "chapter_default",
            "lines": lines
        }
        
        plan_data = {
            "chapter_id": chapter_id,
            "chunks": [chunk],
            "segmentation_meta": {
                "version": "simple-v1",
                "algorithm": "newline" + (" +em-dash" if not args.no_em_dash else ""),
                "segment_count": len(segments),
                "manuscript_sha1": manuscript_sha1,
                "manuscript_first40": manuscript_first40,
                "include_title": False,
                "generated_at": datetime.now(timezone.utc).isoformat()
            }
        }
        
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(plan_data, f, ensure_ascii=False, indent=2)
        print(f"🔍 HIERARCHICAL PLAN FILE WRITTEN SUCCESSFULLY", file=sys.stderr)
        print(f"🔍 FORMAT: {len(plan_data['chunks'])} chunks, {len(lines)} lines total", file=sys.stderr)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
