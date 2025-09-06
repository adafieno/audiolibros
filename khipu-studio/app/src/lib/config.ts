import {
  parseAppConfig,
  parseProjectConfig,
  parseBookMeta,
  parseProduction,
} from "../schemas/config";
import type {
  AppConfig,
  BookMeta,
  ProductionSettings,
  ProjectConfig,
} from "../types/config";

type ReadJsonArgs = { projectRoot: string; relPath: string; json: boolean };

// ---------- strict JSON reader with good error messages ----------
async function readJsonStrict<T = unknown>(
  root: string,
  rel: string
): Promise<{ data: T; path: string; raw: string }> {
  // Use the typed IPC you already have: "fs:read" with json:true
  const data = (await window.khipu!.call("fs:read", {
    projectRoot: root,
    relPath: rel,
    json: true,
  } as ReadJsonArgs)) as unknown;

  const path = `${root}/${rel}`;
  if (data == null || (typeof data !== "object" && typeof data !== "string")) {
    throw new Error(`JSON vacío o inválido en ${path}`);
  }

  // best-effort raw preview for error messages
  const raw =
    typeof data === "string"
      ? data
      : (() => {
          try {
            return JSON.stringify(data as object);
          } catch {
            return "[[unserializable JSON]]";
          }
        })();

  return { data: data as T, path, raw };
}

// ---------- App config ----------
export async function loadAppConfig(): Promise<AppConfig> {
  const raw = await window.khipu!.call("appConfig:get", undefined);
  return parseAppConfig(raw);
}
export async function saveAppConfig(cfg: AppConfig): Promise<boolean> {
  return window.khipu!.call("appConfig:set", cfg);
}

// ---------- Project config ----------
export async function loadProjectConfig(projectRoot: string): Promise<ProjectConfig> {
  const raw = await window.khipu!.call("fs:read", {
    projectRoot,
    relPath: "project.khipu.json",
    json: true,
  });
  return parseProjectConfig(raw ?? {});
}
export async function saveProjectConfig(projectRoot: string, cfg: ProjectConfig): Promise<boolean> {
  return window.khipu!.call("fs:write", {
    projectRoot,
    relPath: "project.khipu.json",
    json: true,
    content: cfg,
  });
}

// ---------- Effective (app defaults + project overrides) ----------
export function mergeEffective(appCfg: AppConfig, proj: ProjectConfig) {
  return {
    language: proj.language ?? appCfg.defaults?.language ?? "es-PE",
    llm: proj.llm,
    tts: proj.tts,
    export: proj.export,
    planning: proj.planning,
    ssml: proj.ssml,
    creds: proj.creds ?? {},
  };
}

// ---------- Book / Production with path-aware errors ----------
export async function loadBookMeta(root: string, rel: string) {
  const { data, path, raw } = await readJsonStrict<Record<string, unknown>>(root, rel);
  if (!("title" in data)) {
    const snippet = raw.slice(0, 140).replace(/\s+/g, " ");
    throw new Error(`El archivo de libro no contiene "title". Resuelto: ${path}. Previa: ${snippet}`);
  }
  return parseBookMeta(data);
}
export async function saveBookMeta(root: string, rel: string, meta: BookMeta) {
  return window.khipu!.call("fs:write", { projectRoot: root, relPath: rel, json: true, content: meta });
}

export async function loadProduction(root: string, rel: string) {
  const { data, path, raw } = await readJsonStrict<Record<string, unknown>>(root, rel);
  if (!("ssml" in data)) {
    const snippet = raw.slice(0, 140).replace(/\s+/g, " ");
    throw new Error(`El archivo de producción no contiene "ssml". Resuelto: ${path}. Previa: ${snippet}`);
  }
  return parseProduction(data);
}
export async function saveProduction(root: string, rel: string, ps: ProductionSettings) {
  return window.khipu!.call("fs:write", { projectRoot: root, relPath: rel, json: true, content: ps });
}
