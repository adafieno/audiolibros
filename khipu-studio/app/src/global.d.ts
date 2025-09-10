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

  // File operations
  "file:chooseImage": { in: undefined; out: string | null };
  "file:validateAndCopyImage": { 
    in: { filePath: string; projectRoot: string }; 
    out: { success: boolean; fileName?: string; dimensions?: { width: number; height: number }; error?: string; warning?: string } 
  };
  "file:getImageDataUrl": {
    in: { projectRoot: string; fileName: string };
    out: { success: boolean; dataUrl?: string; error?: string }
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
}

export interface Khipu {
  call<K extends keyof KhipuRequestMap>(
    key: K,
    payload: KhipuRequestMap[K]["in"]
  ): Promise<KhipuRequestMap[K]["out"]>;
  onJob(cb: (e: JobEvent) => void): void;
  characters: {
    detect(projectRoot: string): Promise<unknown>;
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
