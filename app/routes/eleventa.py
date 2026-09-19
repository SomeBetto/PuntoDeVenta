"""
Rutas API para importación y sincronización de base de datos Eleventa.
"""

import sys
import subprocess
from pathlib import Path
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, BackgroundTasks, HTTPException

from tools.eleventa_importer import (
    DEFAULT_ELEVENTA_DIR,
    check_eleventa_dir,
    get_import_status,
    update_status,
    run_eleventa_migration
)

router = APIRouter(prefix="/api/eleventa", tags=["Eleventa"])

PYTHON32_PATH = Path(__file__).resolve().parent.parent.parent / "tools" / "python32" / "python.exe"
IMPORTER_SCRIPT = Path(__file__).resolve().parent.parent.parent / "tools" / "eleventa_importer.py"

class ImportRequest(BaseModel):
    eleventa_path: Optional[str] = DEFAULT_ELEVENTA_DIR
    import_sales: bool = True

@router.get("/status")
def get_status(path: Optional[str] = DEFAULT_ELEVENTA_DIR):
    """Comprueba la existencia de la base de datos de Eleventa y el estado del importador"""
    info = check_eleventa_dir(path or DEFAULT_ELEVENTA_DIR)
    job_status = get_import_status()
    return {
        "eleventa_info": info,
        "import_job": job_status
    }

def _run_importer_background(eleventa_path: str, import_sales: bool):
    """Ejecuta el importador en un subproceso con el entorno 32-bit de Firebird"""
    try:
        cmd = [str(PYTHON32_PATH), str(IMPORTER_SCRIPT), eleventa_path]
        res = subprocess.run(cmd, check=False, capture_output=True, text=True)
        if res.returncode != 0:
            print(f"[ERROR IMPORTER SUBPROCESS]: {res.stderr}")
            update_status(False, "error", f"Error en subproceso: {res.stderr[:200]}", 0, error=res.stderr)
    except Exception as e:
        print(f"[ERROR EXCEPTION SUBPROCESS]: {e}")
        update_status(False, "error", str(e), 0, error=str(e))

@router.post("/import")
def start_import(req: ImportRequest, background_tasks: BackgroundTasks):
    """Inicia la importación en segundo plano"""
    status = get_import_status()
    if status.get("running"):
        raise HTTPException(status_code=400, detail="Ya hay una importación en ejecución.")

    info = check_eleventa_dir(req.eleventa_path)
    if not info["valid"]:
        raise HTTPException(
            status_code=404, 
            detail=f"No se encontró PDVDATA.FDB o fbclient.dll en '{req.eleventa_path}'. Verifique la ruta."
        )

    # Establecer estado activo inmediatamente para que la UI no reciba el estado de una importación anterior
    update_status(True, "starting", "Iniciando importación limpia desde cero...", 1)

    background_tasks.add_task(_run_importer_background, req.eleventa_path, req.import_sales)
    return {
        "message": "Importación iniciada correctamente en segundo plano.",
        "path": req.eleventa_path
    }

