// Audio Production Type Definitions
// These types correspond to the Zod schemas in schemas/audio-production.ts

export interface NoiseCleanupSettings {
  highPassFilter: {
    enabled: boolean;
    frequency: "70" | "80" | "90"; // Hz
  };
  deClickDeEss: {
    enabled: boolean;
    intensity: "light" | "medium" | "heavy";
  };
}

export interface DynamicControlSettings {
  compression: {
    enabled: boolean;
    ratio: "2:1" | "2.5:1" | "3:1";
    threshold: number; // dB
  };
  limiter: {
    enabled: boolean;
    ceiling: number; // dBFS
  };
}

export interface EQShapingSettings {
  lowMidCut: {
    enabled: boolean;
    frequency: "150" | "200" | "300"; // Hz
    gain: number; // dB
  };
  presenceBoost: {
    enabled: boolean;
    frequency: "2" | "3" | "5"; // kHz
    gain: number; // dB
  };
  airLift: {
    enabled: boolean;
    frequency: "8" | "10" | "12"; // kHz
    gain: number; // dB
  };
}

export interface SpatialEnhancementSettings {
  reverb: {
    enabled: boolean;
    type: "room_0.3" | "room_0.4" | "room_0.5";
    wetMix: number; // 0-15 percentage
  };
  stereoEnhancer: {
    enabled: boolean;
    width: number; // 0-100 percentage
  };
}

export interface MasteringSettings {
  normalization: {
    enabled: boolean;
    targetLUFS: "-18" | "-20" | "-21" | "-23";
  };
  peakLimiting: {
    enabled: boolean;
    maxPeak: number; // dB
  };
  dithering: {
    enabled: boolean;
    bitDepth: "16" | "24";
  };
}

export interface AudioProcessingChain {
  noiseCleanup: NoiseCleanupSettings;
  dynamicControl: DynamicControlSettings;
  eqShaping: EQShapingSettings;
  spatialEnhancement: SpatialEnhancementSettings;
  mastering: MasteringSettings;
}

export interface AudioGenerationMetadata {
  timestamp?: string; // ISO datetime
  engineUsed?: string; // which TTS engine
  modelVersion?: string; // model version used
  processingVersion?: string; // processing chain version
}

export interface AudioFileInfo {
  filename?: string;
  duration?: number; // seconds
  sampleRate?: number; // Hz
  bitDepth?: number;
  fileSize?: number; // bytes
  format?: "wav" | "mp3" | "flac" | "aac";
}

export interface AudioQualityMetrics {
  lufs?: number; // integrated loudness
  peakDb?: number; // true peak level
  dynamicRange?: number; // DR measurement
  spectralBalance?: string; // analysis results
}

export interface AudioProductionOverrides {
  voice?: string; // override assigned voice
  text?: string; // override segment text
  ssml?: string; // custom SSML
  notes?: string; // production notes
}

export interface SegmentAudioMetadata {
  chunkId: string;
  
  // Processing chain settings (can override global defaults)
  processingChain?: Partial<AudioProcessingChain>;
  
  // Audio generation metadata
  generation?: AudioGenerationMetadata;
  
  // Audio file information
  audioFile?: AudioFileInfo;
  
  // Quality metrics
  quality?: AudioQualityMetrics;
  
  // Manual overrides and notes
  overrides?: AudioProductionOverrides;
}

export interface ChapterAudioMetadata {
  chapterId: string;
  
  // Global processing chain settings for this chapter
  globalProcessingChain: AudioProcessingChain;
  
  // Segment-specific metadata
  segments: SegmentAudioMetadata[];
  
  // Chapter-level audio information
  masterAudio?: {
    filename?: string;
    duration?: number; // total duration in seconds
    totalSegments: number;
    completedSegments: number;
    lastProcessed?: string; // ISO datetime
  };
  
  // Chapter-level quality metrics
  chapterQuality?: {
    averageLUFS?: number;
    consistencyScore?: number; // 0-100
    peakLevels?: number[];
  };
}

export interface ProjectAudioProductionSettings {
  outputFormat: "wav" | "mp3" | "flac" | "aac";
  sampleRate: 22050 | 44100 | 48000;
  bitDepth: 16 | 24;
  
  // Batch processing settings
  batchSize: number;
  parallelProcessing: boolean;
  
  // Quality control
  autoQualityCheck: boolean;
  targetLoudnessRange: {
    min: number;
    max: number;
  };
}

export interface ProjectAudioProduction {
  version: 1;
  
  // Project-wide default processing chain
  defaultProcessingChain: AudioProcessingChain;
  
  // Global audio settings
  globalSettings: ProjectAudioProductionSettings;
  
  // Chapter metadata
  chapters: ChapterAudioMetadata[];
  
  // Project metadata
  metadata: {
    created: string; // ISO datetime
    lastModified: string; // ISO datetime
    totalChapters: number;
    completedChapters: number;
    estimatedDuration?: number; // total estimated duration in seconds
  };
}

// Utility types for UI components
export interface AudioProductionUIState {
  currentChapter?: string;
  selectedSegment?: string;
  currentProcessingChain: AudioProcessingChain;
  isGenerating: boolean;
  isPlaying: boolean;
  playbackProgress?: number;
}

// File system structure
export interface AudioProductionFiles {
  configFile: string; // path to audio-production.json
  audioDirectory: string; // path to audio files
  segmentFiles: Map<string, string>; // chunkId -> file path
  chapterFiles: Map<string, string>; // chapterId -> master file path
}