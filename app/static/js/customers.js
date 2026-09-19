/**
 * MÓDULO DE CLIENTES Y FIADOS (CUENTAS POR COBRAR)
 */

const CustomersModule = {
  customers: [],
  selectedCustomerId: null,
  searchQuery: '',

  init() {
    this.bindEvents();
    this.loadCustomers();
  },

  bindEvents() {
    const newCustBtn = document.getElementById('btn-new-customer');
    if (newCustBtn) {
      newCustBtn.addEventListener('click', () => this.openNewCustomerModal());
    }

    const saveCustBtn = document.getElementById('btn-save-customer');
    if (saveCustBtn) {
      saveCustBtn.addEventListener('click', () => this.saveCustomer());
    }

    const savePaymentBtn = document.getElementById('btn-save-payment');
    if (savePaymentBtn) {
      savePaymentBtn.addEventListener('click', () => this.savePayment());
    }

    const searchInput = document.getElementById('customers-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderTable();
      });
    }
  },

  async loadCustomers() {
    try {
      const res = await fetch('/api/customers');
      this.customers = await res.json();
      this.renderTable();
    } catch (e) {
      console.error('Error cargando clientes:', e);
    }
  },

  renderTable() {
    const tbody = document.getElementById('customers-table-body');
    if (!tbody) return;

    let list = this.customers || [];
    if (this.searchQuery) {
      list = list.filter(c => 
        (c.name || '').toLowerCase().includes(this.searchQuery) ||
        (c.phone || '').toLowerCase().includes(this.searchQuery) ||
        (c.notes || '').toLowerCase().includes(this.searchQuery) ||
        (c.address || '').toLowerCase().includes(this.searchQuery)
      );
    }

    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding: 2rem; color: var(--text-dim);">
            ${this.searchQuery ? 'No se encontraron clientes que coincidan con la búsqueda.' : 'No hay clientes registrados en la libreta de fiados.'}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = list.map(c => {
      const balance = Number(c.current_balance) || 0;
      const creditLimit = Number(c.credit_limit) || 0;
      const availableCredit = Number(c.available_credit) || 0;
      const hasDebt = balance > 0;
      const isUnlimited = (creditLimit <= 0);
      const limitDisplay = isUnlimited 
        ? '<span style="color: #16a34a; font-weight: 700;">∞ Sin límite</span>' 
        : `$${creditLimit.toFixed(2)}`;
      const availableDisplay = isUnlimited 
        ? '<span style="color: #16a34a; font-weight: 700;">∞ Ilimitado</span>' 
        : `$${availableCredit.toFixed(2)}`;

      return `
        <tr>
          <td>
            <strong>${c.name}</strong>
            ${c.notes ? `<div style="font-size: 0.75rem; color: var(--text-dim);">${c.notes}</div>` : ''}
            ${c.address ? `<div style="font-size: 0.75rem; color: var(--text-secondary);">📍 ${c.address}</div>` : ''}
          </td>
          <td>
            ${c.phone 
              ? `<span style="font-family: var(--font-mono); font-size: 0.85rem;">📞 ${c.phone}</span>` 
              : `<button class="btn-secondary" style="padding: 0.2rem 0.45rem; font-size: 0.75rem; border: 1px dashed var(--border-color); color: var(--text-dim);" onclick="CustomersModule.openEditCustomerModal(${c.id})" title="Registrar número de teléfono">+ Teléfono</button>`
            }
          </td>
          <td style="font-family: var(--font-mono);">${limitDisplay}</td>
          <td style="font-family: var(--font-mono); font-weight: 800; font-size: 1rem; color: ${hasDebt ? 'var(--danger)' : 'var(--primary-light)'};">
            $${balance.toFixed(2)}
          </td>
          <td style="font-family: var(--font-mono);">${availableDisplay}</td>
          <td>
            <div style="display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: center;">
              ${hasDebt ? `
                <button class="btn-primary" style="padding: 0.35rem 0.6rem; font-size: 0.8rem;" onclick="CustomersModule.openPaymentModal(${c.id})" title="Registrar abono de pago">
                  💵 Abonar
                </button>
              ` : ''}
              <button class="btn-secondary" style="padding: 0.35rem 0.6rem; font-size: 0.8rem; background: #22c55e; color: white; border: none; font-weight: 600; cursor: pointer;" onclick="CustomersModule.sendWhatsAppReminder(${c.id})" title="${c.phone ? 'Enviar mensaje por WhatsApp' : 'Registrar teléfono para WhatsApp'}">
                💬 WhatsApp
              </button>
              <button class="btn-secondary" style="padding: 0.35rem 0.6rem; font-size: 0.8rem;" onclick="CustomersModule.openEditCustomerModal(${c.id})" title="Modificar datos del cliente">
                ✏️ Editar
              </button>
              <button class="btn-secondary" style="padding: 0.35rem 0.6rem; font-size: 0.8rem;" onclick="CustomersModule.openHistoryModal(${c.id})" title="Ver estado de cuenta e historial">
                📜 Historial
              </button>
              ${(!hasDebt && c.id !== 1) ? `
                <button class="btn-secondary" style="padding: 0.35rem 0.5rem; font-size: 0.8rem; color: #dc2626; border-color: #fee2e2;" onclick="CustomersModule.deleteCustomer(${c.id})" title="Eliminar cliente">
                  🗑️
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openNewCustomerModal() {
    const idInput = document.getElementById('cust-form-id');
    if (idInput) idInput.value = '';
    const title = document.getElementById('customer-modal-title');
    if (title) title.innerText = '👥 Nuevo Cliente para Fiado';
    const btn = document.getElementById('btn-save-customer');
    if (btn) btn.innerText = '💾 REGISTRAR CLIENTE';

    document.getElementById('cust-form-name').value = '';
    document.getElementById('cust-form-phone').value = '';
    document.getElementById('cust-form-address').value = '';
    document.getElementById('cust-form-limit').value = '1500';
    document.getElementById('cust-form-notes').value = '';
    document.getElementById('customer-modal').classList.add('active');
    setTimeout(() => document.getElementById('cust-form-name').focus(), 150);
  },

  openEditCustomerModal(customerId) {
    const cust = this.customers.find(c => c.id === customerId);
    if (!cust) return;

    const idInput = document.getElementById('cust-form-id');
    if (idInput) idInput.value = cust.id;
    const title = document.getElementById('customer-modal-title');
    if (title) title.innerText = '✏️ Editar Cliente';
    const btn = document.getElementById('btn-save-customer');
    if (btn) btn.innerText = '💾 GUARDAR CAMBIOS';

    document.getElementById('cust-form-name').value = cust.name || '';
    document.getElementById('cust-form-phone').value = cust.phone || '';
    document.getElementById('cust-form-address').value = cust.address || '';
    document.getElementById('cust-form-limit').value = (cust.credit_limit !== undefined && cust.credit_limit !== null) ? cust.credit_limit : 1500;
    document.getElementById('cust-form-notes').value = cust.notes || '';
    document.getElementById('customer-modal').classList.add('active');
    setTimeout(() => {
      if (!cust.phone) {
        document.getElementById('cust-form-phone').focus();
      } else {
        document.getElementById('cust-form-name').focus();
      }
    }, 150);
  },

  async saveCustomer() {
    const custId = document.getElementById('cust-form-id')?.value;
    const name = document.getElementById('cust-form-name').value.trim();
    if (!name) {
      App.showToast('El nombre del cliente es obligatorio', 'error');
      return;
    }

    const payload = {
      name: name,
      phone: document.getElementById('cust-form-phone').value.trim(),
      address: document.getElementById('cust-form-address').value.trim(),
      credit_limit: parseFloat(document.getElementById('cust-form-limit').value) || 0,
      notes: document.getElementById('cust-form-notes').value.trim()
    };

    try {
      let res;
      if (custId) {
        res = await fetch(`/api/customers/${custId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al guardar cliente');

      App.showToast(custId ? 'Cliente actualizado correctamente' : 'Cliente registrado en fiados', 'success');
      document.getElementById('customer-modal').classList.remove('active');
      this.loadCustomers();
      if (window.PosModule && typeof PosModule.loadCustomers === 'function') {
        PosModule.loadCustomers();
      }
    } catch (e) {
      App.showToast(e.message, 'error');
    }
  },

  async deleteCustomer(customerId) {
    const cust = this.customers.find(c => c.id === customerId);
    if (!cust) return;

    if (Number(cust.current_balance) > 0) {
      App.showToast(`No se puede eliminar a "${cust.name}" porque tiene una deuda pendiente de $${cust.current_balance.toFixed(2)}`, 'warning');
      return;
    }

    if (!confirm(`¿Estás seguro de que deseas eliminar al cliente "${cust.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/customers/${customerId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al eliminar cliente');
      App.showToast(data.message, 'success');
      this.loadCustomers();
      if (window.PosModule && typeof PosModule.loadCustomers === 'function') {
        PosModule.loadCustomers();
      }
    } catch (e) {
      App.showToast(e.message, 'error');
    }
  },

  openPaymentModal(customerId, customerName, currentDebt) {
    this.selectedCustomerId = customerId;
    const cust = this.customers.find(c => c.id === customerId);
    const name = customerName || (cust ? cust.name : 'Cliente');
    const debt = (typeof currentDebt === 'number') ? currentDebt : (cust ? Number(cust.current_balance) || 0 : 0);

    document.getElementById('payment-customer-name').innerText = name;
    document.getElementById('payment-current-debt').innerText = `$${debt.toFixed(2)}`;
    document.getElementById('payment-amount-input').value = debt.toFixed(2);
    document.getElementById('payment-notes-input').value = 'Abono en efectivo';
    document.getElementById('customer-payment-modal').classList.add('active');
    setTimeout(() => {
      const input = document.getElementById('payment-amount-input');
      if (input) {
        input.focus();
        input.select();
      }
    }, 150);
  },

  async savePayment() {
    const amount = parseFloat(document.getElementById('payment-amount-input').value);
    const notes = document.getElementById('payment-notes-input').value.trim();

    if (isNaN(amount) || amount <= 0) {
      App.showToast('Ingrese un monto válido mayor a $0', 'error');
      return;
    }

    try {
      const res = await fetch(`/api/customers/${this.selectedCustomerId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amount, notes: notes })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al registrar abono');

      App.showToast(data.message, 'success');
      document.getElementById('customer-payment-modal').classList.remove('active');
      this.loadCustomers();
      if (window.PosModule && typeof PosModule.loadCustomers === 'function') {
        PosModule.loadCustomers();
      }
      if (window.CashModule) CashModule.loadCurrentShift();
      if (window.ReportsModule) ReportsModule.loadDashboard();

      // Mostrar comprobante imprimible si se recibió información
      if (data.receipt) {
        this.showPaymentReceipt(data.receipt);
      }
    } catch (e) {
      App.showToast(e.message, 'error');
    }
  },

  openWhatsAppModal(customerId) {
    const cust = this.customers.find(c => c.id === customerId);
    if (!cust) return;

    this.selectedCustomerId = customerId;
    const idEl = document.getElementById('wa-customer-id');
    if (idEl) idEl.value = cust.id;
    const nameEl = document.getElementById('wa-customer-name');
    if (nameEl) nameEl.innerText = cust.name;

    const balance = Number(cust.current_balance) || 0;
    const debtEl = document.getElementById('wa-customer-debt');
    if (debtEl) {
      debtEl.innerText = balance > 0 
        ? `Saldo pendiente: $${balance.toFixed(2)} MXN` 
        : 'Cuenta al corriente ($0.00)';
      debtEl.style.color = balance > 0 ? '#dc2626' : '#16a34a';
    }

    let phoneDigits = (cust.phone || '').replace(/[^0-9]/g, '');
    if (phoneDigits.startsWith('52') && phoneDigits.length === 12) {
      phoneDigits = phoneDigits.substring(2);
    }
    const phoneInput = document.getElementById('wa-phone-input');
    if (phoneInput) phoneInput.value = phoneDigits;

    this.applyWhatsAppTemplate(balance > 0 ? 'debt' : 'current');

    const modal = document.getElementById('customer-whatsapp-modal');
    if (modal) modal.classList.add('active');

    setTimeout(() => {
      if (!phoneDigits) {
        document.getElementById('wa-phone-input')?.focus();
      } else {
        document.getElementById('wa-message-input')?.focus();
      }
    }, 150);
  },

  applyWhatsAppTemplate(type) {
    const custId = parseInt(document.getElementById('wa-customer-id')?.value || this.selectedCustomerId);
    const cust = this.customers.find(c => c.id === custId);
    const name = cust ? cust.name : (document.getElementById('wa-customer-name')?.innerText || 'Cliente');
    const balance = cust ? (Number(cust.current_balance) || 0) : 0;
    const storeName = (window.PosModule && PosModule.storeSettings && PosModule.storeSettings.store_name) || 'la tienda';

    let text = '';
    if (type === 'debt') {
      text = `Hola ${name}, le saludamos cordialmente de *${storeName}*.\n\nLe recordamos amablemente que su saldo pendiente de fiado es de *$${balance.toFixed(2)} MXN*.\n\nAgradecemos su preferencia y quedamos a su disposición para cualquier duda sobre su cuenta. ¡Que tenga un excelente día!`;
    } else if (type === 'current') {
      text = `Hola ${name}, le saludamos cordialmente de *${storeName}*.\n\nLe informamos que su cuenta con nosotros se encuentra *al corriente* (saldo $0.00).\n\n¡Muchas gracias por su preferencia y confianza! Que tenga un excelente día.`;
    } else if (type === 'greeting') {
      text = `Hola ${name}, le saludamos cordialmente de *${storeName}*.\n\nEsperamos que tenga un excelente día y le recordamos que estamos a sus órdenes para lo que necesite. ¡Gracias por su preferencia!`;
    }

    const textarea = document.getElementById('wa-message-input');
    if (textarea) textarea.value = text;
  },

  copyWhatsAppMessage() {
    const text = document.getElementById('wa-message-input')?.value;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      App.showToast('Mensaje copiado al portapapeles', 'info');
    }).catch(() => {
      App.showToast('No se pudo copiar automáticamente', 'warning');
    });
  },

  async sendWhatsAppNow() {
    const custId = parseInt(document.getElementById('wa-customer-id')?.value || this.selectedCustomerId);
    const rawPhone = document.getElementById('wa-phone-input')?.value.trim() || '';
    const message = document.getElementById('wa-message-input')?.value.trim() || '';

    let phone = rawPhone.replace(/[^0-9]/g, '');
    if (!phone || phone.length < 10) {
      App.showToast('Ingrese un número de teléfono válido de 10 dígitos', 'error');
      document.getElementById('wa-phone-input')?.focus();
      return;
    }

    if (phone.length === 10) {
      phone = '52' + phone;
    }

    // Si el cliente no tenía teléfono o cambió, guardarlo en la base de datos automáticamente
    const cust = this.customers.find(c => c.id === custId);
    if (cust && cust.phone !== rawPhone) {
      try {
        await fetch(`/api/customers/${custId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: rawPhone })
        });
        cust.phone = rawPhone;
        this.renderTable();
        if (window.PosModule && typeof PosModule.loadCustomers === 'function') {
          PosModule.loadCustomers();
        }
      } catch (err) {
        console.warn('No se pudo actualizar teléfono del cliente automáticamente:', err);
      }
    }

    const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    App.closeModal('customer-whatsapp-modal');
  },

  sendWhatsAppReminder(customerId) {
    this.openWhatsAppModal(customerId);
  },

  showPaymentReceipt(receipt) {
    const container = document.getElementById('payment-receipt-content');
    if (!container) return;

    container.innerHTML = `
      <div style="text-align: center; margin-bottom: 0.75rem; font-family: 'Courier New', Courier, monospace;">
        <div style="font-size: 1.15rem; font-weight: 800;">${receipt.store_name || 'ABARROTES & MINI SÚPER'}</div>
        <div style="font-size: 0.85rem;">${receipt.store_address || ''}</div>
        <div style="font-size: 0.85rem;">Tel: ${receipt.store_phone || ''}</div>
        <div style="border-top: 1px dashed #475569; margin: 0.5rem 0;"></div>
        <div style="font-weight: 800; font-size: 1rem;">COMPROBANTE DE ABONO</div>
        <div style="font-size: 0.85rem;">Folio: #${receipt.folio}</div>
        <div style="font-size: 0.85rem;">Fecha: ${receipt.date}</div>
        <div style="border-top: 1px dashed #475569; margin: 0.5rem 0;"></div>
      </div>

      <div style="font-family: 'Courier New', Courier, monospace; font-size: 0.9rem; line-height: 1.5;">
        <div style="display: flex; justify-content: space-between;">
          <span>Cliente:</span>
          <strong>${receipt.customer_name}</strong>
        </div>
        ${receipt.customer_phone ? `
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #475569;">
            <span>Teléfono:</span>
            <span>${receipt.customer_phone}</span>
          </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; margin-top: 0.5rem;">
          <span>Saldo Anterior:</span>
          <span>$${receipt.previous_balance.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 1.05rem; font-weight: 800; color: #16a34a;">
          <span>MONTO ABONADO:</span>
          <span>$${receipt.payment_amount.toFixed(2)}</span>
        </div>
        <div style="border-top: 1px dashed #475569; margin: 0.5rem 0;"></div>
        <div style="display: flex; justify-content: space-between; font-size: 1.1rem; font-weight: 900; color: #dc2626;">
          <span>SALDO RESTANTE:</span>
          <span>$${receipt.new_balance.toFixed(2)}</span>
        </div>
        ${receipt.notes ? `
          <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.4rem; font-style: italic;">
            Nota: ${receipt.notes}
          </div>
        ` : ''}
      </div>

      <div style="border-top: 1px dashed #475569; margin: 0.75rem 0; text-align: center; font-family: 'Courier New', Courier, monospace;">
        <div style="font-size: 0.8rem; color: #475569;">${receipt.ticket_footer || '¡Gracias por su pago puntual!'}</div>
      </div>
    `;

    const modal = document.getElementById('payment-receipt-modal');
    if (modal) modal.classList.add('active');
  },

  printPaymentReceipt() {
    window.print();
  },

  async openHistoryModal(customerId) {
    try {
      const res = await fetch(`/api/customers/${customerId}/history`);
      const data = await res.json();
      const { customer, transactions } = data;

      document.getElementById('history-cust-name').innerText = customer.name;
      document.getElementById('history-cust-debt').innerText = `$${customer.current_balance.toFixed(2)}`;

      const listContainer = document.getElementById('history-transactions-list');
      if (transactions.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; color: var(--text-dim); padding: 1.5rem;">Sin movimientos registrados.</div>';
      } else {
        listContainer.innerHTML = transactions.map(t => {
          const isCargo = t.type === 'CARGO';
          return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem; border-bottom: 1px solid var(--border-subtle);">
              <div>
                <strong style="color: ${isCargo ? 'var(--danger)' : 'var(--primary-light)'};">
                  ${isCargo ? '🛍️ Fiado (Cargo)' : '💵 Abono / Pago'}
                </strong>
                <div style="font-size: 0.75rem; color: var(--text-dim);">
                  ${new Date(t.created_at).toLocaleString()} • ${t.notes || ''}
                </div>
              </div>
              <div style="font-family: var(--font-mono); font-weight: 800; font-size: 1rem; color: ${isCargo ? 'var(--danger)' : 'var(--primary-light)'};">
                ${isCargo ? '+' : '-'}$${t.amount.toFixed(2)}
              </div>
            </div>
          `;
        }).join('');
      }

      document.getElementById('customer-history-modal').classList.add('active');
    } catch (e) {
      console.error(e);
    }
  }
};

window.CustomersModule = CustomersModule;
