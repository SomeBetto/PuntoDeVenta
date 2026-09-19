@echo off
title Habilitar Acceso de Celular / Tablet en Firewall de Windows
color 0B
cd /d "%~dp0"

echo ===================================================================
echo   CONFIGURADOR DE RED PARA CELULARES - PUNTO DE VENTA
echo ===================================================================
echo.
echo Este script abrira el puerto 8050 en el Firewall de Windows para
echo que tu celular o tablet pueda conectarse mediante el codigo QR.
echo.

REM Intentar agregar regla de firewall para el puerto 8050
netsh advfirewall firewall delete rule name="PuntoDeVenta-8050" >nul 2>&1
netsh advfirewall firewall add rule name="PuntoDeVenta-8050" dir=in action=allow protocol=TCP localport=8050 profile=any >nul 2>&1

if %errorlevel% equ 0 (
    echo [EXITO] Regla agregada correctamente en el Firewall de Windows.
    echo.
    echo Ahora tu celular podra acceder a la direccion:
    echo   http://192.168.1.86:8050 (o la IP que muestre el sistema)
    echo.
    echo Asegurate de que tu celular este conectado a la misma red Wi-Fi.
    echo.
) else (
    echo [AVISO IMPORTANTE]
    echo Para aplicar este cambio, debes ejecutar este archivo como Administrador:
    echo   1. Cierra esta ventana.
    echo   2. Da CLIC DERECHO sobre este archivo "habilitar_acceso_celular.bat"
    echo   3. Selecciona "Ejecutar como administrador".
    echo.
)

pause
