import { useEffect, useState } from 'react';

interface ProgressBarProps {
  message: string;
  steps?: number;
  currentStep?: number;
  className?: string;
}

export function ProgressBar({ message, steps = 3, currentStep, className = '' }: ProgressBarProps) {
  const [autoStep, setAutoStep] = useState(0);
  const effectiveStep = currentStep ?? autoStep;
  const progress = Math.min(100, (effectiveStep / steps) * 100);

  // Auto-increment for indeterminate progress
  useEffect(() => {
    if (currentStep !== undefined) return; // Don't auto-increment if explicit step provided
    
    const interval = setInterval(() => {
      setAutoStep(prev => (prev >= steps ? 0 : prev + 1));
    }, 800);
    
    return () => clearInterval(interval);
  }, [currentStep, steps]);

  return (
    <div className={`mb-4 rounded-md overflow-hidden ${className}`} style={{ background: 'var(--border)' }}>
      {/* Progress fill */}
      <div 
        className="transition-all duration-500 ease-out"
        style={{ 
          width: `${progress}%`,
          background: 'var(--accent)',
          minHeight: '48px'
        }}
      >
        <div className="p-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full flex-shrink-0" />
          <span className="font-medium">{message}</span>
        </div>
      </div>
    </div>
  );
}
