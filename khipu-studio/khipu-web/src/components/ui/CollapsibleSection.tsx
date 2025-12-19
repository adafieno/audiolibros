/**
 * Collapsible Section Component
 * 
 * Reusable collapsible panel for organizing UI sections.
 */

import { useState } from 'react';

interface CollapsibleSectionProps {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  badge?: string;
}

export function CollapsibleSection({
  title,
  defaultExpanded = false,
  children,
  badge,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div style={{
      background: '#1a1a1a',
      border: '1px solid #333',
      borderRadius: '6px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          width: '100%',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: isExpanded ? '#252525' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.2s',
          color: '#e0e0e0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ 
            fontSize: '14px', 
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            {title}
          </span>
          {badge && (
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              background: '#4a9eff',
              color: '#fff',
              borderRadius: '3px',
              fontWeight: 600,
            }}>
              {badge}
            </span>
          )}
        </div>
        <span style={{
          fontSize: '12px',
          color: '#999',
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
        }}>
          ▼
        </span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div style={{
          padding: '16px',
          borderTop: '1px solid #333',
          background: '#0d0d0d',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}
