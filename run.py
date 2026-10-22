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

def start_fastapi_server(port: int = 8050):
    import uvicorn
    # Iniciar servidor FastAPI en todas las interfaces de red local (0.0.0.0:8050)
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False, log_level="warning")

def open_fallback_browser(url: str = "http://localhost:8050"):
    # Intentar Microsoft Edge en modo App (ventana independiente sin marcos ni pestañas de navegador)
    edge_candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    for edge_exe in edge_candidates:
        if os.path.exists(edge_exe):
            try:
                import subprocess
                subprocess.Popen([edge_exe, f"--app={url}", "--start-maximized"])
                return
            except Exception:
                pass
    webbrowser.open(url)

def launch_desktop_gui(url: str = "http://localhost:8050", fullscreen: bool = True):
    try:
        import webview

        class DesktopApi:
            def __init__(self, window=None):
                self._window = window

            def set_window(self, win):
                self._window = win

            def minimize(self):
                if self._window:
                    self._window.minimize()

            def toggle_fullscreen(self):
                if self._window:
                    self._window.toggle_fullscreen()

            def is_fullscreen(self):
                if self._window:
                    return bool(getattr(self._window, "fullscreen", False))
                return False

            def close(self):
                if self._window:
                    try:
                        self._window.destroy()
                    except Exception:
                        pass
                def _force_exit():
                    time.sleep(0.3)
                    os._exit(0)
                threading.Thread(target=_force_exit, daemon=True).start()

        api = DesktopApi()

        try:
            webview.localization['global.quitConfirmation'] = '¿Deseas cerrar la ventana del Punto de Venta?'
            webview.localization['global.quit'] = 'Cerrar'
            webview.localization['global.cancel'] = 'Cancelar'
        except Exception:
            pass

        window = webview.create_window(
            title="Punto de Venta - Tienda de Abarrotes",
            url=url,
            fullscreen=fullscreen,
            resizable=True,
            confirm_close=False,
            easy_drag=True,
            background_color="#1e3a8a"
        )
        api.set_window(window)
        window.expose(api.minimize, api.toggle_fullscreen, api.is_fullscreen, api.close)

        # Iniciar ciclo de eventos de la ventana de escritorio nativa (bloqueante)
        webview.start(debug=False)
        return True
    except Exception as e:
        print(f"[!] Error iniciando ventana nativa pywebview: {e}")
        open_fallback_browser(url)
        return False

def main():
    force_browser = "--browser" in sys.argv
    start_windowed = "--windowed" in sys.argv
    fullscreen = not start_windowed

    server_already_up = is_server_running(8050)

    try:
        from app.network_info import get_server_urls
        info = get_server_urls(port=8050)
        print("\n" + "=" * 65)
        print(" [POS] PUNTO DE VENTA - INTERFAZ DE ESCRITORIO")
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
    except Exception:
        pass

    if not server_already_up:
        # Iniciar servidor FastAPI en segundo plano (daemon thread)
        server_thread = threading.Thread(target=start_fastapi_server, kwargs={"port": 8050}, daemon=True)
        server_thread.start()

        # Esperar hasta que el servidor responda
        for _ in range(60):
            if is_server_running(8050):
                break
            time.sleep(0.1)

    if force_browser:
        webbrowser.open("http://localhost:8050")
        if not server_already_up:
            try:
                while True:
                    time.sleep(1)
            except (KeyboardInterrupt, SystemExit):
                pass
        sys.exit(0)

    # Iniciar la interfaz de escritorio en pantalla completa
    launch_desktop_gui(url="http://localhost:8050", fullscreen=fullscreen)
    os._exit(0)

if __name__ == "__main__":
    main()
