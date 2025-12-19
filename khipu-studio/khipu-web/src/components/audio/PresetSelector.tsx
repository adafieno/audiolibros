/**
 * Audio Preset Selector Component
 * 
 * Allows selection of predefined audio processing presets.
 */

import { AUDIO_PRESETS } from '../../config/audioPresets';
import type { AudioProcessingChain } from '../../types/audio-production';

interface PresetSelectorProps {
  selectedPresetId: string | null;
  customSettingsEnabled: boolean;
  onPresetSelect: (presetId: string) => void;
  onCustomToggle: () => void;
  currentProcessingChain?: AudioProcessingChain;
}

export function PresetSelector({
  selectedPresetId,
  customSettingsEnabled,
  onPresetSelect,
  onCustomToggle,
}: PresetSelectorProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
          Processing Presets
        </h3>
        <button
          onClick={onCustomToggle}
          style={{
            padding: '4px 8px',
            fontSize: '11px',
            background: customSettingsEnabled ? '#4a9eff' : 'transparent',
            color: customSettingsEnabled ? '#fff' : '#999',
            border: '1px solid',
            borderColor: customSettingsEnabled ? '#4a9eff' : '#333',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {customSettingsEnabled ? '✓ Custom' : 'Custom'}
        </button>
      </div>

      {/* Preset Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
        {AUDIO_PRESETS.map((preset) => {
          const isSelected = !customSettingsEnabled && selectedPresetId === preset.id;
          
          return (
            <button
              key={preset.id}
              onClick={() => onPresetSelect(preset.id)}
              disabled={customSettingsEnabled}
              style={{
                padding: '12px',
                textAlign: 'left',
                background: isSelected ? 'linear-gradient(135deg, #4a9eff 0%, #357abd 100%)' : '#1a1a1a',
                border: '1px solid',
                borderColor: isSelected ? '#4a9eff' : '#333',
                borderRadius: '6px',
                cursor: customSettingsEnabled ? 'not-allowed' : 'pointer',
                opacity: customSettingsEnabled ? 0.5 : 1,
                transition: 'all 0.2s',
                boxShadow: isSelected ? '0 4px 12px rgba(74, 158, 255, 0.3)' : 'none',
              }}
            >
              <div style={{ 
                fontSize: '12px', 
                fontWeight: 600, 
                color: isSelected ? '#fff' : '#e0e0e0',
                marginBottom: '4px',
              }}>
                {preset.name}
              </div>
              <div style={{ 
                fontSize: '10px', 
                color: isSelected ? 'rgba(255,255,255,0.8)' : '#999',
                lineHeight: '1.4',
              }}>
                {preset.description}
              </div>
            </button>
          );
        })}
      </div>

      {customSettingsEnabled && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(74, 158, 255, 0.1)',
          border: '1px solid rgba(74, 158, 255, 0.3)',
          borderRadius: '4px',
          fontSize: '11px',
          color: '#4a9eff',
        }}>
          ℹ️ Custom settings active. Changes will not match any preset.
        </div>
      )}
    </div>
  );
}
