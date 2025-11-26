# Scripts Directory

This directory contains utility scripts and tools for the Khipu Studio project.

## Directory Structure

### 📸 `screenshot-automation/`
Screenshot capture scripts for documentation and testing:
- `capture-*.js` - Various screenshot capture automation scripts
- `capture-screenshots.ps1` - PowerShell screenshot automation

**Usage**: See [SCREENSHOT-AUTOMATION.md](../SCREENSHOT-AUTOMATION.md) in root

### 📄 `pdf-conversion/`
PDF generation and conversion scripts:
- `convert-user-guide-to-pdf*.js` - User guide PDF generation
- `convert-workflow*.ps1` - Workflow diagram PDF conversion
- `convert-workflow.py` - Python-based conversion tools

**Usage**: See [PDF-CONVERSION-README.md](../PDF-CONVERSION-README.md) in root

### 🔧 `maintenance/`
System maintenance and patch scripts:
- `clear-icon-cache.ps1` - Clear Windows icon cache
- `patch-processing-chains*.ps1` - Audio processing chain patches
- `scan-segment-references.ps1` - Database reference scanner

### 🧪 `testing/`
Testing and debugging utilities:
- `test-*.js` - Feature testing scripts
- `debug-*.js` - Debugging tools
- `simple-screenshot-test.js` - Screenshot test harness
- `stitch-chapters.js` - Chapter stitching test
- `create-icon.js` - Icon generation test

### ⚙️ `setup/`
Environment setup scripts:
- `setup.ps1` - Windows setup script
- `setup.sh` - Linux/macOS setup script

**Usage**: See [INSTALL.md](../INSTALL.md) or [INSTALLATION-GUIDE.md](../INSTALLATION-GUIDE.md) in root

## Quick Reference

### Run Screenshot Automation
```powershell
cd scripts/screenshot-automation
node capture-electron-automated-final.js
```

### Generate PDF Documentation
```powershell
cd scripts/pdf-conversion
node convert-user-guide-to-pdf-simple.js
```

### Run Tests
```powershell
cd scripts/testing
node test-playlist.js
```

### Initial Setup
```powershell
cd scripts/setup
.\setup.ps1
```

## Notes

- Most scripts expect to be run from the repository root or their own directory
- Check individual script comments for specific usage instructions
- Some scripts may require dependencies (Node.js, Python, etc.)
