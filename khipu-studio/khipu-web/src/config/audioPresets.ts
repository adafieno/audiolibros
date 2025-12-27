/**
 * Audio Processing Presets
 * 
 * Predefined processing chains for different audio production scenarios.
 */

import type { AudioProcessingChain } from '../types/audio-production';

export interface AudioPreset {
  id: string;
  name: string;
  description: string;
  processingChain: AudioProcessingChain;
}

/**
 * Create a default processing chain with all effects disabled
 */
interface ProcessingChainParams {
  // Noise Cleanup
  noiseReduction?: { amount: number };
  deEsser?: { threshold: number };
  deClicker?: { sensitivity: number };
  // Compression
  compression?: { threshold: number; ratio: number; attack: number; release: number };
  limiting?: { threshold: number; release: number };
  normalization?: { targetLevel: number };
  // EQ
  highPass?: { frequency: number; slope: number };
  lowPass?: { frequency: number; slope: number };
  eqBands?: Array<{ frequency: number; gain: number; q: number }>;
  // Spatial
  reverb?: { roomSize: number; damping: number; wetLevel: number };
  stereoWidth?: { width: number };
  // Mastering
  loudnessTarget?: number;
  dithering?: { bitDepth: number };
}

/**
 * Universal function to create processing chain from parameters
 */
export function createProcessingChain(params: ProcessingChainParams = {}): AudioProcessingChain {
  return {
    noiseCleanup: {
      noiseReduction: params.noiseReduction 
        ? { enabled: true, amount: params.noiseReduction.amount }
        : { enabled: false, amount: 0 },
      deEsser: params.deEsser
        ? { enabled: true, threshold: params.deEsser.threshold }
        : { enabled: false, threshold: -20 },
      deClicker: params.deClicker
        ? { enabled: true, sensitivity: params.deClicker.sensitivity }
        : { enabled: false, sensitivity: 50 },
    },
    dynamicControl: {
      compression: params.compression
        ? { enabled: true, ...params.compression }
        : { enabled: false, threshold: -20, ratio: 4, attack: 5, release: 50 },
      limiting: params.limiting
        ? { enabled: true, ...params.limiting }
        : { enabled: false, threshold: -1, release: 50 },
      normalization: params.normalization
        ? { enabled: true, targetLevel: params.normalization.targetLevel }
        : { enabled: false, targetLevel: -16 },
    },
    eqShaping: {
      highPass: params.highPass
        ? { enabled: true, ...params.highPass }
        : { enabled: false, frequency: 80, slope: 12 },
      lowPass: params.lowPass
        ? { enabled: true, ...params.lowPass }
        : { enabled: false, frequency: 15000, slope: 12 },
      parametricEQ: {
        bands: params.eqBands || [],
      },
    },
    spatialEnhancement: {
      reverb: params.reverb
        ? { enabled: true, ...params.reverb }
        : { enabled: false, roomSize: 0.3, damping: 0.5, wetLevel: 0.2 },
      stereoWidth: params.stereoWidth
        ? { enabled: true, width: params.stereoWidth.width }
        : { enabled: false, width: 1.0 },
    },
    consistencyMastering: {
      loudnessNormalization: params.loudnessTarget
        ? { enabled: true, targetLUFS: params.loudnessTarget }
        : { enabled: false, targetLUFS: -16 },
      dithering: params.dithering
        ? { enabled: true, bitDepth: params.dithering.bitDepth }
        : { enabled: false, bitDepth: 16 },
    },
  };
}

/**
 * Clean and polished preset - professional audiobook quality
 */
const cleanPolished: AudioPreset = {
  id: 'clean_polished',
  name: '💎 Clean & Polished',
  description: 'Professional audiobook quality with clarity and warmth',
  processingChain: {
    noiseCleanup: {
      noiseReduction: { enabled: true, amount: 30 },
      deEsser: { enabled: true, threshold: -25 },
      deClicker: { enabled: true, sensitivity: 60 },
    },
    dynamicControl: {
      compression: {
        enabled: true,
        threshold: -18,
        ratio: 3,
        attack: 10,
        release: 100,
      },
      limiting: { enabled: true, threshold: -2, release: 50 },
      normalization: { enabled: true, targetLevel: -18 },
    },
    eqShaping: {
      highPass: { enabled: true, frequency: 80, slope: 12 },
      lowPass: { enabled: true, frequency: 12000, slope: 6 },
      parametricEQ: {
        bands: [
          { frequency: 200, gain: -2, q: 0.7 }, // Reduce muddiness
          { frequency: 3000, gain: 2, q: 1.0 }, // Boost presence
          { frequency: 8000, gain: 1, q: 0.7 }, // Add air
        ],
      },
    },
    spatialEnhancement: {
      reverb: {
        enabled: true,
        roomSize: 0.2,
        damping: 0.7,
        wetLevel: 0.15,
      },
      stereoWidth: { enabled: false, width: 1.0 },
    },
    consistencyMastering: {
      loudnessNormalization: { enabled: true, targetLUFS: -16 },
      dithering: { enabled: true, bitDepth: 16 },
    },
  },
};

/**
 * Warm and intimate preset - close microphone feel
 */
const warmIntimate: AudioPreset = {
  id: 'warm_intimate',
  name: '🔥 Warm & Intimate',
  description: 'Close, personal sound with enhanced low-mids',
  processingChain: {
    noiseCleanup: {
      noiseReduction: { enabled: true, amount: 20 },
      deEsser: { enabled: true, threshold: -22 },
      deClicker: { enabled: true, sensitivity: 50 },
    },
    dynamicControl: {
      compression: {
        enabled: true,
        threshold: -20,
        ratio: 2.5,
        attack: 15,
        release: 120,
      },
      limiting: { enabled: true, threshold: -1, release: 40 },
      normalization: { enabled: true, targetLevel: -18 },
    },
    eqShaping: {
      highPass: { enabled: true, frequency: 60, slope: 6 },
      lowPass: { enabled: true, frequency: 10000, slope: 6 },
      parametricEQ: {
        bands: [
          { frequency: 150, gain: 2, q: 0.8 }, // Warmth
          { frequency: 400, gain: 1, q: 1.0 }, // Body
          { frequency: 2500, gain: -1, q: 0.7 }, // Reduce harshness
          { frequency: 7000, gain: -2, q: 0.5 }, // Soft top end
        ],
      },
    },
    spatialEnhancement: {
      reverb: {
        enabled: true,
        roomSize: 0.15,
        damping: 0.8,
        wetLevel: 0.1,
      },
      stereoWidth: { enabled: false, width: 1.0 },
    },
    consistencyMastering: {
      loudnessNormalization: { enabled: true, targetLUFS: -18 },
      dithering: { enabled: true, bitDepth: 16 },
    },
  },
};

/**
 * Broadcast standard preset - radio/podcast quality
 */
const broadcastStandard: AudioPreset = {
  id: 'broadcast_standard',
  name: '📻 Broadcast Standard',
  description: 'Radio/podcast quality with heavy processing',
  processingChain: {
    noiseCleanup: {
      noiseReduction: { enabled: true, amount: 40 },
      deEsser: { enabled: true, threshold: -28 },
      deClicker: { enabled: true, sensitivity: 70 },
    },
    dynamicControl: {
      compression: {
        enabled: true,
        threshold: -16,
        ratio: 4,
        attack: 5,
        release: 80,
      },
      limiting: { enabled: true, threshold: -0.5, release: 30 },
      normalization: { enabled: true, targetLevel: -16 },
    },
    eqShaping: {
      highPass: { enabled: true, frequency: 100, slope: 18 },
      lowPass: { enabled: true, frequency: 15000, slope: 6 },
      parametricEQ: {
        bands: [
          { frequency: 250, gain: -3, q: 0.8 }, // Remove rumble
          { frequency: 1000, gain: 1, q: 0.5 }, // Speech clarity
          { frequency: 3500, gain: 3, q: 1.0 }, // Presence boost
          { frequency: 10000, gain: 2, q: 0.7 }, // Brilliance
        ],
      },
    },
    spatialEnhancement: {
      reverb: {
        enabled: false,
        roomSize: 0.1,
        damping: 0.9,
        wetLevel: 0.05,
      },
      stereoWidth: { enabled: false, width: 1.0 },
    },
    consistencyMastering: {
      loudnessNormalization: { enabled: true, targetLUFS: -16 },
      dithering: { enabled: true, bitDepth: 16 },
    },
  },
};

/**
 * Natural minimal preset - light touch processing
 */
const naturalMinimal: AudioPreset = {
  id: 'natural_minimal',
  name: '🍃 Natural & Minimal',
  description: 'Minimal processing for natural sound',
  processingChain: {
    noiseCleanup: {
      noiseReduction: { enabled: true, amount: 15 },
      deEsser: { enabled: true, threshold: -20 },
      deClicker: { enabled: false, sensitivity: 40 },
    },
    dynamicControl: {
      compression: {
        enabled: true,
        threshold: -24,
        ratio: 2,
        attack: 20,
        release: 150,
      },
      limiting: { enabled: true, threshold: -3, release: 60 },
      normalization: { enabled: true, targetLevel: -20 },
    },
    eqShaping: {
      highPass: { enabled: true, frequency: 60, slope: 6 },
      lowPass: { enabled: false, frequency: 15000, slope: 6 },
      parametricEQ: {
        bands: [],
      },
    },
    spatialEnhancement: {
      reverb: {
        enabled: false,
        roomSize: 0.2,
        damping: 0.5,
        wetLevel: 0.1,
      },
      stereoWidth: { enabled: false, width: 1.0 },
    },
    consistencyMastering: {
      loudnessNormalization: { enabled: true, targetLUFS: -20 },
      dithering: { enabled: true, bitDepth: 16 },
    },
  },
};

/**
 * Cinematic dramatic preset - movie-style narration
 */
const cinematicDramatic: AudioPreset = {
  id: 'cinematic_dramatic',
  name: '🎬 Cinematic & Dramatic',
  description: 'Movie-style narration with depth and space',
  processingChain: {
    noiseCleanup: {
      noiseReduction: { enabled: true, amount: 25 },
      deEsser: { enabled: true, threshold: -23 },
      deClicker: { enabled: true, sensitivity: 55 },
    },
    dynamicControl: {
      compression: {
        enabled: true,
        threshold: -22,
        ratio: 3,
        attack: 12,
        release: 120,
      },
      limiting: { enabled: true, threshold: -1.5, release: 45 },
      normalization: { enabled: true, targetLevel: -18 },
    },
    eqShaping: {
      highPass: { enabled: true, frequency: 70, slope: 12 },
      lowPass: { enabled: true, frequency: 12000, slope: 6 },
      parametricEQ: {
        bands: [
          { frequency: 120, gain: 3, q: 0.8 }, // Deep bass
          { frequency: 300, gain: 1, q: 0.7 }, // Fullness
          { frequency: 2000, gain: -1, q: 0.5 }, // Smoothness
          { frequency: 5000, gain: 1, q: 0.8 }, // Clarity
        ],
      },
    },
    spatialEnhancement: {
      reverb: {
        enabled: true,
        roomSize: 0.5,
        damping: 0.4,
        wetLevel: 0.3,
      },
      stereoWidth: { enabled: true, width: 1.2 },
    },
    consistencyMastering: {
      loudnessNormalization: { enabled: true, targetLUFS: -18 },
      dithering: { enabled: true, bitDepth: 16 },
    },
  },
};

/**
 * Soft and gentle preset - delicate processing for children's audiobooks
 */
const softGentle: AudioPreset = {
  id: 'soft_gentle',
  name: '🌸 Soft & Gentle',
  description: 'Delicate processing for children\'s audiobooks or soft narration',
  processingChain: {
    noiseCleanup: {
      noiseReduction: { enabled: true, amount: 20 },
      deEsser: { enabled: true, threshold: -26 },
      deClicker: { enabled: true, sensitivity: 45 },
    },
    dynamicControl: {
      compression: {
        enabled: true,
        threshold: -22,
        ratio: 2,
        attack: 20,
        release: 140,
      },
      limiting: { enabled: true, threshold: -2.5, release: 55 },
      normalization: { enabled: true, targetLevel: -20 },
    },
    eqShaping: {
      highPass: { enabled: true, frequency: 60, slope: 6 },
      lowPass: { enabled: true, frequency: 10000, slope: 6 },
      parametricEQ: {
        bands: [
          { frequency: 200, gain: -1, q: 0.5 }, // Reduce muddiness gently
          { frequency: 2500, gain: 1, q: 0.8 }, // Soft presence
          { frequency: 6000, gain: -1, q: 0.5 }, // Gentle high-end roll-off
        ],
      },
    },
    spatialEnhancement: {
      reverb: {
        enabled: true,
        roomSize: 0.2,
        damping: 0.7,
        wetLevel: 0.12,
      },
      stereoWidth: { enabled: false, width: 1.0 },
    },
    consistencyMastering: {
      loudnessNormalization: { enabled: true, targetLUFS: -20 },
      dithering: { enabled: true, bitDepth: 16 },
    },
  },
};

/**
 * Raw unprocessed preset - bypass all processing
 */
const rawUnprocessed: AudioPreset = {
  id: 'raw_unprocessed',
  name: '🎤 Raw & Unprocessed',
  description: 'No processing - original recording',
  processingChain: createProcessingChain(),
};

/**
 * Additional presets from desktop app (Page 2+)
 */
const cleanNatural: AudioPreset = {
  id: 'clean_natural',
  name: '🌿 Clean Natural',
  description: 'Minimal processing for pristine natural voice',
  processingChain: createProcessingChain({
    noiseReduction: { amount: 15 },
    deEsser: { threshold: -28 },
    compression: { threshold: -24, ratio: 2, attack: 15, release: 100 },
    normalization: { targetLevel: -18 },
    highPass: { frequency: 70, slope: 6 },
    loudnessTarget: -18,
    dithering: { bitDepth: 24 },
  }),
};

const cleanIntimate: AudioPreset = {
  id: 'clean_intimate',
  name: '💫 Clean Intimate',
  description: 'Close, intimate storytelling style',
  processingChain: createProcessingChain({
    noiseReduction: { amount: 25 },
    deEsser: { threshold: -26 },
    deClicker: { sensitivity: 50 },
    compression: { threshold: -22, ratio: 3, attack: 10, release: 80 },
    limiting: { threshold: -1, release: 40 },
    normalization: { targetLevel: -18 },
    highPass: { frequency: 60, slope: 6 },
    eqBands: [
      { frequency: 200, gain: 1.5, q: 0.8 },
      { frequency: 3000, gain: 1, q: 0.7 },
    ],
    reverb: { roomSize: 0.12, damping: 0.85, wetLevel: 0.08 },
    loudnessTarget: -18,
    dithering: { bitDepth: 24 },
  }),
};

const characterPhone: AudioPreset = {
  id: 'character_phone',
  name: '☎️ Phone/Radio',
  description: 'Telephone or vintage radio effect',
  processingChain: createProcessingChain({
    compression: { threshold: -15, ratio: 6, attack: 2, release: 30 },
    limiting: { threshold: -3, release: 30 },
    normalization: { targetLevel: -16 },
    highPass: { frequency: 300, slope: 24 },
    lowPass: { frequency: 3400, slope: 24 },
    eqBands: [
      { frequency: 1000, gain: 4, q: 1.5 },
      { frequency: 2500, gain: 3, q: 1.2 },
    ],
    loudnessTarget: -16,
    dithering: { bitDepth: 16 },
  }),
};

const characterVintage: AudioPreset = {
  id: 'character_vintage',
  name: '📻 Vintage Radio',
  description: 'Classic 1940s radio broadcast sound',
  processingChain: createProcessingChain({
    compression: { threshold: -18, ratio: 5, attack: 3, release: 40 },
    limiting: { threshold: -4, release: 35 },
    normalization: { targetLevel: -18 },
    highPass: { frequency: 250, slope: 18 },
    lowPass: { frequency: 5000, slope: 18 },
    eqBands: [
      { frequency: 800, gain: 3, q: 1.0 },
      { frequency: 2000, gain: 4, q: 1.2 },
      { frequency: 3500, gain: -2, q: 0.8 },
    ],
    reverb: { roomSize: 0.15, damping: 0.8, wetLevel: 0.1 },
    stereoWidth: { width: 0.7 },
    loudnessTarget: -18,
    dithering: { bitDepth: 16 },
  }),
};

const characterElderly: AudioPreset = {
  id: 'character_elderly',
  name: '👴 Elderly Voice',
  description: 'Warm, aged character with gentle processing',
  processingChain: createProcessingChain({
    noiseReduction: { amount: 35 },
    deEsser: { threshold: -30 },
    compression: { threshold: -22, ratio: 3.5, attack: 20, release: 120 },
    normalization: { targetLevel: -17 },
    highPass: { frequency: 90, slope: 6 },
    lowPass: { frequency: 9000, slope: 12 },
    eqBands: [
      { frequency: 180, gain: 2.5, q: 0.9 },
      { frequency: 450, gain: 1.5, q: 0.8 },
      { frequency: 3500, gain: -2, q: 0.7 },
      { frequency: 7000, gain: -3, q: 0.6 },
    ],
    reverb: { roomSize: 0.2, damping: 0.75, wetLevel: 0.12 },
    loudnessTarget: -17,
    dithering: { bitDepth: 16 },
  }),
};

const characterChild: AudioPreset = {
  id: 'character_child',
  name: '👶 Child Voice',
  description: 'Bright, youthful character processing',
  processingChain: createProcessingChain({
    noiseReduction: { amount: 20 },
    deEsser: { threshold: -24 },
    compression: { threshold: -20, ratio: 3, attack: 8, release: 60 },
    limiting: { threshold: -1.5, release: 35 },
    normalization: { targetLevel: -16 },
    highPass: { frequency: 150, slope: 12 },
    eqBands: [
      { frequency: 300, gain: -1.5, q: 0.8 },
      { frequency: 2500, gain: 3, q: 1.0 },
      { frequency: 5000, gain: 4, q: 0.8 },
      { frequency: 9000, gain: 2, q: 0.6 },
    ],
    reverb: { roomSize: 0.18, damping: 0.65, wetLevel: 0.15 },
    stereoWidth: { width: 1.1 },
    loudnessTarget: -16,
    dithering: { bitDepth: 16 },
  }),
};

const characterMonster: AudioPreset = {
  id: 'character_monster',
  name: '👹 Monster Voice',
  description: 'Dark, menacing character effect',
  processingChain: createProcessingChain({
    compression: { threshold: -25, ratio: 8, attack: 1, release: 20 },
    limiting: { threshold: -1, release: 20 },
    normalization: { targetLevel: -14 },
    highPass: { frequency: 60, slope: 12 },
    eqBands: [
      { frequency: 120, gain: 8, q: 1.2 },
      { frequency: 250, gain: 6, q: 1.0 },
      { frequency: 600, gain: -4, q: 0.8 },
      { frequency: 2000, gain: -6, q: 1.2 },
      { frequency: 5000, gain: 3, q: 0.7 },
    ],
    reverb: { roomSize: 0.6, damping: 0.4, wetLevel: 0.35 },
    stereoWidth: { width: 1.3 },
    loudnessTarget: -14,
    dithering: { bitDepth: 16 },
  }),
};

const broadcastRadio: AudioPreset = {
  id: 'broadcast_radio',
  name: '📡 Radio Broadcast',
  description: 'Professional radio station processing',
  processingChain: createProcessingChain({
    noiseReduction: { amount: 30 },
    deEsser: { threshold: -22 },
    deClicker: { sensitivity: 65 },
    compression: { threshold: -14, ratio: 5, attack: 3, release: 50 },
    limiting: { threshold: -1, release: 30 },
    normalization: { targetLevel: -14 },
    highPass: { frequency: 80, slope: 12 },
    lowPass: { frequency: 15000, slope: 12 },
    eqBands: [
      { frequency: 150, gain: -2, q: 0.8 },
      { frequency: 3000, gain: 4, q: 1.2 },
      { frequency: 6000, gain: 3, q: 0.9 },
      { frequency: 10000, gain: 2, q: 0.7 },
    ],
    loudnessTarget: -14,
    dithering: { bitDepth: 16 },
  }),
};

const broadcastNews: AudioPreset = {
  id: 'broadcast_news',
  name: '📰 News Anchor',
  description: 'Crisp, authoritative news presentation',
  processingChain: createProcessingChain({
    noiseReduction: { amount: 35 },
    deEsser: { threshold: -23 },
    deClicker: { sensitivity: 70 },
    compression: { threshold: -12, ratio: 6, attack: 2, release: 40 },
    limiting: { threshold: -0.5, release: 25 },
    normalization: { targetLevel: -13 },
    highPass: { frequency: 90, slope: 18 },
    eqBands: [
      { frequency: 200, gain: 2, q: 1.0 },
      { frequency: 1200, gain: 3, q: 1.2 },
      { frequency: 3500, gain: 5, q: 1.0 },
      { frequency: 7000, gain: 2, q: 0.8 },
    ],
    loudnessTarget: -13,
    dithering: { bitDepth: 16 },
  }),
};

const broadcastPodcast: AudioPreset = {
  id: 'broadcast_podcast',
  name: '🎙️ Podcast Pro',
  description: 'Optimized for podcast distribution',
  processingChain: createProcessingChain({
    noiseReduction: { amount: 25 },
    deEsser: { threshold: -24 },
    deClicker: { sensitivity: 55 },
    compression: { threshold: -16, ratio: 4, attack: 8, release: 80 },
    limiting: { threshold: -1.5, release: 45 },
    normalization: { targetLevel: -16 },
    highPass: { frequency: 75, slope: 12 },
    lowPass: { frequency: 14000, slope: 6 },
    eqBands: [
      { frequency: 150, gain: -1, q: 0.7 },
      { frequency: 3500, gain: 2, q: 1.0 },
      { frequency: 8000, gain: 1.5, q: 0.7 },
    ],
    reverb: { roomSize: 0.15, damping: 0.75, wetLevel: 0.1 },
    loudnessTarget: -16,
    dithering: { bitDepth: 16 },
  }),
};

const broadcastSports: AudioPreset = {
  id: 'broadcast_sports',
  name: '⚽ Sports Commentary',
  description: 'Dynamic, energetic sports broadcasting',
  processingChain: createProcessingChain({
    noiseReduction: { amount: 40 },
    deEsser: { threshold: -20 },
    deClicker: { sensitivity: 60 },
    compression: { threshold: -10, ratio: 7, attack: 1, release: 30 },
    limiting: { threshold: -0.3, release: 20 },
    normalization: { targetLevel: -12 },
    highPass: { frequency: 100, slope: 18 },
    eqBands: [
      { frequency: 250, gain: 3, q: 1.0 },
      { frequency: 1500, gain: 4, q: 1.2 },
      { frequency: 4000, gain: 6, q: 1.0 },
      { frequency: 8000, gain: 4, q: 0.8 },
    ],
    stereoWidth: { width: 1.2 },
    loudnessTarget: -12,
    dithering: { bitDepth: 16 },
  }),
};

const vintageGoldenAge: AudioPreset = {
  id: 'vintage_golden_age',
  name: '🎭 Golden Age Radio',
  description: 'Classic 1940s-50s radio drama sound',
  processingChain: createProcessingChain({
    noiseReduction: { amount: 10 },
    compression: { threshold: -16, ratio: 4.5, attack: 5, release: 60 },
    limiting: { threshold: -3, release: 40 },
    normalization: { targetLevel: -16 },
    highPass: { frequency: 200, slope: 18 },
    lowPass: { frequency: 6000, slope: 18 },
    eqBands: [
      { frequency: 400, gain: 2, q: 0.9 },
      { frequency: 1200, gain: 4, q: 1.2 },
      { frequency: 2800, gain: 3, q: 1.0 },
      { frequency: 4500, gain: -2, q: 0.8 },
    ],
    reverb: { roomSize: 0.25, damping: 0.7, wetLevel: 0.2 },
    stereoWidth: { width: 0.6 },
    loudnessTarget: -16,
    dithering: { bitDepth: 16 },
  }),
};

const vintageTape: AudioPreset = {
  id: 'vintage_tape',
  name: '📼 Vintage Tape',
  description: 'Analog tape warmth and saturation',
  processingChain: createProcessingChain({
    noiseReduction: { amount: 5 },
    compression: { threshold: -18, ratio: 3, attack: 12, release: 90 },
    normalization: { targetLevel: -18 },
    highPass: { frequency: 50, slope: 6 },
    lowPass: { frequency: 12000, slope: 12 },
    eqBands: [
      { frequency: 100, gain: 2, q: 0.7 },
      { frequency: 350, gain: 2.5, q: 0.8 },
      { frequency: 2000, gain: -1, q: 0.6 },
      { frequency: 8000, gain: -2.5, q: 0.7 },
    ],
    reverb: { roomSize: 0.15, damping: 0.8, wetLevel: 0.1 },
    loudnessTarget: -18,
    dithering: { bitDepth: 16 },
  }),
};

const vintageLoFi: AudioPreset = {
  id: 'vintage_lo_fi',
  name: '🔊 Lo-Fi Vintage',
  description: 'Deliberately degraded retro sound',
  processingChain: createProcessingChain({
    compression: { threshold: -14, ratio: 5, attack: 5, release: 50 },
    limiting: { threshold: -2, release: 35 },
    normalization: { targetLevel: -16 },
    highPass: { frequency: 300, slope: 12 },
    lowPass: { frequency: 4000, slope: 24 },
    eqBands: [
      { frequency: 600, gain: 4, q: 1.5 },
      { frequency: 1500, gain: 3, q: 1.2 },
      { frequency: 2500, gain: -3, q: 0.8 },
    ],
    reverb: { roomSize: 0.2, damping: 0.6, wetLevel: 0.15 },
    stereoWidth: { width: 0.5 },
    loudnessTarget: -16,
    dithering: { bitDepth: 16 },
  }),
};

const envCathedral: AudioPreset = {
  id: 'env_cathedral',
  name: '⛪ Cathedral',
  description: 'Large reverberant space like cathedral',
  processingChain: createProcessingChain({
    noiseReduction: { amount: 20 },
    deEsser: { threshold: -26 },
    compression: { threshold: -22, ratio: 2.5, attack: 15, release: 100 },
    normalization: { targetLevel: -18 },
    highPass: { frequency: 70, slope: 6 },
    eqBands: [
      { frequency: 150, gain: -2, q: 0.8 },
      { frequency: 2000, gain: 1, q: 0.7 },
      { frequency: 6000, gain: 2, q: 0.6 },
    ],
    reverb: { roomSize: 0.95, damping: 0.3, wetLevel: 0.55 },
    stereoWidth: { width: 1.5 },
    loudnessTarget: -18,
    dithering: { bitDepth: 16 },
  }),
};

const envForest: AudioPreset = {
  id: 'env_forest',
  name: '🌲 Forest Echo',
  description: 'Natural outdoor reverb with depth',
  processingChain: createProcessingChain({
    noiseReduction: { amount: 15 },
    compression: { threshold: -20, ratio: 2.5, attack: 12, release: 90 },
    normalization: { targetLevel: -17 },
    highPass: { frequency: 60, slope: 6 },
    eqBands: [
      { frequency: 200, gain: -1, q: 0.7 },
      { frequency: 1500, gain: 1, q: 0.8 },
      { frequency: 5000, gain: 2, q: 0.7 },
    ],
    reverb: { roomSize: 0.7, damping: 0.5, wetLevel: 0.4 },
    stereoWidth: { width: 1.4 },
    loudnessTarget: -17,
    dithering: { bitDepth: 16 },
  }),
};

const envCavern: AudioPreset = {
  id: 'env_cavern',
  name: '🕳️ Deep Cavern',
  description: 'Dramatic underground cave acoustics',
  processingChain: createProcessingChain({
    noiseReduction: { amount: 25 },
    compression: { threshold: -18, ratio: 3, attack: 10, release: 80 },
    normalization: { targetLevel: -17 },
    highPass: { frequency: 80, slope: 12 },
    eqBands: [
      { frequency: 150, gain: 3, q: 1.0 },
      { frequency: 500, gain: 2, q: 0.8 },
      { frequency: 3000, gain: -2, q: 0.7 },
      { frequency: 8000, gain: -3, q: 0.6 },
    ],
    reverb: { roomSize: 0.85, damping: 0.4, wetLevel: 0.5 },
    stereoWidth: { width: 1.6 },
    loudnessTarget: -17,
    dithering: { bitDepth: 16 },
  }),
};

const envUnderwater: AudioPreset = {
  id: 'env_underwater',
  name: '🌊 Underwater',
  description: 'Submerged, muffled underwater effect',
  processingChain: createProcessingChain({
    compression: { threshold: -16, ratio: 4, attack: 8, release: 70 },
    normalization: { targetLevel: -16 },
    highPass: { frequency: 150, slope: 12 },
    lowPass: { frequency: 2500, slope: 24 },
    eqBands: [
      { frequency: 300, gain: 4, q: 1.2 },
      { frequency: 800, gain: 3, q: 1.0 },
      { frequency: 1500, gain: -4, q: 0.8 },
    ],
    reverb: { roomSize: 0.75, damping: 0.8, wetLevel: 0.6 },
    stereoWidth: { width: 0.7 },
    loudnessTarget: -16,
    dithering: { bitDepth: 16 },
  }),
};

const fxAlien: AudioPreset = {
  id: 'fx_alien',
  name: '👽 Alien Voice',
  description: 'Otherworldly alien character effect',
  processingChain: createProcessingChain({
    compression: { threshold: -18, ratio: 6, attack: 3, release: 40 },
    limiting: { threshold: -1.5, release: 25 },
    normalization: { targetLevel: -15 },
    highPass: { frequency: 180, slope: 18 },
    lowPass: { frequency: 6000, slope: 12 },
    eqBands: [
      { frequency: 350, gain: -6, q: 1.2 },
      { frequency: 1200, gain: 8, q: 1.5 },
      { frequency: 3500, gain: 6, q: 1.2 },
      { frequency: 5000, gain: -4, q: 0.8 },
    ],
    reverb: { roomSize: 0.5, damping: 0.3, wetLevel: 0.4 },
    stereoWidth: { width: 1.3 },
    loudnessTarget: -15,
    dithering: { bitDepth: 16 },
  }),
};

const fxGhost: AudioPreset = {
  id: 'fx_ghost',
  name: '👻 Ghost Voice',
  description: 'Ethereal, haunting spectral effect',
  processingChain: createProcessingChain({
    compression: { threshold: -20, ratio: 4, attack: 10, release: 80 },
    normalization: { targetLevel: -17 },
    highPass: { frequency: 200, slope: 12 },
    lowPass: { frequency: 4000, slope: 18 },
    eqBands: [
      { frequency: 400, gain: -5, q: 1.0 },
      { frequency: 1800, gain: 6, q: 1.3 },
      { frequency: 3000, gain: 4, q: 1.0 },
    ],
    reverb: { roomSize: 0.9, damping: 0.2, wetLevel: 0.7 },
    stereoWidth: { width: 1.6 },
    loudnessTarget: -17,
    dithering: { bitDepth: 16 },
  }),
};

const fxMegaphone: AudioPreset = {
  id: 'fx_megaphone',
  name: '📢 Megaphone',
  description: 'Distorted megaphone/bullhorn effect',
  processingChain: createProcessingChain({
    compression: { threshold: -10, ratio: 8, attack: 1, release: 20 },
    limiting: { threshold: -0.5, release: 15 },
    normalization: { targetLevel: -12 },
    highPass: { frequency: 400, slope: 24 },
    lowPass: { frequency: 3000, slope: 24 },
    eqBands: [
      { frequency: 800, gain: 6, q: 1.5 },
      { frequency: 1500, gain: 8, q: 1.8 },
      { frequency: 2200, gain: 5, q: 1.2 },
    ],
    loudnessTarget: -12,
    dithering: { bitDepth: 16 },
  }),
};

const fxRobot: AudioPreset = {
  id: 'fx_robot',
  name: '🤖 Robot Voice',
  description: 'Robotic/synthetic character effect',
  processingChain: createProcessingChain({
    compression: { threshold: -20, ratio: 10, attack: 0.5, release: 10 },
    limiting: { threshold: -2, release: 15 },
    normalization: { targetLevel: -16 },
    highPass: { frequency: 200, slope: 24 },
    lowPass: { frequency: 8000, slope: 24 },
    eqBands: [
      { frequency: 400, gain: -6, q: 1.5 },
      { frequency: 1000, gain: 8, q: 2.0 },
      { frequency: 2500, gain: 6, q: 1.8 },
      { frequency: 5000, gain: -4, q: 1.2 },
    ],
    reverb: { roomSize: 0.25, damping: 0.3, wetLevel: 0.2 },
    stereoWidth: { width: 1.2 },
    loudnessTarget: -16,
    dithering: { bitDepth: 16 },
  }),
};

/**
 * All available presets - current 6 on page 1, new ones on pages 2+
 */
export const AUDIO_PRESETS: AudioPreset[] = [
  // Page 1: Current favorites
  rawUnprocessed,
  cleanPolished,
  warmIntimate,
  naturalMinimal,
  broadcastStandard,
  softGentle,
  // Page 2: Cinematic & Character
  cinematicDramatic,
  cleanNatural,
  cleanIntimate,
  characterPhone,
  characterVintage,
  characterElderly,
  // Page 3: Character & Broadcast
  characterChild,
  characterMonster,
  broadcastRadio,
  broadcastNews,
  broadcastPodcast,
  broadcastSports,
  // Page 4: Vintage & Environmental
  vintageGoldenAge,
  vintageTape,
  vintageLoFi,
  envCathedral,
  envForest,
  envCavern,
  // Page 5: Environmental & Special Effects
  envUnderwater,
  fxAlien,
  fxGhost,
  fxMegaphone,
  fxRobot,
];

/**
 * Get preset by ID
 */
export function getPresetById(id: string): AudioPreset | undefined {
  return AUDIO_PRESETS.find(preset => preset.id === id);
}

/**
 * Find which preset matches a processing chain
 */
export function findMatchingPreset(processingChain: AudioProcessingChain): AudioPreset | null {
  for (const preset of AUDIO_PRESETS) {
    if (JSON.stringify(preset.processingChain) === JSON.stringify(processingChain)) {
      return preset;
    }
  }
  return null;
}
