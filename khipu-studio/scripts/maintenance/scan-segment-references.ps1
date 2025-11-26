# Script to scan for any other data files that might need patching for new segment ID format
# This helps identify files that reference the old "segment_X" format

param(
    [string]$ProjectRoot = "."
)

Write-Host "[SCAN] Scanning for potential data files that need segment ID format updates..." -ForegroundColor Cyan
Write-Host "Project root: $((Resolve-Path $ProjectRoot).Path)" -ForegroundColor Gray

# Common file patterns that might contain segment references
$filePatterns = @(
    "*.json",
    "*.plan.json", 
    "*.metadata.json",
    "*.state.json",
    "*.settings.json"
)

$oldFormatReferences = @()
$scannedFiles = 0

foreach ($pattern in $filePatterns) {
    $files = Get-ChildItem -Path $ProjectRoot -Filter $pattern -Recurse -ErrorAction SilentlyContinue
    
    foreach ($file in $files) {
        $scannedFiles++
        
        try {
            # Skip backup files we just created
            if ($file.Name.EndsWith(".backup")) {
                continue
            }
            
            $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
            
            if ($content) {
                # Look for segment_X references (excluding comments and logs)
                $matches = [regex]::Matches($content, 'segment_\d+')
                
                if ($matches.Count -gt 0) {
                    $oldFormatReferences += @{
                        File = $file.FullName
                        RelativePath = $file.FullName.Replace("$((Resolve-Path $ProjectRoot).Path)\", "")
                        MatchCount = $matches.Count
                        Matches = ($matches | ForEach-Object { $_.Value } | Sort-Object -Unique)
                    }
                }
            }
        } catch {
            # Skip files that can't be read
        }
    }
}

Write-Host "`n[RESULTS] Scan complete!" -ForegroundColor Green
Write-Host "[STATS] Scanned $scannedFiles files" -ForegroundColor Gray

if ($oldFormatReferences.Count -eq 0) {
    Write-Host "[SUCCESS] No files found with old segment_X format references!" -ForegroundColor Green
    Write-Host "   All production data appears to be using the new format." -ForegroundColor Green
} else {
    Write-Host "[FOUND] Found $($oldFormatReferences.Count) files with potential old format references:" -ForegroundColor Yellow
    
    foreach ($ref in $oldFormatReferences) {
        Write-Host "`n   File: $($ref.RelativePath)" -ForegroundColor White
        Write-Host "   Matches ($($ref.MatchCount)): $($ref.Matches -join ', ')" -ForegroundColor Gray
    }
    
    Write-Host "`n[RECOMMENDATION] Review these files to determine if they need updating:" -ForegroundColor Blue
    Write-Host "   - Processing chains: Already handled by patch-processing-chains script" -ForegroundColor Gray
    Write-Host "   - Plan files: May contain segment references in different format" -ForegroundColor Gray
    Write-Host "   - State/metadata files: May contain segment references or IDs" -ForegroundColor Gray
    Write-Host "   - Log files: Usually don't need patching" -ForegroundColor Gray
}

Write-Host "`n[NOTE] The application supports both formats through backward compatibility," -ForegroundColor Blue
Write-Host "   so these references may still work but should be updated for consistency." -ForegroundColor Blue