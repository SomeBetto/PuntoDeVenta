from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from app.database import get_db_connection

router = APIRouter(prefix="/api/pos", tags=["Punto de Venta"])

class CartItem(BaseModel):
    product_id: Optional[int] = None
    product_name: str
    quantity: float
    unit: str = "pz"
    unit_price: float
    cost_price: float = 0.0
    subtotal: float

class CheckoutRequest(BaseModel):
    items: List[CartItem]
    payment_method: str = "EFECTIVO" # "EFECTIVO", "TARJETA", "TRANSFERENCIA", "FIADO"
    amount_paid: float
    customer_id: Optional[int] = None
    notes: Optional[str] = ""

@router.post("/checkout")
def checkout(order: CheckoutRequest):
    if not order.items:
        raise HTTPException(status_code=400, detail="El carrito no puede estar vacío")

    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Obtener o asegurar turno de caja abierto
    shift = cursor.execute("SELECT id FROM cash_shifts WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").fetchone()
    shift_id = shift["id"] if shift else None
    if not shift_id:
        # Abrir uno automáticamente con Admin para no trabar la venta
        cursor.execute("INSERT INTO cash_shifts (cashier_name, initial_cash, status) VALUES ('Admin', 0.0, 'OPEN')")
        shift_id = cursor.lastrowid

    # 2. Calcular total respetando subtotales calculados (incluye redondeo al entero superior en granel)
    calculated_total = sum(round(item.subtotal if (item.subtotal is not None and item.subtotal > 0) else (item.unit_price * item.quantity), 2) for item in order.items)
    calculated_total = round(calculated_total, 2)

    # Validaciones según método de pago
    if order.payment_method == "FIADO":
        if not order.customer_id:
            conn.close()
            raise HTTPException(status_code=400, detail="Para venta fiada es obligatorio seleccionar un cliente")
        customer = cursor.execute("SELECT * FROM customers WHERE id = ?", (order.customer_id,)).fetchone()
        if not customer:
            conn.close()
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        # Verificar límite de crédito (0 o menor significa sin límite de crédito)
        if customer["credit_limit"] > 0 and (customer["current_balance"] + calculated_total) > customer["credit_limit"]:
            conn.close()
            raise HTTPException(
                status_code=400, 
                detail=f"La compra excede el límite de crédito del cliente. Deuda actual: ${customer['current_balance']:.2f}, Límite: ${customer['credit_limit']:.2f}"
            )
        amount_paid = 0.0
        change_given = 0.0
    elif order.payment_method == "EFECTIVO":
        amount_paid = order.amount_paid
        if amount_paid < calculated_total:
            conn.close()
            raise HTTPException(status_code=400, detail=f"El monto pagado (${amount_paid:.2f}) es menor al total (${calculated_total:.2f})")
        change_given = round(amount_paid - calculated_total, 2)
    else: # TARJETA o TRANSFERENCIA
        amount_paid = calculated_total
        change_given = 0.0

    # 3. Registrar venta
    cursor.execute("""
        INSERT INTO sales (shift_id, customer_id, total, amount_paid, change_given, payment_method, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        shift_id,
        order.customer_id,
        calculated_total,
        amount_paid,
        change_given,
        order.payment_method,
        order.notes
    ))
    sale_id = cursor.lastrowid

    # 4. Registrar items y descontar stock
    for item in order.items:
        cursor.execute("""
            INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit, unit_price, cost_price, subtotal)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            sale_id,
            item.product_id,
            item.product_name,
            item.quantity,
            item.unit,
            item.unit_price,
            item.cost_price,
            item.subtotal
        ))

        # Descontar del inventario si tiene ID de producto
        if item.product_id:
            cursor.execute("""
                UPDATE products 
                SET stock = MAX(0.0, stock - ?) 
                WHERE id = ?
            """, (item.quantity, item.product_id))

    # 5. Si fue fiado, registrar en la cuenta del cliente
    if order.payment_method == "FIADO" and order.customer_id:
        cursor.execute("""
            UPDATE customers 
            SET current_balance = current_balance + ? 
            WHERE id = ?
        """, (calculated_total, order.customer_id))

        cursor.execute("""
            INSERT INTO customer_transactions (customer_id, sale_id, type, amount, notes)
            VALUES (?, ?, 'CARGO', ?, ?)
        """, (order.customer_id, sale_id, calculated_total, f"Compra fiada (Ticket #{sale_id})"))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "sale_id": sale_id,
        "total": calculated_total,
        "amount_paid": amount_paid,
        "change_given": change_given,
        "payment_method": order.payment_method,
        "message": "Venta procesada con éxito"
    }

@router.get("/sales")
def list_sales(limit: int = 50):
    conn = get_db_connection()
    sales = conn.execute("""
        SELECT s.*, c.name as customer_name,
               (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as items_count
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        ORDER BY s.id DESC
        LIMIT ?
    """, (limit,)).fetchall()
    conn.close()
    return [dict(s) for s in sales]

@router.get("/sales/{sale_id}/ticket")
def get_sale_ticket(sale_id: int):
    conn = get_db_connection()
    sale = conn.execute("""
        SELECT s.*, c.name as customer_name, c.phone as customer_phone,
               COALESCE(cs.cashier_name, 'Admin') as cashier_name
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN cash_shifts cs ON s.shift_id = cs.id
        WHERE s.id = ?
    """, (sale_id,)).fetchone()

    if not sale:
        conn.close()
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    items = conn.execute("""
        SELECT * FROM sale_items WHERE sale_id = ?
    """, (sale_id,)).fetchall()

    settings_rows = conn.execute("SELECT key, value FROM settings").fetchall()
    settings = {row["key"]: row["value"] for row in settings_rows}

    conn.close()

    return {
        "sale": dict(sale),
        "items": [dict(i) for i in items],
        "settings": settings
    }

@router.post("/sales/{sale_id}/cancel")
def cancel_sale(sale_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()

    sale = cursor.execute("SELECT * FROM sales WHERE id = ?", (sale_id,)).fetchone()
    if not sale:
        conn.close()
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    if sale["status"] == "CANCELADA":
        conn.close()
        raise HTTPException(status_code=400, detail="La venta ya fue cancelada previamente")

    # 1. Regresar stock
    items = cursor.execute("SELECT product_id, quantity FROM sale_items WHERE sale_id = ?", (sale_id,)).fetchall()
    for item in items:
        if item["product_id"]:
            cursor.execute("""
                UPDATE products 
                SET stock = stock + ? 
                WHERE id = ?
            """, (item["quantity"], item["product_id"]))

    # 2. Revertir saldo si fue fiado
    if sale["payment_method"] == "FIADO" and sale["customer_id"]:
        cursor.execute("""
            UPDATE customers 
            SET current_balance = MAX(0.0, current_balance - ?) 
            WHERE id = ?
        """, (sale["total"], sale["customer_id"]))

        cursor.execute("""
            INSERT INTO customer_transactions (customer_id, sale_id, type, amount, notes)
            VALUES (?, ?, 'ABONO', ?, ?)
        """, (sale["customer_id"], sale_id, sale["total"], f"Cancelación de ticket #{sale_id}"))

    # 3. Marcar venta cancelada
    cursor.execute("UPDATE sales SET status = 'CANCELADA' WHERE id = ?", (sale_id,))
    conn.commit()
    conn.close()

    return {"message": f"Venta #{sale_id} cancelada y productos reintegrados al inventario"}
