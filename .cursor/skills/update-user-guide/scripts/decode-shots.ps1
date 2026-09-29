# Decode CDP Page.captureScreenshot responses saved by the Cursor browser into docs/user-guide/images.
# Usage: powershell -File decode-shots.ps1 08-13-01=23-scan-found 08-13-15=24-scan-missing
param([Parameter(ValueFromRemainingArguments)][string[]]$Pairs)

$logs = Join-Path $HOME '.cursor/browser-logs'
$outDir = Join-Path $PSScriptRoot '../../../../docs/user-guide/images'
New-Item -ItemType Directory -Force $outDir | Out-Null

foreach ($p in $Pairs) {
  $stamp, $name = $p -split '=', 2
  $src = Get-ChildItem $logs -Filter "cdp-response-Page.captureScreenshot-*$stamp*.json" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $src) { Write-Output "MISSING $stamp"; continue }
  $json = Get-Content $src.FullName -Raw | ConvertFrom-Json
  $data = if ($json.data) { $json.data } else { $json.result.data }
  [IO.File]::WriteAllBytes((Join-Path (Resolve-Path $outDir) "$name.png"), [Convert]::FromBase64String($data))
  Write-Output "$name.png"
}
