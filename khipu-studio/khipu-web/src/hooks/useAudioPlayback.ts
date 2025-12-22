/**
 * Unified Audio Playback Hook
 * 
 * Handles audio playback with optional processing chain for all modules.
 * - Checks if audio exists on segment
 * - If not, generates via TTS
 * - Optionally applies processing chain
 * - Manages HTML Audio element playback
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { voicesApi } from '../lib/api/voices';
import { getAudioProcessor, initializeAudioProcessor } from '../services/audioProcessor';
import type { AudioProcessingChain } from '../types/audio-production';

interface AudioSegment {
  segment_id?: string;
  id?: string;
  has_audio?: boolean;
  raw_audio_url?: string;
  text: string;
  voice?: string;
}

interface UseAudioPlaybackOptions {
  projectId: string;
  processingChain?: AudioProcessingChain | null;
}

export function useAudioPlayback({ projectId, processingChain }: UseAudioPlaybackOptions) {
  const [audioCache] = useState(new Map<string, string>());
  const [audioElements] = useState(new Map<string, HTMLAudioElement>());
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourcesRef = useRef(new Map<string, MediaElementAudioSourceNode>());
  const [analyserNodes, setAnalyserNodes] = useState(new Map<string, AnalyserNode>());
  const [splitterNodes, setSplitterNodes] = useState(new Map<string, ChannelSplitterNode>());
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1.0); // Track volume independently (0.0 to 1.0)
  const volumeRef = useRef(1.0); // Ref to avoid stale closures
  const animationFrameRef = useRef<number | null>(null);

  // Keep volumeRef in sync with volume state
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      audioElements.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
    };
  }, [audioElements]);

  const playSegment = useCallback(async (
    segment: AudioSegment,
    voiceId?: string
  ) => {
    const segmentId = segment.segment_id || segment.id;
    if (!segmentId) return;

    // Check if we have an existing audio element for this segment
    const existingAudio = audioElements.get(segmentId);
    
    // If audio exists and is ready, just play/replay it
    if (existingAudio && existingAudio.src && existingAudio.readyState >= 2) {
      // Stop any other playing audio
      audioElements.forEach((audio, id) => {
        if (id !== segmentId) {
          audio.pause();
          audio.currentTime = 0;
        }
      });
      
      // Cancel any existing animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Reset to beginning
      existingAudio.currentTime = 0;
      setCurrentTime(0);
      setPlayingSegmentId(segmentId);
      setIsLoadingAudio(false);
      
      // Set duration if available
      if (existingAudio.duration) {
        setDuration(existingAudio.duration);
      }
      
      // Ensure AudioContext is running
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      const updateTime = () => {
        if (existingAudio && !existingAudio.paused && !existingAudio.ended) {
          setCurrentTime(existingAudio.currentTime);
          animationFrameRef.current = requestAnimationFrame(updateTime);
        }
      };
      
      try {
        setIsPlaying(true);
        await existingAudio.play();
        updateTime();
      } catch (error) {
        console.error('[AudioPlayback] Failed to play existing audio:', error);
        setIsPlaying(false);
        setPlayingSegmentId(null);
      }
      return;
    }

    // Stop any other playing audio
    audioElements.forEach((audio, id) => {
      if (id !== segmentId) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    setPlayingSegmentId(segmentId);
    setIsLoadingAudio(true);

    try {
      // Step 1: Get raw audio from cache or generate (cache by segment ID only)
      let rawAudioUrl = audioCache.get(segmentId);

      if (!rawAudioUrl) {
        console.log('[AudioPlayback] Fetching/generating raw audio for segment:', segmentId);

        let rawAudioBlob: Blob;
        
        // Check if segment has audio URL (prioritize blob storage)
        if (segment.raw_audio_url) {
          // Fetch from blob storage
          console.log('[AudioPlayback] Fetching from storage:', segment.raw_audio_url);
          const response = await fetch(segment.raw_audio_url);
          if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);
          rawAudioBlob = await response.blob();
        } else {
          // Generate via TTS only if no audio URL exists
          if (!voiceId) {
            throw new Error('Voice ID required to generate audio');
          }
          console.log('[AudioPlayback] No audio URL found, generating TTS for segment:', segmentId, 'voice:', voiceId);
          rawAudioBlob = await voicesApi.auditionVoice(projectId, voiceId, segment.text);
        }

        rawAudioUrl = URL.createObjectURL(rawAudioBlob);
        audioCache.set(segmentId, rawAudioUrl);
        console.log('[AudioPlayback] Raw audio cached for segment:', segmentId);
      }

      // Step 2: Apply processing chain if provided (on-the-fly, not cached)
      let finalAudioUrl = rawAudioUrl;
      if (processingChain) {
        console.log('[AudioPlayback] Applying processing chain on-the-fly...');
        await initializeAudioProcessor();
        const processor = getAudioProcessor();

        // Fetch the raw audio blob from the cached URL
        const response = await fetch(rawAudioUrl);
        const rawAudioBlob = await response.blob();
        const arrayBuffer = await rawAudioBlob.arrayBuffer();
        const audioBuffer = await processor.decodeAudio(arrayBuffer);
        
        const processed = await processor.processAudio(audioBuffer, processingChain);
        const processedBlob = await processor.encodeToBlob(processed.buffer);
        
        finalAudioUrl = URL.createObjectURL(processedBlob);
        console.log('[AudioPlayback] Processing complete (not cached)');
      }

      // Step 3: Play audio
      let audio = audioElements.get(segmentId);
      if (!audio) {
        audio = new Audio(finalAudioUrl);
        audio.volume = volumeRef.current;
        audio.load();
        
        await new Promise<void>((resolve) => {
          audio!.onloadedmetadata = () => {
            console.log('[AudioPlayback] Audio metadata loaded');
            resolve();
          };
        });
        
        // Create AudioContext and audio graph BEFORE setting up event handlers
        if (!audioContextRef.current) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          audioContextRef.current = new AudioContextClass();
        }
        
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }
        
        // Check if we already have a source for this audio element (can only create once)
        let existingSource = audioSourcesRef.current.get(segmentId);
        
        if (!existingSource) {
          try {
            const source = audioContextRef.current.createMediaElementSource(audio);
            const analyser = audioContextRef.current.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.8;
            
            // Create channel splitter for stereo analysis
            const splitter = audioContextRef.current.createChannelSplitter(2);
            
            // Connect for playback: source -> destination
            source.connect(audioContextRef.current.destination);
            
            // Connect for analysis: source -> splitter (separate channels)
            //                        source -> analyser (combined)
            source.connect(splitter);
            source.connect(analyser);
            
            audioSourcesRef.current.set(segmentId, source);
            setAnalyserNodes(prev => new Map(prev).set(segmentId, analyser));
            setSplitterNodes(prev => new Map(prev).set(segmentId, splitter));
            
            console.log('[AudioPlayback] Created audio graph for segment:', segmentId);
          } catch (error) {
            console.error('[AudioPlayback] Failed to create audio source:', error);
          }
        } else {
          console.log('[AudioPlayback] Reusing existing audio graph for segment:', segmentId);
        }
        
        audio.onended = () => {
          setIsPlaying(false);
          // Keep playingSegmentId so waveform remains visible
          setCurrentTime(audio!.duration); // Show at end
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
        };
        audio.onerror = (e) => {
          console.error('Failed to play audio for segment:', segmentId, e);
          setIsPlaying(false);
          setPlayingSegmentId(null);
          setIsLoadingAudio(false);
        };
        audioElements.set(segmentId, audio);
        
        // Don't create audio graph yet - wait until after play() starts
      } else {
        // Only update source if URL has actually changed
        if (audio.src !== finalAudioUrl) {
          console.log('[AudioPlayback] Audio URL changed, updating source');
          audio.src = finalAudioUrl;
          audio.volume = volumeRef.current;
          audio.load();
        } else {
          console.log('[AudioPlayback] Reusing existing audio element with same URL');
          audio.volume = volumeRef.current; // Still update volume
        }
      }

      audio.onloadedmetadata = () => {
        setDuration(audio.duration);
      };

      // If metadata is already loaded, set duration immediately
      if (audio.readyState >= 1 && audio.duration) {
        setDuration(audio.duration);
      }

      // Update current time during playback
      const updateTime = () => {
        if (audio && !audio.paused && !audio.ended) {
          setCurrentTime(audio.currentTime);
          animationFrameRef.current = requestAnimationFrame(updateTime);
        }
      };

      setIsPlaying(true);
      setIsLoadingAudio(false);
      await audio.play();
      updateTime();

    } catch (error) {
      console.error('Playback failed:', error);
      setPlayingSegmentId(null);
      setIsPlaying(false);
      setIsLoadingAudio(false);
      throw error;
    }
  }, [projectId, processingChain, audioCache, audioElements, isPlaying, playingSegmentId]);

  const stopPlayback = useCallback(() => {
    if (playingSegmentId) {
      const audio = audioElements.get(playingSegmentId);
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      setIsPlaying(false);
      setPlayingSegmentId(null);
      setCurrentTime(0);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  }, [playingSegmentId, audioElements]);

  const seek = useCallback((time: number) => {
    if (playingSegmentId) {
      const audio = audioElements.get(playingSegmentId);
      if (audio && audio.readyState >= 2) {
        audio.currentTime = time;
        setCurrentTime(time);
        // If audio was paused, resume playback after seek
        if (audio.paused && !isPlaying) {
          setIsPlaying(true);
          audio.play().catch(err => {
            console.error('Failed to resume after seek:', err);
            setIsPlaying(false);
          });
          
          // Restart animation frame for time updates
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
          }
          const updateTime = () => {
            if (audio && !audio.paused && !audio.ended) {
              setCurrentTime(audio.currentTime);
              animationFrameRef.current = requestAnimationFrame(updateTime);
            }
          };
          updateTime();
        }
      }
    }
  }, [playingSegmentId, audioElements, isPlaying]);

  const setVolume = useCallback((vol: number) => {
    volumeRef.current = vol; // Update ref immediately
    setVolumeState(vol);
    // Apply to currently playing audio if any
    if (playingSegmentId) {
      const audio = audioElements.get(playingSegmentId);
      if (audio) {
        audio.volume = vol;
      }
    }
  }, [playingSegmentId, audioElements]);

  const clearCache = useCallback((segmentId?: string) => {
    if (segmentId) {
      // Clear cache for specific segment (raw audio only)
      const url = audioCache.get(segmentId);
      if (url) {
        URL.revokeObjectURL(url);
        audioCache.delete(segmentId);
      }
    } else {
      // Clear all cache
      audioCache.forEach(url => URL.revokeObjectURL(url));
      audioCache.clear();
    }
  }, [audioCache]);

  return {
    isPlaying,
    isLoadingAudio,
    playingSegmentId,
    currentTime,
    duration,
    volume,
    playSegment,
    stopPlayback,
    seek,
    setVolume,
    clearCache,
    currentAudioElement: playingSegmentId ? audioElements.get(playingSegmentId) : null,
    currentAnalyser: playingSegmentId ? analyserNodes.get(playingSegmentId) : null,
    currentSplitter: playingSegmentId ? splitterNodes.get(playingSegmentId) : null,
    audioContext: audioContextRef.current,
  };
}
