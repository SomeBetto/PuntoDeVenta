# Plan de Implementación: Punto de Venta Web Local (Tienda de Abarrotes)

Sistema de Punto de Venta (POS) web diseñado específicamente para una **tienda de abarrotes**, con arquitectura de servidor local en la PC principal y acceso simultáneo y responsivo desde dispositivos móviles o tablets en la misma red Wi-Fi mediante URL y código QR automático.

---

## Características Especiales para Tienda de Abarrotes

1. **Terminal de Venta Ágil (Mostrador / PC & Móvil):**
   - Venta por código de barras (lector USB / cámara) o búsqueda rápida por nombre.
   - **Soporte para venta a granel / por peso o fraccionado** (ej. 0.5 kg de jamón, 1.2 kg de huevo, o venta por importe "$20 de queso").
   - Calculadora de cambio instantánea con botones rápidos de denominación de billetes ($50, $100, $200, $500, etc.).
   - Carrito en espera (pausar una venta para atender a otro cliente y reanudarla).
   - Generación e impresión de tickets térmicos / comprobantes digitales.

2. **Módulo de "Fiados" (Cuentas Corrientes de Clientes):**
   - Registro de clientes recurrentes.
   - Asignación de ventas a cuenta pendiente ("fiado").
   - Registro de abonos parciales y liquidación de deudas con historial detallado.

3. **Control de Caja y Turnos:**
   - Apertura con fondo de caja.
   - Registro de salidas de efectivo (pago a proveedores de pan/refresco, gastos imprevistos) y entradas.
   - Corte de caja diario (Corte X y Z) con comparativo de efectivo esperado vs. contado.

4. **Inventario y Catálogo:**
   - Categorías preconfiguradas para abarrotes (Bebidas, Botanas, Lácteos, Abarrotes en general, Limpieza, Frutas y Verduras, etc.).
   - Alerta visual de existencias bajas o agotadas.
   - Ajustes de inventario y registro de compras/entradas.

5. **Conectividad Local y Multidispositivo:**
   - El servidor se ejecuta en la PC principal y escucha en la red local (`0.0.0.0`).
   - Muestra en pantalla la **IP local generada** (ej. `http://192.168.1.15:5000`) y un **Código QR** para que el tendero o empleado lo escanee con la cámara de su celular o tablet y comience a operar inmediatamente.
   - Interfaz totalmente adaptable: vista de mostrador para PC (atajos de teclado) y vista táctil para móvil/tablet.

6. **Facilidad de Uso:**
   - Archivo ejecutable de un solo clic (`iniciar_pos.bat`) para que cualquier persona en la tienda lo inicie sin conocimientos técnicos.

---

## Arquitectura y Stack Tecnológico

* **Entorno Detectado en la Máquina:** Python 3.12 ya se encuentra instalado y configurado en el sistema.
* **Backend:** Python con **FastAPI** (o **Flask**), rápido, ligero y de alto rendimiento.
* **Base de Datos:** **SQLite** integrado (archivo local `tienda.db`), libre de mantenimiento, veloz, sin necesidad de instalar servidores de bases de datos adicionales y con copias de seguridad inmediatas (copiar el archivo).
* **Frontend:** Web App SPA moderna y ultra-rápida (HTML5 semántico, Vanilla CSS con diseño moderno, componentes reactivos en JavaScript modular, soporte offline para no interrumpir ventas si fluctúa la red).
* **Conectividad de Red:** Detección automática de la IP del adaptador de red Wi-Fi/Ethernet y generación de QR en tiempo real.

---

## User Review Required

> [!IMPORTANT]
> Se detectó **Python 3.12** instalado en tu computadora (Node.js no está instalado actualmente). Construir el backend en Python con SQLite nos permite tener una aplicación 100% funcional, autónoma, rápida y sin requerir instalaciones pesadas adicionales.
> 
> Si en el futuro deseas que sea en Node.js, se puede instalar, pero Python con FastAPI/Flask + SQLite es una de las soluciones más robustas y confiables para un POS local en tienda.

---

## Open Questions

1. **¿Prefieres que el backend sea desarrollado en Python (FastAPI/Flask con SQLite)?** *(Recomendado para aprovechar tu instalación actual).*
2. **¿Manejas productos a granel/peso actualmente?** (Ej. balanza/báscula manual donde introduces los gramos/kilos, o sólo productos empaquetados con código de barras).
3. **¿Tienes impresora de tickets térmica?** (Ej. de 58mm u 80mm conectada por USB, o por ahora se usarán tickets en pantalla / PDF / WhatsApp).

---

## Proposed Changes

### Estructura del Proyecto

```
d:\Git\PuntoDeVenta\
├── app\
│   ├── __init__.py
│   ├── main.py              # Servidor API FastAPI/Flask y servicio de archivos estáticos
│   ├── database.py          # Conexión SQLite y creación de tablas iniciales
│   ├── network_info.py      # Detección de IP local y generación de QR
│   ├── routes\
│   │   ├── pos.py           # Endpoints de ventas, tickets y carritos
│   │   ├── products.py      # Endpoints de catálogo e inventario
│   │   ├── customers.py     # Endpoints de clientes y fiados
│   │   └── cash.py          # Endpoints de cortes y movimientos de caja
│   └── static\
│       ├── index.html       # Interfaz de usuario principal
│       ├── css\
│       │   └── style.css    # Sistema de diseño moderno, responsivo (PC/Tablet/Móvil)
│       └── js\
│           ├── app.js       # Orquestador del frontend
│           ├── pos.js       # Lógica del punto de venta y atajos de teclado
│           ├── inventory.js # Lógica de catálogo y stock
│           ├── credit.js    # Lógica de clientes y fiados
│           └── cash.js      # Lógica de cortes de caja
├── data\                    # Directorio para base de datos SQLite (tienda.db)
├── requirements.txt         # Dependencias mínimas de Python (fastapi, uvicorn, qrcode, etc.)
├── iniciar_pos.bat          # Lanzador automático de 1 clic para Windows
└── README.md                # Instrucciones de uso y conexión
```

---

## Verification Plan

### Pruebas Automatizadas y de Servidor
1. Inicialización de base de datos SQLite y semillas de prueba (productos de abarrotes típicos).
2. Pruebas de endpoints de la API (crear venta, descontar inventario, registrar fiado, registrar entrada/salida de caja).
3. Verificación de resolución de IP local y endpoint de código QR.

### Pruebas de Interfaz y Navegación
1. Carga en navegador de escritorio (`http://localhost:8000`).
2. Comprobación del diseño responsivo en vista móvil / tablet usando emulación y visualización de QR.
3. Prueba de flujo completo de venta: agregar producto por código o búsqueda rápida, calcular cambio y registrar venta.
