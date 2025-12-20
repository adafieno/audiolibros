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
  icon?: string;
}

export function CollapsibleSection({
  title,
  defaultExpanded = false,
  children,
  badge,
  icon,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div style={{
      background: isExpanded ? '#1a1a1a' : '#0d0d0d',
      border: '1px solid',
      borderColor: isExpanded ? '#444' : '#2a2a2a',
      borderRadius: isExpanded ? '6px' : '3px',
      overflow: 'hidden',
      transition: 'all 0.15s ease',
    }}>
      {/* Header - Rack Style */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          width: '100%',
          padding: isExpanded ? '10px 12px' : '6px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: isExpanded 
            ? (isHovered ? '#2a2a2a' : '#252525')
            : (isHovered ? '#1a1a1a' : 'transparent'),
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          color: '#e0e0e0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          {/* Icon */}
          {icon && (
            <span style={{ 
              fontSize: isExpanded ? '14px' : '12px',
              opacity: 0.7,
              transition: 'all 0.15s ease',
            }}>
              {icon}
            </span>
          )}
          
          {/* Title */}
          <span style={{ 
            fontSize: isExpanded ? '13px' : '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: isExpanded ? '0.5px' : '0.3px',
            color: isExpanded ? '#e0e0e0' : '#a0a0a0',
            transition: 'all 0.15s ease',
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
        
        {/* Controls - Right Side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Power Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              // Future: toggle bypass
            }}
            style={{
              width: isExpanded ? '20px' : '16px',
              height: isExpanded ? '20px' : '16px',
              borderRadius: '50%',
              background: '#2a2a2a',
              border: '1px solid #444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#3a3a3a';
              e.currentTarget.style.borderColor = '#555';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#2a2a2a';
              e.currentTarget.style.borderColor = '#444';
            }}
          >
            <div style={{
              width: isExpanded ? '6px' : '5px',
              height: isExpanded ? '6px' : '5px',
              borderRadius: '50%',
              background: '#4ade80',
              boxShadow: '0 0 4px #4ade80',
              transition: 'all 0.15s ease',
            }} />
          </button>
          
          {/* Expand Arrow */}
          <span style={{
            fontSize: isExpanded ? '10px' : '8px',
            color: '#666',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'all 0.15s ease',
            display: 'inline-block',
            lineHeight: 1,
          }}>
            ▼
          </span>
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div style={{
          padding: '16px',
          borderTop: '1px solid #2a2a2a',
          background: '#0d0d0d',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}
