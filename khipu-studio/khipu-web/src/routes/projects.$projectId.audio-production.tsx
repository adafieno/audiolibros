import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useCallback } from 'react';
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

  // Handle mark for revision
  const handleMarkRevision = useCallback(async (notes: string) => {
    if (selectedSegmentId === null) return;
    
    try {
      await toggleRevisionMark(selectedSegmentId.toString(), true, notes);
    } catch {
      // Error is handled by hook
    }
  }, [selectedSegmentId, toggleRevisionMark]);

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
                  audio_blob_path: seg.raw_audio_url || null,
                  status: seg.has_audio ? 'cached' : (seg.needs_revision ? 'needs_revision' : 'pending'),
                  duration: seg.duration || null,
                  revision_notes: null,
                }))}
                selectedSegmentId={selectedSegmentId}
                onSegmentSelect={handleSegmentSelect}
                onPlaySegment={handlePlaySegment}
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
    </div>
  );
}
