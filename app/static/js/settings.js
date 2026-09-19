/**
 * settings.js - Módulo Centralizado de Configuraciones
 * Maneja datos del negocio, personalización de tickets, preferencias de venta y respaldos.
 */

const SettingsModule = {
  settings: {},

  init() {
    this.bindEvents();
    this.loadSettings();
  },

  bindEvents() {
    if (this._bound) return;
    this._bound = true;

    // Botón Guardar Datos de la Tienda y Ticket
    const btnSaveBusiness = document.getElementById('btn-save-business-config');
    if (btnSaveBusiness) {
      btnSaveBusiness.addEventListener('click', () => this.saveBusinessConfig());
    }

    // Botón Guardar Preferencias de Venta
    const btnSavePrefs = document.getElementById('btn-save-pos-preferences');
    if (btnSavePrefs) {
      btnSavePrefs.addEventListener('click', () => this.savePosPreferences());
    }

    // Botón Guardar en Modal (si se usa el modal)
    const btnModalSave = document.getElementById('btn-save-store-settings');
    if (btnModalSave) {
      btnModalSave.addEventListener('click', () => this.saveFromModal());
    }

    // Al abrir el modal de configuraciones, recargar datos frescos
    const btnTopSettings = document.getElementById('btn-top-settings');
    if (btnTopSettings) {
      btnTopSettings.addEventListener('click', () => {
        this.loadSettings();
      });
    }
  },

  currentTab: 'store',

  switchTab(tabId) {
    this.currentTab = tabId;
    document.querySelectorAll('[id^="tab-btn-cfg-"]').forEach(btn => {
      btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`tab-btn-cfg-${tabId}`);
    if (activeBtn) activeBtn.classList.add('active');

    document.querySelectorAll('.cfg-tab-panel').forEach(panel => {
      panel.style.display = 'none';
    });
    const activePanel = document.getElementById(`panel-cfg-${tabId}`);
    if (activePanel) activePanel.style.display = 'block';

    if (tabId === 'backups' && window.BackupModule) {
      BackupModule.loadBackupConfig();
    }
  },

  async loadSettings() {
    try {
      const res = await fetch('/api/reports/settings');
      if (!res.ok) throw new Error('Error al cargar configuración');
      this.settings = await res.json();
      this.populateFields(this.settings);
    } catch (err) {
      console.error('Error cargando configuración:', err);
    }
  },

  populateFields(s) {
    // Campos en vista principal de Configuración (prefijo cfg-)
    this.setVal('cfg-store-name', s.store_name || '');
    this.setVal('cfg-store-phone', s.store_phone || '');
    this.setVal('cfg-store-address', s.store_address || '');
    this.setVal('cfg-store-rfc', s.store_rfc || '');
    this.setVal('cfg-ticket-header', s.ticket_header || 'ABARROTES & MINI SÚPER');
    this.setVal('cfg-ticket-footer', s.ticket_footer || '¡Muchas gracias por su compra! Vuelva pronto.');
    this.setVal('cfg-ticket-width', s.ticket_width || '58');
    this.setVal('cfg-currency-symbol', s.currency_symbol || '$');
    this.setVal('cfg-min-stock-default', s.min_stock_default || '5');
    this.setVal('cfg-scanner-prefix', s.scanner_prefix || '');

    const chkAutoPrint = document.getElementById('cfg-auto-print-ticket');
    if (chkAutoPrint) chkAutoPrint.checked = s.auto_print_ticket === '1';

    const chkAllowNeg = document.getElementById('cfg-allow-negative-stock');
    if (chkAllowNeg) chkAllowNeg.checked = s.allow_negative_stock === '1';

    const chkBulkRound = document.getElementById('cfg-bulk-round-up');
    if (chkBulkRound) chkBulkRound.checked = (s.bulk_round_up !== '0');

    // Sincronizar también con los inputs del modal por compatibilidad
    this.setVal('modal-cfg-store-name', s.store_name || '');
    this.setVal('modal-cfg-store-phone', s.store_phone || '');
    this.setVal('modal-cfg-store-address', s.store_address || '');
    this.setVal('modal-cfg-ticket-footer', s.ticket_footer || '');

    // Actualizar nombre de negocio visible en barra superior si existe
    const brandName = document.getElementById('navbar-store-name');
    if (brandName && s.store_name) {
      brandName.innerText = s.store_name;
    }
  },

  setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  },

  async saveBusinessConfig() {
    const store_name = document.getElementById('cfg-store-name')?.value.trim() || '';
    const store_phone = document.getElementById('cfg-store-phone')?.value.trim() || '';
    const store_address = document.getElementById('cfg-store-address')?.value.trim() || '';
    const store_rfc = document.getElementById('cfg-store-rfc')?.value.trim() || '';
    const ticket_header = document.getElementById('cfg-ticket-header')?.value.trim() || '';
    const ticket_footer = document.getElementById('cfg-ticket-footer')?.value.trim() || '';
    const ticket_width = document.getElementById('cfg-ticket-width')?.value || '58';
    const chkAutoPrint = document.getElementById('cfg-auto-print-ticket');
    const auto_print_ticket = chkAutoPrint && chkAutoPrint.checked ? '1' : '0';

    const payload = {
      settings: {
        store_name,
        store_phone,
        store_address,
        store_rfc,
        ticket_header,
        ticket_footer,
        ticket_width,
        auto_print_ticket
      }
    };

    await this.sendSettingsUpdate(payload, 'Datos de la tienda y ticket guardados con éxito');
  },

  async savePosPreferences() {
    const currency_symbol = document.getElementById('cfg-currency-symbol')?.value.trim() || '$';
    const min_stock_default = document.getElementById('cfg-min-stock-default')?.value.trim() || '5';
    const scanner_prefix = document.getElementById('cfg-scanner-prefix')?.value.trim() || '';
    const chkAllowNeg = document.getElementById('cfg-allow-negative-stock');
    const allow_negative_stock = chkAllowNeg && chkAllowNeg.checked ? '1' : '0';
    const chkBulkRound = document.getElementById('cfg-bulk-round-up');
    const bulk_round_up = chkBulkRound && chkBulkRound.checked ? '1' : '0';

    const payload = {
      settings: {
        currency_symbol,
        min_stock_default,
        scanner_prefix,
        allow_negative_stock,
        bulk_round_up
      }
    };

    await this.sendSettingsUpdate(payload, 'Preferencias del sistema y granel actualizadas');
  },

  async saveFromModal() {
    const store_name = document.getElementById('modal-cfg-store-name')?.value.trim() || '';
    const store_phone = document.getElementById('modal-cfg-store-phone')?.value.trim() || '';
    const store_address = document.getElementById('modal-cfg-store-address')?.value.trim() || '';
    const ticket_footer = document.getElementById('modal-cfg-ticket-footer')?.value.trim() || '';

    const payload = {
      settings: {
        store_name,
        store_phone,
        store_address,
        ticket_footer
      }
    };

    await this.sendSettingsUpdate(payload, 'Configuración del negocio guardada exitosamente');
  },

  async sendSettingsUpdate(payload, successMsg) {
    try {
      const res = await fetch('/api/reports/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Error en el servidor al guardar configuraciones');

      // Actualizar estado local
      Object.assign(this.settings, payload.settings);
      this.populateFields(this.settings);

      App.showToast(successMsg, 'success');
    } catch (err) {
      console.error(err);
      App.showToast(err.message, 'error');
    }
  }
};

window.SettingsModule = SettingsModule;
