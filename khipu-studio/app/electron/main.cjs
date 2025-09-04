// app/electron/main.cjs
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const repoRoot = path.resolve(__dirname, '..', '..');

function getPythonExe() {
  if (process.env.PYTHON && process.env.PYTHON.trim()) return process.env.PYTHON;
  return process.platform === 'win32'
    ? path.join(repoRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(repoRoot, '.venv', 'bin', 'python');
}
function runPy(args, onLine) {
  const exe = getPythonExe();
  const child = spawn(exe, args, { cwd: repoRoot, windowsHide: true });
  child.on('error', (err) => console.error('[PY spawn error]', exe, err));
  child.stdout.on('data', (buf) => {
    buf.toString().split(/\r?\n/).forEach((l) => {
      if (!l.trim()) return;
      try { onLine?.(JSON.parse(l)); } catch (_) {}
    });
  });
  child.stderr.on('data', (b) => console.log('[PY]', b.toString()));
  return new Promise((res) => child.on('close', (code) => res(code ?? 0)));
}
function pushOpts(args, opts) {
  if (!opts || typeof opts !== 'object') return;
  for (const [k, v] of Object.entries(opts)) {
    const flag = '--' + k;
    if (v === undefined || v === null) continue;
    if (v === true) { args.push(flag); continue; }
    if (Array.isArray(v)) { for (const val of v) args.push(flag, String(val)); continue; }
    args.push(flag, String(v));
  }
}
function resolveUnder(base, p) {
  if (!p) return p;
  return path.isAbsolute(p) ? p : path.join(base, p);
}
function isInside(base, target) {
  const rel = path.relative(base, target);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function createWin() {
  const win = new BrowserWindow({
    width: 1280, height: 800, title: 'Khipu Studio',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true }
  });
  if (process.env.VITE_DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '../dist/index.html'));

// --- plan:build — resolve against the SELECTED project root & never throw ---
ipcMain.handle('plan:build', async (_e, payload = {}) => {
  try {
    const { projectRoot, chapterId, infile, out, opts } = payload;
    if (!projectRoot || typeof projectRoot !== 'string') {
      console.error('[plan:build] missing projectRoot');
      return -1;
    }

    const base = path.resolve(projectRoot); // use the chosen project directly
    const resolveUnder = (p) => (p && !path.isAbsolute(p) ? path.join(base, p) : p);
    const isInside = (target) => {
      const rel = path.relative(base, target);
      return !rel.startsWith('..') && !path.isAbsolute(rel);
    };

    const infileAbs = resolveUnder(String(infile));
    const outAbs    = resolveUnder(String(out));
    const optsAbs   = { ...(opts || {}) };
    if (optsAbs.dossier) optsAbs.dossier = resolveUnder(String(optsAbs.dossier));

    if (!isInside(infileAbs) || !isInside(outAbs)) {
      console.error('[plan:build] path escapes project root', { base, infileAbs, outAbs });
      return -2;
    }

    try { fs.mkdirSync(path.dirname(outAbs), { recursive: true }); } catch {}

    const args = [
      '-m', 'py.ssml.plan_builder',
      '--chapter-id', String(chapterId),
      '--in', infileAbs,
      '--out', outAbs,
    ];
    // push extra opts (bool, arrays, scalars)
    if (optsAbs && typeof optsAbs === 'object') {
      for (const [k, v] of Object.entries(optsAbs)) {
        const flag = '--' + k;
        if (v === true) args.push(flag);
        else if (Array.isArray(v)) v.forEach((vv) => args.push(flag, String(vv)));
        else if (v !== undefined && v !== null) args.push(flag, String(v));
      }
    }

    console.log('[plan:build] base:', base);
    console.log('[plan:build] infile exists?', fs.existsSync(infileAbs), infileAbs);
    console.log('[plan:build] out:', outAbs);

    return runPy(args, (line) => _e.sender.send('job:event', line));
  } catch (err) {
    console.error('[plan:build] fatal:', err);
    return -99; // never throw to renderer
  }
});

  // --- existing handlers (project:choose, fs:read, fs:write) ---
  ipcMain.handle('project:choose', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths?.[0]) return null;
    return res.filePaths[0];
  });
  ipcMain.handle('fs:read', async (_e, { projectRoot, relPath, json }) => {
    const absPath = path.join(projectRoot, relPath);
    if (!isInside(projectRoot, absPath) || !fs.existsSync(absPath)) return null;
    const data = await fsp.readFile(absPath, 'utf-8');
    return json ? JSON.parse(data) : data;
  });
  ipcMain.handle('fs:write', async (_e, { projectRoot, relPath, json, content }) => {
    const absPath = path.join(projectRoot, relPath);
    if (!isInside(projectRoot, absPath)) throw new Error('Path escapes project root');
    await fsp.mkdir(path.dirname(absPath), { recursive: true });
    const data = json ? JSON.stringify(content, null, 2) : String(content);
    await fsp.writeFile(absPath, data, 'utf-8');
    return true;
  });
}

app.whenReady().then(createWin);
app.on('window-all-closed', () => app.quit());
