import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AudioPlayer } from '../components/AudioPlayer';
import { Waveform } from '../components/Waveform';
import { AnalogVUMeter } from '../components/audio/VUMeter';
import { PresetSelector } from '../components/audio/PresetSelector';
import { Select } from '../components/Select';
import { EffectChainEditor } from '../components/audio/EffectChainEditor';
import { SegmentList } from '../components/audio/SegmentList';
import { useAudioProduction } from '../hooks/useAudioProduction';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { AUDIO_PRESETS } from '../config/audioPresets';
import { getChapters } from '../api/chapters';
import { voicesApi } from '../lib/api/voices';
import { charactersApi, type Character } from '../lib/api/characters';
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

  // Query to fetch characters for voice assignments
  const { data: characters } = useQuery({
    queryKey: ['characters', projectId],
    queryFn: () => charactersApi.getCharacters(projectId),
  });

  // Query to fetch voice inventory
  const { data: voiceInventory } = useQuery({
    queryKey: ['voices'],
    queryFn: () => voicesApi.getAvailableVoices(),
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

  const { audioData, processingChain, loadAudio, updateProcessingChain: updatePlayerChain } = useAudioPlayer();
  
  console.log('[AudioProduction] Render - audioData:', !!audioData, 'processingChain:', processingChain);
  
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('raw_unprocessed');
  const [showSfxDialog, setShowSfxDialog] = useState(false);
  const [audioCache] = useState(new Map<string, string>());
  const [audioElements] = useState(new Map<string, HTMLAudioElement>());
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(false);
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
      updatePlayerChain(defaultPreset.processingChain);
    }
  }, [updatePlayerChain]);

  // Apply processing chain when preset changes (from segment selection)
  useEffect(() => {
    console.log('[AudioProduction] Processing chain sync effect triggered - selectedPresetId:', selectedPresetId, 'customMode:', customMode, 'selectedSegmentId:', selectedSegmentId);
    
    if (selectedPresetId && !customMode) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const preset = AUDIO_PRESETS.find((p: any) => p.id === selectedPresetId);
      if (preset) {
        console.log('[AudioProduction] ✓ Auto-applying preset from segment:', selectedPresetId);
        console.log('[AudioProduction] ✓ Processing chain:', JSON.stringify(preset.processingChain, null, 2));
        updatePlayerChain(preset.processingChain);
      } else {
        console.warn('[AudioProduction] ✗ Preset not found:', selectedPresetId);
      }
    } else if (customMode) {
      // When in custom mode, load the segment's custom processing chain
      const segment = segments.find(s => s.segment_id === selectedSegmentId);
      if (segment?.processing_chain) {
        console.log('[AudioProduction] ✓ Auto-applying custom chain from segment');
        console.log('[AudioProduction] ✓ Custom chain:', JSON.stringify(segment.processing_chain, null, 2));
        updatePlayerChain(segment.processing_chain);
      } else {
        console.log('[AudioProduction] ℹ No custom chain found for segment, using default');
      }
    } else {
      console.log('[AudioProduction] ℹ No preset selected or waiting for segment selection');
    }
  }, [selectedPresetId, customMode, selectedSegmentId, segments, updatePlayerChain]);

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
      updatePlayerChain(preset.processingChain);
      
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
  }, [updatePlayerChain, selectedSegmentId, updateProcessingChain]);

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
    
    updatePlayerChain(chain);
    // Auto-save - no need for isDirty
    
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
  }, [updatePlayerChain, customMode, selectedPresetId]);

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
    
    // Stop any currently playing audio
    audioElements.forEach((audio, id) => {
      if (id !== segmentId) {
        audio.pause();
        audio.currentTime = 0;
      }
    });
    setIsPlaying(false);
    setPlayingSegmentId(null);
    
    // Load audio for selected segment if not already loaded
    if (!segment) {
      console.error('Segment not found:', segmentId);
      return;
    }
    
    // If segment has cached audio, load it for waveform display
    if (segment.has_audio && segment.raw_audio_url) {
      setIsLoadingWaveform(true);
      try {
        console.log('Loading audio from URL for waveform:', segment.raw_audio_url);
        const response = await fetch(segment.raw_audio_url);
        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.status}`);
        }
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        
        // Store as Blob instead to avoid ArrayBuffer detachment issues
        // When components need it, they can get their own copy
        loadAudio(arrayBuffer);
        console.log('Audio loaded for waveform display');
      } catch (error) {
        console.error('Failed to load audio for waveform:', error);
        loadAudio(null);
      } finally {
        setIsLoadingWaveform(false);
      }
    } else {
      // No audio yet - clear waveform
      loadAudio(null);
    }
    
    // Check if we already have an audio element for playback
    if (audioElements.has(segmentId)) {
      console.log('Audio element already exists for segment:', segmentId);
      return;
    }
    
    if (!segment.text || !segment.voice) {
      console.warn('Segment missing text or voice:', segmentId);
      return;
    }

    // Look up the character to get their voice assignment
    const character = characters?.find((c: Character) => c.name === segment.voice);
    if (!character?.voiceAssignment?.voiceId) {
      console.error('No voice assignment found for character:', segment.voice);
      return;
    }

    const voiceId = character.voiceAssignment.voiceId;
    
    // Find the voice object
    const voice = voiceInventory?.voices?.find(v => v.id === voiceId);
    if (!voice) {
      console.error('Voice not found in inventory:', voiceId);
      return;
    }
    
    try {
      // Check if audio URL is already cached
      let audioUrl = audioCache.get(segmentId);
      
      if (!audioUrl && !segment.has_audio) {
        // Generate audio via voice audition API (same as Voice Casting)
        console.log('Generating audio for segment:', segmentId, 'voice:', voiceId, 'character:', segment.voice);
        const blob = await voicesApi.auditionVoice(projectId, voiceId, segment.text);
        audioUrl = URL.createObjectURL(blob);
        audioCache.set(segmentId, audioUrl);
        console.log('Audio generated and cached for segment:', segmentId);
        
        // Also load for waveform
        const arrayBuffer = await blob.arrayBuffer();
        loadAudio(arrayBuffer);
      } else if (segment.raw_audio_url && !audioUrl) {
        // Use cached audio from server
        audioUrl = segment.raw_audio_url;
      }
      
      if (!audioUrl) {
        console.warn('No audio URL available for segment:', segmentId);
        return;
      }
      
      // Create audio element for playback
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setIsPlaying(false);
        setPlayingSegmentId(null);
      };
      audio.onerror = (e) => {
        console.error('Failed to play audio for segment:', segmentId, e);
        setIsPlaying(false);
        setPlayingSegmentId(null);
      };
      audioElements.set(segmentId, audio);
      console.log('Audio element created for segment:', segmentId);
    } catch (error) {
      console.error('Error loading audio:', error);
    }
  }, [segments, audioCache, audioElements, projectId, characters, voiceInventory, loadAudio]);

  // Auto-select first segment when segments load
  useEffect(() => {
    if (segments.length > 0 && !selectedSegmentId) {
      handleSegmentSelect(segments[0].segment_id);
    }
  }, [segments, selectedSegmentId, handleSegmentSelect]);

  // Handle segment playback
  const handlePlaySegment = useCallback(async (segmentId: string) => {
    console.log('handlePlaySegment called for:', segmentId);
    
    // If already playing this segment, pause it
    if (playingSegmentId === segmentId && isPlaying) {
      const audio = audioElements.get(segmentId);
      if (audio) {
        audio.pause();
        setIsPlaying(false);
      }
      return;
    }
    
    // Stop any currently playing audio
    audioElements.forEach((audio, id) => {
      if (id !== segmentId) {
        audio.pause();
        audio.currentTime = 0;
      }
    });
    
    // Ensure segment is selected and loaded
    if (selectedSegmentId !== segmentId || !audioElements.has(segmentId)) {
      console.log('Loading audio for segment:', segmentId);
      await handleSegmentSelect(segmentId);
    }
    
    // Wait a tick to ensure audio element is created
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Play the segment
    const audio = audioElements.get(segmentId);
    if (audio) {
      console.log('Playing audio for segment:', segmentId);
      setPlayingSegmentId(segmentId);
      setIsPlaying(true);
      audio.play().catch(error => {
        console.error('Error playing audio:', error);
        setIsPlaying(false);
        setPlayingSegmentId(null);
      });
    } else {
      console.error('No audio element found for segment:', segmentId);
      const segment = segments.find(s => s.segment_id === segmentId);
      if (segment && !segment.raw_audio_url) {
        console.error('Segment has no audio URL - audio may not be generated yet');
      }
    }
  }, [playingSegmentId, isPlaying, selectedSegmentId, audioElements, handleSegmentSelect, segments]);

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
                {/* Single-line consolidated controls - Always visible */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid #333', marginBottom: '12px' }}>
                  
                  {/* Audio Player with processing - this plays the PROCESSED audio */}
                  {audioData && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                      <AudioPlayer
                        audioData={audioData}
                        processingChain={processingChain}
                        autoPlay={false}
                        showControls={true}
                        hideTransportControls={false}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onEnded={() => setIsPlaying(false)}
                      />
                    </div>
                  )}
                </div>

                {/* Waveform or loading state */}
                {audioData ? (
                  <div style={{ width: '100%' }}>
                    <Waveform
                      audioData={audioData}
                      width={Math.floor((window.innerWidth - 800))}
                      height={80}
                      waveColor="#4a5568"
                      progressColor="#4a9eff"
                      currentPosition={0}
                    />
                  </div>
                ) : isLoadingWaveform ? (
                  <div style={{
                    padding: '24px',
                    textAlign: 'center',
                    color: '#4a9eff',
                    fontSize: '13px',
                    border: '1px dashed #333',
                    borderRadius: '4px',
                  }}>
                    Loading audio waveform...
                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
                      Please wait
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: '24px',
                    textAlign: 'center',
                    color: '#666',
                    fontSize: '13px',
                    border: '1px dashed #333',
                    borderRadius: '4px',
                  }}>
                    No audio generated yet
                    <div style={{ marginTop: '8px', fontSize: '11px' }}>
                      Audio will appear here once generated
                    </div>
                  </div>
                )}
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
                onPlaySegment={handlePlaySegment}
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
              currentProcessingChain={processingChain}
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
