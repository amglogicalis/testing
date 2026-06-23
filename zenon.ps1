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
#   .\zenon.ps1 --mode tester                        # detect tests, run and report errors
#   .\zenon.ps1 --mode tester --auto-fix             # run tests and auto-fix/commit changes
#   .\zenon.ps1 --mode tester --test-cmd "npm test"  # run tests with custom command
#   .\zenon.ps1 --mode tester --topic "auth.test.js" # run tests focusing on auth.test.js
#
#   ---- Zenon DevOpser — Autonomous DevOps Operator & Lambda Platform ----
#   .\zenon.ps1 --mode devops                                    # run all tasks in zenon_devops.md
#   .\zenon.ps1 --mode devops --plan-file my_pipeline.md         # custom plan file
#   .\zenon.ps1 --mode devops --devops-task "check-ssl"          # run only a specific task
#   .\zenon.ps1 --mode devops --self-heal                        # enable AI self-healing on failures
#   .\zenon.ps1 --mode devops --notify-webhook "https://discord.com/api/webhooks/..."   # notify Discord
#   .\zenon.ps1 --mode devops --notify-email "you@example.com"   # set email report target
#   .\zenon.ps1 --mode devops --self-heal --devops-task "my-task" # targeted + self-heal
# =============================================================================
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ZenonArgs
)

$ErrorActionPreference = "Stop"

# Resolve the directory where this script lives (the repo root)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$SrcDir    = Join-Path $ScriptDir "src"
$ZenonJs   = Join-Path $SrcDir "zenon.js"
$ModelsJson = Join-Path $SrcDir "zenon_models.json"

# Verify and download dependencies if missing
if (-not (Test-Path $SrcDir)) {
    New-Item -ItemType Directory -Path $SrcDir -Force | Out-Null
}

if (-not (Test-Path $ZenonJs)) {
    Write-Host "[zenon.ps1] 📥 Descargando 'zenon.js' desde el repositorio principal..." -ForegroundColor Yellow
    $Uri = "https://raw.githubusercontent.com/amglogicalis/Zenon/main/src/zenon.js"
    Invoke-WebRequest -Uri $Uri -OutFile $ZenonJs -UseBasicParsing
}

if (-not (Test-Path $ModelsJson)) {
    Write-Host "[zenon.ps1] 📥 Descargando 'zenon_models.json' desde el repositorio principal..." -ForegroundColor Yellow
    $Uri = "https://raw.githubusercontent.com/amglogicalis/Zenon/main/src/zenon_models.json"
    Invoke-WebRequest -Uri $Uri -OutFile $ModelsJson -UseBasicParsing
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
