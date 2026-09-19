/**
 * suppliers.js - Módulo de Gestión de Proveedores
 * Permite listar, buscar, registrar, modificar y eliminar proveedores.
 */

const SuppliersModule = {
  suppliers: [],
  currentEditingId: null,

  init() {
    this.bindEvents();
    this.loadSuppliers();
  },

  bindEvents() {
    const searchInput = document.getElementById('suppliers-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.loadSuppliers(e.target.value.trim());
      });
    }

    const btnNew = document.getElementById('btn-new-supplier');
    if (btnNew) {
      btnNew.addEventListener('click', () => this.openCreateModal());
    }

    const form = document.getElementById('supplier-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveSupplier();
      });
    }
  },

  async loadSuppliers(query = '') {
    try {
      const url = query ? `/api/suppliers?query=${encodeURIComponent(query)}` : '/api/suppliers';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Error al cargar proveedores');
      this.suppliers = await res.json();
      this.renderSuppliers();
    } catch (err) {
      console.error('Error en loadSuppliers:', err);
      App.showToast('No se pudieron cargar los proveedores', 'error');
    }
  },

  renderSuppliers() {
    const container = document.getElementById('suppliers-grid');
    const countEl = document.getElementById('suppliers-count-badge');
    if (countEl) {
      countEl.innerText = `${this.suppliers.length} Proveedores`;
    }

    if (!container) return;

    if (this.suppliers.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
          <div style="font-size: 3rem; margin-bottom: 0.5rem;">🚚</div>
          <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-secondary);">No se encontraron proveedores</div>
          <p style="font-size: 0.85rem; margin-top: 0.25rem;">Registra tu primer proveedor para asociarlo a tus compras y reposición de inventario.</p>
          <button class="main-action-pill-btn" style="margin: 1rem auto 0; font-size: 0.85rem;" onclick="SuppliersModule.openCreateModal()">
            <span>➕ Registrar Primer Proveedor</span>
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = this.suppliers.map(s => {
      const isInactive = s.is_active === 0;
      return `
        <div class="supplier-card ${isInactive ? 'supplier-card-inactive' : ''}" style="
          background: #ffffff;
          border: 1px solid var(--border-light);
          border-radius: var(--radius-lg);
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow: 0 2px 4px rgba(0,0,0,0.03);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        ">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.6rem;">
              <div>
                <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--text-primary); margin: 0;">
                  ${this.escapeHtml(s.name)}
                </h4>
                ${s.contact_name ? `
                  <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.15rem; display: flex; align-items: center; gap: 0.3rem;">
                    <span>👤</span> <span>${this.escapeHtml(s.contact_name)}</span>
                  </div>
                ` : ''}
              </div>
              <span class="unit-chip" style="background: ${isInactive ? '#fee2e2' : '#dcfce7'}; color: ${isInactive ? '#991b1b' : '#166534'}; font-size: 0.7rem; font-weight: 700;">
                ${isInactive ? 'Inactivo' : 'Activo'}
              </span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.82rem; color: var(--text-secondary); margin-top: 0.5rem; border-top: 1px solid #f1f5f9; padding-top: 0.6rem;">
              ${s.phone ? `
                <div style="display: flex; align-items: center; gap: 0.4rem;">
                  <span>📞</span>
                  <strong>${this.escapeHtml(s.phone)}</strong>
                </div>
              ` : ''}
              ${s.rfc ? `
                <div style="display: flex; align-items: center; gap: 0.4rem;">
                  <span>🏷️</span>
                  <span>RFC: <code>${this.escapeHtml(s.rfc)}</code></span>
                </div>
              ` : ''}
              ${s.address ? `
                <div style="display: flex; align-items: center; gap: 0.4rem;">
                  <span>📍</span>
                  <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(s.address)}</span>
                </div>
              ` : ''}
              ${s.notes ? `
                <div style="display: flex; align-items: flex-start; gap: 0.4rem; background: #f8fafc; padding: 0.4rem 0.6rem; border-radius: 6px; font-size: 0.76rem; color: #475569; margin-top: 0.2rem;">
                  <span>📝</span>
                  <span style="font-style: italic;">${this.escapeHtml(s.notes)}</span>
                </div>
              ` : ''}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.85rem; padding: 0.5rem 0.75rem; background: #f8fafc; border-radius: 8px; font-size: 0.8rem;">
              <span style="color: var(--text-secondary);">Compras registradas:</span>
              <strong style="color: var(--primary-blue); font-family: var(--font-mono);">${s.purchases_count || 0} (${this.formatCurrency(s.total_purchased || 0)})</strong>
            </div>
          </div>

          <div style="display: flex; gap: 0.5rem; margin-top: 1rem; border-top: 1px solid #f1f5f9; padding-top: 0.75rem;">
            <button class="meta-btn" style="flex: 1; font-size: 0.8rem; padding: 0.45rem 0.5rem; justify-content: center; background: #f1f5f9; color: var(--primary-blue);" onclick="SuppliersModule.openEditModal(${s.id})">
              <span>✏️</span> <span>Modificar</span>
            </button>
            <button class="meta-btn" style="font-size: 0.8rem; padding: 0.45rem 0.6rem; background: #fef2f2; color: #dc2626;" title="Eliminar o desactivar proveedor" onclick="SuppliersModule.confirmDelete(${s.id}, '${this.escapeJs(s.name)}')">
              <span>🗑️</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  openCreateModal() {
    this.currentEditingId = null;
    const modalTitle = document.getElementById('modal-supplier-title');
    if (modalTitle) modalTitle.innerText = '➕ Registrar Nuevo Proveedor';

    document.getElementById('supplier-name').value = '';
    document.getElementById('supplier-contact').value = '';
    document.getElementById('supplier-phone').value = '';
    document.getElementById('supplier-email').value = '';
    document.getElementById('supplier-rfc').value = '';
    document.getElementById('supplier-address').value = '';
    document.getElementById('supplier-notes').value = '';

    App.openModal('modal-supplier-form');
    setTimeout(() => document.getElementById('supplier-name')?.focus(), 150);
  },

  async openEditModal(supplierId) {
    try {
      const res = await fetch(`/api/suppliers/${supplierId}`);
      if (!res.ok) throw new Error('No se pudo obtener información del proveedor');
      const s = await res.json();

      this.currentEditingId = supplierId;
      const modalTitle = document.getElementById('modal-supplier-title');
      if (modalTitle) modalTitle.innerText = `✏️ Modificar Proveedor: ${s.name}`;

      document.getElementById('supplier-name').value = s.name || '';
      document.getElementById('supplier-contact').value = s.contact_name || '';
      document.getElementById('supplier-phone').value = s.phone || '';
      document.getElementById('supplier-email').value = s.email || '';
      document.getElementById('supplier-rfc').value = s.rfc || '';
      document.getElementById('supplier-address').value = s.address || '';
      document.getElementById('supplier-notes').value = s.notes || '';

      App.openModal('modal-supplier-form');
    } catch (err) {
      console.error(err);
      App.showToast('Error al cargar datos del proveedor', 'error');
    }
  },

  async saveSupplier() {
    const name = document.getElementById('supplier-name').value.trim();
    if (!name) {
      App.showToast('El nombre de la empresa o proveedor es obligatorio', 'error');
      document.getElementById('supplier-name').focus();
      return;
    }

    const payload = {
      name,
      contact_name: document.getElementById('supplier-contact').value.trim(),
      phone: document.getElementById('supplier-phone').value.trim(),
      email: document.getElementById('supplier-email').value.trim(),
      rfc: document.getElementById('supplier-rfc').value.trim(),
      address: document.getElementById('supplier-address').value.trim(),
      notes: document.getElementById('supplier-notes').value.trim()
    };

    const isEdit = this.currentEditingId !== null;
    const url = isEdit ? `/api/suppliers/${this.currentEditingId}` : '/api/suppliers';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Error al guardar proveedor');
      }

      App.showToast(isEdit ? 'Proveedor modificado exitosamente' : 'Proveedor registrado con éxito', 'success');
      App.closeModal('modal-supplier-form');
      this.loadSuppliers();

      // Si el módulo de compras está presente, refrescar selector de proveedores
      if (window.PurchasesModule && typeof PurchasesModule.loadSuppliersDropdown === 'function') {
        PurchasesModule.loadSuppliersDropdown();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async confirmDelete(supplierId, name) {
    if (!confirm(`¿Estás seguro de que deseas eliminar o dar de baja al proveedor "${name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/suppliers/${supplierId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al eliminar proveedor');

      App.showToast(data.message || 'Proveedor eliminado', 'success');
      this.loadSuppliers();

      if (window.PurchasesModule && typeof PurchasesModule.loadSuppliersDropdown === 'function') {
        PurchasesModule.loadSuppliersDropdown();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  formatCurrency(val) {
    return '$' + Number(val || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  escapeJs(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'");
  }
};

window.SuppliersModule = SuppliersModule;
