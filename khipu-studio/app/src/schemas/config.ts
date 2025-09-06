import { z } from "zod";
import type { AppConfig, ProjectConfig, BookMeta, ProductionSettings } from "../types/config";


export const appConfigSchema = z.object({
  version: z.literal(1),
  theme: z.enum(["system","dark","light"]).default("dark"),
  telemetry: z.boolean().default(false),
  recentProjects: z.array(z.string()).default([]),
  creds: z.object({
    azure: z.object({ key: z.string().optional(), region: z.string().optional() }).optional(),
    openai: z.object({ apiKey: z.string().optional(), baseUrl: z.string().optional() }).optional(),
  }).optional(),
  defaults: z.object({ language: z.string().optional() }).optional(),
});

export const projectConfigSchema = z.object({
  version: z.literal(1),
  language: z.string().default("es-PE"),
  manuscript: z.object({ chapterGlob: z.string().default("analysis/chapters_txt/*.txt") }).optional(),
  planning: z.object({ maxKb: z.number().int().positive().default(48), llmAttribution: z.enum(["on","off"]).default("off") }),
  ssml: z.object({ rate: z.string().optional(), pitch: z.string().optional(), breaksMs: z.number().int().nonnegative().optional() }),
  tts: z.object({
    engine: z.union([
      z.object({ name: z.literal("azure"), voice: z.string(), style: z.string().optional(), role: z.string().optional() }),
      z.object({ name: z.literal("elevenlabs"), voiceId: z.string() }),
      z.object({ name: z.literal("local"), model: z.string().optional() }),
    ]),
    cache: z.boolean().default(true),
  }),
  llm: z.object({
    engine: z.union([
      z.object({ name: z.literal("openai"), model: z.string(), baseUrl: z.string().optional() }),
      z.object({ name: z.literal("local"), model: z.string(), endpoint: z.string() }),
    ]),
  }),
  export: z.object({
    outputDir: z.string().default("exports"),
    platforms: z.object({ apple: z.boolean().optional(), google: z.boolean().optional(), spotify: z.boolean().optional() }).default({}),
  }),
  creds: z.object({
    useAppAzure: z.boolean().optional(),
    azure: z.object({ key: z.string().optional(), region: z.string().optional() }).optional(),
    useAppOpenAI: z.boolean().optional(),
    openai: z.object({ apiKey: z.string().optional(), baseUrl: z.string().optional() }).optional(),
  }).optional(),
  paths: z.object({
    bookMeta: z.string().default("book.meta.json"),
    production: z.string().default("production.settings.json"),
  }).partial().default({}),
});

export const bookMetaSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  authors: z.array(z.string()).default([]),
  narrators: z.array(z.string()).default([]),
  language: z.string().default("es-PE"),
  description: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  publisher: z.string().optional(),
  publication_date: z.string().optional(),
  rights: z.string().optional(),
  series: z.object({ name: z.string().optional(), number: z.number().nullable().optional() }).optional(),
  sku: z.string().optional(),
  isbn: z.string().optional(),
  disclosure_digital_voice: z.boolean().optional(),
});

export const productionSchema = z.object({
  ssml: z.object({
    target_minutes: z.number(),
    hard_cap_minutes: z.number(),
    max_kb_per_request: z.number(),
    default_voice: z.string(),
    default_stylepack: z.string().optional(),
    wpm: z.number(),
    locale: z.string(),
  }),
  tts: z.object({ timeout_s: z.number(), retries: z.number(), max_workers: z.number() }),
  concat: z.object({ gap_ms: z.number(), sr_hz: z.number(), channels: z.union([z.literal(1), z.literal(2)]), sample_width_bytes: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) }),
  enhance: z.object({ enable_deesser: z.boolean(), enable_tilt: z.boolean(), enable_expander: z.boolean() }),
  master: z.object({ rms_target_dbfs: z.number(), peak_ceiling_dbfs: z.number() }),
  packaging: z.object({
    apple: z.object({ aac_bitrate: z.string() }).optional(),
    gplay_spotify: z.object({ mp3_bitrate: z.string(), flac: z.boolean(), sr_hz: z.number(), channels: z.union([z.literal(1), z.literal(2)]) }).optional(),
  }),
});

// helper
function asObjectOrEmpty(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function asObj(x: unknown) { return x && typeof x === "object" ? (x as Record<string, unknown>) : {}; }


export function parseAppConfig(raw: unknown): AppConfig {
  return appConfigSchema.parse({ version: 1, ...asObjectOrEmpty(raw) });
}

export function parseProjectConfig(raw: unknown): ProjectConfig { return projectConfigSchema.parse({ version: 1, ...asObj(raw) }); }
export function parseBookMeta(raw: unknown): BookMeta { return bookMetaSchema.parse({ ...asObj(raw) }); }
export function parseProduction(raw: unknown): ProductionSettings { return productionSchema.parse({ ...asObj(raw) }); }
