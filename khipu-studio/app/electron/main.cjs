// app/electron/main.cjs
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { spawn } = require("node:child_process");
const path = require("path");
const fs = require("node:fs");
const fsp = fs.promises;
const { SoxAudioProcessor } = require("./sox-audio-processor.cjs");

app.disableHardwareAcceleration();

const repoRoot = path.resolve(__dirname, "..", "..");

function getPythonExe() {
  if (process.env.PYTHON && process.env.PYTHON.trim()) return process.env.PYTHON;
  return process.platform === "win32"
    ? path.join(repoRoot, ".venv", "Scripts", "python.exe")
    : path.join(repoRoot, ".venv", "bin", "python");
}

function runPy(args, onLine) {
  const exe = getPythonExe();
  const child = spawn(exe, args, { cwd: repoRoot, windowsHide: true });
  child.on("error", (err) => console.error("[PY spawn error]", exe, err));
  child.stdout.on("data", (buf) => {
    buf.toString().split(/\r?\n/).forEach((l) => {
      if (!l.trim()) return;
      try { onLine?.(JSON.parse(l)); } catch { /* tolerate non-JSON */ }
    });
  });
  child.stderr.on("data", (b) => console.log("[PY]", b.toString()));
  return new Promise((res) => child.on("close", (code) => res(code ?? 0)));
}

/** Run character detection script (detect_characters) */
async function runCharacterDetection(projectRoot) {
  console.log("🔍 Starting character detection:", projectRoot);
  
  const script = path.join(repoRoot, "py", "characters", "detect_characters.py");
  console.log("📜 Script path:", script);
  
  // Basic existence check
  try { 
    await fsp.access(script); 
    console.log("✅ Script exists");
  } catch { 
    console.error("❌ Script not found:", script);
    throw new Error("Character detection script not found"); 
  }

  // Check if manuscript directory exists
  const manuscriptDir = path.join(projectRoot, "analysis", "chapters_txt");
  console.log("📁 Manuscript dir:", manuscriptDir);
  
  try {
    await fsp.access(manuscriptDir);
    console.log("✅ Manuscript directory exists");
  } catch {
    console.error("❌ Manuscript directory not found:", manuscriptDir);
    throw new Error("Manuscript directory not found. Please ensure analysis/chapters_txt exists with .txt files.");
  }

  const exe = getPythonExe();
  console.log("🐍 Python executable:", exe);
  
  return new Promise((resolve, reject) => {
    console.log("🚀 Spawning Python process...");
    const proc = spawn(exe, [script, manuscriptDir], { cwd: projectRoot || repoRoot, windowsHide: true });
    let stderr = ""; let stdout = "";
    
    proc.stdout.on("data", d => { 
      const output = d.toString();
      stdout += output;
      console.log("📤 Python stdout:", output.trim());
    });
    
    proc.stderr.on("data", d => { 
      const s = d.toString(); 
      stderr += s; 
      console.log("📢 Python stderr:", s.trim());
      
      // Parse progress from messages like "Processing ch01.txt (1/11)..."
      const progressMatch = s.match(/Processing .+ \((\d+)\/(\d+)\)/);
      if (progressMatch) {
        const current = parseInt(progressMatch[1]);
        const total = parseInt(progressMatch[2]);
        BrowserWindow.getAllWindows().forEach(w => 
          w.webContents.send("characters:detection:progress", { current, total })
        );
      }
      
      BrowserWindow.getAllWindows().forEach(w=> w.webContents.send("characters:detection:log", s)); 
    });
    
    proc.on("error", err => {
      console.error("💥 Process error:", err);
      reject(err);
    });
    
    proc.on("close", async (code) => {
      console.log("🏁 Process closed with code:", code);
      
      if (code !== 0) {
        const error = `Detection exited with code ${code}. stderr: ${stderr.split(/\n/).slice(-8).join("\n")}`;
        console.error("❌ Detection failed:", error);
        return reject(new Error(error));
      }
      
      // Try reading characters.json
      try {
        // The Python script saves to dossier/characters.json (relative to project root)
        const jsonPath = path.join(projectRoot, "analysis", "dossier", "characters.json");
        console.log("📖 Reading results from:", jsonPath);
        const data = await readJsonIf(jsonPath) || [];
        console.log("✅ Found", data.length, "characters");
        resolve({ characters: data, raw: stdout });
      } catch (e) {
        console.error("❌ Failed to read results:", e);
        reject(new Error("Detection finished but characters.json not readable"));
      }
    });
  });
}

/** Run voice assignment script (assign_voices) */
async function runVoiceAssignment(projectRoot) {
  console.log("🎤 Starting voice assignment:", projectRoot);
  
  const script = path.join(repoRoot, "py", "characters", "assign_voices.py");
  console.log("📜 Script path:", script);
  
  // Basic existence check
  try { 
    await fsp.access(script); 
    console.log("✅ Script exists");
  } catch { 
    console.error("❌ Script not found:", script);
    throw new Error("Voice assignment script not found"); 
  }

  // Check if characters file exists
  const charactersFile = path.join(projectRoot, "dossier", "characters.json");
  console.log("📁 Characters file:", charactersFile);
  
  try {
    await fsp.access(charactersFile);
    console.log("✅ Characters file exists");
  } catch {
    console.error("❌ Characters file not found:", charactersFile);
    throw new Error("Characters file not found. Please run character detection first.");
  }

  const exe = getPythonExe();
  console.log("🐍 Python executable:", exe);
  
  return new Promise((resolve, reject) => {
    console.log("🚀 Spawning Python process for voice assignment...");
    const proc = spawn(exe, [script, projectRoot], { cwd: repoRoot, windowsHide: true });
    let stderr = ""; let stdout = "";
    
    proc.stdout.on("data", d => { 
      const output = d.toString();
      stdout += output;
      console.log("📤 Python stdout:", output.trim());
    });
    
    proc.stderr.on("data", d => { 
      const s = d.toString(); 
      stderr += s; 
      console.log("📢 Python stderr:", s.trim());
      
      // Parse progress messages and send to UI
      const lines = s.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('PROGRESS:')) {
          const parts = line.trim().split(':');
          if (parts.length >= 3) {
            const pct = parseInt(parts[1]);
            const status = parts[2];
            BrowserWindow.getAllWindows().forEach(w => {
              w.webContents.send("characters:assignment:progress", { 
                current: pct, 
                total: 100, 
                stage: `Assigning voices... ${status}` 
              });
            });
          }
        }
      }
    });
    
    proc.on("error", err => {
      console.error("💥 Process error:", err);
      reject(err);
    });
    
    proc.on("close", async (code) => {
      console.log("🏁 Voice assignment process closed with code:", code);
      
      if (code !== 0) {
        const error = `Voice assignment exited with code ${code}. stderr: ${stderr.split(/\n/).slice(-8).join("\n")}`;
        console.error("❌ Voice assignment failed:", error);
        return reject(new Error(error));
      }
      
      // Try parsing the output JSON
      try {
        const result = JSON.parse(stdout.trim());
        console.log("✅ Voice assignment result:", result);
        resolve(result);
      } catch (e) {
        console.error("❌ Failed to parse voice assignment output:", e);
        reject(new Error("Voice assignment finished but output not parseable"));
      }
    });
  });
}

/** Run character assignment script for planning segments */
async function runCharacterAssignment(projectRoot, payload) {
  console.log("🎭 Starting character assignment for planning segments:", projectRoot);
  
  const script = path.join(repoRoot, "py", "characters", "assign_characters_to_segments.py");
  console.log("📜 Script path:", script);
  
  // Basic existence check
  try { 
    await fsp.access(script); 
    console.log("✅ Character assignment script exists");
  } catch { 
    console.error("❌ Character assignment script not found:", script);
    throw new Error("Character assignment script not found"); 
  }

  const exe = getPythonExe();
  console.log("🐍 Python executable:", exe);
  
  return new Promise((resolve, reject) => {
    console.log("🚀 Spawning Python process for character assignment...");
    const proc = spawn(exe, [script, projectRoot], { cwd: repoRoot, windowsHide: true });
    let stderr = ""; let stdout = "";
    
    // Send the payload as JSON input to the Python script
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
    
    proc.stdout.on("data", d => { 
      const output = d.toString();
      stdout += output;
      console.log("📤 Character assignment stdout:", output.trim());
    });
    
    proc.stderr.on("data", d => { 
      const s = d.toString(); 
      stderr += s; 
      console.log("📢 Character assignment stderr:", s.trim());
      
      // Parse progress messages and send to UI
      const lines = s.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('PROGRESS:')) {
          const parts = line.trim().split(':');
          if (parts.length >= 3) {
            const pct = parseInt(parts[1]);
            const status = parts[2];
            BrowserWindow.getAllWindows().forEach(w => {
              w.webContents.send("characters:assignment:progress", { 
                current: pct, 
                total: 100, 
                stage: `Assigning characters... ${status}` 
              });
            });
          }
        }
      }
    });
    
    proc.on("error", err => {
      console.error("💥 Character assignment process error:", err);
      reject(err);
    });
    
    proc.on("close", async (code) => {
      console.log("🏁 Character assignment process closed with code:", code);
      
      if (code !== 0) {
        const error = `Character assignment exited with code ${code}. stderr: ${stderr.split(/\n/).slice(-8).join("\n")}`;
        console.error("❌ Character assignment failed:", error);
        return reject(new Error(error));
      }
      
      // Try parsing the output JSON
      try {
        const result = JSON.parse(stdout.trim());
        console.log("✅ Character assignment result:", result);
        resolve(result);
      } catch (e) {
        console.error("❌ Failed to parse character assignment output:", e);
        console.log("Raw stdout:", stdout);
        reject(new Error("Character assignment finished but output not parseable"));
      }
    });
  });
}

async function runVoiceAudition(projectRoot, characterId, voiceId, style, sampleText) {
  console.log("🎵 Starting voice audition:", { characterId, voiceId, style, sampleText });
  
  // For now, just log the audition request
  // TODO: Implement actual TTS synthesis and audio playback
  console.log("🔊 Would play voice sample for:", {
    character: characterId,
    voice: voiceId,
    style: style || "default",
    text: sampleText
  });
  
  // Simulate audio playback delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return {
    success: true,
    message: `Voice audition for ${characterId} with ${voiceId} completed`
  };
}

/* ---------------- App config (userData) ---------------- */
function appConfigPath() {
  const userData = app.getPath("userData");
  return path.join(userData, "app.config.json");
}
async function readJsonSafe(p) {
  try { return JSON.parse(await fsp.readFile(p, "utf-8")); } catch { return null; }
}
async function writeJson(p, obj) {
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, JSON.stringify(obj, null, 2), "utf-8");
}
async function getAppConfig() {
  const p = appConfigPath();
  return (await readJsonSafe(p)) || { version: 1, theme: "dark", telemetry: false, recentProjects: [] };
}
async function setAppConfig(cfg) {
  await writeJson(appConfigPath(), cfg);
}

/* ---------------- Project helpers ---------------- */
function safeName(name) {
  return String(name).trim().replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
}
async function ensureDirs(root, rels) {
  for (const r of rels) await fsp.mkdir(path.join(root, r), { recursive: true });
}

async function readJsonIf(pathAbs) {
  try { return JSON.parse(await fsp.readFile(pathAbs, "utf-8")); } catch { return null; }
}

function resolveUnder(root, relOrAbs) {
  if (!relOrAbs) return null;
  const abs = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(root, relOrAbs);
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Path escapes project root");
  return abs;
}

// Small helpers
function wordsCount(txt) {
  const m = String(txt || "").trim().match(/\b[\p{L}\p{N}'’-]+\b/gu);
  return m ? m.length : 0;
}
async function pushRecent(projectPath) {
  const cfg = await getAppConfig();
  const arr = Array.isArray(cfg.recentProjects) ? cfg.recentProjects.slice() : [];
  const cleaned = projectPath.replace(/[/\\]+$/, "");
  const idx = arr.findIndex((p) => p === cleaned);
  if (idx >= 0) arr.splice(idx, 1);
  arr.unshift(cleaned);
  cfg.recentProjects = arr.slice(0, 8);
  await setAppConfig(cfg);
}
async function createScaffold(root) {
  await ensureDirs(root, [
    "analysis/chapters_txt",
    "art",
    "dossier",
    "ssml/plans",
    "ssml/xml",
    "cache/tts",
    "audio/chapters",
    "audio/book",
    "exports",
  ]);

  // project.khipu.json — optimized with comprehensive path tracking
  const projectCfg = {
    version: 1,
    language: "es-PE",
    paths: {
      bookMeta: "book.meta.json",
      production: "production.settings.json",
      manuscript: "analysis/chapters_txt",
      dossier: "dossier",
      ssml: "ssml/plans",
      audio: "audio",
      cache: "cache",
      exports: "exports",
      art: "art"
    },
    planning: { maxKb: 48, llmAttribution: "off" },
    pauses: {
      sentenceMs: 500,
      paragraphMs: 1000,
      chapterMs: 3000,
      commaMs: 300,
      colonMs: 400,
      semicolonMs: 350
    },
    tts: { engine: { name: "azure", voice: "es-PE-CamilaNeural" }, cache: true },
    llm: { engine: { name: "openai", model: "gpt-4o" } },
    export: { outputDir: "exports", platforms: { apple: false, google: false, spotify: false } },
    creds: {
      tts: {
        azure: { key: "", region: "" }
      },
      llm: {
        openai: { apiKey: "", baseUrl: "" },
        azureOpenAI: { apiKey: "", endpoint: "", apiVersion: "" }
      }
    },
    workflow: {
      project: { complete: false },
      characters: { complete: false },
      planning: { complete: false },
      ssml: { complete: false },
      audio: { complete: false }
    }
  };
  await writeJson(path.join(root, "project.khipu.json"), projectCfg);

  // book.meta.json — blank but valid
  await writeJson(path.join(root, "book.meta.json"), {
    title: "",
    subtitle: "",
    authors: [],
    narrators: [],
    language: "es-PE",
    description: "",
    keywords: [],
    categories: [],
    publisher: "",
    publication_date: "",
    rights: "",
    series: { name: "", number: null },
    sku: "",
    isbn: "",
    disclosure_digital_voice: false,
  });

  // production.settings.json — safe defaults
  await writeJson(path.join(root, "production.settings.json"), {
    ssml: {
      target_minutes: 7,
      hard_cap_minutes: 8,
      max_kb_per_request: 48,
      default_voice: "es-PE-AlexNeural",
      default_stylepack: "chapter_default",
      wpm: 165,
      locale: "es-PE",
    },
    tts: { timeout_s: 30, retries: 4, max_workers: 4 },
    concat: { gap_ms: 700, sr_hz: 44100, channels: 1, sample_width_bytes: 2 },
    enhance: { enable_deesser: true, enable_tilt: true, enable_expander: true },
    master: { rms_target_dbfs: -20, peak_ceiling_dbfs: -3 },
    packaging: {
      apple: { aac_bitrate: "128k" },
      gplay_spotify: { mp3_bitrate: "256k", flac: false, sr_hz: 44100, channels: 1 },
    },
  });

  // seed a sample chapter if empty
  const chDir = path.join(root, "analysis/chapters_txt");
  try {
    const files = await fsp.readdir(chDir);
    if (!files || files.length === 0) {
      const sample = ["Capítulo 1", "", "Texto de ejemplo. Reemplázalo con el capítulo real."].join("\n");
      await fsp.writeFile(path.join(chDir, "ch01.txt"), sample, "utf-8");
    }
  } catch {}

  // create art directory README
  const artDir = path.join(root, "art");
  const artReadme = path.join(artDir, "README.md");
  try {
    const artReadmeContent = [
      "# Cover Art Directory",
      "",
      "Place your book cover image here. Requirements:",
      "- **Format:** JPEG (.jpg)",
      "- **Dimensions:** 3000×3000 pixels (recommended)",
      "- **Naming:** Use descriptive names like `cover_3000.jpg`",
      "",
      "The cover image path will be automatically added to `book.meta.json` when you select it through the Book page."
    ].join("\n");
    await fsp.writeFile(artReadme, artReadmeContent, "utf-8");
  } catch {}
}

const crypto = require("node:crypto");
function resolveUnder(root, p) {
  const abs = path.isAbsolute(p) ? p : path.join(root, p);
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Path escapes project root");
  return abs;
}

/* ---------------- Audio Processing Setup ---------------- */
// Initialize audio processor with project-specific paths
let audioProcessor;
function getAudioProcessor() {
  if (!audioProcessor) {
    const tempDir = path.join(repoRoot, "temp");
    const cacheDir = path.join(repoRoot, "cache");
    audioProcessor = new SoxAudioProcessor(null, tempDir, cacheDir);
  }
  return audioProcessor;
}

/* ---------------- BrowserWindow + IPC ---------------- */
function createWin() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Khipu Studio",
    backgroundColor: "#111827",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true },
  });

  win.webContents.on("render-process-gone", (_e, d) => console.error("[renderer gone]", d));

  if (process.env.VITE_DEV) win.loadURL("http://localhost:5173");
  else win.loadFile(path.join(__dirname, "../dist/index.html"));

  /* App config + locale */
  ipcMain.handle("appConfig:get", async () => getAppConfig());
  ipcMain.handle("appConfig:set", async (_e, cfg) => { await setAppConfig(cfg); return true; });
  ipcMain.handle("app:locale", () => { try { return app.getLocale(); } catch { return "es-PE"; } });

  /* File operations */
  ipcMain.handle("file:exists", async (_event, filePath) => {
    try {
      const resolvedPath = path.resolve(repoRoot, filePath);
      await fsp.access(resolvedPath);
      return true;
    } catch {
      return false;
    }
  });

  /* Project: list, choose, create, open */
  ipcMain.handle("project:listRecents", async () => {
    const cfg = await getAppConfig();
    const currentRecents = cfg.recentProjects || [];
    const validRecents = [];

    // Check each project path to see if it still exists
    for (const projectPath of currentRecents) {
      try {
        const stat = await fsp.stat(projectPath);
        if (stat.isDirectory()) {
          // Also check if it has a project file to confirm it's a valid project
          const projectConfigPath = path.join(projectPath, "project.khipu.json");
          try {
            await fsp.access(projectConfigPath);
            validRecents.push(projectPath);
          } catch {
            // Project directory exists but no config file - skip it silently
          }
        }
      } catch {
        // Directory doesn't exist - skip it silently
      }
    }

    // Update the config if we found any invalid projects
    if (validRecents.length !== currentRecents.length) {
      cfg.recentProjects = validRecents;
      await setAppConfig(cfg);
      console.log(`Auto-cleaned recent projects: ${currentRecents.length} -> ${validRecents.length}`);
    }

    return validRecents.map((p) => ({ path: p, name: path.basename(p) }));
  });
  ipcMain.handle("project:browseForParent", async () => {
    const res = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
    if (res.canceled || !res.filePaths?.[0]) return null;
    return res.filePaths[0];
  });
  ipcMain.handle("project:choose", async () => {
    const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (res.canceled || !res.filePaths?.[0]) return null;
    return res.filePaths[0];
  });
  ipcMain.handle("project:create", async (_e, { parentDir, name }) => {
    if (!parentDir || !name) return null;
    const root = path.join(parentDir, safeName(name));
    await fsp.mkdir(root, { recursive: true });
    await createScaffold(root);
    await pushRecent(root);
    return { path: root };
  });
  ipcMain.handle("project:open", async (_e, { path: p }) => {
    if (!p) return false;
    try {
      const stat = await fsp.stat(p);
      if (!stat.isDirectory()) return false;
      await pushRecent(p);
      return true;
    } catch { return false; }
  });

  /* FS helpers used by renderer */
  ipcMain.handle("fs:read", async (_e, { projectRoot, relPath, json }) => {
    try {
      const abs = path.join(projectRoot, relPath);
      const rel = path.relative(projectRoot, abs);
      if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
      if (!fs.existsSync(abs)) return null;
      const data = await fsp.readFile(abs, "utf-8");
      return json ? JSON.parse(data) : data;
    } catch (e) { console.error("[fs:read]", e); return null; }
  });
  ipcMain.handle("fs:write", async (_e, { projectRoot, relPath, json, content }) => {
    try {
      const abs = path.join(projectRoot, relPath);
      const rel = path.relative(projectRoot, abs);
      if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      const payload = json ? JSON.stringify(content, null, 2) : String(content);
      await fsp.writeFile(abs, payload, "utf-8");
      return true;
    } catch (e) { console.error("[fs:write]", e); return false; }
  });

  // ---- IPC: write binary file ----
  ipcMain.handle("fs:writeBinary", async (_e, { projectRoot, relPath, content }) => {
    try {
      const abs = path.join(projectRoot, relPath);
      const rel = path.relative(projectRoot, abs);
      if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      const buffer = Buffer.from(content);
      await fsp.writeFile(abs, buffer);
      return true;
    } catch (e) { console.error("[fs:writeBinary]", e); return false; }
  });
  ipcMain.handle("fs:readJson", async (_e, { root, rel }) => {
    try {
      const abs = path.join(root, rel);
      const raw = await fsp.readFile(abs, "utf-8");
      return { data: JSON.parse(raw), path: abs, raw };
    } catch {
      return { data: null, path: path.join(root, rel), raw: "" };
    }
  });
        // Character detection trigger (runs python script inside project root)
        ipcMain.handle("characters:detect", async (_e, { projectRoot }) => {
          if (!projectRoot) throw new Error("Missing projectRoot");
          try {
            const result = await runCharacterDetection(projectRoot);
            return { ok: true, ...result };
          } catch (e) {
            return { ok: false, error: String(e.message || e) };
          }
        });

        // Voice assignment for characters
        ipcMain.handle("characters:assignVoices", async (_e, { projectRoot }) => {
          if (!projectRoot) throw new Error("Missing projectRoot");
          try {
            const result = await runVoiceAssignment(projectRoot);
            return { success: true, ...result };
          } catch (e) {
            return { success: false, error: String(e.message || e) };
          }
        });

        // Character assignment for planning segments
        ipcMain.handle("characters:assignToSegments", async (_e, { projectRoot, payload }) => {
          if (!projectRoot) throw new Error("Missing projectRoot");
          if (!payload) throw new Error("Missing payload");
          try {
            const result = await runCharacterAssignment(projectRoot, payload);
            return { success: true, ...result };
          } catch (e) {
            return { success: false, error: String(e.message || e) };
          }
        });

        // Voice audition for characters
        ipcMain.handle("characters:auditionVoice", async (_e, { projectRoot, characterId, voiceId, style, sampleText }) => {
          if (!projectRoot) throw new Error("Missing projectRoot");
          if (!characterId) throw new Error("Missing characterId");
          if (!voiceId) throw new Error("Missing voiceId");
          
          try {
            const result = await runVoiceAudition(projectRoot, characterId, voiceId, style, sampleText);
            return { success: true, ...result };
          } catch (e) {
            return { success: false, error: String(e.message || e) };
          }
        });

  ipcMain.handle("manuscript:chooseDocx", async () => {
    const res = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Word document", extensions: ["docx"] }],
    });
    if (res.canceled || !res.filePaths?.[0]) return null;
    return res.filePaths[0];
  });

  // ---- IPC: choose image file ----
  ipcMain.handle("file:chooseImage", async () => {
    const res = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "JPEG Images", extensions: ["jpg", "jpeg"] }],
    });
    if (res.canceled || !res.filePaths?.[0]) return null;
    return res.filePaths[0];
  });

  // ---- IPC: validate and copy image ----
  ipcMain.handle("file:validateAndCopyImage", async (_e, { filePath, projectRoot }) => {
    try {
      if (!filePath || !projectRoot) return { success: false, error: "Missing file path or project root" };
      
      const path = require('path');
      
      // Check if file exists and is a JPEG
      const ext = path.extname(filePath).toLowerCase();
      if (ext !== '.jpg' && ext !== '.jpeg') {
        return { success: false, error: "File must be a JPEG image" };
      }
      
      // Copy file to project directory
      const fileName = `cover_${Date.now()}.jpg`;
      const destPath = path.join(projectRoot, fileName);
      
      await fsp.copyFile(filePath, destPath);
      
      return { 
        success: true, 
        fileName,
        message: "Image copied successfully. Validation will occur in the UI."
      };
      
    } catch (error) {
      console.error("Error copying image:", error);
      return { success: false, error: "Failed to copy image file" };
    }
  });

  // ---- IPC: get image as data URL for preview ----
  ipcMain.handle("file:getImageDataUrl", async (_e, { projectRoot, fileName }) => {
    try {
      const path = require('path');
      const imagePath = path.join(projectRoot, fileName);
      
      // Read the image file
      const imageBuffer = await fsp.readFile(imagePath);
      
      // Convert to base64 data URL
      const base64 = imageBuffer.toString('base64');
      const dataUrl = `data:image/jpeg;base64,${base64}`;
      
      return { success: true, dataUrl };
      
    } catch (error) {
      console.error("Error reading image:", error);
      return { success: false, error: "Failed to read image file" };
    }
  });

  // ---- IPC: audio cache handlers ----
  ipcMain.handle("audioCache:read", async (_e, { key }) => {
    console.log("🎵 CACHE READ:", key);
    try {
      const cacheDir = path.join(app.getPath("userData"), "cache", "tts");
      await fsp.mkdir(cacheDir, { recursive: true });
      
      const cacheFile = path.join(cacheDir, `${key}.json`);
      const audioFile = path.join(cacheDir, `${key}.wav`);
      
      // Check if both metadata and audio files exist
      const metadataExists = await fsp.access(cacheFile).then(() => true).catch(() => false);
      const audioExists = await fsp.access(audioFile).then(() => true).catch(() => false);
      
      console.log(`🎵 CACHE READ ${key}:`, { metadataExists, audioExists });
      
      if (!metadataExists || !audioExists) {
        console.log(`🎵 CACHE MISS for ${key}`);
        return { success: false, error: "Cache entry not found" };
      }
      
      console.log(`🎵 CACHE HIT for ${key}`);
      
      // Read metadata
      const metadata = JSON.parse(await fsp.readFile(cacheFile, "utf-8"));
      
      // Check expiry
      const now = Date.now();
      if (metadata.expiresAt && now > metadata.expiresAt) {
        // Clean up expired files
        try {
          await fsp.unlink(cacheFile);
          await fsp.unlink(audioFile);
        } catch {}
        return { success: false, error: "Cache entry expired" };
      }
      
      // Read audio data as base64
      const audioBuffer = await fsp.readFile(audioFile);
      const audioData = audioBuffer.toString('base64');
      
      // Update access time for LRU
      metadata.accessedAt = now;
      await fsp.writeFile(cacheFile, JSON.stringify(metadata, null, 2), "utf-8");
      
      return { success: true, audioData, metadata };
      
    } catch (error) {
      console.error("Error reading audio cache:", error);
      return { success: false, error: "Failed to read cache entry" };
    }
  });

  ipcMain.handle("audioCache:write", async (_e, { key, audioData, metadata }) => {
    console.log("🎵 CACHE WRITE:", key);
    try {
      const cacheDir = path.join(app.getPath("userData"), "cache", "tts");
      console.log("Creating cache directory:", cacheDir);
      
      // Ensure directory exists with better error handling
      try {
        await fsp.mkdir(cacheDir, { recursive: true });
        console.log("Cache directory created/verified");
      } catch (mkdirError) {
        console.error("Failed to create cache directory:", mkdirError);
        throw mkdirError;
      }
      
      const cacheFile = path.join(cacheDir, `${key}.json`);
      const audioFile = path.join(cacheDir, `${key}.wav`);
      
      console.log("Writing audio file:", audioFile);
      
      // Write audio data (convert from base64)
      const audioBuffer = Buffer.from(audioData, 'base64');
      
      // Validate that we have a proper WAV file with RIFF header
      if (audioBuffer.length < 44) {
        throw new Error('Audio buffer too small to be a valid WAV file');
      }
      
      const header = audioBuffer.subarray(0, 12);
      const riffMarker = header.subarray(0, 4).toString('ascii');
      const waveMarker = header.subarray(8, 12).toString('ascii');
      
      if (riffMarker !== 'RIFF' || waveMarker !== 'WAVE') {
        console.warn(`⚠️  Invalid WAV file detected: RIFF='${riffMarker}', WAVE='${waveMarker}', size=${audioBuffer.length}`);
        console.warn('First 16 bytes:', Array.from(audioBuffer.subarray(0, 16)).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' '));
        throw new Error(`Invalid audio format: expected WAV file with RIFF header, got RIFF='${riffMarker}', WAVE='${waveMarker}'`);
      }
      
      console.log(`✅ Valid WAV file detected: ${audioBuffer.length} bytes`);
      await fsp.writeFile(audioFile, audioBuffer);
      
      // Write metadata
      const now = Date.now();
      const metadataWithTimestamps = {
        ...metadata,
        createdAt: now,
        accessedAt: now,
        expiresAt: now + (7 * 24 * 60 * 60 * 1000) // 7 days
      };
      await fsp.writeFile(cacheFile, JSON.stringify(metadataWithTimestamps, null, 2), "utf-8");
      
      return { success: true };
      
    } catch (error) {
      console.error("Error writing audio cache:", error);
      return { success: false, error: "Failed to write cache entry" };
    }
  });

  ipcMain.handle("audioCache:path", async (_e, cacheKey) => {
    try {
      const cacheDir = path.join(app.getPath("userData"), "cache", "tts");
      
      // The cache uses hashed keys for filenames, but we need to find the right file
      // First, let's try if the cacheKey is already hashed
      let audioFile = path.join(cacheDir, `${cacheKey}.wav`);
      
      // Check if file exists and is valid
      const audioExists = await fsp.access(audioFile).then(() => true).catch(() => false);
      
      if (audioExists) {
        // Validate WAV header to detect corruption
        try {
          const buffer = await fsp.readFile(audioFile);
          if (buffer.length < 44) {
            console.warn(`🗑️  Corrupted cache file (too small): ${audioFile}`);
            await fsp.unlink(audioFile).catch(() => {}); // Clean up corrupted file
            return null;
          }
          
          const header = buffer.subarray(0, 12);
          const riffMarker = header.subarray(0, 4).toString('ascii');
          const waveMarker = header.subarray(8, 12).toString('ascii');
          
          if (riffMarker !== 'RIFF' || waveMarker !== 'WAVE') {
            console.warn(`🗑️  Corrupted cache file (invalid WAV): ${audioFile}`);
            await fsp.unlink(audioFile).catch(() => {}); // Clean up corrupted file
            return null;
          }
          
          console.log("🎵 CACHE PATH FOUND:", audioFile);
          return audioFile;
        } catch (validationError) {
          console.warn(`🗑️  Cache validation failed: ${audioFile}`, validationError.message);
          await fsp.unlink(audioFile).catch(() => {}); // Clean up corrupted file
          return null;
        }
      }
      
      console.log("🎵 CACHE PATH NOT FOUND:", cacheKey);
      return null;
      
    } catch (error) {
      console.error("Error getting audio cache path:", error);
      return null;
    }
  });

  ipcMain.handle("audioCache:list", async () => {
    try {
      const cacheDir = path.join(app.getPath("userData"), "cache", "tts");
      await fsp.mkdir(cacheDir, { recursive: true });
      
      const files = await fsp.readdir(cacheDir);
      const metadataFiles = files.filter(f => f.endsWith('.json'));
      
      const entries = [];
      for (const file of metadataFiles) {
        try {
          const metadata = JSON.parse(await fsp.readFile(path.join(cacheDir, file), "utf-8"));
          const key = file.replace('.json', '');
          entries.push({ key, metadata });
        } catch {
          // Skip invalid metadata files
        }
      }
      
      return { success: true, entries };
      
    } catch (error) {
      console.error("Error listing audio cache:", error);
      return { success: false, error: "Failed to list cache entries" };
    }
  });

  ipcMain.handle("audioCache:delete", async (_e, { key }) => {
    console.log("🎵 CACHE DELETE:", key);
    try {
      const cacheDir = path.join(app.getPath("userData"), "cache", "tts");
      const cacheFile = path.join(cacheDir, `${key}.json`);
      const audioFile = path.join(cacheDir, `${key}.wav`);
      
      // Delete both files if they exist
      try {
        await fsp.unlink(cacheFile);
      } catch {}
      try {
        await fsp.unlink(audioFile);
      } catch {}
      
      return { success: true };
      
    } catch (error) {
      console.error("Error deleting audio cache entry:", error);
      return { success: false, error: "Failed to delete cache entry" };
    }
  });

  ipcMain.handle("audioCache:clear", async () => {
    try {
      const cacheDir = path.join(app.getPath("userData"), "cache", "tts");
      
      // Remove entire cache directory and recreate
      try {
        await fsp.rm(cacheDir, { recursive: true, force: true });
      } catch {}
      await fsp.mkdir(cacheDir, { recursive: true });
      
      return { success: true };
      
    } catch (error) {
      console.error("Error clearing audio cache:", error);
      return { success: false, error: "Failed to clear cache" };
    }
  });

// ---- IPC: parse manuscript via Python module (FIXED FLAGS) ----
ipcMain.handle("manuscript:parse", async (_e, { projectRoot, docxPath }) => {
  if (!projectRoot || !docxPath) return { code: -1 };
  const root = path.resolve(projectRoot);

  const chaptersDir  = resolveUnder(root, path.join("analysis", "chapters_txt"));
  const structureOut = resolveUnder(root, path.join("dossier", "narrative.structure.json"));

  await fsp.mkdir(path.dirname(structureOut), { recursive: true });
  await fsp.mkdir(chaptersDir, { recursive: true });

  // optional: create a tiny temp file with effective config for the parser
  const tmpCfgPath = path.join(app.getPath("temp"), `khipu_cfg_${crypto.randomUUID()}.json`);
  try {
    // If you prefer, read and merge here before writing; or just pass projectRoot.
    await fsp.writeFile(tmpCfgPath, JSON.stringify({ projectRoot: root }, null, 2), "utf-8");
  } catch {/* ignore */}

  const args = [
    "-m", "py.ingest.manuscript_parser",
    "--in", docxPath,
    "--out-chapters", chaptersDir,
    "--out-structure", structureOut,       // <— FIX
    "--project-root", root,                 // <— lets parser load project.khipu.json if needed
    "--min-words", "20",
    "--config-json", tmpCfgPath             // <— optional; parser will ignore if not given
  ];

  const code = await runPy(args, (line) => {
    // Expect JSON lines like: {event:"progress", note:"Reading …"} from the parser
    // You already have job event plumbing; here we just log for now:
    console.log("[PY-manuscript]", line);
  });
  try { await fsp.unlink(tmpCfgPath); } catch {}

  return { code: Number(code ?? 0) };
});


// ---- IPC: list chapters with titles + word counts ----
ipcMain.handle("chapters:list", async (_e, { projectRoot }) => {
  const root = path.resolve(projectRoot);
  const chaptersDir = path.join(root, "analysis", "chapters_txt");
  const dossierPath = path.join(root, "dossier", "narrative.structure.json");

  const structure = await readJsonIf(dossierPath); // may be null if not yet parsed
  let titleMap = {};
  if (structure && Array.isArray(structure.chapters)) {
    for (const ch of structure.chapters) {
      // Expecting items like { id: "ch01", title: "Capítulo 1" }
      if (ch?.id && ch?.title) titleMap[ch.id] = ch.title;
    }
  }

  let items = [];
  try {
    const files = await fsp.readdir(chaptersDir);
    for (const name of files) {
      if (!/^ch\d+\.txt$/i.test(name)) continue;
      const id = name.replace(/\.txt$/i, "");
      const relPath = path.join("analysis", "chapters_txt", name);
      const abs = path.join(chaptersDir, name);
      const content = await fsp.readFile(abs, "utf-8");
      const firstLine = (content.split(/\r?\n/)[0] || "").trim();
      const title = titleMap[id] || (firstLine || id);
      items.push({ id, title, relPath, words: wordsCount(content) });
    }
  } catch {
    // If directory doesn't exist yet, empty list
  }

  // Sort by chapter number (ch01, ch02, …)
  items.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return items;
});

// ---- IPC: chapter read/write ----
ipcMain.handle("chapter:read", async (_e, { projectRoot, relPath }) => {
  const abs = resolveUnder(path.resolve(projectRoot), relPath);
  const text = await fsp.readFile(abs, "utf-8");
  return { text };
});

ipcMain.handle("chapter:write", async (_e, { projectRoot, relPath, text }) => {
  const abs = resolveUnder(path.resolve(projectRoot), relPath);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, String(text ?? ""), "utf-8");
  return true;
});

  /* Audio processing handlers */
  ipcMain.handle("audio:process", async (_e, options) => {
    try {
      const processor = getAudioProcessor();
      const result = await processor.processAudio(options, (progress) => {
        // Send progress updates to renderer
        win?.webContents.send('audio:progress', { id: options.id, progress });
      });
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle("audio:info", async (_e, filePath) => {
    try {
      const processor = getAudioProcessor();
      return await processor.getAudioInfo(filePath);
    } catch (error) {
      throw new Error(`Failed to get audio info: ${error.message}`);
    }
  });

  ipcMain.handle("audio:cache:has", async (_e, cacheKey) => {
    try {
      const processor = getAudioProcessor();
      return processor.hasCachedAudio(cacheKey);
    } catch (error) {
      return false;
    }
  });

  ipcMain.handle("audio:cache:path", async (_e, cacheKey) => {
    try {
      const processor = getAudioProcessor();
      return processor.getCachedAudioPath(cacheKey);
    } catch (error) {
      return null;
    }
  });

  ipcMain.handle("audio:cancel", async (_e, id) => {
    try {
      const processor = getAudioProcessor();
      return processor.cancelProcessing(id);
    } catch (error) {
      console.error('Failed to cancel audio processing:', error);
      return false;
    }
  });

  ipcMain.handle("audio:available", async () => {
    try {
      const processor = getAudioProcessor();
      return await processor.isAvailable();
    } catch (error) {
      return false;
    }
  });

  // SoX Audio Processor handlers for advanced audio preview
  ipcMain.handle("audioProcessor:processAudio", async (_e, { audioUrl, processingChain, cacheKey }) => {
    try {
      const processor = getAudioProcessor();
      
      // Check cache first
      const cachedPath = processor.getCachedPath(cacheKey);
      if (cachedPath && fs.existsSync(cachedPath)) {
        return {
          success: true,
          outputPath: cachedPath,
          cached: true
        };
      }

      // Convert blob URL to local file for processing
      let tempInputPath;
      if (audioUrl.startsWith('blob:')) {
        // For blob URLs, we need to get the audio data from the renderer
        // This is a simplified approach - in production you'd handle this differently
        throw new Error('Blob URL processing not yet implemented - use cached audio file path instead');
      } else {
        // Assume it's already a file path
        tempInputPath = audioUrl;
      }

      const result = await processor.processAudio({
        id: `preview_${Date.now()}`,
        inputPath: tempInputPath,
        processingChain: processingChain,
        cacheKey: cacheKey
      });
      
      return result;
    } catch (error) {
      console.error('SoX audio processing failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle("audioProcessor:getCachedAudioPath", async (_e, cacheKey) => {
    try {
      const processor = getAudioProcessor();
      const cachedPath = processor.getCachedPath(cacheKey);
      
      if (cachedPath && fs.existsSync(cachedPath)) {
        return cachedPath;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get cached audio path:', error);
      return null;
    }
  });

  ipcMain.handle("fs:readAudioFile", async (_e, arg) => {
    try {
      // Read audio file as buffer for Web Audio API
      let resolvedPath;
      
      // Handle both new object format and legacy string format
      if (typeof arg === 'string') {
        // Legacy format: single string parameter (should be absolute path)
        resolvedPath = path.resolve(arg);
      } else if (arg && typeof arg === 'object') {
        // New object format: { projectRoot?, filePath }
        const { projectRoot, filePath } = arg;
        if (projectRoot && filePath && !path.isAbsolute(filePath)) {
          // Resolve relative to project root if both are provided
          resolvedPath = path.join(projectRoot, filePath);
        } else if (filePath) {
          // Absolute filePath
          resolvedPath = path.resolve(filePath);
        } else {
          throw new Error('filePath is required');
        }
      } else {
        throw new Error('Either a file path string or { projectRoot?, filePath } object must be provided');
      }
      
      console.log(`📖 Reading audio file: ${resolvedPath}`);
      const buffer = await fsp.readFile(resolvedPath);
      // Convert Node.js Buffer to ArrayBuffer for Web Audio API
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      return arrayBuffer;
    } catch (error) {
      throw new Error(`Failed to read audio file: ${error.message}`);
    }
  });

  /* Plan build (scoped to project root) */
  ipcMain.handle("plan:build", async (_e, payload = {}) => {
    try {
      const { projectRoot, chapterId, infile, out, opts } = payload;
      if (!projectRoot || typeof projectRoot !== "string") return -1;

      const base = path.resolve(projectRoot);
      const resolveUnder = (p) => (p && !path.isAbsolute(p) ? path.join(base, p) : p);
      const inside = (p) => {
        const rel = path.relative(base, p);
        return !rel.startsWith("..") && !path.isAbsolute(rel);
      };

      const infileAbs = resolveUnder(String(infile));
      const outAbs = resolveUnder(String(out));
      const optsAbs = { ...(opts || {}) };
      if (optsAbs.dossier) optsAbs.dossier = resolveUnder(String(optsAbs.dossier));
      if (!inside(infileAbs) || !inside(outAbs)) return -2;

      try { fs.mkdirSync(path.dirname(outAbs), { recursive: true }); } catch {}

      const args = [
        "-m", "py.ssml.simple_plan_builder",
        "--chapter-id", String(chapterId),
        "--in", infileAbs,
        "--out", outAbs,
      ];
      for (const [k, v] of Object.entries(optsAbs)) {
        const flag = "--" + k;
        if (v === true) args.push(flag);
        else if (Array.isArray(v)) v.forEach((vv) => args.push(flag, String(vv)));
        else if (v !== undefined && v !== null) args.push(flag, String(v));
      }

      console.log("[plan:build] invoking simple_plan_builder with args", args.join(" "));
      const code = await runPy(args, (line) => _e.sender.send("job:event", line));
      try {
        // Append a sentinel note inside the saved plan (non-breaking) for debugging cache issues
        if (code === 0) {
          const planPath = outAbs;
            const raw = await fsp.readFile(planPath, "utf-8");
            const obj = JSON.parse(raw);
            obj._debug_invoked = {
              module: "simple_plan_builder",
              ts: new Date().toISOString(),
              args
            };
            await fsp.writeFile(planPath, JSON.stringify(obj, null, 2), "utf-8");
        }
      } catch (e) { console.warn("[plan:build] sentinel write failed", e); }
      return code;
    } catch (err) {
      console.error("[plan:build] fatal:", err);
      return -99;
    }
  });

  // ---- IPC: Convert and save imported audio file ----
  // ⚠️ IMPORTANT: This process does NOT use any caching mechanisms
  // SFX files are converted once and saved permanently to project directory
  ipcMain.handle("audio:convertAndSave", async (_e, { projectRoot, audioData, filename, targetPath }) => {
    try {
      console.log(`🎵 Converting and saving SFX file (NO CACHE): ${filename} -> ${targetPath}`);
      
      // Ensure target directory exists
      const targetFullPath = path.join(projectRoot, targetPath);
      const targetDir = path.dirname(targetFullPath);
      await fsp.mkdir(targetDir, { recursive: true });
      
      // Create a temporary file for the input audio
      const tempInputPath = path.join(__dirname, '../../temp', `import_${Date.now()}_${filename}`);
      await fsp.mkdir(path.dirname(tempInputPath), { recursive: true });
      
      // Write the raw audio data to temp file
      const buffer = Buffer.from(audioData);
      await fsp.writeFile(tempInputPath, buffer);
      
      // Get SOX processor (but don't use its caching mechanisms)
      const processor = getAudioProcessor();
      
      try {
        // Use SOX command directly for format conversion
        // NOTE: We bypass SOX processor's caching system and process directly
        const { spawn } = require('child_process');
        
        console.log(`🔧 SOX path: ${processor.soxPath}`);
        console.log(`📁 Input file: ${tempInputPath}`);
        console.log(`📁 Output file: ${targetFullPath}`);
        
        // Verify input file exists before processing
        if (!fs.existsSync(tempInputPath)) {
          throw new Error(`Input file does not exist: ${tempInputPath}`);
        }
        
        const inputStats = await fsp.stat(tempInputPath);
        console.log(`📊 Input file size: ${inputStats.size} bytes`);
        
        // Ensure output directory exists
        const outputDir = path.dirname(targetFullPath);
        if (!fs.existsSync(outputDir)) {
          console.log(`📂 Creating output directory: ${outputDir}`);
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Build SOX command: input -> 44.1kHz mono 16-bit WAV output
        // This is a one-time conversion, NOT cached
        const soxArgs = [
          tempInputPath,
          '-r', '44100',    // Sample rate: 44.1kHz
          '-c', '1',        // Channels: mono
          '-b', '16',       // Bit depth: 16-bit
          targetFullPath
        ];
        
        console.log(`Running SOX conversion (NO CACHE): "${processor.soxPath}" ${soxArgs.join(' ')}`);
        
        const soxProcess = spawn(processor.soxPath, soxArgs);
        
        let stderr = '';
        let stdout = '';
        soxProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        soxProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        const exitCode = await new Promise((resolve) => {
          soxProcess.on('close', resolve);
          soxProcess.on('error', (error) => {
            console.error('SOX process error:', error);
            resolve(-1);
          });
        });
        
        if (exitCode !== 0) {
          console.error(`SOX stderr: ${stderr}`);
          console.error(`SOX stdout: ${stdout}`);
          throw new Error(`SOX conversion failed (exit code ${exitCode}): ${stderr || 'Unknown SOX error'}`);
        }
        
        console.log(`✅ SOX conversion successful`);
        if (stdout) console.log(`SOX output: ${stdout}`);
        
        // Verify output file was created
        if (!fs.existsSync(targetFullPath)) {
          throw new Error(`SOX completed but output file was not created: ${targetFullPath}`);
        }
        
        const outputStats = await fsp.stat(targetFullPath);
        console.log(`📊 Output file size: ${outputStats.size} bytes`);
        
      } catch (soxError) {
        console.warn(`⚠️ SOX conversion failed, trying direct copy: ${soxError.message}`);
        
        // Fallback: direct copy if SOX fails
        try {
          // Ensure output directory exists for fallback too
          const outputDir = path.dirname(targetFullPath);
          if (!fs.existsSync(outputDir)) {
            console.log(`📂 Creating output directory for fallback: ${outputDir}`);
            fs.mkdirSync(outputDir, { recursive: true });
          }
          
          await fsp.copyFile(tempInputPath, targetFullPath);
          console.log(`📋 Used direct file copy as fallback`);
          
          // Verify fallback file was created
          if (!fs.existsSync(targetFullPath)) {
            throw new Error(`Direct copy completed but output file was not created: ${targetFullPath}`);
          }
          
        } catch (copyError) {
          throw new Error(`Both SOX conversion and direct copy failed. SOX error: ${soxError.message}, Copy error: ${copyError.message}`);
        }
      }
      
      // Clean up temp file
      try {
        await fsp.unlink(tempInputPath);
      } catch (cleanupError) {
        console.warn('Failed to clean up temp file:', cleanupError);
      }
      
      // Verify the output file exists
      if (fs.existsSync(targetFullPath)) {
        const stats = await fsp.stat(targetFullPath);
        console.log(`✅ Successfully saved: ${targetPath} (${stats.size} bytes)`);
        
        return {
          success: true,
          savedPath: targetPath,
          sizeBytes: stats.size
        };
      } else {
        throw new Error('Output file was not created');
      }
      
    } catch (error) {
      console.error('Audio conversion and save failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Audio Chapter Concatenation Handler
  ipcMain.handle("audio:concatenateChapter", async (_e, { projectRoot, chapterId, segments, outputFileName }) => {
    try {
      console.log(`🎬 Starting chapter audio concatenation for: ${chapterId}`);
      
      if (!segments || segments.length === 0) {
        throw new Error("No segments provided for concatenation");
      }
      
      // Prepare file paths for concatenation
      const audioFiles = [];
      const tempConcatFile = path.join(__dirname, '../../temp', `concat_${Date.now()}.txt`);
      
      // Ensure temp directory exists
      await fsp.mkdir(path.dirname(tempConcatFile), { recursive: true });
      
      // Build concatenation list for ffmpeg
      let concatContent = '';
      
      for (const segment of segments) {
        let filePath;
        let segmentInfo = '';
        
        if (segment.segmentType === 'sfx' && segment.sfxFile) {
          // SFX segment - use the imported file
          filePath = path.join(projectRoot, segment.sfxFile.path);
          segmentInfo = `SFX: ${segment.sfxFile.filename}`;
        } else {
          // Plan/speech segment - look for generated audio file
          const segmentAudioPath = path.join(projectRoot, 'audio', 'wav', chapterId, `${segment.chunkId}.wav`);
          segmentInfo = `Speech: ${segment.chunkId}`;
          
          if (!fs.existsSync(segmentAudioPath)) {
            throw new Error(`Missing audio file for segment ${segment.chunkId}: ${segmentAudioPath}`);
          }
          
          filePath = segmentAudioPath;
        }
        
        // Verify file exists
        if (!fs.existsSync(filePath)) {
          throw new Error(`Audio file does not exist: ${filePath} (${segmentInfo})`);
        }
        
        // Escape file path for ffmpeg concat format
        const escapedPath = filePath.replace(/\\/g, '/').replace(/'/g, "\\'");
        concatContent += `file '${escapedPath}'\n`;
        
        audioFiles.push(filePath);
        console.log(`📁 Added to concatenation: ${path.basename(filePath)} (${segmentInfo})`);
      }
      
      // Write concatenation file
      await fsp.writeFile(tempConcatFile, concatContent);
      
      // Prepare output path
      const outputDir = path.join(projectRoot, 'audio', 'wav');
      await fsp.mkdir(outputDir, { recursive: true });
      
      const outputPath = path.join(outputDir, outputFileName || `${chapterId}_complete.wav`);
      
      // Use ffmpeg for concatenation (more reliable than SOX for this use case)
      const ffmpegPath = path.join(__dirname, '../../bin/ffmpeg/ffmpeg.exe');
      
      // Check if ffmpeg exists, fallback to system PATH
      let ffmpegCmd = ffmpegPath;
      if (!fs.existsSync(ffmpegPath)) {
        ffmpegCmd = 'ffmpeg';
        console.log('🔧 Using system ffmpeg (bundled not found)');
      } else {
        console.log('🔧 Using bundled ffmpeg');
      }
      
      const ffmpegArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', tempConcatFile,
        // Standardize output format for consistent playback
        '-acodec', 'pcm_s16le',  // 16-bit PCM
        '-ar', '44100',          // 44.1kHz sample rate
        '-ac', '1',              // Mono channel
        '-y',                    // Overwrite output file
        outputPath
      ];
      
      console.log(`🎬 Running ffmpeg concatenation: "${ffmpegCmd}" ${ffmpegArgs.join(' ')}`);
      
      const { spawn } = require('child_process');
      const ffmpegProcess = spawn(ffmpegCmd, ffmpegArgs);
      
      let stderr = '';
      let stdout = '';
      ffmpegProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      ffmpegProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      const exitCode = await new Promise((resolve) => {
        ffmpegProcess.on('close', resolve);
        ffmpegProcess.on('error', (error) => {
          console.error('FFmpeg process error:', error);
          resolve(-1);
        });
      });
      
      // Clean up temp files
      try {
        await fsp.unlink(tempConcatFile);
      } catch (cleanupError) {
        console.warn('Failed to clean up temp concat file:', cleanupError);
      }
      
      if (exitCode !== 0) {
        console.error(`FFmpeg stderr: ${stderr}`);
        console.error(`FFmpeg stdout: ${stdout}`);
        throw new Error(`FFmpeg concatenation failed (exit code ${exitCode}): ${stderr || 'Unknown FFmpeg error'}`);
      }
      
      // Verify the output file exists and get its info
      if (fs.existsSync(outputPath)) {
        const stats = await fsp.stat(outputPath);
        console.log(`✅ Successfully created chapter audio: ${path.basename(outputPath)} (${stats.size} bytes)`);
        
        // Get audio duration using ffprobe if available
        let duration = null;
        try {
          const ffprobePath = path.join(__dirname, '../../bin/ffmpeg/ffprobe.exe');
          const ffprobeCmd = fs.existsSync(ffprobePath) ? ffprobePath : 'ffprobe';
          
          const ffprobeArgs = [
            '-v', 'quiet',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            outputPath
          ];
          
          const ffprobeProcess = spawn(ffprobeCmd, ffprobeArgs);
          let durationStr = '';
          
          ffprobeProcess.stdout.on('data', (data) => {
            durationStr += data.toString();
          });
          
          const probeExitCode = await new Promise((resolve) => {
            ffprobeProcess.on('close', resolve);
            ffprobeProcess.on('error', () => resolve(-1));
          });
          
          if (probeExitCode === 0) {
            duration = parseFloat(durationStr.trim()) || null;
            console.log(`⏱️  Chapter duration: ${duration}s`);
          }
        } catch (probeError) {
          console.warn('Failed to get audio duration:', probeError);
        }
        
        return {
          success: true,
          outputPath: path.relative(projectRoot, outputPath),
          fullPath: outputPath,
          sizeBytes: stats.size,
          duration: duration,
          segmentCount: segments.length
        };
      } else {
        throw new Error('Output file was not created');
      }
      
    } catch (error) {
      console.error('Chapter audio concatenation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Check if complete chapter audio file exists
  ipcMain.handle("audio:checkChapterComplete", async (_e, { projectRoot, chapterId }) => {
    try {
      const chapterFileName = `${chapterId}_complete.wav`;
      const chapterFilePath = path.join(projectRoot, 'audio', 'wav', chapterFileName);
      
      if (fs.existsSync(chapterFilePath)) {
        const stats = await fsp.stat(chapterFilePath);
        return {
          exists: true,
          filePath: path.join('audio', 'wav', chapterFileName),
          sizeBytes: stats.size,
          modifiedTime: stats.mtime.toISOString()
        };
      } else {
        return {
          exists: false
        };
      }
    } catch (error) {
      console.error('Failed to check chapter complete file:', error);
      return {
        exists: false,
        error: error.message
      };
    }
  });
}

app.whenReady().then(createWin);
app.on("window-all-closed", () => app.quit());
