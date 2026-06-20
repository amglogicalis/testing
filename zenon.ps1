# =============================================================================
# Zenon AI Engine — CLI wrapper (Windows / PowerShell)
# Usage:
#   .\zenon.ps1                                      # default: assist mode
#   .\zenon.ps1 --mode correct                       # auto-fix & commit
#   .\zenon.ps1 --mode objective                     # implement goal from zenon_objective.md
#   .\zenon.ps1 --mode objective --objective path\to\my_goal.md
#   .\zenon.ps1 --mode assist --exclude "test/,fixtures/"
#   .\zenon.ps1 --mode trainer --topic "Ruby on Rails 7.0"
#   .\zenon.ps1 --mode reviewer                      # review local unstaged/staged git diff
#   .\zenon.ps1 --mode reviewer --diff "HEAD~1"       # review last commit
#   .\zenon.ps1 --mode analyzer                      # show consumption stats and quotas
#   .\zenon.ps1 --mode analyzer --reset-stats        # reset consumption statistics
#   .\zenon.ps1 --mode helper --topic "¿cómo funciona la autenticación?"
#   .\zenon.ps1 --mode updater                       # auto-update docs relative to code changes
#   .\zenon.ps1 --mode updater --docs "README.md"    # update specific documentation files
# =============================================================================
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ZenonArgs
)

$ErrorActionPreference = "Stop"

# Resolve the directory where this script lives (the repo root)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ZenonJs   = Join-Path $ScriptDir "src/zenon.js"

# Verify if zenon.js exists. If not, the wrapper was likely copied without zenon.js.
if (-not (Test-Path $ZenonJs)) {
    Write-Host ""
    Write-Host "❌ [zenon.ps1] Error: No se encontró 'zenon.js' en: $ZenonJs" -ForegroundColor Red
    Write-Host "   Si has copiado 'zenon.ps1' a otro repositorio, ¡no es necesario!"
    Write-Host "   Puedes ejecutar Zenon desde cualquier carpeta llamándolo por su ruta original:"
    Write-Host "     C:\mis-proyectos\Zenon\zenon.ps1 --mode assist" -ForegroundColor Cyan
    Write-Host "   O añadir la carpeta de Zenon ('C:\mis-proyectos\Zenon') a tu PATH de Windows."
    Write-Host ""
    exit 1
}

# Load a local .env file if it exists (for local API keys)
$EnvFile = Join-Path $ScriptDir ".env"
if (Test-Path $EnvFile) {
    Write-Host "[zenon.ps1] Loading environment from .env..."
    Get-Content $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line -split "=", 2
            if ($parts.Count -eq 2) {
                $key   = $parts[0].Trim()
                $value = $parts[1].Trim().Trim('"').Trim("'")
                [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
            }
        }
    }
    Write-Host "[zenon.ps1] Environment loaded."
}

# Validate Node.js availability
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Error "[zenon.ps1] ❌ Node.js is not installed or not on PATH.`n           Install Node.js >= 18 from https://nodejs.org"
    exit 1
}

$nodeVer = & node --version
Write-Host "[zenon.ps1] Node.js $nodeVer detected"
Write-Host "[zenon.ps1] Launching Zenon AI Engine..."
Write-Host ""

# Forward all CLI arguments to zenon.js
& node $ZenonJs @ZenonArgs
