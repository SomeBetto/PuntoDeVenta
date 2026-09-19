"""
Módulo de Respaldo de Base de Datos y Cierre de Sesión.
Permite configurar la carpeta de destino y generar respaldos automáticos
con sqlite3.backup() al cerrar sesión o de manera manual.
"""

import os
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

from app.database import DB_PATH, get_db_connection

router = APIRouter(prefix="/api/backup", tags=["Respaldos"])

DEFAULT_BACKUP_DIR = Path(__file__).resolve().parent.parent.parent / "respaldos"

class BackupConfigUpdate(BaseModel):
    backup_folder: str

class BackupCreateRequest(BaseModel):
    reason: Optional[str] = "manual" # "manual" o "logout"

def get_configured_backup_folder() -> Path:
    conn = get_db_connection()
    row = conn.execute("SELECT value FROM settings WHERE key = 'backup_folder'").fetchone()
    conn.close()
    if row and row["value"].strip():
        return Path(row["value"].strip())
    return DEFAULT_BACKUP_DIR

@router.get("/config")
def get_backup_config():
    """Retorna la carpeta de respaldo configurada y la lista de respaldos existentes"""
    folder = get_configured_backup_folder()
    folder_exists = folder.exists()

    recent_backups = []
    if folder_exists:
        try:
            for item in folder.glob("*.db"):
                if item.is_file():
                    stat = item.stat()
                    recent_backups.append({
                        "name": item.name,
                        "path": str(item.resolve()),
                        "size_mb": round(stat.st_size / (1024 * 1024), 2),
                        "created_at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
                    })
            recent_backups.sort(key=lambda x: x["created_at"], reverse=True)
        except Exception as e:
            print(f"Error listando respaldos: {e}")

    return {
        "backup_folder": str(folder),
        "folder_exists": folder_exists,
        "default_folder": str(DEFAULT_BACKUP_DIR),
        "recent_backups": recent_backups[:10]
    }

@router.post("/config")
def update_backup_config(data: BackupConfigUpdate):
    """Guarda la ruta de la carpeta donde se realizarán los respaldos"""
    path_str = data.backup_folder.strip()
    if not path_str:
        raise HTTPException(status_code=400, detail="La ruta de la carpeta no puede estar vacía.")

    target_dir = Path(path_str)
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo acceder o crear la carpeta: {str(e)}")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO settings (key, value) VALUES ('backup_folder', ?)
        ON CONFLICT(key) DO UPDATE SET value = ?
    """, (str(target_dir.resolve()), str(target_dir.resolve())))
    conn.commit()
    conn.close()

    return {
        "message": "Carpeta de respaldos configurada correctamente.",
        "backup_folder": str(target_dir.resolve())
    }

@router.post("/create")
def create_backup(req: BackupCreateRequest = BackupCreateRequest()):
    """Crea una copia de seguridad en caliente usando la API nativa de respaldo de SQLite"""
    target_dir = get_configured_backup_folder()
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo crear la carpeta de respaldos: {str(e)}")

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    prefix = "respaldo_cierre_sesion" if req.reason == "logout" else "respaldo_tienda"
    filename = f"{prefix}_{timestamp}.db"
    dest_path = target_dir / filename

    try:
        # SQLite Online Backup API: Garantiza consistencia atómica y sin bloqueos
        src_conn = sqlite3.connect(DB_PATH)
        dst_conn = sqlite3.connect(dest_path)
        src_conn.backup(dst_conn)
        dst_conn.close()
        src_conn.close()

        file_size_mb = round(dest_path.stat().st_size / (1024 * 1024), 2)

        # Registrar metadatos en settings
        conn = get_db_connection()
        conn.execute("""
            INSERT INTO settings (key, value) VALUES ('last_backup_file', ?)
            ON CONFLICT(key) DO UPDATE SET value = ?
        """, (filename, filename))
        conn.execute("""
            INSERT INTO settings (key, value) VALUES ('last_backup_time', ?)
            ON CONFLICT(key) DO UPDATE SET value = ?
        """, (timestamp, timestamp))
        conn.commit()
        conn.close()

        return {
            "success": True,
            "filename": filename,
            "folder": str(target_dir),
            "full_path": str(dest_path.resolve()),
            "size_mb": file_size_mb,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "reason": req.reason,
            "message": f"Respaldo creado exitosamente ({file_size_mb} MB) en {filename}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creando respaldo de base de datos: {str(e)}")

@router.post("/optimize")
def optimize_database():
    """Ejecuta PRAGMA optimize y VACUUM para desfragmentar la BD y acelerar consultas"""
    import time
    t0 = time.time()
    db_file = Path(DB_PATH)
    if not db_file.exists():
        raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")

    size_before_mb = round(db_file.stat().st_size / (1024 * 1024), 2)
    try:
        conn = sqlite3.connect(DB_PATH, timeout=30.0)
        conn.execute("PRAGMA optimize;")
        conn.execute("VACUUM;")
        conn.close()

        size_after_mb = round(db_file.stat().st_size / (1024 * 1024), 2)
        saved_mb = round(max(0.0, size_before_mb - size_after_mb), 2)
        elapsed = round(time.time() - t0, 2)

        return {
            "success": True,
            "size_before_mb": size_before_mb,
            "size_after_mb": size_after_mb,
            "saved_mb": saved_mb,
            "elapsed_seconds": elapsed,
            "message": f"Base de datos optimizada en {elapsed}s. Tamaño: {size_after_mb} MB (Ahorro: {saved_mb} MB)"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al optimizar base de datos: {str(e)}")

