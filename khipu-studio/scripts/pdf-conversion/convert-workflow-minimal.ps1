# Simple Workflow PDF Converter
Write-Host "Converting Audeek Workflow to PDF..." -ForegroundColor Cyan

$InputFile = "c:\code\audiolibros\flujo_de_trabajo\audiolibros_flujo_de_trabajo_ui.md"
$OutputPath = "c:\code\audiolibros\flujo_de_trabajo\Audeek-Flujo-de-Trabajo-Audiolibros.pdf"

if (!(Test-Path $InputFile)) {
    Write-Host "Error: Input file not found" -ForegroundColor Red
    exit 1
}

Write-Host "Converting: $InputFile" -ForegroundColor Yellow
Write-Host "Output: $OutputPath" -ForegroundColor Yellow

pandoc $InputFile -o $OutputPath --pdf-engine=wkhtmltopdf --metadata title="Audeek: Flujo de Trabajo de Audiolibros" --toc

if ($LASTEXITCODE -eq 0) {
    Write-Host "Success! PDF created at: $OutputPath" -ForegroundColor Green
} else {
    Write-Host "Failed. Please install: choco install pandoc wkhtmltopdf" -ForegroundColor Red
}