from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.database import get_db_connection

router = APIRouter(prefix="/api/purchases", tags=["Compras"])

class PurchaseItemIn(BaseModel):
    product_id: Optional[int] = None
    product_name: str
    barcode: Optional[str] = ""
    quantity: float
    unit: str = "pz"
    unit_cost: float
    subtotal: float
    new_sale_price: Optional[float] = None

class PurchaseCreate(BaseModel):
    supplier_id: Optional[int] = None
    folio: Optional[str] = None
    invoice_number: Optional[str] = ""
    payment_method: str = "EFECTIVO"
    notes: Optional[str] = ""
    register_cash_out: bool = True
    update_cost_prices: bool = True
    items: List[PurchaseItemIn]

class PurchaseUpdate(BaseModel):
    supplier_id: Optional[int] = None
    folio: Optional[str] = None
    invoice_number: Optional[str] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None

@router.get("/next-folio")
def get_next_folio():
    conn = get_db_connection()
    last = conn.execute("SELECT id FROM purchases ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    next_num = (last["id"] + 1) if last else 1
    return {"folio": f"COM-{next_num:05d}"}

@router.get("")
def list_purchases(
    query: Optional[str] = Query(None, description="Búsqueda por folio o número de factura"),
    supplier_id: Optional[int] = Query(None, description="Filtrar por proveedor"),
    start_date: Optional[str] = Query(None, description="Fecha inicio YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Fecha fin YYYY-MM-DD")
):
    conn = get_db_connection()
    sql = """
        SELECT 
            p.*,
            COALESCE(s.name, 'Sin Proveedor') as supplier_name,
            COUNT(pi.id) as items_count
        FROM purchases p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
        WHERE 1=1
    """
    params = []

    if supplier_id:
        sql += " AND p.supplier_id = ?"
        params.append(supplier_id)

    if query and query.strip():
        term = f"%{query.strip()}%"
        sql += " AND (p.folio LIKE ? OR p.invoice_number LIKE ? OR s.name LIKE ?)"
        params.extend([term, term, term])

    if start_date and start_date.strip():
        sql += " AND DATE(p.created_at, 'localtime') >= ?"
        params.append(start_date.strip())

    if end_date and end_date.strip():
        sql += " AND DATE(p.created_at, 'localtime') <= ?"
        params.append(end_date.strip())

    sql += " GROUP BY p.id ORDER BY p.created_at DESC LIMIT 100"

    rows = conn.execute(sql, params).fetchall()
    conn.close()

    result = []
    for r in rows:
        d = dict(r)
        d["total"] = round(float(d.get("total", 0.0)), 2)
        d["items_count"] = int(d.get("items_count", 0))
        result.append(d)
    return result

@router.get("/{purchase_id}")
def get_purchase(purchase_id: int):
    conn = get_db_connection()
    p = conn.execute("""
        SELECT p.*, COALESCE(s.name, 'Sin Proveedor') as supplier_name, s.phone as supplier_phone, s.rfc as supplier_rfc
        FROM purchases p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.id = ?
    """, (purchase_id,)).fetchone()

    if not p:
        conn.close()
        raise HTTPException(status_code=404, detail="Compra no encontrada")

    items = conn.execute("""
        SELECT pi.*, pr.stock as current_stock, pr.sale_price as current_sale_price
        FROM purchase_items pi
        LEFT JOIN products pr ON pi.product_id = pr.id
        WHERE pi.purchase_id = ?
    """, (purchase_id,)).fetchall()

    conn.close()
    data = dict(p)
    data["items"] = [dict(i) for i in items]
    return data

@router.post("")
def create_purchase(data: PurchaseCreate):
    if not data.items or len(data.items) == 0:
        raise HTTPException(status_code=400, detail="La compra debe incluir al menos un producto")

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # 1. Determinar folio si no viene especificado
        folio = data.folio.strip() if data.folio else ""
        if not folio:
            last = cursor.execute("SELECT id FROM purchases ORDER BY id DESC LIMIT 1").fetchone()
            next_num = (last["id"] + 1) if last else 1
            folio = f"COM-{next_num:05d}"

        # 2. Calcular total de la compra
        total = round(sum(item.subtotal for item in data.items), 2)

        # 3. Insertar cabecera de compra
        cursor.execute("""
            INSERT INTO purchases (folio, supplier_id, invoice_number, total, payment_method, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            folio,
            data.supplier_id,
            data.invoice_number.strip() if data.invoice_number else "",
            total,
            data.payment_method.strip() if data.payment_method else "EFECTIVO",
            data.notes.strip() if data.notes else ""
        ))
        purchase_id = cursor.lastrowid

        # 4. Insertar partidas y actualizar existencias de productos
        for item in data.items:
            cursor.execute("""
                INSERT INTO purchase_items (purchase_id, product_id, product_name, barcode, quantity, unit, unit_cost, subtotal)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                purchase_id,
                item.product_id,
                item.product_name,
                item.barcode or "",
                item.quantity,
                item.unit or "pz",
                item.unit_cost,
                item.subtotal
            ))

            # Si el producto existe en el catálogo, incrementar inventario
            if item.product_id:
                update_fields = ["stock = stock + ?"]
                update_params = [item.quantity]

                if data.update_cost_prices and item.unit_cost > 0:
                    update_fields.append("cost_price = ?")
                    update_params.append(item.unit_cost)

                if item.new_sale_price and item.new_sale_price > 0:
                    update_fields.append("sale_price = ?")
                    update_params.append(item.new_sale_price)

                update_params.append(item.product_id)
                cursor.execute(f"UPDATE products SET {', '.join(update_fields)} WHERE id = ?", update_params)

        # 5. Si fue en EFECTIVO y se solicita registrar salida de caja
        cash_movement_id = None
        if data.register_cash_out and data.payment_method == "EFECTIVO":
            # Verificar si hay turno de caja abierto
            shift = cursor.execute("SELECT id FROM cash_shifts WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").fetchone()
            if shift:
                supplier_name = "Proveedor"
                if data.supplier_id:
                    s_row = cursor.execute("SELECT name FROM suppliers WHERE id = ?", (data.supplier_id,)).fetchone()
                    if s_row:
                        supplier_name = s_row["name"]

                concept = f"Pago de compra {folio} a {supplier_name}"
                cursor.execute("""
                    INSERT INTO cash_movements (shift_id, type, amount, concept)
                    VALUES (?, 'EGRESO', ?, ?)
                """, (shift["id"], total, concept))
                cash_movement_id = cursor.lastrowid

        conn.commit()

        created = conn.execute("""
            SELECT p.*, COALESCE(s.name, 'Sin Proveedor') as supplier_name
            FROM purchases p
            LEFT JOIN suppliers s ON p.supplier_id = s.id
            WHERE p.id = ?
        """, (purchase_id,)).fetchone()
        conn.close()

        result = dict(created)
        result["cash_movement_registered"] = cash_movement_id is not None
        result["items_count"] = len(data.items)
        return result

    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Error registrando compra: {str(e)}")

@router.put("/{purchase_id}")
def update_purchase(purchase_id: int, data: PurchaseUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()

    existing = cursor.execute("SELECT * FROM purchases WHERE id = ?", (purchase_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Compra no encontrada")

    updates = []
    params = []

    if data.supplier_id is not None:
        updates.append("supplier_id = ?")
        params.append(data.supplier_id)
    if data.folio is not None:
        updates.append("folio = ?")
        params.append(data.folio.strip())
    if data.invoice_number is not None:
        updates.append("invoice_number = ?")
        params.append(data.invoice_number.strip())
    if data.payment_method is not None:
        updates.append("payment_method = ?")
        params.append(data.payment_method.strip())
    if data.notes is not None:
        updates.append("notes = ?")
        params.append(data.notes.strip())

    if updates:
        params.append(purchase_id)
        cursor.execute(f"UPDATE purchases SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()

    updated = conn.execute("""
        SELECT p.*, COALESCE(s.name, 'Sin Proveedor') as supplier_name
        FROM purchases p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.id = ?
    """, (purchase_id,)).fetchone()
    conn.close()
    return dict(updated)

@router.delete("/{purchase_id}")
def cancel_purchase(purchase_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()

    existing = cursor.execute("SELECT * FROM purchases WHERE id = ?", (purchase_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Compra no encontrada")

    # 1. Obtener partidas para revertir existencias
    items = cursor.execute("SELECT product_id, quantity FROM purchase_items WHERE purchase_id = ?", (purchase_id,)).fetchall()
    for item in items:
        if item["product_id"]:
            cursor.execute("""
                UPDATE products 
                SET stock = MAX(0.0, stock - ?) 
                WHERE id = ?
            """, (item["quantity"], item["product_id"]))

    # 2. Eliminar partidas y compra
    cursor.execute("DELETE FROM purchase_items WHERE purchase_id = ?", (purchase_id,))
    cursor.execute("DELETE FROM purchases WHERE id = ?", (purchase_id,))
    conn.commit()
    conn.close()

    return {"message": f"Compra {existing['folio']} eliminada y stock revertido correctamente"}
