// app/src/global.d.ts

export type Primitive = string | number | boolean;

export type JobEvent = {
  event?: 'start' | 'progress' | 'output' | 'done' | string;
  pct?: number;
  note?: string;
  path?: string;
  ok?: boolean;
} & Record<string, unknown>;

export type OptsValue = Primitive | Primitive[];

export interface PlanBuildPayload {
  projectRoot: string;        // <- add this
  chapterId: string;
  infile: string;             // relative to projectRoot
  out: string;                // relative to projectRoot
  opts?: Record<string, OptsValue>; // opts like { dossier: 'dossier', ... } also relative
}

export interface FsReadPayload {
  projectRoot: string; relPath: string; json?: boolean;
}
export interface FsWritePayload {
  projectRoot: string; relPath: string; json?: boolean; content: unknown;
}

export interface KhipuRequestMap {
  'plan:build': PlanBuildPayload;
  'project:choose': undefined;
  'fs:read': FsReadPayload;
  'fs:write': FsWritePayload;
}

export interface KhipuResponseMap {
  'plan:build': number;
  'project:choose': string | null;
  'fs:read': unknown;
  'fs:write': boolean;
}

export interface KhipuBridge {
  call<C extends keyof KhipuRequestMap>(c: C, p: KhipuRequestMap[C]): Promise<KhipuResponseMap[C]>;
  onJob(cb: (data: JobEvent) => void): void;
}

declare global {
  interface Window {
    khipu?: KhipuBridge;
  }
}

export {};
