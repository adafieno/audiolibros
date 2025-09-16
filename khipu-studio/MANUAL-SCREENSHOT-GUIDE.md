# Manual Screenshot Guide for User Guide Documentation

Since automated screenshot capture is having issues with project loading, here's a comprehensive manual guide for taking the screenshots needed for the User Guide documentation.

## Setup Requirements

1. **Run the Electron App**:
   ```bash
   cd app
   npm run dev
   ```

2. **Load Test Project**:
   - Click "Open Existing Project"
   - Navigate to: `C:\code\audiolibros\khipu-studio\reference-code\test_7`
   - Wait for project to load completely

3. **Configure App**:
   - Set theme to **Dark mode** in Settings
   - Set language as needed (English, Spanish, Portuguese)

## Screenshots Needed (Per Language)

### Getting Started Section
**File: `01-home-with-project.png`**
- Page: Home (`/` or main screen)
- Content: Home screen showing loaded test_7 project with sidebar navigation
- Purpose: Shows main interface after project is loaded

### Quick Start Workflow Section

**File: `02-create-project-dialog.png`**
- Action: Click "Create New Project" button
- Content: Project creation dialog with form fields
- Purpose: Shows how to create new projects (Step 1 of workflow)
- Note: Cancel after screenshot

**File: `03-book-configuration.png`**
- Page: Book Configuration (`/book`)
- Content: Book metadata form with test_7 data loaded
- Purpose: Step 2 - Configure book details

**File: `04-manuscript-management.png`**
- Page: Manuscript (`/manuscript`)
- Content: Chapter management interface with test_7 chapters
- Purpose: Step 3 - Import and manage manuscript

**File: `05-character-setup.png`**
- Page: Dossier (`/dossier`)
- Content: Character management with test_7 characters
- Purpose: Step 4 - Set up characters and personalities

**File: `06-voice-casting.png`**
- Page: Voice Casting (`/casting`)
- Content: Voice assignment interface with characters and voices
- Purpose: Step 5 - Assign voices to characters

**File: `07-content-planning.png`**
- Page: Planning (`/planning`)
- Content: AI-generated content plan with segments
- Purpose: Step 6 - Generate audio production plan

**File: `08-audio-production.png`**
- Page: Voice/Audio Production (`/voice`)
- Content: Audio generation and processing interface
- Purpose: Step 7 - Produce audio files

**File: `09-export-packaging.png`**
- Page: Packaging (`/packaging`)
- Content: Export options and packaging settings
- Purpose: Step 8 - Export final audiobook

### Navigation Guide Section

**File: `10-settings-configuration.png`**
- Page: Settings (`/settings`)
- Content: Application settings and preferences
- Purpose: Shows configuration options

## File Organization

Create folders for each language:
```
screenshots/
├── user-guide-en-us/
│   ├── 01-home-with-project.png
│   ├── 02-create-project-dialog.png
│   ├── 03-book-configuration.png
│   ├── ... (etc)
├── user-guide-es-pe/
│   ├── 01-home-with-project.png
│   ├── ... (etc)
└── user-guide-pt-br/
    ├── 01-home-with-project.png
    ├── ... (etc)
```

## Screenshot Settings

- **Resolution**: 1920x1080 or higher
- **Theme**: Dark mode only
- **Format**: PNG
- **Content**: Full page/window capture
- **Project**: Always use test_7 project data for consistency

## Language-Specific Instructions

### English (en-US)
- Set language in Settings → Language → English (US)
- Take all 10 screenshots listed above
- Save in `screenshots/user-guide-en-us/`

### Spanish (es-PE)
- Set language in Settings → Language → Español (Perú)
- Take all 10 screenshots listed above
- Save in `screenshots/user-guide-es-pe/`

### Portuguese (pt-BR)
- Set language in Settings → Language → Português (Brasil)
- Take all 10 screenshots listed above  
- Save in `screenshots/user-guide-pt-br/`

## Quality Checklist

For each screenshot, verify:
- [ ] Dark theme is active
- [ ] Correct language is displayed
- [ ] test_7 project data is visible (not empty states)
- [ ] Full interface is captured (including navigation)
- [ ] Text is clear and readable
- [ ] File is saved with correct name and location

## Tips

1. **Consistent Navigation**: Use the sidebar navigation to switch between pages
2. **Wait for Loading**: Let each page fully load before taking screenshot
3. **Real Data**: Ensure test_7 project data is visible (characters, chapters, etc.)
4. **Clean Interface**: Close any error dialogs or popups before screenshots
5. **Naming Convention**: Use exactly the filenames listed above for consistency

This manual approach ensures we get high-quality, consistent screenshots with real project data for all three languages.