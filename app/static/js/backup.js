/**
 * MÓDULO DE RESPALDOS, CONFIGURACIÓN Y CIERRE DE SESIÓN
 * Administra la configuración de la carpeta de respaldos, creación de copias de seguridad
 * con sqlite3.backup() y el cierre seguro de sesión.
 */

const BackupModule = {
  currentBackupFolder: '',

  init() {
    this.bindEvents();
    this.loadBackupConfig();
  },

  bindEvents() {
    // Abrir modal de configuración desde barra superior o menú
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

    // Guardar Carpeta de Respaldo
    const btnSaveBackupFolder = document.getElementById('btn-save-backup-folder');
    if (btnSaveBackupFolder) {
      btnSaveBackupFolder.addEventListener('click', () => this.saveBackupFolder());
    }

    // Botón Crear Respaldo Manual
    const btnCreateManualBackup = document.getElementById('btn-create-manual-backup');
    if (btnCreateManualBackup) {
      btnCreateManualBackup.addEventListener('click', () => this.createManualBackup());
    }

    // Botón Optimizar Base de Datos
    const btnOptimizeDb = document.getElementById('btn-optimize-database');
    if (btnOptimizeDb) {
      btnOptimizeDb.addEventListener('click', () => this.optimizeDatabase());
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

      const folderInput = document.getElementById('setting-backup-folder-input');
      if (folderInput) {
        folderInput.value = data.backup_folder;
      }

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
    const btn = document.getElementById('btn-create-manual-backup');
    if (btn) btn.disabled = true;

    try {
      App.showToast('Creando respaldo de base de datos...', 'info');
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
      if (btn) btn.disabled = false;
    }
  },

  renderRecentBackups(backups) {
    const listEl = document.getElementById('recent-backups-list');
    if (!listEl) return;

    if (!backups || backups.length === 0) {
      listEl.innerHTML = '<div style="color: var(--text-secondary); font-size: 0.85rem; padding: 0.5rem 0;">Aún no se han generado respaldos en esta carpeta.</div>';
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 0.4rem; max-height: 180px; overflow-y: auto;">';
    backups.forEach(b => {
      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; background: #fff; padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid #e2e8f0; font-size: 0.82rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span>💾</span>
            <div>
              <div style="font-weight: 600; color: var(--text-primary);">${b.name}</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary);">${b.created_at}</div>
            </div>
          </div>
          <div style="background: #e0f2fe; color: #0369a1; padding: 0.2rem 0.5rem; border-radius: 999px; font-weight: 700; font-size: 0.75rem;">
            ${b.size_mb} MB
          </div>
        </div>
      `;
    });
    html += '</div>';
    listEl.innerHTML = html;
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
      // 1. Crear respaldo seguro con razón "logout"
      const res = await fetch('/api/backup/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'logout' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error creando respaldo al cerrar sesión');

      // 2. Cerrar el modal de confirmación
      App.closeModal('logout-modal');

      // 3. Mostrar pantalla de bloqueo / sesión cerrada con la información del respaldo
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
    const btn = document.getElementById('btn-optimize-database');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ Optimizando y desfragmentando...';
    }

    try {
      const res = await fetch('/api/backup/optimize', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error optimizando base de datos');

      App.showToast(`✅ ${data.message}`, 'success');
      await this.loadBackupConfig();
    } catch (err) {
      App.showToast(`Error al optimizar: ${err.message}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '🧹 Optimizar y Desfragmentar Base de Datos';
      }
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

    // Refrescar estado y productos
    if (typeof PosModule !== 'undefined') PosModule.loadProducts();
    if (typeof CashModule !== 'undefined') CashModule.loadCurrentShift();
    App.showToast('¡Bienvenido de nuevo! Sesión activa.', 'success');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  BackupModule.init();
});
