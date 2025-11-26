# Khipu Studio

![Khipu Studio Logo](./docs/images/khipu-icon.png)

**AI-powered audiobook production studio with multi-language support**

Khipu Studio is a comprehensive desktop application that transforms manuscripts into professional audiobooks using advanced AI voice synthesis, intelligent character detection, and automated production workflows.

## ✨ Key Features

- 📚 **Manuscript Processing** - Import and process manuscripts in multiple formats (TXT, DOCX)
- 🎭 **AI Character Detection** - Automatically identify and analyze characters from your story
- 🎤 **Voice Casting** - Smart voice assignment with 500+ multilingual voices
- 🎵 **Audio Production** - Professional audio synthesis with customizable voice styles
- 🔊 **Audio Processing** - Advanced audio mastering with compression, EQ, and normalization
- 📦 **Multi-Platform Packaging** - Export for Apple Books, Google Play, Spotify, ACX, and Kobo
- 🌍 **Multilingual** - Interface in English, Spanish, and Portuguese

## 📋 System Requirements

### Supported Platforms

- ✅ **Windows 10/11** (64-bit)
- ✅ **macOS 11.0+** (Big Sur or later, both Intel and Apple Silicon)
- ✅ **Linux** (Ubuntu 20.04+, Fedora 35+, or equivalent)

### Hardware Requirements

- **RAM:** 8GB minimum, 16GB recommended
- **Storage:** 2GB for application, 10GB+ for projects
- **Processor:** Multi-core CPU (4+ cores recommended)
- **Audio:** Sound card for audio playback

## 🚀 Quick Start

### For End Users

**Download the installer for your platform:**

- **Windows:** `Khipu-Studio-Setup-x.x.x.exe` or `Khipu-Studio-x.x.x.msi`
- **macOS:** `Khipu-Studio-x.x.x.dmg`
- **Linux:** `Khipu-Studio-x.x.x.AppImage` or `.deb`/`.rpm`

Double-click the installer and follow the setup wizard. All dependencies are bundled.

📘 **Detailed Setup**: See [docs/installation/QUICKSTART.md](./docs/installation/QUICKSTART.md)

### Configure API Keys

After installation, on first launch you'll be prompted to configure:

```env
# Azure TTS (Required)
AZURE_TTS_KEY=your_azure_tts_key
AZURE_TTS_REGION=eastus

# OpenAI (Optional, for character detection)
OPENAI_API_KEY=your_openai_api_key
```

Get your Azure TTS key from [Azure Portal](https://portal.azure.com/).

---

### For Developers

If you're building from source, see [INSTALL.md](./INSTALL.md) for complete setup instructions.

**Prerequisites:**
- Node.js 18+
- Python 3.11+
- FFmpeg & SoX

**Setup:**

```bash
# Windows
.\setup.ps1

# macOS/Linux
./setup.sh
```

## 📖 Documentation

- **[Documentation Index](./docs/README.md)** - Complete documentation organization
- **[Quick Start](./docs/installation/QUICKSTART.md)** - Get started in 5 minutes
- **[Installation Guide (Users)](./docs/installation/INSTALLATION-GUIDE.md)** - End-user setup
- **[Installation Guide (Developers)](./docs/installation/INSTALL.md)** - Build from source
- **[Development Tools](./docs/development/)** - Automation and developer guides
- **[Cloud Architecture](./docs-cloud/)** - Cloud migration documentation
- **[Utility Scripts](./scripts/README.md)** - Script organization and usage

## 🔧 Building Installers

### Build Installers for Distribution

```bash
cd app

# Build for current platform
npm run build

# Build platform-specific installers
npm run build:win    # Windows (.exe, .msi)
npm run build:mac    # macOS (.dmg)
npm run build:linux  # Linux (.AppImage, .deb, .rpm)
npm run build:all    # All platforms
```

**Output locations:**
- Windows: `app/dist/Khipu-Studio-Setup-x.x.x.exe`, `.msi`
- macOS: `app/dist/Khipu-Studio-x.x.x.dmg`
- Linux: `app/dist/Khipu-Studio-x.x.x.AppImage`, `.deb`, `.rpm`

### Project Structure

```
khipu-studio/
├── app/                    # Electron + React application
│   ├── src/               # React source code
│   ├── electron/          # Electron main process
│   └── public/            # Static assets
├── py/                    # Python backend scripts
│   ├── characters/        # Character detection
│   ├── dossier/          # Project analysis
│   ├── packaging/        # Multi-platform packaging
│   ├── ssml/             # SSML generation
│   └── tts/              # Text-to-speech
├── bin/                   # External binaries (FFmpeg)
├── docs/                  # Documentation
└── project-templates/     # Project templates
```

## 🌍 Supported Languages

**Interface Languages:**
- 🇺🇸 English (en-US)
- 🇪🇸 Spanish (es-PE)
- 🇧🇷 Portuguese (pt-BR)

**TTS Languages:** 
Spanish, English, Portuguese, French, German, Italian, Chinese, Japanese, and 40+ more via Azure Cognitive Services.

## 📦 Export Platforms

- **Apple Books** - M4B audiobook format with chapter markers
- **Google Play Books** - ZIP with MP3 chapters and RSS feed
- **Spotify Audiobooks** - ZIP with MP3 chapters and metadata
- **ACX/Audible** - ZIP with MP3 chapters (ACX requirements)
- **Kobo** - EPUB3 with embedded audio and MediaOverlay sync

## 📄 License

Copyright © 2025 Agustín Da Fieno Delucchi. All rights reserved.

**This is proprietary software.** Redistribution, modification, or reverse engineering is prohibited without explicit written permission.

## 📁 Project Structure

```
khipu-studio/
├── app/                    # Desktop application (Electron + React + Vite)
├── khipu-cloud-api/        # Cloud backend (FastAPI microservices)
├── khipu-web/              # Web frontend (React + Vite)
├── shared/                 # Shared types/schemas
├── scripts/                # Utility scripts and tools
│   ├── screenshot-automation/
│   ├── pdf-conversion/
│   ├── maintenance/
│   ├── testing/
│   └── setup/
├── docs/                   # Desktop app documentation
├── docs-cloud/             # Cloud architecture docs
├── lib/                    # Shared libraries
├── py/                     # Python backend services
├── assets/                 # Static assets (icons, audio)
├── project-templates/      # Project templates
└── temp-data/              # Cache and temporary files
```

See [scripts/README.md](./scripts/README.md) for utility script documentation.

## 🆘 Support

For technical support, licensing, or feature requests:
- Email: adafieno@hotmail.com
- Include your license key and version number

## 🙏 Acknowledgments

- Azure Cognitive Services for TTS
- FFmpeg and SoX for audio processing
- Electron and React communities
- All open-source contributors

---

**Made with ❤️ for audiobook creators**
