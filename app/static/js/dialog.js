/**
 * SISTEMA DE DIÁLOGOS Y MODALES PERSONALIZADOS - ESTILO SICAR POS
 * Proporciona confirmaciones, prompts y alertas nativas de alta estética ("alucines")
 * eliminando por completo los diálogos arcaicos del navegador (confirm, prompt, alert).
 */

const AppDialog = {
  overlayEl: null,
  cardEl: null,
  badgeEl: null,
  titleEl: null,
  subtitleEl: null,
  closeBtn: null,
  messageEl: null,
  inputWrapEl: null,
  inputLabelEl: null,
  inputIconEl: null,
  inputEl: null,
  footerEl: null,
  cancelBtn: null,
  confirmBtn: null,
  activeResolve: null,
  previousActiveElement: null,

  init() {
    if (this.overlayEl) return;
    this.createDOM();
    this.bindEvents();
  },

  createDOM() {
    let overlay = document.getElementById('app-custom-dialog-modal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'app-custom-dialog-modal';
      overlay.className = 'app-dialog-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.innerHTML = `
        <div class="app-dialog-card type-info" id="app-dialog-card">
          <div class="app-dialog-header">
            <div class="app-dialog-badge" id="app-dialog-badge">💬</div>
            <div class="app-dialog-header-text">
              <div class="app-dialog-subtitle" id="app-dialog-subtitle">PUNTO DE VENTA</div>
              <h3 class="app-dialog-title" id="app-dialog-title">Confirmación</h3>
            </div>
            <button type="button" class="app-dialog-close-btn" id="app-dialog-close-btn" title="Cerrar (Esc)">✕</button>
          </div>
          <div class="app-dialog-body">
            <div class="app-dialog-message" id="app-dialog-message"></div>
            <div class="app-dialog-input-wrap" id="app-dialog-input-wrap" style="display: none;">
              <label class="app-dialog-input-label" id="app-dialog-input-label">Ingrese el valor:</label>
              <div class="app-dialog-input-box">
                <span class="input-icon" id="app-dialog-input-icon">⌨️</span>
                <input type="text" class="app-dialog-input" id="app-dialog-input" autocomplete="off" />
              </div>
            </div>
          </div>
          <div class="app-dialog-footer" id="app-dialog-footer">
            <button type="button" class="app-dialog-btn app-dialog-btn-cancel" id="app-dialog-cancel-btn">
              Cancelar
            </button>
            <button type="button" class="app-dialog-btn app-dialog-btn-confirm" id="app-dialog-confirm-btn">
              Aceptar
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    this.overlayEl = overlay;
    this.cardEl = overlay.querySelector('#app-dialog-card');
    this.badgeEl = overlay.querySelector('#app-dialog-badge');
    this.titleEl = overlay.querySelector('#app-dialog-title');
    this.subtitleEl = overlay.querySelector('#app-dialog-subtitle');
    this.closeBtn = overlay.querySelector('#app-dialog-close-btn');
    this.messageEl = overlay.querySelector('#app-dialog-message');
    this.inputWrapEl = overlay.querySelector('#app-dialog-input-wrap');
    this.inputLabelEl = overlay.querySelector('#app-dialog-input-label');
    this.inputIconEl = overlay.querySelector('#app-dialog-input-icon');
    this.inputEl = overlay.querySelector('#app-dialog-input');
    this.footerEl = overlay.querySelector('#app-dialog-footer');
    this.cancelBtn = overlay.querySelector('#app-dialog-cancel-btn');
    this.confirmBtn = overlay.querySelector('#app-dialog-confirm-btn');
  },

  bindEvents() {
    this.closeBtn.addEventListener('click', () => this.handleCancel());
    this.cancelBtn.addEventListener('click', () => this.handleCancel());
    this.confirmBtn.addEventListener('click', () => this.handleConfirm());

    // Clic en backdrop fuera de la tarjeta
    this.overlayEl.addEventListener('click', (e) => {
      if (e.target === this.overlayEl) {
        this.handleCancel();
      }
    });

    // Control global de teclado
    document.addEventListener('keydown', (e) => {
      if (!this.overlayEl || !this.overlayEl.classList.contains('active')) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.handleCancel();
      } else if (e.key === 'Enter') {
        // En un input de texto, Enter confirma
        if (document.activeElement === this.inputEl || document.activeElement === this.confirmBtn) {
          e.preventDefault();
          e.stopPropagation();
          this.handleConfirm();
        }
      }
    });
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

  formatMessage(text) {
    if (!text) return '';
    const safe = this.escapeHtml(text);
    return safe
      .split('\n\n')
      .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
      .join('');
  },

  /**
   * Modal de confirmación estilizado
   * Resuelve `true` si el usuario acepta, `false` si cancela
   */
  confirm(opts) {
    this.init();

    let config = {};
    if (typeof opts === 'string') {
      config = this.inferConfigFromMessage(opts);
    } else if (typeof opts === 'object' && opts !== null) {
      config = { ...opts };
    }

    return new Promise((resolve) => {
      this.activeResolve = (val) => resolve(!!val);
      this.previousActiveElement = document.activeElement;

      // Configurar apariencia
      const type = config.type || 'info';
      this.cardEl.className = `app-dialog-card type-${type}`;

      this.badgeEl.textContent = config.icon || this.getDefaultIcon(type);
      this.titleEl.textContent = config.title || '¿Desea Continuar?';
      this.subtitleEl.textContent = config.subtitle || 'PUNTO DE VENTA';

      this.messageEl.innerHTML = this.formatMessage(config.message || '');
      this.inputWrapEl.style.display = 'none';

      this.cancelBtn.style.display = 'inline-flex';
      this.cancelBtn.textContent = config.cancelText || 'Cancelar';

      this.confirmBtn.textContent = config.confirmText || 'Aceptar';

      // Mostrar modal con animación
      this.overlayEl.classList.add('active');

      // Autofoco en el botón de confirmación o cancelación según peligrosidad
      setTimeout(() => {
        if (type === 'danger') {
          this.confirmBtn.focus();
        } else {
          this.confirmBtn.focus();
        }
      }, 50);
    });
  },

  /**
   * Modal para captura de texto/código (reemplazo de window.prompt)
   * Resuelve el string ingresado si acepta, o `null` si cancela
   */
  prompt(opts, defaultVal = '') {
    this.init();

    let config = {};
    if (typeof opts === 'string') {
      config = {
        message: opts,
        defaultValue: defaultVal,
        title: 'Ingresar Información',
        type: 'info',
        icon: '⌨️'
      };
    } else if (typeof opts === 'object' && opts !== null) {
      config = { ...opts };
    }

    return new Promise((resolve) => {
      this.activeResolve = (val) => {
        if (val === null || val === false) {
          resolve(null);
        } else {
          resolve(String(this.inputEl.value).trim());
        }
      };

      this.previousActiveElement = document.activeElement;

      const type = config.type || 'info';
      this.cardEl.className = `app-dialog-card type-${type}`;

      this.badgeEl.textContent = config.icon || '⌨️';
      this.titleEl.textContent = config.title || 'Ingresar Dato';
      this.subtitleEl.textContent = config.subtitle || 'PUNTO DE VENTA';

      this.messageEl.innerHTML = this.formatMessage(config.message || '');

      // Activar input
      this.inputWrapEl.style.display = 'block';
      this.inputLabelEl.textContent = config.inputLabel || 'Escriba o escanee:';
      this.inputIconEl.textContent = config.inputIcon || '🔍';
      this.inputEl.placeholder = config.placeholder || 'Escriba aquí...';
      this.inputEl.value = config.defaultValue || '';
      this.inputEl.type = config.inputType || 'text';

      this.cancelBtn.style.display = 'inline-flex';
      this.cancelBtn.textContent = config.cancelText || 'Cancelar';

      this.confirmBtn.textContent = config.confirmText || 'Continuar';

      this.overlayEl.classList.add('active');

      setTimeout(() => {
        this.inputEl.focus();
        this.inputEl.select();
      }, 80);
    });
  },

  /**
   * Modal de aviso (reemplazo de window.alert)
   */
  alert(opts) {
    this.init();

    let config = {};
    if (typeof opts === 'string') {
      config = {
        message: opts,
        title: 'Aviso del Sistema',
        type: 'info',
        icon: 'ℹ️',
        confirmText: 'Entendido'
      };
    } else if (typeof opts === 'object' && opts !== null) {
      config = { ...opts };
    }

    return new Promise((resolve) => {
      this.activeResolve = () => resolve();
      this.previousActiveElement = document.activeElement;

      const type = config.type || 'info';
      this.cardEl.className = `app-dialog-card type-${type}`;

      this.badgeEl.textContent = config.icon || this.getDefaultIcon(type);
      this.titleEl.textContent = config.title || 'Aviso';
      this.subtitleEl.textContent = config.subtitle || 'PUNTO DE VENTA';

      this.messageEl.innerHTML = this.formatMessage(config.message || '');
      this.inputWrapEl.style.display = 'none';

      this.cancelBtn.style.display = 'none';
      this.confirmBtn.textContent = config.confirmText || 'Aceptar';

      this.overlayEl.classList.add('active');

      setTimeout(() => {
        this.confirmBtn.focus();
      }, 50);
    });
  },

  handleConfirm() {
    if (!this.overlayEl.classList.contains('active')) return;
    this.close();
    if (this.activeResolve) {
      this.activeResolve(true);
      this.activeResolve = null;
    }
  },

  handleCancel() {
    if (!this.overlayEl.classList.contains('active')) return;
    this.close();
    if (this.activeResolve) {
      this.activeResolve(null);
      this.activeResolve = null;
    }
  },

  close() {
    if (this.overlayEl) {
      this.overlayEl.classList.remove('active');
    }
    if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
      try {
        this.previousActiveElement.focus();
      } catch (e) {}
    }
  },

  inferConfigFromMessage(msg) {
    const isDanger = /vaciar|eliminar|dar de baja|cancelar|borrar/i.test(msg);
    const isWarning = /advertencia|atención|cuidado|reemplazará|reemplazar|restablecer/i.test(msg);
    const isSuccess = /express|cobro|éxito/i.test(msg);

    let type = 'info';
    let icon = '💬';
    let title = '¿Desea Continuar?';
    let confirmText = 'Aceptar';

    if (isDanger) {
      type = 'danger';
      icon = /vaciar/i.test(msg) ? '🗑️' : (/cancelar/i.test(msg) ? '⚠️' : '🗑️');
      title = /vaciar/i.test(msg)
        ? 'Vaciar Carrito de Venta'
        : (/cancelar/i.test(msg) ? 'Cancelar Operación' : 'Eliminar Registro');
      confirmText = /vaciar/i.test(msg) ? 'Sí, vaciar venta' : (/eliminar/i.test(msg) ? 'Sí, eliminar' : 'Sí, continuar');
    } else if (isWarning) {
      type = 'warning';
      icon = '⚠️';
      title = 'Atención Requerida';
      confirmText = 'Continuar';
    } else if (isSuccess) {
      type = 'success';
      icon = '⚡';
      title = 'Cobro Rápido en Efectivo';
      confirmText = 'Cobrar Ahora';
    }

    return {
      message: msg,
      type,
      icon,
      title,
      confirmText,
      cancelText: 'Cancelar'
    };
  },

  getDefaultIcon(type) {
    switch (type) {
      case 'danger': return '🗑️';
      case 'warning': return '⚠️';
      case 'success': return '✅';
      case 'info':
      default: return '💬';
    }
  }
};

// Exponer en objeto global App y window
window.AppDialog = AppDialog;
window.App = window.App || {};
window.App.confirm = (opts) => AppDialog.confirm(opts);
window.App.prompt = (opts, def) => AppDialog.prompt(opts, def);
window.App.alert = (opts) => AppDialog.alert(opts);

// Accesos directos convenientes
window.confirmModal = (opts) => AppDialog.confirm(opts);
window.promptModal = (opts, def) => AppDialog.prompt(opts, def);
window.alertModal = (opts) => AppDialog.alert(opts);

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => AppDialog.init());
} else {
  AppDialog.init();
}
