/**
 * Hook for using audio player programmatically
 */

import { useState } from 'react';
import type { AudioProcessingChain } from '../types/audio-production';

export function useAudioPlayer() {
  const [audioData, setAudioData] = useState<ArrayBuffer | null>(null);
  const [processingChain, setProcessingChain] = useState<AudioProcessingChain | undefined>();

  return {
    audioData,
    processingChain,
    loadAudio: setAudioData,
    updateProcessingChain: setProcessingChain,
  };
}
