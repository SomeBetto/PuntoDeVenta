/**
 * MÓDULO DE GESTIÓN DE SESIÓN DE USUARIO (ESTILO WINDOWS)
 * Permite cerrar sesión con respaldo, cambiar de usuario/cajero de forma rápida
 * y acceder directamente a la configuración y permisos de usuarios.
 */

const SessionModule = {
  currentUser: null,
  pendingSwitchUser: null,

  init() {
    this.loadActiveUser();
    this.bindEvents();
  },

  loadActiveUser() {
    const saved = localStorage.getItem('pos_active_user');
    if (saved) {
      try {
        this.currentUser = JSON.parse(saved);
      } catch (e) {
        this.currentUser = null;
      }
    }

    if (!this.currentUser) {
      this.currentUser = {
        id: 1,
        name: 'Administrador',
        username: 'admin',
        role: 'ADMIN',
        avatar: '👑'
      };
      localStorage.setItem('pos_active_user', JSON.stringify(this.currentUser));
    }

    this.updateUserUI();
  },

  updateUserUI() {
    if (!this.currentUser) return;

    // 1. Actualizar barra superior (botón de sesión)
    const topAvatar = document.getElementById('top-user-avatar');
    const topName = document.getElementById('top-user-name');
    if (topAvatar) topAvatar.textContent = this.currentUser.avatar || '👑';
    if (topName) topName.textContent = this.currentUser.username || this.currentUser.name || 'Admin';

    // 2. Actualizar encabezado del menú Windows
    const menuAvatar = document.getElementById('win-menu-user-avatar');
    const menuName = document.getElementById('win-menu-user-name');
    const menuRole = document.getElementById('win-menu-user-role');
    if (menuAvatar) menuAvatar.textContent = this.currentUser.avatar || '👑';
    if (menuName) menuName.textContent = this.currentUser.name || 'Administrador';
    if (menuRole) {
      const isAdm = this.currentUser.role === 'ADMIN' || this.currentUser.username === 'admin';
      menuRole.textContent = isAdm ? '👑 Administrador • Turno Activo' : `💼 ${this.currentUser.role || 'Cajero'} • Turno Activo`;
    }

    // 3. Actualizar menú lateral (Drawer)
    const drawerName = document.getElementById('drawer-user-name');
    const drawerRole = document.getElementById('drawer-user-role');
    const drawerAvatar = document.querySelector('.drawer-user-avatar');
    if (drawerName) drawerName.textContent = this.currentUser.name || 'Admin';
    if (drawerRole) drawerRole.textContent = this.currentUser.role === 'ADMIN' ? '👑 Control Total' : `💼 ${this.currentUser.role || 'Cajero'}`;
    if (drawerAvatar) drawerAvatar.textContent = this.currentUser.avatar || '👑';
  },

  bindEvents() {
    const btnSession = document.getElementById('btn-user-session');
    const dropdown = document.getElementById('windows-session-dropdown');

    if (btnSession && dropdown) {
      const wrapper = document.getElementById('user-session-menu-wrapper');
      btnSession.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.toggle('active');
        if (wrapper) wrapper.classList.toggle('open', isOpen);
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('#user-session-menu-wrapper')) {
          dropdown.classList.remove('active');
          if (wrapper) wrapper.classList.remove('open');
        }
      });
    }

    // Enter en input de PIN para cambiar usuario
    const pinInput = document.getElementById('switch-user-pin-input');
    if (pinInput) {
      pinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.confirmSwitchUser();
        }
      });
    }
  },

  closeDropdown() {
    const dropdown = document.getElementById('windows-session-dropdown');
    const wrapper = document.getElementById('user-session-menu-wrapper');
    if (dropdown) dropdown.classList.remove('active');
    if (wrapper) wrapper.classList.remove('open');
  },

  openUserSettings() {
    this.closeDropdown();
    App.switchView('users');
    if (window.UsersModule && typeof UsersModule.loadUsers === 'function') {
      UsersModule.loadUsers();
    }
  },

  openLogout() {
    this.closeDropdown();
    if (window.BackupModule) {
      BackupModule.openLogoutModal();
    }
  },

  async openSwitchUserModal() {
    this.closeDropdown();
    App.openModal('modal-switch-user');

    const container = document.getElementById('switch-user-grid');
    const pinWrap = document.getElementById('switch-user-pin-wrap');
    if (pinWrap) pinWrap.style.display = 'none';

    if (!container) return;
    container.innerHTML = '<div style="text-align:center; padding: 1.5rem; color:#64748b;">Cargando usuarios registrados...</div>';

    try {
      const res = await fetch('/api/users');
      const users = await res.json();

      if (!users || users.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#64748b; padding:1rem;">No hay usuarios registrados</div>';
        return;
      }

      this.pendingSwitchUser = users.find(u => u.id === this.currentUser?.id) || users[0];

      container.innerHTML = users.map(u => {
        const isCurrent = this.currentUser && this.currentUser.id === u.id;
        const isSelected = this.pendingSwitchUser && this.pendingSwitchUser.id === u.id;
        const isAdmin = u.role === 'ADMIN' || u.username === 'admin';

        return `
          <div class="switch-user-card ${isSelected ? 'selected' : ''}" onclick="SessionModule.selectUserToSwitch(${u.id})">
            <div class="switch-user-avatar">${u.avatar || '👨‍💼'}</div>
            <div class="switch-user-info">
              <strong class="switch-user-title">${u.name}</strong>
              <div class="switch-user-badges-wrap">
                <span class="switch-user-badge ${isAdmin ? 'admin' : 'cashier'}">${isAdmin ? 'Administrador' : (u.role || 'Cajero')}</span>
                ${isCurrent ? '<span class="current-session-tag">En sesión actual</span>' : ''}
              </div>
            </div>
            <div class="switch-user-check">${isSelected ? '✓' : ''}</div>
          </div>
        `;
      }).join('');

      // Si el seleccionado por defecto requiere PIN
      if (this.pendingSwitchUser && this.pendingSwitchUser.pin && this.pendingSwitchUser.pin.trim() !== '') {
        if (pinWrap) pinWrap.style.display = 'block';
      }

    } catch (e) {
      container.innerHTML = `<div style="color:#ef4444; text-align:center; padding:1rem;">Error cargando usuarios: ${e.message}</div>`;
    }
  },

  selectUserToSwitch(userId) {
    fetch('/api/users')
      .then(r => r.json())
      .then(users => {
        const target = users.find(u => u.id === userId);
        if (!target) return;

        this.pendingSwitchUser = target;

        // Actualizar visualmente la tarjeta seleccionada
        document.querySelectorAll('.switch-user-card').forEach(c => {
          c.classList.remove('selected');
          const check = c.querySelector('.switch-user-check');
          if (check) check.textContent = '';
        });

        const allCards = document.querySelectorAll('.switch-user-card');
        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex >= 0 && allCards[userIndex]) {
          allCards[userIndex].classList.add('selected');
          const check = allCards[userIndex].querySelector('.switch-user-check');
          if (check) check.textContent = '✓';
        }

        const pinWrap = document.getElementById('switch-user-pin-wrap');
        const pinInput = document.getElementById('switch-user-pin-input');
        if (target.pin && target.pin.trim() !== '') {
          if (pinWrap) pinWrap.style.display = 'block';
          if (pinInput) {
            pinInput.value = '';
            pinInput.focus();
          }
        } else {
          if (pinWrap) pinWrap.style.display = 'none';
        }
      });
  },

  confirmSwitchUser() {
    if (!this.pendingSwitchUser) {
      App.showToast('Seleccione un usuario de la lista', 'warning');
      return;
    }

    // Validar PIN si el usuario lo tiene configurado
    if (this.pendingSwitchUser.pin && this.pendingSwitchUser.pin.trim() !== '') {
      const pinInput = document.getElementById('switch-user-pin-input');
      const enteredPin = pinInput ? pinInput.value.trim() : '';
      if (enteredPin !== this.pendingSwitchUser.pin.trim()) {
        App.showToast('PIN incorrecto para este usuario', 'error');
        if (pinInput) {
          pinInput.value = '';
          pinInput.focus();
        }
        return;
      }
    }

    this.currentUser = {
      id: this.pendingSwitchUser.id,
      name: this.pendingSwitchUser.name,
      username: this.pendingSwitchUser.username,
      role: this.pendingSwitchUser.role,
      avatar: this.pendingSwitchUser.avatar || '👨‍💼'
    };

    localStorage.setItem('pos_active_user', JSON.stringify(this.currentUser));
    this.updateUserUI();

    App.closeModal('modal-switch-user');
    App.showToast(`✅ Sesión cambiada a: ${this.currentUser.name}`, 'success');

    // Sincronizar cajero en el turno activo si está CashModule presente
    if (window.CashModule && CashModule.currentShift) {
      CashModule.currentShift.cashier_name = this.currentUser.name;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  SessionModule.init();
});
