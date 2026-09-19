/**
 * ORQUESTADOR PRINCIPAL - ESTILO SICAR POS
 * Controla el menú lateral (Drawer), navegación entre módulos,
 * multiservicios (recargas), modales y conectividad móvil.
 */

const App = {
  currentView: 'pos',
  networkInfo: null,

  init() {
    this.bindDrawer();
    this.bindNavigation();
    this.initNetworkInfo();

    // Inicializar módulos
    if (window.PosModule) PosModule.init();
    if (window.InventoryModule) InventoryModule.init();
    if (window.CustomersModule) CustomersModule.init();
    if (window.CashModule) CashModule.init();
    if (window.UsersModule) UsersModule.init();
    if (window.ReportsModule) ReportsModule.init();
    if (window.MultiservicesModule) MultiservicesModule.init();
    if (window.SuppliersModule) SuppliersModule.init();
    if (window.PurchasesModule) PurchasesModule.init();
    if (window.SettingsModule) SettingsModule.init();
  },

  bindDrawer() {
    const openBtn = document.getElementById('btn-open-drawer');
    const closeBtn = document.getElementById('btn-close-drawer');
    const backdrop = document.getElementById('drawer-backdrop');

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        backdrop.classList.add('active');
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        backdrop.classList.remove('active');
      });
    }

    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          backdrop.classList.remove('active');
        }
      });
    }

    const quickToggle = document.getElementById('btn-drawer-quick-toggle');
    if (quickToggle) {
      quickToggle.addEventListener('click', () => {
        backdrop.classList.toggle('active');
      });
    }
  },

  bindNavigation() {
    // Navegación desde el Drawer
    document.querySelectorAll('.drawer-item, .drawer-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.getAttribute('data-view');
        if (view) {
          this.switchView(view);
          const backdrop = document.getElementById('drawer-backdrop');
          if (backdrop) backdrop.classList.remove('active');
        }
      });
    });

    // Botón Conectar Móvil
    const connectBtn = document.getElementById('btn-connect-mobile');
    if (connectBtn) {
      connectBtn.addEventListener('click', () => this.openConnectModal());
    }

    // Copiar URL
    const copyBtn = document.getElementById('btn-copy-url');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.copyNetworkUrl());
    }
  },

  switchView(viewName) {
    this.currentView = viewName;

    const titles = {
      'pos': 'Venta',
      'products': 'Productos',
      'purchases': 'Compras a Proveedores',
      'suppliers': 'Directorio de Proveedores',
      'inventory-adjust': 'Ajuste libre',
      'multiservices': 'Pago de Servicios',
      'customers': 'Libreta de Fiados',
      'cash': 'Control de Caja',
      'users': 'Usuarios',
      'reports': 'Dashboard y Reportes',
      'settings': 'Configuraciones del Sistema'
    };

    // Actualizar título de la barra superior
    const titleEl = document.getElementById('current-view-title');
    if (titleEl) {
      titleEl.innerText = titles[viewName] || 'Punto de Venta';
    }

    // Actualizar elementos activos en el menú
    document.querySelectorAll('.drawer-item, .drawer-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
    });

    // Cambiar paneles visibles
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `view-${viewName}`);
    });

    // Acciones específicas al entrar a una vista
    if (viewName === 'pos') {
      setTimeout(() => document.getElementById('pos-search-input')?.focus(), 100);
    } else if (viewName === 'products') {
      InventoryModule.loadProducts();
    } else if (viewName === 'purchases') {
      if (window.PurchasesModule) PurchasesModule.init();
    } else if (viewName === 'suppliers') {
      if (window.SuppliersModule) SuppliersModule.init();
    } else if (viewName === 'settings') {
      if (window.SettingsModule) SettingsModule.init();
    } else if (viewName === 'inventory-adjust') {
      InventoryModule.renderAdjustmentTable();
    } else if (viewName === 'customers') {
      if (window.CustomersModule) CustomersModule.loadCustomers();
    } else if (viewName === 'cash') {
      CashModule.loadCurrentShift();
    } else if (viewName === 'users') {
      if (window.UsersModule) UsersModule.loadUsers();
    } else if (viewName === 'reports') {
      if (window.ReportsModule) ReportsModule.loadAll();
    }
  },

  async initNetworkInfo() {
    try {
      const res = await fetch('/api/network/info');
      if (res.ok) {
        this.networkInfo = await res.json();
      }
    } catch (e) {
      console.error('Error obteniendo info de red:', e);
    }
  },

  async openConnectModal() {
    // Abrir modal inmediatamente
    const modal = document.getElementById('connect-modal');
    if (modal) modal.classList.add('active');

    // Obtener info de red si aún no ha terminado de cargar
    if (!this.networkInfo) {
      await this.initNetworkInfo();
    }

    // Fallback de seguridad en caso de fallo de conexión al endpoint
    if (!this.networkInfo) {
      const host = window.location.hostname || 'localhost';
      const port = window.location.port || '8050';
      const netUrl = `${window.location.protocol}//${host}:${port}`;
      this.networkInfo = {
        local_ip: host,
        port: port,
        network_url: netUrl,
        all_ips: [{ ip: host, label: `${host} - Red Local` }]
      };
    }

    this.renderConnectModalContent();
  },

  renderConnectModalContent(customIp) {
    if (!this.networkInfo) return;

    const port = this.networkInfo.port || 8050;
    const selectedIp = customIp || this.networkInfo.local_ip;
    const url = `http://${selectedIp}:${port}`;

    // Mostrar URL textual
    const urlEl = document.getElementById('qr-network-url');
    if (urlEl) urlEl.innerText = url;

    // Actualizar selector de adaptadores de red si existe
    const selectEl = document.getElementById('qr-ip-select');
    if (selectEl && this.networkInfo.all_ips) {
      if (selectEl.options.length === 0) {
        this.networkInfo.all_ips.forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.ip;
          opt.textContent = item.label;
          if (item.ip === selectedIp) opt.selected = true;
          selectEl.appendChild(opt);
        });
        selectEl.onchange = (e) => {
          this.renderConnectModalContent(e.target.value);
        };
      } else {
        selectEl.value = selectedIp;
      }
    }

    // 1. Cargar imagen QR vectorial SVG
    const imgEl = document.getElementById('qr-image');
    if (imgEl) {
      imgEl.src = `/api/network/qr.svg?url=${encodeURIComponent(url)}&t=${Date.now()}`;
      imgEl.style.display = 'block';
    }

    // 2. Renderizar en Canvas con margen de seguridad como respaldo
    const canvas = document.getElementById('qr-canvas');
    if (canvas && window.renderQRCode) {
      try {
        window.renderQRCode(canvas, url, 220);
      } catch (err) {
        console.warn('Canvas QR fallback error:', err);
      }
    }

    this.activeMobileUrl = url;
  },

  copyNetworkUrl() {
    const url = this.activeMobileUrl || (this.networkInfo && this.networkInfo.network_url) || window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      this.showToast('Enlace copiado al portapapeles: ' + url, 'success');
    }).catch(() => {
      this.showToast('Copie el enlace: ' + url, 'info');
    });
  },

  closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('active');
  },

  closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    document.getElementById('drawer-backdrop')?.classList.remove('active');
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
};

/**
 * MÓDULO DE MULTISERVICIOS Y RECARGAS (CAPTURA 3)
 */
const MultiservicesModule = {
  activeCarrier: 'Telcel',

  init() {
    document.querySelectorAll('.service-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.service-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  },

  openRechargeModal(carrier) {
    this.activeCarrier = carrier;
    document.getElementById('recharge-carrier-title').innerText = `Recarga ${carrier}`;
    document.getElementById('recharge-phone-input').value = '';
    document.getElementById('recharge-amount-val').value = '100';
    document.getElementById('recharge-modal').classList.add('active');
    setTimeout(() => document.getElementById('recharge-phone-input').focus(), 150);
  },

  selectAmount(amount) {
    document.getElementById('recharge-amount-val').value = amount;
    App.showToast(`Monto seleccionado: $${amount}.00 MXN`, 'info');
  },

  processRecharge() {
    const phone = document.getElementById('recharge-phone-input').value.trim();
    const amount = document.getElementById('recharge-amount-val').value;

    if (phone.length !== 10 || isNaN(phone)) {
      App.showToast('Ingrese un número de teléfono válido a 10 dígitos', 'error');
      return;
    }

    App.closeModal('recharge-modal');
    App.showToast(`✅ Recarga exitosa de $${amount} a ${this.activeCarrier} (${phone})`, 'success');

    // Registrar en caja como ingreso por venta de servicio
    if (window.CashModule) {
      fetch('/api/cash/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'INGRESO',
          amount: parseFloat(amount),
          concept: `Recarga ${this.activeCarrier} (${phone})`
        })
      }).then(() => CashModule.loadCurrentShift());
    }
  }
};

window.MultiservicesModule = MultiservicesModule;
window.App = App;

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
