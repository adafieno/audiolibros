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
    console.log(`📝 SAVE EDIT - Segment ${current.segmentId}:`);
    console.log(`  - Text changed: ${textChanged}`);
    console.log(`  - Original text: "${originalSegment.text}"`);
    console.log(`  - New text: "${editedText}"`);
    console.log(`  - Current originalText: "${originalSegment.originalText}"`);

    // If text changed, invalidate the old cache entry
    if (textChanged && onInvalidateCache) {
      console.log(`🗑️ SAVE EDIT - Invalidating cache for old text: "${originalSegment.originalText || originalSegment.text}"`);
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

    console.log(`📝 SAVE EDIT - Updated segment:`, updatedSegments.find(s => s.segment_id === current.segmentId));
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
      handleSaveEdit();
    }
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
    <div>
      <div className="mb-2 flex-end" style={{ 
        fontSize: "12px", 
        color: "var(--muted)"
      }}>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <button
                onClick={handleStartEdit}
                className="btn compact"
                title={t("planning.tooltips.clickToEdit")}
              >
                ✏️ {t("planning.edit")}
              </button>
              {/* Merge operations when not editing */}
              <button
                onClick={() => handleMergeSegment('backward')}
                disabled={!canMergeBackward}
                className="btn compact"
                title={t("planning.mergeWithPrevious")}
              >
                ◀ {t("planning.merge")}
              </button>
              <button
                onClick={() => handleMergeSegment('forward')}
                disabled={!canMergeForward}
                className="btn compact"
                title={t("planning.mergeWithNext")}
              >
                {t("planning.merge")} ▶
              </button>
              <button
                onClick={handleDeleteSegment}
                disabled={!canDelete}
                className="btn compact danger"
                title={t("planning.deleteThisSegment")}
              >
                🗑️ {t("planning.delete")}
              </button>
              <button
                onClick={undoSegmentOperation}
                disabled={!canUndo}
                className="btn compact"
                title={t("planning.undoLastOperation")}
              >
                ↶ {t("planning.undo")}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSaveEdit}
                className="btn compact primary"
                title={t("planning.tooltips.saveChanges")}
              >
                💾 {t("planning.save")}
              </button>
              <button
                onClick={handleSplitSegment}
                disabled={!canSplit}
                className="btn compact"
                title={t("planning.splitAtCursor")}
              >
                ✂️ {t("planning.splitAtCursor")}
              </button>
              <button
                onClick={handleCancelEdit}
                className="btn compact"
                title={t("planning.tooltips.cancelEdit")}
              >
                ❌ {t("planning.cancel")}
              </button>
            </>
          )}
          {current.voice && current.voice !== "unassigned" && (
            <button
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
              style={{
                padding: "4px 8px",
                fontSize: "12px",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                backgroundColor: (isAudioPlaying || auditioningSegments.has(current.segmentId)) ? "var(--panelAccent)" : "var(--background)",
                color: "var(--text)",
                cursor: (isAudioLoading || auditioningSegments.has(current.segmentId)) ? "not-allowed" : "pointer"
              }}
            >
              {(isAudioLoading || auditioningSegments.has(current.segmentId)) 
                ? `🔊 ${t("common.loading")}` 
                : isAudioPlaying 
                  ? `🔊 ${t("common.playing")}` 
                  : `🔊 ${t("common.audition")}`}
            </button>
          )}
        </div>
      </div>
      
      {/* Separator between toolbar and content */}
      <div style={{
        height: "1px",
        backgroundColor: "var(--border)",
        margin: "8px 0",
        opacity: 0.3
      }} />
      
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={editedText}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
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
            padding: "8px",
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
            padding: "8px",
            border: "1px solid transparent",
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
            marginTop: "6px",
            padding: "4px 8px",
            backgroundColor: "var(--panelBackground)",
            borderRadius: "3px",
            display: "flex",
            gap: "12px"
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
          marginTop: "4px",
          fontStyle: "italic"
        }}>
          💡 {t("planning.editInstructions")}
          <br />
          {t("planning.splitInstructions")}
        </div>
      )}

      {message && (
        <div style={{ 
          fontSize: "12px", 
          color: message.includes("successfully") ? "var(--success)" : "var(--error)", 
          marginTop: "8px",
          padding: "4px 8px",
          border: `1px solid ${message.includes("successfully") ? "var(--success)" : "var(--error)"}`,
          borderRadius: "4px",
          backgroundColor: message.includes("successfully") ? "var(--successBg)" : "var(--errorBg)"
        }}>
          {message}
        </div>
      )}

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
  const [chunkFilter, setChunkFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selIndex, setSelIndex] = useState(0);
  
  // Caps settings
  const [caps] = useState<AzureCaps>(DEFAULT_CAPS);
  
  // Audition state
  const [auditioningSegments, setAuditioningSegments] = useState<Set<number>>(new Set());
  const [charactersData, setCharactersData] = useState<CharacterData[]>([]);
  
  // Use the new audio cache hook
  const { isPlaying: isAudioPlaying, isLoading: isAudioLoading, playAudition, stopAudio } = useAudioCache();

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
        setMessage(`All chapters complete! Planning phase is now complete.`);
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
  }, [root, cleanupStaleCache]);

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
  // Remove chunk filter for flat segments
  const chunkIds: string[] = [t("planning.chunkAll")];

  const filteredRows = useMemo(() => {
    console.log(`🔍 Filtering rows: rowsAll=${rowsAll.length}, onlyUnknown=${onlyUnknown}, chunkFilter=${chunkFilter}, search="${search}"`);
    
    let rs = rowsAll;
    console.log(`🔍 Starting with ${rs.length} rows`);
    
    if (onlyUnknown) {
      rs = rs.filter((r) => r.voice.toLowerCase() === t("planning.unknownCharacter") || r.voice === "");
      console.log(`🔍 After onlyUnknown filter: ${rs.length} rows`);
    }
    
  // No chunk filter in flat segment model
    
    if (search.trim()) {
      const q = search.toLowerCase();
      rs = rs.filter((r) => {
        // Search in the original segment text
        const originalSegment = segments?.find(seg => seg.segment_id === r.segmentId);
        const segmentText = originalSegment?.text || "";
        return segmentText.toLowerCase().includes(q);
      });
      console.log(`🔍 After search "${q}": ${rs.length} rows`);
    }
    
    console.log(`🔍 Final filtered rows: ${rs.length}`);
    if (rs.length > 0) {
      console.log(`🔍 Sample row:`, rs[0]);
    }
    
    return rs;
  }, [rowsAll, onlyUnknown, chunkFilter, search, segments, t]);

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

  // Initialize chunk filter with translation
  useEffect(() => {
    if (!chunkFilter) {
      setChunkFilter(t("planning.chunkAll"));
    }
  }, [t, chunkFilter]);



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
      const result = await window.khipu.call("plan:build", payload);
      
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

  // Save plan for selected chapter
  const savePlan = async () => {
    if (!segments || !root || !selectedChapter) {
      setMessage(t("planning.noPlanToSave"));
      return;
    }
    setLoading(true);
    try {
      await window.khipu!.call("fs:write", {
        projectRoot: root,
        relPath: `ssml/plans/${selectedChapter}.plan.json`,
        json: true,
        content: segments
      });
      setMessage(`Plan for chapter ${selectedChapter} saved successfully!`);
      // Update chapter status
      const status = await checkChapterStatus(selectedChapter);
      setChapterStatus(prev => new Map(prev).set(selectedChapter, status));
    } catch (error) {
      console.error("Failed to save plan:", error);
      setMessage(`Failed to save plan for chapter ${selectedChapter}.`);
    } finally {
      setLoading(false);
    }
  };

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
      setCharacterAssignmentProgress({
        current: 10,
        total: 100,
        stage: "Reading chapter content..."
      });
      
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
      setCharacterAssignmentProgress({
        current: 30,
        total: 100,
        stage: t("planning.analysingWithAI")
      });
      
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
      
      setCharacterAssignmentProgress({
        current: 50,
        total: 100,
        stage: "Calling LLM for character analysis..."
      });
      
      // Call the Python script for LLM-based character assignment
      const assignmentPayload = {
        chapterId: chapter.id,
        chapterText: chapterText,
        availableCharacters: availableCharacters
        // Note: segments no longer needed - script reads from plan file directly
      };
      
      console.log(`� Sending payload to character assignment service:`, assignmentPayload);
      
      let assignmentResult: { success: boolean; assignments?: Array<{ segment_id: string; assigned_character: string; confidence: number; reasoning: string }>; error?: string };
      try {
        assignmentResult = await window.khipu!.characters.assignToSegments(root, assignmentPayload) as typeof assignmentResult;
        
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
        pitch_pct: character.voiceAssignment.pitch_pct
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
      <div style={{ padding: "16px", maxWidth: "1200px" }}>
        <div style={{ textAlign: "center", padding: "64px 0", backgroundColor: "var(--panel)", borderRadius: "8px", border: "1px dashed var(--border)" }}>
          <p style={{ color: "var(--text)", fontSize: "18px", marginBottom: "8px" }}>{t("status.noProjectLoaded")}</p>
          <p style={{ color: "var(--muted)", fontSize: "14px" }}>{t("status.loadProjectToManagePlanning")}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", maxWidth: "1400px", height: "calc(100vh - 32px)" }}>
      <h1 style={{ fontSize: "32px", fontWeight: "bold", color: "var(--text)", marginBottom: "8px" }}>{t("planning.title")}</h1>
      <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "16px" }}>{t("planning.description")}</p>

      {/* Global Planning Completion Status */}
      {(() => {
        const completedChapters = Array.from(chapterStatus.values()).filter(status => status.isComplete).length;
        const totalChapters = chapters.length;
        const allComplete = totalChapters > 0 && completedChapters === totalChapters;
        
        return (
          <div style={{ 
            marginBottom: "16px", 
            padding: "12px 16px", 
            backgroundColor: allComplete ? "var(--successBg)" : "var(--panel)", 
            border: `1px solid ${allComplete ? "var(--success)" : "var(--border)"}`,
            borderRadius: "6px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <div>
              <span style={{ 
                fontSize: "14px", 
                fontWeight: "500",
                color: allComplete ? "var(--success)" : "var(--text)"
              }}>
                {allComplete ? "✅ Planning Complete" : `Planning Progress: ${completedChapters}/${totalChapters} chapters complete`}
              </span>
              {!allComplete && totalChapters > 0 && (
                <div style={{ marginTop: "4px", fontSize: "12px", color: "var(--muted)" }}>
                  Complete all chapter plans to unlock the next workflow step
                </div>
              )}
            </div>
            {allComplete && (
              <div style={{ 
                padding: "4px 8px", 
                backgroundColor: "var(--success)", 
                color: "white", 
                borderRadius: "4px", 
                fontSize: "12px",
                fontWeight: "500"
              }}>
                Ready for SSML
              </div>
            )}
          </div>
        );
      })()}

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

      {/* Chapter selector */}
      <div style={{ marginBottom: "16px", padding: "16px", backgroundColor: "var(--panel)", border: "1px solid var(--border)", borderRadius: "6px" }}>
        <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <label style={{ fontSize: "14px", fontWeight: "500", color: "var(--text)" }}>
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
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", alignItems: "center" }}>
        <button 
          onClick={generatePlan} 
          disabled={loading || running || !selectedChapter} 
          style={{ padding: "6px 12px", fontSize: "14px" }}
        >
          {running ? t("planning.generating") : selectedChapter ? t("planning.generatePlanFor", {chapter: selectedChapter}) : t("planning.selectChapter")}
        </button>
        
        <button 
          onClick={assignCharacters} 
          disabled={loading || assigningCharacters || !selectedChapter || !segments} 
          style={{ padding: "6px 12px", fontSize: "14px" }}
        >
          {assigningCharacters ? t("planning.assigning") : t("planning.assignCharacters")}
        </button>
        
  {segments && selectedChapter && (
          <>
            <button 
              onClick={savePlan} 
              disabled={loading} 
              style={{ padding: "6px 12px", fontSize: "14px" }}
            >
              {t("planning.savePlan")}
            </button>
            
            <button 
              onClick={handleMarkChapterComplete}
              disabled={loading || chapterStatus.get(selectedChapter)?.isComplete || !chapterStatus.get(selectedChapter)?.hasPlan} 
              style={{ 
                padding: "6px 12px", 
                fontSize: "14px",
                backgroundColor: chapterStatus.get(selectedChapter)?.isComplete ? "var(--success)" : "var(--accent)",
                color: "white",
                border: `1px solid ${chapterStatus.get(selectedChapter)?.isComplete ? "var(--success)" : "var(--accent)"}`,
                borderRadius: "4px",
                opacity: chapterStatus.get(selectedChapter)?.isComplete ? 0.7 : 1
              }}
            >
              {chapterStatus.get(selectedChapter)?.isComplete ? `✓ ${t("planning.chapterComplete")}` : t("planning.markChapterComplete")}
            </button>
          </>
        )}
      </div>

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
                    width: "20%",
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
        <div style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "calc(100% - 200px)", gap: "16px" }}>
          {/* Filters */}
          <div style={{ display: "flex", gap: "12px", alignItems: "center", padding: "12px", backgroundColor: "var(--panel)", borderRadius: "6px", border: "1px solid var(--border)" }}>
            <label style={{ fontSize: "14px", color: "var(--text)" }}>{t("planning.chunkLabel")}:</label>
            <select 
              value={chunkFilter} 
              onChange={(e) => setChunkFilter(e.target.value)}
              style={{ padding: "4px 8px", fontSize: "14px", backgroundColor: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "4px" }}
            >
              {chunkIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
            
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "var(--text)" }}>
              <input 
                type="checkbox" 
                checked={onlyUnknown} 
                onChange={(e) => setOnlyUnknown(e.target.checked)} 
              />
              {t("planning.onlyUnknowns")}
            </label>
            
            <input 
              placeholder={t("planning.searchText")} 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              style={{ 
                padding: "4px 8px", 
                fontSize: "14px", 
                width: "200px",
                backgroundColor: "var(--panel)", 
                color: "var(--text)", 
                border: "1px solid var(--border)", 
                borderRadius: "4px" 
              }}
            />

            {/* Stats for current chunk */}
            {/* No chunk stats in flat segment model */}
          </div>

          {/* Main content grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", minHeight: 0 }}>
            {/* Left: Preview */}
            <div style={{ border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "8px 12px", backgroundColor: "var(--panelAccent)", borderBottom: "1px solid var(--border)", fontSize: "14px", fontWeight: 500 }}>
                {t("planning.preview")}
              </div>
              
              <div style={{ flex: 1, padding: "12px", overflow: "auto" }}>
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

            {/* Right: Table */}
            <div style={{ border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "8px 12px", backgroundColor: "var(--panelAccent)", borderBottom: "1px solid var(--border)", fontSize: "14px", fontWeight: 500 }}>
                {t("planning.chunksVoiceAssignment")}
              </div>
              
              <div ref={gridRef} style={{ flex: 1, overflow: "auto" }}>
                <table style={{ width: "100%", fontSize: "12px" }}>
                  <thead style={{ position: "sticky", top: 0, backgroundColor: "var(--panel)", borderBottom: "1px solid var(--border)" }}>
                    <tr style={{ textAlign: "left" }}>
                      <th style={{ padding: "8px 6px" }}></th>
                      <th style={{ padding: "8px 6px" }}>id</th>
                      <th style={{ padding: "8px 6px" }}>{t("planning.table.delim")}</th>
                      <th style={{ padding: "8px 6px" }}>{t("planning.table.start")}</th>
                      <th style={{ padding: "8px 6px" }}>{t("planning.table.end")}</th>
                      <th style={{ padding: "8px 6px" }}>{t("planning.table.len")}</th>
                      <th style={{ padding: "8px 6px", minWidth: "150px" }}>{t("planning.table.character")}</th>
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
                          backgroundColor: i === selIndex ? "var(--accent)" : "transparent",
                          color: i === selIndex ? "white" : "var(--text)"
                        }}
                      >
                        <td style={{ padding: "4px 6px", color: "var(--muted)" }}>{i === selIndex ? "▶" : ""}</td>
                        <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>{r.segmentId}</td>
                        <td style={{ padding: "4px 6px", textAlign: "center" }}>{r.delimiter}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right" }}>{r.start}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right" }}>{r.end}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right" }}>{r.length}</td>
                        <td style={{ padding: "4px 6px" }}>
                          <select 
                            value={r.voice}
                            onChange={(e) => updateRowVoice(i, e.target.value)}
                            style={{ 
                              width: "100%", 
                              padding: "2px 4px", 
                              fontSize: "11px",
                              backgroundColor: "var(--panel)", 
                              color: "var(--text)", 
                              border: "1px solid var(--border)", 
                              borderRadius: "3px" 
                            }}
                          >
                            <option value="">Select...</option>
                            {availableCharacters.map((char, index) => (
                              <option key={`${char}-${index}`} value={char}>{char}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
