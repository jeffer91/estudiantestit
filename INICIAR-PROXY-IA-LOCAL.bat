@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: Node.js no esta instalado o no esta disponible en PATH.
  echo Instala Node.js 18 o superior y vuelve a intentarlo.
  echo.
  pause
  exit /b 1
)

echo.
echo Iniciando proxy IA local en http://127.0.0.1:8787/api/ia
echo Mantenga esta ventana abierta durante las pruebas con Live Server.
echo.
node dev\ia-proxy-server.mjs

if errorlevel 1 (
  echo.
  echo El proxy termino con un error.
  pause
)
