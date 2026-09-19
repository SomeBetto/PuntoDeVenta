from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from app.database import get_db_connection

router = APIRouter(prefix="/api/products", tags=["Productos"])

import os
import base64
import uuid
from pathlib import Path

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "static" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

class ImageUploadRequest(BaseModel):
    image_base64: str # "data:image/jpeg;base64,..."

class ProductCreate(BaseModel):
    barcode: Optional[str] = None
    name: str
    description: Optional[str] = ""
    category_id: Optional[int] = None
    cost_price: float = 0.0
    sale_price: float
    stock: float = 0.0
    min_stock: float = 5.0
    unit: str = "pz"
    allow_fractions: int = 0
    image_url: Optional[str] = None

class ProductUpdate(BaseModel):
    barcode: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    cost_price: Optional[float] = None
    sale_price: Optional[float] = None
    stock: Optional[float] = None
    min_stock: Optional[float] = None
    unit: Optional[str] = None
    allow_fractions: Optional[int] = None
    image_url: Optional[str] = None
    is_active: Optional[int] = None

class StockAdjustment(BaseModel):
    quantity_delta: float
    reason: Optional[str] = "Ajuste manual"

@router.get("/categories")
def get_categories():
    conn = get_db_connection()
    categories = conn.execute("SELECT * FROM categories ORDER BY name ASC").fetchall()
    conn.close()
    return [dict(c) for c in categories]

@router.get("")
def list_products(
    query: Optional[str] = None,
    category_id: Optional[int] = None,
    low_stock: bool = False
):
    conn = get_db_connection()
    sql = """
        SELECT p.*, c.name as category_name, c.icon as category_icon
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.is_active = 1
    """
    params = []

    if query:
        import re
        raw_query = query.strip()
        # Limpieza de prefijos comunes de escáneres (AIM, letras iniciales, caracteres especiales)
        clean_code = re.sub(r'^\][A-Za-z0-9]{2}', '', raw_query)
        clean_code = re.sub(r"^[\x00-\x1F'\"~#\$\^&*`@\\|\-_\+\<\>]+", '', clean_code)
        m = re.match(r'^[a-zA-Z]{1,5}(\d{6,})$', clean_code)
        if m:
            clean_code = m.group(1)

        search_terms = list(dict.fromkeys([raw_query, clean_code]))
        clauses = []
        for term in search_terms:
            like_term = f"%{term}%"
            clauses.append("(p.name LIKE ? OR p.barcode LIKE ? OR p.description LIKE ? OR (? != '' AND ? LIKE '%' || p.barcode))")
            params.extend([like_term, like_term, like_term, term, term])

        sql += f" AND ({' OR '.join(clauses)})"

    if category_id:
        sql += " AND p.category_id = ?"
        params.append(category_id)

    if low_stock:
        sql += " AND p.stock <= p.min_stock"

    sql += " ORDER BY p.name ASC"

    products = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(p) for p in products]

@router.get("/reorder-suggestions")
def get_reorder_suggestions(days_projection: int = 15, limit: int = 100):
    """Calcula sugerencias inteligentes de compra basadas en velocidad de venta y stock mínimo"""
    conn = get_db_connection()
    # Identificar la fecha más reciente de ventas registradas
    max_date_row = conn.execute("SELECT MAX(created_at) as max_date FROM sales WHERE status = 'COMPLETADA'").fetchone()
    max_date = max_date_row["max_date"] if max_date_row and max_date_row["max_date"] else "now"

    # Consultar velocidad de venta en los 90 días previos a la fecha máxima
    sql = """
        WITH sales_stats AS (
            SELECT
                si.product_id,
                COALESCE(SUM(si.quantity), 0) as total_sold_qty,
                COUNT(DISTINCT s.id) as tickets_count
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            WHERE s.status = 'COMPLETADA'
              AND s.created_at >= datetime(?, '-90 days')
            GROUP BY si.product_id
        )
        SELECT
            p.id,
            p.barcode,
            p.name,
            p.stock,
            p.min_stock,
            p.cost_price,
            p.sale_price,
            p.unit,
            c.name as category_name,
            c.icon as category_icon,
            COALESCE(ss.total_sold_qty, 0) as total_sold_qty,
            ROUND(COALESCE(ss.total_sold_qty, 0) / 90.0, 2) as daily_sales_rate,
            CASE
                WHEN COALESCE(ss.total_sold_qty, 0) > 0 THEN
                    ROUND(p.stock / (ss.total_sold_qty / 90.0), 1)
                ELSE 999.0
            END as days_stock_remaining,
            ROUND(MAX(
                p.min_stock - p.stock,
                ROUND((COALESCE(ss.total_sold_qty, 0) / 90.0 * ?) - p.stock, 1)
            ), 1) as suggested_reorder
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN sales_stats ss ON p.id = ss.product_id
        WHERE p.is_active = 1
          AND (
              p.stock <= p.min_stock
              OR (COALESCE(ss.total_sold_qty, 0) > 0 AND (p.stock / (ss.total_sold_qty / 90.0)) <= ?)
          )
        ORDER BY
            CASE WHEN p.stock <= 0 THEN 0 WHEN p.stock <= p.min_stock THEN 1 ELSE 2 END ASC,
            days_stock_remaining ASC
        LIMIT ?
    """
    suggestions = conn.execute(sql, (max_date, days_projection, days_projection, limit)).fetchall()
    conn.close()
    return [dict(s) for s in suggestions]

@router.get("/export/csv")
def export_products_csv():
    """Exporta el catálogo completo de productos a un archivo CSV compatible con Excel"""
    import csv
    import io
    from fastapi.responses import Response

    conn = get_db_connection()
    products = conn.execute("""
        SELECT p.id, p.barcode, p.name, c.name as category_name,
               p.cost_price, p.sale_price, p.stock, p.min_stock, p.unit
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.is_active = 1
        ORDER BY p.name ASC
    """).fetchall()
    conn.close()

    output = io.StringIO()
    # Usar BOM UTF-8 para que Excel en Windows abra correctamente los acentos y caracteres especiales
    output.write('\ufeff')
    writer = csv.writer(output, delimiter=',', quoting=csv.QUOTE_MINIMAL)
    writer.writerow(["ID", "Codigo_Barras", "Nombre", "Departamento", "Costo", "Precio_Venta", "Stock_Actual", "Stock_Minimo", "Unidad"])

    for p in products:
        writer.writerow([
            p["id"],
            p["barcode"] or "",
            p["name"],
            p["category_name"] or "",
            p["cost_price"],
            p["sale_price"],
            p["stock"],
            p["min_stock"],
            p["unit"] or "pz"
        ])

    csv_data = output.getvalue()
    return Response(
        content=csv_data.encode("utf-8"),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=catalogo_productos.csv"}
    )

class CsvImportPayload(BaseModel):
    csv_text: str

@router.post("/import/csv")
def import_products_csv(payload: CsvImportPayload):
    """Importa o actualiza productos desde texto CSV"""
    import csv
    import io

    lines = payload.csv_text.strip().splitlines()
    if not lines:
        raise HTTPException(status_code=400, detail="El archivo CSV está vacío")

    # Detectar delimitador (, o ;)
    first_line = lines[0]
    delimiter = ';' if ';' in first_line and first_line.count(';') > first_line.count(',') else ','

    reader = csv.DictReader(lines, delimiter=delimiter)
    # Limpiar nombres de columnas
    field_map = {}
    for f in reader.fieldnames or []:
        norm = f.strip().lower().replace(" ", "_").replace("﻿", "")
        field_map[norm] = f

    conn = get_db_connection()
    cursor = conn.cursor()
    created = 0
    updated = 0

    try:
        for row in reader:
            # Obtener valores con tolerancia de encabezados
            def get_val(*keys):
                for k in keys:
                    if k in field_map:
                        return row.get(field_map[k], "").strip()
                return ""

            barcode = get_val("codigo_barras", "codigo", "barcode")
            name = get_val("nombre", "descripcion", "name")
            if not name:
                continue

            try:
                sale_price = float(get_val("precio_venta", "precio", "sale_price") or 0.0)
            except ValueError:
                sale_price = 0.0

            try:
                cost_price = float(get_val("costo", "cost_price") or 0.0)
            except ValueError:
                cost_price = 0.0

            try:
                stock = float(get_val("stock_actual", "stock", "existencia") or 0.0)
            except ValueError:
                stock = 0.0

            try:
                min_stock = float(get_val("stock_minimo", "min_stock") or 5.0)
            except ValueError:
                min_stock = 5.0

            unit = get_val("unidad", "unit") or "pz"

            # Verificar si existe por código de barras o por ID
            prod_id_str = get_val("id")
            existing = None
            if prod_id_str and prod_id_str.isdigit():
                existing = cursor.execute("SELECT id FROM products WHERE id = ?", (int(prod_id_str),)).fetchone()
            elif barcode:
                existing = cursor.execute("SELECT id FROM products WHERE barcode = ?", (barcode,)).fetchone()

            if existing:
                cursor.execute("""
                    UPDATE products
                    SET name = ?, cost_price = ?, sale_price = ?, stock = ?, min_stock = ?, unit = ?
                    WHERE id = ?
                """, (name, cost_price, sale_price, stock, min_stock, unit, existing["id"]))
                updated += 1
            else:
                cursor.execute("""
                    INSERT INTO products (barcode, name, cost_price, sale_price, stock, min_stock, unit, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                """, (barcode or None, name, cost_price, sale_price, stock, min_stock, unit))
                created += 1

        conn.commit()
        conn.close()
        return {
            "success": True,
            "created": created,
            "updated": updated,
            "message": f"Proceso completado: {updated} productos actualizados, {created} productos nuevos creados."
        }
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Error procesando CSV: {str(e)}")

@router.get("/{product_id}")
def get_product(product_id: int):
    conn = get_db_connection()
    p = conn.execute("""
        SELECT p.*, c.name as category_name, c.icon as category_icon
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = ?
    """, (product_id,)).fetchone()
    conn.close()
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return dict(p)

@router.post("")
def create_product(product: ProductCreate):
    conn = get_db_connection()
    cursor = conn.cursor()

    # Verificar si el código de barras ya existe (si se proporcionó)
    if product.barcode and product.barcode.strip():
        existing = cursor.execute("SELECT id FROM products WHERE barcode = ?", (product.barcode.strip(),)).fetchone()
        if existing:
            conn.close()
            raise HTTPException(status_code=400, detail=f"Ya existe un producto con el código {product.barcode}")

    cursor.execute("""
        INSERT INTO products (barcode, name, description, category_id, cost_price, sale_price, stock, min_stock, unit, allow_fractions, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        product.barcode.strip() if product.barcode else None,
        product.name.strip(),
        product.description,
        product.category_id,
        product.cost_price,
        product.sale_price,
        product.stock,
        product.min_stock,
        product.unit,
        product.allow_fractions,
        product.image_url
    ))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"message": "Producto creado con éxito", "id": new_id}

@router.post("/upload-photo")
def upload_photo(req: ImageUploadRequest):
    """Guarda una fotografía tomada con la cámara o subida por el usuario"""
    try:
        data = req.image_base64
        if "," in data:
            _, encoded = data.split(",", 1)
        else:
            encoded = data
        image_bytes = base64.b64decode(encoded)
        filename = f"prod_{uuid.uuid4().hex[:12]}.jpg"
        filepath = UPLOAD_DIR / filename
        with open(filepath, "wb") as f:
            f.write(image_bytes)
        return {"image_url": f"/static/uploads/{filename}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error guardando foto: {str(e)}")

@router.put("/{product_id}")
def update_product(product_id: int, product: ProductUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()

    existing = cursor.execute("SELECT id FROM products WHERE id = ?", (product_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    if product.barcode and product.barcode.strip():
        barcode_dup = cursor.execute(
            "SELECT id FROM products WHERE barcode = ? AND id != ?",
            (product.barcode.strip(), product_id)
        ).fetchone()
        if barcode_dup:
            conn.close()
            raise HTTPException(status_code=400, detail="El código de barras ya pertenece a otro producto")

    update_fields = []
    params = []

    for field, value in product.model_dump(exclude_unset=True).items():
        update_fields.append(f"{field} = ?")
        params.append(value)

    if not update_fields:
        conn.close()
        return {"message": "Sin cambios"}

    params.append(product_id)
    sql = f"UPDATE products SET {', '.join(update_fields)} WHERE id = ?"
    cursor.execute(sql, params)
    conn.commit()
    conn.close()
    return {"message": "Producto actualizado exitosamente"}

@router.delete("/{product_id}")
def delete_product(product_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE products SET is_active = 0 WHERE id = ?", (product_id,))
    conn.commit()
    conn.close()
    return {"message": "Producto desactivado correctamente"}

@router.post("/{product_id}/adjust_stock")
def adjust_stock(product_id: int, adj: StockAdjustment):
    conn = get_db_connection()
    cursor = conn.cursor()
    p = cursor.execute("SELECT id, stock, name FROM products WHERE id = ?", (product_id,)).fetchone()
    if not p:
        conn.close()
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    new_stock = max(0.0, round(p["stock"] + adj.quantity_delta, 3))
    cursor.execute("UPDATE products SET stock = ? WHERE id = ?", (new_stock, product_id))
    conn.commit()
    conn.close()
    return {"message": f"Stock actualizado para {p['name']}", "new_stock": new_stock}

