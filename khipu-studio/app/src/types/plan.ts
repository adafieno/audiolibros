export interface PlanChunkSource {
  chapter: string;          // e.g., "ch01"
  start?: number;           // optional offsets in chapter text
  end?: number;
}

export interface PlanChunk {
  id: string;
  text?: string;            // ← was: text: string
  locked?: boolean;
  // reserved for later: optional SFX to insert after this chunk
  sfxAfter?: string | null;
}
export interface PlanFile {
  chapter_id: string;
  chunks: PlanChunk[];
}
