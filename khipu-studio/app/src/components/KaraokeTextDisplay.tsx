import React from 'react';

export interface TextDisplayProps {
  /** Full text of the segment being played */
  text: string;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Character name/voice being used */
  voiceName?: string;
  /** Segment ID for debugging */
  segmentId?: string;
}

/**
 * TextDisplay - Shows full segment text in a clean, readable format
 * 
 * Features:
 * - Displays full segment text in a readable format
 * - Shows playing status and voice information
 * - Clean, professional layout
 */
export const TextDisplay: React.FC<TextDisplayProps> = ({
  text,
  isPlaying,
  voiceName,
  segmentId
}) => {
  // If no text, show placeholder
  if (!text?.trim()) {
    return (
      <div style={{
        padding: "16px",
        backgroundColor: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        marginBottom: "8px",
        textAlign: "center",
        color: "var(--textSecondary)",
        fontSize: "14px"
      }}>
        Select a segment to view its text
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: "var(--panel)",
      border: "1px solid var(--border)",
      borderRadius: "6px",
      marginBottom: "8px",
      overflow: "hidden"
    }}>
      {/* Header with voice/segment info */}
      <div style={{
        padding: "8px 12px",
        backgroundColor: "var(--panelAccent)",
        borderBottom: "1px solid var(--border)",
        fontSize: "12px",
        color: "var(--text)",
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }}>
        <span>📝 Segment Text</span>
        {voiceName && (
          <>
            <span style={{ color: "var(--textSecondary)" }}>•</span>
            <span style={{ color: "var(--textSecondary)" }}>Voice: {voiceName}</span>
          </>
        )}
        {segmentId && (
          <>
            <span style={{ color: "var(--textSecondary)" }}>•</span>
            <span style={{ color: "var(--textSecondary)" }}>ID: {segmentId}</span>
          </>
        )}
        {isPlaying && (
          <span style={{ 
            marginLeft: "auto", 
            color: "var(--success)",
            fontSize: "11px",
            display: "flex",
            alignItems: "center",
            gap: "4px"
          }}>
            🔊 Playing
          </span>
        )}
      </div>

      {/* Text content - clean and readable */}
      <div style={{
        padding: "16px",
        fontSize: "16px",
        lineHeight: "1.8",
        color: "var(--text)",
        maxHeight: "200px",
        overflowY: "auto",
        backgroundColor: "var(--background)"
      }}>
        {text}
      </div>
    </div>
  );
};

// Keep the old name as an alias for backward compatibility
export const KaraokeTextDisplay = TextDisplay;

export default TextDisplay;