/**
 * TypeScript types for Planning/Orchestration module
 */

export interface Segment {
  segment_id: number;
  start_idx: number;
  end_idx: number;
  delimiter: string;
  text: string;
  originalText?: string;
  voice?: string;
  needsRevision?: boolean;
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

export interface ChapterStatus {
  hasText: boolean;
  hasPlan: boolean;
  isComplete: boolean;
}

export interface ChapterPlan {
  id: string;
  project_id: string;
  chapter_id: string;
  segments: Segment[];
  is_complete: boolean;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SegmentOpResult {
  success: boolean;
  message?: string;
  newSegments?: Segment[];
}

export interface AzureCaps {
  maxKB: number;
  hardCapMin: number;
  wpm: number;
  overhead: number;
}

export interface PlanGenerateOptions {
  maxKB?: number;
}

export interface PlanGenerateResponse {
  plan: ChapterPlan;
  message?: string;
}
