/**
 * Hardware-style VU Meter Components
 * 
 * Digital LED-style and analog needle-style VU meters.
 */

import { useEffect, useState } from 'react';

interface VUMeterProps {
  level: number; // 0-100
  label: string;
  color?: string;
}

/**
 * Digital LED-style VU Meter
 */
export function VUMeter({ level, label }: VUMeterProps) {
  const segments = 12;
  const activeSegments = Math.round((level / 100) * segments);
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div 
        style={{ 
          fontFamily: "'Courier New', monospace", 
          fontSize: '9px', 
          color: '#999',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {label}
      </div>
      <div 
        style={{ 
          display: 'flex', 
          gap: '2px', 
          background: '#0d0d0d',
          padding: '4px',
          borderRadius: '3px',
          border: '1px solid #1a1a1a',
        }}
      >
        {Array.from({ length: segments }).map((_, i) => {
          const isActive = i < activeSegments;
          const segmentColor = i < 8 ? '#4ade80' : i < 10 ? '#fbbf24' : '#ef4444';
          
          return (
            <div
              key={i}
              style={{
                width: '4px',
                height: '16px',
                background: isActive ? segmentColor : '#1a1a1a',
                boxShadow: isActive ? `0 0 4px ${segmentColor}` : 'none',
                transition: 'all 0.1s',
                borderRadius: '1px',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Analog needle-style VU Meter
 */
export function AnalogVUMeter({ isPlaying, channel }: { isPlaying: boolean; channel?: 'L' | 'R' }) {
  const [currentLevel, setCurrentLevel] = useState(0);
  
  useEffect(() => {
    if (isPlaying) {
      // Realistic audio dynamics - mostly hovering around -6 to -3 dB (70-85%)
      const interval = setInterval(() => {
        const random = Math.random();
        let targetLevel: number;
        
        if (random < 0.7) {
          // Normal speech levels: -6 to -3 dB (70-85%)
          targetLevel = 70 + Math.random() * 15;
        } else if (random < 0.9) {
          // Occasional peaks: -3 to 0 dB (85-95%)
          targetLevel = 85 + Math.random() * 10;
        } else {
          // Rare transients: 0 to +3 dB (95-100%)
          targetLevel = 95 + Math.random() * 5;
        }
        
        // Smooth transition with attack and decay
        setCurrentLevel(prev => {
          const diff = targetLevel - prev;
          const rate = diff > 0 ? 0.3 : 0.15; // Faster attack, slower decay
          return prev + diff * rate;
        });
      }, 50);
      return () => clearInterval(interval);
    } else {
      // Smooth return to rest position (far left)
      const interval = setInterval(() => {
        setCurrentLevel(prev => prev * 0.85);
        if (currentLevel < 0.5) {
          clearInterval(interval);
        }
      }, 50);
      return () => clearInterval(interval);
    }
  }, [isPlaying, currentLevel]);
  
  // Map percentage to needle angle (275° to 375° = 275° to 15° wrapped)
  const needleRotation = 275 + (currentLevel / 100) * 100;
  
  return (
    <div 
      style={{
        width: '180px',
        height: '110px',
        background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)',
        borderRadius: '6px',
        border: '1px solid #444',
        boxShadow: '0 4px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px',
        position: 'relative',
      }}
    >
      {/* Meter face with vintage paper texture */}
      <div 
        style={{
          width: '164px',
          height: '85px',
          background: '#ECD282',
          borderRadius: '4px',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: 'inset 0 -2px 6px rgba(0,0,0,0.12), inset 0 2px 4px rgba(255,255,255,0.5), 0 1px 0 rgba(255,255,255,0.3)',
          border: '1px solid #a89878',
        }}
      >
        {/* Scale arc */}
        <svg width="164" height="85" style={{ position: 'absolute', top: 0, left: 0 }}>
          <defs>
            <linearGradient id="redZone" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: 'rgba(249, 69, 43, 0.4)', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: 'rgba(249, 69, 43, 0.5)', stopOpacity: 1 }} />
            </linearGradient>
          </defs>
          
          {/* Full arc line from -20 to +3 */}
          <path
            d="M 35 63 A 45 45 0 0 1 129 63"
            fill="none"
            stroke="rgba(0, 0, 0, 0.3)"
            strokeWidth="14"
          />
          
          {/* Red danger zone overlay (right side only) - aligned to same arc */}
          <path
            d="M 98 22 A 45 45 0 0 1 129 63"
            fill="none"
            stroke="#F9452B"
            strokeWidth="14"
          />
          
          {/* Major tick marks and labels - matching desktop app layout */}
          {[
            { label: '-20', angle: 165 },
            { label: '-10', angle: 135 },
            { label: '-5', angle: 105 },
            { label: '0', angle: 75, bold: true },
            { label: '+1', angle: 55, red: true },
            { label: '+2', angle: 35, red: true },
            { label: '+3', angle: 15, red: true }
          ].map((tick, i) => {
            const rad = (tick.angle * Math.PI) / 180;
            const innerRadius = 40;
            const outerRadius = tick.bold ? 48 : 46;
            const labelRadius = 30;
            const x1 = 82 + Math.cos(rad) * innerRadius;
            const y1 = 70 - Math.sin(rad) * innerRadius;
            const x2 = 82 + Math.cos(rad) * outerRadius;
            const y2 = 70 - Math.sin(rad) * outerRadius;
            const labelX = 82 + Math.cos(rad) * labelRadius;
            const labelY = 70 - Math.sin(rad) * labelRadius;
            
            return (
              <g key={i}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={tick.red ? '#8b0000' : '#000'}
                  strokeWidth={tick.bold ? '2' : '1.5'}
                />
                <text
                  x={labelX}
                  y={labelY + 3}
                  textAnchor="middle"
                  fontSize={tick.bold ? '9' : '7'}
                  fontWeight={tick.bold ? 'bold' : 'normal'}
                  fill={tick.red ? '#8b0000' : '#000'}
                  fontFamily="Arial, sans-serif"
                >
                  {tick.label}
                </text>
              </g>
            );
          })}
          
          {/* Minor tick marks - different density for left and right */}
          {[...Array.from({ length: 6 }).map((_, i) => {
            // Left side (negative dB): fewer ticks, compressed scale
            return 165 - ((i + 1) * 15);
          }), ...Array.from({ length: 3 }).map((_, i) => {
            // Right side (positive dB): 10° spacing
            return 65 - ((i + 1) * 10);
          })].map((angle, i) => {
            // Skip positions where major ticks are
            const isMajorAngle = [165, 135, 105, 75, 55, 35, 15].some(a => Math.abs(angle - a) < 4);
            if (isMajorAngle) return null;
            
            const rad = (angle * Math.PI) / 180;
            const x1 = 82 + Math.cos(rad) * 42;
            const y1 = 70 - Math.sin(rad) * 42;
            const x2 = 82 + Math.cos(rad) * 45;
            const y2 = 70 - Math.sin(rad) * 45;
            
            return (
              <line
                key={`minor-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#333"
                strokeWidth="0.5"
              />
            );
          })}
        </svg>
        
        {/* dB label */}
        <div 
          style={{
            position: 'absolute',
            top: '3px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '11px',
            fontWeight: 'bold',
            letterSpacing: '2px',
            color: '#000',
            fontFamily: 'Arial, sans-serif',
          }}
        >
          dB
        </div>
        
        {/* Needle */}
        <div 
          style={{
            position: 'absolute',
            bottom: '15px',
            left: '82px',
            width: '100px',
            height: '100px',
            transformOrigin: '0% 100%',
            transform: `rotate(${needleRotation}deg)`,
            transition: 'transform 0.08s ease-out',
          }}
        >
          {/* Needle shaft */}
          <div 
            style={{
              position: 'absolute',
              bottom: '0',
              left: '0',
              width: '1px',
              height: '50px',
              background: '#c41e1e',
              boxShadow: 'none',
            }} 
          />
          
          {/* Needle tip */}
          <div 
            style={{
              position: 'absolute',
              top: '-3px',
              left: '-1.5px',
              width: '0',
              height: '0',
              borderLeft: '2px solid transparent',
              borderRight: '2px solid transparent',
              borderBottom: '5px solid #c41e1e',
            }} 
          />
        </div>
        
        {/* Center screw */}
        <div 
          style={{
            position: 'absolute',
            bottom: '15px',
            left: '79px',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: 'radial-gradient(circle at 30% 30%, #888, #333)',
            border: '0.5px solid #000',
            boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
            zIndex: 10,
          }}
        >
          <div 
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: '3px',
              height: '0.5px',
              backgroundColor: '#555',
              transform: 'translate(-50%, -50%)',
            }} 
          />
        </div>
      </div>
      
      {/* Bottom frame with screw and label */}
      <div 
        style={{
          marginTop: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
        }}
      >
        {/* Screw */}
        <div 
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: 'radial-gradient(circle at 30% 30%, #888, #333)',
            border: '0.5px solid #000',
            boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
            position: 'relative',
          }}
        >
          <div 
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: '3px',
              height: '0.5px',
              backgroundColor: '#555',
              transform: 'translate(-50%, -50%)',
            }} 
          />
        </div>
        
        {/* Channel label */}
        <div
          style={{
            fontSize: '8px',
            color: '#999',
            fontFamily: 'monospace',
            letterSpacing: '0.5px',
          }}
        >
          {channel || ''}
        </div>
      </div>
    </div>
  );
}
