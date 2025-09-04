// app/electron/main.cjs
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

// Avoid rare Windows black-screen on GPU crashes
app.disableHardwareAcceleration();

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
      try { onLine?.(JSON.parse(l)); } catch (_) { /* allow non-JSON lines */ }
    });
  });
  child.stderr.on('data', (b) => console.log('[PY]', b.toString()));
  return new Promise((res) => child.on('close', (code) => res(code ?? 0)));
}

function createWin() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Khipu Studio',
    backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
    },
  });

  // Log renderer/gpu issues instead of silently blanking
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer gone]', details);
  });
  app.on('gpu-process-crashed', (_e, killed) => {
    console.error('[gpu crashed]', { killed });
  });

  if (process.env.VITE_DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '../dist/index.html'));

  // ---------------- IPC HANDLERS (ALL SAFE) ----------------

  // Plan build — resolve under the SELECTED project root
  ipcMain.handle('plan:build', async (_e, payload = {}) => {
    try {
      const { projectRoot, chapterId, infile, out, opts } = payload;
      if (!projectRoot || typeof projectRoot !== 'string') {
        console.error('[plan:build] missing projectRoot');
        return -1;
      }

      const base = path.resolve(projectRoot);
      const resolveUnder = (p) => (p && !path.isAbsolute(p) ? path.join(base, p) : p);
      const inside = (p) => {
        const rel = path.relative(base, p);
        return !rel.startsWith('..') && !path.isAbsolute(rel);
      };

      const infileAbs = resolveUnder(String(infile));
      const outAbs    = resolveUnder(String(out));
      const optsAbs   = { ...(opts || {}) };
      if (optsAbs.dossier) optsAbs.dossier = resolveUnder(String(optsAbs.dossier));

      if (!inside(infileAbs) || !inside(outAbs)) {
        console.error('[plan:build] path escapes project root', { base, infileAbs, outAbs });
        return -2;
      }

      try { fs.mkdirSync(path.dirname(outAbs), { recursive: true }); } catch {}

      const args = ['-m', 'py.ssml.plan_builder',
        '--chapter-id', String(chapterId),
        '--in', infileAbs,
        '--out', outAbs,
      ];
      for (const [k, v] of Object.entries(optsAbs)) {
        const flag = '--' + k;
        if (v === true) args.push(flag);
        else if (Array.isArray(v)) v.forEach((vv) => args.push(flag, String(vv)));
        else if (v !== undefined && v !== null) args.push(flag, String(v));
      }

      console.log('[plan:build] base:', base);
      console.log('[plan:build] infile exists?', fs.existsSync(infileAbs), infileAbs);
      console.log('[plan:build] out:', outAbs);

      return await runPy(args, (line) => _e.sender.send('job:event', line));
    } catch (err) {
      console.error('[plan:build] fatal:', err);
      return -99; // never throw to renderer
    }
  });

  ipcMain.handle('app:locale', () => {
  try { return app.getLocale(); } catch { return 'es-PE'; }
  });

  // Folder picker
  ipcMain.handle('project:choose', async () => {
    try {
      const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
      if (res.canceled || !res.filePaths?.[0]) return null;
      return res.filePaths[0];
    } catch (e) {
      console.error('[project:choose]', e);
      return null;
    }
  });

  // Read file (scoped to project root)
  ipcMain.handle('fs:read', async (_e, { projectRoot, relPath, json }) => {
    try {
      const absPath = path.join(projectRoot, relPath);
      const rel = path.relative(projectRoot, absPath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
      if (!fs.existsSync(absPath)) return null;
      const data = await fsp.readFile(absPath, 'utf-8');
      return json ? JSON.parse(data) : data;
    } catch (e) {
      console.error('[fs:read]', e);
      return null;
    }
  });

  // Write file (scoped to project root)
  ipcMain.handle('fs:write', async (_e, { projectRoot, relPath, json, content }) => {
    try {
      const absPath = path.join(projectRoot, relPath);
      const rel = path.relative(projectRoot, absPath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
      await fsp.mkdir(path.dirname(absPath), { recursive: true });
      const data = json ? JSON.stringify(content, null, 2) : String(content);
      await fsp.writeFile(absPath, data, 'utf-8');
      return true;
    } catch (e) {
      console.error('[fs:write]', e);
      return false;
    }
  });
}

app.whenReady().then(createWin);
app.on('window-all-closed', () => app.quit());
