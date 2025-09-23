// app/src/global.d.ts
import type { AppConfig } from "./types/config";

export type Primitive = string | number | boolean;

export type JobEvent = {
  event?: "start" | "progress" | "output" | "done" | string;
  pct?: number;
  note?: string;
  path?: string;
  ok?: boolean;
} & Record<string, unknown>;

export interface AudioCacheMetadata {
  voiceOptions: {
    engine: string;
    id: string;
    locale?: string;
  };
  createdAt: number;
  accessedAt: number;
  expiresAt: number;
  originalKey?: string; // For mapping hashed filenames back to original cache keys
}

export type OptsValue = Primitive | Primitive[];

export interface PlanBuildPayload {
  projectRoot: string;
  chapterId: string;
  infile: string; // relative to projectRoot
  out: string;    // relative to projectRoot
  opts?: Record<string, OptsValue>;
}

export interface ChapterItem {
  id: string;        // "ch01"
  title: string;     // title from structure or first line
  relPath: string;   // "analysis/chapters_txt/ch01.txt"
  words: number;
}

export interface KhipuRequestMap {
  // App
  "app:locale":        { in: undefined; out: string };
  "appConfig:get":     { in: undefined; out: AppConfig };
  "appConfig:set":     { in: AppConfig;  out: boolean };

  // Projects
  "project:listRecents":   { in: undefined; out: { path: string; name: string }[] };
  "project:browseForParent":{ in: undefined; out: string | null };
  "project:choose":         { in: undefined; out: string | null };
  "project:create":         { in: { parentDir: string; name: string }; out: { path: string } | null };
  "project:open":           { in: { path: string }; out: boolean };

  // FS
  "fs:read":    { in: { projectRoot: string; relPath: string; json?: boolean }; out: unknown };
  "fs:write":   { in: { projectRoot: string; relPath: string; json?: boolean; content: unknown }; out: boolean };
  "fs:writeBinary": { in: { projectRoot: string; relPath: string; content: number[] }; out: boolean };
  "fs:readJson":{ in: { root: string; rel: string }; out: { data: unknown; path: string; raw: string } };
  "fs:checkFileExists": { in: { filePath: string }; out: boolean };
  "fs:cleanupChapterFiles": { in: { projectRoot: string; chapterId: string }; out: { success: boolean; deletedCount: number; error?: string } };

  // File operations
  "file:exists": { in: string; out: boolean };
  "file:chooseImage": { in: undefined; out: string | null };
  "file:validateAndCopyImage": { 
    in: { filePath: string; projectRoot: string }; 
    out: { success: boolean; fileName?: string; dimensions?: { width: number; height: number }; error?: string; warning?: string } 
  };
  "file:getImageDataUrl": {
    in: { projectRoot: string; fileName: string };
    out: { success: boolean; dataUrl?: string; error?: string }
  };

  // Audio Cache
  "audioCache:read": { 
    in: { key: string }; 
    out: { success: boolean; audioData?: string; metadata?: AudioCacheMetadata; error?: string } 
  };
  "audioCache:write": { 
    in: { key: string; audioData: string; metadata: AudioCacheMetadata }; 
    out: { success: boolean; error?: string } 
  };
  "audioCache:list": { 
    in: undefined; 
    out: { success: boolean; entries?: { key: string; metadata: AudioCacheMetadata }[]; error?: string } 
  };
  "audioCache:delete": { 
    in: { key: string }; 
    out: { success: boolean; error?: string } 
  };
  "audioCache:path": { 
    in: string; 
    out: string | null 
  };
  "audioCache:clear": { 
    in: undefined; 
    out: { success: boolean; error?: string } 
  };

  // Plan
  "plan:build": { in: PlanBuildPayload; out: number };

  // Manuscript import
  "manuscript:chooseDocx": { in: undefined; out: string | null };
  "manuscript:parse": { in: { projectRoot: string; docxPath: string }; out: { code: number } };

  // Chapters list/read/write
  "chapters:list": { in: { projectRoot: string }; out: ChapterItem[] };
  "chapter:read":  { in: { projectRoot: string; relPath: string }; out: { text: string } };
  "chapter:write": { in: { projectRoot: string; relPath: string; text: string }; out: boolean };

  // Audio processing
  "audio:process": { 
    in: {
      id: string;
      inputPath: string;
      outputPath: string;
      processingChain: import("./types/audio-production").AudioProcessingChain;
      tempDir?: string;
    };
    out: {
      success: boolean;
      outputPath?: string;
      error?: string;
      duration?: number;
      fileSize?: number;
      cached?: boolean;
    };
  };
  "audio:info": { 
    in: string;
    out: {
      duration: number;
      channels: number;
      sampleRate: number;
      bitRate: number;
      format: string;
    };
  };
  "audio:cache:has": { in: string; out: boolean };
  "audio:cache:path": { in: string; out: string | null };
  "audio:cancel": { in: string; out: boolean };
  "audio:available": { in: undefined; out: boolean };

  // File system
  "fs:readAudioFile": { in: string | { projectRoot?: string; filePath: string }; out: ArrayBuffer };
  
  // Audio conversion and import
  "audio:convertAndSave": {
    in: {
      projectRoot: string;
      audioData: number[];
      filename: string;
      targetPath: string;
    };
    out: {
      success: boolean;
      savedPath?: string;
      sizeBytes?: number;
      error?: string;
    };
  };
  
  // Generate placeholder audio for testing
  "audio:generateSegmentPlaceholder": {
    in: {
      projectRoot: string;
      chapterId: string;
      chunkId: string;
      text: string;
      voice: string;
    };
    out: {
      success: boolean;
      outputPath?: string;
      duration?: number;
      sizeBytes?: number;
      error?: string;
      requiresTtsGeneration?: boolean;
      projectRoot?: string;
      chapterId?: string;
      chunkId?: string;
      text?: string;
      voice?: string;
    };
  };

  // Save TTS audio data to project directory
  "audio:saveTtsToProject": {
    in: {
      projectRoot: string;
      chapterId: string;
      chunkId: string;
      audioData: string; // base64 encoded audio data
      text: string;
    };
    out: {
      success: boolean;
      outputPath?: string;
      duration?: number;
      sizeBytes?: number;
      error?: string;
    };
  };
  
  // Audio chapter concatenation
  "audio:concatenateChapter": {
    in: {
      projectRoot: string;
      chapterId: string;
      segments: Array<{
        chunkId: string;
        segmentType: 'plan' | 'sfx';
        sfxFile?: {
          path: string;
          filename: string;
        };
      }>;
      outputFileName?: string;
    };
    out: {
      success: boolean;
      outputPath?: string;
      fullPath?: string;
      sizeBytes?: number;
      duration?: number;
      segmentCount?: number;
      error?: string;
    };
  };
  
  // Check if complete chapter audio file exists
  "audio:checkChapterComplete": {
    in: {
      projectRoot: string;
      chapterId: string;
    };
    out: {
      exists: boolean;
      filePath?: string;
      sizeBytes?: number;
      modifiedTime?: string;
      error?: string;
    };
  };

  // Simple segment audio generation
  "audio:generateSegmentSimple": {
    in: {
      projectRoot: string;
      chapterId: string;
      segment: {
        chunkId: string | number;
        text: string;
        voice: string;
        segmentType: string;
        sfxFile?: {
          path: string;
          filename: string;
        };
        processingChain?: import("./types/audio-production").AudioProcessingChain;
      };
      projectConfig: unknown;
      characters: unknown;
    };
    out: {
      success: boolean;
      error?: string;
      outputPath?: string;
      sizeBytes?: number;
      duration?: number;
      message?: string;
    };
  };
  
  // SoX Audio Processing
  "audioProcessor:processAudio": {
    in: {
      audioUrl: string;
      processingChain: import("./types/audio-production").AudioProcessingChain;
      cacheKey: string;
    };
    out: {
      success: boolean;
      outputPath?: string;
      error?: string;
      duration?: number;
      fileSize?: number;
    };
  };
  "audioProcessor:getCachedAudioPath": { in: string; out: string | null };
}

export interface Khipu {
  call<K extends keyof KhipuRequestMap>(
    key: K,
    payload: KhipuRequestMap[K]["in"]
  ): Promise<KhipuRequestMap[K]["out"]>;
  onJob(cb: (e: JobEvent) => void): void;
  characters: {
    detect(projectRoot: string): Promise<unknown>;
    assignToSegments(projectRoot: string, payload: unknown): Promise<unknown>;
    onProgress(callback: (progress: {current: number, total: number}) => void): void;
    onLog(callback: (log: string) => void): void;
    onAssignmentProgress(callback: (progress: {current: number, total?: string}) => void): void;
  };
  fileExists(filePath: string): Promise<boolean>;
}

export interface ChapterItem {
  id: string;           // "ch01"
  title: string;        // from dossier or first line
  relPath: string;      // e.g. "analysis/chapters_txt/ch01.txt"
  words: number;
}

declare global {
  interface Window { khipu?: Khipu; }
    interface KhipuRequestMap {
    // Manuscript
    "manuscript:chooseDocx": { in: undefined; out: string | null };
    "manuscript:parse": { in: { projectRoot: string; docxPath: string }; out: { code: number } };

    // Chapters
    "chapters:list": { in: { projectRoot: string }; out: ChapterItem[] };
    "chapter:read": { in: { projectRoot: string; relPath: string }; out: { text: string } };
    "chapter:write": { in: { projectRoot: string; relPath: string; text: string }; out: boolean };
  }
}

declare global {
  interface Window {
    electron: {
      invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    };
  }
}

export {};
