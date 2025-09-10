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
