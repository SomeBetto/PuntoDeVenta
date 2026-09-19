/**
 * barcode.js - Utilidades universales para lectura y limpieza de códigos de barras
 * Elimina prefijos de escáneres láser/USB (AIM identifiers, caracteres de control, prefijos de letra)
 * y proporciona coincidencia inteligente de productos.
 */

const BarcodeUtils = {
  // Prefijo configurado manualmente por el usuario en Configuraciones (si aplica)
  getCustomPrefix() {
    return (window.SettingsModule?.settings?.scanner_prefix || '').trim();
  },

  /**
   * Limpia y normaliza un código recibido de un lector de códigos de barras.
   * Elimina identificadores AIM, prefijos configurados, caracteres no imprimibles y letras iniciales.
   */
  clean(rawCode) {
    if (!rawCode) return '';
    let code = String(rawCode).trim();

    // 1. Eliminar prefijo personalizado configurado en Ajustes (ej. "B", "]C1", "P", etc.)
    const custom = this.getCustomPrefix();
    if (custom && code.startsWith(custom)) {
      code = code.slice(custom.length).trim();
    }

    // 2. Eliminar identificadores estándar de simbología AIM (ej: ]C1, ]e0, ]E0, ]d2, ]A0, ]Q1, ]I0)
    code = code.replace(/^\][A-Za-z0-9]{2}/, '');

    // 3. Eliminar caracteres iniciales no alfanuméricos comunes generados por hardware (comillas, tildes, #, $, etc.)
    code = code.replace(/^[\x00-\x1F'"~#\$\^&*`@\\|\-_\+\<\>]+/, '');

    // 4. Si el código tiene letras al principio seguidas de un código numérico estándar (>= 6 dígitos, ej: EAN/UPC)
    // Ejemplo: B750103045550 -> 750103045550  o  SCAN750101112222 -> 750101112222
    const letterPrefixMatch = code.match(/^([a-zA-Z]{1,5})(\d{6,})$/);
    if (letterPrefixMatch) {
      code = letterPrefixMatch[2];
    }

    return code.trim();
  },

  /**
   * Busca la mejor coincidencia de producto en una lista en memoria o resultados de API.
   * Tolera prefijos, diferencias de ceros iniciales (UPC 12 vs EAN 13) y códigos contenidos.
   */
  findMatch(products, rawCode) {
    if (!rawCode || !products || products.length === 0) return null;
    const raw = String(rawCode).trim();
    const clean = this.clean(raw);
    const lowerRaw = raw.toLowerCase();
    const lowerClean = clean.toLowerCase();

    // 1. Coincidencia exacta directa con el código limpio o crudo
    let match = products.find(p => {
      if (!p.barcode) return false;
      const b = String(p.barcode).trim();
      const bClean = this.clean(b);
      return b === clean || b === raw || bClean === clean || bClean === raw;
    });
    if (match) return match;

    // 2. Coincidencia ignorando ceros a la izquierda (ej. UPC de 12 dígitos vs EAN de 13 dígitos con 0)
    const cleanNoZero = clean.replace(/^0+/, '');
    if (cleanNoZero.length >= 6) {
      match = products.find(p => {
        if (!p.barcode) return false;
        const bNoZero = String(p.barcode).trim().replace(/^0+/, '');
        return bNoZero === cleanNoZero;
      });
      if (match) return match;
    }

    // 3. Si el escáner envió un string que contiene o termina con el código de barras del producto
    match = products.find(p => {
      if (!p.barcode) return false;
      const b = String(p.barcode).trim();
      const bClean = this.clean(b);
      if (bClean.length >= 6) {
        return raw.endsWith(bClean) || clean.endsWith(bClean) || raw.includes(bClean);
      }
      return false;
    });
    if (match) return match;

    // 4. Si el código de barras del producto termina en el código limpio ingresado
    match = products.find(p => {
      if (!p.barcode) return false;
      const b = String(p.barcode).trim();
      return clean.length >= 6 && b.endsWith(clean);
    });
    if (match) return match;

    return null;
  }
};

window.BarcodeUtils = BarcodeUtils;
