/**
 * Effect Chain Editor Component
 * 
 * Comprehensive audio processing chain editor with hardware-style controls.
 */

import { useCallback, type ReactNode } from 'react';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { RotaryKnob } from './RotaryKnob';
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
        defaultExpanded={false}
        isActive={
          processingChain.noiseCleanup?.noiseReduction?.enabled ||
          processingChain.noiseCleanup?.deEsser?.enabled ||
          processingChain.noiseCleanup?.deClicker?.enabled ||
          false
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Noise Reduction */}
          <RackUnit enabled={processingChain.noiseCleanup?.noiseReduction?.enabled || false} color="#4ade80" modelNumber="NR-01">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Noise Reduction
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={processingChain.noiseCleanup?.noiseReduction?.enabled || false}
                  onChange={() => toggleEffect(['noiseCleanup', 'noiseReduction'])}
                  disabled={disabled}
                  style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                />
                <span style={{ fontSize: '11px', color: '#b0b0b0' }}>Enable</span>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <RotaryKnob
                value={processingChain.noiseCleanup?.noiseReduction?.amount || 0}
                min={0}
                max={100}
                label="Amount"
                color="#4ade80"
                disabled={disabled || !processingChain.noiseCleanup?.noiseReduction?.enabled}
                onChange={(value) => updateChain(['noiseCleanup', 'noiseReduction', 'amount'], value)}
              />
            </div>
          </RackUnit>

          {/* De-esser */}
          <RackUnit enabled={processingChain.noiseCleanup?.deEsser?.enabled || false} color="#fbbf24" modelNumber="DS-02">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                De-esser
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={processingChain.noiseCleanup?.deEsser?.enabled || false}
                  onChange={() => toggleEffect(['noiseCleanup', 'deEsser'])}
                  disabled={disabled}
                  style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                />
                <span style={{ fontSize: '11px', color: '#b0b0b0' }}>Enable</span>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <RotaryKnob
                value={processingChain.noiseCleanup?.deEsser?.threshold || -20}
                min={-40}
                max={0}
                label="Threshold"
                color="#fbbf24"
                disabled={disabled || !processingChain.noiseCleanup?.deEsser?.enabled}
                onChange={(value) => updateChain(['noiseCleanup', 'deEsser', 'threshold'], value)}
              />
            </div>
          </RackUnit>

          {/* De-clicker */}
          <RackUnit enabled={processingChain.noiseCleanup?.deClicker?.enabled || false} color="#8b5cf6" modelNumber="DC-03">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                De-clicker
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={processingChain.noiseCleanup?.deClicker?.enabled || false}
                  onChange={() => toggleEffect(['noiseCleanup', 'deClicker'])}
                  disabled={disabled}
                  style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                />
                <span style={{ fontSize: '11px', color: '#b0b0b0' }}>Enable</span>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <RotaryKnob
                value={processingChain.noiseCleanup?.deClicker?.sensitivity || 50}
                min={0}
                max={100}
                label="Sensitivity"
                color="#8b5cf6"
                disabled={disabled || !processingChain.noiseCleanup?.deClicker?.enabled}
                onChange={(value) => updateChain(['noiseCleanup', 'deClicker', 'sensitivity'], value)}
              />
            </div>
          </RackUnit>
        </div>
      </CollapsibleSection>

      {/* Dynamic Control Section */}
      <CollapsibleSection 
        title="Compressor" 
        icon="⚡" 
        defaultExpanded={false}
        isActive={
          processingChain.dynamicControl?.compression?.enabled ||
          processingChain.dynamicControl?.limiting?.enabled ||
          processingChain.dynamicControl?.normalization?.enabled ||
          false
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Compression */}
          <RackUnit enabled={processingChain.dynamicControl?.compression?.enabled || false} color="#ef4444" modelNumber="CP-04">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Compression
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={processingChain.dynamicControl?.compression?.enabled || false}
                  onChange={() => toggleEffect(['dynamicControl', 'compression'])}
                  disabled={disabled}
                  style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                />
                <span style={{ fontSize: '11px', color: '#b0b0b0' }}>Enable</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <RotaryKnob
                value={processingChain.dynamicControl?.compression?.threshold || -20}
                min={-60}
                max={0}
                label="Threshold"
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
                color="#ef4444"
                disabled={disabled || !processingChain.dynamicControl?.compression?.enabled}
                onChange={(value) => updateChain(['dynamicControl', 'compression', 'attack'], value)}
              />
              <RotaryKnob
                value={processingChain.dynamicControl?.compression?.release || 50}
                min={10}
                max={1000}
                label="Release"
                color="#ef4444"
                disabled={disabled || !processingChain.dynamicControl?.compression?.enabled}
                onChange={(value) => updateChain(['dynamicControl', 'compression', 'release'], value)}
              />
            </div>
          </RackUnit>

          {/* Limiting */}
          <RackUnit enabled={processingChain.dynamicControl?.limiting?.enabled || false} color="#f59e0b" modelNumber="LM-05">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Limiting
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={processingChain.dynamicControl?.limiting?.enabled || false}
                  onChange={() => toggleEffect(['dynamicControl', 'limiting'])}
                  disabled={disabled}
                  style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                />
                <span style={{ fontSize: '11px', color: '#b0b0b0' }}>Enable</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <RotaryKnob
                value={processingChain.dynamicControl?.limiting?.threshold || -1}
                min={-10}
                max={0}
                step={0.1}
                label="Threshold"
                color="#f59e0b"
                disabled={disabled || !processingChain.dynamicControl?.limiting?.enabled}
                onChange={(value) => updateChain(['dynamicControl', 'limiting', 'threshold'], value)}
              />
              <RotaryKnob
                value={processingChain.dynamicControl?.limiting?.release || 50}
                min={10}
                max={1000}
                label="Release"
                color="#f59e0b"
                disabled={disabled || !processingChain.dynamicControl?.limiting?.enabled}
                onChange={(value) => updateChain(['dynamicControl', 'limiting', 'release'], value)}
              />
            </div>
          </RackUnit>

          {/* Normalization */}
          <RackUnit enabled={processingChain.dynamicControl?.normalization?.enabled || false} color="#10b981" modelNumber="NM-06">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Normalization
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={processingChain.dynamicControl?.normalization?.enabled || false}
                  onChange={() => toggleEffect(['dynamicControl', 'normalization'])}
                  disabled={disabled}
                  style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                />
                <span style={{ fontSize: '11px', color: '#b0b0b0' }}>Enable</span>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <RotaryKnob
                value={processingChain.dynamicControl?.normalization?.targetLevel || -16}
                min={-30}
                max={0}
                label="Target"
                color="#10b981"
                disabled={disabled || !processingChain.dynamicControl?.normalization?.enabled}
                onChange={(value) => updateChain(['dynamicControl', 'normalization', 'targetLevel'], value)}
              />
            </div>
          </RackUnit>
        </div>
      </CollapsibleSection>

      {/* EQ Shaping Section */}
      <CollapsibleSection 
        title="EQ" 
        icon="🎛️" 
        defaultExpanded={false}
        isActive={
          processingChain.eqShaping?.highPass?.enabled ||
          processingChain.eqShaping?.lowPass?.enabled ||
          false
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* High-pass Filter */}
          <RackUnit enabled={processingChain.eqShaping?.highPass?.enabled || false} color="#3b82f6" modelNumber="HP-07">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                High-pass Filter
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={processingChain.eqShaping?.highPass?.enabled || false}
                  onChange={() => toggleEffect(['eqShaping', 'highPass'])}
                  disabled={disabled}
                  style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                />
                <span style={{ fontSize: '11px', color: '#b0b0b0' }}>Enable</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <RotaryKnob
                value={processingChain.eqShaping?.highPass?.frequency || 80}
                min={20}
                max={500}
                label="Frequency"
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
                color="#3b82f6"
                disabled={disabled || !processingChain.eqShaping?.highPass?.enabled}
                onChange={(value) => updateChain(['eqShaping', 'highPass', 'slope'], value)}
              />
            </div>
          </RackUnit>

          {/* Low-pass Filter */}
          <RackUnit enabled={processingChain.eqShaping?.lowPass?.enabled || false} color="#8b5cf6" modelNumber="LP-08">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Low-pass Filter
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={processingChain.eqShaping?.lowPass?.enabled || false}
                  onChange={() => toggleEffect(['eqShaping', 'lowPass'])}
                  disabled={disabled}
                  style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                />
                <span style={{ fontSize: '11px', color: '#b0b0b0' }}>Enable</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <RotaryKnob
                value={processingChain.eqShaping?.lowPass?.frequency || 15000}
                min={5000}
                max={20000}
                label="Frequency"
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
                color="#8b5cf6"
                disabled={disabled || !processingChain.eqShaping?.lowPass?.enabled}
                onChange={(value) => updateChain(['eqShaping', 'lowPass', 'slope'], value)}
              />
            </div>
          </RackUnit>

          {/* Parametric EQ info */}
          <div style={{
            padding: '8px 12px',
            background: 'rgba(74, 158, 255, 0.1)',
            border: '1px solid rgba(74, 158, 255, 0.3)',
            borderRadius: '4px',
            fontSize: '11px',
            color: '#4a9eff',
          }}>
            ℹ️ Parametric EQ bands are configured in preset definitions
          </div>
        </div>
      </CollapsibleSection>

      {/* Spatial Enhancement Section */}
      <CollapsibleSection 
        title="Reverb" 
        icon="〰️" 
        defaultExpanded={false}
        isActive={
          processingChain.spatialEnhancement?.reverb?.enabled ||
          processingChain.spatialEnhancement?.stereoWidth?.enabled ||
          false
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Reverb */}
          <RackUnit enabled={processingChain.spatialEnhancement?.reverb?.enabled || false} color="#06b6d4" modelNumber="RV-09">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Reverb
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={processingChain.spatialEnhancement?.reverb?.enabled || false}
                  onChange={() => toggleEffect(['spatialEnhancement', 'reverb'])}
                  disabled={disabled}
                  style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                />
                <span style={{ fontSize: '11px', color: '#b0b0b0' }}>Enable</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <RotaryKnob
                value={processingChain.spatialEnhancement?.reverb?.roomSize || 0.3}
                min={0.1}
                max={1.0}
                step={0.01}
                label="Room Size"
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
                color="#06b6d4"
                disabled={disabled || !processingChain.spatialEnhancement?.reverb?.enabled}
                onChange={(value) => updateChain(['spatialEnhancement', 'reverb', 'wetLevel'], value)}
              />
            </div>
          </RackUnit>

          {/* Stereo Width */}
          <RackUnit enabled={processingChain.spatialEnhancement?.stereoWidth?.enabled || false} color="#ec4899" modelNumber="WD-10">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Stereo Width
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={processingChain.spatialEnhancement?.stereoWidth?.enabled || false}
                  onChange={() => toggleEffect(['spatialEnhancement', 'stereoWidth'])}
                  disabled={disabled}
                  style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                />
                <span style={{ fontSize: '11px', color: '#b0b0b0' }}>Enable</span>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <RotaryKnob
                value={processingChain.spatialEnhancement?.stereoWidth?.width || 1.0}
                min={0}
                max={2}
                step={0.01}
                label="Width"
                color="#ec4899"
                disabled={disabled || !processingChain.spatialEnhancement?.stereoWidth?.enabled}
                onChange={(value) => updateChain(['spatialEnhancement', 'stereoWidth', 'width'], value)}
              />
            </div>
          </RackUnit>
        </div>
      </CollapsibleSection>

      {/* Consistency & Mastering Section */}
      <CollapsibleSection 
        title="Master" 
        icon="🎚️" 
        defaultExpanded={false}
        isActive={
          processingChain.consistencyMastering?.loudnessNormalization?.enabled ||
          processingChain.consistencyMastering?.dithering?.enabled ||
          false
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Loudness Normalization */}
          <RackUnit enabled={processingChain.consistencyMastering?.loudnessNormalization?.enabled || false} color="#f59e0b" modelNumber="LN-11">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Loudness Normalization (LUFS)
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={processingChain.consistencyMastering?.loudnessNormalization?.enabled || false}
                  onChange={() => toggleEffect(['consistencyMastering', 'loudnessNormalization'])}
                  disabled={disabled}
                  style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                />
                <span style={{ fontSize: '11px', color: '#b0b0b0' }}>Enable</span>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <RotaryKnob
                value={processingChain.consistencyMastering?.loudnessNormalization?.targetLUFS || -16}
                min={-30}
                max={0}
                label="Target LUFS"
                color="#f59e0b"
                disabled={disabled || !processingChain.consistencyMastering?.loudnessNormalization?.enabled}
                onChange={(value) => updateChain(['consistencyMastering', 'loudnessNormalization', 'targetLUFS'], value)}
              />
            </div>
          </RackUnit>

          {/* Dithering */}
          <RackUnit enabled={processingChain.consistencyMastering?.dithering?.enabled || false} color="#64748b" modelNumber="DT-12">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Dithering
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={processingChain.consistencyMastering?.dithering?.enabled || false}
                  onChange={() => toggleEffect(['consistencyMastering', 'dithering'])}
                  disabled={disabled}
                  style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                />
                <span style={{ fontSize: '11px', color: '#b0b0b0' }}>Enable</span>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <select
                  value={processingChain.consistencyMastering?.dithering?.bitDepth || 16}
                  onChange={(e) => updateChain(['consistencyMastering', 'dithering', 'bitDepth'], parseInt(e.target.value))}
                  disabled={disabled || !processingChain.consistencyMastering?.dithering?.enabled}
                  style={{
                    padding: '8px 12px',
                    background: '#0d0d0d',
                    color: '#e0e0e0',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: disabled || !processingChain.consistencyMastering?.dithering?.enabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  <option value={16}>16-bit</option>
                  <option value={24}>24-bit</option>
                </select>
                <div style={{ 
                  marginTop: '8px',
                  fontSize: '10px', 
                  color: '#b0b0b0',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  Bit Depth
                </div>
              </div>
            </div>
          </RackUnit>
        </div>
      </CollapsibleSection>
    </div>
  );
}
