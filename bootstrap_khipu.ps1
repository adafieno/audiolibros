# bootstrap_khipu.ps1
# Khipu Studio dev setup (Windows, PowerShell 5+)

# ---------------- helpers ----------------
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Need($cmd) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Missing dependency: $cmd"
  }
}

function New-Dir($path) {
  if (-not (Test-Path $path)) { New-Item -Force -ItemType Directory $path | Out-Null }
}

function Write-FileNoBOM($Path, [string]$Content) {
  $full = [System.IO.Path]::GetFullPath($Path)
  $dir  = [System.IO.Path]::GetDirectoryName($full)
  if ($dir -and -not (Test-Path $dir)) { New-Item -Force -ItemType Directory $dir | Out-Null }
  $enc  = New-Object System.Text.UTF8Encoding($false)  # no BOM
  [System.IO.File]::WriteAllText($full, $Content, $enc)
}

function Set-JsonProperty([pscustomobject]$obj, [string]$name, $value) {
  if ($obj.PSObject.Properties[$name]) { $obj.PSObject.Properties.Remove($name) }
  $obj | Add-Member -NotePropertyName $name -NotePropertyValue $value -Force
}

# --------------- checks ------------------
Need node
Need npm
Need python

# --------------- layout ------------------
New-Dir khipu-studio/bin/ffmpeg
New-Dir khipu-studio/assets/icons
New-Dir khipu-studio/assets/sfx
New-Dir khipu-studio/project-templates
New-Dir khipu-studio/py
New-Dir khipu-studio/app
New-Dir khipu-studio/dist
New-Dir khipu-studio/sample

Set-Location khipu-studio

# --------------- Python venv -------------
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip

$req = @'
numpy
scipy
soundfile
openai
azure-cognitiveservices-speech
'@
$repo = Get-Location
$reqPath = Join-Path $repo 'requirements.txt'
Write-FileNoBOM $reqPath $req
$venvPip = Join-Path $repo '.venv\Scripts\pip.exe'
& $venvPip install -r $reqPath

# --------------- sample project ----------
New-Dir sample\analysis\chapters_txt
New-Dir sample\ssml\plans
New-Dir sample\dossier
New-Dir sample\audio

$sampleTxt = @'
—¿Llegaste temprano? —preguntó Rosa.
"Un poco", dijo Luis. La lluvia golpeaba los cristales.
'@
Write-FileNoBOM sample\analysis\chapters_txt\ch01.txt $sampleTxt

$envFile = @'
OPENAI_API_KEY=
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
FFMPEG_PATH=bin/ffmpeg/ffmpeg.exe
FFPROBE_PATH=bin/ffmpeg/ffprobe.exe
PYTHON=.venv\Scripts\python.exe
'@
Write-FileNoBOM .env $envFile

# --------------- React + Electron --------
Set-Location app
npm create vite@latest . -- --template react-ts
npm i
npm i -D electron electron-builder concurrently cross-env
npm i wavesurfer.js howler zustand @tanstack/react-table react-hook-form

New-Dir electron

# Electron main (CommonJS)
$mainCjs = @'
// electron/main.cjs
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

function runPy(args, onLine) {
  const pyPath = process.env.PYTHON || '..\\\\.venv\\\\Scripts\\\\python.exe';
  const child = spawn(pyPath, args, { cwd: path.join(__dirname, '..', '..') });

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
'@
Write-FileNoBOM electron\main.cjs $mainCjs

# Electron preload (CommonJS)
$preloadCjs = @'
// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('khipu', {
  call: (ch, payload) => ipcRenderer.invoke(ch, payload),
  onJob: (cb) => ipcRenderer.on('job:event', (_e, data) => cb?.(data)),
});
'@
Write-FileNoBOM electron\preload.cjs $preloadCjs

# PostCSS config (JS, not JSON — avoids BOM/JSON issues)
$postcss = @'
module.exports = {
  plugins: {
    // tailwindcss: {},
    // autoprefixer: {},
  },
};
'@
Write-FileNoBOM postcss.config.cjs $postcss

# Ensure src/index.css has no BOM
$cssPath = Join-Path (Get-Location) 'src\index.css'
if (Test-Path $cssPath) {
  $css = Get-Content -Raw $cssPath
  Write-FileNoBOM $cssPath $css
}

# Patch package.json safely
$pkgPath = Join-Path (Get-Location) 'package.json'
$pkg     = Get-Content $pkgPath -Raw | ConvertFrom-Json

Set-JsonProperty $pkg 'name'        'khipu-studio'
Set-JsonProperty $pkg 'productName' 'Khipu Studio'
Set-JsonProperty $pkg 'main'        'electron/main.cjs'

if (-not $pkg.PSObject.Properties['scripts']) { Set-JsonProperty $pkg 'scripts' ([pscustomobject]@{}) }
$pkg.scripts | Add-Member -NotePropertyName 'dev'        -NotePropertyValue 'concurrently -k "vite" "cross-env VITE_DEV=1 electron ."' -Force
$pkg.scripts | Add-Member -NotePropertyName 'build:ui'   -NotePropertyValue 'vite build'                                               -Force
$pkg.scripts | Add-Member -NotePropertyName 'build'      -NotePropertyValue 'npm run build:ui && electron-builder'                     -Force

$build = [pscustomobject]@{
  appId = 'com.khipu.studio'
  files = @('dist/**','electron/**','../py/**','../bin/**','!**/*.map')
  asar  = $true
  extraResources = @(
    [pscustomobject]@{ from = '../py';  to = 'py'  },
    [pscustomobject]@{ from = '../bin'; to = 'bin' }
  )
  mac   = [pscustomobject]@{ icon = 'assets/icons/khipu.icns' }
  win   = [pscustomobject]@{ icon = 'assets/icons/khipu.ico'  }
  linux = [pscustomobject]@{ icon = 'assets/icons/khipu.png'  }
}
Set-JsonProperty $pkg 'build' $build

Write-FileNoBOM $pkgPath (($pkg | ConvertTo-Json -Depth 20))

# Minimal test UI
$appTsx = @'
import { useState } from 'react';
function join(...xs:string[]){ return xs.join('/').replace(/\/+/g,'/'); }

export default function App() {
  const [root,setRoot]=useState<string>('sample');
  async function runPlan(){
    const infile = join(root,'analysis/chapters_txt/ch01.txt');
    const out    = join(root,'ssml/plans/ch01.plan.json');
    await (window as any).khipu.call('plan:build',{
      chapterId:'ch01', infile, out,
      opts:{ dossier: join(root,'dossier'), 'llm-attribution': 'off', 'max-kb': 48 }
    });
    alert('Plan listo: ' + out);
  }
  return (
    <div style={{padding:24,fontFamily:'Segoe UI, system-ui, sans-serif'}}>
      <h1>Khipu Studio</h1>
      <p>Carpeta de proyecto:</p>
      <input value={root} onChange={e=>setRoot((e.target as HTMLInputElement).value)} style={{width:480}}/>
      <div style={{marginTop:12}}>
        <button onClick={runPlan} style={{padding:'8px 14px'}}>Generar plan (capítulo 1)</button>
      </div>
      <p style={{marginTop:16,color:'#666'}}>Tip: usa la carpeta "sample" en el raíz del repo.</p>
    </div>
  );
}
'@
Write-FileNoBOM src\App.tsx $appTsx

# --------------- done --------------------
$pyDir = (Resolve-Path ..\py).Path
$ffDir = (Resolve-Path ..\bin\ffmpeg).Path
Write-Host ""
Write-Host "Khipu Studio bootstrap complete."
Write-Host "Next steps:"
Write-Host "  1 Put your Python modules under: $pyDir e.g., ssml\plan_builder.py"
Write-Host "  2 Drop ffmpeg.exe `& ffprobe.exe into: $ffDir"
Write-Host "  3 Start dev: cd .\app ; npm run dev"
