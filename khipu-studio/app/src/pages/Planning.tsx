import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { loadProjectConfig } from "../lib/config";
import type { ProjectConfig } from "../types/config";
import type { Segment, PlanRow, AzureCaps, PlanFile } from "../types/plan";
import type { JobEvent, PlanBuildPayload } from "../global";
import { useAudioCache } from "../hooks/useAudioCache";
import { deleteAudioCacheEntry } from "../lib/audio-cache";
import type { Voice as VoiceType } from "../types/voice";
import type { Character as CharacterData } from "../types/character";
import { costTrackingService } from "../lib/cost-tracking-service";
import { PageHeader } from "../components/PageHeader";
import StandardButton from "../components/StandardButton";


// Character types are imported from the shared types module

// Default Azure TTS constraints
const DEFAULT_CAPS: AzureCaps = {
  maxKB: 48,
  hardCapMin: 8.0,
  wpm: 165,
  overhead: 0.15
};

// Segment size validation constants
const SEGMENT_LIMITS = {
  recommendedWords: 500,
  recommendedChars: 2800, // ~2,500-2,800 chars
  maxKB: 48, // Maximum TTS request size including tags
  estimatedMinutes: 3.3
};

// Utility functions for segment validation
function estimateKBSize(text: string): number {
  // Estimate size including SSML tags overhead
  const textBytes = new TextEncoder().encode(text).length;
  const overhead = 0.15; // 15% overhead for SSML tags
  return (textBytes * (1 + overhead)) / 1024;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

function validateSegmentSize(text: string): { valid: boolean; reason?: string; stats: { chars: number; words: number; kb: number } } {
  const chars = text.length;
  const words = countWords(text);
  const kb = estimateKBSize(text);
  
  const stats = { chars, words, kb };
  
  if (kb > SEGMENT_LIMITS.maxKB) {
    return { valid: false, reason: `Segment size (${kb}KB) exceeds maximum limit (${SEGMENT_LIMITS.maxKB}KB)`, stats };
  }
  
  if (chars > SEGMENT_LIMITS.recommendedChars * 1.5) {
    return { valid: false, reason: `Segment too long (${chars} chars). Recommended: ${SEGMENT_LIMITS.recommendedChars} chars`, stats };
  }
  
  return { valid: true, stats };
}

interface Chapter {
  id: string;
  title?: string;
  relPath: string;
}

interface ChapterStatus {
  hasText: boolean;
  hasPlan: boolean;
  isComplete: boolean;
}

// Segment operation result type
interface SegmentOpResult {
  success: boolean;
  message?: string;
  newSegments?: Segment[];
}

// Segment operations
function splitSegmentAtPosition(segments: Segment[], segmentId: number, position: number, t: (key: string) => string): SegmentOpResult {
  const segmentIndex = segments.findIndex(seg => seg.segment_id === segmentId);
  if (segmentIndex === -1) {
    return { success: false, message: t("planning.segmentNotFound") };
  }

  const segment = segments[segmentIndex];
  const text = segment.text;

  if (position <= 0 || position >= text.length) {
    return { success: false, message: t("planning.invalidSplitPosition") };
  }

  // Smart split: try to find a nearby word boundary to avoid breaking words
  let splitPosition = position;
  const maxAdjustment = Math.min(20, Math.floor(text.length * 0.1)); // Max 20 chars or 10% of text
  
  if (text[splitPosition] !== ' ' && text[splitPosition - 1] !== ' ') {
    // Look backward for a space (prefer splitting after a word)
    for (let i = 0; i < maxAdjustment; i++) {
      if (splitPosition - i > 0 && text[splitPosition - i - 1] === ' ') {
        splitPosition = splitPosition - i;
        break;
      }
      // Look forward as fallback
      if (splitPosition + i < text.length && text[splitPosition + i] === ' ') {
        splitPosition = splitPosition + i + 1; // Split after the space
        break;
      }
    }
  }

  const leftText = text.slice(0, splitPosition);
  const rightText = text.slice(splitPosition);

  // Validate both parts would be within limits
  const leftValidation = validateSegmentSize(leftText);
  const rightValidation = validateSegmentSize(rightText);

  if (!leftValidation.valid || !rightValidation.valid) {
    const reason = !leftValidation.valid ? leftValidation.reason : rightValidation.reason;
    return { success: false, message: `Split would create invalid segment: ${reason}` };
  }

  // Create new segments with incremented IDs
  const maxId = Math.max(...segments.map(s => s.segment_id));
  
  // Calculate new indices based on character position within the original text
  const leftEndIdx = segment.start_idx + splitPosition - 1;
  const rightStartIdx = segment.start_idx + splitPosition;
  
  const leftSegment: Segment = {
    ...segment,
    text: leftText,
    originalText: leftText,
    end_idx: leftEndIdx
  };
  
  const rightSegment: Segment = {
    ...segment,
    segment_id: maxId + 1,
    text: rightText,
    originalText: rightText,
    start_idx: rightStartIdx,
    // end_idx remains the same as original segment
  };

  // Validate that our index calculations are consistent
  const leftExpectedLength = leftEndIdx - segment.start_idx + 1;
  const rightExpectedLength = segment.end_idx - rightStartIdx + 1;
  
  if (leftExpectedLength !== leftText.length) {
    console.warn(`Split index mismatch: left segment expected length ${leftExpectedLength}, actual ${leftText.length}`);
  }
  if (rightExpectedLength !== rightText.length) {
    console.warn(`Split index mismatch: right segment expected length ${rightExpectedLength}, actual ${rightText.length}`);
  }

  const newSegments = [
    ...segments.slice(0, segmentIndex),
    leftSegment,
    rightSegment,
    ...segments.slice(segmentIndex + 1)
  ];

  const message = splitPosition !== position ? 
    `Split adjusted to word boundary (moved ${splitPosition - position} characters)` : 
    undefined;

  return { success: true, newSegments, message };
}

function mergeSegments(segments: Segment[], segmentId: number, direction: 'forward' | 'backward', t: (key: string) => string): SegmentOpResult {
  const segmentIndex = segments.findIndex(seg => seg.segment_id === segmentId);
  if (segmentIndex === -1) {
    return { success: false, message: t("planning.segmentNotFound") };
  }

  const targetIndex = direction === 'forward' ? segmentIndex + 1 : segmentIndex - 1;
  
  if (targetIndex < 0 || targetIndex >= segments.length) {
    const directionKey = direction === 'forward' ? 'next' : 'previous';
    return { success: false, message: t(`planning.merge.no${directionKey.charAt(0).toUpperCase() + directionKey.slice(1)}Segment`) };
  }

  const currentSegment = segments[segmentIndex];
  const targetSegment = segments[targetIndex];

  // Determine receiving segment and merging text order
  const [receivingSegment, mergingSegment] = direction === 'forward' 
    ? [targetSegment, currentSegment]  // Forward: target receives current
    : [currentSegment, targetSegment]; // Backward: current receives target

  const mergedText = direction === 'forward'
    ? `${mergingSegment.text} ${receivingSegment.text}`  // Current + Next
    : `${receivingSegment.text} ${mergingSegment.text}`; // Current + Previous

  // Validate merged segment size
  const validation = validateSegmentSize(mergedText);
  if (!validation.valid) {
    return { success: false, message: `Merge would create invalid segment: ${validation.reason}` };
  }

  // Always keep the ID of the segment that appears first in the sequence
  const firstSegment = direction === 'forward' ? currentSegment : targetSegment;

  // Create merged segment
  const mergedSegment: Segment = {
    ...firstSegment, // Use properties of the first segment (maintains ID order)
    text: mergedText,
    originalText: mergedText,
    start_idx: Math.min(currentSegment.start_idx, targetSegment.start_idx),
    end_idx: Math.max(currentSegment.end_idx, targetSegment.end_idx)
  };

  // Remove both segments and insert merged one
  const indicesToRemove = [segmentIndex, targetIndex].sort((a, b) => b - a); // Remove in reverse order
  const newSegments = [...segments];
  
  for (const index of indicesToRemove) {
    newSegments.splice(index, 1);
  }
  
  // Insert merged segment at the correct position
  const insertIndex = Math.min(segmentIndex, targetIndex);
  newSegments.splice(insertIndex, 0, mergedSegment);

  return { success: true, newSegments };
}

function deleteSegment(segments: Segment[], segmentId: number, t: (key: string) => string): SegmentOpResult {
  const segmentIndex = segments.findIndex(seg => seg.segment_id === segmentId);
  if (segmentIndex === -1) {
    return { success: false, message: t("planning.segmentNotFound") };
  }

  if (segments.length === 1) {
    return { success: false, message: t("planning.cannotDeleteLastSegment") };
  }

  const newSegments = segments.filter(seg => seg.segment_id !== segmentId);
  return { success: true, newSegments };
}

// Editable Preview Component
interface EditablePreviewProps {
  current: PlanRow;
  segments: Segment[] | null;
  setSegments: (segments: Segment[] | null) => void;
  setSegmentsWithHistory: (segments: Segment[] | null) => void;
  undoSegmentOperation: () => void;
  canUndo: boolean;
  onAudition: (segmentId: number, overrideText?: string, disableCache?: boolean) => void;
  onInvalidateCache?: (segmentId: number, oldText: string) => Promise<void>;
  isAudioLoading: boolean;
  auditioningSegments: Set<number>;
  isAudioPlaying: boolean;
  t: (key: string) => string;
}

function EditablePreview({
  current,
  segments,
  setSegments,
  setSegmentsWithHistory,
  undoSegmentOperation,
  canUndo,
  onAudition,
  onInvalidateCache,
  isAudioLoading,
  auditioningSegments,
  isAudioPlaying,
  t
}: EditablePreviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Find the original segment by ID
  const originalSegment = segments?.find(seg => seg.segment_id === current.segmentId);
  const displayText = originalSegment?.text || t("planning.segmentTextNotFound");
  
  // Track if the text has been modified during editing
  const isDirty = isEditing && editedText !== (originalSegment?.text || "");

  // Initialize edit text when segment changes
  useEffect(() => {
    if (originalSegment) {
      setEditedText(originalSegment.text);
      setIsEditing(false);
      setCursorPosition(0);
    }
  }, [originalSegment]);

  // Handle entering edit mode
  const handleStartEdit = () => {
    setIsEditing(true);
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursorPosition, cursorPosition);
    }, 0);
  };

  // Handle saving changes  
  const handleSaveEdit = async () => {
    if (!segments || !originalSegment) return;

    const textChanged = editedText !== originalSegment.text;
    console.log(`📝 AUTO-SAVE EDIT - Segment ${current.segmentId}:`);
    console.log(`  - Text changed: ${textChanged}`);
    console.log(`  - Original text: "${originalSegment.text}"`);
    console.log(`  - New text: "${editedText}"`);
    console.log(`  - Current originalText: "${originalSegment.originalText}"`);

    // If text changed, invalidate the old cache entry
    if (textChanged && onInvalidateCache) {
      console.log(`🗑️ AUTO-SAVE EDIT - Invalidating cache for old text: "${originalSegment.originalText || originalSegment.text}"`);
      await onInvalidateCache(current.segmentId, originalSegment.originalText || originalSegment.text);
    }

    // Update the segment text in the plan (not manuscript)
    // After saving, the new text becomes both display text AND cache text
    const updatedSegments = segments.map(seg => 
      seg.segment_id === current.segmentId 
        ? { 
            ...seg, 
            text: editedText, 
            originalText: editedText  // This is key - new text becomes the cache key
          }
        : seg
    );

    console.log(`📝 AUTO-SAVE EDIT - Updated segment:`, updatedSegments.find(s => s.segment_id === current.segmentId));
    setSegments(updatedSegments);
    setIsEditing(false);
    
    if (textChanged) {
      console.log(`✅ Segment ${current.segmentId} updated - cache should use new text: "${editedText}"`);
    }
  };

  // Handle canceling edit
  const handleCancelEdit = () => {
    setEditedText(originalSegment?.text || "");
    setIsEditing(false);
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancelEdit();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSaveEdit(); // Auto-save on Ctrl+Enter
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleSaveEdit(); // Auto-save on Tab (exit edit mode)
    }
  };

  // Auto-save on blur (when leaving the textarea)
  const handleTextareaBlur = () => {
    handleSaveEdit();
  };

  // Update cursor position
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedText(e.target.value);
    setCursorPosition(e.target.selectionStart);
  };

  // Segment operations handlers
  const handleSplitSegment = () => {
    if (!segments || !originalSegment || !isEditing || cursorPosition <= 0 || cursorPosition >= editedText.length) {
      return;
    }

    const result = splitSegmentAtPosition(segments, current.segmentId, cursorPosition, t);
    if (result.success && result.newSegments) {
      setSegmentsWithHistory(result.newSegments);
      setIsEditing(false);
      setMessage(t("planning.segmentSplitSuccessfully"));
    } else {
      setMessage(result.message || t("planning.splitOperationFailed"));
    }
  };

  const handleMergeSegment = (direction: 'forward' | 'backward') => {
    if (!segments || !originalSegment) return;

    const result = mergeSegments(segments, current.segmentId, direction, t);
    if (result.success && result.newSegments) {
      setSegmentsWithHistory(result.newSegments);
      if (isEditing) setIsEditing(false);
      setMessage(`Segment merged ${direction} successfully`);
    } else {
      setMessage(result.message || t("planning.mergeOperationFailed"));
    }
  };

  const handleDeleteSegment = () => {
    if (!segments || !originalSegment) return;

    if (confirm(`Are you sure you want to delete segment ${current.segmentId}? This action cannot be undone.`)) {
      const result = deleteSegment(segments, current.segmentId, t);
      if (result.success && result.newSegments) {
        setSegmentsWithHistory(result.newSegments);
        if (isEditing) setIsEditing(false);
        setMessage(t("planning.segmentDeletedSuccessfully"));
      } else {
        setMessage(result.message || t("planning.deleteOperationFailed"));
      }
    }
  };

  // Check if operations are available
  const canMergeForward = segments && segments.findIndex(s => s.segment_id === current.segmentId) < segments.length - 1;
  const canMergeBackward = segments && segments.findIndex(s => s.segment_id === current.segmentId) > 0;
  const canSplit = isEditing && cursorPosition > 0 && cursorPosition < editedText.length;
  const canDelete = segments && segments.length > 1;

  // State for displaying messages (temporary)
  const [message, setMessage] = useState<string>("");
  
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Render text with cursor indicator
  const renderTextWithCursor = (text: string, position: number) => {
    if (!isEditing) {
      return <span>{text}</span>;
    }

    const beforeCursor = text.slice(0, position);
    const afterCursor = text.slice(position);
    
    return (
      <span>
        {beforeCursor}
        <span 
          style={{
            display: 'inline-block',
            width: '3px', // Thicker cursor as requested
            height: '1.2em',
            backgroundColor: 'var(--accent)',
            marginLeft: position === 0 ? '0' : '1px',
            marginRight: '1px',
            animation: 'blink 1s infinite'
          }} 
        />
        {afterCursor}
      </span>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Text Display Panel */}
      <div style={{ 
        border: "1px solid var(--border)", 
        borderRadius: "6px", 
        overflow: "hidden",
        backgroundColor: "var(--panel)"
      }}>
          {/* Text Panel Header */}
          <div style={{ 
            padding: "8px 12px", 
            backgroundColor: "var(--panelAccent)", 
            borderBottom: "1px solid var(--border)", 
            fontSize: "14px", 
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <span>📝 Texto del Segmento</span>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>• Voz: {current.voice || "unassigned"}</span>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>• ID: {current.segmentId}</span>
          </div>
          
          {/* Text Content */}
          <div style={{ padding: "16px" }}>
            {isEditing ? (
              <textarea
                ref={textareaRef}
                value={editedText}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                onBlur={handleTextareaBlur}
                onSelect={(e) => setCursorPosition((e.target as HTMLTextAreaElement).selectionStart)}
                style={{
                  width: "100%",
                  minHeight: "120px",
                  fontSize: "16px",
                  lineHeight: "1.6",
                  color: "var(--text)",
                  backgroundColor: "var(--background)",
                  border: "2px solid var(--accent)",
                  borderRadius: "4px",
                  padding: "12px",
                  fontFamily: "inherit",
                  resize: "vertical",
                  outline: "none"
                }}
                placeholder={t("planning.editPlaceholder")}
              />
            ) : (
              <div 
                ref={previewRef}
                onClick={handleStartEdit}
                style={{ 
                  fontSize: "16px", 
                  lineHeight: "1.6", 
                  color: "var(--text)", 
                  whiteSpace: "pre-wrap",
                  minHeight: "120px",
                  padding: "12px",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  cursor: "text",
                  backgroundColor: "var(--background)"
                }}
                title={t("planning.clickToEdit")}
              >
                {renderTextWithCursor(displayText, cursorPosition)}
              </div>
            )}
            
            {/* Size statistics */}
            {(() => {
              const text = isEditing ? editedText : displayText;
              const validation = validateSegmentSize(text);
              const stats = validation.stats;
              const isOverLimit = stats.words > SEGMENT_LIMITS.recommendedWords || 
                                 stats.chars > SEGMENT_LIMITS.recommendedChars * 1.5 || 
                                 stats.kb > SEGMENT_LIMITS.maxKB;
              return (
                <div style={{ 
                  fontSize: "11px", 
                  color: isOverLimit ? "var(--error)" : "var(--muted)", 
                  marginTop: "12px",
                  padding: "8px 12px",
                  backgroundColor: "var(--panelBackground)",
                  borderRadius: "4px",
                  display: "flex",
                  gap: "16px",
                  border: "1px solid var(--border)"
                }}>
                  <span>📏 {stats.words}/{SEGMENT_LIMITS.recommendedWords} {t("planning.stats.words")}</span>
                  <span>🔤 {stats.chars}/{SEGMENT_LIMITS.recommendedChars} {t("planning.stats.chars")}</span>
                  <span>💾 {stats.kb.toFixed(1)}/{SEGMENT_LIMITS.maxKB}KB</span>
                  {isOverLimit && <span style={{ color: "var(--error)", fontWeight: "bold" }}>⚠️ {t("planning.overLimits")}</span>}
                </div>
              );
            })()}
            
            {isEditing && (
              <div style={{
                fontSize: "11px", 
                color: "var(--muted)", 
                marginTop: "8px",
                fontStyle: "italic",
                padding: "8px",
                backgroundColor: "var(--panelBackground)",
                borderRadius: "4px",
                border: "1px solid var(--border)"
              }}>
                💡 {t("planning.editInstructions")}
                <br />
                {t("planning.splitInstructions")}
              </div>
            )}
          </div>
      </div>

      {/* Action Buttons Toolbar Panel - underneath text */}
      <div style={{ 
        border: "1px solid var(--border)", 
        borderRadius: "6px", 
        overflow: "hidden",
        backgroundColor: "var(--panel)"
      }}>
        {/* Toolbar Content */}
        <div style={{ 
          padding: "12px",
          display: "flex", 
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap"
        }}>
          {!isEditing ? (
            <>
              <StandardButton
                onClick={handleStartEdit}
                size="compact"
                title={t("planning.tooltips.clickToEdit")}
                style={{
                  padding: "6px 12px"
                }}
              >
                ✏️ Editar
              </StandardButton>
              
              <StandardButton
                onClick={() => handleMergeSegment('backward')}
                disabled={!canMergeBackward}
                size="compact"
                title={t("planning.mergeWithPrevious")}
                style={{
                  padding: "6px 12px"
                }}
              >
                ◀ Unir
              </StandardButton>
              
              <StandardButton
                onClick={() => handleMergeSegment('forward')}
                disabled={!canMergeForward}
                size="compact"
                title={t("planning.mergeWithNext")}
                style={{
                  padding: "6px 12px"
                }}
              >
                Unir ▶
              </StandardButton>
              
              <StandardButton
                onClick={handleDeleteSegment}
                disabled={!canDelete}
                variant="danger"
                size="compact"
                title={t("planning.deleteThisSegment")}
                style={{
                  padding: "6px 12px"
                }}
              >
                🗑️ Eliminar
              </StandardButton>
              
              <StandardButton
                onClick={undoSegmentOperation}
                disabled={!canUndo}
                size="compact"
                title={t("planning.undoLastOperation")}
                style={{
                  padding: "6px 12px"
                }}
              >
                ↶ Deshacer
              </StandardButton>
            </>
          ) : (
            <>
              <StandardButton
                onClick={handleSplitSegment}
                disabled={!canSplit}
                size="compact"
                title={t("planning.splitAtCursor")}
                style={{
                  padding: "6px 12px"
                }}
              >
                ✂️ {t("planning.splitAtCursor")}
              </StandardButton>
              
              <StandardButton
                onClick={handleCancelEdit}
                size="compact"
                title={t("planning.tooltips.cancelEdit")}
                style={{
                  padding: "6px 12px"
                }}
              >
                ❌ {t("planning.cancel")}
              </StandardButton>
            </>
          )}
          
          {/* Audition button - if voice is assigned */}
          {current.voice && current.voice !== "unassigned" && (
            <StandardButton
                onClick={() => {
                  console.log(`🎵 AUDITION BUTTON CLICKED - Segment ${current.segmentId}:`);
                  console.log(`  - isDirty: ${isDirty}`);
                  console.log(`  - editedText: "${editedText}"`);
                  console.log(`  - originalSegment.text: "${originalSegment?.text}"`);
                  console.log(`  - originalSegment.originalText: "${originalSegment?.originalText}"`);
                  console.log(`  - overrideText: ${isDirty ? `"${editedText}"` : 'undefined'}`);
                  console.log(`  - disableCache: ${isDirty}`);
                  onAudition(current.segmentId, isDirty ? editedText : undefined, isDirty);
                }}
                disabled={isAudioLoading || auditioningSegments.has(current.segmentId)}
                size="compact"
              style={{
                padding: "6px 12px"
              }}
            >
              {(isAudioLoading || auditioningSegments.has(current.segmentId)) ? (
                <>
                  <span style={{ 
                    display: "inline-block", 
                    width: "12px", 
                    height: "12px", 
                    border: "2px solid currentColor", 
                    borderTop: "2px solid transparent", 
                    borderRadius: "50%", 
                    animation: "spin 1s linear infinite" 
                  }}></span>
                  {t("casting.audition.loading")}
                </>
              ) : isAudioPlaying ? (
                <>🔊 {t("common.playing")}</>
              ) : (
                <>🎵 Audición</>
              )}
            </StandardButton>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PlanningPage({ onStatus }: { onStatus: (s: string) => void }) {
  const { t } = useTranslation();
  const { root } = useProject();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<string>("");
  const [chapterStatus, setChapterStatus] = useState<Map<string, ChapterStatus>>(new Map());
  const [segments, setSegments] = useState<Segment[] | null>(null);
  
  // Undo functionality
  const [segmentHistory, setSegmentHistory] = useState<Segment[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [availableCharacters, setAvailableCharacters] = useState<string[]>([]);
  const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [planProgress, setPlanProgress] = useState<{current: number, total: number, stage: string} | null>(null);
  const [assigningCharacters, setAssigningCharacters] = useState(false);
  const [characterAssignmentProgress, setCharacterAssignmentProgress] = useState<{current: number, total: number, stage: string} | null>(null);
  
  // Filters and selection for the current chapter plan
  const [onlyUnknown, setOnlyUnknown] = useState(false);
  const [selIndex, setSelIndex] = useState(0);
  
  // Caps settings
  const [caps] = useState<AzureCaps>(DEFAULT_CAPS);
  
  // Audition state
  const [auditioningSegments, setAuditioningSegments] = useState<Set<number>>(new Set());
  const [charactersData, setCharactersData] = useState<CharacterData[]>([]);
  
  // Use the new audio cache hook
  const { isPlaying: isAudioPlaying, isLoading: isAudioLoading, playAudition, stopAudio } = useAudioCache();

  // Revision marks tracking (segment_id -> marked)
  const [revisionMarks, setRevisionMarks] = useState<Set<string>>(new Set());

  const gridRef = useRef<HTMLDivElement | null>(null);

  // Undo functionality
  const saveToHistory = useCallback((oldSegments: Segment[]) => {
    if (oldSegments) {
      setSegmentHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push([...oldSegments]);
        return newHistory.slice(-50); // Keep last 50 operations
      });
      setHistoryIndex(prev => Math.min(prev + 1, 49));
    }
  }, [historyIndex]);

  const setSegmentsWithHistory = useCallback((newSegments: Segment[] | null) => {
    if (newSegments && segments) {
      saveToHistory(segments); // Save current segments as history before replacing
    }
    setSegments(newSegments);
  }, [segments, saveToHistory]);

  const undoSegmentOperation = useCallback(() => {
    if (historyIndex >= 0 && segmentHistory[historyIndex]) {
      setSegments([...segmentHistory[historyIndex]]);
      setHistoryIndex(prev => prev - 1);
      setMessage(t("planning.undoSuccessful"));
    }
  }, [historyIndex, segmentHistory, t]);

  const canUndo = historyIndex >= 0;

  // Revision mark functions
  const saveRevisionToPlanFile = useCallback(async (segmentIdStr: string, marked: boolean) => {
    if (!root || !selectedChapter) return;

    try {
      const planPath = `ssml/plans/${selectedChapter}.plan.json`;
      console.log(`🚩 [Planning] Saving revision mark for segmentId: ${segmentIdStr}, marked: ${marked} to ${planPath}`);
      
      const planData = await window.khipu!.call("fs:read", {
        projectRoot: root,
        relPath: planPath,
        json: true,
      });

      if (Array.isArray(planData)) {
        let found = false;
        const updatedPlan = planData.map((segment: Segment & { needsRevision?: boolean }) => {
          if (segment.segment_id.toString() === segmentIdStr) {
            found = true;
            console.log(`🚩 [Planning] Found matching segment, updating revision mark to: ${marked}`);
            return { ...segment, needsRevision: marked };
          }
          return segment;
        });

        if (!found) {
          console.warn(`🚩 [Planning] No segment found with segmentId: ${segmentIdStr}`);
        }

        // Save back to plan file
        await window.khipu!.call("fs:write", {
          projectRoot: root,
          relPath: planPath,
          content: JSON.stringify(updatedPlan, null, 2),
        });
        console.log(`🚩 [Planning] Successfully saved revision marks to plan file`);
      }
    } catch (error) {
      console.error("Error saving revision mark to plan:", error);
      throw error;
    }
  }, [root, selectedChapter]);

  const isSegmentMarkedForRevision = useCallback((segmentId: number): boolean => {
    return revisionMarks.has(segmentId.toString());
  }, [revisionMarks]);

  const handleToggleRevisionMark = useCallback(async (segmentId: number) => {
    if (!root || !selectedChapter) return;

    const segmentIdStr = segmentId.toString();
    const isCurrentlyMarked = revisionMarks.has(segmentIdStr);
    
    console.log(`🚩 [Planning] Toggling revision mark for segmentId: ${segmentId}, currently marked: ${isCurrentlyMarked}`);

    try {
      // Update local state immediately for UI responsiveness  
      setRevisionMarks(prev => {
        const newMarks = new Set(prev);
        if (isCurrentlyMarked) {
          newMarks.delete(segmentIdStr);
        } else {
          newMarks.add(segmentIdStr);
        }
        return newMarks;
      });

      // Save revision mark to plan file
      await saveRevisionToPlanFile(segmentIdStr, !isCurrentlyMarked);

      setMessage(isCurrentlyMarked 
        ? t("audioProduction.revisionMarkRemoved")
        : t("audioProduction.revisionMarkAdded"));

    } catch (error) {
      console.error("Error updating revision mark:", error);
      // Revert local state on error
      setRevisionMarks(prev => {
        const newMarks = new Set(prev);
        if (isCurrentlyMarked) {
          newMarks.add(segmentIdStr);
        } else {
          newMarks.delete(segmentIdStr);
        }
        return newMarks;
      });
      setMessage(t("audioProduction.revisionMarkError"));
    }
  }, [root, selectedChapter, revisionMarks, t, saveRevisionToPlanFile]);

  const loadRevisionMarksFromPlan = useCallback(async () => {
    if (!root || !selectedChapter) return;

    try {
      const planPath = `ssml/plans/${selectedChapter}.plan.json`;
      const planData = await window.khipu!.call("fs:read", {
        projectRoot: root,
        relPath: planPath,
        json: true,
      });

      const revisionMarkedSegments = new Set<string>();
      if (Array.isArray(planData)) {
        console.log(`🚩 [Planning] Loading revision marks from plan data...`);
        planData.forEach((segment: Segment & { needsRevision?: boolean }) => {
          if (segment.needsRevision) {
            revisionMarkedSegments.add(segment.segment_id.toString());
            console.log(`🚩 [Planning] Added segment ${segment.segment_id} to revision marks`);
          }
        });
      }
      console.log(`🚩 [Planning] Loaded ${revisionMarkedSegments.size} segments marked for revision:`, Array.from(revisionMarkedSegments));
      setRevisionMarks(revisionMarkedSegments);
    } catch (error) {
      console.error("Error loading revision marks:", error);
    }
  }, [root, selectedChapter]);

  // Clear revision marks when changing chapters
  useEffect(() => {
    if (selectedChapter) {
      console.log(`🚩 [Planning] Chapter changed to ${selectedChapter}, clearing revision marks`);
      setRevisionMarks(new Set());
      // Load revision marks for the new chapter
      loadRevisionMarksFromPlan();
    }
  }, [selectedChapter, loadRevisionMarksFromPlan]);

  // Check status of a specific chapter
  const checkChapterStatus = useCallback(async (chapterId: string): Promise<ChapterStatus> => {
    console.log(`=== Checking status for chapter: ${chapterId} ===`);
    if (!root) {
      console.log(`No root directory set`);
      return { hasText: false, hasPlan: false, isComplete: false };
    }
    
    console.log(`Using project root: ${root}`);
    
    // Check if chapter text exists
    let hasText = false;
    const textPath = `analysis/chapters_txt/${chapterId}.txt`;
    console.log(`Chapter ${chapterId}: Checking text file at: ${root}/${textPath}`);
    
    try {
      const textData = await window.khipu!.call("fs:read", {
        projectRoot: root,
        relPath: textPath,
        json: false
      });
      hasText = textData !== null && textData !== undefined;
      console.log(`Chapter ${chapterId}: Text file result:`, { exists: hasText, dataLength: typeof textData === 'string' ? textData.length : 0 });
    } catch (error) {
      console.log(`Chapter ${chapterId}: Text file error:`, error);
    }
    
    // Check if plan exists
    let hasPlan = false;
    const planPath = `ssml/plans/${chapterId}.plan.json`;
    console.log(`Chapter ${chapterId}: Checking plan file at: ${root}/${planPath}`);
    
    try {
      const planData = await window.khipu!.call("fs:read", {
        projectRoot: root,
        relPath: planPath,
        json: true
      });
      hasPlan = planData !== null && planData !== undefined;
      console.log(`Chapter ${chapterId}: Plan file result:`, { exists: hasPlan, data: planData });
    } catch (error) {
      console.log(`Chapter ${chapterId}: Plan file error:`, error);
    }
    
    // Check if this specific chapter has been marked as complete
    let isComplete = false;
    const completionPath = `ssml/plans/${chapterId}.complete`;
    try {
      const completionData = await window.khipu!.call("fs:read", {
        projectRoot: root,
        relPath: completionPath,
        json: true
      }) as { complete?: boolean; completedAt?: string } | null;
      isComplete = completionData?.complete === true;
      console.log(`Chapter ${chapterId}: Completion file result:`, { exists: isComplete, data: completionData });
    } catch {
      console.log(`Chapter ${chapterId}: No completion file found`);
      isComplete = false;
    }
    
    const result = { hasText, hasPlan, isComplete };
    console.log(`=== Chapter ${chapterId} final status:`, result, `===`);
    return result;
  }, [root]);

  // Load chapters from project
  const loadChapters = useCallback(async () => {
    if (!root) return;
    
    try {
      setMessage(t("planning.loadingChapters"));
      const chapterList = await window.khipu!.call("chapters:list", { projectRoot: root });
      
      if (chapterList && Array.isArray(chapterList)) {
        setChapters(chapterList);
        
        // Check status of each chapter
        const statusMap = new Map<string, ChapterStatus>();
        for (const chapter of chapterList) {
          const status = await checkChapterStatus(chapter.id);
          statusMap.set(chapter.id, status);
        }
        setChapterStatus(statusMap);
        
        // Auto-select first chapter if none selected
        if (!selectedChapter && chapterList.length > 0) {
          setSelectedChapter(chapterList[0].id);
        }
      } else {
        setMessage(t("planning.noChaptersFound"));
      }
    } catch (error) {
      console.warn("Failed to load chapters:", error);
      setMessage(t("planning.failedToLoadChapters"));
    }
  }, [root, selectedChapter, checkChapterStatus, t]);

  // Clean up stale cache entries for segments where text was edited in previous sessions
  const cleanupStaleCache = useCallback(async (segments: Segment[]) => {
    if (!projectConfig || !charactersData.length) {
      console.log("⏭️ Skipping cache cleanup: missing project config or character data");
      return;
    }

    console.log("🧹 CLEANUP STALE CACHE - Checking for edited segments");
    
    for (const segment of segments) {
      // Check if this segment has been edited (originalText exists and differs from text)
      if (segment.originalText && segment.originalText !== segment.text) {
        console.log(`🧹 CLEANUP STALE CACHE - Segment ${segment.segment_id} was edited:`);
        console.log(`  - Original: "${segment.originalText}"`);
        console.log(`  - Current: "${segment.text}"`);
        
        // Find character data for this segment's voice
        const characterId = segment.voice;
        const character = charactersData.find(c => c.id === characterId || c.name === characterId);
        
        if (!character?.voiceAssignment) {
          console.warn(`🧹 Cannot cleanup cache: no voice assignment for character: ${characterId}`);
          continue;
        }

        // Create the same voice object that would be used for audition
        const voice: VoiceType = {
          id: character.voiceAssignment.voiceId,
          engine: "azure",
          locale: character.voiceAssignment.voiceId.startsWith("es-") ? character.voiceAssignment.voiceId.substring(0, 5) : "es-ES",
          gender: character.traits?.gender || "N",
          age_hint: character.traits?.age || "adult",
          accent_tags: character.traits?.accent ? [character.traits.accent] : [],
          styles: character.voiceAssignment.style ? [character.voiceAssignment.style] : [],
          description: `Voice for ${character.name || characterId}`
        };

        // Generate the cache key that would have been used with the ORIGINAL text (before edit)
        const { generateCacheKey } = await import("../lib/audio-cache");
        const staleCacheKey = generateCacheKey({
          voice: voice,
          config: projectConfig,
          text: segment.originalText, // Use original text to find the old cache entry
          style: character.voiceAssignment.style,
          styledegree: character.voiceAssignment.styledegree,
          rate_pct: character.voiceAssignment.rate_pct,
          pitch_pct: character.voiceAssignment.pitch_pct
        });

        console.log(`🧹 CLEANUP STALE CACHE - Deleting stale cache key: "${staleCacheKey}"`);

        // Delete the old cache entry
        try {
          const deleted = await deleteAudioCacheEntry(staleCacheKey);
          console.log(`🧹 CLEANUP STALE CACHE - Deletion result: ${deleted} for segment ${segment.segment_id}`);
        } catch (error) {
          console.error(`Failed to delete stale cache for segment ${segment.segment_id}:`, error);
        }
      }
    }
  }, [projectConfig, charactersData]);

  // Check if all chapters are complete and mark global planning step if so
  const checkAndMarkGlobalPlanningComplete = useCallback(async () => {
    if (!root || !projectConfig || chapters.length === 0) return;

    try {
      // Check completion status of all chapters
      const allStatuses = await Promise.all(
        chapters.map(chapter => checkChapterStatus(chapter.id))
      );
      
      const allComplete = allStatuses.every(status => status.isComplete);
      
      if (allComplete) {
        // Mark global planning step as complete
        const updatedConfig = {
          ...projectConfig,
          workflow: {
            ...projectConfig.workflow,
            planning: {
              ...projectConfig.workflow?.planning,
              complete: true,
              completedAt: new Date().toISOString()
            }
          }
        };
        
        await window.khipu!.call("fs:write", { 
          projectRoot: root, 
          relPath: "project.khipu.json", 
          json: true, 
          content: updatedConfig 
        });
        
        setProjectConfig(updatedConfig);
        
        // Update the project store
        const { markStepCompleted } = useProject.getState();
        markStepCompleted("planning");
        
        onStatus(t("planning.status.allChaptersCompleted"));
        setMessage(t("planning.status.allChaptersCompleted"));
      }
    } catch (error) {
      console.error("Failed to check global planning completion:", error);
    }
  }, [root, projectConfig, chapters, checkChapterStatus, onStatus, t]);

  // Load plan and text for selected chapter
  const loadChapterData = useCallback(async (chapterId: string) => {
    if (!root || !chapterId) return;
    
    try {
      setMessage(`Loading data for chapter ${chapterId}...`);
      
      // Load chapter plan
      try {
        console.log(`📂 Loading plan file: ssml/plans/${chapterId}.plan.json`);
        const segData = await window.khipu!.call("fs:read", {
          projectRoot: root,
          relPath: `ssml/plans/${chapterId}.plan.json`,
          json: true
        });
        console.log(`📋 RAW PLAN DATA for ${chapterId}:`, segData);
        console.log(`📋 Plan structure - chunks:`, (segData as PlanFile)?.chunks?.length || 0);
        
        // Check if this is plan format (with chunks) vs segments format
        if ((segData as PlanFile)?.chunks) {
          console.log(`� PLAN FORMAT DETECTED - converting chunks to segments`);
          
          // Load chapter text to extract actual segment content
          let chapterText = "";
          try {
            const textResult = await window.khipu!.call("fs:read", {
              projectRoot: root,
              relPath: `analysis/chapters_txt/${chapterId}.txt`,
              json: false
            });
            chapterText = typeof textResult === 'string' ? textResult : String(textResult || '');
            console.log(`📖 Loaded chapter text (${chapterText.length} chars) for segment extraction`);
          } catch (error) {
            console.warn("Failed to load chapter text for segment extraction:", error);
          }
          
          // Convert plan format to segments for UI compatibility
          const segments: Segment[] = [];
          let segmentCounter = 1;
          for (const chunk of (segData as PlanFile).chunks) {
            if (chunk.lines) {
              for (const line of chunk.lines) {
                const startChar = line.start_char || 0;
                const endChar = line.end_char || 0;
                
                // Use line.text directly if available, otherwise fallback to character position extraction
                const segmentText = line.text || (chapterText ? chapterText.slice(startChar, endChar) : `[${startChar}-${endChar}]`);
                
                segments.push({
                  segment_id: segmentCounter++,
                  start_idx: startChar,
                  end_idx: endChar,
                  delimiter: line.delimiter || "plan-line",
                  voice: line.voice || "narrador",
                  text: segmentText,
                  originalText: segmentText  // Preserve original text for audio caching
                });
              }
            }
          }
          console.log(`📋 CONVERTED TO ${segments.length} segments from plan chunks`);
          console.log(`🔍 First 3 converted segments:`, segments.slice(0, 3).map(s => ({ id: s.segment_id, voice: s.voice, text: s.text })));
          setSegments(segments);
        } else if (Array.isArray(segData)) {
          console.log(`📋 SEGMENTS FORMAT DETECTED`);
          console.log(`🔍 SEGMENTS LOADED: ${segData.length} segments`);
          segData.forEach((seg, idx) => {
            console.log(`🔍 SEGMENT #${idx + 1}: ID=${seg.segment_id}, voice=${seg.voice}, text="${seg.text}"`);
          });
          // Initialize originalText if not present
          const segmentsWithOriginal = segData.map(seg => ({
            ...seg,
            originalText: seg.originalText || seg.text
          }));
          
          // Clean up any stale cache entries for edited segments
          await cleanupStaleCache(segmentsWithOriginal);
          
          setSegments(segmentsWithOriginal);
          
          // Load revision marks after segments are loaded
          await loadRevisionMarksFromPlan();
        } else {
          console.log(`📋 UNKNOWN FORMAT - setting to null`);
          setSegments(null);
        }
      } catch (error) {
        console.log(`📋 No segments found for ${chapterId}:`, error);
        setSegments(null);
      }
      

      
      // Don't show a persistent "data loaded" message - just clear any previous message
      setMessage("");
    } catch (error) {
      console.warn(`Failed to load chapter ${chapterId} data:`, error);
      setMessage(`Failed to load chapter ${chapterId} data.`);
    }
  }, [root, cleanupStaleCache, loadRevisionMarksFromPlan]);

  // Job event handling for plan generation
  useEffect(() => {
    window.khipu?.onJob((data: JobEvent) => {
      if (data.event === "progress" && typeof data.pct === "number") {
        onStatus(t("status.progress", { pct: data.pct, note: data.note ?? "" }));
        // Always update plan progress when we have percentage data
        const current = Math.round(data.pct);
        setPlanProgress({
          current: current,
          total: 100,
          stage: data.note || t("common.processing")
        });
      } else if (data.event === "done") {
        onStatus(data.ok ? t("status.completed") : t("status.failed"));
        setRunning(false);
        setLoading(false);
        setPlanProgress(null);
        
        // If successful, reload the current chapter data and update status
        if (data.ok && selectedChapter) {
          loadChapterData(selectedChapter);
          // Refresh chapter status
          loadChapters();
        }
      }
    });
  }, [onStatus, t, selectedChapter, loadChapterData, loadChapters]);

  // Character assignment progress listener
  useEffect(() => {
    window.khipu?.characters.onAssignmentProgress((progress: { current: number; total?: string }) => {
      console.log("📊 Character assignment progress:", progress);
      const totalNum = progress.total ? parseInt(progress.total, 10) : 100;
      setCharacterAssignmentProgress({
        current: progress.current,
        total: totalNum,
        stage: t("planning.assigningCharacters")
      });
    });
  }, [t]);

  // Load chapters on mount
  useEffect(() => {
    loadChapters();
  }, [loadChapters]);

  // Auto-check global planning completion when chapter status changes
  useEffect(() => {
    if (chapterStatus.size > 0 && chapters.length > 0) {
      checkAndMarkGlobalPlanningComplete();
    }
  }, [chapterStatus, chapters.length, checkAndMarkGlobalPlanningComplete]);

  // Load chapter data when selection changes
  useEffect(() => {
    if (selectedChapter) {
      loadChapterData(selectedChapter);
    }
  }, [selectedChapter, loadChapterData]);

  // Load project config
  useEffect(() => {
    if (!root) return;
    
    loadProjectConfig(root)
      .then((config: ProjectConfig) => setProjectConfig(config))
      .catch((error: unknown) => console.warn("Failed to load project config:", error));
  }, [root]);

  // Load available characters and voice data for audition
  useEffect(() => {
    if (!root) return;
    
    const loadCharacters = async () => {
      try {
        // Load characters with full data for audition
        const charactersData = await window.khipu!.call("fs:read", {
          projectRoot: root,
          relPath: "dossier/characters.json",
          json: true
        }) as { characters: CharacterData[] };
        
        if (charactersData?.characters) {
          setCharactersData(charactersData.characters);
          
          // Also update the simple character names list
          const names = charactersData.characters.map((char: CharacterData) => char.name || char.id);
          const allCharacters = ["narrador", "Narrador", t("planning.unknownCharacter"), ...names];
          const uniqueCharacters = Array.from(new Set(allCharacters));
          setAvailableCharacters(uniqueCharacters);
        }
        
        console.log(`📚 Loaded ${charactersData.characters.length} characters for audition`);
        
      } catch (error) {
        console.warn("Failed to load characters:", error);
        setAvailableCharacters(["narrador", "Narrador", t("planning.unknownCharacter")]);
      }
    };
    
    loadCharacters();
  }, [root, t]);

  // Utility functions from reference solution
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));
  
  // No chunk IDs or stats in flat segment model

  // Convert plan to rows for table display
  const segmentsToRows = useCallback((segments: Segment[]): PlanRow[] => {
    if (!segments) return [];
    return segments.map((seg) => {
      const row = {
        rowKey: `${seg.segment_id}|${seg.start_idx}|${seg.end_idx}`,
        segmentId: seg.segment_id,
        start: seg.start_idx,
        end: seg.end_idx - 1,
        length: seg.end_idx - seg.start_idx,
        voice: seg.voice ?? "",
        delimiter: seg.delimiter,
      };
      
      console.log(`🔍 UI ROW #${seg.segment_id}: text="${seg.text || ''}"`);
      return row;
    });
  }, []);

  const rowsAll = useMemo(() => {
    if (!segments) return [];
    console.log(`🔍 CONVERTING ${segments.length} SEGMENTS TO UI ROWS`);
    const rows = segmentsToRows(segments);
    console.log(`🗂️ Generated ${rows.length} grid rows`);
    console.log(`🔍 FINAL UI ROWS:`, rows.map(r => `#${r.segmentId}[${r.start}:${r.end+1}]${r.delimiter}`).join(', '));
    return rows;
  }, [segments, segmentsToRows]);
  // Filter rows based only on "Unknown" checkbox
  const filteredRows = useMemo(() => {
    console.log(`🔍 Filtering rows: rowsAll=${rowsAll.length}, onlyUnknown=${onlyUnknown}`);
    
    let rs = rowsAll;
    console.log(`🔍 Starting with ${rs.length} rows`);
    
    if (onlyUnknown) {
      rs = rs.filter((r) => r.voice.toLowerCase() === t("planning.unknownCharacter") || r.voice === "");
      console.log(`🔍 After onlyUnknown filter: ${rs.length} rows`);
    }
    
    console.log(`🔍 Final filtered rows: ${rs.length}`);
    if (rs.length > 0) {
      console.log(`🔍 Sample row:`, rs[0]);
    }
    
    return rs;
  }, [rowsAll, onlyUnknown, t]);

  // Adjust selection when filtered rows change
  useEffect(() => {
    setSelIndex((i) => clamp(i, 0, Math.max(0, filteredRows.length - 1)));
  }, [filteredRows.length]);

  const current = filteredRows[selIndex];

  // Auto-scroll to selected row
  useEffect(() => {
    const rowEl = gridRef.current?.querySelector(`[data-row='${selIndex}']`) as HTMLElement | null;
    rowEl?.scrollIntoView({ block: "nearest" });
  }, [selIndex, filteredRows.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setSelIndex(i => Math.max(0, i - 1));
      } else if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setSelIndex(i => Math.min(filteredRows.length - 1, i + 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredRows.length]);

  // Update voice assignment
  const updateRowVoice = (i: number, voice: string) => {
    const row = filteredRows[i];
    if (!row || !segments) return;
    // Find the segment by segmentId
    const idx = segments.findIndex(s => s.segment_id === row.segmentId);
    if (idx === -1) return;
    const newSegments = [...segments];
    newSegments[idx] = { ...newSegments[idx], voice, originalText: newSegments[idx].originalText || newSegments[idx].text };
    setSegments(newSegments);
  };

  // Generate plan for selected chapter only
  const generatePlan = async () => {
    if (!selectedChapter) {
      setMessage(t("planning.selectChapterFirst"));
      return;
    }
    
    console.log("🎯 Generate plan clicked for chapter:", selectedChapter);
    
    // Check if window.khipu is available
    if (!window.khipu || !window.khipu.call) {
      console.error("❌ window.khipu is not available! Electron IPC not ready.");
      setMessage(t("planning.ipcNotAvailable"));
      return;
    }
    
    if (!root) {
      console.error("❌ No project root available! Cannot generate plan.");
      setMessage(t("planning.noProjectLoaded"));
      return;
    }
    
    console.log("✅ All checks passed, starting plan generation for chapter:", selectedChapter);
    
    setLoading(true);
    setRunning(true);
    setMessage(`Generating plan for chapter ${selectedChapter}...`);
    
    // Show immediate progress feedback
    setPlanProgress({
      current: 0,
      total: 100,
      stage: t("planning.startingPlanGeneration")
    });
    
    try {
      // Find the selected chapter data
      const chapter = chapters.find(ch => ch.id === selectedChapter);
      if (!chapter) {
        setMessage(t("planning.selectedChapterNotFound"));
        setLoading(false);
        setRunning(false);
        setPlanProgress(null);
        return;
      }
      
      const payload: PlanBuildPayload = {
        projectRoot: root,
        chapterId: chapter.id,
        infile: chapter.relPath,
        out: `ssml/plans/${chapter.id}.plan.json`,
        opts: { 
          "max-kb": caps.maxKB 
        },
      };
      
      console.log(`🚀 Processing chapter: ${chapter.id}`);
      console.log(`🔍 PYTHON SOURCE FILE: ${chapter.relPath}`);
      console.log(`🔍 UI TEXT SOURCE: analysis/chapters_txt/${chapter.id}.txt`);
      console.log(`🔍 FILE MISMATCH DETECTED: Python uses "${chapter.relPath}" but UI loads "analysis/chapters_txt/${chapter.id}.txt"`);
      
      // Initialize cost tracking for this project
      try {
        await costTrackingService.setProjectRoot(root);
      } catch (costError) {
        console.warn('Failed to initialize cost tracking for chapter planning:', costError);
      }
      
      const result = await window.khipu.call("plan:build", payload);
      
      // Track LLM cost for chapter planning
      try {
        // Estimate token usage for chapter planning
        const estimatedInputTokens = 4000; // Typical input for chapter structure analysis
        const estimatedOutputTokens = 3000; // Typical output with segment planning
        
        costTrackingService.trackLlmUsage({
          provider: 'openai-gpt4o', // Default assumption
          operation: 'chapter_planning',
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
          wasCached: false,
          cacheHit: false,
          page: 'orchestration',
          projectId: root.split('/').pop() || 'unknown',
          chapterId: chapter.id
        });
        
        console.log(`📊 Tracked chapter planning LLM usage: ${estimatedInputTokens + estimatedOutputTokens} tokens`);
      } catch (costError) {
        console.warn('Failed to track chapter planning cost:', costError);
      }
      
      if (result === 0) {
        console.log(`✅ Chapter ${chapter.id} completed successfully`);
        setMessage(`Chapter ${selectedChapter} plan generated successfully!`);
        
        // Refresh chapter status and reload plan data
        const newStatus = await checkChapterStatus(selectedChapter);
        setChapterStatus(prev => new Map(prev).set(selectedChapter, newStatus));
        
        // Reload the plan data to display in grid
        await loadChapterData(selectedChapter);
      } else {
        console.error(`❌ Chapter ${chapter.id} failed with code: ${result}`);
        setMessage(`Failed to generate plan for chapter ${selectedChapter}. Error code: ${result}`);
      }
      
    } catch (error) {
      console.error("Failed to generate plan:", error);
      setMessage(`${t("planning.failedToGeneratePlan")} ${selectedChapter}. Check console for details.`);
    } finally {
      setLoading(false);
      setRunning(false);
      setPlanProgress(null);
    }
  };

  // Auto-save plan when segments change (debounced)
  useEffect(() => {
    if (!segments || !root || !selectedChapter) return;
    
    const timeoutId = setTimeout(async () => {
      try {
        console.log('💾 Auto-saving plan for chapter:', selectedChapter);
        await window.khipu!.call("fs:write", {
          projectRoot: root,
          relPath: `ssml/plans/${selectedChapter}.plan.json`,
          json: true,
          content: segments
        });
        console.log(`💾 Auto-saved plan for chapter ${selectedChapter}`);
        
        // Update chapter status
        const status = await checkChapterStatus(selectedChapter);
        setChapterStatus(prev => new Map(prev).set(selectedChapter, status));
      } catch (error) {
        console.warn('Auto-save failed:', error);
        // Don't show error to user for auto-save failures, just log them
      }
    }, 2000); // Debounce: save 2 seconds after last change

    return () => clearTimeout(timeoutId);
  }, [segments, root, selectedChapter, checkChapterStatus]);

  // Mark current chapter as complete
  const handleMarkChapterComplete = async () => {
    if (!root || !selectedChapter) return;
    
    try {
      // Save chapter completion
      const completionData = {
        complete: true,
        completedAt: new Date().toISOString(),
        chapterId: selectedChapter
      };
      
      await window.khipu!.call("fs:write", { 
        projectRoot: root, 
        relPath: `ssml/plans/${selectedChapter}.complete`, 
        json: true, 
        content: completionData 
      });
      
      // Update chapter status in state
      const updatedStatus = await checkChapterStatus(selectedChapter);
      setChapterStatus(prev => new Map(prev).set(selectedChapter, updatedStatus));
      
      setMessage(`Chapter ${selectedChapter} marked as complete!`);
      
      // Check if all chapters are now complete
      await checkAndMarkGlobalPlanningComplete();
    } catch (error) {
      console.error("Failed to mark chapter as complete:", error);
      setMessage(`Failed to mark chapter ${selectedChapter} as complete.`);
    }
  };

  // Assign characters using LLM
  const assignCharacters = async () => {
    console.log("🚀 ASSIGN CHARACTERS FUNCTION CALLED!");
    console.log("🔍 Debug values:", { 
      selectedChapter, 
      segments: segments ? segments.length : "null", 
      root,
      availableCharacters: availableCharacters.length 
    });
    
    if (!selectedChapter || !root) {
      console.log("❌ Missing required data:", { selectedChapter, root: !!root });
      setMessage(t("planning.errors.selectChapter"));
      return;
    }
    
    console.log("🎯 Assign characters clicked for chapter:", selectedChapter);
    
    // Check if window.khipu is available
    if (!window.khipu || !window.khipu.call) {
      console.error("❌ window.khipu is not available! Electron IPC not ready.");
      setMessage(t("planning.errors.ipcNotAvailable"));
      return;
    }

    // If no segments/plans exist, generate them first
    if (!segments) {
      console.log("📋 No existing plans found - generating plans first...");
      setMessage(t("planning.noPlansGeneratingFirst"));
      
      try {
        await generatePlan();
        console.log("✅ Plans generated successfully, proceeding with character assignment...");
        setMessage(t("planning.plansGeneratedAssigning"));
        
        // Note: The generatePlan() function already calls loadChapterData() at the end
        // so segments should be available now, but we need to check the current state
        // We'll proceed with character assignment regardless since the plan file exists now
      } catch (error) {
        console.error("❌ Failed to generate plans:", error);
        setMessage(t("planning.errors.failedToGeneratePlans"));
        return;
      }
    }
    
    console.log("✅ Starting character assignment for chapter:", selectedChapter);
    
    setAssigningCharacters(true);
    setLoading(true);
    setMessage(t("planning.analyzingChapterForCharacters", { chapter: selectedChapter }));
    
    // Show immediate progress feedback
    setCharacterAssignmentProgress({
      current: 0,
      total: 100,
      stage: "Loading chapter text..."
    });
    
    try {
      // Find the selected chapter data
      const chapter = chapters.find(ch => ch.id === selectedChapter);
      if (!chapter) {
        setMessage(t("planning.errors.chapterNotFound"));
        setAssigningCharacters(false);
        setLoading(false);
        setCharacterAssignmentProgress(null);
        return;
      }
      
      // Load chapter text for LLM analysis
      let chapterText = "";
      try {
        const textResult = await window.khipu!.call("fs:read", {
          projectRoot: root,
          relPath: `analysis/chapters_txt/${chapter.id}.txt`,
          json: false
        });
        chapterText = typeof textResult === 'string' ? textResult : String(textResult || '');
      } catch (error) {
        console.error("Failed to load chapter text:", error);
        setMessage(`Failed to load chapter text for ${selectedChapter}. Make sure the text file exists.`);
        setAssigningCharacters(false);
        setLoading(false);
        setCharacterAssignmentProgress(null);
        return;
      }
      
      if (!chapterText) {
        setMessage(`No text content found for chapter ${selectedChapter}.`);
        setAssigningCharacters(false);
        setLoading(false);
        setCharacterAssignmentProgress(null);
        return;
      }
      
      // Prepare the payload for character assignment
      // TODO: This will be the payload for the IPC call when the backend service is implemented
      /*
      const payload = {
        projectRoot: root,
        chapterId: chapter.id,
        chapterText: chapterText,
        segments: segments,
        availableCharacters: availableCharacters,
      };
      */
      
      console.log(`🤖 Starting LLM character assignment for chapter ${selectedChapter}${segments ? ` (${segments.length} existing segments)` : ' (no existing plans)'}`);
      console.log(`📋 Available characters:`, availableCharacters);
      
      // Call the Python script for LLM-based character assignment
      const assignmentPayload = {
        chapterId: chapter.id,
        chapterText: chapterText,
        availableCharacters: availableCharacters
        // Note: segments no longer needed - script reads from plan file directly
      };
      
      console.log(`📝 Sending payload to character assignment service:`, assignmentPayload);
      
      // Initialize cost tracking for character assignment
      try {
        await costTrackingService.setProjectRoot(root);
      } catch (costError) {
        console.warn('Failed to initialize cost tracking for character assignment:', costError);
      }
      
      let assignmentResult: { success: boolean; assignments?: Array<{ segment_id: string; assigned_character: string; confidence: number; reasoning: string }>; error?: string };
      try {
        assignmentResult = await window.khipu!.characters.assignToSegments(root, assignmentPayload) as typeof assignmentResult;
        
        // Track LLM cost for character assignment
        try {
          // Estimate token usage for character assignment
          const estimatedInputTokens = 2500; // Typical input for character assignment analysis
          const estimatedOutputTokens = 1500; // Typical output with assignment decisions
          
          costTrackingService.trackLlmUsage({
            provider: 'openai-gpt4o', // Default assumption
            operation: 'character_assignment',
            inputTokens: estimatedInputTokens,
            outputTokens: estimatedOutputTokens,
            wasCached: false,
            cacheHit: false,
            page: 'orchestration',
            projectId: root.split('/').pop() || 'unknown',
            chapterId: chapter.id
          });
          
          console.log(`📊 Tracked character assignment LLM usage: ${estimatedInputTokens + estimatedOutputTokens} tokens`);
        } catch (costError) {
          console.warn('Failed to track character assignment cost:', costError);
        }
        
        console.log(`📥 Received assignment result:`, assignmentResult);
        
        if (!assignmentResult.success) {
          throw new Error(assignmentResult.error || "Character assignment failed");
        }
        
      } catch (error) {
        console.error("❌ Failed to call character assignment service:", error);
        setMessage(t("planning.errors.serviceConnectionFailed"));
        
        // Fallback: if no existing segments, we can't do fallback assignment
        if (segments) {
          assignmentResult = {
            success: false,
            assignments: segments.map((segment, index) => ({
              segment_id: String(segment.segment_id || `seg_${index + 1}`),
              assigned_character: "narrador",
              confidence: 0.5,
              reasoning: "Fallback assignment (LLM unavailable)"
            }))
          };
        } else {
          throw new Error("Character assignment failed and no existing plan to fall back to");
        }
      }
      
      setCharacterAssignmentProgress({
        current: 80,
        total: 100,
        stage: t("planning.status.reloading")
      });
      
      // The plan file has been updated directly by the Python script
      // Now we need to reload the plan to get the updated character assignments
      console.log(`✅ Plan file updated successfully!`);
      
      setCharacterAssignmentProgress({
        current: 90,
        total: 100,
        stage: "Reloading updated plan..."
      });
      
      // Reload the plan file to get updated segments
      try {
        console.log(`🔄 BEFORE RELOAD - Current segments count: ${segments ? segments.length : 'null'}`);
        if (segments) {
          console.log(`🔄 BEFORE RELOAD - First 3 segment voices:`, segments.slice(0, 3).map(s => ({ id: s.segment_id, voice: s.voice })));
        }
        
        // Clear current segments to force fresh load
        setSegments(null);
        
        // Add a small delay to ensure file system changes are visible
        await new Promise(resolve => setTimeout(resolve, 500));
        
        await loadChapterData(selectedChapter);
        
        console.log(`📄 AFTER RELOAD - Reloaded plan with updated character assignments`);
        
        // Wait for state to update
        setTimeout(() => {
          console.log(`🔄 AFTER RELOAD - New segments count: ${segments ? segments.length : 'null'}`);
          if (segments) {
            console.log(`🔄 AFTER RELOAD - First 3 segment voices:`, segments.slice(0, 3).map(s => ({ id: s.segment_id, voice: s.voice })));
          }
        }, 100);
        
      } catch (error) {
        console.error("Failed to reload updated plan:", error);
        setMessage(t("planning.errors.completedButFailedReload"));
      }
      
      setCharacterAssignmentProgress({
        current: 100,
        total: 100,
        stage: "Character assignment completed!"
      });
      
      setMessage(`Character assignment completed! Plan file updated with refined character assignments.`);
      
    } catch (error) {
      console.error("Failed to assign characters:", error);
      setMessage(`Failed to assign characters for chapter ${selectedChapter}. Check console for details.`);
    } finally {
      setAssigningCharacters(false);
      setLoading(false);
      setTimeout(() => {
        setCharacterAssignmentProgress(null);
      }, 2000);
    }
  };

  // Handle cache invalidation when segment text changes
  const handleCacheInvalidation = async (segmentId: number, oldText: string) => {
    if (!projectConfig || !charactersData.length) {
      console.warn("Cannot invalidate cache: missing project config or character data");
      return;
    }

    const segment = segments?.find(s => s.segment_id === segmentId);
    if (!segment) {
      console.warn("Cannot invalidate cache: segment not found:", segmentId);
      return;
    }

    // Find character data for this segment's voice
    const characterId = segment.voice;
    const character = charactersData.find(c => c.id === characterId || c.name === characterId);
    
    if (!character?.voiceAssignment) {
      console.warn("Cannot invalidate cache: no voice assignment for character:", characterId);
      return;
    }

    console.log(`🗑️ CACHE INVALIDATION - Segment ${segmentId} with old text: "${oldText}"`);

    // Create the same voice object that would be used for audition
    const voice: VoiceType = {
      id: character.voiceAssignment.voiceId,
      engine: "azure",
      locale: character.voiceAssignment.voiceId.startsWith("es-") ? character.voiceAssignment.voiceId.substring(0, 5) : "es-ES",
      gender: character.traits?.gender || "N",
      age_hint: character.traits?.age || "adult",
      accent_tags: character.traits?.accent ? [character.traits.accent] : [],
      styles: character.voiceAssignment.style ? [character.voiceAssignment.style] : [],
      description: `Voice for ${character.name || characterId}`
    };

    // Generate the cache key that would have been used with the OLD text
    const { generateCacheKey } = await import("../lib/audio-cache");
    const oldCacheKey = generateCacheKey({
      voice: voice,
      config: projectConfig,
      text: oldText,
      style: character.voiceAssignment.style,
      styledegree: character.voiceAssignment.styledegree,
      rate_pct: character.voiceAssignment.rate_pct,
      pitch_pct: character.voiceAssignment.pitch_pct
    });

    console.log(`🗑️ CACHE INVALIDATION - Generated old cache key for deletion: "${oldCacheKey}"`);

    // Delete the old cache entry
    try {
      const deleted = await deleteAudioCacheEntry(oldCacheKey);
      console.log(`🗑️ CACHE INVALIDATION - Deletion result: ${deleted} for key: "${oldCacheKey}"`);
    } catch (error) {
      console.error("Failed to delete old cache entry:", error);
    }
  };

  // Handle segment audition with character voice
  const handleSegmentAudition = async (segmentId: number, overrideText?: string, disableCache?: boolean) => {
    console.log("🔊 Starting audition for segment:", segmentId);
    
    if (!projectConfig) {
      console.warn("Project config not loaded");
      return;
    }

    const segment = segments?.find(s => s.segment_id === segmentId);
    if (!segment) {
      console.warn("Segment not found:", segmentId);
      return;
    }

    console.log("📋 Found segment:", segment);
    console.log("👥 Available characters:", charactersData.length);

    // Find character data for this segment's voice
    const characterId = segment.voice;
    console.log("🎭 Looking for character:", characterId);
    
    const character = charactersData.find(c => c.id === characterId || c.name === characterId);
    console.log("🎭 Found character:", character);
    
    if (!character?.voiceAssignment) {
      console.warn("No voice assignment found for character:", characterId);
      console.log("Character object:", character);
      return;
    }

    console.log("🎤 Character voice assignment:", character.voiceAssignment);

    // Use voice data directly from character assignment
    const voiceId = character.voiceAssignment.voiceId;
    
    // Create voice object from character voice assignment
    const voice: VoiceType = {
      id: voiceId,
      engine: "azure", // Default to Azure since that's what most voice IDs use
      locale: voiceId.startsWith("es-") ? voiceId.substring(0, 5) : "es-ES", // Extract locale from voice ID
      gender: character.traits?.gender || "N",
      age_hint: character.traits?.age || "adult",
      accent_tags: character.traits?.accent ? [character.traits.accent] : [],
      styles: character.voiceAssignment.style ? [character.voiceAssignment.style] : [],
      description: `Voice for ${character.name || characterId}`
    };

    console.log("🎵 Created voice object from character:", voice);

    // If already auditioning this segment, stop
    if (auditioningSegments.has(segmentId)) {
      stopAudio();
      setAuditioningSegments(prev => {
        const next = new Set(prev);
        next.delete(segmentId);
        return next;
      });
      return;
    }

    setAuditioningSegments(prev => new Set(prev).add(segmentId));

    try {
      // Use override text if provided (during editing), otherwise use current text
      const auditionText = overrideText || segment.text || "No text available";
      console.log("🎤 Generating audition with parameters:", {
        segmentId: segmentId,
        voice: voice,
        text: auditionText,
        originalText: segment.originalText,
        currentText: segment.text,
        overrideText: overrideText,
        style: character.voiceAssignment.style,
        styledegree: character.voiceAssignment.styledegree,
        rate_pct: character.voiceAssignment.rate_pct,
        pitch_pct: character.voiceAssignment.pitch_pct,
        isEditing: !!overrideText,
        cacheDisabled: disableCache
      });

      // Use caching unless explicitly disabled in config OR during editing
      const useCache = (projectConfig?.tts?.cache !== false) && !disableCache;
      console.log(`🎤 Starting segment audition for: ${segmentId}`, { 
        voice: voice.id, 
        config: !!projectConfig, 
        useCache, 
        editingMode: disableCache,
        textToAudition: auditionText 
      });
      
      // Use the new audio cache hook for audition
      await playAudition({
        voice: voice,
        config: projectConfig,
        text: auditionText,
        style: character.voiceAssignment.style,
        styledegree: character.voiceAssignment.styledegree,
        rate_pct: character.voiceAssignment.rate_pct,
        pitch_pct: character.voiceAssignment.pitch_pct,
        page: 'orchestration'
      }, useCache);

      console.log(`🔊 Playing cached segment audition for: ${characterId}`);
    } catch (error) {
      console.error("Audition error:", error);
    } finally {
      setAuditioningSegments(prev => {
        const next = new Set(prev);
        next.delete(segmentId);
        return next;
      });
    }
  };

  if (!root) {
    return (
      <div style={{ maxWidth: "100%" }}>
        <div style={{ textAlign: "center", padding: "64px 0", backgroundColor: "var(--panel)", borderRadius: "8px", border: "1px dashed var(--border)" }}>
          <p style={{ color: "var(--text)", fontSize: "18px", marginBottom: "8px" }}>{t("status.noProjectLoaded")}</p>
          <p style={{ color: "var(--muted)", fontSize: "14px" }}>{t("status.loadProjectToManagePlanning")}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "100%", height: "calc(100vh - 32px)" }}>
      <PageHeader 
        title={t("planning.title")}
        description={t("planning.description")}
        actions={
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            {/* Chapter Selector */}
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <label style={{ fontSize: "14px", fontWeight: "500", color: "var(--text)", whiteSpace: "nowrap" }}>
                {t("planning.chapterLabel")}
              </label>
              <select
                value={selectedChapter}
                onChange={(e) => setSelectedChapter(e.target.value)}
                style={{
                  padding: "8px 12px",
                  fontSize: "14px",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  backgroundColor: "var(--input)",
                  color: "var(--text)",
                  minWidth: "200px",
                  cursor: "pointer",
                  appearance: "none",
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: "right 8px center",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "16px",
                  paddingRight: "32px"
                }}
              >
                <option value="" style={{ backgroundColor: "var(--panel)", color: "var(--text)" }}>
                  {t("planning.selectChapterOption")}
                </option>
                {chapters.map((chapter) => {
                  const status = chapterStatus.get(chapter.id);
                  const statusIcon = status?.isComplete ? "✅" : status?.hasPlan ? "📝" : status?.hasText ? "📄" : "❌";
                  return (
                    <option 
                      key={chapter.id} 
                      value={chapter.id}
                      style={{ 
                        backgroundColor: "var(--panel)", 
                        color: "var(--text)",
                        padding: "4px 8px"
                      }}
                    >
                      {statusIcon} {chapter.id} {chapter.title ? `- ${chapter.title}` : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            
            {/* Unknown filter checkbox */}
            {segments && (
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "var(--text)", whiteSpace: "nowrap" }}>
                <input 
                  type="checkbox" 
                  checked={onlyUnknown} 
                  onChange={(e) => setOnlyUnknown(e.target.checked)} 
                />
                Unknown
              </label>
            )}
            
            {/* Action Buttons */}
            <StandardButton 
              onClick={generatePlan} 
              disabled={loading || running || !selectedChapter}
              variant="primary"
            >
              {running ? t("planning.generating") : selectedChapter ? t("planning.generatePlanFor") : t("planning.selectChapter")}
            </StandardButton>
            
            <StandardButton 
              onClick={assignCharacters} 
              disabled={loading || assigningCharacters || !selectedChapter || !segments}
              variant="secondary"
            >
              {assigningCharacters ? t("planning.assigning") : t("planning.assignCharacters")}
            </StandardButton>
            
            {segments && selectedChapter && (
              <StandardButton 
                onClick={handleMarkChapterComplete}
                disabled={loading || chapterStatus.get(selectedChapter)?.isComplete || !chapterStatus.get(selectedChapter)?.hasPlan}
                variant={chapterStatus.get(selectedChapter)?.isComplete ? "success" : "secondary"}
              >
                {chapterStatus.get(selectedChapter)?.isComplete ? `✓ ${t("planning.chapterComplete")}` : t("planning.markChapterComplete")}
              </StandardButton>
            )}
          </div>
        }
      />

      {/* Status message */}
      {message && !running && (
        <div style={{
          marginBottom: "16px",
          padding: "12px",
          borderRadius: "6px",
          fontSize: "14px",
          backgroundColor: "var(--panelAccent)",
          border: "1px solid var(--border)",
          color: "var(--text)"
        }}>
          {message}
        </div>
      )}

      {/* Loading section with progress */}
      {running && (
        <div style={{ 
          marginBottom: "16px", 
          padding: "16px", 
          backgroundColor: "var(--panelAccent)", 
          border: "1px solid var(--border)", 
          borderRadius: "6px", 
          fontSize: "14px" 
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{
              display: "inline-block",
              width: "16px",
              height: "16px",
              border: "2px solid var(--accent)",
              borderTop: "2px solid transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite"
            }}></div>
            <span style={{ color: "var(--text)" }}>Generating plan...</span>
          </div>
          {planProgress ? (
            <div style={{ marginTop: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text)", marginBottom: "6px" }}>
                <span style={{ fontWeight: "500" }}>{planProgress.stage}</span>
                <span style={{ 
                  backgroundColor: "var(--panelAccent)", 
                  padding: "2px 6px", 
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: "600"
                }}>
                  {planProgress.current}%
                </span>
              </div>
              <div style={{ width: "100%", backgroundColor: "var(--border)", borderRadius: "6px", height: "10px" }}>
                <div 
                  style={{ 
                    backgroundColor: "var(--accent)", 
                    height: "10px", 
                    borderRadius: "6px", 
                    transition: "width 0.5s ease-out",
                    width: `${Math.max(2, planProgress.current)}%`,
                    minWidth: "8px"
                  }}
                ></div>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text)", marginBottom: "6px" }}>
                <span style={{ fontWeight: "500" }}>Initializing plan generation...</span>
                <span style={{ 
                  backgroundColor: "var(--panelAccent)", 
                  padding: "2px 6px", 
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: "600"
                }}>
                  Starting...
                </span>
              </div>
              <div style={{ width: "100%", backgroundColor: "var(--border)", borderRadius: "6px", height: "10px" }}>
                <div 
                  style={{ 
                    backgroundColor: "var(--accent)", 
                    height: "10px", 
                    borderRadius: "6px", 
                    animation: "pulse 2s ease-in-out infinite",
                    width: "20%",
                    minWidth: "20px"
                  }}
                ></div>
              </div>
            </div>
          )}
          <div style={{ fontSize: "12px", color: "var(--accent)", marginTop: "4px" }}>{t("planning.mayTakeAMoment")}</div>
        </div>
      )}

      {/* Character assignment progress */}
      {assigningCharacters && (
        <div style={{ 
          marginBottom: "16px", 
          padding: "16px", 
          backgroundColor: "var(--panelAccent)", 
          border: "1px solid var(--border)", 
          borderRadius: "6px", 
          fontSize: "14px" 
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{
              display: "inline-block",
              width: "16px",
              height: "16px",
              border: "2px solid var(--accent)",
              borderTop: "2px solid transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite"
            }}></div>
            <span style={{ color: "var(--text)" }}>Assigning characters...</span>
          </div>
          {characterAssignmentProgress ? (
            <div style={{ marginTop: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text)", marginBottom: "6px" }}>
                <span style={{ fontWeight: "500" }}>{characterAssignmentProgress.stage}</span>
                <span style={{ 
                  backgroundColor: "var(--panelAccent)", 
                  padding: "2px 6px", 
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: "600"
                }}>
                  {characterAssignmentProgress.current}%
                </span>
              </div>
              <div style={{ width: "100%", backgroundColor: "var(--border)", borderRadius: "6px", height: "10px" }}>
                <div 
                  style={{ 
                    backgroundColor: "var(--accent)", 
                    height: "10px", 
                    borderRadius: "6px", 
                    transition: "width 0.5s ease-out",
                    width: `${Math.max(2, characterAssignmentProgress.current)}%`,
                    minWidth: "8px"
                  }}
                ></div>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text)", marginBottom: "6px" }}>
                <span style={{ fontWeight: "500" }}>Initializing character assignment...</span>
                <span style={{ 
                  backgroundColor: "var(--panelAccent)", 
                  padding: "2px 6px", 
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: "600"
                }}>
                  Starting...
                </span>
              </div>
              <div style={{ width: "100%", backgroundColor: "var(--border)", borderRadius: "6px", height: "10px" }}>
                <div 
                  style={{ 
                    backgroundColor: "var(--accent)", 
                    height: "10px", 
                    borderRadius: "6px", 
                    animation: "pulse 2s ease-in-out infinite",
                    width: "5%",
                    minWidth: "20px"
                  }}
                ></div>
              </div>
            </div>
          )}
          <div style={{ fontSize: "12px", color: "var(--accent)", marginTop: "4px" }}>{t("planning.analysingChapterText")}</div>
        </div>
      )}

      {!selectedChapter ? (
        <div style={{ 
          textAlign: "center", 
          padding: "64px 32px", 
          backgroundColor: "var(--panel)", 
          borderRadius: "8px", 
          border: "1px dashed var(--border)" 
        }}>
          <p style={{ color: "var(--text)", fontSize: "18px", marginBottom: "8px" }}>{t("planning.selectChapterToBegin")}</p>
          <p style={{ color: "var(--muted)", fontSize: "14px" }}>{t("planning.chooseChapterFromDropdown")}</p>
        </div>
      ) : segments ? (
        <div style={{ display: "flex", flexDirection: "column", height: "calc(100% - 160px)" }}>
          {/* Main content grid */}
          <div style={{ display: "grid", gridTemplateColumns: "30% 1fr", gap: "16px", flex: 1, minHeight: 0 }}>
            {/* Left: Table */}
            <div style={{ border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "8px 12px", backgroundColor: "var(--panelAccent)", borderBottom: "1px solid var(--border)", fontSize: "14px", fontWeight: 500 }}>
                {t("planning.chunksVoiceAssignment")}
              </div>
              
              <div ref={gridRef} style={{ flex: 1, overflow: "auto" }}>
                <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ 
                      backgroundColor: "var(--panelAccent)", 
                      borderBottom: "2px solid var(--border)",
                      position: "sticky", 
                      top: 0,
                      zIndex: 1
                    }}>
                      <th style={{ padding: "6px 8px", textAlign: "left", fontSize: "11px", fontWeight: 600, width: "24px" }}></th>
                      <th style={{ padding: "6px 4px", textAlign: "center", fontSize: "11px", fontWeight: 600, width: "32px" }} title={t("audioProduction.revisionStatus")}>🏳</th>
                      <th style={{ padding: "6px 8px", textAlign: "left", fontSize: "11px", fontWeight: 600, minWidth: "40px" }}>ID</th>
                      <th style={{ padding: "6px 8px", textAlign: "center", fontSize: "11px", fontWeight: 600, width: "40px" }}>{t("planning.table.delim")}</th>
                      <th style={{ padding: "6px 8px", textAlign: "right", fontSize: "11px", fontWeight: 600, width: "50px" }}>{t("planning.table.start")}</th>
                      <th style={{ padding: "6px 8px", textAlign: "right", fontSize: "11px", fontWeight: 600, width: "50px" }}>{t("planning.table.end")}</th>
                      <th style={{ padding: "6px 8px", textAlign: "right", fontSize: "11px", fontWeight: 600, width: "50px" }}>{t("planning.table.len")}</th>
                      <th style={{ padding: "6px 8px", textAlign: "left", fontSize: "11px", fontWeight: 600, minWidth: "150px" }}>{t("planning.table.character")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r, i) => (
                      <tr 
                        key={r.rowKey} 
                        data-row={i}
                        onClick={() => setSelIndex(i)}
                        style={{
                          cursor: "pointer",
                          backgroundColor: i === selIndex ? "var(--accent)" : (i % 2 === 0 ? "var(--panel)" : "transparent"),
                          color: i === selIndex ? "white" : "var(--text)",
                          borderBottom: "1px solid var(--border)",
                          transition: "background-color 0.15s ease"
                        }}
                      >
                        <td style={{ 
                          padding: "4px 8px", 
                          color: i === selIndex ? "white" : "var(--accent)",
                          fontWeight: 500,
                          textAlign: "center"
                        }}>
                          {i === selIndex ? "▶" : ""}
                        </td>
                        <td style={{ padding: "2px 4px", textAlign: "center" }}>
                          <StandardButton
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleRevisionMark(r.segmentId);
                            }}
                            size="compact"
                            variant={isSegmentMarkedForRevision(r.segmentId) ? "warning" : "secondary"}
                            style={{
                              minWidth: "24px",
                              height: "24px",
                              padding: "2px",
                              fontSize: "12px",
                              opacity: isSegmentMarkedForRevision(r.segmentId) ? 1 : 0.6,
                            }}
                            title={isSegmentMarkedForRevision(r.segmentId) ? 
                              t("audioProduction.removeRevisionMark") : 
                              t("audioProduction.markForRevision")}
                          >
                            {isSegmentMarkedForRevision(r.segmentId) ? "🚩" : "🏳"}
                          </StandardButton>
                        </td>
                        <td style={{ 
                          padding: "4px 8px", 
                          whiteSpace: "nowrap",
                          fontFamily: "monospace",
                          fontSize: "11px",
                          color: i === selIndex ? "white" : "var(--muted)"
                        }}>
                          {r.segmentId}
                        </td>
                        <td style={{ 
                          padding: "4px 8px", 
                          textAlign: "center",
                          fontFamily: "monospace",
                          fontSize: "11px"
                        }}>
                          {r.delimiter}
                        </td>
                        <td style={{ 
                          padding: "4px 8px", 
                          textAlign: "right",
                          fontFamily: "monospace",
                          fontSize: "11px"
                        }}>
                          {r.start}
                        </td>
                        <td style={{ 
                          padding: "4px 8px", 
                          textAlign: "right",
                          fontFamily: "monospace",
                          fontSize: "11px"
                        }}>
                          {r.end}
                        </td>
                        <td style={{ 
                          padding: "4px 8px", 
                          textAlign: "right",
                          fontFamily: "monospace",
                          fontSize: "11px"
                        }}>
                          {r.length}
                        </td>
                        <td style={{ padding: "4px 8px" }}>
                          <select 
                            value={r.voice}
                            onChange={(e) => updateRowVoice(i, e.target.value)}
                            style={{ 
                              width: "100%", 
                              padding: "3px 6px", 
                              fontSize: "11px",
                              backgroundColor: i === selIndex ? "rgba(255,255,255,0.1)" : "var(--panel)", 
                              color: i === selIndex ? "white" : "var(--text)", 
                              border: "1px solid var(--border)", 
                              borderRadius: "4px",
                              outline: "none"
                            }}
                          >
                            <option value="">Select...</option>
                            {availableCharacters.map((char, index) => (
                              <option key={`${char}-${index}`} value={char} style={{ backgroundColor: "var(--panel)", color: "var(--text)" }}>
                                {char}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right: Preview */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "8px 12px", backgroundColor: "var(--panelAccent)", border: "1px solid var(--border)", borderRadius: "6px 6px 0 0", fontSize: "14px", fontWeight: 500 }}>
                {t("planning.preview")}
              </div>
              
              <div style={{ flex: 1, overflow: "auto" }}>
                {current ? (
                  <EditablePreview
                    current={current}
                    segments={segments}
                    setSegments={setSegments}
                    setSegmentsWithHistory={setSegmentsWithHistory}
                    undoSegmentOperation={undoSegmentOperation}
                    canUndo={canUndo}
                    onAudition={handleSegmentAudition}
                    onInvalidateCache={handleCacheInvalidation}
                    isAudioLoading={isAudioLoading}
                    auditioningSegments={auditioningSegments}
                    isAudioPlaying={isAudioPlaying}
                    t={t}
                  />
                ) : (
                  <div style={{ color: "var(--muted)", fontStyle: "italic" }}>
                    {t("planning.selectRowToPreview")}
                  </div>
                )}
              </div>
            </div>


          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "64px 0", backgroundColor: "var(--panel)", borderRadius: "8px", border: "1px dashed var(--border)" }}>
          <p style={{ color: "var(--text)", fontSize: "18px", marginBottom: "8px" }}>No plan for {selectedChapter}</p>
          <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "16px" }}>{t("planning.generateInstruction", { chapter: selectedChapter })}</p>
        </div>
      )}
    </div>
  );
}
