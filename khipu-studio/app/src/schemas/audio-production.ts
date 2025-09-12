import { z } from "zod";

// Audio Processing Chain Configuration Schemas

export const noiseCleanupSchema = z.object({
  highPassFilter: z.object({
    enabled: z.boolean().default(true),
    frequency: z.enum(["70", "80", "90"]).default("80"), // Hz
  }),
  deClickDeEss: z.object({
    enabled: z.boolean().default(false),
    intensity: z.enum(["light", "medium", "heavy"]).default("medium"),
  }),
});

export const dynamicControlSchema = z.object({
  compression: z.object({
    enabled: z.boolean().default(true),
    ratio: z.enum(["2:1", "2.5:1", "3:1"]).default("2.5:1"),
    threshold: z.number().default(-12), // dB
  }),
  limiter: z.object({
    enabled: z.boolean().default(true),
    ceiling: z.number().default(-1), // dBFS
  }),
});

export const eqShapingSchema = z.object({
  lowMidCut: z.object({
    enabled: z.boolean().default(false),
    frequency: z.enum(["150", "200", "300"]).default("200"), // Hz
    gain: z.number().default(-2), // dB
  }),
  presenceBoost: z.object({
    enabled: z.boolean().default(true),
    frequency: z.enum(["2", "3", "5"]).default("3"), // kHz
    gain: z.number().default(2), // dB
  }),
  airLift: z.object({
    enabled: z.boolean().default(false),
    frequency: z.enum(["8", "10", "12"]).default("10"), // kHz
    gain: z.number().default(1), // dB
  }),
});

export const spatialEnhancementSchema = z.object({
  reverb: z.object({
    enabled: z.boolean().default(true),
    type: z.enum(["room_0.3", "room_0.4", "room_0.5"]).default("room_0.4"),
    wetMix: z.number().min(0).max(15).default(8), // percentage
  }),
  stereoEnhancer: z.object({
    enabled: z.boolean().default(false),
    width: z.number().min(0).max(100).default(10), // percentage
  }),
});

export const masteringSchema = z.object({
  normalization: z.object({
    enabled: z.boolean().default(true),
    targetLUFS: z.enum(["-18", "-20", "-21", "-23"]).default("-21"),
  }),
  peakLimiting: z.object({
    enabled: z.boolean().default(true),
    maxPeak: z.number().default(-3), // dB
  }),
  dithering: z.object({
    enabled: z.boolean().default(false),
    bitDepth: z.enum(["16", "24"]).default("16"),
  }),
});

// Complete Audio Processing Chain Schema
export const audioProcessingChainSchema = z.object({
  noiseCleanup: noiseCleanupSchema,
  dynamicControl: dynamicControlSchema,
  eqShaping: eqShapingSchema,
  spatialEnhancement: spatialEnhancementSchema,
  mastering: masteringSchema,
});

// Individual Segment Audio Production Metadata
export const segmentAudioMetadataSchema = z.object({
  chunkId: z.string(),
  
  // Processing chain settings (can override global defaults)
  processingChain: audioProcessingChainSchema.partial().optional(),
  
  // Audio generation metadata
  generation: z.object({
    timestamp: z.string().datetime().optional(), // when generated
    engineUsed: z.string().optional(), // which TTS engine
    modelVersion: z.string().optional(), // model version used
    processingVersion: z.string().optional(), // processing chain version
  }).optional(),
  
  // Audio file information
  audioFile: z.object({
    filename: z.string().optional(),
    duration: z.number().optional(), // seconds
    sampleRate: z.number().optional(), // Hz
    bitDepth: z.number().optional(),
    fileSize: z.number().optional(), // bytes
    format: z.enum(["wav", "mp3", "flac", "aac"]).optional(),
  }).optional(),
  
  // Quality metrics
  quality: z.object({
    lufs: z.number().optional(), // integrated loudness
    peakDb: z.number().optional(), // true peak level
    dynamicRange: z.number().optional(), // DR measurement
    spectralBalance: z.string().optional(), // analysis results
  }).optional(),
  
  // Manual overrides and notes
  overrides: z.object({
    voice: z.string().optional(), // override assigned voice
    text: z.string().optional(), // override segment text
    ssml: z.string().optional(), // custom SSML
    notes: z.string().optional(), // production notes
  }).optional(),
});

// Chapter-level Audio Production Metadata
export const chapterAudioMetadataSchema = z.object({
  chapterId: z.string(),
  
  // Global processing chain settings for this chapter
  globalProcessingChain: audioProcessingChainSchema,
  
  // Segment-specific metadata
  segments: z.array(segmentAudioMetadataSchema),
  
  // Chapter-level audio information
  masterAudio: z.object({
    filename: z.string().optional(),
    duration: z.number().optional(), // total duration in seconds
    totalSegments: z.number(),
    completedSegments: z.number(),
    lastProcessed: z.string().datetime().optional(),
  }).optional(),
  
  // Chapter-level quality metrics
  chapterQuality: z.object({
    averageLUFS: z.number().optional(),
    consistencyScore: z.number().optional(), // 0-100
    peakLevels: z.array(z.number()).optional(),
  }).optional(),
});

// Project-level Audio Production Configuration
export const projectAudioProductionSchema = z.object({
  version: z.literal(1),
  
  // Project-wide default processing chain
  defaultProcessingChain: audioProcessingChainSchema,
  
  // Global audio settings
  globalSettings: z.object({
    outputFormat: z.enum(["wav", "mp3", "flac", "aac"]).default("wav"),
    sampleRate: z.union([z.literal(22050), z.literal(44100), z.literal(48000)]).default(44100),
    bitDepth: z.union([z.literal(16), z.literal(24)]).default(24),
    
    // Batch processing settings
    batchSize: z.number().int().positive().default(5),
    parallelProcessing: z.boolean().default(true),
    
    // Quality control
    autoQualityCheck: z.boolean().default(true),
    targetLoudnessRange: z.object({
      min: z.number().default(-23),
      max: z.number().default(-18),
    }),
  }),
  
  // Chapter metadata
  chapters: z.array(chapterAudioMetadataSchema),
  
  // Project metadata
  metadata: z.object({
    created: z.string().datetime(),
    lastModified: z.string().datetime(),
    totalChapters: z.number(),
    completedChapters: z.number(),
    estimatedDuration: z.number().optional(), // total estimated duration in seconds
  }),
});

// Type exports for TypeScript
export type NoiseCleanupSettings = z.infer<typeof noiseCleanupSchema>;
export type DynamicControlSettings = z.infer<typeof dynamicControlSchema>;
export type EQShapingSettings = z.infer<typeof eqShapingSchema>;
export type SpatialEnhancementSettings = z.infer<typeof spatialEnhancementSchema>;
export type MasteringSettings = z.infer<typeof masteringSchema>;
export type AudioProcessingChain = z.infer<typeof audioProcessingChainSchema>;
export type SegmentAudioMetadata = z.infer<typeof segmentAudioMetadataSchema>;
export type ChapterAudioMetadata = z.infer<typeof chapterAudioMetadataSchema>;
export type ProjectAudioProduction = z.infer<typeof projectAudioProductionSchema>;