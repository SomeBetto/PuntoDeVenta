/**
 * MÓDULO DE REPORTES Y ESTADÍSTICAS BASADOS EN DATOS REALES DE ELEVENTA
 */

const ReportsModule = {
  currentPeriod: 'last30',
  customStartDate: '',
  customEndDate: '',
  currentTab: 'sales',

  init() {
    this.bindEvents();
    this.loadAll();
    this.loadSettings();
  },

  bindEvents() {
    // Selector de período rápido
    document.querySelectorAll('.report-period-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.report-period-pill').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const period = e.currentTarget.getAttribute('data-period');
        this.setPeriod(period);
      });
    });

    // Filtro personalizado de fechas
    const btnApplyDates = document.getElementById('btn-apply-custom-dates');
    if (btnApplyDates) {
      btnApplyDates.addEventListener('click', () => {
        const start = document.getElementById('rep-start-date').value;
        const end = document.getElementById('rep-end-date').value;
        if (!start && !end) {
          App.showToast('Seleccione al menos una fecha de inicio o fin', 'warning');
          return;
        }
        this.currentPeriod = 'custom';
        this.customStartDate = start;
        this.customEndDate = end;
        document.querySelectorAll('.report-period-pill').forEach(b => b.classList.remove('active'));
        this.loadAll();
      });
    }

    // Pestañas de sub-reportes
    document.querySelectorAll('.report-tab-btn').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.report-tab-btn').forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const tabName = e.currentTarget.getAttribute('data-tab');
        this.setTab(tabName);
      });
    });

    // Ordenamiento de productos más vendidos
    const selectTopOrder = document.getElementById('top-products-order-by');
    if (selectTopOrder) {
      selectTopOrder.addEventListener('change', () => this.loadTopProducts());
    }

    // Guardar configuraciones
    const saveSettingsBtn = document.getElementById('btn-save-settings');
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', () => this.saveSettings());
    }
  },

  setPeriod(period) {
    this.currentPeriod = period;
    const customBox = document.getElementById('custom-date-container');
    if (customBox) {
      customBox.style.display = (period === 'custom') ? 'flex' : 'none';
    }
    if (period !== 'custom') {
      this.customStartDate = '';
      this.customEndDate = '';
      this.loadAll();
    }
  },

  setTab(tabName) {
    this.currentTab = tabName;
    document.querySelectorAll('.report-tab-content').forEach(c => c.style.display = 'none');
    const activeContent = document.getElementById(`tab-content-${tabName}`);
    if (activeContent) {
      activeContent.style.display = 'block';
    }

    // Cargar contenido específico de la pestaña si corresponde
    if (tabName === 'departments') this.loadDepartments();
    else if (tabName === 'products') this.loadTopProducts();
    else if (tabName === 'cashiers') this.loadCashiers();
    else if (tabName === 'shifts') this.loadShiftsHistory();
    else if (tabName === 'credits') this.loadCredits();
    else if (tabName === 'inventory') this.loadInventoryValuation();
  },

  buildPeriodQuery() {
    let q = `period=${this.currentPeriod}`;
    if (this.currentPeriod === 'custom') {
      if (this.customStartDate) q += `&start_date=${this.customStartDate}`;
      if (this.customEndDate) q += `&end_date=${this.customEndDate}`;
    }
    return q;
  },

  async loadAll() {
    await this.loadSummary();
    // Actualizar la pestaña actual
    this.setTab(this.currentTab);
  },

  async loadSummary() {
    const query = this.buildPeriodQuery();
    try {
      const res = await fetch(`/api/reports/summary?${query}`);
      if (!res.ok) throw new Error('Error al consultar resumen');
      const d = await res.json();

      // Formatear KPIs
      const elSales = document.getElementById('kpi-sales-total');
      if (elSales) elSales.innerText = `$${d.total_sales.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

      const elProfit = document.getElementById('kpi-profit-total');
      if (elProfit) elProfit.innerText = `$${d.total_profit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

      const elMargin = document.getElementById('kpi-margin-pct');
      if (elMargin) elMargin.innerText = `${d.margin_pct}%`;

      const elTickets = document.getElementById('kpi-tickets-count');
      if (elTickets) elTickets.innerText = d.total_tickets.toLocaleString();

      const elAvg = document.getElementById('kpi-avg-ticket');
      if (elAvg) elAvg.innerText = `$${d.average_ticket.toFixed(2)}`;

      const periodDesc = document.getElementById('report-current-period-desc');
      if (periodDesc) {
        if (d.date_range.first_sale && d.date_range.last_sale) {
          periodDesc.innerText = `Datos desde ${d.date_range.first_sale.slice(0,10)} hasta ${d.date_range.last_sale.slice(0,10)}`;
        } else {
          periodDesc.innerText = `Período: ${this.currentPeriod}`;
        }
      }

      // Renderizar métodos de pago
      const pBody = document.getElementById('payment-methods-table-body');
      if (pBody) {
        if (!d.payment_methods || d.payment_methods.length === 0) {
          pBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-secondary); padding:1rem;">Sin ventas en el período</td></tr>';
        } else {
          pBody.innerHTML = d.payment_methods.map(m => {
            const icon = m.method === 'EFECTIVO' ? '💵' : (m.method === 'TARJETA' ? '💳' : (m.method === 'FIADO' ? '📝' : '🏦'));
            return `
              <tr>
                <td style="font-weight: 700; display:flex; align-items:center; gap:0.5rem;">
                  <span>${icon}</span>
                  <span>${m.method}</span>
                </td>
                <td style="text-align: right; font-family: var(--font-mono);">${m.tickets.toLocaleString()}</td>
                <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: var(--primary-blue);">
                  $${m.total_amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </td>
                <td style="width: 140px;">
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <div style="flex: 1; height: 8px; background: var(--bg-subtle); border-radius: 4px; overflow: hidden;">
                      <div style="width: ${m.pct}%; height: 100%; background: var(--primary-blue); border-radius: 4px;"></div>
                    </div>
                    <span style="font-size: 0.75rem; font-weight: 700; font-family: var(--font-mono);">${m.pct}%</span>
                  </div>
                </td>
              </tr>
            `;
          }).join('');
        }
      }

      // Renderizar flujo y balance de efectivo en caja
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
      };
      setVal('rep-cash-sales', `$${(d.cash_sales || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
      setVal('rep-cash-inflows', `+$${(d.cash_inflows || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} (${d.count_inflows || 0})`);
      setVal('rep-cash-outflows', `-$${(d.cash_outflows || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} (${d.count_outflows || 0})`);
      setVal('rep-cash-net', `$${(d.net_cash || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
    } catch (e) {
      console.error(e);
    }
  },

  async loadDepartments() {
    const query = this.buildPeriodQuery();
    const tableBody = document.getElementById('departments-report-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:1.5rem;">Cargando departamentos de Eleventa...</td></tr>';

    try {
      const res = await fetch(`/api/reports/departments?${query}&limit=60`);
      const data = await res.json();

      if (!data.departments || data.departments.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-secondary); padding:1.5rem;">No se registraron ventas en este período</td></tr>';
        return;
      }

      tableBody.innerHTML = data.departments.map(d => `
        <tr>
          <td style="font-weight: 700; display: flex; align-items: center; gap: 0.5rem;">
            <span>${d.icon || '📦'}</span>
            <span>${d.name}</span>
          </td>
          <td style="text-align: right; font-family: var(--font-mono);">${d.units_sold.toLocaleString()}</td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: var(--primary-blue);">
            $${d.total_sales.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </td>
          <td style="text-align: right; font-family: var(--font-mono); color: var(--accent-green-dark); font-weight: 700;">
            $${d.total_profit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </td>
          <td style="text-align: right; font-family: var(--font-mono); font-size: 0.85rem;">
            ${d.margin_pct}%
          </td>
          <td style="width: 140px;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <div style="flex: 1; height: 8px; background: var(--bg-subtle); border-radius: 4px; overflow: hidden;">
                <div style="width: ${d.pct_of_total}%; height: 100%; background: var(--accent-green-dark); border-radius: 4px;"></div>
              </div>
              <span style="font-size: 0.75rem; font-weight: 700;">${d.pct_of_total}%</span>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (e) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--accent-red); padding:1rem;">Error cargando reporte</td></tr>';
    }
  },

  async loadTopProducts() {
    const query = this.buildPeriodQuery();
    const orderSelect = document.getElementById('top-products-order-by');
    const orderBy = orderSelect ? orderSelect.value : 'revenue';
    const tableBody = document.getElementById('top-products-report-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem;">Cargando artículos más vendidos...</td></tr>';

    try {
      const res = await fetch(`/api/reports/top-products?${query}&order_by=${orderBy}&limit=30`);
      const data = await res.json();

      if (!data.products || data.products.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-secondary); padding:1.5rem;">No se encontraron ventas para este período</td></tr>';
        return;
      }

      tableBody.innerHTML = data.products.map((p, idx) => `
        <tr>
          <td style="font-weight: 800; text-align: center; width: 35px; color: var(--text-secondary);">${idx + 1}</td>
          <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-secondary);">${p.barcode || '—'}</td>
          <td style="font-weight: 700;">${p.name}</td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 700;">
            ${p.quantity.toLocaleString()} <span style="font-size:0.75rem; color:var(--text-secondary);">${p.unit}</span>
          </td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: var(--primary-blue);">
            $${p.revenue.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </td>
          <td style="text-align: right; font-family: var(--font-mono); color: var(--accent-green-dark); font-weight: 700;">
            $${p.profit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </td>
          <td style="text-align: right; font-family: var(--font-mono); font-size: 0.85rem;">
            ${p.margin_pct}%
          </td>
        </tr>
      `).join('');
    } catch (e) {
      tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--accent-red); padding:1rem;">Error cargando artículos</td></tr>';
    }
  },

  async loadCashiers() {
    const query = this.buildPeriodQuery();
    const tableBody = document.getElementById('cashiers-report-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:1.5rem;">Cargando reporte de cajeros...</td></tr>';

    try {
      const res = await fetch(`/api/reports/cashiers?${query}`);
      const data = await res.json();

      if (!data.cashiers || data.cashiers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-secondary); padding:1.5rem;">No se encontraron registros de cajeros</td></tr>';
        return;
      }

      tableBody.innerHTML = data.cashiers.map(c => `
        <tr>
          <td style="font-weight: 800; display:flex; align-items:center; gap:0.5rem;">
            <span class="store-avatar" style="width:26px; height:26px; font-size:0.8rem;">👤</span>
            <span>${c.cashier_name}</span>
          </td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 700;">${c.tickets.toLocaleString()}</td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: var(--primary-blue);">
            $${c.total_sales.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </td>
          <td style="text-align: right; font-family: var(--font-mono);">$${c.average_ticket.toFixed(2)}</td>
          <td style="width: 140px;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <div style="flex: 1; height: 8px; background: var(--bg-subtle); border-radius: 4px; overflow: hidden;">
                <div style="width: ${c.pct_of_total}%; height: 100%; background: var(--primary-blue); border-radius: 4px;"></div>
              </div>
              <span style="font-size: 0.75rem; font-weight: 700;">${c.pct_of_total}%</span>
            </div>
          </td>
          <td style="font-size: 0.75rem; color: var(--text-secondary); text-align: right;">
            ${c.last_sale ? c.last_sale.slice(0, 16) : '—'}
          </td>
        </tr>
      `).join('');
    } catch (e) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--accent-red); padding:1rem;">Error cargando cajeros</td></tr>';
    }
  },

  async loadShiftsHistory() {
    const tableBody = document.getElementById('shifts-history-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:1.5rem;">Cargando historial de 3,054 turnos de Eleventa...</td></tr>';

    try {
      const res = await fetch('/api/reports/shifts-history?limit=50&offset=0');
      const data = await res.json();

      const badgeTotal = document.getElementById('shifts-count-badge');
      if (badgeTotal) badgeTotal.innerText = `${data.total_shifts.toLocaleString()} turnos registrados`;

      if (!data.shifts || data.shifts.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-secondary); padding:1.5rem;">Sin turnos registrados</td></tr>';
        return;
      }

      tableBody.innerHTML = data.shifts.map(s => {
        const isSobrante = s.difference > 0;
        const isFaltante = s.difference < 0;
        const diffColor = isSobrante ? 'var(--accent-green-dark)' : (isFaltante ? 'var(--accent-red)' : 'var(--text-secondary)');
        const diffSign = isSobrante ? '+' : '';

        return `
          <tr>
            <td style="font-family: var(--font-mono); font-weight: 800;">#${s.id}</td>
            <td style="font-weight: 700;">${s.cashier_name}</td>
            <td style="font-size: 0.8rem; color: var(--text-secondary);">${s.opened_at ? s.opened_at.slice(0, 16) : '—'}</td>
            <td style="font-size: 0.8rem; color: var(--text-secondary);">${s.closed_at ? s.closed_at.slice(0, 16) : '<span style="color:var(--accent-green-dark); font-weight:700;">ABIERTO</span>'}</td>
            <td style="text-align: right; font-family: var(--font-mono);">$${(s.initial_cash || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono); font-weight: 700;">$${(s.final_cash_expected || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: var(--primary-blue);">$${(s.final_cash_real || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono); font-weight: 800; color: ${diffColor};">
              ${diffSign}$${s.difference.toFixed(2)}
            </td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--accent-red); padding:1rem;">Error cargando turnos</td></tr>';
    }
  },

  async loadCredits() {
    const tableBody = document.getElementById('credits-report-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:1.5rem;">Cargando libreta de deudores de Eleventa...</td></tr>';

    try {
      const res = await fetch('/api/reports/credits');
      const data = await res.json();

      const elTotal = document.getElementById('credits-total-debt');
      if (elTotal) elTotal.innerText = `$${data.total_debt.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

      const elCount = document.getElementById('credits-debtors-count');
      if (elCount) elCount.innerText = `${data.debtors_count} clientes con saldo pendiente (de ${data.total_customers} clientes totales)`;

      if (!data.top_debtors || data.top_debtors.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--accent-green-dark); padding:1.5rem;">🎉 No hay deudas pendientes en la libreta</td></tr>';
        return;
      }

      tableBody.innerHTML = data.top_debtors.map(c => `
        <tr>
          <td style="font-weight: 800;">${c.name}</td>
          <td style="font-size: 0.85rem; color: var(--text-secondary);">${c.phone || '—'}</td>
          <td style="font-size: 0.85rem; color: var(--text-secondary);">${c.address || '—'}</td>
          <td style="text-align: right; font-family: var(--font-mono);">$${(c.credit_limit || 0).toFixed(2)}</td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 800; color: var(--accent-red); font-size: 0.95rem;">
            $${c.current_balance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </td>
        </tr>
      `).join('');
    } catch (e) {
      tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--accent-red); padding:1rem;">Error cargando fiados</td></tr>';
    }
  },

  async loadInventoryValuation() {
    try {
      const res = await fetch('/api/reports/inventory-valuation');
      const data = await res.json();

      const elCost = document.getElementById('inv-cost-val');
      if (elCost) elCost.innerText = `$${data.total_cost_value.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

      const elRetail = document.getElementById('inv-retail-val');
      if (elRetail) elRetail.innerText = `$${data.total_retail_value.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

      const elProfit = document.getElementById('inv-profit-val');
      if (elProfit) elProfit.innerText = `+$${data.potential_profit.toLocaleString('es-MX', { minimumFractionDigits: 2 })} (${data.margin_pct}%)`;

      const elUnits = document.getElementById('inv-units-val');
      if (elUnits) elUnits.innerText = `${data.total_units.toLocaleString()} unidades (${data.total_products} productos en catálogo)`;

      // Tabla de productos por agotarse
      const tableBody = document.getElementById('inv-lowstock-table-body');
      if (tableBody) {
        if (!data.low_stock_products || data.low_stock_products.length === 0) {
          tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--accent-green-dark); padding:1.5rem;">🎉 Todo el inventario cuenta con stock suficiente</td></tr>';
        } else {
          tableBody.innerHTML = data.low_stock_products.map(p => `
            <tr>
              <td style="font-family: var(--font-mono); font-size: 0.8rem;">${p.barcode || '—'}</td>
              <td style="font-weight: 700;">${p.name}</td>
              <td style="text-align: right; font-family: var(--font-mono); font-weight: 800; color: var(--accent-red);">
                ${p.stock} ${p.unit}
              </td>
              <td style="text-align: right; font-family: var(--font-mono); color: var(--text-secondary);">
                ${p.min_stock} ${p.unit}
              </td>
              <td style="text-align: right; font-family: var(--font-mono); font-weight: 700;">
                $${(p.sale_price || 0).toFixed(2)}
              </td>
            </tr>
          `).join('');
        }
      }
    } catch (e) {
      console.error(e);
    }
  },

  async loadSettings() {
    if (window.SettingsModule) {
      await SettingsModule.loadSettings();
    }
  },

  async saveSettings() {
    if (window.SettingsModule) {
      await SettingsModule.saveBusinessConfig();
    }
  },

  // Alias para compatibilidad con pos.js, customers.js y eleventa.js
  async loadDashboard() {
    await this.loadAll();
  }
};

window.ReportsModule = ReportsModule;
