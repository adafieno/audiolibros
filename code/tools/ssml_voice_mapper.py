# -*- coding: utf-8 -*-
"""
Side-by-side voice mapper for SSML plans (Streamlit).

What it does
- Loads a chapter plan JSON (e.g., dossier/ssml.plan/ch01.plan.json) and the chapter text.
- Shows per-chunk lines[] in a table: start/end, snippet, editable voice dropdown.
- Highlights the currently selected line in the chunk text (side-by-side view).
- Bulk tools: fill all 'desconocido' with selected voice; search/replace voice; copy chunk voice to all lines.
- Saves to the same file or writes *.edited.json.

Run
  pip install streamlit pandas
  streamlit run tools/ssml_voice_mapper.py -- \
      --dossier dossier \
      --plan dossier/ssml.plan/ch01.plan.json \
      --text analysis/ch01.txt
"""

from __future__ import annotations
import argparse
import html
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import streamlit as st

# --------------------------- IO helpers ---------------------------

def read_json(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8")
    # allow // and /* */ comments (light JSONC)
    raw = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
    raw = re.sub(r"(?m)//.*?$", "", raw)
    return json.loads(raw)

def load_cast_voices(dossier_dir: Path) -> List[str]:
    """
    Returns display-name keys from voices.cast.json (map format) plus common labels.
    """
    voices = []
    cast_path = dossier_dir / "voices.cast.json"
    if cast_path.exists():
        try:
            cast = read_json(cast_path)
            if isinstance(cast, dict) and "cast" not in cast:
                voices = [k for k, v in cast.items() if isinstance(v, dict)]
            elif isinstance(cast, dict):
                # legacy list
                seen = set()
                for it in cast.get("cast", []):
                    cid = it.get("character_id")
                    if cid and cid not in seen:
                        voices.append(cid); seen.add(cid)
        except Exception:
            pass
    # common labels
    extras = ["narrador", "Narrador", "desconocido"]
    for e in extras:
        if e not in voices:
            voices.append(e)
    return sorted(voices, key=lambda s: s.lower())

# --------------------------- Plan → table ---------------------------

def lines_table_from_plan(plan: dict, chapter_text: str) -> pd.DataFrame:
    """
    Flattens plan into a table of lines (one row per line).
    If a chunk has no lines[], we create a synthetic line representing the chunk.
    """
    rows = []
    for c_idx, ch in enumerate(plan.get("chunks", [])):
        cid = ch.get("id") or f"{ch.get('start_char')}_{ch.get('end_char')}"
        c_start = int(ch.get("start_char", 0))
        c_end   = int(ch.get("end_char", -1))
        c_voice = ch.get("voice") or ""
        if isinstance(ch.get("lines"), list) and ch["lines"]:
            for l_idx, ln in enumerate(ch["lines"]):
                sc = int(ln.get("start_char", -1))
                ec = int(ln.get("end_char", -2))
                text = ln.get("text")
                if text is None and (ec >= sc >= 0):
                    text = chapter_text[sc:ec+1]
                snippet = (text or chapter_text[c_start:c_end+1])[0:160].replace("\n", " ")
                rows.append({
                    "chunk_id": cid,
                    "chunk_index": c_idx,
                    "line_index": l_idx,
                    "start_char": sc if sc >= 0 else c_start,
                    "end_char":   ec if ec >= 0 else c_end,
                    "voice": str(ln.get("voice") or ""),
                    "length": (ec - sc + 1) if (ec >= sc >= 0) else (c_end - c_start + 1),
                    "snippet": snippet,
                })
        else:
            # synthetic single line for the chunk
            snippet = chapter_text[c_start:c_end+1][0:160].replace("\n", " ")
            rows.append({
                "chunk_id": cid,
                "chunk_index": c_idx,
                "line_index": -1,
                "start_char": c_start,
                "end_char":   c_end,
                "voice": str(c_voice),
                "length": (c_end - c_start + 1),
                "snippet": snippet,
            })
    df = pd.DataFrame(rows, columns=[
        "chunk_id","chunk_index","line_index","start_char","end_char","length","voice","snippet"
    ])
    return df

def apply_table_to_plan(plan: dict, df: pd.DataFrame) -> dict:
    """
    Writes edited voices from df back into the nested plan structure.
    """
    for _, row in df.iterrows():
        c_idx = int(row["chunk_index"])
        l_idx = int(row["line_index"])
        v     = str(row["voice"] or "")
        chunk = plan["chunks"][c_idx]
        if l_idx >= 0 and isinstance(chunk.get("lines"), list) and l_idx < len(chunk["lines"]):
            plan["chunks"][c_idx]["lines"][l_idx]["voice"] = v
        else:
            plan["chunks"][c_idx]["voice"] = v
    return plan

# --------------------------- Highlight helpers ---------------------------

def highlight_chunk_html(chapter_text: str, start: int, end: int, mark_s: int, mark_e: int) -> str:
    """
    Returns HTML with the chunk [start:end] shown and [mark_s:mark_e] wrapped in <mark>.
    """
    start = max(0, start); end = min(len(chapter_text)-1, end)
    mark_s = max(start, mark_s); mark_e = min(end, mark_e)
    before = html.escape(chapter_text[start:mark_s])
    mid    = html.escape(chapter_text[mark_s:mark_e+1])
    after  = html.escape(chapter_text[mark_e+1:end+1])
    return f"<pre style='white-space:pre-wrap; line-height:1.45; font-size:0.95rem;'><span>{before}</span><mark>{mid}</mark><span>{after}</span></pre>"

# --------------------------- Streamlit UI ---------------------------

def main():
    st.set_page_config(page_title="SSML Voice Mapper", layout="wide")

    # Parse CLI args passed after '--'
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--dossier", default="dossier")
    parser.add_argument("--plan")
    parser.add_argument("--text")
    cli_args, _ = parser.parse_known_args()

    st.sidebar.header("Load")
    dossier_dir = Path(st.sidebar.text_input("Dossier directory", cli_args.dossier))
    plan_path   = st.sidebar.text_input("Plan JSON", cli_args.plan or "")
    text_path   = st.sidebar.text_input("Chapter text (TXT)", cli_args.text or "")

    # Quick pickers if inputs are blank
    if not plan_path and (dossier_dir / "ssml.plan").exists():
        plans = sorted((dossier_dir / "ssml.plan").glob("*.plan.json"))
        if plans:
            plan_path = st.sidebar.selectbox("Pick plan", plans, index=0)
    if not text_path and (Path("analysis")).exists():
        texts = sorted(Path("analysis").glob("*.txt"))
        if texts:
            text_path = st.sidebar.selectbox("Pick text", texts, index=0)

    # Load files
    plan, chapter_text = None, None
    if plan_path:
        plan = read_json(Path(plan_path))
    if text_path:
        chapter_text = Path(text_path).read_text(encoding="utf-8")

    if not plan or not chapter_text:
        st.info("Select a plan JSON and chapter TXT to begin.")
        return

    # Cast voices for dropdown
    voice_options = load_cast_voices(dossier_dir)

    # Flatten to table
    df = lines_table_from_plan(plan, chapter_text)

    # Sidebar: filters & bulk actions
    st.sidebar.header("Filters")
    show_only_unknown = st.sidebar.checkbox("Only show 'desconocido'", value=False)
    filter_chunk = st.sidebar.selectbox(
        "Filter by chunk", options=["(all)"] + list(df["chunk_id"].unique()), index=0
    )

    work_df = df.copy()
    if show_only_unknown:
        work_df = work_df[work_df["voice"].str.lower() == "desconocido"]
    if filter_chunk != "(all)":
        work_df = work_df[work_df["chunk_id"] == filter_chunk]

    st.sidebar.header("Bulk tools")
    bulk_target = st.sidebar.selectbox("Set all 'desconocido' to:", options=["(pick)"] + voice_options, index=0)
    if st.sidebar.button("Apply to unknowns") and bulk_target != "(pick)":
        mask = df["voice"].str.lower().eq("desconocido")
        df.loc[mask, "voice"] = bulk_target
        work_df = df.copy()

    find_voice = st.sidebar.selectbox("Find voice:", options=["(pick)"] + voice_options, index=0)
    replace_with = st.sidebar.selectbox("Replace with:", options=["(pick)"] + voice_options, index=0)
    if st.sidebar.button("Search & replace") and find_voice != "(pick)" and replace_with != "(pick)":
        mask = df["voice"].eq(find_voice)
        df.loc[mask, "voice"] = replace_with
        work_df = df.copy()

    colL, colR = st.columns([0.58, 0.42])
    with colL:
        st.subheader("Lines (editable)")
        st.caption("Edit voices in the table; select a row below to highlight in the text preview.")
        # Editable table with dropdown for 'voice'
        edited = st.data_editor(
            work_df[["chunk_id","line_index","start_char","end_char","length","voice","snippet"]],
            hide_index=True,
            use_container_width=True,
            column_config={
                "voice": st.column_config.SelectboxColumn("voice", options=voice_options, required=False, width="medium"),
                "snippet": st.column_config.TextColumn("snippet", width="large"),
                "length": st.column_config.NumberColumn("len", step=1, format="%d", width="small"),
            },
            num_rows="fixed",
            key="voice_table",
        )
        # line selector
        st.markdown("---")
        selected_chunk = st.selectbox("Preview chunk", options=list(df["chunk_id"].unique()))
        sub_df = df[df["chunk_id"] == selected_chunk].reset_index(drop=True)
        sel_line_idx = st.number_input("Select line index (row within chunk)", min_value=0, max_value=max(0, len(sub_df)-1), value=0, step=1)

    with colR:
        st.subheader("Chunk preview")
        # Resolve start/end of chunk
        ch_first = df[df["chunk_id"] == selected_chunk].iloc[0]
        # chunk bounds = min start / max end among its rows
        c_start = int(df[df["chunk_id"] == selected_chunk]["start_char"].min())
        c_end   = int(df[df["chunk_id"] == selected_chunk]["end_char"].max())
        # selected line bounds
        try:
            ln = sub_df.iloc[int(sel_line_idx)]
            mark_s = int(ln["start_char"]); mark_e = int(ln["end_char"])
        except Exception:
            mark_s, mark_e = c_start, c_start

        html_preview = highlight_chunk_html(chapter_text, c_start, c_end, mark_s, mark_e)
        st.markdown(html_preview, unsafe_allow_html=True)

    # SAVE AREA
    st.markdown("---")
    st.subheader("Save")
    col1, col2, col3 = st.columns([0.4, 0.3, 0.3])
    with col1:
        overwrite = st.checkbox("Overwrite original plan", value=False)
    with col2:
        if overwrite:
            out_path = Path(plan_path)
        else:
            out_path = Path(str(plan_path).replace(".plan.json", ".plan.edited.json"))
        st.text_input("Output path", value=str(out_path), key="out_path_display")
    with col3:
        if st.button("Save plan"):
            # merge edits back: edited table may be filtered, so merge against the master df
            # Update df (master) with any changes from 'edited' subset
            # We match by (chunk_id, line_index, start_char, end_char) to be safe
            def key_cols(df_): return df_[["chunk_id","line_index","start_char","end_char"]].astype(str).agg("|".join, axis=1)
            master_key = key_cols(df)
            edits_key = key_cols(edited)
            # build a mapping: key -> voice
            voice_map = dict(zip(edits_key, edited["voice"].astype(str)))
            # apply
            df["voice"] = [voice_map.get(k, v) for k, v in zip(master_key, df["voice"].astype(str))]
            # write back to plan
            new_plan = apply_table_to_plan(plan, df)
            outp = Path(st.session_state.get("out_path_display", str(out_path)))
            outp.parent.mkdir(parents=True, exist_ok=True)
            outp.write_text(json.dumps(new_plan, ensure_ascii=False, indent=2), encoding="utf-8")
            st.success(f"Saved: {outp}")

if __name__ == "__main__":
    main()
