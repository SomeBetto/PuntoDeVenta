/**
 * MÓDULO DE IMPORTACIÓN DE BASE DE DATOS ELEVENTA
 * Permite importar catálogo, clientes, fiados e historial completo de ventas.
 */

const EleventaModule = {
  timer: null,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const btnOpen = document.getElementById('btn-open-eleventa-modal');
    if (btnOpen) {
      btnOpen.addEventListener('click', () => {
        App.closeDrawer();
        this.openModal();
      });
    }

    const btnStart = document.getElementById('btn-start-eleventa-import');
    if (btnStart) {
      btnStart.addEventListener('click', () => this.startImport());
    }

    const pathInput = document.getElementById('eleventa-path-input');
    if (pathInput) {
      pathInput.addEventListener('change', () => this.checkStatus());
    }
  },

  async openModal() {
    App.openModal('eleventa-modal');
    await this.checkStatus();
  },

  async checkStatus() {
    const pathInput = document.getElementById('eleventa-path-input');
    const path = pathInput ? pathInput.value.trim() : '';

    try {
      const res = await fetch(`/api/eleventa/status?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      this.renderStatus(data);
    } catch (err) {
      console.error('Error comprobando estado de Eleventa:', err);
    }
  },

  renderStatus(data) {
    const infoBox = document.getElementById('eleventa-detection-info');
    const progressBox = document.getElementById('eleventa-progress-box');
    const startBtn = document.getElementById('btn-start-eleventa-import');

    const info = data.eleventa_info;
    const job = data.import_job;

    if (info.valid) {
      infoBox.innerHTML = `
        <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: var(--radius-md); padding: 0.85rem; display: flex; align-items: flex-start; gap: 0.75rem;">
          <span style="font-size: 1.5rem;">✅</span>
          <div style="font-size: 0.88rem; color: #166534;">
            <strong>Base de datos Eleventa detectada correctamente:</strong><br>
            • Archivo: <code>PDVDATA.FDB</code> (${info.fdb_size_mb} MB)<br>
            • Motor: Firebird Embedded 2.0 (fbclient.dll activo)<br>
            • Configuración: <code>pdventa.ini</code> encontrado
          </div>
        </div>
      `;
      if (startBtn) startBtn.disabled = job.running;
    } else {
      infoBox.innerHTML = `
        <div style="background: #fef2f2; border: 1px solid #fca5a5; border-radius: var(--radius-md); padding: 0.85rem; display: flex; align-items: flex-start; gap: 0.75rem;">
          <span style="font-size: 1.5rem;">⚠️</span>
          <div style="font-size: 0.88rem; color: #991b1b;">
            <strong>No se encontró la base de datos en la ruta especificada.</strong><br>
            Asegúrese de que la carpeta contenga la subcarpeta <code>db\\PDVDATA.FDB</code> y <code>fbclient.dll</code>.
          </div>
        </div>
      `;
      if (startBtn) startBtn.disabled = true;
    }

    // Renderizar estado de importación o estadísticas
    if (job.running) {
      progressBox.style.display = 'block';
      this.updateProgressUI(job);
      this.startPolling();
    } else if (job.stage === 'completed') {
      progressBox.style.display = 'block';
      this.updateProgressUI(job);
    } else {
      progressBox.style.display = 'none';
    }
  },

  async startImport() {
    const pathInput = document.getElementById('eleventa-path-input');
    const path = pathInput ? pathInput.value.trim() : '';

    const chkSales = document.getElementById('chk-import-sales');
    const importSales = chkSales ? chkSales.checked : true;

    if (!confirm('⚠️ ATENCIÓN: Esta acción eliminará los datos actuales de la base de datos (productos, clientes, saldos, ventas y turnos) y los cargará de nuevo desde cero desde Eleventa.\n\n¿Está seguro de continuar?')) {
      return;
    }

    const startBtn = document.getElementById('btn-start-eleventa-import');
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.innerText = '⏳ Procesando importación...';
    }

    // Mostrar feedback visual inmediato en la UI
    const progressBox = document.getElementById('eleventa-progress-box');
    const bar = document.getElementById('eleventa-progress-bar');
    const text = document.getElementById('eleventa-progress-text');
    const statsList = document.getElementById('eleventa-stats-list');

    if (progressBox) progressBox.style.display = 'block';
    if (bar) bar.style.width = '3%';
    if (text) text.innerText = 'Iniciando importación limpia desde cero... (3%)';
    if (statsList) {
      statsList.innerHTML = `
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: var(--radius-sm); padding: 0.75rem; text-align: center; font-size: 0.85rem; color: #1e40af; margin-top: 0.75rem;">
          ⚙️ Limpiando tablas y conectando con el motor de Eleventa...
        </div>
      `;
    }

    try {
      const res = await fetch('/api/eleventa/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eleventa_path: path, import_sales: importSales })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Error al iniciar importación');
      }

      App.showToast('Importación iniciada desde cero. Procesando datos...', 'success');
      this.startPolling();
    } catch (err) {
      App.showToast(err.message, 'error');
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerText = '🚀 Iniciar Importación';
      }
    }
  },

  startPolling() {
    if (this.timer) clearInterval(this.timer);
    let attempts = 0;
    this.timer = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch('/api/eleventa/status');
        const data = await res.json();
        const job = data.import_job;

        const progressBox = document.getElementById('eleventa-progress-box');
        if (progressBox) progressBox.style.display = 'block';
        this.updateProgressUI(job);

        // Si ya no está en ejecución (pero dejando margen de los primeros sondeos para que el subproceso arranque)
        if (!job.running && (attempts > 2 || job.stage === 'completed' || job.stage === 'error')) {
          clearInterval(this.timer);
          this.timer = null;
          const startBtn = document.getElementById('btn-start-eleventa-import');
          if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerText = '🚀 Iniciar Importación';
          }

          if (job.stage === 'completed') {
            App.showToast('¡Importación de Eleventa completada exitosamente!', 'success');
            // Recargar datos en el sistema
            if (typeof PosModule !== 'undefined' && PosModule.loadProducts) PosModule.loadProducts();
            if (typeof InventoryModule !== 'undefined' && InventoryModule.loadProducts) InventoryModule.loadProducts();
            if (typeof CustomersModule !== 'undefined' && CustomersModule.loadCustomers) CustomersModule.loadCustomers();
            if (typeof ReportsModule !== 'undefined' && ReportsModule.loadDashboard) ReportsModule.loadDashboard();
          } else if (job.stage === 'error') {
            App.showToast(job.error || 'Error en la importación', 'error');
          }
        }
      } catch (err) {
        console.error('Error en polling:', err);
      }
    }, 1500);
  },

  updateProgressUI(job) {
    const bar = document.getElementById('eleventa-progress-bar');
    const text = document.getElementById('eleventa-progress-text');
    const statsList = document.getElementById('eleventa-stats-list');

    if (bar) bar.style.width = `${job.progress || 0}%`;
    if (text) text.innerText = `${job.message} (${job.progress || 0}%)`;

    if (statsList && job.stats) {
      const s = job.stats;
      statsList.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.5rem; margin-top: 0.75rem; text-align: center;">
          <div style="background: #f8fafc; padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid #e2e8f0;">
            <div style="font-size: 0.75rem; color: var(--text-secondary);">Categorías</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary-blue);">${s.categories || 0}</div>
          </div>
          <div style="background: #f8fafc; padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid #e2e8f0;">
            <div style="font-size: 0.75rem; color: var(--text-secondary);">Clientes</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary-blue);">${s.customers || 0}</div>
          </div>
          <div style="background: #f8fafc; padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid #e2e8f0;">
            <div style="font-size: 0.75rem; color: var(--text-secondary);">Productos</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary-blue);">${(s.products || 0).toLocaleString()}</div>
          </div>
          <div style="background: #f8fafc; padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid #e2e8f0;">
            <div style="font-size: 0.75rem; color: var(--text-secondary);">Ventas (Tickets)</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: #16a34a;">${(s.sales || 0).toLocaleString()}</div>
          </div>
        </div>
      `;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  EleventaModule.init();
});
