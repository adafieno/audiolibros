/**
 * UndoRedo Component - Global undo/redo buttons with keyboard shortcuts
 */
import { useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { actionsApi } from '../api/actions';
import { useTranslation } from 'react-i18next';

interface UndoRedoProps {
  projectId: string;
  className?: string;
}

export function UndoRedo({ projectId, className = '' }: UndoRedoProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);

  // Get action history
  const { data: actions = [], refetch, error, isLoading } = useQuery({
    queryKey: ['actionHistory', projectId],
    queryFn: async () => {
      console.log('[UndoRedo] Fetching action history for project:', projectId);
      try {
        const result = await actionsApi.getHistory(projectId, 20);
        console.log('[UndoRedo] Action history fetched:', result);
        return result;
      } catch (err) {
        console.error('[UndoRedo] Failed to fetch action history:', err);
        throw err;
      }
    },
    refetchInterval: 5000, // Refetch every 5 seconds to stay updated
    enabled: !!projectId,
  });

  // Debug logging
  console.log('[UndoRedo] State:', { projectId, actions, error, isLoading, isProcessing });

  // Find the most recent undoable and redoable actions
  const canUndo = actions.some(a => !a.is_undone);
  const canRedo = actions.some(a => a.is_undone);
  const lastUndoableAction = actions.find(a => !a.is_undone);
  const lastRedoableAction = actions.find(a => a.is_undone);

  // Handle undo
  const handleUndo = useCallback(async () => {
    if (!lastUndoableAction || isProcessing) return;
    
    setIsProcessing(true);
    try {
      await actionsApi.undo(lastUndoableAction.id);
      
      // Invalidate relevant queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['actionHistory', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['chapterPlan'] }),
        queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
      ]);
      
      await refetch();
    } catch (error) {
      console.error('Undo failed:', error);
      alert(t('undoRedo.undoFailed', 'Failed to undo action'));
    } finally {
      setIsProcessing(false);
    }
  }, [lastUndoableAction, isProcessing, queryClient, projectId, refetch, t]);

  // Handle redo
  const handleRedo = useCallback(async () => {
    if (!lastRedoableAction || isProcessing) return;
    
    setIsProcessing(true);
    try {
      await actionsApi.redo(lastRedoableAction.id);
      
      // Invalidate relevant queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['actionHistory', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['chapterPlan'] }),
        queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
      ]);
      
      await refetch();
    } catch (error) {
      console.error('Redo failed:', error);
      alert(t('undoRedo.redoFailed', 'Failed to redo action'));
    } finally {
      setIsProcessing(false);
    }
  }, [lastRedoableAction, isProcessing, queryClient, projectId, refetch, t]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo && !isProcessing) {
          handleUndo();
        }
      }
      
      // Ctrl+Y or Ctrl+Shift+Z or Cmd+Shift+Z for redo
      if (((e.ctrlKey || e.metaKey) && e.key === 'y') || 
          ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        if (canRedo && !isProcessing) {
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, isProcessing, lastUndoableAction, lastRedoableAction, handleUndo, handleRedo]);

  return (
    <div className={`flex items-center gap-1 ${className}`} style={{ marginLeft: 24 }}>
      {/* Undo button */}
      <button
        onClick={handleUndo}
        disabled={!canUndo || isProcessing}
        className="p-2 rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ 
          color: canUndo && !isProcessing ? 'var(--accent)' : 'var(--text-muted)',
          backgroundColor: canUndo && !isProcessing ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
        }}
        title={lastUndoableAction ? 
          `${t('undoRedo.undo', 'Undo')}: ${lastUndoableAction.action_description}` : 
          t('undoRedo.nothingToUndo', 'Nothing to undo')}
        aria-label={t('undoRedo.undo', 'Undo')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7v6h6"/>
          <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
        </svg>
      </button>

      {/* Redo button */}
      <button
        onClick={handleRedo}
        disabled={!canRedo || isProcessing}
        className="p-2 rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ 
          color: canRedo && !isProcessing ? 'var(--accent)' : 'var(--text-muted)',
          backgroundColor: canRedo && !isProcessing ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
        }}
        title={lastRedoableAction ? 
          `${t('undoRedo.redo', 'Redo')}: ${lastRedoableAction.action_description}` : 
          t('undoRedo.nothingToRedo', 'Nothing to redo')}
        aria-label={t('undoRedo.redo', 'Redo')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 7v6h-6"/>
          <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>
        </svg>
      </button>

      {/* Action counter and status */}
      {(actions.length > 0 || isLoading || error) && (
        <span 
          className="text-xs ml-1" 
          style={{ color: error ? 'var(--error)' : 'var(--text-muted)' }}
          title={error ? 'Failed to load actions' : t('undoRedo.actionsAvailable', '{{count}} actions available', { count: actions.length })}
        >
          {isLoading ? '...' : error ? '✗' : actions.length}
        </span>
      )}
    </div>
  );
}
