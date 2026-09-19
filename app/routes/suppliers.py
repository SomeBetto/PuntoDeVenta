from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from app.database import get_db_connection

router = APIRouter(prefix="/api/suppliers", tags=["Proveedores"])

class SupplierCreate(BaseModel):
    name: str
    contact_name: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    rfc: Optional[str] = ""
    notes: Optional[str] = ""

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    rfc: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[int] = None

@router.get("")
def list_suppliers(
    query: Optional[str] = Query(None, description="Búsqueda por nombre, contacto, teléfono o RFC"),
    include_inactive: bool = Query(False, description="Incluir proveedores dados de baja")
):
    conn = get_db_connection()
    sql = """
        SELECT 
            s.*,
            COUNT(p.id) as purchases_count,
            COALESCE(SUM(p.total), 0.0) as total_purchased
        FROM suppliers s
        LEFT JOIN purchases p ON s.id = p.supplier_id
        WHERE 1=1
    """
    params = []

    if not include_inactive:
        sql += " AND s.is_active = 1"

    if query and query.strip():
        term = f"%{query.strip()}%"
        sql += " AND (s.name LIKE ? OR s.contact_name LIKE ? OR s.phone LIKE ? OR s.rfc LIKE ?)"
        params.extend([term, term, term, term])

    sql += " GROUP BY s.id ORDER BY s.name ASC"

    rows = conn.execute(sql, params).fetchall()
    conn.close()

    result = []
    for r in rows:
        d = dict(r)
        d["purchases_count"] = int(d.get("purchases_count", 0))
        d["total_purchased"] = round(float(d.get("total_purchased", 0.0)), 2)
        result.append(d)
    return result

@router.get("/{supplier_id}")
def get_supplier(supplier_id: int):
    conn = get_db_connection()
    supplier = conn.execute("SELECT * FROM suppliers WHERE id = ?", (supplier_id,)).fetchone()
    if not supplier:
        conn.close()
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    purchases = conn.execute("""
        SELECT id, folio, invoice_number, total, payment_method, created_at
        FROM purchases
        WHERE supplier_id = ?
        ORDER BY created_at DESC
        LIMIT 20
    """, (supplier_id,)).fetchall()

    conn.close()
    data = dict(supplier)
    data["recent_purchases"] = [dict(p) for p in purchases]
    return data

@router.post("")
def create_supplier(data: SupplierCreate):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="El nombre del proveedor es obligatorio")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO suppliers (name, contact_name, phone, email, address, rfc, notes, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    """, (
        name,
        data.contact_name.strip() if data.contact_name else "",
        data.phone.strip() if data.phone else "",
        data.email.strip() if data.email else "",
        data.address.strip() if data.address else "",
        data.rfc.strip() if data.rfc else "",
        data.notes.strip() if data.notes else ""
    ))
    supplier_id = cursor.lastrowid
    conn.commit()

    created = conn.execute("SELECT * FROM suppliers WHERE id = ?", (supplier_id,)).fetchone()
    conn.close()
    return dict(created)

@router.put("/{supplier_id}")
def update_supplier(supplier_id: int, data: SupplierUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()

    existing = cursor.execute("SELECT * FROM suppliers WHERE id = ?", (supplier_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    updates = []
    params = []

    if data.name is not None:
        val = data.name.strip()
        if not val:
            conn.close()
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
        updates.append("name = ?")
        params.append(val)
    if data.contact_name is not None:
        updates.append("contact_name = ?")
        params.append(data.contact_name.strip())
    if data.phone is not None:
        updates.append("phone = ?")
        params.append(data.phone.strip())
    if data.email is not None:
        updates.append("email = ?")
        params.append(data.email.strip())
    if data.address is not None:
        updates.append("address = ?")
        params.append(data.address.strip())
    if data.rfc is not None:
        updates.append("rfc = ?")
        params.append(data.rfc.strip())
    if data.notes is not None:
        updates.append("notes = ?")
        params.append(data.notes.strip())
    if data.is_active is not None:
        updates.append("is_active = ?")
        params.append(1 if data.is_active else 0)

    if updates:
        params.append(supplier_id)
        cursor.execute(f"UPDATE suppliers SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()

    updated = conn.execute("SELECT * FROM suppliers WHERE id = ?", (supplier_id,)).fetchone()
    conn.close()
    return dict(updated)

@router.delete("/{supplier_id}")
def delete_supplier(supplier_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()

    existing = cursor.execute("SELECT * FROM suppliers WHERE id = ?", (supplier_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    # Si tiene compras asociadas, desactivar para no corromper histórico
    purchases_count = cursor.execute("SELECT COUNT(*) FROM purchases WHERE supplier_id = ?", (supplier_id,)).fetchone()[0]
    if purchases_count > 0:
        cursor.execute("UPDATE suppliers SET is_active = 0 WHERE id = ?", (supplier_id,))
        conn.commit()
        conn.close()
        return {"message": f"Proveedor '{existing['name']}' desactivado (tiene compras registradas)", "action": "deactivated"}
    else:
        cursor.execute("DELETE FROM suppliers WHERE id = ?", (supplier_id,))
        conn.commit()
        conn.close()
        return {"message": f"Proveedor '{existing['name']}' eliminado definitivamente", "action": "deleted"}
