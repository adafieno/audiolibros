import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * SSML Voice Studio — Webview version
 * - Delete line
 * - Split chunk at caret
 * - Merge adjacent LINES (◀/▶) within the same chunk
 * - Keep all indexes 0-based
 * - CRLF→LF normalization on chapter text load
 * - DO NOT rename existing chunk IDs unless via the "Standardize IDs" button
 * - DO NOT write `text` into the plan
 */

type Line  = { start_char: number; end_char: number; voice?: string };
type Chunk = { id?: string; start_char: number; end_char: number; voice?: string; lines?: Line[] };
type Plan  = { chapter_id?: string; chapter_title?: string; chunks: Chunk[] };

type Row = {
  rowKey: string;
  chunkId: string;
  chunkIndex: number;
  lineIndex: number;  // -1 for chunk-level
  start: number;
  end: number;
  length: number;
  voice: string;
  snippet: string;
};

const stripJsonComments = (s: string) =>
  s.replace(/\/\*[^]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const parseJsonc = <T,>(raw: string): T => JSON.parse(stripJsonComments(raw));
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));

/** Normalize to match plan indexes built on LF / UTF-8 (no BOM). */
function normalizeChapterText(raw: string): { text: string; crlf: number; hadBOM: boolean } {
  const hadBOM = raw.charCodeAt(0) === 0xfeff;
  const withoutBOM = hadBOM ? raw.slice(1) : raw;
  const crlfMatches = withoutBOM.match(/\r\n/g);
  const crlf = crlfMatches ? crlfMatches.length : 0;
  const text = withoutBOM.replace(/\r\n/g, "\n");
  return { text, crlf, hadBOM };
}

function cidOf(ch: Chunk) {
  return ch.id ?? `${ch.start_char}_${ch.end_char}`;
}

function planToRows(plan: Plan, chapterText: string): Row[] {
  const rows: Row[] = [];
  plan.chunks.forEach((ch, cIdx) => {
    const cid = cidOf(ch);
    const cStart = ch.start_char, cEnd = ch.end_char;
    const baseSnippet = chapterText.slice(cStart, cEnd + 1).replace(/\n/g, " ").slice(0, 160);

    if (Array.isArray(ch.lines) && ch.lines.length) {
      ch.lines.forEach((ln, lIdx) => {
        const s = ln.start_char ?? cStart, e = ln.end_char ?? cEnd;
        const snippet = chapterText.slice(s, e + 1).replace(/\n/g, " ").slice(0, 160);
        rows.push({
          rowKey: `${cid}|${lIdx}|${s}|${e}`,
          chunkId: cid,
          chunkIndex: cIdx,
          lineIndex: lIdx,
          start: s,
          end: e,
          length: e - s + 1, // inclusive end
          voice: String(ln.voice ?? ""),
          snippet: snippet || baseSnippet,
        });
      });
    } else {
      rows.push({
        rowKey: `${cid}|-1|${cStart}|${cEnd}`,
        chunkId: cid,
        chunkIndex: cIdx,
        lineIndex: -1,
        start: cStart,
        end: cEnd,
        length: cEnd - cStart + 1,
        voice: String(ch.voice ?? ""),
        snippet: baseSnippet,
      });
    }
  });
  return rows;
}

function rowsToPlan(original: Plan, rows: Row[]): Plan {
  // voices-only update; never add `text`, never change chunk ids here
  const plan: Plan = {
    ...original,
    chunks: original.chunks.map((c) => ({ ...c, lines: c.lines ? [...c.lines] : undefined })),
  };
  rows.forEach((r) => {
    const ch = plan.chunks[r.chunkIndex];
    if (!ch) return;
    if (r.lineIndex >= 0 && Array.isArray(ch.lines) && ch.lines[r.lineIndex]) {
      ch.lines[r.lineIndex] = { ...ch.lines[r.lineIndex], voice: r.voice };
    } else {
      ch.voice = r.voice;
    }
  });
  return plan;
}

/* ------------------ Chunk ID standardizer ------------------ */

function detectPrefix(plan: Plan): string {
  if (plan.chapter_id && plan.chapter_id.trim()) return plan.chapter_id.trim();
  const firstWithId = plan.chunks.find((c) => c.id && String(c.id).includes("_"));
  if (firstWithId?.id) {
    const m = String(firstWithId.id).match(/^(.+?)_(\d{1,})$/);
    if (m) return m[1];
  }
  return "ch";
}

function proposeSequentialIds(plan: Plan): { index: number; oldId: string; newId: string }[] {
  const prefix = detectPrefix(plan);
  const width = Math.max(3, String(plan.chunks.length).length); // 001, 002 ... 010 ... 1000
  return plan.chunks.map((ch, i) => {
    const oldId = ch.id ?? `${ch.start_char}_${ch.end_char}`;
    const newId = `${prefix}_${String(i + 1).padStart(width, "0")}`;
    return { index: i, oldId, newId };
  });
}

function applySequentialIds(plan: Plan, mapping: { index: number; newId: string }[]): Plan {
  const chunks = plan.chunks.map((ch, i) => {
    const m = mapping.find((x) => x.index === i);
    if (!m) return ch;
    return { ...ch, id: m.newId }; // only write `id`
  });
  return { ...plan, chunks };
}

/* ------------------ Azure caps parity ------------------ */

type AzureCaps = { maxKB: number; hardCapMin: number; wpm: number; overhead: number };
const DEFAULT_CAPS: AzureCaps = { maxKB: 48, hardCapMin: 8.0, wpm: 165, overhead: 0.15 };

function utf8BytesLen(s: string): number { return new TextEncoder().encode(s).length; }
function wordsIn(text: string): number {
  const m = text.match(/\b[\wÁÉÍÓÚÜÑáéíóúüñ'-]+\b/g);
  return m ? m.length : 0;
}
function estMinutesSpan(text: string, start: number, end: number, wpm: number): number {
  const slice = text.slice(start, end + 1);
  const w = Math.max(1, wordsIn(slice));
  return w / Math.max(80, wpm);
}
function estKBSpan(text: string, start: number, end: number, overhead: number): number {
  const raw = utf8BytesLen(text.slice(start, end + 1));
  return Math.ceil((raw * (1 + Math.max(0, overhead))) / 1024);
}
function chunkStats(ch: Chunk, chapterText: string, caps: AzureCaps) {
  const s = ch.start_char, e = ch.end_char;
  const kb = estKBSpan(chapterText, s, e, caps.overhead);
  const minutes = estMinutesSpan(chapterText, s, e, caps.wpm);
  return { kb, minutes };
}
function withinCaps(stats: {kb:number;minutes:number}, caps: AzureCaps) {
  return stats.kb <= caps.maxKB && stats.minutes <= caps.hardCapMin;
}
function statColor(stats: {kb:number;minutes:number}, caps: AzureCaps): string {
  const nearKb = stats.kb > caps.maxKB * 0.9;
  const nearMin = stats.minutes > caps.hardCapMin * 0.9;
  if (stats.kb > caps.maxKB || stats.minutes > caps.hardCapMin) return "#dc2626"; // red
  if (nearKb || nearMin) return "#f59e0b"; // amber
  return "#16a34a"; // green
}

/* ------------------ Line-cap helpers ------------------ */

function linesInChunk(ch: Chunk): number {
  return Array.isArray(ch.lines) && ch.lines.length ? ch.lines.length : 1;
}

/** Split a chunk so the LEFT side is ≤ caps; uses line boundaries when possible. */
function splitChunkToFitCaps(plan: Plan, chunkIdx: number, chapterText: string, caps: AzureCaps): Plan {
  if (chunkIdx < 0 || chunkIdx >= plan.chunks.length) return plan;
  let p = plan;

  // Ensure lines exist for line-boundary split
  p = ensureChunkHasLines(p, chunkIdx);
  let ch = p.chunks[chunkIdx];

  // If already fits, nothing to do
  if (withinCaps(chunkStats(ch, chapterText, caps), caps)) return p;

  const L = ch.lines ?? [];
  if (L.length === 0) return p;

  let take = 0;
  for (let i = 0; i < L.length; i++) {
    const s = ch.start_char, eCandidate = L[i].end_char;
    const stats = { kb: estKBSpan(chapterText, s, eCandidate, caps.overhead),
                    minutes: estMinutesSpan(chapterText, s, eCandidate, caps.wpm) };
    if (withinCaps(stats, caps)) take = i + 1; else break;
  }

  if (take === 0) {
    // First line alone is too big → split inside that line (midpoint)
    const first = L[0];
    const mid = Math.min(
      Math.max(first.start_char + 1, Math.floor((first.start_char + first.end_char + 1) / 2)),
      first.end_char
    );
    return splitChunk(p, chunkIdx, mid);
  }
  if (take >= L.length) {
    // Left-with-all-lines still fails → fallback split by midpoint
    const mid = Math.min(
      Math.max(ch.start_char + 1, Math.floor((ch.start_char + ch.end_char + 1) / 2)),
      ch.end_char
    );
    return splitChunk(p, chunkIdx, mid);
  }
  const splitAt = L[take - 1].end_char + 1; // AFTER last safe line
  return splitChunk(p, chunkIdx, splitAt);
}

/** Normalize one chunk: repeatedly split until it fits the caps. */
function normalizeChunkByCaps(plan: Plan, chunkIdx: number, chapterText: string, caps: AzureCaps): Plan {
  let p = plan;
  let idx = chunkIdx;
  while (idx < p.chunks.length) {
    const st = chunkStats(p.chunks[idx], chapterText, caps);
    if (withinCaps(st, caps)) break;
    const next = splitChunkToFitCaps(p, idx, chapterText, caps);
    if (next === p) break; // safety
    p = next; // re-check same index (left keeps id)
  }
  return p;
}

/** Normalize ALL chunks to caps. */
function normalizeAllByCaps(plan: Plan, chapterText: string, caps: AzureCaps): Plan {
  let p = plan;
  let i = 0;
  while (i < p.chunks.length) {
    const st = chunkStats(p.chunks[i], chapterText, caps);
    if (withinCaps(st, caps)) { i++; continue; }
    const next = splitChunkToFitCaps(p, i, chapterText, caps);
    if (next === p) { i++; continue; } // safety
    p = next; // re-check same index again
  }
  return p;
}

/** Split current chunk so left side has <= maxLines (split on a line boundary). */
function splitChunkByLineCap(plan: Plan, chunkIdx: number, maxLines: number): Plan {
  if (chunkIdx < 0 || chunkIdx >= plan.chunks.length) return plan;
  let p = ensureChunkHasLines(plan, chunkIdx);
  let ch = p.chunks[chunkIdx];
  const L = ch.lines ?? [];
  if (L.length <= maxLines) return p;

  const leftLast = L[maxLines - 1];
  const splitAtAbs = leftLast.end_char + 1;
  const safeSplit = Math.min(Math.max(splitAtAbs, ch.start_char + 1), ch.end_char);
  p = splitChunk(p, chunkIdx, safeSplit);
  return p;
}

/** Walk all chunks and keep splitting until all have <= maxLines lines. */
function normalizeAllChunksByLineCap(plan: Plan, maxLines: number): Plan {
  let p = plan;
  let i = 0;
  while (i < p.chunks.length) {
    const count = linesInChunk(p.chunks[i]);
    if (count > maxLines) {
      p = splitChunkByLineCap(p, i, maxLines);
      continue; // re-check same index
    }
    i++;
  }
  return p;
}

/* --------------------- Editing operations --------------------- */

function ensureChunkHasLines(plan: Plan, chunkIdx: number): Plan {
  const chunks = [...plan.chunks];
  const ch = chunks[chunkIdx];
  if (!ch) return plan;
  if (Array.isArray(ch.lines) && ch.lines.length) return plan;

  // Upgrade a chunk-level voice into a single line (no `text`)
  const line: Line = { start_char: ch.start_char, end_char: ch.end_char, voice: ch.voice };
  const upgraded: Chunk = { ...ch, lines: [line] };
  delete (upgraded as any).voice;
  chunks.splice(chunkIdx, 1, upgraded);
  return { ...plan, chunks };
}

function splitChunk(plan: Plan, chunkIdx: number, splitAtAbs: number): Plan {
  const chunks = [...plan.chunks];
  const ch = chunks[chunkIdx]; if (!ch) return plan;

  const cStart = ch.start_char, cEnd = ch.end_char;
  const splitAt = clamp(splitAtAbs, cStart + 1, cEnd - 1);
  if (!(splitAt > cStart && splitAt <= cEnd)) return plan;

  // Build left/right, preserving original id ONLY on the left; remove ids otherwise
  const left: Chunk  = { ...ch, end_char: splitAt - 1 };
  const right: Chunk = { ...ch, start_char: splitAt   };

  if (ch.id !== undefined) left.id = ch.id; else delete (left as any).id;
  delete (right as any).id; // Right must not inherit id

  // Redistribute/split lines (no `text`)
  const existingLines: Line[] =
    Array.isArray(ch.lines) && ch.lines.length
      ? ch.lines
      : [{ start_char: cStart, end_char: cEnd, voice: ch.voice }];

  const L: Line[] = [], R: Line[] = [];
  existingLines.forEach((ln) => {
    const ls = ln.start_char, le = ln.end_char;
    if (le < splitAt) L.push({ ...ln });
    else if (ls >= splitAt) R.push({ ...ln });
    else { // spans the split
      L.push({ ...ln, end_char: splitAt - 1 });
      R.push({ ...ln, start_char: splitAt });
    }
  });
  left.lines = L; right.lines = R;
  delete (left as any).voice; delete (right as any).voice;

  chunks.splice(chunkIdx, 1, left, right);
  return { ...plan, chunks };
}

function mergeLinesInChunk(plan: Plan, chunkIdx: number, leftLineIdx: number, rightLineIdx: number): Plan {
  if (leftLineIdx < 0 || rightLineIdx < 0) return plan;
  const chunks = [...plan.chunks];
  const ch = chunks[chunkIdx]; if (!ch || !Array.isArray(ch.lines)) return plan;
  if (leftLineIdx >= ch.lines.length || rightLineIdx >= ch.lines.length) return plan;
  if (Math.abs(leftLineIdx - rightLineIdx) !== 1) return plan;

  const [li, ri] = leftLineIdx < rightLineIdx ? [leftLineIdx, rightLineIdx] : [rightLineIdx, leftLineIdx];
  const L = ch.lines[li], R = ch.lines[ri];
  const s = Math.min(L.start_char, R.start_char);
  const e = Math.max(L.end_char,   R.end_char);

  const merged: Line = {
    start_char: s,
    end_char: e,
    voice: (L.voice !== undefined ? L.voice : R.voice), // keep left's voice
  };

  const nextLines = [...ch.lines];
  nextLines.splice(li, 2, merged);
  const updated: Chunk = { ...ch, lines: nextLines };
  // Never touch chunk.id
  chunks.splice(chunkIdx, 1, updated);
  return { ...plan, chunks };
}

function deleteLineFromChunk(plan: Plan, chunkIdx: number, lineIdx: number): Plan {
  const chunks = [...plan.chunks];
  const ch = chunks[chunkIdx];
  if (!ch || !Array.isArray(ch.lines)) return plan;
  if (lineIdx < 0 || lineIdx >= ch.lines.length) return plan;

  const nextLines = [...ch.lines];
  nextLines.splice(lineIdx, 1);
  const updated: Chunk = { ...ch, lines: nextLines };
  chunks.splice(chunkIdx, 1, updated);
  return { ...plan, chunks };
}

/* --------------------- App --------------------- */

function App() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [chapterText, setChapterText] = useState("");
  const [voicesCast, setVoicesCast] = useState<any | null>(null);

  const [onlyUnknown, setOnlyUnknown] = useState(false);
  const [chunkFilter, setChunkFilter]   = useState<string>("(all)");
  const [search, setSearch]             = useState("");
  const [loadInfo, setLoadInfo]         = useState<{ crlf: number; hadBOM: boolean } | null>(null);

  const rowsAll = useMemo(() => (plan ? planToRows(plan, chapterText) : []), [plan, chapterText]);
  const chunkIds = useMemo(() => ["(all)", ...Array.from(new Set(rowsAll.map((r) => r.chunkId)))], [rowsAll]);

  const filteredRows = useMemo(() => {
    let rs = rowsAll;
    if (onlyUnknown) rs = rs.filter((r) => r.voice.toLowerCase() === "desconocido" || r.voice === "");
    if (chunkFilter !== "(all)") rs = rs.filter((r) => r.chunkId === chunkFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rs = rs.filter((r) => r.snippet.toLowerCase().includes(q));
    }
    return rs;
  }, [rowsAll, onlyUnknown, chunkFilter, search]);

  const [selIndex, setSelIndex] = useState(0);
  useEffect(() => setSelIndex((i) => clamp(i, 0, Math.max(0, filteredRows.length - 1))), [filteredRows.length]);
  const current = filteredRows[selIndex];

  const voiceOptions = useMemo(() => {
    const set = new Set<string>();
    if (voicesCast) {
      if (Array.isArray(voicesCast.cast)) voicesCast.cast.forEach((it: any) => it.character_id && set.add(String(it.character_id)));
      else if (typeof voicesCast === "object") Object.keys(voicesCast).forEach((k) => set.add(k));
    }
    ["narrador", "Narrador", "desconocido"].forEach((k) => set.add(k));
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [voicesCast]);

  const gridRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const rowEl = gridRef.current?.querySelector(`[data-row='${selIndex}']`) as HTMLElement | null;
    rowEl?.scrollIntoView({ block: "nearest" });
  }, [selIndex, filteredRows.length]);

  const rowsToChunkBounds = (chunkId: string | undefined) => {
    if (!chunkId) return null;
    const rs = rowsAll.filter((r) => r.chunkId === chunkId);
    if (!rs.length) return null;
    return { cStart: Math.min(...rs.map((r) => r.start)), cEnd: Math.max(...rs.map((r) => r.end)) };
  };

  const [caretAbs, setCaretAbs] = useState<number | null>(null);

  const updateRowVoice = (i: number, voice: string) => {
    const row = filteredRows[i]; if (!row || !plan) return;
    const updated = rowsAll.map((r) => (r.rowKey === row.rowKey ? { ...r, voice } : r));
    setPlan(rowsToPlan(plan, updated));
  };

  // Azure caps + line cap
  const [caps, setCaps] = useState<AzureCaps>(DEFAULT_CAPS);
  const [lineCap, setLineCap] = useState<number>(120);

  // file pickers
  const pickFile = async (accept: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    const p = new Promise<File | null>((resolve) => { input.onchange = () => resolve(input.files?.[0] ?? null); });
    input.click();
    const file = await p;
    if (!file) return null;
    return await file.text();
  };

  /* --------- Actions: split (chunk) & merge/delete (line) --------- */

  const getCurrentChunkIndex = (): number => {
    if (!plan || !current) return -1;
    return plan.chunks.findIndex((c) => cidOf(c) === current.chunkId);
  };

  const doSplitAtCaret = () => {
    if (!plan || !current) return;
    const bounds = rowsToChunkBounds(current.chunkId);
    if (!bounds || caretAbs == null) return;
    const { cStart, cEnd } = bounds;
    if (caretAbs <= cStart || caretAbs >= cEnd) return; // must be strictly inside
    const idx = getCurrentChunkIndex(); if (idx < 0) return;

    const newPlan = splitChunk(plan, idx, caretAbs);
    setPlan(newPlan);

    // keep selection near caret using the real post-split IDs
    setTimeout(() => {
      const leftChunk  = newPlan.chunks[idx];
      const rightChunk = newPlan.chunks[idx + 1];
      const leftCid  = cidOf(leftChunk);
      const rightCid = cidOf(rightChunk);

      const rr = planToRows(newPlan, chapterText);
      const foundIdx = rr.findIndex((r) =>
        (r.chunkId === leftCid  && caretAbs - 1 >= r.start && caretAbs - 1 <= r.end) ||
        (r.chunkId === rightCid && caretAbs     >= r.start && caretAbs     <= r.end)
      );
      const fr = filterRowsSnapshot(rr);
      const key = foundIdx >= 0 ? rr[foundIdx].rowKey : undefined;
      const newSel = key ? fr.findIndex((r) => r.rowKey === key) : -1;
      if (newSel >= 0) setSelIndex(newSel);
    }, 0);
  };

  const doMergeLineWithPrev = () => {
    if (!plan || !current || current.lineIndex < 0) return;
    const cIdx = getCurrentChunkIndex(); if (cIdx < 0) return;

    const withLines = ensureChunkHasLines(plan, cIdx);
    const ch = withLines.chunks[cIdx];
    if (!ch.lines || current.lineIndex <= 0) return;

    const merged = mergeLinesInChunk(withLines, cIdx, current.lineIndex - 1, current.lineIndex);
    setPlan(merged);

    // after merging with prev, the new line sits at (lineIndex - 1)
    setTimeout(() => selectByChunkAndLine(merged, cidOf(merged.chunks[cIdx]), current.lineIndex - 1), 0);
  };

  const doMergeLineWithNext = () => {
    if (!plan || !current || current.lineIndex < 0) return;
    const cIdx = getCurrentChunkIndex(); if (cIdx < 0) return;

    const withLines = ensureChunkHasLines(plan, cIdx);
    const ch = withLines.chunks[cIdx];
    if (!ch.lines || current.lineIndex >= ch.lines.length - 1) return;

    const merged = mergeLinesInChunk(withLines, cIdx, current.lineIndex, current.lineIndex + 1);
    setPlan(merged);

    // after merging with next, the merged line remains at current.lineIndex
    setTimeout(() => selectByChunkAndLine(merged, cidOf(merged.chunks[cIdx]), current.lineIndex), 0);
  };

  const doDeleteLine = () => {
    if (!plan || !current || current.lineIndex < 0) return;
    const cIdx = getCurrentChunkIndex(); if (cIdx < 0) return;

    const withLines = ensureChunkHasLines(plan, cIdx);
    const nextPlan = deleteLineFromChunk(withLines, cIdx, current.lineIndex);
    setPlan(nextPlan);
    setCaretAbs(null);

    // Keep selection in same chunk, move to same (now shifted) index or previous one
    setTimeout(() => {
      const rr = planToRows(nextPlan, chapterText);
      const targetCid = cidOf(nextPlan.chunks[cIdx] ?? { start_char: 0, end_char: 0 });
      let found = rr.findIndex((r) => r.chunkId === targetCid && r.lineIndex === current.lineIndex);
      if (found < 0) found = rr.findIndex((r) => r.chunkId === targetCid && r.lineIndex === current.lineIndex - 1);
      const fr = filterRowsSnapshot(rr);
      if (found >= 0) {
        const key = rr[found].rowKey;
        const ni = fr.findIndex((r) => r.rowKey === key);
        if (ni >= 0) setSelIndex(ni);
      } else {
        setSelIndex((i) => clamp(i, 0, Math.max(0, fr.length - 1)));
      }
    }, 0);
  };

  // helpers that apply current filters to an arbitrary rows snapshot
  const filterRowsSnapshot = (rr: Row[]) => {
    let rs = rr;
    if (onlyUnknown) rs = rs.filter((r) => r.voice.toLowerCase() === "desconocido" || r.voice === "");
    if (chunkFilter !== "(all)") rs = rs.filter((r) => r.chunkId === chunkFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rs = rs.filter((r) => r.snippet.toLowerCase().includes(q));
    }
    return rs;
  };

  const selectByChunkAndLine = (p: Plan, chunkId: string, lineIndex: number) => {
    const rr = planToRows(p, chapterText);
    const i = rr.findIndex((r) => r.chunkId === chunkId && r.lineIndex === lineIndex);
    if (i >= 0) {
      const key = rr[i].rowKey;
      const fr = filterRowsSnapshot(rr);
      const newSel = fr.findIndex((r) => r.rowKey === key);
      if (newSel >= 0) setSelIndex(newSel);
    }
  };

  /* --------------------- Render --------------------- */

  return (
    <div className="h-screen w-screen flex flex-col text-slate-900">
      <header className="flex items-center gap-3 px-4 py-2 border-b bg-white/70">
        <h1 className="text-xl font-semibold">SSML Voice Studio</h1>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn" onClick={async () => { const t = await pickFile(".json"); if (t) setPlan(parseJsonc<Plan>(t)); }}>
            Plan (.plan.json)
          </button>
          <button className="btn" onClick={async () => {
            const t = await pickFile(".txt"); if (!t) return;
            const n = normalizeChapterText(t); setChapterText(n.text); setLoadInfo({ crlf: n.crlf, hadBOM: n.hadBOM });
          }}>
            Chapter (.txt)
          </button>
          <button className="btn" onClick={async () => { const t = await pickFile(".json"); if (t) setVoicesCast(parseJsonc<any>(t)); }}>
            voices.cast.json
          </button>

          {/* Check / Standardize chunk IDs */}
          <button
            className="btn"
            onClick={() => {
              if (!plan) return;
              const sel = current ? { chunkIdx: plan.chunks.findIndex((c) => cidOf(c) === current.chunkId), lineIdx: current.lineIndex } : null;
              const props = proposeSequentialIds(plan);
              const changes = props.filter((p, i) => (plan.chunks[i].id ?? "") !== p.newId);
              if (changes.length === 0) { alert("✅ Chunk IDs already sequential and standardized."); return; }
              const preview = changes.slice(0, 12).map((c) => `  ${c.oldId}  →  ${c.newId}`).join("\n");
              const extra = changes.length > 12 ? `\n  …and ${changes.length - 12} more` : "";
              const ok = confirm(`Standardize ${changes.length} chunk ID(s) to sequential format?\n\n${preview}${extra}`);
              if (!ok) return;
              const newPlan = applySequentialIds(plan, props.map((p) => ({ index: p.index, newId: p.newId })));
              setPlan(newPlan);
              if (sel && sel.chunkIdx >= 0) {
                const newCid = cidOf(newPlan.chunks[sel.chunkIdx]);
                setTimeout(() => {
                  const rr = planToRows(newPlan, chapterText);
                  const i = rr.findIndex((r) => r.chunkId === newCid && r.lineIndex === sel.lineIdx);
                  if (i >= 0) {
                    const fr = filterRowsSnapshot(rr);
                    const key = rr[i].rowKey;
                    const newSel = fr.findIndex((r) => r.rowKey === key);
                    if (newSel >= 0) setSelIndex(newSel);
                  }
                }, 0);
              }
            }}
          >
            Check / Standardize chunk IDs
          </button>

          {/* Azure caps controls */}
          <div className="flex items-center gap-2 pl-3">
            <label className="text-sm">KB</label>
            <input type="number" className="border rounded px-2 py-1 w-16"
              value={caps.maxKB} min={16} max={96}
              onChange={(e) => setCaps({ ...caps, maxKB: Number(e.target.value) || DEFAULT_CAPS.maxKB })} />
            <label className="text-sm">hard min</label>
            <input type="number" className="border rounded px-2 py-1 w-20" step="0.5"
              value={caps.hardCapMin} min={2} max={20}
              onChange={(e) => setCaps({ ...caps, hardCapMin: Number(e.target.value) || DEFAULT_CAPS.hardCapMin })} />
            <label className="text-sm">wpm</label>
            <input type="number" className="border rounded px-2 py-1 w-20"
              value={caps.wpm} min={100} max={260}
              onChange={(e) => setCaps({ ...caps, wpm: Number(e.target.value) || DEFAULT_CAPS.wpm })} />
            <label className="text-sm">overhead</label>
            <input type="number" className="border rounded px-2 py-1 w-20" step="0.05"
              value={caps.overhead} min={0} max={0.5}
              onChange={(e) => setCaps({ ...caps, overhead: Number(e.target.value) })} />

            <button className="btn"
              onClick={() => {
                if (!plan || !current) return;
                const idx = plan.chunks.findIndex((c) => cidOf(c) === current.chunkId);
                if (idx < 0) return;
                const before = chunkStats(plan.chunks[idx], chapterText, caps);
                const afterPlan = normalizeChunkByCaps(plan, idx, chapterText, caps);
                setPlan(afterPlan);
                if (afterPlan === plan) {
                  alert(`✅ Current chunk within caps (~${before.kb}KB, ${before.minutes.toFixed(2)}min).`);
                } else {
                  setTimeout(() => {
                    const newCid = cidOf(afterPlan.chunks[idx]);
                    const rr = planToRows(afterPlan, chapterText);
                    const iSel = rr.findIndex(r => r.chunkId === newCid && r.lineIndex >= 0);
                    if (iSel >= 0) setSelIndex(iSel);
                  }, 0);
                }
              }}>
              Normalize current to caps
            </button>

            <button className="btn"
              onClick={() => {
                if (!plan) return;
                const offenders = plan.chunks
                  .map((ch, i) => ({ i, st: chunkStats(ch, chapterText, caps), id: cidOf(ch) }))
                  .filter(x => !withinCaps(x.st, caps));
                if (!offenders.length) { alert("✅ All chunks are within caps."); return; }
                const prev = offenders.slice(0, 10).map(o => `  ${o.id}: ${o.st.kb}KB, ${o.st.minutes.toFixed(2)}min`).join("\n");
                const more = offenders.length > 10 ? `\n  …and ${offenders.length - 10} more` : "";
                const ok = confirm(`Normalize ${offenders.length} chunk(s) to caps?\n\n${prev}${more}`);
                if (!ok) return;
                const newPlan = normalizeAllByCaps(plan, chapterText, caps);
                setPlan(newPlan);
              }}>
              Normalize ALL to caps
            </button>
          </div>

          {/* Line cap controls */}
          <div className="flex items-center gap-2 pl-3">
            <label className="text-sm">line cap</label>
            <input
              type="number"
              className="border rounded px-2 py-1 w-20"
              min={20}
              max={400}
              value={lineCap}
              onChange={(e) => setLineCap(Math.max(20, Math.min(400, Number(e.target.value) || 120)))}
              title="Maximum lines per chunk"
            />
            <button
              className="btn"
              onClick={() => {
                if (!plan || !current) return;
                const idx = plan.chunks.findIndex((c) => cidOf(c) === current.chunkId);
                if (idx < 0) return;
                const before = linesInChunk(plan.chunks[idx]);
                if (before <= lineCap) { alert("✅ Current chunk already within line cap."); return; }
                const after = splitChunkByLineCap(plan, idx, lineCap);
                setPlan(after);
              }}
            >
              Auto-split current by cap
            </button>
            <button
              className="btn"
              onClick={() => {
                if (!plan) return;
                const offenders = plan.chunks
                  .map((ch, i) => ({ i, lines: linesInChunk(ch), id: cidOf(ch) }))
                  .filter(p => p.lines > lineCap);
                if (offenders.length === 0) { alert("✅ All chunks within line cap."); return; }
                const preview = offenders.slice(0, 10).map(p => `  ${p.id}: ${p.lines} lines`).join("\n");
                const more = offenders.length > 10 ? `\n  …and ${offenders.length - 10} more` : "";
                const ok = confirm(`Normalize chunks to ≤ ${lineCap} lines?\n\n${preview}${more}`);
                if (!ok) return;
                const newPlan = normalizeAllChunksByLineCap(plan, lineCap);
                setPlan(newPlan);
              }}
            >
              Normalize ALL by cap
            </button>
          </div>
        </div>
      </header>

      <div className="flex items-center gap-3 px-4 py-2 border-b bg-slate-50">
        <label className="text-sm">Chunk:</label>
        <select className="border rounded px-2 py-1" value={chunkFilter} onChange={(e) => setChunkFilter(e.target.value)}>
          {chunkIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={onlyUnknown} onChange={(e) => setOnlyUnknown(e.target.checked)} />
          only unknowns
        </label>
        <input className="border rounded px-2 py-1 w-[280px]" placeholder="Search snippet…" value={search} onChange={(e) => setSearch(e.target.value)} />

        {/* Live badges: KB/min + line count for the selected chunk */}
        <div className="ml-auto flex items-center gap-4 text-xs text-slate-500">
          {plan && current ? (() => {
            const cIdx = plan.chunks.findIndex((c) => cidOf(c) === current.chunkId);
            if (cIdx >= 0) {
              const st = chunkStats(plan.chunks[cIdx], chapterText, caps);
              const color = statColor(st, caps);
              const nLines = linesInChunk(plan.chunks[cIdx]);
              const lineColor = nLines <= 120 ? "#16a34a" : (nLines <= 200 ? "#f59e0b" : "#dc2626");
              return (
                <>
                  <span title="Azure TTS size/time estimate" style={{ color }}>
                    ~{st.kb}KB · {st.minutes.toFixed(2)}min
                  </span>
                  <span title="Lines in current chunk" style={{ color: lineColor }}>
                    lines: <b>{nLines}</b>
                  </span>
                </>
              );
            }
            return null;
          })() : null}
          <span>J/K or ↑/↓ to navigate</span>
          {loadInfo ? <span className="ml-1">normalized: {loadInfo.crlf} CRLF → LF{loadInfo.hadBOM ? ", BOM removed" : ""}</span> : null}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 min-h-0">
        {/* LEFT: Grid */}
        <div className="min-h-0 border-r">
          <div className="px-3 py-2 border-b bg-white/70 sticky top-0 z-10 text-sm text-slate-600">
            Click a row to preview; change voice in place.
          </div>
          <div ref={gridRef} className="overflow-auto h-full">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 border-b">
                <tr className="text-left">
                  <th className="px-2 py-2"></th>
                  <th className="px-2 py-2">chunk</th>
                  <th className="px-2 py-2">line</th>
                  <th className="px-2 py-2">start</th>
                  <th className="px-2 py-2">end</th>
                  <th className="px-2 py-2">len</th>
                  <th className="px-2 py-2 w-48">voice</th>
                  <th className="px-2 py-2">snippet</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, i) => (
                  <tr key={r.rowKey} data-row={i}
                      className={"cursor-pointer border-b hover:bg-slate-50 " + (i === selIndex ? "bg-amber-50" : "")}
                      onClick={() => setSelIndex(i)}>
                    <td className="px-2 py-1 text-slate-400">{i === selIndex ? "▶" : ""}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{r.chunkId}</td>
                    <td className="px-2 py-1 text-right w-12">{r.lineIndex >= 0 ? r.lineIndex : "—"}</td>
                    <td className="px-2 py-1 text-right w-16">{r.start}</td>
                    <td className="px-2 py-1 text-right w-16">{r.end}</td>
                    <td className="px-2 py-1 text-right w-14">{r.length}</td>
                    <td className="px-2 py-1 w-48">
                      <select className="border rounded px-2 py-1 w-full"
                              value={r.voice}
                              onChange={(e) => updateRowVoice(i, e.target.value)}
                              onClick={(e) => e.stopPropagation()}>
                        <option value=""></option>
                        {voiceOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1 text-slate-600">
                      <span className="line-clamp-2">{r.snippet}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {plan && (
            <div className="p-3 border-t bg-slate-50 flex items-center gap-2">
              <button className="btn-primary" onClick={() => {
                const text = JSON.stringify(plan, null, 2);
                const blob = new Blob([text], { type: "application/json;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = (plan.chapter_id || "chapter") + ".plan.edited.json"; a.click();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
              }}>
                Save plan
              </button>
            </div>
          )}
        </div>

        {/* RIGHT: Preview & tools */}
        <div className="min-h-0 flex flex-col">
          <div className="px-3 py-2 border-b bg-white/70 sticky top-0 z-10 text-sm flex items-center gap-2">
            {current ? (
              <>
                <span>Preview — <span className="text-slate-500">{current.chunkId} [{current.start}:{current.end}]</span></span>
                <span className="ml-4 text-slate-500">caret: {caretAbs ?? "—"}</span>
                <span className="flex-1" />
                {/* Merge LINES within the same chunk */}
                <button className="btn" onClick={doMergeLineWithPrev}
                        disabled={!plan || !current || current.lineIndex <= 0}>
                  Merge line ◀
                </button>
                <button className="btn" onClick={doSplitAtCaret} disabled={caretAbs == null}>
                  Split chunk at caret
                </button>
                <button className="btn" onClick={doMergeLineWithNext}
                        disabled={!plan || !current || current.lineIndex < 0 || (() => {
                          const idx = getCurrentChunkIndex(); if (idx < 0) return true;
                          const ch = plan!.chunks[idx]; const has = Array.isArray(ch.lines) && ch.lines.length;
                          return !has || current.lineIndex >= (ch.lines!.length - 1);
                        })()}>
                  Merge line ▶
                </button>
                <button className="btn" onClick={doDeleteLine} disabled={!plan || !current || current.lineIndex < 0}>
                  Delete line
                </button>
              </>
            ) : "Preview"}
          </div>

          <div className="p-3 overflow-auto text-[15px] leading-6 font-[450]">
            {current ? (
              <ChunkPreview
                chapterText={chapterText}
                bounds={rowsToChunkBounds(current.chunkId)}
                markS={current.start}
                markE={current.end}
                caretAbs={caretAbs}
                onCaret={setCaretAbs}
                onJumpToLine={(abs) => {
                  const found = filteredRows.findIndex((r) => abs >= r.start && abs <= r.end && r.chunkId === current.chunkId);
                  if (found >= 0) setSelIndex(found);
                }}
              />
            ) : (
              <div className="text-slate-500">Load a plan and chapter text to preview.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChunkPreview({
  chapterText, bounds, markS, markE, caretAbs, onCaret, onJumpToLine,
}: {
  chapterText: string;
  bounds: { cStart: number; cEnd: number } | null;
  markS: number;
  markE: number;
  caretAbs: number | null;
  onCaret: (abs: number) => void;
  onJumpToLine: (abs: number) => void;
}) {
  if (!bounds) return null;
  const { cStart, cEnd } = bounds;
  const text = chapterText.slice(cStart, cEnd + 1);
  return (
    <div className="whitespace-pre-wrap">
      {text.split("").map((ch, i) => {
        const abs = cStart + i; // absolute 0-based
        const inHighlight = abs >= markS && abs <= markE;
        const isCaret = caretAbs === abs;
        return (
          <span
            key={i}
            className={"char " + (isCaret ? "caret " : "")}
            onClick={() => onCaret(abs)}
            onDoubleClick={() => onJumpToLine(abs)}
            style={{
              background: inHighlight ? "#fde68a" : undefined,
              borderRadius: inHighlight ? 2 : 0,
              padding: inHighlight ? "0 1px" : undefined,
            }}
            title={`abs ${abs}`}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
}

export default App;
