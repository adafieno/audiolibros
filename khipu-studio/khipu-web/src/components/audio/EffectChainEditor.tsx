/**
 * Effect Chain Editor Component
 * 
 * Comprehensive audio processing chain editor with hardware-style controls.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { RotaryKnob } from './RotaryKnob';
import { ToggleSwitch } from './ToggleSwitch';
import type { AudioProcessingChain } from '../../types/audio-production';

interface EffectChainEditorProps {
  processingChain: AudioProcessingChain;
  onChange: (chain: AudioProcessingChain) => void;
  disabled?: boolean;
}

// Studio rack unit wrapper component
function RackUnit({ 
  enabled, 
  color, 
  modelNumber, 
  children 
}: { 
  enabled: boolean; 
  color: string; 
  modelNumber: string; 
  children: ReactNode;
}) {
  return (
    <div style={{ 
      padding: '12px', 
      background: 'linear-gradient(to bottom, #222 0%, #1a1a1a 100%)', 
      borderRadius: '4px',
      border: '1px solid #444',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 4px rgba(0,0,0,0.3)',
      position: 'relative',
    }}>
      {/* Rack screws */}
      <div style={{ position: 'absolute', left: '8px', top: '8px', width: '6px', height: '6px', borderRadius: '50%', background: 'linear-gradient(135deg, #555, #222)', boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'absolute', left: '8px', bottom: '8px', width: '6px', height: '6px', borderRadius: '50%', background: 'linear-gradient(135deg, #555, #222)', boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'absolute', right: '8px', top: '8px', width: '6px', height: '6px', borderRadius: '50%', background: 'linear-gradient(135deg, #555, #222)', boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'absolute', right: '8px', bottom: '8px', width: '6px', height: '6px', borderRadius: '50%', background: 'linear-gradient(135deg, #555, #222)', boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.5)' }} />
      
      {/* Left rack panel with LED */}
      <div style={{ position: 'absolute', left: '0', top: '0', bottom: '0', width: '32px', background: 'linear-gradient(to right, #2a2a2a, #1f1f1f)', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', paddingTop: '4px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: enabled ? color : '#333', boxShadow: enabled ? `0 0 8px ${color}, inset 0 -1px 2px rgba(0,0,0,0.5)` : 'inset 0 1px 2px rgba(0,0,0,0.8)', border: '1px solid #222' }} />
        <div style={{ transform: 'rotate(-90deg)', fontSize: '7px', fontWeight: 700, color: '#666', letterSpacing: '0.5px', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{modelNumber}</div>
      </div>
      
      <div style={{ marginLeft: '32px' }}>
        {children}
      </div>
    </div>
  );
}

export function EffectChainEditor({
  processingChain,
  onChange,
  disabled = false,
}: EffectChainEditorProps) {
  // Track which section is expanded (accordion behavior)
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  
  // Helper to update nested processing chain values
  const updateChain = useCallback((path: string[], value: unknown) => {
    if (disabled) return; // Prevent changes in read-only mode
    
    const newChain = JSON.parse(JSON.stringify(processingChain));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = newChain;
    
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    
    current[path[path.length - 1]] = value;
    onChange(newChain);
  }, [processingChain, onChange, disabled]);

  // Toggle effect enabled state
  const toggleEffect = useCallback((path: string[]) => {
    if (disabled) return; // Prevent changes in read-only mode
    
    const newChain = JSON.parse(JSON.stringify(processingChain));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = newChain;
    
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    
    const lastKey = path[path.length - 1];
    current[lastKey].enabled = !current[lastKey].enabled;
    onChange(newChain);
  }, [processingChain, onChange, disabled]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {/* Noise Cleanup Section */}
      <CollapsibleSection 
        title="Noise Cleanup" 
        icon="🧹" 
        expanded={expandedSection === 'noiseCleanup'}
        onExpandedChange={(expanded) => setExpandedSection(expanded ? 'noiseCleanup' : null)}
        isActive={
          processingChain.noiseCleanup?.noiseReduction?.enabled ||
          processingChain.noiseCleanup?.deEsser?.enabled ||
          processingChain.noiseCleanup?.deClicker?.enabled ||
          false
        }
      >
        {/* Combined Noise Cleanup - All three in one row */}
        <RackUnit enabled={
          (processingChain.noiseCleanup?.noiseReduction?.enabled || false) ||
          (processingChain.noiseCleanup?.deEsser?.enabled || false) ||
          (processingChain.noiseCleanup?.deClicker?.enabled || false)
        } color="#4ade80" modelNumber="NC-01">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            {/* Noise Reduction */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Noise Reduction
                </span>
                <ToggleSwitch
                  checked={processingChain.noiseCleanup?.noiseReduction?.enabled || false}
                  onChange={() => toggleEffect(['noiseCleanup', 'noiseReduction'])}
                  disabled={disabled}
                  color="#4ade80"
                />
              </div>
              <RotaryKnob
                value={processingChain.noiseCleanup?.noiseReduction?.amount || 0}
                min={0}
                max={100}
                label="Amount"
                unit="%"
                color="#4ade80"
                disabled={disabled || !processingChain.noiseCleanup?.noiseReduction?.enabled}
                onChange={(value) => updateChain(['noiseCleanup', 'noiseReduction', 'amount'], value)}
              />
            </div>

            {/* De-esser */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  De-esser
                </span>
                <ToggleSwitch
                  checked={processingChain.noiseCleanup?.deEsser?.enabled || false}
                  onChange={() => toggleEffect(['noiseCleanup', 'deEsser'])}
                  disabled={disabled}
                  color="#fbbf24"
                />
              </div>
              <RotaryKnob
                value={processingChain.noiseCleanup?.deEsser?.threshold || -20}
                min={-40}
                max={0}
                label="Threshold"
                unit="dB"
                color="#fbbf24"
                disabled={disabled || !processingChain.noiseCleanup?.deEsser?.enabled}
                onChange={(value) => updateChain(['noiseCleanup', 'deEsser', 'threshold'], value)}
              />
            </div>

            {/* De-clicker */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  De-clicker
                </span>
                <ToggleSwitch
                  checked={processingChain.noiseCleanup?.deClicker?.enabled || false}
                  onChange={() => toggleEffect(['noiseCleanup', 'deClicker'])}
                  disabled={disabled}
                  color="#8b5cf6"
                />
              </div>
              <RotaryKnob
                value={processingChain.noiseCleanup?.deClicker?.sensitivity || 50}
                min={0}
                max={100}
                label="Sensitivity"
                unit="%"
                color="#8b5cf6"
                disabled={disabled || !processingChain.noiseCleanup?.deClicker?.enabled}
                onChange={(value) => updateChain(['noiseCleanup', 'deClicker', 'sensitivity'], value)}
              />
            </div>
          </div>
        </RackUnit>
      </CollapsibleSection>

      {/* Dynamic Control Section */}
      <CollapsibleSection 
        title="Compressor" 
        icon="⚡" 
        expanded={expandedSection === 'dynamicControl'}
        onExpandedChange={(expanded) => setExpandedSection(expanded ? 'dynamicControl' : null)}
        isActive={
          processingChain.dynamicControl?.compression?.enabled ||
          processingChain.dynamicControl?.limiting?.enabled ||
          processingChain.dynamicControl?.normalization?.enabled ||
          false
        }
      >
        {/* Combined Dynamic Control */}
        <RackUnit enabled={
          (processingChain.dynamicControl?.compression?.enabled || false) ||
          (processingChain.dynamicControl?.limiting?.enabled || false) ||
          (processingChain.dynamicControl?.normalization?.enabled || false)
        } color="#ef4444" modelNumber="DC-02">
          
          {/* Compression - Takes more space with 4 knobs */}
          <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #333' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Compression
              </span>
              <ToggleSwitch
                checked={processingChain.dynamicControl?.compression?.enabled || false}
                onChange={() => toggleEffect(['dynamicControl', 'compression'])}
                disabled={disabled}
                color="#ef4444"
              />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <RotaryKnob
                value={processingChain.dynamicControl?.compression?.threshold || -20}
                min={-60}
                max={0}
                label="Threshold"
                unit="dB"
                color="#ef4444"
                disabled={disabled || !processingChain.dynamicControl?.compression?.enabled}
                onChange={(value) => updateChain(['dynamicControl', 'compression', 'threshold'], value)}
              />
              <RotaryKnob
                value={processingChain.dynamicControl?.compression?.ratio || 4}
                min={1}
                max={20}
                step={0.1}
                label="Ratio"
                unit=":1"
                color="#ef4444"
                disabled={disabled || !processingChain.dynamicControl?.compression?.enabled}
                onChange={(value) => updateChain(['dynamicControl', 'compression', 'ratio'], value)}
              />
              <RotaryKnob
                value={processingChain.dynamicControl?.compression?.attack || 5}
                min={0.1}
                max={100}
                step={0.1}
                label="Attack"
                unit="ms"
                color="#ef4444"
                disabled={disabled || !processingChain.dynamicControl?.compression?.enabled}
                onChange={(value) => updateChain(['dynamicControl', 'compression', 'attack'], value)}
              />
              <RotaryKnob
                value={processingChain.dynamicControl?.compression?.release || 50}
                min={10}
                max={1000}
                label="Release"
                unit="ms"
                color="#ef4444"
                disabled={disabled || !processingChain.dynamicControl?.compression?.enabled}
                onChange={(value) => updateChain(['dynamicControl', 'compression', 'release'], value)}
              />
            </div>
          </div>

          {/* Limiting and Normalization in one row */}
          <div style={{ display: 'flex', gap: '16px' }}>
            {/* Limiting */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Limiting
                </span>
                <ToggleSwitch
                  checked={processingChain.dynamicControl?.limiting?.enabled || false}
                  onChange={() => toggleEffect(['dynamicControl', 'limiting'])}
                  disabled={disabled}
                  color="#f59e0b"
                />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <RotaryKnob
                  value={processingChain.dynamicControl?.limiting?.threshold || -1}
                  min={-10}
                  max={0}
                  step={0.1}
                  label="Threshold"
                  unit="dB"
                  color="#f59e0b"
                  disabled={disabled || !processingChain.dynamicControl?.limiting?.enabled}
                  onChange={(value) => updateChain(['dynamicControl', 'limiting', 'threshold'], value)}
                />
                <RotaryKnob
                  value={processingChain.dynamicControl?.limiting?.release || 50}
                  min={10}
                  max={1000}
                  label="Release"
                  unit="ms"
                  color="#f59e0b"
                  disabled={disabled || !processingChain.dynamicControl?.limiting?.enabled}
                  onChange={(value) => updateChain(['dynamicControl', 'limiting', 'release'], value)}
                />
              </div>
            </div>

            {/* Normalization */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Normalization
                </span>
                <ToggleSwitch
                  checked={processingChain.dynamicControl?.normalization?.enabled || false}
                  onChange={() => toggleEffect(['dynamicControl', 'normalization'])}
                  disabled={disabled}
                  color="#10b981"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <RotaryKnob
                  value={processingChain.dynamicControl?.normalization?.targetLevel || -16}
                  min={-30}
                  max={0}
                  label="Target"
                  unit="dB"
                  color="#10b981"
                  disabled={disabled || !processingChain.dynamicControl?.normalization?.enabled}
                  onChange={(value) => updateChain(['dynamicControl', 'normalization', 'targetLevel'], value)}
                />
              </div>
            </div>
          </div>
        </RackUnit>
      </CollapsibleSection>

      {/* EQ Shaping Section */}
      <CollapsibleSection 
        title="EQ" 
        icon="🎛️" 
        expanded={expandedSection === 'eqShaping'}
        onExpandedChange={(expanded) => setExpandedSection(expanded ? 'eqShaping' : null)}
        isActive={
          processingChain.eqShaping?.highPass?.enabled ||
          processingChain.eqShaping?.lowPass?.enabled ||
          false
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Combined EQ Filters */}
          <RackUnit 
            enabled={processingChain.eqShaping?.highPass?.enabled || processingChain.eqShaping?.lowPass?.enabled || false} 
            color="#3b82f6" 
            modelNumber="EQ-03"
          >
            <div style={{ display: 'flex', gap: '16px' }}>
              {/* High-pass Filter */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#f0f0f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    High-pass
                  </span>
                  <ToggleSwitch
                    checked={processingChain.eqShaping?.highPass?.enabled || false}
                    onChange={() => toggleEffect(['eqShaping', 'highPass'])}
                    disabled={disabled}
                    color="#3b82f6"
                  />
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <RotaryKnob
                    value={processingChain.eqShaping?.highPass?.frequency || 80}
                    min={20}
                    max={500}
                    label="Frequency"
                    unit="Hz"
                    color="#3b82f6"
                    disabled={disabled || !processingChain.eqShaping?.highPass?.enabled}
                    onChange={(value) => updateChain(['eqShaping', 'highPass', 'frequency'], value)}
                  />
                  <RotaryKnob
                    value={processingChain.eqShaping?.highPass?.slope || 12}
                    min={6}
                    max={48}
                    step={6}
                    label="Slope"
                    unit="dB"
                    color="#3b82f6"
                    disabled={disabled || !processingChain.eqShaping?.highPass?.enabled}
                    onChange={(value) => updateChain(['eqShaping', 'highPass', 'slope'], value)}
                  />
                </div>
              </div>

              {/* Low-pass Filter */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#f0f0f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Low-pass
                  </span>
                  <ToggleSwitch
                    checked={processingChain.eqShaping?.lowPass?.enabled || false}
                    onChange={() => toggleEffect(['eqShaping', 'lowPass'])}
                    disabled={disabled}
                    color="#8b5cf6"
                  />
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <RotaryKnob
                    value={processingChain.eqShaping?.lowPass?.frequency || 15000}
                    min={5000}
                    max={20000}
                    label="Frequency"
                    unit="Hz"
                    color="#8b5cf6"
                    disabled={disabled || !processingChain.eqShaping?.lowPass?.enabled}
                    onChange={(value) => updateChain(['eqShaping', 'lowPass', 'frequency'], value)}
                  />
                  <RotaryKnob
                    value={processingChain.eqShaping?.lowPass?.slope || 12}
                    min={6}
                    max={48}
                    step={6}
                    label="Slope"
                    unit="dB"
                    color="#8b5cf6"
                    disabled={disabled || !processingChain.eqShaping?.lowPass?.enabled}
                    onChange={(value) => updateChain(['eqShaping', 'lowPass', 'slope'], value)}
                  />
                </div>
              </div>
            </div>
          </RackUnit>

          {/* Parametric EQ Bands */}
          <RackUnit 
            enabled={processingChain.eqShaping?.parametricEQ?.bands?.some((b: any) => b.enabled !== false) || false} 
            color="#4a9eff" 
            modelNumber="PEQ-04"
          >
            <div style={{ 
              fontSize: '10px', 
              fontWeight: 600,
              color: '#f0f0f0',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '16px',
              textAlign: 'center',
            }}>
              Parametric EQ — 4 Bands
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              {(() => {
                const defaultBands = [
                  { frequency: 100, gain: 0, q: 1.0 },
                  { frequency: 500, gain: 0, q: 1.0 },
                  { frequency: 2000, gain: 0, q: 1.0 },
                  { frequency: 8000, gain: 0, q: 1.0 }
                ];
                const bands = processingChain.eqShaping?.parametricEQ?.bands || defaultBands;
                const displayBands = bands.length >= 4 ? bands : [...bands, ...defaultBands.slice(bands.length)];
                
                return displayBands.slice(0, 4).map((band, index) => {
                  const bandColors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6'];
                  const bandColor = bandColors[index % bandColors.length];
                  
                  return (
                    <div key={index} style={{ flex: 1 }}>
                      <div style={{ 
                        fontSize: '9px', 
                        fontWeight: 600,
                        color: bandColor,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginBottom: '8px',
                        textAlign: 'center',
                      }}>
                        Band {index + 1}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                        <RotaryKnob
                          value={band.frequency}
                          min={20}
                          max={20000}
                          label="Freq"
                          unit="Hz"
                          color={bandColor}
                          disabled={disabled}
                          onChange={(value) => {
                            const currentBands = processingChain.eqShaping?.parametricEQ?.bands || defaultBands;
                            const newBands = [...currentBands];
                            while (newBands.length < 4) {
                              newBands.push(defaultBands[newBands.length]);
                            }
                            newBands[index] = { ...newBands[index], frequency: value };
                            updateChain(['eqShaping', 'parametricEQ', 'bands'], newBands);
                          }}
                        />
                        <RotaryKnob
                          value={band.gain}
                          min={-20}
                          max={20}
                          step={0.1}
                          label="Gain"
                          unit="dB"
                          color={bandColor}
                          disabled={disabled}
                          onChange={(value) => {
                            const currentBands = processingChain.eqShaping?.parametricEQ?.bands || defaultBands;
                            const newBands = [...currentBands];
                            while (newBands.length < 4) {
                              newBands.push(defaultBands[newBands.length]);
                            }
                            newBands[index] = { ...newBands[index], gain: value };
                            updateChain(['eqShaping', 'parametricEQ', 'bands'], newBands);
                          }}
                        />
                        <RotaryKnob
                          value={band.q}
                          min={0.1}
                          max={10}
                          step={0.1}
                          label="Q"
                          unit=""
                          color={bandColor}
                          disabled={disabled}
                          onChange={(value) => {
                            const currentBands = processingChain.eqShaping?.parametricEQ?.bands || defaultBands;
                            const newBands = [...currentBands];
                            while (newBands.length < 4) {
                              newBands.push(defaultBands[newBands.length]);
                            }
                            newBands[index] = { ...newBands[index], q: value };
                            updateChain(['eqShaping', 'parametricEQ', 'bands'], newBands);
                          }}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </RackUnit>
        </div>
      </CollapsibleSection>

      {/* Spatial Enhancement Section */}
      <CollapsibleSection 
        title="Reverb" 
        icon="〰️" 
        expanded={expandedSection === 'spatialEnhancement'}
        onExpandedChange={(expanded) => setExpandedSection(expanded ? 'spatialEnhancement' : null)}
        isActive={
          processingChain.spatialEnhancement?.reverb?.enabled ||
          processingChain.spatialEnhancement?.stereoWidth?.enabled ||
          false
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Combined Spatial Effects */}
          <RackUnit 
            enabled={processingChain.spatialEnhancement?.reverb?.enabled || processingChain.spatialEnhancement?.stereoWidth?.enabled || false} 
            color="#06b6d4" 
            modelNumber="SP-04"
          >
            <div style={{ display: 'flex', gap: '16px' }}>
              {/* Reverb */}
              <div style={{ flex: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#f0f0f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Reverb
                  </span>
                  <ToggleSwitch
                    checked={processingChain.spatialEnhancement?.reverb?.enabled || false}
                    onChange={() => toggleEffect(['spatialEnhancement', 'reverb'])}
                    disabled={disabled}
                    color="#06b6d4"
                  />
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <RotaryKnob
                    value={processingChain.spatialEnhancement?.reverb?.roomSize || 0.3}
                    min={0.1}
                    max={1.0}
                    step={0.01}
                    label="Room Size"
                    unit=""
                    color="#06b6d4"
                    disabled={disabled || !processingChain.spatialEnhancement?.reverb?.enabled}
                    onChange={(value) => updateChain(['spatialEnhancement', 'reverb', 'roomSize'], value)}
                  />
                  <RotaryKnob
                    value={processingChain.spatialEnhancement?.reverb?.damping || 0.5}
                    min={0}
                    max={1}
                    step={0.01}
                    label="Damping"
                    unit=""
                    color="#06b6d4"
                    disabled={disabled || !processingChain.spatialEnhancement?.reverb?.enabled}
                    onChange={(value) => updateChain(['spatialEnhancement', 'reverb', 'damping'], value)}
                  />
                  <RotaryKnob
                    value={processingChain.spatialEnhancement?.reverb?.wetLevel || 0.2}
                    min={0}
                    max={1}
                    step={0.01}
                    label="Wet Level"
                    unit="%"
                    color="#06b6d4"
                    disabled={disabled || !processingChain.spatialEnhancement?.reverb?.enabled}
                    onChange={(value) => updateChain(['spatialEnhancement', 'reverb', 'wetLevel'], value)}
                  />
                </div>
              </div>

              {/* Stereo Width */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#f0f0f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Stereo Width
                  </span>
                  <ToggleSwitch
                    checked={processingChain.spatialEnhancement?.stereoWidth?.enabled || false}
                    onChange={() => toggleEffect(['spatialEnhancement', 'stereoWidth'])}
                    disabled={disabled}
                    color="#ec4899"
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <RotaryKnob
                    value={processingChain.spatialEnhancement?.stereoWidth?.width || 1.0}
                    min={0}
                    max={2}
                    step={0.01}
                    label="Width"
                    unit="x"
                    color="#ec4899"
                    disabled={disabled || !processingChain.spatialEnhancement?.stereoWidth?.enabled}
                    onChange={(value) => updateChain(['spatialEnhancement', 'stereoWidth', 'width'], value)}
                  />
                </div>
              </div>
            </div>
          </RackUnit>
        </div>
      </CollapsibleSection>

      {/* Consistency & Mastering Section */}
      <CollapsibleSection 
        title="Master" 
        icon="🎚️" 
        expanded={expandedSection === 'consistencyMastering'}
        onExpandedChange={(expanded) => setExpandedSection(expanded ? 'consistencyMastering' : null)}
        isActive={
          processingChain.consistencyMastering?.loudnessNormalization?.enabled ||
          processingChain.consistencyMastering?.dithering?.enabled ||
          false
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Combined Master Effects */}
          <RackUnit 
            enabled={processingChain.consistencyMastering?.loudnessNormalization?.enabled || processingChain.consistencyMastering?.dithering?.enabled || false} 
            color="#f59e0b" 
            modelNumber="MS-05"
          >
            <div style={{ display: 'flex', gap: '16px' }}>
              {/* Loudness Normalization */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#f0f0f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Loudness (LUFS)
                  </span>
                  <ToggleSwitch
                    checked={processingChain.consistencyMastering?.loudnessNormalization?.enabled || false}
                    onChange={() => toggleEffect(['consistencyMastering', 'loudnessNormalization'])}
                    disabled={disabled}
                    color="#f59e0b"
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <RotaryKnob
                    value={processingChain.consistencyMastering?.loudnessNormalization?.targetLUFS || -16}
                    min={-30}
                    max={0}
                    label="Target"
                    unit="LUFS"
                    color="#f59e0b"
                    disabled={disabled || !processingChain.consistencyMastering?.loudnessNormalization?.enabled}
                    onChange={(value) => updateChain(['consistencyMastering', 'loudnessNormalization', 'targetLUFS'], value)}
                  />
                </div>
              </div>

              {/* Dithering */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#f0f0f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Dithering
                  </span>
                  <ToggleSwitch
                    checked={processingChain.consistencyMastering?.dithering?.enabled || false}
                    onChange={() => toggleEffect(['consistencyMastering', 'dithering'])}
                    disabled={disabled}
                    color="#64748b"
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <select
                      value={processingChain.consistencyMastering?.dithering?.bitDepth || 16}
                      onChange={(e) => updateChain(['consistencyMastering', 'dithering', 'bitDepth'], parseInt(e.target.value))}
                      disabled={disabled || !processingChain.consistencyMastering?.dithering?.enabled}
                      style={{
                        padding: '10px 16px',
                        background: 'linear-gradient(to bottom, #0a0a0a, #000)',
                        color: disabled || !processingChain.consistencyMastering?.dithering?.enabled ? '#555' : '#64748b',
                        border: '1px solid #1a1a1a',
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontFamily: "'Courier New', Consolas, monospace",
                        fontWeight: 600,
                        cursor: disabled || !processingChain.consistencyMastering?.dithering?.enabled ? 'not-allowed' : 'pointer',
                        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.9)',
                        minWidth: '100px',
                      }}
                    >
                      <option value={16}>16-bit</option>
                      <option value={24}>24-bit</option>
                    </select>
                    <div style={{ 
                      marginTop: '8px',
                      fontSize: '11px', 
                      color: '#999',
                      textTransform: 'uppercase',
                      letterSpacing: '0.8px',
                      fontWeight: 500,
                    }}>
                      Bit Depth
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </RackUnit>
        </div>
      </CollapsibleSection>
    </div>
  );
}
