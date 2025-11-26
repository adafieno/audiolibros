# Khipu Studio - Markdown to PDF Converter (PowerShell)
# ====================================================

Write-Host "Khipu Studio - Markdown to PDF Converter" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Configuration
$InputDir = "docs"
$OutputDir = "docs/pdf" 
$Files = @(
    @{ Input = "03-user-guide.md"; Output = "Khipu-Studio-User-Guide-EN.pdf"; Language = "English" },
    @{ Input = "03-user-guide-es-PE.md"; Output = "Khipu-Studio-Guia-Usuario-ES.pdf"; Language = "Español (Perú)" },
    @{ Input = "03-user-guide-pt-BR.md"; Output = "Khipu-Studio-Guia-Usuario-PT.pdf"; Language = "Português (Brasil)" }
)

# Ensure output directory exists
function Ensure-OutputDir {
    if (!(Test-Path $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
        Write-Host "Created output directory: $OutputDir" -ForegroundColor Green
    }
}

# Check if Pandoc is available
function Test-Pandoc {
    try {
        $null = pandoc --version
        Write-Host "Pandoc is installed" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "Pandoc not found" -ForegroundColor Red
        return $false
    }
}

# Install Pandoc via Chocolatey
function Install-Pandoc {
    Write-Host "Attempting to install Pandoc via Chocolatey..." -ForegroundColor Yellow
    try {
        choco install pandoc -y
        Write-Host "Pandoc installed successfully" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "Failed to install Pandoc via Chocolatey" -ForegroundColor Red
        Write-Host "Please install Pandoc manually from: https://pandoc.org/installing.html" -ForegroundColor Yellow
        return $false
    }
}

# Create CSS styles for PDF
function Create-PDFStyles {
    $CssContent = @"
/* PDF Styles for Khipu Studio User Guide */
@page {
    size: A4;
    margin: 2.5cm;
}

body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #333;
    max-width: none;
}

/* Headers */
h1 {
    color: #2c5aa0;
    font-size: 24pt;
    border-bottom: 3px solid #2c5aa0;
    padding-bottom: 10px;
    margin-top: 0;
    page-break-after: avoid;
}

h2 {
    color: #2c5aa0;
    font-size: 18pt;
    margin-top: 30px;
    margin-bottom: 15px;
    page-break-after: avoid;
}

h3 {
    color: #444;
    font-size: 14pt;
    margin-top: 25px;
    margin-bottom: 10px;
    page-break-after: avoid;
}

/* Lists and content */
ul, ol {
    margin-bottom: 15px;
    padding-left: 25px;
}

li {
    margin-bottom: 5px;
}

strong {
    color: #2c5aa0;
    font-weight: 600;
}

/* Code blocks */
code {
    background-color: #f5f5f5;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Consolas', monospace;
    font-size: 10pt;
}

pre {
    background-color: #f8f8f8;
    border: 1px solid #ddd;
    border-radius: 5px;
    padding: 15px;
    margin: 15px 0;
}

/* Images */
img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 20px auto;
    border: 1px solid #ddd;
    border-radius: 5px;
}

/* Step sections */
h3[id*="paso-"], h3[id*="passo-"], h3[id*="step-"] {
    background-color: #f0f4f8;
    padding: 10px;
    border-left: 4px solid #2c5aa0;
    border-radius: 0 5px 5px 0;
}
"@

    $CssPath = Join-Path $OutputDir "pdf-styles.css"
    $CssContent | Out-File -FilePath $CssPath -Encoding UTF8
    return $CssPath
}

# Convert markdown to PDF
function Convert-ToPDF {
    param(
        [string]$InputFile,
        [string]$OutputFile,
        [string]$Language
    )
    
    $InputPath = Join-Path $InputDir $InputFile
    $OutputPath = Join-Path $OutputDir $OutputFile
    $CssPath = Create-PDFStyles
    
    if (!(Test-Path $InputPath)) {
        Write-Host "Input file not found: $InputPath" -ForegroundColor Red
        return $false
    }

    try {
        Write-Host "`nConverting: $InputFile -> $OutputFile" -ForegroundColor Yellow
        Write-Host "Language: $Language" -ForegroundColor Gray
        
        # Pandoc command
        $PandocArgs = @(
            "`"$InputPath`"",
            "-o", "`"$OutputPath`"",
            "--from", "markdown",
            "--to", "pdf",
            "--pdf-engine=weasyprint",
            "--css=`"$CssPath`"",
            "--standalone",
            "--toc",
            "--toc-depth=3",
            "--metadata", "title=`"Khipu Studio User Guide`"",
            "--metadata", "author=`"Khipu Studio Team`"",
            "--variable", "geometry:margin=2.5cm",
            "--variable", "fontsize=11pt",
            "--variable", "papersize=a4"
        )
        
        & pandoc @PandocArgs
        
        if (Test-Path $OutputPath) {
            $Size = [math]::Round((Get-Item $OutputPath).Length / 1MB, 2)
            Write-Host "Created: $OutputFile ($Size MB)" -ForegroundColor Green
            return $true
        } else {
            Write-Host "Failed to create: $OutputFile" -ForegroundColor Red
            return $false
        }
        
    } catch {
        Write-Host "Error converting $InputFile" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        
        # Try alternative with wkhtmltopdf
        Write-Host "Trying alternative method..." -ForegroundColor Yellow
        return Convert-WithWKHtml -InputPath $InputPath -OutputPath $OutputPath -Language $Language
    }
}

# Alternative conversion with wkhtmltopdf
function Convert-WithWKHtml {
    param(
        [string]$InputPath,
        [string]$OutputPath,
        [string]$Language
    )
    
    try {
        # Convert to HTML first
        $HtmlPath = $OutputPath -replace '\.pdf$', '.html'
        $CssPath = Create-PDFStyles
        
        $HtmlArgs = @(
            "`"$InputPath`"",
            "-o", "`"$HtmlPath`"",
            "--from", "markdown",
            "--to", "html",
            "--standalone",
            "--toc",
            "--css=`"$CssPath`"",
            "--metadata", "title=`"Khipu Studio User Guide`""
        )
        
        & pandoc @HtmlArgs
        
        # Convert HTML to PDF
        $WKArgs = @(
            "--page-size", "A4",
            "--margin-top", "25mm",
            "--margin-bottom", "25mm",
            "--margin-left", "25mm", 
            "--margin-right", "25mm",
            "--enable-local-file-access",
            "`"$HtmlPath`"",
            "`"$OutputPath`""
        )
        
        & wkhtmltopdf @WKArgs
        
        # Clean up HTML
        Remove-Item $HtmlPath -ErrorAction SilentlyContinue
        
        Write-Host "Created with alternative method: $(Split-Path $OutputPath -Leaf)" -ForegroundColor Green
        return $true
        
    } catch {
        Write-Host "Alternative method also failed: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Main conversion process
function Start-Conversion {
    Write-Host "Starting PDF conversion process...`n" -ForegroundColor Cyan
    
    # Setup
    Ensure-OutputDir
    
    if (!(Test-Pandoc)) {
        Write-Host "Attempting to install Pandoc..." -ForegroundColor Yellow
        if (!(Install-Pandoc)) {
            Write-Host "Cannot proceed without Pandoc. Exiting." -ForegroundColor Red
            return
        }
    }
    
    $SuccessCount = 0
    $TotalFiles = $Files.Count
    
    # Convert each file
    foreach ($File in $Files) {
        $Success = Convert-ToPDF -InputFile $File.Input -OutputFile $File.Output -Language $File.Language
        if ($Success) { $SuccessCount++ }
    }
    
    # Summary
    Write-Host "`nConversion Summary:" -ForegroundColor Cyan
    Write-Host "Successfully converted: $SuccessCount/$TotalFiles files" -ForegroundColor $(if($SuccessCount -eq $TotalFiles){"Green"}else{"Yellow"})
    Write-Host "Output directory: $(Resolve-Path $OutputDir)" -ForegroundColor Gray
    
    if ($SuccessCount -gt 0) {
        Write-Host "`nGenerated PDF files:" -ForegroundColor Cyan
        foreach ($File in $Files) {
            $OutputPath = Join-Path $OutputDir $File.Output
            if (Test-Path $OutputPath) {
                $Size = [math]::Round((Get-Item $OutputPath).Length / 1MB, 2)
                Write-Host "   - $($File.Output) ($Size MB) - $($File.Language)" -ForegroundColor Gray
            }
        }
    }
    
    if ($SuccessCount -lt $TotalFiles) {
        Write-Host "`nSome conversions failed. Check the error messages above." -ForegroundColor Yellow
        Write-Host "Make sure you have either WeasyPrint or wkhtmltopdf installed:" -ForegroundColor Yellow
        Write-Host "   - WeasyPrint: pip install weasyprint" -ForegroundColor Gray
        Write-Host "   - wkhtmltopdf: choco install wkhtmltopdf" -ForegroundColor Gray
    }
}

# Run the conversion
Start-Conversion