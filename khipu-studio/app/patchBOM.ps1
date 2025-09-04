# 1) See what PostCSS configs exist
Get-ChildItem -Force postcss.config.* | Format-Table Name,Length

# 2) Remove any JSON/JSON5 configs (these are the ones that break with BOM)
Remove-Item -Force .\postcss.config.json  -ErrorAction SilentlyContinue
Remove-Item -Force .\postcss.config.json5 -ErrorAction SilentlyContinue

# 3) Create a JS config (no JSON parsing; safe from BOM issues)
@'
module.exports = {
  plugins: {
    // tailwindcss: {},
    // autoprefixer: {},
  },
};
'@ | Set-Content -Encoding UTF8 .\postcss.config.cjs

# 4) Make sure package.json doesn't point to a JSON postcss config
$pkg = Get-Content .\package.json -Raw | ConvertFrom-Json
if ($pkg.PSObject.Properties['postcss']) {
  $pkg.PSObject.Properties.Remove('postcss')
  ($pkg | ConvertTo-Json -Depth 20) | Set-Content -Encoding UTF8 .\package.json
}

# 5) Resave ALL css files WITHOUT BOM (just to be thorough)
Get-ChildItem -Recurse -Include *.css -File . | ForEach-Object {
  $txt = Get-Content -Raw $_.FullName
  [System.IO.File]::WriteAllText($_.FullName, $txt, (New-Object System.Text.UTF8Encoding($false)))
}
