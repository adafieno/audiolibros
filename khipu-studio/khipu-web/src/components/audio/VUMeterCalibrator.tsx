/**
 * VU Meter Calibration Tool
 * 
 * Measures pixel coordinates from TEAC reference image to reverse-engineer
 * the face geometry. Displays image at native resolution (250×146px) and
 * logs click coordinates for pivot and tick positions.
 * 
 * Workflow:
 * 1. Click the needle pivot (center of black hinge window)
 * 2. Click the outer tip of each labeled tick: -20, -10, -7, -5, -3, 0, +3
 * 3. Review calculated angles and fitted θ(v) = a + b·v mapping
 * 4. Copy fitted coefficients to StandardVUMeter.tsx
 */

import { useState } from 'react';

interface Point {
  x: number;
  y: number;
}

interface TickMeasurement {
  vu: number;
  point: Point;
  angle?: number;
}

export function VUMeterCalibrator() {
  const [pivot, setPivot] = useState<Point | null>(null);
  const [ticks, setTicks] = useState<TickMeasurement[]>([]);
  const [currentVu, setCurrentVu] = useState(-20);
  
  // VU values to measure
  const vuValues = [-20, -10, -7, -5, -3, 0, 3];
  
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    
    if (!pivot) {
      // First click sets pivot
      setPivot({ x, y });
      console.log(`✓ Pivot set: (${x}, ${y})`);
    } else {
      // Subsequent clicks record tick positions
      if (ticks.length < vuValues.length) {
        const vu = vuValues[ticks.length];
        const newTick: TickMeasurement = { vu, point: { x, y } };
        setTicks(prev => [...prev, newTick]);
        console.log(`✓ Tick ${vu} VU: (${x}, ${y})`);
        
        if (ticks.length + 1 < vuValues.length) {
          setCurrentVu(vuValues[ticks.length + 1]);
        }
      }
    }
  };
  
  const calculateAnglesAndFit = () => {
    if (!pivot || ticks.length === 0) return null;
    
    // Calculate angle for each tick: θ = atan2(x - x_pivot, y_pivot - y)
    const ticksWithAngles = ticks.map(tick => ({
      ...tick,
      angle: Math.atan2(
        tick.point.x - pivot.x,
        pivot.y - tick.point.y
      ) * (180 / Math.PI)
    }));
    
    // Linear regression: θ(v) = a + b·v
    // Minimize Σ(θ_i - (a + b·v_i))²
    const n = ticksWithAngles.length;
    const sumV = ticksWithAngles.reduce((s, t) => s + t.vu, 0);
    const sumTheta = ticksWithAngles.reduce((s, t) => s + (t.angle || 0), 0);
    const sumVTheta = ticksWithAngles.reduce((s, t) => s + t.vu * (t.angle || 0), 0);
    const sumV2 = ticksWithAngles.reduce((s, t) => s + t.vu * t.vu, 0);
    
    const b = (n * sumVTheta - sumV * sumTheta) / (n * sumV2 - sumV * sumV);
    const a = (sumTheta - b * sumV) / n;
    
    // Calculate R² (coefficient of determination)
    const meanTheta = sumTheta / n;
    const ssTot = ticksWithAngles.reduce((s, t) => {
      const diff = (t.angle || 0) - meanTheta;
      return s + diff * diff;
    }, 0);
    const ssRes = ticksWithAngles.reduce((s, t) => {
      const predicted = a + b * t.vu;
      const diff = (t.angle || 0) - predicted;
      return s + diff * diff;
    }, 0);
    const r2 = 1 - ssRes / ssTot;
    
    return { a, b, r2, ticksWithAngles };
  };
  
  const reset = () => {
    setPivot(null);
    setTicks([]);
    setCurrentVu(-20);
  };
  
  const fit = calculateAnglesAndFit();
  
  return (
    <div style={{ 
      padding: '20px', 
      background: '#1a1a1a', 
      borderRadius: '8px',
      maxWidth: '800px',
      margin: '20px auto'
    }}>
      <h2 style={{ color: '#fff', marginBottom: '16px' }}>
        VU Meter Calibration Tool
      </h2>
      
      <div style={{ 
        background: '#2a2a2a', 
        padding: '16px', 
        borderRadius: '4px',
        marginBottom: '16px'
      }}>
        <h3 style={{ color: '#00ff88', fontSize: '14px', marginBottom: '8px' }}>
          Instructions:
        </h3>
        <ol style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.6', marginLeft: '20px' }}>
          <li>Click the <strong>needle pivot</strong> (center of black hinge window at bottom)</li>
          <li>Click the <strong>outer tip</strong> of each labeled tick in order:</li>
          <ul style={{ marginLeft: '20px', marginTop: '4px' }}>
            {vuValues.map(vu => (
              <li key={vu} style={{ 
                color: ticks.some(t => t.vu === vu) ? '#00ff88' : 
                       vu === currentVu ? '#ffaa00' : '#666'
              }}>
                {vu > 0 ? '+' : ''}{vu} VU
                {ticks.some(t => t.vu === vu) && ' ✓'}
                {vu === currentVu && !ticks.some(t => t.vu === vu) && ' ← Click this now'}
              </li>
            ))}
          </ul>
          <li>Review calculated angles and fitted θ(v) coefficients below</li>
          <li>Copy coefficients to StandardVUMeter.tsx</li>
        </ol>
      </div>
      
      {/* TEAC Reference Image */}
      <div style={{ 
        background: '#000', 
        padding: '16px', 
        borderRadius: '4px',
        marginBottom: '16px',
        textAlign: 'center'
      }}>
        <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '8px' }}>
          Click to measure coordinates (250×146px native resolution)
        </div>
        <img 
          src="/teac-vu-meter.jpg"
          alt="TEAC VU Meter Reference"
          style={{ 
            width: '250px', 
            height: '146px',
            cursor: 'crosshair',
            border: '1px solid #444',
            imageRendering: 'pixelated'
          }}
          onClick={handleImageClick}
        />
      </div>
      
      {/* Measurements Display */}
      <div style={{ 
        background: '#2a2a2a', 
        padding: '16px', 
        borderRadius: '4px',
        marginBottom: '16px'
      }}>
        <h3 style={{ color: '#fff', fontSize: '14px', marginBottom: '12px' }}>
          Measurements:
        </h3>
        
        <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#ccc' }}>
          {pivot ? (
            <div style={{ color: '#00ff88', marginBottom: '12px' }}>
              ✓ Pivot: ({pivot.x}, {pivot.y})
            </div>
          ) : (
            <div style={{ color: '#ffaa00' }}>
              → Click pivot point (center of needle hinge)
            </div>
          )}
          
          {ticks.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ color: '#00ff88', marginBottom: '8px' }}>
                Tick Positions:
              </div>
              {ticks.map((tick, i) => (
                <div key={i} style={{ marginLeft: '16px', marginBottom: '4px' }}>
                  {tick.vu > 0 ? '+' : ''}{tick.vu} VU: ({tick.point.x}, {tick.point.y})
                  {tick.angle !== undefined && ` → ${tick.angle.toFixed(2)}°`}
                </div>
              ))}
            </div>
          )}
        </div>
        
        <button
          onClick={reset}
          style={{
            marginTop: '12px',
            padding: '6px 12px',
            background: '#444',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Reset Measurements
        </button>
      </div>
      
      {/* Fitted Results */}
      {fit && fit.ticksWithAngles.length > 1 && (
        <div style={{ 
          background: '#2a2a2a', 
          padding: '16px', 
          borderRadius: '4px',
          border: '2px solid #00ff88'
        }}>
          <h3 style={{ color: '#00ff88', fontSize: '14px', marginBottom: '12px' }}>
            Fitted θ(v) = a + b·v:
          </h3>
          
          <div style={{ fontFamily: 'monospace', fontSize: '13px', color: '#fff', marginBottom: '16px' }}>
            <div style={{ background: '#1a1a1a', padding: '12px', borderRadius: '4px' }}>
              <div><strong>a (intercept):</strong> {fit.a.toFixed(6)}°</div>
              <div><strong>b (slope):</strong> {fit.b.toFixed(6)}° per VU</div>
              <div><strong>R² (fit quality):</strong> {fit.r2.toFixed(6)} 
                {fit.r2 > 0.999 && ' ✓ Excellent fit'}
              </div>
            </div>
          </div>
          
          <div style={{ color: '#ccc', fontSize: '12px', marginBottom: '12px' }}>
            Verification (measured vs fitted):
          </div>
          
          <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#ccc' }}>
            {fit.ticksWithAngles.map((tick, i) => {
              const fitted = fit.a + fit.b * tick.vu;
              const error = tick.angle! - fitted;
              return (
                <div key={i} style={{ marginBottom: '4px' }}>
                  {tick.vu > 0 ? '+' : ''}{tick.vu.toString().padStart(3)} VU: 
                  measured = {tick.angle!.toFixed(2)}°, 
                  fitted = {fitted.toFixed(2)}°, 
                  error = {error > 0 ? '+' : ''}{error.toFixed(2)}°
                </div>
              );
            })}
          </div>
          
          <div style={{ 
            background: '#1a1a1a', 
            padding: '12px', 
            borderRadius: '4px',
            marginTop: '16px',
            border: '1px solid #444'
          }}>
            <div style={{ color: '#00ff88', fontSize: '12px', marginBottom: '8px' }}>
              Code to add to StandardVUMeter.tsx:
            </div>
            <pre style={{ 
              color: '#fff', 
              fontSize: '11px', 
              margin: 0,
              whiteSpace: 'pre-wrap'
            }}>
{`// TEAC face geometry - fitted from measurements
const TEAC_THETA_A = ${fit.a.toFixed(6)};  // intercept (degrees)
const TEAC_THETA_B = ${fit.b.toFixed(6)};  // slope (degrees per VU)

// Map VU to angle using fitted TEAC geometry
const vuToAngle = (v: number): number => {
  return TEAC_THETA_A + TEAC_THETA_B * v;
};`}
            </pre>
          </div>
          
          <div style={{ 
            marginTop: '12px',
            padding: '12px',
            background: '#1a1a1a',
            borderRadius: '4px',
            color: '#ffaa00',
            fontSize: '12px'
          }}>
            <strong>Arc endpoints:</strong>
            <div style={{ marginTop: '4px', fontFamily: 'monospace' }}>
              θ(-20) = {(fit.a + fit.b * -20).toFixed(2)}° (left end)
            </div>
            <div style={{ fontFamily: 'monospace' }}>
              θ(+3) = {(fit.a + fit.b * 3).toFixed(2)}° (right end)
            </div>
            <div style={{ fontFamily: 'monospace' }}>
              Total arc = {((fit.a + fit.b * 3) - (fit.a + fit.b * -20)).toFixed(2)}°
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
