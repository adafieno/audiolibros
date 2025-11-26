# Script to patch processing chain files from old "segment_X" format to new "X" format
# This updates production data files to use the newly implemented segment ID format

param(
    [string]$ProjectRoot = ".",
    [switch]$DryRun = $false
)

# Set UTF-8 encoding for consistent file handling
$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'

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
        # Read the JSON file
        $jsonContent = Get-Content -Path $file.FullName -Raw -Encoding UTF8
        $jsonData = $jsonContent | ConvertFrom-Json
        
        if (-not $jsonData.processingChains) {
            Write-Host "   [SKIP] No processingChains property found, skipping..." -ForegroundColor Yellow
            continue
        }
        
        $processingChains = $jsonData.processingChains
        $originalKeys = $processingChains.PSObject.Properties.Name
        $keysToUpdate = @()
        
        # Find keys that match the old format (segment_X)
        foreach ($key in $originalKeys) {
            if ($key -match '^segment_(\d+)$') {
                $segmentNumber = $matches[1]
                $keysToUpdate += @{
                    OldKey = $key
                    NewKey = $segmentNumber
                    SegmentNumber = $segmentNumber
                }
            }
        }
        
        if ($keysToUpdate.Count -eq 0) {
            Write-Host "   [OK] No keys need updating (already in new format)" -ForegroundColor Green
            continue
        }
        
        Write-Host "   [KEYS] Found $($keysToUpdate.Count) keys to update:" -ForegroundColor Cyan
        foreach ($keyInfo in $keysToUpdate) {
            Write-Host "      '$($keyInfo.OldKey)' -> '$($keyInfo.NewKey)'" -ForegroundColor White
        }
        
        if (-not $DryRun) {
            # Create a new object for the updated processing chains
            $newProcessingChains = [PSCustomObject]@{}
            
            # Copy all properties, updating the keys as needed
            foreach ($key in $originalKeys) {
                $keyToUpdate = $keysToUpdate | Where-Object { $_.OldKey -eq $key }
                if ($keyToUpdate) {
                    # Use the new key format (just the number)
                    $newProcessingChains | Add-Member -NotePropertyName $keyToUpdate.NewKey -NotePropertyValue $processingChains.$key
                } else {
                    # Keep the original key
                    $newProcessingChains | Add-Member -NotePropertyName $key -NotePropertyValue $processingChains.$key
                }
            }
            
            # Update the main object
            $jsonData.processingChains = $newProcessingChains
            
            # Create backup
            $backupPath = "$($file.FullName).backup"
            Copy-Item -Path $file.FullName -Destination $backupPath -Force
            Write-Host "   [BACKUP] Created backup: $($file.Name).backup" -ForegroundColor Gray
            
            # Save the updated JSON with proper formatting
            $updatedJson = $jsonData | ConvertTo-Json -Depth 20
            $updatedJson | Out-File -FilePath $file.FullName -Encoding UTF8 -NoNewline
            
            Write-Host "   [SUCCESS] Successfully updated $($keysToUpdate.Count) keys" -ForegroundColor Green
            $totalPatched += $keysToUpdate.Count
        } else {
            Write-Host "   [DRY-RUN] Would update $($keysToUpdate.Count) keys" -ForegroundColor Magenta
        }
        
        $totalKeys += $keysToUpdate.Count
        
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