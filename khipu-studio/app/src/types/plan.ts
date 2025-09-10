// Segment type for pure splitter output
export interface Segment {
  segment_id: number;
  start_idx: number;
  end_idx: number;
  delimiter: string;
  text: string;
  voice?: string; // for UI assignment only
}

export interface PlanRow {
  rowKey: string;
  segmentId: number;
  start: number;
  end: number;
  length: number;
  voice: string;
  delimiter: string;
}

export interface AzureCaps {
  maxKB: number;
  hardCapMin: number;
  wpm: number;
  overhead: number;
}

export interface ChunkStats {
  kb: number;
  minutes: number;
}

// Plan file format types
export interface PlanLine {
  voice: string;
  start_char: number;
  end_char: number;
  delimiter?: string;
  line_type?: string;
  text?: string; // Actual segment text for Preview display
}

export interface PlanChunk {
  id: string;
  text: string;
  locked: boolean;
  sfxAfter?: string | null;
  start_char?: number;
  end_char?: number;
  voice?: string;
  stylepack?: string;
  lines?: PlanLine[];
  source?: {
    chapter: string;
    start: number | undefined;
    end: number | undefined;
  };
}

export interface PlanFile {
  chapter_id: string;
  chunks: PlanChunk[];
}
