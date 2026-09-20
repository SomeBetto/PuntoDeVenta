import sys
import os
import pathlib
import webbrowser
import threading
import time
import socket

# Asegurar que los paquetes de .venv estén disponibles aunque se ejecute con Python global
BASE_DIR = pathlib.Path(__file__).resolve().parent
_venv_site = BASE_DIR / ".venv" / "Lib" / "site-packages"
if _venv_site.exists() and str(_venv_site) not in sys.path:
    sys.path.insert(0, str(_venv_site))

# Redirección de salida a archivo de log para ejecución en segundo plano (pythonw)
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = DATA_DIR / "pos_server.log"

if sys.stdout is None:
    try:
        sys.stdout = open(LOG_FILE, "a", encoding="utf-8", buffering=1)
    except Exception:
        pass

if sys.stderr is None:
    try:
        sys.stderr = open(LOG_FILE, "a", encoding="utf-8", buffering=1)
    except Exception:
        pass

if sys.platform == "win32":
    try:
        if sys.stdout is not None:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if sys.stderr is not None:
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def fix_bat_line_endings():
    try:
        for bat in BASE_DIR.glob("*.bat"):
            data = bat.read_bytes()
            normalized = data.replace(b"\r\n", b"\n").replace(b"\r", b"\n").replace(b"\n", b"\r\n")
            if normalized != data:
                bat.write_bytes(normalized)
    except Exception:
        pass

fix_bat_line_endings()

def is_server_running(port: int = 8050) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            return s.connect_ex(("127.0.0.1", port)) == 0
    except Exception:
        return False

def open_browser():
    time.sleep(1.2)
    webbrowser.open("http://localhost:8050")

def main():
    # Si el servidor ya está activo en segundo plano, sólo abrir navegador y salir
    if is_server_running(8050):
        webbrowser.open("http://localhost:8050")
        sys.exit(0)

    import uvicorn
    from app.network_info import get_server_urls

    info = get_server_urls(port=8050)
    print("\n" + "=" * 65)
    print(" [POS] PUNTO DE VENTA - TIENDA DE ABARROTES")
    print("=" * 65)
    print(f" [*] Acceso en esta Computadora:    {info['localhost_url']}")
    print(f" [*] Acceso desde Celular o Tablet: {info['network_url']}")
    if len(info.get('all_ips', [])) > 1:
        print(" [*] Otras IPs detectadas:")
        for item in info['all_ips']:
            print(f"       - {item['label']}")
    print("-" * 65)
    print(" [TIP] Si tu celular no conecta, revisa que esté en el mismo Wi-Fi")
    print("       y ejecuta 'habilitar_acceso_celular.bat' como Administrador.")
    print("=" * 65 + "\n")

    # Abrir navegador automáticamente
    threading.Thread(target=open_browser, daemon=True).start()

    # Iniciar servidor FastAPI en todas las interfaces de red local (0.0.0.0:8050)
    uvicorn.run("app.main:app", host="0.0.0.0", port=8050, reload=False, log_level="info")

if __name__ == "__main__":
    main()
