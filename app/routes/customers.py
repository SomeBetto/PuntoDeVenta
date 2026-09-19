from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.database import get_db_connection

router = APIRouter(prefix="/api/customers", tags=["Clientes y Fiados"])

class CustomerCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    address: Optional[str] = ""
    credit_limit: float = 1500.0
    notes: Optional[str] = ""

class CustomerPayment(BaseModel):
    amount: float
    notes: Optional[str] = "Abono a cuenta"

@router.get("")
def list_customers():
    conn = get_db_connection()
    customers = conn.execute("""
        SELECT *,
               CASE WHEN credit_limit <= 0 THEN 999999.0 ELSE ROUND(credit_limit - current_balance, 2) END as available_credit
        FROM customers
        ORDER BY current_balance DESC, name ASC
    """).fetchall()
    conn.close()
    return [dict(c) for c in customers]

@router.post("")
def create_customer(cust: CustomerCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO customers (name, phone, address, credit_limit, notes)
        VALUES (?, ?, ?, ?, ?)
    """, (cust.name.strip(), cust.phone, cust.address, cust.credit_limit, cust.notes))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"message": "Cliente registrado correctamente", "id": new_id}

@router.get("/{customer_id}")
def get_customer(customer_id: int):
    conn = get_db_connection()
    cust = conn.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if not cust:
        conn.close()
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    conn.close()
    return dict(cust)

@router.get("/{customer_id}/history")
def get_customer_history(customer_id: int):
    conn = get_db_connection()
    cust = conn.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if not cust:
        conn.close()
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    transactions = conn.execute("""
        SELECT * FROM customer_transactions
        WHERE customer_id = ?
        ORDER BY id DESC
        LIMIT 50
    """, (customer_id,)).fetchall()
    conn.close()

    return {
        "customer": dict(cust),
        "transactions": [dict(t) for t in transactions]
    }

@router.post("/{customer_id}/payment")
def register_customer_payment(customer_id: int, payment: CustomerPayment):
    if payment.amount <= 0:
        raise HTTPException(status_code=400, detail="El monto del abono debe ser mayor a cero")

    conn = get_db_connection()
    cursor = conn.cursor()

    cust = cursor.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if not cust:
        conn.close()
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # Registrar el abono
    new_balance = max(0.0, round(cust["current_balance"] - payment.amount, 2))
    cursor.execute("UPDATE customers SET current_balance = ? WHERE id = ?", (new_balance, customer_id))

    cursor.execute("""
        INSERT INTO customer_transactions (customer_id, type, amount, notes)
        VALUES (?, 'ABONO', ?, ?)
    """, (customer_id, payment.amount, payment.notes))
    tx_id = cursor.lastrowid

    # Opcional: registrar el ingreso en caja si hay turno abierto
    shift = cursor.execute("SELECT id FROM cash_shifts WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").fetchone()
    if shift:
        cursor.execute("""
            INSERT INTO cash_movements (shift_id, type, amount, concept)
            VALUES (?, 'INGRESO', ?, ?)
        """, (shift["id"], payment.amount, f"Abono fiado: {cust['name']}"))

    # Consultar datos de la tienda para el ticket de abono
    settings_rows = cursor.execute("SELECT key, value FROM settings WHERE key IN ('store_name', 'store_address', 'store_phone', 'ticket_footer')").fetchall()
    settings_dict = {row["key"]: row["value"] for row in settings_rows}

    conn.commit()
    conn.close()

    from datetime import datetime
    return {
        "message": f"Abono de ${payment.amount:.2f} registrado para {cust['name']}",
        "previous_balance": cust["current_balance"],
        "new_balance": new_balance,
        "receipt": {
            "folio": tx_id,
            "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "customer_id": customer_id,
            "customer_name": cust["name"],
            "customer_phone": cust["phone"] or "",
            "previous_balance": cust["current_balance"],
            "payment_amount": payment.amount,
            "new_balance": new_balance,
            "notes": payment.notes or "Abono a cuenta",
            "store_name": settings_dict.get("store_name", "ABARROTES & MINI SÚPER"),
            "store_address": settings_dict.get("store_address", ""),
            "store_phone": settings_dict.get("store_phone", ""),
            "ticket_footer": settings_dict.get("ticket_footer", "¡Gracias por su pago puntual!")
        }
    }

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    credit_limit: Optional[float] = None
    notes: Optional[str] = None

@router.put("/{customer_id}")
def update_customer(customer_id: int, cust: CustomerUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()

    existing = cursor.execute("SELECT id FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    update_fields = []
    params = []
    for field, value in cust.model_dump(exclude_unset=True).items():
        update_fields.append(f"{field} = ?")
        params.append(value)

    if not update_fields:
        conn.close()
        return {"message": "Sin cambios"}

    params.append(customer_id)
    sql = f"UPDATE customers SET {', '.join(update_fields)} WHERE id = ?"
    cursor.execute(sql, params)
    conn.commit()
    conn.close()
    return {"message": "Cliente actualizado exitosamente"}

@router.delete("/{customer_id}")
def delete_customer(customer_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()

    cust = cursor.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if not cust:
        conn.close()
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    if cust["current_balance"] > 0:
        conn.close()
        raise HTTPException(status_code=400, detail="No se puede eliminar un cliente con saldo pendiente de pago")

    cursor.execute("UPDATE sales SET customer_id = NULL WHERE customer_id = ?", (customer_id,))
    cursor.execute("DELETE FROM customer_transactions WHERE customer_id = ?", (customer_id,))
    cursor.execute("DELETE FROM customers WHERE id = ?", (customer_id,))
    conn.commit()
    conn.close()
    return {"message": f"Cliente '{cust['name']}' eliminado correctamente"}

