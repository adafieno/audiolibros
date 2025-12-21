import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnalogVUMeter } from '../components/audio/VUMeter';
import { PresetSelector } from '../components/audio/PresetSelector';
import { Select } from '../components/Select';
import { EffectChainEditor } from '../components/audio/EffectChainEditor';
import { SegmentList } from '../components/audio/SegmentList';
import { useAudioProduction } from '../hooks/useAudioProduction';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { AUDIO_PRESETS } from '../config/audioPresets';
import { getChapters } from '../api/chapters';
import { charactersApi } from '../lib/api/characters';
import type { AudioProcessingChain } from '../types/audio-production';

export const Route = createFileRoute('/projects/$projectId/audio-production')({
  component: AudioProductionPage,
});

function AudioProductionPage() {
  console.log('[AudioProduction] ===== PAGE COMPONENT RENDERING =====');
  const { projectId } = Route.useParams();
  
  // Chapter selection state
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  
  // Query to fetch chapters
  const { data: chaptersData } = useQuery({
    queryKey: ['chapters', projectId],
    queryFn: () => getChapters(projectId),
  });
  
  // Query to fetch characters for voice lookup
  const { data: characters } = useQuery({
    queryKey: ['characters', projectId],
    queryFn: () => charactersApi.getCharacters(projectId),
  });
  
  // Convert chapter ID (UUID) to chapter order for API
  const chapterOrder = chaptersData?.items.find(ch => ch.id === selectedChapterId)?.order.toString() || '1';
  
  const {
    segments,
    loading,
    error,
    loadChapterData,
    toggleRevisionMark,
    updateProcessingChain,
  } = useAudioProduction(projectId, chapterOrder, selectedChapterId);

  // Processing chain state
  const [processingChain, setProcessingChain] = useState<AudioProcessingChain | null>(null);
  
  // Audio playback using unified hook
  const {
    playSegment,
    stopPlayback,
    seek,
    isPlaying,
    isLoadingAudio,
    currentTime,
    duration,
    playingSegmentId,
    clearCache,
  } = useAudioPlayback({ projectId, processingChain });
  
  console.log('[AudioProduction] Render - processingChain:', processingChain);
  
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('raw_unprocessed');
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
    // Default to Raw & Unprocessed preset
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const defaultPreset = AUDIO_PRESETS.find((p: any) => p.id === 'raw_unprocessed');
    if (defaultPreset) {
      setTimeout(() => {
        setProcessingChain(defaultPreset.processingChain);
      }, 0);
    }
  }, []);

  // Apply processing chain when preset changes (from segment selection)
  useEffect(() => {
    console.log('[AudioProduction] Processing chain sync effect triggered - selectedPresetId:', selectedPresetId, 'customMode:', customMode, 'selectedSegmentId:', selectedSegmentId);
    
    if (selectedPresetId && !customMode) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const preset = AUDIO_PRESETS.find((p: any) => p.id === selectedPresetId);
      if (preset) {
        console.log('[AudioProduction] ✓ Auto-applying preset from segment:', selectedPresetId);
        console.log('[AudioProduction] ✓ Processing chain:', JSON.stringify(preset.processingChain, null, 2));
        setTimeout(() => {
          setProcessingChain(preset.processingChain);
        }, 0);
      } else {
        console.warn('[AudioProduction] ✗ Preset not found:', selectedPresetId);
      }
    } else if (customMode) {
      // When in custom mode, load the segment's custom processing chain
      const segment = segments.find(s => s.segment_id === selectedSegmentId);
      if (segment?.processing_chain) {
        console.log('[AudioProduction] ✓ Auto-applying custom chain from segment');
        console.log('[AudioProduction] ✓ Custom chain:', JSON.stringify(segment.processing_chain, null, 2));
        setTimeout(() => {
          setProcessingChain(segment.processing_chain || null);
        }, 0);
      } else {
        console.log('[AudioProduction] ℹ No custom chain found for segment, using default');
      }
    } else {
      console.log('[AudioProduction] ℹ No preset selected or waiting for segment selection');
    }
  }, [selectedPresetId, customMode, selectedSegmentId, segments]);

  // Handle preset selection
  const handlePresetSelect = useCallback(async (presetId: string) => {
    console.log('[AudioProduction] ====== PRESET SELECTION ======');
    console.log('[AudioProduction] User clicked preset:', presetId);
    console.log('[AudioProduction] Current segment:', selectedSegmentId);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const preset = AUDIO_PRESETS.find((p: any) => p.id === presetId);
    if (preset && selectedSegmentId) {
      console.log('[AudioProduction] ✓ Preset found:', preset.name);
      console.log('[AudioProduction] ✓ Processing chain:', JSON.stringify(preset.processingChain, null, 2));
      
      setSelectedPresetId(presetId);
      setCustomMode(false);
      setProcessingChain(preset.processingChain);
      
      // Clear cached audio so it re-processes with new preset
      clearCache(selectedSegmentId);
      
      console.log('[AudioProduction] ✓ State updated - preset will be applied via useEffect');
      
      // Save to backend
      try {
        await updateProcessingChain(selectedSegmentId, preset.processingChain, presetId);
        console.log('[AudioProduction] ✓ Preset saved to backend');
      } catch (error) {
        console.error('[AudioProduction] ✗ Failed to save preset:', error);
      }
    } else {
      if (!preset) console.error('[AudioProduction] ✗ Preset not found:', presetId);
      if (!selectedSegmentId) console.error('[AudioProduction] ✗ No segment selected');
    }
    console.log('[AudioProduction] ==============================');
  }, [selectedSegmentId, updateProcessingChain, clearCache]);

  // Handle custom mode toggle
  const handleCustomModeToggle = useCallback(() => {
    setCustomMode(prev => {
      const newCustomMode = !prev;
      if (newCustomMode) {
        // Entering custom mode - keep current chain
        setSelectedPresetId('');
      }
      return newCustomMode;
    });
  }, []);

  // Handle apply preset to all segments
  const handleApplyToAll = useCallback(async () => {
    if (!selectedPresetId || customMode) return;
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const preset = AUDIO_PRESETS.find((p: any) => p.id === selectedPresetId);
    if (!preset) return;
    
    const count = segments.filter(seg => seg.type !== 'sfx').length;
    if (!confirm(`Apply "${preset.name}" preset to all ${count} audio segments?`)) {
      return;
    }
    
    try {
      // TODO: Implement backend API to apply preset to all segments
      // For now, just show a message
      alert(`Would apply "${preset.name}" to ${count} segments. Backend API not yet implemented.`);
    } catch (error) {
      console.error('Failed to apply preset to all:', error);
      alert('Failed to apply preset to all segments');
    }
  }, [selectedPresetId, customMode, segments]);

  // Handle processing chain changes
  const handleProcessingChainChange = useCallback((chain: AudioProcessingChain) => {
    console.log('[AudioProduction] ====== CUSTOM CHAIN CHANGE ======');
    console.log('[AudioProduction] User modified processing chain');
    console.log('[AudioProduction] New chain:', JSON.stringify(chain, null, 2));
    
    setProcessingChain(chain);
    
    // Clear cache for selected segment so it re-processes with new chain
    if (selectedSegmentId) {
      clearCache(selectedSegmentId);
    }
    
    // Check if it still matches selected preset
    if (!customMode && selectedPresetId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const selectedPreset = AUDIO_PRESETS.find((p: any) => p.id === selectedPresetId);
      if (selectedPreset && JSON.stringify(selectedPreset.processingChain) !== JSON.stringify(chain)) {
        console.log('[AudioProduction] ✓ Chain diverged from preset - switching to custom mode');
        setCustomMode(true);
        setSelectedPresetId('');
      }
    }
    
    console.log('[AudioProduction] ✓ Custom chain applied to player');
    console.log('[AudioProduction] ==================================');
  }, [customMode, selectedPresetId, selectedSegmentId, clearCache]);

  // Handle segment selection
  const handleSegmentSelect = useCallback(async (segmentId: string) => {
    setSelectedSegmentId(segmentId);
    
    // Load preset from segment metadata
    const segment = segments.find(s => s.segment_id === segmentId);
    if (segment) {
      if (segment.preset_id) {
        setSelectedPresetId(segment.preset_id);
        setCustomMode(false);
      } else if (segment.processing_chain) {
        setSelectedPresetId('');
        setCustomMode(true);
      } else {
        setSelectedPresetId('raw_unprocessed');
        setCustomMode(false);
      }
    }
    
    // Don't auto-load audio - wait for user to click play
  }, [segments]);

  // Handle audio playback - use unified hook
  const handlePlaySegment = useCallback(async () => {
    if (!selectedSegmentId) return;
    
    // Stop if already playing this segment
    if (isPlaying && playingSegmentId === selectedSegmentId) {
      stopPlayback();
      return;
    }
    
    const segment = segments.find(s => s.segment_id === selectedSegmentId);
    if (!segment) {
      alert('Segment not found.');
      return;
    }
    
    // Get voice from character's assignment (same as orchestration)
    const character = characters?.find(c => c.name === segment.character_name);
    const voiceId = character?.voiceAssignment?.voiceId || 'es-MX-DaliaNeural';
    
    console.log('[AudioProduction] Playing segment:', segment.segment_id, 'character:', segment.character_name, 'voice:', voiceId);
    
    await playSegment({
      segment_id: segment.segment_id,
      id: segment.segment_id,
      has_audio: segment.has_audio,
      raw_audio_url: segment.raw_audio_url || undefined,
      text: segment.text || '',
      voice: voiceId,
    }, voiceId);
  }, [selectedSegmentId, isPlaying, playingSegmentId, segments, characters, playSegment, stopPlayback]);

  // Auto-select first segment when segments load
  useEffect(() => {
    if (segments.length > 0 && !selectedSegmentId) {
      setTimeout(() => {
        handleSegmentSelect(segments[0].segment_id);
      }, 0);
    }
  }, [segments, selectedSegmentId, handleSegmentSelect]);

  // Auto-select first segment when segments load
  useEffect(() => {
    if (segments.length > 0 && !selectedSegmentId) {
      const firstSegmentId = segments[0].segment_id;
      console.log('Auto-selecting first segment:', firstSegmentId);
      // Use setTimeout to avoid cascading renders
      setTimeout(() => {
        setSelectedSegmentId(firstSegmentId);
        // Load audio for first segment (don't await to avoid blocking render)
        handleSegmentSelect(firstSegmentId).catch(err => {
          console.error('Error auto-loading first segment:', err);
        });
      }, 0);
    }
  }, [segments, selectedSegmentId, handleSegmentSelect]);

  // Handle player controls
  // Handle toggle revision flag
  const handleToggleRevision = useCallback(async (segmentId: string) => {
    console.log('[AUDIO PRODUCTION] Toggle revision called for segment:', segmentId);
    try {
      const segment = segments.find(s => s.segment_id === segmentId);
      console.log('[AUDIO PRODUCTION] Current segment:', segment);
      console.log('[AUDIO PRODUCTION] Current needs_revision:', segment?.needs_revision);
      console.log('[AUDIO PRODUCTION] New needs_revision:', !segment?.needs_revision);
      
      await toggleRevisionMark(segmentId, !segment?.needs_revision);
      console.log('[AUDIO PRODUCTION] Toggle successful, refetching...');
      
      // Refetch to ensure we have the latest data
      await loadChapterData();
      console.log('[AUDIO PRODUCTION] Refetch complete');
    } catch (error) {
      console.error('[AUDIO PRODUCTION] Toggle revision failed:', error);
      // Error is handled by hook
    }
  }, [segments, toggleRevisionMark, loadChapterData]);

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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 100px)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        className="rounded-lg border shadow p-6"
        style={{ 
          background: 'var(--panel)', 
          borderColor: 'var(--border)',
          margin: '24px 24px 0 24px',
          flexShrink: 0,
        }}
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
              <Select
                size="compact"
                value={selectedChapterId || ''}
                onChange={(e) => setSelectedChapterId(e.target.value)}
                style={{ minWidth: '200px' }}
              >
                {chaptersData?.items.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.order}. {chapter.title}
                  </option>
                ))}
              </Select>
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
              Insert Sound Effect
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 320px 280px',
        gap: '16px',
        padding: '16px 24px 24px 24px',
        overflow: 'hidden',
        minHeight: 0,
      }}>
        {/* Left Panel - Segments & Player */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          overflow: 'hidden',
          minHeight: 0,
        }}>
          {/* Audio Player Controls */}
          <div style={{
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '16px',
            display: 'flex',
            gap: '16px',
            flexShrink: 0,
          }}>
            {/* Left side: Segment Text - 50% width */}
            <div style={{ flex: '1', minWidth: 0 }}>
              {selectedSegmentId && (() => {
                const segment = segments.find(s => s.segment_id === selectedSegmentId.toString());
                return segment ? (
                  <div style={{
                    padding: '12px',
                    background: '#0f0f0f',
                    border: '1px solid #333',
                    borderRadius: '6px',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}>
                    {segment.character_name && (
                      <div style={{
                        fontSize: '11px',
                        color: '#4a9eff',
                        fontWeight: 600,
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}>
                        {segment.character_name}
                      </div>
                    )}
                    <div style={{
                      fontSize: '16px',
                      color: '#e0e0e0',
                      lineHeight: '1.6',
                      fontWeight: 500,
                      flex: 1,
                      overflow: 'auto',
                    }}>
                      {segment.text}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: '32px',
                    textAlign: 'center',
                    color: '#666',
                    fontSize: '13px',
                    border: '1px dashed #333',
                    borderRadius: '6px',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    No segment selected
                  </div>
                );
              })()}
            </div>

            {/* Right side: VU Meters - 50% width */}
            <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'center' }}>
              {/* VU Meters */}
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                <AnalogVUMeter isPlaying={isPlaying} channel="L" />
                <AnalogVUMeter isPlaying={isPlaying} channel="R" />
              </div>
            </div>
          </div>
            
          {/* Waveform & Progress */}
          <div style={{
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '16px',
            flexShrink: 0,
          }}>
            {!selectedSegmentId && (
              <div style={{
                padding: '32px',
                textAlign: 'center',
                color: '#666',
                fontSize: '13px',
                border: '1px dashed #333',
                borderRadius: '4px',
              }}>
                No segment selected
                <div style={{ marginTop: '8px', fontSize: '11px' }}>
                  Select a segment to view details and waveform
                </div>
              </div>
            )}
            
            {selectedSegmentId && (
              <>
                {/* Single-line Transport Controls */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  paddingBottom: '12px', 
                  borderBottom: '1px solid #333', 
                  marginBottom: '12px',
                }}>
                  {/* Previous */}
                  <button
                    onClick={async () => {
                      const currentIndex = segments.findIndex(s => s.segment_id === selectedSegmentId);
                      if (currentIndex > 0) {
                        const prevSegment = segments[currentIndex - 1];
                        setSelectedSegmentId(prevSegment.segment_id);
                        stopPlayback();
                        
                        // Play the previous segment directly
                        const character = characters?.find(c => c.name === prevSegment.character_name);
                        const voiceId = character?.voiceAssignment?.voiceId || 'es-MX-DaliaNeural';
                        
                        await playSegment({
                          segment_id: prevSegment.segment_id,
                          id: prevSegment.segment_id,
                          has_audio: prevSegment.has_audio,
                          raw_audio_url: prevSegment.raw_audio_url || undefined,
                          text: prevSegment.text || '',
                          voice: voiceId,
                        }, voiceId);
                      }
                    }}
                    disabled={segments.findIndex(s => s.segment_id === selectedSegmentId) === 0}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '4px',
                      background: '#333',
                      border: '1px solid #444',
                      color: '#fff',
                      fontSize: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: segments.findIndex(s => s.segment_id === selectedSegmentId) === 0 ? 0.3 : 1,
                      flexShrink: 0,
                    }}
                    title="Previous segment"
                  >
                    ⏮
                  </button>

                  {/* Play/Pause */}
                  <button
                    onClick={handlePlaySegment}
                    disabled={!selectedSegmentId || isLoadingAudio}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: isPlaying && playingSegmentId === selectedSegmentId ? '#4a9eff' : '#333',
                      border: 'none',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      opacity: isLoadingAudio ? 0.5 : 1,
                    }}
                  >
                    {isLoadingAudio ? '⏳' : (isPlaying && playingSegmentId === selectedSegmentId ? '⏸' : '▶')}
                  </button>

                  {/* Stop */}
                  <button
                    onClick={() => stopPlayback()}
                    disabled={!playingSegmentId}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '4px',
                      background: '#333',
                      border: '1px solid #444',
                      color: '#fff',
                      fontSize: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: playingSegmentId ? 1 : 0.3,
                      flexShrink: 0,
                    }}
                    title="Stop"
                  >
                    ⏹
                  </button>

                  {/* Next */}
                  <button
                    onClick={async () => {
                      const currentIndex = segments.findIndex(s => s.segment_id === selectedSegmentId);
                      if (currentIndex >= 0 && currentIndex < segments.length - 1) {
                        const nextSegment = segments[currentIndex + 1];
                        setSelectedSegmentId(nextSegment.segment_id);
                        stopPlayback();
                        
                        // Play the next segment directly
                        const character = characters?.find(c => c.name === nextSegment.character_name);
                        const voiceId = character?.voiceAssignment?.voiceId || 'es-MX-DaliaNeural';
                        
                        await playSegment({
                          segment_id: nextSegment.segment_id,
                          id: nextSegment.segment_id,
                          has_audio: nextSegment.has_audio,
                          raw_audio_url: nextSegment.raw_audio_url || undefined,
                          text: nextSegment.text || '',
                          voice: voiceId,
                        }, voiceId);
                      }
                    }}
                    disabled={segments.findIndex(s => s.segment_id === selectedSegmentId) === segments.length - 1}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '4px',
                      background: '#333',
                      border: '1px solid #444',
                      color: '#fff',
                      fontSize: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: segments.findIndex(s => s.segment_id === selectedSegmentId) === segments.length - 1 ? 0.3 : 1,
                      flexShrink: 0,
                    }}
                    title="Next segment"
                  >
                    ⏭
                  </button>

                  {/* Divider */}
                  <div style={{ width: '1px', height: '24px', background: '#444', margin: '0 4px', flexShrink: 0 }} />

                  {/* Time display */}
                  <span style={{
                    fontSize: '11px',
                    color: '#999',
                    fontFamily: 'monospace',
                    minWidth: '80px',
                    flexShrink: 0,
                  }}>
                    {(() => {
                      const formatTime = (seconds: number) => {
                        const mins = Math.floor(seconds / 60);
                        const secs = Math.floor(seconds % 60);
                        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                      };
                      return playingSegmentId ? `${formatTime(currentTime)} / ${formatTime(duration)}` : '--:-- / --:--';
                    })()}
                  </span>

                  {/* Progress slider */}
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    step="0.1"
                    value={currentTime}
                    onChange={(e) => seek(parseFloat(e.target.value))}
                    disabled={!playingSegmentId}
                    style={{
                      flex: 1,
                      minWidth: '100px',
                      height: '4px',
                      borderRadius: '2px',
                      background: playingSegmentId ? `linear-gradient(to right, #4a9eff ${(currentTime / duration) * 100}%, #333 ${(currentTime / duration) * 100}%)` : '#222',
                      outline: 'none',
                      cursor: playingSegmentId ? 'pointer' : 'not-allowed',
                      opacity: playingSegmentId ? 1 : 0.3,
                    }}
                  />
                </div>

                {/* Waveform Placeholder - Temporarily Disabled for Performance */}
                <div style={{
                  height: '80px',
                  padding: '24px',
                  textAlign: 'center',
                  color: '#666',
                  fontSize: '13px',
                  border: '1px dashed #333',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {playingSegmentId ? (
                    <>
                      <span style={{ marginRight: '8px' }}>📊</span>
                      Waveform visualization (temporarily disabled)
                    </>
                  ) : (
                    <>
                      <span style={{ marginRight: '8px' }}>🎵</span>
                      No audio loaded
                    </>
                  )}
                </div>
              </>
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
            minHeight: 0,
          }}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>
              Segments ({segments.length})
            </h2>
            
            <div style={{ flex: 1, overflow: 'auto' }}>
              <SegmentList
                segments={segments.map((seg) => {
                  const status: 'pending' | 'cached' | 'processed' | 'needs_revision' | null = 
                    seg.has_audio ? 'cached' : (seg.needs_revision ? 'needs_revision' : 'pending');
                  const mapped = {
                    id: seg.segment_id,  // Use UUID directly
                    position: seg.display_order,
                    text: seg.text || null,
                    character_name: seg.character_name || null,
                    audio_blob_path: seg.raw_audio_url || null,
                    status,
                    duration: seg.duration || null,
                    revision_notes: null,
                    needs_revision: seg.needs_revision,
                  };
                  console.log('[AUDIO PRODUCTION] Mapping segment:', seg.segment_id, 'needs_revision:', seg.needs_revision, '→', mapped.needs_revision);
                  return mapped;
                })}
                selectedSegmentId={selectedSegmentId}
                onSegmentSelect={handleSegmentSelect}

                onToggleRevision={handleToggleRevision}
                playingSegmentId={playingSegmentId}
              />
            </div>
          </div>
        </div>

        {/* Middle Panel - Audio Presets (Full Height) */}
        <div style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '8px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0,
        }}>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>
            Audio Presets
          </h2>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <PresetSelector
              selectedPresetId={selectedPresetId}
              customSettingsEnabled={customMode}
              onPresetSelect={handlePresetSelect}
              onCustomToggle={handleCustomModeToggle}
              onApplyToAll={handleApplyToAll}
              currentProcessingChain={processingChain || undefined}
            />
          </div>
        </div>

        {/* Right Panel - Processing Chain (Full Height) */}
        <div style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '8px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0,
        }}>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>
            Processing Chain
          </h2>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {processingChain && (
              <EffectChainEditor
                processingChain={processingChain}
                onChange={handleProcessingChainChange}
                disabled={!customMode}
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
