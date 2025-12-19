import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AudioPlayer } from '../components/AudioPlayer';
import { AnalogVUMeter } from '../components/audio/VUMeter';
import { PresetSelector } from '../components/audio/PresetSelector';
import { EffectChainEditor } from '../components/audio/EffectChainEditor';
import { SegmentList } from '../components/audio/SegmentList';
import { useAudioProduction } from '../hooks/useAudioProduction';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { AUDIO_PRESETS } from '../config/audioPresets';
import { getChapters } from '../api/chapters';
import type { AudioProcessingChain } from '../types/audio-production';

export const Route = createFileRoute('/projects/$projectId/audio-production')({
  component: AudioProductionPage,
});

function AudioProductionPage() {
  const { projectId } = Route.useParams();
  
  // Chapter selection state
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  
  // Query to fetch chapters
  const { data: chaptersData } = useQuery({
    queryKey: ['chapters', projectId],
    queryFn: () => getChapters(projectId),
  });
  
  // Convert chapter ID (UUID) to chapter order for API
  const chapterOrder = chaptersData?.items.find(ch => ch.id === selectedChapterId)?.order.toString() || '1';
  
  const {
    segments,
    loading,
    error,
    loadChapterData,
    toggleRevisionMark,
  } = useAudioProduction(projectId, chapterOrder);

  const { audioData, processingChain, updateProcessingChain: updatePlayerChain } = useAudioPlayer();
  
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null);
  const [playingSegmentId, setPlayingSegmentId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('clean_polished');
  const [showSfxDialog, setShowSfxDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Auto-select first chapter when chapters load
  useEffect(() => {
    if (chaptersData?.items && chaptersData.items.length > 0 && !selectedChapterId) {
      // Use setTimeout to avoid setState in effect warning
      setTimeout(() => {
        setSelectedChapterId(chaptersData.items[0].id);
      }, 0);
    }
  }, [chaptersData, selectedChapterId]);

  // Load chapter data when selection changes
  useEffect(() => {
    if (projectId && chapterOrder && selectedChapterId) {
      loadChapterData();
    }
  }, [projectId, chapterOrder, selectedChapterId, loadChapterData]);

  // Initialize processing chain with default preset
  useEffect(() => {
    // Default to Clean Polished preset
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const defaultPreset = AUDIO_PRESETS.find((p: any) => p.id === 'clean_polished');
    if (defaultPreset) {
      updatePlayerChain(defaultPreset.processingChain);
    }
  }, [updatePlayerChain]);

  // Handle preset selection
  const handlePresetSelect = useCallback((presetId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const preset = AUDIO_PRESETS.find((p: any) => p.id === presetId);
    if (preset) {
      setSelectedPresetId(presetId);
      setCustomMode(false);
      updatePlayerChain(preset.processingChain);
      // Auto-save - no need for isDirty
    }
  }, [updatePlayerChain]);

  // Handle custom mode toggle
  const handleCustomModeToggle = useCallback(() => {
    setCustomMode(!customMode);
    if (!customMode) {
      // Entering custom mode - keep current chain
      setSelectedPresetId('');
    }
  }, [customMode]);

  // Handle processing chain changes
  const handleProcessingChainChange = useCallback((chain: AudioProcessingChain) => {
    updatePlayerChain(chain);
    // Auto-save - no need for isDirty
    
    // Check if it still matches selected preset
    if (!customMode && selectedPresetId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const selectedPreset = AUDIO_PRESETS.find((p: any) => p.id === selectedPresetId);
      if (selectedPreset && JSON.stringify(selectedPreset.processingChain) !== JSON.stringify(chain)) {
        setCustomMode(true);
        setSelectedPresetId('');
      }
    }
  }, [updatePlayerChain, customMode, selectedPresetId]);

  // Handle segment selection
  const handleSegmentSelect = useCallback((segmentId: number) => {
    setSelectedSegmentId(segmentId);
    // Load audio for selected segment
    // TODO: Implement audio loading from cache or backend
  }, []);

  // Handle segment playback
  const handlePlaySegment = useCallback((segmentId: number) => {
    if (playingSegmentId === segmentId) {
      setIsPlaying(!isPlaying);
    } else {
      setPlayingSegmentId(segmentId);
      setSelectedSegmentId(segmentId);
      setIsPlaying(true);
      // TODO: Load and play audio
    }
  }, [playingSegmentId, isPlaying]);

  // Handle player controls
  const handlePlayPrevious = useCallback(() => {
    if (!selectedSegmentId || segments.length === 0) return;
    const currentIdx = segments.findIndex(s => parseInt(s.segment_id) === selectedSegmentId);
    if (currentIdx > 0) {
      const prevSegmentId = parseInt(segments[currentIdx - 1].segment_id);
      handlePlaySegment(prevSegmentId);
    }
  }, [selectedSegmentId, segments, handlePlaySegment]);

  const handlePlayNext = useCallback(() => {
    if (!selectedSegmentId || segments.length === 0) return;
    const currentIdx = segments.findIndex(s => parseInt(s.segment_id) === selectedSegmentId);
    if (currentIdx < segments.length - 1) {
      const nextSegmentId = parseInt(segments[currentIdx + 1].segment_id);
      handlePlaySegment(nextSegmentId);
    }
  }, [selectedSegmentId, segments, handlePlaySegment]);

  const handlePlayAll = useCallback(() => {
    if (segments.length === 0) return;
    const firstSegmentId = parseInt(segments[0].segment_id);
    handlePlaySegment(firstSegmentId);
    // TODO: Implement continuous playback
  }, [segments, handlePlaySegment]);

  const handleStop = useCallback(() => {
    setIsPlaying(false);
    setPlayingSegmentId(null);
    // TODO: Reset audio position
  }, []);

  // Handle mark for revision
  const handleMarkRevision = useCallback(async (notes: string) => {
    if (selectedSegmentId === null) return;
    
    try {
      await toggleRevisionMark(selectedSegmentId.toString(), true, notes);
    } catch {
      // Error is handled by hook
    }
  }, [selectedSegmentId, toggleRevisionMark]);

  // Handle toggle revision flag
  const handleToggleRevision = useCallback(async (segmentId: number) => {
    try {
      const segment = segments.find(s => s.segment_id === segmentId.toString());
      await toggleRevisionMark(segmentId.toString(), !segment?.needs_revision);
    } catch {
      // Error is handled by hook
    }
  }, [segments, toggleRevisionMark]);

  // Handle SFX file upload
  const handleSfxUpload = useCallback(() => {
    setShowSfxDialog(true);
  }, []);

  // Handle SFX file selection
  const handleSfxFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // TODO: Validate file (audio format, duration)
    // TODO: Upload to blob storage
    // TODO: Create SFX segment
    console.log('Selected SFX file:', file.name);
    
    // For now, just close dialog
    setShowSfxDialog(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Show loading indicator - AFTER all hooks are defined
  if (loading && segments.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: '#999',
      }}>
        <div style={{ fontSize: '14px', marginBottom: '8px' }}>
          Loading chapter data...
        </div>
        <div style={{ 
          width: '200px', 
          height: '4px', 
          background: '#333',
          borderRadius: '2px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: '50%',
            height: '100%',
            background: '#4a9eff',
            animation: 'slide 1.5s infinite',
          }} />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: '#999',
      }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: '#ef4444',
        padding: '24px',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
          Failed to Load Audio Production
        </div>
        <div style={{ fontSize: '14px', color: '#999', textAlign: 'center', maxWidth: '500px' }}>
          {error}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '24px',
            padding: '8px 16px',
            background: '#4a9eff',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reload Page
        </button>
      </div>
    );
  }

  return (
    <div className="p-6" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'auto',
    }}>
      {/* Header */}
      <div
        className="rounded-lg border shadow mb-6 p-6"
        style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)', margin: 0, marginBottom: '0.25rem' }}>
              Audio Production
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)', margin: 0 }}>
              Generate high-quality audio from orchestrated segments - work chapter by chapter. Only chapters with plans are available.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                Chapter:
              </label>
              <select
                value={selectedChapterId || ''}
                onChange={(e) => setSelectedChapterId(e.target.value)}
                style={{
                  padding: '6px 12px',
                  background: 'var(--input)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  minWidth: '200px',
                }}
              >
                {chaptersData?.items.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.order}. {chapter.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Insert Sound Effect Button */}
            <button
              onClick={handleSfxUpload}
              disabled={!selectedChapterId}
              style={{
                padding: '6px 16px',
                background: '#4a9eff',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: selectedChapterId ? 'pointer' : 'not-allowed',
                opacity: selectedChapterId ? 1 : 0.5,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (selectedChapterId) {
                  e.currentTarget.style.background = '#5aa9ff';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#4a9eff';
              }}
            >
              🎵 Insert Sound Effect
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 400px',
        gap: '16px',
        padding: '0 24px 16px 24px',
        overflow: 'hidden',
      }}>
        {/* Left Panel - Segments & Player */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          overflow: 'hidden',
        }}>
          {/* Audio Player */}
          <div style={{
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '16px',
          }}>
            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
                Audio Preview
              </h2>
              
              {/* Player Controls */}
              <div style={{ display: 'flex', gap: '8px', marginLeft: '16px' }}>
                <button
                  onClick={handlePlayPrevious}
                  disabled={!selectedSegmentId || segments.length === 0}
                  title="Previous segment"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '4px',
                    background: '#333',
                    border: 'none',
                    color: '#fff',
                    cursor: selectedSegmentId && segments.length > 0 ? 'pointer' : 'not-allowed',
                    opacity: selectedSegmentId && segments.length > 0 ? 1 : 0.5,
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ⏮
                </button>
                <button
                  onClick={() => selectedSegmentId && handlePlaySegment(selectedSegmentId)}
                  disabled={!selectedSegmentId}
                  title={isPlaying ? 'Pause' : 'Play'}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '4px',
                    background: isPlaying ? '#4a9eff' : '#333',
                    border: 'none',
                    color: '#fff',
                    cursor: selectedSegmentId ? 'pointer' : 'not-allowed',
                    opacity: selectedSegmentId ? 1 : 0.5,
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <button
                  onClick={handlePlayNext}
                  disabled={!selectedSegmentId || segments.length === 0}
                  title="Next segment"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '4px',
                    background: '#333',
                    border: 'none',
                    color: '#fff',
                    cursor: selectedSegmentId && segments.length > 0 ? 'pointer' : 'not-allowed',
                    opacity: selectedSegmentId && segments.length > 0 ? 1 : 0.5,
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ⏭
                </button>
                <div style={{ width: '1px', background: '#444', margin: '0 4px' }} />
                <button
                  onClick={handlePlayAll}
                  disabled={segments.length === 0}
                  title="Play all"
                  style={{
                    padding: '0 12px',
                    height: '32px',
                    borderRadius: '4px',
                    background: '#333',
                    border: 'none',
                    color: '#fff',
                    cursor: segments.length > 0 ? 'pointer' : 'not-allowed',
                    opacity: segments.length > 0 ? 1 : 0.5,
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  Play All
                </button>
                <button
                  onClick={handleStop}
                  disabled={!isPlaying}
                  title="Stop"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '4px',
                    background: '#333',
                    border: 'none',
                    color: '#fff',
                    cursor: isPlaying ? 'pointer' : 'not-allowed',
                    opacity: isPlaying ? 1 : 0.5,
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ⏹
                </button>
              </div>

              <div style={{ fontSize: '11px', color: '#999' }}>
                Select a segment to preview with processing applied
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <AnalogVUMeter isPlaying={isPlaying} />
                <AnalogVUMeter isPlaying={isPlaying} />
              </div>
            </div>
            
            {!audioData && (
              <div style={{
                padding: '32px',
                textAlign: 'center',
                color: '#666',
                fontSize: '13px',
                border: '1px dashed #333',
                borderRadius: '4px',
              }}>
                No audio loaded
                <div style={{ marginTop: '8px', fontSize: '11px' }}>
                  Click the play button on a segment to load and preview its audio
                </div>
              </div>
            )}
            
            {audioData && (
              <AudioPlayer
                audioData={audioData}
                processingChain={processingChain}
                autoPlay={false}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />
            )}
          </div>

          {/* Segment List */}
          <div style={{
            flex: 1,
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '16px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ 
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
                Segments ({segments.length})
              </h2>
              
              {selectedSegmentId !== null && (
                <button
                  onClick={() => {
                    const notes = prompt('Enter revision notes:');
                    if (notes) handleMarkRevision(notes);
                  }}
                  style={{
                    padding: '4px 8px',
                    background: 'transparent',
                    color: '#fbbf24',
                    border: '1px solid #fbbf24',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Mark for Revision
                </button>
              )}
            </div>
            
            <div style={{ flex: 1, overflow: 'auto' }}>
              <SegmentList
                segments={segments.map((seg, idx) => ({
                  id: parseInt(seg.segment_id) || idx,
                  position: seg.display_order,
                  text: seg.text || null,
                  character_name: seg.character_name || null,
                  audio_blob_path: seg.raw_audio_url || null,
                  status: seg.has_audio ? 'cached' : (seg.needs_revision ? 'needs_revision' : 'pending'),
                  duration: seg.duration || null,
                  revision_notes: null,
                  needs_revision: seg.needs_revision,
                }))}
                selectedSegmentId={selectedSegmentId}
                onSegmentSelect={handleSegmentSelect}
                onPlaySegment={handlePlaySegment}
                onToggleRevision={handleToggleRevision}
                playingSegmentId={playingSegmentId}
              />
            </div>
          </div>
        </div>

        {/* Right Panel - Processing Controls */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          overflow: 'auto',
        }}>
          {/* Preset Selector */}
          <div style={{
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '16px',
          }}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>
              Audio Presets
            </h2>
            <PresetSelector
              selectedPresetId={selectedPresetId}
              customSettingsEnabled={customMode}
              onPresetSelect={handlePresetSelect}
              onCustomToggle={handleCustomModeToggle}
              currentProcessingChain={processingChain}
            />
          </div>

          {/* Effect Chain Editor */}
          <div style={{
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '16px',
          }}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>
              Processing Chain
            </h2>
            {processingChain && (
              <EffectChainEditor
                processingChain={processingChain}
                onChange={handleProcessingChainChange}
                disabled={!customMode && selectedPresetId !== ''}
              />
            )}
          </div>
        </div>
      </div>

      {/* SFX Upload Dialog */}
      {showSfxDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowSfxDialog(false)}
        >
          <div
            style={{
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600, color: '#e0e0e0' }}>
              Insert Sound Effect
            </h3>
            
            <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: '#999' }}>
              Select an audio file to insert as a sound effect. Supported formats: WAV, MP3, OGG
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleSfxFileSelect}
              style={{ display: 'none' }}
            />

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSfxDialog(false)}
                style={{
                  padding: '8px 16px',
                  background: '#333',
                  color: '#e0e0e0',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '8px 16px',
                  background: '#4a9eff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Choose File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
