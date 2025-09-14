// Audio Production Service
// Handles persistence and management of audio production metadata separate from planning data

import type { 
  ChapterAudioMetadata, 
  AudioProcessingChain,
  SegmentAudioMetadata
} from '../types/audio-production';
import type { PlanChunk } from '../types/plan';

// Additional segment types for audio production - simplified to only sound effects
export interface SfxSegmentData {
  path: string;
  filename: string;
  duration?: number;
  validated?: boolean;
}

export interface AdditionalSegmentRecord {
  id: string;
  displayOrder: number;
  processingChain?: AudioProcessingChain;
}

export interface SfxSegmentRecord extends AdditionalSegmentRecord {
  sfxFile: SfxSegmentData;
}

export interface AdditionalSegmentsData {
  sfxSegments: SfxSegmentRecord[];
}

// Default processing chain factory function
const createDefaultProcessingChain = (): AudioProcessingChain => ({
  noiseCleanup: {
    highPassFilter: {
      enabled: true,
      frequency: "80"
    },
    deClickDeEss: {
      enabled: false,
      intensity: "medium"
    }
  },
  dynamicControl: {
    compression: {
      enabled: true,
      ratio: "2.5:1",
      threshold: -12
    },
    limiter: {
      enabled: true,
      ceiling: -1
    }
  },
  eqShaping: {
    lowMidCut: {
      enabled: false,
      frequency: "200",
      gain: -2
    },
    presenceBoost: {
      enabled: true,
      frequency: "3",
      gain: 1.5
    },
    airLift: {
      enabled: false,
      frequency: "10",
      gain: 1
    }
  },
  spatialEnhancement: {
    reverb: {
      enabled: true,
      type: "room_0.4",
      wetMix: 8
    },
    stereoEnhancer: {
      enabled: false,
      width: 15
    }
  },
  mastering: {
    normalization: {
      enabled: true,
      targetLUFS: "-21"
    },
    peakLimiting: {
      enabled: true,
      maxPeak: -3
    },
    dithering: {
      enabled: false,
      bitDepth: "16"
    }
  }
});

export class AudioProductionService {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Get the audio production config file path for a chapter
   */
  private getChapterAudioConfigPath(chapterId: string): string {
    return `${this.projectPath}/audio/${chapterId}/audio-production.json`;
  }

  /**
   * Get the project-wide audio production config path
   */
  private getProjectAudioConfigPath(): string {
    return `${this.projectPath}/audio-production.json`;
  }

  /**
   * Load existing chapter audio metadata or create default
   */
  async loadChapterAudioMetadata(chapterId: string, planChunks?: PlanChunk[]): Promise<ChapterAudioMetadata> {
    const configPath = this.getChapterAudioConfigPath(chapterId);
    
    try {
      // Try to load existing metadata
      if (window.electron) {
        const existingData = await window.electron.invoke('fs:readFile', configPath) as string;
        if (existingData) {
          return JSON.parse(existingData);
        }
      }
    } catch {
      console.log(`No existing audio metadata for chapter ${chapterId}, creating default`);
    }

    // Create default metadata from plan chunks
    const segments: SegmentAudioMetadata[] = planChunks?.map(chunk => ({
      chunkId: chunk.id,
      // Start with no processing overrides (will use global defaults)
      processingChain: undefined,
      generation: undefined,
      audioFile: undefined,
      quality: undefined,
      overrides: undefined
    })) || [];

    return {
      chapterId,
      globalProcessingChain: createDefaultProcessingChain(),
      segments,
      masterAudio: {
        totalSegments: segments.length,
        completedSegments: 0
      }
    };
  }

  /**
   * Save chapter audio metadata to disk
   */
  async saveChapterAudioMetadata(metadata: ChapterAudioMetadata): Promise<void> {
    const configPath = this.getChapterAudioConfigPath(metadata.chapterId);
    
    // Ensure directory exists
    const dirPath = `${this.projectPath}/audio/${metadata.chapterId}`;
    if (window.electron) {
      await window.electron.invoke('fs:createDirectory', dirPath);
      
      // Save metadata with timestamp
      const dataToSave = {
        ...metadata,
        lastModified: new Date().toISOString()
      };
      
      await window.electron.invoke('fs:writeFile', configPath, JSON.stringify(dataToSave, null, 2));
    }
  }

  /**
   * Update a specific segment's metadata
   */
  async updateSegmentMetadata(
    chapterId: string, 
    chunkId: string, 
    updates: Partial<SegmentAudioMetadata>
  ): Promise<void> {
    const metadata = await this.loadChapterAudioMetadata(chapterId);
    
    const segmentIndex = metadata.segments.findIndex(seg => seg.chunkId === chunkId);
    if (segmentIndex >= 0) {
      metadata.segments[segmentIndex] = {
        ...metadata.segments[segmentIndex],
        ...updates
      };
      
      await this.saveChapterAudioMetadata(metadata);
    }
  }

  /**
   * Mark a segment as having completed audio generation
   */
  async markSegmentAsCompleted(
    chapterId: string, 
    chunkId: string, 
    audioFile: {
      filename: string;
      duration?: number;
      sampleRate?: number;
      bitDepth?: number;
      fileSize?: number;
    }
  ): Promise<void> {
    const metadata = await this.loadChapterAudioMetadata(chapterId);
    
    const segmentIndex = metadata.segments.findIndex(seg => seg.chunkId === chunkId);
    if (segmentIndex >= 0) {
      metadata.segments[segmentIndex] = {
        ...metadata.segments[segmentIndex],
        audioFile: {
          ...audioFile,
          format: "wav" as const
        },
        generation: {
          timestamp: new Date().toISOString(),
          processingVersion: "1.0"
        }
      };

      // Update completion count
      if (metadata.masterAudio) {
        metadata.masterAudio.completedSegments = metadata.segments.filter(
          seg => seg.audioFile !== undefined
        ).length;
        metadata.masterAudio.lastProcessed = new Date().toISOString();
      }
      
      await this.saveChapterAudioMetadata(metadata);
    }
  }

  /**
   * Get completion status for a chapter
   */
  async getChapterCompletionStatus(chapterId: string): Promise<{
    totalSegments: number;
    completedSegments: number;
    completionPercentage: number;
    segmentStatuses: { chunkId: string; hasAudio: boolean; lastGenerated?: string }[];
  }> {
    const metadata = await this.loadChapterAudioMetadata(chapterId);
    
    const segmentStatuses = metadata.segments.map(segment => ({
      chunkId: segment.chunkId,
      hasAudio: segment.audioFile !== undefined,
      lastGenerated: segment.generation?.timestamp
    }));

    const completedCount = segmentStatuses.filter(seg => seg.hasAudio).length;
    
    return {
      totalSegments: metadata.segments.length,
      completedSegments: completedCount,
      completionPercentage: metadata.segments.length > 0 ? (completedCount / metadata.segments.length) * 100 : 0,
      segmentStatuses
    };
  }

  /**
   * Update the global processing chain for a chapter
   */
  async updateGlobalProcessingChain(chapterId: string, processingChain: AudioProcessingChain): Promise<void> {
    const metadata = await this.loadChapterAudioMetadata(chapterId);
    metadata.globalProcessingChain = processingChain;
    await this.saveChapterAudioMetadata(metadata);
  }

  /**
   * Check if audio file exists for a segment
   */
  async checkSegmentAudioExists(chapterId: string, chunkId: string): Promise<boolean> {
    const audioPath = `${this.projectPath}/audio/${chapterId}/${chunkId}.wav`;
    
    if (window.electron) {
      try {
        const exists = await window.electron.invoke('fs:fileExists', audioPath) as boolean;
        return exists;
      } catch {
        return false;
      }
    }
    
    return false;
  }

  /**
   * Initialize audio production for a chapter from plan data
   */
  async initializeFromPlan(chapterId: string, planChunks: PlanChunk[]): Promise<ChapterAudioMetadata> {
    // Load existing metadata or create new
    const metadata = await this.loadChapterAudioMetadata(chapterId, planChunks);
    
    // Check which segments already have audio files
    for (const segment of metadata.segments) {
      const hasAudio = await this.checkSegmentAudioExists(chapterId, segment.chunkId);
      
      if (hasAudio && !segment.audioFile) {
        // File exists but not tracked in metadata - update metadata
        await this.markSegmentAsCompleted(chapterId, segment.chunkId, {
          filename: `${segment.chunkId}.wav`
        });
      }
    }
    
    // Reload to get updated completion count
    return await this.loadChapterAudioMetadata(chapterId, planChunks);
  }

  /**
   * Save per-segment processing chain preferences
   */
  async saveProcessingChains(chapterId: string, processingChains: Record<string, AudioProcessingChain>): Promise<void> {
    const configPath = `${this.projectPath}/audio/${chapterId}/processing-chains.json`;
    
    if (window.khipu) {
      try {
        // Directory will be created automatically by fs:write if needed
        
        // Save processing chains with timestamp
        const dataToSave = {
          chapterId,
          processingChains,
          lastModified: new Date().toISOString(),
          version: "1.0"
        };
        
        await window.khipu.call('fs:write', {
          projectRoot: this.projectPath,
          relPath: `audio/${chapterId}/processing-chains.json`,
          content: JSON.stringify(dataToSave, null, 2)
        });
        
        console.log('💾 Saved processing chains to:', configPath);
      } catch (error) {
        console.error('Failed to save processing chains:', error);
        throw error;
      }
    }
  }

  /**
   * Load per-segment processing chain preferences
   */
  async loadProcessingChains(chapterId: string): Promise<Record<string, AudioProcessingChain>> {
    try {
      const result = await window.khipu!.call('fs:read', {
        projectRoot: this.projectPath,
        relPath: `audio/${chapterId}/processing-chains.json`,
        json: true
      });
      
      if (result && typeof result === 'object' && 'processingChains' in result) {
        console.log('💾 Loaded processing chains from storage');
        return (result as { processingChains: Record<string, AudioProcessingChain> }).processingChains;
      }
    } catch {
      console.log('💾 No saved processing chains found, using defaults');
    }
    
    return {};
  }

  /**
   * Load additional segments (SFX and extra TTS) for a chapter
   */
  async loadAdditionalSegments(chapterId: string): Promise<AdditionalSegmentsData> {
    const configPath = `audio/${chapterId}/additional-segments.json`;
    
    try {
      const result = await window.khipu!.call('fs:read', {
        projectRoot: this.projectPath,
        relPath: configPath,
        json: true
      });
      
      if (result && typeof result === 'object') {
        return result as AdditionalSegmentsData;
      }
    } catch {
      console.log(`No additional segments found for chapter ${chapterId}`);
    }
    
    return {
      sfxSegments: []
    };
  }

  /**
   * Save additional segments (SFX only) for a chapter
   */
  async saveAdditionalSegments(
    chapterId: string, 
    additionalSegments: AdditionalSegmentsData
  ): Promise<void> {
    const configPath = `audio/${chapterId}/additional-segments.json`;
    
    try {
      const dataToSave = {
        ...additionalSegments,
        chapterId,
        lastModified: new Date().toISOString(),
        version: "1.0"
      };
      
      await window.khipu!.call('fs:write', {
        projectRoot: this.projectPath,
        relPath: configPath,
        content: JSON.stringify(dataToSave, null, 2)
      });
      
      console.log(`💾 Saved additional segments for chapter ${chapterId}`);
    } catch (error) {
      console.error('Failed to save additional segments:', error);
      throw error;
    }
  }

  /**
   * Add a new sound effect segment
   */
  async addSfxSegment(
    chapterId: string,
    displayOrder: number,
    sfxFile: SfxSegmentData,
    processingChain?: AudioProcessingChain
  ): Promise<string> {
    const segmentId = `sfx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const additionalSegments = await this.loadAdditionalSegments(chapterId);
    
    additionalSegments.sfxSegments.push({
      id: segmentId,
      displayOrder,
      sfxFile,
      processingChain
    });
    
    // Sort by display order
    additionalSegments.sfxSegments.sort((a, b) => a.displayOrder - b.displayOrder);
    
    await this.saveAdditionalSegments(chapterId, additionalSegments);
    
    return segmentId;
  }

  /**
   * Remove an additional segment
   */
  async removeAdditionalSegment(chapterId: string, segmentId: string): Promise<void> {
    const additionalSegments = await this.loadAdditionalSegments(chapterId);
    
    // Remove from SFX segments only
    additionalSegments.sfxSegments = additionalSegments.sfxSegments.filter(seg => seg.id !== segmentId);
    
    await this.saveAdditionalSegments(chapterId, additionalSegments);
  }

  /**
   * Update display orders for additional segments (after reordering)
   */
  async updateAdditionalSegmentOrders(
    chapterId: string,
    segmentOrders: Array<{ id: string; displayOrder: number }>
  ): Promise<void> {
    const additionalSegments = await this.loadAdditionalSegments(chapterId);
    
    // Update display orders for SFX segments only
    for (const order of segmentOrders) {
      const sfxSegment = additionalSegments.sfxSegments.find(seg => seg.id === order.id);
      if (sfxSegment) {
        sfxSegment.displayOrder = order.displayOrder;
      }
    }
    
    // Sort by display order
    additionalSegments.sfxSegments.sort((a, b) => a.displayOrder - b.displayOrder);
    
    await this.saveAdditionalSegments(chapterId, additionalSegments);
  }
}

export default AudioProductionService;