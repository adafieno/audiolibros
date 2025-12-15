import React from 'react';

export type StatusPillType = 'completion' | 'project-status';
export type ProjectStatus = 'draft' | 'in_progress' | 'review' | 'completed' | 'published';

export interface StatusPillProps {
  type: StatusPillType;
  status?: ProjectStatus;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Standardized status pill component for workflow completion and project status
 */
export function StatusPill({ 
  type,
  status,
  children,
  style 
}: StatusPillProps) {
  const getStatusStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: '9999px',
      fontWeight: 500,
      whiteSpace: 'nowrap',
    };

    if (type === 'completion') {
      // Workflow completion pill (green)
      return {
        ...baseStyles,
        padding: '0.25rem 0.75rem',
        fontSize: '0.875rem',
        boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        background: '#22c55e',
        color: '#052e12',
        ...style,
      };
    }

    // Project status pill - colors based on status
    const statusColors: Record<ProjectStatus, { bg: string; color: string }> = {
      draft: {
        bg: '#f3f4f6',
        color: '#374151',
      },
      in_progress: {
        bg: '#dbeafe',
        color: '#1e40af',
      },
      review: {
        bg: '#fef3c7',
        color: '#92400e',
      },
      completed: {
        bg: '#d1fae5',
        color: '#065f46',
      },
      published: {
        bg: '#e0e7ff',
        color: '#3730a3',
      },
    };

    const colors = status ? statusColors[status] : statusColors.draft;

    return {
      ...baseStyles,
      padding: '4px 12px',
      fontSize: '12px',
      background: colors.bg,
      color: colors.color,
      ...style,
    };
  };

  return (
    <span style={getStatusStyles()}>
      {children}
    </span>
  );
}
