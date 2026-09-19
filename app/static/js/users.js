/**
 * MÓDULO DE GESTIÓN DE USUARIOS Y CAJEROS CON PERMISOS GRANULARES
 */

const UsersModule = {
  users: [],
  selectedUser: null,
  availablePermissions: [],

  async init() {
    await this.loadPermissions();
    await this.loadUsers();
    this.bindEvents();
  },

  bindEvents() {
    const searchInput = document.getElementById('users-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.renderUsersList(e.target.value.trim().toLowerCase());
      });
    }

    const btnNewUser = document.getElementById('btn-new-user');
    if (btnNewUser) {
      btnNewUser.addEventListener('click', () => this.prepareNewUser());
    }

    const btnSaveUser = document.getElementById('btn-save-user');
    if (btnSaveUser) {
      btnSaveUser.addEventListener('click', () => this.saveUser());
    }

    const btnDeleteUser = document.getElementById('btn-delete-user');
    if (btnDeleteUser) {
      btnDeleteUser.addEventListener('click', () => this.deleteCurrentUser());
    }

    // Selector de rol cambia permisos por defecto
    const roleSelect = document.getElementById('user-edit-role');
    if (roleSelect) {
      roleSelect.addEventListener('change', (e) => {
        this.applyRoleDefaults(e.target.value);
      });
    }
  },

  async loadPermissions() {
    try {
      const res = await fetch('/api/users/permissions');
      if (res.ok) {
        this.availablePermissions = await res.json();
      }
    } catch (e) {
      console.error('Error cargando permisos:', e);
    }
  },

  async loadUsers() {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        this.users = await res.json();
        this.renderUsersList();
        if (this.users.length > 0) {
          // Seleccionar el primer usuario (admin por defecto) si no hay uno seleccionado
          const toSelect = this.selectedUser 
            ? (this.users.find(u => u.id === this.selectedUser.id) || this.users[0])
            : this.users[0];
          this.selectUser(toSelect);
        }
      }
    } catch (e) {
      console.error('Error cargando usuarios:', e);
    }
  },

  renderUsersList(filter = '') {
    const container = document.getElementById('users-master-list');
    if (!container) return;

    const filtered = this.users.filter(u => 
      u.name.toLowerCase().includes(filter) ||
      u.username.toLowerCase().includes(filter) ||
      u.role.toLowerCase().includes(filter)
    );

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-secondary); padding: 2rem 1rem;">
          No se encontraron cajeros o usuarios
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(u => {
      const isSelected = this.selectedUser && this.selectedUser.id === u.id;
      const isAdmin = u.username === 'admin' || u.role === 'ADMIN';
      const roleBadgeColor = isAdmin ? 'var(--primary-blue)' : 'var(--accent-green-dark)';

      return `
        <div class="master-product-item ${isSelected ? 'active' : ''}" onclick="UsersModule.onUserClick(${u.id})">
          <div class="master-item-left">
            <div class="store-avatar" style="background: ${isSelected ? 'var(--primary-blue-light)' : 'var(--bg-subtle)'}; font-size: 1.2rem;">
              ${u.avatar || '👨‍💼'}
            </div>
            <div>
              <div class="master-item-name" style="display: flex; align-items: center; gap: 0.4rem;">
                ${u.name}
                ${!u.is_active ? '<span style="font-size:0.7rem; color:var(--accent-red); font-weight:700;">(Inactivo)</span>' : ''}
              </div>
              <div class="master-item-meta" style="color: ${roleBadgeColor}; font-weight: 700;">
                ${isAdmin ? '👑 Administrador' : '💼 ' + u.role} • @${u.username}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  onUserClick(userId) {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      this.selectUser(user);
      this.renderUsersList(document.getElementById('users-search-input')?.value.trim().toLowerCase() || '');
    }
  },

  selectUser(user) {
    this.selectedUser = user;
    this.isCreatingNew = false;

    // Actualizar campos
    document.getElementById('user-edit-id').value = user.id;
    document.getElementById('user-edit-name').value = user.name;
    document.getElementById('user-edit-username').value = user.username;
    document.getElementById('user-edit-username').disabled = (user.username === 'admin');
    document.getElementById('user-edit-role').value = user.role;
    document.getElementById('user-edit-pin').value = user.pin || '';
    document.getElementById('user-edit-phone').value = user.phone || '';
    document.getElementById('user-edit-email').value = user.email || '';
    document.getElementById('user-edit-avatar').value = user.avatar || '👨‍💼';
    document.getElementById('user-edit-active').checked = !!user.is_active;
    document.getElementById('user-edit-active').disabled = (user.username === 'admin');

    // Avatar preview
    const avatarEl = document.getElementById('user-avatar-preview');
    if (avatarEl) avatarEl.innerText = user.avatar || '👨‍💼';

    // Botón eliminar
    const btnDel = document.getElementById('btn-delete-user');
    if (btnDel) {
      btnDel.style.display = (user.username === 'admin') ? 'none' : 'inline-flex';
    }

    const titleEl = document.getElementById('user-detail-title');
    if (titleEl) {
      titleEl.innerText = user.name;
    }

    const roleBadge = document.getElementById('user-detail-role-badge');
    if (roleBadge) {
      roleBadge.innerText = (user.username === 'admin' || user.role === 'ADMIN') 
        ? '👑 Rol: ADMINISTRADOR GENERAL' 
        : `✓ Rol: ${user.role.toUpperCase()}`;
    }

    this.renderPermissionsMatrix(user.permissions_list || []);
  },

  prepareNewUser() {
    this.isCreatingNew = true;
    this.selectedUser = null;

    document.getElementById('user-edit-id').value = '';
    document.getElementById('user-edit-name').value = '';
    document.getElementById('user-edit-username').value = '';
    document.getElementById('user-edit-username').disabled = false;
    document.getElementById('user-edit-role').value = 'Cajero';
    document.getElementById('user-edit-pin').value = '0000';
    document.getElementById('user-edit-phone').value = '';
    document.getElementById('user-edit-email').value = '';
    document.getElementById('user-edit-avatar').value = '👨‍💼';
    document.getElementById('user-edit-active').checked = true;
    document.getElementById('user-edit-active').disabled = false;

    const avatarEl = document.getElementById('user-avatar-preview');
    if (avatarEl) avatarEl.innerText = '👨‍💼';

    const btnDel = document.getElementById('btn-delete-user');
    if (btnDel) btnDel.style.display = 'none';

    const titleEl = document.getElementById('user-detail-title');
    if (titleEl) titleEl.innerText = 'Nuevo Cajero / Usuario';

    const roleBadge = document.getElementById('user-detail-role-badge');
    if (roleBadge) roleBadge.innerText = 'Nuevo Usuario (Sin guardar)';

    // Permisos por defecto para cajero: ventas, cortes, movimientos, consultar inventario
    const defaultPerms = ['pos_sale', 'cash_shifts', 'cash_movements', 'inventory_view'];
    this.renderPermissionsMatrix(defaultPerms);

    // Deseleccionar items en la lista
    document.querySelectorAll('#users-master-list .master-product-item').forEach(el => el.classList.remove('active'));
    document.getElementById('user-edit-name').focus();
  },

  applyRoleDefaults(role) {
    let perms = [];
    if (role === 'ADMIN' || role === 'Administrador') {
      perms = this.availablePermissions.map(p => p.code);
    } else if (role === 'Encargado') {
      perms = ['pos_sale', 'pos_discount', 'pos_cancel', 'cash_shifts', 'cash_movements', 'inventory_view', 'inventory_edit', 'customers_fiados', 'reports_view'];
    } else {
      // Cajero estándar
      perms = ['pos_sale', 'cash_shifts', 'cash_movements', 'inventory_view'];
    }
    this.renderPermissionsMatrix(perms);
  },

  renderPermissionsMatrix(activeCodes = []) {
    const container = document.getElementById('user-permissions-container');
    if (!container) return;

    const isAll = this.selectedUser && (this.selectedUser.permissions === '*' || this.selectedUser.role === 'ADMIN');
    const checkedCodes = isAll ? this.availablePermissions.map(p => p.code) : activeCodes;

    // Agrupar permisos por categoría
    const categories = {};
    this.availablePermissions.forEach(p => {
      if (!categories[p.category]) categories[p.category] = [];
      categories[p.category].push(p);
    });

    let html = '';
    for (const [catName, perms] of Object.entries(categories)) {
      html += `
        <div style="margin-bottom: 1rem;">
          <div style="font-size: 0.8rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.4rem;">
            ${catName}
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 0.6rem;">
            ${perms.map(p => {
              const isChecked = checkedCodes.includes(p.code);
              return `
                <label class="permission-item-box" style="display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.6rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer; transition: all 0.15s;">
                  <input type="checkbox" name="user-permission-check" value="${p.code}" ${isChecked ? 'checked' : ''} style="margin-top: 3px; cursor: pointer; accent-color: var(--primary-blue);">
                  <div>
                    <div style="font-weight: 700; font-size: 0.86rem;">${p.icon} ${p.name}</div>
                    <div style="font-size: 0.74rem; color: var(--text-secondary); line-height: 1.25;">${p.description}</div>
                  </div>
                </label>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  },

  getSelectedPermissions() {
    const checkboxes = document.querySelectorAll('input[name="user-permission-check"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
  },

  async saveUser() {
    const name = document.getElementById('user-edit-name').value.trim();
    const username = document.getElementById('user-edit-username').value.trim().toLowerCase();
    const role = document.getElementById('user-edit-role').value;
    const pin = document.getElementById('user-edit-pin').value.trim();
    const phone = document.getElementById('user-edit-phone').value.trim();
    const email = document.getElementById('user-edit-email').value.trim();
    const avatar = document.getElementById('user-edit-avatar').value;
    const isActive = document.getElementById('user-edit-active').checked;
    const permissions = this.getSelectedPermissions();

    if (!name) {
      App.showToast('El nombre del cajero es obligatorio', 'error');
      document.getElementById('user-edit-name').focus();
      return;
    }

    if (!username) {
      App.showToast('El nombre de usuario es obligatorio', 'error');
      document.getElementById('user-edit-username').focus();
      return;
    }

    const payload = {
      name,
      username,
      role,
      pin: pin || '0000',
      phone,
      email,
      avatar,
      is_active: isActive,
      permissions: (role === 'ADMIN' && permissions.length === this.availablePermissions.length) ? '*' : permissions
    };

    try {
      let res;
      if (this.isCreatingNew) {
        res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        const userId = document.getElementById('user-edit-id').value;
        res = await fetch(`/api/users/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al guardar usuario');

      App.showToast(data.message || 'Usuario guardado exitosamente', 'success');
      await this.loadUsers();

      // Recargar lista de cajeros en el modal de apertura de caja
      if (window.CashModule && typeof window.CashModule.loadCashiersList === 'function') {
        window.CashModule.loadCashiersList();
      }
    } catch (e) {
      App.showToast(e.message, 'error');
    }
  },

  async deleteCurrentUser() {
    if (!this.selectedUser) return;
    if (this.selectedUser.username === 'admin') {
      App.showToast('No se puede eliminar la cuenta principal de Administrador', 'error');
      return;
    }

    if (!confirm(`¿Está seguro de eliminar al cajero "${this.selectedUser.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${this.selectedUser.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al eliminar usuario');

      App.showToast(data.message, 'success');
      this.selectedUser = null;
      await this.loadUsers();
    } catch (e) {
      App.showToast(e.message, 'error');
    }
  }
};

window.UsersModule = UsersModule;
