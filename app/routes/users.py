from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Union
from app.database import get_db_connection

router = APIRouter(prefix="/api/users", tags=["Usuarios y Cajeros"])

AVAILABLE_PERMISSIONS = [
    {
        "code": "pos_sale",
        "name": "Cobrar y Realizar Ventas",
        "category": "Ventas",
        "icon": "🛒",
        "description": "Acceso al mostrador de cobro, lectura de código de barras y emisión de tickets"
    },
    {
        "code": "pos_discount",
        "name": "Aplicar Descuentos",
        "category": "Ventas",
        "icon": "🏷️",
        "description": "Aplicar rebajas porcentuales o directas sobre las ventas"
    },
    {
        "code": "pos_cancel",
        "name": "Cancelar Ventas y Partidas",
        "category": "Ventas",
        "icon": "❌",
        "description": "Eliminar artículos de la cuenta o cancelar tickets cobrados"
    },
    {
        "code": "cash_shifts",
        "name": "Apertura y Cierre de Caja",
        "category": "Caja",
        "icon": "💵",
        "description": "Abrir turnos de venta y realizar cortes de caja (Corte X y Z)"
    },
    {
        "code": "cash_movements",
        "name": "Entradas y Salidas de Efectivo",
        "category": "Caja",
        "icon": "📥",
        "description": "Registrar gastos, retiros de dinero y depósitos varios a caja"
    },
    {
        "code": "inventory_view",
        "name": "Consultar Catálogo e Inventario",
        "category": "Inventario",
        "icon": "📦",
        "description": "Ver productos, existencias disponibles y precios de venta"
    },
    {
        "code": "inventory_edit",
        "name": "Modificar Inventario y Precios",
        "category": "Inventario",
        "icon": "✏️",
        "description": "Crear productos, ajustar existencias, editar precios y costos de compra"
    },
    {
        "code": "customers_fiados",
        "name": "Libreta de Fiados / Clientes",
        "category": "Clientes",
        "icon": "👥",
        "description": "Registrar ventas fiadas, crear clientes y recibir abonos a cuentas"
    },
    {
        "code": "reports_view",
        "name": "Reportes y Estadísticas",
        "category": "Reportes",
        "icon": "📊",
        "description": "Consultar utilidades, ventas por fecha, departamentos y cortes históricos"
    },
    {
        "code": "settings_edit",
        "name": "Configuración y Respaldos",
        "category": "Sistema",
        "icon": "⚙️",
        "description": "Modificar datos del negocio, ticket, usuarios y generar respaldos"
    }
]

class UserCreate(BaseModel):
    name: str
    username: str
    role: str = "Cajero"
    pin: Optional[str] = "0000"
    phone: Optional[str] = ""
    email: Optional[str] = ""
    avatar: Optional[str] = "👨‍💼"
    permissions: Optional[Union[List[str], str]] = "*"
    is_active: bool = True

class UserUpdate(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    role: Optional[str] = None
    pin: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    avatar: Optional[str] = None
    permissions: Optional[Union[List[str], str]] = None
    is_active: Optional[bool] = None

def normalize_perms(perms: Optional[Union[List[str], str]]) -> str:
    if perms is None or perms == "*":
        return "*"
    if isinstance(perms, list):
        return ",".join(p.strip() for p in perms if p.strip())
    return str(perms).strip()

@router.get("/permissions")
def get_permissions_list():
    """Retorna la lista de permisos disponibles para asignar a cajeros"""
    return AVAILABLE_PERMISSIONS

@router.get("")
@router.get("/")
def list_users():
    """Lista todos los usuarios y cajeros registrados en el sistema"""
    conn = get_db_connection()
    users = conn.execute("""
        SELECT id, name, username, role, pin, phone, email, avatar, permissions, is_active, created_at
        FROM users
        ORDER BY id ASC
    """).fetchall()
    conn.close()

    result = []
    for u in users:
        u_dict = dict(u)
        # Parse permissions as list for frontend convenience
        raw_p = u_dict.get("permissions") or ""
        if raw_p == "*":
            u_dict["permissions_list"] = [p["code"] for p in AVAILABLE_PERMISSIONS]
        else:
            u_dict["permissions_list"] = [p.strip() for p in raw_p.split(",") if p.strip()]
        result.append(u_dict)
    return result

@router.post("")
@router.post("/")
def create_user(data: UserCreate):
    """Crea un nuevo usuario o cajero con permisos específicos"""
    name = data.name.strip()
    username = data.username.strip().lower()

    if not name:
        raise HTTPException(status_code=400, detail="El nombre del cajero/usuario es obligatorio")
    if not username:
        raise HTTPException(status_code=400, detail="El nombre de usuario (login) es obligatorio")

    conn = get_db_connection()
    cursor = conn.cursor()

    existing = cursor.execute("SELECT id FROM users WHERE LOWER(username) = ?", (username,)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=400, detail=f"El usuario '{username}' ya existe. Elija otro.")

    perms_str = normalize_perms(data.permissions)

    cursor.execute("""
        INSERT INTO users (name, username, role, pin, phone, email, avatar, permissions, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        name,
        username,
        data.role,
        data.pin or "0000",
        data.phone or "",
        data.email or "",
        data.avatar or "👨‍💼",
        perms_str,
        1 if data.is_active else 0
    ))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {"message": f"Cajero '{name}' creado exitosamente", "user_id": new_id}

@router.put("/{user_id}")
def update_user(user_id: int, data: UserUpdate):
    """Actualiza datos, rol y permisos de un usuario/cajero"""
    conn = get_db_connection()
    cursor = conn.cursor()

    current = cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not current:
        conn.close()
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Si es el admin principal, no permitir desactivar ni cambiar username principal
    if current["username"] == "admin":
        if data.is_active is False:
            conn.close()
            raise HTTPException(status_code=400, detail="No se puede desactivar la cuenta principal de Administrador")

    updates = []
    params = []

    if data.name is not None:
        updates.append("name = ?")
        params.append(data.name.strip())

    if data.username is not None and current["username"] != "admin":
        u_new = data.username.strip().lower()
        if u_new != current["username"]:
            dup = cursor.execute("SELECT id FROM users WHERE LOWER(username) = ? AND id != ?", (u_new, user_id)).fetchone()
            if dup:
                conn.close()
                raise HTTPException(status_code=400, detail=f"El usuario '{u_new}' ya está en uso")
            updates.append("username = ?")
            params.append(u_new)

    if data.role is not None:
        updates.append("role = ?")
        params.append(data.role)

    if data.pin is not None:
        updates.append("pin = ?")
        params.append(data.pin.strip())

    if data.phone is not None:
        updates.append("phone = ?")
        params.append(data.phone.strip())

    if data.email is not None:
        updates.append("email = ?")
        params.append(data.email.strip())

    if data.avatar is not None:
        updates.append("avatar = ?")
        params.append(data.avatar)

    if data.permissions is not None:
        updates.append("permissions = ?")
        params.append(normalize_perms(data.permissions))

    if data.is_active is not None and current["username"] != "admin":
        updates.append("is_active = ?")
        params.append(1 if data.is_active else 0)

    if updates:
        params.append(user_id)
        cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()

    conn.close()
    return {"message": "Usuario actualizado correctamente"}

@router.delete("/{user_id}")
def delete_user(user_id: int):
    """Elimina o desactiva un usuario/cajero (Admin protegido)"""
    conn = get_db_connection()
    cursor = conn.cursor()

    user = cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if user["username"] == "admin":
        conn.close()
        raise HTTPException(status_code=400, detail="No es posible eliminar al Administrador principal del sistema")

    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()

    return {"message": f"Usuario '{user['name']}' eliminado correctamente"}
