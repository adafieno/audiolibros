import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { loadProjectConfig } from "../lib/config";
import type { ProjectConfig } from "../types/config";
import type { ChapterPlan, PlanRow, PlanChunk, AzureCaps, ChunkStats } from "../types/plan";
import type { JobEvent, PlanBuildPayload } from "../global";
import { rel } from "../lib/paths";

interface Character {
  name?: string;
  id: string;
}

interface CharactersData {
  characters: Character[];
}

// Default Azure TTS constraints
const DEFAULT_CAPS: AzureCaps = {
  maxKB: 48,
  hardCapMin: 8.0,
  wpm: 165,
  overhead: 0.15
};

export default function PlanningPage({ onStatus }: { onStatus: (s: string) => void }) {
  const { t } = useTranslation();
  const { root } = useProject();
  const [plan, setPlan] = useState<ChapterPlan | null>(null);
  const [chapterText, setChapterText] = useState("");
  const [availableCharacters, setAvailableCharacters] = useState<string[]>([]);
  const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [running, setRunning] = useState(false);
  
  // Filters and selection
  const [onlyUnknown, setOnlyUnknown] = useState(false);
  const [chunkFilter, setChunkFilter] = useState<string>("(all)");
  const [search, setSearch] = useState("");
  const [selIndex, setSelIndex] = useState(0);
  
  // Caps settings
  const [caps] = useState<AzureCaps>(DEFAULT_CAPS);

  const gridRef = useRef<HTMLDivElement | null>(null);

  // Job event handling for plan generation
  useEffect(() => {
    window.khipu?.onJob((data: JobEvent) => {
      if (data.event === "progress" && typeof data.pct === "number") {
        onStatus(t("status.progress", { pct: data.pct, note: data.note ?? "" }));
      } else if (data.event === "done") {
        onStatus(data.ok ? t("status.completed") : t("status.failed"));
        setRunning(false);
        setLoading(false);
      }
    });
  }, [onStatus, t]);

  // Load project config
  useEffect(() => {
    if (!root) return;
    
    loadProjectConfig(root)
      .then((config: ProjectConfig) => setProjectConfig(config))
      .catch((error: unknown) => console.warn("Failed to load project config:", error));
  }, [root]);

  // Load available characters
  useEffect(() => {
    if (!root) return;
    
    const loadCharacters = async () => {
      try {
        const charactersData = await window.khipu!.call("fs:read", {
          projectRoot: root,
          relPath: "dossier/characters.json",
          json: true
        }) as CharactersData;
        
        if (charactersData?.characters) {
          const names = charactersData.characters.map((char: Character) => char.name || char.id);
          setAvailableCharacters(["narrador", "Narrador", "desconocido", ...names]);
        }
      } catch (error) {
        console.warn("Failed to load characters:", error);
        setAvailableCharacters(["narrador", "Narrador", "desconocido"]);
      }
    };
    
    loadCharacters();
  }, [root]);

  // Utility functions from reference solution
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));
  
  const cidOf = (ch: PlanChunk): string => {
    return ch.id ?? `${ch.start_char}_${ch.end_char}`;
  };

  const utf8BytesLen = (s: string): number => new TextEncoder().encode(s).length;
  
  const wordsIn = (text: string): number => {
    const m = text.match(/\b[\wÁÉÍÓÚÜÑáéíóúüñ'-]+\b/g);
    return m ? m.length : 0;
  };

  const estMinutesSpan = (text: string, start: number, end: number, wpm: number): number => {
    const slice = text.slice(start, end + 1);
    const w = Math.max(1, wordsIn(slice));
    return w / Math.max(80, wpm);
  };

  const estKBSpan = (text: string, start: number, end: number, overhead: number): number => {
    const raw = utf8BytesLen(text.slice(start, end + 1));
    return Math.ceil((raw * (1 + Math.max(0, overhead))) / 1024);
  };

  const chunkStats = (ch: PlanChunk, chapterText: string, caps: AzureCaps): ChunkStats => {
    const s = ch.start_char, e = ch.end_char;
    const kb = estKBSpan(chapterText, s, e, caps.overhead);
    const minutes = estMinutesSpan(chapterText, s, e, caps.wpm);
    return { kb, minutes };
  };

  const statColor = (stats: ChunkStats, caps: AzureCaps): string => {
    const nearKb = stats.kb > caps.maxKB * 0.9;
    const nearMin = stats.minutes > caps.hardCapMin * 0.9;
    if (stats.kb > caps.maxKB || stats.minutes > caps.hardCapMin) return "#dc2626"; // red
    if (nearKb || nearMin) return "#f59e0b"; // amber
    return "#16a34a"; // green
  };

  // Convert plan to rows for table display
  const planToRows = useCallback((plan: ChapterPlan, chapterText: string): PlanRow[] => {
    const rows: PlanRow[] = [];
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
            length: e - s + 1,
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
  }, []);

  const rowsAll = useMemo(() => (plan ? planToRows(plan, chapterText) : []), [plan, chapterText, planToRows]);
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

  // Adjust selection when filtered rows change
  useEffect(() => {
    setSelIndex((i) => clamp(i, 0, Math.max(0, filteredRows.length - 1)));
  }, [filteredRows.length]);

  const current = filteredRows[selIndex];

  // Auto-scroll to selected row
  useEffect(() => {
    const rowEl = gridRef.current?.querySelector(`[data-row='${selIndex}']`) as HTMLElement | null;
    rowEl?.scrollIntoView({ block: "nearest" });
  }, [selIndex, filteredRows.length]);

  // Load existing plan if available
  useEffect(() => {
    if (!root) return;
    
    const loadExistingPlan = async () => {
      try {
        setMessage("Loading existing plan...");
        const planData = await window.khipu!.call("fs:read", {
          projectRoot: root,
          relPath: rel.planJson,
          json: true
        });
        
        if (planData) {
          setPlan(planData as ChapterPlan);
          setMessage("Plan loaded successfully!");
          
          // Try to load chapter text
          try {
            const textData = await window.khipu!.call("fs:read", {
              projectRoot: root,
              relPath: rel.chapterTxt,
              json: false
            }) as string;
            setChapterText(textData || "");
          } catch (e) {
            console.warn("Could not load chapter text:", e);
          }
        } else {
          setMessage("No existing plan found. Generate a new one.");
        }
      } catch (error) {
        console.warn("Failed to load existing plan:", error);
        setMessage("No existing plan found. Generate a new one.");
      }
    };
    
    loadExistingPlan();
  }, [root]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setSelIndex(i => Math.max(0, i - 1));
      } else if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setSelIndex(i => Math.min(filteredRows.length - 1, i + 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredRows.length]);

  // Update voice assignment
  const updateRowVoice = (i: number, voice: string) => {
    const row = filteredRows[i];
    if (!row || !plan) return;
    
    // Find the chunk and update the voice
    const newPlan = { ...plan };
    const chunk = newPlan.chunks[row.chunkIndex];
    
    if (row.lineIndex >= 0 && chunk.lines) {
      // Update line-level voice
      chunk.lines[row.lineIndex] = { ...chunk.lines[row.lineIndex], voice };
    } else {
      // Update chunk-level voice
      chunk.voice = voice;
    }
    
    setPlan(newPlan);
  };

  // Generate initial plan using existing build system
  const generatePlan = async () => {
    if (!root) return;
    
    setLoading(true);
    setRunning(true);
    setMessage("Generating plan from chapters...");
    
    try {
      const payload: PlanBuildPayload = {
        projectRoot: root,
        chapterId: rel.chapterId,
        infile: rel.chapterTxt,
        out: rel.planJson,
        opts: { dossier: rel.dossier, "llm-attribution": "off", "max-kb": caps.maxKB },
      };
      
      await window.khipu!.call("plan:build", payload);
    } catch (error) {
      console.error("Failed to generate plan:", error);
      setMessage("Failed to generate plan. Check console for details.");
      setLoading(false);
      setRunning(false);
    }
  };

  // Save plan
  const savePlan = async () => {
    if (!plan || !root) return;
    
    setLoading(true);
    try {
      await window.khipu!.call("fs:write", {
        projectRoot: root,
        relPath: rel.planJson,
        json: true,
        content: plan
      });
      setMessage("Plan saved successfully!");
    } catch (error) {
      console.error("Failed to save plan:", error);
      setMessage("Failed to save plan.");
    } finally {
      setLoading(false);
    }
  };

  // Mark planning complete
  const handleMarkComplete = async () => {
    if (!root || !projectConfig) return;
    
    try {
      const updatedConfig = {
        ...projectConfig,
        workflow: {
          ...projectConfig.workflow,
          planning: {
            ...projectConfig.workflow?.planning,
            complete: true,
            completedAt: new Date().toISOString()
          }
        }
      };
      
      await window.khipu!.call("fs:write", { 
        projectRoot: root, 
        relPath: "project.khipu.json", 
        json: true, 
        content: updatedConfig 
      });
      
      setProjectConfig(updatedConfig);
      
      // Update the project store
      const { markStepCompleted } = useProject.getState();
      markStepCompleted("planning");
      
      onStatus("Planning page marked as complete");
    } catch (error) {
      console.error("Failed to mark planning as complete:", error);
    }
  };

  const isComplete = projectConfig?.workflow?.planning?.complete || false;

  if (!root) {
    return (
      <div style={{ padding: "16px", maxWidth: "1200px" }}>
        <div style={{ textAlign: "center", padding: "64px 0", backgroundColor: "var(--panel)", borderRadius: "8px", border: "1px dashed var(--border)" }}>
          <p style={{ color: "var(--text)", fontSize: "18px", marginBottom: "8px" }}>No project loaded</p>
          <p style={{ color: "var(--muted)", fontSize: "14px" }}>Please load a project first to manage planning.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", maxWidth: "1400px", height: "calc(100vh - 32px)" }}>
      <h1 style={{ fontSize: "32px", fontWeight: "bold", color: "var(--text)", marginBottom: "8px" }}>Planning</h1>
      <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "24px" }}>TTS-compliant chunk breakdown and character voice assignment.</p>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", alignItems: "center" }}>
        <button 
          onClick={generatePlan} 
          disabled={loading || running} 
          style={{ padding: "6px 12px", fontSize: "14px" }}
        >
          {running ? t("plan.generating") : t("plan.regen")}
        </button>
        
        {plan && (
          <>
            <button 
              onClick={savePlan} 
              disabled={loading} 
              style={{ padding: "6px 12px", fontSize: "14px" }}
            >
              Save Plan
            </button>
            
            <button 
              onClick={handleMarkComplete}
              disabled={loading || isComplete} 
              style={{ 
                padding: "6px 12px", 
                fontSize: "14px",
                backgroundColor: isComplete ? "var(--success)" : "var(--success)",
                color: "white",
                border: `1px solid var(--success)`,
                borderRadius: "4px",
                opacity: isComplete ? 0.7 : 1
              }}
            >
              {isComplete ? "✓ Completed" : "Mark Complete"}
            </button>
          </>
        )}
      </div>

      {/* Status message */}
      {message && (
        <div style={{
          marginBottom: "16px",
          padding: "12px",
          borderRadius: "6px",
          fontSize: "14px",
          backgroundColor: "var(--panelAccent)",
          border: "1px solid var(--border)",
          color: "var(--text)"
        }}>
          {message}
        </div>
      )}

      {plan ? (
        <div style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "calc(100% - 200px)", gap: "16px" }}>
          {/* Filters */}
          <div style={{ display: "flex", gap: "12px", alignItems: "center", padding: "12px", backgroundColor: "var(--panel)", borderRadius: "6px", border: "1px solid var(--border)" }}>
            <label style={{ fontSize: "14px", color: "var(--text)" }}>Chunk:</label>
            <select 
              value={chunkFilter} 
              onChange={(e) => setChunkFilter(e.target.value)}
              style={{ padding: "4px 8px", fontSize: "14px", backgroundColor: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "4px" }}
            >
              {chunkIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
            
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "var(--text)" }}>
              <input 
                type="checkbox" 
                checked={onlyUnknown} 
                onChange={(e) => setOnlyUnknown(e.target.checked)} 
              />
              only unknowns
            </label>
            
            <input 
              placeholder="Search snippet…" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              style={{ 
                padding: "4px 8px", 
                fontSize: "14px", 
                width: "200px",
                backgroundColor: "var(--panel)", 
                color: "var(--text)", 
                border: "1px solid var(--border)", 
                borderRadius: "4px" 
              }}
            />

            {/* Stats for current chunk */}
            {plan && current && (() => {
              const cIdx = plan.chunks.findIndex((c) => cidOf(c) === current.chunkId);
              if (cIdx >= 0) {
                const st = chunkStats(plan.chunks[cIdx], chapterText, caps);
                const color = statColor(st, caps);
                return (
                  <div style={{ marginLeft: "auto", fontSize: "12px", color: color }}>
                    ~{st.kb}KB · {st.minutes.toFixed(2)}min
                  </div>
                );
              }
              return null;
            })()}
          </div>

          {/* Main content grid */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px", minHeight: 0 }}>
            {/* Left: Table */}
            <div style={{ border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "8px 12px", backgroundColor: "var(--panelAccent)", borderBottom: "1px solid var(--border)", fontSize: "14px", fontWeight: 500 }}>
                Chunks & Voice Assignment
              </div>
              
              <div ref={gridRef} style={{ flex: 1, overflow: "auto" }}>
                <table style={{ width: "100%", fontSize: "12px" }}>
                  <thead style={{ position: "sticky", top: 0, backgroundColor: "var(--panel)", borderBottom: "1px solid var(--border)" }}>
                    <tr style={{ textAlign: "left" }}>
                      <th style={{ padding: "8px 6px" }}></th>
                      <th style={{ padding: "8px 6px" }}>chunk</th>
                      <th style={{ padding: "8px 6px" }}>line</th>
                      <th style={{ padding: "8px 6px" }}>start</th>
                      <th style={{ padding: "8px 6px" }}>end</th>
                      <th style={{ padding: "8px 6px" }}>len</th>
                      <th style={{ padding: "8px 6px", width: "120px" }}>voice</th>
                      <th style={{ padding: "8px 6px" }}>snippet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r, i) => (
                      <tr 
                        key={r.rowKey} 
                        data-row={i}
                        onClick={() => setSelIndex(i)}
                        style={{
                          cursor: "pointer",
                          backgroundColor: i === selIndex ? "var(--accent)" : "transparent",
                          color: i === selIndex ? "white" : "var(--text)"
                        }}
                      >
                        <td style={{ padding: "4px 6px", color: "var(--muted)" }}>{i === selIndex ? "▶" : ""}</td>
                        <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>{r.chunkId}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right" }}>{r.lineIndex >= 0 ? r.lineIndex : "—"}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right" }}>{r.start}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right" }}>{r.end}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right" }}>{r.length}</td>
                        <td style={{ padding: "4px 6px" }}>
                          <select 
                            value={r.voice}
                            onChange={(e) => updateRowVoice(i, e.target.value)}
                            style={{ 
                              width: "100%", 
                              padding: "2px 4px", 
                              fontSize: "11px",
                              backgroundColor: "var(--panel)", 
                              color: "var(--text)", 
                              border: "1px solid var(--border)", 
                              borderRadius: "3px" 
                            }}
                          >
                            <option value="">Select...</option>
                            {availableCharacters.map((char) => (
                              <option key={char} value={char}>{char}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: "4px 6px", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.snippet}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right: Preview */}
            <div style={{ border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "8px 12px", backgroundColor: "var(--panelAccent)", borderBottom: "1px solid var(--border)", fontSize: "14px", fontWeight: 500 }}>
                Preview
              </div>
              
              <div style={{ flex: 1, padding: "12px", overflow: "auto" }}>
                {current ? (
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px" }}>
                      Chunk: {current.chunkId} | Line: {current.lineIndex >= 0 ? current.lineIndex : "chunk-level"} | Voice: {current.voice || "unassigned"}
                    </div>
                    <div style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--text)" }}>
                      {chapterText.slice(current.start, current.end + 1)}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: "var(--muted)", fontStyle: "italic" }}>
                    Select a row to preview content
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "64px 0", backgroundColor: "var(--panel)", borderRadius: "8px", border: "1px dashed var(--border)" }}>
          <p style={{ color: "var(--text)", fontSize: "18px", marginBottom: "8px" }}>No plan generated yet</p>
          <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "16px" }}>Generate a plan to break down chapters into TTS-compliant chunks.</p>
        </div>
      )}
    </div>
  );
}
