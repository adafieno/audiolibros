import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { planningApi } from '../api/planning';
import { getChapters } from '../api/chapters';
import { Button } from '../components/Button';
import { Select } from '../components/Select';

export const Route = createFileRoute('/projects/$projectId/orchestration')({
  component: OrchestrationPage,
});

function OrchestrationPage() {
  const { t } = useTranslation();
  const { projectId } = Route.useParams();
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

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
      try {
        return await planningApi.getPlan(projectId, selectedChapterId);
      } catch (error: unknown) {
        if (error instanceof Error && error.message.includes('404')) {
          return null;
        }
        throw error;
      }
    },
    enabled: !!selectedChapterId,
  });

  const handleGeneratePlan = async () => {
    if (!selectedChapterId) return;
    
    setIsGenerating(true);
    try {
      await planningApi.generatePlan(projectId, selectedChapterId);
      await refetch();
      setSelectedSegmentId(null);
    } catch (error) {
      console.error('Failed to generate plan:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const [filterNoCharacter, setFilterNoCharacter] = useState(false);
  const selectedSegment = plan?.segments.find(s => s.segment_id === selectedSegmentId);

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
                {chaptersData?.items.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.title}
                  </option>
                ))}
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
                {t('orchestration.noCharacter', 'No character')}
              </span>
            </label>

            <Button
              size="compact"
              variant="success"
              onClick={handleGeneratePlan}
              disabled={!selectedChapterId || isGenerating}
            >
              {isGenerating 
                ? t('orchestration.generating', 'Generating...') 
                : t('orchestration.generatePlan', 'Generate Plan')}
            </Button>

            <Button
              size="compact"
              variant="primary"
              disabled={!plan || plan.segments.length === 0}
            >
              {t('orchestration.assignCharacters', 'Assign Characters')}
            </Button>

            {plan && (
              <div 
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{ 
                  background: plan.is_complete ? 'var(--success)' : 'var(--warning)',
                  color: 'white'
                }}
              >
                {plan.is_complete 
                  ? `✓ ${t('orchestration.complete', 'Complete')}`
                  : t('orchestration.incomplete', 'Incomplete')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex gap-4" style={{ height: 'calc(100vh - 280px)' }}>
        {/* Left Panel - Segments Table (40% width) */}
        <div className="flex flex-col overflow-hidden" style={{ flex: '0 0 40%' }}>
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
                <div className="text-center">
                  <p style={{ color: 'var(--text-muted)' }} className="mb-4">
                    {t('orchestration.noPlanYet', 'No plan exists for this chapter yet.')}
                  </p>
                  <Button
                    onClick={handleGeneratePlan}
                    variant="success"
                  >
                    {t('orchestration.generatePlan', 'Generate Plan')}
                  </Button>
                </div>
              </div>
            )}

            {plan && plan.segments.length > 0 && (
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--panel)', zIndex: 1 }}>
                  <tr style={{ borderBottom: `1px solid var(--border)` }}>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)', width: '40px' }}>
                      {t('orchestration.seq', 'seq')}
                    </th>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)', width: '60px' }}>
                      {t('orchestration.id', 'ID')}
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
                  </tr>
                </thead>
                <tbody>
                  {plan.segments.map((segment) => (
                    <tr
                      key={segment.segment_id}
                      onClick={() => setSelectedSegmentId(segment.segment_id)}
                      className="cursor-pointer transition-colors"
                      style={{
                        background: selectedSegmentId === segment.segment_id ? 'rgba(59, 130, 246, 0.5)' : 'transparent',
                        borderBottom: `1px solid var(--border)`
                      }}
                    >
                      <td className="py-2 px-2">
                        <button
                          className="w-6 h-6 flex items-center justify-center rounded"
                          style={{ background: 'transparent', color: 'var(--text-muted)' }}
                        >
                          ▶
                        </button>
                      </td>
                      <td className="py-2 px-2 font-mono" style={{ color: 'var(--text)' }}>
                        {segment.segment_id}
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
                          value={segment.voice || ''}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: '100%' }}
                        >
                          <option value="">
                            {t('orchestration.narrator', 'narrator')}
                          </option>
                          {/* TODO: Load characters */}
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Bottom Controls */}
          {plan && plan.segments.length > 0 && (
            <div className="px-4 py-3 border-x border-b rounded-b-lg flex items-center gap-2" style={{ borderColor: 'var(--border)', background: 'var(--panel)', marginTop: '-1px' }}>
              <Button
                size="compact"
                variant="secondary"
                disabled={!selectedSegmentId}
              >
                ✏️ {t('orchestration.edit', 'Edit')}
              </Button>
              <Button
                size="compact"
                variant="secondary"
                disabled={!selectedSegmentId}
              >
                ◀ {t('orchestration.merge', 'Merge')}
              </Button>
              <Button
                size="compact"
                variant="secondary"
                disabled={!selectedSegmentId}
              >
                {t('orchestration.mergeRight', 'Merge')} ▶
              </Button>
              <Button
                size="compact"
                variant="danger"
                disabled={!selectedSegmentId}
              >
                {t('orchestration.delete', 'Delete')}
              </Button>
              <Button
                size="compact"
                variant="secondary"
              >
                ↶ {t('orchestration.undo', 'Undo')}
              </Button>
              <div className="flex-1" />
              <Button
                size="compact"
                variant="success"
                disabled={!selectedSegmentId}
              >
                {t('orchestration.audition', 'Audition')}
              </Button>
            </div>
          )}
        </div>

        {/* Right Panel - Segment Details (60% width) */}
        <div 
          className="flex flex-col border rounded-lg overflow-hidden"
          style={{ flex: '0 0 60%', borderColor: 'var(--border)', background: 'var(--panel)' }}
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
                      {selectedSegment.voice || t('orchestration.narrator', 'narrator')}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>ID:</span>
                    {' '}
                    <span className="font-mono" style={{ color: 'var(--text)' }}>{selectedSegment.segment_id}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div style={{ color: 'var(--text-muted)' }} className="mb-1">
                      {t('orchestration.words', 'Words')}
                    </div>
                    <div className="font-mono" style={{ color: 'var(--text)' }}>
                      {selectedSegment.text.split(/\s+/).length}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }} className="mb-1">
                      {t('orchestration.chars', 'Characters')}
                    </div>
                    <div className="font-mono" style={{ color: 'var(--text)' }}>
                      {selectedSegment.text.length}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }} className="mb-1">
                      Size (KB)
                    </div>
                    <div className="font-mono" style={{ color: 'var(--text)' }}>
                      ~{((selectedSegment.text.length / 1024) * 2).toFixed(2)}
                    </div>
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
                    {selectedSegment.text}
                  </div>
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
  );
}
