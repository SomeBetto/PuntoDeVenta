import urllib.request
import json
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

BASE_URL = "http://localhost:8050"

def test_api():
    print("Testing POS System Endpoints...")

    # 1. Test Network Info
    req = urllib.request.urlopen(f"{BASE_URL}/api/network/info")
    assert req.status == 200
    net_data = json.loads(req.read().decode())
    print(f"✅ Network info OK: {net_data['network_url']}")

    # 2. Test Products List
    req = urllib.request.urlopen(f"{BASE_URL}/api/products")
    assert req.status == 200
    products = json.loads(req.read().decode())
    assert len(products) > 0
    print(f"✅ Products list OK: {len(products)} products loaded.")

    # 3. Test Categories
    req = urllib.request.urlopen(f"{BASE_URL}/api/products/categories")
    assert req.status == 200
    categories = json.loads(req.read().decode())
    assert len(categories) > 0
    print(f"✅ Categories OK: {len(categories)} categories found.")

    # 4. Test Current Cash Shift
    req = urllib.request.urlopen(f"{BASE_URL}/api/cash/current")
    assert req.status == 200
    cash = json.loads(req.read().decode())
    assert cash["has_open_shift"] is True
    print(f"✅ Cash shift OK: Initial ${cash['initial_cash']:.2f}")

    # 5. Test Customers (Fiados)
    req = urllib.request.urlopen(f"{BASE_URL}/api/customers")
    assert req.status == 200
    customers = json.loads(req.read().decode())
    assert len(customers) > 0
    print(f"✅ Customers OK: {len(customers)} customers loaded.")

    # 6. Test Checkout (Sale Simulation)
    first_prod = products[0]
    payload = {
        "items": [{
            "product_id": first_prod["id"],
            "product_name": first_prod["name"],
            "quantity": 2,
            "unit": first_prod["unit"],
            "unit_price": first_prod["sale_price"],
            "cost_price": first_prod["cost_price"],
            "subtotal": round(first_prod["sale_price"] * 2, 2)
        }],
        "payment_method": "EFECTIVO",
        "amount_paid": round(first_prod["sale_price"] * 2 + 10.0, 2),
        "notes": "Test Sale"
    }

    req = urllib.request.Request(
        f"{BASE_URL}/api/pos/checkout",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}
    )
    res = urllib.request.urlopen(req)
    assert res.status == 200
    sale_res = json.loads(res.read().decode())
    assert sale_res["success"] is True
    sale_id = sale_res["sale_id"]
    print(f"✅ Checkout OK: Sale #{sale_id} created, Total ${sale_res['total']:.2f}, Change ${sale_res['change_given']:.2f}")

    # 7. Test Ticket Generation
    req = urllib.request.urlopen(f"{BASE_URL}/api/pos/sales/{sale_id}/ticket")
    assert req.status == 200
    ticket = json.loads(req.read().decode())
    assert ticket["sale"]["id"] == sale_id
    print(f"✅ Ticket OK: Store {ticket['settings']['store_name']}")

    # 8. Test Dashboard
    req = urllib.request.urlopen(f"{BASE_URL}/api/reports/dashboard")
    assert req.status == 200
    dash = json.loads(req.read().decode())
    assert dash["today_sales"] > 0
    print(f"✅ Dashboard OK: Today Sales ${dash['today_sales']:.2f}, Tickets: {dash['today_tickets']}")

    # 10. Test Photo Upload & Product with Photo
    # Pequeño gif/jpeg base64 de 1x1 pixel
    sample_base64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    upload_payload = {"image_base64": sample_base64}
    req = urllib.request.Request(
        f"{BASE_URL}/api/products/upload-photo",
        data=json.dumps(upload_payload).encode(),
        headers={"Content-Type": "application/json"}
    )
    res = urllib.request.urlopen(req)
    assert res.status == 200
    upload_res = json.loads(res.read().decode())
    assert "image_url" in upload_res
    print(f"✅ Photo Upload OK: {upload_res['image_url']}")

    # Crear producto con la foto subida
    new_prod_payload = {
        "name": "Refresco Jarrito Piña 600ml",
        "barcode": "7501000999888",
        "sale_price": 14.50,
        "cost_price": 10.00,
        "stock": 24,
        "min_stock": 6,
        "unit": "pz",
        "allow_fractions": 0,
        "image_url": upload_res["image_url"]
    }
    req = urllib.request.Request(
        f"{BASE_URL}/api/products",
        data=json.dumps(new_prod_payload).encode(),
        headers={"Content-Type": "application/json"}
    )
    res = urllib.request.urlopen(req)
    assert res.status == 200
    new_prod_res = json.loads(res.read().decode())
    assert new_prod_res["id"] > 0
    print(f"✅ Product with Photo Created OK: ID #{new_prod_res['id']}")

    print("\n🎉 ALL TESTS PASSED! POS SYSTEM IS FULLY OPERATIONAL!")

if __name__ == "__main__":
    test_api()
