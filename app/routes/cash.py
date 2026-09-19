from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.database import get_db_connection
from app.routes.backup import create_backup, BackupCreateRequest

router = APIRouter(prefix="/api/cash", tags=["Control de Caja"])

class OpenShiftRequest(BaseModel):
    cashier_name: str = "Admin"
    initial_cash: float = 0.0
    notes: Optional[str] = ""

@router.get("/cashiers")
def get_cashiers():
    """Retorna la lista de cajeros y usuarios activos para apertura de turnos"""
    conn = get_db_connection()
    users = conn.execute("""
        SELECT id, name, username, role
        FROM users
        WHERE is_active = 1
        ORDER BY CASE WHEN role = 'ADMIN' THEN 0 ELSE 1 END, name ASC
    """).fetchall()
    conn.close()
    if not users:
        return [{"id": 1, "name": "Administrador", "username": "admin", "role": "ADMIN"}]
    return [dict(u) for u in users]

class CashMovementRequest(BaseModel):
    type: str # "INGRESO" o "EGRESO"
    amount: float
    concept: str

class CloseShiftRequest(BaseModel):
    final_cash_real: float
    notes: Optional[str] = ""

@router.get("/current")
def get_current_shift():
    conn = get_db_connection()
    shift = conn.execute("SELECT * FROM cash_shifts WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").fetchone()

    if not shift:
        conn.close()
        return {"has_open_shift": False, "shift": None}

    shift_id = shift["id"]

    # 1. Ventas por método de pago dentro de este turno
    sales_summary = conn.execute("""
        SELECT 
            payment_method,
            COALESCE(SUM(total), 0) as total_amount,
            COUNT(*) as count
        FROM sales
        WHERE shift_id = ? AND status = 'COMPLETADA'
        GROUP BY payment_method
    """, (shift_id,)).fetchall()

    sales_by_method = {row["payment_method"]: row["total_amount"] for row in sales_summary}
    cash_sales = sales_by_method.get("EFECTIVO", 0.0)
    card_sales = sales_by_method.get("TARJETA", 0.0)
    transfer_sales = sales_by_method.get("TRANSFERENCIA", 0.0)
    fiado_sales = sales_by_method.get("FIADO", 0.0)

    # 2. Movimientos manuales de efectivo (ingresos / egresos)
    movements = conn.execute("""
        SELECT * FROM cash_movements
        WHERE shift_id = ?
        ORDER BY id DESC
    """, (shift_id,)).fetchall()

    total_ingresos = sum(m["amount"] for m in movements if m["type"] == "INGRESO")
    total_egresos = sum(m["amount"] for m in movements if m["type"] == "EGRESO")

    # 3. Efectivo esperado en caja
    expected_cash = round(shift["initial_cash"] + cash_sales + total_ingresos - total_egresos, 2)

    conn.close()

    return {
        "has_open_shift": True,
        "shift": dict(shift),
        "initial_cash": shift["initial_cash"],
        "cash_sales": cash_sales,
        "card_sales": card_sales,
        "transfer_sales": transfer_sales,
        "fiado_sales": fiado_sales,
        "total_ingresos": total_ingresos,
        "total_egresos": total_egresos,
        "expected_cash": expected_cash,
        "movements": [dict(m) for m in movements]
    }

@router.post("/open")
def open_shift(req: OpenShiftRequest):
    conn = get_db_connection()
    cursor = conn.cursor()

    # Verificar si ya hay un turno abierto
    open_shift = cursor.execute("SELECT id FROM cash_shifts WHERE status = 'OPEN'").fetchone()
    if open_shift:
        conn.close()
        raise HTTPException(status_code=400, detail="Ya existe un turno de caja abierto actualmente")

    cursor.execute("""
        INSERT INTO cash_shifts (cashier_name, initial_cash, status, notes)
        VALUES (?, ?, 'OPEN', ?)
    """, (req.cashier_name, req.initial_cash, req.notes))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {"message": "Turno de caja abierto correctamente", "shift_id": new_id}

@router.post("/movement")
def add_cash_movement(req: CashMovementRequest):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a 0")
    if req.type not in ["INGRESO", "EGRESO"]:
        raise HTTPException(status_code=400, detail="Tipo inválido. Use INGRESO o EGRESO")

    conn = get_db_connection()
    cursor = conn.cursor()

    shift = cursor.execute("SELECT id FROM cash_shifts WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").fetchone()
    if not shift:
        # Abrir turno automáticamente con Admin para no bloquear la operación rápida desde el mostrador
        cursor.execute("INSERT INTO cash_shifts (cashier_name, initial_cash, status, notes) VALUES ('Admin', 0.0, 'OPEN', 'Apertura automática por movimiento de caja')")
        shift_id = cursor.lastrowid
    else:
        shift_id = shift["id"]

    cursor.execute("""
        INSERT INTO cash_movements (shift_id, type, amount, concept)
        VALUES (?, ?, ?, ?)
    """, (shift_id, req.type, req.amount, req.concept.strip()))
    conn.commit()

    # Obtener efectivo esperado actualizado tras el movimiento
    cash_sales_row = cursor.execute("""
        SELECT COALESCE(SUM(total), 0) as total
        FROM sales
        WHERE shift_id = ? AND status = 'COMPLETADA' AND payment_method = 'EFECTIVO'
    """, (shift_id,)).fetchone()
    cash_sales = cash_sales_row["total"]

    shift_info = cursor.execute("SELECT initial_cash FROM cash_shifts WHERE id = ?", (shift_id,)).fetchone()
    init_cash = shift_info["initial_cash"] if shift_info else 0.0

    movements = cursor.execute("SELECT type, amount FROM cash_movements WHERE shift_id = ?", (shift_id,)).fetchall()
    total_ingresos = sum(m["amount"] for m in movements if m["type"] == "INGRESO")
    total_egresos = sum(m["amount"] for m in movements if m["type"] == "EGRESO")
    expected_cash = round(init_cash + cash_sales + total_ingresos - total_egresos, 2)

    conn.close()

    action_label = "Entrada de efectivo (F8)" if req.type == "INGRESO" else "Salida de efectivo (F9)"
    return {
        "success": True,
        "message": f"✅ {action_label} por ${req.amount:.2f} registrada",
        "movement_type": req.type,
        "amount": req.amount,
        "concept": req.concept.strip(),
        "expected_cash": expected_cash,
        "total_ingresos": total_ingresos,
        "total_egresos": total_egresos
    }

@router.get("/corte-current")
def get_corte_current():
    """
    Retorna el reporte íntegro del corte de caja del turno activo o actual,
    desglosando fondo inicial, ventas por método, entradas (F8), salidas (F9) y cuadre de caja.
    """
    conn = get_db_connection()
    shift = conn.execute("SELECT * FROM cash_shifts WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").fetchone()
    if not shift:
        shift = conn.execute("SELECT * FROM cash_shifts ORDER BY id DESC LIMIT 1").fetchone()
        if not shift:
            conn.close()
            return {"has_shift": False, "message": "No hay ningún turno de caja registrado"}

    shift_id = shift["id"]

    # Ventas por método
    sales_rows = conn.execute("""
        SELECT payment_method, COALESCE(SUM(total), 0) as total, COUNT(*) as count
        FROM sales
        WHERE shift_id = ? AND status = 'COMPLETADA'
        GROUP BY payment_method
    """, (shift_id,)).fetchall()

    sales_by_method = {}
    total_sales = 0.0
    total_tickets = 0
    for r in sales_rows:
        method = r["payment_method"]
        tot = round(float(r["total"]), 2)
        cnt = int(r["count"])
        sales_by_method[method] = {"total": tot, "count": cnt}
        total_sales += tot
        total_tickets += cnt

    cash_sales = sales_by_method.get("EFECTIVO", {}).get("total", 0.0)

    # Movimientos extraordinarios (Entradas F8 / Salidas F9)
    movements = conn.execute("""
        SELECT id, type, amount, concept, created_at
        FROM cash_movements
        WHERE shift_id = ?
        ORDER BY id ASC
    """, (shift_id,)).fetchall()

    ingresos_list = [dict(m) for m in movements if m["type"] == "INGRESO"]
    egresos_list = [dict(m) for m in movements if m["type"] == "EGRESO"]

    total_ingresos = round(sum(m["amount"] for m in ingresos_list), 2)
    total_egresos = round(sum(m["amount"] for m in egresos_list), 2)

    init_cash = round(float(shift["initial_cash"] or 0.0), 2)
    expected_cash = round(init_cash + cash_sales + total_ingresos - total_egresos, 2)
    final_real = round(float(shift["final_cash_real"] or 0.0), 2) if shift["final_cash_real"] is not None else None
    diff = round(final_real - expected_cash, 2) if final_real is not None else 0.0

    # Configuración de tienda para encabezado del ticket
    settings_rows = conn.execute("SELECT key, value FROM settings WHERE key IN ('store_name', 'store_address', 'store_phone', 'ticket_footer')").fetchall()
    settings_dict = {row["key"]: row["value"] for row in settings_rows}
    conn.close()

    return {
        "has_shift": True,
        "shift_id": shift_id,
        "status": shift["status"],
        "cashier_name": shift["cashier_name"] or "Admin",
        "opened_at": shift["opened_at"],
        "closed_at": shift["closed_at"],
        "store_name": settings_dict.get("store_name", "Punto de Venta"),
        "store_address": settings_dict.get("store_address", ""),
        "store_phone": settings_dict.get("store_phone", ""),
        "ticket_footer": settings_dict.get("ticket_footer", "Corte generado por el sistema"),
        "initial_cash": init_cash,
        "cash_sales": cash_sales,
        "total_sales": round(total_sales, 2),
        "total_tickets": total_tickets,
        "sales_by_method": sales_by_method,
        "total_ingresos": total_ingresos,
        "total_egresos": total_egresos,
        "ingresos_list": ingresos_list,
        "egresos_list": egresos_list,
        "expected_cash": expected_cash,
        "final_cash_real": final_real,
        "difference": diff,
        "balance_status": "Exacto" if diff == 0 else ("Sobrante" if diff > 0 else "Faltante"),
        "notes": shift["notes"] or ""
    }

@router.post("/close")
def close_shift(req: CloseShiftRequest, background_tasks: BackgroundTasks):
    conn = get_db_connection()
    cursor = conn.cursor()

    shift = cursor.execute("SELECT * FROM cash_shifts WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").fetchone()
    if not shift:
        conn.close()
        raise HTTPException(status_code=400, detail="No hay turno de caja abierto para cerrar")

    shift_id = shift["id"]

    # Calcular ventas en efectivo
    cash_sales_row = cursor.execute("""
        SELECT COALESCE(SUM(total), 0) as total
        FROM sales
        WHERE shift_id = ? AND status = 'COMPLETADA' AND payment_method = 'EFECTIVO'
    """, (shift_id,)).fetchone()
    cash_sales = cash_sales_row["total"]

    # Calcular ingresos y egresos
    movements = cursor.execute("SELECT id, type, amount, concept, created_at FROM cash_movements WHERE shift_id = ? ORDER BY id ASC", (shift_id,)).fetchall()
    ingresos = [dict(m) for m in movements if m["type"] == "INGRESO"]
    egresos = [dict(m) for m in movements if m["type"] == "EGRESO"]
    total_ingresos = round(sum(m["amount"] for m in ingresos), 2)
    total_egresos = round(sum(m["amount"] for m in egresos), 2)

    init_cash = round(float(shift["initial_cash"] or 0.0), 2)
    expected_cash = round(init_cash + cash_sales + total_ingresos - total_egresos, 2)
    difference = round(req.final_cash_real - expected_cash, 2)

    now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("""
        UPDATE cash_shifts
        SET status = 'CLOSED',
            closed_at = ?,
            final_cash_expected = ?,
            final_cash_real = ?,
            notes = ?
        WHERE id = ?
    """, (now_iso, expected_cash, req.final_cash_real, req.notes, shift_id))

    # Ventas desglosadas por método para el comprobante
    sales_rows = cursor.execute("""
        SELECT payment_method, COALESCE(SUM(total), 0) as total, COUNT(*) as count
        FROM sales
        WHERE shift_id = ? AND status = 'COMPLETADA'
        GROUP BY payment_method
    """, (shift_id,)).fetchall()
    sales_by_method = {r["payment_method"]: {"total": round(float(r["total"]), 2), "count": int(r["count"])} for r in sales_rows}

    # Datos tienda
    settings_rows = cursor.execute("SELECT key, value FROM settings WHERE key IN ('store_name', 'store_address', 'store_phone', 'ticket_footer')").fetchall()
    settings_dict = {row["key"]: row["value"] for row in settings_rows}

    conn.commit()
    conn.close()

    # Disparar respaldo automático de seguridad al cerrar turno
    background_tasks.add_task(create_backup, BackupCreateRequest(reason="cierre_turno"))

    corte_data = {
        "shift_id": shift_id,
        "cashier_name": shift["cashier_name"],
        "opened_at": shift["opened_at"],
        "closed_at": now_iso,
        "store_name": settings_dict.get("store_name", "Punto de Venta"),
        "store_address": settings_dict.get("store_address", ""),
        "store_phone": settings_dict.get("store_phone", ""),
        "initial_cash": init_cash,
        "cash_sales": round(float(cash_sales), 2),
        "sales_by_method": sales_by_method,
        "total_ingresos": total_ingresos,
        "total_egresos": total_egresos,
        "ingresos_list": ingresos,
        "egresos_list": egresos,
        "expected_cash": expected_cash,
        "final_cash_real": req.final_cash_real,
        "difference": difference,
        "balance_status": "Exacto" if difference == 0 else ("Sobrante" if difference > 0 else "Faltante"),
        "notes": req.notes or ""
    }

    return {
        "message": "Turno de caja cerrado exitosamente (Corte Z). Respaldo automático generado.",
        "shift_id": shift_id,
        "expected_cash": expected_cash,
        "final_cash_real": req.final_cash_real,
        "difference": difference,
        "status": "Sobrante" if difference > 0 else ("Faltante" if difference < 0 else "Exacto"),
        "corte_data": corte_data
    }

@router.get("/history")
def shift_history(limit: int = 20):
    conn = get_db_connection()
    shifts = conn.execute("""
        SELECT * FROM cash_shifts
        ORDER BY id DESC
        LIMIT ?
    """, (limit,)).fetchall()
    conn.close()
    return [dict(s) for s in shifts]
