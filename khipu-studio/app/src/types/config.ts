export type Theme = "system" | "dark" | "light";

export interface AppConfig {
  version: 1;
  theme: Theme;
  telemetry: boolean;
  recentProjects: string[];          // maintained by app
  // Optional default credentials (NOT used unless user opts in per project)
  creds?: {
    azure?: { key?: string; region?: string };
    openai?: { apiKey?: string; baseUrl?: string };
  };
  defaults?: {
    language?: string;               // e.g., "es-PE"
  };
}

export type TtsEngine = 
  | { name: "azure"; voice: string; style?: string; role?: string }
  | { name: "elevenlabs"; voiceId: string }
  | { name: "local"; model?: string };

export type LlmEngine = 
  | { name: "openai"; model: string; baseUrl?: string }
  | { name: "azure-openai"; model: string; endpoint: string; apiVersion?: string }
  | { name: "local"; model: string; endpoint: string };

export interface ProjectConfig {
  version: 1;
  language: string;                  // UI/locale for the project (e.g., "es-PE")
  bookMeta?: BookMeta;               // Book metadata information
  manuscript?: { chapterGlob: string }; // usually analysis/chapters_txt/*.txt
  planning: { maxKb: number; pauses?: { sentence?: number; paragraph?: number; chapter?: number; } };
  ssml: { breaksMs?: number };
  tts: { engine: TtsEngine; cache: boolean };
  llm: { engine: LlmEngine };
  export: { outputDir: string; platforms: { apple?: boolean; google?: boolean; spotify?: boolean } };
  // Credentials organized by service
  creds?: {
    tts?: {
      useAppAzure?: boolean;
      azure?: { key?: string; region?: string };
    };
    llm?: {
      useAppOpenAI?: boolean;
      openai?: { apiKey?: string; baseUrl?: string };
      azureOpenAI?: { apiKey?: string; endpoint?: string; apiVersion?: string };
    };
  };
  // Workflow completion tracking
  workflow?: {
    project?: { complete?: boolean; completedAt?: string };
    manuscript?: { complete?: boolean; completedAt?: string };
    casting?: { complete?: boolean; completedAt?: string };
    characters?: { complete?: boolean; completedAt?: string };
    dossier?: { complete?: boolean; completedAt?: string };
    planning?: { complete?: boolean; completedAt?: string };
    ssml?: { complete?: boolean; completedAt?: string };
    voice?: { complete?: boolean; completedAt?: string };
    export?: { complete?: boolean; completedAt?: string };
  };
}

export interface BookMeta {
  title: string;
  subtitle?: string;
  authors: string[];
  narrators?: string[];
  language: string; // e.g., "es-PE"
  description?: string;
  keywords?: string[];
  categories?: string[];
  publisher?: string;
  publication_date?: string; // ISO date
  rights?: string;
  series?: { name?: string; number?: number | null };
  sku?: string;
  isbn?: string;
  coverImage?: string; // Path to cover image (3000x3000 JPEG)
  disclosure_digital_voice?: boolean;
  llmAttribution?: "on" | "off"; // Moved from planning settings
}

export interface ProductionSettings {
  ssml: {
    target_minutes: number;
    hard_cap_minutes: number;
    max_kb_per_request: number;
    default_voice: string;
    default_stylepack?: string;
    wpm: number;
    locale: string;
  };
  tts: { timeout_s: number; retries: number; max_workers: number };
  concat: { gap_ms: number; sr_hz: number; channels: 1 | 2; sample_width_bytes: 1 | 2 | 3 | 4 };
  enhance: { enable_deesser: boolean; enable_tilt: boolean; enable_expander: boolean };
  master: { rms_target_dbfs: number; peak_ceiling_dbfs: number };
  packaging: {
    apple?: { aac_bitrate: string };
    gplay_spotify?: { mp3_bitrate: string; flac: boolean; sr_hz: number; channels: 1 | 2 };
  };
}
