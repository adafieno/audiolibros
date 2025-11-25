import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { useAudioPreview } from "../hooks/useAudioPreview";
import { createDefaultProcessingChain } from "../lib/audio-production-utils";
import AudioProductionService from "../lib/audio-production-service";
import { AUDIO_PRESETS, getPresetsByCategory, getPresetById, type AudioPreset } from "../data/audio-presets";
import { validateAudioFile } from "../lib/additional-segments";
import { TextDisplay } from "../components/KaraokeTextDisplay";
import { PageHeader } from "../components/PageHeader";
import { StandardButton } from "../components/StandardButton";
import type { PlanChunk } from "../types/plan";
import type { AudioProcessingChain } from "../types/audio-production";
import type { AudioSegmentRow } from "../types/audio-production";
import type { Segment } from "../types/plan";
import type { Character } from "../types/character";
import type { ProjectConfig } from "../types/config";

// Hardware-style Rotary Knob Component
const RotaryKnob = ({ value, min, max, label, color, disabled, onChange }: { value: number; min: number; max: number; label: string; color: string; disabled: boolean; onChange: (v: number) => void }) => {
  const normalizedValue = (value - min) / (max - min);
  const rotation = -135 + (normalizedValue * 270); // -135° to +135° range
  
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", opacity: disabled ? 0.5 : 1 }}>
      <div 
        style={{ 
          width: "48px", 
          height: "48px", 
          borderRadius: "50%",
          background: `radial-gradient(circle at 30% 30%, #2a2a2a, #0d0d0d)`,
          border: "3px solid #1a1a1a",
          boxShadow: `inset 0 2px 4px rgba(0,0,0,0.8), 0 2px 8px ${color}40`,
          position: "relative",
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "all 0.2s"
        }}
        onClick={() => {
          if (disabled) return;
          const input = document.createElement('input');
          input.type = 'range';
          input.min = min.toString();
          input.max = max.toString();
          input.value = value.toString();
          input.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:60px;opacity:0.01;';
          document.body.appendChild(input);
          input.focus();
          input.click();
          input.addEventListener('input', (e) => onChange(Number((e.target as HTMLInputElement).value)));
          input.addEventListener('blur', () => input.remove());
        }}
      >
        {/* Knob indicator */}
        <div style={{ 
          position: "absolute", 
          top: "6px", 
          left: "50%", 
          width: "3px", 
          height: "16px", 
          background: color,
          boxShadow: `0 0 6px ${color}`,
          transformOrigin: "50% 18px",
          transform: `translateX(-50%) rotate(${rotation}deg)`,
          transition: "transform 0.2s",
          borderRadius: "2px"
        }} />
        {/* Center dot */}
        <div style={{ 
          position: "absolute", 
          top: "50%", 
          left: "50%", 
          width: "8px", 
          height: "8px", 
          borderRadius: "50%",
          background: "#0d0d0d",
          border: `1px solid ${color}`,
          transform: "translate(-50%, -50%)"
        }} />
      </div>
      <div style={{ 
        fontFamily: "'Courier New', monospace", 
        fontSize: "10px", 
        color: color,
        textAlign: "center",
        textTransform: "uppercase",
        letterSpacing: "0.5px"
      }}>
        {label}
      </div>
      <div style={{ 
        fontFamily: "'Courier New', monospace", 
        fontSize: "11px", 
        color: "#999",
        background: "rgba(0,0,0,0.6)",
        padding: "2px 6px",
        borderRadius: "2px",
        border: "1px solid #333",
        minWidth: "36px",
        textAlign: "center"
      }}>
        {value}
      </div>
    </div>
  );
};

// Hardware-style VU Meter Component
const VUMeter = ({ level, label, color }: { level: number; label: string; color: string }) => {
  const segments = 12;
  const activeSegments = Math.round((level / 100) * segments);
  
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ 
        fontFamily: "'Courier New', monospace", 
        fontSize: "9px", 
        color: "#999",
        textTransform: "uppercase",
        letterSpacing: "0.5px"
      }}>
        {label}
      </div>
      <div style={{ 
        display: "flex", 
        gap: "2px", 
        background: "#0d0d0d",
        padding: "4px",
        borderRadius: "3px",
        border: "1px solid #1a1a1a"
      }}>
        {Array.from({ length: segments }).map((_, i) => {
          const isActive = i < activeSegments;
          const segmentColor = i < segments * 0.7 ? color : i < segments * 0.9 ? "#ffaa00" : "#ff3333";
          return (
            <div 
              key={i}
              style={{ 
                width: "6px", 
                height: "20px",
                background: isActive ? segmentColor : "#222",
                boxShadow: isActive ? `0 0 4px ${segmentColor}` : "none",
                transition: "all 0.2s",
                borderRadius: "1px"
              }} 
            />
          );
        })}
      </div>
    </div>
  );
};

// Analog VU Meter Component with Needle
const AnalogVUMeter = ({ level, isPlaying }: { level: number; isPlaying: boolean }) => {
  const [currentLevel, setCurrentLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  
  useEffect(() => {
    if (isPlaying) {
      // More realistic audio dynamics - mostly hovering around -6 to -3 dB (70-85%)
      const interval = setInterval(() => {
        const random = Math.random();
        let targetLevel;
        
        if (random < 0.7) {
          // 70% of the time: normal speech levels (-10 to -3 dB)
          targetLevel = 60 + Math.random() * 20; // 60-80%
        } else if (random < 0.9) {
          // 20% of the time: louder peaks (-3 to 0 dB)
          targetLevel = 80 + Math.random() * 15; // 80-95%
        } else {
          // 10% of the time: quiet passages (-20 to -10 dB)
          targetLevel = 30 + Math.random() * 30; // 30-60%
        }
        
        // Smooth transition with attack and decay
        setCurrentLevel(prev => {
          const diff = targetLevel - prev;
          const attack = diff > 0 ? 0.3 : 0.4; // Much faster decay for audio pauses
          return prev + diff * attack;
        });
        
        setPeakLevel(prev => Math.max(prev * 0.98, currentLevel)); // Slower decay for peaks
      }, 50);
      return () => clearInterval(interval);
    } else {
      // Smooth return to rest position (far left)
      const interval = setInterval(() => {
        setCurrentLevel(prev => prev * 0.85);
        setPeakLevel(prev => prev * 0.9);
        if (currentLevel < 0.5) {
          setCurrentLevel(0);
          setPeakLevel(0);
        }
      }, 50);
      return () => clearInterval(interval);
    }
  }, [isPlaying, currentLevel]);
  
  // Map percentage to dB scale and needle angle
  // 0% = -20dB at 275° (pointing to lower left), 100% = +3dB at 15° (pointing to lower right)
  // Since 15° is less than 275°, we need to go from 275° down to 15° = going counterclockwise
  // But we want clockwise motion, so we add: 275° + angle increment
  // To go from 275° to 15° clockwise, we actually go 275° → 360° → 15° = +100° total
  const needleRotation = 275 + (currentLevel / 100) * 100;
  
  return (
    <div style={{
      width: "180px",
      height: "110px",
      background: "linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)",
      borderRadius: "6px",
      border: "1px solid #444",
      boxShadow: "0 4px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "8px",
      position: "relative"
    }}>
      {/* Meter face with vintage paper texture */}
      <div style={{
        width: "164px",
        height: "85px",
        background: "radial-gradient(ellipse at center top, #fffae0 0%, #f7e8c0 40%, #ead9a8 100%)",
        borderRadius: "4px",
        position: "relative",
        overflow: "hidden",
        boxShadow: "inset 0 -2px 6px rgba(0,0,0,0.08), inset 0 2px 4px rgba(255,255,255,0.6), 0 1px 0 rgba(255,255,255,0.4)",
        border: "1px solid #c9b897"
      }}>
        {/* Scale background */}
        <svg width="164" height="85" style={{ position: "absolute", top: 0, left: 0 }}>
          <defs>
            <linearGradient id="greenGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: "#2d5f2d", stopOpacity: 0.15 }} />
              <stop offset="100%" style={{ stopColor: "#4a8f4a", stopOpacity: 0.15 }} />
            </linearGradient>
            <linearGradient id="redGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: "#c04040", stopOpacity: 0.15 }} />
              <stop offset="100%" style={{ stopColor: "#d84040", stopOpacity: 0.15 }} />
            </linearGradient>
          </defs>
          
          {/* Green safe zone arc (covers -20 to 0 dB) */}
          <path
            d="M 35 63 A 45 45 0 0 1 98 22"
            fill="none"
            stroke="url(#greenGrad)"
            strokeWidth="14"
          />
          
          {/* Red danger zone arc (0 to +3 dB) */}
          <path
            d="M 98 22 A 45 45 0 0 1 129 63"
            fill="none"
            stroke="url(#redGrad)"
            strokeWidth="14"
          />
          
          {/* Major tick marks and labels */}
          {[
            { label: '-20', angle: 165 },
            { label: '-10', angle: 135 },
            { label: '-5', angle: 105 },
            { label: '0', angle: 75, bold: true },
            { label: '+1', angle: 55, red: true },
            { label: '+2', angle: 35, red: true },
            { label: '+3', angle: 15, red: true }
          ].map((tick, i) => {
            const rad = (tick.angle * Math.PI) / 180;
            const innerRadius = 40;
            const outerRadius = tick.bold ? 48 : 46;
            const labelRadius = 30;
            const x1 = 82 + Math.cos(rad) * innerRadius;
            const y1 = 70 - Math.sin(rad) * innerRadius;
            const x2 = 82 + Math.cos(rad) * outerRadius;
            const y2 = 70 - Math.sin(rad) * outerRadius;
            const labelX = 82 + Math.cos(rad) * labelRadius;
            const labelY = 70 - Math.sin(rad) * labelRadius;
            
            return (
              <g key={i}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={tick.red ? "#8b0000" : "#000"}
                  strokeWidth={tick.bold ? "2" : "1.5"}
                />
                <text
                  x={labelX}
                  y={labelY + 3}
                  textAnchor="middle"
                  fontSize={tick.bold ? "9" : "7"}
                  fontWeight={tick.bold ? "bold" : "normal"}
                  fill={tick.red ? "#8b0000" : "#000"}
                  fontFamily="Arial, sans-serif"
                >
                  {tick.label}
                </text>
              </g>
            );
          })}
          
          {/* Minor tick marks - different density for left and right */}
          {[...Array.from({ length: 6 }).map((_, i) => {
            // Left side (negative dB): fewer ticks, compressed scale
            return 165 - ((i + 1) * 15);
          }), ...Array.from({ length: 3 }).map((_, i) => {
            // Right side (positive dB): 20° spacing
            return 65 - ((i + 1) * 10);
          })].map((angle, i) => {
            // Skip positions where major ticks are
            const isMajorAngle = [165, 135, 105, 75, 55, 35, 15].some(a => Math.abs(angle - a) < 4);
            if (isMajorAngle) return null;
            
            const rad = (angle * Math.PI) / 180;
            const x1 = 82 + Math.cos(rad) * 42;
            const y1 = 70 - Math.sin(rad) * 42;
            const x2 = 82 + Math.cos(rad) * 45;
            const y2 = 70 - Math.sin(rad) * 45;
            
            return (
              <line
                key={`minor-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#333"
                strokeWidth="0.5"
              />
            );
          })}
        </svg>
        
        {/* VU label */}
        <div style={{
          position: "absolute",
          top: "3px",
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: "11px",
          fontWeight: "bold",
          letterSpacing: "2px",
          color: "#000",
          fontFamily: "Arial, sans-serif"
        }}>
          VU
        </div>
        
        {/* Needle assembly */}
        <div style={{
          position: "absolute",
          bottom: "15px",
          left: "82px",
          width: "100px",
          height: "100px",
          transformOrigin: "0% 100%",
          transform: `rotate(${needleRotation}deg)`,
          transition: "transform 0.08s ease-out"
        }}>
          {/* Needle shaft */}
          <div style={{
            position: "absolute",
            bottom: "0",
            left: "0",
            width: "0.5px",
            height: "50px",
            background: "#000",
            boxShadow: "none"
          }} />
          
          {/* Needle tip */}
          <div style={{
            position: "absolute",
            top: "-3px",
            left: "-1px",
            width: "0",
            height: "0",
            borderLeft: "1px solid transparent",
            borderRight: "1px solid transparent",
            borderBottom: "4px solid #000"
          }} />
        </div>
        
        {/* Pivot point (screw head) */}
        <div style={{
          position: "absolute",
          bottom: "15px",
          left: "79px",
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: "radial-gradient(circle at 30% 30%, #888, #333)",
          border: "0.5px solid #000",
          boxShadow: "0 1px 2px rgba(0,0,0,0.5)",
          zIndex: 10
        }}>
          <div style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "3px",
            height: "0.5px",
            backgroundColor: "#555",
            transform: "translate(-50%, -50%)"
          }} />
        </div>
      </div>
      
      {/* Bottom label plate */}
      <div style={{
        marginTop: "4px",
        fontSize: "8px",
        color: "#999",
        fontFamily: "monospace",
        letterSpacing: "0.5px"
      }}>
        {isPlaying ? "ACTIVE" : "STANDBY"}
      </div>
    </div>
  );
};

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
  const [generatingChapterAudio, setGeneratingChapterAudio] = useState(false);
  const [chapterGenerationProgress, setChapterGenerationProgress] = useState<{
    phase: 'segments' | 'concatenating' | 'completed';
    currentSegment: number;
    totalSegments: number;
    message: string;
  } | null>(null);
  const [chapterCompleteFiles, setChapterCompleteFiles] = useState<Set<string>>(new Set());
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('clean_polished');
  const [revisionMarks, setRevisionMarks] = useState<Set<string>>(new Set()); // Track segments marked for revision
  
  // Additional segments state
  const [showSfxDialog, setShowSfxDialog] = useState(false);
  const [insertPosition, setInsertPosition] = useState<number>(-1); // Where to insert new segment
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileValidationResult, setFileValidationResult] = useState<{
    valid: boolean;
    error?: string;
    duration?: number;
    sampleRate?: number;
    channels?: number;
    bitDepth?: number;
    format?: string;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  
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
  
  // SFX audio playback state
  const [currentSfxAudio, setCurrentSfxAudio] = useState<{
    audio: HTMLAudioElement;
    segmentId: string;
    duration: number;
    currentTime: number;
    isPlaying: boolean;
  } | null>(null);

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

  // Helper function to process and validate an audio file
  const processAudioFile = useCallback(async (file: File) => {
    setSelectedFile(file);
    setValidationError(null);
    setFileValidationResult(null);
    
    try {
      const validationResult = await validateAudioFile(file);
      setFileValidationResult(validationResult);
      
      if (!validationResult.valid) {
        setValidationError(validationResult.error || "Invalid audio file");
        return false;
      }
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setValidationError(errorMessage);
      return false;
    }
  }, []);

  // Helper function to handle file selection (validation only)
  const handleFileSelection = useCallback(async (file: File) => {
    await processAudioFile(file);
  }, [processAudioFile]);
  
  // Helper function to actually import and add the selected file
  const handleImportSelectedFile = useCallback(async () => {
    if (!selectedFile || !fileValidationResult?.valid || !selectedChapter || !audioProductionService || !root) {
      return;
    }
    
    try {
      setImportStatus("🔄 Converting and saving audio file...");
      setValidationError(null);
      
      // Convert file to ArrayBuffer for transmission to Electron
      const arrayBuffer = await selectedFile.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Generate WAV filename (replace extension)
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, "");
      const wavFilename = `${nameWithoutExt}.wav`;
      const targetPath = `sfx/${wavFilename}`;
      
      // Convert and save the audio file
      const saveResult = await window.khipu!.call("audio:convertAndSave", {
        projectRoot: root,
        audioData: Array.from(uint8Array), // Convert to regular array for IPC
        filename: selectedFile.name,
        targetPath: targetPath
      });
      
      if (!saveResult.success) {
        throw new Error(saveResult.error || "Failed to save audio file");
      }
      
      console.log(`🎵 Successfully saved audio file: ${saveResult.savedPath}`);
      
      // Create the SFX file metadata
      const sfxFileData = {
        filename: wavFilename,
        path: targetPath,
        duration: fileValidationResult.duration || 0
      };
      
      // Calculate the correct display order to insert before the selected position
      // insertPosition is the row index where we want to insert BEFORE
      // We'll save the raw insertPosition and let the loading logic handle proper ordering
      const targetDisplayOrder = insertPosition;
      
      // Save SFX metadata to persistent storage
      const savedSegmentId = await audioProductionService.addSfxSegment(
        selectedChapter,
        targetDisplayOrder,
        sfxFileData
      );
      
      console.log(`💾 Saved SFX metadata with ID: ${savedSegmentId}`);
      
      // Reload the chapter data to include the new SFX segment
      await loadPlanData(selectedChapter);
      
      setImportStatus("✅ Audio file imported successfully!");
      
      // Hide the dialog after a short delay
      setTimeout(() => {
        setShowSfxDialog(false);
        // Reset state
        setSelectedFile(null);
        setFileValidationResult(null);
        setValidationError(null);
        setImportStatus(null);
      }, 1000);
      
    } catch (error) {
      console.error('Failed to import SFX file:', error);
      setValidationError(`Failed to import audio file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setImportStatus(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile, fileValidationResult, selectedChapter, audioProductionService, root, insertPosition]); // loadPlanData intentionally omitted to avoid circular dependency

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

  const loadAudioProductionData = useCallback(async (chapterId: string, planSegments: AudioSegmentRow[]) => {
    if (!audioProductionService || !chapterId) {
      return planSegments;
    }

    try {
      console.log(`🎵 Loading audio production data for chapter ${chapterId}`);
      
      // Load additional segments (sound effects)
      const additionalSegments = await audioProductionService.loadAdditionalSegments(chapterId);
      
      if (additionalSegments.sfxSegments.length > 0) {
        console.log(`🎵 Loading ${additionalSegments.sfxSegments.length} additional sound effect segments`);
        
        // Create a mixed array of all segments with their intended positions
        const allSegmentsWithPositions: Array<{
          segment: AudioSegmentRow;
          originalPosition: number;
          type: 'plan' | 'sfx';
        }> = [];
        
        // Add plan segments (their position is their current index)
        planSegments.forEach((planSegment, index) => {
          allSegmentsWithPositions.push({
            segment: planSegment,
            originalPosition: index,
            type: 'plan'
          });
        });
        
        // Add SFX segments (their position is where they want to be inserted)
        additionalSegments.sfxSegments.forEach((sfxSegment, sfxIndex) => {
          const sfxRow: AudioSegmentRow = {
            rowKey: `${chapterId}_${sfxSegment.id}_sfx`,
            segmentId: -1 - sfxIndex, // Use negative IDs for SFX segments to avoid conflicts
            displayOrder: 0, // Will be recalculated below
            chunkId: sfxSegment.id,
            text: `[SFX: ${sfxSegment.sfxFile.filename}]`,
            voice: "SFX",
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
          };
          
          allSegmentsWithPositions.push({
            segment: sfxRow,
            originalPosition: sfxSegment.displayOrder, // This is the intended insertion position
            type: 'sfx'
          });
        });
        
        // Sort by insertion position, with SFX segments inserted before plan segments at the same position
        allSegmentsWithPositions.sort((a, b) => {
          if (a.originalPosition === b.originalPosition) {
            // If same position, SFX comes before plan segments
            return a.type === 'sfx' ? -1 : 1;
          }
          return a.originalPosition - b.originalPosition;
        });
        
        // Extract the sorted segments and assign clean sequential display orders
        const finalSegments = allSegmentsWithPositions.map((item, index) => ({
          ...item.segment,
          displayOrder: index
        }));
        
        console.log(`🎵 Merged ${planSegments.length} plan segments with ${additionalSegments.sfxSegments.length} SFX segments`);
        console.log(`🔍 Final arrangement:`, finalSegments.map(s => ({ id: s.chunkId, type: s.segmentType, displayOrder: s.displayOrder })));
        
        return finalSegments;
      }
    } catch (error) {
      console.warn('Failed to load audio production data:', error);
    }
    
    // Return plan segments if no additional segments or if loading failed
    return planSegments;
  }, [audioProductionService]);

  // SFX management functions
  const moveSfxSegment = useCallback(async (segmentIndex: number, direction: 'up' | 'down') => {
    if (!selectedChapter || !audioProductionService) return;
    
    const segment = audioSegments[segmentIndex];
    if (!segment || segment.segmentType !== 'sfx') return;
    
    // Calculate new insertion position
    let newInsertPosition: number;
    if (direction === 'up') {
      newInsertPosition = Math.max(0, segmentIndex - 1);
    } else {
      newInsertPosition = Math.min(audioSegments.length - 1, segmentIndex + 1);
    }
    
    // Store the segment ID to track after reload
    const movedSegmentId = segment.chunkId;
    const wasSelected = selectedRowIndex === segmentIndex;
    
    try {
      // Update the SFX segment's display order in storage
      await audioProductionService.updateSfxSegmentPosition(selectedChapter, segment.chunkId, newInsertPosition);
      
      // Reload the chapter data to reflect the change
      await loadPlanData(selectedChapter);
      
      // If the moved segment was selected, update selection to follow it
      if (wasSelected) {
        // Find the segment in its new position
        const newIndex = audioSegments.findIndex(s => s.chunkId === movedSegmentId && s.segmentType === 'sfx');
        if (newIndex >= 0) {
          setSelectedRowIndex(newIndex);
        }
      }
      
      console.log(`🔄 Moved SFX segment ${segment.chunkId} ${direction}`);
    } catch (error) {
      console.error(`Failed to move SFX segment ${direction}:`, error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChapter, audioProductionService, audioSegments, selectedRowIndex]); // loadPlanData intentionally omitted to avoid circular dependency

  const deleteSfxSegment = useCallback(async (segmentIndex: number) => {
    if (!selectedChapter || !audioProductionService) return;
    
    const segment = audioSegments[segmentIndex];
    if (!segment || segment.segmentType !== 'sfx') return;
    
    try {
      // Remove the SFX segment from storage
      await audioProductionService.removeSfxSegment(selectedChapter, segment.chunkId);
      
      // Reload the chapter data to reflect the change
      await loadPlanData(selectedChapter);
      
      // Adjust selected row if needed
      if (selectedRowIndex >= segmentIndex) {
        setSelectedRowIndex(Math.max(0, selectedRowIndex - 1));
      }
      
      console.log(`🗑️ Deleted SFX segment ${segment.chunkId}`);
    } catch (error) {
      console.error('Failed to delete SFX segment:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChapter, audioProductionService, audioSegments, selectedRowIndex]); // loadPlanData intentionally omitted to avoid circular dependency

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

      // Load plan segments first
      setAudioSegments(audioSegmentRows);
      
      // Then load and merge audio production data (including SFX)
      const allSegments = await loadAudioProductionData(chapterId, audioSegmentRows);
      setAudioSegments(allSegments);
      
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
  }, [root, audioProductionService, loadAudioProductionData]);

  const loadChapters = useCallback(async () => {
    if (!root) return;
    
    try {
      setLoading(true);

      onStatus(t("audioProduction.loadingChapters"));
      
      const chapterList = await window.khipu!.call("chapters:list", { projectRoot: root });
      
      if (chapterList) {
        setChapters(chapterList);
        
        // Check for complete chapter files
        const completeFiles = new Set<string>();
        for (const chapter of chapterList) {
          try {
            const result = await window.khipu!.call("audio:checkChapterComplete", {
              projectRoot: root,
              chapterId: chapter.id
            });
            
            if (result.exists) {
              completeFiles.add(chapter.id);
              console.log(`✅ Complete chapter file exists for: ${chapter.id} (${result.sizeBytes} bytes)`);
            }
          } catch (error) {
            console.error(`Failed to check complete file for chapter ${chapter.id}:`, error);
          }
        }
        setChapterCompleteFiles(completeFiles);
        
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
    if (!segment || !selectedChapter || !audioProductionService || !root || generatingAudio.has(segment.chunkId)) return;

    console.log(`🎤 Simple TTS generation for segment ${segment.chunkId} (index ${rowIndex})`);
    console.log(`🎤 Segment chunkId: "${segment.chunkId}" (type: ${typeof segment.chunkId})`);
    
    setGeneratingAudio(prev => new Set(prev).add(segment.chunkId));
    
    try {
      // Load project config and characters data
      const [projectConfigResult, charactersResult] = await Promise.all([
        window.khipu!.call("fs:read", {
          projectRoot: root,
          relPath: "project.khipu.json",
          json: true,
        }).catch(() => null),
        
        window.khipu!.call("fs:read", {
          projectRoot: root,
          relPath: "dossier/characters.json", 
          json: true,
        }).catch(() => null)
      ]);

      console.log(`🎤 Data loading results:`, {
        hasProjectConfig: !!projectConfigResult,
        hasCharacters: !!charactersResult,
      });

      if (!projectConfigResult || !charactersResult) {
        throw new Error("Failed to load project configuration or characters data");
      }

      // Use the simple generation handler
      const result = await window.khipu!.call("audio:generateSegmentSimple", {
        projectRoot: root!,
        chapterId: selectedChapter,
        segment: {
          chunkId: segment.chunkId,
          text: segment.text,
          voice: segment.voice,
          segmentType: segment.segmentType,
          sfxFile: segment.sfxFile,
          processingChain: segment.processingChain || getCleanPolishedPreset()
        },
        projectConfig: projectConfigResult,
        characters: (charactersResult as { characters?: unknown[] })?.characters || charactersResult
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to generate segment audio");
      }

      console.log(`✅ Simple generation complete: ${segment.chunkId}`);
      
      // Update segment to show it has audio
      setAudioSegments(prev => {
        const updated = [...prev];
        updated[rowIndex] = { ...updated[rowIndex], hasAudio: true };
        return updated;
      });

    } catch (error) {
      console.error(`❌ Simple generation failed for ${segment.chunkId}:`, error);
      throw error;
    } finally {
      setGeneratingAudio(prev => {
        const next = new Set(prev);
        next.delete(segment.chunkId);
        return next;
      });
    }
  }, [audioSegments, selectedChapter, audioProductionService, generatingAudio, root, getCleanPolishedPreset]);

  const handleGenerateChapterAudio = useCallback(async () => {
    if (!selectedChapter || audioSegments.length === 0 || !root) return;

    setGeneratingChapterAudio(true);
    setChapterGenerationProgress({
      phase: 'segments',
      currentSegment: 0,
      totalSegments: audioSegments.filter(s => s.segmentType !== 'sfx' || !s.hasAudio).length,
      message: 'Preparing to generate individual segments...'
    });
    
    try {
      console.log(`🎬 Starting chapter audio generation for: ${selectedChapter}`);
      
      // Step 0: Clean up existing chapter files to ensure fresh generation
      console.log(`🧹 Step 0: Cleaning up existing chapter files`);
      setChapterGenerationProgress({
        phase: 'segments',
        currentSegment: 0,
        totalSegments: audioSegments.filter(s => s.segmentType !== 'sfx' || !s.hasAudio).length,
        message: 'Cleaning up existing chapter files...'
      });
      
      try {
        // Clean up individual segment files
        const cleanupResult = await window.khipu!.call('fs:cleanupChapterFiles', {
          projectRoot: root,
          chapterId: selectedChapter
        });
        
        if (cleanupResult.success) {
          console.log(`🗑️  Cleaned up ${cleanupResult.deletedCount} existing files`);
        }
      } catch (cleanupError) {
        console.warn('Failed to cleanup existing files (continuing anyway):', cleanupError);
      }
      
      // Phase 1: Generate all individual segments
      console.log(`📝 Phase 1: Generating individual segments (${audioSegments.length} total)`);
      setChapterGenerationProgress({
        phase: 'segments',
        currentSegment: 0,
        totalSegments: audioSegments.filter(s => s.segmentType !== 'sfx' || !s.hasAudio).length,
        message: 'Preparing to generate individual segments...'
      });
      
      let segmentIndex = 0;
      
      // Force generation of all speech segments (after cleanup, all need regeneration)
      const segmentsNeedingGeneration = [];
      for (let i = 0; i < audioSegments.length; i++) {
        const segment = audioSegments[i];
        
        // Skip SFX segments since they should already have audio files
        if (segment.segmentType === 'sfx' && segment.sfxFile) {
          console.log(`🎵 Skipping SFX segment: ${segment.chunkId} (SFX file)`);
          continue;
        }
        
        // All speech segments need regeneration after cleanup
        console.log(`🎙️ Segment ${segment.chunkId} will be generated (forced regeneration)`);
        segmentsNeedingGeneration.push({ segment, index: i });
      }
      
      console.log(`🎯 Regenerating ${segmentsNeedingGeneration.length} segments`);
      
      console.log(`🎤 All segments for debugging:`, audioSegments.map((seg, idx) => ({
        index: idx,
        chunkId: seg.chunkId,
        chunkIdType: typeof seg.chunkId,
        voice: seg.voice,
        hasAudio: seg.hasAudio,
        segmentType: seg.segmentType
      })));

      for (const { segment, index } of segmentsNeedingGeneration) {
        segmentIndex++;
        setChapterGenerationProgress({
          phase: 'segments',
          currentSegment: segmentIndex,
          totalSegments: segmentsNeedingGeneration.length,
          message: `Generating segment ${segmentIndex}/${segmentsNeedingGeneration.length}: ${segment.chunkId}`
        });
        
        console.log(`🎙️ Generating speech segment ${segmentIndex}/${segmentsNeedingGeneration.length}: ${segment.chunkId}`);
        
        try {
          await handleGenerateSegmentAudio(index);
          console.log(`✅ Successfully generated: ${segment.chunkId}`);
        } catch (segmentError) {
          console.error(`❌ Failed to generate segment ${segment.chunkId}:`, segmentError);
          const errorMessage = segmentError instanceof Error ? segmentError.message : String(segmentError);
          throw new Error(`Failed to generate audio for segment ${segment.chunkId}: ${errorMessage}`);
        }
      }
      
      console.log(`✅ Phase 1 complete: All individual segments ready`);
      
      // Phase 2: Concatenate all segments into complete chapter
      console.log(`🎬 Phase 2: Concatenating chapter audio`);
      setChapterGenerationProgress({
        phase: 'concatenating',
        currentSegment: audioSegments.length,
        totalSegments: audioSegments.length,
        message: 'Concatenating all segments into complete chapter file...'
      });
      
      const concatenationResult = await window.khipu!.call("audio:concatenateChapter", {
        projectRoot: root,
        chapterId: selectedChapter,
        segments: audioSegments,
        outputFileName: `${selectedChapter}_complete.wav`
      });
      
      if (!concatenationResult.success) {
        throw new Error(concatenationResult.error || "Failed to concatenate chapter audio");
      }
      
      console.log(`🎉 Successfully created complete chapter audio!`);
      console.log(`📁 Output: ${concatenationResult.outputPath}`);
      console.log(`📊 Size: ${concatenationResult.sizeBytes} bytes`);
      console.log(`⏱️  Duration: ${concatenationResult.duration}s`);
      console.log(`🔢 Segments: ${concatenationResult.segmentCount}`);
      
      // Show completion status
      setChapterGenerationProgress({
        phase: 'completed',
        currentSegment: audioSegments.length,
        totalSegments: audioSegments.length,
        message: `Chapter audio generated successfully! (${concatenationResult.sizeBytes} bytes, ${concatenationResult.duration}s)`
      });
      
      // Update complete files list
      setChapterCompleteFiles(prev => new Set([...prev, selectedChapter]));
      
      console.log(`✨ Chapter audio generation completed successfully!`);
      
    } catch (error) {
      console.error("Failed to generate chapter audio:", error);
      // TODO: Add proper error handling UI
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to generate chapter audio: ${errorMessage}`);
      
      setChapterGenerationProgress(null);
    } finally {
      setGeneratingChapterAudio(false);
      // Clear progress after a short delay to show completion
      setTimeout(() => {
        setChapterGenerationProgress(null);
      }, 3000);
    }
  }, [selectedChapter, audioSegments, handleGenerateSegmentAudio, root]);

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
        return;
      }

      // Check if current SFX segment is already playing and pause it
      if (currentSfxAudio?.isPlaying && currentSfxAudio.segmentId === segment.chunkId) {
        // Pause if currently playing this SFX segment
        currentSfxAudio.audio.pause();
        return;
      }

      // Handle imported audio files (SFX segments) differently
      // ⚠️ IMPORTANT: SFX segments MUST bypass all caching and TTS processing
      if (segment.segmentType === 'sfx' && segment.sfxFile) {
        console.log('🎵 Playing SFX segment directly (bypassing cache):', segment.sfxFile.filename);
        
        // If there's already SFX audio playing, stop it first
        if (currentSfxAudio?.isPlaying) {
          currentSfxAudio.audio.pause();
          currentSfxAudio.audio.currentTime = 0;
          setCurrentSfxAudio(null);
        }
        
        // For imported audio files, we play them directly from saved files
        // NO TTS generation, NO audio caching, NO processing chains
        const audioFilePath = segment.sfxFile.path;
        
        try {
          // Read the audio file data directly from project directory
          // This bypasses all caching mechanisms
          console.log('📁 Loading SFX file directly from:', audioFilePath);
          console.log('📁 Project root:', root);
          
          if (!root) {
            throw new Error('Project root is not available');
          }
          
          if (!audioFilePath) {
            throw new Error('Audio file path is not available');
          }
          
          const audioData = await window.khipu!.call('fs:readAudioFile', { 
            projectRoot: root, 
            filePath: audioFilePath 
          });
          
          // Create blob URL from the audio data for direct playback
          const blob = new Blob([audioData], { type: 'audio/wav' });
          const audioUrl = URL.createObjectURL(blob);
          const audio = new Audio(audioUrl);
          
          // Set up audio state tracking
          const updateSfxState = () => {
            setCurrentSfxAudio(prev => prev ? {
              ...prev,
              currentTime: audio.currentTime,
              duration: audio.duration || 0,
              isPlaying: !audio.paused
            } : null);
          };
          
          // Set up event listeners for progress tracking
          audio.ontimeupdate = updateSfxState;
          audio.onloadedmetadata = updateSfxState;
          audio.onplay = updateSfxState;
          audio.onpause = updateSfxState;
          
          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            setCurrentSfxAudio(null);
            console.log('🧹 Cleaned up SFX blob URL');
          };
          
          audio.onerror = () => {
            URL.revokeObjectURL(audioUrl);
            setCurrentSfxAudio(null);
            console.error('❌ SFX audio playback error');
          };
          
          // Start playback first
          await audio.play();
          
          // Initialize state after starting playback to ensure isPlaying is correct
          setCurrentSfxAudio({
            audio,
            segmentId: segment.chunkId,
            duration: audio.duration || 0,
            currentTime: audio.currentTime,
            isPlaying: !audio.paused // This should be true after play() succeeds
          });
          
          console.log('✅ Started playing SFX segment directly (no cache used)');
          
        } catch (error) {
          console.error('❌ Failed to play SFX segment directly:', error);
          console.error('SFX file path:', audioFilePath);
          setCurrentSfxAudio(null);
        }
        
        // CRITICAL: Return here to prevent SFX segments from falling through
        // to the TTS/caching pipeline below
        return;
      }

      // Original TTS segment handling
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
        projectConfig: projectConfig as ProjectConfig,
        projectRoot: root || undefined
      });
    } catch (error) {
      console.error("Playback failed:", error);

    }
  }, [selectedRowIndex, audioSegments, audioPreview, currentProcessingChain, root, selectedChapter, currentSfxAudio]);

  // Handle row click: only set selection (no auto-play)
  const handleRowClick = useCallback(async (index: number) => {
    setSelectedRowIndex(index);
  }, []);

  // Handle play button click: play audio for the specified segment
  const handlePlayButtonClick = useCallback(async (index: number, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent row click
    
    try {
      await handlePlaySegment(index);
    } catch (error) {
      console.error('Failed to play segment audio:', error);
    }
  }, [handlePlaySegment]);

  const handleStopAudio = useCallback(async () => {
    try {
      // Stop regular audio preview
      await audioPreview.stop();
      
      // Stop SFX audio if playing
      if (currentSfxAudio?.isPlaying) {
        currentSfxAudio.audio.pause();
        currentSfxAudio.audio.currentTime = 0;
        setCurrentSfxAudio(null);
        console.log('⏹️ Stopped SFX audio playback');
      }
    } catch (error) {
      console.error("Stop failed:", error);
    }
  }, [audioPreview, currentSfxAudio]);

  // Helper functions to determine current audio state
  const isCurrentSegmentPlaying = useCallback((segmentIndex: number) => {
    if (segmentIndex < 0 || segmentIndex >= audioSegments.length) return false;
    
    const segment = audioSegments[segmentIndex];
    
    // Check SFX audio state
    if (segment.segmentType === 'sfx' && currentSfxAudio) {
      return currentSfxAudio.segmentId === segment.chunkId && currentSfxAudio.isPlaying;
    }
    
    // Check regular audio preview state
    return audioPreview.isPlaying && audioPreview.playbackState.segmentId === segment.chunkId;
  }, [audioSegments, currentSfxAudio, audioPreview.isPlaying, audioPreview.playbackState.segmentId]);
  
  const isAnyAudioPlaying = useCallback(() => {
    return audioPreview.isPlaying || (currentSfxAudio?.isPlaying ?? false);
  }, [audioPreview.isPlaying, currentSfxAudio?.isPlaying]);
  
  const getCurrentAudioTime = useCallback(() => {
    const selectedSegment = audioSegments[selectedRowIndex];
    if (selectedSegment?.segmentType === 'sfx' && currentSfxAudio?.segmentId === selectedSegment.chunkId) {
      return currentSfxAudio.currentTime;
    }
    return audioPreview.currentTime;
  }, [audioSegments, selectedRowIndex, currentSfxAudio, audioPreview.currentTime]);
  
  const getCurrentAudioDuration = useCallback(() => {
    const selectedSegment = audioSegments[selectedRowIndex];
    if (selectedSegment?.segmentType === 'sfx' && currentSfxAudio?.segmentId === selectedSegment.chunkId) {
      return currentSfxAudio.duration;
    }
    return audioPreview.duration;
  }, [audioSegments, selectedRowIndex, currentSfxAudio, audioPreview.duration]);

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
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
            {/* Progress indicator for chapter generation */}
            {chapterGenerationProgress && (
              <div style={{
                padding: "8px 12px",
                backgroundColor: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "12px",
                color: "var(--text)",
                minWidth: "250px"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <div style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    backgroundColor: chapterGenerationProgress.phase === 'completed' ? 'var(--success)' : 'var(--accent)',
                    animation: chapterGenerationProgress.phase !== 'completed' ? 'pulse 2s infinite' : 'none'
                  }}></div>
                  <span style={{ fontWeight: "500" }}>
                    {chapterGenerationProgress.phase === 'segments' && 'Generating Segments'}
                    {chapterGenerationProgress.phase === 'concatenating' && 'Stitching Audio'}
                    {chapterGenerationProgress.phase === 'completed' && 'Complete'}
                  </span>
                  <span style={{ marginLeft: "auto" }}>
                    {chapterGenerationProgress.currentSegment}/{chapterGenerationProgress.totalSegments}
                  </span>
                </div>
                <div style={{ fontSize: "11px", opacity: 0.8 }}>
                  {chapterGenerationProgress.message}
                </div>
                <div style={{
                  width: "100%",
                  height: "3px",
                  backgroundColor: "var(--border)",
                  borderRadius: "2px",
                  overflow: "hidden",
                  marginTop: "6px"
                }}>
                  <div style={{
                    width: `${(chapterGenerationProgress.currentSegment / chapterGenerationProgress.totalSegments) * 100}%`,
                    height: "100%",
                    backgroundColor: chapterGenerationProgress.phase === 'completed' ? 'var(--success)' : 'var(--accent)',
                    transition: "width 0.3s ease"
                  }}></div>
                </div>
              </div>
            )}

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
                {getChaptersWithPlans().map((chapter) => {
                  const hasCompleteFile = chapterCompleteFiles.has(chapter.id);
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
                      {hasCompleteFile ? '🎵' : '📝'} {chapter.id} {chapter.title ? `- ${chapter.title}` : ""} {hasCompleteFile ? '(Complete)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Insert SFX Button */}
            {selectedChapter && audioSegments.length > 0 && (
              <StandardButton
                variant="secondary"
                onClick={() => {
                  setInsertPosition(selectedRowIndex); // Insert before current segment, not after
                  // Reset state when opening dialog
                  setSelectedFile(null);
                  setFileValidationResult(null);
                  setValidationError(null);
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
              <>
                <StandardButton
                  variant="primary"
                  onClick={handleGenerateChapterAudio}
                  disabled={audioSegments.length === 0 || generatingChapterAudio}
                >
                  {generatingChapterAudio 
                    ? t("audioProduction.generatingChapterAudio")
                    : chapterCompleteFiles.has(selectedChapter) 
                      ? t("audioProduction.regenerateChapterAudio")
                      : t("audioProduction.generateChapterAudio")}
                </StandardButton>
                
                {chapterCompleteFiles.has(selectedChapter) && (
                  <div style={{
                    fontSize: "12px",
                    color: "var(--success)",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}>
                    ✅ Complete chapter audio file exists
                  </div>
                )}
              </>
            )}
            </div>
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
        <div style={{ display: "grid", gridTemplateColumns: "0.4fr 1.6fr", gap: "16px", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {/* Left: Audio Segments Grid */}
          <div style={{ border: "1px solid var(--border)", borderRadius: "6px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
                    <th style={{ padding: "8px", textAlign: "left", color: "var(--text)", fontWeight: 500 }}>Character</th>
                    <th style={{ padding: "4px", textAlign: "center", color: "var(--text)", fontWeight: 500, width: "80px" }}>SFX</th>
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
                        {selectedRowIndex === index ? (
                          <StandardButton
                            variant="secondary"
                            size="compact"
                            onClick={(e) => handlePlayButtonClick(index, e)}
                            title="Play audio segment"
                            style={{
                              background: "none",
                              border: "none",
                              padding: "2px 4px",
                              color: "inherit",
                              fontSize: "12px",
                              minWidth: "20px",
                              minHeight: "20px"
                            }}
                          >
                            ▶
                          </StandardButton>
                        ) : ""}
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
                      <td style={{ padding: "4px", textAlign: "center" }}>
                        {segment.segmentType === 'sfx' ? (
                          <div style={{ display: "flex", gap: "2px", justifyContent: "center", alignItems: "center" }}>
                            <StandardButton
                              variant="secondary"
                              size="compact"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveSfxSegment(index, 'up');
                              }}
                              disabled={index === 0}
                              title="Move SFX up"
                              style={{
                                background: "none",
                                border: "none",
                                padding: "2px 4px",
                                color: index === 0 ? "var(--muted)" : "var(--text)",
                                opacity: index === 0 ? 0.5 : 1,
                                minWidth: "20px",
                                minHeight: "20px",
                                fontSize: "10px"
                              }}
                            >
                              ↑
                            </StandardButton>
                            <StandardButton
                              variant="secondary"
                              size="compact"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveSfxSegment(index, 'down');
                              }}
                              disabled={index === audioSegments.length - 1}
                              title="Move SFX down"
                              style={{
                                background: "none",
                                border: "none",
                                padding: "2px 4px",
                                color: index === audioSegments.length - 1 ? "var(--muted)" : "var(--text)",
                                opacity: index === audioSegments.length - 1 ? 0.5 : 1,
                                minWidth: "20px",
                                minHeight: "20px",
                                fontSize: "10px"
                              }}
                            >
                              ↓
                            </StandardButton>
                            <StandardButton
                              variant="secondary"
                              size="compact"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Delete SFX segment "${segment.sfxFile?.filename}"?`)) {
                                  deleteSfxSegment(index);
                                }
                              }}
                              title="Delete SFX segment"
                              style={{
                                background: "none",
                                border: "none",
                                padding: "2px 4px",
                                color: "var(--error)",
                                minWidth: "20px",
                                minHeight: "20px",
                                fontSize: "10px"
                              }}
                            >
                              🗑
                            </StandardButton>
                          </div>
                        ) : (
                          // Empty cell for non-SFX segments
                          <span style={{ color: "var(--muted)", fontSize: "10px" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Text Display + Audio Production Module */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", minHeight: 0 }}>
            {/* Text Display with VU Meter */}
            {selectedRowIndex >= 0 && selectedRowIndex < audioSegments.length && (
              <div style={{ display: "flex", gap: "12px", alignItems: "stretch" }}>
                <div style={{ flex: 1 }}>
                  <TextDisplay
                    text={audioSegments[selectedRowIndex].text}
                    isPlaying={isCurrentSegmentPlaying(selectedRowIndex)}
                    currentTime={getCurrentAudioTime()}
                    totalDuration={getCurrentAudioDuration()}
                    voiceName={audioSegments[selectedRowIndex].voice}
                    segmentId={audioSegments[selectedRowIndex].segmentId.toString()}
                  />
                </div>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "12px",
                  backgroundColor: "var(--panel)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  marginBottom: "8px"
                }}>
                  <AnalogVUMeter 
                    level={75}
                    isPlaying={isCurrentSegmentPlaying(selectedRowIndex)}
                  />
                </div>
              </div>
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
                      justifyContent: "center",
                      padding: "6px 8px",
                      minWidth: "44px",
                      minHeight: "36px",
                      fontSize: "14px",
                      lineHeight: "1",
                      border: "1px solid transparent"
                    }}
                  >
                    |◀
                  </StandardButton>

                  <StandardButton
                    variant={isCurrentSegmentPlaying(selectedRowIndex) ? "warning" : "primary"}
                    size="compact"
                    onClick={() => handlePlaySegment(selectedRowIndex)}
                    disabled={audioSegments.length === 0 || audioPreview.isLoading}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "6px 12px",
                      minWidth: "56px",
                      minHeight: "36px",
                      fontSize: "14px",
                      lineHeight: "1",
                      border: "1px solid transparent"
                    }}
                  >
                    {audioPreview.isLoading ? `⏳` :
                     isCurrentSegmentPlaying(selectedRowIndex) ? `⏸` :
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
                      justifyContent: "center",
                      padding: "6px 8px",
                      minWidth: "44px",
                      minHeight: "36px",
                      fontSize: "14px",
                      lineHeight: "1",
                      border: "1px solid transparent"
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
                  disabled={!isAnyAudioPlaying() && !audioPreview.isLoading}
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
          <div style={{ border: "1px solid var(--border)", borderRadius: "6px", display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
            <div style={{ padding: "8px 12px", backgroundColor: "var(--panelAccent)", borderBottom: "1px solid var(--border)", fontSize: "14px", fontWeight: 500 }}>
              {t("audioProduction.moduleTitle")}
            </div>
            
            <div style={{ flex: 1, padding: "12px", overflow: "auto", minHeight: 0 }}>
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
                            
                            {/* Bulk Apply Buttons */}
                            {!customSettingsEnabled && (
                              <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                                <StandardButton
                                  variant="primary"
                                  size="compact"
                                  onClick={async () => {
                                    if (!audioProductionService || !selectedChapter) return;
                                    
                                    const count = audioSegments.filter(seg => !seg.sfxFile).length;
                                    if (!confirm(`Apply "${getPresetById(selectedPresetId)?.name}" preset to all ${count} audio segments?`)) {
                                      return;
                                    }
                                    
                                    try {
                                      const preset = getPresetById(selectedPresetId);
                                      if (!preset) return;
                                      
                                      // Update all audio segments (not SFX)
                                      setAudioSegments(prev => prev.map(seg => 
                                        seg.sfxFile ? seg : { ...seg, processingChain: preset.processingChain }
                                      ));
                                      
                                      // Save to disk
                                      const processingChainMap: Record<string, AudioProcessingChain> = {};
                                      audioSegments.forEach(seg => {
                                        if (!seg.sfxFile) {
                                          processingChainMap[seg.chunkId] = preset.processingChain;
                                        }
                                      });
                                      
                                      await audioProductionService.saveProcessingChains(selectedChapter, processingChainMap);
                                      onStatus(`✅ Applied preset to ${count} segments`);
                                    } catch (error) {
                                      console.error('Failed to apply preset:', error);
                                      onStatus('❌ Failed to apply preset');
                                    }
                                  }}
                                  style={{ fontSize: "11px", padding: "4px 8px" }}
                                >
                                  {t("audioProduction.applyToAllSegments")}
                                </StandardButton>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Processing Summary - Studio Display */}
                        <div style={{ 
                          marginBottom: "16px", 
                          padding: "12px", 
                          background: "linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)",
                          border: "2px solid #2a2a2a",
                          borderRadius: "6px",
                          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5), 0 1px 2px rgba(255,255,255,0.1)",
                          position: "relative"
                        }}>
                          {/* Rack screws */}
                          <div style={{ position: "absolute", top: "6px", left: "6px", width: "6px", height: "6px", borderRadius: "50%", background: "radial-gradient(circle, #4a4a4a 0%, #2a2a2a 100%)", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.8)" }} />
                          <div style={{ position: "absolute", top: "6px", right: "6px", width: "6px", height: "6px", borderRadius: "50%", background: "radial-gradient(circle, #4a4a4a 0%, #2a2a2a 100%)", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.8)" }} />
                          <div style={{ position: "absolute", bottom: "6px", left: "6px", width: "6px", height: "6px", borderRadius: "50%", background: "radial-gradient(circle, #4a4a4a 0%, #2a2a2a 100%)", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.8)" }} />
                          <div style={{ position: "absolute", bottom: "6px", right: "6px", width: "6px", height: "6px", borderRadius: "50%", background: "radial-gradient(circle, #4a4a4a 0%, #2a2a2a 100%)", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.8)" }} />
                          
                          <div style={{ fontFamily: "'Courier New', monospace", fontSize: "11px", color: "#00ff88", letterSpacing: "0.5px", marginBottom: "8px", textTransform: "uppercase" }}>
                            ● {t("audioProduction.activeProcessingChain")}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>{
                            [
                              currentProcessingChain.noiseCleanup.highPassFilter.enabled && { label: t("audioProduction.labelHPF"), color: "#58a6ff" },
                              currentProcessingChain.noiseCleanup.deClickDeEss.enabled && { label: t("audioProduction.labelDeEss"), color: "#58a6ff" },
                              currentProcessingChain.dynamicControl.compression.enabled && { label: t("audioProduction.labelComp"), color: "#ff9f58" },
                              currentProcessingChain.dynamicControl.limiter.enabled && { label: t("audioProduction.labelLim"), color: "#ff9f58" },
                              currentProcessingChain.eqShaping.lowMidCut.enabled && { label: t("audioProduction.labelLoCut"), color: "#5fff58" },
                              currentProcessingChain.eqShaping.presenceBoost.enabled && { label: t("audioProduction.labelPres"), color: "#5fff58" },
                              currentProcessingChain.eqShaping.airLift.enabled && { label: t("audioProduction.labelAir"), color: "#5fff58" },
                              currentProcessingChain.spatialEnhancement.reverb.enabled && { label: t("audioProduction.labelRev"), color: "#d858ff" },
                              currentProcessingChain.spatialEnhancement.stereoEnhancer.enabled && { label: t("audioProduction.labelStereo"), color: "#d858ff" },
                              currentProcessingChain.mastering.normalization.enabled && { label: t("audioProduction.labelNorm"), color: "#ff5858" },
                              currentProcessingChain.mastering.peakLimiting.enabled && { label: t("audioProduction.labelPeak"), color: "#ff5858" },
                              currentProcessingChain.mastering.dithering.enabled && { label: t("audioProduction.labelDither"), color: "#ff5858" }
                            ].filter((item): item is { label: string; color: string } => Boolean(item)).map((item, idx) => (
                              <span key={idx} style={{ 
                                display: "inline-flex", 
                                alignItems: "center",
                                gap: "4px",
                                padding: "3px 8px", 
                                background: "rgba(0,0,0,0.6)",
                                border: `1px solid ${item.color}40`,
                                borderRadius: "3px",
                                fontSize: "10px",
                                fontFamily: "'Courier New', monospace",
                                color: item.color,
                                fontWeight: "bold",
                                letterSpacing: "0.5px",
                                textTransform: "uppercase",
                                boxShadow: `0 0 6px ${item.color}40, inset 0 0 4px rgba(0,0,0,0.5)`
                              }}>
                                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: item.color, boxShadow: `0 0 4px ${item.color}` }} />
                                {item.label}
                              </span>
                            ))}
                            {[
                              currentProcessingChain.noiseCleanup.highPassFilter.enabled,
                              currentProcessingChain.noiseCleanup.deClickDeEss.enabled,
                              currentProcessingChain.dynamicControl.compression.enabled,
                              currentProcessingChain.dynamicControl.limiter.enabled,
                              currentProcessingChain.eqShaping.lowMidCut.enabled,
                              currentProcessingChain.eqShaping.presenceBoost.enabled,
                              currentProcessingChain.eqShaping.airLift.enabled,
                              currentProcessingChain.spatialEnhancement.reverb.enabled,
                              currentProcessingChain.spatialEnhancement.stereoEnhancer.enabled,
                              currentProcessingChain.mastering.normalization.enabled,
                              currentProcessingChain.mastering.peakLimiting.enabled,
                              currentProcessingChain.mastering.dithering.enabled
                            ].every(v => !v) && (
                              <span style={{ color: "#666", fontSize: "10px", fontStyle: "italic" }}>{t("audioProduction.activeEffectsNone")}</span>
                            )}
                          </div>
                        </div>
                        
                        {/* Processing Modules Grid - Two columns */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(450px, 1fr))", gap: "16px" }}>
                        
                        {/* 1. Noise & Cleanup - Studio Module */}
                        <div style={{ 
                          marginBottom: "16px", 
                          padding: "0",
                          background: "linear-gradient(180deg, #1a1a2e 0%, #16162a 100%)",
                          border: "2px solid #2a3a5a",
                          borderRadius: "6px",
                          boxShadow: "0 4px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(88,166,255,0.1)",
                          position: "relative",
                          overflow: "hidden"
                        }}>
                          {/* LED indicator strip */}
                          <div style={{ position: "absolute", top: "0", left: "0", right: "0", height: "2px", background: "linear-gradient(90deg, transparent, #58a6ff, transparent)", opacity: sectionExpanded.noiseCleanup ? 1 : 0, transition: "opacity 0.3s" }} />
                          
                          <h5 
                            style={{ 
                              margin: "0",
                              padding: "12px 16px",
                              fontSize: "11px", 
                              color: "#58a6ff",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              textTransform: "uppercase",
                              letterSpacing: "1px",
                              background: "rgba(88,166,255,0.05)",
                              borderBottom: sectionExpanded.noiseCleanup ? "1px solid #2a3a5a" : "none",
                              fontFamily: "'Segoe UI', system-ui, sans-serif"
                            }}
                            onClick={() => setSectionExpanded(prev => ({
                              ...prev,
                              noiseCleanup: !prev.noiseCleanup
                            }))}
                          >
                            <span style={{ 
                              width: "8px", 
                              height: "8px", 
                              borderRadius: "50%", 
                              background: (currentProcessingChain.noiseCleanup.highPassFilter.enabled || currentProcessingChain.noiseCleanup.deClickDeEss.enabled) ? "#58a6ff" : "#333",
                              boxShadow: (currentProcessingChain.noiseCleanup.highPassFilter.enabled || currentProcessingChain.noiseCleanup.deClickDeEss.enabled) ? "0 0 8px #58a6ff" : "none",
                              transition: "all 0.3s"
                            }} />
                            <span style={{ flex: 1 }}>{t("audioProduction.processingStep1")}</span>
                            <span style={{ fontSize: "10px", opacity: 0.6 }}>
                              {sectionExpanded.noiseCleanup ? "▼" : "▶"}
                            </span>
                          </h5>
                          {sectionExpanded.noiseCleanup && (
                          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
                            {/* Hardware-style control row */}
                            <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", flexWrap: "wrap" }}>
                              {/* High Pass Filter Knob */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#58a6ff", fontFamily: "'Courier New', monospace", textTransform: "uppercase" }}>
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
                                    style={{ accentColor: "#58a6ff" }} 
                                  />
                                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    {currentProcessingChain.noiseCleanup.highPassFilter.enabled && <span style={{ color: "#58a6ff" }}>●</span>}
                                    HPF
                                  </span>
                                </label>
                                <RotaryKnob
                                  value={parseInt(currentProcessingChain.noiseCleanup.highPassFilter.frequency)}
                                  min={70}
                                  max={90}
                                  label={t("audioProduction.labelHz")}
                                  color="#58a6ff"
                                  disabled={!customSettingsEnabled || !currentProcessingChain.noiseCleanup.highPassFilter.enabled}
                                  onChange={(v) => {
                                    const freq = v <= 75 ? "70" : v <= 85 ? "80" : "90";
                                    updateCurrentProcessingChain({
                                      ...currentProcessingChain,
                                      noiseCleanup: {
                                        ...currentProcessingChain.noiseCleanup,
                                        highPassFilter: {
                                          ...currentProcessingChain.noiseCleanup.highPassFilter,
                                          frequency: freq as "70" | "80" | "90"
                                        }
                                      }
                                    });
                                  }}
                                />
                              </div>

                              {/* De-Ess Control */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#58a6ff", fontFamily: "'Courier New', monospace", textTransform: "uppercase" }}>
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
                                    style={{ accentColor: "#58a6ff" }} 
                                  />
                                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    {currentProcessingChain.noiseCleanup.deClickDeEss.enabled && <span style={{ color: "#58a6ff" }}>●</span>}
                                    DeEss
                                  </span>
                                </label>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                                  <VUMeter 
                                    level={currentProcessingChain.noiseCleanup.deClickDeEss.intensity === "light" ? 33 : currentProcessingChain.noiseCleanup.deClickDeEss.intensity === "medium" ? 66 : 100}
                                    label={t("audioProduction.labelIntensity")}
                                    color="#58a6ff"
                                  />
                                  <select 
                                    value={currentProcessingChain.noiseCleanup.deClickDeEss.intensity}
                                    disabled={!customSettingsEnabled || !currentProcessingChain.noiseCleanup.deClickDeEss.enabled}
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
                                    style={{ 
                                      fontFamily: "'Courier New', monospace",
                                      fontSize: "10px", 
                                      padding: "4px 6px", 
                                      background: "rgba(0,0,0,0.6)", 
                                      border: "1px solid #58a6ff40", 
                                      borderRadius: "3px",
                                      color: "#58a6ff"
                                    }}
                                  >
                                    <option value="light">{t("audioProduction.optionLight")}</option>
                                    <option value="medium">{t("audioProduction.optionMedium")}</option>
                                    <option value="heavy">{t("audioProduction.optionHeavy")}</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>
                          )}
                        </div>

                        {/* 2. Dynamic Control - Studio Module */}
                        <div style={{ 
                          marginBottom: "16px", 
                          padding: "0",
                          background: "linear-gradient(180deg, #2e1a1a 0%, #2a1616 100%)",
                          border: "2px solid #5a3a2a",
                          borderRadius: "6px",
                          boxShadow: "0 4px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,159,88,0.1)",
                          position: "relative",
                          overflow: "hidden"
                        }}>
                          <div style={{ position: "absolute", top: "0", left: "0", right: "0", height: "2px", background: "linear-gradient(90deg, transparent, #ff9f58, transparent)", opacity: sectionExpanded.dynamicControl ? 1 : 0, transition: "opacity 0.3s" }} />
                          
                          <h5 
                            style={{ 
                              margin: "0",
                              padding: "12px 16px",
                              fontSize: "11px", 
                              color: "#ff9f58",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              textTransform: "uppercase",
                              letterSpacing: "1px",
                              background: "rgba(255,159,88,0.05)",
                              borderBottom: sectionExpanded.dynamicControl ? "1px solid #5a3a2a" : "none",
                              fontFamily: "'Segoe UI', system-ui, sans-serif"
                            }}
                            onClick={() => setSectionExpanded(prev => ({
                              ...prev,
                              dynamicControl: !prev.dynamicControl
                            }))}
                          >
                            <span style={{ 
                              width: "8px", 
                              height: "8px", 
                              borderRadius: "50%", 
                              background: (currentProcessingChain.dynamicControl.compression.enabled || currentProcessingChain.dynamicControl.limiter.enabled) ? "#ff9f58" : "#333",
                              boxShadow: (currentProcessingChain.dynamicControl.compression.enabled || currentProcessingChain.dynamicControl.limiter.enabled) ? "0 0 8px #ff9f58" : "none",
                              transition: "all 0.3s"
                            }} />
                            <span style={{ flex: 1 }}>{t("audioProduction.dynamicControlTitle")}</span>
                            <span style={{ fontSize: "10px", opacity: 0.6 }}>
                              {sectionExpanded.dynamicControl ? "▼" : "▶"}
                            </span>
                          </h5>
                          {sectionExpanded.dynamicControl && (
                          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
                            <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", flexWrap: "wrap" }}>
                              {/* Compression Control */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#ff9f58", fontFamily: "'Courier New', monospace", textTransform: "uppercase" }}>
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
                                    style={{ accentColor: "#ff9f58" }} 
                                  />
                                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    {currentProcessingChain.dynamicControl.compression.enabled && <span style={{ color: "#ff9f58" }}>●</span>}
                                    Comp
                                  </span>
                                </label>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                                  <VUMeter 
                                    level={currentProcessingChain.dynamicControl.compression.ratio === "2:1" ? 40 : currentProcessingChain.dynamicControl.compression.ratio === "2.5:1" ? 70 : 100}
                                    label={t("audioProduction.labelRatio")}
                                    color="#ff9f58"
                                  />
                                  <select 
                                    value={currentProcessingChain.dynamicControl.compression.ratio}
                                    disabled={!customSettingsEnabled || !currentProcessingChain.dynamicControl.compression.enabled}
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
                                    style={{ 
                                      fontFamily: "'Courier New', monospace",
                                      fontSize: "10px", 
                                      padding: "4px 6px", 
                                      background: "rgba(0,0,0,0.6)", 
                                      border: "1px solid #ff9f5840", 
                                      borderRadius: "3px",
                                      color: "#ff9f58"
                                    }}
                                  >
                                    <option value="2:1">2:1</option>
                                    <option value="2.5:1">2.5:1</option>
                                    <option value="3:1">3:1</option>
                                  </select>
                                </div>
                              </div>

                              {/* Limiter Control */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#ff9f58", fontFamily: "'Courier New', monospace", textTransform: "uppercase" }}>
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
                                    style={{ accentColor: "#ff9f58" }} 
                                  />
                                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    {currentProcessingChain.dynamicControl.limiter.enabled && <span style={{ color: "#ff9f58" }}>●</span>}
                                    Limiter
                                  </span>
                                </label>
                                <VUMeter 
                                  level={currentProcessingChain.dynamicControl.limiter.enabled ? 85 : 0}
                                  label={t("audioProduction.labelCeiling")}
                                  color="#ff9f58"
                                />
                              </div>
                            </div>
                          </div>
                          )}
                        </div>

                        {/* 3. EQ Shaping - Studio Module */}
                        <div style={{ 
                          marginBottom: "16px", 
                          padding: "0",
                          background: "linear-gradient(180deg, #1a2e1a 0%, #162a16 100%)",
                          border: "2px solid #2a5a3a",
                          borderRadius: "6px",
                          boxShadow: "0 4px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(95,255,88,0.1)",
                          position: "relative",
                          overflow: "hidden"
                        }}>
                          <div style={{ position: "absolute", top: "0", left: "0", right: "0", height: "2px", background: "linear-gradient(90deg, transparent, #5fff58, transparent)", opacity: sectionExpanded.eqShaping ? 1 : 0, transition: "opacity 0.3s" }} />
                          
                          <h5 
                            style={{ 
                              margin: "0",
                              padding: "12px 16px",
                              fontSize: "11px", 
                              color: "#5fff58",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              textTransform: "uppercase",
                              letterSpacing: "1px",
                              background: "rgba(95,255,88,0.05)",
                              borderBottom: sectionExpanded.eqShaping ? "1px solid #2a5a3a" : "none",
                              fontFamily: "'Segoe UI', system-ui, sans-serif"
                            }}
                            onClick={() => setSectionExpanded(prev => ({
                              ...prev,
                              eqShaping: !prev.eqShaping
                            }))}
                          >
                            <span style={{ 
                              width: "8px", 
                              height: "8px", 
                              borderRadius: "50%", 
                              background: (currentProcessingChain.eqShaping.lowMidCut.enabled || currentProcessingChain.eqShaping.presenceBoost.enabled || currentProcessingChain.eqShaping.airLift.enabled) ? "#5fff58" : "#333",
                              boxShadow: (currentProcessingChain.eqShaping.lowMidCut.enabled || currentProcessingChain.eqShaping.presenceBoost.enabled || currentProcessingChain.eqShaping.airLift.enabled) ? "0 0 8px #5fff58" : "none",
                              transition: "all 0.3s"
                            }} />
                            <span style={{ flex: 1 }}>{t("audioProduction.eqShapingTitle")}</span>
                            <span style={{ fontSize: "10px", opacity: 0.6 }}>
                              {sectionExpanded.eqShaping ? "▼" : "▶"}
                            </span>
                          </h5>
                          {sectionExpanded.eqShaping && (
                          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
                            <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", flexWrap: "wrap", justifyContent: "space-around" }}>
                              {/* Low-Mid Cut Knob */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#5fff58", fontFamily: "'Courier New', monospace", textTransform: "uppercase" }}>
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
                                    style={{ accentColor: "#5fff58" }} 
                                  />
                                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    {currentProcessingChain.eqShaping.lowMidCut.enabled && <span style={{ color: "#5fff58" }}>●</span>}
                                    Low Cut
                                  </span>
                                </label>
                                <RotaryKnob
                                  value={parseInt(currentProcessingChain.eqShaping.lowMidCut.frequency)}
                                  min={150}
                                  max={300}
                                  label={t("audioProduction.labelHz")}
                                  color="#5fff58"
                                  disabled={!customSettingsEnabled || !currentProcessingChain.eqShaping.lowMidCut.enabled}
                                  onChange={(v) => {
                                    const freq = v <= 175 ? "150" : v <= 250 ? "200" : "300";
                                    updateCurrentProcessingChain({
                                      ...currentProcessingChain,
                                      eqShaping: {
                                        ...currentProcessingChain.eqShaping,
                                        lowMidCut: {
                                          ...currentProcessingChain.eqShaping.lowMidCut,
                                          frequency: freq as "150" | "200" | "300"
                                        }
                                      }
                                    });
                                  }}
                                />
                              </div>

                              {/* Presence Boost Knob */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#5fff58", fontFamily: "'Courier New', monospace", textTransform: "uppercase" }}>
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
                                    style={{ accentColor: "#5fff58" }} 
                                  />
                                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    {currentProcessingChain.eqShaping.presenceBoost.enabled && <span style={{ color: "#5fff58" }}>●</span>}
                                    Presence
                                  </span>
                                </label>
                                <RotaryKnob
                                  value={parseInt(currentProcessingChain.eqShaping.presenceBoost.frequency)}
                                  min={2}
                                  max={5}
                                  label={t("audioProduction.labelKHz")}
                                  color="#5fff58"
                                  disabled={!customSettingsEnabled || !currentProcessingChain.eqShaping.presenceBoost.enabled}
                                  onChange={(v) => {
                                    const freq = v <= 2.5 ? "2" : v <= 4 ? "3" : "5";
                                    updateCurrentProcessingChain({
                                      ...currentProcessingChain,
                                      eqShaping: {
                                        ...currentProcessingChain.eqShaping,
                                        presenceBoost: {
                                          ...currentProcessingChain.eqShaping.presenceBoost,
                                          frequency: freq as "2" | "3" | "5"
                                        }
                                      }
                                    });
                                  }}
                                />
                              </div>

                              {/* Air Lift Knob */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#5fff58", fontFamily: "'Courier New', monospace", textTransform: "uppercase" }}>
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
                                    style={{ accentColor: "#5fff58" }} 
                                  />
                                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    {currentProcessingChain.eqShaping.airLift.enabled && <span style={{ color: "#5fff58" }}>●</span>}
                                    Air
                                  </span>
                                </label>
                                <RotaryKnob
                                  value={parseInt(currentProcessingChain.eqShaping.airLift.frequency)}
                                  min={8}
                                  max={12}
                                  label={t("audioProduction.labelKHz")}
                                  color="#5fff58"
                                  disabled={!customSettingsEnabled || !currentProcessingChain.eqShaping.airLift.enabled}
                                  onChange={(v) => {
                                    const freq = v <= 9 ? "8" : v <= 11 ? "10" : "12";
                                    updateCurrentProcessingChain({
                                      ...currentProcessingChain,
                                      eqShaping: {
                                        ...currentProcessingChain.eqShaping,
                                        airLift: {
                                          ...currentProcessingChain.eqShaping.airLift,
                                          frequency: freq as "8" | "10" | "12"
                                        }
                                      }
                                    });
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                          )}
                        </div>

                        {/* 4. Spatial / Aesthetic Enhancements - Studio Module */}
                        <div style={{ 
                          marginBottom: "16px", 
                          padding: "0",
                          background: "linear-gradient(180deg, #2e1a2e 0%, #2a162a 100%)",
                          border: "2px solid #5a2a5a",
                          borderRadius: "6px",
                          boxShadow: "0 4px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(216,88,255,0.1)",
                          position: "relative",
                          overflow: "hidden"
                        }}>
                          <div style={{ position: "absolute", top: "0", left: "0", right: "0", height: "2px", background: "linear-gradient(90deg, transparent, #d858ff, transparent)", opacity: sectionExpanded.spatialEnhancement ? 1 : 0, transition: "opacity 0.3s" }} />
                          
                          <h5 
                            style={{ 
                              margin: "0",
                              padding: "12px 16px",
                              fontSize: "11px", 
                              color: "#d858ff",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              textTransform: "uppercase",
                              letterSpacing: "1px",
                              background: "rgba(216,88,255,0.05)",
                              borderBottom: sectionExpanded.spatialEnhancement ? "1px solid #5a2a5a" : "none",
                              fontFamily: "'Segoe UI', system-ui, sans-serif"
                            }}
                            onClick={() => setSectionExpanded(prev => ({
                              ...prev,
                              spatialEnhancement: !prev.spatialEnhancement
                            }))}
                          >
                            <span style={{ 
                              width: "8px", 
                              height: "8px", 
                              borderRadius: "50%", 
                              background: (currentProcessingChain.spatialEnhancement.reverb.enabled || currentProcessingChain.spatialEnhancement.stereoEnhancer.enabled) ? "#d858ff" : "#333",
                              boxShadow: (currentProcessingChain.spatialEnhancement.reverb.enabled || currentProcessingChain.spatialEnhancement.stereoEnhancer.enabled) ? "0 0 8px #d858ff" : "none",
                              transition: "all 0.3s"
                            }} />
                            <span style={{ flex: 1 }}>{t("audioProduction.processingStep4")}</span>
                            <span style={{ fontSize: "10px", opacity: 0.6 }}>
                              {sectionExpanded.spatialEnhancement ? "▼" : "▶"}
                            </span>
                          </h5>
                          {sectionExpanded.spatialEnhancement && (
                          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
                            <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", flexWrap: "wrap" }}>
                              {/* Reverb Control */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#d858ff", fontFamily: "'Courier New', monospace", textTransform: "uppercase" }}>
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
                                    style={{ accentColor: "#d858ff" }} 
                                  />
                                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    {currentProcessingChain.spatialEnhancement.reverb.enabled && <span style={{ color: "#d858ff" }}>●</span>}
                                    Reverb
                                  </span>
                                </label>
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "center" }}>
                                  <RotaryKnob
                                    value={currentProcessingChain.spatialEnhancement.reverb.wetMix}
                                    min={0}
                                    max={100}
                                    label={t("audioProduction.labelMixPercent")}
                                    color="#d858ff"
                                    disabled={!customSettingsEnabled || !currentProcessingChain.spatialEnhancement.reverb.enabled}
                                    onChange={(v) => updateCurrentProcessingChain({
                                      ...currentProcessingChain,
                                      spatialEnhancement: {
                                        ...currentProcessingChain.spatialEnhancement,
                                        reverb: {
                                          ...currentProcessingChain.spatialEnhancement.reverb,
                                          wetMix: v
                                        }
                                      }
                                    })}
                                  />
                                  <select 
                                    value={currentProcessingChain.spatialEnhancement.reverb.type}
                                    disabled={!customSettingsEnabled || !currentProcessingChain.spatialEnhancement.reverb.enabled}
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
                                    style={{ 
                                      fontFamily: "'Courier New', monospace",
                                      fontSize: "10px", 
                                      padding: "4px 6px", 
                                      background: "rgba(0,0,0,0.6)", 
                                      border: "1px solid #d858ff40", 
                                      borderRadius: "3px",
                                      color: "#d858ff"
                                    }}
                                  >
                                    <option value="room_0.3">{t("audioProduction.roomSizeSmall")}</option>
                                    <option value="room_0.4">{t("audioProduction.roomSizeMedium")}</option>
                                    <option value="room_0.5">{t("audioProduction.roomSizeLarge")}</option>
                                  </select>
                                </div>
                              </div>

                              {/* Stereo Enhancer */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#d858ff", fontFamily: "'Courier New', monospace", textTransform: "uppercase" }}>
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
                                    style={{ accentColor: "#d858ff" }} 
                                  />
                                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    {currentProcessingChain.spatialEnhancement.stereoEnhancer.enabled && <span style={{ color: "#d858ff" }}>●</span>}
                                    Stereo
                                  </span>
                                </label>
                                <VUMeter 
                                  level={currentProcessingChain.spatialEnhancement.stereoEnhancer.enabled ? 75 : 0}
                                  label={t("audioProduction.labelWidth")}
                                  color="#d858ff"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                        </div>

                        {/* 5. Consistency & Mastering - Studio Module */}
                        <div style={{ 
                          marginBottom: "12px", 
                          padding: "0",
                          background: "linear-gradient(180deg, #2e1a1a 0%, #2a1212 100%)",
                          border: "2px solid #5a2a2a",
                          borderRadius: "6px",
                          boxShadow: "0 4px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,88,88,0.1)",
                          position: "relative",
                          overflow: "hidden"
                        }}>
                          <div style={{ position: "absolute", top: "0", left: "0", right: "0", height: "2px", background: "linear-gradient(90deg, transparent, #ff5858, transparent)", opacity: sectionExpanded.consistencyMastering ? 1 : 0, transition: "opacity 0.3s" }} />
                          
                          <h5 
                            style={{ 
                              margin: "0",
                              padding: "12px 16px",
                              fontSize: "11px", 
                              color: "#ff5858",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              textTransform: "uppercase",
                              letterSpacing: "1px",
                              background: "rgba(255,88,88,0.05)",
                              borderBottom: sectionExpanded.consistencyMastering ? "1px solid #5a2a2a" : "none",
                              fontFamily: "'Segoe UI', system-ui, sans-serif"
                            }}
                            onClick={() => setSectionExpanded(prev => ({
                              ...prev,
                              consistencyMastering: !prev.consistencyMastering
                            }))}
                          >
                            <span style={{ 
                              width: "8px", 
                              height: "8px", 
                              borderRadius: "50%", 
                              background: (currentProcessingChain.mastering.normalization.enabled || currentProcessingChain.mastering.peakLimiting.enabled || currentProcessingChain.mastering.dithering.enabled) ? "#ff5858" : "#333",
                              boxShadow: (currentProcessingChain.mastering.normalization.enabled || currentProcessingChain.mastering.peakLimiting.enabled || currentProcessingChain.mastering.dithering.enabled) ? "0 0 8px #ff5858" : "none",
                              transition: "all 0.3s"
                            }} />
                            <span style={{ flex: 1 }}>5. {t("audioProduction.consistencyMasteringTitle")}</span>
                            <span style={{ fontSize: "10px", opacity: 0.6 }}>
                              {sectionExpanded.consistencyMastering ? "▼" : "▶"}
                            </span>
                          </h5>
                          {sectionExpanded.consistencyMastering && (
                          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
                            <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", flexWrap: "wrap" }}>
                              {/* Normalization Control */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#ff5858", fontFamily: "'Courier New', monospace", textTransform: "uppercase" }}>
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
                                    style={{ accentColor: "#ff5858" }} 
                                  />
                                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    {currentProcessingChain.mastering.normalization.enabled && <span style={{ color: "#ff5858" }}>●</span>}
                                    Normalize
                                  </span>
                                </label>
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "center" }}>
                                  <RotaryKnob
                                    value={Math.abs(parseInt(currentProcessingChain.mastering.normalization.targetLUFS))}
                                    min={18}
                                    max={23}
                                    label={t("audioProduction.labelLUFS")}
                                    color="#ff5858"
                                    disabled={!customSettingsEnabled || !currentProcessingChain.mastering.normalization.enabled}
                                    onChange={(v) => {
                                      const lufs = v <= 19 ? "-18" : v <= 20.5 ? "-20" : v <= 22 ? "-21" : "-23";
                                      updateCurrentProcessingChain({
                                        ...currentProcessingChain,
                                        mastering: {
                                          ...currentProcessingChain.mastering,
                                          normalization: {
                                            ...currentProcessingChain.mastering.normalization,
                                            targetLUFS: lufs as "-18" | "-20" | "-21" | "-23"
                                          }
                                        }
                                      });
                                    }}
                                  />
                                  <div style={{ 
                                    fontFamily: "'Courier New', monospace", 
                                    fontSize: "10px", 
                                    color: "#ff5858",
                                    background: "rgba(0,0,0,0.6)",
                                    padding: "3px 8px",
                                    borderRadius: "3px",
                                    border: "1px solid #ff585840"
                                  }}>
                                    {currentProcessingChain.mastering.normalization.targetLUFS} dB
                                  </div>
                                </div>
                              </div>

                              {/* Peak Limiting */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#ff5858", fontFamily: "'Courier New', monospace", textTransform: "uppercase" }}>
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
                                    style={{ accentColor: "#ff5858" }} 
                                  />
                                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    {currentProcessingChain.mastering.peakLimiting.enabled && <span style={{ color: "#ff5858" }}>●</span>}
                                    Peak Lim
                                  </span>
                                </label>
                                <VUMeter 
                                  level={currentProcessingChain.mastering.peakLimiting.enabled ? 95 : 0}
                                  label={t("audioProduction.labelCeiling")}
                                  color="#ff5858"
                                />
                              </div>

                              {/* Dithering */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#ff5858", fontFamily: "'Courier New', monospace", textTransform: "uppercase" }}>
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
                                    style={{ accentColor: "#ff5858" }} 
                                  />
                                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    {currentProcessingChain.mastering.dithering.enabled && <span style={{ color: "#ff5858" }}>●</span>}
                                    Dither
                                  </span>
                                </label>
                                <VUMeter 
                                  level={currentProcessingChain.mastering.dithering.enabled ? 60 : 0}
                                  label={t("audioProduction.labelNoise")}
                                  color="#ff5858"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                        </div>
                        
                        </div> {/* Close Processing Modules Grid */}
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
                {t("audioProduction.selectAudioFile")}
              </label>
              
              {/* File Selection Area */}
              <div 
                style={{
                  position: "relative",
                  border: "2px solid var(--border)",
                  borderRadius: "8px",
                  padding: "24px",
                  textAlign: "center",
                  backgroundColor: "var(--panel)",
                  cursor: "pointer"
                }}
                onClick={() => {
                  // Trigger file input click
                  const fileInput = document.getElementById('audio-file-input') as HTMLInputElement;
                  if (fileInput) {
                    // Reset the input value before opening dialog to ensure change event fires
                    fileInput.value = '';
                    fileInput.click();
                  }
                }}
              >
                <input
                  id="audio-file-input"
                  type="file"
                  accept=".wav,.mp3,.m4a,.aac,.ogg,.flac,audio/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileSelection(file);
                    }
                    // Always clear the input to ensure change event fires next time
                    e.target.value = '';
                  }}
                  style={{
                    position: "absolute",
                    opacity: 0,
                    width: "100%",
                    height: "100%",
                    cursor: "pointer",
                    top: 0,
                    left: 0
                  }}
                />
                
                <div style={{ fontSize: "48px", marginBottom: "8px" }}>
                  {selectedFile ? "✅" : "📁"}
                </div>
                
                {selectedFile ? (
                  <div>
                    <div style={{ fontWeight: 500, marginBottom: "4px", color: "var(--text)" }}>
                      {selectedFile.name}
                    </div>
                    {fileValidationResult?.valid && (
                      <div style={{ fontSize: "12px", color: "var(--textSecondary)", marginBottom: "8px" }}>
                        {fileValidationResult.format} • {Math.round((fileValidationResult.duration || 0) * 10) / 10}s • {Math.round(selectedFile.size / 1024)}KB
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div style={{ fontWeight: 500, marginBottom: "4px", color: "var(--text)" }}>
                      Click to select audio file
                    </div>
                  </div>
                )}
                
                {validationError && (
                  <div style={{ 
                    color: "var(--error)", 
                    fontSize: "13px", 
                    marginTop: "8px",
                    padding: "8px",
                    backgroundColor: "var(--error)20",
                    borderRadius: "4px"
                  }}>
                    ❌ {validationError}
                  </div>
                )}
                
                {importStatus && (
                  <div style={{ 
                    color: importStatus.startsWith("✅") ? "var(--success)" : "var(--primary)", 
                    fontSize: "13px", 
                    marginTop: "8px",
                    padding: "8px",
                    backgroundColor: importStatus.startsWith("✅") ? "var(--success)20" : "var(--primary)20",
                    borderRadius: "4px"
                  }}>
                    {importStatus}
                  </div>
                )}
              </div>
              
              <div style={{ fontSize: "13px", color: "var(--textSecondary)", marginTop: "8px" }}>
                {t("audioProduction.audioFileRequirements")}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <StandardButton
                variant="secondary"
                onClick={() => {
                  setShowSfxDialog(false);
                  // Reset state
                  setSelectedFile(null);
                  setFileValidationResult(null);
                  setValidationError(null);
                }}
              >
                {t("common.cancel")}
              </StandardButton>
              
              {selectedFile && fileValidationResult?.valid && (
                <StandardButton
                  variant="primary"
                  onClick={handleImportSelectedFile}
                >
                  {t("audioProduction.addSegment")}
                </StandardButton>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
