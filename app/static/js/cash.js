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
      movementBtn.addEventListener('click', () => {
        document.getElementById('movement-type-select').value = 'EGRESO';
        document.getElementById('movement-amount-input').value = '';
        document.getElementById('movement-concept-input').value = '';
        document.getElementById('cash-movement-modal').classList.add('active');
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
    } catch (e) {
      App.showToast(e.message, 'error');
    }
  }
};

window.CashModule = CashModule;
