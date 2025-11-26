# Khipu Studio - Developer Installation Guide

**For End Users:** If you're looking to install Khipu Studio, download the installer from the distribution site. This guide is for developers building from source.

---

Complete installation instructions for building Khipu Studio from source on Windows, macOS, and Linux.

## Table of Contents

- [Windows Installation](#windows-installation)
- [macOS Installation](#macos-installation)
- [Linux Installation](#linux-installation)
- [Configuration](#configuration)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

---

## Windows Installation

### Prerequisites

#### 1. Install Node.js

Download and install Node.js 18 or later from [nodejs.org](https://nodejs.org/)

```powershell
# Verify installation
node --version  # Should show v18.0.0 or higher
npm --version
```

#### 2. Install Python

Download and install Python 3.11+ from [python.org](https://www.python.org/downloads/)

**⚠️ Important:** Check "Add Python to PATH" during installation

```powershell
# Verify installation
python --version  # Should show 3.11.0 or higher
pip --version
```

#### 3. Install FFmpeg

**Option A: Using WinGet (Recommended)**

```powershell
winget install Gyan.FFmpeg
```

**Option B: Manual Installation**

1. Download FFmpeg from [ffmpeg.org](https://www.ffmpeg.org/download.html#build-windows)
2. Extract to `C:\ffmpeg`
3. Add `C:\ffmpeg\bin` to System PATH:
   - Open "Environment Variables" (search in Windows)
   - Edit "Path" under System Variables
   - Add new entry: `C:\ffmpeg\bin`
   - Click OK and restart terminal

```powershell
# Verify installation
ffmpeg -version
```

#### 4. Install SoX

**Using WinGet (Recommended)**

```powershell
winget install ChrisBagwell.SoX
```

**Manual Installation:**

1. Download SoX from [sourceforge.net/projects/sox](https://sourceforge.net/projects/sox/files/sox/)
2. Extract to `C:\Program Files\sox`
3. Add to System PATH: `C:\Program Files\sox`

```powershell
# Verify installation
sox --version
```

### Application Installation

```powershell
# Clone repository
git clone https://github.com/yourusername/khipu-studio.git
cd khipu-studio

# Install Node dependencies
cd app
npm install
cd ..

# Create Python virtual environment
python -m venv .venv
.venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt
```

---

## macOS Installation

### Prerequisites

#### 1. Install Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### 2. Install Node.js

```bash
brew install node@18

# Verify installation
node --version
npm --version
```

#### 3. Install Python

```bash
brew install python@3.11

# Verify installation
python3 --version
pip3 --version
```

#### 4. Install FFmpeg

```bash
brew install ffmpeg

# Verify installation
ffmpeg -version
```

#### 5. Install SoX

```bash
brew install sox

# Verify installation
sox --version
```

### Application Installation

```bash
# Clone repository
git clone https://github.com/yourusername/khipu-studio.git
cd khipu-studio

# Install Node dependencies
cd app
npm install
cd ..

# Create Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

---

## Linux Installation

### Prerequisites

#### Ubuntu/Debian

```bash
# Update package list
sudo apt update

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python 3.11+
sudo apt install -y python3.11 python3.11-venv python3-pip

# Install FFmpeg
sudo apt install -y ffmpeg

# Install SoX
sudo apt install -y sox libsox-fmt-all

# Install Git
sudo apt install -y git

# Verify installations
node --version
python3 --version
ffmpeg -version
sox --version
```

#### Fedora/RHEL

```bash
# Install Node.js
sudo dnf install -y nodejs npm

# Install Python
sudo dnf install -y python3.11 python3-pip

# Install FFmpeg
sudo dnf install -y ffmpeg

# Install SoX
sudo dnf install -y sox

# Install Git
sudo dnf install -y git

# Verify installations
node --version
python3 --version
ffmpeg -version
sox --version
```

#### Arch Linux

```bash
# Install all prerequisites
sudo pacman -S nodejs npm python python-pip ffmpeg sox git

# Verify installations
node --version
python --version
ffmpeg -version
sox --version
```

### Application Installation

```bash
# Clone repository
git clone https://github.com/yourusername/khipu-studio.git
cd khipu-studio

# Install Node dependencies
cd app
npm install
cd ..

# Create Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

---

## Configuration

### 1. Create Environment File

Create a `.env` file in the root directory:

```bash
# Windows
notepad .env

# macOS/Linux
nano .env
```

Add the following configuration:

```env
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
```

### 2. Get Azure TTS Credentials

1. Go to [Azure Portal](https://portal.azure.com/)
2. Create a "Speech Services" resource
3. Get your **Key** and **Region** from the resource page
4. Add to `.env` file

### 3. Get OpenAI API Key (Optional)

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create an API key
3. Add to `.env` file

---

## Verification

### Test Installation

```bash
# Activate virtual environment
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Test Python dependencies
python -c "import numpy, scipy, soundfile, azure.cognitiveservices.speech; print('✅ Python deps OK')"

# Test Node installation
cd app
npm run lint

# Run application in development mode
npm run dev
```

### Expected Output

When you run `npm run dev`, you should see:

```
VITE v7.1.5  ready in XXX ms
➜  Local:   http://localhost:5173/
```

And Electron should open with the Khipu Studio interface.

---

## Troubleshooting

### Windows Issues

#### FFmpeg Not Found

```powershell
# Add FFmpeg to PATH manually
$env:Path += ";C:\ffmpeg\bin"

# Or permanently:
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\ffmpeg\bin", "Machine")
```

#### Python Not Found

```powershell
# Use py launcher
py -3.11 -m venv .venv
```

#### Permission Errors

Run PowerShell as Administrator

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### macOS Issues

#### Command Line Tools Not Found

```bash
xcode-select --install
```

#### Homebrew Installation Fails

```bash
# Check Homebrew
brew doctor

# Update Homebrew
brew update
```

#### Permission Issues

```bash
# Fix npm permissions
sudo chown -R $USER:$(id -gn $USER) ~/.npm
```

### Linux Issues

#### Node.js Version Too Old

```bash
# Remove old Node.js
sudo apt remove nodejs npm

# Install from NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

#### Missing System Libraries

```bash
# Ubuntu/Debian
sudo apt install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# Fedora
sudo dnf install -y gcc-c++ cairo-devel pango-devel libjpeg-turbo-devel giflib-devel
```

#### Python SSL Certificate Issues

```bash
# Ubuntu/Debian
sudo apt install -y ca-certificates
sudo update-ca-certificates

# Fedora
sudo dnf install -y ca-certificates
sudo update-ca-trust
```

### Common Issues (All Platforms)

#### Cannot Find Module Errors

```bash
# Clear node_modules and reinstall
cd app
rm -rf node_modules package-lock.json
npm install
```

#### Python Package Installation Fails

```bash
# Upgrade pip
pip install --upgrade pip setuptools wheel

# Reinstall requirements
pip install -r requirements.txt --force-reinstall
```

#### Electron Won't Start

```bash
# Clear Electron cache
# Windows:
rd /s /q %APPDATA%\khipu-studio
# macOS/Linux:
rm -rf ~/Library/Application\ Support/khipu-studio
```

#### Audio Processing Fails

```bash
# Verify FFmpeg and SoX
ffmpeg -version
sox --version

# Check audio files are accessible
ls -la audio/wav/
```

### Getting Help

If issues persist:

1. **Check Logs:** Look in developer console (Ctrl+Shift+I or Cmd+Option+I)
2. **Check Terminal Output:** Error messages show in terminal
3. **Verify Prerequisites:** Run verification commands above
4. **Open Issue:** Create GitHub issue with:
   - Operating system and version
   - Node.js version (`node --version`)
   - Python version (`python --version`)
   - Full error message
   - Steps to reproduce

---

## Next Steps

After successful installation:

1. **Read the [User Guide](./docs/03-user-guide.md)** to learn how to use Khipu Studio
2. **Try a Sample Project:** Load a test project from `project-templates/`
3. **Configure Voice Inventory:** Set up your preferred voices
4. **Start Creating:** Import your first manuscript!

---

**Installation complete! 🎉**

Run `npm run dev` from the `app` directory to start creating audiobooks.
