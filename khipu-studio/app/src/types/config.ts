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
  | { name: "local"; model: string; endpoint: string };

export interface ProjectConfig {
  version: 1;
  language: string;                  // UI/locale for the project (e.g., "es-PE")
  manuscript?: { chapterGlob: string }; // usually analysis/chapters_txt/*.txt
  planning: { maxKb: number; llmAttribution: "on" | "off" };
  ssml: { rate?: string; pitch?: string; breaksMs?: number };
  tts: { engine: TtsEngine; cache: boolean };
  llm: { engine: LlmEngine };
  export: { outputDir: string; platforms: { apple?: boolean; google?: boolean; spotify?: boolean } };
  // Link to app creds (safe default), optional per-project overrides:
  creds?: {
    useAppAzure?: boolean;
    azure?: { key?: string; region?: string };         // only if not using app creds
    useAppOpenAI?: boolean;
    openai?: { apiKey?: string; baseUrl?: string }; 
    paths?: { bookMeta?: string; production?: string };    // only if not using app creds
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
  disclosure_digital_voice?: boolean;
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
