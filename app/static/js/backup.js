/**
 * MÓDULO DE RESPALDOS, CONFIGURACIÓN Y CIERRE DE SESIÓN
 * Administra la configuración de la carpeta de respaldos, creación de copias de seguridad
 * con sqlite3.backup() y el cierre seguro de sesión.
 */

const BackupModule = {
  currentBackupFolder: '',
  selectedBackupToRestore: null,

  init() {
    this.bindEvents();
    this.loadBackupConfig();
  },

  bindEvents() {
    // Abrir configuración desde barra superior o Drawer
    const btnTopSettings = document.getElementById('btn-top-settings');
    if (btnTopSettings) {
      btnTopSettings.addEventListener('click', () => this.openSettingsModal());
    }

    const btnDrawerSettings = document.getElementById('btn-open-settings-modal');
    if (btnDrawerSettings) {
      btnDrawerSettings.addEventListener('click', () => {
        App.closeDrawer();
        this.openSettingsModal();
      });
    }

    // Botones de Cerrar Sesión (Barra superior y Drawer)
    const btnTopLogout = document.getElementById('btn-top-logout');
    if (btnTopLogout) {
      btnTopLogout.addEventListener('click', () => this.openLogoutModal());
    }

    const btnDrawerLogout = document.getElementById('btn-drawer-logout');
    if (btnDrawerLogout) {
      btnDrawerLogout.addEventListener('click', () => {
        App.closeDrawer();
        this.openLogoutModal();
      });
    }

    // Confirmar Cierre de Sesión en el Modal
    const btnConfirmLogout = document.getElementById('btn-confirm-logout');
    if (btnConfirmLogout) {
      btnConfirmLogout.addEventListener('click', () => this.processLogoutWithBackup());
    }

    // Guardar Carpeta de Respaldo (manejar todos los botones)
    document.querySelectorAll('#btn-save-backup-folder, .btn-save-backup-folder').forEach(btn => {
      btn.addEventListener('click', () => this.saveBackupFolder());
    });

    // Botones Crear Respaldo Manual
    document.querySelectorAll('#btn-create-manual-backup, .btn-create-manual-backup').forEach(btn => {
      btn.addEventListener('click', () => this.createManualBackup());
    });

    // Botones Optimizar Base de Datos
    document.querySelectorAll('#btn-optimize-database, .btn-optimize-database').forEach(btn => {
      btn.addEventListener('click', () => this.optimizeDatabase());
    });

    // Botones Subir y Cargar Respaldo (.db)
    document.querySelectorAll('#btn-upload-backup-file, .btn-upload-backup-file').forEach(btn => {
      btn.addEventListener('click', () => {
        const fileInput = document.getElementById('backup-file-upload-input');
        if (fileInput) fileInput.click();
      });
    });

    // Input de archivo para subir y restaurar
    const uploadInput = document.getElementById('backup-file-upload-input');
    if (uploadInput) {
      uploadInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleFileUpload(e.target.files[0]);
          e.target.value = ''; // Reset para permitir volver a seleccionar el mismo archivo si se desea
        }
      });
    }

    // Botón de confirmación de restauración en el modal
    const btnDoRestore = document.getElementById('btn-do-restore');
    if (btnDoRestore) {
      btnDoRestore.addEventListener('click', () => this.executeRestore());
    }

    // Guardar Configuración de Tienda
    const btnSaveStoreSettings = document.getElementById('btn-save-store-settings');
    if (btnSaveStoreSettings) {
      btnSaveStoreSettings.addEventListener('click', () => this.saveStoreSettings());
    }

    // Desbloquear / Iniciar Sesión desde Lock Screen
    const btnUnlockSession = document.getElementById('btn-unlock-session');
    if (btnUnlockSession) {
      btnUnlockSession.addEventListener('click', () => this.unlockSession());
    }
  },

  async loadBackupConfig() {
    try {
      const res = await fetch('/api/backup/config');
      const data = await res.json();
      this.currentBackupFolder = data.backup_folder;

      document.querySelectorAll('#setting-backup-folder-input, .setting-backup-folder-input').forEach(input => {
        input.value = data.backup_folder;
      });

      this.renderRecentBackups(data.recent_backups || []);
    } catch (err) {
      console.error('Error cargando configuración de respaldo:', err);
    }
  },

  async openSettingsModal() {
    App.switchView('settings');
    await this.loadBackupConfig();
    if (window.SettingsModule) {
      await SettingsModule.loadSettings();
    }
  },

  async saveStoreSettings() {
    if (window.SettingsModule) {
      await SettingsModule.saveFromModal();
    }
  },

  async saveBackupFolder() {
    const folderInput = document.getElementById('setting-backup-folder-input');
    const folder = folderInput ? folderInput.value.trim() : '';
    if (!folder) {
      App.showToast('Ingrese una ruta válida para la carpeta', 'error');
      return;
    }

    try {
      const res = await fetch('/api/backup/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup_folder: folder })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al guardar ruta');

      this.currentBackupFolder = data.backup_folder;
      App.showToast('Carpeta de respaldo actualizada con éxito', 'success');
      await this.loadBackupConfig();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async createManualBackup() {
    const btns = document.querySelectorAll('#btn-create-manual-backup, .btn-create-manual-backup');
    btns.forEach(b => { b.disabled = true; });

    try {
      App.showToast('Creando respaldo seguro de base de datos...', 'info');
      const res = await fetch('/api/backup/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error creando respaldo');

      App.showToast(`✅ Respaldo creado: ${data.filename} (${data.size_mb} MB)`, 'success');
      await this.loadBackupConfig();
    } catch (err) {
      App.showToast(err.message, 'error');
    } finally {
      btns.forEach(b => { b.disabled = false; });
    }
  },

  renderRecentBackups(backups) {
    const containers = document.querySelectorAll('#recent-backups-list, .recent-backups-list');
    if (!containers || containers.length === 0) return;

    let innerContent = '';
    if (!backups || backups.length === 0) {
      innerContent = '<div style="color: var(--text-secondary); font-size: 0.85rem; padding: 0.75rem 0; text-align: center;">Aún no se han generado respaldos en esta carpeta.</div>';
    } else {
      let itemsHtml = '<div style="display: flex; flex-direction: column; gap: 0.45rem; max-height: 240px; overflow-y: auto; padding-right: 0.25rem;">';
      backups.forEach(b => {
        const safeName = b.name.replace(/'/g, "\\'");
        itemsHtml += `
          <div style="display: flex; justify-content: space-between; align-items: center; background: #fff; padding: 0.6rem 0.8rem; border-radius: var(--radius-sm); border: 1px solid #e2e8f0; font-size: 0.82rem; gap: 0.5rem; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 0.5rem; min-width: 200px; flex: 1;">
              <span style="font-size: 1.15rem;">💾</span>
              <div style="min-width: 0; flex: 1;">
                <div style="font-weight: 700; color: var(--text-primary); word-break: break-all;" title="${b.name}">${b.name}</div>
                <div style="font-size: 0.73rem; color: var(--text-secondary);">${b.created_at} &bull; <strong style="color: #0284c7;">${b.size_mb} MB</strong></div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.35rem;">
              <a href="/api/backup/download/${encodeURIComponent(b.name)}" class="meta-btn" style="padding: 0.35rem 0.65rem; font-size: 0.75rem; text-decoration: none; display: inline-flex; align-items: center; gap: 0.25rem;" title="Descargar respaldo a su dispositivo">
                <span>⬇️</span> Descargar
              </a>
              <button type="button" class="btn-modal-accept" onclick="BackupModule.openConfirmRestoreModal('${safeName}', '${b.created_at}', '${b.size_mb} MB')" style="background: #0284c7; padding: 0.35rem 0.75rem; font-size: 0.75rem; border: none; font-weight: 700; display: inline-flex; align-items: center; gap: 0.25rem;" title="Cargar y restaurar este respaldo en el sistema">
                <span>🔄</span> Cargar
              </button>
            </div>
          </div>
        `;
      });
      itemsHtml += '</div>';
      innerContent = itemsHtml;
    }

    containers.forEach(c => {
      c.innerHTML = innerContent;
    });
  },

  openConfirmRestoreModal(filename, date, size) {
    this.selectedBackupToRestore = { filename, date, size };

    const nameEl = document.getElementById('restore-modal-filename');
    const dateEl = document.getElementById('restore-modal-date');
    const sizeEl = document.getElementById('restore-modal-size');

    if (nameEl) nameEl.textContent = filename;
    if (dateEl) dateEl.textContent = date || 'Desconocida';
    if (sizeEl) sizeEl.textContent = size || '';

    App.openModal('modal-confirm-restore');
  },

  async executeRestore() {
    if (!this.selectedBackupToRestore || !this.selectedBackupToRestore.filename) {
      App.showToast('No se ha seleccionado ningún archivo para restaurar', 'error');
      return;
    }

    const filename = this.selectedBackupToRestore.filename;
    const btn = document.getElementById('btn-do-restore');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ Restaurando base de datos...';
    }

    try {
      App.showToast(`Restaurando respaldo '${filename}'...`, 'info');
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: filename })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Error al restaurar el respaldo seleccionado');
      }

      // Cerrar modal de confirmación
      App.closeModal('modal-confirm-restore');

      // Mostrar modal de éxito detallado
      this.showRestoreSuccessModal(data);

      // Recargar configuración de respaldos
      await this.loadBackupConfig();

    } catch (err) {
      App.showToast(`❌ Error al restaurar: ${err.message}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '🔄 Confirmar y Cargar';
      }
    }
  },

  async handleFileUpload(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.db')) {
      App.showToast('Solo se permiten archivos de base de datos con extensión .db', 'error');
      return;
    }

    const confirmMsg = `¿Desea subir y restaurar el archivo "${file.name}"?\n\n⚠️ Esta acción reemplazará la base de datos actual.\n🛡️ Se generará automáticamente un respaldo de seguridad previo.`;
    if (!confirm(confirmMsg)) {
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    App.showToast('Subiendo y validando archivo de respaldo...', 'info');

    try {
      const res = await fetch('/api/backup/upload-restore', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Error al restaurar archivo subido');
      }

      this.showRestoreSuccessModal(data);
      await this.loadBackupConfig();
    } catch (err) {
      App.showToast(`❌ Error al cargar archivo: ${err.message}`, 'error');
    }
  },

  showRestoreSuccessModal(data) {
    const modal = document.getElementById('modal-restore-success');
    if (!modal) {
      App.showToast('✅ ' + data.message, 'success');
      setTimeout(() => window.location.reload(), 1500);
      return;
    }

    const prodEl = document.getElementById('restore-success-products');
    const custEl = document.getElementById('restore-success-customers');
    const salesEl = document.getElementById('restore-success-sales');
    const safetyEl = document.getElementById('restore-success-safety');

    if (prodEl) prodEl.textContent = data.counts?.products ?? '0';
    if (custEl) custEl.textContent = data.counts?.customers ?? '0';
    if (salesEl) salesEl.textContent = data.counts?.sales ?? '0';
    if (safetyEl) safetyEl.textContent = data.safety_backup || 'Guardado en carpeta de respaldos';

    App.openModal('modal-restore-success');
    App.showToast('✅ Base de datos restaurada correctamente', 'success');
  },

  openLogoutModal() {
    const targetFolderEl = document.getElementById('logout-backup-target-folder');
    if (targetFolderEl) {
      targetFolderEl.innerText = this.currentBackupFolder || 'Carpeta predeterminada (respaldos/)';
    }
    App.openModal('logout-modal');
  },

  async processLogoutWithBackup() {
    const btn = document.getElementById('btn-confirm-logout');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ Respaldando base de datos...';
    }

    try {
      const res = await fetch('/api/backup/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'logout' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error creando respaldo al cerrar sesión');

      App.closeModal('logout-modal');
      this.showLockScreen(data);
    } catch (err) {
      App.showToast(`Error al respaldar al cerrar sesión: ${err.message}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '💾 Respaldar y Cerrar Sesión';
      }
    }
  },

  async optimizeDatabase() {
    const btns = document.querySelectorAll('#btn-optimize-database, .btn-optimize-database');
    btns.forEach(b => {
      b.disabled = true;
      b.dataset.oldText = b.innerHTML;
      b.innerHTML = '⏳ Optimizando...';
    });

    try {
      const res = await fetch('/api/backup/optimize', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error optimizando base de datos');

      App.showToast(`✅ ${data.message}`, 'success');
      await this.loadBackupConfig();
    } catch (err) {
      App.showToast(`Error al optimizar: ${err.message}`, 'error');
    } finally {
      btns.forEach(b => {
        b.disabled = false;
        if (b.dataset.oldText) b.innerHTML = b.dataset.oldText;
      });
    }
  },

  showLockScreen(backupData) {
    const lockScreen = document.getElementById('lock-screen');
    const infoBox = document.getElementById('lock-screen-backup-info');

    if (infoBox && backupData) {
      infoBox.innerHTML = `
        <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: var(--radius-md); padding: 0.85rem; text-align: left; margin: 1rem 0;">
          <div style="font-weight: 700; color: #166534; font-size: 0.9rem; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.4rem;">
            <span>✅</span> Respaldo generado automáticamente:
          </div>
          <div style="font-size: 0.82rem; color: #14532d; display: flex; flex-direction: column; gap: 0.2rem;">
            <div><strong>Archivo:</strong> <code>${backupData.filename}</code></div>
            <div><strong>Tamaño:</strong> ${backupData.size_mb} MB</div>
            <div><strong>Carpeta:</strong> <code>${backupData.folder}</code></div>
            <div><strong>Fecha:</strong> ${backupData.created_at}</div>
          </div>
        </div>
      `;
    }

    if (lockScreen) {
      lockScreen.classList.add('active');
    }

    App.showToast('Sesión cerrada y base de datos respaldada correctamente', 'success');
  },

  unlockSession() {
    const lockScreen = document.getElementById('lock-screen');
    if (lockScreen) {
      lockScreen.classList.remove('active');
    }

    if (typeof PosModule !== 'undefined') PosModule.loadProducts();
    if (typeof CashModule !== 'undefined') CashModule.loadCurrentShift();
    App.showToast('¡Bienvenido de nuevo! Sesión activa.', 'success');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  BackupModule.init();
});
