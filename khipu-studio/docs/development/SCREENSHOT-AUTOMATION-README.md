# Playwright Screenshot Automation - Usage Guide

## Overview
These Playwright scripts connect to an already running Khipu Studio app to capture screenshots for the User Guide documentation.

## Prerequisites
1. Khipu Studio app must be running
2. A project should be loaded (preferably the "puntajada" test project)
3. Playwright dependencies installed

## Installation
```bash
npm install playwright
```

## Scripts Available

### 1. `capture-playwright-simple.js` (Recommended)
**Simple connection to running app**

```bash
# Automated capture (captures all 30 workflow screenshots)
node capture-playwright-simple.js

# Interactive mode (manual control)
node capture-playwright-simple.js interactive
```

### 2. `capture-playwright-running-app.js` 
**Advanced connection with CDP support**

```bash
# Auto capture with CDP connection
node capture-playwright-running-app.js

# Interactive mode
node capture-playwright-running-app.js interactive
```

### 3. `launch-app-for-capture.js`
**Helper to launch app with debugging enabled**

```bash
# Launch app with remote debugging
node launch-app-for-capture.js
```

## Recommended Workflow

### Option A: Use Existing Running App
1. Start Khipu Studio normally: `cd app && npm run dev`
2. Load a project (puntajada test project recommended)
3. Run screenshot capture: `node capture-playwright-simple.js`

### Option B: Launch with Debugging
1. Launch app with debugging: `node launch-app-for-capture.js`
2. Load a project in the opened app
3. In another terminal: `node capture-playwright-simple.js`

## Interactive Mode Commands
```
capture <filename>  - Take screenshot and save as workflow/<filename>
nav <module>       - Navigate to specific module (Home, Book, Characters, etc.)
exit              - Exit interactive mode
```

Example interactive session:
```
> nav Characters
> capture 04-characters-detection-start.png
> nav Voice  
> capture 07-voice-generation-queue.png
> exit
```

## Output Structure
Screenshots are saved to:
```
docs/images/user-guide/
├── workflow/     # Step-by-step workflow screenshots
├── navigation/   # Navigation UI elements
├── modules/      # Individual module screenshots
└── features/     # Advanced feature demonstrations
```

## Troubleshooting

### Connection Issues
- **"Failed to connect"**: Make sure Khipu Studio is running
- **"No contexts found"**: Try the simple script instead of CDP version
- **"Element not found"**: App might not be fully loaded, wait a moment

### Navigation Issues
- Script will try multiple selector strategies
- Falls back to keyboard shortcuts (Alt+1, Alt+2, etc.)
- Use interactive mode for manual control if auto-navigation fails

### Screenshot Issues
- Waits 1 second for UI to settle before each screenshot
- Uses PNG format for UI clarity
- Captures viewport (not full page scroll)

## Expected Results
- **30 workflow screenshots** covering the complete User Guide process
- **Navigation screenshots** showing the main interface
- **All screenshots** saved with organized filenames matching User Guide references

## Performance Notes
- Each screenshot takes ~2-3 seconds (including navigation)
- Full automated capture takes approximately 5-7 minutes
- Interactive mode allows for faster targeted captures
- App remains running after screenshot capture completes

## Customization
Edit the `workflow` array in the script to:
- Add/remove modules
- Change screenshot filenames
- Modify descriptions
- Add custom selectors for your app's specific elements