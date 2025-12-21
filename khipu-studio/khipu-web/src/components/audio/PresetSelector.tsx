/**
 * Audio Preset Selector Component
 * 
 * Allows selection of predefined audio processing presets.
 */

import { useState } from 'react';
import { AUDIO_PRESETS } from '../../config/audioPresets';
import type { AudioProcessingChain } from '../../types/audio-production';

interface PresetSelectorProps {
  selectedPresetId: string | null;
  customSettingsEnabled: boolean;
  onPresetSelect: (presetId: string) => void;
  onCustomToggle: () => void;
  onApplyToAll?: () => void;
  customPresets?: Array<{
    id: string;
    name: string;
    description?: string;
    processing_chain: AudioProcessingChain;
  }>;
  presetFilter?: 'all' | 'builtin' | 'custom';
  onFilterChange?: (filter: 'all' | 'builtin' | 'custom') => void;
  onDeletePreset?: (presetId: string) => void;
}

const PRESETS_PER_PAGE = 6;

export function PresetSelector({
  selectedPresetId,
  customSettingsEnabled,
  onPresetSelect,
  onCustomToggle,
  onApplyToAll,
  customPresets = [],
  presetFilter = 'all',
  onFilterChange,
  onDeletePreset,
}: PresetSelectorProps) {
  const [currentPage, setCurrentPage] = useState(1);
  
  // Combine built-in and custom presets
  const allPresets = [
    ...AUDIO_PRESETS.map(p => ({ ...p, isCustom: false })),
    ...customPresets.map(cp => ({
      id: cp.id,
      name: cp.name,
      description: cp.description || 'Custom preset',
      processingChain: cp.processing_chain,
      isCustom: true,
      icon: (cp as any).icon || '⚙️', // Default icon for custom presets
    }))
  ];
  
  // Apply filter
  const filteredPresets = allPresets.filter(p => {
    if (presetFilter === 'builtin') return !p.isCustom;
    if (presetFilter === 'custom') return p.isCustom;
    return true; // 'all'
  });
  
  const totalPages = Math.ceil(filteredPresets.length / PRESETS_PER_PAGE);
  const startIndex = (currentPage - 1) * PRESETS_PER_PAGE;
  const endIndex = startIndex + PRESETS_PER_PAGE;
  const currentPresets = filteredPresets.slice(startIndex, endIndex);
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Filter Tabs */}
      {onFilterChange && (
        <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #333', paddingBottom: '8px' }}>
          {['all', 'builtin', 'custom'].map((filter) => (
            <button
              key={filter}
              onClick={() => {
                onFilterChange(filter as 'all' | 'builtin' | 'custom');
                setCurrentPage(1);
              }}
              style={{
                padding: '4px 12px',
                fontSize: '11px',
                background: presetFilter === filter ? '#4a9eff' : 'transparent',
                color: presetFilter === filter ? '#fff' : '#999',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textTransform: 'capitalize',
              }}
            >
              {filter === 'builtin' ? 'Built-in' : filter}
            </button>
          ))}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
          Processing Presets
        </h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          {/* Apply to All Button */}
          {onApplyToAll && (
            <button
              onClick={onApplyToAll}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                background: '#4a9eff',
                color: '#fff',
                border: '1px solid #4a9eff',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#5aa9ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#4a9eff';
              }}
            >
              Apply to All
            </button>
          )}
          <button
            onClick={onCustomToggle}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              background: '#4a9eff',
              color: '#fff',
              border: '1px solid #4a9eff',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#5aa9ff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#4a9eff';
            }}
          >
            Customize
          </button>
        </div>
      </div>

      {/* Preset Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
        {currentPresets.map((preset) => {
          const isSelected = !customSettingsEnabled && selectedPresetId === preset.id;
          
          return (
            <button
              key={preset.id}
              onClick={() => onPresetSelect(preset.id)}
              disabled={customSettingsEnabled}
              style={{
                padding: '16px',
                textAlign: 'left',
                background: isSelected ? 'linear-gradient(135deg, #4a9eff 0%, #357abd 100%)' : '#1a1a1a',
                border: '1px solid',
                borderColor: isSelected ? '#4a9eff' : '#333',
                borderRadius: '6px',
                cursor: customSettingsEnabled ? 'not-allowed' : 'pointer',
                opacity: customSettingsEnabled ? 0.5 : 1,
                transition: 'all 0.2s',
                boxShadow: isSelected ? '0 4px 12px rgba(74, 158, 255, 0.3)' : 'none',
                flex: 1,
                minHeight: 0,
              }}
            >
              <div style={{ 
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                marginBottom: '4px',
                gap: '8px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flex: 1,
                }}>
                  {preset.isCustom && preset.icon && (
                    <span style={{ fontSize: '16px' }}>{preset.icon}</span>
                  )}
                  <span style={{ 
                    fontSize: '13px', 
                    fontWeight: 600, 
                    color: isSelected ? '#fff' : '#e0e0e0',
                  }}>
                    {preset.name}
                  </span>
                  {preset.isCustom && (
                    <span style={{ 
                      fontSize: '9px', 
                      padding: '2px 6px', 
                      background: 'rgba(16, 185, 129, 0.2)',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      borderRadius: '3px',
                      color: '#10b981',
                      fontWeight: 500,
                    }}>
                      CUSTOM
                    </span>
                  )}
                </div>
                {preset.isCustom && onDeletePreset && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePreset(preset.id);
                    }}
                    style={{
                      padding: '2px 6px',
                      fontSize: '10px',
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontWeight: 500,
                      transition: 'all 0.2s',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div style={{ 
                fontSize: '11px', 
                color: isSelected ? 'rgba(255,255,255,0.8)' : '#999',
                lineHeight: '1.4',
              }}>
                {preset.description}
              </div>
            </button>
          );
        })}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: '8px',
          padding: '8px 0'
        }}>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              background: currentPage === 1 ? '#1a1a1a' : '#2a2a2a',
              color: currentPage === 1 ? '#666' : '#e0e0e0',
              border: '1px solid #333',
              borderRadius: '4px',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
            }}
          >
            ← Previous
          </button>
          <span style={{ fontSize: '11px', color: '#999' }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              background: currentPage === totalPages ? '#1a1a1a' : '#2a2a2a',
              color: currentPage === totalPages ? '#666' : '#e0e0e0',
              border: '1px solid #333',
              borderRadius: '4px',
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
            }}
          >
            Next →
          </button>
        </div>
      )}

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
