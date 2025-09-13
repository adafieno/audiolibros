import type { AudioProcessingChain } from "../types/audio-production";

export interface AudioPreset {
  id: string;
  name: string;
  description: string;
  category: 'clean' | 'character' | 'broadcast' | 'vintage' | 'environmental' | 'effects';
  processingChain: AudioProcessingChain;
}

export const AUDIO_PRESETS: AudioPreset[] = [
  // Clean & Natural Category
  {
    id: 'clean_natural',
    name: 'Clean Natural',
    description: 'Minimal processing for pristine natural voice',
    category: 'clean',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "80" },
        deClickDeEss: { enabled: true, intensity: "light" }
      },
      dynamicControl: {
        compression: { enabled: false, ratio: "2:1", threshold: -18 },
        limiter: { enabled: false, ceiling: -3 }
      },
      eqShaping: {
        lowMidCut: { enabled: false, frequency: "200", gain: -2 },
        presenceBoost: { enabled: false, frequency: "3", gain: 1.5 },
        airLift: { enabled: false, frequency: "10", gain: 1.0 }
      },
      spatialEnhancement: {
        reverb: { enabled: false, type: "room_0.3", wetMix: 15 },
        stereoEnhancer: { enabled: false, width: 1.2 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-18" },
        peakLimiting: { enabled: true, maxPeak: -0.1 },
        dithering: { enabled: false, bitDepth: "24" }
      }
    }
  },
  {
    id: 'clean_polished',
    name: 'Clean Polished',
    description: 'Light enhancement for professional narration',
    category: 'clean',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "70" },
        deClickDeEss: { enabled: true, intensity: "medium" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "2.5:1", threshold: -20 },
        limiter: { enabled: true, ceiling: -1 }
      },
      eqShaping: {
        lowMidCut: { enabled: true, frequency: "150", gain: -1 },
        presenceBoost: { enabled: true, frequency: "3", gain: 2.0 },
        airLift: { enabled: true, frequency: "10", gain: 0.5 }
      },
      spatialEnhancement: {
        reverb: { enabled: false, type: "room_0.3", wetMix: 10 },
        stereoEnhancer: { enabled: false, width: 1.1 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-20" },
        peakLimiting: { enabled: true, maxPeak: -0.3 },
        dithering: { enabled: true, bitDepth: "24" }
      }
    }
  },
  {
    id: 'clean_intimate',
    name: 'Clean Intimate',
    description: 'Close, intimate storytelling style',
    category: 'clean',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "90" },
        deClickDeEss: { enabled: true, intensity: "heavy" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "3:1", threshold: -22 },
        limiter: { enabled: true, ceiling: -2 }
      },
      eqShaping: {
        lowMidCut: { enabled: true, frequency: "200", gain: -2 },
        presenceBoost: { enabled: true, frequency: "2", gain: 1.5 },
        airLift: { enabled: false, frequency: "8", gain: 0.3 }
      },
      spatialEnhancement: {
        reverb: { enabled: false, type: "room_0.3", wetMix: 5 },
        stereoEnhancer: { enabled: false, width: 1.0 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-23" },
        peakLimiting: { enabled: true, maxPeak: -0.5 },
        dithering: { enabled: true, bitDepth: "24" }
      }
    }
  },

  // Character Voices Category
  {
    id: 'character_phone',
    name: 'Phone/Radio',
    description: 'Telephone or vintage radio effect',
    category: 'character',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "90" },
        deClickDeEss: { enabled: true, intensity: "medium" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "3:1", threshold: -18 },
        limiter: { enabled: true, ceiling: -1 }
      },
      eqShaping: {
        lowMidCut: { enabled: true, frequency: "300", gain: -6 },
        presenceBoost: { enabled: true, frequency: "2", gain: 1.0 },
        airLift: { enabled: false, frequency: "10", gain: 0 }
      },
      spatialEnhancement: {
        reverb: { enabled: false, type: "room_0.3", wetMix: 0 },
        stereoEnhancer: { enabled: false, width: 1.0 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-18" },
        peakLimiting: { enabled: true, maxPeak: -1.0 },
        dithering: { enabled: false, bitDepth: "16" }
      }
    }
  },
  {
    id: 'character_vintage',
    name: 'Vintage Radio',
    description: 'Classic 1940s radio broadcast sound',
    category: 'character',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "90" },
        deClickDeEss: { enabled: false, intensity: "light" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "3:1", threshold: -20 },
        limiter: { enabled: true, ceiling: -2 }
      },
      eqShaping: {
        lowMidCut: { enabled: true, frequency: "300", gain: -12 },
        presenceBoost: { enabled: true, frequency: "3", gain: 2.0 },
        airLift: { enabled: false, frequency: "8", gain: 0 }
      },
      spatialEnhancement: {
        reverb: { enabled: false, type: "room_0.4", wetMix: 15 },
        stereoEnhancer: { enabled: false, width: 0.8 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-18" },
        peakLimiting: { enabled: true, maxPeak: -1.5 },
        dithering: { enabled: false, bitDepth: "16" }
      }
    }
  },

  // Broadcast Quality Category
  {
    id: 'broadcast_radio',
    name: 'Radio Broadcast',
    description: 'Professional radio station processing',
    category: 'broadcast',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "80" },
        deClickDeEss: { enabled: true, intensity: "heavy" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "3:1", threshold: -18 },
        limiter: { enabled: true, ceiling: -1 }
      },
      eqShaping: {
        lowMidCut: { enabled: true, frequency: "150", gain: -1 },
        presenceBoost: { enabled: true, frequency: "5", gain: 3.0 },
        airLift: { enabled: true, frequency: "12", gain: 2.0 }
      },
      spatialEnhancement: {
        reverb: { enabled: false, type: "room_0.3", wetMix: 5 },
        stereoEnhancer: { enabled: true, width: 1.3 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-18" },
        peakLimiting: { enabled: true, maxPeak: -0.1 },
        dithering: { enabled: true, bitDepth: "24" }
      }
    }
  },

  // Environmental Category
  {
    id: 'env_cathedral',
    name: 'Cathedral',
    description: 'Large reverberant space like cathedral',
    category: 'environmental',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "70" },
        deClickDeEss: { enabled: true, intensity: "light" }
      },
      dynamicControl: {
        compression: { enabled: false, ratio: "2:1", threshold: -22 },
        limiter: { enabled: true, ceiling: -3 }
      },
      eqShaping: {
        lowMidCut: { enabled: true, frequency: "150", gain: 3 },
        presenceBoost: { enabled: true, frequency: "3", gain: 1.0 },
        airLift: { enabled: true, frequency: "10", gain: 1.5 }
      },
      spatialEnhancement: {
        reverb: { enabled: true, type: "room_0.5", wetMix: 15 },
        stereoEnhancer: { enabled: true, width: 1.8 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-20" },
        peakLimiting: { enabled: true, maxPeak: -1.0 },
        dithering: { enabled: true, bitDepth: "24" }
      }
    }
  },

  // Vintage & Specialty Category  
  {
    id: 'vintage_warm',
    name: 'Warm Vintage',
    description: 'Warm, analog-style processing',
    category: 'vintage',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "90" },
        deClickDeEss: { enabled: true, intensity: "light" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "2:1", threshold: -22 },
        limiter: { enabled: true, ceiling: -2 }
      },
      eqShaping: {
        lowMidCut: { enabled: true, frequency: "150", gain: 2 },
        presenceBoost: { enabled: true, frequency: "3", gain: 1.5 },
        airLift: { enabled: false, frequency: "8", gain: 0.5 }
      },
      spatialEnhancement: {
        reverb: { enabled: true, type: "room_0.4", wetMix: 15 },
        stereoEnhancer: { enabled: true, width: 1.1 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-18" },
        peakLimiting: { enabled: true, maxPeak: -0.5 },
        dithering: { enabled: true, bitDepth: "24" }
      }
    }
  },

  // Character Voices Category (continued)
  {
    id: 'character_elderly',
    name: 'Elderly Voice',
    description: 'Warm, aged character with gentle processing',
    category: 'character',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "80" },
        deClickDeEss: { enabled: true, intensity: "light" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "2:1", threshold: -22 },
        limiter: { enabled: true, ceiling: -2 }
      },
      eqShaping: {
        lowMidCut: { enabled: true, frequency: "200", gain: -1 },
        presenceBoost: { enabled: true, frequency: "2", gain: 1.5 },
        airLift: { enabled: false, frequency: "8", gain: -1.5 }
      },
      spatialEnhancement: {
        reverb: { enabled: true, type: "room_0.4", wetMix: 8 },
        stereoEnhancer: { enabled: false, width: 1.0 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-21" },
        peakLimiting: { enabled: true, maxPeak: -1.0 },
        dithering: { enabled: true, bitDepth: "24" }
      }
    }
  },
  {
    id: 'character_child',
    name: 'Child Voice',
    description: 'Bright, youthful character processing',
    category: 'character',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "70" },
        deClickDeEss: { enabled: true, intensity: "medium" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "2.5:1", threshold: -18 },
        limiter: { enabled: true, ceiling: -1 }
      },
      eqShaping: {
        lowMidCut: { enabled: true, frequency: "150", gain: -2 },
        presenceBoost: { enabled: true, frequency: "5", gain: 3.0 },
        airLift: { enabled: true, frequency: "12", gain: 2.0 }
      },
      spatialEnhancement: {
        reverb: { enabled: true, type: "room_0.3", wetMix: 5 },
        stereoEnhancer: { enabled: true, width: 1.2 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-18" },
        peakLimiting: { enabled: true, maxPeak: -0.5 },
        dithering: { enabled: true, bitDepth: "24" }
      }
    }
  },
  {
    id: 'character_monster',
    name: 'Monster Voice',
    description: 'Dark, menacing character effect',
    category: 'character',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: false, frequency: "70" },
        deClickDeEss: { enabled: false, intensity: "light" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "3:1", threshold: -12 },
        limiter: { enabled: true, ceiling: -0.5 }
      },
      eqShaping: {
        lowMidCut: { enabled: false, frequency: "150", gain: 3.0 },
        presenceBoost: { enabled: true, frequency: "2", gain: -2.0 },
        airLift: { enabled: true, frequency: "8", gain: -4.0 }
      },
      spatialEnhancement: {
        reverb: { enabled: true, type: "room_0.5", wetMix: 20 },
        stereoEnhancer: { enabled: true, width: 1.6 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-18" },
        peakLimiting: { enabled: true, maxPeak: -0.1 },
        dithering: { enabled: false, bitDepth: "24" }
      }
    }
  },

  // Broadcast Quality Category (continued)
  {
    id: 'broadcast_news',
    name: 'News Anchor',
    description: 'Crisp, authoritative news presentation',
    category: 'broadcast',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "80" },
        deClickDeEss: { enabled: true, intensity: "heavy" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "3:1", threshold: -16 },
        limiter: { enabled: true, ceiling: -0.1 }
      },
      eqShaping: {
        lowMidCut: { enabled: true, frequency: "150", gain: -1 },
        presenceBoost: { enabled: true, frequency: "3", gain: 3.5 },
        airLift: { enabled: true, frequency: "10", gain: 2.5 }
      },
      spatialEnhancement: {
        reverb: { enabled: false, type: "room_0.3", wetMix: 0 },
        stereoEnhancer: { enabled: true, width: 1.1 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-18" },
        peakLimiting: { enabled: true, maxPeak: -0.1 },
        dithering: { enabled: true, bitDepth: "24" }
      }
    }
  },
  {
    id: 'broadcast_podcast',
    name: 'Podcast Pro',
    description: 'Optimized for podcast distribution',
    category: 'broadcast',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "70" },
        deClickDeEss: { enabled: true, intensity: "medium" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "2.5:1", threshold: -18 },
        limiter: { enabled: true, ceiling: -1 }
      },
      eqShaping: {
        lowMidCut: { enabled: true, frequency: "150", gain: -0.5 },
        presenceBoost: { enabled: true, frequency: "3", gain: 2.5 },
        airLift: { enabled: true, frequency: "10", gain: 1.5 }
      },
      spatialEnhancement: {
        reverb: { enabled: false, type: "room_0.3", wetMix: 3 },
        stereoEnhancer: { enabled: true, width: 1.2 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-20" },
        peakLimiting: { enabled: true, maxPeak: -1.0 },
        dithering: { enabled: true, bitDepth: "24" }
      }
    }
  },
  {
    id: 'broadcast_sports',
    name: 'Sports Commentary',
    description: 'Dynamic, energetic sports broadcasting',
    category: 'broadcast',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "90" },
        deClickDeEss: { enabled: true, intensity: "heavy" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "3:1", threshold: -14 },
        limiter: { enabled: true, ceiling: -0.1 }
      },
      eqShaping: {
        lowMidCut: { enabled: true, frequency: "200", gain: -1.5 },
        presenceBoost: { enabled: true, frequency: "5", gain: 4.5 },
        airLift: { enabled: true, frequency: "12", gain: 3.5 }
      },
      spatialEnhancement: {
        reverb: { enabled: false, type: "room_0.3", wetMix: 0 },
        stereoEnhancer: { enabled: true, width: 1.5 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-18" },
        peakLimiting: { enabled: true, maxPeak: -0.1 },
        dithering: { enabled: true, bitDepth: "24" }
      }
    }
  },

  // Vintage & Specialty Category (continued)
  {
    id: 'vintage_golden_age',
    name: 'Golden Age Radio',
    description: 'Classic 1940s-50s radio drama sound',
    category: 'vintage',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "90" },
        deClickDeEss: { enabled: false, intensity: "light" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "2:1", threshold: -20 },
        limiter: { enabled: true, ceiling: -3 }
      },
      eqShaping: {
        lowMidCut: { enabled: true, frequency: "300", gain: -3 },
        presenceBoost: { enabled: true, frequency: "2", gain: 2.0 },
        airLift: { enabled: false, frequency: "8", gain: -2.0 }
      },
      spatialEnhancement: {
        reverb: { enabled: true, type: "room_0.4", wetMix: 10 },
        stereoEnhancer: { enabled: false, width: 0.9 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-20" },
        peakLimiting: { enabled: true, maxPeak: -2.0 },
        dithering: { enabled: false, bitDepth: "16" }
      }
    }
  },
  {
    id: 'vintage_tape',
    name: 'Vintage Tape',
    description: 'Analog tape warmth and saturation',
    category: 'vintage',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "70" },
        deClickDeEss: { enabled: true, intensity: "light" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "2:1", threshold: -22 },
        limiter: { enabled: true, ceiling: -2 }
      },
      eqShaping: {
        lowMidCut: { enabled: false, frequency: "150", gain: 1.0 },
        presenceBoost: { enabled: true, frequency: "3", gain: 1.5 },
        airLift: { enabled: false, frequency: "10", gain: -0.5 }
      },
      spatialEnhancement: {
        reverb: { enabled: true, type: "room_0.4", wetMix: 8 },
        stereoEnhancer: { enabled: true, width: 1.1 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-21" },
        peakLimiting: { enabled: true, maxPeak: -1.5 },
        dithering: { enabled: true, bitDepth: "24" }
      }
    }
  },
  {
    id: 'vintage_lo_fi',
    name: 'Lo-Fi Vintage',
    description: 'Deliberately degraded retro sound',
    category: 'vintage',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "90" },
        deClickDeEss: { enabled: false, intensity: "light" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "2.5:1", threshold: -16 },
        limiter: { enabled: true, ceiling: -3 }
      },
      eqShaping: {
        lowMidCut: { enabled: true, frequency: "300", gain: -4 },
        presenceBoost: { enabled: true, frequency: "2", gain: 1.0 },
        airLift: { enabled: true, frequency: "8", gain: -3.0 }
      },
      spatialEnhancement: {
        reverb: { enabled: true, type: "room_0.5", wetMix: 12 },
        stereoEnhancer: { enabled: false, width: 0.8 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-20" },
        peakLimiting: { enabled: true, maxPeak: -3.0 },
        dithering: { enabled: false, bitDepth: "16" }
      }
    }
  },

  // Environmental Category (continued)
  {
    id: 'env_forest',
    name: 'Forest Echo',
    description: 'Natural outdoor reverb with depth',
    category: 'environmental',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "70" },
        deClickDeEss: { enabled: true, intensity: "light" }
      },
      dynamicControl: {
        compression: { enabled: false, ratio: "2:1", threshold: -24 },
        limiter: { enabled: true, ceiling: -4 }
      },
      eqShaping: {
        lowMidCut: { enabled: false, frequency: "150", gain: 0 },
        presenceBoost: { enabled: true, frequency: "3", gain: 1.0 },
        airLift: { enabled: true, frequency: "10", gain: 2.0 }
      },
      spatialEnhancement: {
        reverb: { enabled: true, type: "room_0.5", wetMix: 18 },
        stereoEnhancer: { enabled: true, width: 1.8 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-21" },
        peakLimiting: { enabled: true, maxPeak: -2.0 },
        dithering: { enabled: true, bitDepth: "24" }
      }
    }
  },
  {
    id: 'env_cavern',
    name: 'Deep Cavern',
    description: 'Dramatic underground cave acoustics',
    category: 'environmental',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "80" },
        deClickDeEss: { enabled: true, intensity: "light" }
      },
      dynamicControl: {
        compression: { enabled: false, ratio: "2:1", threshold: -26 },
        limiter: { enabled: true, ceiling: -6 }
      },
      eqShaping: {
        lowMidCut: { enabled: false, frequency: "150", gain: 2.0 },
        presenceBoost: { enabled: true, frequency: "2", gain: -0.5 },
        airLift: { enabled: true, frequency: "10", gain: 1.5 }
      },
      spatialEnhancement: {
        reverb: { enabled: true, type: "room_0.5", wetMix: 35 },
        stereoEnhancer: { enabled: true, width: 2.2 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-23" },
        peakLimiting: { enabled: true, maxPeak: -4.0 },
        dithering: { enabled: true, bitDepth: "24" }
      }
    }
  },
  {
    id: 'env_underwater',
    name: 'Underwater',
    description: 'Submerged, muffled underwater effect',
    category: 'environmental',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "70" },
        deClickDeEss: { enabled: false, intensity: "light" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "2:1", threshold: -20 },
        limiter: { enabled: true, ceiling: -3 }
      },
      eqShaping: {
        lowMidCut: { enabled: false, frequency: "150", gain: 1.0 },
        presenceBoost: { enabled: true, frequency: "2", gain: -3.0 },
        airLift: { enabled: true, frequency: "8", gain: -6.0 }
      },
      spatialEnhancement: {
        reverb: { enabled: true, type: "room_0.5", wetMix: 25 },
        stereoEnhancer: { enabled: true, width: 1.5 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-21" },
        peakLimiting: { enabled: true, maxPeak: -2.0 },
        dithering: { enabled: true, bitDepth: "24" }
      }
    }
  },

  // Special Effects Category (continued)
  {
    id: 'fx_alien',
    name: 'Alien Voice',
    description: 'Otherworldly alien character effect',
    category: 'effects',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "80" },
        deClickDeEss: { enabled: false, intensity: "light" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "3:1", threshold: -12 },
        limiter: { enabled: true, ceiling: -0.5 }
      },
      eqShaping: {
        lowMidCut: { enabled: true, frequency: "200", gain: -8 },
        presenceBoost: { enabled: true, frequency: "5", gain: -1.5 },
        airLift: { enabled: true, frequency: "12", gain: 4.0 }
      },
      spatialEnhancement: {
        reverb: { enabled: true, type: "room_0.4", wetMix: 15 },
        stereoEnhancer: { enabled: true, width: 1.3 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-18" },
        peakLimiting: { enabled: true, maxPeak: -0.1 },
        dithering: { enabled: false, bitDepth: "24" }
      }
    }
  },
  {
    id: 'fx_ghost',
    name: 'Ghost Voice',
    description: 'Ethereal, haunting spectral effect',
    category: 'effects',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "90" },
        deClickDeEss: { enabled: false, intensity: "light" }
      },
      dynamicControl: {
        compression: { enabled: false, ratio: "2:1", threshold: -18 },
        limiter: { enabled: true, ceiling: -2 }
      },
      eqShaping: {
        lowMidCut: { enabled: true, frequency: "300", gain: -10 },
        presenceBoost: { enabled: true, frequency: "3", gain: -2.0 },
        airLift: { enabled: true, frequency: "10", gain: 3.0 }
      },
      spatialEnhancement: {
        reverb: { enabled: true, type: "room_0.5", wetMix: 30 },
        stereoEnhancer: { enabled: true, width: 1.8 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-21" },
        peakLimiting: { enabled: true, maxPeak: -1.0 },
        dithering: { enabled: true, bitDepth: "24" }
      }
    }
  },
  {
    id: 'fx_megaphone',
    name: 'Megaphone',
    description: 'Distorted megaphone/bullhorn effect',
    category: 'effects',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: true, frequency: "90" },
        deClickDeEss: { enabled: false, intensity: "light" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "3:1", threshold: -10 },
        limiter: { enabled: true, ceiling: -0.5 }
      },
      eqShaping: {
        lowMidCut: { enabled: true, frequency: "300", gain: -8 },
        presenceBoost: { enabled: true, frequency: "2", gain: 3.0 },
        airLift: { enabled: true, frequency: "8", gain: -6.0 }
      },
      spatialEnhancement: {
        reverb: { enabled: false, type: "room_0.3", wetMix: 0 },
        stereoEnhancer: { enabled: false, width: 0.7 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-18" },
        peakLimiting: { enabled: true, maxPeak: -0.1 },
        dithering: { enabled: false, bitDepth: "16" }
      }
    }
  },

  // Special Effects Category (continued)
  {
    id: 'fx_robot',
    name: 'Robot Voice',
    description: 'Robotic/synthetic character effect',
    category: 'effects',
    processingChain: {
      noiseCleanup: {
        highPassFilter: { enabled: false, frequency: "70" },
        deClickDeEss: { enabled: false, intensity: "light" }
      },
      dynamicControl: {
        compression: { enabled: true, ratio: "3:1", threshold: -12 },
        limiter: { enabled: true, ceiling: -1 }
      },
      eqShaping: {
        lowMidCut: { enabled: true, frequency: "300", gain: -12 },
        presenceBoost: { enabled: true, frequency: "5", gain: -2.0 },
        airLift: { enabled: false, frequency: "12", gain: -3.0 }
      },
      spatialEnhancement: {
        reverb: { enabled: false, type: "room_0.3", wetMix: 0 },
        stereoEnhancer: { enabled: false, width: 1.0 }
      },
      mastering: {
        normalization: { enabled: true, targetLUFS: "-18" },
        peakLimiting: { enabled: true, maxPeak: -0.1 },
        dithering: { enabled: false, bitDepth: "16" }
      }
    }
  }
];

export const PRESET_CATEGORIES = {
  clean: 'Clean & Natural',
  character: 'Character Voices', 
  broadcast: 'Broadcast Quality',
  vintage: 'Vintage & Specialty',
  environmental: 'Environmental',
  effects: 'Special Effects'
} as const;

export function getPresetsByCategory(category: keyof typeof PRESET_CATEGORIES): AudioPreset[] {
  return AUDIO_PRESETS.filter(preset => preset.category === category);
}

export function getPresetById(id: string): AudioPreset | undefined {
  return AUDIO_PRESETS.find(preset => preset.id === id);
}