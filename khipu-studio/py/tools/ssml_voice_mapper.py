# tools/ssml_voice_mapper.py
# -*- coding: utf-8 -*-
"""
SSML Voice Mapper (Streamlit) — synchronized row highlight
- Grid shows a ▶ indicator on the currently active row.
- Clicking a grid row or using the fallback (chunk + index, incl. +/-) updates the highlight.
- No extra dependencies.
"""

from __future__ import annotations
import argparse
import html
import json
import re
from pathlib import Path
from typing import List
import pandas as pd
import streamlit as st

# --------------------------- IO helpers ---------------------------

def read_json(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8")
    raw = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
    raw = re.sub(r"(?m)//.*?$", "", raw)
    return json.loads(raw)

def load_cast_voices(dossier_dir: Path) -> List[str]:
    voices = []
    cast_path = dossier_dir / "voices.cast.json"
    if cast_path.exists():
        try:
            cast = read_json(cast_path)
            if isinstance(cast, dict) and "cast" not in cast:
                voices = [k for k, v in cast.items() if isinstance(v, dict)]
            elif isinstance(cast, dict):
                seen = set()
                for it in cast.get("cast", []):
                    cid = it.get("character_id")
                    if cid and cid not in seen:
                        voices.append(cid); seen.add(cid)
        except Exception:
            pass
    for e in ["narrador", "Narrador", "desconocido"]:
        if e not in voices:
            voices.append(e)
    return sorted(voices, key=lambda s: s.lower())

# --------------------------- Plan ↔ table ---------------------------

def lines_table_from_plan(plan: dict, chapter_text: str) -> pd.DataFrame:
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
    df["row_key"] = df[["chunk_id","line_index","start_char","end_char"]].astype(str).agg("|".join, axis=1)
    return df

def apply_table_to_plan(plan: dict, df: pd.DataFrame) -> dict:
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

# --------------------------- Preview helpers ---------------------------

def highlight_chunk_html(chapter_text: str, start: int, end: int, mark_s: int, mark_e: int) -> str:
    start = max(0, start); end = min(len(chapter_text)-1, end)
    mark_s = max(start, min(mark_s, end)); mark_e = max(start, min(mark_e, end))
    if mark_e < mark_s: mark_s, mark_e = mark_e, mark_s
    before = html.escape(chapter_text[start:mark_s])
    mid    = html.escape(chapter_text[mark_s:mark_e+1])
    after  = html.escape(chapter_text[mark_e+1:end+1])
    return f"<pre style='white-space:pre-wrap; line-height:1.45; font-size:0.95rem;'><span>{before}</span><mark>{mid}</mark><span>{after}</span></pre>"


def find_chunk_index_by_id(plan: dict, chunk_id: str) -> int:
    for i, ch in enumerate(plan.get("chunks", [])):
        cid = ch.get("id") or f"{ch.get('start_char')}_{ch.get('end_char')}"
        if str(cid) == str(chunk_id):
            return i
    return -1

def split_chunk_by_char(plan: dict, chapter_text: str, chunk_idx: int, split_at_char_abs: int) -> dict:
    """
    Split plan['chunks'][chunk_idx] into two chunks at absolute char index 'split_at_char_abs'.
    If lines exist, they are redistributed to the left/right chunks.
    """
    chunks = plan.get("chunks", [])
    if not (0 <= chunk_idx < len(chunks)):
        return plan

    ch = chunks[chunk_idx]
    c_start = int(ch.get("start_char", 0))
    c_end   = int(ch.get("end_char", -1))
    # Guard rails
    split_at = max(c_start + 1, min(split_at_char_abs, c_end - 1))

    left = {k: v for k, v in ch.items() if k != "lines"}
    right = {k: v for k, v in ch.items() if k != "lines"}
    left["end_char"] = split_at - 1
    right["start_char"] = split_at

    # Give stable IDs
    left["id"]  = f"{c_start}_{split_at-1}"
    right["id"] = f"{split_at}_{c_end}"

    # Redistribute lines (if any)
    lines = ch.get("lines")
    if isinstance(lines, list) and lines:
        left_lines, right_lines = [], []
        for ln in lines:
            ls = int(ln.get("start_char", -1))
            le = int(ln.get("end_char", -1))
            if ls == -1 or le == -1:
                # Fall back to naive slicing if line has no explicit bounds
                text = ln.get("text") or ""
                mid = split_at - c_start
                left_text  = text[:max(0, mid)]
                right_text = text[max(0, mid):]
                if left_text.strip():
                    left_lines.append({**ln, "end_char": split_at-1, "text": left_text})
                if right_text.strip():
                    right_lines.append({**ln, "start_char": split_at, "text": right_text})
            elif le < split_at:
                left_lines.append(ln)
            elif ls >= split_at:
                right_lines.append(ln)
            else:
                # A single line spans the split → split line into two
                mid = split_at
                left_lines.append({**ln, "end_char": mid-1, "text": chapter_text[ls:mid]})
                right_lines.append({**ln, "start_char": mid, "text": chapter_text[mid:le+1]})
        if left_lines:
            left["lines"] = left_lines
        if right_lines:
            right["lines"] = right_lines
    else:
        # Create simple single-lines for both sides for better post-editability
        left["lines"]  = [{"start_char": left["start_char"],  "end_char": left["end_char"],  "voice": ch.get("voice",""), "text": chapter_text[left["start_char"]:left["end_char"]+1]}]
        right["lines"] = [{"start_char": right["start_char"], "end_char": right["end_char"], "voice": ch.get("voice",""), "text": chapter_text[right["start_char"]:right["end_char"]+1]}]
        # Remove voice at chunk level to avoid ambiguity after split
        left.pop("voice", None)
        right.pop("voice", None)

    # Replace in plan
    plan["chunks"] = chunks[:chunk_idx] + [left, right] + chunks[chunk_idx+1:]
    return plan

def move_chunk(plan: dict, from_idx: int, to_idx: int) -> dict:
    chunks = plan.get("chunks", [])
    if not (0 <= from_idx < len(chunks)): return plan
    to_idx = max(0, min(to_idx, len(chunks)-1))
    if from_idx == to_idx: return plan
    ch = chunks.pop(from_idx)
    chunks.insert(to_idx, ch)
    plan["chunks"] = chunks
    return plan



# --------------------------- Streamlit UI ---------------------------

def main():
    st.set_page_config(page_title="SSML Voice Mapper", layout="wide")

    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--dossier", default="dossier")
    parser.add_argument("--plan")
    parser.add_argument("--text")
    cli_args, _ = parser.parse_known_args()

    st.sidebar.header("Load")
    dossier_dir = Path(st.sidebar.text_input("Dossier directory", cli_args.dossier))
    plan_path   = st.sidebar.text_input("Plan JSON", cli_args.plan or "")
    text_path   = st.sidebar.text_input("Chapter text (TXT)", cli_args.text or "")

    if not plan_path and (dossier_dir / "ssml.plan").exists():
        plans = sorted((dossier_dir / "ssml.plan").glob("*.plan.json"))
        if plans:
            plan_path = st.sidebar.selectbox("Pick plan", plans, index=0)
    if not text_path and Path("analysis").exists():
        texts = sorted(Path("analysis").glob("*.txt"))
        if texts:
            text_path = st.sidebar.selectbox("Pick text", texts, index=0)

    if not plan_path or not text_path:
        st.info("Select a plan JSON and chapter TXT to begin.")
        return

    plan = read_json(Path(plan_path))
    chapter_text = Path(text_path).read_text(encoding="utf-8")
    voice_options = load_cast_voices(dossier_dir)
    df = lines_table_from_plan(plan, chapter_text)

    # Ensure session keys
    if "selected_row_key" not in st.session_state and len(df):
        st.session_state["selected_row_key"] = str(df.iloc[0]["row_key"])

    # Sidebar filters
    st.sidebar.header("Filters")
    show_only_unknown = st.sidebar.checkbox("Only show 'desconocido'", value=False)
    filter_chunk = st.sidebar.selectbox("Filter by chunk", options=["(all)"] + list(df["chunk_id"].unique()), index=0)

    work_df = df.copy()
    if show_only_unknown:
        work_df = work_df[work_df["voice"].str.lower() == "desconocido"]
    if filter_chunk != "(all)":
        work_df = work_df[work_df["chunk_id"] == filter_chunk]
    work_df = work_df.reset_index(drop=True)

    # ---------- Guard: keep arrow/selection valid under active filters ----------
    # If filters hide the current selection (or all rows), point selection to a visible row.
    sel_key = st.session_state.get("selected_row_key")

    # Case A: Filters produce an empty grid → fall back to full df so we can show *something*
    if len(work_df) == 0 and len(df) > 0:
        st.info("Current filters hide all rows. Temporarily showing all rows so selection stays in sync.")
        work_df = df.copy().reset_index(drop=True)
        # If we had no selection, pick the first visible row
        if not sel_key and len(work_df):
            st.session_state["selected_row_key"] = str(work_df.iloc[0]["row_key"])

    # Case B: We have rows, but the selected key isn't visible in the filtered view
    elif sel_key and sel_key not in set(work_df["row_key"]):
        # Pick the first visible row within the *current* filtered view
        st.session_state["selected_row_key"] = str(work_df.iloc[0]["row_key"])


    # ---------- Stable selection state anchored to filtered view ----------
    if "sel_idx" not in st.session_state:
        st.session_state["sel_idx"] = 0

    def clamp_sel():
        st.session_state["sel_idx"] = max(0, min(st.session_state["sel_idx"], max(0, len(work_df)-1)))

    clamp_sel()

    colL, colR = st.columns([0.58, 0.42])

    with colL:
        st.subheader("Lines (editable)")
        st.caption("Click a row to highlight it on the right. Edit voices directly in the table.")

        # Visual indicator derives from sel_idx (not from a key that resets)
        sel_flags = ["▶" if i == st.session_state["sel_idx"] else "" for i in range(len(work_df))]
        work_df_with_indicator = work_df.assign(**{"▶": sel_flags})

        displayed = st.data_editor(
            work_df_with_indicator[["▶","chunk_id","line_index","start_char","end_char","length","voice","snippet"]],
            hide_index=True,
            use_container_width=True,
            height=440,  # ← keeps the viewport from snapping back to the very top
            column_config={
                "▶": st.column_config.TextColumn(" ", width="small", help="Current selection"),
                "voice": st.column_config.SelectboxColumn("voice", options=voice_options, required=False, width="medium"),
                "snippet": st.column_config.TextColumn("snippet", width="large"),
                "length": st.column_config.NumberColumn("len", step=1, format="%d", width="small"),
            },
            num_rows="fixed",
            key="voice_table",
        )

        # Read THIS run's selection (immediate, not from the prior rerun)
        curr_sel = st.session_state.get("voice_table", {}).get("selection", {})
        curr_rows: List[int] = (curr_sel.get("rows") or []) if isinstance(curr_sel, dict) else []
        if curr_rows:
            disp_idx = curr_rows[-1]
            if 0 <= disp_idx < len(work_df):
                st.session_state["selected_row_key"] = str(work_df.iloc[disp_idx]["row_key"])

        # Prev / Next tied to the *filtered* view (no numeric fallback)
        nav_prev, nav_next = st.columns([0.12, 0.12])
        with nav_prev:
            if st.button("◀ Prev"):
                st.session_state["sel_idx"] = max(0, st.session_state["sel_idx"] - 1)
        with nav_next:
            if st.button("Next ▶"):
                st.session_state["sel_idx"] = min(len(work_df) - 1, st.session_state["sel_idx"] + 1)
        clamp_sel()


    # ---------------- Resolve preview target ----------------
    if len(work_df) == 0:
        st.warning("No rows to display with current filters.")
        return

    tr = work_df.iloc[st.session_state["sel_idx"]]
    selected_chunk_id = str(tr["chunk_id"])
    mark_s = int(tr["start_char"]); mark_e = int(tr["end_char"])

    chunk_rows = df[df["chunk_id"] == selected_chunk_id]
    c_start = int(chunk_rows["start_char"].min()); c_end = int(chunk_rows["end_char"].max())

    with colR:
        st.subheader("Chunk preview")
        st.caption(f"Highlight → {selected_chunk_id} [{mark_s}:{mark_e}]")
        html_preview = highlight_chunk_html(chapter_text, c_start, c_end, mark_s, mark_e)
        st.markdown(html_preview, unsafe_allow_html=True)

    with colR:
        # ... existing preview ...
        st.markdown("---")
        st.caption("Split current chunk (use with wrongly merged speakers):")
        cidx = find_chunk_index_by_id(plan, selected_chunk_id)
        if 0 <= cidx:
            split_pos = st.slider("Split at absolute character index",
                                min_value=c_start+1, max_value=c_end-1,
                                value=(mark_s + mark_e)//2, step=1,
                                help="Choose where to split the selected chunk")
            if st.button("Split chunk here"):
                plan = split_chunk_by_char(plan, chapter_text, cidx, split_pos)
                # Recompute df/work_df after split
                df = lines_table_from_plan(plan, chapter_text)
                # Reset filters to keep the new chunks visible
                work_df = df.copy().reset_index(drop=True)
                st.session_state["sel_idx"] = min(st.session_state["sel_idx"], len(work_df)-1)
                st.success("Chunk split. Grid refreshed.")
                st.rerun()

    if 0 <= cidx:
        st.markdown("**Reorder this chunk:**")
        rcol1, rcol2, rcol3 = st.columns([0.18, 0.18, 0.64])
        with rcol1:
            if st.button("Move ▲"):
                plan = move_chunk(plan, cidx, cidx-1)
                df = lines_table_from_plan(plan, chapter_text); work_df = df.copy().reset_index(drop=True)
                st.success("Moved chunk up."); st.rerun()
        with rcol2:
            if st.button("Move ▼"):
                plan = move_chunk(plan, cidx, cidx+1)
                df = lines_table_from_plan(plan, chapter_text); work_df = df.copy().reset_index(drop=True)
                st.success("Moved chunk down."); st.rerun()
        with rcol3:
            new_pos = st.number_input("Send to index", min_value=0, max_value=max(0, len(plan.get("chunks",[]))-1), value=cidx, step=1)
            if st.button("Move to index"):
                plan = move_chunk(plan, cidx, int(new_pos))
                df = lines_table_from_plan(plan, chapter_text); work_df = df.copy().reset_index(drop=True)
                st.success(f"Moved chunk to {int(new_pos)}."); st.rerun()



    # ---------------- SAVE ----------------
    st.markdown("---")
    st.subheader("Save")
    col1, col2, col3 = st.columns([0.4, 0.3, 0.3])
    with col1:
        overwrite = st.checkbox("Overwrite original plan", value=False)
    with col2:
        out_path = Path(plan_path) if overwrite else Path(str(plan_path).replace(".plan.json", ".plan.edited.json"))
        st.text_input("Output path", value=str(out_path), key="out_path_display")
    with col3:
        if st.button("Save plan"):
            # Map edited filtered rows back to master df
            edited_keys = work_df[["chunk_id","line_index","start_char","end_char"]].astype(str).agg("|".join, axis=1).reset_index(drop=True)
            edited_voice_map = dict(zip(edited_keys, displayed["voice"].astype(str)))
            master_keys = df[["chunk_id","line_index","start_char","end_char"]].astype(str).agg("|".join, axis=1)
            df["voice"] = [edited_voice_map.get(k, v) for k, v in zip(master_keys, df["voice"].astype(str))]

            new_plan = apply_table_to_plan(plan, df)
            outp = Path(st.session_state.get("out_path_display", str(out_path)))
            outp.parent.mkdir(parents=True, exist_ok=True)
            outp.write_text(json.dumps(new_plan, ensure_ascii=False, indent=2), encoding="utf-8")
            st.success(f"Saved: {outp}")

if __name__ == "__main__":
    main()
