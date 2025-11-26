#!/usr/bin/env bash
# Khipu Studio Setup Script for macOS/Linux
# This script automates the installation of dependencies and setup

set -e  # Exit on error

echo "🎬 Khipu Studio Setup Script"
echo "=============================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detect OS
OS="$(uname -s)"
case "${OS}" in
    Linux*)     MACHINE=Linux;;
    Darwin*)    MACHINE=Mac;;
    *)          MACHINE="UNKNOWN:${OS}"
esac

echo "📋 Detected OS: $MACHINE"
echo ""

# Check prerequisites
echo "🔍 Checking prerequisites..."

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Node.js
if command_exists node; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✅ Node.js: $NODE_VERSION${NC}"
else
    echo -e "${RED}❌ Node.js not found${NC}"
    echo "   Install from: https://nodejs.org/"
    if [ "$MACHINE" = "Mac" ]; then
        echo "   Or run: brew install node@18"
    elif [ "$MACHINE" = "Linux" ]; then
        echo "   Or run: sudo apt install nodejs npm (Ubuntu/Debian)"
        echo "   Or run: sudo dnf install nodejs npm (Fedora/RHEL)"
    fi
    exit 1
fi

# Check Python
if command_exists python3; then
    PYTHON_VERSION=$(python3 --version)
    echo -e "${GREEN}✅ Python: $PYTHON_VERSION${NC}"
else
    echo -e "${RED}❌ Python 3 not found${NC}"
    echo "   Install from: https://www.python.org/"
    if [ "$MACHINE" = "Mac" ]; then
        echo "   Or run: brew install python@3.11"
    elif [ "$MACHINE" = "Linux" ]; then
        echo "   Or run: sudo apt install python3.11 python3-pip (Ubuntu/Debian)"
        echo "   Or run: sudo dnf install python3.11 python3-pip (Fedora/RHEL)"
    fi
    exit 1
fi

# Check FFmpeg
if command_exists ffmpeg; then
    echo -e "${GREEN}✅ FFmpeg: installed${NC}"
else
    echo -e "${YELLOW}⚠️  FFmpeg not found${NC}"
    if [ "$MACHINE" = "Mac" ]; then
        echo "   Install: brew install ffmpeg"
    elif [ "$MACHINE" = "Linux" ]; then
        echo "   Install: sudo apt install ffmpeg (Ubuntu/Debian)"
        echo "   Install: sudo dnf install ffmpeg (Fedora/RHEL)"
    fi
    echo ""
fi

# Check SoX
if command_exists sox; then
    echo -e "${GREEN}✅ SoX: installed${NC}"
else
    echo -e "${YELLOW}⚠️  SoX not found${NC}"
    if [ "$MACHINE" = "Mac" ]; then
        echo "   Install: brew install sox"
    elif [ "$MACHINE" = "Linux" ]; then
        echo "   Install: sudo apt install sox libsox-fmt-all (Ubuntu/Debian)"
        echo "   Install: sudo dnf install sox (Fedora/RHEL)"
    fi
    echo ""
fi

# Check Git
if command_exists git; then
    echo -e "${GREEN}✅ Git: installed${NC}"
else
    echo -e "${RED}❌ Git not found${NC}"
    if [ "$MACHINE" = "Mac" ]; then
        echo "   Install: xcode-select --install"
    elif [ "$MACHINE" = "Linux" ]; then
        echo "   Install: sudo apt install git (Ubuntu/Debian)"
        echo "   Install: sudo dnf install git (Fedora/RHEL)"
    fi
    exit 1
fi

echo ""
echo "📦 Installing Node.js dependencies..."
cd app
if [ -d "node_modules" ]; then
    echo "   node_modules exists, running npm install to ensure all deps..."
fi
npm install

cd ..

echo ""
echo "🐍 Setting up Python virtual environment..."
if [ -d ".venv" ]; then
    echo "   .venv exists, skipping creation"
else
    python3 -m venv .venv
    echo -e "${GREEN}   ✅ Virtual environment created${NC}"
fi

echo ""
echo "📦 Installing Python dependencies..."
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "⚙️  Configuration check..."
if [ -f ".env" ]; then
    echo -e "${GREEN}   ✅ .env file exists${NC}"
else
    echo -e "${YELLOW}   ⚠️  .env file not found${NC}"
    echo "   Creating template .env file..."
    cat > .env << 'EOF'
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
EOF
    echo -e "${GREEN}   ✅ Template .env created${NC}"
    echo -e "${YELLOW}   ⚠️  Please edit .env and add your API keys${NC}"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Edit .env file with your API keys:"
echo "      nano .env"
echo ""
echo "   2. Run the application:"
echo "      cd app"
echo "      npm run dev"
echo ""
echo "📚 Documentation:"
echo "   - Installation Guide: INSTALL.md"
echo "   - User Guide: docs/03-user-guide.md"
echo ""
echo "🎉 Happy audiobook creating!"
