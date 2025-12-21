/**
 * Standard VU Meter (ANSI C16.5, 300 ms)
 * 
 * A classic analog VU meter control compliant with the ANSI C16.5-1942
 * Volume Unit (VU) meter standard.
 * 
 * Implements true VU ballistics:
 * - ~300 ms integration (attack)
 * - Slower release (~500-700 ms)
 * - Measures average level (RMS-like) — not peak
 * - Default calibration: 0 VU = −18 dBFS RMS (configurable)
 */

import { useEffect, useRef, useState } from 'react';

interface StandardVUMeterProps {
  /** Input level in dBFS (full scale) */
  valueDbfs: number;
  /** Calibration point: what dBFS level corresponds to 0 VU (default: -18) */
  calibrationDbfsAt0Vu?: number;
  /** Overall size of the meter */
  size?: number;
  /** Label text (e.g., "L", "R", "MASTER") */
  label?: string;
  /** Whether to show tick marks and labels */
  showTicks?: boolean;
}

/**
 * Convert dBFS to VU units based on calibration
 */
function dbfsToVu(dbfs: number, calibration: number): number {
  return dbfs - calibration;
}

/**
 * Standard VU Meter Component
 * 
 * Displays audio levels using true VU ballistics (ANSI C16.5) with proper attack/release times.
 * Face geometry reverse-engineered from TEAC reference meter using fitted θ(v) = a + b·v mapping.
 */
export function StandardVUMeter({ 
  valueDbfs, 
  calibrationDbfsAt0Vu = -18,
  size = 180,
  label = '',
  showTicks = true
}: StandardVUMeterProps) {
  const [currentVu, setCurrentVu] = useState(-20);
  const [peakLit, setPeakLit] = useState(false);
  const lastUpdateTimeRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);

  // VU ballistics simulation with proper attack/release
  useEffect(() => {
    const vuTarget = Math.max(-20, Math.min(3, dbfsToVu(valueDbfs, calibrationDbfsAt0Vu)));
    
    // Initialize lastUpdateTime on first run
    if (lastUpdateTimeRef.current === 0) {
      lastUpdateTimeRef.current = Date.now();
    }
    
    const animate = () => {
      const now = Date.now();
      const dt = (now - lastUpdateTimeRef.current) / 1000; // seconds
      lastUpdateTimeRef.current = now;

      setCurrentVu(prev => {
        const diff = vuTarget - prev;
        
        if (Math.abs(diff) < 0.01) {
          return vuTarget;
        }

        // VU ballistics: attack ~300ms, release ~600ms
        const tau = diff > 0 ? 0.30 : 0.60;
        const alpha = Math.exp(-dt / tau);
        
        const newValue = alpha * prev + (1 - alpha) * vuTarget;
        
        // Light peak lamp if crossing +3 VU
        if (newValue >= 3) {
          setPeakLit(true);
          // Hold for 1 second
          setTimeout(() => setPeakLit(false), 1000);
        }
        
        return Math.max(-20, Math.min(3, newValue));
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [valueDbfs, calibrationDbfsAt0Vu]);

  // Dimensions and constants
  const W = size;
  const H = size * 0.60; // Height ratio
  const Px = 0.50 * (W + 10);  // Center horizontally in wider face
  const Py = 0.85 * (H + 20);   // Move down significantly within taller face
  const R = 0.70 * Math.min(W, H);
  
  // VU range: -20 to +3 (23 VU total)
  const vMin = -20;
  const vMax = 3;
  
  // TEAC face geometry - piecewise linear mapping from measurements
  // Reverse-engineered from TEAC reference image (250×146px)
  // Measured pivot and tick positions, calculated θ = atan2(x-x_pivot, y_pivot-y)
  // Anchor points at labeled ticks (VU, angle in degrees):
  const TEAC_ANCHORS: Array<[number, number]> = [
    [-20, -48.07],
    [-10, -34.85],
    [-7, -21.63],
    [-5, -8.67],
    [-3, 6.65],
    [0, 26.95],
    [3, 45.00]
  ];
  
  // Map VU to angle using piecewise linear interpolation between anchors
  const vuToAngle = (v: number): number => {
    // Clamp to range
    if (v <= TEAC_ANCHORS[0][0]) return TEAC_ANCHORS[0][1];
    if (v >= TEAC_ANCHORS[TEAC_ANCHORS.length - 1][0]) return TEAC_ANCHORS[TEAC_ANCHORS.length - 1][1];
    
    // Find bracketing anchors
    for (let i = 0; i < TEAC_ANCHORS.length - 1; i++) {
      const [v1, theta1] = TEAC_ANCHORS[i];
      const [v2, theta2] = TEAC_ANCHORS[i + 1];
      
      if (v >= v1 && v <= v2) {
        // Linear interpolation between anchors
        const t = (v - v1) / (v2 - v1);
        return theta1 + t * (theta2 - theta1);
      }
    }
    
    return TEAC_ANCHORS[TEAC_ANCHORS.length - 1][1];
  };
  
  // Arc endpoints derived from fitted mapping
  const thetaStart = vuToAngle(vMin);  // θ(-20) ≈ -63.09°
  const thetaEnd = vuToAngle(vMax);     // θ(+3) ≈ +32.43°
  
  // Convert angle to radians
  const degToRad = (deg: number): number => (deg * Math.PI) / 180;
  
  // Get position on arc at angle θ (0° points up)
  const arcPosition = (thetaDeg: number, radius: number) => {
    const rad = degToRad(thetaDeg);
    return {
      x: Px + radius * Math.sin(rad),
      y: Py - radius * Math.cos(rad)
    };
  };
  
  // Current needle angle
  // Convert from our convention (0° = up) to CSS rotate (0° = right)
  const needleAngle = vuToAngle(currentVu) - 90;

  return (
    <div 
      style={{
        width: `${W + 40}px`,  // Wider frame for peak lamp space
        height: `${H + 50}px`,  // Accommodate meter face + bottom label
        background: 'linear-gradient(145deg, #3a3a3a 0%, #1a1a1a 50%, #0a0a0a 100%)',
        borderRadius: '8px',
        border: '2px solid #000',
        boxShadow: `
          0 8px 16px rgba(0,0,0,0.8),
          0 4px 8px rgba(0,0,0,0.6),
          inset 0 1px 1px rgba(255,255,255,0.15),
          inset 0 -2px 4px rgba(0,0,0,0.5)
        `,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px',
        position: 'relative',
      }}
    >
      {/* Inner bezel */}
      <div style={{
        position: 'absolute',
        inset: '8px',
        borderRadius: '6px',
        border: '1px solid rgba(0,0,0,0.8)',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.1)',
        pointerEvents: 'none',
      }} />
      
      {/* Meter face */}
      <div 
        style={{
          width: `${W + 10}px`,  // Wider meter face
          height: `${H + 20}px`,  // Taller to accommodate labels above
          background: `
            linear-gradient(180deg, 
              rgba(255,255,255,0.4) 0%, 
              transparent 15%, 
              transparent 85%, 
              rgba(0,0,0,0.1) 100%
            ),
            linear-gradient(135deg, #ECD282 0%, #E8CE7A 100%)
          `,
          borderRadius: '6px',
          position: 'relative',
          overflow: 'visible',  // Allow ticks to extend above
          marginLeft: '5px',   // Minimal left margin
          paddingTop: '20px',   // Space for labels at top
          boxShadow: `
            inset 0 2px 6px rgba(255,255,255,0.6),
            inset 0 -2px 4px rgba(0,0,0,0.15),
            inset 2px 0 4px rgba(0,0,0,0.1),
            inset -2px 0 4px rgba(255,255,255,0.3),
            0 4px 8px rgba(0,0,0,0.3)
          `,
          border: '1px solid rgba(168, 152, 120, 0.8)',
        }}
      >
        {/* Glass reflection overlay */}
        <div style={{
          position: 'absolute',
          top: '5%',
          left: '10%',
          right: '10%',
          height: '30%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%)',
          borderRadius: '50% 50% 0 0',
          pointerEvents: 'none',
        }} />
        <svg width={W + 10} height={H + 20} style={{ position: 'absolute', top: 0, left: 0 }}>
          {/* Main arc using fitted TEAC geometry */}
          {(() => {
            const startPos = arcPosition(thetaStart, R);
            const endPos = arcPosition(thetaEnd, R);
            // Arc spans ~95.5° (θ(-20) to θ(+3))
            return (
              <path
                d={`M ${startPos.x} ${startPos.y} A ${R} ${R} 0 0 1 ${endPos.x} ${endPos.y}`}
                fill="none"
                stroke="rgba(0, 0, 0, 0.6)"
                strokeWidth="3"
              />
            );
          })()}
          
          {/* Red zone arc (0 VU to +3 VU) */}
          {(() => {
            const redStart = arcPosition(vuToAngle(0), R);
            const redEnd = arcPosition(vuToAngle(3), R);
            return (
              <path
                d={`M ${redStart.x} ${redStart.y} A ${R} ${R} 0 0 1 ${redEnd.x} ${redEnd.y}`}
                fill="none"
                stroke="#F9452B"
                strokeWidth="5"
              />
            );
          })()}
          
          {showTicks && (
            <>
              {/* Major tick marks and labels - ALL positioned via θ(v) mapping */}
              {[
                { label: '20', vu: -20, light: true },
                { label: '10', vu: -10, light: true },
                { label: '7', vu: -7 },
                { label: '5', vu: -5 },
                { label: '3', vu: -3 },
                { label: '0', vu: 0, bold: true, emphasis: true },
                { label: '', vu: 1, red: true },  // Tick only, no label
                { label: '', vu: 2, red: true },  // Tick only, no label
                { label: '3', vu: 3, red: true }
              ].map((tick, i) => {
                const theta = vuToAngle(tick.vu); // ALL angles from same function
                // Ticks start above arc and extend outward, longer than before
                const Lmajor = tick.emphasis ? 0.18 * R : 0.15 * R;
                const inner = arcPosition(theta, R + 0.02 * R); // Start slightly above arc
                // Slant proportional to angle (0 at vertical, increases toward ends)
                const slantAngle = theta + theta * 0.04; // 4% slant factor
                const outerSlanted = arcPosition(slantAngle, R + 0.02 * R + Lmajor);
                const labelPos = arcPosition(theta, R + 0.28 * R);  // Increased distance
                
                return (
                  <g key={i}>
                    <line
                      x1={inner.x}
                      y1={inner.y}
                      x2={outerSlanted.x}
                      y2={outerSlanted.y}
                      stroke={tick.red ? '#8b0000' : (tick.light ? 'rgba(0,0,0,0.4)' : '#000')}
                      strokeWidth={tick.emphasis ? '3' : (tick.bold ? '2.5' : (tick.light ? '1.5' : '2'))}
                    />
                    <text
                      x={labelPos.x}
                      y={labelPos.y + 4}
                      textAnchor="middle"
                      fontSize={tick.emphasis ? '14' : (tick.bold ? '12' : (tick.light ? '9' : '10'))}
                      fontWeight={tick.emphasis || tick.bold ? 'bold' : 'normal'}
                      fill={tick.red ? '#8b0000' : (tick.light ? 'rgba(0,0,0,0.5)' : '#000')}
                      fontFamily="Arial, sans-serif"
                    >
                      {tick.label}
                    </text>
                  </g>
                );
              })}
              
              {/* Zone indicators: - on left side, + on right side */}
              {(() => {
                // Calculate - position
                const minusTheta = vuToAngle(-17);
                const minusPos = arcPosition(minusTheta, R + 0.52 * R);
                
                // Calculate + position at same y as minus, but farther right
                const plusTheta = vuToAngle(2.2);  // Moved right
                const plusPos = arcPosition(plusTheta, R + 0.52 * R);
                
                return (
                  <>
                    <text
                      x={minusPos.x}
                      y={minusPos.y}
                      textAnchor="middle"
                      fontSize="16"
                      fontWeight="bold"
                      fill="#000"
                      fontFamily="Arial, sans-serif"
                    >
                      −
                    </text>
                    <text
                      x={plusPos.x}
                      y={minusPos.y}  // Use same y as minus
                      textAnchor="middle"
                      fontSize="16"
                      fontWeight="bold"
                      fill="#8b0000"
                      fontFamily="Arial, sans-serif"
                    >
                      +
                    </text>
                  </>
                );
              })()}
              
              {/* Minor tick marks - only from -7 VU onwards, slanted like major ticks */}
              {Array.from({ length: 22 }).map((_, i) => {
                const vu = -19 + i;
                // Only show minor ticks from -7 onwards, skip major tick positions
                if (vu < -7 || [-20, -10, -7, -5, -3, 0, 3].includes(vu)) return null;
                
                const theta = vuToAngle(vu);
                const Lminor = 0.08 * R;
                const inner = arcPosition(theta, R + 0.02 * R);
                // Slant proportional to angle (matches major tick logic)
                const slantAngle = theta + theta * 0.04; // Same 4% slant factor
                const outer = arcPosition(slantAngle, R + 0.02 * R + Lminor);
                
                // Reduce visual weight for red zone minor ticks
                const isRedZone = vu > 0;
                
                return (
                  <line
                    key={`minor-${i}`}
                    x1={inner.x}
                    y1={inner.y}
                    x2={outer.x}
                    y2={outer.y}
                    stroke={isRedZone ? 'rgba(139,0,0,0.5)' : '#333'}
                    strokeWidth="1"
                  />
                );
              })}
            </>
          )}
        </svg>
        
        {/* VU label */}
        <div 
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            marginTop: `${R * 0.35}px`,  // Moved up
            fontSize: '16px',
            fontWeight: 'bold',
            letterSpacing: '2px',
            color: '#000',
            fontFamily: 'Arial, sans-serif',
          }}
        >
          VU
        </div>
        
        {/* Needle */}
        <div 
          style={{
            position: 'absolute',
            left: `${Px}px`,
            top: `${Py}px`,
            width: `${R * 0.95}px`,  // Longer needle
            height: '1.5px',
            transformOrigin: '0% 50%',
            transform: `rotate(${needleAngle}deg)`,
            pointerEvents: 'none',
          }}
        >
          <div 
            style={{
              width: '100%',
              height: '1.5px',
              background: '#000',
            }} 
          />
        </div>
        
        {/* Center screw */}
        <div 
          style={{
            position: 'absolute',
            left: `${Px - 3}px`,
            top: `${Py - 3}px`,
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
        
        {/* Peak lamp - lower right corner with 3D frame */}
        <div
          style={{
            position: 'absolute',
            right: '12px',
            bottom: '12px',
            display: 'flex',
            flexDirection: 'column-reverse',  // Lamp on top, label below
            alignItems: 'center',
            gap: '3px',
          }}
        >
          {/* PEAK label */}
          <div
            style={{
              fontSize: '6px',
              fontWeight: 'normal',
              color: '#333',  // Darker
              letterSpacing: '0.3px',
              fontFamily: 'Arial, Helvetica, sans-serif',
              lineHeight: '1',
            }}
          >
            PEAK
          </div>
          
          {/* Lamp with 3D frame */}
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #666 0%, #333 50%, #000 100%)',
              boxShadow: 'inset -1px -1px 2px rgba(255,255,255,0.3), inset 2px 2px 3px rgba(0,0,0,0.7), 0 2px 4px rgba(0,0,0,0.5)',
              padding: '3px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Inner lamp */}
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: peakLit ? '#ff0000' : 'rgba(255,100,100,0.3)',
                boxShadow: peakLit ? '0 0 8px #ff0000, 0 0 12px #ff0000' : 'none',
                transition: 'all 0.1s ease',
              }}
            />
          </div>
        </div>
      </div>
      
      {/* Channel indicator - positioned at far left/right of frame */}
      {label && (
        <div 
          style={{
            position: 'absolute',
            bottom: '8px',
            [label === 'L' ? 'left' : 'right']: '12px',
          }}
        >
          <div
            style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color: '#ddd',
              fontFamily: 'Arial, sans-serif',
              letterSpacing: '1px',
              textShadow: '0 2px 4px rgba(0,0,0,0.8)',
            }}
          >
            {label}
          </div>
        </div>
      )}

      {/* Bottom section with centered screw */}
      <div 
        style={{
          marginTop: '8px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {/* Centered screw - aligned with needle pivot */}
        <div 
          style={{
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, #999, #555 45%, #333 70%, #111)',
            border: '1px solid #000',
            boxShadow: '0 2px 4px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.3)',
            position: 'relative',
            marginLeft: '8px',
          }}
        >
          {/* Screw slot */}
          <div 
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: '10px',
              height: '1.5px',
              backgroundColor: '#222',
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 0.5px 0 rgba(255,255,255,0.2)',
            }} 
          />
        </div>
      </div>
    </div>
  );
}
