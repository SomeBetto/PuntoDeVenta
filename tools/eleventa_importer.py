"""
Módulo de Importación de Base de Datos Eleventa (Abarrotes Punto de Venta)
Soporta migración de Firebird (PDVDATA.FDB) a SQLite (tienda.db):
 - Categorías / Departamentos
 - Clientes y cuentas de crédito / fiados
 - Catálogo de productos e inventarios
 - Turnos y movimientos de caja
 - Historial completo de ventas (tickets y detalles)
"""

import os
import sys
import time
import json
import shutil
import sqlite3
from pathlib import Path
from datetime import datetime

# Configurar salida UTF-8 en consola
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Rutas estándar
DEFAULT_ELEVENTA_DIR = r"C:\Program Files (x86)\AbarrotesPDV"
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
SQLITE_DB_PATH = DATA_DIR / "tienda.db"
STATUS_FILE = DATA_DIR / "eleventa_import_status.json"
TEMP_FDB_PATH = DATA_DIR / "temp_eleventa.fdb"

def update_status(running: bool, stage: str, message: str, progress: int, stats: dict = None, error: str = None):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "running": running,
        "stage": stage,
        "message": message,
        "progress": progress,
        "stats": stats or {},
        "error": error,
        "updated_at": datetime.now().isoformat()
    }
    try:
        with open(STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error escribiendo status: {e}")

def get_import_status():
    if not STATUS_FILE.exists():
        return {"running": False, "stage": "idle", "message": "Sin importaciones recientes", "progress": 0, "stats": {}}
    try:
        with open(STATUS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"running": False, "stage": "idle", "message": "Sin importaciones recientes", "progress": 0, "stats": {}}

def decode_val(v):
    if v is None:
        return None
    if isinstance(v, bytes):
        return v.decode("latin1", errors="replace").strip()
    if isinstance(v, str):
        return v.strip()
    return v

def clean_barcode_str(code):
    if not code:
        return ""
    code = code.strip()
    # EAN-13 con prefijo 'E'
    if code.startswith("E") and len(code) == 14 and code[1:].isdigit():
        return code[1:]
    # UPC-A con prefijo 'B'
    if code.startswith("B") and len(code) == 13 and code[1:].isdigit():
        return code[1:]
    # EAN-8 con prefijo 'D'
    if code.startswith("D") and len(code) == 9 and code[1:].isdigit():
        return code[1:]
    return code

def assign_category_icon(name):
    lower = name.lower()
    if any(k in lower for k in ["bebida", "refresco", "jugo", "agua", "cerveza"]): return "🥤"
    if any(k in lower for k in ["sabrita", "fritura", "botana", "papas", "churro"]): return "🥨"
    if any(k in lower for k in ["lacteo", "leche", "crema", "queso", "embutido", "jamon", "salchicha"]): return "🧀"
    if any(k in lower for k in ["granel", "semilla", "frijol", "arroz", "azucar", "huevo"]): return "🌾"
    if any(k in lower for k in ["pan", "galleta", "dulce", "pastel", "tortilla"]): return "🍞"
    if any(k in lower for k in ["fruta", "verdura", "jitomate", "cebolla", "limon"]): return "🍎"
    if any(k in lower for k in ["limpieza", "jabon", "detergente", "cloro", "hogar"]): return "🧼"
    if any(k in lower for k in ["farmacia", "medicina", "cuidado"]): return "💊"
    if any(k in lower for k in ["cigarro", "tabaco"]): return "🚬"
    return "📦"

def check_eleventa_dir(eleventa_dir: str = DEFAULT_ELEVENTA_DIR):
    """Verifica si la instalación de Eleventa y la base de datos existen"""
    dir_path = Path(eleventa_dir)
    fdb_path = dir_path / "db" / "PDVDATA.FDB"
    dll_path = dir_path / "fbclient.dll"
    ini_path = dir_path / "pdventa.ini"

    exists = fdb_path.exists() and dll_path.exists()
    size_mb = round(fdb_path.stat().st_size / (1024 * 1024), 2) if fdb_path.exists() else 0

    return {
        "valid": exists,
        "dir": str(dir_path),
        "fdb_path": str(fdb_path),
        "fdb_exists": fdb_path.exists(),
        "fdb_size_mb": size_mb,
        "dll_exists": dll_path.exists(),
        "ini_exists": ini_path.exists(),
    }

def run_eleventa_migration(eleventa_dir: str = DEFAULT_ELEVENTA_DIR, import_sales: bool = True):
    """Ejecuta la migración completa desde Eleventa a SQLite"""
    t_start = time.time()
    stats = {
        "categories": 0,
        "customers": 0,
        "products": 0,
        "cash_shifts": 0,
        "cash_movements": 0,
        "sales": 0,
        "sale_items": 0
    }

    try:
        update_status(True, "init", "Iniciando verificación de Eleventa...", 2, stats)
        
        info = check_eleventa_dir(eleventa_dir)
        if not info["valid"]:
            raise Exception(f"No se encontró la base de datos PDVDATA.FDB o fbclient.dll en {eleventa_dir}")

        fdb_source = Path(info["fdb_path"])
        fbclient_dll = Path(info["dir"]) / "fbclient.dll"

        # 1. Copia segura a temporal para no tener conflictos de bloqueo
        update_status(True, "copying", f"Creando copia segura de la base de datos ({info['fdb_size_mb']} MB)...", 5, stats)
        print(f"[1/8] Copiando base de datos a temporal: {TEMP_FDB_PATH}")
        with open(fdb_source, "rb") as fsrc, open(TEMP_FDB_PATH, "wb") as fdst:
            while True:
                buf = fsrc.read(16 * 1024 * 1024)
                if not buf:
                    break
                fdst.write(buf)

        # 2. Conectar a Firebird
        update_status(True, "connecting", "Conectando al motor Firebird de Eleventa...", 10, stats)
        print("[2/8] Conectando a Firebird...")
        import fdb
        fdb.load_api(str(fbclient_dll))
        fb_conn = fdb.connect(
            dsn=str(TEMP_FDB_PATH.resolve()),
            user="SYSDBA",
            password="masterkey",
            charset="NONE"
        )
        fb_cur = fb_conn.cursor()

        # 3. Conectar a SQLite de la tienda
        print(f"[3/8] Preparando SQLite: {SQLITE_DB_PATH}")
        sqlite_conn = sqlite3.connect(SQLITE_DB_PATH)
        sqlite_conn.execute("PRAGMA foreign_keys = OFF;")
        sqlite_conn.execute("PRAGMA synchronous = OFF;")
        sqlite_conn.execute("PRAGMA journal_mode = MEMORY;")
        sqlite_conn.execute("PRAGMA cache_size = 100000;")
        sql_cur = sqlite_conn.cursor()

        # 3b. LIMPIEZA TOTAL: borrar todos los datos para importar desde cero
        update_status(True, "clearing", "Limpiando base de datos para importación desde cero...", 8, stats)
        print("[3b/8] Limpiando tablas para importacion limpia...")
        tablas_a_limpiar = [
            "sale_items",
            "sales",
            "cash_movements",
            "cash_shifts",
            "customer_transactions",
            "customers",
            "products",
            "categories",
            "purchase_items",
            "purchases"
        ]
        for tabla in tablas_a_limpiar:
            try:
                sql_cur.execute(f"DELETE FROM {tabla}")
                print(f"  Limpiada tabla: {tabla}")
            except Exception as e:
                print(f"  Aviso limpiando {tabla}: {e}")
        # Reiniciar secuencias autoincrement
        try:
            sql_cur.execute("DELETE FROM sqlite_sequence WHERE name IN ('sales','sale_items','cash_movements','cash_shifts','customer_transactions','customers','products','categories','purchases','purchase_items')")
        except Exception:
            pass
        sqlite_conn.commit()
        print("[3b/8] Limpieza completada.")


        # 4. Migrar Configuración de Negocio
        ini_file = Path(info["dir"]) / "pdventa.ini"
        if ini_file.exists():
            import configparser
            config = configparser.ConfigParser(interpolation=None)
            try:
                config.read(str(ini_file), encoding="latin1")
                if "Impresion" in config:
                    titulo = config["Impresion"].get("Titulo", "").strip('"')
                    linea1 = config["Impresion"].get("Linea1", "").strip('"')
                    inicio1 = config["Impresion"].get("Inicio1", "").strip('"')
                    inicio2 = config["Impresion"].get("Inicio2", "").strip('"')
                    if titulo: sql_cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('store_name', ?)", (titulo,))
                    if inicio1: sql_cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('store_address', ?)", (inicio1,))
                    if inicio2: sql_cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('store_phone', ?)", (inicio2,))
                    if linea1: sql_cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('ticket_footer', ?)", (linea1,))
            except Exception as e:
                print(f"Aviso al leer pdventa.ini: {e}")

        # 5. Migrar Departamentos -> Categorías
        update_status(True, "categories", "Importando departamentos / categorías...", 15, stats)
        print("[4/8] Importando Departamentos...")
        fb_cur.execute("SELECT ID, NOMBRE FROM DEPARTAMENTOS")
        cat_rows = fb_cur.fetchall()
        for cid, cname in cat_rows:
            name_str = decode_val(cname) or f"Categoría {cid}"
            icon = assign_category_icon(name_str)
            sql_cur.execute("""
                INSERT OR REPLACE INTO categories (id, name, icon)
                VALUES (?, ?, ?)
            """, (cid, name_str, icon))
            stats["categories"] += 1
        sqlite_conn.commit()

        # 6. Migrar Clientes y Créditos (CLIENTESV2 & CLIENTESV2_CREDITO)
        update_status(True, "customers", "Importando clientes y cuentas de crédito / fiados...", 20, stats)
        print("[5/8] Importando Clientes...")
        fb_cur.execute("""
            SELECT 
                c.ID, c.NOMBRES, c.APELLIDOS, c.TELEFONO, c.DOMICILIO1, c.COLONIA, c.NOTAS,
                cr.LIMITE_CREDITO, cr.SALDO_ACTUAL
            FROM CLIENTESV2 c
            LEFT JOIN CLIENTESV2_CREDITO cr ON c.ID = cr.CLIENTESV2_ID
        """)
        cust_rows = fb_cur.fetchall()
        for row in cust_rows:
            cid = row[0]
            nombres = decode_val(row[1]) or ""
            apellidos = decode_val(row[2]) or ""
            full_name = f"{nombres} {apellidos}".strip() or f"Cliente #{cid}"
            tel = decode_val(row[3]) or ""
            dom = decode_val(row[4]) or ""
            col = decode_val(row[5]) or ""
            addr = f"{dom} {col}".strip()
            notes = decode_val(row[6]) or ""
            lim = float(row[7]) if row[7] is not None else 1500.0
            saldo_eleventa = round(float(row[8]) if row[8] is not None else 0.0, 2)

            # En una importación limpia desde cero, el saldo es exactamente el de Eleventa
            current = saldo_eleventa

            sql_cur.execute("""
                INSERT OR REPLACE INTO customers (id, name, phone, address, credit_limit, current_balance, eleventa_initial_balance, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (cid, full_name, tel, addr, lim, current, saldo_eleventa, notes))

            # Si el cliente tiene deuda en Eleventa, registrar movimiento inicial para historial de fiados
            if saldo_eleventa > 0:
                sql_cur.execute("""
                    INSERT INTO customer_transactions (customer_id, type, amount, notes, created_at)
                    VALUES (?, 'CARGO', ?, 'Saldo pendiente importado de Eleventa', datetime('now'))
                """, (cid, saldo_eleventa))

            stats["customers"] += 1
        sqlite_conn.commit()


        # 7. Migrar Productos e Inventario
        update_status(True, "products", "Importando catálogo de productos y existencias...", 30, stats)
        print("[6/8] Importando Productos...")
        fb_cur.execute("""
            SELECT 
                ID, CODIGO, DESCRIPCION, TVENTA, PCOSTO, PVENTA, PFINAL, DEPT, 
                DINVENTARIO, DINVMINIMO, ELIMINADO_EN
            FROM PRODUCTOS
        """)
        prod_rows = fb_cur.fetchall()
        
        # Mantener registro de códigos limpios para evitar duplicados
        seen_barcodes = set()
        for r in prod_rows:
            pid = r[0]
            raw_code = decode_val(r[1]) or f"GEN-{pid}"
            clean_code = clean_barcode_str(raw_code)
            
            # Si el código limpio colisiona con otro existente, usar el raw_code
            if clean_code in seen_barcodes:
                final_barcode = raw_code
            else:
                final_barcode = clean_code
            seen_barcodes.add(final_barcode)

            desc = decode_val(r[2]) or "Producto sin descripción"
            tventa = decode_val(r[3]) or "U"
            cost = float(r[4]) if r[4] is not None else 0.0
            sale_price = float(r[6]) if r[6] is not None else (float(r[5]) if r[5] is not None else 0.0)
            cat_id = r[7] if r[7] is not None else None
            stock = float(r[8]) if r[8] is not None else 0.0
            min_stock = float(r[9]) if r[9] is not None else 5.0
            is_active = 0 if r[10] is not None else 1
            unit = "kg" if tventa == "D" else "pz"
            allow_fractions = 1 if tventa == "D" else 0

            sql_cur.execute("""
                INSERT OR REPLACE INTO products 
                (id, barcode, name, description, category_id, cost_price, sale_price, stock, min_stock, unit, allow_fractions, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (pid, final_barcode, desc, "", cat_id, cost, sale_price, stock, min_stock, unit, allow_fractions, is_active))
            stats["products"] += 1
        sqlite_conn.commit()

        # 8. Migrar Turnos de Caja (Cortes)
        update_status(True, "shifts", "Importando turnos y movimientos de caja...", 45, stats)
        print("[7/8] Importando Turnos de Caja...")
        fb_cur.execute("""
            SELECT ID, ID_CAJERO, INICIO_EN, TERMINO_EN, DINERO_INICIAL, EFECTIVO_AL_CIERRE, ACUMULADO_VENTAS
            FROM TURNOS
        """)
        for s in fb_cur.fetchall():
            sid = s[0]
            cajero = f"Cajero #{s[1]}" if s[1] else "Cajero"
            inicio = str(s[2]) if s[2] else None
            termino = str(s[3]) if s[3] else None
            din_ini = float(s[4]) if s[4] is not None else 0.0
            efec_fin = float(s[5]) if s[5] is not None else 0.0
            ventas = float(s[6]) if s[6] is not None else 0.0
            status_shift = "CLOSED" if termino else "OPEN"

            sql_cur.execute("""
                INSERT OR REPLACE INTO cash_shifts
                (id, cashier_name, initial_cash, final_cash_expected, final_cash_real, status, opened_at, closed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (sid, cajero, din_ini, din_ini + ventas, efec_fin, status_shift, inicio, termino))
            stats["cash_shifts"] += 1
        sqlite_conn.commit()

        # Migrar Movimientos de Caja
        fb_cur.execute("SELECT ID, CUANDO_FUE, MONTO, DESCRIPCION, TIPO, ID_TURNO FROM CORTE_MOVIMIENTOS")
        for m in fb_cur.fetchall():
            mid, cuando, monto, desc, tipo_str, turno_id = m
            monto_flt = float(monto) if monto is not None else 0.0
            tipo_mov = "INGRESO" if str(tipo_str).lower() == "entrada" else "EGRESO"
            desc_str = decode_val(desc) or "Movimiento de caja"
            f_cuando = str(cuando) if cuando else None

            sql_cur.execute("""
                INSERT OR REPLACE INTO cash_movements (id, shift_id, type, amount, concept, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (mid, turno_id or 1, tipo_mov, monto_flt, desc_str, f_cuando))
            stats["cash_movements"] += 1
        sqlite_conn.commit()

        # 9. Migrar Historial de Ventas (Tickets y Detalles)
        if import_sales:
            print("[8/8] Importando Historial de Ventas (700k+ tickets)...")
            update_status(True, "sales", "Iniciando importación de tickets de venta...", 50, stats)

            # Obtener conteo total para barra de progreso
            fb_cur.execute("SELECT COUNT(*) FROM VENTATICKETS")
            total_tickets = fb_cur.fetchone()[0]

            fb_cur.execute("""
                SELECT 
                    ID, TURNO_ID, CLIENTESV2_ID, TOTAL, PAGO_CON, FORMA_PAGO, ESTA_CANCELADO, PAGADO_EN, CREADO_EN
                FROM VENTATICKETS
            """)

            batch_sales = []
            ticket_count = 0
            while True:
                rows = fb_cur.fetchmany(10000)
                if not rows:
                    break
                for r in rows:
                    tid = r[0]
                    turno = r[1]
                    cid = r[2]
                    total = float(r[3]) if r[3] is not None else 0.0
                    pago = float(r[4]) if r[4] is not None else total
                    fp = decode_val(r[5]) or "e"
                    metodo = "EFECTIVO"
                    if fp.startswith("t"): metodo = "TARJETA"
                    elif fp.startswith("c"): metodo = "FIADO"
                    elif "trans" in fp.lower(): metodo = "TRANSFERENCIA"
                    
                    is_canc = (r[6] == "t")
                    st = "CANCELADA" if is_canc else "COMPLETADA"
                    fecha = str(r[7]) if r[7] else (str(r[8]) if r[8] else datetime.now().isoformat())
                    cambio = max(0.0, round(pago - total, 2))

                    batch_sales.append((tid, turno, cid, total, pago, cambio, metodo, st, "", fecha))

                sql_cur.executemany("""
                    INSERT OR REPLACE INTO sales 
                    (id, shift_id, customer_id, total, amount_paid, change_given, payment_method, status, notes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, batch_sales)
                ticket_count += len(batch_sales)
                batch_sales.clear()

                progress_pct = 50 + int((ticket_count / total_tickets) * 25) # 50% -> 75%
                stats["sales"] = ticket_count
                update_status(True, "sales", f"Importando tickets de venta ({ticket_count:,} / {total_tickets:,})...", progress_pct, stats)
                if ticket_count % 50000 == 0:
                    sqlite_conn.commit()
                    print(f"   -> {ticket_count:,} tickets importados...")

            sqlite_conn.commit()

            # Importar Detalles de Tickets (VENTATICKETS_ARTICULOS)
            update_status(True, "sale_items", "Importando partidas y detalles de ventas (1.5M artículos)...", 75, stats)
            fb_cur.execute("SELECT COUNT(*) FROM VENTATICKETS_ARTICULOS")
            total_items = fb_cur.fetchone()[0]

            fb_cur.execute("""
                SELECT ID, TICKET_ID, PRODUCTO_NOMBRE, CANTIDAD, PRECIO_USADO, GANANCIA
                FROM VENTATICKETS_ARTICULOS
            """)

            batch_items = []
            item_count = 0
            while True:
                rows = fb_cur.fetchmany(15000)
                if not rows:
                    break
                for r in rows:
                    iid, tid, pnombre, cant, precio, ganancia = r
                    pname = decode_val(pnombre) or "Artículo"
                    c_cant = float(cant) if cant is not None else 1.0
                    u_price = float(precio) if precio is not None else 0.0
                    profit = float(ganancia) if ganancia is not None else 0.0
                    cost = max(0.0, round(u_price - profit, 2))
                    subtot = round(c_cant * u_price, 2)

                    batch_items.append((iid, tid, None, pname, c_cant, "pz", u_price, cost, subtot))

                sql_cur.executemany("""
                    INSERT OR REPLACE INTO sale_items
                    (id, sale_id, product_id, product_name, quantity, unit, unit_price, cost_price, subtotal)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, batch_items)
                item_count += len(batch_items)
                batch_items.clear()

                progress_pct = 75 + int((item_count / total_items) * 20) # 75% -> 95%
                stats["sale_items"] = item_count
                update_status(True, "sale_items", f"Importando artículos de ventas ({item_count:,} / {total_items:,})...", progress_pct, stats)
                if item_count % 100000 == 0:
                    sqlite_conn.commit()
                    print(f"   -> {item_count:,} artículos importados...")

            sqlite_conn.commit()

        # 10. Recrear índices para consultas ultra veloces
        update_status(True, "indexing", "Optimizando índices y base de datos...", 96, stats)
        print("Creando índices de alta velocidad...")
        sql_cur.execute("CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);")
        sql_cur.execute("CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales(shift_id);")
        sql_cur.execute("CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);")
        sql_cur.execute("CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);")
        sql_cur.execute("CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);")
        sql_cur.execute("CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);")
        sqlite_conn.commit()

        # Restaurar PRAGMAS
        sqlite_conn.execute("PRAGMA foreign_keys = ON;")
        sqlite_conn.execute("PRAGMA synchronous = NORMAL;")
        sqlite_conn.execute("PRAGMA journal_mode = WAL;")

        # Cerrar conexiones
        fb_conn.close()
        sqlite_conn.close()

        # Limpiar archivo temporal FDB
        if TEMP_FDB_PATH.exists():
            try:
                os.remove(TEMP_FDB_PATH)
            except Exception:
                pass

        elapsed = time.time() - t_start
        msg = f"¡Importación completada con éxito en {elapsed:.1f}s! ({stats['products']:,} productos, {stats['customers']:,} clientes, {stats['sales']:,} ventas)."
        print(f"\n============================================================")
        print(msg)
        print(f"============================================================\n")
        update_status(False, "completed", msg, 100, stats)
        try:
            (DATA_DIR / ".eleventa_migrado").write_text(f"Migrado: {datetime.now().isoformat()}\nProductos: {stats.get('products')}\nVentas: {stats.get('sales')}", encoding="utf-8")
        except Exception:
            pass
        return {"success": True, "elapsed_seconds": round(elapsed, 1), "stats": stats}

    except Exception as e:
        err_msg = str(e)
        print(f"\n[ERROR EN IMPORTACIÓN]: {err_msg}")
        update_status(False, "error", f"Error durante la importación: {err_msg}", 0, stats, error=err_msg)
        if TEMP_FDB_PATH.exists():
            try:
                os.remove(TEMP_FDB_PATH)
            except Exception:
                pass
        return {"success": False, "error": err_msg, "stats": stats}

if __name__ == "__main__":
    eleventa_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_ELEVENTA_DIR
    res = run_eleventa_migration(eleventa_path, import_sales=True)
    if not res["success"]:
        sys.exit(1)
