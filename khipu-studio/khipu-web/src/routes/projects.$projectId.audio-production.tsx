import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StandardVUMeter } from '../components/audio/StandardVUMeter';
import { AudioWaveform } from '../components/audio/AudioWaveform';
import { VUMeterCalibrator } from '../components/audio/VUMeterCalibrator';
import { useAudioLevelAnalysis } from '../hooks/useAudioLevelAnalysis';
import { PresetSelector } from '../components/audio/PresetSelector';
import { Select } from '../components/Select';
import { EffectChainEditor } from '../components/audio/EffectChainEditor';
import { SegmentList } from '../components/audio/SegmentList';
import { useAudioProduction } from '../hooks/useAudioProduction';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { AUDIO_PRESETS } from '../config/audioPresets';
import { getChapters } from '../api/chapters';
import { charactersApi } from '../lib/api/characters';
import { audioProductionApi } from '../api/audio-production';
import type { AudioProcessingChain } from '../types/audio-production';

export const Route = createFileRoute('/projects/$projectId/audio-production')({
  component: AudioProductionPage,
});

/**
 * VU Meters Section with Real Audio Analysis
 * 
 * Displays standard VU meters (ANSI C16.5-1942 compliant) with
 * true ballistics and real-time RMS audio level analysis.
 */
function VUMetersSection({ 
  audioElement, 
  isPlaying,
  analyser,
  splitter,
  audioContext,
}: { 
  audioElement: HTMLAudioElement | null; 
  isPlaying: boolean;
  analyser?: AnalyserNode | null;
  splitter?: ChannelSplitterNode | null;
  audioContext?: AudioContext | null;
}) {
  const { leftDbfs, rightDbfs } = useAudioLevelAnalysis(audioElement, isPlaying, analyser, splitter, audioContext);

  return (
    <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
      <StandardVUMeter 
        valueDbfs={leftDbfs}
        calibrationDbfsAt0Vu={-18}
        size={180}
        label="L"
        showTicks={true}
      />
      <StandardVUMeter 
        valueDbfs={rightDbfs}
        calibrationDbfsAt0Vu={-18}
        size={180}
        label="R"
        showTicks={true}
      />
    </div>
  );
}

function AudioProductionPage() {

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
    generateSegmentAudio,
    toggleRevisionMark,
    updateProcessingChain,
    uploadSfx,
    deleteSfxSegment,
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
    currentAudioElement,
    currentAnalyser,
    currentSplitter,
    audioContext,
  } = useAudioPlayback({ projectId, processingChain });
  
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('raw_unprocessed');
  const [showSfxDialog, setShowSfxDialog] = useState(false);
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetDescription, setPresetDescription] = useState('');
  const [presetIcon, setPresetIcon] = useState('');
  const [customPresets, setCustomPresets] = useState<Array<{
    id: string;
    name: string;
    description?: string;
    processing_chain: AudioProcessingChain;
  }>>([]);
  const [presetFilter, setPresetFilter] = useState<'all' | 'builtin' | 'custom'>('all');
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

  // Load custom presets
  useEffect(() => {
    const fetchCustomPresets = async () => {
      try {
        const presets = await audioProductionApi.getCustomPresets(projectId);
        setCustomPresets(presets as Array<{
          id: string;
          name: string;
          description?: string;
          processing_chain: AudioProcessingChain;
        }>);
      } catch (error) {
        console.error('Failed to load custom presets:', error);
      }
    };
    fetchCustomPresets();
  }, [projectId]);

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

    
    if (selectedPresetId && !customMode) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const preset = AUDIO_PRESETS.find((p: any) => p.id === selectedPresetId);
      if (preset) {


        setTimeout(() => {
          setProcessingChain(preset.processingChain);
        }, 0);
      } else {

      }
    } else if (customMode) {
      // When in custom mode, load the segment's custom processing chain
      const segment = segments.find(s => s.segment_id === selectedSegmentId);
      if (segment?.processing_chain) {


        setTimeout(() => {
          setProcessingChain(segment.processing_chain || null);
        }, 0);
      } else {

      }
    } else {

    }
  }, [selectedPresetId, customMode, selectedSegmentId, segments]);

  // Handle preset selection
  const handlePresetSelect = useCallback(async (presetId: string) => {



    
    // Check built-in presets first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let preset = AUDIO_PRESETS.find((p: any) => p.id === presetId);
    
    // Check custom presets if not found in built-in
    if (!preset) {
      const customPreset = customPresets.find((p) => p.id === presetId);
      if (customPreset) {
        preset = {
          id: customPreset.id,
          name: customPreset.name,
          description: customPreset.description || '',
          processingChain: customPreset.processing_chain,
        };
      }
    }
    
    if (preset && selectedSegmentId) {


      
      setSelectedPresetId(presetId);
      setCustomMode(false);
      setProcessingChain(preset.processingChain);
      
      // Clear cached audio so it re-processes with new preset
      clearCache(selectedSegmentId);
      

      
      // Save to backend
      try {
        await updateProcessingChain(selectedSegmentId, preset.processingChain, presetId);

      } catch (error) {

      }
    } else {
      if (!preset) console.error('[AudioProduction] ✗ Preset not found:', presetId);
      if (!selectedSegmentId) console.error('[AudioProduction] ✗ No segment selected');
    }

  }, [selectedSegmentId, updateProcessingChain, clearCache, customPresets]);

  // Handle custom mode toggle
  const handleCustomModeToggle = useCallback(() => {
    const newCustomMode = !customMode;
    
    if (newCustomMode) {
      // Entering custom mode - preserve current processing chain from selected preset
      if (selectedPresetId && processingChain) {
        // Processing chain is already loaded from the preset, keep it
        setSelectedPresetId('');
      }
      setCustomMode(true);
    } else {
      // Exiting custom mode - reset to Raw & Unprocessed preset
      const rawPreset = AUDIO_PRESETS.find(p => p.id === 'raw_unprocessed');
      if (rawPreset) {
        setSelectedPresetId('raw_unprocessed');
        setProcessingChain(rawPreset.processingChain);
        setCustomMode(false);
      }
    }
  }, [customMode, selectedPresetId, processingChain]);

  // Handle apply preset to all segments
  const handleApplyToAll = useCallback(async () => {
    if (!processingChain) return;
    
    const audioSegments = segments.filter(seg => seg.type !== 'sfx');
    const count = audioSegments.length;
    
    // Determine the name to display in confirmation
    let chainName = 'custom processing chain';
    if (!customMode && selectedPresetId) {
      const preset = AUDIO_PRESETS.find(p => p.id === selectedPresetId);
      if (preset) {
        chainName = `"${preset.name}" preset`;
      }
    }
    
    if (!confirm(`Apply ${chainName} to all ${count} audio segments?`)) {
      return;
    }
    
    try {
      // Apply processing chain to all segments
      // Pass preset ID only if not in custom mode
      const presetIdToSave = customMode ? undefined : selectedPresetId;
      
      const updatePromises = audioSegments.map(segment => 
        updateProcessingChain(segment.segment_id, processingChain, presetIdToSave)
      );
      
      await Promise.all(updatePromises);
      
      alert(`Successfully applied ${chainName} to ${count} segments.`);
      
      // Clear audio cache to force reload with new processing
      clearCache();
    } catch (error) {
      console.error('Failed to apply processing chain to all:', error);
      alert('Failed to apply processing chain to all segments');
    }
  }, [processingChain, customMode, selectedPresetId, segments, updateProcessingChain, clearCache]);

  // Handle save custom preset
  const handleSaveAsPreset = useCallback(async (name: string, description: string, icon: string) => {
    if (!processingChain) return;
    
    try {
      await audioProductionApi.saveCustomPreset(
        projectId,
        name,
        description,
        processingChain,
        icon || undefined
      );
      
      // Reload custom presets
      const presets = await audioProductionApi.getCustomPresets(projectId);
      setCustomPresets(presets as Array<{
        id: string;
        name: string;
        description?: string;
        processing_chain: AudioProcessingChain;
      }>);
      
      alert(`Preset "${name}" saved successfully!`);
    } catch (error) {
      console.error('Failed to save preset:', error);
      alert('Failed to save preset. Please try again.');
    }
  }, [processingChain, projectId]);

  // Handle delete custom preset
  const handleDeletePreset = useCallback(async (presetId: string) => {
    if (!confirm('Are you sure you want to delete this preset?')) return;
    
    try {
      await audioProductionApi.deleteCustomPreset(projectId, presetId);
      
      // Reload custom presets
      const presets = await audioProductionApi.getCustomPresets(projectId);
      setCustomPresets(presets as Array<{
        id: string;
        name: string;
        description?: string;
        processing_chain: AudioProcessingChain;
      }>);
      
      alert('Preset deleted successfully!');
    } catch (error) {
      console.error('Failed to delete preset:', error);
      alert('Failed to delete preset. Please try again.');
    }
  }, [projectId]);

  // Handle delete SFX segment
  const handleDeleteSfx = useCallback(async (segmentId: string) => {
    if (!confirm('Are you sure you want to delete this sound effect?')) return;
    
    try {
      await deleteSfxSegment(segmentId);
      await loadChapterData();
      
      // Clear selection if deleted segment was selected
      if (selectedSegmentId === segmentId) {
        setSelectedSegmentId(null);
      }
    } catch (error) {
      console.error('Failed to delete SFX:', error);
      alert('Failed to delete sound effect. Please try again.');
    }
  }, [deleteSfxSegment, loadChapterData, selectedSegmentId]);

  // Handle processing chain changes
  const handleProcessingChainChange = useCallback((chain: AudioProcessingChain) => {



    
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

        setCustomMode(true);
        setSelectedPresetId('');
      }
    }
    


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

  // Handle audio playback - generate audio using proper endpoint that creates metadata
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
    const voiceSettings = character?.voiceAssignment;
    
    try {
      // Always generate/fetch audio through API (returns Blob)
      // API handles caching internally (HIT or MISS)
      console.log('[AudioProduction] Fetching audio for segment:', selectedSegmentId);
      const result = await generateSegmentAudio(selectedSegmentId, {
        text: segment.text || '',
        voice: voiceId,
        prosody: voiceSettings ? {
          style: voiceSettings.style,
          styledegree: voiceSettings.styledegree,
          rate_pct: voiceSettings.rate_pct,
          pitch_pct: voiceSettings.pitch_pct,
        } : undefined,
      });
      
      console.log('[AudioProduction] Audio fetched, object URL:', result.audioUrl, 'duration:', result.duration);
      
      // Play the audio using the object URL
      // Duration is already updated in state by generateSegmentAudio hook - no reload needed
      await playSegment({
        segment_id: segment.segment_id,
        id: segment.segment_id,
        has_audio: true,
        raw_audio_url: result.audioUrl,
        text: segment.text || '',
        voice: voiceId,
      }, voiceId);
      
    } catch (error) {
      console.error('[AudioProduction] Failed to play segment:', error);
      alert('Failed to play audio. Please try again.');
    }
  }, [selectedSegmentId, isPlaying, playingSegmentId, segments, characters, playSegment, stopPlayback, generateSegmentAudio]);

  // Auto-select first segment when segments load
  useEffect(() => {
    if (segments.length > 0 && !selectedSegmentId) {
      const firstSegmentId = segments[0].segment_id;
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

  // Debug: Log segments when they change
  useEffect(() => {
    const segmentsWithAudio = segments.filter(s => s.has_audio);
    if (segmentsWithAudio.length > 0) {
      console.log('[AudioProduction] Segments with audio:', segmentsWithAudio.map(s => ({
        id: s.segment_id,
        duration: s.duration,
        has_audio: s.has_audio
      })));
    }
  }, [segments]);

  // Handle player controls
  // Handle toggle revision flag
  const handleToggleRevision = useCallback(async (segmentId: string) => {

    try {
      const segment = segments.find(s => s.segment_id === segmentId);



      
      await toggleRevisionMark(segmentId, !segment?.needs_revision);

      
      // Refetch to ensure we have the latest data
      await loadChapterData();

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
  const handleSfxFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file format
    const validFormats = ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mpeg', 'audio/mp3'];
    if (!validFormats.includes(file.type)) {
      alert('Invalid file format. Please select a WAV or MP3 file.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    try {
      if (!selectedSegmentId) {
        alert('Please select a segment first to insert the sound effect before it.');
        return;
      }

      // Find the selected segment to insert before it
      const selectedSegment = segments.find(s => s.segment_id === selectedSegmentId);
      if (!selectedSegment) {
        alert('Selected segment not found.');
        return;
      }

      // Use the selected segment's display order as the target position
      // Backend will handle inserting before this position and reordering
      const displayOrder = Math.floor(selectedSegment.display_order);
      
      console.log('[SFX Upload] Inserting SFX before segment:', selectedSegmentId, 'at position:', displayOrder);
      await uploadSfx(file, displayOrder);
      
      // Reload data to reflect new segment and reordering
      await loadChapterData();
      
      setShowSfxDialog(false);
    } catch (error) {
      console.error('Failed to upload SFX:', error);
      let errorMessage = 'Failed to upload sound effect. Please try again.';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        errorMessage = JSON.stringify(error);
      }
      
      alert(errorMessage);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [selectedSegmentId, segments, uploadSfx, loadChapterData]);

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
        gridTemplateColumns: '1fr 340px 520px',
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
              {/* VU Meters with real audio analysis */}
              <VUMetersSection 
                audioElement={currentAudioElement || null}
                isPlaying={isPlaying}
                analyser={currentAnalyser}
                splitter={currentSplitter}
                audioContext={audioContext}
              />
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
                      background: playingSegmentId && duration > 0 
                        ? `linear-gradient(to right, #4a9eff ${Math.min((currentTime / duration) * 100, 100)}%, #333 ${Math.min((currentTime / duration) * 100, 100)}%)` 
                        : '#222',
                      outline: 'none',
                      cursor: playingSegmentId ? 'pointer' : 'not-allowed',
                      opacity: playingSegmentId ? 1 : 0.3,
                    }}
                  />
                </div>

                {/* Real-time Audio Waveform */}
                <div style={{ marginTop: '12px' }}>
                  <AudioWaveform 
                    audioElement={currentAudioElement || null}
                    isPlaying={!!playingSegmentId}
                    width={800}
                    height={80}
                    onSeek={seek}
                  />
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
                    type: seg.type,  // Include segment type
                  };

                  // Debug log for segments with audio
                  if (seg.has_audio && seg.duration) {
                    console.log('[SegmentList] Mapping segment with duration:', seg.segment_id, 'duration:', seg.duration);
                  }

                  return mapped;
                })}
                selectedSegmentId={selectedSegmentId}
                onSegmentSelect={handleSegmentSelect}

                onToggleRevision={handleToggleRevision}
                onDeleteSfx={handleDeleteSfx}
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
          <div style={{ flex: 1, overflow: 'auto' }}>
            <PresetSelector
              selectedPresetId={selectedPresetId}
              customSettingsEnabled={customMode}
              onPresetSelect={handlePresetSelect}
              onCustomToggle={handleCustomModeToggle}
              onApplyToAll={handleApplyToAll}
              customPresets={customPresets}
              presetFilter={presetFilter}
              onFilterChange={setPresetFilter}
              onDeletePreset={handleDeletePreset}
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
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
              Processing Chain
            </h2>
            {customMode && (
              <button
                onClick={() => setShowSavePresetModal(true)}
                style={{
                  padding: '4px 12px',
                  background: '#10b981',
                  border: 'none',
                  borderRadius: '4px',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                Save as Preset
              </button>
            )}
          </div>
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

      {/* Save Preset Modal */}
      {showSavePresetModal && (
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
          onClick={() => {
            setShowSavePresetModal(false);
            setPresetName('');
            setPresetDescription('');
            setPresetIcon('');
          }}
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
              Save as Preset
            </h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#999' }}>
                Preset Name *
              </label>
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="e.g., My Custom Preset"
                autoFocus
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#0a0a0a',
                  color: '#e0e0e0',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#999' }}>
                Description <span style={{ color: '#666' }}>(optional)</span>
              </label>
              <textarea
                value={presetDescription}
                onChange={(e) => setPresetDescription(e.target.value)}
                placeholder="Brief description of this preset..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#0a0a0a',
                  color: '#e0e0e0',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#999' }}>
                Icon <span style={{ color: '#666' }}>(optional)</span>
              </label>
              <input
                type="text"
                value={presetIcon}
                onChange={(e) => setPresetIcon(e.target.value)}
                placeholder="e.g., 🎵"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#0a0a0a',
                  color: '#e0e0e0',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowSavePresetModal(false);
                  setPresetName('');
                  setPresetDescription('');
                  setPresetIcon('');
                }}
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
                onClick={() => {
                  if (presetName.trim()) {
                    handleSaveAsPreset(presetName.trim(), presetDescription.trim(), presetIcon.trim());
                    setShowSavePresetModal(false);
                    setPresetName('');
                    setPresetDescription('');
                    setPresetIcon('');
                  }
                }}
                disabled={!presetName.trim()}
                style={{
                  padding: '8px 16px',
                  background: presetName.trim() ? '#10b981' : '#333',
                  color: presetName.trim() ? '#fff' : '#666',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: presetName.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Save Preset
              </button>
            </div>
          </div>
        </div>
      )}

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
              Select an audio file to insert as a sound effect. Supported formats: WAV, MP3
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".wav,.mp3,audio/wav,audio/mpeg"
              onChange={handleSfxFileSelect}
              style={{ display: 'none' }}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '12px 24px',
                background: '#4a9eff',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                marginBottom: '24px',
                width: '100%',
              }}
            >
              Choose Audio File
            </button>

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
