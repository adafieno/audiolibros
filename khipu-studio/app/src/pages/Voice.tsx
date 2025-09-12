import { useEffect, useState, useCallback } from "react";
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
  const [generatingAudio, setGeneratingAudio] = useState<Set<string>>(new Set());
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);

  // Helper function to get chapters that have plans
  const getChaptersWithPlans = useCallback(() => {
    return chapters.filter((chapter) => {
      const status = chapterStatus.get(chapter.id);
      return status && status.hasPlan;
    });
  }, [chapters, chapterStatus]);

  const checkChapterStatus = useCallback(async (chapterId: string): Promise<ChapterStatus> => {
    if (!root) {
      return { hasText: false, hasPlan: false, isComplete: false, isAudioComplete: false };
    }

    console.log(`Checking status for chapter: ${chapterId}`);

    // Check if text exists
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
        json: false
      });
      isComplete = completionData !== null;
      console.log(`  Orchestration complete: ${isComplete} (${completionPath})`);
    } catch (error) {
      console.log(`  Completion file check failed: ${completionPath}`, error);
    }
    
    // Check if audio is complete for this chapter
    let isAudioComplete = false;
    const audioCompletionPath = `audio/${chapterId}.complete`;
    try {
      const audioData = await window.khipu!.call("fs:read", {
        projectRoot: root,
        relPath: audioCompletionPath,
        json: false
      });
      isAudioComplete = audioData !== null;
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
      } else if (planData && typeof planData === 'object' && 'chunks' in planData && Array.isArray((planData as { chunks: unknown }).chunks)) {
        console.log("Plan data has chunks property, length:", ((planData as { chunks: unknown[] }).chunks).length);
        chunks = (planData as { chunks: PlanChunk[] }).chunks;
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
          sfxAfter: null, // Will be loaded if available
          hasAudio: false, // Will be checked
          audioPath,
          start_char: chunk.start_char,
          end_char: chunk.end_char
        };
      });

      setAudioSegments(segments);
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
    setSelectedRowIndex(0); // Automatically select first row when changing chapters
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

  const handleRowSelection = useCallback((index: number) => {
    setSelectedRowIndex(prev => prev === index ? -1 : index); // Toggle selection, -1 means none selected
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

  // Auto-select first chapter if available and load its data
  useEffect(() => {
    if (chapters.length > 0 && !selectedChapter) {
      // Find the first chapter that has a plan
      const chaptersWithPlans = getChaptersWithPlans();
      const firstChapterWithPlan = chaptersWithPlans[0];
      
      if (firstChapterWithPlan) {
        setSelectedChapter(firstChapterWithPlan.id);
        // Load the plan data for the first chapter with a plan
        loadPlanData(firstChapterWithPlan.id);
      }
    }
  }, [chapters, selectedChapter, chapterStatus, loadPlanData, getChaptersWithPlans]);

  // Auto-select first row when segments change (like Planning page)
  useEffect(() => {
    if (audioSegments.length > 0) {
      // Auto-select first row (index 0) when segments are loaded
      setSelectedRowIndex(0);
    } else {
      // No segments, no selection
      setSelectedRowIndex(-1);
    }
  }, [audioSegments.length]);

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
      <div style={{ marginBottom: "8px" }}>
        <h2 style={{ margin: 0, fontSize: "32px", fontWeight: "bold", color: "var(--text)" }}>
          Audio Production
        </h2>
      </div>
      
      {/* Subtitle */}
      <div style={{ marginBottom: "24px" }}>
        <p style={{ margin: 0, fontSize: "14px", color: "var(--textSecondary)" }}>
          Generate high-quality audio from orchestrated segments - work chapter by chapter. Only chapters with plans are available.
        </p>
      </div>

      {/* Chapter selector with integrated audio production progress */}
      <div style={{ marginBottom: "16px", padding: "16px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "6px" }}>
        <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <label style={{ fontSize: "14px", fontWeight: "500", color: "var(--text)" }}>
              Chapter:
            </label>
            <select
              value={selectedChapter}
              onChange={(e) => handleChapterSelect(e.target.value)}
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
                {t("audioProduction.selectChapter", "Select Chapter")}
              </option>
              {getChaptersWithPlans().map((chapter) => (
                <option 
                  key={chapter.id} 
                  value={chapter.id}
                  style={{ 
                    backgroundColor: "var(--panel)", 
                    color: "var(--text)",
                    padding: "4px 8px"
                  }}
                >
                  📝 {chapter.id} {chapter.title ? `- ${chapter.title}` : ""}
                </option>
              ))}
            </select>
          </div>
          
          {/* Audio Production Progress status */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {(() => {
              const audioCompleteCount = Array.from(chapterStatus.values()).filter(status => status.isAudioComplete).length;
              const totalChapters = chapters.length;
              const allComplete = totalChapters > 0 && audioCompleteCount === totalChapters;
              
              return (
                <span style={{ 
                  fontSize: "12px", 
                  fontWeight: "400",
                  color: allComplete ? "var(--success)" : "var(--muted)",
                  backgroundColor: allComplete ? "rgba(34, 197, 94, 0.1)" : "rgba(107, 114, 126, 0.1)",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  whiteSpace: "nowrap"
                }}>
                  {allComplete 
                    ? `✅ Audio Production Complete` 
                    : `${audioCompleteCount}/${totalChapters} chapters loaded`
                  }
                </span>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Action Buttons Toolbar - Separate from chapter selection */}
      {selectedChapter && (
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "12px",
          marginBottom: "24px",
          flexWrap: "wrap"
        }}>
          <button
            onClick={handleGenerateChapterAudio}
            disabled={audioSegments.length === 0}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 500,
              backgroundColor: "var(--success)",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: audioSegments.length > 0 ? "pointer" : "not-allowed",
              opacity: audioSegments.length > 0 ? 1 : 0.6
            }}
          >
            Generate Chapter Audio
          </button>
        </div>
      )}

      {/* Check if no chapters with plans are available */}
      {chapters.length > 0 && getChaptersWithPlans().length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "48px",
          color: "var(--textSecondary)",
          fontSize: "14px",
          backgroundColor: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "6px"
        }}>
          <p style={{ margin: "0 0 8px 0", fontWeight: 500 }}>No chapters with plans available</p>
          <p style={{ margin: 0 }}>Complete the orchestration step for at least one chapter to begin audio production.</p>
        </div>
      ) : null}

      {/* Segment Grid */}
      {selectedChapter && audioSegments.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div style={{ marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "16px", color: "var(--text)" }}>
              {t("audioProduction.segments", "Audio Segments")} - {selectedChapter}
            </h3>
          </div>
          
          <div style={{
            flex: 1,
            overflow: "auto",
            border: "1px solid var(--border)",
            borderRadius: "6px"
          }}>
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px"
            }}>
              <thead>
                <tr style={{ backgroundColor: "var(--panelAccent)" }}>
                  <th style={{ padding: "8px", textAlign: "left", color: "var(--text)", fontWeight: 500 }}></th>
                  <th style={{ padding: "8px", textAlign: "left", color: "var(--text)", fontWeight: 500 }}>ID</th>
                  <th style={{ padding: "8px", textAlign: "left", color: "var(--text)", fontWeight: 500 }}>Text Preview</th>
                  <th style={{ padding: "8px", textAlign: "left", color: "var(--text)", fontWeight: 500 }}>Voice</th>
                  <th style={{ padding: "8px", textAlign: "left", color: "var(--text)", fontWeight: 500 }}>SFX</th>
                  <th style={{ padding: "8px", textAlign: "left", color: "var(--text)", fontWeight: 500 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {audioSegments.map((segment, index) => (
                  <tr 
                    key={segment.rowKey} 
                    onClick={() => handleRowSelection(index)}
                    style={{ 
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                      backgroundColor: selectedRowIndex === index ? "var(--accent)" : "transparent",
                      color: selectedRowIndex === index ? "white" : "var(--text)"
                    }}
                  >
                    <td style={{ padding: "8px", color: "var(--muted)" }}>
                      {selectedRowIndex === index ? "▶" : ""}
                    </td>
                    <td style={{ padding: "8px", color: "inherit" }}>
                      {segment.chunkId}
                    </td>
                    <td style={{ padding: "8px", color: "inherit", maxWidth: "300px" }}>
                      <div style={{ 
                        overflow: "hidden", 
                        textOverflow: "ellipsis", 
                        whiteSpace: "nowrap" 
                      }}>
                        {segment.text}
                      </div>
                    </td>
                    <td style={{ padding: "8px", color: "inherit" }}>
                      {segment.voice}
                    </td>
                    <td style={{ padding: "8px" }}>
                      <select
                        value={segment.sfxAfter || ""}
                        onChange={(e) => handleSfxChange(index, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          padding: "4px 8px",
                          fontSize: "12px",
                          backgroundColor: "var(--input)",
                          color: "var(--text)",
                          border: "1px solid var(--border)",
                          borderRadius: "3px"
                        }}
                      >
                        <option value="">None</option>
                        <option value="pause_short">Short Pause</option>
                        <option value="pause_medium">Medium Pause</option>
                        <option value="pause_long">Long Pause</option>
                        <option value="page_turn">Page Turn</option>
                        <option value="chapter_break">Chapter Break</option>
                      </select>
                    </td>
                    <td style={{ padding: "8px" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGenerateSegmentAudio(index);
                        }}
                        style={{
                          padding: "4px 8px",
                          fontSize: "11px",
                          backgroundColor: "var(--accent)",
                          color: "white",
                          border: "none",
                          borderRadius: "3px",
                          cursor: "pointer"
                        }}
                      >
                        Generate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : selectedChapter ? (
        <div style={{
          textAlign: "center",
          padding: "48px",
          color: "var(--textSecondary)",
          fontSize: "14px"
        }}>
          {message || "No audio segments available for this chapter"}
        </div>
      ) : (
        <div style={{
          textAlign: "center",
          padding: "48px",
          color: "var(--textSecondary)",
          fontSize: "14px"
        }}>
          {t("audioProduction.selectChapterPrompt", "Select a chapter to begin audio production")}
        </div>
      )}
    </div>
  );
}
