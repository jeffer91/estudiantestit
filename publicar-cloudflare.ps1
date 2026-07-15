param(
  [string]$ProjectName = "titulos",
  [string]$Branch = "main",
  [string]$DeployDir = ""
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Require-Path([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label no existe: $Path"
  }
}

function Copy-Module([string]$Source, [string]$Destination) {
  Require-Path $Source "Módulo"

  if (Test-Path -LiteralPath $Destination) {
    Remove-Item -LiteralPath $Destination -Recurse -Force
  }

  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  Copy-Item -Path (Join-Path $Source "*") -Destination $Destination -Recurse -Force

  $NestedFunctions = Join-Path $Destination "functions"
  if (Test-Path -LiteralPath $NestedFunctions) {
    Remove-Item -LiteralPath $NestedFunctions -Recurse -Force
  }
}

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $DeployDir) {
  $DeployDir = Join-Path $RepoRoot ".deploy"
}

$DeployDir = [System.IO.Path]::GetFullPath($DeployDir)
$FunctionsDir = Join-Path $RepoRoot "functions"
$WorkerFile = Join-Path $DeployDir "_worker.js"
$RoutesFile = Join-Path $DeployDir "_routes.json"

Write-Step "Validando proyecto"
Require-Path (Join-Path $RepoRoot "estudiantes-mvp") "Carpeta estudiantes-mvp"
Require-Path (Join-Path $RepoRoot "coordinadores-mvp") "Carpeta coordinadores-mvp"
Require-Path (Join-Path $RepoRoot "administrador") "Carpeta administrador"
Require-Path (Join-Path $FunctionsDir "api\ia.js") "Pages Function IA"

$NpxCommand = Get-Command "npx.cmd" -ErrorAction SilentlyContinue
if (-not $NpxCommand) {
  $NpxCommand = Get-Command "npx" -ErrorAction SilentlyContinue
}
if (-not $NpxCommand) {
  throw "No se encontró npx. Instala Node.js y vuelve a ejecutar el script."
}

Write-Step "Preparando carpeta pública: $DeployDir"
if (Test-Path -LiteralPath $DeployDir) {
  Remove-Item -LiteralPath $DeployDir -Recurse -Force
}
New-Item -ItemType Directory -Path $DeployDir -Force | Out-Null

Copy-Module (Join-Path $RepoRoot "estudiantes-mvp") (Join-Path $DeployDir "estudiantes")
Copy-Module (Join-Path $RepoRoot "coordinadores-mvp") (Join-Path $DeployDir "coordinadores")
Copy-Module (Join-Path $RepoRoot "administrador") (Join-Path $DeployDir "administrador")

$IndexHtml = @'
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="0;url=/estudiantes/estudiante">
  <title>Titulación</title>
</head>
<body>
  <p>Abriendo el registro de títulos...</p>
  <script>location.replace('/estudiantes/estudiante');</script>
</body>
</html>
'@
Set-Content -LiteralPath (Join-Path $DeployDir "index.html") -Value $IndexHtml -Encoding UTF8

$Redirects = @'
/estudiantes/estudiante /estudiantes/estudiante.html 200
/estudiantes/config /estudiantes/config.html 200
/administrador /administrador/ad-index.html 200
/coordinadores /coordinadores/coordinador.html 200
'@
Set-Content -LiteralPath (Join-Path $DeployDir "_redirects") -Value $Redirects -Encoding UTF8

Write-Step "Compilando Pages Functions a _worker.js"
& $NpxCommand.Source wrangler pages functions build $FunctionsDir `
  --outfile $WorkerFile `
  --output-routes-path $RoutesFile

if ($LASTEXITCODE -ne 0) {
  throw "Falló la compilación de Pages Functions."
}

Require-Path $WorkerFile "Worker compilado"
Require-Path $RoutesFile "Archivo de rutas"

Write-Step "Desplegando estáticos y Worker al proyecto $ProjectName"
& $NpxCommand.Source wrangler pages deploy $DeployDir `
  --project-name $ProjectName `
  --branch $Branch `
  --commit-dirty=true

if ($LASTEXITCODE -ne 0) {
  throw "Falló el despliegue de Cloudflare Pages."
}

Write-Step "Comprobando el proxy IA"
$ProxyUrl = "https://$ProjectName.pages.dev/api/ia"
Start-Sleep -Seconds 3

try {
  $Response = Invoke-RestMethod -Uri $ProxyUrl -Method Get -TimeoutSec 30
  Write-Host ("Proxy activo: " + ($Response | ConvertTo-Json -Compress)) -ForegroundColor Green
} catch {
  Write-Warning "El despliegue terminó, pero la comprobación todavía no respondió. Espera unos segundos y abre: $ProxyUrl"
}

Write-Host "`nDespliegue completado." -ForegroundColor Green
Write-Host "Sitio: https://$ProjectName.pages.dev/estudiantes/estudiante"
Write-Host "Proxy: $ProxyUrl"
