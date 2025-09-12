// Audio Production Utilities
// Helper functions for working with audio production metadata

import type { 
  AudioProcessingChain, 
  SegmentAudioMetadata, 
  ChapterAudioMetadata,
  ProjectAudioProduction 
} from "../types/audio-production";

/**
 * Creates default audio processing chain settings
 */
export function createDefaultProcessingChain(): AudioProcessingChain {
  return {
    noiseCleanup: {
      highPassFilter: {
        enabled: true,
        frequency: "80"
      },
      deClickDeEss: {
        enabled: false,
        intensity: "medium"
      }
    },
    dynamicControl: {
      compression: {
        enabled: true,
        ratio: "2.5:1",
        threshold: -12
      },
      limiter: {
        enabled: true,
        ceiling: -1
      }
    },
    eqShaping: {
      lowMidCut: {
        enabled: false,
        frequency: "200",
        gain: -2
      },
      presenceBoost: {
        enabled: true,
        frequency: "3",
        gain: 2
      },
      airLift: {
        enabled: false,
        frequency: "10",
        gain: 1
      }
    },
    spatialEnhancement: {
      reverb: {
        enabled: true,
        type: "room_0.4",
        wetMix: 8
      },
      stereoEnhancer: {
        enabled: false,
        width: 10
      }
    },
    mastering: {
      normalization: {
        enabled: true,
        targetLUFS: "-21"
      },
      peakLimiting: {
        enabled: true,
        maxPeak: -3
      },
      dithering: {
        enabled: false,
        bitDepth: "16"
      }
    }
  };
}

/**
 * Creates a new segment audio metadata entry
 */
export function createSegmentAudioMetadata(chunkId: string): SegmentAudioMetadata {
  return {
    chunkId,
    processingChain: {},
    generation: {
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Creates a new chapter audio metadata entry
 */
export function createChapterAudioMetadata(chapterId: string, segmentIds: string[]): ChapterAudioMetadata {
  return {
    chapterId,
    globalProcessingChain: createDefaultProcessingChain(),
    segments: segmentIds.map(id => createSegmentAudioMetadata(id)),
    masterAudio: {
      totalSegments: segmentIds.length,
      completedSegments: 0,
      lastProcessed: new Date().toISOString()
    }
  };
}

/**
 * Creates a new project audio production configuration
 */
export function createProjectAudioProduction(): ProjectAudioProduction {
  return {
    version: 1,
    defaultProcessingChain: createDefaultProcessingChain(),
    globalSettings: {
      outputFormat: "wav",
      sampleRate: 44100,
      bitDepth: 24,
      batchSize: 5,
      parallelProcessing: true,
      autoQualityCheck: true,
      targetLoudnessRange: {
        min: -23,
        max: -18
      }
    },
    chapters: [],
    metadata: {
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      totalChapters: 0,
      completedChapters: 0
    }
  };
}

/**
 * Merges processing chain settings, with overrides taking precedence
 */
export function mergeProcessingChain(
  base: AudioProcessingChain, 
  overrides: Partial<AudioProcessingChain>
): AudioProcessingChain {
  return {
    noiseCleanup: {
      ...base.noiseCleanup,
      ...overrides.noiseCleanup,
      highPassFilter: {
        ...base.noiseCleanup.highPassFilter,
        ...overrides.noiseCleanup?.highPassFilter
      },
      deClickDeEss: {
        ...base.noiseCleanup.deClickDeEss,
        ...overrides.noiseCleanup?.deClickDeEss
      }
    },
    dynamicControl: {
      ...base.dynamicControl,
      ...overrides.dynamicControl,
      compression: {
        ...base.dynamicControl.compression,
        ...overrides.dynamicControl?.compression
      },
      limiter: {
        ...base.dynamicControl.limiter,
        ...overrides.dynamicControl?.limiter
      }
    },
    eqShaping: {
      ...base.eqShaping,
      ...overrides.eqShaping,
      lowMidCut: {
        ...base.eqShaping.lowMidCut,
        ...overrides.eqShaping?.lowMidCut
      },
      presenceBoost: {
        ...base.eqShaping.presenceBoost,
        ...overrides.eqShaping?.presenceBoost
      },
      airLift: {
        ...base.eqShaping.airLift,
        ...overrides.eqShaping?.airLift
      }
    },
    spatialEnhancement: {
      ...base.spatialEnhancement,
      ...overrides.spatialEnhancement,
      reverb: {
        ...base.spatialEnhancement.reverb,
        ...overrides.spatialEnhancement?.reverb
      },
      stereoEnhancer: {
        ...base.spatialEnhancement.stereoEnhancer,
        ...overrides.spatialEnhancement?.stereoEnhancer
      }
    },
    mastering: {
      ...base.mastering,
      ...overrides.mastering,
      normalization: {
        ...base.mastering.normalization,
        ...overrides.mastering?.normalization
      },
      peakLimiting: {
        ...base.mastering.peakLimiting,
        ...overrides.mastering?.peakLimiting
      },
      dithering: {
        ...base.mastering.dithering,
        ...overrides.mastering?.dithering
      }
    }
  };
}

/**
 * Gets the effective processing chain for a segment (base + overrides)
 */
export function getEffectiveProcessingChain(
  chapterMetadata: ChapterAudioMetadata,
  segmentId: string
): AudioProcessingChain {
  const segment = chapterMetadata.segments.find(s => s.chunkId === segmentId);
  if (!segment?.processingChain) {
    return chapterMetadata.globalProcessingChain;
  }
  
  return mergeProcessingChain(chapterMetadata.globalProcessingChain, segment.processingChain);
}

/**
 * Calculates completion percentage for a chapter
 */
export function getChapterCompletionPercentage(chapter: ChapterAudioMetadata): number {
  if (chapter.masterAudio?.totalSegments === 0) return 0;
  
  const completed = chapter.masterAudio?.completedSegments || 0;
  const total = chapter.masterAudio?.totalSegments || 0;
  
  return Math.round((completed / total) * 100);
}

/**
 * Gets audio file path for a segment
 */
export function getSegmentAudioPath(
  projectRoot: string, 
  chapterId: string, 
  segmentId: string,
  format: string = "wav"
): string {
  return `${projectRoot}/audio/${chapterId}/${segmentId}.${format}`;
}

/**
 * Gets master audio file path for a chapter
 */
export function getChapterAudioPath(
  projectRoot: string,
  chapterId: string,
  format: string = "wav"
): string {
  return `${projectRoot}/audio/${chapterId}/master.${format}`;
}