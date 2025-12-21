/**
 * Collapsible Section Component
 * 
 * Reusable collapsible panel for organizing UI sections.
 */

import { useState, useEffect } from 'react';

interface CollapsibleSectionProps {
  title: string;
  defaultExpanded?: boolean;
  expanded?: boolean; // Controlled mode
  onExpandedChange?: (expanded: boolean) => void; // Controlled mode callback
  children: React.ReactNode;
  badge?: string;
  icon?: string;
  isActive?: boolean; // Whether any effects in this section are enabled
}

export function CollapsibleSection({
  title,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onExpandedChange,
  children,
  badge,
  icon,
  isActive = false,
}: CollapsibleSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const [isHovered, setIsHovered] = useState(false);

  // Support both controlled and uncontrolled modes
  const isControlled = controlledExpanded !== undefined;
  const isExpanded = isControlled ? controlledExpanded : internalExpanded;

  const handleToggle = () => {
    const newExpanded = !isExpanded;
    if (isControlled) {
      onExpandedChange?.(newExpanded);
    } else {
      setInternalExpanded(newExpanded);
    }
  };

  return (
    <div style={{
      background: isExpanded ? '#1a1a1a' : '#0d0d0d',
      border: '1px solid #444',
      borderRadius: '4px',
      overflow: 'hidden',
      transition: 'all 0.15s ease',
      boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
    }}>
      {/* Header - Studio Rack Style */}
      <button
        onClick={handleToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          width: '100%',
          padding: '0',
          display: 'flex',
          alignItems: 'stretch',
          background: isHovered 
            ? 'linear-gradient(to bottom, #2a2a2a 0%, #222 100%)'
            : 'linear-gradient(to bottom, #252525 0%, #1a1a1a 100%)',
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          color: '#e0e0e0',
          position: 'relative',
          minHeight: '44px',
        }}
      >
        {/* Rack screws */}
        <div style={{ position: 'absolute', left: '8px', top: '8px', width: '6px', height: '6px', borderRadius: '50%', background: 'linear-gradient(135deg, #555, #222)', boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.5)' }} />
        <div style={{ position: 'absolute', left: '8px', bottom: '8px', width: '6px', height: '6px', borderRadius: '50%', background: 'linear-gradient(135deg, #555, #222)', boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.5)' }} />
        <div style={{ position: 'absolute', right: '8px', top: '8px', width: '6px', height: '6px', borderRadius: '50%', background: 'linear-gradient(135deg, #555, #222)', boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.5)' }} />
        <div style={{ position: 'absolute', right: '8px', bottom: '8px', width: '6px', height: '6px', borderRadius: '50%', background: 'linear-gradient(135deg, #555, #222)', boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.5)' }} />
        
        {/* Left control panel - simplified */}
        <div style={{ 
          width: '24px',
          background: 'linear-gradient(to right, #2a2a2a, #1f1f1f)',
          borderRight: '1px solid #333',
        }} />
        
        {/* Main content area */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '0 16px',
          marginLeft: '0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            {/* Icon next to title */}
            {icon && (
              <span style={{ 
                fontSize: '16px',
                opacity: isExpanded ? 1.0 : 0.7,
                transition: 'all 0.15s ease',
              }}>
                {icon}
              </span>
            )}
            
            {/* Title */}
            <span style={{ 
              fontSize: '14px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: isExpanded ? '#f5f5f5' : '#b0b0b0',
              transition: 'all 0.15s ease',
              fontFamily: 'monospace',
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
          
          {/* Right side controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Expand Arrow */}
            <span style={{
              fontSize: '12px',
              color: '#666',
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'all 0.15s ease',
              display: 'inline-block',
              lineHeight: 1,
            }}>
              ▼
            </span>
            
            {/* Power LED - right side before screws */}
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: isActive ? '#4ade80' : '#333',
              boxShadow: isActive ? '0 0 10px #4ade80, inset 0 -1px 2px rgba(0,0,0,0.5)' : 'inset 0 1px 2px rgba(0,0,0,0.8)',
              border: '1px solid #222',
              transition: 'all 0.15s ease',
              marginRight: '8px',
            }} />
          </div>
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
