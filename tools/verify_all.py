import sys
import os
import re

sys.path.insert(0, os.path.abspath("."))

from app.routes.suppliers import (
    list_suppliers, get_supplier, create_supplier, update_supplier, delete_supplier,
    SupplierCreate, SupplierUpdate
)
from app.routes.purchases import (
    get_next_folio, list_purchases, get_purchase, create_purchase, update_purchase, cancel_purchase,
    PurchaseCreate, PurchaseItemIn
)
from app.routes.products import list_products, get_product
from app.routes.reports import get_settings, update_settings, SettingsUpdate
from app.routes.cash import get_current_shift

def test_full_system():
    print("==================================================")
    print("INICIANDO PRUEBAS COMPLETAS DEL SISTEMA POS")
    print("==================================================")

    # ----------------------------------------------------
    # 1. PRUEBAS DE PROVEEDORES
    # ----------------------------------------------------
    print("\n--- 1. Pruebas de Proveedores ---")
    initial_suppliers = list_suppliers(query=None, include_inactive=True)
    print(f"[*] Proveedores existentes: {len(initial_suppliers)}")

    # Crear proveedor nuevo
    new_sup = create_supplier(SupplierCreate(
        name="Lácteos y Cremería San Juan",
        contact_name="Roberto Gomez",
        phone="555-444-3322",
        email="roberto@sanjuan.mx",
        address="Central de Abastos Nave B Local 14",
        rfc="LSJ900101XYZ",
        notes="Entrega Lunes y Jueves 8:00 AM"
    ))
    sup_id = new_sup["id"]
    print(f"[+] Proveedor creado con éxito: ID={sup_id}, Nombre='{new_sup['name']}'")
    assert new_sup["name"] == "Lácteos y Cremería San Juan"

    # Modificar proveedor
    updated_sup = update_supplier(sup_id, SupplierUpdate(
        name="Lácteos y Quesos San Juan S.A.",
        phone="555-888-9999",
        notes="Cambio de teléfono del repartidor"
    ))
    print(f"[+] Proveedor modificado: Nombre='{updated_sup['name']}', Tel='{updated_sup['phone']}'")
    assert updated_sup["name"] == "Lácteos y Quesos San Juan S.A."
    assert updated_sup["phone"] == "555-888-9999"

    # Buscar proveedor
    search_results = list_suppliers(query="San Juan", include_inactive=True)
    assert len(search_results) >= 1
    print(f"[+] Búsqueda de proveedor exitosa: {len(search_results)} encontrado(s)")

    # ----------------------------------------------------
    # 2. PRUEBAS DE COMPRAS E INTEGRACIÓN CON INVENTARIO
    # ----------------------------------------------------
    print("\n--- 2. Pruebas de Compras e Inventario ---")
    folio_info = get_next_folio()
    folio = folio_info["folio"]
    print(f"[*] Folio consecutivo generado: {folio}")

    prods = list_products(query=None, category_id=None)
    assert len(prods) > 0, "Debe haber productos para probar compras"
    test_prod = prods[0]
    stock_before = test_prod["stock"]
    cost_before = test_prod["cost_price"]
    print(f"[*] Producto de prueba: '{test_prod['name']}' (Stock={stock_before}, Costo={cost_before})")

    # Registrar compra
    qty_bought = 12.0
    new_cost = 25.50
    subtotal = round(qty_bought * new_cost, 2)

    purchase_res = create_purchase(PurchaseCreate(
        supplier_id=sup_id,
        folio=folio,
        invoice_number="FAC-2026-001",
        payment_method="EFECTIVO",
        notes="Compra de prueba de lácteos para surtido",
        register_cash_out=True,
        update_cost_prices=True,
        items=[
            PurchaseItemIn(
                product_id=test_prod["id"],
                product_name=test_prod["name"],
                barcode=test_prod.get("barcode") or "",
                quantity=qty_bought,
                unit=test_prod.get("unit") or "pz",
                unit_cost=new_cost,
                subtotal=subtotal
            )
        ]
    ))
    purchase_id = purchase_res["id"]
    print(f"[+] Compra registrada con éxito: ID={purchase_id}, Folio={purchase_res['folio']}, Total=${purchase_res['total']}")
    assert purchase_res["total"] == subtotal

    # Verificar que el inventario y costo se actualizaron automáticamente
    prod_after = get_product(test_prod["id"])
    print(f"[+] Stock actualizado de {stock_before} a {prod_after['stock']}")
    print(f"[+] Costo actualizado de {cost_before} a {prod_after['cost_price']}")
    assert prod_after["stock"] == stock_before + qty_bought
    assert prod_after["cost_price"] == new_cost

    # Verificar detalle de la compra
    detail = get_purchase(purchase_id)
    assert detail["id"] == purchase_id
    assert len(detail["items"]) == 1
    assert detail["items"][0]["quantity"] == qty_bought
    print(f"[+] Consulta de detalle de compra verificada (Partidas: {len(detail['items'])})")

    # Cancelar la compra y verificar reversión del inventario
    cancel_res = cancel_purchase(purchase_id)
    print(f"[+] Compra cancelada: {cancel_res['message']}")
    prod_reverted = get_product(test_prod["id"])
    print(f"[+] Stock revertido de {prod_after['stock']} a {prod_reverted['stock']}")
    assert prod_reverted["stock"] == stock_before

    # Eliminar proveedor de prueba
    del_res = delete_supplier(sup_id)
    print(f"[+] Proveedor de prueba eliminado: {del_res['message']}")

    # ----------------------------------------------------
    # 3. PRUEBAS DE CONFIGURACIÓN Y PERSISTENCIA
    # ----------------------------------------------------
    print("\n--- 3. Pruebas de Configuración del Negocio ---")
    settings_payload = {
        "store_name": "Abarrotes & Mini Súper Los Pinos",
        "store_phone": "555-765-4321",
        "store_address": "Av. Independencia #500, Esquina Morelos",
        "store_rfc": "PIN850101ABC",
        "ticket_header": "¡CALIDAD, SURTIDO Y BUEN PRECIO!",
        "ticket_footer": "¡Muchas gracias por su preferencia! Que tenga excelente día.",
        "ticket_width": "58",
        "currency_symbol": "$",
        "min_stock_default": "5",
        "allow_negative_stock": "1"
    }

    save_res = update_settings(SettingsUpdate(settings=settings_payload))
    print(f"[+] Guardado de configuraciones: {save_res['message']}")

    # Recuperar configuraciones y validar que todo persistió
    loaded_settings = get_settings()
    for key, expected_val in settings_payload.items():
        actual_val = loaded_settings.get(key)
        assert actual_val == expected_val, f"Fallo en configuración '{key}': esperado='{expected_val}', obtenido='{actual_val}'"
        print(f"    - {key}: '{actual_val}' OK")

    # ----------------------------------------------------
    # 4. VALIDACIÓN DE ENLACES E IDs EN EL FRONTEND
    # ----------------------------------------------------
    print("\n--- 4. Validación de IDs y Enlaces en HTML/JS ---")
    with open("app/static/index.html", encoding="utf-8") as f:
        html_content = f.read()

    # Comprobar que no hay duplicados de IDs críticos
    critical_ids = [
        "cfg-store-name",
        "cfg-store-phone",
        "cfg-store-address",
        "cfg-store-rfc",
        "cfg-ticket-header",
        "cfg-ticket-footer",
        "modal-cfg-store-name",
        "modal-cfg-store-phone",
        "purchase-supplier-select",
        "purchase-product-search",
        "purchases-table-body",
        "suppliers-grid",
        "suppliers-search-input"
    ]

    for cid in critical_ids:
        matches = re.findall(rf'id="{cid}"', html_content)
        assert len(matches) == 1, f"Error: ID '{cid}' encontrado {len(matches)} veces en index.html (debe ser exactamente 1)"
        print(f"    - ID '{cid}' verificado (único en el DOM) OK")

    # Comprobar script tags en index.html
    for script_name in ["suppliers.js", "purchases.js", "settings.js"]:
        assert f'<script src="/static/js/{script_name}"></script>' in html_content, f"Falta script {script_name} en index.html"
        print(f"    - Script '{script_name}' correctamente vinculado en index.html OK")

    print("\n==================================================")
    print("TODAS LAS PRUEBAS PASARON EXITOSAMENTE (100% OK)")
    print("==================================================")

if __name__ == "__main__":
    test_full_system()
