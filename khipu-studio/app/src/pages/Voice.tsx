import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { useAudioPreview } from "../hooks/useAudioPreview";
import { createDefaultProcessingChain } from "../lib/audio-production-utils";
import AudioProductionService from "../lib/audio-production-service";
import { AUDIO_PRESETS, getPresetsByCategory, getPresetById, type AudioPreset } from "../data/audio-presets";
import { validateWavFile, createSfxSegment, insertSegmentAtPosition } from "../lib/additional-segments";
import { TextDisplay } from "../components/KaraokeTextDisplay";
import { PageHeader } from "../components/PageHeader";
import { StandardButton } from "../components/StandardButton";
import type { PlanChunk } from "../types/plan";
import type { AudioProcessingChain } from "../types/audio-production";
import type { AudioSegmentRow } from "../types/audio-production";
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

export default function AudioProductionPage({ onStatus }: { onStatus: (s: string) => void }) {
  const { t } = useTranslation();
  
  // Helper function to get translated preset name and description
  const getTranslatedPreset = useCallback((preset: AudioPreset) => {
    // Convert preset ID from underscore format to camelCase for translation keys
    const camelCaseId = preset.id.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    const nameKey = `audioPresets.${camelCaseId}.name`;
    const descriptionKey = `audioPresets.${camelCaseId}.description`;
    
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
  const [selectedChapter, setSelectedChapter] = useState<string>("");
  const [audioSegments, setAudioSegments] = useState<AudioSegmentRow[]>([]);
  const [generatingAudio, setGeneratingAudio] = useState<Set<string>>(new Set());
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('clean_polished');
  const [revisionMarks, setRevisionMarks] = useState<Set<string>>(new Set()); // Track segments marked for revision
  
  // Additional segments state
  const [showSfxDialog, setShowSfxDialog] = useState(false);
  const [insertPosition, setInsertPosition] = useState<number>(-1); // Where to insert new segment
  
  // Effect chain section collapse states - all collapsed by default
  const [sectionExpanded, setSectionExpanded] = useState({
    noiseCleanup: false,
    dynamicControl: false,
    eqShaping: false,
    spatialEnhancement: false,
    consistencyMastering: false
  });

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
              // Use the current format (just segment_id as string)
              processingChainMap[currentSegment.chunkId] = newChain;
              
              // Also add other segments that have custom processing chains
              audioSegments.forEach(segment => {
                if (segment.processingChain && segment.chunkId !== currentSegment.chunkId) {
                  // Use consistent format for all segments
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
        return;
      }

      // Handle both formats: direct array or object with chunks property
      let segments: Segment[];
      if (Array.isArray(planData)) {
        console.log("Plan data is direct array format (segments), length:", planData.length);
        segments = planData;
      } else if (planData && typeof planData === 'object' && 'chunks' in planData && Array.isArray((planData as { chunks: unknown }).chunks)) {
        console.log("Plan data has chunks property, length:", ((planData as { chunks: unknown[] }).chunks).length);
        // Convert PlanChunk format to Segment format if needed
        const chunks = (planData as { chunks: PlanChunk[] }).chunks;
        segments = chunks.map((chunk, index) => ({
          segment_id: index + 1,
          start_idx: chunk.start_char || 0,
          end_idx: chunk.end_char || 0,
          delimiter: "newline",
          voice: chunk.voice || "",
          text: chunk.text || "",
          originalText: chunk.text || ""
        }));
      } else {
        console.warn("Plan file has no valid segments or chunks data:", planData);

        return;
      }

      console.log("Plan segments found:", segments.length);
      
      // Debug: Check the actual structure of the first few segments
      if (segments.length > 0) {
        console.log("🔍 First segment keys:", Object.keys(segments[0]));
        console.log("🔍 First segment sample:", {
          ...segments[0],
          text: segments[0].text?.substring(0, 50) + '...'
        });
        if (segments.length > 1) {
          console.log("🔍 Second segment keys:", Object.keys(segments[1]));
        }
      }

      // Initialize audio production metadata from plan data
      // Convert segments to chunks for the audio service (which expects PlanChunk format)
      const chunksForAudio: PlanChunk[] = segments.map((segment) => ({
        id: segment.segment_id.toString(),
        text: segment.text,
        locked: false,
        voice: segment.voice,
        start_char: segment.start_idx,
        end_char: segment.end_idx
      }));

      // This will create/load the audio production configuration and check existing files
      await audioProductionService.initializeFromPlan(chapterId, chunksForAudio);
      const completionStatus = await audioProductionService.getChapterCompletionStatus(chapterId);

      // Convert plan segments to audio segment rows with proper audio tracking
      const audioSegmentRows: AudioSegmentRow[] = segments.map((segment, index) => {
        const chunkId = segment.segment_id.toString();
        const segmentStatus = completionStatus.segmentStatuses.find(s => s.chunkId === chunkId);
        const audioPath = `audio/${chapterId}/${chunkId}.wav`;
        
        console.log(`🔍 Loading segment ${index}:`, { 
          segment_id: segment.segment_id,
          displayOrder: index,
          chunkId: chunkId,
          chunkIdType: typeof chunkId,
          text: segment.text?.substring(0, 50) + '...',
          allKeys: Object.keys(segment)
        });
        
        return {
          rowKey: `${chapterId}_${chunkId}_${index}`,
          segmentId: segment.segment_id, // The actual segment ID - source of truth for correlation
          displayOrder: index, // Current display order (0-based)
          chunkId: chunkId, // String representation for compatibility
          text: segment.text,
          voice: segment.voice || "",
          locked: false, // segments don't have locked property
          sfxAfter: null,
          hasAudio: segmentStatus?.hasAudio || false,
          audioPath,
          start_char: segment.start_idx,
          end_char: segment.end_idx,
          segmentType: 'plan' as const, // Original plan segments
          isAdditional: false
        };
      });

      setAudioSegments(audioSegmentRows);
      
      // Load and merge additional segments (sound effects)
      try {
        const additionalSegments = await audioProductionService.loadAdditionalSegments(chapterId);
        
        if (additionalSegments.sfxSegments.length > 0) {
          console.log(`🎵 Loading ${additionalSegments.sfxSegments.length} additional sound effect segments`);
          
          // Convert additional segments to AudioSegmentRow format
          const additionalRows: AudioSegmentRow[] = additionalSegments.sfxSegments.map((sfxSegment, index) => ({
            rowKey: `${chapterId}_${sfxSegment.id}_sfx`,
            segmentId: -1 - index, // Use negative IDs for SFX segments to avoid conflicts
            displayOrder: sfxSegment.displayOrder,
            chunkId: sfxSegment.id,
            text: `[SFX: ${sfxSegment.sfxFile.filename}]`,
            voice: "",
            locked: false,
            sfxAfter: null,
            hasAudio: sfxSegment.sfxFile.validated || false,
            audioPath: sfxSegment.sfxFile.path,
            start_char: 0,
            end_char: 0,
            segmentType: 'sfx' as const,
            isAdditional: true,
            sfxFile: sfxSegment.sfxFile,
            processingChain: sfxSegment.processingChain
          }));
          
          // Merge with plan segments and sort by display order
          const allSegments = [...audioSegmentRows, ...additionalRows]
            .sort((a, b) => a.displayOrder - b.displayOrder);
          
          setAudioSegments(allSegments);
          console.log(`🎵 Merged ${audioSegmentRows.length} plan segments with ${additionalRows.length} SFX segments`);
        }
      } catch (error) {
        console.warn('Failed to load additional segments:', error);
        // Continue with just plan segments if additional segments fail to load
      }
      
      // Load revision marks from plan data
      const revisionMarkedChunks = new Set<string>();
      if (Array.isArray(planData)) {
        console.log(`🚩 Loading revision marks from plan data...`);
        segments.forEach((segment: Segment & { needsRevision?: boolean }) => {
          console.log(`🚩 Segment ${segment.segment_id}: needsRevision = ${segment.needsRevision}`);
          if (segment.needsRevision) {
            revisionMarkedChunks.add(segment.segment_id.toString());
            console.log(`🚩 Added segment ${segment.segment_id} to revision marks`);
          }
        });
      }
      console.log(`🚩 Loaded ${revisionMarkedChunks.size} segments marked for revision:`, Array.from(revisionMarkedChunks));
      setRevisionMarks(revisionMarkedChunks);
      
      // Ensure a segment is selected when segments are loaded
      if (audioSegmentRows.length > 0) {
        setSelectedRowIndex(prev => {
          if (prev < 0 || prev >= audioSegmentRows.length) {
            return 0;
          }
          return prev;
        });
      }
      
      // Load saved processing chains for this chapter
      try {
        const savedProcessingChains = await audioProductionService.loadProcessingChains(chapterId);
        
        if (Object.keys(savedProcessingChains).length > 0) {
          console.log('💾 Loading saved processing chains for segments:', Object.keys(savedProcessingChains));
          
          // Apply saved processing chains to matching segments
          setAudioSegments(prev => prev.map(segment => {
            // Try both old format ("segment_X") and new format ("X") for backward compatibility
            let processingChain = savedProcessingChains[segment.chunkId];
            if (!processingChain) {
              // Try old format with "segment_" prefix
              processingChain = savedProcessingChains[`segment_${segment.chunkId}`];
            }
            
            if (processingChain) {
              console.log(`💾 Found processing chain for segment ${segment.chunkId} (segmentId: ${segment.segmentId})`);
              return {
                ...segment,
                processingChain: processingChain
              };
            }
            return segment;
          }));
          
        }
      } catch (error) {
        console.warn('Failed to load processing chains:', error);
      }
      
      // Update processing chain from metadata - this would set a default for all segments
      // For now, we'll comment this out to let segments manage their own chains
      // setProcessingChain(audioMetadata.globalProcessingChain);
      

    } catch (error) {
      console.error("Failed to load plan data:", error);

    }
  }, [root, audioProductionService]);

  const loadChapters = useCallback(async () => {
    if (!root) return;
    
    try {
      setLoading(true);

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

  const handleGenerateSegmentAudio = useCallback(async (rowIndex: number) => {
    const segment = audioSegments[rowIndex];
    if (!segment || !selectedChapter || !audioProductionService || generatingAudio.has(segment.chunkId)) return;

    setGeneratingAudio(prev => new Set(prev).add(segment.chunkId));
    
    try {

      
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
      

    } catch (error) {
      console.error("Failed to generate audio:", error);

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


    
    for (let i = 0; i < audioSegments.length; i++) {
      if (!audioSegments[i].hasAudio) {
        await handleGenerateSegmentAudio(i);
      }
    }
    

  }, [selectedChapter, audioSegments, handleGenerateSegmentAudio]);

  // Audio preview handlers
  const handlePlaySegment = useCallback(async (segmentIndex?: number) => {
    const index = segmentIndex ?? selectedRowIndex;
    const segment = audioSegments[index];
    
    if (!segment || !root) {

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

    }
  }, [selectedRowIndex, audioSegments, audioPreview, currentProcessingChain, root, selectedChapter]);

  // Handle row click: set selection and play audio
  const handleRowClick = useCallback(async (index: number) => {
    setSelectedRowIndex(index);
    
    try {
      await handlePlaySegment(index);
    } catch (error) {
      console.error('Failed to play segment audio:', error);
    }
  }, [handlePlaySegment]);

  const handleStopAudio = useCallback(async () => {
    try {
      await audioPreview.stop();
    } catch (error) {
      console.error("Stop failed:", error);
    }
  }, [audioPreview]);

  // Revision mark helper functions
  const saveRevisionToPlan = useCallback(async (segmentIdStr: string, marked: boolean) => {
    if (!root || !selectedChapter) return;

    try {
      // Load current plan data
      const planPath = `ssml/plans/${selectedChapter}.plan.json`;
      console.log(`🚩 Saving revision mark for segmentId: ${segmentIdStr}, marked: ${marked} to ${planPath}`);
      
      const planData = await window.khipu!.call("fs:read", {
        projectRoot: root,
        relPath: planPath,
        json: true,
      });

      console.log(`🚩 Loaded plan data:`, Array.isArray(planData) ? planData.slice(0, 2) : 'Not an array');

      if (Array.isArray(planData)) {
        // Update the segment with revision mark - match by segment_id
        let found = false;
        const updatedPlan = planData.map((segment: Segment) => {
          console.log(`🚩 Checking segment ${segment.segment_id} (${typeof segment.segment_id}) against segmentId ${segmentIdStr} (${typeof segmentIdStr})`);
          if (segment.segment_id.toString() === segmentIdStr) {
            found = true;
            console.log(`🚩 Found matching segment by ID, updating revision mark to: ${marked}`);
            return { ...segment, needsRevision: marked };
          }
          return segment;
        });

        if (!found) {
          console.warn(`🚩 No segment found with segmentId: ${segmentIdStr}`);
          console.log(`🚩 Available segment IDs:`, planData.map(s => s.segment_id));
        }

        // Save back to plan file
        console.log(`🚩 Saving updated plan with ${updatedPlan.filter((s: Segment & { needsRevision?: boolean }) => s.needsRevision).length} marked segments`);
        await window.khipu!.call("fs:write", {
          projectRoot: root,
          relPath: planPath,
          content: JSON.stringify(updatedPlan, null, 2),
        });
        console.log(`🚩 Successfully saved revision marks to plan file`);
      }
    } catch (error) {
      console.error("Error saving revision mark to plan:", error);
      throw error;
    }
  }, [root, selectedChapter]);

  const saveRevisionToAudioMetadata = useCallback(async (chunkId: string, marked: boolean) => {
    if (!audioProductionService || !selectedChapter) return;

    try {
      await audioProductionService.updateSegmentMetadata(selectedChapter, chunkId, {
        overrides: {
          notes: marked ? "Marked for revision" : undefined
        }
      });
    } catch (error) {
      console.error("Error saving revision mark to audio metadata:", error);
      throw error;
    }
  }, [audioProductionService, selectedChapter]);

  const handleToggleRevisionMark = useCallback(async (segmentIndex: number) => {
    if (segmentIndex < 0 || segmentIndex >= audioSegments.length || !root || !selectedChapter) {
      return;
    }

    const segment = audioSegments[segmentIndex];
    // Use segmentId as the correlation key - this ensures proper mapping with planning data
    const segmentIdStr = segment.segmentId.toString();
    const isCurrentlyMarked = revisionMarks.has(segmentIdStr);
    
    console.log(`🚩 Toggling revision mark for segment at displayOrder ${segmentIndex}, segmentId: ${segment.segmentId}, currently marked: ${isCurrentlyMarked}`);
    
    try {
      // Update local state immediately for UI responsiveness
      setRevisionMarks(prev => {
        const newMarks = new Set(prev);
        if (isCurrentlyMarked) {
          newMarks.delete(segmentIdStr);
        } else {
          newMarks.add(segmentIdStr);
        }
        return newMarks;
      });

      // Save revision mark to both planning data and audio metadata
      // Pass the actual segmentId, not the chunkId
      await Promise.all([
        saveRevisionToPlan(segmentIdStr, !isCurrentlyMarked),
        saveRevisionToAudioMetadata(segment.chunkId, !isCurrentlyMarked) // Audio metadata still uses chunkId for file operations
      ]);

    } catch (error) {
      console.error("Error updating revision mark:", error);
      // Revert local state on error
      setRevisionMarks(prev => {
        const newMarks = new Set(prev);
        if (isCurrentlyMarked) {
          newMarks.add(segmentIdStr);
        } else {
          newMarks.delete(segmentIdStr);
        }
        return newMarks;
      });

    }
  }, [audioSegments, revisionMarks, root, selectedChapter, saveRevisionToPlan, saveRevisionToAudioMetadata]);

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
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader 
        title={t("audioProduction.pageTitle")}
        description={t("audioProduction.pageDescription")}
        actions={
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            {/* Chapter Selector */}
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <label style={{ fontSize: "14px", fontWeight: "500", color: "var(--text)", whiteSpace: "nowrap" }}>
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

            {/* Insert SFX Button */}
            {selectedChapter && audioSegments.length > 0 && (
              <StandardButton
                variant="secondary"
                onClick={() => {
                  setInsertPosition(selectedRowIndex + 1);
                  setShowSfxDialog(true);
                }}
                title={t("audioProduction.insertSoundEffect")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                {t("audioProduction.insertSoundEffect")}
              </StandardButton>
            )}

            {/* Main Action Button */}
            {selectedChapter && (
              <StandardButton
                variant="primary"
                onClick={handleGenerateChapterAudio}
                disabled={audioSegments.length === 0}
              >
                {t("audioProduction.generateChapterAudio")}
              </StandardButton>
            )}
          </div>
        }
      />

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
        <div style={{ display: "grid", gridTemplateColumns: "0.4fr 1.6fr", gap: "16px", flex: 1, minHeight: 0 }}>
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
                    <th style={{ padding: "4px", textAlign: "center", color: "var(--text)", fontWeight: 500, width: "32px" }} title={t("audioProduction.revisionStatus")}>🏳</th>
                    <th style={{ padding: "8px", textAlign: "left", color: "var(--text)", fontWeight: 500 }}>{t("audioProduction.tableHeaderId")}</th>
                    <th style={{ padding: "8px", textAlign: "left", color: "var(--text)", fontWeight: 500 }}>{t("audioProduction.tableHeaderVoice")}</th>
                  </tr>
                </thead>
                <tbody>
                  {audioSegments.map((segment, index) => (
                    <tr 
                      key={segment.rowKey} 
                      onClick={() => handleRowClick(index)}
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
                      <td style={{ padding: "4px", textAlign: "center" }}>
                        <StandardButton
                          variant="secondary"
                          size="compact"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleRevisionMark(index);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            padding: "2px",
                            color: revisionMarks.has(segment.segmentId.toString()) ? "var(--warning)" : "var(--muted)",
                            opacity: revisionMarks.has(segment.segmentId.toString()) ? 1 : 0.5,
                            minWidth: "auto",
                            minHeight: "auto"
                          }}
                          title={revisionMarks.has(segment.segmentId.toString()) ? 
                            t("audioProduction.removeRevisionMark") : 
                            t("audioProduction.markForRevision")}
                        >
                          {revisionMarks.has(segment.segmentId.toString()) ? "🚩" : "🏳"}
                        </StandardButton>
                      </td>
                      <td style={{ padding: "8px", color: "inherit" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                          <span style={{ fontWeight: 500 }}>{segment.segmentId}</span>
                          <span style={{ fontSize: "10px", color: "var(--textSecondary)" }}>#{segment.displayOrder + 1}</span>
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

          {/* Right: Text Display + Audio Production Module */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* Text Display */}
            {selectedRowIndex >= 0 && selectedRowIndex < audioSegments.length && (
              <TextDisplay
                text={audioSegments[selectedRowIndex].text}
                isPlaying={audioPreview.isPlaying}
                currentTime={audioPreview.currentTime}
                totalDuration={audioPreview.duration}
                voiceName={audioSegments[selectedRowIndex].voice}
                segmentId={audioSegments[selectedRowIndex].segmentId.toString()}
              />
            )}
            
            {/* Action Buttons Toolbar - Unified audio production controls */}
            {selectedRowIndex >= 0 && selectedRowIndex < audioSegments.length && (
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "12px",
                marginBottom: "12px",
                marginTop: "12px",
                flexWrap: "wrap",
                padding: "12px",
                backgroundColor: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: "4px"
              }}>
                {/* Preview Controls with Navigation */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1px",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  padding: "1px"
                }}>
                  <StandardButton
                    variant="primary"
                    size="compact"
                    onClick={async () => {
                      if (selectedRowIndex > 0) {
                        const newIndex = selectedRowIndex - 1;
                        setSelectedRowIndex(newIndex);
                        // Automatically play the previous segment
                        await handlePlaySegment(newIndex);
                      }
                    }}
                    disabled={audioSegments.length === 0 || selectedRowIndex <= 0 || audioPreview.isLoading}
                    title={t("audioProduction.previousSegment")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "4px 8px",
                      minWidth: "36px",
                      justifyContent: "center"
                    }}
                  >
                    |◀
                  </StandardButton>

                  <StandardButton
                    variant={audioPreview.isPlaying && audioPreview.playbackState.segmentId === audioSegments[selectedRowIndex]?.chunkId ? "warning" : "primary"}
                    size="compact"
                    onClick={() => handlePlaySegment(selectedRowIndex)}
                    disabled={audioSegments.length === 0 || audioPreview.isLoading}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "4px 10px",
                      minWidth: "50px",
                      justifyContent: "center"
                    }}
                  >
                    {audioPreview.isLoading ? `⏳` :
                     audioPreview.isPlaying && audioPreview.playbackState.segmentId === audioSegments[selectedRowIndex]?.chunkId ? `⏸` :
                     `▶`}
                  </StandardButton>

                  <StandardButton
                    variant="primary"
                    size="compact"
                    onClick={async () => {
                      if (selectedRowIndex < audioSegments.length - 1) {
                        const newIndex = selectedRowIndex + 1;
                        setSelectedRowIndex(newIndex);
                        // Automatically play the next segment
                        await handlePlaySegment(newIndex);
                      }
                    }}
                    disabled={audioSegments.length === 0 || selectedRowIndex >= audioSegments.length - 1 || audioPreview.isLoading}
                    title={t("audioProduction.nextSegment")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "4px 8px",
                      minWidth: "36px",
                      justifyContent: "center"
                    }}
                  >
                    ▶|
                  </StandardButton>
                </div>

                <StandardButton
                  variant="primary"
                  size="compact"
                  onClick={async () => {
                    // Playlist approach - plays all segments continuously
                    if (audioSegments.length === 0) {
                      return;
                    }

                    if (!root) {
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
                    marginLeft: "8px",
                    padding: "4px 10px"
                  }}
                >
                  🎬 {t("audioProduction.playAll")}
                </StandardButton>

                <StandardButton
                  variant="danger"
                  size="compact"
                  onClick={handleStopAudio}
                  disabled={!audioPreview.isPlaying && !audioPreview.isLoading}
                  style={{
                    marginLeft: "4px",
                    padding: "4px 10px"
                  }}
                >
                  ⏹ {t("audioProduction.stop")}
                </StandardButton>

                {/* Separator for additional segments */}
                <div style={{ 
                  width: "1px", 
                  height: "24px", 
                  backgroundColor: "var(--border)",
                  margin: "0 8px" 
                }}></div>

                {/* Additional Segments Controls - moved to header */}
              </div>
            )}
            
            {/* Audio Production Module */}
          <div style={{ border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "8px 12px", backgroundColor: "var(--panelAccent)", borderBottom: "1px solid var(--border)", fontSize: "14px", fontWeight: 500 }}>
              {t("audioProduction.moduleTitle")}
            </div>
            
            <div style={{ flex: 1, padding: "12px", overflow: "auto" }}>
              {selectedRowIndex >= 0 && selectedRowIndex < audioSegments.length ? (
                (() => {
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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
                                fontSize: "13px", 
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
                            <div style={{ fontSize: "12px", color: "var(--textSecondary)", fontStyle: "italic" }}>
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
                          <h5 
                            style={{ 
                              margin: "0 0 6px 0", 
                              fontSize: "12px", 
                              color: "var(--text)", 
                              fontWeight: 500,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between"
                            }}
                            onClick={() => setSectionExpanded(prev => ({
                              ...prev,
                              noiseCleanup: !prev.noiseCleanup
                            }))}
                          >
                            <span>{t("audioProduction.processingStep1")}</span>
                            <span style={{ fontSize: "10px" }}>
                              {sectionExpanded.noiseCleanup ? "▼" : "▶"}
                            </span>
                          </h5>
                          {sectionExpanded.noiseCleanup && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
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
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
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
                          )}
                        </div>

                        {/* 2. Dynamic Control */}
                        <div style={{ marginBottom: "16px", padding: "8px", backgroundColor: "var(--input)", borderRadius: "3px", border: "1px solid var(--border)" }}>
                          <h5 
                            style={{ 
                              margin: "0 0 6px 0", 
                              fontSize: "12px", 
                              color: "var(--text)", 
                              fontWeight: 500,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between"
                            }}
                            onClick={() => setSectionExpanded(prev => ({
                              ...prev,
                              dynamicControl: !prev.dynamicControl
                            }))}
                          >
                            <span>{t("audioProduction.dynamicControlTitle")}</span>
                            <span style={{ fontSize: "10px" }}>
                              {sectionExpanded.dynamicControl ? "▼" : "▶"}
                            </span>
                          </h5>
                          {sectionExpanded.dynamicControl && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
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
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
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
                          )}
                        </div>

                        {/* 3. EQ Shaping */}
                        <div style={{ marginBottom: "16px", padding: "8px", backgroundColor: "var(--input)", borderRadius: "3px", border: "1px solid var(--border)" }}>
                          <h5 
                            style={{ 
                              margin: "0 0 6px 0", 
                              fontSize: "12px", 
                              color: "var(--text)", 
                              fontWeight: 500,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between"
                            }}
                            onClick={() => setSectionExpanded(prev => ({
                              ...prev,
                              eqShaping: !prev.eqShaping
                            }))}
                          >
                            <span>{t("audioProduction.eqShapingTitle")}</span>
                            <span style={{ fontSize: "10px" }}>
                              {sectionExpanded.eqShaping ? "▼" : "▶"}
                            </span>
                          </h5>
                          {sectionExpanded.eqShaping && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
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
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
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
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
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
                          )}
                        </div>

                        {/* 4. Spatial / Aesthetic Enhancements */}
                        <div style={{ marginBottom: "16px", padding: "8px", backgroundColor: "var(--input)", borderRadius: "3px", border: "1px solid var(--border)" }}>
                          <h5 
                            style={{ 
                              margin: "0 0 6px 0", 
                              fontSize: "12px", 
                              color: "var(--text)", 
                              fontWeight: 500,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between"
                            }}
                            onClick={() => setSectionExpanded(prev => ({
                              ...prev,
                              spatialEnhancement: !prev.spatialEnhancement
                            }))}
                          >
                            <span>{t("audioProduction.processingStep4")}</span>
                            <span style={{ fontSize: "10px" }}>
                              {sectionExpanded.spatialEnhancement ? "▼" : "▶"}
                            </span>
                          </h5>
                          {sectionExpanded.spatialEnhancement && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
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
                                max="100" 
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
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
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
                        )}
                        </div>

                        {/* 5. Consistency & Mastering */}
                        <div style={{ marginBottom: "12px", padding: "8px", backgroundColor: "var(--input)", borderRadius: "3px", border: "1px solid var(--border)" }}>
                          <h5 
                            style={{ 
                              margin: "0 0 6px 0", 
                              fontSize: "12px", 
                              color: "var(--text)", 
                              fontWeight: 500,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between"
                            }}
                            onClick={() => setSectionExpanded(prev => ({
                              ...prev,
                              consistencyMastering: !prev.consistencyMastering
                            }))}
                          >
                            <span>5. {t("audioProduction.consistencyMasteringTitle")}</span>
                            <span style={{ fontSize: "10px" }}>
                              {sectionExpanded.consistencyMastering ? "▼" : "▶"}
                            </span>
                          </h5>
                          {sectionExpanded.consistencyMastering && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
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
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
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
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
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
                        )}
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
          </div> {/* Close Right: Text Display + Audio Production Module container */}
        </div>
      ) : selectedChapter ? (
        <div style={{
          textAlign: "center",
          padding: "48px",
          color: "var(--textSecondary)",
          fontSize: "14px"
        }}>
          {t("audioProduction.noAudioSegments")}
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

      {/* Sound Effect Dialog */}
      {showSfxDialog && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "24px",
            minWidth: "400px",
            maxWidth: "700px"
          }}>
            <h3 style={{ margin: "0 0 16px 0", color: "var(--text)" }}>
              {t("audioProduction.insertSoundEffect")}
            </h3>
            
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: 500 }}>
                {t("audioProduction.selectWavFile")}
              </label>
              <div style={{ position: "relative", display: "inline-block", width: "100%" }}>
                <input
                  type="file"
                  accept=".wav"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file && selectedChapter && audioProductionService) {
                      try {
                        const validationResult = await validateWavFile(file);
                        if (validationResult.valid) {
                          // Create and save the SFX segment to filesystem
                          // const sfxData = {
                          //   path: `sfx/${file.name}`,
                          //   filename: file.name,
                          //   duration: validationResult.duration || 0,
                          //   validated: true
                          // };
                          
                          // const segmentId = await audioProductionService.addSfxSegment(
                          //   selectedChapter,
                          //   insertPosition,
                          //   sfxData
                          // );
                          
                          // Create UI segment and update state
                          const sfxSegment = createSfxSegment(
                            file.name,
                            `sfx/${file.name}`,
                            validationResult.duration || 0
                          );
                          
                          const updatedSegments = insertSegmentAtPosition(
                            audioSegments,
                            sfxSegment,
                            insertPosition
                          );
                          
                          setAudioSegments(updatedSegments);
                          setShowSfxDialog(false);
                        }
                      } catch (error) {
                        console.error("Error processing SFX file:", error);
                      }
                    }
                  }}
                  style={{
                    position: "absolute",
                    opacity: 0,
                    width: "100%",
                    height: "100%",
                    cursor: "pointer"
                  }}
                />
                <StandardButton
                  variant="outline"
                  style={{
                    width: "100%",
                    justifyContent: "flex-start",
                    textAlign: "left",
                    padding: "8px 12px"
                  }}
                >
                  📁 {t("audioProduction.chooseFile")}
                </StandardButton>
              </div>
              <div style={{ fontSize: "13px", color: "var(--textSecondary)", marginTop: "4px" }}>
                {t("audioProduction.wavFileRequirements")}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <StandardButton
                variant="secondary"
                onClick={() => setShowSfxDialog(false)}
              >
                {t("common.cancel")}
              </StandardButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
