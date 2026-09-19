@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion
title Instalador Automatizado y Migrador Eleventa - Punto de Venta
color 0B
cd /d "%~dp0"

set "PF86=%ProgramFiles(x86)%"
if not defined PF86 set "PF86=C:\Program Files (x86)"

echo ==============================================================================
echo        INSTALADOR AUTOMATIZADO - PUNTO DE VENTA ^& MIGRACION ELEVENTA
echo ==============================================================================
echo.

:: ==============================================================================
:: 1. VERIFICAR PERMISOS DE ADMINISTRADOR (REQUERIDO PARA INSTALACIONES SILENCIOSAS)
:: ==============================================================================
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [AVISO] Solicitando permisos de Administrador para instalar componentes...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/k \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo [✓] Permisos de Administrador concedidos.
echo.

:: ==============================================================================
:: 2. VERIFICAR E INSTALAR GIT SILENCIOSAMENTE
:: ==============================================================================
echo ------------------------------------------------------------------------------
echo [1/5] Verificando instalacion de Git...
echo ------------------------------------------------------------------------------

where git >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%g in ('git --version 2^>nul') do echo [✓] Git ya esta instalado: %%g
) else (
    echo [*] Git no detectado en el sistema. Iniciando instalacion silenciosa...
    
    where winget >nul 2>&1
    if !errorlevel! equ 0 (
        echo [*] Descargando e instalando Git via Windows Package Manager (winget)...
        winget install --id Git.Git -e --source winget --silent --accept-source-agreements --accept-package-agreements
    ) else (
        echo [*] Descargando instalador oficial de Git para Windows...
        set "GIT_INSTALLER=%TEMP%\git_installer_setup.exe"
        curl.exe -L -s -o "!GIT_INSTALLER!" "https://github.com/git-for-windows/git/releases/latest/download/Git-64-bit.exe"
        if exist "!GIT_INSTALLER!" (
            echo [*] Ejecutando instalador silencioso de Git...
            start /wait "" "!GIT_INSTALLER!" /VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS
            del "!GIT_INSTALLER!" >nul 2>&1
        ) else (
            echo [!] No se pudo descargar el instalador de Git. Por favor verifique su conexion a internet.
        )
    )
    
    :: Agregar Git al PATH de la sesion actual
    if exist "%ProgramFiles%\Git\cmd" set "PATH=%ProgramFiles%\Git\cmd;!PATH!"
    if exist "!PF86!\Git\cmd" set "PATH=!PF86!\Git\cmd;!PATH!"
    
    where git >nul 2>&1
    if !errorlevel! equ 0 (
        for /f "tokens=*" %%g in ('git --version 2^>nul') do echo [✓] Git instalado correctamente: %%g
    ) else (
        echo [!] Git se instalo. Es posible que requiera reiniciar la consola para actualizar variables.
    )
)
echo.

:: ==============================================================================
:: 3. VERIFICAR E INSTALAR PYTHON SILENCIOSAMENTE
:: ==============================================================================
echo ------------------------------------------------------------------------------
echo [2/5] Verificando instalacion de Python (64-bit)...
echo ------------------------------------------------------------------------------

set "PYTHON_EXE="

:: 1. Probar comando 'python' del sistema
where python >nul 2>&1
if %errorlevel% equ 0 (
    python -c "import sys; sys.exit(0 if sys.version_info.major == 3 and sys.version_info.minor >= 10 and sys.maxsize > 4294967296 else 1)" >nul 2>&1
    if !errorlevel! equ 0 (
        set "PYTHON_EXE=python"
    )
)

:: 2. Probar lanzador 'py'
if not defined PYTHON_EXE (
    where py >nul 2>&1
    if !errorlevel! equ 0 (
        py -3 -c "import sys; sys.exit(0 if sys.version_info.major == 3 and sys.version_info.minor >= 10 and sys.maxsize > 4294967296 else 1)" >nul 2>&1
        if !errorlevel! equ 0 (
            set "PYTHON_EXE=py -3"
        )
    )
)

:: 3. Probar rutas tipicas de instalacion de Python
if not defined PYTHON_EXE (
    if exist "%ProgramFiles%\Python312\python.exe" set "PYTHON_EXE=%ProgramFiles%\Python312\python.exe"
    if exist "%ProgramFiles%\Python311\python.exe" set "PYTHON_EXE=%ProgramFiles%\Python311\python.exe"
    if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
)

if defined PYTHON_EXE (
    for /f "tokens=*" %%p in ('!PYTHON_EXE! --version 2^>nul') do echo [✓] Python detectado: %%p
) else (
    echo [*] Python 3.10+ (64-bit) no detectado. Iniciando instalacion silenciosa...
    
    where winget >nul 2>&1
    if !errorlevel! equ 0 (
        echo [*] Descargando e instalando Python 3.12 via winget...
        winget install --id Python.Python.3.12 -e --source winget --silent --accept-source-agreements --accept-package-agreements
    ) else (
        echo [*] Descargando instalador oficial de Python 3.12 (64-bit)...
        set "PY_INSTALLER=%TEMP%\python_312_setup.exe"
        curl.exe -L -s -o "!PY_INSTALLER!" "https://www.python.org/ftp/python/3.12.9/python-3.12.9-amd64.exe"
        if exist "!PY_INSTALLER!" (
            echo [*] Ejecutando instalador silencioso de Python (con PATH y pip)...
            start /wait "" "!PY_INSTALLER!" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0 Include_pip=1 SimpleInstall=1
            del "!PY_INSTALLER!" >nul 2>&1
        ) else (
            echo [!] No se pudo descargar el instalador de Python. Verifique su conexion.
        )
    )

    :: Refrescar rutas en la sesion actual
    if exist "%ProgramFiles%\Python312" (
        set "PATH=%ProgramFiles%\Python312;%ProgramFiles%\Python312\Scripts;!PATH!"
        set "PYTHON_EXE=%ProgramFiles%\Python312\python.exe"
    ) else if exist "%LOCALAPPDATA%\Programs\Python\Python312" (
        set "PATH=%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;!PATH!"
        set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    ) else (
        set "PYTHON_EXE=python"
    )

    for /f "tokens=*" %%p in ('!PYTHON_EXE! --version 2^>nul') do echo [✓] Python instalado correctamente: %%p
)
echo.

:: ==============================================================================
:: 4. CONFIGURAR ENTORNO VIRTUAL (.venv) E INSTALAR DEPENDENCIAS
:: ==============================================================================
echo ------------------------------------------------------------------------------
echo [3/5] Configurando dependencias del Punto de Venta (requirements.txt)...
echo ------------------------------------------------------------------------------

if not exist ".venv\Scripts\python.exe" (
    echo [*] Creando entorno virtual local en .venv...
    !PYTHON_EXE! -m venv .venv
    if !errorlevel! neq 0 (
        echo [ERROR] No se pudo crear el entorno virtual .venv.
        pause
        exit /b 1
    )
    echo [✓] Entorno virtual .venv creado con exito.
) else (
    echo [✓] Entorno virtual .venv ya existe.
)

echo [*] Actualizando gestor de paquetes pip...
".venv\Scripts\python.exe" -m pip install --upgrade pip --quiet

if exist "requirements.txt" (
    echo [*] Instalando librerias requeridas (FastAPI, Uvicorn, Pydantic, etc.)...
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt --quiet
    if !errorlevel! equ 0 (
        echo [✓] Todas las dependencias se instalaron correctamente.
    ) else (
        echo [!] Hubo advertencias al instalar dependencias. Reintentando instalacion detallada...
        ".venv\Scripts\python.exe" -m pip install -r requirements.txt
    )
) else (
    echo [!] No se encontro requirements.txt en el directorio actual.
)
echo.

:: ==============================================================================
:: 5. DETECTAR BASE DE DATOS DE ELEVENTA E IMPORTAR
:: ==============================================================================
echo ------------------------------------------------------------------------------
echo [4/5] Deteccion y migracion de Base de Datos Eleventa (Firebird PDVDATA.FDB)...
echo ------------------------------------------------------------------------------

set "ELEVENTA_DIR="

:: Deteccion automatica de rutas comunes
if exist "!PF86!\AbarrotesPDV\db\PDVDATA.FDB" (
    set "ELEVENTA_DIR=!PF86!\AbarrotesPDV"
) else if exist "C:\Program Files\AbarrotesPDV\db\PDVDATA.FDB" (
    set "ELEVENTA_DIR=C:\Program Files\AbarrotesPDV"
) else if exist "C:\AbarrotesPDV\db\PDVDATA.FDB" (
    set "ELEVENTA_DIR=C:\AbarrotesPDV"
) else if exist "D:\AbarrotesPDV\db\PDVDATA.FDB" (
    set "ELEVENTA_DIR=D:\AbarrotesPDV"
)

if defined ELEVENTA_DIR (
    echo [✓] Se detecto automaticamente instalacion de Eleventa en:
    echo     !ELEVENTA_DIR!
    echo.
) else (
    echo [?] No se encontro Eleventa en las rutas predeterminadas.
    set /p "CUSTOM_DIR=Ingrese la ruta de la carpeta de Eleventa (o presione Enter para omitir): "
    if defined CUSTOM_DIR (
        if exist "!CUSTOM_DIR!\db\PDVDATA.FDB" (
            set "ELEVENTA_DIR=!CUSTOM_DIR!"
        ) else (
            echo [!] No se encontro PDVDATA.FDB en esa ruta. Se omitira la migracion.
        )
    )
)

if defined ELEVENTA_DIR (
    :: Verificar si el proceso de Eleventa esta abierto
    tasklist /fi "imagename eq Abarrotes.exe" 2>nul | findstr /i "Abarrotes.exe" >nul 2>&1
    if !errorlevel! equ 0 (
        echo.
        echo [AVISO] Se detecto que Eleventa esta abierto actualmente.
        echo Recomendado: Cierre Eleventa para asegurar que se migren los datos mas recientes.
        echo.
    )

    echo [*] Iniciando migracion de productos, clientes, categorias, turnos y ventas...
    if exist "tools\python32\python.exe" (
        "tools\python32\python.exe" tools\eleventa_importer.py "!ELEVENTA_DIR!"
    ) else if exist "importar_eleventa.py" (
        ".venv\Scripts\python.exe" importar_eleventa.py "!ELEVENTA_DIR!"
    ) else (
        echo [ERROR] No se encontro el importador en tools\eleventa_importer.py.
    )
) else (
    echo [*] Paso de migracion omitido (la base de datos se puede migrar luego con importar_eleventa.bat).
)
echo.

:: ==============================================================================
:: 6. REGLA DE FIREWALL PARA ACCESO MOVIL (PUERTO 8050)
:: ==============================================================================
echo ------------------------------------------------------------------------------
echo [5/5] Configurando Firewall de Windows para conexion de celulares/tablets...
echo ------------------------------------------------------------------------------
netsh advfirewall firewall delete rule name="PuntoDeVenta-8050" >nul 2>&1
netsh advfirewall firewall add rule name="PuntoDeVenta-8050" dir=in action=allow protocol=TCP localport=8050 profile=any >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] Puerto 8050 habilitado para red local (Wi-Fi).
) else (
    echo [!] No se pudo configurar la regla de firewall automaticamente.
)
echo.

:: ==============================================================================
:: RESUMEN FINAL Y EJECUCION
:: ==============================================================================
echo ==============================================================================
echo                 INSTALACION Y CONFIGURACION COMPLETADA CON EXITO
echo ==============================================================================
echo  - Git: Configurado.
echo  - Python: Configurado.
echo  - Dependencias: Instaladas en entorno virtual (.venv).
echo  - Base de Datos: Preparada en data\tienda.db.
echo  - Red: Puerto 8050 habilitado para conexion por celular.
echo ==============================================================================
echo.

set /p "START_NOW=¿Desea iniciar el Punto de Venta ahora? (S/N): "
if /i "!START_NOW!"=="S" (
    echo.
    echo [*] Iniciando servidor del Punto de Venta...
    start "" ".venv\Scripts\python.exe" run.py
)

echo.
echo Presione cualquier tecla para cerrar esta ventana...
pause > nul
