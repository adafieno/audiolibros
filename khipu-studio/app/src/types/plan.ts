// Enhanced planning types based on SSML Voice Studio
export interface PlanLine {
  start_char: number;
  end_char: number;
  voice?: string;
}

export interface PlanChunk {
  id?: string;
  start_char: number;
  end_char: number;
  voice?: string;
  lines?: PlanLine[];
  // Legacy fields for compatibility
  text?: string;
  locked?: boolean;
  sfxAfter?: string | null;
}

export interface ChapterPlan {
  chapter_id?: string;
  chapter_title?: string;
  chunks: PlanChunk[];
}

export interface PlanRow {
  rowKey: string;
  chunkId: string;
  chunkIndex: number;
  lineIndex: number;  // -1 for chunk-level
  start: number;
  end: number;
  length: number;
  voice: string;
  snippet: string;
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

// Legacy types for compatibility
export interface PlanChunkSource {
  chapter: string;          // e.g., "ch01"
  start?: number;           // optional offsets in chapter text
  end?: number;
}

export interface PlanFile {
  chapter_id: string;
  chunks: PlanChunk[];
}
