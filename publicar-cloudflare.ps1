param(
  [ValidateSet("estudiantes", "administrador", "coordinadores", "todos")]
  [string]$Aplicacion = "todos",
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Require-Path([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label no existe: $Path"
  }
}

function Reset-Directory([string]$Path) {
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }

  New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

function Copy-Contents([string]$Source, [string]$Destination) {
  Require-Path $Source "Carpeta de origen"
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  Copy-Item -Path (Join-Path $Source "*") -Destination $Destination -Recurse -Force
}

$NpxCommand = Get-Command "npx.cmd" -ErrorAction SilentlyContinue
if (-not $NpxCommand) {
  $NpxCommand = Get-Command "npx" -ErrorAction SilentlyContinue
}
if (-not $NpxCommand) {
  throw "No se encontró npx. Instala Node.js y vuelve a ejecutar el script."
}

function Invoke-PagesDeploy(
  [string]$Directory,
  [string]$ProjectName,
  [string]$WorkingDirectory
) {
  Require-Path $Directory "Carpeta de publicación"
  Require-Path $WorkingDirectory "Carpeta de trabajo"

  Write-Step "Publicando $ProjectName"
  Push-Location $WorkingDirectory
  try {
    & $NpxCommand.Source wrangler pages deploy $Directory `
      --project-name $ProjectName `
      --branch $Branch `
      --commit-dirty=true

    if ($LASTEXITCODE -ne 0) {
      throw "Falló el despliegue de $ProjectName."
    }
  }
  finally {
    Pop-Location
  }
}

function Publish-Students {
  $Source = Join-Path $RepoRoot "estudiantes-mvp"
  $Functions = Join-Path $RepoRoot "functions\api\ia.js"
  $Deploy = Join-Path $env:TEMP "titulos-pages-estudiantes"
  $Target = Join-Path $Deploy "estudiantes"

  Require-Path $Source "Aplicación de estudiantes"
  Require-Path $Functions "Pages Function de IA"

  Write-Step "Preparando estudiantes"
  Reset-Directory $Deploy
  Copy-Contents $Source $Target
  Require-Path (Join-Path $Target "estudiante.html") "Página de estudiantes"

  # Se ejecuta desde la raíz para que Wrangler incluya /functions.
  Invoke-PagesDeploy $Deploy "titulos" $RepoRoot
  Write-Host "Estudiantes: https://titulos.pages.dev/estudiantes/estudiante" -ForegroundColor Green
}

function Publish-Administrator {
  $Source = Join-Path $RepoRoot "administrador"

  Require-Path $Source "Aplicación de administrador"
  Require-Path (Join-Path $Source "index.html") "Entrada principal del administrador"
  Require-Path (Join-Path $Source "ad-index.html") "Panel del administrador"
  Require-Path (Join-Path $Source "ad-css\ad-admin.css") "CSS del administrador"

  # Se ejecuta dentro de administrador para no adjuntar Functions ajenas.
  Invoke-PagesDeploy $Source "titulos-administrador" $Source
  Write-Host "Administrador: https://titulos-administrador.pages.dev/" -ForegroundColor Green
}

function Publish-Coordinators {
  $Source = Join-Path $RepoRoot "coordinadores-mvp"
  $Deploy = Join-Path $env:TEMP "titulos-pages-coordinadores"

  Require-Path $Source "Aplicación de coordinadores"
  Require-Path (Join-Path $Source "coordinador.html") "Página de coordinadores"

  Write-Step "Preparando coordinadores"
  Reset-Directory $Deploy
  Copy-Contents $Source $Deploy
  Copy-Item `
    -LiteralPath (Join-Path $Deploy "coordinador.html") `
    -Destination (Join-Path $Deploy "index.html") `
    -Force

  Invoke-PagesDeploy $Deploy "titulos-coordinadores" $Deploy
  Write-Host "Coordinadores: https://titulos-coordinadores.pages.dev/" -ForegroundColor Green
}

switch ($Aplicacion) {
  "estudiantes" {
    Publish-Students
  }
  "administrador" {
    Publish-Administrator
  }
  "coordinadores" {
    Publish-Coordinators
  }
  "todos" {
    Publish-Students
    Publish-Administrator
    Publish-Coordinators
  }
}

Write-Host "`nPublicación completada." -ForegroundColor Green
