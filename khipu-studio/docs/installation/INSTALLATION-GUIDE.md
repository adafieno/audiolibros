# Khipu Studio - Installation Guide for Users

Welcome! This guide will help you install and configure Khipu Studio on your computer.

## Download

Download the installer for your operating system:

### Windows
- **Installer:** `Khipu-Studio-Setup-x.x.x.exe` (Recommended)
- **MSI Package:** `Khipu-Studio-x.x.x.msi` (For enterprise deployment)

**System Requirements:**
- Windows 10 or Windows 11 (64-bit)
- 8GB RAM (16GB recommended)
- 2GB disk space + 10GB for projects

### macOS
- **DMG Image:** `Khipu-Studio-x.x.x.dmg`

**System Requirements:**
- macOS 11.0 (Big Sur) or later
- Intel or Apple Silicon (M1/M2/M3)
- 8GB RAM (16GB recommended)
- 2GB disk space + 10GB for projects

### Linux
- **AppImage:** `Khipu-Studio-x.x.x.AppImage` (Universal, recommended)
- **Debian/Ubuntu:** `khipu-studio_x.x.x_amd64.deb`
- **Fedora/RHEL:** `khipu-studio-x.x.x.x86_64.rpm`

**System Requirements:**
- Ubuntu 20.04+, Fedora 35+, or equivalent
- 8GB RAM (16GB recommended)
- 2GB disk space + 10GB for projects

---

## Installation

### Windows Installation

1. **Download** `Khipu-Studio-Setup-x.x.x.exe`
2. **Double-click** the installer
3. **Allow** the app when Windows SmartScreen appears
4. **Follow** the installation wizard:
   - Accept the license agreement
   - Choose installation location (default: `C:\Program Files\Khipu Studio`)
   - Select "Create desktop shortcut" (recommended)
   - Click "Install"
5. **Launch** Khipu Studio from desktop shortcut or Start menu

### macOS Installation

1. **Download** `Khipu-Studio-x.x.x.dmg`
2. **Double-click** the DMG file to mount it
3. **Drag** Khipu Studio icon to Applications folder
4. **Eject** the DMG
5. **Open** Applications folder and launch Khipu Studio
6. **Allow** the app when macOS asks (right-click → Open if needed)

### Linux Installation

#### AppImage (Universal)

1. **Download** `Khipu-Studio-x.x.x.AppImage`
2. **Make executable:**
   ```bash
   chmod +x Khipu-Studio-x.x.x.AppImage
   ```
3. **Run:**
   ```bash
   ./Khipu-Studio-x.x.x.AppImage
   ```

#### Debian/Ubuntu (.deb)

```bash
sudo dpkg -i khipu-studio_x.x.x_amd64.deb
sudo apt-get install -f  # Fix dependencies if needed
```

#### Fedora/RHEL (.rpm)

```bash
sudo rpm -i khipu-studio-x.x.x.x86_64.rpm
```

---

## First Launch - API Configuration

On first launch, Khipu Studio will ask you to configure your API keys.

### Get Azure Text-to-Speech Key (Required)

Khipu Studio requires Azure Cognitive Services for voice synthesis.

1. **Go to** [Azure Portal](https://portal.azure.com/)
2. **Create** a "Speech Services" resource:
   - Click "Create a resource"
   - Search for "Speech"
   - Click "Create" on Speech Services
   - Fill in:
     - **Subscription:** Your Azure subscription
     - **Resource group:** Create new or use existing
     - **Region:** Choose closest region (e.g., East US, West Europe)
     - **Name:** Any name (e.g., "khipu-tts")
     - **Pricing tier:** F0 (Free) or S0 (Standard)
   - Click "Review + Create" → "Create"
3. **Get your key:**
   - Go to your Speech Services resource
   - Click "Keys and Endpoint"
   - Copy **Key 1** and **Region**

### Configure in Khipu Studio

When prompted (or go to Settings):

1. **Azure TTS Key:** Paste your Key 1
2. **Azure TTS Region:** Enter your region (e.g., `eastus`, `westeurope`)
3. **Voice (Optional):** Default is `es-ES-ElviraNeural` (Spanish)

### OpenAI API Key (Optional)

For advanced character detection, you can add OpenAI API key:

1. **Go to** [OpenAI Platform](https://platform.openai.com/)
2. **Create** an API key
3. **Paste** in Khipu Studio settings

---

## Verify Installation

1. **Launch Khipu Studio**
2. **Check** that the main window opens
3. **Go to Settings** → **API Keys**
4. **Verify** Azure connection (green checkmark should appear)
5. **Create** a test project to confirm everything works

---

## Troubleshooting

### Windows Issues

#### "Windows protected your PC" Warning

This appears because the app isn't signed yet. To proceed:
1. Click "More info"
2. Click "Run anyway"

#### Installation Fails

- **Run as Administrator:** Right-click installer → "Run as administrator"
- **Antivirus:** Temporarily disable antivirus during installation
- **Disk Space:** Ensure you have at least 2GB free space

#### App Won't Start

- **Check** Windows Event Viewer for errors
- **Try** running from Start menu instead of shortcut
- **Reinstall** the application

### macOS Issues

#### "App can't be opened because it is from an unidentified developer"

1. **Right-click** (or Control+click) Khipu Studio in Applications
2. **Select** "Open"
3. **Click** "Open" in the dialog

Or disable Gatekeeper temporarily:
```bash
sudo spctl --master-disable
```

#### Permission Issues

```bash
sudo xattr -cr /Applications/Khipu\ Studio.app
```

### Linux Issues

#### AppImage Won't Run

Make sure FUSE is installed:
```bash
# Ubuntu/Debian
sudo apt install fuse libfuse2

# Fedora
sudo dnf install fuse fuse-libs
```

#### Missing Libraries

```bash
# Ubuntu/Debian
sudo apt install libglib2.0-0 libgbm1 libasound2

# Fedora
sudo dnf install glib2 mesa-libgbm alsa-lib
```

### API Configuration Issues

#### Azure TTS Not Working

1. **Verify key is correct** (no extra spaces)
2. **Check region matches** your Azure resource
3. **Confirm subscription is active** in Azure Portal
4. **Test connection** in Settings → Test Connection

#### "Invalid API Key" Error

- **Copy key again** from Azure Portal (avoid typos)
- **Check** you copied Key 1, not Key 2 or Endpoint
- **Verify** your Azure subscription is not expired

### Audio Issues

#### No Audio Playback

- **Check system volume** is not muted
- **Verify audio device** is connected
- **Try different audio output** in system settings

#### Audio Generation Fails

- **Check API key** is configured correctly
- **Verify internet connection**
- **Check Azure service status** at [Azure Status](https://status.azure.com/)

---

## Uninstallation

### Windows
1. **Open** Settings → Apps → Installed apps
2. **Find** "Khipu Studio"
3. **Click** "Uninstall"

Or use the uninstaller:
- `C:\Program Files\Khipu Studio\Uninstall.exe`

### macOS
1. **Open** Applications folder
2. **Drag** Khipu Studio to Trash
3. **Empty** Trash

To remove all data:
```bash
rm -rf ~/Library/Application\ Support/khipu-studio
```

### Linux

**AppImage:** Simply delete the AppImage file

**Deb:**
```bash
sudo apt remove khipu-studio
```

**RPM:**
```bash
sudo rpm -e khipu-studio
```

---

## Getting Help

### Support Resources

- **User Guide:** Available in Help menu
- **Email Support:** adafieno@hotmail.com
- **Include in support requests:**
  - Operating system and version
  - Khipu Studio version (Help → About)
  - License key
  - Description of issue
  - Screenshots if relevant

### Before Contacting Support

1. Check this troubleshooting guide
2. Verify API keys are configured
3. Try restarting the application
4. Check your internet connection
5. Ensure system meets minimum requirements

---

## Next Steps

After successful installation:

1. **Read the User Guide** (Help → User Guide)
2. **Create your first project**
3. **Import a manuscript**
4. **Configure voices**
5. **Generate your first audiobook!**

---

**Welcome to Khipu Studio! 🎉**

Start creating professional audiobooks today!
