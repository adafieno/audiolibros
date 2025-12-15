import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ChapterPlan } from '../types/planning';
import { planningApi } from '../api/planning';

export const Route = createFileRoute('/projects/$projectId/orchestration')({
  component: OrchestrationPage,
});

function OrchestrationPage() {
  const { t } = useTranslation();
  const { projectId } = Route.useParams();
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

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
    try {
      await planningApi.generatePlan(projectId, selectedChapterId);
      await refetch();
    } catch (error) {
      console.error('Failed to generate plan:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-6">
      <div className="rounded-lg border shadow mb-6 p-6" style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}>
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)', margin: 0 }}>
            {t('orchestration.title', 'Orchestration')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)', margin: 0 }}>
            {t('orchestration.description', 'Plan chapter segments and scene breaks.')}
          </p>
        </div>
      </div>
      
      <div className="max-w-4xl space-y-4" style={{ color: 'var(--text)' }}>
        {/* Chapter Selector */}
        <div className="rounded-lg border p-4" style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}>
          <label className="block text-sm font-medium mb-2">
            {t('orchestration.selectChapter', 'Select Chapter')}
          </label>
          <select
            value={selectedChapterId || ''}
            onChange={(e) => setSelectedChapterId(e.target.value || null)}
            className="w-full px-3 py-2 rounded border"
            style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--text)' }}
          >
            <option value="">{t('orchestration.chooseChapter', 'Choose a chapter...')}</option>
            {/* TODO: Load actual chapters from project */}
          </select>
        </div>

        {/* Generate Plan Button */}
        {selectedChapterId && (
          <div className="flex gap-2">
            <button
              onClick={handleGeneratePlan}
              disabled={isGenerating}
              className="px-4 py-2 rounded font-medium"
              style={{ 
                background: 'var(--primary)', 
                color: 'white',
                opacity: isGenerating ? 0.5 : 1,
                cursor: isGenerating ? 'not-allowed' : 'pointer'
              }}
            >
              {isGenerating 
                ? t('orchestration.generating', 'Generating...') 
                : t('orchestration.generatePlan', 'Generate Plan')}
            </button>
          </div>
        )}

        {/* Plan Display */}
        {isLoading && (
          <div className="rounded-lg border p-4" style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}>
            <p style={{ color: 'var(--text-muted)' }}>{t('common.loading', 'Loading...')}</p>
          </div>
        )}

        {plan && (
          <div className="rounded-lg border p-4" style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold mb-3">
              {t('orchestration.planSegments', 'Plan Segments')}
            </h2>
            <div className="space-y-2">
              {plan.segments.map((segment, idx) => (
                <div
                  key={segment.segment_id}
                  className="p-3 rounded border"
                  style={{ background: 'var(--input)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm" style={{ color: 'var(--text-muted)' }}>
                      #{segment.segment_id}
                    </span>
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      ({segment.start_idx}-{segment.end_idx}, {segment.end_idx - segment.start_idx + 1} chars)
                    </span>
                    {segment.voice && (
                      <span className="px-2 py-1 rounded text-xs" style={{ background: 'var(--panel)' }}>
                        {segment.voice}
                      </span>
                    )}
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text)' }}>
                    {segment.text.substring(0, 100)}
                    {segment.text.length > 100 && '...'}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {t('orchestration.totalSegments', { count: plan.segments.length }, `${plan.segments.length} segments`)}
              </p>
            </div>
          </div>
        )}

        {selectedChapterId && !plan && !isLoading && (
          <div className="rounded-lg border p-4" style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}>
            <p style={{ color: 'var(--text-muted)' }}>
              {t('orchestration.noPlanYet', 'No plan exists for this chapter yet. Generate one to get started.')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
