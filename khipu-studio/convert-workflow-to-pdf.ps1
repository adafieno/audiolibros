# Audeek Workflow - Markdown to PDF Converter
# ============================================

Write-Host "Audeek Workflow - Markdown to PDF Converter" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# Configuration
$InputFile = "c:\code\audiolibros\flujo_de_trabajo\audiolibros_flujo_de_trabajo_ui.md"
$OutputDir = "c:\code\audiolibros\flujo_de_trabajo"
$OutputFile = "Audeek-Flujo-de-Trabajo-Audiolibros.pdf"
$OutputPath = Join-Path $OutputDir $OutputFile

# Check if input file exists
if (!(Test-Path $InputFile)) {
    Write-Host "Error: Input file not found: $InputFile" -ForegroundColor Red
    exit 1
}

Write-Host "Input: $InputFile" -ForegroundColor Yellow
Write-Host "Output: $OutputPath" -ForegroundColor Yellow

# Check if Pandoc is available
function Test-Pandoc {
    try {
        $null = pandoc --version 2>$null
        Write-Host "✓ Pandoc is available" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "✗ Pandoc not found" -ForegroundColor Red
        return $false
    }
}

# Install Pandoc via Chocolatey
function Install-Pandoc {
    Write-Host "Attempting to install Pandoc via Chocolatey..." -ForegroundColor Yellow
    try {
        choco install pandoc -y
        Write-Host "✓ Pandoc installed successfully" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "✗ Failed to install Pandoc via Chocolatey" -ForegroundColor Red
        Write-Host "Please install Pandoc manually from: https://pandoc.org/installing.html" -ForegroundColor Yellow
        return $false
    }
}

# Create custom CSS for professional styling
function Create-CustomCSS {
    $cssContent = @"
@page {
    size: A4;
    margin: 2.5cm;
}

body {
    font-family: 'Segoe UI', 'DejaVu Sans', Arial, sans-serif;
    line-height: 1.6;
    color: #333;
    font-size: 11pt;
}

h1, h2, h3, h4, h5, h6 {
    color: #2c5aa0;
    font-weight: bold;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
}

h1 {
    font-size: 24pt;
    text-align: center;
    border-bottom: 3px solid #2c5aa0;
    padding-bottom: 0.5em;
    page-break-before: always;
}

h2 {
    font-size: 18pt;
    border-bottom: 2px solid #e6e6e6;
    padding-bottom: 0.3em;
}

h3 {
    font-size: 14pt;
    color: #4a4a4a;
}

h4 {
    font-size: 12pt;
    color: #666;
}

p {
    margin-bottom: 0.8em;
    text-align: justify;
}

ul, ol {
    margin-bottom: 1em;
    padding-left: 2em;
}

li {
    margin-bottom: 0.3em;
}

blockquote {
    border-left: 4px solid #2c5aa0;
    margin: 1em 0;
    padding: 0.5em 1em;
    background-color: #f8f9fa;
    font-style: italic;
}

code {
    background-color: #f4f4f4;
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 9pt;
}

pre {
    background-color: #f8f8f8;
    border: 1px solid #ddd;
    border-radius: 5px;
    padding: 1em;
    margin: 1em 0;
    overflow-x: auto;
    font-size: 9pt;
}

table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
}

th, td {
    border: 1px solid #ddd;
    padding: 0.5em;
    text-align: left;
}

th {
    background-color: #2c5aa0;
    color: white;
    font-weight: bold;
}

tr:nth-child(even) {
    background-color: #f9f9f9;
}

.mermaid {
    text-align: center;
    margin: 2em 0;
    background-color: #fafafa;
    border: 1px solid #e0e0e0;
    border-radius: 5px;
    padding: 1em;
}

/* Table of contents styling */
.toc {
    background-color: #f8f9fa;
    border: 1px solid #e6e6e6;
    border-radius: 5px;
    padding: 1em;
    margin: 2em 0;
}

.toc h2 {
    margin-top: 0;
    color: #2c5aa0;
    border-bottom: none;
    font-size: 16pt;
}

.toc ul {
    list-style-type: none;
    padding-left: 0;
}

.toc li {
    margin-bottom: 0.5em;
}

.toc a {
    color: #2c5aa0;
    text-decoration: none;
}

.toc a:hover {
    text-decoration: underline;
}

/* Page breaks */
.page-break {
    page-break-before: always;
}

/* Strong emphasis for key terms */
strong {
    color: #2c5aa0;
    font-weight: bold;
}

/* Special styling for context blocks */
.context {
    background-color: #e8f4f8;
    border-left: 4px solid #2c5aa0;
    padding: 1em;
    margin: 1em 0;
    border-radius: 0 5px 5px 0;
}
"@
    
    $cssPath = Join-Path $env:TEMP "audeek-workflow-style.css"
    $cssContent | Out-File -FilePath $cssPath -Encoding UTF8
    return $cssPath
}

# Main conversion function
function Convert-ToPDF {
    param($InputPath, $OutputPath, $CSSPath)
    
    Write-Host "Converting to PDF..." -ForegroundColor Yellow
    
    try {
        $pandocArgs = @(
            $InputPath
            "-o", $OutputPath
            "--pdf-engine=weasyprint"
            "--css=$CSSPath"
            "--metadata", "title=Audeek: Flujo de Trabajo de Audiolibros"
            "--metadata", "author=Audeek"
            "--table-of-contents"
            "--toc-depth=3"
            "--standalone"
        )
        
        & pandoc @pandocArgs
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ PDF created successfully: $OutputPath" -ForegroundColor Green
            return $true
        } else {
            Write-Host "✗ Pandoc conversion failed" -ForegroundColor Red
            return $false
        }
    }
    catch {
        Write-Host "✗ Error during conversion: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Alternative conversion using wkhtmltopdf
function Convert-ToPDF-Alternative {
    param($InputPath, $OutputPath)
    
    Write-Host "Trying alternative conversion with wkhtmltopdf..." -ForegroundColor Yellow
    
    try {
        # First convert markdown to HTML
        $htmlPath = Join-Path $env:TEMP "workflow-temp.html"
        
        $pandocArgs = @(
            $InputPath
            "-o", $htmlPath
            "--standalone"
            "--metadata", "title=Audeek: Flujo de Trabajo de Audiolibros"
        )
        
        & pandoc @pandocArgs
        
        if ($LASTEXITCODE -eq 0) {
            # Then convert HTML to PDF with wkhtmltopdf
            $wkhtmlArgs = @(
                "--page-size", "A4"
                "--margin-top", "25mm"
                "--margin-bottom", "25mm"
                "--margin-left", "25mm"
                "--margin-right", "25mm"
                "--enable-local-file-access"
                $htmlPath
                $OutputPath
            )
            
            & wkhtmltopdf @wkhtmlArgs
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✓ PDF created successfully with wkhtmltopdf: $OutputPath" -ForegroundColor Green
                Remove-Item $htmlPath -ErrorAction SilentlyContinue
                return $true
            }
        }
        
        Write-Host "✗ Alternative conversion failed" -ForegroundColor Red
        return $false
    }
    catch {
        Write-Host "✗ Error during alternative conversion: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Main execution
Write-Host "Starting conversion process..." -ForegroundColor Cyan

# Check prerequisites
if (!(Test-Pandoc)) {
    Write-Host "Installing Pandoc..." -ForegroundColor Yellow
    if (!(Install-Pandoc)) {
        Write-Host "Cannot proceed without Pandoc. Exiting." -ForegroundColor Red
        exit 1
    }
}

# Create custom CSS
$cssPath = Create-CustomCSS
Write-Host "✓ Custom CSS created: $cssPath" -ForegroundColor Green

# Try primary conversion method
$success = Convert-ToPDF -InputPath $InputFile -OutputPath $OutputPath -CSSPath $cssPath

# If primary method fails, try alternative
if (!$success) {
    Write-Host "Primary conversion failed. Trying alternative method..." -ForegroundColor Yellow
    $success = Convert-ToPDF-Alternative -InputPath $InputFile -OutputPath $OutputPath
}

# Cleanup
Remove-Item $cssPath -ErrorAction SilentlyContinue

if ($success) {
    Write-Host ""
    Write-Host "=== CONVERSION COMPLETED ===" -ForegroundColor Green
    Write-Host "PDF file created: $OutputPath" -ForegroundColor Green
    Write-Host ""
    
    # Open the PDF if requested
    $openFile = Read-Host "Would you like to open the PDF now? (y/n)"
    if ($openFile -eq 'y' -or $openFile -eq 'Y') {
        Start-Process $OutputPath
    }
} else {
    Write-Host ""
    Write-Host "=== CONVERSION FAILED ===" -ForegroundColor Red
    Write-Host "Please check the error messages above and try again." -ForegroundColor Red
    Write-Host ""
    exit 1
}