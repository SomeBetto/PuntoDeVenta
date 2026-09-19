/**
 * MÓDULO DE PUNTO DE VENTA (POS) - ESTILO CLOUD POS / HAPPY DAY
 * Cuadrícula de productos con empaque visual, categorías horizontales,
 * carrito lateral visual con partidas detalladas y botón grande verde de cobro.
 */

const PosModule = {
  // Estado de ventas múltiples
  tickets: {
    'A': { items: [], customerId: null, customerName: 'Público General', note: '' }
  },
  activeTab: 'A',
  
  // Catálogo en memoria
  products: [],
  categories: [],
  activeCategory: 'all',
  searchQuery: '',
  isTableView: false,

  // Cobro y granel
  pendingBulkProduct: null,
  selectedPaymentMethod: 'EFECTIVO',
  allCustomers: [],

  get cart() {
    return this.tickets[this.activeTab].items;
  },
  set cart(newItems) {
    this.tickets[this.activeTab].items = newItems;
  },

  async init() {
    this.bindEvents();
    await this.loadCategories();
    await this.loadProducts();
    await this.loadCustomers();
    this.renderCart();
  },

  bindEvents() {
    // Buscador en el ticket de venta
    const searchInput = document.getElementById('pos-search-input');
    if (searchInput) {
      // Filtrado en vivo de la cuadrícula
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.renderProductsGrid();
      });

      // Búsqueda por Enter (escaneo de código de barras directo)
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = searchInput.value.trim();
          if (val) {
            this.handleBarcodeScan(val);
          }
        }
      });
    }

    // Botón de escáner
    const scannerBtn = document.getElementById('btn-pos-scanner');
    if (scannerBtn) {
      scannerBtn.addEventListener('click', () => {
        const val = prompt('Ingrese o escanee el código de barras del producto:');
        if (val) this.handleBarcodeScan(val.trim());
      });
    }

    // Botón para agregar nueva pestaña de venta (Venta B, Venta C...)
    const addTabBtn = document.getElementById('btn-add-ticket-tab');
    if (addTabBtn) {
      addTabBtn.addEventListener('click', () => this.addNewTicketTab());
    }

    // Botón de más opciones del mostrador
    const moreBtn = document.getElementById('btn-catalog-more');
    const moreMenu = document.getElementById('catalog-dropdown-menu');
    if (moreBtn && moreMenu) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moreMenu.classList.toggle('active');
      });
      document.addEventListener('click', () => moreMenu.classList.remove('active'));
    }

    // Modal de Cobro - Métodos de pago
    document.querySelectorAll('.payment-method-card').forEach(card => {
      card.addEventListener('click', () => {
        const method = card.getAttribute('data-method');
        this.setPaymentMethod(method);
      });
    });

    // Modal de Cobro - Monto recibido (input)
    const paidInput = document.getElementById('checkout-paid-input');
    if (paidInput) {
      paidInput.addEventListener('input', () => this.calculateChange());
    }

    // Botones rápidos de billetes ($50, $100, $200, $500, Exacto)
    document.querySelectorAll('.bill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const amount = btn.getAttribute('data-amount');
        if (amount === 'exact') {
          const total = this.getCartTotal();
          paidInput.value = total.toFixed(2);
        } else {
          paidInput.value = parseFloat(amount).toFixed(2);
        }
        this.calculateChange();
      });
    });

    // Confirmar Cobro
    const confirmBtn = document.getElementById('confirm-checkout-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.processCheckout());
    }

    // Modal de Granel (Báscula de peso / dinero)
    const confirmBulkBtn = document.getElementById('confirm-bulk-btn');
    if (confirmBulkBtn) {
      confirmBulkBtn.addEventListener('click', () => this.confirmBulkAddition());
    }

    const bulkWeightInput = document.getElementById('bulk-weight-input');
    const bulkMoneyInput = document.getElementById('bulk-money-input');
    const bulkRoundChk = document.getElementById('bulk-round-up-checkbox');

    if (bulkWeightInput) {
      bulkWeightInput.addEventListener('input', () => this.recalculateBulkPrice('weight'));
      bulkWeightInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.confirmBulkAddition();
        }
      });
    }

    if (bulkMoneyInput) {
      bulkMoneyInput.addEventListener('input', () => this.recalculateBulkPrice('money'));
      bulkMoneyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.confirmBulkAddition();
        }
      });
    }

    if (bulkRoundChk) {
      bulkRoundChk.addEventListener('change', () => this.recalculateBulkPrice('weight'));
    }

    // Atajos de teclado universales para alta velocidad en mostrador
    window.addEventListener('keydown', (e) => {
      // F1: Foco inmediato al buscador de productos
      if (e.key === 'F1') {
        e.preventDefault();
        const searchInput = document.getElementById('pos-search-input');
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }

      // F2: Abrir artículo común rápido
      if (e.key === 'F2') {
        e.preventDefault();
        this.openQuickItemModal();
      }

      // F3: Congelar venta actual / nueva pestaña en espera
      if (e.key === 'F3') {
        e.preventDefault();
        this.holdCurrentTicket();
      }

      // F10: Cobro express con efectivo exacto
      if (e.key === 'F10') {
        e.preventDefault();
        if (this.cart.length > 0) {
          this.quickCheckoutExactCash();
        }
      }

      // F12: Modal de cobro normal
      if (e.key === 'F12') {
        e.preventDefault();
        if (this.cart.length > 0) this.openCheckoutModal();
      }

      // +: Incrementar cantidad del último producto añadido (si no está escribiendo en un input)
      if (e.key === '+' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        if (this.cart.length > 0) {
          this.updateItemQty(this.cart.length - 1, 1);
        }
      }

      // -: Decrementar cantidad del último producto añadido (si no está escribiendo en un input)
      if (e.key === '-' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        if (this.cart.length > 0) {
          this.updateItemQty(this.cart.length - 1, -1);
        }
      }

      // Escape: Cerrar todos los modales abiertos
      if (e.key === 'Escape') {
        App.closeAllModals();
      }
    });
  },

  // =========================================================================
  // CARGA DE DATOS
  // =========================================================================

  async loadCategories() {
    try {
      const res = await fetch('/api/products/categories');
      if (res.ok) {
        this.categories = await res.json();
        this.renderCategoriesBar();
      }
    } catch (e) {
      console.error('Error cargando categorías:', e);
    }
  },

  async loadProducts() {
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        this.products = await res.json();
        this.renderProductsGrid();
      }
    } catch (e) {
      console.error('Error cargando productos:', e);
    }
  },

  async loadCustomers() {
    try {
      const res = await fetch('/api/customers');
      if (res.ok) {
        this.allCustomers = await res.json();
        this.loadCustomerOptions();
      }
    } catch (e) {
      console.error('Error cargando clientes:', e);
    }
  },

  // =========================================================================
  // RENDERIZADO DE CATEGORÍAS Y CUADRÍCULA DE PRODUCTOS
  // =========================================================================

  renderCategoriesBar() {
    const container = document.getElementById('pos-category-pills');
    if (!container) return;

    // Píldora "Todas" siempre de primera
    let html = `<button class="cat-pill ${this.activeCategory === 'all' ? 'active' : ''}" onclick="PosModule.filterCategory('all')">Todas</button>`;

    // Categorías principales de Eleventa
    this.categories.forEach(c => {
      const isAct = (this.activeCategory === String(c.id) || this.activeCategory === c.name);
      html += `<button class="cat-pill ${isAct ? 'active' : ''}" onclick="PosModule.filterCategory('${c.id}')">${c.name}</button>`;
    });

    container.innerHTML = html;
  },

  filterCategory(catId) {
    this.activeCategory = catId;
    this.renderCategoriesBar();
    this.renderProductsGrid();
  },

  getProductVisualHtml(p) {
    if (p.image_url && p.image_url.startsWith('http')) {
      return `<img src="${p.image_url}" class="product-card-img" alt="${p.name}" loading="lazy" onerror="this.onerror=null; this.parentNode.innerHTML='${this.getFallbackSvg(p)}'">`;
    }
    return this.getFallbackSvg(p);
  },

  getFallbackSvg(p) {
    const name = (p.name || '').toLowerCase();
    const cat = (p.category_name || '').toLowerCase();

    // Paleta de colores atractiva según tipo de producto
    let bgGradient = 'linear-gradient(135deg, #f8fafc, #e2e8f0)';
    let badgeText = '📦';
    let brandTag = 'ABARROTES';
    let primaryColor = '#0284c7';

    if (name.includes('crujito') || name.includes('sabrita') || name.includes('tostito') || name.includes('cheeto') || cat.includes('sabrita')) {
      bgGradient = 'linear-gradient(135deg, #fef08a, #fde047)';
      badgeText = '🥔';
      brandTag = 'BOTANAS';
      primaryColor = '#ca8a04';
    } else if (name.includes('chips') || name.includes('barcel')) {
      bgGradient = 'linear-gradient(135deg, #fbcfe8, #f472b6)';
      badgeText = '🌶️';
      brandTag = 'BARCEL';
      primaryColor = '#db2777';
    } else if (name.includes('coca') || name.includes('pepsi') || cat.includes('coca') || cat.includes('pepsi')) {
      bgGradient = 'linear-gradient(135deg, #fecaca, #f87171)';
      badgeText = '🥤';
      brandTag = 'REFRESCO';
      primaryColor = '#dc2626';
    } else if (name.includes('leche') || name.includes('queso') || cat.includes('lacteo')) {
      bgGradient = 'linear-gradient(135deg, #e0f2fe, #bae6fd)';
      badgeText = '🥛';
      brandTag = 'LÁCTEOS';
      primaryColor = '#0284c7';
    } else if (name.includes('aguacate') || name.includes('tomate') || name.includes('limon') || name.includes('papa') || cat.includes('frutas')) {
      bgGradient = 'linear-gradient(135deg, #dcfce7, #86efac)';
      badgeText = '🥑';
      brandTag = 'FRESCOS';
      primaryColor = '#16a34a';
    } else if (name.includes('axion') || name.includes('roma') || name.includes('cloro') || cat.includes('limpieza')) {
      bgGradient = 'linear-gradient(135deg, #ccfbf1, #5eead4)';
      badgeText = '🧼';
      brandTag = 'LIMPIEZA';
      primaryColor = '#0d9488';
    } else if (name.includes('galleta') || name.includes('chocoretas') || name.includes('dulci') || name.includes('panditas') || cat.includes('calorico')) {
      bgGradient = 'linear-gradient(135deg, #fed7aa, #fdba74)';
      badgeText = '🍪';
      brandTag = 'DULCES';
      primaryColor = '#ea580c';
    } else if (name.includes('machaca') || name.includes('salchicha') || name.includes('jamon') || cat.includes('carne')) {
      bgGradient = 'linear-gradient(135deg, #ffe4e6, #fecdd3)';
      badgeText = '🥩';
      brandTag = 'CARNES';
      primaryColor = '#e11d48';
    }

    return `
      <div style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: ${bgGradient}; border-radius: 8px; position: relative; overflow: hidden; box-shadow: inset 0 0 10px rgba(0,0,0,0.03);">
        <span style="position: absolute; top: 4px; left: 6px; font-size: 0.6rem; font-weight: 800; color: ${primaryColor}; letter-spacing: 0.5px;">${brandTag}</span>
        <div style="font-size: 2.8rem; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.12)); margin-top: 6px;">${badgeText}</div>
      </div>
    `;
  },

  renderProductsGrid() {
    const grid = document.getElementById('pos-products-grid');
    if (!grid) return;

    // Filtrar por categoría y búsqueda
    let filtered = this.products;

    if (this.activeCategory !== 'all') {
      filtered = filtered.filter(p => {
        return String(p.category_id) === String(this.activeCategory) || 
               (p.category_name && p.category_name.toLowerCase() === this.activeCategory.toLowerCase());
      });
    }

    if (this.searchQuery) {
      filtered = filtered.filter(p => {
        const name = (p.name || '').toLowerCase();
        const code = (p.barcode || '').toLowerCase();
        return name.includes(this.searchQuery) || code.includes(this.searchQuery);
      });
    }

    // Si no hay productos
    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: #64748b;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔍</div>
          <strong style="font-size: 1.1rem; color: #1e293b;">No se encontraron productos</strong>
          <p style="font-size: 0.85rem; margin-top: 0.25rem;">Intente buscar con otro nombre o seleccione otra categoría</p>
        </div>
      `;
      return;
    }

    // Renderizar tarjetas limpias con imagen, título y precio
    // Mostramos hasta 120 productos a la vez para máxima velocidad
    const displayItems = filtered.slice(0, 120);

    grid.innerHTML = displayItems.map(p => {
      const visualHtml = this.getProductVisualHtml(p);
      const isWeight = (p.unit === 'kg' || p.allow_fractions === 1);
      const unitLabel = isWeight ? '/ kg' : '';

      return `
        <div class="pos-product-card" onclick="PosModule.onProductCardClick(${p.id})">
          <div class="product-card-img-wrap">
            ${visualHtml}
          </div>
          <div class="product-card-title" title="${p.name}">
            ${p.name}
          </div>
          <div class="product-card-footer">
            <div class="product-card-price">
              $${p.sale_price.toFixed(2)} <span style="font-size: 0.72rem; color: #64748b; font-weight: normal;">${unitLabel}</span>
            </div>
            <div class="product-card-chevron" title="Agregar a la venta">
              ${isWeight ? '⚖️' : '⌄'}
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  onProductCardClick(productId) {
    const prod = this.products.find(p => p.id === productId);
    if (!prod) return;

    if (prod.unit === 'kg' || prod.allow_fractions) {
      this.openBulkModal(prod);
    } else {
      this.addToCart(prod, 1);
    }
    const searchInput = document.getElementById('pos-search-input');
    if (searchInput) {
      searchInput.value = '';
      setTimeout(() => searchInput.focus(), 50);
    }
  },

  // =========================================================================
  // GESTIÓN DEL CARRITO / TICKET DE VENTA
  // =========================================================================

  handleBarcodeScan(code) {
    if (!code) return;
    const cleanCode = window.BarcodeUtils ? BarcodeUtils.clean(code) : code.replace(/^[EBD]/, '');
    const lower = cleanCode.toLowerCase();

    // Búsqueda inteligente con BarcodeUtils (elimina prefijos AIM, letras iniciales, etc.)
    let match = window.BarcodeUtils ? BarcodeUtils.findMatch(this.products, code) : null;
    if (!match && cleanCode) {
      match = window.BarcodeUtils ? BarcodeUtils.findMatch(this.products, cleanCode) : null;
    }

    if (!match) {
      match = this.products.find(p => p.name && p.name.toLowerCase().includes(lower));
    }

    const searchInput = document.getElementById('pos-search-input');

    if (match) {
      if (match.unit === 'kg' || match.allow_fractions) {
        this.openBulkModal(match);
      } else {
        this.addToCart(match, 1);
      }
      if (searchInput) {
        searchInput.value = '';
        setTimeout(() => searchInput.focus(), 50);
      }
      this.searchQuery = '';
      this.renderProductsGrid();
    } else {
      App.showToast(`Producto "${cleanCode || code}" no encontrado en el catálogo`, 'error');
      if (searchInput) {
        searchInput.value = '';
        setTimeout(() => searchInput.focus(), 50);
      }
    }
  },

  isBulkRoundUpActive() {
    const chk = document.getElementById('bulk-round-up-checkbox');
    if (chk) return chk.checked;
    return (window.SettingsModule?.settings?.bulk_round_up !== '0');
  },

  setBulkWeight(val) {
    const inp = document.getElementById('bulk-weight-input');
    if (inp) {
      inp.value = parseFloat(val).toFixed(3);
      this.recalculateBulkPrice('weight');
    }
  },

  setBulkMoney(val) {
    const inp = document.getElementById('bulk-money-input');
    if (inp) {
      inp.value = parseFloat(val).toFixed(2);
      this.recalculateBulkPrice('money');
    }
  },

  recalculateBulkPrice(source = 'weight') {
    if (!this.pendingBulkProduct) return;
    const weightInput = document.getElementById('bulk-weight-input');
    const moneyInput = document.getElementById('bulk-money-input');
    const exactSpan = document.getElementById('bulk-exact-money');
    const roundedSpan = document.getElementById('bulk-rounded-money');
    const badge = document.getElementById('bulk-rounding-badge');
    const isRoundUp = this.isBulkRoundUpActive();

    if (badge) {
      badge.innerText = isRoundUp ? 'REDONDEO ACTIVO' : 'EXACTO';
      badge.style.background = isRoundUp ? '#dcfce7' : '#f1f5f9';
      badge.style.color = isRoundUp ? '#15803d' : '#64748b';
    }

    const price = this.pendingBulkProduct.sale_price || 0;

    if (source === 'weight') {
      const weight = parseFloat(weightInput?.value) || 0;
      const exact = weight * price;
      const rounded = Math.ceil(exact);
      const finalVal = isRoundUp ? rounded : exact;

      if (moneyInput) {
        moneyInput.value = (finalVal > 0) ? finalVal.toFixed(2) : '';
      }
      if (exactSpan) exactSpan.innerText = `$${exact.toFixed(2)}`;
      if (roundedSpan) roundedSpan.innerText = `$${rounded.toFixed(2)}`;
    } else {
      const money = parseFloat(moneyInput?.value) || 0;
      const weight = price > 0 ? (money / price) : 0;
      if (weightInput) {
        weightInput.value = (weight > 0) ? weight.toFixed(3) : '';
      }
      const exact = weight * price;
      if (exactSpan) exactSpan.innerText = `$${exact.toFixed(2)}`;
      if (roundedSpan) roundedSpan.innerText = `$${Math.ceil(exact).toFixed(2)}`;
    }
  },

  openBulkModal(prod) {
    this.pendingBulkProduct = prod;
    document.getElementById('bulk-product-title').innerText = prod.name;
    document.getElementById('bulk-price-ref').innerText = `$${prod.sale_price.toFixed(2)} / ${prod.unit}`;
    
    const weightInput = document.getElementById('bulk-weight-input');
    const roundChk = document.getElementById('bulk-round-up-checkbox');
    if (roundChk) {
      roundChk.checked = (window.SettingsModule?.settings?.bulk_round_up !== '0');
    }
    
    if (weightInput) weightInput.value = '1.000';
    this.recalculateBulkPrice('weight');

    document.getElementById('bulk-modal').classList.add('active');
    setTimeout(() => { weightInput?.focus(); weightInput?.select(); }, 150);
  },

  confirmBulkAddition() {
    if (!this.pendingBulkProduct) return;
    const weightInput = document.getElementById('bulk-weight-input');
    const moneyInput = document.getElementById('bulk-money-input');
    const weight = parseFloat(weightInput?.value);
    
    if (!weight || weight <= 0) {
      App.showToast('Ingrese un peso o cantidad válida', 'error');
      return;
    }

    const isRoundUp = this.isBulkRoundUpActive();
    const exact = parseFloat((weight * this.pendingBulkProduct.sale_price).toFixed(2));
    let enteredMoney = parseFloat(moneyInput?.value);

    let finalSubtotal;
    if (enteredMoney && !isNaN(enteredMoney) && enteredMoney > 0) {
      finalSubtotal = enteredMoney;
    } else if (isRoundUp) {
      finalSubtotal = Math.ceil(exact);
    } else {
      finalSubtotal = exact;
    }

    this.addToCart(this.pendingBulkProduct, weight, 0, finalSubtotal, isRoundUp);
    App.closeModal('bulk-modal');
    this.pendingBulkProduct = null;
  },

  addToCart(product, quantity = 1, discountPct = 0, customSubtotal = null, isRounded = false) {
    const isBulk = (product.unit === 'kg' || product.allow_fractions === 1);
    const effPrice = product.sale_price * (1 - discountPct / 100);

    let subtotal;
    if (customSubtotal !== null && !isNaN(customSubtotal) && customSubtotal > 0) {
      subtotal = parseFloat(customSubtotal.toFixed(2));
    } else if (isBulk && this.isBulkRoundUpActive()) {
      subtotal = Math.ceil(parseFloat((quantity * effPrice).toFixed(2)));
    } else {
      subtotal = parseFloat((quantity * effPrice).toFixed(2));
    }

    const existingIndex = this.cart.findIndex(item => item.product_id === product.id);

    if (existingIndex > -1) {
      const newQty = parseFloat((this.cart[existingIndex].quantity + quantity).toFixed(3));
      this.cart[existingIndex].quantity = newQty;
      const baseSub = newQty * effPrice;
      if (isBulk && this.isBulkRoundUpActive()) {
        this.cart[existingIndex].subtotal = Math.ceil(baseSub);
      } else {
        this.cart[existingIndex].subtotal = parseFloat(baseSub.toFixed(2));
      }
      this.cart[existingIndex].is_rounded = isBulk && this.isBulkRoundUpActive();
    } else {
      this.cart.push({
        product_id: product.id,
        product_name: product.name,
        barcode: product.barcode || '123',
        image_url: product.image_url || null,
        icon: product.category_icon || '📦',
        quantity: parseFloat(quantity.toFixed(3)),
        unit: product.unit || 'pz',
        unit_price: product.sale_price,
        cost_price: product.cost_price || 0,
        discount_pct: discountPct,
        subtotal: subtotal,
        is_rounded: isRounded || (isBulk && subtotal > (quantity * effPrice))
      });
    }

    this.renderCart();
    App.showToast(`+ ${product.name} agregado`, 'info');
  },

  updateItemQty(index, delta) {
    const item = this.cart[index];
    if (!item) return;

    const isBulk = (item.unit === 'kg' || item.unit === 'granel');
    const newQty = parseFloat((item.quantity + delta).toFixed(3));
    if (newQty <= 0) {
      this.removeItem(index);
    } else {
      item.quantity = newQty;
      const effPrice = item.unit_price * (1 - (item.discount_pct || 0) / 100);
      const baseSub = newQty * effPrice;
      if (isBulk && this.isBulkRoundUpActive()) {
        item.subtotal = Math.ceil(baseSub);
        item.is_rounded = true;
      } else {
        item.subtotal = parseFloat(baseSub.toFixed(2));
        item.is_rounded = false;
      }
      this.renderCart();
    }
  },

  removeItem(index) {
    this.cart.splice(index, 1);
    this.renderCart();
  },

  clearCurrentSale() {
    if (this.cart.length === 0) return;
    if (confirm('¿Desea vaciar todos los artículos de la venta actual?')) {
      this.cart = [];
      this.renderCart();
      App.showToast('Carrito vaciado', 'info');
    }
  },

  getCartTotal() {
    return this.cart.reduce((sum, item) => sum + item.subtotal, 0);
  },

  getCartDiscountTotal() {
    return this.cart.reduce((sum, item) => {
      if (!item.discount_pct || item.discount_pct <= 0) return sum;
      const original = item.unit_price * item.quantity;
      return sum + (original - item.subtotal);
    }, 0);
  },

  renderCart() {
    const container = document.getElementById('pos-cart-items-container');
    const tbody = document.getElementById('pos-cart-table-body');
    const subtotalText = document.getElementById('pos-subtotal-text');
    const checkoutLabel = document.getElementById('btn-checkout-label');
    const checkoutBtn = document.getElementById('btn-pos-checkout');
    const clientDisplay = document.getElementById('pos-client-display');
    const discountWrapper = document.getElementById('pos-discount-wrapper');
    const discountText = document.getElementById('pos-discount-text');

    const total = this.getCartTotal();
    const discount = this.getCartDiscountTotal();
    const count = this.cart.reduce((sum, i) => sum + i.quantity, 0);

    // Actualizar datos del cliente activo
    if (clientDisplay) {
      clientDisplay.innerText = this.tickets[this.activeTab].customerName || 'Cliente';
    }

    // Actualizar subtotal y etiqueta del botón verde
    if (subtotalText) subtotalText.innerText = `$${(total + discount).toFixed(2)}`;
    if (checkoutLabel) checkoutLabel.innerText = `$${total.toFixed(2)} MXN`;
    if (checkoutBtn) checkoutBtn.disabled = this.cart.length === 0;

    // Mostrar descuento si aplica
    if (discountWrapper && discountText) {
      if (discount > 0) {
        discountWrapper.style.display = 'block';
        discountText.innerText = `-$${discount.toFixed(2)}`;
      } else {
        discountWrapper.style.display = 'none';
      }
    }

    // 1. RENDERIZADO VISUAL DEL TICKET (COLUMNA DERECHA)
    if (container) {
      if (this.cart.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 4rem 1rem; color: #94a3b8;">
            <div style="font-size: 2.8rem; margin-bottom: 0.75rem;">🛒</div>
            <strong style="color: #475569; font-size: 0.95rem;">Venta vacía</strong>
            <p style="font-size: 0.8rem; margin-top: 0.25rem;">Haga clic en un producto o escanee un código de barras para comenzar.</p>
          </div>
        `;
      } else {
        container.innerHTML = this.cart.map((item, idx) => {
          const qtyBadge = `${item.quantity} ${item.unit.toUpperCase()}`;
          const isDiscounted = item.discount_pct && item.discount_pct > 0;
          const origUnitVal = item.unit_price.toFixed(2);
          const totalItemVal = item.subtotal.toFixed(2);

          // Miniatura
          let thumbImg = item.image_url 
            ? `<img src="${item.image_url}" alt="${item.product_name}">` 
            : `<div style="font-size: 1.5rem;">${item.icon || '📦'}</div>`;

          return `
            <div class="ticket-item-row">
              <div class="ticket-item-thumb">
                ${thumbImg}
              </div>
              <div class="ticket-item-details">
                <div class="ticket-item-top">
                  <span class="item-qty-tag">${qtyBadge}</span>
                  <span class="item-barcode-tag">${item.barcode}</span>
                </div>
                <span class="item-name-tag" title="${item.product_name}">
                  ${item.product_name}
                </span>
                <div class="item-controls-overlay">
                  <button class="item-ctrl-btn" onclick="PosModule.updateItemQty(${idx}, -1)" title="Restar 1">−</button>
                  <button class="item-ctrl-btn" onclick="PosModule.updateItemQty(${idx}, 1)" title="Sumar 1">+</button>
                  <button class="item-ctrl-btn btn-del" onclick="PosModule.removeItem(${idx})" title="Eliminar artículo">✕</button>
                </div>
              </div>
              <div class="ticket-item-price-box">
                ${isDiscounted ? `
                  <div class="item-unit-price-sub" style="text-decoration: line-through;">$${(item.unit_price * item.quantity).toFixed(2)}</div>
                  <span class="item-discount-tag">-${item.discount_pct}%</span>
                ` : (item.quantity > 1 ? `<div class="item-unit-price-sub">$${origUnitVal} c/u</div>` : '')}
                <div class="item-final-price">${item.is_rounded ? '<span title="Importe redondeado al entero superior" style="font-size:0.65rem; color:#16a34a; background:#dcfce7; padding:0.1rem 0.3rem; border-radius:4px; font-weight:800; vertical-align:middle; margin-right:4px;">🔺</span>' : ''}$${totalItemVal}</div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // 2. RENDERIZADO EN TABLA (MODO TABLA SECUNDARIO)
    if (tbody) {
      if (this.cart.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 2.5rem; color: #94a3b8;">
              <div>No hay artículos en la venta</div>
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = this.cart.map((item, idx) => `
          <tr>
            <td style="text-align: center; color: #0284c7;">●</td>
            <td>
              <div class="stepper-control">
                <button class="stepper-btn" onclick="PosModule.updateItemQty(${idx}, -1)">−</button>
                <span class="stepper-value">${item.quantity}</span>
                <button class="stepper-btn" onclick="PosModule.updateItemQty(${idx}, 1)">+</button>
              </div>
            </td>
            <td><span class="unit-chip">${item.unit.toUpperCase()}</span></td>
            <td><strong>${item.product_name}</strong> <span style="font-size:0.75rem; color:#94a3b8;">(${item.barcode})</span></td>
            <td style="text-align: right; font-family: var(--font-mono);">$${item.unit_price.toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono); font-weight: 800;">${item.is_rounded ? '<span title="Importe redondeado al entero superior" style="font-size:0.68rem; color:#16a34a; background:#dcfce7; padding:0.1rem 0.35rem; border-radius:4px; margin-right:4px;">🔺</span>' : ''}$${item.subtotal.toFixed(2)}</td>
            <td style="text-align: center;">
              <button class="bar-action-icon" style="color: #ef4444;" onclick="PosModule.removeItem(${idx})">✕</button>
            </td>
          </tr>
        `).join('');
      }
    }
  },

  // =========================================================================
  // MÚLTIPLES VENTAS EN ESPERA (CONGELAR VENTA, VENTA A, B, C...)
  // =========================================================================

  addNewTicketTab() {
    const existing = Object.keys(this.tickets);
    // Encontrar la primera letra libre A, B, C, D, E, F
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const nextChar = letters.find(l => !existing.includes(l));
    if (!nextChar) {
      App.showToast('Límite de 6 ventas simultáneas alcanzado', 'warning');
      return;
    }

    this.tickets[nextChar] = {
      items: [],
      customerId: null,
      customerName: 'Público General',
      note: ''
    };

    this.switchTicketTab(nextChar);
  },

  holdCurrentTicket() {
    if (this.cart.length === 0) {
      App.showToast('El ticket actual no tiene artículos para poner en espera', 'info');
      return;
    }

    const currentTab = this.activeTab;
    App.showToast(`❄️ Venta ${currentTab} puesta en espera con ${this.cart.length} artículos`, 'success');

    // Buscar si hay otra pestaña vacía para cambiar a ella
    const emptyTab = Object.keys(this.tickets).find(k => k !== currentTab && this.tickets[k].items.length === 0);
    if (emptyTab) {
      this.switchTicketTab(emptyTab);
    } else {
      this.addNewTicketTab();
    }
  },

  closeTicketTab(tabChar) {
    const keys = Object.keys(this.tickets);
    if (keys.length <= 1) {
      this.clearCart();
      return;
    }

    delete this.tickets[tabChar];
    const remaining = Object.keys(this.tickets);
    this.switchTicketTab(remaining[0]);
  },

  switchTicketTab(tabChar) {
    if (!this.tickets[tabChar]) return;
    this.activeTab = tabChar;

    // Actualizar botones de pestaña con indicador de cantidad y botón de cierre si hay múltiples
    const container = document.getElementById('pos-multi-ticket-tabs');
    if (container) {
      const keys = Object.keys(this.tickets);
      container.innerHTML = keys.map(tab => {
        const isAct = tab === this.activeTab;
        const count = this.tickets[tab].items.length;
        const countBadge = count > 0 ? ` <span style="font-weight:800; background:rgba(255,255,255,0.25); padding:0.1rem 0.35rem; border-radius:10px;">${count}</span>` : '';
        const closeBtn = keys.length > 1 ? `<span onclick="event.stopPropagation(); PosModule.closeTicketTab('${tab}')" style="margin-left:6px; opacity:0.7; font-size:0.75rem;" title="Cerrar ticket">✕</span>` : '';
        return `<button class="ticket-tab ${isAct ? 'active' : ''}" onclick="PosModule.switchTicketTab('${tab}')">Venta ${tab}${countBadge}${closeBtn}</button>`;
      }).join('') + `
        <button class="btn-add-ticket-tab" id="btn-add-ticket-tab" onclick="PosModule.addNewTicketTab()" title="Abrir otra venta">+</button>
        <button class="btn-secondary" onclick="PosModule.holdCurrentTicket()" title="Poner venta actual en espera (F3)" style="padding:0.35rem 0.65rem; font-size:0.78rem; background:#f0fdf4; color:#15803d; border-color:#86efac; border-radius:var(--radius-sm); font-weight:700;">
          ❄️ En Espera (F3)
        </button>
      `;
    }

    this.renderCart();
  },

  async quickCheckoutExactCash() {
    if (this.cart.length === 0) return;
    const total = this.getCartTotal();
    const cust = this.tickets[this.activeTab].customerName;

    if (!confirm(`⚡ ¿Cobro Express por $${total.toFixed(2)} en EFECTIVO EXACTO?`)) {
      return;
    }

    try {
      const response = await fetch('/api/pos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: this.cart,
          payment_method: 'EFECTIVO',
          amount_paid: total,
          customer_id: this.tickets[this.activeTab].customerId
        })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.detail || 'Error procesando cobro express');

      App.showToast(`⚡ Venta #${resData.sale_id} cobrada en efectivo exacto ($${total.toFixed(2)})`, 'success');
      this.showTicketModal(resData.sale_id);

      // Limpiar ticket actual
      this.cart = [];
      this.tickets[this.activeTab].customerId = null;
      this.tickets[this.activeTab].customerName = 'Público General';
      this.tickets[this.activeTab].note = '';
      this.renderCart();
      this.loadProducts();

      if (window.InventoryModule) InventoryModule.loadProducts();
      if (window.CashModule) CashModule.loadCurrentShift();
      if (window.ReportsModule) ReportsModule.loadDashboard();
      if (window.CustomersModule) CustomersModule.loadCustomers();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  toggleTableView() {
    this.isTableView = !this.isTableView;
    const gridWrap = document.getElementById('pos-catalog-grid-wrapper');
    const tableWrap = document.getElementById('pos-table-view-container');
    const label = document.getElementById('pos-view-mode-label');

    if (this.isTableView) {
      if (gridWrap) gridWrap.style.display = 'none';
      if (tableWrap) tableWrap.style.display = 'block';
      if (label) label.innerText = '🖼️ Ver en Modo Cuadrícula';
    } else {
      if (gridWrap) gridWrap.style.display = 'block';
      if (tableWrap) tableWrap.style.display = 'none';
      if (label) label.innerText = '📋 Ver en Modo Tabla';
    }
  },

  // =========================================================================
  // MODALES RÁPIDOS: NOTAS, ARTÍCULO COMÚN Y SELECTOR DE CLIENTE
  // =========================================================================

  openTicketNotesModal() {
    const textarea = document.getElementById('ticket-note-textarea');
    if (textarea) {
      textarea.value = this.tickets[this.activeTab].note || '';
    }
    document.getElementById('modal-ticket-notes').classList.add('active');
    setTimeout(() => textarea && textarea.focus(), 150);
  },

  saveTicketNote() {
    const textarea = document.getElementById('ticket-note-textarea');
    if (textarea) {
      this.tickets[this.activeTab].note = textarea.value.trim();
      App.closeModal('modal-ticket-notes');
      App.showToast(this.tickets[this.activeTab].note ? 'Nota guardada en el ticket' : 'Nota eliminada', 'info');
    }
  },

  openQuickItemModal() {
    document.getElementById('quick-item-name').value = 'Artículo Común';
    document.getElementById('quick-item-price').value = '';
    document.getElementById('quick-item-qty').value = '1';
    document.getElementById('modal-quick-item').classList.add('active');
    setTimeout(() => document.getElementById('quick-item-price').focus(), 150);
  },

  addQuickItem() {
    const name = document.getElementById('quick-item-name').value.trim() || 'Artículo Común';
    const price = parseFloat(document.getElementById('quick-item-price').value);
    const qty = parseFloat(document.getElementById('quick-item-qty').value) || 1;

    if (!price || price <= 0) {
      App.showToast('Ingrese un precio válido para el artículo', 'error');
      return;
    }

    const fakeProduct = {
      id: -Math.floor(Math.random() * 100000), // ID temporal negativo
      name: name,
      barcode: 'RAPIDO',
      sale_price: price,
      cost_price: price * 0.7,
      unit: 'pz',
      category_icon: '⚡'
    };

    this.addToCart(fakeProduct, qty);
    App.closeModal('modal-quick-item');
  },

  openCustomerSelectModal() {
    const list = document.getElementById('quick-customers-list');
    const search = document.getElementById('quick-customer-search-input');
    if (search) search.value = '';

    if (list) {
      this.filterQuickCustomers('');
    }
    document.getElementById('modal-customer-selector').classList.add('active');
  },

  filterQuickCustomers(query = '') {
    const list = document.getElementById('quick-customers-list');
    if (!list) return;

    const q = query.toLowerCase();
    const filtered = this.allCustomers.filter(c => {
      return (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q);
    });

    if (filtered.length === 0) {
      list.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 1.5rem;">No se encontraron clientes</div>`;
      return;
    }

    list.innerHTML = filtered.slice(0, 30).map(c => {
      const hasDebt = c.current_balance > 0;
      const limit = Number(c.credit_limit) || 0;
      const balance = Number(c.current_balance) || 0;
      const pct = limit > 0 ? (balance / limit) : 0;

      let badgeHtml = '';
      if (!hasDebt) {
        badgeHtml = '<span style="color:#16a34a; background:#dcfce7; font-size:0.75rem; font-weight:700; padding:0.25rem 0.55rem; border-radius:999px;">🟢 Al corriente</span>';
      } else if (limit > 0 && balance >= limit) {
        badgeHtml = '<span style="color:#dc2626; background:#fee2e2; font-size:0.75rem; font-weight:800; padding:0.25rem 0.55rem; border-radius:999px;">🔴 Límite Superado</span>';
      } else if (pct >= 0.7) {
        badgeHtml = `<span style="color:#d97706; background:#fef3c7; font-size:0.75rem; font-weight:700; padding:0.25rem 0.55rem; border-radius:999px;">🟡 Alto (${Math.round(pct*100)}%)</span>`;
      } else {
        badgeHtml = '<span style="color:#0284c7; background:#e0f2fe; font-size:0.75rem; font-weight:700; padding:0.25rem 0.55rem; border-radius:999px;">🟢 Crédito Óptimo</span>';
      }

      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0.85rem; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; transition: background 0.15s; background: #fff;" onclick="PosModule.selectCustomer(${c.id})" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">
          <div>
            <strong style="font-size: 0.9rem; color: #1e293b; display: block;">${c.name}</strong>
            <span style="font-size: 0.75rem; color: #64748b;">${c.phone ? '📞 ' + c.phone : 'Sin teléfono'} • Límite: $${limit.toFixed(2)}</span>
          </div>
          <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;">
            <div style="display: flex; align-items: center; gap: 0.35rem;">
              ${badgeHtml}
              <button type="button" class="btn-secondary" style="padding: 0.15rem 0.4rem; font-size: 0.75rem;" onclick="event.stopPropagation(); App.closeModal('modal-customer-selector'); if(window.CustomersModule) CustomersModule.openEditCustomerModal(${c.id});" title="Editar cliente">✏️</button>
            </div>
            ${hasDebt ? `<span style="color: #dc2626; font-size: 0.82rem; font-weight: 800;">Deuda: $${balance.toFixed(2)}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  selectCustomer(id, name) {
    if (!name && id) {
      const found = this.allCustomers.find(c => c.id === id);
      if (found) name = found.name;
    }
    this.tickets[this.activeTab].customerId = id;
    this.tickets[this.activeTab].customerName = name || 'Público General';
    this.renderCart();
    App.closeModal('modal-customer-selector');
    App.showToast(`Cliente asignado: ${name || 'Público General'}`, 'info');
  },

  // =========================================================================
  // COBRO Y PROCESAMIENTO
  // =========================================================================

  openCheckoutModal() {
    if (this.cart.length === 0) return;
    const total = this.getCartTotal();

    document.getElementById('checkout-total-val').innerText = `$${total.toFixed(2)}`;
    const paidInput = document.getElementById('checkout-paid-input');
    paidInput.value = total.toFixed(2);

    // Preseleccionar cliente si ya fue asignado en el ticket
    const custSelect = document.getElementById('checkout-customer-select');
    if (custSelect && this.tickets[this.activeTab].customerId) {
      custSelect.value = this.tickets[this.activeTab].customerId;
    }
    
    this.setPaymentMethod('EFECTIVO');
    this.calculateChange();

    document.getElementById('checkout-modal').classList.add('active');
    setTimeout(() => { paidInput.focus(); paidInput.select(); }, 150);
  },

  loadCustomerOptions() {
    const select = document.getElementById('checkout-customer-select');
    if (!select) return;
    select.innerHTML = '<option value="">-- Seleccionar Cliente para Fiado --</option>' + 
      this.allCustomers.map(c => {
        const limitTxt = (c.credit_limit <= 0) ? 'Sin límite' : `Límite: $${c.credit_limit.toFixed(2)}`;
        let semaforo = '🟢';
        if (c.credit_limit > 0 && c.current_balance >= c.credit_limit) {
          semaforo = '🔴 [LÍMITE SUPERADO]';
        } else if (c.credit_limit > 0 && (c.current_balance / c.credit_limit) >= 0.7) {
          semaforo = '🟡 [CRÉDITO ALTO]';
        }
        return `<option value="${c.id}">${semaforo} ${c.name} (Deuda: $${c.current_balance.toFixed(2)} • ${limitTxt})</option>`;
      }).join('');
  },

  setPaymentMethod(method) {
    this.selectedPaymentMethod = method;
    document.querySelectorAll('.payment-method-card').forEach(c => {
      const isActive = c.getAttribute('data-method') === method;
      c.classList.toggle('active', isActive);
      c.style.borderColor = isActive ? 'var(--primary-blue)' : 'var(--border-color)';
      c.style.background = isActive ? 'var(--primary-blue-light)' : '#ffffff';
    });

    const cashBox = document.getElementById('cash-payment-fields');
    const fiadoBox = document.getElementById('fiado-payment-fields');

    if (method === 'EFECTIVO') {
      cashBox.style.display = 'block';
      fiadoBox.style.display = 'none';
      this.calculateChange();
    } else if (method === 'FIADO') {
      cashBox.style.display = 'none';
      fiadoBox.style.display = 'block';
      document.getElementById('checkout-change-val').innerText = '$0.00';
    } else {
      cashBox.style.display = 'none';
      fiadoBox.style.display = 'none';
      document.getElementById('checkout-change-val').innerText = '$0.00';
    }
  },

  calculateChange() {
    const total = this.getCartTotal();
    const paidInput = document.getElementById('checkout-paid-input');
    const changeDisplay = document.getElementById('checkout-change-val');
    const paidAmount = parseFloat(paidInput.value) || 0;

    if (this.selectedPaymentMethod === 'EFECTIVO') {
      const change = paidAmount - total;
      if (change >= 0) {
        changeDisplay.innerText = `$${change.toFixed(2)}`;
        changeDisplay.style.color = '#16a34a';
      } else {
        changeDisplay.innerText = `Faltan $${Math.abs(change).toFixed(2)}`;
        changeDisplay.style.color = '#dc2626';
      }
    }
  },

  async processCheckout() {
    const total = this.getCartTotal();
    let amountPaid = total;
    let customerId = this.tickets[this.activeTab].customerId || null;

    if (this.selectedPaymentMethod === 'EFECTIVO') {
      const paidInput = document.getElementById('checkout-paid-input');
      amountPaid = parseFloat(paidInput.value) || 0;
      if (amountPaid < total) {
        App.showToast('El monto pagado no cubre el total de la venta', 'error');
        return;
      }
    } else if (this.selectedPaymentMethod === 'FIADO') {
      const custSelect = document.getElementById('checkout-customer-select');
      customerId = parseInt(custSelect.value) || customerId;
      if (!customerId) {
        App.showToast('Seleccione un cliente para anotar el fiado', 'error');
        return;
      }
      amountPaid = 0;
    }

    try {
      const response = await fetch('/api/pos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: this.cart,
          payment_method: this.selectedPaymentMethod,
          amount_paid: amountPaid,
          customer_id: customerId
        })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.detail || 'Error procesando cobro');

      App.showToast(`✅ Venta #${resData.sale_id} completada exitosamente`, 'success');
      App.closeModal('checkout-modal');

      // Mostrar ticket de venta
      this.showTicketModal(resData.sale_id);

      // Limpiar venta actual
      this.cart = [];
      this.tickets[this.activeTab].customerId = null;
      this.tickets[this.activeTab].customerName = 'Público General';
      this.tickets[this.activeTab].note = '';
      this.renderCart();
      this.loadProducts();

      if (window.InventoryModule) InventoryModule.loadProducts();
      if (window.CashModule) CashModule.loadCurrentShift();
      if (window.ReportsModule) ReportsModule.loadDashboard();
      if (window.CustomersModule) CustomersModule.loadCustomers();

    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async showTicketModal(saleId) {
    try {
      const res = await fetch(`/api/pos/sales/${saleId}/ticket`);
      const data = await res.json();
      const { sale, items, settings } = data;

      const receipt = document.getElementById('receipt-content');
      receipt.innerHTML = `
        <div style="text-align: center; margin-bottom: 0.5rem;">
          <div style="font-size: 1.1rem; font-weight: 800;">${settings.store_name || 'ABARROTES & MINI SÚPER'}</div>
          <div>${settings.store_address || ''}</div>
          <div>Tel: ${settings.store_phone || ''}</div>
          <div style="border-top: 1px dashed #64748b; margin: 0.5rem 0;"></div>
          <div><strong>TICKET DE VENTA #${sale.id}</strong></div>
          <div>${new Date(sale.created_at).toLocaleString()}</div>
          <div>Cajero: ${sale.cashier_name || 'Admin'}</div>
          <div>Método: ${sale.payment_method}</div>
          ${sale.customer_name ? `<div>Cliente: ${sale.customer_name}</div>` : ''}
          <div style="border-top: 1px dashed #64748b; margin: 0.5rem 0;"></div>
        </div>

        <div>
          ${items.map(i => `
            <div style="display: flex; justify-content: space-between; margin: 0.2rem 0; font-size: 0.85rem;">
              <span>${i.quantity} ${i.unit} x ${i.product_name}</span>
              <span style="font-family: monospace; font-weight: 700;">$${i.subtotal.toFixed(2)}</span>
            </div>
          `).join('')}
        </div>

        <div style="border-top: 1px dashed #64748b; margin: 0.5rem 0;"></div>
        <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 1.1rem;">
          <span>TOTAL:</span>
          <span style="font-family: monospace;">$${sale.total.toFixed(2)}</span>
        </div>
        ${sale.payment_method === 'EFECTIVO' ? `
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-top: 0.2rem;">
            <span>Paga con:</span>
            <span>$${sale.amount_paid.toFixed(2)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
            <span>Cambio:</span>
            <span>$${sale.change_given.toFixed(2)}</span>
          </div>
        ` : ''}

        <div style="border-top: 1px dashed #64748b; margin: 0.5rem 0;"></div>
        <div style="text-align: center; font-size: 0.75rem; color: #64748b;">
          ${settings.ticket_footer || '¡Gracias por su preferencia! Vuelva pronto.'}
        </div>
      `;

      document.getElementById('ticket-modal').classList.add('active');
    } catch (e) {
      console.error(e);
    }
  },

  openQuickCatalogModal() {
    App.switchView('products');
  }
};

window.PosModule = PosModule;
