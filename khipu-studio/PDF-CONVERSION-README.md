# PDF Conversion Scripts for User Guides

This directory contains multiple scripts to convert the Khipu Studio user guide markdown files into professional PDF documents.

## Available Scripts

### 1. PowerShell Script (Recommended for Windows)
**File:** `convert-user-guide-to-pdf.ps1`

**Prerequisites:**
- Windows PowerShell 5.1+ or PowerShell Core
- Pandoc (will attempt auto-install via Chocolatey)
- WeasyPrint or wkhtmltopdf for PDF engine

**Usage:**
```powershell
.\convert-user-guide-to-pdf.ps1
```

**Features:**
- Automatic dependency checking and installation
- Professional PDF styling with custom CSS
- Fallback conversion methods
- Comprehensive error handling and logging
- Multi-language support

### 2. Node.js Script (Cross-platform)
**File:** `convert-user-guide-to-pdf-simple.js`

**Prerequisites:**
```bash
npm install puppeteer marked
```

**Usage:**
```bash
node convert-user-guide-to-pdf-simple.js
```

**Features:**
- Cross-platform compatibility
- Uses Puppeteer for reliable PDF generation
- Custom CSS styling
- No external dependencies beyond Node.js packages
- Built-in HTML conversion

### 3. Advanced Node.js Script (Pandoc-based)
**File:** `convert-user-guide-to-pdf.js`

**Prerequisites:**
- Node.js
- Pandoc installed system-wide
- WeasyPrint: `pip install weasyprint`

**Usage:**
```bash
node convert-user-guide-to-pdf.js
```

## Input Files

The scripts convert these markdown files:
- `docs/03-user-guide.md` → `Khipu-Studio-User-Guide-EN.pdf`
- `docs/03-user-guide-es-PE.md` → `Khipu-Studio-Guia-Usuario-ES.pdf`
- `docs/03-user-guide-pt-BR.md` → `Khipu-Studio-Guia-Usuario-PT.pdf`

## Output

All generated PDFs are saved to `docs/pdf/` directory with:
- Professional formatting and styling
- Table of contents
- Proper typography and spacing
- A4 page format with 2.5cm margins
- Header styling with Khipu Studio branding colors

## Styling Features

- **Brand Colors:** Khipu Studio blue (#2c5aa0) for headers and accents
- **Typography:** Segoe UI font family with proper hierarchy
- **Page Layout:** A4 format with consistent margins
- **Code Blocks:** Syntax-highlighted with gray backgrounds
- **Images:** Bordered with shadows (placeholders for missing screenshots)
- **Step Sections:** Highlighted with left borders and background colors
- **Navigation Lists:** Emoji icons preserved with proper spacing

## Troubleshooting

### Common Issues

1. **Pandoc not found:**
   - Windows: Install via Chocolatey: `choco install pandoc`
   - macOS: `brew install pandoc`
   - Linux: `sudo apt install pandoc` or `sudo yum install pandoc`

2. **WeasyPrint missing:**
   ```bash
   pip install weasyprint
   ```

3. **Permission errors:**
   - Ensure write permissions to `docs/pdf/` directory
   - Run PowerShell as Administrator if needed

4. **Node.js package errors:**
   ```bash
   npm install puppeteer marked
   ```

### PDF Quality

- **Font Rendering:** Uses system fonts for best compatibility
- **Image Handling:** Screenshots will be embedded when available
- **Cross-references:** Internal links preserved in PDF
- **Print Optimization:** Proper page breaks and margins

## Quick Start (Recommended)

1. **For Windows users:**
   ```powershell
   .\convert-user-guide-to-pdf.ps1
   ```

2. **For cross-platform:**
   ```bash
   npm install puppeteer marked
   node convert-user-guide-to-pdf-simple.js
   ```

The generated PDFs will be professional-quality documents suitable for distribution, printing, or digital sharing.

## Output Examples

Generated files:
- **English:** `docs/pdf/Khipu-Studio-User-Guide-EN.pdf`
- **Spanish (Peru):** `docs/pdf/Khipu-Studio-Guia-Usuario-ES.pdf`  
- **Portuguese (Brazil):** `docs/pdf/Khipu-Studio-Guia-Usuario-PT.pdf`

Each PDF includes:
- Complete user guide content
- Table of contents with page numbers
- Professional typography and layout
- Consistent branding and styling
- Multi-language support with proper character encoding