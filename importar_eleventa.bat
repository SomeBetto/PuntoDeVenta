@echo off
chcp 65001 > nul
title Importador de Base de Datos Eleventa - Punto de Venta
cd /d "%~dp0"

echo ============================================================
echo   IMPORTADOR DE ELEVENTA A PUNTO DE VENTA (SICAR WEB)
echo ============================================================
echo.
echo Se importara la base de datos completa de:
echo C:\Program Files (x86)\AbarrotesPDV
echo.
echo Presione cualquier tecla para iniciar la importacion...
pause > nul

tools\python32\python.exe tools\eleventa_importer.py "C:\Program Files (x86)\AbarrotesPDV"

echo.
echo ============================================================
echo   Proceso finalizado.
echo ============================================================
pause
