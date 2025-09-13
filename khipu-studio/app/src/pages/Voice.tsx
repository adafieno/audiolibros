import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { useAudioPreview } from "../hooks/useAudioPreview";
import { createDefaultProcessingChain } from "../lib/audio-production-utils";
import AudioProductionService from "../lib/audio-production-service";
import { AUDIO_PRESETS, getPresetsByCategory, getPresetById, type AudioPreset } from "../data/audio-presets";
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
  
  // Helper function to get translated preset name and description
  const getTranslatedPreset = useCallback((preset: AudioPreset) => {
    const nameKey = `audioPresets.${preset.id}.name`;
    const descriptionKey = `audioPresets.${preset.id}.description`;
    
    // Try to get translation, fallback to original if not found
    const translatedName = t(nameKey, { defaultValue: preset.name });
    const translatedDescription = t(descriptionKey, { defaultValue: preset.description });
    
    return {
      name: translatedName,
      description: translatedDescription
    };
  }, [t]);
  const { root } = useProject();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterStatus, setChapterStatus] = useState<Map<string, ChapterStatus>>(new Map());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [selectedChapter, setSelectedChapter] = useState<string>("");
  const [audioSegments, setAudioSegments] = useState<AudioSegmentRow[]>([]);
  const [generatingAudio, setGeneratingAudio] = useState<Set<string>>(new Set());
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('clean_polished');

  // Audio preview functionality
  const audioPreview = useAudioPreview();

  // Get the Clean Polished preset as default
  const getCleanPolishedPreset = useCallback((): AudioProcessingChain => {
    const cleanPolished = getPresetById('clean_polished');
    return cleanPolished?.processingChain || createDefaultProcessingChain();
  }, []);

  // Track whether custom settings mode is enabled
  const [customSettingsEnabled, setCustomSettingsEnabled] = useState(false);

  // Get current segment's processing chain (or Clean Polished default if none set)
  const getCurrentProcessingChain = useCallback((): AudioProcessingChain => {
    if (selectedRowIndex >= 0 && selectedRowIndex < audioSegments.length) {
      const selectedSegment = audioSegments[selectedRowIndex];
      return selectedSegment.processingChain || getCleanPolishedPreset();
    }
    return getCleanPolishedPreset();
  }, [audioSegments, selectedRowIndex, getCleanPolishedPreset]);

  // Function to find which preset matches a processing chain
  const findMatchingPreset = useCallback((processingChain: AudioProcessingChain): string | null => {
    for (const preset of AUDIO_PRESETS) {
      if (JSON.stringify(preset.processingChain) === JSON.stringify(processingChain)) {
        return preset.id;
      }
    }
    return null;
  }, []);

  // Current processing chain for the selected segment
  const currentProcessingChain = getCurrentProcessingChain();

  // Update selected preset when segment changes
  useEffect(() => {
    const matchingPresetId = findMatchingPreset(currentProcessingChain);
    if (matchingPresetId) {
      setSelectedPresetId(matchingPresetId);
      setCustomSettingsEnabled(false);
    } else {
      setCustomSettingsEnabled(true);
    }
  }, [currentProcessingChain, findMatchingPreset]);

  // Audio production service for metadata persistence
  const audioProductionService = useMemo(() => {
    return root ? new AudioProductionService(root) : null;
  }, [root]);

  // Update segment's processing chain with automatic persistence
  const updateCurrentProcessingChain = useCallback((newChain: AudioProcessingChain) => {
    if (selectedRowIndex >= 0 && selectedRowIndex < audioSegments.length) {
      setAudioSegments(prev => prev.map((segment, index) => 
        index === selectedRowIndex 
          ? { ...segment, processingChain: newChain }
          : segment
      ));
      
      // Auto-save processing chain changes
      if (audioProductionService && selectedChapter && root) {
        // Debounce the save operation to avoid too many saves
        setTimeout(async () => {
          try {
            // Create a map with all current processing chains
            const processingChainMap: Record<string, AudioProcessingChain> = {};
            
            // Add the newly updated segment
            const currentSegment = audioSegments[selectedRowIndex];
            if (currentSegment) {
              processingChainMap[currentSegment.chunkId] = newChain;
              
              // Also add other segments that have custom processing chains
              audioSegments.forEach(segment => {
                if (segment.processingChain && segment.chunkId !== currentSegment.chunkId) {
                  processingChainMap[segment.chunkId] = segment.processingChain;
                }
              });
            }
            
            console.log('💾 Auto-saving processing chain changes for segment:', currentSegment?.chunkId);
            await audioProductionService.saveProcessingChains(selectedChapter, processingChainMap);
            
          } catch (error) {
            console.warn('Auto-save failed:', error);
            // Don't show error to user for auto-save failures, just log them
          }
        }, 1000); // Debounce: save 1 second after last change
      }
    }
  }, [selectedRowIndex, audioSegments, audioProductionService, selectedChapter, root]);

  // Debug: Log processing chain changes
  useEffect(() => {
    console.log('🎛️ Processing chain for selected segment (row ' + selectedRowIndex + '):', JSON.stringify(currentProcessingChain, null, 2));
  }, [currentProcessingChain, selectedRowIndex]);

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
      setMessage(t("audioProduction.loadingPlanData"));
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
        setMessage(t("audioProduction.noPlanDataFound"));
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
        setMessage(t("audioProduction.invalidPlanData"));
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
      
      // Load saved processing chains for this chapter
      try {
        const savedProcessingChains = await audioProductionService.loadProcessingChains(chapterId);
        
        if (Object.keys(savedProcessingChains).length > 0) {
          console.log('💾 Loading saved processing chains for segments:', Object.keys(savedProcessingChains));
          
          // Apply saved processing chains to matching segments
          setAudioSegments(prev => prev.map(segment => {
            if (savedProcessingChains[segment.chunkId]) {
              return {
                ...segment,
                processingChain: savedProcessingChains[segment.chunkId]
              };
            }
            return segment;
          }));
          
          setMessage(t("audioProduction.loadedSegmentsWithChains", { segments: segments.length, chains: Object.keys(savedProcessingChains).length }));
        } else {
          setMessage(t("audioProduction.loadedSegmentsWithAudio", { segments: segments.length, completed: completionStatus.completedSegments }));
        }
      } catch (error) {
        console.warn('Failed to load processing chains:', error);
        setMessage(t("audioProduction.loadedSegmentsWithAudio", { segments: segments.length, completed: completionStatus.completedSegments }));
      }
      
      // Update processing chain from metadata - this would set a default for all segments
      // For now, we'll comment this out to let segments manage their own chains
      // setProcessingChain(audioMetadata.globalProcessingChain);
      
      setMessage(t("audioProduction.loadedSegmentsWithAudio", { segments: segments.length, completed: completionStatus.completedSegments }));
    } catch (error) {
      console.error("Failed to load plan data:", error);
      setMessage(t("audioProduction.failedToLoadPlanData", { error: error instanceof Error ? error.message : 'Unknown error' }));
    }
  }, [root, audioProductionService, t]);

  const loadChapters = useCallback(async () => {
    if (!root) return;
    
    try {
      setLoading(true);
      setMessage(t("audioProduction.loadingChapters"));
      onStatus(t("audioProduction.loadingChapters"));
      
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
      setMessage(t("audioProduction.failedToLoadChapters"));
      onStatus("");
    } finally {
      setLoading(false);
    }
  }, [root, checkChapterStatus, onStatus, t]);

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
      setMessage(t("audioProduction.generatingAudioForSegment", { chunkId: segment.chunkId }));
      
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
      
      setMessage(t("audioProduction.audioGeneratedForSegment", { chunkId: segment.chunkId }));
    } catch (error) {
      console.error("Failed to generate audio:", error);
      setMessage(t("audioProduction.failedToGenerateAudio", { chunkId: segment.chunkId }));
    } finally {
      setGeneratingAudio(prev => {
        const next = new Set(prev);
        next.delete(segment.chunkId);
        return next;
      });
    }
  }, [audioSegments, selectedChapter, audioProductionService, generatingAudio, t]);

  const handleGenerateChapterAudio = useCallback(async () => {
    if (!selectedChapter || audioSegments.length === 0) return;

    setMessage(t("audioProduction.generatingChapterAudio"));
    
    for (let i = 0; i < audioSegments.length; i++) {
      if (!audioSegments[i].hasAudio) {
        await handleGenerateSegmentAudio(i);
      }
    }
    
    setMessage(t("audioProduction.chapterAudioComplete"));
  }, [selectedChapter, audioSegments, handleGenerateSegmentAudio, t]);

  // Audio preview handlers
  const handlePlaySegment = useCallback(async (segmentIndex?: number) => {
    const index = segmentIndex ?? selectedRowIndex;
    const segment = audioSegments[index];
    
    if (!segment || !root) {
      setMessage(t("audioProduction.noSegmentSelected"));
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
      setMessage(t("audioProduction.previewFailed", { error: error instanceof Error ? error.message : String(error) }));
    }
  }, [selectedRowIndex, audioSegments, audioPreview, currentProcessingChain, root, selectedChapter, t]);

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
          {t("audioProduction.pageTitle")}
        </h2>
      </div>
      
      {/* Subtitle */}
      <div style={{ marginBottom: "24px" }}>
        <p style={{ margin: 0, fontSize: "14px", color: "var(--textSecondary)" }}>
          {t("audioProduction.pageDescription")}
        </p>
      </div>

      {/* Chapter selector with integrated audio production progress */}
      <div style={{ marginBottom: "16px", padding: "16px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "6px" }}>
        <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <label style={{ fontSize: "14px", fontWeight: "500", color: "var(--text)" }}>
              {t("audioProduction.chapterLabel")}:
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
                                {t("audioProduction.selectChapter")}
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
                    ? t("audioProduction.audioProductionComplete") 
                    : t("audioProduction.chaptersLoaded", { completed: audioCompleteCount, total: totalChapters })
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
            {t("audioProduction.generateChapterAudio")}
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
            {audioPreview.isLoading ? `⏳ ${t("audioProduction.loading")}` :
             audioPreview.isPlaying && audioPreview.playbackState.segmentId === audioSegments[selectedRowIndex]?.chunkId ? `⏸ ${t("audioProduction.pause")}` :
             `▶ ${t("audioProduction.play")}`}
          </button>

          <button
            onClick={async () => {
              // Playlist approach - plays all segments continuously
              if (audioSegments.length === 0) {
                setMessage(t("audioProduction.noSegmentsAvailable"));
                return;
              }

              if (!root) {
                setMessage(t("audioProduction.projectNotLoaded"));
                return;
              }

              const startIndex = selectedRowIndex >= 0 ? selectedRowIndex : 0;
              
              try {
                console.log(`🎬 Starting Play All from segment ${startIndex}`);
                
                // Load shared data once
                const [projectConfig, charactersData] = await Promise.all([
                  window.khipu!.call("fs:read", {
                    projectRoot: root,
                    relPath: "project.khipu.json",
                    json: true,
                  }).catch(() => null),
                  
                  window.khipu!.call("fs:read", {
                    projectRoot: root,
                    relPath: "dossier/characters.json",
                    json: true,
                  }).catch(() => null),
                ]);

                if (!projectConfig || !charactersData) {
                  throw new Error("Could not load project data");
                }

                // Prepare segments for playlist
                const segmentsToPlay = audioSegments.slice(startIndex);
                const playlistSegments = [];

                for (const segment of segmentsToPlay) {
                  // Find character data
                  const characters = Array.isArray(charactersData) ? charactersData : (charactersData as { characters?: unknown[] })?.characters;
                  const characterData = characters?.find((char: unknown) => {
                    const character = char as { name?: string; id?: string };
                    return character.name === segment.voice || character.id === segment.voice;
                  });

                  if (!characterData) {
                    console.warn(`⚠️ No character found for ${segment.voice}`);
                    continue;
                  }

                  const character = characterData as Character;
                  if (!character.voiceAssignment) {
                    console.warn(`⚠️ No voice assignment for ${character.name}`);
                    continue;
                  }

                  const processingChain = segment.processingChain || getCleanPolishedPreset();

                  playlistSegments.push({
                    segmentId: `segment_${segment.chunkId}`,
                    processingChain,
                    segment: {
                      segment_id: parseInt(segment.chunkId || "0"),
                      start_idx: 0,
                      end_idx: segment.text?.length || 0,
                      delimiter: "",
                      text: segment.text || "",
                      voice: segment.voice || ""
                    },
                    character,
                    projectConfig: projectConfig as ProjectConfig
                  });
                }

                if (playlistSegments.length === 0) {
                  throw new Error("No valid segments found");
                }

                console.log(`🎉 Playing ${playlistSegments.length} segments as continuous playlist`);

                // Track which segments are actually in the playlist (may be fewer than total)
                const playlistStartIndex = startIndex;
                const processedSegmentIndexes: number[] = [];
                
                // Build mapping of processed segments back to original indexes
                for (let i = 0; i < segmentsToPlay.length; i++) {
                  const segment = segmentsToPlay[i];
                  const segmentInPlaylist = playlistSegments.find(ps => ps.segmentId === `segment_${segment.chunkId}`);
                  if (segmentInPlaylist) {
                    processedSegmentIndexes.push(playlistStartIndex + i);
                  }
                }

                await audioPreview.playAllAsPlaylist(playlistSegments, (currentSegmentIndex: number, segmentDurations: number[]) => {
                  // Map the playlist segment index back to the original grid index
                  if (currentSegmentIndex >= 0 && currentSegmentIndex < processedSegmentIndexes.length) {
                    const gridIndex = processedSegmentIndexes[currentSegmentIndex];
                    if (gridIndex !== selectedRowIndex) {
                      console.log(`🎯 Progress: Playing segment ${currentSegmentIndex + 1}/${segmentDurations.length}, grid row ${gridIndex + 1}`);
                      setSelectedRowIndex(gridIndex);
                    }
                  }
                });
                
              } catch (error) {
                console.error("🚫 Play All failed:", error);
              }
            }}
            disabled={audioSegments.length === 0 || audioPreview.isLoading}
            style={{
              padding: "10px 16px",
              fontSize: "13px",
              fontWeight: 500,
              backgroundColor: audioSegments.length > 0 ? "var(--accent)" : "var(--muted)",
              color: "white",
              border: "1px solid transparent",
              borderRadius: "4px",
              cursor: audioSegments.length > 0 ? "pointer" : "not-allowed",
              marginLeft: "12px"
            }}
          >
            🎬 {t("audioProduction.playAll")}
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
            ⏹ {t("audioProduction.stop")}
          </button>

          {/* Status indicator - minimal */}
          <div style={{
            marginLeft: "auto",
            fontSize: "11px",
            color: "var(--textSecondary)",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            {audioPreview.error ? (
              <span style={{ color: "var(--error)" }}>❌ {t("audioProduction.error")}</span>
            ) : audioPreview.isLoading ? (
              <span style={{ color: "var(--warning)" }}>🔄 {t("audioProduction.processing")}</span>
            ) : audioPreview.isPlaying ? (
              <span style={{ color: "var(--success)" }}>
                🎵 {t("audioProduction.playing")}
                {audioPreview.duration > 0 && (
                  <span style={{ marginLeft: "8px" }}>
                    {Math.floor(audioPreview.currentTime)}s / {Math.floor(audioPreview.duration)}s
                  </span>
                )}
              </span>
            ) : (
              <span>{t("audioProduction.segmentsLoaded", { count: audioSegments.length })}</span>
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
          <p style={{ margin: "0 0 8px 0", fontWeight: 500 }}>{t("audioProduction.noChaptersWithPlans")}</p>
          <p style={{ margin: 0 }}>{t("audioProduction.completeOrchestrationStep")}</p>
        </div>
      ) : null}

      {/* Main content grid - Two pane layout */}
      {selectedChapter && audioSegments.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "0.6fr 1.4fr", gap: "16px", flex: 1, minHeight: 0 }}>
          {/* Left: Audio Segments Grid */}
          <div style={{ border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "8px 12px", backgroundColor: "var(--panelAccent)", borderBottom: "1px solid var(--border)", fontSize: "14px", fontWeight: 500 }}>
              {t("audioProduction.segments")} - {selectedChapter}
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
                    <th style={{ padding: "8px", textAlign: "left", color: "var(--text)", fontWeight: 500 }}>{t("audioProduction.tableHeaderId")}</th>
                    <th style={{ padding: "8px", textAlign: "left", color: "var(--text)", fontWeight: 500 }}>{t("audioProduction.tableHeaderTextPreview")}</th>
                    <th style={{ padding: "8px", textAlign: "left", color: "var(--text)", fontWeight: 500 }}>{t("audioProduction.tableHeaderVoice")}</th>
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
              {t("audioProduction.moduleTitle")}
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
                          {t("audioProduction.segmentTitle", { chunkId: currentSegment.chunkId })}
                        </h4>
                        <p style={{ margin: "0 0 8px 0", fontSize: "12px", color: "var(--textSecondary)" }}>
                          {t("audioProduction.voiceLabel")} {currentSegment.voice || t("audioProduction.notAssigned")}
                        </p>
                        <div style={{ fontSize: "13px", color: "var(--text)", lineHeight: "1.4", padding: "8px", backgroundColor: "var(--input)", borderRadius: "3px" }}>
                          {currentSegment.text}
                        </div>
                      </div>



                      {/* Audio Processing Chain */}
                      <div style={{ padding: "12px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "4px" }}>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "var(--text)" }}>
                          {t("audioProduction.processingChainTitle")}
                        </h4>
                        
                        {/* Audio Presets Selector */}
                        <div style={{ marginBottom: "16px", padding: "8px", backgroundColor: "var(--input)", borderRadius: "3px", border: "1px solid var(--border)" }}>
                          <h5 style={{ margin: "0 0 8px 0", fontSize: "12px", color: "var(--text)", fontWeight: 500 }}>
                            {t("audioProduction.professionalVoicePresets")}
                          </h5>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <select 
                              style={{ 
                                padding: "6px", 
                                fontSize: "11px", 
                                backgroundColor: "var(--input)", 
                                border: "1px solid var(--border)", 
                                borderRadius: "3px",
                                color: "var(--text)"
                              }}
                              value={customSettingsEnabled ? 'custom' : selectedPresetId}
                              onChange={(e) => {
                                if (e.target.value === 'custom') {
                                  setCustomSettingsEnabled(true);
                                } else {
                                  setCustomSettingsEnabled(false);
                                  setSelectedPresetId(e.target.value);
                                  const preset = getPresetById(e.target.value);
                                  if (preset) {
                                    updateCurrentProcessingChain(preset.processingChain);
                                  }
                                }
                              }}
                            >
                              <optgroup label={t("audioProduction.presetCleanNatural")}>
                                {getPresetsByCategory('clean').map((preset: AudioPreset) => {
                                  const translated = getTranslatedPreset(preset);
                                  return (
                                    <option key={preset.id} value={preset.id}>
                                      {translated.name} - {translated.description}
                                    </option>
                                  );
                                })}
                              </optgroup>
                              <optgroup label={t("audioProduction.presetCharacterVoices")}>
                                {getPresetsByCategory('character').map((preset: AudioPreset) => {
                                  const translated = getTranslatedPreset(preset);
                                  return (
                                    <option key={preset.id} value={preset.id}>
                                      {translated.name} - {translated.description}
                                    </option>
                                  );
                                })}
                              </optgroup>
                              <optgroup label={t("audioProduction.presetBroadcastQuality")}>
                                {getPresetsByCategory('broadcast').map((preset: AudioPreset) => {
                                  const translated = getTranslatedPreset(preset);
                                  return (
                                    <option key={preset.id} value={preset.id}>
                                      {translated.name} - {translated.description}
                                    </option>
                                  );
                                })}
                              </optgroup>
                              <optgroup label={t("audioProduction.presetVintageSpecialty")}>
                                {getPresetsByCategory('vintage').map((preset: AudioPreset) => {
                                  const translated = getTranslatedPreset(preset);
                                  return (
                                    <option key={preset.id} value={preset.id}>
                                      {translated.name} - {translated.description}
                                    </option>
                                  );
                                })}
                              </optgroup>
                              <optgroup label={t("audioProduction.presetEnvironmental")}>
                                {getPresetsByCategory('environmental').map((preset: AudioPreset) => {
                                  const translated = getTranslatedPreset(preset);
                                  return (
                                    <option key={preset.id} value={preset.id}>
                                      {translated.name} - {translated.description}
                                    </option>
                                  );
                                })}
                              </optgroup>
                              <optgroup label={t("audioProduction.presetSpecialEffects")}>
                                {getPresetsByCategory('effects').map((preset: AudioPreset) => {
                                  const translated = getTranslatedPreset(preset);
                                  return (
                                    <option key={preset.id} value={preset.id}>
                                      {translated.name} - {translated.description}
                                    </option>
                                  );
                                })}
                              </optgroup>
                              <option value="custom">--- {t("audioProduction.customSettings")} ---</option>
                            </select>
                            <div style={{ fontSize: "10px", color: "var(--textSecondary)", fontStyle: "italic" }}>
                              {t("audioProduction.presetsDescription")} {" "}
                              {t("audioProduction.customSettingsInstruction", { customSettings: t("audioProduction.customSettings") })}
                            </div>
                          </div>
                        </div>
                        
                        {/* Processing Summary */}
                        <div style={{ marginBottom: "12px", padding: "6px", backgroundColor: "var(--accent)", color: "white", borderRadius: "3px", fontSize: "10px" }}>
                          <strong>{t("audioProduction.activeEffects")}</strong> {[
                            currentProcessingChain.noiseCleanup.highPassFilter.enabled && t("audioProduction.hpFilterDynamic", { frequency: currentProcessingChain.noiseCleanup.highPassFilter.frequency }),
                            currentProcessingChain.noiseCleanup.deClickDeEss.enabled && t("audioProduction.deEssDynamic", { intensity: currentProcessingChain.noiseCleanup.deClickDeEss.intensity }),
                            currentProcessingChain.dynamicControl.compression.enabled && t("audioProduction.compressionDynamic", { ratio: currentProcessingChain.dynamicControl.compression.ratio }),
                            currentProcessingChain.dynamicControl.limiter.enabled && t("audioProduction.limiterDynamic"),
                            currentProcessingChain.eqShaping.lowMidCut.enabled && t("audioProduction.lowMidCutDynamic", { frequency: currentProcessingChain.eqShaping.lowMidCut.frequency }),
                            currentProcessingChain.eqShaping.presenceBoost.enabled && t("audioProduction.presenceBoostDynamic", { frequency: currentProcessingChain.eqShaping.presenceBoost.frequency }),
                            currentProcessingChain.eqShaping.airLift.enabled && t("audioProduction.airLiftDynamic", { frequency: currentProcessingChain.eqShaping.airLift.frequency }),
                            currentProcessingChain.spatialEnhancement.reverb.enabled && t("audioProduction.reverbDynamic", { wetMix: currentProcessingChain.spatialEnhancement.reverb.wetMix }),
                            currentProcessingChain.spatialEnhancement.stereoEnhancer.enabled && t("audioProduction.stereoEnhance"),
                            currentProcessingChain.mastering.normalization.enabled && t("audioProduction.normalizeDynamic", { targetLUFS: currentProcessingChain.mastering.normalization.targetLUFS }),
                            currentProcessingChain.mastering.peakLimiting.enabled && t("audioProduction.peakLimit"),
                            currentProcessingChain.mastering.dithering.enabled && t("audioProduction.dither")
                          ].filter(Boolean).join(', ') || t("audioProduction.activeEffectsNone")}
                        </div>
                        
                        {/* 1. Noise & Cleanup */}
                        <div style={{ marginBottom: "16px", padding: "8px", backgroundColor: "var(--input)", borderRadius: "3px", border: "1px solid var(--border)" }}>
                          <h5 style={{ margin: "0 0 6px 0", fontSize: "12px", color: "var(--text)", fontWeight: 500 }}>
                            {t("audioProduction.processingStep1")}
                          </h5>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input 
                                type="checkbox" 
                                checked={currentProcessingChain.noiseCleanup.highPassFilter.enabled}
                                disabled={!customSettingsEnabled}
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
                              <span>{t("audioProduction.highPassFilter")}</span>
                              <select 
                                value={currentProcessingChain.noiseCleanup.highPassFilter.frequency}
                                disabled={!customSettingsEnabled}
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
                                disabled={!customSettingsEnabled}
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
                              <span>{t("audioProduction.deClickDeEss")}</span>
                              <select 
                                value={currentProcessingChain.noiseCleanup.deClickDeEss.intensity}
                                disabled={!customSettingsEnabled}
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
                                <option value="light">{t("audioProduction.compressionLight")}</option>
                                <option value="medium">{t("audioProduction.compressionMedium")}</option>
                                <option value="heavy">{t("audioProduction.compressionHeavy")}</option>
                              </select>
                            </label>
                          </div>
                        </div>

                        {/* 2. Dynamic Control */}
                        <div style={{ marginBottom: "16px", padding: "8px", backgroundColor: "var(--input)", borderRadius: "3px", border: "1px solid var(--border)" }}>
                          <h5 style={{ margin: "0 0 6px 0", fontSize: "12px", color: "var(--text)", fontWeight: 500 }}>
                            {t("audioProduction.dynamicControlTitle")}
                          </h5>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input 
                                type="checkbox" 
                                checked={currentProcessingChain.dynamicControl.compression.enabled}
                                disabled={!customSettingsEnabled}
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
                              <span>{t("audioProduction.gentleCompression")}</span>
                              <select 
                                value={currentProcessingChain.dynamicControl.compression.ratio}
                                disabled={!customSettingsEnabled}
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
                                disabled={!customSettingsEnabled}
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
                              <span>{t("audioProduction.limiterSafeguard")}</span>
                            </label>
                          </div>
                        </div>

                        {/* 3. EQ Shaping */}
                        <div style={{ marginBottom: "16px", padding: "8px", backgroundColor: "var(--input)", borderRadius: "3px", border: "1px solid var(--border)" }}>
                          <h5 style={{ margin: "0 0 6px 0", fontSize: "12px", color: "var(--text)", fontWeight: 500 }}>
                            {t("audioProduction.eqShapingTitle")}
                          </h5>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input 
                                type="checkbox" 
                                checked={currentProcessingChain.eqShaping.lowMidCut.enabled}
                                disabled={!customSettingsEnabled}
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
                              <span>{t("audioProduction.lowMidCut")}</span>
                              <select 
                                value={currentProcessingChain.eqShaping.lowMidCut.frequency}
                                disabled={!customSettingsEnabled}
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
                                disabled={!customSettingsEnabled}
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
                              <span>{t("audioProduction.presenceBoost")}</span>
                              <select 
                                value={currentProcessingChain.eqShaping.presenceBoost.frequency}
                                disabled={!customSettingsEnabled}
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
                                disabled={!customSettingsEnabled}
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
                              <span>{t("audioProduction.airLift")}</span>
                              <select 
                                value={currentProcessingChain.eqShaping.airLift.frequency}
                                disabled={!customSettingsEnabled}
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
                            {t("audioProduction.processingStep4")}
                          </h5>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input 
                                type="checkbox" 
                                checked={currentProcessingChain.spatialEnhancement.reverb.enabled}
                                disabled={!customSettingsEnabled}
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
                              <span>{t("audioProduction.subtleReverb")}</span>
                              <select 
                                value={currentProcessingChain.spatialEnhancement.reverb.type}
                                disabled={!customSettingsEnabled}
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
                                <option value="room_0.3">{t("audioProduction.room03")}</option>
                                <option value="room_0.4">{t("audioProduction.room04")}</option>
                                <option value="room_0.5">{t("audioProduction.room05")}</option>
                              </select>
                            </label>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "var(--textSecondary)", paddingLeft: "24px" }}>
                              <span>{t("audioProduction.wetMix")}</span>
                              <input 
                                type="range" 
                                min="0" 
                                max="15" 
                                value={currentProcessingChain.spatialEnhancement.reverb.wetMix}
                                disabled={!customSettingsEnabled}
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
                                disabled={!customSettingsEnabled}
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
                              <span>{t("audioProduction.stereoEnhancerSubtle")}</span>
                            </label>
                          </div>
                        </div>

                        {/* 5. Consistency & Mastering */}
                        <div style={{ marginBottom: "12px", padding: "8px", backgroundColor: "var(--input)", borderRadius: "3px", border: "1px solid var(--border)" }}>
                          <h5 style={{ margin: "0 0 6px 0", fontSize: "12px", color: "var(--text)", fontWeight: 500 }}>
                            5. {t("audioProduction.consistencyMasteringTitle")}
                          </h5>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input 
                                type="checkbox" 
                                checked={currentProcessingChain.mastering.normalization.enabled}
                                disabled={!customSettingsEnabled}
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
                              <span>{t("audioProduction.normalizeAudiobook")}</span>
                              <select 
                                value={currentProcessingChain.mastering.normalization.targetLUFS}
                                disabled={!customSettingsEnabled}
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
                                disabled={!customSettingsEnabled}
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
                              <span>{t("audioProduction.peakLimitMax")}</span>
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                              <input 
                                type="checkbox" 
                                checked={currentProcessingChain.mastering.dithering.enabled}
                                disabled={!customSettingsEnabled}
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
                              <span>{t("audioProduction.finalDither")}</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div style={{ color: "var(--muted)", fontStyle: "italic", textAlign: "center", padding: "32px" }}>
                  {t("audioProduction.selectSegmentPrompt")}
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
          {message || t("audioProduction.noAudioSegments")}
        </div>
      ) : (
        <div style={{
          textAlign: "center",
          padding: "48px",
          color: "var(--textSecondary)",
          fontSize: "14px"
        }}>
                    {t("audioProduction.selectChapterPrompt")}
        </div>
      )}
    </div>
  );
}
