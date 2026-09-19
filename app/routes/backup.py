import os
import re
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from app.database import DB_PATH, get_db_connection

router = APIRouter(prefix="/api/backup", tags=["Respaldos"])

DEFAULT_BACKUP_DIR = Path(__file__).resolve().parent.parent.parent / "respaldos"

class BackupConfigUpdate(BaseModel):
    backup_folder: str

class BackupCreateRequest(BaseModel):
    reason: Optional[str] = "manual" # "manual" o "logout"

class BackupRestoreRequest(BaseModel):
    filename: str

def get_configured_backup_folder() -> Path:
    conn = get_db_connection()
    row = conn.execute("SELECT value FROM settings WHERE key = 'backup_folder'").fetchone()
    conn.close()
    if row and row["value"].strip():
        return Path(row["value"].strip())
    return DEFAULT_BACKUP_DIR

def sanitize_filename(filename: str) -> str:
    """Extrae únicamente el nombre base del archivo para evitar path traversal"""
    clean_name = Path(filename).name
    # Permitir solo caracteres alfanuméricos, guiones, puntos y guiones bajos
    clean_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', clean_name)
    return clean_name

def verify_sqlite_backup(file_path: Path):
    """Verifica que el archivo sea una base de datos SQLite válida e íntegra del sistema"""
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="El archivo de respaldo no existe.")
    
    if file_path.stat().st_size == 0:
        raise HTTPException(status_code=400, detail="El archivo de respaldo está vacío (0 bytes).")

    try:
        test_conn = sqlite3.connect(file_path)
        cur = test_conn.cursor()
        cur.execute("PRAGMA integrity_check;")
        res = cur.fetchone()
        if not res or res[0].lower() != "ok":
            test_conn.close()
            raise HTTPException(status_code=400, detail=f"Error de integridad en el archivo: {res[0] if res else 'Corrupto'}")

        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('products', 'sales', 'settings', 'categories');")
        matched_tables = [r[0] for r in cur.fetchall()]
        test_conn.close()

        if not matched_tables:
            raise HTTPException(
                status_code=400,
                detail="El archivo no contiene tablas válidas del sistema de Punto de Venta (products, sales, settings)."
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo leer el archivo SQLite: {str(e)}")

def get_db_summary(db_file: Path) -> dict:
    """Obtiene conteos clave de la base de datos para informar al usuario"""
    try:
        conn = sqlite3.connect(db_file)
        cur = conn.cursor()
        def count_table(name):
            try:
                cur.execute(f"SELECT COUNT(*) FROM {name}")
                row = cur.fetchone()
                return row[0] if row else 0
            except Exception:
                return 0

        counts = {
            "products": count_table("products"),
            "customers": count_table("customers"),
            "sales": count_table("sales"),
            "categories": count_table("categories")
        }
        conn.close()
        return counts
    except Exception:
        return {"products": 0, "customers": 0, "sales": 0, "categories": 0}

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
        "recent_backups": recent_backups[:30]
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

@router.post("/restore")
def restore_backup(req: BackupRestoreRequest):
    """
    Restaura la base de datos activa desde uno de los respaldos existentes.
    Por seguridad total del usuario, crea automáticamente una copia de seguridad
    previa antes de sobreescribir la base de datos activa.
    """
    clean_filename = sanitize_filename(req.filename)
    if not clean_filename.lower().endswith(".db"):
        raise HTTPException(status_code=400, detail="El archivo a restaurar debe tener extensión .db")

    target_dir = get_configured_backup_folder()
    backup_file = target_dir / clean_filename

    # 1. Verificar existencia y validez del archivo de respaldo
    verify_sqlite_backup(backup_file)

    # 2. Crear respaldo de seguridad automático del estado actual antes de restaurar
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    safety_filename = f"respaldo_seguridad_previo_restaurar_{timestamp}.db"
    safety_path = target_dir / safety_filename

    try:
        if Path(DB_PATH).exists():
            curr_src = sqlite3.connect(DB_PATH)
            safety_dst = sqlite3.connect(safety_path)
            curr_src.backup(safety_dst)
            safety_dst.close()
            curr_src.close()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo crear el respaldo de seguridad previo: {str(e)}. Restauración cancelada por protección de datos."
        )

    # 3. Proceder con la restauración atómica usando sqlite3.backup()
    try:
        src_backup = sqlite3.connect(backup_file)
        dest_live = sqlite3.connect(DB_PATH)
        src_backup.backup(dest_live)
        dest_live.close()
        src_backup.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error crítico durante la restauración: {str(e)}")

    # 4. Obtener estadísticas de la base de datos restaurada
    counts = get_db_summary(DB_PATH)
    file_size_mb = round(backup_file.stat().st_size / (1024 * 1024), 2)

    return {
        "success": True,
        "filename": clean_filename,
        "safety_backup": safety_filename,
        "size_mb": file_size_mb,
        "counts": counts,
        "message": f"Respaldo '{clean_filename}' cargado exitosamente. Se guardó respaldo de seguridad previo: '{safety_filename}'."
    }

@router.post("/upload-restore")
async def upload_and_restore(file: UploadFile = File(...)):
    """
    Permite subir un archivo .db desde la computadora y cargarlo directamente,
    guardándolo en la carpeta de respaldos y creando respaldo de seguridad previo.
    """
    if not file.filename.lower().endswith(".db"):
        raise HTTPException(status_code=400, detail="El archivo subido debe tener extensión .db")

    target_dir = get_configured_backup_folder()
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error accediendo a carpeta de respaldos: {str(e)}")

    safe_original = sanitize_filename(file.filename)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    saved_filename = f"respaldo_subido_{timestamp}_{safe_original}"
    dest_path = target_dir / saved_filename

    # Guardar contenido subido
    try:
        content = await file.read()
        with open(dest_path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error guardando el archivo subido: {str(e)}")

    # Validar y restaurar usando la función de restauración
    try:
        return restore_backup(BackupRestoreRequest(filename=saved_filename))
    except Exception as e:
        # Si falló, intentar borrar el archivo temporal subido
        if dest_path.exists():
            try:
                dest_path.unlink()
            except Exception:
                pass
        raise e

@router.get("/download/{filename}")
def download_backup(filename: str):
    """Permite descargar un archivo de respaldo específico al navegador"""
    clean_filename = sanitize_filename(filename)
    target_dir = get_configured_backup_folder()
    backup_file = target_dir / clean_filename

    if not backup_file.exists() or not backup_file.is_file():
        raise HTTPException(status_code=404, detail="Archivo de respaldo no encontrado.")

    return FileResponse(
        path=backup_file,
        filename=clean_filename,
        media_type="application/x-sqlite3"
    )

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

