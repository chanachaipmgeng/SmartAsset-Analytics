<#
.SYNOPSIS
  Pre-commit verification: backend lint + tests, frontend format check, build and unit tests.

.DESCRIPTION
  Backend tests run inside the `api` image (the same Python and DB credentials as production), with the working
  tree's app/, tests/ and the frontend core sources mounted, so `backend/.env` doesn't have to match the Docker
  `.env`. The stack must be up and migrated: `docker compose up -d --build`.

.PARAMETER Skip
  Steps to skip: lint, backend, format, build, test.

.EXAMPLE
  ./scripts/verify.ps1
  ./scripts/verify.ps1 -Skip backend
#>
param([string[]]$Skip = @())

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$failed = @()

function Step([string]$Name, [string]$Title, [scriptblock]$Body) {
  if ($Skip -contains $Name) {
    Write-Host "-- skip $Title" -ForegroundColor DarkGray
    return
  }
  Write-Host "== $Title" -ForegroundColor Cyan
  & $Body
  if ($LASTEXITCODE -ne 0) {
    Write-Host "!! $Title failed" -ForegroundColor Red
    $script:failed += $Title
  }
}

Push-Location $root
try {
  Step 'lint' 'backend: ruff' {
    Push-Location backend
    uv run ruff check
    Pop-Location
  }

  Step 'backend' 'backend: pytest (api container)' {
    $mounts = @(
      '-v', "$root/backend/app:/app/app:ro",
      '-v', "$root/backend/tests:/app/tests:ro",
      '-v', "$root/frontend/src/app/core:/frontend/src/app/core:ro"
    )
    docker compose run --rm --no-deps --user root --entrypoint sh @mounts api `
      -c 'uv sync --frozen --no-install-project -q && python -m pytest -q -p no:cacheprovider'
  }

  Push-Location frontend
  Step 'format' 'frontend: prettier' { npm run --silent format:check }
  Step 'build' 'frontend: ng build' { npx ng build }
  Step 'test' 'frontend: ng test' { npx ng test --watch=false }
  Pop-Location
}
finally {
  Pop-Location
}

if ($failed.Count) {
  Write-Host "FAILED: $($failed -join ', ')" -ForegroundColor Red
  exit 1
}
Write-Host 'All checks passed' -ForegroundColor Green
