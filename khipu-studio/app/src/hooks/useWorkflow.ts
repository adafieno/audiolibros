import { useCallback } from 'react';
import { useProject, type WorkflowStep } from '../store/project';

/**
 * Hook for managing workflow step completion
 */
export function useWorkflow() {
  const { markStepCompleted, isStepCompleted, isStepAvailable } = useProject();

  const completeStep = useCallback((step: WorkflowStep) => {
    markStepCompleted(step);
  }, [markStepCompleted]);

  const isCompleted = useCallback((step: WorkflowStep) => {
    return isStepCompleted(step);
  }, [isStepCompleted]);

  const isAvailable = useCallback((step: WorkflowStep) => {
    return isStepAvailable(step);
  }, [isStepAvailable]);

  return {
    completeStep,
    isCompleted,
    isAvailable,
  };
}
