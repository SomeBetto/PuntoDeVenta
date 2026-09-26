@echo off
chcp 65001 > nul
title Punto de Venta - Tienda de Abarrotes
cd /d "%~dp0"

echo ========================================================
echo   PUNTO DE VENTA - TIENDA DE ABARROTES
echo ========================================================
echo.

if not exist ".git" goto START_SERVER
where git >nul 2>&1
if errorlevel 1 goto START_SERVER

echo [*] Comprobando actualizaciones del repositorio Git...
git fetch origin main >nul 2>&1
if errorlevel 1 goto NO_REMOTE

set "LOCAL_REV="
set "REMOTE_REV="
for /f %%a in ('git rev-parse HEAD') do set "LOCAL_REV=%%a"
for /f %%b in ('git rev-parse origin/main') do set "REMOTE_REV=%%b"

if not defined LOCAL_REV goto START_SERVER
if not defined REMOTE_REV goto START_SERVER

if "%LOCAL_REV%"=="%REMOTE_REV%" (
    echo [OK] El sistema local se encuentra en la version mas reciente.
    goto START_SERVER
)

echo [*] Nuevos cambios detectados en el repositorio remoto.
echo [*] Actualizando repositorio local (git pull)...
git pull --autostash origin main
echo [OK] Repositorio actualizado exitosamente.
goto START_SERVER

:NO_REMOTE
echo [i] Sin conexion remota a Git o trabajando fuera de linea.

:START_SERVER
echo.
echo [*] Iniciando servidor del Punto de Venta...
if exist ".venv\Scripts\pythonw.exe" (
    start "" ".venv\Scripts\pythonw.exe" run.py
) else (
    start "" pythonw run.py
)

ping -n 3 127.0.0.1 >nul
exit
