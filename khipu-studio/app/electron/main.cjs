// app/electron/main.cjs
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { spawn } = require("node:child_process");
const path = require("path");
const fs = require("node:fs");
const fsp = fs.promises;

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

/** Run character detection script (build_from_manuscript) */
async function runCharacterDetection(projectRoot) {
  const script = path.join(repoRoot, "py", "dossier", "build_from_manuscript.py");
  // Basic existence check
  try { await fsp.access(script); } catch { throw new Error("Character detection script not found"); }

  // We assume structure + chapters already exist; script itself handles missing gracefully.
  const exe = getPythonExe();
  return new Promise((resolve, reject) => {
    const proc = spawn(exe, [script], { cwd: projectRoot || repoRoot, windowsHide: true });
    let stderr = ""; let stdout = "";
    proc.stdout.on("data", d => { stdout += d.toString(); });
    proc.stderr.on("data", d => { const s = d.toString(); stderr += s; BrowserWindow.getAllWindows().forEach(w=> w.webContents.send("characters:detection:log", s)); });
    proc.on("error", err => reject(err));
    proc.on("close", async (code) => {
      if (code !== 0) return reject(new Error(`Detection exited with code ${code}. stderr: ${stderr.split(/\n/).slice(-8).join("\n")}`));
      // Try reading characters.json
      try {
        const jsonPath = path.join(projectRoot, "dossier", "characters.json");
        const data = await readJsonIf(jsonPath) || [];
        resolve({ characters: data, raw: stdout });
      } catch (e) {
        reject(new Error("Detection finished but characters.json not readable"));
      }
    });
  });
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
    "dossier",
    "ssml/plans",
    "ssml/xml",
    "cache/tts",
    "audio/chapters",
    "audio/book",
    "exports",
  ]);

  // project.khipu.json — minimal & consistent
  const projectCfg = {
    version: 1,
    language: "es-PE",
    paths: { bookMeta: "book.meta.json", production: "production.settings.json" },
    planning: { maxKb: 48, llmAttribution: "off" },
    ssml: {},
    tts: { engine: { name: "azure", voice: "es-PE-CamilaNeural" }, cache: true },
    llm: { engine: { name: "openai", model: "gpt-4o" } },
    export: { outputDir: "exports", platforms: { apple: false, google: false, spotify: false } },
    creds: { useAppAzure: false, useAppOpenAI: false },
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
}

const crypto = require("node:crypto");
function resolveUnder(root, p) {
  const abs = path.isAbsolute(p) ? p : path.join(root, p);
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Path escapes project root");
  return abs;
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

  /* Project: list, choose, create, open */
  ipcMain.handle("project:listRecents", async () => {
    const cfg = await getAppConfig();
    return (cfg.recentProjects || []).map((p) => ({ path: p, name: path.basename(p) }));
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
  });// ---- IPC: parse manuscript via Python module (FIXED FLAGS) ----
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
        "-m", "py.ssml.plan_builder",
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

      return await runPy(args, (line) => _e.sender.send("job:event", line));
    } catch (err) {
      console.error("[plan:build] fatal:", err);
      return -99;
    }
  });
}

app.whenReady().then(createWin);
app.on("window-all-closed", () => app.quit());
