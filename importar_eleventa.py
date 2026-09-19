"""
Script de importación directa de base de datos Eleventa.
Uso:
    python importar_eleventa.py
o con ruta personalizada:
    python importar_eleventa.py "C:\\Ruta\\AbarrotesPDV"
"""

import sys
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PYTHON32 = BASE_DIR / "tools" / "python32" / "python.exe"
IMPORTER = BASE_DIR / "tools" / "eleventa_importer.py"

if not PYTHON32.exists():
    print(f"Error: No se encontró el intérprete 32-bit en {PYTHON32}")
    sys.exit(1)

path_arg = sys.argv[1] if len(sys.argv) > 1 else r"C:\Program Files (x86)\AbarrotesPDV"

print("=" * 65)
print("📥 IMPORTADOR DE BASE DE DATOS ELEVENTA (ABARROTES PUNTO DE VENTA)")
print(f"Ruta objetivo: {path_arg}")
print("=" * 65)

cmd = [str(PYTHON32), str(IMPORTER), path_arg]
result = subprocess.run(cmd)
sys.exit(result.returncode)
