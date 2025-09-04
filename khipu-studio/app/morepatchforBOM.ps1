# 0) Make sure we're in the app folder
pwd

# 1) Remove any PostCSS JSON configs that cosmiconfig might pick up
$patterns = @(
  'postcss.config.json','postcss.config.json5',
  '.postcssrc','.postcssrc.json','.postcssrc.yaml','.postcssrc.yml'
)
foreach ($pat in $patterns) {
  Get-ChildItem -Recurse -Force -ErrorAction SilentlyContinue -Filter $pat |
    ForEach-Object { Write-Host "Deleting $($_.FullName)"; Remove-Item -Force $_.FullName }
}
# Also check one level up, just in case:
Push-Location ..
foreach ($pat in $patterns) {
  Get-ChildItem -Recurse -Force -ErrorAction SilentlyContinue -Filter $pat |
    Where-Object { $_.FullName -like "*khipu-studio*" } |  # limit to this repo
    ForEach-Object { Write-Host "Deleting $($_.FullName)"; Remove-Item -Force $_.FullName }
}
Pop-Location

# 2) Ensure package.json has NO "postcss" field (cosmiconfig checks there, too)
$pkgPath = Join-Path (Get-Location) 'package.json'
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
if ($pkg.PSObject.Properties['postcss']) {
  $pkg.PSObject.Properties.Remove('postcss')
  ($pkg | ConvertTo-Json -Depth 20) | Set-Content -Encoding UTF8 $pkgPath
  Write-Host 'Removed "postcss" field from package.json'
}

# 3) Recreate a JS PostCSS config (cannot be BOM-broken, and JS is fine)
@'
module.exports = {
  plugins: {
    // tailwindcss: {},
    // autoprefixer: {},
  },
};
'@ | Set-Content -Encoding UTF8 .\postcss.config.cjs

# 4) Re-save ALL CSS files WITHOUT BOM (BOM can confuse other tooling)
Get-ChildItem -Recurse -Include *.css -File . | ForEach-Object {
  $txt = Get-Content -Raw $_.FullName
  [System.IO.File]::WriteAllText($_.FullName, $txt, (New-Object System.Text.UTF8Encoding($false)))
}

# 5) Quick sanity check: only a CJS config should remain
Get-ChildItem -Force postcss.config.*
