// Audio Processing Test Controls
// Debugging component to test and compare audio processing effects

import React, { useState } from 'react';
import { useAudioPreview } from '../hooks/useAudioPreview';
import { createDefaultProcessingChain } from '../lib/audio-production-utils';
import type { AudioProcessingChain } from '../types/audio-production';
import type { Segment } from '../types/plan';
import type { Character } from '../types/character';
import type { ProjectConfig } from '../types/config';

interface AudioProcessingTestControlsProps {
  segment: Segment;
  character: Character;
  projectConfig: ProjectConfig;
}

export const AudioProcessingTestControls: React.FC<AudioProcessingTestControlsProps> = ({
  segment,
  character,
  projectConfig
}) => {
  const audioPreview = useAudioPreview();
  const [isTestingEffects, setIsTestingEffects] = useState(false);

  // Create different processing chain variations for testing
  const noProcessingChain: AudioProcessingChain = {
    noiseCleanup: {
      highPassFilter: { enabled: false, frequency: "80" },
      deClickDeEss: { enabled: false, intensity: "medium" }
    },
    dynamicControl: {
      compression: { enabled: false, ratio: "2.5:1", threshold: -12 },
      limiter: { enabled: false, ceiling: -1 }
    },
    eqShaping: {
      lowMidCut: { enabled: false, frequency: "200", gain: -2 },
      presenceBoost: { enabled: false, frequency: "3", gain: 2 },
      airLift: { enabled: false, frequency: "10", gain: 1 }
    },
    spatialEnhancement: {
      reverb: { enabled: false, type: "room_0.4", wetMix: 8 },
      stereoEnhancer: { enabled: false, width: 10 }
    },
    mastering: {
      normalization: { enabled: false, targetLUFS: "-21" },
      peakLimiting: { enabled: false, maxPeak: -3 },
      dithering: { enabled: false, bitDepth: "16" }
    }
  };

  const defaultChain = createDefaultProcessingChain();

  const handleTestWithoutProcessing = async () => {
    setIsTestingEffects(true);
    console.log('🎵 Testing WITHOUT audio processing effects');
    try {
      await audioPreview.preview(
        `segment_${segment.segment_id}`,
        noProcessingChain,
        0,
        undefined,
        { segment, character, projectConfig }
      );
    } catch (error) {
      console.error('Test without processing failed:', error);
    }
    setIsTestingEffects(false);
  };

  const handleTestWithProcessing = async () => {
    setIsTestingEffects(true);
    console.log('🎛️ Testing WITH default audio processing effects');
    try {
      await audioPreview.preview(
        `segment_${segment.segment_id}`,
        defaultChain,
        0,
        undefined,
        { segment, character, projectConfig }
      );
    } catch (error) {
      console.error('Test with processing failed:', error);
    }
    setIsTestingEffects(false);
  };

  const handleTestWithExaggeratedEffects = async () => {
    setIsTestingEffects(true);
    console.log('🎭 Testing WITH exaggerated audio processing effects');
    try {
      await audioPreview.previewWithExaggeratedEffects(
        `segment_${segment.segment_id}`,
        defaultChain,
        0,
        undefined,
        { segment, character, projectConfig }
      );
    } catch (error) {
      console.error('Test with exaggerated effects failed:', error);
    }
    setIsTestingEffects(false);
  };

  const handleStop = () => {
    audioPreview.stop();
  };

  const handleClearCache = async () => {
    console.log('🗑️ This would clear audio cache - implement if needed');
    // Could implement cache clearing here
  };

  return (
    <div style={{
      padding: '16px',
      border: '2px solid #333',
      borderRadius: '8px',
      backgroundColor: '#f5f5f5',
      margin: '16px',
      fontFamily: 'monospace'
    }}>
      <h3>🔧 Audio Processing Test Controls</h3>
      <p>Use these controls to compare audio with and without processing effects:</p>
      
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <button 
          onClick={handleTestWithoutProcessing}
          disabled={isTestingEffects}
          style={{ 
            padding: '8px 16px', 
            backgroundColor: '#e74c3c', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: isTestingEffects ? 'not-allowed' : 'pointer'
          }}
        >
          🎵 Play RAW (No Processing)
        </button>
        
        <button 
          onClick={handleTestWithProcessing}
          disabled={isTestingEffects}
          style={{ 
            padding: '8px 16px', 
            backgroundColor: '#3498db', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: isTestingEffects ? 'not-allowed' : 'pointer'
          }}
        >
          🎛️ Play with DEFAULT Processing
        </button>
        
        <button 
          onClick={handleTestWithExaggeratedEffects}
          disabled={isTestingEffects}
          style={{ 
            padding: '8px 16px', 
            backgroundColor: '#9b59b6', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: isTestingEffects ? 'not-allowed' : 'pointer'
          }}
        >
          🎭 Play with EXAGGERATED Effects
        </button>
        
        <button 
          onClick={handleStop}
          style={{ 
            padding: '8px 16px', 
            backgroundColor: '#95a5a6', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          ⏹️ Stop
        </button>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <strong>Playback Status:</strong>
        <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
          <li>Playing: {audioPreview.isPlaying ? '▶️ Yes' : '⏸️ No'}</li>
          <li>Loading: {audioPreview.isLoading ? '⏳ Yes' : '✅ No'}</li>
          <li>Duration: {audioPreview.duration.toFixed(1)}s</li>
          <li>Current Time: {audioPreview.currentTime.toFixed(1)}s</li>
          {audioPreview.error && <li style={{ color: 'red' }}>Error: {audioPreview.error}</li>}
        </ul>
      </div>

      <div style={{ fontSize: '12px', color: '#666' }}>
        <strong>Check Console for:</strong>
        <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
          <li>🔧 Processing chain details</li>
          <li>🎛️ Enabled effects list</li>
          <li>⚙️ SoX processing logs</li>
        </ul>
      </div>

      <button 
        onClick={handleClearCache}
        style={{ 
          padding: '4px 8px', 
          backgroundColor: '#e67e22', 
          color: 'white', 
          border: 'none', 
          borderRadius: '4px',
          fontSize: '12px',
          cursor: 'pointer'
        }}
      >
        🗑️ Clear Cache (if needed)
      </button>
    </div>
  );
};

export default AudioProcessingTestControls;