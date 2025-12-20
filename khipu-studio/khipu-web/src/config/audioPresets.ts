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
export function createDefaultProcessingChain(): AudioProcessingChain {
  return {
    noiseCleanup: {
      noiseReduction: { enabled: false, amount: 0 },
      deEsser: { enabled: false, threshold: -20 },
      deClicker: { enabled: false, sensitivity: 50 },
    },
    dynamicControl: {
      compression: {
        enabled: false,
        threshold: -20,
        ratio: 4,
        attack: 5,
        release: 50,
      },
      limiting: { enabled: false, threshold: -1, release: 50 },
      normalization: { enabled: false, targetLevel: -16 },
    },
    eqShaping: {
      highPass: { enabled: false, frequency: 80, slope: 12 },
      lowPass: { enabled: false, frequency: 15000, slope: 12 },
      parametricEQ: {
        bands: [],
      },
    },
    spatialEnhancement: {
      reverb: {
        enabled: false,
        roomSize: 0.3,
        damping: 0.5,
        wetLevel: 0.2,
      },
      stereoWidth: { enabled: false, width: 1.0 },
    },
    consistencyMastering: {
      loudnessNormalization: { enabled: false, targetLUFS: -16 },
      dithering: { enabled: false, bitDepth: 16 },
    },
  };
}

/**
 * Clean and polished preset - professional audiobook quality
 */
const cleanPolished: AudioPreset = {
  id: 'clean_polished',
  name: '✨ Clean & Polished',
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
 * Raw unprocessed preset - bypass all processing
 */
const rawUnprocessed: AudioPreset = {
  id: 'raw_unprocessed',
  name: '🎤 Raw & Unprocessed',
  description: 'No processing - original recording',
  processingChain: createDefaultProcessingChain(),
};

/**
 * Additional presets from desktop app (Page 2+)
 */
const cleanNatural: AudioPreset = {
  id: 'clean_natural',
  name: '🌿 Clean Natural',
  description: 'Minimal processing for pristine natural voice',
  processingChain: createDefaultProcessingChain(),
};

const cleanIntimate: AudioPreset = {
  id: 'clean_intimate',
  name: '💫 Clean Intimate',
  description: 'Close, intimate storytelling style',
  processingChain: createDefaultProcessingChain(),
};

const characterPhone: AudioPreset = {
  id: 'character_phone',
  name: '☎️ Phone/Radio',
  description: 'Telephone or vintage radio effect',
  processingChain: createDefaultProcessingChain(),
};

const characterVintage: AudioPreset = {
  id: 'character_vintage',
  name: '📻 Vintage Radio',
  description: 'Classic 1940s radio broadcast sound',
  processingChain: createDefaultProcessingChain(),
};

const characterElderly: AudioPreset = {
  id: 'character_elderly',
  name: '👴 Elderly Voice',
  description: 'Warm, aged character with gentle processing',
  processingChain: createDefaultProcessingChain(),
};

const characterChild: AudioPreset = {
  id: 'character_child',
  name: '👶 Child Voice',
  description: 'Bright, youthful character processing',
  processingChain: createDefaultProcessingChain(),
};

const characterMonster: AudioPreset = {
  id: 'character_monster',
  name: '👹 Monster Voice',
  description: 'Dark, menacing character effect',
  processingChain: createDefaultProcessingChain(),
};

const broadcastRadio: AudioPreset = {
  id: 'broadcast_radio',
  name: '📡 Radio Broadcast',
  description: 'Professional radio station processing',
  processingChain: createDefaultProcessingChain(),
};

const broadcastNews: AudioPreset = {
  id: 'broadcast_news',
  name: '📰 News Anchor',
  description: 'Crisp, authoritative news presentation',
  processingChain: createDefaultProcessingChain(),
};

const broadcastPodcast: AudioPreset = {
  id: 'broadcast_podcast',
  name: '🎙️ Podcast Pro',
  description: 'Optimized for podcast distribution',
  processingChain: createDefaultProcessingChain(),
};

const broadcastSports: AudioPreset = {
  id: 'broadcast_sports',
  name: '⚽ Sports Commentary',
  description: 'Dynamic, energetic sports broadcasting',
  processingChain: createDefaultProcessingChain(),
};

const vintageGoldenAge: AudioPreset = {
  id: 'vintage_golden_age',
  name: '🎭 Golden Age Radio',
  description: 'Classic 1940s-50s radio drama sound',
  processingChain: createDefaultProcessingChain(),
};

const vintageTape: AudioPreset = {
  id: 'vintage_tape',
  name: '📼 Vintage Tape',
  description: 'Analog tape warmth and saturation',
  processingChain: createDefaultProcessingChain(),
};

const vintageLoFi: AudioPreset = {
  id: 'vintage_lo_fi',
  name: '🔊 Lo-Fi Vintage',
  description: 'Deliberately degraded retro sound',
  processingChain: createDefaultProcessingChain(),
};

const envCathedral: AudioPreset = {
  id: 'env_cathedral',
  name: '⛪ Cathedral',
  description: 'Large reverberant space like cathedral',
  processingChain: createDefaultProcessingChain(),
};

const envForest: AudioPreset = {
  id: 'env_forest',
  name: '🌲 Forest Echo',
  description: 'Natural outdoor reverb with depth',
  processingChain: createDefaultProcessingChain(),
};

const envCavern: AudioPreset = {
  id: 'env_cavern',
  name: '🕳️ Deep Cavern',
  description: 'Dramatic underground cave acoustics',
  processingChain: createDefaultProcessingChain(),
};

const envUnderwater: AudioPreset = {
  id: 'env_underwater',
  name: '🌊 Underwater',
  description: 'Submerged, muffled underwater effect',
  processingChain: createDefaultProcessingChain(),
};

const fxAlien: AudioPreset = {
  id: 'fx_alien',
  name: '👽 Alien Voice',
  description: 'Otherworldly alien character effect',
  processingChain: createDefaultProcessingChain(),
};

const fxGhost: AudioPreset = {
  id: 'fx_ghost',
  name: '👻 Ghost Voice',
  description: 'Ethereal, haunting spectral effect',
  processingChain: createDefaultProcessingChain(),
};

const fxMegaphone: AudioPreset = {
  id: 'fx_megaphone',
  name: '📢 Megaphone',
  description: 'Distorted megaphone/bullhorn effect',
  processingChain: createDefaultProcessingChain(),
};

const fxRobot: AudioPreset = {
  id: 'fx_robot',
  name: '🤖 Robot Voice',
  description: 'Robotic/synthetic character effect',
  processingChain: createDefaultProcessingChain(),
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
  cinematicDramatic,
  // Page 2: Clean & Character
  cleanNatural,
  cleanIntimate,
  characterPhone,
  characterVintage,
  characterElderly,
  characterChild,
  // Page 3: Character & Broadcast
  characterMonster,
  broadcastRadio,
  broadcastNews,
  broadcastPodcast,
  broadcastSports,
  vintageGoldenAge,
  // Page 4: Vintage & Environmental
  vintageTape,
  vintageLoFi,
  envCathedral,
  envForest,
  envCavern,
  envUnderwater,
  // Page 5: Special Effects
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
