import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { planningApi } from '../api/planning';
import { getChapters } from '../api/chapters';
import { charactersApi } from '../lib/api/characters';
import { voicesApi } from '../lib/api/voices';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { ProgressBar } from '../components/ProgressBar';
import { projectsApi } from '../lib/projects';

export const Route = createFileRoute('/projects/$projectId/orchestration')({
  component: OrchestrationPage,
});

function OrchestrationPage() {
  const { t } = useTranslation();
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);  // Changed to string (UUID)
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [assignmentProgress, setAssignmentProgress] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');

  // Query to fetch chapters
  const { data: chaptersData } = useQuery({
    queryKey: ['chapters', projectId],
    queryFn: () => getChapters(projectId),
  });

  // Query to fetch plan for selected chapter
  const { data: plan, isLoading, refetch } = useQuery({
    queryKey: ['plan', projectId, selectedChapterId],
    queryFn: async () => {
      if (!selectedChapterId) return null;
      return await planningApi.getPlan(projectId, selectedChapterId);
    },
    enabled: !!selectedChapterId,
  });

  const handleGeneratePlan = async () => {
    if (!selectedChapterId) return;
    
    setIsGenerating(true);
    setGenerationProgress('Analyzing chapter and generating segments with AI...');
    try {
      await planningApi.generatePlan(projectId, selectedChapterId);
      await refetch();
      setSelectedSegmentId(null);
      setGenerationProgress('Plan generated successfully');
      setTimeout(() => setGenerationProgress(''), 2000);
    } catch (error) {
      console.error('Failed to generate plan:', error);
      setGenerationProgress('');
    } finally {
      setIsGenerating(false);
    }
  };

  const [filterNoCharacter, setFilterNoCharacter] = useState(false);
  
  // Audio playback state - using same pattern as Voice Casting
  const [audioCache] = useState(new Map<string, string>());
  const [audioElements] = useState(new Map<string, HTMLAudioElement>());
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  
  // Fetch project
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
  });
  
  // Local state for segments to enable immediate updates
  const [localSegments, setLocalSegments] = useState<Array<{
    id: string;
    order: number;
    start_idx: number;
    end_idx: number;
    delimiter: string;
    text: string;
    voice?: string;
    needsRevision?: boolean;
  }>>([]);
  const selectedSegment = localSegments.find(s => s.id === selectedSegmentId);
  
  // Sync local state with fetched plan
  useEffect(() => {
    if (plan?.segments) {
      setLocalSegments(plan.segments);
    }
  }, [plan]);

  // Auto-select first chapter on load if none selected
  useEffect(() => {
    if (chaptersData?.items && chaptersData.items.length > 0 && !selectedChapterId) {
      setSelectedChapterId(chaptersData.items[0].id);
    }
  }, [chaptersData, selectedChapterId]);

  // Auto-select first segment when plan loads
  useEffect(() => {
    if (localSegments.length > 0 && !selectedSegmentId) {
      setSelectedSegmentId(localSegments[0].id);
    }
  }, [localSegments, selectedSegmentId]);

  // Query to fetch characters
  const { data: characters } = useQuery({
    queryKey: ['characters', projectId],
    queryFn: () => charactersApi.getCharacters(projectId),
  });

  // Removed updatePlanMutation - now using saveChanges() for batch updates

  const handleVoiceChange = async (segmentId: string, voice: string) => {
    if (!selectedChapterId) return;
    
    // Update local state immediately for UI responsiveness
    const updatedSegments = localSegments.map(seg => 
      seg.id === segmentId ? { ...seg, voice } : seg
    );
    setLocalSegments(updatedSegments);
    
    // Auto-save to backend
    try {
      await planningApi.updatePlan(projectId, selectedChapterId, updatedSegments);
      await refetch();
    } catch (error) {
      console.error('Failed to auto-save voice change:', error);
    }
  };

  const handleToggleRevision = async (segmentId: string) => {
    if (!selectedChapterId) return;
    
    // Update local state immediately for UI responsiveness
    const updatedSegments = localSegments.map(seg => 
      seg.id === segmentId ? { ...seg, needsRevision: !seg.needsRevision } : seg
    );
    setLocalSegments(updatedSegments);
    
    // Auto-save to backend
    try {
      await planningApi.updatePlan(projectId, selectedChapterId, updatedSegments);
      await refetch();
    } catch (error) {
      console.error('Failed to auto-save revision flag:', error);
    }
  };

  // Helper to normalize voice name to match available character names (case-insensitive)
  const normalizeVoice = (voice: string | null | undefined): string => {
    if (!voice || !characters) return '';
    const matchedCharacter = characters.find(
      c => c.name.toLowerCase() === voice.toLowerCase()
    );
    return matchedCharacter ? matchedCharacter.name : voice;
  };

  const [isAssigning, setIsAssigning] = useState(false);
  const [assignmentCurrent, setAssignmentCurrent] = useState(0);
  const [assignmentTotal, setAssignmentTotal] = useState(0);

  const handleAssignCharacters = async () => {
    if (!plan || !selectedChapterId) return;
    
    setIsAssigning(true);
    setAssignmentProgress('Matching segments to character voices with AI...');
    setAssignmentCurrent(0);
    setAssignmentTotal(plan.segments.length);
    
    try {
      // Get token for SSE authentication (EventSource doesn't support custom headers)
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      // Use Server-Sent Events for progress updates
      const eventSource = new EventSource(
        `${import.meta.env.VITE_API_BASE_URL}/api/v1/projects/${projectId}/planning/chapters/${selectedChapterId}/assign-characters/stream?project_id=${projectId}&token=${token}`
      );

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        console.log('SSE message received:', data);
        
        if (data.error) {
          console.error('Assignment error:', data.error);
          alert(`Failed to assign characters: ${data.error}`);
          eventSource.close();
          setIsAssigning(false);
          setAssignmentProgress('');
          return;
        }
        
        // Update total if provided
        if (data.total !== undefined) {
          setAssignmentTotal(data.total);
        }
        
        if (data.complete) {
          setAssignmentProgress(data.message);
          setAssignmentCurrent(data.current);
          eventSource.close();
          
          // Refetch the plan and chapters list
          queryClient.invalidateQueries({ queryKey: ['plan', projectId, selectedChapterId] });
          queryClient.invalidateQueries({ queryKey: ['chapters', projectId] });
          
          setTimeout(() => setAssignmentProgress(''), 2000);
          setIsAssigning(false);
        } else {
          setAssignmentProgress(data.message || 'Processing...');
          setAssignmentCurrent(data.current);
        }
      };

      eventSource.onerror = () => {
        console.error('EventSource error');
        eventSource.close();
        setIsAssigning(false);
        setAssignmentProgress('');
        alert('Connection error during character assignment');
      };
      
    } catch (error) {
      console.error('Failed to assign characters:', error);
      alert(`Failed to assign characters: ${error instanceof Error ? error.message : String(error)}`);
      setAssignmentProgress('');
      setIsAssigning(false);
    }
  };

  const handleAudition = async (segmentToPlay?: typeof selectedSegment) => {
    const segment = segmentToPlay || selectedSegment;
    if (!segment || !project) return;
    
    // Stop if already playing this segment
    if (isPlaying && playingSegmentId === segment.id) {
      // Stop playing audio
      const audio = audioElements.get(segment.id);
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      setIsPlaying(false);
      setPlayingSegmentId(null);
      return;
    }
    
    // Stop any other playing audio
    audioElements.forEach((audio, id) => {
      if (id !== segment.id) {
        audio.pause();
        audio.currentTime = 0;
      }
    });
    
    setPlayingSegmentId(segment.id);
    setIsLoadingAudio(true);
    
    try {
      // Get the character for the segment's voice
      const character = characters?.find(c => c.name === segment.voice);
      
      // Use the voice from character's assignment, or default to a narrator voice
      const voiceId = character?.voiceAssignment?.voiceId || 'es-MX-DaliaNeural';
      
      // Check if audio is already cached
      let audioUrl = audioCache.get(segment.id);
      
      if (!audioUrl) {
        // Generate audio via voice audition API (same as Voice Casting)
        console.log('Generating audio for segment:', segment.id, 'voice:', voiceId, 'character:', segment.voice);
        const blob = await voicesApi.auditionVoice(projectId, voiceId, segment.text);
        audioUrl = URL.createObjectURL(blob);
        audioCache.set(segment.id, audioUrl);
        console.log('Audio generated and cached for segment:', segment.id);
      }
      
      // Get or create audio element
      let audio = audioElements.get(segment.id);
      if (!audio) {
        audio = new Audio(audioUrl);
        audio.onended = () => {
          setIsPlaying(false);
          setPlayingSegmentId(null);
        };
        audio.onerror = (e) => {
          console.error('Failed to play audio for segment:', segment.id, e);
          setIsPlaying(false);
          setPlayingSegmentId(null);
        };
        audioElements.set(segment.id, audio);
      }
      
      // Play audio
      setIsPlaying(true);
      setIsLoadingAudio(false);
      await audio.play();
      
    } catch (error) {
      console.error('Audition failed:', error);
      setPlayingSegmentId(null);
      setIsPlaying(false);
      setIsLoadingAudio(false);
      alert('Failed to play audition. Please ensure TTS is configured.');
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div
        className="rounded-lg border shadow mb-6 p-6"
        style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)', margin: 0, marginBottom: '0.25rem' }}>
              {t('orchestration.title', 'Orchestration')}
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)', margin: 0 }}>
              {t('orchestration.description', 'TTS-compliant chunk breakdown and character voice assignment - work chapter by chapter.')}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                {t('orchestration.chapter', 'Chapter:')}
              </label>
              <Select
                size="compact"
                value={selectedChapterId || ''}
                onChange={(e) => {
                  setSelectedChapterId(e.target.value || null);
                  setSelectedSegmentId(null);
                }}
                style={{ minWidth: '200px' }}
              >
                <option value="">
                  {t('orchestration.chooseChapter', 'Choose a chapter...')}
                </option>
                {chaptersData?.items.map((chapter) => {
                  return (
                    <option key={chapter.id} value={chapter.id}>
                      {(chapter as typeof chapter & { orchestration_complete?: boolean }).orchestration_complete ? '✓ ' : ''}{chapter.title}
                    </option>
                  );
                })}
              </Select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterNoCharacter}
                onChange={(e) => setFilterNoCharacter(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span className="text-sm" style={{ color: 'var(--text)' }}>
                {t('orchestration.unassigned', 'Unassigned')}
              </span>
            </label>

            <Button
              variant="primary"
              onClick={handleGeneratePlan}
              disabled={!selectedChapterId || isGenerating}
            >
              {isGenerating 
                ? t('orchestration.generating', 'Generating...') 
                : t('orchestration.generatePlan', 'Generate Plan')}
            </Button>

            <Button
              variant="primary"
              disabled={!plan || localSegments.length === 0 || isAssigning}
              onClick={handleAssignCharacters}
            >
              {isAssigning ? '⏳ Assigning...' : t('orchestration.assignCharacters', 'Assign Characters')}
            </Button>
          </div>
        </div>
      </div>
      {/* Progress indicators - Full width below header */}
      {(generationProgress || assignmentProgress) && (
        <ProgressBar 
          message={generationProgress || assignmentProgress}
          currentStep={assignmentCurrent}
          totalSteps={assignmentTotal || 1}
        />
      )}
      {/* Main Content */}
      <div className="flex gap-4" style={{ height: 'calc(100vh - 280px)' }}>
        {/* Left Panel - Segments Table (50% width) */}
        <div className="flex flex-col overflow-hidden" style={{ flex: '0 0 50%' }}>
          {/* Table Header */}
          <div className="px-4 py-3 border rounded-t-lg" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {t('orchestration.segmentsAndVoiceAssignment', 'Segments and Voice Assignment')}
            </h2>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto border-x border-b rounded-b-lg" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
            {isLoading && (
              <div className="flex items-center justify-center h-full p-6">
                <p style={{ color: 'var(--text-muted)' }}>{t('common.loading', 'Loading...')}</p>
              </div>
            )}

            {!selectedChapterId && !isLoading && (
              <div className="flex items-center justify-center h-full p-6">
                <p style={{ color: 'var(--text-muted)' }}>
                  {t('orchestration.selectChapterToStart', 'Select a chapter to get started')}
                </p>
              </div>
            )}

            {selectedChapterId && !plan && !isLoading && (
              <div className="flex items-center justify-center h-full p-6">
                <p style={{ color: 'var(--text-muted)' }} className="text-sm text-center">
                  {t('orchestration.noPlanYet', 'No plan exists for this chapter yet.')}
                </p>
              </div>
            )}

            {plan && plan.segments.length > 0 && (
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--panel)', zIndex: 1 }}>
                  <tr style={{ borderBottom: `1px solid var(--border)` }}>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)', width: '40px' }}>
                      {/* Play/Audition column */}
                    </th>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)', width: '60px' }}>
                      {t('orchestration.order', '#')}
                    </th>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)', width: '80px' }}>
                      {t('orchestration.delim', 'delim')}
                    </th>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)', width: '80px' }}>
                      {t('orchestration.start', 'start')}
                    </th>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)', width: '80px' }}>
                      {t('orchestration.end', 'end')}
                    </th>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)', width: '80px' }}>
                      {t('orchestration.len', 'len')}
                    </th>
                    <th className="text-left py-2 px-2 font-medium flex-1" style={{ color: 'var(--text-muted)' }}>
                      {t('orchestration.character', 'character')}
                    </th>
                    <th className="text-center py-2 px-2 font-medium" style={{ color: 'var(--text-muted)', width: '50px' }}>
                      🚩
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {localSegments
                    .filter(segment => !filterNoCharacter || !segment.voice)
                    .map((segment) => (
                    <tr
                      key={segment.id}
                      onClick={() => setSelectedSegmentId(segment.id)}
                      className="cursor-pointer transition-colors"
                      style={{
                        background: selectedSegmentId === segment.id ? 'rgba(59, 130, 246, 0.5)' : 'transparent',
                        borderBottom: `1px solid var(--border)`
                      }}
                    >
                      <td className="py-2 px-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSegmentId(segment.id);
                            handleAudition(segment);
                          }}
                          disabled={!segment.voice || (isLoadingAudio && playingSegmentId === segment.id)}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-opacity-20 transition-colors"
                          style={{ 
                            background: 'transparent', 
                            color: segment.voice && !(isLoadingAudio && playingSegmentId === segment.id) ? 'var(--text)' : 'var(--text-muted)',
                            cursor: segment.voice && !(isLoadingAudio && playingSegmentId === segment.id) ? 'pointer' : 'not-allowed',
                            opacity: segment.voice && !(isLoadingAudio && playingSegmentId === segment.id) ? 1 : 0.5
                          }}
                          title={segment.voice ? t('orchestration.audition', 'Play audition') : t('orchestration.assignVoiceFirst', 'Assign a voice first')}
                        >
                          {isPlaying && playingSegmentId === segment.id ? '⏹' : '▶'}
                        </button>
                      </td>
                      <td className="py-2 px-2 font-mono" style={{ color: 'var(--text)' }}>
                        {segment.order}
                      </td>
                      <td className="py-2 px-2" style={{ color: 'var(--text)' }}>
                        {segment.delimiter}
                      </td>
                      <td className="py-2 px-2 font-mono" style={{ color: 'var(--text)' }}>
                        {segment.start_idx}
                      </td>
                      <td className="py-2 px-2 font-mono" style={{ color: 'var(--text)' }}>
                        {segment.end_idx}
                      </td>
                      <td className="py-2 px-2 font-mono" style={{ color: 'var(--text)' }}>
                        {segment.end_idx - segment.start_idx + 1}
                      </td>
                      <td className="py-2 px-2">
                        <Select
                          size="compact"
                          value={normalizeVoice(segment.voice)}
                          onChange={(e) => handleVoiceChange(segment.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: '100%' }}
                        >
                          <option value="">
                            {t('orchestration.unassigned', '<Unassigned>')}
                          </option>
                          {characters?.map((character) => (
                            <option key={character.id} value={character.name}>
                              {character.name}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleRevision(segment.id);
                          }}
                          title={segment.needsRevision ? 'Remove revision flag' : 'Flag for revision'}
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '3px',
                            background: segment.needsRevision ? 'rgba(251, 191, 36, 0.2)' : 'transparent',
                            border: segment.needsRevision ? '1px solid #fbbf24' : '1px solid #444',
                            color: segment.needsRevision ? '#fbbf24' : '#666',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '14px',
                            transition: 'all 0.2s',
                            padding: 0,
                          }}
                        >
                          🚩
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Panel - Segment Details (50% width) */}
        <div 
          className="flex flex-col border rounded-lg overflow-hidden"
          style={{ flex: '0 0 50%', borderColor: 'var(--border)', background: 'var(--panel)' }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {t('orchestration.segmentText', 'Segment Text')}
            </h2>
          </div>

          <div className="flex-1 overflow-auto p-4">
            {selectedSegment ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {t('orchestration.voice', 'Voice:')}
                    </span>
                    {' '}
                    <span style={{ color: 'var(--text)' }}>
                      {selectedSegment.voice || t('orchestration.unassigned', '<Unassigned>')}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>ID:</span>
                    {' '}
                    <span className="font-mono text-xs" style={{ color: 'var(--text)' }} title={selectedSegment.id}>
                      {selectedSegment.id.substring(0, 8)}...
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Order:</span>
                    {' '}
                    <span className="font-mono" style={{ color: 'var(--text)' }}>{selectedSegment.order}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm pb-3 mb-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'var(--text-muted)' }}>
                      💬
                    </span>
                    <span className="font-mono" style={{ color: 'var(--text)' }}>
                      {selectedSegment.text.split(/\s+/).length}/500
                    </span>
                    <span style={{ color: 'var(--text-muted)' }} className="text-xs">
                      words
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'var(--text-muted)' }}>
                      📝
                    </span>
                    <span className="font-mono" style={{ color: 'var(--text)' }}>
                      {selectedSegment.text.length}/2800
                    </span>
                    <span style={{ color: 'var(--text-muted)' }} className="text-xs">
                      chars
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'var(--text-muted)' }}>
                      💾
                    </span>
                    <span className="font-mono" style={{ color: 'var(--text)' }}>
                      {((selectedSegment.text.length / 1024) * 2).toFixed(1)}/48
                    </span>
                    <span style={{ color: 'var(--text-muted)' }} className="text-xs">
                      KB
                    </span>
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)' }} className="text-sm mb-2">
                    {t('orchestration.text', 'Text:')}
                  </div>
                  <div 
                    className="p-4 rounded text-sm leading-relaxed"
                    style={{ 
                      background: 'var(--input)', 
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                      maxHeight: 'none'
                    }}
                  >
                    {isEditing ? (
                      <textarea
                        value={editedText}
                        onChange={(e) => setEditedText(e.target.value)}
                        style={{
                          width: '100%',
                          minHeight: '120px',
                          fontSize: '14px',
                          lineHeight: '1.6',
                          padding: '8px',
                          border: '2px solid var(--accent)',
                          borderRadius: '4px',
                          backgroundColor: 'var(--background)',
                          color: 'var(--text)',
                          fontFamily: 'inherit',
                          resize: 'vertical'
                        }}
                      />
                    ) : (
                      selectedSegment.text
                    )}
                  </div>
                </div>

                {/* Edit Buttons */}
                <div className="flex items-center gap-2 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  {!isEditing ? (
                    <>
                      <Button
                        variant="secondary"
                        disabled={!selectedSegmentId}
                        onClick={() => {
                          if (selectedSegment) {
                            setIsEditing(true);
                            setEditedText(selectedSegment.text);
                          }
                        }}
                      >
                        ✏️ {t('orchestration.edit', 'Edit')}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={!selectedSegmentId}
                        onClick={() => {
                          if (confirm('Are you sure you want to merge this segment with the previous segment? This will combine both segments into one.')) {
                            // TODO: Implement merge backward
                            alert('Merge backward functionality coming soon');
                          }
                        }}
                      >
                        ◀ {t('orchestration.merge', 'Merge')}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={!selectedSegmentId}
                        onClick={() => {
                          if (confirm('Are you sure you want to merge this segment with the next segment? This will combine both segments into one.')) {
                            // TODO: Implement merge forward
                            alert('Merge forward functionality coming soon');
                          }
                        }}
                      >
                        {t('orchestration.mergeRight', 'Merge')} ▶
                      </Button>
                      <Button
                        variant="danger"
                        disabled={!selectedSegmentId}
                        onClick={() => {
                          if (selectedSegment && confirm(`Are you sure you want to delete this segment?\n\n"${selectedSegment.text.substring(0, 50)}..."\n\nThis action cannot be undone.`)) {
                            // TODO: Implement delete
                            alert('Delete functionality coming soon');
                          }
                        }}
                      >
                        {t('orchestration.delete', 'Delete')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="primary"
                        onClick={async () => {
                          if (selectedSegment && selectedChapterId) {
                            const updatedSegments = localSegments.map(seg =>
                              seg.id === selectedSegment.id ? { ...seg, text: editedText } : seg
                            );
                            setLocalSegments(updatedSegments);
                            setIsEditing(false);
                            
                            // Auto-save to backend
                            try {
                              await planningApi.updatePlan(projectId, selectedChapterId, updatedSegments);
                              await refetch();
                            } catch (error) {
                              console.error('Failed to auto-save text change:', error);
                            }
                          }
                        }}
                      >
                        💾 {t('orchestration.save', 'Save')}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setIsEditing(false);
                          setEditedText('');
                        }}
                      >
                        ❌ {t('orchestration.cancel', 'Cancel')}
                      </Button>
                    </>
                  )}
                  <div className="flex-1" />
                  <Button
                    variant="secondary"
                    disabled={!selectedSegmentId || (isLoadingAudio && playingSegmentId === selectedSegmentId)}
                    onClick={() => handleAudition()}
                  >
                    {isPlaying && playingSegmentId === selectedSegmentId ? '⏹ Stop' : '▶ Audition'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p style={{ color: 'var(--text-muted)' }} className="text-sm text-center">
                  {t('orchestration.selectSegment', 'Select a segment to view details')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
