# Simple script to patch processing chain files from old "segment_X" format to new "X" format
# Uses text replacement instead of PowerShell objects to handle numeric keys

param(
    [string]$ProjectRoot = ".",
    [switch]$DryRun = $false
)

Write-Host "[PATCH] Patching processing chain files to use new segment ID format..." -ForegroundColor Cyan
Write-Host "Project root: $((Resolve-Path $ProjectRoot).Path)" -ForegroundColor Gray

# Find all processing-chains.json files
$processingChainFiles = Get-ChildItem -Path $ProjectRoot -Filter "processing-chains.json" -Recurse

if ($processingChainFiles.Count -eq 0) {
    Write-Host "[ERROR] No processing-chains.json files found!" -ForegroundColor Red
    exit 1
}

Write-Host "[FOUND] Found $($processingChainFiles.Count) processing chain files to patch:" -ForegroundColor Green
foreach ($file in $processingChainFiles) {
    Write-Host "   - $($file.FullName)" -ForegroundColor Gray
}

$totalPatched = 0
$totalKeys = 0

foreach ($file in $processingChainFiles) {
    Write-Host "`n[PROCESS] Processing: $($file.Name)" -ForegroundColor Yellow
    
    try {
        # Read the JSON file as text
        $jsonContent = Get-Content -Path $file.FullName -Raw -Encoding UTF8
        
        # Find all segment_X keys using regex
        $segmentMatches = [regex]::Matches($jsonContent, '"segment_(\d+)"\s*:')
        
        if ($segmentMatches.Count -eq 0) {
            Write-Host "   [OK] No keys need updating (already in new format)" -ForegroundColor Green
            continue
        }
        
        Write-Host "   [KEYS] Found $($segmentMatches.Count) keys to update:" -ForegroundColor Cyan
        $newContent = $jsonContent
        $patchedCount = 0
        
        # Process each match
        foreach ($match in $segmentMatches) {
            $fullMatch = $match.Groups[0].Value  # Full match like "segment_6":
            $segmentNumber = $match.Groups[1].Value  # Just the number like "6"
            $newKey = "`"$segmentNumber`":"
            
            Write-Host "      '$($fullMatch.TrimEnd(':'))' -> '$($newKey.TrimEnd(':'))'" -ForegroundColor White
            
            if (-not $DryRun) {
                $newContent = $newContent -replace [regex]::Escape($fullMatch), $newKey
                $patchedCount++
            }
        }
        
        if (-not $DryRun) {
            # Create backup
            $backupPath = "$($file.FullName).backup"
            Copy-Item -Path $file.FullName -Destination $backupPath -Force
            Write-Host "   [BACKUP] Created backup: $($file.Name).backup" -ForegroundColor Gray
            
            # Save the updated content
            $newContent | Out-File -FilePath $file.FullName -Encoding UTF8 -NoNewline
            
            Write-Host "   [SUCCESS] Successfully updated $patchedCount keys" -ForegroundColor Green
            $totalPatched += $patchedCount
        } else {
            Write-Host "   [DRY-RUN] Would update $($segmentMatches.Count) keys" -ForegroundColor Magenta
        }
        
        $totalKeys += $segmentMatches.Count
        
    } catch {
        Write-Host "   [ERROR] Error processing file: $_" -ForegroundColor Red
    }
}

Write-Host "`n[COMPLETE] Patching complete!" -ForegroundColor Green
if ($DryRun) {
    Write-Host "[DRY-RUN] Summary: Found $totalKeys keys that would be updated across $($processingChainFiles.Count) files" -ForegroundColor Magenta
    Write-Host "   Run without -DryRun to apply the changes" -ForegroundColor Yellow
} else {
    Write-Host "[SUCCESS] Summary: Successfully patched $totalPatched keys across $($processingChainFiles.Count) files" -ForegroundColor Cyan
    Write-Host "   Backup files created with .backup extension" -ForegroundColor Gray
}

Write-Host "`n[NOTE] The application now supports both old and new formats through backward compatibility," -ForegroundColor Blue
Write-Host "   but using the new format ensures consistency with the updated architecture." -ForegroundColor Blue