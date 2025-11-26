# Audeek Workflow - Simple Markdown to PDF Converter
# ==================================================

Write-Host "Converting Audeek Workflow to PDF..." -ForegroundColor Cyan

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

# Try using existing Pandoc installation
try {
    Write-Host "Attempting conversion with Pandoc..." -ForegroundColor Yellow
    
    $pandocArgs = @(
        $InputFile
        "-o", $OutputPath
        "--pdf-engine=wkhtmltopdf"
        "--metadata", "title=Audeek: Flujo de Trabajo de Audiolibros"
        "--metadata", "author=Audeek"
        "--table-of-contents"
        "--toc-depth=3"
        "--standalone"
        "--margin-top", "25mm"
        "--margin-bottom", "25mm"
        "--margin-left", "25mm"
        "--margin-right", "25mm"
    )
    
    & pandoc @pandocArgs
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ PDF created successfully!" -ForegroundColor Green
        Write-Host "Location: $OutputPath" -ForegroundColor Green
        
        # Ask if user wants to open the PDF
        $response = Read-Host "Open the PDF now? (y/n)"
        if ($response -match '^[Yy]') {
            Start-Process $OutputPath
        }
    } else {
        Write-Host "✗ Pandoc conversion failed" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please ensure Pandoc and wkhtmltopdf are installed:" -ForegroundColor Yellow
    Write-Host "  choco install pandoc" -ForegroundColor White
    Write-Host "  choco install wkhtmltopdf" -ForegroundColor White
}