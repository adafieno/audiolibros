# Quick Start Guide

Get Khipu Studio running in 5 minutes!

## For End Users

### Download Installer

Get the installer for your platform:
- **Windows:** `Khipu-Studio-Setup-x.x.x.exe`
- **macOS:** `Khipu-Studio-x.x.x.dmg`
- **Linux:** `Khipu-Studio-x.x.x.AppImage`

### Install

1. **Run the installer** for your platform
2. **Follow the setup wizard**
3. **Launch Khipu Studio**

### Configure

On first launch, enter your API keys:

```env
AZURE_TTS_KEY=your_azure_key_here
AZURE_TTS_REGION=eastus
```

Get your Azure TTS key from [Azure Portal](https://portal.azure.com/).

See [INSTALLATION-GUIDE.md](./INSTALLATION-GUIDE.md) for detailed setup instructions.

---

## For Developers

### Prerequisites Quick Check

Before starting, ensure you have:

- ✅ **Node.js 18+** - [Download](https://nodejs.org/)
- ✅ **Python 3.11+** - [Download](https://www.python.org/)
- ✅ **FFmpeg** - [Install Guide](./INSTALL.md)
- ✅ **SoX** - [Install Guide](./INSTALL.md)
- ✅ **Azure TTS Key** - [Get Started](https://azure.microsoft.com/en-us/services/cognitive-services/text-to-speech/)

## Installation

### Automated Setup (Recommended)

**Windows:**
```powershell
# Run setup script
.\setup.ps1
```

**macOS/Linux:**
```bash
# Make script executable
chmod +x setup.sh

# Run setup script
./setup.sh
```

### Manual Setup

```bash
# Install Node dependencies
cd app
npm install
cd ..

# Create Python virtual environment
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

## Configuration

1. **Create .env file** in root directory:

```env
AZURE_TTS_KEY=your_azure_key_here
AZURE_TTS_REGION=eastus
OPENAI_API_KEY=your_openai_key_here  # Optional
```

2. **Get Azure TTS credentials:**
   - Go to [Azure Portal](https://portal.azure.com/)
   - Create "Speech Services" resource
   - Copy Key and Region to .env

## Run the App

```bash
cd app
npm run dev
```

The app will open automatically. If not, go to http://localhost:5173

## First Project

1. **Click "New Project"**
2. **Enter project name** (e.g., "my-first-audiobook")
3. **Select language** (Spanish, English, or Portuguese)
4. **Import manuscript** (TXT or DOCX file)
5. **Start production!**

## Common Commands

```bash
# Start development server
cd app
npm run dev

# Build for production
npm run build

# Build for specific platform
npm run build:win     # Windows
npm run build:mac     # macOS
npm run build:linux   # Linux
```

## Troubleshooting

### App won't start?

1. Check prerequisites are installed
2. Verify .env file exists with valid keys
3. Check terminal for error messages
4. See [INSTALL.md](./INSTALL.md) troubleshooting section

### Audio not generating?

1. Verify Azure TTS key is valid
2. Check internet connection
3. Look for errors in dev console (Ctrl+Shift+I)

### Missing dependencies?

```bash
# Reinstall Node dependencies
cd app
rm -rf node_modules package-lock.json
npm install

# Reinstall Python dependencies
pip install -r requirements.txt --force-reinstall
```

## Next Steps

- 📖 Read the [User Guide](./docs/03-user-guide.md) for detailed instructions
- 🏗️ Learn about [Architecture](./docs/01-architectural-design.md)
- 🎭 Explore [Character Detection](./docs/02-feature-specifications.md#character-detection)
- 🎤 Configure [Voice Casting](./docs/02-feature-specifications.md#voice-casting)

## Get Help

- **Documentation:** [./docs](./docs)
- **Issues:** Open GitHub issue
- **Email:** adafieno@hotmail.com

---

**Ready to create audiobooks? Let's go! 🎉**
