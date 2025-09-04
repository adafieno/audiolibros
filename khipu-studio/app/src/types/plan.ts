export interface PlanChunk {
  id: string;
  text: string;
  locked?: boolean;
  // reserved for later: optional SFX to insert after this chunk
  sfxAfter?: string | null;
}
export interface PlanFile {
  chapter_id: string;
  chunks: PlanChunk[];
}
