/**
 * Hardware-style Rotary Knob Component
 * 
 * Simulates an analog rotary knob with visual feedback.
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
      <div 
        style={{ 
          width: '48px', 
          height: '48px', 
          borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, #2a2a2a, #0d0d0d)',
          border: '3px solid #1a1a1a',
          boxShadow: `inset 0 2px 4px rgba(0,0,0,0.8), 0 2px 8px ${color}40`,
          position: 'relative',
          cursor: disabled ? 'not-allowed' : isDragging ? 'grabbing' : 'grab',
          transition: 'all 0.2s',
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Indicator line */}
        <div 
          style={{ 
            position: 'absolute', 
            top: '6px', 
            left: '50%', 
            width: '3px', 
            height: '16px', 
            background: color,
            boxShadow: `0 0 6px ${color}`,
            transformOrigin: '50% 18px',
            transform: `translateX(-50%) rotate(${rotation}deg)`,
            transition: isDragging ? 'none' : 'transform 0.2s',
            borderRadius: '2px',
          }} 
        />
        
        {/* Center dot */}
        <div 
          style={{ 
            position: 'absolute', 
            top: '50%', 
            left: '50%', 
            width: '8px', 
            height: '8px', 
            borderRadius: '50%',
            background: '#0d0d0d',
            border: `1px solid ${color}`,
            transform: 'translate(-50%, -50%)',
          }} 
        />
      </div>
      
      {/* Label */}
      <div 
        style={{ 
          fontFamily: "'Courier New', monospace", 
          fontSize: '10px', 
          color: color,
          textAlign: 'center',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {label}
      </div>
      
      {/* Value display */}
      <div 
        style={{ 
          fontFamily: "'Courier New', monospace", 
          fontSize: '11px', 
          color: '#999',
          background: 'rgba(0,0,0,0.6)',
          padding: '2px 6px',
          borderRadius: '2px',
          border: '1px solid #333',
          minWidth: '36px',
          textAlign: 'center',
        }}
      >
        {value}
      </div>
    </div>
  );
}
