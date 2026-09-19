@echo off
title Punto de Venta - Tienda de Abarrotes
color 0A
cd /d "%~dp0"

echo =======================================================
echo   Iniciando Punto de Venta para Tienda de Abarrotes...
echo =======================================================

REM Verificar si existe el entorno virtual
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" run.py
) else (
    echo [AVISO] Entorno virtual no detectado. Intentando con Python del sistema...
    python run.py
)

pause
