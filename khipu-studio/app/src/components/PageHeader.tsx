import React from 'react';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * Standardized page header component following the Cost page design pattern
 */
export function PageHeader({ title, description, actions, children }: PageHeaderProps) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'start',
      background: 'var(--panel)',
      padding: '12px 16px',
      borderBottom: '1px solid var(--border)',
      borderRadius: '8px',
      marginBottom: '12px'
    }}>
      <div>
        <h1 style={{
          fontSize: '20px',
          fontWeight: '700',
          color: 'var(--text)',
          margin: '0 0 4px 0',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {title}
        </h1>
        {description && (
          <p style={{
            color: 'var(--muted)',
            margin: '0',
            fontSize: '14px'
          }}>
            {description}
          </p>
        )}
      </div>
      
      {actions && (
        <div style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center'
        }}>
          {actions}
        </div>
      )}
      
      {children}
    </div>
  );
}

export default PageHeader;