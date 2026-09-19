from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Dict, Optional, List
from datetime import datetime, timedelta
from app.database import get_db_connection

router = APIRouter(prefix="/api/reports", tags=["Reportes y Estadísticas"])

class SettingsUpdate(BaseModel):
    settings: Dict[str, str]

def parse_date_filter(period: str = "last30", start_date: Optional[str] = None, end_date: Optional[str] = None):
    """
    Construye la condición WHERE y parámetros SQL para filtrar ventas por período.
    Soporta: 'today', 'yesterday', 'week', 'month', 'last30', 'year', 'all', 'custom'
    """
    now = datetime.now()
    where_clauses = ["status = 'COMPLETADA'"]
    params = []

    if period == "today":
        today_str = now.strftime("%Y-%m-%d")
        where_clauses.append("DATE(created_at, 'localtime') = ?")
        params.append(today_str)
    elif period == "yesterday":
        yest_str = (now - timedelta(days=1)).strftime("%Y-%m-%d")
        where_clauses.append("DATE(created_at, 'localtime') = ?")
        params.append(yest_str)
    elif period == "week":
        # Últimos 7 días
        week_start = (now - timedelta(days=7)).strftime("%Y-%m-%d 00:00:00")
        where_clauses.append("created_at >= ?")
        params.append(week_start)
    elif period == "month":
        # Primer día del mes actual
        month_start = now.strftime("%Y-%m-01 00:00:00")
        where_clauses.append("created_at >= ?")
        params.append(month_start)
    elif period == "last30":
        # Últimos 30 días
        days30_ago = (now - timedelta(days=30)).strftime("%Y-%m-%d 00:00:00")
        where_clauses.append("created_at >= ?")
        params.append(days30_ago)
    elif period == "year":
        # Año en curso
        year_start = now.strftime("%Y-01-01 00:00:00")
        where_clauses.append("created_at >= ?")
        params.append(year_start)
    elif period == "custom" and (start_date or end_date):
        if start_date:
            where_clauses.append("created_at >= ?")
            params.append(f"{start_date} 00:00:00")
        if end_date:
            where_clauses.append("created_at <= ?")
            params.append(f"{end_date} 23:59:59")
    elif period == "all":
        # Todo el historial de Eleventa sin filtro de fechas
        pass

    where_sql = " AND ".join(where_clauses)
    return where_sql, params

@router.get("/summary")
def get_sales_summary(
    period: str = Query("last30", description="today, yesterday, week, month, last30, year, all, custom"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """
    Retorna métricas generales de ventas y desglose de métodos de pago
    calculados directamente sobre la base de datos de Eleventa.
    """
    where_sql, params = parse_date_filter(period, start_date, end_date)
    conn = get_db_connection()

    # 1. Ventas totales y cantidad de tickets
    sales_row = conn.execute(f"""
        SELECT 
            COALESCE(SUM(total), 0) as total_sales,
            COUNT(*) as total_tickets,
            COALESCE(MIN(created_at), '') as first_sale,
            COALESCE(MAX(created_at), '') as last_sale
        FROM sales
        WHERE {where_sql}
    """, params).fetchone()

    total_sales = round(float(sales_row["total_sales"]), 2)
    total_tickets = int(sales_row["total_tickets"])
    avg_ticket = round(total_sales / total_tickets, 2) if total_tickets > 0 else 0.0

    # 2. Utilidad y costo total de las partidas del período
    # Hacemos JOIN entre sale_items y sales con el mismo filtro
    profit_sql = f"""
        SELECT 
            COALESCE(SUM(si.cost_price * si.quantity), 0) as total_cost,
            COALESCE(SUM((si.unit_price - si.cost_price) * si.quantity), 0) as total_profit
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE {where_sql.replace('created_at', 's.created_at').replace('status', 's.status')}
    """
    profit_row = conn.execute(profit_sql, params).fetchone()
    total_cost = round(float(profit_row["total_cost"]), 2)
    total_profit = round(float(profit_row["total_profit"]), 2)

    # Margen porcentual sobre ventas
    margin_pct = round((total_profit / total_sales) * 100, 1) if total_sales > 0 else 0.0

    # 3. Desglose por método de pago
    payment_methods_query = f"""
        SELECT 
            COALESCE(payment_method, 'EFECTIVO') as method,
            COUNT(*) as tickets,
            COALESCE(SUM(total), 0) as total_amount
        FROM sales
        WHERE {where_sql}
        GROUP BY payment_method
        ORDER BY total_amount DESC
    """
    methods_rows = conn.execute(payment_methods_query, params).fetchall()
    payment_methods = []
    for m in methods_rows:
        amt = round(float(m["total_amount"]), 2)
        pct = round((amt / total_sales) * 100, 1) if total_sales > 0 else 0.0
        payment_methods.append({
            "method": m["method"],
            "tickets": m["tickets"],
            "total_amount": amt,
            "pct": pct
        })

    conn.close()

    return {
        "period": period,
        "date_range": {
            "first_sale": sales_row["first_sale"],
            "last_sale": sales_row["last_sale"],
            "start_date": start_date,
            "end_date": end_date
        },
        "total_sales": total_sales,
        "total_tickets": total_tickets,
        "average_ticket": avg_ticket,
        "total_cost": total_cost,
        "total_profit": total_profit,
        "margin_pct": margin_pct,
        "payment_methods": payment_methods
    }

@router.get("/departments")
def get_departments_report(
    period: str = Query("last30"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 50
):
    """
    Reporte de ventas agrupadas por departamentos / categorías reales de Eleventa.
    """
    where_sql, params = parse_date_filter(period, start_date, end_date)
    conn = get_db_connection()

    sql = f"""
        SELECT 
            COALESCE(c.id, 0) as category_id,
            COALESCE(c.name, 'Sin Departamento') as category_name,
            COALESCE(c.icon, '📦') as icon,
            COUNT(DISTINCT si.id) as items_sold_count,
            ROUND(SUM(si.quantity), 2) as total_units_sold,
            ROUND(SUM(si.subtotal), 2) as total_sales,
            ROUND(SUM((si.unit_price - si.cost_price) * si.quantity), 2) as total_profit
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        LEFT JOIN products p ON si.product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE {where_sql.replace('created_at', 's.created_at').replace('status', 's.status')}
        GROUP BY c.id, c.name, c.icon
        ORDER BY total_sales DESC
        LIMIT ?
    """
    rows = conn.execute(sql, params + [limit]).fetchall()
    conn.close()

    grand_total = sum(r["total_sales"] for r in rows) if rows else 0.0

    results = []
    for r in rows:
        ts = float(r["total_sales"] or 0.0)
        tp = float(r["total_profit"] or 0.0)
        pct = round((ts / grand_total) * 100, 1) if grand_total > 0 else 0.0
        margin = round((tp / ts) * 100, 1) if ts > 0 else 0.0
        results.append({
            "category_id": r["category_id"],
            "name": r["category_name"],
            "icon": r["icon"],
            "units_sold": r["total_units_sold"],
            "total_sales": ts,
            "total_profit": tp,
            "margin_pct": margin,
            "pct_of_total": pct
        })

    return {
        "period": period,
        "grand_total": round(grand_total, 2),
        "departments": results
    }

@router.get("/top-products")
def get_top_products_report(
    period: str = Query("last30"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 25,
    order_by: str = Query("revenue", description="revenue, qty, profit")
):
    """
    Ranking de los productos más vendidos en el período con datos reales de Eleventa.
    """
    where_sql, params = parse_date_filter(period, start_date, end_date)
    conn = get_db_connection()

    order_field = "total_revenue"
    if order_by == "qty":
        order_field = "total_qty"
    elif order_by == "profit":
        order_field = "total_profit"

    sql = f"""
        SELECT 
            si.product_id,
            si.product_name,
            si.unit,
            COALESCE(p.barcode, '') as barcode,
            ROUND(SUM(si.quantity), 2) as total_qty,
            ROUND(SUM(si.subtotal), 2) as total_revenue,
            ROUND(SUM(si.cost_price * si.quantity), 2) as total_cost,
            ROUND(SUM((si.unit_price - si.cost_price) * si.quantity), 2) as total_profit
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        LEFT JOIN products p ON si.product_id = p.id
        WHERE {where_sql.replace('created_at', 's.created_at').replace('status', 's.status')}
        GROUP BY si.product_name, si.unit
        ORDER BY {order_field} DESC
        LIMIT ?
    """
    rows = conn.execute(sql, params + [limit]).fetchall()
    conn.close()

    results = []
    for r in rows:
        rev = float(r["total_revenue"] or 0.0)
        profit = float(r["total_profit"] or 0.0)
        margin = round((profit / rev) * 100, 1) if rev > 0 else 0.0
        results.append({
            "product_id": r["product_id"],
            "name": r["product_name"],
            "barcode": r["barcode"],
            "unit": r["unit"] or "pz",
            "quantity": r["total_qty"],
            "revenue": rev,
            "cost": float(r["total_cost"] or 0.0),
            "profit": profit,
            "margin_pct": margin
        })

    return {
        "period": period,
        "count": len(results),
        "products": results
    }

@router.get("/cashiers")
def get_cashiers_report(
    period: str = Query("all"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """
    Desglose de ventas por cajero asociadas a turnos de Eleventa.
    """
    where_sql, params = parse_date_filter(period, start_date, end_date)
    conn = get_db_connection()

    sql = f"""
        SELECT 
            COALESCE(cs.cashier_name, 'Sin Turno Asignado') as cashier_name,
            COUNT(s.id) as total_tickets,
            ROUND(SUM(s.total), 2) as total_sales,
            MIN(s.created_at) as first_sale,
            MAX(s.created_at) as last_sale
        FROM sales s
        LEFT JOIN cash_shifts cs ON s.shift_id = cs.id
        WHERE {where_sql.replace('created_at', 's.created_at').replace('status', 's.status')}
        GROUP BY cs.cashier_name
        ORDER BY total_sales DESC
    """
    rows = conn.execute(sql, params).fetchall()
    conn.close()

    grand_total = sum(r["total_sales"] for r in rows) if rows else 0.0
    results = []
    for r in rows:
        ts = float(r["total_sales"] or 0.0)
        pct = round((ts / grand_total) * 100, 1) if grand_total > 0 else 0.0
        tickets = int(r["total_tickets"])
        avg_t = round(ts / tickets, 2) if tickets > 0 else 0.0
        results.append({
            "cashier_name": r["cashier_name"],
            "tickets": tickets,
            "total_sales": ts,
            "average_ticket": avg_t,
            "pct_of_total": pct,
            "first_sale": r["first_sale"],
            "last_sale": r["last_sale"]
        })

    return {
        "period": period,
        "grand_total": round(grand_total, 2),
        "cashiers": results
    }

@router.get("/shifts-history")
def get_shifts_history(limit: int = 50, offset: int = 0):
    """
    Historial de cortes de turno importados de Eleventa (3,054 turnos reales).
    """
    conn = get_db_connection()
    total_count = conn.execute("SELECT COUNT(*) FROM cash_shifts").fetchone()[0]

    shifts = conn.execute("""
        SELECT 
            id, cashier_name, initial_cash, final_cash_expected, final_cash_real,
            status, opened_at, closed_at, notes
        FROM cash_shifts
        ORDER BY id DESC
        LIMIT ? OFFSET ?
    """, (limit, offset)).fetchall()
    conn.close()

    results = []
    for s in shifts:
        s_dict = dict(s)
        expected = s_dict["final_cash_expected"] or 0.0
        real = s_dict["final_cash_real"] or 0.0
        diff = round(real - expected, 2)
        s_dict["difference"] = diff
        s_dict["balance_status"] = "Exacto" if diff == 0 else ("Sobrante" if diff > 0 else "Faltante")
        results.append(s_dict)

    return {
        "total_shifts": total_count,
        "limit": limit,
        "offset": offset,
        "shifts": results
    }

@router.get("/credits")
def get_credits_report():
    """
    Resumen de cuentas por cobrar (fiados) de la base de clientes de Eleventa.
    """
    conn = get_db_connection()
    summary = conn.execute("""
        SELECT 
            COUNT(*) as total_customers,
            COUNT(CASE WHEN current_balance > 0 THEN 1 END) as debtors_count,
            COALESCE(SUM(CASE WHEN current_balance > 0 THEN current_balance ELSE 0 END), 0) as total_debt,
            COALESCE(SUM(credit_limit), 0) as total_credit_limit
        FROM customers
    """).fetchone()

    debtors = conn.execute("""
        SELECT id, name, phone, address, credit_limit, current_balance, notes
        FROM customers
        WHERE current_balance > 0
        ORDER BY current_balance DESC
        LIMIT 50
    """).fetchall()
    conn.close()

    return {
        "debtors_count": summary["debtors_count"],
        "total_customers": summary["total_customers"],
        "total_debt": round(float(summary["total_debt"]), 2),
        "total_credit_limit": round(float(summary["total_credit_limit"]), 2),
        "top_debtors": [dict(d) for d in debtors]
    }

@router.get("/inventory-valuation")
def get_inventory_valuation():
    """
    Valuación del inventario actual importado de Eleventa.
    """
    conn = get_db_connection()
    val = conn.execute("""
        SELECT 
            COUNT(*) as total_products,
            COALESCE(SUM(stock), 0) as total_units,
            COALESCE(SUM(stock * cost_price), 0) as total_cost_value,
            COALESCE(SUM(stock * sale_price), 0) as total_retail_value,
            COUNT(CASE WHEN stock <= min_stock THEN 1 END) as low_stock_count
        FROM products
        WHERE is_active = 1
    """).fetchone()

    low_stock = conn.execute("""
        SELECT id, barcode, name, stock, min_stock, unit, sale_price
        FROM products
        WHERE stock <= min_stock AND is_active = 1
        ORDER BY stock ASC
        LIMIT 20
    """).fetchall()
    conn.close()

    cost_val = round(float(val["total_cost_value"]), 2)
    retail_val = round(float(val["total_retail_value"]), 2)
    potential_profit = round(retail_val - cost_val, 2)
    margin = round((potential_profit / retail_val) * 100, 1) if retail_val > 0 else 0.0

    return {
        "total_products": val["total_products"],
        "total_units": round(float(val["total_units"]), 2),
        "total_cost_value": cost_val,
        "total_retail_value": retail_val,
        "potential_profit": potential_profit,
        "margin_pct": margin,
        "low_stock_count": val["low_stock_count"],
        "low_stock_products": [dict(p) for p in low_stock]
    }

@router.get("/dashboard")
def get_dashboard():
    """
    KPIs para el Dashboard inicial (muestra ventas de hoy o del último día con actividad).
    """
    conn = get_db_connection()

    # 1. Ventas de hoy
    sales_today = conn.execute("""
        SELECT 
            COALESCE(SUM(total), 0) as total_sales,
            COUNT(*) as total_tickets
        FROM sales
        WHERE DATE(created_at, 'localtime') = DATE('now', 'localtime')
          AND status = 'COMPLETADA'
    """).fetchone()

    # Ganancia estimada de hoy
    profit_today = conn.execute("""
        SELECT COALESCE(SUM((si.unit_price - si.cost_price) * si.quantity), 0) as total_profit
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE DATE(s.created_at, 'localtime') = DATE('now', 'localtime')
          AND s.status = 'COMPLETADA'
    """).fetchone()

    # 2. Total deudores / fiado pendiente
    credit_summary = conn.execute("""
        SELECT 
            COALESCE(SUM(current_balance), 0) as total_credit_due,
            COUNT(CASE WHEN current_balance > 0 THEN 1 END) as customers_with_debt
        FROM customers
    """).fetchone()

    # 3. Productos con bajo stock
    low_stock_products = conn.execute("""
        SELECT id, name, stock, min_stock, unit
        FROM products
        WHERE stock <= min_stock AND is_active = 1
        ORDER BY stock ASC
        LIMIT 10
    """).fetchall()

    # 4. Top 5 productos más vendidos (del último mes / período con datos)
    top_products = conn.execute("""
        SELECT 
            si.product_name,
            ROUND(SUM(si.quantity), 2) as total_qty,
            si.unit,
            ROUND(SUM(si.subtotal), 2) as total_revenue
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.status = 'COMPLETADA'
        GROUP BY si.product_name, si.unit
        ORDER BY total_qty DESC
        LIMIT 5
    """).fetchall()

    # Fecha del último ticket en base de datos
    last_sale = conn.execute("SELECT MAX(created_at) FROM sales WHERE status = 'COMPLETADA'").fetchone()[0]

    conn.close()

    return {
        "today_sales": round(float(sales_today["total_sales"]), 2),
        "today_tickets": int(sales_today["total_tickets"]),
        "today_profit": round(float(profit_today["total_profit"]), 2),
        "total_credit_due": round(float(credit_summary["total_credit_due"]), 2),
        "customers_with_debt": int(credit_summary["customers_with_debt"]),
        "low_stock_count": len(low_stock_products),
        "low_stock_products": [dict(p) for p in low_stock_products],
        "top_products": [dict(t) for t in top_products],
        "last_sale_date": last_sale
    }

@router.get("/settings")
def get_settings():
    conn = get_db_connection()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}

@router.post("/settings")
def update_settings(data: SettingsUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()
    for key, val in data.settings.items():
        cursor.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?", (key, val, val))
    conn.commit()
    conn.close()
    return {"message": "Configuraciones guardadas"}
