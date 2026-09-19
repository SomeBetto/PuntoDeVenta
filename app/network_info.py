import socket
import os
import io

def get_local_ip() -> str:
    """
    Obtiene la dirección IPv4 local activa del equipo en la red LAN/Wi-Fi.
    Prioriza la interfaz real conectada al router (ej. 192.168.x.x o 10.x.x.x).
    """
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Conectar a una IP pública sin enviar tráfico real para resolver la interfaz de ruta predeterminada
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        pass

    # Fallback buscando en todas las IPs asignadas al host
    all_ips = get_all_local_ips()
    if all_ips:
        return all_ips[0]["ip"]

    return "127.0.0.1"

def get_all_local_ips() -> list:
    """
    Lista todas las direcciones IPv4 disponibles en el sistema,
    clasificándolas para que las redes Wi-Fi/Ethernet domésticas (192.168.x.x)
    aparezcan primero antes de adaptadores virtuales (WSL, Hyper-V, VMware).
    """
    found = []
    seen = set()

    # Probar socket directo a gateway
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        primary = s.getsockname()[0]
        s.close()
        if primary and primary != "127.0.0.1":
            found.append(primary)
            seen.add(primary)
    except Exception:
        pass

    # Enumerar IPs registradas por el hostname
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if ip not in seen and not ip.startswith("127.") and ":" not in ip:
                found.append(ip)
                seen.add(ip)
    except Exception:
        pass

    # Clasificar y ordenar: primero 192.168.x.x, luego 10.x.x.x, luego otras
    def sort_key(ip_str):
        if ip_str.startswith("192.168."):
            return (0, ip_str)
        if ip_str.startswith("10."):
            return (1, ip_str)
        if ip_str.startswith("172."):
            # Podría ser WSL / Docker / clase B
            return (3, ip_str)
        return (2, ip_str)

    found.sort(key=sort_key)

    result = []
    for ip in found:
        label = "Wi-Fi / Red Local (Recomendada)" if ip.startswith("192.168.") else ("Red Corporativa (10.x)" if ip.startswith("10.") else ("Adaptador Virtual / Secundario" if ip.startswith("172.") else "Red Local"))
        result.append({
            "ip": ip,
            "label": f"{ip} - {label}"
        })

    if not result:
        result.append({"ip": "127.0.0.1", "label": "127.0.0.1 - Localhost"})

    return result

def get_server_urls(port: int = 8050) -> dict:
    local_ip = get_local_ip()
    all_ips = get_all_local_ips()
    network_url = f"http://{local_ip}:{port}"
    return {
        "local_ip": local_ip,
        "port": port,
        "localhost_url": f"http://localhost:{port}",
        "network_url": network_url,
        "is_connected_to_lan": local_ip != "127.0.0.1",
        "all_ips": all_ips,
        "qr_svg_url": f"/api/network/qr.svg?url={network_url}"
    }

def generate_qr_svg(content: str) -> str:
    """
    Genera un código QR en formato SVG vectorial estándar con margen de seguridad.
    """
    try:
        import qrcode
        import qrcode.image.svg
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=4,
        )
        qr.add_data(content)
        qr.make(fit=True)
        img = qr.make_image(image_factory=qrcode.image.svg.SvgPathImage)
        buf = io.BytesIO()
        img.save(buf)
        return buf.getvalue().decode("utf-8")
    except Exception as e:
        # Fallback simple en caso de que qrcode no esté disponible
        return f'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="100" fill="red">Error QR: {e}</text></svg>'
