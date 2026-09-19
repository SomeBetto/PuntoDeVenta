import sys
import os
import pathlib
import webbrowser
import threading
import time

# Asegurar que los paquetes de .venv estén disponibles aunque se ejecute con Python global
_venv_site = pathlib.Path(__file__).resolve().parent / ".venv" / "Lib" / "site-packages"
if _venv_site.exists() and str(_venv_site) not in sys.path:
    sys.path.insert(0, str(_venv_site))

import uvicorn
from app.network_info import get_server_urls

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def open_browser():
    time.sleep(1.2)
    webbrowser.open("http://localhost:8050")

def main():
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

    # Iniciar servidor FastAPI en todas las interfaces de red local (0.0.0.0)
    uvicorn.run("app.main:app", host="0.0.0.0", port=8050, reload=True, log_level="info")

if __name__ == "__main__":
    main()
