# Repository Organization

This document describes the new organized structure of the Khipu Studio repository.

## 📂 Root Directory Structure

```
khipu-studio/
├── app/                     # Desktop application (Electron + React + Vite)
├── khipu-cloud-api/         # Cloud backend (FastAPI microservices) 
├── khipu-web/               # Web frontend (React + Vite)
├── shared/                  # Shared types/schemas between projects
├── scripts/                 # ⭐ Utility scripts (organized by purpose)
├── docs/                    # ⭐ Documentation (organized by topic)
├── docs-cloud/              # Cloud architecture documentation
├── lib/                     # Shared libraries
├── py/                      # Python backend services
├── assets/                  # Static assets (icons, audio)
├── bin/                     # External binaries (FFmpeg)
├── project-templates/       # Project templates
├── temp-data/               # ⭐ Temporary files and cache (gitignored)
├── sample/                  # Sample projects
├── reference-code/          # Reference implementations
├── ssml/                    # SSML templates
├── dossier/                 # Project analysis
├── doc_refs/                # Documentation references
├── test_scripts/            # Legacy test scripts
├── .gitignore               # ⭐ New gitignore configuration
├── README.md                # ⭐ Updated main README
└── package.json             # Root package configuration
```

## ⭐ What Changed?

### 1. Scripts Organization (`/scripts/`)

**Before**: 40+ loose script files cluttering the root directory  
**After**: Organized into logical subdirectories:

```
scripts/
├── README.md                        # Script documentation index
├── screenshot-automation/           # 28 screenshot capture scripts
├── pdf-conversion/                  # 7 PDF generation scripts
├── maintenance/                     # 4 maintenance/patch scripts
├── testing/                         # 11 test/debug scripts
└── setup/                          # 2 setup scripts (setup.ps1, setup.sh)
```

### 2. Documentation Organization (`/docs/`)

**Before**: 8 loose markdown files in root  
**After**: Organized by purpose with clear index:

```
docs/
├── README.md                        # Documentation index
├── installation/                    # User setup guides
│   ├── QUICKSTART.md
│   ├── INSTALL.md
│   └── INSTALLATION-GUIDE.md
├── development/                     # Developer guides
│   ├── SCREENSHOT-AUTOMATION.md
│   ├── SCREENSHOT-AUTOMATION-README.md
│   ├── MANUAL-SCREENSHOT-GUIDE.md
│   └── PDF-CONVERSION-README.md
└── INNOVACIONES_PATENTABLES.md     # Innovation documentation
```

### 3. Temporary Data Consolidation (`/temp-data/`)

**Before**: Multiple temp folders scattered (cache/, temp/, screenshots/)  
**After**: Single location for all temporary files:

```
temp-data/
├── cache/                          # Build and runtime cache
├── temp/                           # Temporary processing files
├── screenshots/                    # Generated screenshots
└── tmp_test_proj2/                 # Test projects
```

**Note**: This directory is now in `.gitignore` to keep version control clean.

### 4. Cloud Architecture (`/docs-cloud/`)

Complete cloud migration documentation:
```
docs-cloud/
├── README.md                       # Getting started guide
├── 00-architecture-overview.md     # System architecture
├── 01-database-schema.md          # PostgreSQL schema
├── 02-api-specifications.md       # REST API specs
└── 03-azure-openai-integration.md # Azure OpenAI guide ⭐ NEW
```

## 📋 Quick Reference

### Finding Things

| What you need | Where to look |
|---------------|---------------|
| **Quick start guide** | `docs/installation/QUICKSTART.md` |
| **Setup from source** | `docs/installation/INSTALL.md` |
| **Screenshot automation** | `scripts/screenshot-automation/` |
| **PDF conversion** | `scripts/pdf-conversion/` |
| **Test scripts** | `scripts/testing/` |
| **Development guides** | `docs/development/` |
| **Cloud architecture** | `docs-cloud/` |
| **Utility script docs** | `scripts/README.md` |

### Running Scripts

All scripts should be run from their organized locations:

```powershell
# Screenshot automation
cd scripts/screenshot-automation
node capture-electron-automated-final.js

# PDF conversion
cd scripts/pdf-conversion
node convert-user-guide-to-pdf-simple.js

# Testing
cd scripts/testing
node test-playlist.js

# Setup
cd scripts/setup
.\setup.ps1
```

## 🎯 Benefits

### For Developers
✅ **Easy to find**: Scripts organized by purpose  
✅ **Clean workspace**: No more scrolling through dozens of files  
✅ **Better version control**: Temporary files excluded from git  
✅ **Clear documentation**: Index files guide you to what you need  

### For New Contributors
✅ **Self-documenting**: Structure makes purpose obvious  
✅ **Quick onboarding**: Follow docs/README.md to get started  
✅ **No confusion**: Clear separation between app code and tooling  

### For Maintenance
✅ **Easier cleanup**: Temporary data in one place  
✅ **Better caching**: `.gitignore` prevents accidental commits  
✅ **Scalable**: Easy to add new scripts in proper categories  

## 🔄 Migration Notes

### If you have local branches:

1. **Stash or commit** your work before pulling
2. **Update references** to moved files:
   - `QUICKSTART.md` → `docs/installation/QUICKSTART.md`
   - `setup.ps1` → `scripts/setup/setup.ps1`
   - `capture-*.js` → `scripts/screenshot-automation/capture-*.js`

3. **Clear temp data** if needed:
   ```powershell
   Remove-Item -Recurse -Force temp-data/*
   ```

### If you have automation scripts:

Update paths in your CI/CD or local automation:
```powershell
# Old
.\setup.ps1

# New
.\scripts\setup\setup.ps1
```

## 📝 Maintenance Guidelines

### Adding New Scripts

Choose the appropriate category:

- **Screenshot tools** → `scripts/screenshot-automation/`
- **PDF/document generation** → `scripts/pdf-conversion/`
- **Maintenance/patches** → `scripts/maintenance/`
- **Tests/debugging** → `scripts/testing/`
- **Setup/initialization** → `scripts/setup/`

If none fit, consider creating a new category with a README.

### Adding New Documentation

- **User guides** → `docs/installation/`
- **Developer guides** → `docs/development/`
- **Architecture/design** → `docs/`
- **Cloud-specific** → `docs-cloud/`

Always update the relevant README.md index file.

## 🚀 Next Steps

1. ✅ Repository organized
2. ⬜ Update CI/CD paths (if applicable)
3. ⬜ Update team documentation/wikis
4. ⬜ Archive or delete obsolete scripts
5. ⬜ Consider adding pre-commit hooks for organization

---

**Last Updated**: November 25, 2025  
**Organized by**: Repository cleanup initiative
