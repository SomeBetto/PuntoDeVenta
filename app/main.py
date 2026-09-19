import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response

from app.database import init_db
from app.network_info import get_server_urls, generate_qr_svg
from app.routes.products import router as products_router
from app.routes.pos import router as pos_router
from app.routes.customers import router as customers_router
from app.routes.cash import router as cash_router
from app.routes.reports import router as reports_router
from app.routes.eleventa import router as eleventa_router
from app.routes.backup import router as backup_router
from app.routes.users import router as users_router
from app.routes.suppliers import router as suppliers_router
from app.routes.purchases import router as purchases_router

import sys
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inicializar base de datos y semillas
    init_db()
    net_info = get_server_urls(port=8050)
    print("=" * 60)
    print("[POS] PUNTO DE VENTA - TIENDA DE ABARROTES")
    print(f"[*] Acceso Local (PC):          {net_info['localhost_url']}")
    print(f"[*] Acceso Movil/Tablet (LAN):  {net_info['network_url']}")
    print("=" * 60)
    yield

app = FastAPI(
    title="Punto de Venta - Tienda de Abarrotes",
    description="Sistema POS web local para PC, tablets y celulares",
    version="1.0.0",
    lifespan=lifespan
)

# Permitir acceso desde cualquier dispositivo en la red local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar routers de la API
app.include_router(products_router)
app.include_router(pos_router)
app.include_router(customers_router)
app.include_router(cash_router)
app.include_router(reports_router)
app.include_router(eleventa_router)
app.include_router(backup_router)
app.include_router(users_router)
app.include_router(suppliers_router)
app.include_router(purchases_router)

@app.get("/api/network/info")
def network_info():
    """Retorna las IPs y URLs para conectar celulares o tablets"""
    return get_server_urls(port=8050)

@app.get("/api/network/qr.svg")
def network_qr_svg(url: str = None):
    """Genera y retorna un código QR estándar en formato SVG vectorial"""
    if not url:
        net = get_server_urls(port=8050)
        url = net["network_url"]
    svg_content = generate_qr_svg(url)
    return Response(content=svg_content, media_type="image/svg+xml")

# Montar archivos estáticos
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
    return {"message": "Punto de Venta Backend Activo"}
