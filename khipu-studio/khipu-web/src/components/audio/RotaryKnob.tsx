/**
 * Hardware-style Rotary Knob Component
 * 
 * Simulates an analog rotary knob with visual feedback.
 * Enhanced with tick marks, LED displays, and professional styling.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

interface RotaryKnobProps {
  value: number;
  min: number;
  max: number;
  label: string;
  color?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  step?: number;
  unit?: string;
}

export function RotaryKnob({
  value,
  min,
  max,
  label,
  color = '#4a9eff',
  disabled = false,
  onChange,
  step = 1,
  unit = '',
}: RotaryKnobProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number>(0);
  const startValueRef = useRef<number>(0);

  const normalizedValue = (value - min) / (max - min);
  const rotation = -135 + (normalizedValue * 270); // -135° to +135° range

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    
    setIsDragging(true);
    startYRef.current = e.clientY;
    startValueRef.current = value;
    e.preventDefault();
  }, [disabled, value]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const deltaY = startYRef.current - e.clientY; // Inverted: up = increase
    const range = max - min;
    const sensitivity = range / 200; // 200 pixels for full range
    const delta = deltaY * sensitivity;
    
    let newValue = startValueRef.current + delta;
    newValue = Math.max(min, Math.min(max, newValue));
    
    // Apply step rounding
    if (step) {
      newValue = Math.round(newValue / step) * step;
    }
    
    onChange(newValue);
  }, [isDragging, min, max, step, onChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Generate tick marks around the knob
  const tickMarks = [];
  for (let i = 0; i <= 20; i++) {
    const angle = -135 + (i * 13.5); // 270° range divided into 20 segments
    const isMajor = i % 5 === 0;
    tickMarks.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          width: isMajor ? '2px' : '1px',
          height: isMajor ? '8px' : '5px',
          background: isMajor ? '#ddd' : '#999',
          top: '0',
          left: '50%',
          transformOrigin: '50% 30px',
          transform: `translateX(-50%) rotate(${angle}deg)`,
          zIndex: 1,
          borderRadius: '1px',
        }}
      />
    );
  }

  return (
    <div 
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        gap: '6px',
        opacity: disabled ? 0.5 : 1,
        userSelect: 'none',
      }}
    >
      {/* Tick marks container */}
      <div style={{ position: 'relative', width: '60px', height: '60px' }}>
        {tickMarks}
        <div 
          style={{ 
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '46px', 
            height: '46px', 
            borderRadius: '50%',
            background: 'radial-gradient(circle at 40% 40%, #2a2a2a, #0a0a0a)',
            border: '1px solid #000',
            boxShadow: `inset 0 2px 4px rgba(0,0,0,0.8), inset 0 -1px 1px rgba(255,255,255,0.1), 0 2px 6px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)`,
            cursor: disabled ? 'not-allowed' : isDragging ? 'grabbing' : 'grab',
            transition: 'all 0.2s',
            zIndex: 2,
          }}
          onMouseDown={handleMouseDown}
        >
          {/* Indicator line */}
          <div 
            style={{ 
              position: 'absolute', 
              top: '4px', 
              left: '50%', 
              width: '2px', 
              height: '14px', 
              background: color,
              boxShadow: `0 0 6px ${color}`,
              transformOrigin: '50% 19px',
              transform: `translateX(-50%) rotate(${rotation}deg)`,
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              borderRadius: '1px',
              zIndex: 3,
            }} 
          />
          
          {/* Center cap */}
          <div 
            style={{ 
              position: 'absolute', 
              top: '50%', 
              left: '50%', 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, #444, #111)',
              border: `1px solid ${color}40`,
              transform: 'translate(-50%, -50%)',
              zIndex: 4,
            }} 
          />
        </div>
      </div>
      
      {/* Label */}
      <div 
        style={{ 
          fontFamily: "'Segoe UI', 'Arial', sans-serif", 
          fontSize: '10px', 
          color: '#aaa',
          textAlign: 'center',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      
      {/* Value display */}
      <div 
        style={{ 
          fontFamily: "'Consolas', 'Courier New', monospace", 
          fontSize: '12px', 
          fontWeight: 600,
          color: disabled ? '#666' : '#fff',
          background: '#000',
          padding: '3px 6px',
          borderRadius: '2px',
          border: '1px solid #333',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)',
          minWidth: '42px',
          textAlign: 'center',
        }}
      >
        {value.toFixed(step < 1 ? 1 : 0)}{unit && <span style={{ fontSize: '9px', marginLeft: '1px', color: color, opacity: 0.8 }}>{unit}</span>}
      </div>
    </div>
  );
}
