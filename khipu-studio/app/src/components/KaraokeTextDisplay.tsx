import React from 'react';
import { useTranslation } from 'react-i18next';

export interface TextDisplayProps {
  /** Full text of the segment being played */
  text: string;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Current playback time in seconds */
  currentTime?: number;
  /** Total duration of the audio in seconds */
  totalDuration?: number;
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
  currentTime = 0,
  totalDuration = 0,
  voiceName,
  segmentId
}) => {
  const { t } = useTranslation('common');

  // Calculate progress percentage
  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

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
        {t('audioProduction.selectSegmentToViewText')}
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
        <span>📝 {t('audioProduction.segmentText')}</span>
        {voiceName && (
          <>
            <span style={{ color: "var(--textSecondary)" }}>•</span>
            <span style={{ color: "var(--textSecondary)" }}>{t('audioProduction.voice')}: {voiceName}</span>
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

      {/* Progress bar */}
      {totalDuration > 0 && (
        <div style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border)",
          backgroundColor: "var(--panelAccent)"
        }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "8px",
            fontSize: "11px",
            color: "var(--textSecondary)"
          }}>
            <span>{t('audioProduction.progress')}</span>
            <span>
              {Math.round(currentTime)}s / {Math.round(totalDuration)}s
            </span>
          </div>
          <div style={{
            width: "100%",
            height: "4px",
            backgroundColor: "var(--border)",
            borderRadius: "2px",
            overflow: "hidden"
          }}>
            <div
              style={{
                height: "100%",
                backgroundColor: "var(--accent)",
                borderRadius: "2px",
                width: `${progressPercent}%`,
                transition: "width 0.2s ease-out"
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Keep the old name as an alias for backward compatibility
export const KaraokeTextDisplay = TextDisplay;

export default TextDisplay;