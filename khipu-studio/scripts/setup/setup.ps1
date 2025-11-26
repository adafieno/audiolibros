# Khipu Studio Setup Script for Windows
# This script automates the installation of dependencies and setup

$ErrorActionPreference = "Stop"

Write-Host "🎬 Khipu Studio Setup Script" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "🔍 Checking prerequisites..." -ForegroundColor Yellow

# Function to check if command exists
function Test-CommandExists {
    param($command)
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'stop'
    try {
        if (Get-Command $command) { return $true }
    }
    catch { return $false }
    finally { $ErrorActionPreference = $oldPreference }
}

# Check Node.js
if (Test-CommandExists node) {
    $nodeVersion = node --version
    Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
}
else {
    Write-Host "❌ Node.js not found" -ForegroundColor Red
    Write-Host "   Install from: https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "   Or run: winget install OpenJS.NodeJS.LTS" -ForegroundColor Yellow
    exit 1
}

# Check Python
if (Test-CommandExists python) {
    $pythonVersion = python --version
    Write-Host "✅ Python: $pythonVersion" -ForegroundColor Green
}
else {
    Write-Host "❌ Python not found" -ForegroundColor Red
    Write-Host "   Install from: https://www.python.org/" -ForegroundColor Yellow
    Write-Host "   Or run: winget install Python.Python.3.11" -ForegroundColor Yellow
    Write-Host "   ⚠️  Make sure to check 'Add Python to PATH' during installation" -ForegroundColor Yellow
    exit 1
}

# Check FFmpeg
if (Test-CommandExists ffmpeg) {
    Write-Host "✅ FFmpeg: installed" -ForegroundColor Green
}
else {
    Write-Host "⚠️  FFmpeg not found" -ForegroundColor Yellow
    Write-Host "   Install: winget install Gyan.FFmpeg" -ForegroundColor Yellow
    Write-Host "   Or download from: https://ffmpeg.org/download.html" -ForegroundColor Yellow
    Write-Host ""
}

# Check SoX
if (Test-CommandExists sox) {
    Write-Host "✅ SoX: installed" -ForegroundColor Green
}
else {
    Write-Host "⚠️  SoX not found" -ForegroundColor Yellow
    Write-Host "   Install: winget install ChrisBagwell.SoX" -ForegroundColor Yellow
    Write-Host "   Or download from: https://sourceforge.net/projects/sox/" -ForegroundColor Yellow
    Write-Host ""
}

# Check Git
if (Test-CommandExists git) {
    Write-Host "✅ Git: installed" -ForegroundColor Green
}
else {
    Write-Host "❌ Git not found" -ForegroundColor Red
    Write-Host "   Install: winget install Git.Git" -ForegroundColor Yellow
    Write-Host "   Or download from: https://git-scm.com/download/win" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "📦 Installing Node.js dependencies..." -ForegroundColor Yellow
Set-Location app
if (Test-Path "node_modules") {
    Write-Host "   node_modules exists, running npm install to ensure all deps..." -ForegroundColor Gray
}
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ npm install failed" -ForegroundColor Red
    exit 1
}

Set-Location ..

Write-Host ""
Write-Host "🐍 Setting up Python virtual environment..." -ForegroundColor Yellow
if (Test-Path ".venv") {
    Write-Host "   .venv exists, skipping creation" -ForegroundColor Gray
}
else {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to create virtual environment" -ForegroundColor Red
        exit 1
    }
    Write-Host "   ✅ Virtual environment created" -ForegroundColor Green
}

Write-Host ""
Write-Host "📦 Installing Python dependencies..." -ForegroundColor Yellow
& .venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ pip install failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "⚙️  Configuration check..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Write-Host "   ✅ .env file exists" -ForegroundColor Green
}
else {
    Write-Host "   ⚠️  .env file not found" -ForegroundColor Yellow
    Write-Host "   Creating template .env file..." -ForegroundColor Gray
    
    $envContent = @"
# Azure Cognitive Services TTS (Required)
AZURE_TTS_KEY=your_azure_tts_subscription_key
AZURE_TTS_REGION=eastus

# Azure TTS Voice (Optional - defaults provided)
AZURE_TTS_DEFAULT_VOICE=es-ES-ElviraNeural

# OpenAI API (Optional - for character detection)
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1

# Azure OpenAI (Alternative to OpenAI)
# OPENAI_BASE_URL=https://your-resource.openai.azure.com/v1
# OPENAI_API_VERSION=2024-02-15-preview
"@
    
    $envContent | Out-File -FilePath ".env" -Encoding UTF8
    Write-Host "   ✅ Template .env created" -ForegroundColor Green
    Write-Host "   ⚠️  Please edit .env and add your API keys" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Edit .env file with your API keys:" -ForegroundColor White
Write-Host "      notepad .env" -ForegroundColor Gray
Write-Host ""
Write-Host "   2. Run the application:" -ForegroundColor White
Write-Host "      cd app" -ForegroundColor Gray
Write-Host "      npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "📚 Documentation:" -ForegroundColor Cyan
Write-Host "   - Installation Guide: INSTALL.md" -ForegroundColor White
Write-Host "   - User Guide: docs\03-user-guide.md" -ForegroundColor White
Write-Host ""
Write-Host "🎉 Happy audiobook creating!" -ForegroundColor Green
