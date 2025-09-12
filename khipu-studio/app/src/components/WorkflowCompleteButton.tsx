import React from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkflow } from '../hooks/useWorkflow';
import type { WorkflowStep } from '../store/project';

/**
 * Component for marking a step as completed
 */
export function WorkflowCompleteButton({ 
  step, 
  children, 
  className = "",
  disabled = false 
}: { 
  step: WorkflowStep; 
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { completeStep, isCompleted } = useWorkflow();
  const completed = isCompleted(step);

  // Build className based on state
  const buttonClass = [
    'btn',
    completed ? 'success' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      onClick={() => completeStep(step)}
      disabled={disabled || completed}
      className={buttonClass}
    >
      {completed ? t("workflow.buttonCompleted") : children}
    </button>
  );
}
