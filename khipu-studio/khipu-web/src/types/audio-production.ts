/**
 * Audio Production Types
 */

export interface AudioProcessingChain {
  noiseCleanup?: {
    noiseReduction?: { enabled: boolean; amount: number };
    deEsser?: { enabled: boolean; threshold: number };
    deClicker?: { enabled: boolean; sensitivity: number };
  };
  dynamicControl?: {
    compression?: {
      enabled: boolean;
      threshold: number;
      ratio: number;
      attack: number;
      release: number;
    };
    limiting?: { enabled: boolean; threshold: number; release: number };
    normalization?: { enabled: boolean; targetLevel: number };
  };
  eqShaping?: {
    highPass?: { enabled: boolean; frequency: number; slope: number };
    lowPass?: { enabled: boolean; frequency: number; slope: number };
    parametricEQ?: {
      bands: Array<{ frequency: number; gain: number; q: number }>;
    };
  };
  spatialEnhancement?: {
    reverb?: {
      enabled: boolean;
      roomSize: number;
      damping: number;
      wetLevel: number;
    };
    stereoWidth?: { enabled: boolean; width: number };
  };
  consistencyMastering?: {
    loudnessNormalization?: { enabled: boolean; targetLUFS: number };
    dithering?: { enabled: boolean; bitDepth: number };
  };
}

export interface SegmentAudioRequest {
  text: string;
  voice: string;
  prosody?: {
    style?: string;
    styledegree?: number;
    rate_pct?: number;
    pitch_pct?: number;
  };
}

export interface SegmentAudioResponse {
  success: boolean;
  raw_audio_url: string;
  cache_status: 'HIT' | 'MISS';
  duration?: number;
}

export interface ProcessingChainResponse {
  processing_chain: AudioProcessingChain | null;
}

export interface ProcessingChainUpdateRequest {
  processing_chain: AudioProcessingChain;
  preset_id?: string;
}

export interface RevisionMarkRequest {
  needs_revision: boolean;
  notes?: string;
}

export interface SfxUploadResponse {
  id: string;
  filename: string;
  blob_url: string;
  duration: number;
  file_size: number;
}

export interface SfxPositionUpdateRequest {
  display_order: number;
}

export interface AudioSegmentData {
  segment_id: string;
  type: 'plan' | 'sfx';
  display_order: number;
  text?: string;
  voice?: string;
  character_name?: string;
  raw_audio_url?: string;
  has_audio: boolean;
  processing_chain?: AudioProcessingChain;
  preset_id?: string;
  needs_revision: boolean;
  duration?: number;
}

export interface ChapterAudioProductionResponse {
  segments: AudioSegmentData[];
}

export interface SfxSegment {
  id: string;
  filename: string;
  blob_path: string;
  file_size_bytes: number;
  duration_seconds: number;
  display_order: number;
}

export interface SfxListResponse {
  sfx_segments: SfxSegment[];
}

// UI-friendly segment type
export interface Segment {
  id: string;  // UUID from segment_id
  position: number;
  text: string | null;
  character_name: string | null;
  audio_blob_path: string | null;
  status: 'pending' | 'cached' | 'processed' | 'needs_revision' | null;
  duration: number | null;
  revision_notes: string | null;
  needs_revision: boolean;
}

// Chapter info for UI
export interface Chapter {
  id: number;
  chapter_number: number;
  title: string | null;
  processing_chain: AudioProcessingChain | null;
}
