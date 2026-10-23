param([Parameter(Mandatory=$true)][string]$Source)
$ErrorActionPreference='Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  npm ci --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
  npm run import:original -- --source $Source
  if ($LASTEXITCODE -ne 0) { throw 'Original-file import failed' }
  npm run check
  if ($LASTEXITCODE -ne 0) { throw 'Checks failed' }
  npm run build:sfhs -- --assets '.private/imported'
  if ($LASTEXITCODE -ne 0) { throw 'Private build failed' }
  Write-Host 'Private development build: dist/genewars-sfhs.html'
  Write-Host 'Campaign completion is not yet implemented. See docs/CURRENT_STATE.md.'
} finally { Pop-Location }
