import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { useAudioPreview } from "../hooks/useAudioPreview";
import { createDefaultProcessingChain } from "../lib/audio-production-utils";
import AudioProductionService from "../lib/audio-production-service";
import type { PlanChunk } from "../types/plan";
import type { AudioProcessingChain } from "../types/audio-production";
import type { Segment } from "../types/plan";
import type { Character } from "../types/character";
import type { ProjectConfig } from "../types/config";

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
  processingChain?: AudioProcessingChain; // Per-segment processing preferences
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

  // Get current segment's processing chain (or default if none set)
  const getCurrentProcessingChain = useCallback((): AudioProcessingChain => {
    if (selectedRowIndex >= 0 && selectedRowIndex < audioSegments.length) {
      const selectedSegment = audioSegments[selectedRowIndex];
      return selectedSegment.processingChain || createDefaultProcessingChain();
    }
    return createDefaultProcessingChain();
  }, [audioSegments, selectedRowIndex]);

  // Current processing chain for the selected segment
  const currentProcessingChain = getCurrentProcessingChain();

  // Update segment's processing chain
  const updateCurrentProcessingChain = useCallback((newChain: AudioProcessingChain) => {
    if (selectedRowIndex >= 0 && selectedRowIndex < audioSegments.length) {
      setAudioSegments(prev => prev.map((segment, index) => 
        index === selectedRowIndex 
          ? { ...segment, processingChain: newChain }
          : segment
      ));
    }
  }, [selectedRowIndex, audioSegments.length]);

  // Debug: Log processing chain changes
  useEffect(() => {
    console.log('🎛️ Processing chain for selected segment (row ' + selectedRowIndex + '):', JSON.stringify(currentProcessingChain, null, 2));
  }, [currentProcessingChain, selectedRowIndex]);

  // Audio production service for metadata persistence
  const audioProductionService = useMemo(() => {
    return root ? new AudioProductionService(root) : null;
  }, [root]);

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
    if (!root || !chapterId || !audioProductionService) {
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
      
      // Debug: Check the actual structure of the first few chunks
      if (chunks.length > 0) {
        console.log("🔍 First chunk keys:", Object.keys(chunks[0]));
        console.log("🔍 First chunk sample:", {
          ...chunks[0],
          text: chunks[0].text?.substring(0, 50) + '...'
        });
        if (chunks.length > 1) {
          console.log("🔍 Second chunk keys:", Object.keys(chunks[1]));
        }
      }

      // Initialize audio production metadata from plan data
      // This will create/load the audio production configuration and check existing files
      await audioProductionService.initializeFromPlan(chapterId, chunks);
      const completionStatus = await audioProductionService.getChapterCompletionStatus(chapterId);

      // Convert plan chunks to audio segment rows with proper audio tracking
      const segments: AudioSegmentRow[] = chunks.map((chunk, index) => {
        // Handle missing ID by generating one based on index
        const chunkId = chunk.id || `segment_${index + 1}`;
        const segmentStatus = completionStatus.segmentStatuses.find(s => s.chunkId === chunkId);
        const audioPath = `audio/${chapterId}/${chunkId}.wav`;
        
        console.log(`🔍 Loading chunk ${index}:`, { 
          originalChunkId: chunk.id,
          finalChunkId: chunkId,
          chunkIdType: typeof chunkId,
          hasOriginalId: !!chunk.id,
          text: chunk.text?.substring(0, 50) + '...',
          allKeys: Object.keys(chunk)
        });
        
        return {
          rowKey: `${chapterId}_${chunkId}_${index}`,
          chunkId: chunkId,
          text: chunk.text,
          voice: chunk.voice || "",
          locked: chunk.locked,
          sfxAfter: null, // Will be loaded if available
          hasAudio: segmentStatus?.hasAudio || false, // Actual file existence check
          audioPath,
          start_char: chunk.start_char,
          end_char: chunk.end_char
        };
      });

      setAudioSegments(segments);
      
      // Update processing chain from metadata - this would set a default for all segments
      // For now, we'll comment this out to let segments manage their own chains
      // setProcessingChain(audioMetadata.globalProcessingChain);
      
      setMessage(`Loaded ${segments.length} segments (${completionStatus.completedSegments} with audio)`);
    } catch (error) {
      console.error("Failed to load plan data:", error);
      setMessage(`Failed to load plan data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [root, audioProductionService]);

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
    if (!segment || !selectedChapter || !audioProductionService || generatingAudio.has(segment.chunkId)) return;

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
      
      // Update audio production metadata
      await audioProductionService.markSegmentAsCompleted(
        selectedChapter,
        segment.chunkId,
        {
          filename: `${segment.chunkId}.wav`,
          duration: 10, // TODO: Get actual duration from generated file
          sampleRate: 22050,
          bitDepth: 16,
          fileSize: 1024000 // TODO: Get actual file size
        }
      );
      
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
  }, [audioSegments, selectedChapter, audioProductionService, generatingAudio]);

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
    
    if (!segment || !root) {
      setMessage("No segment selected or project not loaded");
      return;
    }

    try {
      if (audioPreview.isPlaying && audioPreview.playbackState.segmentId === segment.chunkId) {
        // Pause if currently playing this segment
        await audioPreview.pause();
      } else {
        // Load necessary data for TTS generation if needed
        const [projectConfig, charactersData, planData] = await Promise.all([
          // Load project config
          window.khipu!.call("fs:read", {
            projectRoot: root,
            relPath: "project.khipu.json",
            json: true,
          }).catch(() => null),
          
          // Load characters data
          window.khipu!.call("fs:read", {
            projectRoot: root,
            relPath: "dossier/characters.json",
            json: true,
          }).catch(() => null),
          
          // Load plan data to get segment details
          selectedChapter ? window.khipu!.call("fs:read", {
            projectRoot: root,
            relPath: `ssml/plans/${selectedChapter}.plan.json`,
            json: true,
          }).catch(() => null) : null
        ]);

        // Find the full segment data from plan
        let segmentData = null;
        if (planData) {
          const chunks = Array.isArray(planData) ? planData : (planData as { chunks?: unknown[] })?.chunks;
          segmentData = chunks?.find((chunk: unknown) => (chunk as { id?: string }).id === segment.chunkId);
        }

        // Find character data
        let characterData = null;
        if (charactersData && segment.voice && segment.voice !== "unassigned") {
          const characters = Array.isArray(charactersData) ? charactersData : (charactersData as { characters?: unknown[] })?.characters;
          characterData = characters?.find((char: unknown) => {
            const character = char as { name?: string; id?: string };
            return character.name === segment.voice || character.id === segment.voice;
          });
        }

        console.log('🎤 Audio preview data:', {
          segmentId: segment.chunkId,
          hasProjectConfig: !!projectConfig,
          hasCharacter: !!characterData,
          hasSegment: !!segmentData,
          voiceAssignment: (characterData as { voiceAssignment?: unknown })?.voiceAssignment
        });

        // Create proper Segment structure for TTS generation
        const segmentForTTS: Segment = {
          segment_id: typeof segment.chunkId === 'string' ? parseInt(segment.chunkId) : segment.chunkId,
          start_idx: segment.start_char || 0,
          end_idx: segment.end_char || 0,
          delimiter: "",
          text: segment.text,
          originalText: segment.text,
          voice: segment.voice
        };

        // Start playing this segment with current processing chain
        // Preview system will generate audio on-demand if needed
        await audioPreview.preview(segment.chunkId, currentProcessingChain, undefined, undefined, {
          segment: segmentForTTS,
          character: characterData as Character,
          projectConfig: projectConfig as ProjectConfig
        });
      }
    } catch (error) {
      console.error("Playback failed:", error);
      setMessage(`Preview failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [selectedRowIndex, audioSegments, audioPreview, currentProcessingChain, root, selectedChapter]);

  const handlePlayAll = useCallback(async () => {
    // Start playing from the first segment or currently selected segment
    // Preview system will generate audio on-demand for each segment
    const startIndex = selectedRowIndex >= 0 ? selectedRowIndex : 0;
    if (audioSegments.length > 0 && startIndex < audioSegments.length) {
      await handlePlaySegment(startIndex);
    } else {
      setMessage("No segments available to play");
    }
  }, [selectedRowIndex, audioSegments, handlePlaySegment]);

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

      {/* Action Buttons Toolbar - Unified audio production controls */}
      {selectedChapter && (
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "12px",
          marginBottom: "24px",
          flexWrap: "wrap",
          padding: "12px",
          backgroundColor: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "4px"
        }}>
          {/* Generation Controls */}
          <button
            onClick={handleGenerateChapterAudio}
            disabled={audioSegments.length === 0}
            style={{
              padding: "10px 16px",
              fontSize: "13px",
              fontWeight: 500,
              backgroundColor: audioSegments.length > 0 ? "var(--accent)" : "var(--muted)",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: audioSegments.length > 0 ? "pointer" : "not-allowed",
              opacity: audioSegments.length > 0 ? 1 : 0.6,
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            Generate Chapter Audio
          </button>

          {/* Separator */}
          <div style={{ 
            width: "1px", 
            height: "24px", 
            backgroundColor: "var(--border)" 
          }}></div>

          {/* Preview Controls */}
          <button
            onClick={() => handlePlaySegment(selectedRowIndex)}
            disabled={audioSegments.length === 0 || audioPreview.isLoading}
            style={{
              padding: "10px 16px",
              fontSize: "13px",
              fontWeight: 500,
              backgroundColor: audioSegments.length > 0 ? 
                (audioPreview.isPlaying && audioPreview.playbackState.segmentId === audioSegments[selectedRowIndex]?.chunkId ? "var(--warning)" : "var(--accent)") 
                : "var(--muted)",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: (audioSegments.length > 0 && !audioPreview.isLoading) ? "pointer" : "not-allowed",
              opacity: (audioSegments.length > 0 && !audioPreview.isLoading) ? 1 : 0.5,
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            {audioPreview.isLoading ? "⏳ Loading..." :
             audioPreview.isPlaying && audioPreview.playbackState.segmentId === audioSegments[selectedRowIndex]?.chunkId ? "⏸ Pause" :
             "▶ Play"}
          </button>

          <button
            onClick={handlePlayAll}
            disabled={audioSegments.length === 0 || audioPreview.isLoading}
            style={{
              padding: "10px 16px",
              fontSize: "13px",
              fontWeight: 500,
              backgroundColor: audioSegments.length > 0 ? "var(--accent)" : "var(--muted)",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: (audioSegments.length > 0 && !audioPreview.isLoading) ? "pointer" : "not-allowed",
              opacity: (audioSegments.length > 0 && !audioPreview.isLoading) ? 1 : 0.5,
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            🎬 Play All
          </button>

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

          {/* Status indicator */}
          <div style={{
            marginLeft: "auto",
            fontSize: "11px",
            color: "var(--textSecondary)",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            {audioPreview.error ? (
              <span style={{ color: "var(--error)" }}>❌ {audioPreview.error}</span>
            ) : audioPreview.isLoading ? (
              <span style={{ color: "var(--warning)" }}>🔄 Processing...</span>
            ) : audioPreview.isPlaying ? (
              <span style={{ color: "var(--accent)" }}>
                🎵 Playing: {audioPreview.playbackState.segmentId}
                {audioPreview.duration > 0 && (
                  <span style={{ marginLeft: "8px" }}>
                    {Math.floor(audioPreview.currentTime)}s / {Math.floor(audioPreview.duration)}s
                  </span>
                )}
              </span>
            ) : (
              <span>{audioSegments.length} segments loaded</span>
            )}
          </div>
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
                        {segment.chunkId || '(missing)'}
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



                      {/* Audio Processing Chain */}
                      <div style={{ padding: "12px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "4px" }}>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "var(--text)" }}>
                          Audio Processing Chain
                        </h4>
                        
                        {/* Processing Summary */}
                        <div style={{ marginBottom: "12px", padding: "6px", backgroundColor: "var(--accent)", color: "white", borderRadius: "3px", fontSize: "10px" }}>
                          <strong>Active Effects:</strong> {[
                            currentProcessingChain.noiseCleanup.highPassFilter.enabled && `HP Filter (${currentProcessingChain.noiseCleanup.highPassFilter.frequency}Hz)`,
                            currentProcessingChain.noiseCleanup.deClickDeEss.enabled && `De-ess (${currentProcessingChain.noiseCleanup.deClickDeEss.intensity})`,
                            currentProcessingChain.dynamicControl.compression.enabled && `Compression (${currentProcessingChain.dynamicControl.compression.ratio})`,
                            currentProcessingChain.dynamicControl.limiter.enabled && 'Limiter',
                            currentProcessingChain.eqShaping.lowMidCut.enabled && `Low-Mid Cut (${currentProcessingChain.eqShaping.lowMidCut.frequency}Hz)`,
                            currentProcessingChain.eqShaping.presenceBoost.enabled && `Presence (${currentProcessingChain.eqShaping.presenceBoost.frequency}kHz)`,
                            currentProcessingChain.eqShaping.airLift.enabled && `Air Lift (${currentProcessingChain.eqShaping.airLift.frequency}kHz)`,
                            currentProcessingChain.spatialEnhancement.reverb.enabled && `Reverb (${currentProcessingChain.spatialEnhancement.reverb.wetMix}%)`,
                            currentProcessingChain.spatialEnhancement.stereoEnhancer.enabled && 'Stereo Enhance',
                            currentProcessingChain.mastering.normalization.enabled && `Normalize (${currentProcessingChain.mastering.normalization.targetLUFS}LUFS)`,
                            currentProcessingChain.mastering.peakLimiting.enabled && 'Peak Limit',
                            currentProcessingChain.mastering.dithering.enabled && 'Dither'
                          ].filter(Boolean).join(', ') || 'None'}
                        </div>
                        
                        {/* 1. Noise & Cleanup */}
                        <div style={{ marginBottom: "16px", padding: "8px", backgroundColor: "var(--input)", borderRadius: "3px", border: "1px solid var(--border)" }}>
                          <h5 style={{ margin: "0 0 6px 0", fontSize: "12px", color: "var(--text)", fontWeight: 500 }}>
                            1. Noise & Cleanup
                          </h5>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input 
                                type="checkbox" 
                                checked={currentProcessingChain.noiseCleanup.highPassFilter.enabled}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  noiseCleanup: {
                                    ...currentProcessingChain.noiseCleanup,
                                    highPassFilter: {
                                      ...currentProcessingChain.noiseCleanup.highPassFilter,
                                      enabled: e.target.checked
                                    }
                                  }
                                })}
                                style={{ accentColor: "var(--accent)" }} 
                              />
                              <span>High-pass filter (70-90 Hz)</span>
                              <select 
                                value={currentProcessingChain.noiseCleanup.highPassFilter.frequency}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  noiseCleanup: {
                                    ...currentProcessingChain.noiseCleanup,
                                    highPassFilter: {
                                      ...currentProcessingChain.noiseCleanup.highPassFilter,
                                      frequency: e.target.value as "70" | "80" | "90"
                                    }
                                  }
                                })}
                                style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 4px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "2px" }}
                              >
                                <option value="70">70 Hz</option>
                                <option value="80">80 Hz</option>
                                <option value="90">90 Hz</option>
                              </select>
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input 
                                type="checkbox" 
                                checked={currentProcessingChain.noiseCleanup.deClickDeEss.enabled}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  noiseCleanup: {
                                    ...currentProcessingChain.noiseCleanup,
                                    deClickDeEss: {
                                      ...currentProcessingChain.noiseCleanup.deClickDeEss,
                                      enabled: e.target.checked
                                    }
                                  }
                                })}
                                style={{ accentColor: "var(--accent)" }} 
                              />
                              <span>De-click / De-ess</span>
                              <select 
                                value={currentProcessingChain.noiseCleanup.deClickDeEss.intensity}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  noiseCleanup: {
                                    ...currentProcessingChain.noiseCleanup,
                                    deClickDeEss: {
                                      ...currentProcessingChain.noiseCleanup.deClickDeEss,
                                      intensity: e.target.value as "light" | "medium" | "heavy"
                                    }
                                  }
                                })}
                                style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 4px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "2px" }}
                              >
                                <option value="light">Light</option>
                                <option value="medium">Medium</option>
                                <option value="heavy">Heavy</option>
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
                              <input 
                                type="checkbox" 
                                checked={currentProcessingChain.dynamicControl.compression.enabled}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  dynamicControl: {
                                    ...currentProcessingChain.dynamicControl,
                                    compression: {
                                      ...currentProcessingChain.dynamicControl.compression,
                                      enabled: e.target.checked
                                    }
                                  }
                                })}
                                style={{ accentColor: "var(--accent)" }} 
                              />
                              <span>Gentle compression</span>
                              <select 
                                value={currentProcessingChain.dynamicControl.compression.ratio}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  dynamicControl: {
                                    ...currentProcessingChain.dynamicControl,
                                    compression: {
                                      ...currentProcessingChain.dynamicControl.compression,
                                      ratio: e.target.value as "2:1" | "2.5:1" | "3:1"
                                    }
                                  }
                                })}
                                style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 4px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "2px" }}
                              >
                                <option value="2:1">2:1</option>
                                <option value="2.5:1">2.5:1</option>
                                <option value="3:1">3:1</option>
                              </select>
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input 
                                type="checkbox" 
                                checked={currentProcessingChain.dynamicControl.limiter.enabled}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  dynamicControl: {
                                    ...currentProcessingChain.dynamicControl,
                                    limiter: {
                                      ...currentProcessingChain.dynamicControl.limiter,
                                      enabled: e.target.checked
                                    }
                                  }
                                })}
                                style={{ accentColor: "var(--accent)" }} 
                              />
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
                              <input 
                                type="checkbox" 
                                checked={currentProcessingChain.eqShaping.lowMidCut.enabled}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  eqShaping: {
                                    ...currentProcessingChain.eqShaping,
                                    lowMidCut: {
                                      ...currentProcessingChain.eqShaping.lowMidCut,
                                      enabled: e.target.checked
                                    }
                                  }
                                })}
                                style={{ accentColor: "var(--accent)" }} 
                              />
                              <span>Low-mid cut (150-300 Hz)</span>
                              <select 
                                value={currentProcessingChain.eqShaping.lowMidCut.frequency}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  eqShaping: {
                                    ...currentProcessingChain.eqShaping,
                                    lowMidCut: {
                                      ...currentProcessingChain.eqShaping.lowMidCut,
                                      frequency: e.target.value as "150" | "200" | "300"
                                    }
                                  }
                                })}
                                style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 4px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "2px" }}
                              >
                                <option value="150">150 Hz</option>
                                <option value="200">200 Hz</option>
                                <option value="300">300 Hz</option>
                              </select>
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input 
                                type="checkbox" 
                                checked={currentProcessingChain.eqShaping.presenceBoost.enabled}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  eqShaping: {
                                    ...currentProcessingChain.eqShaping,
                                    presenceBoost: {
                                      ...currentProcessingChain.eqShaping.presenceBoost,
                                      enabled: e.target.checked
                                    }
                                  }
                                })}
                                style={{ accentColor: "var(--accent)" }} 
                              />
                              <span>Presence boost (2-5 kHz)</span>
                              <select 
                                value={currentProcessingChain.eqShaping.presenceBoost.frequency}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  eqShaping: {
                                    ...currentProcessingChain.eqShaping,
                                    presenceBoost: {
                                      ...currentProcessingChain.eqShaping.presenceBoost,
                                      frequency: e.target.value as "2" | "3" | "5"
                                    }
                                  }
                                })}
                                style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 4px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "2px" }}
                              >
                                <option value="2">2 kHz</option>
                                <option value="3">3 kHz</option>
                                <option value="5">5 kHz</option>
                              </select>
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input 
                                type="checkbox" 
                                checked={currentProcessingChain.eqShaping.airLift.enabled}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  eqShaping: {
                                    ...currentProcessingChain.eqShaping,
                                    airLift: {
                                      ...currentProcessingChain.eqShaping.airLift,
                                      enabled: e.target.checked
                                    }
                                  }
                                })}
                                style={{ accentColor: "var(--accent)" }} 
                              />
                              <span>Air lift (8-12 kHz)</span>
                              <select 
                                value={currentProcessingChain.eqShaping.airLift.frequency}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  eqShaping: {
                                    ...currentProcessingChain.eqShaping,
                                    airLift: {
                                      ...currentProcessingChain.eqShaping.airLift,
                                      frequency: e.target.value as "8" | "10" | "12"
                                    }
                                  }
                                })}
                                style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 4px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "2px" }}
                              >
                                <option value="8">8 kHz</option>
                                <option value="10">10 kHz</option>
                                <option value="12">12 kHz</option>
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
                              <input 
                                type="checkbox" 
                                checked={currentProcessingChain.spatialEnhancement.reverb.enabled}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  spatialEnhancement: {
                                    ...currentProcessingChain.spatialEnhancement,
                                    reverb: {
                                      ...currentProcessingChain.spatialEnhancement.reverb,
                                      enabled: e.target.checked
                                    }
                                  }
                                })}
                                style={{ accentColor: "var(--accent)" }} 
                              />
                              <span>Subtle reverb</span>
                              <select 
                                value={currentProcessingChain.spatialEnhancement.reverb.type}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  spatialEnhancement: {
                                    ...currentProcessingChain.spatialEnhancement,
                                    reverb: {
                                      ...currentProcessingChain.spatialEnhancement.reverb,
                                      type: e.target.value as "room_0.3" | "room_0.4" | "room_0.5"
                                    }
                                  }
                                })}
                                style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 4px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "2px" }}
                              >
                                <option value="room_0.3">Room (0.3s)</option>
                                <option value="room_0.4">Room (0.4s)</option>
                                <option value="room_0.5">Room (0.5s)</option>
                              </select>
                            </label>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "var(--textSecondary)", paddingLeft: "24px" }}>
                              <span>Wet mix:</span>
                              <input 
                                type="range" 
                                min="0" 
                                max="15" 
                                value={currentProcessingChain.spatialEnhancement.reverb.wetMix}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  spatialEnhancement: {
                                    ...currentProcessingChain.spatialEnhancement,
                                    reverb: {
                                      ...currentProcessingChain.spatialEnhancement.reverb,
                                      wetMix: parseInt(e.target.value)
                                    }
                                  }
                                })}
                                style={{ flex: 1, accentColor: "var(--accent)" }} 
                              />
                              <span>{currentProcessingChain.spatialEnhancement.reverb.wetMix}%</span>
                            </div>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input 
                                type="checkbox" 
                                checked={currentProcessingChain.spatialEnhancement.stereoEnhancer.enabled}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  spatialEnhancement: {
                                    ...currentProcessingChain.spatialEnhancement,
                                    stereoEnhancer: {
                                      ...currentProcessingChain.spatialEnhancement.stereoEnhancer,
                                      enabled: e.target.checked
                                    }
                                  }
                                })}
                                style={{ accentColor: "var(--accent)" }} 
                              />
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
                              <input 
                                type="checkbox" 
                                checked={currentProcessingChain.mastering.normalization.enabled}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  mastering: {
                                    ...currentProcessingChain.mastering,
                                    normalization: {
                                      ...currentProcessingChain.mastering.normalization,
                                      enabled: e.target.checked
                                    }
                                  }
                                })}
                                style={{ accentColor: "var(--accent)" }} 
                              />
                              <span>Normalize to audiobook standards</span>
                              <select 
                                value={currentProcessingChain.mastering.normalization.targetLUFS}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  mastering: {
                                    ...currentProcessingChain.mastering,
                                    normalization: {
                                      ...currentProcessingChain.mastering.normalization,
                                      targetLUFS: e.target.value as "-18" | "-20" | "-21" | "-23"
                                    }
                                  }
                                })}
                                style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 4px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "2px" }}
                              >
                                <option value="-18">-18 LUFS</option>
                                <option value="-20">-20 LUFS</option>
                                <option value="-21">-21 LUFS</option>
                                <option value="-23">-23 LUFS</option>
                              </select>
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input 
                                type="checkbox" 
                                checked={currentProcessingChain.mastering.peakLimiting.enabled}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  mastering: {
                                    ...currentProcessingChain.mastering,
                                    peakLimiting: {
                                      ...currentProcessingChain.mastering.peakLimiting,
                                      enabled: e.target.checked
                                    }
                                  }
                                })}
                                style={{ accentColor: "var(--accent)" }} 
                              />
                              <span>Peak limit (-3 dB max)</span>
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input 
                                type="checkbox" 
                                checked={currentProcessingChain.mastering.dithering.enabled}
                                onChange={(e) => updateCurrentProcessingChain({
                                  ...currentProcessingChain,
                                  mastering: {
                                    ...currentProcessingChain.mastering,
                                    dithering: {
                                      ...currentProcessingChain.mastering.dithering,
                                      enabled: e.target.checked
                                    }
                                  }
                                })}
                                style={{ accentColor: "var(--accent)" }} 
                              />
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
