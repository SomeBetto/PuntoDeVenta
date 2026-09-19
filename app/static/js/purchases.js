/**
 * purchases.js - Módulo de Registro y Control de Compras a Proveedores
 * Maneja captura interactiva, actualización de costos e inventario, y consulta histórica.
 */

const PurchasesModule = {
  cart: [],
  suppliers: [],
  activeSubTab: 'new', // 'new' | 'history'
  searchDebounceTimer: null,

  init() {
    this.bindEvents();
    this.loadSuppliersDropdown();
    this.loadNextFolio();
    setTimeout(() => {
      const input = document.getElementById('purchase-product-search');
      if (input && this.activeSubTab === 'new') input.focus();
    }, 150);
  },

  bindEvents() {
    // Pestañas internas de Compras (Nueva Compra vs Historial)
    const tabNew = document.getElementById('tab-purchase-new');
    const tabHist = document.getElementById('tab-purchase-history');

    if (tabNew) tabNew.addEventListener('click', () => this.switchSubTab('new'));
    if (tabHist) tabHist.addEventListener('click', () => this.switchSubTab('history'));

    // Búsqueda de productos para compra
    const searchInput = document.getElementById('purchase-product-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.handleProductSearch(e.target.value.trim()));
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleSearchEnter(searchInput.value.trim());
        }
      });
    }

    // Atrapador de escáner cuando el foco no está en el buscador
    window.addEventListener('keydown', (e) => {
      if (App.currentView === 'purchases' && this.activeSubTab === 'new') {
        const input = document.getElementById('purchase-product-search');
        const active = document.activeElement;
        // Si no estamos en ningún campo de texto ni modal
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
          return;
        }
        if (document.querySelector('.modal-overlay.active')) {
          return;
        }
        // Si es una tecla alfanumérica típica de inicio de escaneo
        if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          if (input && active !== input) {
            input.focus();
          }
        }
      }
    });

    // Cerrar sugerencias al hacer clic fuera
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('purchase-search-results');
      if (dropdown && !dropdown.contains(e.target) && e.target !== searchInput) {
        dropdown.style.display = 'none';
      }
    });

    // Selector de proveedor: opción rápida para crear nuevo
    const supplierSelect = document.getElementById('purchase-supplier-select');
    if (supplierSelect) {
      supplierSelect.addEventListener('change', (e) => {
        if (e.target.value === '__new__') {
          e.target.value = '';
          if (window.SuppliersModule) SuppliersModule.openCreateModal();
        }
      });
    }

    // Botón Registrar Compra
    const btnSubmit = document.getElementById('btn-submit-purchase');
    if (btnSubmit) {
      btnSubmit.addEventListener('click', () => this.submitPurchase());
    }

    // Botón Limpiar Carrito
    const btnClear = document.getElementById('btn-clear-purchase');
    if (btnClear) {
      btnClear.addEventListener('click', () => this.clearCart());
    }

    // Filtros de Historial
    const histSearch = document.getElementById('purchase-history-search');
    if (histSearch) {
      histSearch.addEventListener('input', () => this.loadHistory());
    }
  },

  switchSubTab(tab) {
    this.activeSubTab = tab;
    const tabNew = document.getElementById('tab-purchase-new');
    const tabHist = document.getElementById('tab-purchase-history');
    const paneNew = document.getElementById('pane-purchase-new');
    const paneHist = document.getElementById('pane-purchase-history');

    if (tab === 'new') {
      tabNew?.classList.add('active');
      tabHist?.classList.remove('active');
      if (paneNew) paneNew.style.display = 'block';
      if (paneHist) paneHist.style.display = 'none';
      setTimeout(() => document.getElementById('purchase-product-search')?.focus(), 100);
    } else {
      tabHist?.classList.add('active');
      tabNew?.classList.remove('active');
      if (paneNew) paneNew.style.display = 'none';
      if (paneHist) paneHist.style.display = 'block';
      this.loadHistory();
    }
  },

  async loadSuppliersDropdown() {
    try {
      const res = await fetch('/api/suppliers');
      if (!res.ok) return;
      this.suppliers = await res.json();

      const select = document.getElementById('purchase-supplier-select');
      if (!select) return;

      const currentVal = select.value;
      select.innerHTML = `
        <option value="">-- Seleccionar Proveedor --</option>
        ${this.suppliers.map(s => `
          <option value="${s.id}">${this.escapeHtml(s.name)} ${s.phone ? `(${s.phone})` : ''}</option>
        `).join('')}
        <option value="__new__">➕ + Registrar Nuevo Proveedor...</option>
      `;

      if (currentVal && select.querySelector(`option[value="${currentVal}"]`)) {
        select.value = currentVal;
      }
    } catch (err) {
      console.error('Error cargando proveedores:', err);
    }
  },

  async loadNextFolio() {
    try {
      const res = await fetch('/api/purchases/next-folio');
      if (res.ok) {
        const data = await res.json();
        const folioEl = document.getElementById('purchase-folio-display');
        const folioInput = document.getElementById('purchase-folio-input');
        if (folioEl) folioEl.innerText = data.folio;
        if (folioInput) folioInput.value = data.folio;
      }
    } catch (err) {
      console.error('Error cargando siguiente folio:', err);
    }
  },

  handleProductSearch(term) {
    clearTimeout(this.searchDebounceTimer);
    const dropdown = document.getElementById('purchase-search-results');
    if (!dropdown) return;

    if (!term || term.length < 2) {
      dropdown.style.display = 'none';
      return;
    }

    this.searchDebounceTimer = setTimeout(async () => {
      try {
        const cleanTerm = window.BarcodeUtils ? BarcodeUtils.clean(term) : term;
        const res = await fetch(`/api/products?query=${encodeURIComponent(cleanTerm || term)}`);
        const products = await res.json();
        this.renderSearchResults(products);
      } catch (err) {
        console.error('Error buscando productos:', err);
      }
    }, 200);
  },

  renderSearchResults(products) {
    const dropdown = document.getElementById('purchase-search-results');
    if (!dropdown) return;

    if (!products || products.length === 0) {
      dropdown.innerHTML = `
        <div style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.85rem; text-align: center;">
          No se encontraron productos con ese código o nombre.
        </div>
      `;
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = products.slice(0, 10).map(p => `
      <div class="search-result-item" style="
        padding: 0.6rem 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #f1f5f9;
        cursor: pointer;
        transition: background 0.15s;
      " onclick="PurchasesModule.addCartItem(${p.id}, '${this.escapeJs(p.name)}', '${p.barcode || ''}', ${p.cost_price || 0}, ${p.sale_price || 0}, '${p.unit || 'pz'}')">
        <div>
          <div style="font-weight: 700; font-size: 0.88rem; color: var(--text-primary);">${this.escapeHtml(p.name)}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.1rem;">
            <code>${p.barcode || 'Sin código'}</code> • Stock actual: <strong>${p.stock} ${p.unit}</strong>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 0.85rem; font-weight: 800; color: var(--primary-blue); font-family: var(--font-mono);">
            Costo: $${Number(p.cost_price || 0).toFixed(2)}
          </div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">
            Venta: $${Number(p.sale_price || 0).toFixed(2)}
          </div>
        </div>
      </div>
    `).join('');

    dropdown.style.display = 'block';
  },

  async handleSearchEnter(term) {
    if (!term) return;
    const searchInput = document.getElementById('purchase-product-search');
    const dropdown = document.getElementById('purchase-search-results');
    if (dropdown) dropdown.style.display = 'none';

    try {
      // Limpieza de prefijos de escáneres (AIM, letras iniciales B/E/D/C, etc.)
      const cleanTerm = window.BarcodeUtils ? BarcodeUtils.clean(term) : term.trim();
      const res = await fetch(`/api/products?query=${encodeURIComponent(cleanTerm || term)}`);
      const products = await res.json();

      // Buscar coincidencia inteligente
      let match = window.BarcodeUtils ? BarcodeUtils.findMatch(products, term) : null;
      if (!match && cleanTerm) {
        match = window.BarcodeUtils ? BarcodeUtils.findMatch(products, cleanTerm) : null;
      }

      // Si es producto único resultante
      if (!match && products.length === 1) {
        match = products[0];
      }

      if (match) {
        // AGREGAR AUTOMÁTICAMENTE A LA LISTA DE COMPRA
        this.addCartItem(match.id, match.name, match.barcode, match.cost_price, match.sale_price, match.unit);
        // Borrar el cuadro de búsqueda y mantener foco para el siguiente escaneo
        if (searchInput) {
          searchInput.value = '';
          setTimeout(() => searchInput.focus(), 60);
        }
      } else if (products.length > 1) {
        // Si hay varios (búsqueda por nombre), mostrar sugerencias
        this.renderSearchResults(products);
      } else {
        App.showToast(`Producto "${cleanTerm || term}" no encontrado en el catálogo`, 'warning');
        if (searchInput) {
          searchInput.value = '';
          setTimeout(() => searchInput.focus(), 60);
        }
      }
    } catch (err) {
      console.error(err);
      if (searchInput) {
        searchInput.value = '';
        setTimeout(() => searchInput.focus(), 60);
      }
    }
  },

  addCartItem(productId, name, barcode, costPrice, salePrice, unit = 'pz') {
    const searchInput = document.getElementById('purchase-product-search');
    const dropdown = document.getElementById('purchase-search-results');
    if (dropdown) dropdown.style.display = 'none';

    // Borrar el texto del buscador y mantener el foco listo para el siguiente producto
    if (searchInput) {
      searchInput.value = '';
      setTimeout(() => searchInput.focus(), 60);
    }

    // Verificar si ya está en la tabla de compra
    const existingIndex = this.cart.findIndex(i => i.product_id === productId);
    if (existingIndex >= 0) {
      this.cart[existingIndex].quantity += 1;
      this.cart[existingIndex].subtotal = round2(this.cart[existingIndex].quantity * this.cart[existingIndex].unit_cost);
    } else {
      const cost = Number(costPrice) > 0 ? Number(costPrice) : (Number(salePrice) * 0.75 || 10.0);
      this.cart.push({
        product_id: productId,
        product_name: name,
        barcode: barcode || '',
        quantity: 1,
        unit: unit || 'pz',
        unit_cost: round2(cost),
        sale_price: Number(salePrice) || 0,
        subtotal: round2(cost)
      });
    }

    this.renderCart();
    App.showToast(`Agregado a compra: ${name}`, 'success');

    // Doble confirmación de foco en el buscador de compras
    if (searchInput) {
      searchInput.value = '';
      setTimeout(() => searchInput.focus(), 80);
    }
  },

  updateItemQty(index, val) {
    const qty = parseFloat(val);
    if (isNaN(qty) || qty <= 0) {
      App.showToast('La cantidad debe ser mayor a 0', 'warning');
      return;
    }
    this.cart[index].quantity = qty;
    this.cart[index].subtotal = round2(this.cart[index].quantity * this.cart[index].unit_cost);
    this.renderCart();
  },

  updateItemCost(index, val) {
    const cost = parseFloat(val);
    if (isNaN(cost) || cost < 0) {
      App.showToast('El costo unitario no puede ser negativo', 'warning');
      return;
    }
    this.cart[index].unit_cost = round2(cost);
    this.cart[index].subtotal = round2(this.cart[index].quantity * this.cart[index].unit_cost);
    this.renderCart();
  },

  removeCartItem(index) {
    this.cart.splice(index, 1);
    this.renderCart();
  },

  clearCart() {
    if (this.cart.length === 0) return;
    if (confirm('¿Deseas limpiar todos los productos de esta compra?')) {
      this.cart = [];
      this.renderCart();
    }
  },

  renderCart() {
    const tbody = document.getElementById('purchases-table-body');
    const totalUnitsEl = document.getElementById('purchase-total-units');
    const totalAmountEl = document.getElementById('purchase-total-amount');
    const pillBtnTotal = document.getElementById('purchase-pill-btn-text');

    if (!tbody) return;

    if (this.cart.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
            <div style="font-size: 2.5rem; margin-bottom: 0.4rem;">📦</div>
            <div style="font-size: 1rem; font-weight: 700; color: var(--text-secondary);">No hay productos en esta orden de compra</div>
            <div style="font-size: 0.8rem; margin-top: 0.25rem;">Usa la barra superior para buscar productos por código de barras o nombre y agregarlos.</div>
          </td>
        </tr>
      `;
      if (totalUnitsEl) totalUnitsEl.innerText = '0 pzas';
      if (totalAmountEl) totalAmountEl.innerText = '$0.00 MXN';
      if (pillBtnTotal) pillBtnTotal.innerText = '(0) $0.00 MXN';
      return;
    }

    let totalUnits = 0;
    let totalSum = 0;

    tbody.innerHTML = this.cart.map((item, idx) => {
      totalUnits += item.quantity;
      totalSum += item.subtotal;

      return `
        <tr>
          <td style="text-align: center; color: var(--text-muted); font-size: 0.85rem;">${idx + 1}</td>
          <td style="width: 110px;">
            <div style="display: flex; align-items: center; gap: 0.25rem;">
              <button type="button" class="modal-stepper-btn" style="width: 24px; height: 24px; font-size: 0.8rem;" onclick="PurchasesModule.stepItemQty(${idx}, -1)">−</button>
              <input 
                type="number" 
                step="any" 
                class="form-input" 
                style="width: 54px; text-align: center; font-weight: 800; padding: 0.25rem 0.1rem; font-size: 0.88rem;" 
                value="${item.quantity}" 
                onchange="PurchasesModule.updateItemQty(${idx}, this.value)"
              >
              <button type="button" class="modal-stepper-btn" style="width: 24px; height: 24px; font-size: 0.8rem;" onclick="PurchasesModule.stepItemQty(${idx}, 1)">+</button>
            </div>
          </td>
          <td>
            <span class="unit-chip" style="font-size: 0.72rem;">${this.escapeHtml(item.unit.toUpperCase())}</span>
          </td>
          <td>
            <div class="product-cell-group">
              <div class="product-thumb" style="font-size: 1.1rem;">📦</div>
              <div class="product-cell-info">
                <span class="product-cell-name" style="font-size: 0.9rem; font-weight: 700;">${this.escapeHtml(item.product_name)}</span>
                <span class="product-cell-code">${item.barcode || 'Sin código'}</span>
              </div>
            </div>
          </td>
          <td style="text-align: right; width: 130px;">
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 0.3rem;">
              <span style="font-size: 0.85rem; color: var(--text-secondary);">$</span>
              <input 
                type="number" 
                step="0.01" 
                class="form-input" 
                style="width: 85px; text-align: right; font-family: var(--font-mono); font-weight: 700; padding: 0.25rem 0.3rem; font-size: 0.88rem;" 
                value="${item.unit_cost.toFixed(2)}" 
                onchange="PurchasesModule.updateItemCost(${idx}, this.value)"
              >
            </div>
          </td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 800; font-size: 0.95rem; color: var(--text-primary);">
            $${item.subtotal.toFixed(2)}
          </td>
          <td style="text-align: center; width: 45px;">
            <button class="meta-btn" style="padding: 0.3rem 0.45rem; color: #ef4444; background: #fee2e2;" title="Quitar de la lista" onclick="PurchasesModule.removeCartItem(${idx})">
              ✕
            </button>
          </td>
        </tr>
      `;
    }).join('');

    if (totalUnitsEl) totalUnitsEl.innerText = `${totalUnits} unidades`;
    if (totalAmountEl) totalAmountEl.innerText = `$${totalSum.toFixed(2)} MXN`;
    if (pillBtnTotal) pillBtnTotal.innerText = `(${this.cart.length} partidas) $${totalSum.toFixed(2)} MXN`;
  },

  stepItemQty(index, delta) {
    const newQty = Math.max(1, this.cart[index].quantity + delta);
    this.updateItemQty(index, newQty);
  },

  async submitPurchase() {
    if (this.cart.length === 0) {
      App.showToast('Agrega al menos un producto a la orden de compra', 'warning');
      return;
    }

    const supplierSelect = document.getElementById('purchase-supplier-select');
    const supplierId = supplierSelect && supplierSelect.value ? parseInt(supplierSelect.value) : null;
    const folioInput = document.getElementById('purchase-folio-input');
    const folio = folioInput ? folioInput.value.trim() : '';
    const invoiceInput = document.getElementById('purchase-invoice-input');
    const invoiceNumber = invoiceInput ? invoiceInput.value.trim() : '';
    const methodSelect = document.getElementById('purchase-payment-method');
    const paymentMethod = methodSelect ? methodSelect.value : 'EFECTIVO';
    const notesInput = document.getElementById('purchase-notes-input');
    const notes = notesInput ? notesInput.value.trim() : '';

    const chkCashOut = document.getElementById('purchase-chk-cashout');
    const registerCashOut = chkCashOut ? chkCashOut.checked : true;

    const chkUpdateCosts = document.getElementById('purchase-chk-updatecosts');
    const updateCosts = chkUpdateCosts ? chkUpdateCosts.checked : true;

    const payload = {
      supplier_id: supplierId,
      folio: folio,
      invoice_number: invoiceNumber,
      payment_method: paymentMethod,
      notes: notes,
      register_cash_out: registerCashOut,
      update_cost_prices: updateCosts,
      items: this.cart.map(i => ({
        product_id: i.product_id,
        product_name: i.product_name,
        barcode: i.barcode,
        quantity: i.quantity,
        unit: i.unit,
        unit_cost: i.unit_cost,
        subtotal: i.subtotal
      }))
    };

    try {
      const btn = document.getElementById('btn-submit-purchase');
      if (btn) btn.disabled = true;

      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Error registrando compra');
      }

      const created = await res.json();

      let msg = `¡Compra ${created.folio} registrada exitosamente! Se ingresaron ${created.items_count} productos al inventario.`;
      if (created.cash_movement_registered) {
        msg += ' (Egreso registrado en caja)';
      }
      App.showToast(msg, 'success');

      // Limpiar formulario
      this.cart = [];
      this.renderCart();
      if (invoiceInput) invoiceInput.value = '';
      if (notesInput) notesInput.value = '';
      this.loadNextFolio();

      // Refrescar inventario si está disponible
      if (window.InventoryModule && typeof InventoryModule.loadProducts === 'function') {
        InventoryModule.loadProducts();
      }

      // Si caja está abierta y se registró egreso, refrescar caja
      if (created.cash_movement_registered && window.CashModule) {
        CashModule.loadCurrentShift();
      }

    } catch (err) {
      App.showToast(err.message, 'error');
    } finally {
      const btn = document.getElementById('btn-submit-purchase');
      if (btn) btn.disabled = false;
    }
  },

  async loadHistory() {
    const container = document.getElementById('purchases-history-tbody');
    const searchVal = document.getElementById('purchase-history-search')?.value.trim() || '';

    if (!container) return;

    try {
      const url = searchVal ? `/api/purchases?query=${encodeURIComponent(searchVal)}` : '/api/purchases';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Error al cargar historial de compras');
      const purchases = await res.json();

      if (purchases.length === 0) {
        container.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
              <div style="font-size: 2.5rem; margin-bottom: 0.4rem;">🧾</div>
              <div style="font-size: 1rem; font-weight: 700; color: var(--text-secondary);">No hay compras registradas</div>
              <p style="font-size: 0.8rem; margin-top: 0.25rem;">Tus compras finalizadas aparecerán listadas aquí con fecha, proveedor y montos.</p>
            </td>
          </tr>
        `;
        return;
      }

      container.innerHTML = purchases.map(p => {
        const dateStr = new Date(p.created_at).toLocaleString('es-MX', {
          dateStyle: 'short',
          timeStyle: 'short'
        });

        return `
          <tr>
            <td>
              <strong style="color: var(--primary-blue); font-family: var(--font-mono); font-size: 0.9rem;">
                ${this.escapeHtml(p.folio || `#${p.id}`)}
              </strong>
            </td>
            <td style="font-size: 0.82rem; color: var(--text-secondary); white-space: nowrap;">
              📅 ${dateStr}
            </td>
            <td>
              <div style="font-weight: 700; font-size: 0.88rem; color: var(--text-primary);">
                ${this.escapeHtml(p.supplier_name)}
              </div>
              ${p.invoice_number ? `<div style="font-size: 0.75rem; color: var(--text-secondary);">Factura: <code>${this.escapeHtml(p.invoice_number)}</code></div>` : ''}
            </td>
            <td>
              <span class="unit-chip" style="font-size: 0.72rem; font-weight: 700;">
                ${p.payment_method}
              </span>
            </td>
            <td style="text-align: center;">
              <span style="background: #eff6ff; color: #1d4ed8; padding: 0.2rem 0.5rem; border-radius: 6px; font-weight: 700; font-size: 0.78rem;">
                ${p.items_count || 1} arts.
              </span>
            </td>
            <td style="text-align: right; font-family: var(--font-mono); font-weight: 800; font-size: 1rem; color: var(--accent-green-dark);">
              $${Number(p.total).toFixed(2)}
            </td>
            <td style="text-align: center; white-space: nowrap;">
              <button class="meta-btn" style="padding: 0.35rem 0.7rem; font-size: 0.78rem; background: #f1f5f9; color: var(--primary-blue);" onclick="PurchasesModule.viewPurchaseDetail(${p.id})">
                👁️ Ver Partidas
              </button>
              <button class="meta-btn" style="padding: 0.35rem 0.6rem; font-size: 0.78rem; background: #fef2f2; color: #dc2626;" title="Cancelar compra y revertir existencias" onclick="PurchasesModule.confirmCancel(${p.id}, '${this.escapeJs(p.folio || `#${p.id}`)}')">
                ✕ Cancelar
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error(err);
      App.showToast('Error cargando historial de compras', 'error');
    }
  },

  async viewPurchaseDetail(purchaseId) {
    try {
      const res = await fetch(`/api/purchases/${purchaseId}`);
      if (!res.ok) throw new Error('No se pudo cargar el detalle de la compra');
      const data = await res.json();

      const folioEl = document.getElementById('modal-purchase-detail-folio');
      const supplierEl = document.getElementById('modal-purchase-detail-supplier');
      const dateEl = document.getElementById('modal-purchase-detail-date');
      const totalEl = document.getElementById('modal-purchase-detail-total');
      const tbody = document.getElementById('modal-purchase-detail-tbody');

      if (folioEl) folioEl.innerText = data.folio || `#${data.id}`;
      if (supplierEl) supplierEl.innerText = `${data.supplier_name} ${data.invoice_number ? `(Factura: ${data.invoice_number})` : ''}`;
      if (dateEl) dateEl.innerText = new Date(data.created_at).toLocaleString();
      if (totalEl) totalEl.innerText = `$${Number(data.total).toFixed(2)} MXN`;

      if (tbody) {
        tbody.innerHTML = (data.items || []).map((i, idx) => `
          <tr>
            <td style="text-align: center; color: var(--text-muted); font-size: 0.8rem;">${idx + 1}</td>
            <td><strong>${this.escapeHtml(i.product_name)}</strong> <small style="color: var(--text-secondary);">(${i.barcode || 'S/C'})</small></td>
            <td style="text-align: center;">${i.quantity} ${i.unit}</td>
            <td style="text-align: right; font-family: var(--font-mono);">$${Number(i.unit_cost).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono); font-weight: 700;">$${Number(i.subtotal).toFixed(2)}</td>
          </tr>
        `).join('');
      }

      App.openModal('modal-purchase-detail');
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async confirmCancel(purchaseId, folio) {
    if (!confirm(`⚠️ ¿ATENCIÓN: Deseas cancelar la compra ${folio}?\n\nEsta acción revertirá automáticamente el stock de los productos que ingresaron con esta compra.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/purchases/${purchaseId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error cancelando compra');

      App.showToast(data.message || 'Compra cancelada', 'success');
      this.loadHistory();

      if (window.InventoryModule && typeof InventoryModule.loadProducts === 'function') {
        InventoryModule.loadProducts();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
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

function round2(num) {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

window.PurchasesModule = PurchasesModule;
