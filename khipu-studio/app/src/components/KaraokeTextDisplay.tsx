import React, { useState, useEffect, useRef } from 'react';

export interface KaraokeTextDisplayProps {
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

interface WordTiming {
  word: string;
  startTime: number;
  endTime: number;
  index: number;
}

/**
 * KaraokeTextDisplay - Shows full text with karaoke-style highlighting
 * 
 * Features:
 * - Displays full segment text in a readable format
 * - Word-by-word highlighting synchronized with audio playback
 * - Smooth scrolling to keep current word visible
 * - Character/voice information display
 */
export const KaraokeTextDisplay: React.FC<KaraokeTextDisplayProps> = ({
  text,
  isPlaying,
  currentTime = 0,
  totalDuration = 0,
  voiceName,
  segmentId
}) => {
  const [wordTimings, setWordTimings] = useState<WordTiming[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentWordRef = useRef<HTMLSpanElement>(null);

  // Calculate word timings based on text length and total duration
  useEffect(() => {
    if (!text || totalDuration <= 0) {
      setWordTimings([]);
      return;
    }

    const words = text.split(/\s+/).filter(word => word.length > 0);
    const totalChars = text.length;
    let charOffset = 0;
    
    const timings: WordTiming[] = words.map((word, index) => {
      const wordStartChar = text.indexOf(word, charOffset);
      const wordEndChar = wordStartChar + word.length;
      
      // Estimate timing based on character position and reading speed
      const startRatio = wordStartChar / totalChars;
      const endRatio = wordEndChar / totalChars;
      
      // Add some padding between words and natural speech rhythm
      const startTime = startRatio * totalDuration;
      const endTime = Math.min(endRatio * totalDuration, totalDuration);
      
      charOffset = wordEndChar;
      
      return {
        word,
        startTime,
        endTime,
        index
      };
    });

    setWordTimings(timings);
  }, [text, totalDuration]);

  // Update current word based on playback time
  useEffect(() => {
    if (!isPlaying || wordTimings.length === 0) {
      setCurrentWordIndex(-1);
      return;
    }

    const wordIndex = wordTimings.findIndex(
      timing => currentTime >= timing.startTime && currentTime < timing.endTime
    );
    
    if (wordIndex !== currentWordIndex) {
      setCurrentWordIndex(wordIndex);
    }
  }, [currentTime, isPlaying, wordTimings, currentWordIndex]);

  // Auto-scroll to keep current word visible
  useEffect(() => {
    if (currentWordIndex >= 0 && currentWordRef.current && containerRef.current) {
      const container = containerRef.current;
      const currentWord = currentWordRef.current;
      
      const containerRect = container.getBoundingClientRect();
      const wordRect = currentWord.getBoundingClientRect();
      
      // Check if word is outside visible area
      if (wordRect.top < containerRect.top || wordRect.bottom > containerRect.bottom) {
        currentWord.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      }
    }
  }, [currentWordIndex]);

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

      {/* Text content with karaoke highlighting */}
      <div 
        ref={containerRef}
        style={{
          padding: "16px",
          fontSize: "16px",
          lineHeight: "1.8",
          color: "var(--text)",
          maxHeight: "200px",
          overflowY: "auto",
          backgroundColor: "var(--background)"
        }}
      >
        {wordTimings.length > 0 ? (
          wordTimings.map((timing, index) => (
            <span key={index}>
              <span
                ref={currentWordIndex === index ? currentWordRef : undefined}
                style={{
                  backgroundColor: currentWordIndex === index ? "var(--accent)" : "transparent",
                  color: currentWordIndex === index ? "white" : "var(--text)",
                  padding: currentWordIndex === index ? "2px 4px" : "0",
                  borderRadius: currentWordIndex === index ? "3px" : "0",
                  transition: "all 0.2s ease",
                  fontWeight: currentWordIndex === index ? "500" : "normal"
                }}
              >
                {timing.word}
              </span>
              {index < wordTimings.length - 1 && " "}
            </span>
          ))
        ) : (
          // Fallback if timing calculation fails
          <div style={{ color: "var(--textSecondary)" }}>
            {text}
          </div>
        )}
      </div>

      {/* Progress indicator when playing */}
      {isPlaying && totalDuration > 0 && (
        <div style={{
          padding: "8px 12px",
          backgroundColor: "var(--input)",
          borderTop: "1px solid var(--border)",
          fontSize: "11px",
          color: "var(--textSecondary)",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          <span>Progress:</span>
          <div style={{ 
            flex: 1, 
            height: "4px", 
            backgroundColor: "var(--border)", 
            borderRadius: "2px",
            position: "relative"
          }}>
            <div style={{
              height: "100%",
              backgroundColor: "var(--accent)",
              borderRadius: "2px",
              width: `${Math.min((currentTime / totalDuration) * 100, 100)}%`,
              transition: "width 0.1s ease"
            }}></div>
          </div>
          <span>{Math.round(currentTime)}s / {Math.round(totalDuration)}s</span>
        </div>
      )}
    </div>
  );
};

export default KaraokeTextDisplay;