/**
 * Segment List Component
 * 
 * Displays list of audio segments with playback controls and status indicators.
 */

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
      opacity: disabled ? 0.6 : 1,
      border: '1px solid #333',
      borderRadius: '6px',
      overflow: 'hidden',
      background: '#1a1a1a',
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
      
      {segments.length > 0 && (
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse',
          fontSize: '13px',
        }}>
          <thead style={{ 
            position: 'sticky', 
            top: 0, 
            background: '#0a0a0a',
            zIndex: 1,
            borderBottom: '1px solid #333',
          }}>
            <tr>
              <th style={{ 
                textAlign: 'left', 
                padding: '10px 12px', 
                fontWeight: 500, 
                color: '#999',
                width: '50px',
              }}>
                #
              </th>
              <th style={{ 
                textAlign: 'left', 
                padding: '10px 12px', 
                fontWeight: 500, 
                color: '#999',
                width: '120px',
              }}>
                Character
              </th>
              <th style={{ 
                textAlign: 'center', 
                padding: '10px 12px', 
                fontWeight: 500, 
                color: '#999',
                width: '50px',
              }}>
                🚩
              </th>
              <th style={{ 
                textAlign: 'left', 
                padding: '10px 12px', 
                fontWeight: 500, 
                color: '#999',
              }}>
                Text Preview
              </th>
              <th style={{ 
                textAlign: 'right', 
                padding: '10px 12px', 
                fontWeight: 500, 
                color: '#999',
                width: '70px',
              }}>
                Duration
              </th>
            </tr>
          </thead>
          <tbody>
            {segments.map((segment) => {
              const isSelected = selectedSegmentId === segment.id;
              const statusColor = getStatusColor(segment.status);
              const statusLabel = getStatusLabel(segment.status);

              return (
                <>
                  <tr
                    key={segment.id}
                    onClick={() => !disabled && onSegmentSelect(segment.id)}
                    style={{
                      background: isSelected ? 'rgba(74, 158, 255, 0.15)' : 'transparent',
                      borderBottom: '1px solid #333',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected && !disabled) {
                        e.currentTarget.style.background = 'rgba(74, 158, 255, 0.05)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    {/* # Column */}
                    <td style={{ 
                      padding: '10px 12px', 
                      color: '#e0e0e0',
                      fontWeight: 500,
                      fontFamily: 'monospace',
                    }}>
                      {segment.position + 1}
                    </td>

                    {/* Character Column */}
                    <td style={{ padding: '10px 12px' }}>
                      {segment.character_name ? (
                        <span style={{
                          fontSize: '12px',
                          color: '#4a9eff',
                          fontWeight: 500,
                          padding: '3px 8px',
                          background: 'rgba(74, 158, 255, 0.15)',
                          borderRadius: '3px',
                          border: '1px solid rgba(74, 158, 255, 0.3)',
                          display: 'inline-block',
                        }}>
                          {segment.character_name}
                        </span>
                      ) : (
                        <span style={{ color: '#666', fontSize: '12px' }}>—</span>
                      )}
                    </td>

                    {/* Revision Flag Column */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log('[SegmentList] Revision flag clicked for segment:', segment.id, 'current value:', segment.needs_revision);
                          if (!disabled) onToggleRevision(segment.id);
                        }}
                        disabled={disabled}
                        title={segment.needs_revision ? 'Remove revision flag' : 'Flag for revision'}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '4px',
                          background: segment.needs_revision ? 'rgba(251, 191, 36, 0.2)' : 'transparent',
                          border: segment.needs_revision ? '1px solid #fbbf24' : '1px solid #444',
                          color: segment.needs_revision ? '#fbbf24' : '#666',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          transition: 'all 0.2s',
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
                    </td>

                    {/* Text Preview Column */}
                    <td style={{ 
                      padding: '10px 12px',
                      maxWidth: 0, // Enable ellipsis in table cell
                    }}>
                      <div style={{
                        fontSize: '12px',
                        color: '#999',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {segment.text || 'No text available'}
                      </div>
                    </td>

                    {/* Duration Column */}
                    <td style={{ 
                      padding: '10px 12px', 
                      color: '#999',
                      textAlign: 'right',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                    }}>
                      {formatDuration(segment.duration)}
                    </td>
                  </tr>

                  {/* Mini Waveform Row (when selected) */}
                  {isSelected && segment.audio_blob_path && (
                    <tr key={`${segment.id}-waveform`}>
                      <td colSpan={5} style={{
                        padding: '12px',
                        background: 'rgba(74, 158, 255, 0.05)',
                        borderBottom: '1px solid #333',
                      }}>
                        <MiniWaveform
                          audioData={null}
                          currentPosition={0}
                        />
                      </td>
                    </tr>
                  )}

                  {/* Revision Notes Row (if needs revision) */}
                  {segment.status === 'needs_revision' && segment.revision_notes && (
                    <tr key={`${segment.id}-notes`}>
                      <td colSpan={5} style={{
                        padding: '10px 12px',
                        background: 'rgba(251, 191, 36, 0.1)',
                        borderBottom: '1px solid rgba(251, 191, 36, 0.3)',
                        fontSize: '11px',
                        color: '#fbbf24',
                      }}>
                        <strong>Revision Notes:</strong> {segment.revision_notes}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
