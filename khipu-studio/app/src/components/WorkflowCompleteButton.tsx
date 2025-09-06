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
  className,
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

  return (
    <button
      onClick={() => completeStep(step)}
      disabled={disabled || completed}
      className={className}
      style={{
        background: completed ? "#10b981" : "#3b82f6",
        color: "white",
        border: "none",
        borderRadius: 8,
        padding: "8px 16px",
        cursor: disabled || completed ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        ...(!className && {
          fontSize: 14,
          fontWeight: 500,
        })
      }}
    >
      {completed ? t("workflow.buttonCompleted") : children}
    </button>
  );
}
