import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import type { PlanChunk } from "../types/plan";

interface Chapter {
  id: string;
  title?: string;
  relPath: string;
}

interface ChapterStatus {
  hasText: boolean;
  hasPlan: boolean;
  isComplete: boolean; // This tracks if orchestration is complete
  isAudioComplete: boolean; // This tracks if audio generation is complete
}

interface AudioSegmentRow {
  rowKey: string;
  chunkId: string;
  text: string;
  voice: string;
  locked: boolean;
  sfxAfter: string | null;
  hasAudio: boolean;
  audioPath?: string;
  start_char?: number;
  end_char?: number;
}

export default function AudioProductionPage({ onStatus }: { onStatus: (s: string) => void }) {
  const { t } = useTranslation();
  const { root } = useProject();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterStatus, setChapterStatus] = useState<Map<string, ChapterStatus>>(new Map());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [selectedChapter, setSelectedChapter] = useState<string>("");
  const [audioSegments, setAudioSegments] = useState<AudioSegmentRow[]>([]);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(0);
  const [generatingAudio, setGeneratingAudio] = useState<Set<string>>(new Set());
  const gridRef = useRef<HTMLDivElement | null>(null);

  // Available sound effects (this could be loaded from assets/sfx folder)
  const availableSfx = useMemo(() => [
    "",  // No SFX
    "pause_short.wav",
    "pause_long.wav", 
    "chapter_break.wav",
    "scene_transition.wav",
    "dramatic_pause.wav"
  ], []);

  const checkChapterStatus = useCallback(async (chapterId: string): Promise<ChapterStatus> => {
    if (!root) {
      return { hasText: false, hasPlan: false, isComplete: false, isAudioComplete: false };
    }
    
    console.log(`Checking status for chapter: ${chapterId}`);
    
    // Check if chapter text exists
    let hasText = false;
    const textPath = `analysis/chapters_txt/${chapterId}.txt`;
    
    try {
      const textData = await window.khipu!.call("fs:read", {
        projectRoot: root,
        relPath: textPath,
        json: false
      });
      hasText = textData !== null && textData !== undefined;
      console.log(`  Text exists: ${hasText} (${textPath})`);
    } catch (error) {
      console.log(`  Text file check failed: ${textPath}`, error);
    }
    
    // Check if plan exists - this is the key requirement
    let hasPlan = false;
    const planPath = `ssml/plans/${chapterId}.plan.json`;
    
    try {
      const planDataCheck = await window.khipu!.call("fs:read", {
        projectRoot: root,
        relPath: planPath,
        json: true
      });
      hasPlan = planDataCheck !== null && planDataCheck !== undefined;
      console.log(`  Plan exists: ${hasPlan} (${planPath})`, planDataCheck ? 'Data found' : 'No data');
    } catch (error) {
      console.log(`  Plan file check failed: ${planPath}`, error);
    }
    
    // Check if orchestration is complete for this chapter
    let isComplete = false;
    const completionPath = `ssml/plans/${chapterId}.complete`;
    try {
      const completionData = await window.khipu!.call("fs:read", {
        projectRoot: root,
        relPath: completionPath,
        json: true
      }) as { complete?: boolean; completedAt?: string } | null;
      isComplete = completionData?.complete === true;
      console.log(`  Orchestration complete: ${isComplete} (${completionPath})`);
    } catch (error) {
      console.log(`  Completion check failed: ${completionPath}`, error);
    }
    
    // Check if audio production is complete
    let isAudioComplete = false;
    const audioCompletionPath = `audio/${chapterId}.complete`;
    try {
      const audioCompletionData = await window.khipu!.call("fs:read", {
        projectRoot: root,
        relPath: audioCompletionPath,
        json: true
      }) as { complete?: boolean; completedAt?: string } | null;
      isAudioComplete = audioCompletionData?.complete === true;
      console.log(`  Audio complete: ${isAudioComplete} (${audioCompletionPath})`);
    } catch (error) {
      console.log(`  Audio completion check failed: ${audioCompletionPath}`, error);
    }
    
    const status = { hasText, hasPlan, isComplete, isAudioComplete };
    console.log(`Chapter ${chapterId} status:`, status);
    return status;
  }, [root]);

  const loadPlanData = useCallback(async (chapterId: string) => {
    if (!root || !chapterId) {
      setAudioSegments([]);
      return;
    }

    try {
      setMessage("Loading plan data...");
      const planPath = `ssml/plans/${chapterId}.plan.json`;
      console.log("Loading plan from:", planPath);
      
      const planData = await window.khipu!.call("fs:read", {
        projectRoot: root,
        relPath: planPath,
        json: true
      });

      console.log("Loaded plan file:", planData);
      console.log("Plan data type:", typeof planData);
      console.log("Is plan data an array?:", Array.isArray(planData));
      if (typeof planData === 'object' && planData !== null) {
        console.log("Plan data keys:", Object.keys(planData));
      }

      if (!planData) {
        console.warn("Plan file is null or undefined");
        setMessage("No plan data found");
        return;
      }

      // Handle both formats: direct array or object with chunks property
      let chunks: PlanChunk[];
      if (Array.isArray(planData)) {
        console.log("Plan data is direct array format, length:", planData.length);
        chunks = planData;
      } else if (planData.chunks && Array.isArray(planData.chunks)) {
        console.log("Plan data has chunks property, length:", planData.chunks.length);
        chunks = planData.chunks;
      } else {
        console.warn("Plan file has no valid chunks data:", planData);
        setMessage("Invalid plan data - no chunks found");
        return;
      }

      console.log("Plan chunks found:", chunks.length);

      // Convert plan chunks to audio segment rows
      const segments: AudioSegmentRow[] = chunks.map((chunk, index) => {
        const audioPath = `audio/${chapterId}/${chunk.id}.wav`;
        return {
          rowKey: `${chapterId}_${chunk.id}_${index}`,
          chunkId: chunk.id,
          text: chunk.text,
          voice: chunk.voice || "",
          locked: chunk.locked,
          sfxAfter: chunk.sfxAfter || null,
          hasAudio: false, // Will be checked separately
          audioPath,
          start_char: chunk.start_char,
          end_char: chunk.end_char
        };
      });

      console.log("Generated segments:", segments.length);
      setAudioSegments(segments);
      
      // For now, just set all segments as not having audio
      // In a real implementation, you'd check individual audio files here
      
      setMessage("");
    } catch (error) {
      console.error("Failed to load plan data:", error);
      setMessage(`Failed to load plan data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [root]);

  const loadChapters = useCallback(async () => {
    if (!root) return;
    
    try {
      setLoading(true);
      setMessage("Loading chapters...");
      onStatus("Loading chapters...");
      
      const chapterList = await window.khipu!.call("chapters:list", { projectRoot: root });
      
      if (chapterList) {
        setChapters(chapterList);
        
        // Check status for each chapter
        const statusMap = new Map<string, ChapterStatus>();
        for (const chapter of chapterList) {
          const status = await checkChapterStatus(chapter.id);
          statusMap.set(chapter.id, status);
        }
        setChapterStatus(statusMap);
        setMessage("");
        onStatus("");
      }
    } catch (error) {
      console.error("Failed to load chapters:", error);
      setMessage("Failed to load chapters");
      onStatus("");
    } finally {
      setLoading(false);
    }
  }, [root, checkChapterStatus, onStatus]);

  const handleChapterSelect = useCallback(async (chapterId: string) => {
    setSelectedChapter(chapterId);
    if (chapterId) {
      await loadPlanData(chapterId);
    }
  }, [loadPlanData]);

  const handleSfxChange = useCallback((rowIndex: number, sfx: string) => {
    setAudioSegments(prev => {
      const updated = [...prev];
      updated[rowIndex] = { ...updated[rowIndex], sfxAfter: sfx || null };
      return updated;
    });
    // TODO: Save changes back to plan file
  }, []);

  const handleGenerateSegmentAudio = useCallback(async (rowIndex: number) => {
    const segment = audioSegments[rowIndex];
    if (!segment || !selectedChapter || generatingAudio.has(segment.chunkId)) return;

    setGeneratingAudio(prev => new Set(prev).add(segment.chunkId));
    
    try {
      setMessage(`Generating audio for segment ${segment.chunkId}...`);
      
      // TODO: Call audio generation API
      // await window.khipu!.call("audio:generate", {
      //   projectRoot: root,
      //   chapterId: selectedChapter,
      //   chunkId: segment.chunkId,
      //   text: segment.text,
      //   voice: segment.voice,
      //   sfx: segment.sfxAfter
      // });
      
      // For now, simulate generation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update segment to show it has audio
      setAudioSegments(prev => {
        const updated = [...prev];
        updated[rowIndex] = { ...updated[rowIndex], hasAudio: true };
        return updated;
      });
      
      setMessage(`Audio generated for segment ${segment.chunkId}`);
    } catch (error) {
      console.error("Failed to generate audio:", error);
      setMessage(`Failed to generate audio for segment ${segment.chunkId}`);
    } finally {
      setGeneratingAudio(prev => {
        const next = new Set(prev);
        next.delete(segment.chunkId);
        return next;
      });
    }
  }, [audioSegments, selectedChapter, generatingAudio]);

  const handleGenerateChapterAudio = useCallback(async () => {
    if (!selectedChapter || audioSegments.length === 0) return;

    setMessage("Generating audio for entire chapter...");
    
    for (let i = 0; i < audioSegments.length; i++) {
      if (!audioSegments[i].hasAudio) {
        await handleGenerateSegmentAudio(i);
      }
    }
    
    setMessage("Chapter audio generation complete!");
  }, [selectedChapter, audioSegments, handleGenerateSegmentAudio]);

  useEffect(() => {
    loadChapters();
  }, [loadChapters]);

  // Filter chapters that are ready for audio production
  const chaptersWithPlans = useMemo(() => {
    return chapters.filter(chapter => {
      const status = chapterStatus.get(chapter.id);
      return status?.hasPlan;
    });
  }, [chapters, chapterStatus]);

  const chaptersReadyForProduction = useMemo(() => {
    return chapters.filter(chapter => {
      const status = chapterStatus.get(chapter.id);
      return status?.isComplete; // Orchestration is complete
    });
  }, [chapters, chapterStatus]);

  const completedAudioChapters = useMemo(() => {
    return chapters.filter(chapter => {
      const status = chapterStatus.get(chapter.id);
      return status?.isAudioComplete;
    });
  }, [chapters, chapterStatus]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "64px 0" }}>
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", height: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: "24px", color: "var(--text)" }}>
          {t("audioProduction.title", "Audio Production")}
        </h2>
      </div>

      {/* Status message */}
      {message && (
        <div style={{ 
          marginBottom: "16px", 
          padding: "12px", 
          backgroundColor: message.includes("Failed") || message.includes("Error") ? "var(--errorBg)" : "var(--panelAccent)",
          borderRadius: "6px",
          color: "var(--text)"
        }}>
          {message}
        </div>
      )}

      {/* Chapter Selection */}
      <div style={{ marginBottom: "16px", padding: "16px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "6px" }}>
        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: 500, color: "var(--text)" }}>
            {t("audioProduction.selectChapter", "Select Chapter")}:
          </label>
          <select
            value={selectedChapter}
            onChange={(e) => handleChapterSelect(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: "14px",
              backgroundColor: "var(--input)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
              backgroundPosition: "right 8px center",
              backgroundRepeat: "no-repeat",
              backgroundSize: "16px",
              paddingRight: "40px"
            }}
          >
            <option value="" style={{ backgroundColor: "var(--panel)", color: "var(--text)" }}>
              {t("audioProduction.chooseChapter", "Choose a chapter...")}
            </option>
            {chaptersWithPlans.map(chapter => {
              const status = chapterStatus.get(chapter.id);
              return (
                <option 
                  key={chapter.id} 
                  value={chapter.id}
                  style={{ 
                    backgroundColor: "var(--panel)", 
                    color: status?.isComplete ? "var(--accent)" : "var(--text)" 
                  }}
                >
                  {chapter.id} {status?.isComplete ? "✓" : status?.hasPlan ? "⚙" : ""}
                </option>
              );
            })}
          </select>
        </div>
        
        {/* Chapter Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", fontSize: "12px" }}>
          <div style={{ textAlign: "center", padding: "8px", backgroundColor: "var(--background)", borderRadius: "4px" }}>
            <div style={{ fontSize: "18px", fontWeight: "bold", color: "var(--muted)" }}>{chaptersWithPlans.length}</div>
            <div style={{ color: "var(--muted)" }}>{t("audioProduction.withPlans", "With Plans")}</div>
          </div>
          <div style={{ textAlign: "center", padding: "8px", backgroundColor: "var(--background)", borderRadius: "4px" }}>
            <div style={{ fontSize: "18px", fontWeight: "bold", color: "var(--accent)" }}>{chaptersReadyForProduction.length}</div>
            <div style={{ color: "var(--accent)" }}>{t("audioProduction.readyForProduction", "Ready for Production")}</div>
          </div>
          <div style={{ textAlign: "center", padding: "8px", backgroundColor: "var(--background)", borderRadius: "4px" }}>
            <div style={{ fontSize: "18px", fontWeight: "bold", color: "var(--success)" }}>{completedAudioChapters.length}</div>
            <div style={{ color: "var(--success)" }}>{t("audioProduction.audioComplete", "Audio Complete")}</div>
          </div>
        </div>
      </div>

      {/* Segment Grid */}
      {selectedChapter && audioSegments.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div style={{ marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "16px", color: "var(--text)" }}>
              {t("audioProduction.segments", "Audio Segments")} - {selectedChapter}
            </h3>
            <button
              onClick={handleGenerateChapterAudio}
              disabled={audioSegments.every(s => s.hasAudio)}
              style={{
                padding: "8px 16px",
                fontSize: "14px",
                backgroundColor: "var(--accent)",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                opacity: audioSegments.every(s => s.hasAudio) ? 0.5 : 1
              }}
            >
              {t("audioProduction.generateChapter", "Generate Full Chapter")}
            </button>
          </div>
          
          <div ref={gridRef} style={{ flex: 1, overflow: "auto", border: "1px solid var(--border)", borderRadius: "6px" }}>
            <table style={{ width: "100%", fontSize: "12px" }}>
              <thead style={{ position: "sticky", top: 0, backgroundColor: "var(--panel)", borderBottom: "1px solid var(--border)" }}>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ padding: "8px 6px" }}></th>
                  <th style={{ padding: "8px 6px" }}>ID</th>
                  <th style={{ padding: "8px 6px" }}>Voice</th>
                  <th style={{ padding: "8px 6px", width: "40%" }}>Text</th>
                  <th style={{ padding: "8px 6px" }}>SFX After</th>
                  <th style={{ padding: "8px 6px" }}>Status</th>
                  <th style={{ padding: "8px 6px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {audioSegments.map((segment, index) => (
                  <tr 
                    key={segment.rowKey}
                    data-row={index}
                    onClick={() => setSelectedRowIndex(index)}
                    style={{
                      cursor: "pointer",
                      backgroundColor: index === selectedRowIndex ? "var(--accent)" : "transparent",
                      color: index === selectedRowIndex ? "white" : "var(--text)"
                    }}
                  >
                    <td style={{ padding: "4px 6px", color: "var(--muted)" }}>
                      {index === selectedRowIndex ? "▶" : ""}
                    </td>
                    <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>
                      {segment.chunkId}
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      {segment.voice || "—"}
                    </td>
                    <td style={{ padding: "4px 6px", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {segment.text}
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      <select
                        value={segment.sfxAfter || ""}
                        onChange={(e) => handleSfxChange(index, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
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
                        <option value="">None</option>
                        {availableSfx.slice(1).map(sfx => (
                          <option key={sfx} value={sfx}>{sfx}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>
                      {segment.hasAudio ? (
                        <span style={{ color: "var(--success)" }}>✓</span>
                      ) : generatingAudio.has(segment.chunkId) ? (
                        <span style={{ color: "var(--accent)" }}>⏳</span>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGenerateSegmentAudio(index);
                        }}
                        disabled={generatingAudio.has(segment.chunkId)}
                        style={{
                          padding: "4px 8px",
                          fontSize: "11px",
                          backgroundColor: segment.hasAudio ? "var(--success)" : "var(--accent)",
                          color: "white",
                          border: "none",
                          borderRadius: "3px",
                          cursor: "pointer",
                          opacity: generatingAudio.has(segment.chunkId) ? 0.5 : 1
                        }}
                      >
                        {segment.hasAudio ? "Regenerate" : "Generate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : selectedChapter ? (
        <div style={{ textAlign: "center", padding: "64px 0", backgroundColor: "var(--panel)", borderRadius: "8px", border: "1px dashed var(--border)" }}>
          <p style={{ color: "var(--text)", fontSize: "18px", marginBottom: "8px" }}>No plan data for {selectedChapter}</p>
          <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "16px" }}>
            Complete orchestration for this chapter first.
          </p>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "64px 0", backgroundColor: "var(--panel)", borderRadius: "8px", border: "1px dashed var(--border)" }}>
          <p style={{ color: "var(--text)", fontSize: "18px", marginBottom: "8px" }}>Select a chapter to begin</p>
          <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "16px" }}>
            Choose a chapter with completed orchestration to generate audio.
          </p>
        </div>
      )}
    </div>
  );
}
