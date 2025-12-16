import { useEffect, useState } from 'react';

interface ProgressBarProps {
  message: string;
  currentStep?: number;
  totalSteps?: number;
  className?: string;
}

export function ProgressBar({ message, currentStep = 0, totalSteps = 100, className = '' }: ProgressBarProps) {
  const progress = totalSteps > 0 ? Math.min(100, (currentStep / totalSteps) * 100) : 0;

  return (
    <div className={`mb-4 rounded overflow-hidden relative ${className}`} style={{ background: 'var(--border)', height: '36px' }}>
      {/* Progress fill */}
      <div 
        className="absolute inset-0 transition-all duration-300 ease-out"
        style={{ 
          width: `${progress}%`,
          background: 'var(--accent)',
        }}
      />
      
      {/* Content overlay - always visible */}
      <div className="relative px-3 h-full flex items-center gap-2" style={{ color: 'var(--text)' }}>
        <div className="animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full flex-shrink-0" />
        <span className="text-sm font-medium truncate flex-1">{message}</span>
        {totalSteps > 1 && (
          <span className="text-xs opacity-80 whitespace-nowrap">
            {currentStep}/{totalSteps}
          </span>
        )}
      </div>
    </div>
  );
}
