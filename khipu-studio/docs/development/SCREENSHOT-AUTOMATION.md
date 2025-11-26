# Screenshot Automation Scripts

This directory contains several scripts to automatically capture screenshots of the Khipu Studio application for documentation purposes, including **multi-language support** using the reference project data.

## 🎯 New Features

### Multi-Language User Guide Screenshots
The updated Playwright script now creates comprehensive screenshots aligned with the User Guide sections for **three languages**:
- **English (en-US)** - `screenshots/user-guide-en-us/`
- **Español Perú (es-PE)** - `screenshots/user-guide-es-pe/`  
- **Português Brasil (pt-BR)** - `screenshots/user-guide-pt-br/`

### Reference Project Integration
- Uses the complete **"Puntajada"** project from `reference-code/test_7/`
- Shows realistic data with actual chapters, characters, and planning
- Demonstrates the full audiobook production workflow
- Creates localized versions for each language

## Prerequisites

### For Playwright (Recommended - Updated!)
```bash
npm install --save-dev playwright
# Install browsers
npx playwright install
```

### For Puppeteer
```bash
npm install --save-dev puppeteer
```

### For PowerShell
No additional dependencies required (Windows only).

## Usage

### Option 1: Multi-Language User Guide Screenshots (NEW!)
This creates a complete set of screenshots for documentation in all three languages.

```bash
# Run the full multi-language capture
node capture-screenshots.js
```

**What it captures:**
1. **Getting Started** - Clean home screen, project creation
2. **Book Configuration** - Metadata forms, localized content
3. **Manuscript Management** - Chapter lists, text editing
4. **Character Management** - Dossier, character profiles
5. **Voice Casting** - Voice selection, assignment
6. **Content Planning** - AI-powered segmentation
7. **Audio Production** - TTS generation, processing
8. **Export & Packaging** - Final output preparation
9. **Settings** - Configuration screens
10. **Navigation** - Workflow progression

**Features:**
- 🌍 **Multi-language** - en-US, es-PE, pt-BR
- 📖 **User Guide aligned** - Screenshots match documentation sections
- 📁 **Realistic data** - Uses complete "Puntajada" reference project
- 🎯 **Professional quality** - Consistent naming and organization
- 🔄 **Automated workflow** - No manual intervention required

### Option 2: Single Language Test (NEW!)
Test the screenshot system with one language first.

```bash
# Test with Spanish (es-PE) using reference project
node capture-screenshots-test.js
```

### Option 3: Puppeteer (Web Version)
Captures the web version running on localhost:5173.

```bash
# Make sure dev server is running
npm run dev

# In another terminal
npm install --save-dev puppeteer
node capture-web-screenshots.js
```

### Option 4: PowerShell (Manual Navigation)
Simple Windows-only solution that captures the current window.

```powershell
# Make sure the app is running first
npm run dev

# In PowerShell, run:
.\capture-screenshots.ps1
```

## Output Structure

### Multi-Language Screenshots (NEW!)
```
screenshots/
├── user-guide-en-us/          # English screenshots
│   ├── 01-home-empty.png
│   ├── 02-create-project-dialog.png
│   ├── 03-create-project-filled.png
│   ├── 04-book-config-page.png
│   ├── 05-book-config-filled.png
│   ├── 06-manuscript-page.png
│   ├── 07-manuscript-chapters-loaded.png
│   ├── 08-dossier-page.png
│   ├── 09-casting-page.png
│   ├── 10-planning-page.png
│   ├── 11-audio-production-page.png
│   ├── 12-packaging-page.png
│   ├── 13-settings-page.png
│   └── 14-home-with-project.png
├── user-guide-es-pe/          # Spanish (Peru) screenshots
│   └── [same structure with Spanish UI/content]
└── user-guide-pt-br/          # Portuguese (Brazil) screenshots
    └── [same structure with Portuguese UI/content]
```

### Legacy Output
- `web-screenshots/` (Puppeteer)
- `powershell-screenshots/` (PowerShell)

## Screenshot Organization by User Guide Section

**01-05: Getting Started & Project Setup**
- Clean interface, project creation workflow
- Form filling, validation states

**06-08: Book Configuration**  
- Metadata entry, language selection
- Cover image management, author details

**09-11: Manuscript Management**
- Chapter lists, text editing interface
- File management, organization

**12-14: Character Management**
- Dossier creation, character profiles
- Voice characteristics, relationships

**15-17: Voice Casting & Planning**
- Voice selection interface, audition system
- AI-powered content planning, segment review

**18-20: Audio Production & Export**
- TTS generation, audio processing
- Export configuration, packaging options

**21+: Settings & Navigation**
- Configuration screens, API setup
- Workflow navigation, project overview

## Reference Project Details

The screenshots use the **"Puntajada"** reference project:

**Story:** Mystery novel set in a Peruvian coastal town  
**Language:** Originally Spanish (es-PE), localized for other languages  
**Content:** 11 chapters, multiple characters with dialogue  
**Features:** Complete workflow from manuscript to audio production  
**Structure:** Full project with chapters, characters, plans, and audio metadata

## Tips for Best Results

1. **Ensure reference project exists** - Check `reference-code/test_7/`
2. **Close other applications** to avoid interference
3. **Use high resolution display** for crisp screenshots
4. **Test with single language first** using `capture-screenshots-test.js`
5. **Check disk space** - Multi-language capture creates many files

## Customization

You can modify the language configurations in `capture-screenshots.js`:

```javascript
const LANGUAGE_CONFIGS = {
  'en-US': {
    name: 'English (US)',
    projectName: 'mystery-novel-demo',
    bookTitle: 'Puntajada',
    bookSubtitle: 'Ancestral Mysteries',
    // ... more config
  }
  // Add more languages as needed
};
```

## Troubleshooting

**"Reference project not found":**
- Ensure `reference-code/test_7/` exists with complete project structure
- Check file permissions for copying project files

**"Window not found" errors:**
- Make sure no other Electron apps are running
- Check that the app builds and runs correctly first

**Screenshot quality issues:**
- Verify display scaling settings
- Ensure sufficient screen resolution (1920x1080+ recommended)
- Check that app renders correctly in manual testing

**Navigation failures:**
- Some features may be locked by cascading workflow
- Screenshots capture available states and note locked features
- Test individual language captures first for debugging