import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { loadProjectConfig } from "../lib/config";
import type { ProjectConfig } from "../types/config";
import type { Segment, PlanRow, AzureCaps } from "../types/plan";
import type { JobEvent, PlanBuildPayload } from "../global";


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

interface Chapter {
  id: string;
  title?: string;
  relPath: string;
}

interface ChapterStatus {
  hasText: boolean;
  hasPlan: boolean;
  isComplete: boolean;
}

export default function PlanningPage({ onStatus }: { onStatus: (s: string) => void }) {
  const { t } = useTranslation();
  const { root } = useProject();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<string>("");
  const [chapterStatus, setChapterStatus] = useState<Map<string, ChapterStatus>>(new Map());
  const [segments, setSegments] = useState<Segment[] | null>(null);

  const [availableCharacters, setAvailableCharacters] = useState<string[]>([]);
  const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [planProgress, setPlanProgress] = useState<{current: number, total: number, stage: string} | null>(null);
  
  // Filters and selection for the current chapter plan
  const [onlyUnknown, setOnlyUnknown] = useState(false);
  const [chunkFilter, setChunkFilter] = useState<string>("(all)");
  const [search, setSearch] = useState("");
  const [selIndex, setSelIndex] = useState(0);
  
  // Caps settings
  const [caps] = useState<AzureCaps>(DEFAULT_CAPS);

  const gridRef = useRef<HTMLDivElement | null>(null);

  // Check status of a specific chapter
  const checkChapterStatus = useCallback(async (chapterId: string): Promise<ChapterStatus> => {
    console.log(`=== Checking status for chapter: ${chapterId} ===`);
    if (!root) {
      console.log(`No root directory set`);
      return { hasText: false, hasPlan: false, isComplete: false };
    }
    
    console.log(`Using project root: ${root}`);
    
    // Check if chapter text exists
    let hasText = false;
    const textPath = `analysis/chapters_txt/${chapterId}.txt`;
    console.log(`Chapter ${chapterId}: Checking text file at: ${root}/${textPath}`);
    
    try {
      const textData = await window.khipu!.call("fs:read", {
        projectRoot: root,
        relPath: textPath,
        json: false
      });
      hasText = textData !== null && textData !== undefined;
      console.log(`Chapter ${chapterId}: Text file result:`, { exists: hasText, dataLength: typeof textData === 'string' ? textData.length : 0 });
    } catch (error) {
      console.log(`Chapter ${chapterId}: Text file error:`, error);
    }
    
    // Check if plan exists
    let hasPlan = false;
    const planPath = `ssml/plans/${chapterId}.plan.json`;
    console.log(`Chapter ${chapterId}: Checking plan file at: ${root}/${planPath}`);
    
    try {
      const planData = await window.khipu!.call("fs:read", {
        projectRoot: root,
        relPath: planPath,
        json: true
      });
      hasPlan = planData !== null && planData !== undefined;
      console.log(`Chapter ${chapterId}: Plan file result:`, { exists: hasPlan, data: planData });
    } catch (error) {
      console.log(`Chapter ${chapterId}: Plan file error:`, error);
    }
    
    // A chapter is complete only if it has a plan AND has been saved/finalized
    // For now, we'll just set it to false - completion should be a manual step
    const isComplete = false; // TODO: Add proper completion tracking based on user action
    
    const result = { hasText, hasPlan, isComplete };
    console.log(`=== Chapter ${chapterId} final status:`, result, `===`);
    return result;
  }, [root]);

  // Load chapters from project
  const loadChapters = useCallback(async () => {
    if (!root) return;
    
    try {
      setMessage("Loading project chapters...");
      const chapterList = await window.khipu!.call("chapters:list", { projectRoot: root });
      
      if (chapterList && Array.isArray(chapterList)) {
        setChapters(chapterList);
        
        // Check status of each chapter
        const statusMap = new Map<string, ChapterStatus>();
        for (const chapter of chapterList) {
          const status = await checkChapterStatus(chapter.id);
          statusMap.set(chapter.id, status);
        }
        setChapterStatus(statusMap);
        
        // Auto-select first chapter if none selected
        if (!selectedChapter && chapterList.length > 0) {
          setSelectedChapter(chapterList[0].id);
        }
        
        setMessage(`Found ${chapterList.length} chapters. Select a chapter to work with.`);
      } else {
        setMessage("No chapters found in project. Please add chapter files first.");
      }
    } catch (error) {
      console.warn("Failed to load chapters:", error);
      setMessage("Failed to load chapters. Please check your project structure.");
    }
  }, [root, selectedChapter, checkChapterStatus]);

  // Load plan and text for selected chapter
  const loadChapterData = useCallback(async (chapterId: string) => {
    if (!root || !chapterId) return;
    
    try {
      setMessage(`Loading data for chapter ${chapterId}...`);
      
      // Load chapter plan
      try {
        const segData = await window.khipu!.call("fs:read", {
          projectRoot: root,
          relPath: `ssml/plans/${chapterId}.plan.json`,
          json: true
        });
        console.log(`📋 Loaded segments for ${chapterId}:`, segData);
        console.log(`🔍 SEGMENTS LOADED: ${Array.isArray(segData) ? segData.length : 0} segments`);
        if (Array.isArray(segData)) {
          segData.forEach((seg, idx) => {
            console.log(`🔍 SEGMENT #${idx + 1}: ID=${seg.segment_id}, range=[${seg.start_idx}:${seg.end_idx}], delim="${seg.delimiter}", text="${seg.text?.slice(0, 50)}${seg.text?.length > 50 ? '...' : ''}"`);
          });
        }
        setSegments(Array.isArray(segData) ? segData : null);
      } catch (error) {
        console.log(`📋 No segments found for ${chapterId}:`, error);
        setSegments(null);
      }
      

      
      setMessage(`Chapter ${chapterId} data loaded.`);
    } catch (error) {
      console.warn(`Failed to load chapter ${chapterId} data:`, error);
      setMessage(`Failed to load chapter ${chapterId} data.`);
    }
  }, [root]);

  // Job event handling for plan generation
  useEffect(() => {
    window.khipu?.onJob((data: JobEvent) => {
      if (data.event === "progress" && typeof data.pct === "number") {
        onStatus(t("status.progress", { pct: data.pct, note: data.note ?? "" }));
        // Always update plan progress when we have percentage data
        const current = Math.round(data.pct);
        setPlanProgress({
          current: current,
          total: 100,
          stage: data.note || "Processing"
        });
      } else if (data.event === "done") {
        onStatus(data.ok ? t("status.completed") : t("status.failed"));
        setRunning(false);
        setLoading(false);
        setPlanProgress(null);
        
        // If successful, reload the current chapter data and update status
        if (data.ok && selectedChapter) {
          loadChapterData(selectedChapter);
          // Refresh chapter status
          loadChapters();
        }
      }
    });
  }, [onStatus, t, selectedChapter, loadChapterData, loadChapters]);

  // Load chapters on mount
  useEffect(() => {
    loadChapters();
  }, [loadChapters]);

  // Load chapter data when selection changes
  useEffect(() => {
    if (selectedChapter) {
      loadChapterData(selectedChapter);
    }
  }, [selectedChapter, loadChapterData]);

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
          const allCharacters = ["narrador", "Narrador", "desconocido", ...names];
          // Remove duplicates while preserving order
          const uniqueCharacters = Array.from(new Set(allCharacters));
          setAvailableCharacters(uniqueCharacters);
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
  
  // No chunk IDs or stats in flat segment model

  // Convert plan to rows for table display
  const segmentsToRows = useCallback((segments: Segment[]): PlanRow[] => {
    if (!segments) return [];
    return segments.map((seg) => {
      const row = {
        rowKey: `${seg.segment_id}|${seg.start_idx}|${seg.end_idx}`,
        segmentId: seg.segment_id,
        start: seg.start_idx,
        end: seg.end_idx - 1,
        length: seg.end_idx - seg.start_idx,
        voice: seg.voice ?? "",
        delimiter: seg.delimiter,
      };
      
      console.log(`🔍 UI ROW #${seg.segment_id}: text="${(seg.text || '').slice(0, 50)}..."`);
      return row;
    });
  }, []);

  const rowsAll = useMemo(() => {
    if (!segments) return [];
    console.log(`🔍 CONVERTING ${segments.length} SEGMENTS TO UI ROWS`);
    const rows = segmentsToRows(segments);
    console.log(`🗂️ Generated ${rows.length} grid rows`);
    console.log(`🔍 FINAL UI ROWS:`, rows.map(r => `#${r.segmentId}[${r.start}:${r.end+1}]${r.delimiter}`).join(', '));
    return rows;
  }, [segments, segmentsToRows]);
  // Remove chunk filter for flat segments
  const chunkIds: string[] = ["(all)"];

  const filteredRows = useMemo(() => {
    console.log(`🔍 Filtering rows: rowsAll=${rowsAll.length}, onlyUnknown=${onlyUnknown}, chunkFilter=${chunkFilter}, search="${search}"`);
    
    let rs = rowsAll;
    console.log(`🔍 Starting with ${rs.length} rows`);
    
    if (onlyUnknown) {
      rs = rs.filter((r) => r.voice.toLowerCase() === "desconocido" || r.voice === "");
      console.log(`🔍 After onlyUnknown filter: ${rs.length} rows`);
    }
    
  // No chunk filter in flat segment model
    
    if (search.trim()) {
      const q = search.toLowerCase();
      rs = rs.filter((r) => {
        // Search in the original segment text
        const originalSegment = segments?.find(seg => seg.segment_id === r.segmentId);
        const segmentText = originalSegment?.text || "";
        return segmentText.toLowerCase().includes(q);
      });
      console.log(`🔍 After search "${q}": ${rs.length} rows`);
    }
    
    console.log(`🔍 Final filtered rows: ${rs.length}`);
    if (rs.length > 0) {
      console.log(`🔍 Sample row:`, rs[0]);
    }
    
    return rs;
  }, [rowsAll, onlyUnknown, chunkFilter, search, segments]);

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
    if (!row || !segments) return;
    // Find the segment by segmentId
    const idx = segments.findIndex(s => s.segment_id === row.segmentId);
    if (idx === -1) return;
    const newSegments = [...segments];
    newSegments[idx] = { ...newSegments[idx], voice };
    setSegments(newSegments);
  };

  // Generate plan for selected chapter only
  const generatePlan = async () => {
    if (!selectedChapter) {
      setMessage("Please select a chapter first.");
      return;
    }
    
    console.log("🎯 Generate plan clicked for chapter:", selectedChapter);
    
    // Check if window.khipu is available
    if (!window.khipu || !window.khipu.call) {
      console.error("❌ window.khipu is not available! Electron IPC not ready.");
      setMessage("IPC not available. Please ensure Electron is running.");
      return;
    }
    
    if (!root) {
      console.error("❌ No project root available! Cannot generate plan.");
      setMessage("No project loaded. Please open a project first.");
      return;
    }
    
    console.log("✅ All checks passed, starting plan generation for chapter:", selectedChapter);
    
    setLoading(true);
    setRunning(true);
    setMessage(`Generating plan for chapter ${selectedChapter}...`);
    
    // Show immediate progress feedback
    setPlanProgress({
      current: 0,
      total: 100,
      stage: "Starting plan generation..."
    });
    
    try {
      // Find the selected chapter data
      const chapter = chapters.find(ch => ch.id === selectedChapter);
      if (!chapter) {
        setMessage("Selected chapter not found.");
        setLoading(false);
        setRunning(false);
        setPlanProgress(null);
        return;
      }
      
      const payload: PlanBuildPayload = {
        projectRoot: root,
        chapterId: chapter.id,
        infile: chapter.relPath,
        out: `ssml/plans/${chapter.id}.plan.json`,
        opts: { 
          "max-kb": caps.maxKB 
        },
      };
      
      console.log(`🚀 Processing chapter: ${chapter.id}`);
      console.log(`🔍 PYTHON SOURCE FILE: ${chapter.relPath}`);
      console.log(`🔍 UI TEXT SOURCE: analysis/chapters_txt/${chapter.id}.txt`);
      console.log(`🔍 FILE MISMATCH DETECTED: Python uses "${chapter.relPath}" but UI loads "analysis/chapters_txt/${chapter.id}.txt"`);
      const result = await window.khipu.call("plan:build", payload);
      
      if (result === 0) {
        console.log(`✅ Chapter ${chapter.id} completed successfully`);
        setMessage(`Chapter ${selectedChapter} plan generated successfully!`);
        
        // Refresh chapter status and reload plan data
        const newStatus = await checkChapterStatus(selectedChapter);
        setChapterStatus(prev => new Map(prev).set(selectedChapter, newStatus));
        
        // Reload the plan data to display in grid
        await loadChapterData(selectedChapter);
      } else {
        console.error(`❌ Chapter ${chapter.id} failed with code: ${result}`);
        setMessage(`Failed to generate plan for chapter ${selectedChapter}. Error code: ${result}`);
      }
      
    } catch (error) {
      console.error("Failed to generate plan:", error);
      setMessage(`Failed to generate plan for chapter ${selectedChapter}. Check console for details.`);
    } finally {
      setLoading(false);
      setRunning(false);
      setPlanProgress(null);
    }
  };

  // Save plan for selected chapter
  const savePlan = async () => {
    if (!segments || !root || !selectedChapter) {
      setMessage("No plan or chapter selected to save.");
      return;
    }
    setLoading(true);
    try {
      await window.khipu!.call("fs:write", {
        projectRoot: root,
        relPath: `ssml/plans/${selectedChapter}.plan.json`,
        json: true,
        content: segments
      });
      setMessage(`Plan for chapter ${selectedChapter} saved successfully!`);
      // Update chapter status
      const status = await checkChapterStatus(selectedChapter);
      setChapterStatus(prev => new Map(prev).set(selectedChapter, status));
    } catch (error) {
      console.error("Failed to save plan:", error);
      setMessage(`Failed to save plan for chapter ${selectedChapter}.`);
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
      <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "24px" }}>TTS-compliant chunk breakdown and character voice assignment - work chapter by chapter.</p>

      {/* Status message */}
      {message && !running && (
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

      {/* Chapter selector */}
      <div style={{ marginBottom: "16px", padding: "16px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "6px" }}>
        <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <label style={{ fontSize: "14px", fontWeight: "500", color: "var(--text)" }}>
              Chapter:
            </label>
            <select
              value={selectedChapter}
              onChange={(e) => setSelectedChapter(e.target.value)}
              style={{
                padding: "8px 12px",
                fontSize: "14px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                backgroundColor: "var(--input)",
                color: "var(--text)",
                minWidth: "200px",
                cursor: "pointer",
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
                backgroundPosition: "right 8px center",
                backgroundRepeat: "no-repeat",
                backgroundSize: "16px",
                paddingRight: "32px"
              }}
            >
              <option value="" style={{ backgroundColor: "var(--panel)", color: "var(--text)" }}>
                Select a chapter...
              </option>
              {chapters.map((chapter) => {
                const status = chapterStatus.get(chapter.id);
                const statusIcon = status?.isComplete ? "✅" : status?.hasPlan ? "📝" : status?.hasText ? "📄" : "❌";
                return (
                  <option 
                    key={chapter.id} 
                    value={chapter.id}
                    style={{ 
                      backgroundColor: "var(--panel)", 
                      color: "var(--text)",
                      padding: "4px 8px"
                    }}
                  >
                    {statusIcon} {chapter.id} {chapter.title ? `- ${chapter.title}` : ""}
                  </option>
                );
              })}
            </select>
          </div>
          
          {selectedChapter && (
            <div style={{ fontSize: "12px", color: "var(--muted)" }}>
              {(() => {
                const status = chapterStatus.get(selectedChapter);
                if (!status) return "Loading status...";
                
                const parts = [];
                if (status.hasText) parts.push("✅ Text available");
                else parts.push("❌ No text file");
                
                if (status.hasPlan) parts.push("✅ Plan exists");
                else parts.push("❌ No plan");
                
                if (status.isComplete) parts.push("✅ Complete");
                else if (status.hasPlan) parts.push("⏳ In progress");
                else parts.push("⭕ Not started");
                
                return parts.join(" | ");
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", alignItems: "center" }}>
        <button 
          onClick={generatePlan} 
          disabled={loading || running || !selectedChapter} 
          style={{ padding: "6px 12px", fontSize: "14px" }}
        >
          {running ? "Generating..." : selectedChapter ? `Generate Plan for ${selectedChapter}` : "Select Chapter"}
        </button>
        
  {segments && selectedChapter && (
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
              disabled={loading || chapterStatus.get(selectedChapter)?.isComplete} 
              style={{ 
                padding: "6px 12px", 
                fontSize: "14px",
                backgroundColor: chapterStatus.get(selectedChapter)?.isComplete ? "var(--success)" : "var(--accent)",
                color: "white",
                border: `1px solid ${chapterStatus.get(selectedChapter)?.isComplete ? "var(--success)" : "var(--accent)"}`,
                borderRadius: "4px",
                opacity: chapterStatus.get(selectedChapter)?.isComplete ? 0.7 : 1
              }}
            >
              {chapterStatus.get(selectedChapter)?.isComplete ? "✓ Chapter Complete" : "Mark Chapter Complete"}
            </button>
          </>
        )}
      </div>

      {/* Loading section with progress */}
      {running && (
        <div style={{ 
          marginBottom: "16px", 
          padding: "16px", 
          backgroundColor: "var(--panelAccent)", 
          border: "1px solid var(--border)", 
          borderRadius: "6px", 
          fontSize: "14px" 
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{
              display: "inline-block",
              width: "16px",
              height: "16px",
              border: "2px solid var(--accent)",
              borderTop: "2px solid transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite"
            }}></div>
            <span style={{ color: "var(--text)" }}>Generating plan...</span>
          </div>
          {planProgress ? (
            <div style={{ marginTop: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text)", marginBottom: "6px" }}>
                <span style={{ fontWeight: "500" }}>{planProgress.stage}</span>
                <span style={{ 
                  backgroundColor: "var(--panelAccent)", 
                  padding: "2px 6px", 
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: "600"
                }}>
                  {planProgress.current}%
                </span>
              </div>
              <div style={{ width: "100%", backgroundColor: "var(--border)", borderRadius: "6px", height: "10px" }}>
                <div 
                  style={{ 
                    backgroundColor: "var(--accent)", 
                    height: "10px", 
                    borderRadius: "6px", 
                    transition: "width 0.5s ease-out",
                    width: `${Math.max(2, planProgress.current)}%`,
                    minWidth: "8px"
                  }}
                ></div>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text)", marginBottom: "6px" }}>
                <span style={{ fontWeight: "500" }}>Initializing plan generation...</span>
                <span style={{ 
                  backgroundColor: "var(--panelAccent)", 
                  padding: "2px 6px", 
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: "600"
                }}>
                  Starting...
                </span>
              </div>
              <div style={{ width: "100%", backgroundColor: "var(--border)", borderRadius: "6px", height: "10px" }}>
                <div 
                  style={{ 
                    backgroundColor: "var(--accent)", 
                    height: "10px", 
                    borderRadius: "6px", 
                    animation: "pulse 2s ease-in-out infinite",
                    width: "20%",
                    minWidth: "20px"
                  }}
                ></div>
              </div>
            </div>
          )}
          <div style={{ fontSize: "12px", color: "var(--accent)", marginTop: "4px" }}>This may take a moment while analyzing the text...</div>
        </div>
      )}

      {!selectedChapter ? (
        <div style={{ 
          textAlign: "center", 
          padding: "64px 32px", 
          backgroundColor: "var(--panel)", 
          borderRadius: "8px", 
          border: "1px dashed var(--border)" 
        }}>
          <p style={{ color: "var(--text)", fontSize: "18px", marginBottom: "8px" }}>Select a chapter to begin</p>
          <p style={{ color: "var(--muted)", fontSize: "14px" }}>Choose a chapter from the dropdown above to view or generate its plan.</p>
        </div>
  ) : segments ? (
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
              placeholder="Search text…" 
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
            {/* No chunk stats in flat segment model */}
          </div>

          {/* Main content grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", minHeight: 0 }}>
            {/* Left: Preview */}
            <div style={{ border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "8px 12px", backgroundColor: "var(--panelAccent)", borderBottom: "1px solid var(--border)", fontSize: "14px", fontWeight: 500 }}>
                Preview
              </div>
              
              <div style={{ flex: 1, padding: "12px", overflow: "auto" }}>
                {current ? (
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px" }}>
                      Segment: {current.segmentId} | Delimiter: {current.delimiter} | Voice: {current.voice || "unassigned"}
                    </div>
                    <div style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--text)", whiteSpace: "pre-wrap" }}>
                      {(() => {
                        // Find the original segment by ID to get the full text
                        const originalSegment = segments?.find(seg => seg.segment_id === current.segmentId);
                        return originalSegment?.text || "Segment text not found";
                      })()}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: "var(--muted)", fontStyle: "italic" }}>
                    Select a row to preview content
                  </div>
                )}
              </div>
            </div>

            {/* Right: Table */}
            <div style={{ border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "8px 12px", backgroundColor: "var(--panelAccent)", borderBottom: "1px solid var(--border)", fontSize: "14px", fontWeight: 500 }}>
                Chunks & Voice Assignment
              </div>
              
              <div ref={gridRef} style={{ flex: 1, overflow: "auto" }}>
                <table style={{ width: "100%", fontSize: "12px" }}>
                  <thead style={{ position: "sticky", top: 0, backgroundColor: "var(--panel)", borderBottom: "1px solid var(--border)" }}>
                    <tr style={{ textAlign: "left" }}>
                      <th style={{ padding: "8px 6px" }}></th>
                      <th style={{ padding: "8px 6px" }}>id</th>
                      <th style={{ padding: "8px 6px" }}>delim</th>
                      <th style={{ padding: "8px 6px" }}>start</th>
                      <th style={{ padding: "8px 6px" }}>end</th>
                      <th style={{ padding: "8px 6px" }}>len</th>
                      <th style={{ padding: "8px 6px", minWidth: "150px" }}>character</th>
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
                        <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>{r.segmentId}</td>
                        <td style={{ padding: "4px 6px", textAlign: "center" }}>{r.delimiter}</td>
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
                            {availableCharacters.map((char, index) => (
                              <option key={`${char}-${index}`} value={char}>{char}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>


          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "64px 0", backgroundColor: "var(--panel)", borderRadius: "8px", border: "1px dashed var(--border)" }}>
          <p style={{ color: "var(--text)", fontSize: "18px", marginBottom: "8px" }}>No plan for {selectedChapter}</p>
          <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "16px" }}>Click "Generate Plan for {selectedChapter}" to create TTS-compliant chunks with AI speaker detection.</p>
        </div>
      )}
    </div>
  );
}
