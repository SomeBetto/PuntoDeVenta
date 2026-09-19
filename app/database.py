import sqlite3
import os
from pathlib import Path

DB_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DB_DIR / "tienda.db"

def get_db_connection():
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Configuración general
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)

    # 2. Categorías
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            icon TEXT DEFAULT '📦'
        )
    """)

    # 3. Productos (con soporte para piezas y granel)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            barcode TEXT UNIQUE,
            name TEXT NOT NULL,
            description TEXT,
            category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            cost_price REAL NOT NULL DEFAULT 0.0,
            sale_price REAL NOT NULL,
            stock REAL NOT NULL DEFAULT 0.0,
            min_stock REAL NOT NULL DEFAULT 5.0,
            unit TEXT NOT NULL DEFAULT 'pz',
            allow_fractions INTEGER NOT NULL DEFAULT 0,
            image_url TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Migración automática si la columna image_url no existe aún
    cursor.execute("PRAGMA table_info(products)")
    columns = [col[1] for col in cursor.fetchall()]
    if "image_url" not in columns:
        cursor.execute("ALTER TABLE products ADD COLUMN image_url TEXT")

    # 4. Clientes y Fiados
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT,
            address TEXT,
            credit_limit REAL NOT NULL DEFAULT 1500.0,
            current_balance REAL NOT NULL DEFAULT 0.0,
            eleventa_initial_balance REAL NOT NULL DEFAULT 0.0,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Migración: agregar eleventa_initial_balance si no existe
    cursor.execute("PRAGMA table_info(customers)")
    cust_cols = [col[1] for col in cursor.fetchall()]
    if "eleventa_initial_balance" not in cust_cols:
        cursor.execute("ALTER TABLE customers ADD COLUMN eleventa_initial_balance REAL NOT NULL DEFAULT 0.0")


    # 5. Transacciones de clientes (Cargos / Fiados y Abonos)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS customer_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            sale_id INTEGER,
            type TEXT NOT NULL, -- 'CARGO' o 'ABONO'
            amount REAL NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 6. Turnos de Caja
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cash_shifts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cashier_name TEXT DEFAULT 'Cajero Principal',
            initial_cash REAL NOT NULL DEFAULT 0.0,
            final_cash_expected REAL DEFAULT 0.0,
            final_cash_real REAL DEFAULT 0.0,
            status TEXT NOT NULL DEFAULT 'OPEN', -- 'OPEN' o 'CLOSED'
            opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            closed_at TIMESTAMP,
            notes TEXT
        )
    """)

    # 7. Movimientos de Caja (Entradas / Salidas de efectivo menor)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cash_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shift_id INTEGER NOT NULL REFERENCES cash_shifts(id) ON DELETE CASCADE,
            type TEXT NOT NULL, -- 'INGRESO' o 'EGRESO'
            amount REAL NOT NULL,
            concept TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 8. Ventas
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shift_id INTEGER REFERENCES cash_shifts(id),
            customer_id INTEGER REFERENCES customers(id),
            total REAL NOT NULL,
            amount_paid REAL NOT NULL,
            change_given REAL NOT NULL DEFAULT 0.0,
            payment_method TEXT NOT NULL DEFAULT 'EFECTIVO', -- 'EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'FIADO'
            status TEXT NOT NULL DEFAULT 'COMPLETADA', -- 'COMPLETADA', 'CANCELADA'
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 9. Detalle de Ventas
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sale_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
            product_id INTEGER REFERENCES products(id),
            product_name TEXT NOT NULL,
            quantity REAL NOT NULL,
            unit TEXT NOT NULL DEFAULT 'pz',
            unit_price REAL NOT NULL,
            cost_price REAL NOT NULL DEFAULT 0.0,
            subtotal REAL NOT NULL
        )
    """)

    # 10. Usuarios y Roles
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            role TEXT NOT NULL DEFAULT 'Cajero',
            pin TEXT,
            phone TEXT,
            email TEXT,
            avatar TEXT DEFAULT '👨‍💼',
            permissions TEXT DEFAULT '*',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 11. Proveedores
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS suppliers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            contact_name TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            rfc TEXT,
            notes TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 12. Compras a Proveedores
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folio TEXT,
            supplier_id INTEGER,
            invoice_number TEXT,
            total REAL NOT NULL DEFAULT 0.0,
            payment_method TEXT DEFAULT 'EFECTIVO',
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            user_id INTEGER,
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    # 13. Partidas de Compra
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS purchase_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            purchase_id INTEGER NOT NULL,
            product_id INTEGER,
            product_name TEXT NOT NULL,
            barcode TEXT,
            quantity REAL NOT NULL,
            unit TEXT NOT NULL DEFAULT 'pz',
            unit_cost REAL NOT NULL,
            subtotal REAL NOT NULL,
            FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    """)

    # Migración: asegurar columna permissions en users si ya existía
    user_cols = [c[1] for c in cursor.execute("PRAGMA table_info(users)").fetchall()]
    if "permissions" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '*'")

    # Índices para alta velocidad en consultas de reportes sobre ventas masivas de Eleventa
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales(shift_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_status_created ON sales(status, created_at);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sale_items_prodname ON sale_items(product_name);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);")

    # Índices para Compras y Proveedores
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_purchases_created ON purchases(created_at);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON purchase_items(product_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);")

    conn.commit()

    # Sembrar datos iniciales si está vacío (sólo Admin y configuración básica)
    seed_initial_data(conn)
    conn.close()

def seed_initial_data(conn: sqlite3.Connection):
    cursor = conn.cursor()

    # 1. Configuración por defecto
    default_settings = [
        ("store_name", "Abarrotes & Mini Super La Tiendita"),
        ("store_address", "Av. Principal #123, Col. Centro"),
        ("store_phone", "555-123-4567"),
        ("ticket_footer", "¡Muchas gracias por su preferencia! Vuelva pronto."),
        ("currency_symbol", "$"),
        ("bulk_round_up", "1")
    ]
    for key, val in default_settings:
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, val))

    # 2. Usuario Administrador por defecto (Cajero principal por defecto)
    cursor.execute("SELECT COUNT(*) FROM users WHERE username = 'admin'")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            INSERT INTO users (name, username, role, pin, phone, email, avatar, permissions, is_active)
            VALUES ('Administrador', 'admin', 'ADMIN', '1234', '', 'admin@tienda.local', '👑', '*', 1)
        """)

    # 3. Normalizar turnos: reemplazar nombres de prueba ("Cajero 1", "Cajero") por "Admin"
    cursor.execute("UPDATE cash_shifts SET cashier_name = 'Admin' WHERE cashier_name IN ('Cajero 1', 'Cajero')")

    # 4. Proveedores habituales por defecto
    cursor.execute("SELECT COUNT(*) FROM suppliers")
    if cursor.fetchone()[0] == 0:
        initial_suppliers = [
            ("Bimbo México", "Repartidor Ruta 12", "555-234-5678", "bimbo@reparto.mx", "Centro de Distribución Oriente", "BIM750101XYZ", "Visita los martes y jueves"),
            ("Sabritas / PepsiCo", "Preventa Botanas", "555-345-6789", "ventas@pepsico.com.mx", "Parque Industrial Norte", "SAB800202ABC", "Visita lunes y viernes"),
            ("Coca-Cola FEMSA", "Agente de Ventas", "555-456-7890", "pedidos@femsa.com", "Planta Embotelladora", "FEM900303DEF", "Visita martes, jueves y sábado"),
            ("Grupo Lala", "Distribuidor Lácteos", "555-567-8901", "pedidos@lala.com.mx", "Cedis Lácteos Refrigerados", "LAL600404GHI", "Entrega diaria por la mañana"),
            ("Gamesa Galletas", "Asesor Comercial", "555-678-9012", "gamesa@pedidos.com", "Almacén Central", "GAM700505JKL", "Visita semanal"),
            ("Colgate-Palmolive / Axion", "Distribución Limpieza", "555-789-0123", "limpieza@distribuidora.mx", "Zona Industrial", "COL850606MNO", "Artículos de limpieza y aseo"),
            ("Abarrotes Mayorista Central", "Mostrador Mayoreo", "555-890-1234", "ventas@centralabarrotes.mx", "Central de Abastos Bodega #45", "ABA920707PQR", "Abarrote general, granel y enlatados")
        ]
        for name, contact, phone, email, address, rfc, notes in initial_suppliers:
            cursor.execute("""
                INSERT INTO suppliers (name, contact_name, phone, email, address, rfc, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (name, contact, phone, email, address, rfc, notes))

    conn.commit()

