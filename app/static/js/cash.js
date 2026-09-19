/**
 * MÓDULO DE CONTROL DE CAJA (TURNOS, INGRESOS/EGRESOS Y CORTES X/Z)
 */

const CashModule = {
  currentShiftData: null,

  init() {
    this.bindEvents();
    this.loadCurrentShift();
    this.loadCashiersList();
  },

  async loadCashiersList() {
    const select = document.getElementById('open-shift-cashier-input');
    if (!select) return;

    try {
      const res = await fetch('/api/cash/cashiers');
      if (res.ok) {
        const cashiers = await res.json();
        select.innerHTML = cashiers.map(c => `
          <option value="${c.name}" ${c.username === 'admin' || c.name.toLowerCase().includes('admin') ? 'selected' : ''}>
            ${c.name} (${c.role})
          </option>
        `).join('');
      }
    } catch (e) {
      console.error('Error cargando cajeros:', e);
    }
  },

  bindEvents() {
    const openShiftBtn = document.getElementById('btn-open-shift');
    if (openShiftBtn) {
      openShiftBtn.addEventListener('click', () => this.openShift());
    }

    const movementBtn = document.getElementById('btn-add-movement');
    if (movementBtn) {
      movementBtn.addEventListener('click', () => this.openCashOutModal());
    }

    // Navegación con tecla Enter en el modal de movimientos (F8/F9)
    const amountInput = document.getElementById('movement-amount-input');
    const conceptInput = document.getElementById('movement-concept-input');
    if (amountInput) {
      amountInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (conceptInput) conceptInput.focus();
        }
      });
    }
    if (conceptInput) {
      conceptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.saveCashMovement();
        }
      });
    }

    const saveMovementBtn = document.getElementById('btn-save-movement');
    if (saveMovementBtn) {
      saveMovementBtn.addEventListener('click', () => this.saveCashMovement());
    }

    const closeShiftBtn = document.getElementById('btn-close-shift');
    if (closeShiftBtn) {
      closeShiftBtn.addEventListener('click', () => {
        if (!this.currentShiftData || !this.currentShiftData.has_open_shift) return;
        document.getElementById('close-shift-expected').innerText = `$${this.currentShiftData.expected_cash.toFixed(2)}`;
        document.getElementById('close-shift-real-input').value = this.currentShiftData.expected_cash.toFixed(2);
        document.getElementById('close-shift-notes-input').value = '';
        this.calculateCloseDiff();
        document.getElementById('close-shift-modal').classList.add('active');
      });
    }

    const realInput = document.getElementById('close-shift-real-input');
    if (realInput) {
      realInput.addEventListener('input', () => this.calculateCloseDiff());
    }

    const confirmCloseBtn = document.getElementById('btn-confirm-close-shift');
    if (confirmCloseBtn) {
      confirmCloseBtn.addEventListener('click', () => this.confirmCloseShift());
    }
  },

  async loadCurrentShift() {
    try {
      const res = await fetch('/api/cash/current');
      this.currentShiftData = await res.json();
      this.renderShiftView();
    } catch (e) {
      console.error(e);
    }
  },

  renderShiftView() {
    const openContainer = document.getElementById('cash-shift-active-view');
    const closedContainer = document.getElementById('cash-shift-closed-view');

    if (!this.currentShiftData || !this.currentShiftData.has_open_shift) {
      if (openContainer) openContainer.style.display = 'none';
      if (closedContainer) closedContainer.style.display = 'block';
      return;
    }

    if (openContainer) openContainer.style.display = 'block';
    if (closedContainer) closedContainer.style.display = 'none';

    const d = this.currentShiftData;
    const cashierName = d.shift.cashier_name || 'Admin';
    const shiftInfoEl = document.getElementById('drawer-shift-info');
    if (shiftInfoEl) {
      shiftInfoEl.innerText = `Turno Activo • ${cashierName}`;
    }
    const cashCashierEl = document.getElementById('cash-shift-cashier-badge');
    if (cashCashierEl) {
      cashCashierEl.innerText = `👤 Cajero: ${cashierName}`;
    }

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.innerText = val;
    };

    if (d.shift && d.shift.opened_at) {
      setVal('cash-opened-at', new Date(d.shift.opened_at).toLocaleString());
    }
    setVal('cash-initial-val', `$${(d.initial_cash || 0).toFixed(2)}`);
    setVal('cash-sales-val', `$${(d.cash_sales || 0).toFixed(2)}`);
    setVal('cash-card-val', `$${(d.card_sales || 0).toFixed(2)}`);
    setVal('cash-transfer-val', `$${(d.transfer_sales || 0).toFixed(2)}`);
    setVal('cash-fiado-val', `$${(d.fiado_sales || 0).toFixed(2)}`);
    setVal('cash-ingresos-val', `+$${(d.total_ingresos || 0).toFixed(2)}`);
    setVal('cash-egresos-val', `-$${(d.total_egresos || 0).toFixed(2)}`);
    setVal('cash-expected-val', `$${(d.expected_cash || 0).toFixed(2)}`);

    // Renderizar movimientos recientes
    const movList = document.getElementById('cash-movements-table-body');
    if (movList) {
      if (d.movements.length === 0) {
        movList.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-dim); padding:1rem;">Sin movimientos extraordinarios registrados</td></tr>';
      } else {
        movList.innerHTML = d.movements.map(m => {
          const isIngreso = m.type === 'INGRESO';
          return `
            <tr>
              <td><span style="color: ${isIngreso ? 'var(--primary-light)' : 'var(--danger)'}; font-weight:700;">${m.type}</span></td>
              <td>${m.concept}</td>
              <td style="font-family: var(--font-mono); font-weight:700; color:${isIngreso ? 'var(--primary-light)' : 'var(--danger)'};">
                ${isIngreso ? '+' : '-'}$${m.amount.toFixed(2)}
              </td>
              <td style="font-size:0.8rem; color:var(--text-dim);">${new Date(m.created_at).toLocaleTimeString()}</td>
            </tr>
          `;
        }).join('');
      }
    }
  },

  async openShift() {
    const initialCash = parseFloat(document.getElementById('open-shift-initial-input').value) || 0;
    const cashierSelect = document.getElementById('open-shift-cashier-input');
    const cashierName = cashierSelect ? (cashierSelect.value.trim() || 'Admin') : 'Admin';

    try {
      const res = await fetch('/api/cash/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashier_name: cashierName, initial_cash: initialCash })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al abrir caja');

      App.showToast('Turno de caja abierto correctamente', 'success');
      this.loadCurrentShift();
    } catch (e) {
      App.showToast(e.message, 'error');
    }
  },

  async saveCashMovement() {
    const type = document.getElementById('movement-type-select').value;
    const amount = parseFloat(document.getElementById('movement-amount-input').value);
    const concept = document.getElementById('movement-concept-input').value.trim();

    if (isNaN(amount) || amount <= 0) {
      App.showToast('El monto debe ser mayor a 0', 'error');
      return;
    }
    if (!concept) {
      App.showToast('El concepto o motivo es obligatorio', 'error');
      return;
    }

    try {
      const res = await fetch('/api/cash/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: type, amount: amount, concept: concept })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al registrar movimiento');

      App.showToast(data.message, 'success');
      document.getElementById('cash-movement-modal').classList.remove('active');
      this.loadCurrentShift();
    } catch (e) {
      App.showToast(e.message, 'error');
    }
  },

  calculateCloseDiff() {
    if (!this.currentShiftData) return;
    const expected = this.currentShiftData.expected_cash;
    const real = parseFloat(document.getElementById('close-shift-real-input').value) || 0;
    const diff = real - expected;
    const diffEl = document.getElementById('close-shift-diff');

    if (diff === 0) {
      diffEl.innerText = '$0.00 (Cuadre exacto)';
      diffEl.style.color = 'var(--primary-light)';
    } else if (diff > 0) {
      diffEl.innerText = `+$${diff.toFixed(2)} (Sobrante)`;
      diffEl.style.color = 'var(--accent-light)';
    } else {
      diffEl.innerText = `-$${Math.abs(diff).toFixed(2)} (Faltante)`;
      diffEl.style.color = 'var(--danger)';
    }
  },

  openCashInModal() {
    const typeSelect = document.getElementById('movement-type-select');
    if (typeSelect) typeSelect.value = 'INGRESO';
    const titleEl = document.getElementById('cash-movement-modal-title');
    if (titleEl) titleEl.innerText = '📥 Entrada de Efectivo a Caja (F8)';
    const amtEl = document.getElementById('movement-amount-input');
    const cptEl = document.getElementById('movement-concept-input');
    if (amtEl) amtEl.value = '';
    if (cptEl) {
      cptEl.value = '';
      cptEl.placeholder = 'Ej: Cambio para caja, depósito inicial adicional';
    }
    const modal = document.getElementById('cash-movement-modal');
    if (modal) {
      modal.classList.add('active');
      setTimeout(() => { if (amtEl) amtEl.focus(); }, 120);
    }
  },

  openCashOutModal() {
    const typeSelect = document.getElementById('movement-type-select');
    if (typeSelect) typeSelect.value = 'EGRESO';
    const titleEl = document.getElementById('cash-movement-modal-title');
    if (titleEl) titleEl.innerText = '📤 Salida / Retiro de Efectivo de Caja (F9)';
    const amtEl = document.getElementById('movement-amount-input');
    const cptEl = document.getElementById('movement-concept-input');
    if (amtEl) amtEl.value = '';
    if (cptEl) {
      cptEl.value = '';
      cptEl.placeholder = 'Ej: Pago a repartidor Bimbo / Coca-Cola, compra de insumos';
    }
    const modal = document.getElementById('cash-movement-modal');
    if (modal) {
      modal.classList.add('active');
      setTimeout(() => { if (amtEl) amtEl.focus(); }, 120);
    }
  },

  async confirmCloseShift() {
    const real = parseFloat(document.getElementById('close-shift-real-input').value);
    const notes = document.getElementById('close-shift-notes-input').value.trim();

    if (isNaN(real) || real < 0) {
      App.showToast('Ingrese el dinero físico contado en caja', 'error');
      return;
    }

    try {
      const res = await fetch('/api/cash/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_cash_real: real, notes: notes })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al cerrar caja');

      App.showToast('Turno de caja cerrado exitosamente (Corte Z)', 'success');
      document.getElementById('close-shift-modal').classList.remove('active');
      this.loadCurrentShift();

      if (data.corte_data) {
        this.renderCorteTicket(data.corte_data);
        const ticketModal = document.getElementById('modal-corte-ticket');
        if (ticketModal) ticketModal.classList.add('active');
      }
    } catch (e) {
      App.showToast(e.message, 'error');
    }
  },

  async openCorteTicketModal() {
    try {
      const res = await fetch('/api/cash/corte-current');
      if (!res.ok) throw new Error('Error al obtener corte de caja');
      const data = await res.json();
      if (!data.has_shift) {
        App.showToast(data.message || 'No hay turno de caja registrado', 'warning');
        return;
      }
      this.renderCorteTicket(data);
      const modal = document.getElementById('modal-corte-ticket');
      if (modal) modal.classList.add('active');
    } catch (e) {
      App.showToast(e.message, 'error');
    }
  },

  renderCorteTicket(d) {
    const container = document.getElementById('corte-ticket-body');
    if (!container) return;

    const formatMoney = (n) => `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const openedStr = d.opened_at ? new Date(d.opened_at).toLocaleString() : 'N/D';
    const closedStr = d.closed_at ? new Date(d.closed_at).toLocaleString() : (d.status === 'OPEN' ? 'En curso (Corte Parcial X)' : 'Cerrado');
    const diff = d.difference !== undefined && d.difference !== null ? d.difference : 0;
    let diffColor = '#2563eb';
    let diffText = '$0.00 (Cuadre exacto)';
    if (diff > 0) {
      diffColor = '#16a34a';
      diffText = `+${formatMoney(diff)} (Sobrante)`;
    } else if (diff < 0) {
      diffColor = '#dc2626';
      diffText = `-${formatMoney(Math.abs(diff))} (Faltante)`;
    }

    const ingresosRows = (d.ingresos_list && d.ingresos_list.length > 0) ? d.ingresos_list.map(m => `
      <div style="display:flex; justify-content:space-between; font-size:0.8rem; padding:0.18rem 0; border-bottom:1px dotted #e2e8f0;">
        <span style="color:#047857;">📥 ${m.concept}</span>
        <strong style="color:#047857;">+${formatMoney(m.amount)}</strong>
      </div>
    `).join('') : '<div style="font-size:0.8rem; color:#64748b; font-style:italic; padding: 0.2rem 0;">Sin entradas extraordinarias registradas</div>';

    const egresosRows = (d.egresos_list && d.egresos_list.length > 0) ? d.egresos_list.map(m => `
      <div style="display:flex; justify-content:space-between; font-size:0.8rem; padding:0.18rem 0; border-bottom:1px dotted #e2e8f0;">
        <span style="color:#b91c1c;">📤 ${m.concept}</span>
        <strong style="color:#b91c1c;">-${formatMoney(m.amount)}</strong>
      </div>
    `).join('') : '<div style="font-size:0.8rem; color:#64748b; font-style:italic; padding: 0.2rem 0;">Sin salidas de caja registradas</div>';

    const salesByMethodKeys = Object.keys(d.sales_by_method || {});
    const salesByMethodRows = salesByMethodKeys.length > 0 ? salesByMethodKeys.map(m => `
      <div style="display:flex; justify-content:space-between; font-size:0.82rem; padding:0.2rem 0;">
        <span>${m} (${d.sales_by_method[m].count} ventas):</span>
        <strong>${formatMoney(d.sales_by_method[m].total)}</strong>
      </div>
    `).join('') : '<div style="font-size:0.8rem; color:#64748b; font-style:italic;">Sin ventas en el turno</div>';

    container.innerHTML = `
      <div id="printable-corte-ticket" style="font-family: 'JetBrains Mono', monospace, monospace; font-size: 0.85rem; line-height: 1.45; color: #111; max-width: 320px; margin: 0 auto; background: #fff; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="text-align: center; border-bottom: 1.5px dashed #334155; padding-bottom: 10px; margin-bottom: 10px;">
          <h2 style="font-size: 1.15rem; font-weight: 800; margin: 0; color: #0f172a;">${d.store_name || 'PUNTO DE VENTA'}</h2>
          ${d.store_address ? `<p style="font-size: 0.75rem; margin: 3px 0; color: #475569;">${d.store_address}</p>` : ''}
          ${d.store_phone ? `<p style="font-size: 0.75rem; margin: 2px 0; color: #475569;">Tel: ${d.store_phone}</p>` : ''}
          <div style="font-weight: 800; font-size: 0.95rem; margin-top: 8px; letter-spacing: 1px; color: #1e3a8a;">
            ${d.status === 'OPEN' ? '⚡ CORTE PARCIAL (CORTE X)' : '🔒 CORTE DEFINITIVO (CORTE Z)'}
          </div>
          <div style="font-size: 0.76rem; margin-top: 2px; color: #334155;">Turno #${d.shift_id} • Cajero: <strong>${d.cashier_name}</strong></div>
        </div>

        <div style="font-size: 0.78rem; border-bottom: 1px dashed #94a3b8; padding-bottom: 8px; margin-bottom: 8px; color: #334155;">
          <div><strong>Apertura:</strong> ${openedStr}</div>
          <div><strong>Corte:</strong> ${closedStr}</div>
        </div>

        <div style="border-bottom: 1.5px dashed #334155; padding-bottom: 8px; margin-bottom: 8px;">
          <div style="font-weight: 800; font-size: 0.82rem; margin-bottom: 6px; text-transform: uppercase; color: #1e293b;">1. Flujo y Cuadre de Efectivo</div>
          <div style="display:flex; justify-content:space-between; padding: 0.15rem 0;">
            <span>Fondo Inicial:</span>
            <strong>${formatMoney(d.initial_cash)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding: 0.15rem 0;">
            <span>(+) Ventas en Efectivo:</span>
            <strong>${formatMoney(d.cash_sales)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding: 0.15rem 0; color: #047857;">
            <span>(+) Entradas de Efectivo (F8):</span>
            <strong>+${formatMoney(d.total_ingresos)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding: 0.15rem 0; color: #b91c1c;">
            <span>(-) Salidas de Efectivo (F9):</span>
            <strong>-${formatMoney(d.total_egresos)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; border-top: 1.5px solid #0f172a; margin-top: 6px; padding-top: 6px; font-weight: 900; font-size: 0.95rem;">
            <span>(=) Efectivo Esperado:</span>
            <span style="color:#1d4ed8;">${formatMoney(d.expected_cash)}</span>
          </div>
          ${d.final_cash_real !== null && d.final_cash_real !== undefined ? `
            <div style="display:flex; justify-content:space-between; margin-top: 4px; padding: 0.15rem 0;">
              <span>Dinero Físico Contado:</span>
              <strong>${formatMoney(d.final_cash_real)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-weight: 900; font-size: 0.9rem; color: ${diffColor}; padding: 0.15rem 0;">
              <span>Diferencia:</span>
              <span>${diffText}</span>
            </div>
          ` : ''}
        </div>

        <div style="border-bottom: 1px dashed #94a3b8; padding-bottom: 8px; margin-bottom: 8px;">
          <div style="font-weight: 800; font-size: 0.82rem; margin-bottom: 4px; text-transform: uppercase; color: #047857;">2. Detalle Entradas (F8) [${(d.ingresos_list || []).length}]</div>
          ${ingresosRows}
        </div>

        <div style="border-bottom: 1px dashed #94a3b8; padding-bottom: 8px; margin-bottom: 8px;">
          <div style="font-weight: 800; font-size: 0.82rem; margin-bottom: 4px; text-transform: uppercase; color: #b91c1c;">3. Detalle Salidas (F9) [${(d.egresos_list || []).length}]</div>
          ${egresosRows}
        </div>

        <div style="border-bottom: 1.5px dashed #334155; padding-bottom: 8px; margin-bottom: 8px;">
          <div style="font-weight: 800; font-size: 0.82rem; margin-bottom: 4px; text-transform: uppercase; color: #1e293b;">4. Ventas Totales por Forma de Pago</div>
          ${salesByMethodRows}
          <div style="display:flex; justify-content:space-between; border-top: 1px solid #cbd5e1; margin-top: 5px; padding-top: 5px; font-weight: 900;">
            <span>Total Ventas:</span>
            <strong>${formatMoney(d.total_sales)}</strong>
          </div>
          <div style="font-size: 0.75rem; color: #64748b;">Tickets cobrados: ${d.total_tickets}</div>
        </div>

        <div style="text-align: center; font-size: 0.74rem; margin-top: 10px; color: #64748b;">
          Impresión de Control Interno • ${new Date().toLocaleTimeString()}
        </div>
      </div>
    `;
  },

  printCorteTicket() {
    const printContent = document.getElementById('printable-corte-ticket');
    if (!printContent) return;
    const printWindow = window.open('', '_blank', 'width=440,height=650');
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Corte de Caja</title>
        <style>
          @page { margin: 0; size: 80mm auto; }
          body { font-family: 'JetBrains Mono', monospace, sans-serif; font-size: 11px; margin: 10px; color: #000; }
          * { box-sizing: border-box; }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
        <script>
          window.onload = function() {
            window.print();
            window.close();
          };
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }
};

window.CashModule = CashModule;
