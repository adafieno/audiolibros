/**
 * Segment List Component
 * 
 * Displays list of audio segments with playback controls and status indicators.
 */

import { useState } from 'react';
import { MiniWaveform } from '../Waveform';
import type { Segment } from '../../types/audio-production';

interface SegmentListProps {
  segments: Segment[];
  selectedSegmentId?: string | null;
  onSegmentSelect: (segmentId: string) => void;
  onPlaySegment: (segmentId: string) => void;
  onToggleRevision: (segmentId: string) => void;
  playingSegmentId?: string | null;
  disabled?: boolean;
}

export function SegmentList({
  segments,
  selectedSegmentId,
  onSegmentSelect,
  onPlaySegment,
  onToggleRevision,
  playingSegmentId,
  disabled = false,
}: SegmentListProps) {
  const [expandedSegmentId, setExpandedSegmentId] = useState<string | null>(null);

  const formatDuration = (seconds: number | null | undefined): string => {
    if (!seconds) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string | null | undefined): string => {
    switch (status) {
      case 'processed':
        return '#4ade80';
      case 'needs_revision':
        return '#fbbf24';
      case 'cached':
        return '#4a9eff';
      case 'pending':
        return '#999';
      default:
        return '#666';
    }
  };

  const getStatusLabel = (status: string | null | undefined): string => {
    switch (status) {
      case 'processed':
        return 'Processed';
      case 'needs_revision':
        return 'Needs Revision';
      case 'cached':
        return 'Cached';
      case 'pending':
        return 'Pending';
      default:
        return 'Unknown';
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '8px',
      opacity: disabled ? 0.6 : 1,
    }}>
      {segments.length === 0 && (
        <div style={{
          padding: '24px',
          textAlign: 'center',
          color: '#666',
          fontSize: '14px',
        }}>
          No segments available
        </div>
      )}
      
      {segments.map((segment) => {
        const isSelected = selectedSegmentId === segment.id;
        const isPlaying = playingSegmentId === segment.id;
        const isExpanded = expandedSegmentId === segment.id;
        const statusColor = getStatusColor(segment.status);
        const statusLabel = getStatusLabel(segment.status);

        return (
          <div
            key={segment.id}
            style={{
              background: isSelected ? 'rgba(74, 158, 255, 0.15)' : '#1a1a1a',
              border: `1px solid ${isSelected ? '#4a9eff' : '#333'}`,
              borderRadius: '4px',
              transition: 'all 0.2s',
              cursor: disabled ? 'not-allowed' : 'pointer',
              overflow: 'hidden',
            }}
          >
            {/* Segment Header */}
            <div
              onClick={() => !disabled && onSegmentSelect(segment.id)}
              style={{
                padding: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              {/* Play Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled) onPlaySegment(segment.id);
                }}
                disabled={disabled}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: isPlaying ? '#4a9eff' : '#333',
                  border: 'none',
                  color: '#fff',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  if (!disabled && !isPlaying) {
                    e.currentTarget.style.background = '#555';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isPlaying) {
                    e.currentTarget.style.background = '#333';
                  }
                }}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>

              {/* Segment Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ 
                    fontSize: '14px', 
                    fontWeight: 600, 
                    color: '#e0e0e0',
                    whiteSpace: 'nowrap',
                  }}>
                    Segment {segment.position + 1}
                  </span>
                  
                  {/* Character Name */}
                  {segment.character_name && (
                    <span style={{
                      fontSize: '12px',
                      color: '#4a9eff',
                      fontWeight: 500,
                      padding: '2px 8px',
                      background: 'rgba(74, 158, 255, 0.15)',
                      borderRadius: '3px',
                      border: '1px solid rgba(74, 158, 255, 0.3)',
                    }}>
                      {segment.character_name}
                    </span>
                  )}
                  
                  {/* Status Badge */}
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '10px',
                    fontWeight: 600,
                    background: `${statusColor}22`,
                    color: statusColor,
                    border: `1px solid ${statusColor}44`,
                  }}>
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: statusColor,
                    }} />
                    {statusLabel}
                  </span>

                  {/* Revision Flag Icon */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log('[SegmentList] Revision flag clicked for segment:', segment.id, 'current value:', segment.needs_revision);
                      if (!disabled) onToggleRevision(segment.id);
                    }}
                    disabled={disabled}
                    title={segment.needs_revision ? 'Remove revision flag' : 'Flag for revision'}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '3px',
                      background: segment.needs_revision ? 'rgba(251, 191, 36, 0.2)' : 'transparent',
                      border: segment.needs_revision ? '1px solid #fbbf24' : '1px solid #444',
                      color: segment.needs_revision ? '#fbbf24' : '#666',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      transition: 'all 0.2s',
                      flexShrink: 0,
                      padding: 0,
                    }}
                    onMouseEnter={(e) => {
                      if (!disabled) {
                        e.currentTarget.style.borderColor = segment.needs_revision ? '#fbbf24' : '#888';
                        e.currentTarget.style.color = segment.needs_revision ? '#fbbf24' : '#aaa';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = segment.needs_revision ? '#fbbf24' : '#444';
                      e.currentTarget.style.color = segment.needs_revision ? '#fbbf24' : '#666';
                    }}
                  >
                    🚩
                  </button>

                  {/* Duration */}
                  <span style={{ 
                    fontSize: '11px', 
                    color: '#999',
                    marginLeft: 'auto',
                  }}>
                    {formatDuration(segment.duration)}
                  </span>
                </div>

                {/* Segment Text - Prominent and Expandable */}
                <div 
                  style={{
                    fontSize: '13px',
                    color: '#d0d0d0',
                    lineHeight: '1.6',
                    maxHeight: isExpanded ? 'none' : '3.2em',
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: isExpanded ? 'unset' : 2,
                    WebkitBoxOrient: 'vertical',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {segment.text || 'No text available'}
                </div>
                
                {/* Show more/less button for long text */}
                {segment.text && segment.text.length > 100 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedSegmentId(isExpanded ? null : segment.id);
                    }}
                    style={{
                      marginTop: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#4a9eff',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: 0,
                      fontWeight: 600,
                    }}
                  >
                    {isExpanded ? '▲ Show less' : '▼ Show more'}
                  </button>
                )}
              </div>
            </div>

            {/* Mini Waveform (when selected) */}
            {isSelected && segment.audio_blob_path && (
              <div style={{
                padding: '0 12px 12px 12px',
                borderTop: '1px solid #333',
              }}>
                <MiniWaveform
                  audioData={null} // Will be loaded by parent component
                  currentPosition={0}
                />
              </div>
            )}

            {/* Revision Notes (if needs revision) */}
            {segment.status === 'needs_revision' && segment.revision_notes && (
              <div style={{
                padding: '8px 12px',
                background: 'rgba(251, 191, 36, 0.1)',
                borderTop: '1px solid rgba(251, 191, 36, 0.3)',
                fontSize: '11px',
                color: '#fbbf24',
              }}>
                <strong>Revision Notes:</strong> {segment.revision_notes}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
