import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { useAudioPreview } from "../hooks/useAudioPreview";
import { createDefaultProcessingChain } from "../lib/audio-production-utils";
import type { PlanChunk } from "../types/plan";
import type { AudioProcessingChain } from "../types/audio-production";

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

  // Audio preview functionality
  const audioPreview = useAudioPreview();
  const [processingChain, setProcessingChain] = useState<AudioProcessingChain>(() => createDefaultProcessingChain());

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

  // Audio preview handlers
  const handlePlaySegment = useCallback(async (segmentIndex?: number) => {
    const index = segmentIndex ?? selectedRowIndex;
    const segment = audioSegments[index];
    
    if (!segment || !segment.hasAudio) {
      setMessage("No audio available for this segment");
      return;
    }

    try {
      if (audioPreview.isPlaying && audioPreview.playbackState.segmentId === segment.chunkId) {
        // Pause if currently playing this segment
        await audioPreview.pause();
      } else {
        // Start playing this segment with current processing chain
        await audioPreview.preview(segment.chunkId, processingChain);
      }
    } catch (error) {
      console.error("Playback failed:", error);
      setMessage("Playback failed");
    }
  }, [selectedRowIndex, audioSegments, audioPreview, processingChain]);

  const handlePlayAll = useCallback(async () => {
    // For now, just play the first available segment
    // TODO: Implement playlist functionality
    const firstAvailableIndex = audioSegments.findIndex(seg => seg.hasAudio);
    if (firstAvailableIndex >= 0) {
      await handlePlaySegment(firstAvailableIndex);
    } else {
      setMessage("No audio segments available");
    }
  }, [audioSegments, handlePlaySegment]);

  const handleStopAudio = useCallback(async () => {
    try {
      await audioPreview.stop();
    } catch (error) {
      console.error("Stop failed:", error);
    }
  }, [audioPreview]);

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
    <div style={{ padding: "16px", height: "100%", display: "flex", flexDirection: "column" }}>
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

      {/* Main content grid - Two pane layout */}
      {selectedChapter && audioSegments.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "0.6fr 1.4fr", gap: "16px", flex: 1, minHeight: 0 }}>
          {/* Left: Audio Segments Grid */}
          <div style={{ border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "8px 12px", backgroundColor: "var(--panelAccent)", borderBottom: "1px solid var(--border)", fontSize: "14px", fontWeight: 500 }}>
              {t("audioProduction.segments", "Audio Segments")} - {selectedChapter}
            </div>
            
            <div style={{ flex: 1, overflow: "auto" }}>
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
                      <td style={{ padding: "8px", color: selectedRowIndex === index ? "white" : "var(--muted)" }}>
                        {selectedRowIndex === index ? "▶" : ""}
                      </td>
                      <td style={{ padding: "8px", color: "inherit" }}>
                        {segment.chunkId}
                      </td>
                      <td style={{ padding: "8px", color: "inherit", maxWidth: "250px" }}>
                        <div style={{ 
                          overflow: "hidden", 
                          textOverflow: "ellipsis", 
                          whiteSpace: "nowrap" 
                        }}>
                          {segment.text}
                        </div>
                      </td>
                      <td style={{ padding: "8px", color: "inherit", fontSize: "12px" }}>
                        {segment.voice}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Audio Production Module */}
          <div style={{ border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "8px 12px", backgroundColor: "var(--panelAccent)", borderBottom: "1px solid var(--border)", fontSize: "14px", fontWeight: 500 }}>
              Audio Production Module
            </div>
            
            <div style={{ flex: 1, padding: "12px", overflow: "auto" }}>
              {selectedRowIndex >= 0 && selectedRowIndex < audioSegments.length ? (
                (() => {
                  const currentSegment = audioSegments[selectedRowIndex];
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      {/* Segment Info */}
                      <div style={{ padding: "12px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "4px" }}>
                        <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", color: "var(--text)" }}>
                          Segment {currentSegment.chunkId}
                        </h4>
                        <p style={{ margin: "0 0 8px 0", fontSize: "12px", color: "var(--textSecondary)" }}>
                          Voice: {currentSegment.voice || "Not assigned"}
                        </p>
                        <div style={{ fontSize: "13px", color: "var(--text)", lineHeight: "1.4", padding: "8px", backgroundColor: "var(--input)", borderRadius: "3px" }}>
                          {currentSegment.text}
                        </div>
                      </div>

                      {/* Audio Production Toolbar */}
                      <div style={{ padding: "12px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "4px" }}>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {/* Generate Button */}
                          <button
                            onClick={() => handleGenerateSegmentAudio(selectedRowIndex)}
                            disabled={generatingAudio.has(currentSegment.chunkId)}
                            style={{
                              padding: "10px 16px",
                              fontSize: "13px",
                              fontWeight: 500,
                              backgroundColor: currentSegment.hasAudio ? "var(--success)" : "var(--accent)",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: generatingAudio.has(currentSegment.chunkId) ? "not-allowed" : "pointer",
                              opacity: generatingAudio.has(currentSegment.chunkId) ? 0.6 : 1,
                              display: "flex",
                              alignItems: "center",
                              gap: "6px"
                            }}
                          >
                            {generatingAudio.has(currentSegment.chunkId) 
                              ? "⏳ Generating..." 
                              : currentSegment.hasAudio 
                                ? "🔄 Regenerate" 
                                : "🎵 Generate"
                            }
                          </button>

                          {/* Play Single Segment */}
                          <button
                            onClick={() => handlePlaySegment(selectedRowIndex)}
                            disabled={!currentSegment.hasAudio || audioPreview.isLoading}
                            style={{
                              padding: "10px 16px",
                              fontSize: "13px",
                              fontWeight: 500,
                              backgroundColor: currentSegment.hasAudio ? 
                                (audioPreview.isPlaying && audioPreview.playbackState.segmentId === currentSegment.chunkId ? "var(--warning)" : "var(--accent)") 
                                : "var(--muted)",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: (currentSegment.hasAudio && !audioPreview.isLoading) ? "pointer" : "not-allowed",
                              opacity: (currentSegment.hasAudio && !audioPreview.isLoading) ? 1 : 0.5,
                              display: "flex",
                              alignItems: "center",
                              gap: "6px"
                            }}
                          >
                            {audioPreview.isLoading ? "⏳ Loading..." :
                             audioPreview.isPlaying && audioPreview.playbackState.segmentId === currentSegment.chunkId ? "⏸ Pause" :
                             "▶ Play"}
                          </button>

                          {/* Play All (Carousel) */}
                          <button
                            onClick={handlePlayAll}
                            disabled={!audioSegments.some(seg => seg.hasAudio) || audioPreview.isLoading}
                            style={{
                              padding: "10px 16px",
                              fontSize: "13px",
                              fontWeight: 500,
                              backgroundColor: audioSegments.some(seg => seg.hasAudio) ? "var(--accent)" : "var(--muted)",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: (audioSegments.some(seg => seg.hasAudio) && !audioPreview.isLoading) ? "pointer" : "not-allowed",
                              opacity: (audioSegments.some(seg => seg.hasAudio) && !audioPreview.isLoading) ? 1 : 0.5,
                              display: "flex",
                              alignItems: "center",
                              gap: "6px"
                            }}
                          >
                            🎬 Play All
                          </button>

                          {/* Stop/Pause Button */}
                          <button
                            onClick={handleStopAudio}
                            disabled={!audioPreview.isPlaying && !audioPreview.isLoading}
                            style={{
                              padding: "10px 16px",
                              fontSize: "13px",
                              fontWeight: 500,
                              backgroundColor: (audioPreview.isPlaying || audioPreview.isLoading) ? "var(--error)" : "var(--muted)",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: (audioPreview.isPlaying || audioPreview.isLoading) ? "pointer" : "not-allowed",
                              opacity: (audioPreview.isPlaying || audioPreview.isLoading) ? 1 : 0.5,
                              display: "flex",
                              alignItems: "center",
                              gap: "6px"
                            }}
                          >
                            ⏹ Stop
                          </button>
                        </div>

                        {/* Status Info */}
                        <div style={{ 
                          marginTop: "8px", 
                          padding: "6px 8px", 
                          fontSize: "11px", 
                          color: "var(--textSecondary)", 
                          backgroundColor: "var(--input)", 
                          borderRadius: "3px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px"
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>
                              Status: {currentSegment.hasAudio ? 
                                <span style={{ color: "var(--success)" }}>✓ Audio ready</span> : 
                                <span style={{ color: "var(--muted)" }}>No audio</span>
                              }
                            </span>
                            <span>
                              {audioSegments.filter(seg => seg.hasAudio).length}/{audioSegments.length} segments ready
                            </span>
                          </div>
                          
                          {/* Playback Status */}
                          {(audioPreview.isPlaying || audioPreview.error || audioPreview.isLoading) && (
                            <div style={{ 
                              display: "flex", 
                              justifyContent: "space-between", 
                              alignItems: "center",
                              paddingTop: "4px",
                              borderTop: "1px solid var(--border)"
                            }}>
                              <span>
                                {audioPreview.isLoading ? (
                                  <span style={{ color: "var(--warning)" }}>🔄 Processing audio...</span>
                                ) : audioPreview.error ? (
                                  <span style={{ color: "var(--error)" }}>❌ {audioPreview.error}</span>
                                ) : audioPreview.isPlaying ? (
                                  <span style={{ color: "var(--accent)" }}>🎵 Playing segment {audioPreview.playbackState.segmentId}</span>
                                ) : null}
                              </span>
                              
                              {audioPreview.isPlaying && audioPreview.duration > 0 && (
                                <span>
                                  {Math.floor(audioPreview.currentTime)}s / {Math.floor(audioPreview.duration)}s
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Audio Processing Chain */}
                      <div style={{ padding: "12px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "4px" }}>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "var(--text)" }}>
                          Audio Processing Chain
                        </h4>
                        
                        {/* 1. Noise & Cleanup */}
                        <div style={{ marginBottom: "16px", padding: "8px", backgroundColor: "var(--input)", borderRadius: "3px", border: "1px solid var(--border)" }}>
                          <h5 style={{ margin: "0 0 6px 0", fontSize: "12px", color: "var(--text)", fontWeight: 500 }}>
                            1. Noise & Cleanup
                          </h5>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input type="checkbox" defaultChecked style={{ accentColor: "var(--accent)" }} />
                              <span>High-pass filter (70-90 Hz)</span>
                              <select style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 4px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "2px" }}>
                                <option>70 Hz</option>
                                <option selected>80 Hz</option>
                                <option>90 Hz</option>
                              </select>
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input type="checkbox" style={{ accentColor: "var(--accent)" }} />
                              <span>De-click / De-ess</span>
                              <select style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 4px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "2px" }}>
                                <option>Light</option>
                                <option selected>Medium</option>
                                <option>Heavy</option>
                              </select>
                            </label>
                          </div>
                        </div>

                        {/* 2. Dynamic Control */}
                        <div style={{ marginBottom: "16px", padding: "8px", backgroundColor: "var(--input)", borderRadius: "3px", border: "1px solid var(--border)" }}>
                          <h5 style={{ margin: "0 0 6px 0", fontSize: "12px", color: "var(--text)", fontWeight: 500 }}>
                            2. Dynamic Control
                          </h5>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input type="checkbox" defaultChecked style={{ accentColor: "var(--accent)" }} />
                              <span>Gentle compression</span>
                              <select style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 4px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "2px" }}>
                                <option>2:1</option>
                                <option selected>2.5:1</option>
                                <option>3:1</option>
                              </select>
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input type="checkbox" defaultChecked style={{ accentColor: "var(--accent)" }} />
                              <span>Limiter safeguard (-1 dBFS)</span>
                            </label>
                          </div>
                        </div>

                        {/* 3. EQ Shaping */}
                        <div style={{ marginBottom: "16px", padding: "8px", backgroundColor: "var(--input)", borderRadius: "3px", border: "1px solid var(--border)" }}>
                          <h5 style={{ margin: "0 0 6px 0", fontSize: "12px", color: "var(--text)", fontWeight: 500 }}>
                            3. EQ Shaping
                          </h5>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input type="checkbox" style={{ accentColor: "var(--accent)" }} />
                              <span>Low-mid cut (150-300 Hz)</span>
                              <select style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 4px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "2px" }}>
                                <option>150 Hz</option>
                                <option selected>200 Hz</option>
                                <option>300 Hz</option>
                              </select>
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input type="checkbox" defaultChecked style={{ accentColor: "var(--accent)" }} />
                              <span>Presence boost (2-5 kHz)</span>
                              <select style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 4px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "2px" }}>
                                <option>2 kHz</option>
                                <option selected>3 kHz</option>
                                <option>5 kHz</option>
                              </select>
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input type="checkbox" style={{ accentColor: "var(--accent)" }} />
                              <span>Air lift (8-12 kHz)</span>
                              <select style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 4px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "2px" }}>
                                <option>8 kHz</option>
                                <option selected>10 kHz</option>
                                <option>12 kHz</option>
                              </select>
                            </label>
                          </div>
                        </div>

                        {/* 4. Spatial / Aesthetic Enhancements */}
                        <div style={{ marginBottom: "16px", padding: "8px", backgroundColor: "var(--input)", borderRadius: "3px", border: "1px solid var(--border)" }}>
                          <h5 style={{ margin: "0 0 6px 0", fontSize: "12px", color: "var(--text)", fontWeight: 500 }}>
                            4. Spatial / Aesthetic Enhancements
                          </h5>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input type="checkbox" defaultChecked style={{ accentColor: "var(--accent)" }} />
                              <span>Subtle reverb</span>
                              <select style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 4px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "2px" }}>
                                <option>Room (0.3s)</option>
                                <option selected>Room (0.4s)</option>
                                <option>Room (0.5s)</option>
                              </select>
                            </label>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "var(--textSecondary)", paddingLeft: "24px" }}>
                              <span>Wet mix:</span>
                              <input type="range" min="0" max="15" defaultValue="8" style={{ flex: 1, accentColor: "var(--accent)" }} />
                              <span>8%</span>
                            </div>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input type="checkbox" style={{ accentColor: "var(--accent)" }} />
                              <span>Stereo enhancer (subtle)</span>
                            </label>
                          </div>
                        </div>

                        {/* 5. Consistency & Mastering */}
                        <div style={{ marginBottom: "12px", padding: "8px", backgroundColor: "var(--input)", borderRadius: "3px", border: "1px solid var(--border)" }}>
                          <h5 style={{ margin: "0 0 6px 0", fontSize: "12px", color: "var(--text)", fontWeight: 500 }}>
                            5. Consistency & Mastering
                          </h5>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input type="checkbox" defaultChecked style={{ accentColor: "var(--accent)" }} />
                              <span>Normalize to audiobook standards</span>
                              <select style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 4px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "2px" }}>
                                <option>-18 LUFS</option>
                                <option>-20 LUFS</option>
                                <option selected>-21 LUFS</option>
                                <option>-23 LUFS</option>
                              </select>
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input type="checkbox" defaultChecked style={{ accentColor: "var(--accent)" }} />
                              <span>Peak limit (-3 dB max)</span>
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input type="checkbox" style={{ accentColor: "var(--accent)" }} />
                              <span>Final dither (16-bit export)</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div style={{ color: "var(--muted)", fontStyle: "italic", textAlign: "center", padding: "32px" }}>
                  Select a segment from the grid to begin audio production
                </div>
              )}
            </div>
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
