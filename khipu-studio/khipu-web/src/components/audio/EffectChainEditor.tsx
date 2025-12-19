/**
 * Effect Chain Editor Component
 * 
 * Comprehensive audio processing chain editor with hardware-style controls.
 */

import { useCallback } from 'react';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { RotaryKnob } from './RotaryKnob';
import type { AudioProcessingChain } from '../../types/audio-production';

interface EffectChainEditorProps {
  processingChain: AudioProcessingChain;
  onChange: (chain: AudioProcessingChain) => void;
  disabled?: boolean;
}

export function EffectChainEditor({
  processingChain,
  onChange,
  disabled = false,
}: EffectChainEditorProps) {
  
  // Helper to update nested processing chain values
  const updateChain = useCallback((path: string[], value: unknown) => {
    const newChain = JSON.parse(JSON.stringify(processingChain));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = newChain;
    
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    
    current[path[path.length - 1]] = value;
    onChange(newChain);
  }, [processingChain, onChange]);

  // Toggle effect enabled state
  const toggleEffect = useCallback((path: string[]) => {
    const newChain = JSON.parse(JSON.stringify(processingChain));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = newChain;
    
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    
    const lastKey = path[path.length - 1];
    current[lastKey].enabled = !current[lastKey].enabled;
    onChange(newChain);
  }, [processingChain, onChange]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', opacity: disabled ? 0.6 : 1 }}>
      {/* Noise Cleanup Section */}
      <CollapsibleSection title="Noise Cleanup" defaultExpanded={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Noise Reduction */}
          <div style={{ 
            padding: '12px', 
            background: '#1a1a1a', 
            borderRadius: '4px',
            border: '1px solid #333',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#e0e0e0' }}>
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
                <span style={{ fontSize: '11px', color: '#999' }}>Enable</span>
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
          </div>

          {/* De-esser */}
          <div style={{ 
            padding: '12px', 
            background: '#1a1a1a', 
            borderRadius: '4px',
            border: '1px solid #333',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#e0e0e0' }}>
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
                <span style={{ fontSize: '11px', color: '#999' }}>Enable</span>
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
          </div>

          {/* De-clicker */}
          <div style={{ 
            padding: '12px', 
            background: '#1a1a1a', 
            borderRadius: '4px',
            border: '1px solid #333',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#e0e0e0' }}>
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
                <span style={{ fontSize: '11px', color: '#999' }}>Enable</span>
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
          </div>
        </div>
      </CollapsibleSection>

      {/* Dynamic Control Section */}
      <CollapsibleSection title="Dynamic Control" defaultExpanded={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Compression */}
          <div style={{ 
            padding: '12px', 
            background: '#1a1a1a', 
            borderRadius: '4px',
            border: '1px solid #333',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#e0e0e0' }}>
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
                <span style={{ fontSize: '11px', color: '#999' }}>Enable</span>
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
          </div>

          {/* Limiting */}
          <div style={{ 
            padding: '12px', 
            background: '#1a1a1a', 
            borderRadius: '4px',
            border: '1px solid #333',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#e0e0e0' }}>
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
                <span style={{ fontSize: '11px', color: '#999' }}>Enable</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <RotaryKnob
                value={processingChain.dynamicControl?.limiting?.threshold || -1}
                min={-10}
                max={0}
                step={0.1}
                label="Threshold"
                color="#fbbf24"
                disabled={disabled || !processingChain.dynamicControl?.limiting?.enabled}
                onChange={(value) => updateChain(['dynamicControl', 'limiting', 'threshold'], value)}
              />
              <RotaryKnob
                value={processingChain.dynamicControl?.limiting?.release || 50}
                min={10}
                max={1000}
                label="Release"
                color="#fbbf24"
                disabled={disabled || !processingChain.dynamicControl?.limiting?.enabled}
                onChange={(value) => updateChain(['dynamicControl', 'limiting', 'release'], value)}
              />
            </div>
          </div>

          {/* Normalization */}
          <div style={{ 
            padding: '12px', 
            background: '#1a1a1a', 
            borderRadius: '4px',
            border: '1px solid #333',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#e0e0e0' }}>
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
                <span style={{ fontSize: '11px', color: '#999' }}>Enable</span>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <RotaryKnob
                value={processingChain.dynamicControl?.normalization?.targetLevel || -16}
                min={-30}
                max={0}
                label="Target"
                color="#4a9eff"
                disabled={disabled || !processingChain.dynamicControl?.normalization?.enabled}
                onChange={(value) => updateChain(['dynamicControl', 'normalization', 'targetLevel'], value)}
              />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* EQ Shaping Section */}
      <CollapsibleSection title="EQ Shaping" defaultExpanded={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* High-pass Filter */}
          <div style={{ 
            padding: '12px', 
            background: '#1a1a1a', 
            borderRadius: '4px',
            border: '1px solid #333',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#e0e0e0' }}>
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
                <span style={{ fontSize: '11px', color: '#999' }}>Enable</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <RotaryKnob
                value={processingChain.eqShaping?.highPass?.frequency || 80}
                min={20}
                max={500}
                label="Frequency"
                color="#4ade80"
                disabled={disabled || !processingChain.eqShaping?.highPass?.enabled}
                onChange={(value) => updateChain(['eqShaping', 'highPass', 'frequency'], value)}
              />
              <RotaryKnob
                value={processingChain.eqShaping?.highPass?.slope || 12}
                min={6}
                max={48}
                step={6}
                label="Slope"
                color="#4ade80"
                disabled={disabled || !processingChain.eqShaping?.highPass?.enabled}
                onChange={(value) => updateChain(['eqShaping', 'highPass', 'slope'], value)}
              />
            </div>
          </div>

          {/* Low-pass Filter */}
          <div style={{ 
            padding: '12px', 
            background: '#1a1a1a', 
            borderRadius: '4px',
            border: '1px solid #333',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#e0e0e0' }}>
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
                <span style={{ fontSize: '11px', color: '#999' }}>Enable</span>
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
          </div>

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
      <CollapsibleSection title="Spatial Enhancement" defaultExpanded={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Reverb */}
          <div style={{ 
            padding: '12px', 
            background: '#1a1a1a', 
            borderRadius: '4px',
            border: '1px solid #333',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#e0e0e0' }}>
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
                <span style={{ fontSize: '11px', color: '#999' }}>Enable</span>
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
          </div>

          {/* Stereo Width */}
          <div style={{ 
            padding: '12px', 
            background: '#1a1a1a', 
            borderRadius: '4px',
            border: '1px solid #333',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#e0e0e0' }}>
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
                <span style={{ fontSize: '11px', color: '#999' }}>Enable</span>
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
          </div>
        </div>
      </CollapsibleSection>

      {/* Consistency & Mastering Section */}
      <CollapsibleSection title="Consistency & Mastering" defaultExpanded={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Loudness Normalization */}
          <div style={{ 
            padding: '12px', 
            background: '#1a1a1a', 
            borderRadius: '4px',
            border: '1px solid #333',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#e0e0e0' }}>
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
                <span style={{ fontSize: '11px', color: '#999' }}>Enable</span>
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
          </div>

          {/* Dithering */}
          <div style={{ 
            padding: '12px', 
            background: '#1a1a1a', 
            borderRadius: '4px',
            border: '1px solid #333',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#e0e0e0' }}>
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
                <span style={{ fontSize: '11px', color: '#999' }}>Enable</span>
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
                  color: '#999',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  Bit Depth
                </div>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
