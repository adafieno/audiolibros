# 1) Recreate electron folder + entry files (as CommonJS)
New-Item -Force -ItemType Directory .\electron | Out-Null

@'
// electron/main.cjs
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

function runPy(args, onLine) {
  const pyPath = process.env.PYTHON || '..\\..\\..\\.venv\\Scripts\\python.exe'; // fallback
  const guess  = process.platform === 'win32' ? '..\\\\.venv\\\\Scripts\\\\python.exe' : '../.venv/bin/python';
  const exe = process.env.PYTHON || guess;
  const child = spawn(exe, args, { cwd: path.join(__dirname, '..', '..') });

  child.stdout.on('data', (buf) => {
    buf.toString().split(/\r?\n/).forEach((l) => {
      if (!l.trim()) return;
      try { const j = JSON.parse(l); if (onLine) onLine(j); } catch (_) {}
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

function createWin() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Khipu Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '../dist/index.html'));

  ipcMain.handle('plan:build', async (_e, payload) => {
    const { chapterId, infile, out, opts } = payload || {};
    const args = ['-m','ssml.plan_builder','--chapter-id', String(chapterId),'--in', String(infile),'--out', String(out)];
    pushOpts(args, opts);
    return runPy(args, (line) => _e.sender.send('job:event', line));
  });
}

app.whenReady().then(createWin);
app.on('window-all-closed', () => app.quit());
'@ | Set-Content -Encoding UTF8 .\electron\main.cjs

@'
// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('khipu', {
  call: (ch, payload) => ipcRenderer.invoke(ch, payload),
  onJob: (cb) => ipcRenderer.on('job:event', (_e, data) => cb?.(data)),
});
'@ | Set-Content -Encoding UTF8 .\electron\preload.cjs

# 2) Force package.json to point to electron/main.cjs (with leading ./)
$pkgPath = Join-Path (Get-Location) 'package.json'
$pkg     = Get-Content $pkgPath -Raw | ConvertFrom-Json
if (-not $pkg.PSObject.Properties['main']) { $pkg | Add-Member -NotePropertyName main -NotePropertyValue './electron/main.cjs' }
else { $pkg.main = './electron/main.cjs' }
($pkg | ConvertTo-Json -Depth 20) | Set-Content -Encoding UTF8 $pkgPath

# 3) Verify files exist and path matches
Write-Host "`nCheck:"
Write-Host "  main in package.json: $($pkg.main)"
Write-Host "  Exists main.cjs?      " (Test-Path .\electron\main.cjs)
Write-Host "  Exists preload.cjs?   " (Test-Path .\electron\preload.cjs)
