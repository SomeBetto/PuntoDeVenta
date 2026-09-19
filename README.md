# 🏪 Punto de Venta Web Local - Tienda de Abarrotes

Sistema moderno de Punto de Venta (POS) diseñado específicamente para **tiendas de abarrotes, minisúpers y cremerías**, optimizado para ejecutarse localmente en la PC de mostrador y conectarse de forma simultánea desde **celulares y tablets** dentro de la misma red Wi-Fi.

---

## 🌟 Características Principales

1. **🛒 Terminal de Venta Rápida (POS):**
   - Búsqueda instantánea por nombre o código de barras (compatible con cualquier lector USB o inalámbrico).
   - **Venta a granel / por peso o importe:** Ingresa kilogramos/gramos (ej. 0.5 kg de huevo o jamón) o importe en pesos (ej. "$20 de queso") y el sistema calcula la proporción exacta.
   - **Calculadora de cambio ágil:** Botones directos para denominaciones de billetes ($50, $100, $200, $500, Pago Exacto).
   - Métodos de pago: **Efectivo, Tarjeta, Transferencia y Fiado**.
   - Emisión e impresión de tickets térmicos con formato de 58mm / 80mm.

2. **📱 Acceso Móvil / Tablet con Código QR:**
   - Detección automática de la IP de la computadora en la red Wi-Fi (ej. `http://192.168.1.86:8000`).
   - Al hacer clic en el botón **"Conectar Celular / Tablet"**, se muestra un **Código QR grande** listo para escanear con la cámara del celular.
   - Permite que el tendero o encargado atienda a clientes en los pasillos o consulte precios desde su celular.

3. **👥 Libreta de Fiados (Cuentas por Cobrar):**
   - Registro de clientes con límite de crédito máximo.
   - Ventas a crédito que suman a la deuda del cliente con un solo clic.
   - Registro de abonos parciales o liquidación total con historial detallado de compras y pagos.

4. **💵 Control de Caja y Turnos:**
   - Apertura de turno con fondo inicial de caja.
   - Registro de entradas y salidas de efectivo (pago a proveedores de pan, refresco, hielo, etc.).
   - **Corte de Caja (Corte Z):** Compara el dinero esperado según el sistema vs. el dinero físico contado por el cajero, calculando faltantes o sobrantes.

5. **📦 Inventario y Catálogo:**
   - Categorías precargadas (Bebidas, Botanas, Lácteos, Granel, Frutas y Verduras, Limpieza, etc.).
   - Alertas visuales de stock bajo.
   - Ajuste rápido de mercancía (+ / - stock cuando llega el repartidor).

6. **📊 Dashboard y Estadísticas:**
   - Ventas del día en tiempo real, tickets emitidos y ganancia estimada.
   - Top de productos más vendidos.
   - Datos del negocio personalizables (nombre, dirección, teléfono y mensaje del ticket).

---

## 🚀 Cómo Iniciar el Sistema

### Opción 1: Un solo clic (Recomendado en Windows)
Haz doble clic en el archivo:
```
iniciar_pos.bat
```
El sistema iniciará el servidor local y abrirá tu navegador web por defecto automáticamente en:
`http://localhost:8000`

### Opción 2: Desde la terminal
```bash
.\.venv\Scripts\python.exe run.py
```

---

## 📱 Cómo Conectar tu Celular o Tablet

1. Asegúrate de que tu celular o tablet esté conectado a la **misma red Wi-Fi** que la PC.
2. En la pantalla del Punto de Venta en la PC, haz clic en el botón superior derecho: **"📱 Conectar Celular / Tablet"**.
3. Abre la cámara de tu celular y **escanea el código QR**.
4. ¡Listo! Se abrirá la aplicación en el navegador de tu teléfono con interfaz totalmente táctil.

---

## ⌨️ Atajos de Teclado (Para cajero en PC)

| Tecla | Acción |
|---|---|
| <kbd>F1</kbd> | Ir a Punto de Venta |
| <kbd>F2</kbd> | Ir a Inventario de Productos |
| <kbd>F3</kbd> | Ir a Libreta de Fiados |
| <kbd>F4</kbd> | Ir a Control de Caja |
| <kbd>F12</kbd> | Abrir ventana de cobro rápido |
| <kbd>Enter</kbd> | Agregar producto al escanear código |
| <kbd>Esc</kbd> | Cerrar cualquier ventana o modal abierto |

---

## 💾 Respaldo de la Base de Datos

Toda la información (ventas, clientes, inventario, caja) se guarda en un solo archivo local:
```
data/tienda.db
```
Para respaldar tu tienda, simplemente copia ese archivo a una memoria USB o a tu nube (Google Drive / OneDrive). No requiere instalación de servidores MySQL ni PostgreSQL.
