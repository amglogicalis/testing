# =============================================================================
# Zenon Polis — Setup Helper (Windows / PowerShell)
# =============================================================================
# Este script te ayuda a importar de forma rápida y sencilla los módulos de
# Zenon Polis en cualquier repositorio local. Crea los archivos de workflow
# en .github/workflows/ y los archivos de configuración requeridos.
# =============================================================================

$ErrorActionPreference = "Stop"

# Leer valores de la pipeline si existen (útil para ejecuciones no interactivas/automatizadas)
$PipelineInputs = @($input) | Where-Object { $_ -ne $null -and $_.ToString().Trim() -ne "" }
$script:PipelineIndex = 0

function Get-NextInput {
    if ($script:PipelineIndex -lt $script:PipelineInputs.Count) {
        $val = $script:PipelineInputs[$script:PipelineIndex].ToString()
        $script:PipelineIndex++
        return $val
    }
    return $null
}

$ChoiceInput = Get-NextInput
$ProviderChoice = Get-NextInput

Write-Host "=========================================================" -ForegroundColor Magenta
Write-Host "        ⚡ Bienvenido al Asistente de Zenon Setup ⚡" -ForegroundColor Magenta
Write-Host "=========================================================" -ForegroundColor Magenta
Write-Host "Este script configurará las acciones de Zenon Polis en este repo."
Write-Host ""

# 1. Asegurar directorios
$WorkflowsDir = Join-Path (Get-Location) ".github/workflows"
if (-not (Test-Path $WorkflowsDir)) {
    New-Item -ItemType Directory -Path $WorkflowsDir -Force | Out-Null
    Write-Host "📁 Creada la carpeta de flujos de trabajo: .github/workflows/" -ForegroundColor Cyan
}

# 2. Menú de Selección de Módulos
Write-Host ""
Write-Host "Selecciona qué módulos de Zenon Polis deseas importar:" -ForegroundColor Yellow
Write-Host "1) Reviewer (Auditoría automática de PRs y commits)"
Write-Host "2) DevOpser (Plataforma lambda de automatización de tareas)"
Write-Host "3) Tester (Ejecución y auto-corrección de pruebas unitarias)"
Write-Host "4) Updater (Sincronización de documentación con código)"
Write-Host "5) Helper (Asistente de consultas interactivas del repo)"
Write-Host "6) Analyzer (Visualizador gráfico de estadísticas de consumo)"
Write-Host "7) Core Action (Ejecutor general de Zenon Principal)"
Write-Host ""
Write-Host "Elige las opciones deseadas separadas por comas (ej. 1,2,5) o escribe 'todos':"

if (-not $ChoiceInput) {
    $ChoiceInput = Read-Host "Opción"
}
if (-not $ChoiceInput) { $ChoiceInput = "todos" }

$SelectedOptions = @()
if ($ChoiceInput.ToLower().Trim() -eq "todos" -or $ChoiceInput.ToLower().Trim() -eq "all") {
    $SelectedOptions = 1..7
} else {
    $parts = $ChoiceInput -split ","
    foreach ($p in $parts) {
        $val = 0
        if ([int]::TryParse($p.Trim(), [ref]$val)) {
            if ($val -ge 1 -and $val -le 7) {
                $SelectedOptions += $val
            }
        }
    }
}

if ($SelectedOptions.Count -eq 0) {
    Write-Host "❌ Selección no válida. Saliendo." -ForegroundColor Red
    exit 1
}

# 3. Preguntar por Proveedores de IA
Write-Host ""
Write-Host "Configuración de Proveedores de IA:" -ForegroundColor Yellow
Write-Host "1) Solo Gemini (Recomendado, gratis y con búsqueda web)"
Write-Host "2) Multiproveedor (Gemini, Groq, SambaNova, Cohere, Cerebras, etc.)"
if (-not $ProviderChoice) {
    $ProviderChoice = Read-Host "Elige una opción [1-2]"
}
if (-not $ProviderChoice) { $ProviderChoice = "1" }

$UseMultiProvider = $ProviderChoice.Trim() -eq "2"

# 4. Plantillas de workflows
$WorkflowTemplates = @{}

# Claves de IA a inyectar en el YAML
$KeysYaml = ""
if ($UseMultiProvider) {
    $KeysYaml = @'
          zenon-api-key: ${{ secrets.ZENON_API_KEY }}
          groq-api-key: ${{ secrets.GROQ_API_KEY }}
          cohere-api-key: ${{ secrets.COHERE_API_KEY }}
          openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
          samba-api-key: ${{ secrets.SAMBA_API_KEY }}
          cerebras-api-key: ${{ secrets.CEREBRAS_API_KEY }}
          gh-models-token: ${{ secrets.GH_MODELS_TOKEN }}
'@
} else {
    $KeysYaml = '          zenon-api-key: ${{ secrets.ZENON_API_KEY }}'
}

# REVIEWER (1)
$WorkflowTemplates[1] = @{
    Filename = "zenon-reviewer.yml"
    Content  = @'
name: 🔍 Zenon Reviewer

on:
  pull_request:
    branches: [ main ]
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  reviewer:
    name: 🔍 Zenon Reviewer — PR Audit
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Zenon Reviewer
        uses: amglogicalis/Zenon/.github/actions/reviewer@main
        with:
__KEYS_YAML__
          github-token: ${{ secrets.GITHUB_TOKEN }}
'@
}

# DEVOPSER (2)
$WorkflowTemplates[2] = @{
    Filename = "zenon-devopser.yml"
    Content  = @'
name: ⚡ Zenon DevOpser

on:
  workflow_dispatch:
    inputs:
      devops-plan-file:
        description: 'Plan file path (default: zenon_devops.md)'
        required: false
        default: 'zenon_devops.md'
      self-heal:
        description: 'Enable AI Self-Healing?'
        required: false
        default: 'true'
        type: choice
        options:
          - 'true'
          - 'false'
      notify-email:
        description: 'Email to send the execution report to'
        required: false
        default: ''

jobs:
  devopser:
    name: ⚡ Zenon DevOpser Pipeline
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run Zenon DevOpser
        uses: amglogicalis/Zenon/.github/actions/devopser@main
        with:
__KEYS_YAML__
          devops-plan-file: ${{ inputs.devops-plan-file }}
          self-heal: ${{ inputs.self-heal }}
          notify-email: ${{ inputs.notify-email }}
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Send Email Report
        if: always() && inputs['notify-email'] != ''
        uses: dawidd6/action-send-mail@v4
        with:
          server_address: smtp.gmail.com
          server_port: 587
          username: ${{ secrets.MAIL_USERNAME }}
          password: ${{ secrets.MAIL_PASSWORD }}
          subject: "⚡ Zenon DevOpser Report — ${{ github.repository }}"
          to: ${{ inputs.notify-email }}
          from: Zenon DevOpser
          html_body: file://zenon_report.html
'@
}

# TESTER (3)
$WorkflowTemplates[3] = @{
    Filename = "zenon-tester.yml"
    Content  = @'
name: 🧪 Zenon Tester

on:
  workflow_dispatch:
    inputs:
      test-cmd:
        description: 'Custom test command (leave empty for auto-detect)'
        required: false
        default: ''
      auto-fix:
        description: 'Enable auto-fix and commit corrections?'
        required: false
        default: 'true'
        type: choice
        options:
          - 'true'
          - 'false'

jobs:
  tester:
    name: 🧪 Zenon Tester & Auto-Fix
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run Zenon Tester
        uses: amglogicalis/Zenon/.github/actions/tester@main
        with:
__KEYS_YAML__
          test-cmd: ${{ inputs.test-cmd }}
          auto-fix: ${{ inputs.auto-fix }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
'@
}

# UPDATER (4)
$WorkflowTemplates[4] = @{
    Filename = "zenon-updater.yml"
    Content  = @'
name: 📝 Zenon Updater

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  updater:
    name: 📝 Zenon Updater — Sync Docs
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Zenon Updater
        uses: amglogicalis/Zenon/.github/actions/updater@main
        with:
__KEYS_YAML__
          github-token: ${{ secrets.GITHUB_TOKEN }}
'@
}

# HELPER (5)
$WorkflowTemplates[5] = @{
    Filename = "zenon-helper.yml"
    Content  = @'
name: 🤖 Zenon Helper

on:
  workflow_dispatch:
    inputs:
      query:
        description: 'Your question about the codebase'
        required: true
        default: 'Explain the general architecture of this repository.'

jobs:
  helper:
    name: 🤖 Zenon Helper Query
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run Zenon Helper
        uses: amglogicalis/Zenon/.github/actions/helper@main
        with:
__KEYS_YAML__
          query: ${{ inputs.query }}
'@
}

# ANALYZER (6)
$WorkflowTemplates[6] = @{
    Filename = "zenon-analyzer.yml"
    Content  = @'
name: 📊 Zenon Analyzer

on:
  workflow_dispatch:
    inputs:
      reset:
        description: 'Reset quota statistics to zero?'
        required: false
        default: 'false'
        type: choice
        options:
          - 'false'
          - 'true'

jobs:
  analyzer:
    name: 📊 Zenon Analyzer Stats
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run Zenon Analyzer
        uses: amglogicalis/Zenon/.github/actions/analyzer@main
        with:
          reset: ${{ inputs.reset }}
'@
}

# CORE ACTION (7)
$WorkflowTemplates[7] = @{
    Filename = "zenon.yml"
    Content  = @'
name: Zenon AI Assistant

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]
  workflow_dispatch:
    inputs:
      mode:
        description: 'Execution Mode'
        required: false
        default: 'assist'
        type: choice
        options:
          - assist
          - correct
          - objective
          - trainer
          - reviewer
          - analyzer
          - helper

jobs:
  run-zenon:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Restore Zenon Knowledge Cache
        uses: actions/cache@v4
        with:
          path: .zenon_cache.json
          key: zenon-knowledge-cache-${{ github.run_id }}
          restore-keys: |
            zenon-knowledge-cache-

      - name: Run Zenon Core Action
        uses: amglogicalis/Zenon@main
        with:
__KEYS_YAML__
          mode: ${{ github.event.inputs.mode || 'assist' }}
'@
}

# 5. Generar archivos
$CreatedFiles = @()
$WarningsList = @()

foreach ($opt in $SelectedOptions) {
    $temp = $WorkflowTemplates[$opt]
    if ($temp) {
        $DestPath = Join-Path $WorkflowsDir $temp.Filename
        # Reemplazar la plantilla del bloque de claves
        $yamlContent = $temp.Content -replace '__KEYS_YAML__', $KeysYaml
        Set-Content -Path $DestPath -Value $yamlContent -Encoding utf8
        $CreatedFiles += ".github/workflows/$($temp.Filename)"

        # Crear archivos dependientes adicionales si procede
        if ($opt -eq 2) { # DevOpser
            $PlanPath = Join-Path (Get-Location) "zenon_devops.md"
            if (-not (Test-Path $PlanPath)) {
                $PlanContent = @'
# Zenon DevOpser — Plan de Automatización

## Destinatario
tu-correo@gmail.com

---

## Tarea: check-environment
- **Instrucciones**: Comprueba la versión de Node.js instalada en el sistema (debe ser >= 18). Muestra una salida exitosa si lo es.
- **Continuar si falla**: false
'@
                Set-Content -Path $PlanPath -Value $PlanContent -Encoding utf8
                $CreatedFiles += "zenon_devops.md"
            }
            $WarningsList += "[DevOpser] Se ha creado un archivo 'zenon_devops.md' básico en la raíz. Recuerda editarlo y configurar tus tareas. Consulta el README para más especificaciones."
        }

        if ($opt -eq 7) { # Core / Objective
            $ObjPath = Join-Path (Get-Location) "zenon_objective.md"
            if (-not (Test-Path $ObjPath)) {
                $ObjContent = "# Objetivo de desarrollo`nEscribe aquí la meta técnica que quieres que Zenon resuelva."
                Set-Content -Path $ObjPath -Value $ObjContent -Encoding utf8
                $CreatedFiles += "zenon_objective.md"
            }
        }
    }
}

# 6. Mostrar Informe de Éxito
Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "      🎉 ¡Configuración de Zenon Completada con Éxito! 🎉" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "Archivos creados:" -ForegroundColor Yellow
foreach ($file in $CreatedFiles) {
    Write-Host "  ✅ $file" -ForegroundColor Green
}

if ($WarningsList.Count -ge 1) {
    Write-Host ""
    Write-Host "Notas Importantes:" -ForegroundColor Yellow
    foreach ($warn in $WarningsList) {
        Write-Host "  ⚠️  $warn" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "Próximos pasos requeridos en GitHub (Settings > Secrets and variables > Actions):" -ForegroundColor Yellow
Write-Host "1. Añade como Repository Secret la clave de API principal:"
Write-Host "   - ZENON_API_KEY (Clave de Google Gemini)" -ForegroundColor Magenta

if ($UseMultiProvider) {
    Write-Host "2. Añade las claves secundarias para habilitar la cascada de fallbacks (Opcional):"
    Write-Host "   - GROQ_API_KEY, SAMBA_API_KEY, COHERE_API_KEY, CEREBRAS_API_KEY, GH_MODELS_TOKEN" -ForegroundColor Magenta
}

if ($SelectedOptions -contains 2) {
    Write-Host "3. Para notificaciones por Correo de DevOpser, añade los secretos SMTP:"
    Write-Host "   - MAIL_USERNAME (Tu email)" -ForegroundColor Magenta
    Write-Host "   - MAIL_PASSWORD (Tu contraseña de aplicación)" -ForegroundColor Magenta
}

Write-Host ""
Write-Host "¡Archivos de configuración creados con éxito!" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Magenta

# 7. Preguntar si se desean subir los cambios a GitHub
Write-Host ""
$GitChoiceInput = Get-NextInput
if (-not $GitChoiceInput) {
    $GitChoiceInput = Read-Host "Quieres subir los cambios a github? [s/N]"
}
if (-not $GitChoiceInput) { $GitChoiceInput = "n" }

if ($GitChoiceInput.ToLower().Trim() -eq "s" -or $GitChoiceInput.ToLower().Trim() -eq "si" -or $GitChoiceInput.ToLower().Trim() -eq "y" -or $GitChoiceInput.ToLower().Trim() -eq "yes") {
    Write-Host "Haciendo git add, commit y push..." -ForegroundColor Yellow
    try {
        git add .github/workflows/* *>$null
        if (Test-Path "zenon_devops.md") { git add zenon_devops.md *>$null }
        if (Test-Path "zenon_objective.md") { git add zenon_objective.md *>$null }
        git commit -m "chore: setup Zenon Polis workflows and configurations" *>$null
        git push *>$null
        if ($LASTEXITCODE -ne 0) {
            throw "Git push failed"
        }
        Write-Host "✅ Cambios subidos a GitHub con éxito." -ForegroundColor Green
    } catch {
        Write-Host "❌ Error al subir los cambios a Git. Asegúrate de tener Git configurado y permisos para subir a esta rama." -ForegroundColor Red
    }
}

# 8. Preguntar si se desean configurar las variables de auto-ejecución
Write-Host ""
$VarChoiceInput = Get-NextInput
if (-not $VarChoiceInput) {
    $VarChoiceInput = Read-Host "Quieres configurar las variables de auto-ejecucion de los flujos? [s/N]"
}
if (-not $VarChoiceInput) { $VarChoiceInput = "n" }

if ($VarChoiceInput.ToLower().Trim() -eq "s" -or $VarChoiceInput.ToLower().Trim() -eq "si" -or $VarChoiceInput.ToLower().Trim() -eq "y" -or $VarChoiceInput.ToLower().Trim() -eq "yes") {
    if (Get-Command gh -ErrorAction SilentlyContinue) {
        # Reviewer Auto Execution (sólo si se seleccionó la opción 1)
        if ($SelectedOptions -contains 1) {
            $AutoReviewChoice = Get-NextInput
            if (-not $AutoReviewChoice) {
                $AutoReviewChoice = Read-Host "Quieres que Zenon Reviewer se ejecute automaticamente en cada pull request o commit? [S/n]"
            }
            if (-not $AutoReviewChoice) { $AutoReviewChoice = "s" }
            
            $AutoReviewVal = "false"
            if ($AutoReviewChoice.ToLower().Trim() -eq "n" -or $AutoReviewChoice.ToLower().Trim() -eq "no") {
                $AutoReviewVal = "true"
            }
            Write-Host "Configurando variable ZENON_DISABLE_AUTO_REVIEW a $AutoReviewVal en GitHub..." -ForegroundColor Yellow
            $AutoReviewVal | gh variable set ZENON_DISABLE_AUTO_REVIEW
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Variable ZENON_DISABLE_AUTO_REVIEW configurada correctamente." -ForegroundColor Green
            } else {
                Write-Host "❌ Error al configurar la variable ZENON_DISABLE_AUTO_REVIEW." -ForegroundColor Red
            }
        }

        # Updater Auto Execution (sólo si se seleccionó la opción 4)
        if ($SelectedOptions -contains 4) {
            $AutoUpdateChoice = Get-NextInput
            if (-not $AutoUpdateChoice) {
                $AutoUpdateChoice = Read-Host "Quieres que Zenon Updater se ejecute automaticamente en cada commit? [S/n]"
            }
            if (-not $AutoUpdateChoice) { $AutoUpdateChoice = "s" }
            
            $AutoUpdateVal = "false"
            if ($AutoUpdateChoice.ToLower().Trim() -eq "n" -or $AutoUpdateChoice.ToLower().Trim() -eq "no") {
                $AutoUpdateVal = "true"
            }
            Write-Host "Configurando variable ZENON_DISABLE_AUTO_UPDATE a $AutoUpdateVal en GitHub..." -ForegroundColor Yellow
            $AutoUpdateVal | gh variable set ZENON_DISABLE_AUTO_UPDATE
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Variable ZENON_DISABLE_AUTO_UPDATE configurada correctamente." -ForegroundColor Green
            } else {
                Write-Host "❌ Error al configurar la variable ZENON_DISABLE_AUTO_UPDATE." -ForegroundColor Red
            }
        }
    } else {
        Write-Host "❌ El comando 'gh' (GitHub CLI) no está instalado en el sistema." -ForegroundColor Red
        Write-Host "Instálalo y ejecuta 'gh auth login' antes de configurar variables desde consola." -ForegroundColor Yellow
    }
}

# 9. Preguntar si se desean configurar los secrets desde aquí
Write-Host ""
$SecretChoiceInput = Get-NextInput
if (-not $SecretChoiceInput) {
    $SecretChoiceInput = Read-Host "Quieres configurar los secrets (API Keys) de GitHub? [s/N]"
}
if (-not $SecretChoiceInput) { $SecretChoiceInput = "n" }

if ($SecretChoiceInput.ToLower().Trim() -eq "s" -or $SecretChoiceInput.ToLower().Trim() -eq "si" -or $SecretChoiceInput.ToLower().Trim() -eq "y" -or $SecretChoiceInput.ToLower().Trim() -eq "yes") {
    if (Get-Command gh -ErrorAction SilentlyContinue) {
        $GeminiKeyInput = Get-NextInput
        if (-not $GeminiKeyInput) {
            $GeminiKeyInput = Read-Host "Pega la API Key de Gemini (ZENON_API_KEY)"
        }
        if ($GeminiKeyInput -and $GeminiKeyInput.Trim() -ne "") {
            Write-Host "Configurando el secreto ZENON_API_KEY en GitHub..." -ForegroundColor Yellow
            $GeminiKeyInput.Trim() | gh secret set ZENON_API_KEY
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Secreto ZENON_API_KEY subido correctamente." -ForegroundColor Green
            } else {
                Write-Host "❌ Error al ejecutar 'gh secret set'. Asegúrate de haber iniciado sesión con 'gh auth login'." -ForegroundColor Red
            }
        } else {
            Write-Host "No se ha introducido ninguna clave." -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ El comando 'gh' (GitHub CLI) no está instalado en el sistema." -ForegroundColor Red
        Write-Host "Instálalo y ejecuta 'gh auth login' antes de configurar secretos desde consola." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Magenta

