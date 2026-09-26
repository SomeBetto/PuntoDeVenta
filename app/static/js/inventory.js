/**
 * MÓDULO DE PRODUCTOS Y AJUSTES DE INVENTARIO (ESTILO SICAR)
 * Soporta vista Maestro-Detalle, captura de foto en vivo con cámara,
 * carga desde galería y ajustes de inventario con modal de cantidad.
 */

const InventoryModule = {
  products: [],
  categories: [],
  selectedProduct: null,
  editingProductId: null,
  adjustmentsMap: {}, // productId -> { counted, difference }
  modalAdjustProductId: null,
  targetPhotoProductId: null,
  currentCameraFacing: 'environment', // Cámara trasera por defecto
  activeMediaStream: null,

  init() {
    this.bindEvents();
    this.loadCategories();
    this.loadProducts();
  },

  bindEvents() {
    const searchInput = document.getElementById('products-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.filterMasterProducts(e.target.value));
    }

    const adjustSearch = document.getElementById('adjust-search-input');
    if (adjustSearch) {
      adjustSearch.addEventListener('input', (e) => this.renderAdjustmentTable(e.target.value));
      adjustSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleBarcodeScanInAdjustment(adjustSearch.value.trim());
        }
      });
    }

    // Input oculto para tomar fotos desde celular o tablet en Realizar Inventario
    const mobilePhotoInput = document.getElementById('mobile-inventory-photo-input');
    if (mobilePhotoInput) {
      mobilePhotoInput.addEventListener('change', (e) => this.handleMobilePhotoSelected(e));
    }

    const saveProdBtn = document.getElementById('btn-save-product');
    if (saveProdBtn) {
      saveProdBtn.addEventListener('click', () => this.saveProduct());
    }

    // Pestañas del detalle de producto
    const tabHistory = document.getElementById('tab-btn-history');
    const tabData = document.getElementById('tab-btn-data');
    if (tabHistory && tabData) {
      tabHistory.addEventListener('click', () => {
        tabHistory.classList.add('active');
        tabData.classList.remove('active');
      });
      tabData.addEventListener('click', () => {
        tabData.classList.add('active');
        tabHistory.classList.remove('active');
        App.showToast(`Costo de compra: $${this.selectedProduct ? this.selectedProduct.cost_price.toFixed(2) : 0}`, 'info');
      });
    }
  },

  async loadCategories() {
    try {
      const res = await fetch('/api/products/categories');
      this.categories = await res.json();
      const select = document.getElementById('prod-form-category');
      if (select) {
        select.innerHTML = '<option value="">-- Seleccionar Categoría --</option>' +
          this.categories.map(c => `<option value="${c.id}">${c.icon || '📦'} ${c.name}</option>`).join('');
      }
    } catch (e) {
      console.error(e);
    }
  },

  async loadProducts() {
    try {
      const res = await fetch('/api/products');
      this.products = await res.json();

      // Inicializar mapa de ajustes
      this.products.forEach(p => {
        if (!this.adjustmentsMap[p.id]) {
          this.adjustmentsMap[p.id] = {
            counted: p.stock,
            difference: 0
          };
        }
      });

      this.renderMasterList(this.products);
      this.renderAdjustmentTable();

      // Seleccionar el primer producto por defecto
      if (this.products.length > 0 && !this.selectedProduct) {
        this.selectProductDetail(this.products[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  },

  filterMasterProducts(query = '') {
    const cleanQ = window.BarcodeUtils ? BarcodeUtils.clean(query) : query;
    const q = query.toLowerCase().trim();
    const cq = cleanQ.toLowerCase().trim();
    const filtered = this.products.filter(p => 
      !q || p.name.toLowerCase().includes(q) || (p.barcode && (p.barcode.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(cq)))
    );
    this.renderMasterList(filtered);
  },

  renderMasterList(list) {
    const container = document.getElementById('master-products-list');
    if (!container) return;

    if (list.length === 0) {
      container.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Sin productos</div>';
      return;
    }

    container.innerHTML = list.map(p => {
      const isSelected = this.selectedProduct && this.selectedProduct.id === p.id;
      const thumbHtml = p.image_url 
        ? `<img src="${p.image_url}" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;" alt="${p.name}">` 
        : (p.category_icon || '📦');

      const isLowStock = p.stock <= (p.min_stock || 5);
      const isOutOfStock = p.stock <= 0;

      return `
        <div class="master-product-item ${isSelected ? 'active' : ''}" onclick="InventoryModule.selectProductDetail(${p.id})">
          <div class="master-item-left">
            <div class="product-thumb">${thumbHtml}</div>
            <div style="min-width: 0;">
              <div class="master-item-meta">
                <span class="unit-chip">${p.unit.toUpperCase()}</span>
                <span>${p.barcode || 'SIN CODIGO'}</span>
                ${isOutOfStock ? `
                  <span style="background: #fee2e2; color: #dc2626; font-size: 0.68rem; font-weight: 800; padding: 0.1rem 0.4rem; border-radius: 4px;">AGOTADO</span>
                ` : (isLowStock ? `
                  <span style="background: #ffedd5; color: #c2410c; font-size: 0.68rem; font-weight: 700; padding: 0.1rem 0.4rem; border-radius: 4px;">STOCK BAJO (${p.stock})</span>
                ` : '')}
              </div>
              <div class="master-item-name" title="${p.name}">${p.name}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <div class="master-item-price">$${p.sale_price.toFixed(2)}</div>
            <button type="button" class="bar-action-icon" style="font-size: 0.85rem; padding: 0.2rem; width: 28px; height: 28px; border-radius: 6px; background: #f1f5f9;" onclick="event.stopPropagation(); InventoryModule.openProductModal(${p.id})" title="Modificar producto">
              ✏️
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  selectProductDetail(productId) {
    const prod = this.products.find(p => p.id === productId);
    if (!prod) return;

    this.selectedProduct = prod;

    // Actualizar clase activa en la lista izquierda
    document.querySelectorAll('.master-product-item').forEach(item => item.classList.remove('active'));
    const items = document.querySelectorAll('.master-product-item');
    const idx = this.products.findIndex(p => p.id === productId);
    if (items[idx]) items[idx].classList.add('active');

    // Actualizar ficha Hero derecha
    const heroIconEl = document.getElementById('detail-product-icon');
    if (prod.image_url) {
      heroIconEl.innerHTML = `<img src="${prod.image_url}" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;" alt="${prod.name}">`;
    } else {
      heroIconEl.innerHTML = prod.category_icon || '📦';
    }

    document.getElementById('detail-product-barcode').innerText = `${prod.barcode || '7503019544694'} (+4)`;
    document.getElementById('detail-product-name').innerText = prod.name;
    document.getElementById('detail-product-price').innerText = `$${prod.sale_price.toFixed(2)} MXN`;
    document.getElementById('detail-product-category').innerText = `Categoría: ${prod.category_name || 'Abarrotes'} • Costo: $${prod.cost_price.toFixed(2)}`;
    document.getElementById('detail-stock-badge-text').innerText = `${prod.stock} ${prod.unit}`;

    // Renderizar movimientos del producto
    this.renderProductMovements(prod);
  },

  renderProductMovements(prod) {
    const tbody = document.getElementById('detail-movements-table-body');
    if (!tbody) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString();

    tbody.innerHTML = `
      <tr>
        <td>
          <div style="font-weight: 700;">Venta A - 677176</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${dateStr} 13:45</div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <div class="store-avatar" style="width:24px; height:24px; font-size:0.75rem;">👤</div>
            <span style="font-size: 0.8rem;">Cajero 1</span>
          </div>
        </td>
        <td style="text-align: right;">
          <span class="movement-qty-badge qty-negative">- 1</span>
        </td>
        <td style="text-align: right; font-family: var(--font-mono); font-weight: 700;">
          ${prod.stock}
        </td>
      </tr>
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--accent-green-dark);">Ajuste de inventario (Entrada)</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${dateStr} 11:20</div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <div class="store-avatar" style="width:24px; height:24px; font-size:0.75rem;">👩</div>
            <span style="font-size: 0.8rem;">Encargado</span>
          </div>
        </td>
        <td style="text-align: right;">
          <span class="movement-qty-badge qty-positive">+ 10</span>
        </td>
        <td style="text-align: right; font-family: var(--font-mono); font-weight: 700;">
          ${(prod.stock + 1).toFixed(prod.allow_fractions ? 2 : 0)}
        </td>
      </tr>
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--accent-red);">Venta A - 677170 Cancelada</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${dateStr} 09:15</div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <div class="store-avatar" style="width:24px; height:24px; font-size:0.75rem;">👤</div>
            <span style="font-size: 0.8rem;">Cajero 1</span>
          </div>
        </td>
        <td style="text-align: right;">
          <span class="movement-qty-badge qty-positive">+ 1</span>
        </td>
        <td style="text-align: right; font-family: var(--font-mono); font-weight: 700;">
          ${(prod.stock - 9).toFixed(prod.allow_fractions ? 2 : 0)}
        </td>
      </tr>
    `;
  },

  // =========================================================================
  // FOTOGRAFÍA CON CÁMARA (WEBCAM / MÓVIL) Y ARCHIVO
  // =========================================================================

  async startCamera() {
    try {
      this.stopCamera();
      const constraints = {
        video: {
          facingMode: { ideal: this.currentCameraFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.activeMediaStream = stream;
      const videoEl = document.getElementById('camera-video-feed');
      if (videoEl) {
        videoEl.srcObject = stream;
        videoEl.play();
      }
      document.getElementById('camera-modal').classList.add('active');
    } catch (err) {
      console.warn('Camera error or permission denied:', err);
      App.showToast('No se pudo abrir la cámara. Revisa permisos o sube una foto desde "Galería"', 'error');
    }
  },

  switchCameraFacing() {
    this.currentCameraFacing = (this.currentCameraFacing === 'environment') ? 'user' : 'environment';
    this.startCamera();
  },

  stopCamera() {
    if (this.activeMediaStream) {
      this.activeMediaStream.getTracks().forEach(track => track.stop());
      this.activeMediaStream = null;
    }
    const videoEl = document.getElementById('camera-video-feed');
    if (videoEl) videoEl.srcObject = null;
    App.closeModal('camera-modal');
  },

  async capturePhoto() {
    const videoEl = document.getElementById('camera-video-feed');
    const canvas = document.getElementById('camera-capture-canvas');
    if (!videoEl || !canvas) return;

    const videoW = videoEl.videoWidth || 640;
    const videoH = videoEl.videoHeight || 480;
    const maxDim = 600;
    let targetW = videoW;
    let targetH = videoH;

    if (targetW > targetH) {
      if (targetW > maxDim) {
        targetH = Math.round(targetH * (maxDim / targetW));
        targetW = maxDim;
      }
    } else {
      if (targetH > maxDim) {
        targetW = Math.round(targetW * (maxDim / targetH));
        targetH = maxDim;
      }
    }

    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, targetW, targetH);

    const base64Data = canvas.toDataURL('image/jpeg', 0.85);
    this.stopCamera();

    await this.uploadAndSetPhoto(base64Data);
  },

  handleFilePhotoSelect(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      await this.uploadAndSetPhoto(e.target.result);
    };
    reader.readAsDataURL(file);
  },

  async uploadAndSetPhoto(base64Data) {
    try {
      App.showToast('Guardando fotografía...', 'info');
      const res = await fetch('/api/products/upload-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64Data })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al guardar foto');

      this.displaySelectedPhoto(data.image_url);
      App.showToast('📸 Foto cargada exitosamente', 'success');
    } catch (e) {
      console.warn('Upload fallback to data url:', e);
      this.displaySelectedPhoto(base64Data);
    }
  },

  displaySelectedPhoto(url) {
    document.getElementById('prod-form-image-url').value = url;
    const imgEl = document.getElementById('product-photo-img');
    const placeholder = document.getElementById('product-photo-placeholder');
    const removeBtn = document.getElementById('btn-remove-photo');

    imgEl.src = url;
    imgEl.style.display = 'block';
    placeholder.style.display = 'none';
    removeBtn.style.display = 'block';
  },

  removeSelectedPhoto() {
    document.getElementById('prod-form-image-url').value = '';
    const imgEl = document.getElementById('product-photo-img');
    const placeholder = document.getElementById('product-photo-placeholder');
    const removeBtn = document.getElementById('btn-remove-photo');
    const fileInput = document.getElementById('prod-photo-file-input');

    imgEl.src = '';
    imgEl.style.display = 'none';
    placeholder.style.display = 'block';
    removeBtn.style.display = 'none';
    if (fileInput) fileInput.value = '';
  },

  // =========================================================================
  // AJUSTE LIBRE DE INVENTARIO (ESTILO CAPTURA 4)
  // =========================================================================

  renderAdjustmentTable(filter = '') {
    const tbody = document.getElementById('adjustment-table-body');
    if (!tbody) return;

    const q = filter.toLowerCase().trim();
    const list = this.products.filter(p => {
      if (!q) return true;
      const b = (p.barcode || '').toLowerCase();
      const n = (p.name || '').toLowerCase();
      return n.includes(q) || b.includes(q);
    });

    let sinDiffCount = 0;
    let posCount = 0;
    let posAmount = 0;
    let negCount = 0;
    let negAmount = 0;

    // 1. RENDERIZADO TABLA ESCRITORIO
    tbody.innerHTML = list.map((p, i) => {
      const adj = this.adjustmentsMap[p.id] || { counted: p.stock, difference: 0 };
      const diff = adj.difference;

      if (diff === 0) sinDiffCount++;
      else if (diff > 0) {
        posCount++;
        posAmount += (diff * p.sale_price);
      } else {
        negCount++;
        negAmount += Math.abs(diff * p.sale_price);
      }

      const thumbHtml = p.image_url 
        ? `<img src="${p.image_url}" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;" alt="${p.name}">` 
        : (p.category_icon || '📦');

      return `
        <tr data-product-id="${p.id}">
          <td style="text-align: center; color: var(--primary-blue);" onclick="InventoryModule.openAdjustModal(${p.id})">☑</td>
          <td>
            <div class="product-cell-group">
              <div class="product-thumb adj-card-thumb" style="width: 40px; height: 40px; cursor: pointer;" onclick="event.stopPropagation(); InventoryModule.triggerMobilePhotoUpload(${p.id})" title="Clic para tomar foto con la cámara o cambiar imagen">
                ${thumbHtml}
                <div class="adj-card-thumb-badge" style="font-size: 0.55rem;">📷</div>
              </div>
              <div class="product-cell-info" onclick="InventoryModule.openAdjustModal(${p.id})">
                <span class="product-cell-code">${p.unit} • ${p.barcode || '00' + p.id}</span>
                <span class="product-cell-name">${p.name}</span>
              </div>
            </div>
          </td>
          <td onclick="InventoryModule.openAdjustModal(${p.id})"><span style="font-family: var(--font-mono); color: var(--text-secondary);">A-${(i % 5) + 1}</span></td>
          <td style="text-align: right;">
            <div style="display: inline-flex; align-items: center; justify-content: flex-end; gap: 3px;" onclick="event.stopPropagation()">
              <span style="font-family: var(--font-mono); color: var(--text-secondary); font-size: 0.82rem;">$</span>
              <input 
                type="number" 
                class="adj-price-input" 
                style="width: 74px; height: 28px; padding: 2px 4px; font-size: 0.85rem;"
                id="adj-desk-price-${p.id}"
                value="${p.sale_price.toFixed(2)}" 
                step="any" 
                min="0"
                title="Cambiar precio de venta"
                onchange="InventoryModule.updateProductPriceQuick(${p.id}, this.value)"
              >
            </div>
          </td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 600;" onclick="InventoryModule.openAdjustModal(${p.id})">${p.stock}</td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 800; color: ${diff > 0 ? 'var(--accent-green-dark)' : (diff < 0 ? 'var(--accent-red)' : 'var(--text-muted)')};" onclick="InventoryModule.openAdjustModal(${p.id})">
            ${diff > 0 ? '+' + diff : diff}
            ${diff !== 0 ? `<div style="font-size:0.7rem; font-weight: normal;">$${(diff * p.sale_price).toFixed(2)}</div>` : ''}
          </td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 900; font-size: 1rem; color: var(--primary-blue);">
            <div style="display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px;" onclick="event.stopPropagation()">
              <button type="button" class="adj-step-btn minus" style="width: 28px; height: 28px; font-size: 0.95rem; border-radius: 4px; border: 1px solid #cbd5e1;" onclick="InventoryModule.stepMobileAdjustment(${p.id}, -1)">−</button>
              <input type="number" class="adj-stepper-input" style="width: 52px; height: 28px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 0.85rem;" id="adj-desk-input-${p.id}" value="${adj.counted}" step="any" onchange="InventoryModule.setMobileAdjustmentCount(${p.id}, this.value)">
              <button type="button" class="adj-step-btn plus" style="width: 28px; height: 28px; font-size: 0.95rem; border-radius: 4px; border: 1px solid #cbd5e1;" onclick="InventoryModule.stepMobileAdjustment(${p.id}, 1)">+</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // 2. RENDERIZADO TARJETAS TÁCTILES MÓVILES
    const cardsContainer = document.getElementById('adjustment-mobile-cards');
    if (cardsContainer) {
      if (list.length === 0) {
        cardsContainer.innerHTML = `
          <div style="text-align: center; padding: 3rem 1rem; color: #94a3b8;">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔍</div>
            <strong style="color: #475569;">No se encontraron productos</strong>
            <p style="font-size: 0.8rem; margin-top: 0.25rem;">Intente con otro nombre o escanee el código de barras.</p>
          </div>
        `;
      } else {
        cardsContainer.innerHTML = list.map(p => {
          const adj = this.adjustmentsMap[p.id] || { counted: p.stock, difference: 0 };
          const diff = adj.difference;
          const thumbHtml = p.image_url 
            ? `<img src="${p.image_url}" style="width:100%; height:100%; object-fit:cover; border-radius:8px;" alt="${p.name}">` 
            : `<span style="font-size:1.6rem;">${p.category_icon || '📦'}</span>`;

          const diffClass = diff > 0 ? 'diff-pos' : (diff < 0 ? 'diff-neg' : 'diff-zero');
          const diffText = diff > 0 
            ? `+${diff} ${p.unit} (Sobrante: +$${(diff * p.sale_price).toFixed(2)})` 
            : (diff < 0 
              ? `${diff} ${p.unit} (Faltante: -$${Math.abs(diff * p.sale_price).toFixed(2)})` 
              : `✓ Cuadra (Sin diferencia)`);

          return `
            <div class="adj-mobile-card ${diff > 0 ? 'card-diff-pos' : (diff < 0 ? 'card-diff-neg' : '')}" id="adj-card-${p.id}">
              <!-- Cabecera de Tarjeta: Foto + Datos del Producto -->
              <div class="adj-card-top">
                <div class="adj-card-thumb" onclick="InventoryModule.triggerMobilePhotoUpload(${p.id})" title="Tocar para tomar foto con la cámara o cambiar imagen">
                  ${thumbHtml}
                  <div class="adj-card-thumb-badge">📷 Foto</div>
                </div>
                <div class="adj-card-info">
                  <span class="adj-card-barcode">🏷️ ${p.barcode || 'SIN CÓDIGO'} • ${p.unit.toUpperCase()}</span>
                  <strong class="adj-card-title">${p.name}</strong>
                  <div class="adj-card-meta-row">
                    <span class="adj-meta-stock">Stock sistema: <strong>${p.stock} ${p.unit}</strong></span>
                    <button type="button" class="adj-mini-photo-btn" onclick="InventoryModule.triggerMobilePhotoUpload(${p.id})" title="Tomar foto con la cámara del celular">
                      📷 Foto
                    </button>
                  </div>
                </div>
              </div>

              <!-- Fila para Cambiar Precio de Venta -->
              <div class="adj-card-price-row">
                <div class="adj-price-hint">
                  <span class="adj-price-icon">💵</span>
                  <span class="adj-price-label">Precio venta:</span>
                </div>
                <div class="adj-price-control">
                  <span class="adj-price-prefix">$</span>
                  <input 
                    type="number" 
                    class="adj-price-input" 
                    id="adj-price-${p.id}" 
                    value="${p.sale_price.toFixed(2)}" 
                    step="any"
                    min="0"
                    title="Editar precio de venta"
                    onchange="InventoryModule.updateProductPriceQuick(${p.id}, this.value)"
                  >
                  <span class="adj-price-suffix">MXN</span>
                  <button 
                    type="button" 
                    class="adj-price-save-btn" 
                    onclick="InventoryModule.updateProductPriceQuick(${p.id}, document.getElementById('adj-price-${p.id}').value)"
                    title="Guardar nuevo precio"
                  >
                    💾
                  </button>
                </div>
              </div>

              <!-- Fila para Modificar Cantidades (Conteo Físico) -->
              <div class="adj-card-stepper-row">
                <span class="adj-stepper-hint">Conteo físico:</span>
                <div class="adj-stepper-touch">
                  <button type="button" class="adj-step-btn minus" onclick="InventoryModule.stepMobileAdjustment(${p.id}, -1)">−</button>
                  <input type="number" class="adj-stepper-input" id="adj-input-${p.id}" value="${adj.counted}" step="any" onchange="InventoryModule.setMobileAdjustmentCount(${p.id}, this.value)">
                  <button type="button" class="adj-step-btn plus" onclick="InventoryModule.stepMobileAdjustment(${p.id}, 1)">+</button>
                </div>
              </div>

              <!-- Badge Dinámico de Diferencia -->
              <div class="adj-card-diff-badge ${diffClass}" id="adj-badge-${p.id}">
                ${diffText}
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Actualizar barra inferior de conteo
    document.getElementById('adj-stat-sindiff').innerText = `Sin diferencia (${sinDiffCount})`;
    document.getElementById('adj-stat-pos').innerText = `D. positiva (${posCount}) +$${posAmount.toFixed(2)}`;
    document.getElementById('adj-stat-neg').innerText = `D. negativa (${negCount}) -$${negAmount.toFixed(2)}`;
    const totalDiff = posAmount - negAmount;
    document.getElementById('adj-stat-total').innerText = `Total diferencia: ${totalDiff >= 0 ? '+' : ''}$${totalDiff.toFixed(2)}`;
  },

  stepMobileAdjustment(productId, delta) {
    const prod = this.products.find(p => p.id === productId);
    if (!prod) return;

    if (!this.adjustmentsMap[productId]) {
      this.adjustmentsMap[productId] = { counted: prod.stock, difference: 0 };
    }

    const currentCount = this.adjustmentsMap[productId].counted;
    const newCount = parseFloat(Math.max(0, currentCount + delta).toFixed(2));
    this.setMobileAdjustmentCount(productId, newCount);
  },

  setMobileAdjustmentCount(productId, countVal) {
    const prod = this.products.find(p => p.id === productId);
    if (!prod) return;

    const counted = parseFloat(parseFloat(countVal || 0).toFixed(2));
    const diff = parseFloat((counted - prod.stock).toFixed(2));

    this.adjustmentsMap[productId] = {
      counted: counted,
      difference: diff
    };

    // Actualizar input del elemento si existe
    const input = document.getElementById(`adj-input-${productId}`);
    if (input && document.activeElement !== input) {
      input.value = counted;
    }
    const deskInput = document.getElementById(`adj-desk-input-${productId}`);
    if (deskInput && document.activeElement !== deskInput) {
      deskInput.value = counted;
    }

    // Actualizar badge de diferencia de la tarjeta
    const badge = document.getElementById(`adj-badge-${productId}`);
    const card = document.getElementById(`adj-card-${productId}`);
    if (badge) {
      const diffClass = diff > 0 ? 'diff-pos' : (diff < 0 ? 'diff-neg' : 'diff-zero');
      const diffText = diff > 0 
        ? `+${diff} ${prod.unit} (Sobrante: +$${(diff * prod.sale_price).toFixed(2)})` 
        : (diff < 0 
          ? `${diff} ${prod.unit} (Faltante: -$${Math.abs(diff * prod.sale_price).toFixed(2)})` 
          : `✓ Cuadra (Sin diferencia)`);
      badge.className = `adj-card-diff-badge ${diffClass}`;
      badge.innerHTML = diffText;
    }
    if (card) {
      card.classList.toggle('card-diff-pos', diff > 0);
      card.classList.toggle('card-diff-neg', diff < 0);
    }

    // Recalcular estadísticas globales de la barra inferior
    this.recalculateAdjustmentStats();
  },

  recalculateAdjustmentStats() {
    let sinDiffCount = 0;
    let posCount = 0;
    let posAmount = 0;
    let negCount = 0;
    let negAmount = 0;

    this.products.forEach(p => {
      const adj = this.adjustmentsMap[p.id] || { counted: p.stock, difference: 0 };
      const diff = adj.difference;
      if (diff === 0) sinDiffCount++;
      else if (diff > 0) {
        posCount++;
        posAmount += (diff * p.sale_price);
      } else {
        negCount++;
        negAmount += Math.abs(diff * p.sale_price);
      }
    });

    const elSin = document.getElementById('adj-stat-sindiff');
    const elPos = document.getElementById('adj-stat-pos');
    const elNeg = document.getElementById('adj-stat-neg');
    const elTot = document.getElementById('adj-stat-total');

    if (elSin) elSin.innerText = `Sin diferencia (${sinDiffCount})`;
    if (elPos) elPos.innerText = `D. positiva (${posCount}) +$${posAmount.toFixed(2)}`;
    if (elNeg) elNeg.innerText = `D. negativa (${negCount}) -$${negAmount.toFixed(2)}`;
    const totalDiff = posAmount - negAmount;
    if (elTot) elTot.innerText = `Total diferencia: ${totalDiff >= 0 ? '+' : ''}$${totalDiff.toFixed(2)}`;
  },

  // =========================================================================
  // REALIZAR INVENTARIO: CAMBIO RÁPIDO DE PRECIO Y FOTOGRAFÍA CON CÁMARA
  // =========================================================================

  async updateProductPriceQuick(productId, newPriceVal) {
    const prod = this.products.find(p => p.id === productId);
    if (!prod) return;

    const parsedPrice = parseFloat(newPriceVal);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      App.showToast('Por favor ingrese un precio válido (mayor o igual a 0)', 'error');
      const input = document.getElementById(`adj-price-${productId}`);
      if (input) input.value = prod.sale_price.toFixed(2);
      const deskInput = document.getElementById(`adj-desk-price-${productId}`);
      if (deskInput) deskInput.value = prod.sale_price.toFixed(2);
      return;
    }

    if (parsedPrice === prod.sale_price) return;

    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_price: parsedPrice })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error actualizando precio');

      prod.sale_price = parsedPrice;
      if (window.PosModule && PosModule.products) {
        const posProd = PosModule.products.find(p => p.id === productId);
        if (posProd) posProd.sale_price = parsedPrice;
      }

      // Actualizar inputs si existen
      const input = document.getElementById(`adj-price-${productId}`);
      if (input) {
        input.value = parsedPrice.toFixed(2);
        input.classList.add('price-saved-flash');
        setTimeout(() => input.classList.remove('price-saved-flash'), 1200);
      }
      const deskInput = document.getElementById(`adj-desk-price-${productId}`);
      if (deskInput) {
        deskInput.value = parsedPrice.toFixed(2);
        deskInput.classList.add('price-saved-flash');
        setTimeout(() => deskInput.classList.remove('price-saved-flash'), 1200);
      }

      // Recalcular diferencia en badge y stats
      const adj = this.adjustmentsMap[productId] || { counted: prod.stock, difference: 0 };
      this.setMobileAdjustmentCount(productId, adj.counted);

      App.showToast(`💵 Precio de "${prod.name}" actualizado a $${parsedPrice.toFixed(2)} MXN`, 'success');
    } catch (err) {
      console.error('Error al actualizar precio:', err);
      App.showToast(`Error al actualizar precio: ${err.message}`, 'error');
    }
  },

  triggerMobilePhotoUpload(productId) {
    this.targetPhotoProductId = productId;
    const input = document.getElementById('mobile-inventory-photo-input');
    if (input) {
      input.value = '';
      input.click();
    }
  },

  async handleMobilePhotoSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file || !this.targetPhotoProductId) return;

    const productId = this.targetPhotoProductId;
    const prod = this.products.find(p => p.id === productId);
    const prodName = prod ? prod.name : 'producto';

    App.showToast(`📸 Procesando fotografía de "${prodName}"...`, 'info');

    try {
      // 1. Redimensionar/comprimir imagen en Canvas para optimizar subida en red móvil
      const base64Data = await this.compressImageFile(file, 800, 800, 0.85);

      // 2. Subir imagen al backend
      const res = await fetch('/api/products/upload-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64Data })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al subir fotografía');

      const newImageUrl = data.image_url;

      // 3. Vincular foto al producto en la base de datos
      const updateRes = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: newImageUrl })
      });
      if (!updateRes.ok) {
        const errData = await updateRes.json();
        throw new Error(errData.detail || 'Error al vincular foto al producto');
      }

      // 4. Actualizar memoria local
      if (prod) prod.image_url = newImageUrl;
      if (window.PosModule && PosModule.products) {
        const posProd = PosModule.products.find(p => p.id === productId);
        if (posProd) posProd.image_url = newImageUrl;
      }

      // 5. Actualizar interfaz visual inmediatamente en la tarjeta móvil
      const card = document.getElementById(`adj-card-${productId}`);
      if (card) {
        const thumb = card.querySelector('.adj-card-thumb');
        if (thumb) {
          thumb.innerHTML = `
            <img src="${newImageUrl}?t=${Date.now()}" style="width:100%; height:100%; object-fit:cover; border-radius:8px;" alt="${prodName}">
            <div class="adj-card-thumb-badge">📷 Foto</div>
          `;
          thumb.classList.add('card-highlight-pulse');
          setTimeout(() => thumb.classList.remove('card-highlight-pulse'), 1200);
        }
      }

      // Actualizar también en la fila de tabla de escritorio si existe
      const deskRow = document.querySelector(`tr[data-product-id="${productId}"]`);
      if (deskRow) {
        const deskThumb = deskRow.querySelector('.adj-card-thumb');
        if (deskThumb) {
          deskThumb.innerHTML = `
            <img src="${newImageUrl}?t=${Date.now()}" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;" alt="${prodName}">
            <div class="adj-card-thumb-badge" style="font-size: 0.55rem;">📷</div>
          `;
        }
      }

      App.showToast(`✅ Foto guardada para "${prodName}"`, 'success');
    } catch (err) {
      console.error('Error al guardar foto móvil:', err);
      App.showToast(`Error al guardar foto: ${err.message}`, 'error');
    }
  },

  compressImageFile(file, maxW, maxH, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          if (w > maxW || h > maxH) {
            if (w > h) {
              h = Math.round((h * maxW) / w);
              w = maxW;
            } else {
              w = Math.round((w * maxH) / h);
              h = maxH;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  resetAllAdjustments() {
    if (!confirm('¿Desea restablecer todos los conteos al stock actual del sistema?')) return;
    this.products.forEach(p => {
      this.adjustmentsMap[p.id] = {
        counted: p.stock,
        difference: 0
      };
    });
    this.renderAdjustmentTable();
    App.showToast('Conteos restablecidos a las existencias del sistema', 'info');
  },

  triggerBarcodePrompt() {
    const code = prompt('Escriba o escanee el código de barras del producto a contar:');
    if (code && code.trim()) {
      this.handleBarcodeScanInAdjustment(code.trim());
    }
  },

  handleBarcodeScanInAdjustment(rawCode) {
    if (!rawCode) return;
    const match = window.BarcodeUtils 
      ? BarcodeUtils.findMatch(this.products, rawCode) 
      : this.products.find(p => p.barcode === rawCode || p.barcode === rawCode.trim());

    if (match) {
      this.stepMobileAdjustment(match.id, 1);
      App.showToast(`+1 ${match.name} (Conteo: ${this.adjustmentsMap[match.id].counted})`, 'success');

      // Enfocar y hacer scroll a la tarjeta del producto
      const card = document.getElementById(`adj-card-${match.id}`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('card-highlight-pulse');
        setTimeout(() => card.classList.remove('card-highlight-pulse'), 1200);
      }

      // Limpiar buscador para el siguiente escaneo
      const search = document.getElementById('adjust-search-input');
      if (search) search.value = '';
    } else {
      App.showToast(`Producto no encontrado para código: ${rawCode}`, 'error');
    }
  },

  openAdjustModal(productId) {
    const prod = this.products.find(p => p.id === productId);
    if (!prod) return;

    this.modalAdjustProductId = productId;
    const adj = this.adjustmentsMap[productId] || { counted: prod.stock, difference: 0 };

    const thumbEl = document.getElementById('modal-qty-thumb');
    if (prod.image_url) {
      thumbEl.innerHTML = `<img src="${prod.image_url}" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;" alt="${prod.name}">`;
    } else {
      thumbEl.innerHTML = prod.category_icon || '📦';
    }

    document.getElementById('modal-qty-code').innerText = `${prod.unit.toUpperCase()} • ${prod.barcode || 'SIN CODIGO'}`;
    document.getElementById('modal-qty-name').innerText = prod.name;
    document.getElementById('modal-qty-price').innerText = `$${prod.sale_price.toFixed(2)} MXN`;
    document.getElementById('modal-qty-exist').innerText = `Existencia actual: ${prod.stock} ${prod.unit}`;

    document.getElementById('modal-stepper-val').value = adj.counted;
    document.getElementById('modal-cantidad-adjust').classList.add('active');
  },

  stepModalQuantity(delta) {
    const input = document.getElementById('modal-stepper-val');
    let val = parseFloat(input.value) || 0;
    val = Math.max(0, val + delta);
    input.value = val;
  },

  confirmModalQuantity() {
    if (!this.modalAdjustProductId) return;
    const prod = this.products.find(p => p.id === this.modalAdjustProductId);
    if (!prod) return;

    const counted = parseFloat(document.getElementById('modal-stepper-val').value) || 0;
    const diff = parseFloat((counted - prod.stock).toFixed(2));

    this.adjustmentsMap[prod.id] = {
      counted: counted,
      difference: diff
    };

    App.closeModal('modal-cantidad-adjust');
    this.renderAdjustmentTable();
    App.showToast(`Conteo actualizado para ${prod.name}`, 'info');
  },

  async applyBatchAdjustment() {
    let appliedCount = 0;
    for (const [prodIdStr, adj] of Object.entries(this.adjustmentsMap)) {
      if (adj.difference !== 0) {
        try {
          await fetch(`/api/products/${prodIdStr}/adjust_stock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              quantity_delta: adj.difference,
              reason: 'Ajuste libre de inventario (Conteo físico)'
            })
          });
          appliedCount++;
        } catch (e) {
          console.error(e);
        }
      }
    }

    App.showToast(`✅ Ajuste de inventario aplicado a ${appliedCount} producto(s)`, 'success');
    await this.loadProducts();
    if (window.PosModule) PosModule.loadProducts();
  },

  // Editar producto seleccionado en vista detalle
  openEditCurrentProduct() {
    if (!this.selectedProduct) {
      App.showToast('Seleccione un producto para modificar', 'error');
      return;
    }
    this.openProductModal(this.selectedProduct.id);
  },

  // Alta y Modificación de producto
  openProductModal(productOrId = null) {
    let prod = null;
    if (typeof productOrId === 'number' || typeof productOrId === 'string') {
      prod = this.products.find(p => p.id == productOrId);
    } else if (productOrId && typeof productOrId === 'object') {
      prod = productOrId;
    }

    const titleEl = document.getElementById('prod-modal-title');
    const saveBtn = document.getElementById('btn-save-product');

    if (prod) {
      this.editingProductId = prod.id;
      if (titleEl) titleEl.innerText = `✏️ Modificar Producto: ${prod.name}`;
      if (saveBtn) saveBtn.innerText = '💾 GUARDAR CAMBIOS';

      document.getElementById('prod-form-barcode').value = prod.barcode || '';
      document.getElementById('prod-form-name').value = prod.name || '';
      document.getElementById('prod-form-category').value = prod.category_id || '';
      document.getElementById('prod-form-cost').value = (prod.cost_price != null ? prod.cost_price : 0).toFixed(2);
      document.getElementById('prod-form-price').value = (prod.sale_price != null ? prod.sale_price : 0).toFixed(2);
      document.getElementById('prod-form-stock').value = prod.stock != null ? prod.stock : 0;
      document.getElementById('prod-form-unit').value = prod.unit || 'pz';
      document.getElementById('prod-form-bulk').checked = (prod.allow_fractions === 1);

      if (prod.image_url) {
        document.getElementById('prod-form-image-url').value = prod.image_url;
        const imgEl = document.getElementById('product-photo-img');
        const phEl = document.getElementById('product-photo-placeholder');
        const removeBtn = document.getElementById('btn-remove-photo');
        if (imgEl && phEl && removeBtn) {
          imgEl.src = prod.image_url;
          imgEl.style.display = 'block';
          phEl.style.display = 'none';
          removeBtn.style.display = 'block';
        }
      } else {
        this.removeSelectedPhoto();
      }
    } else {
      this.editingProductId = null;
      if (titleEl) titleEl.innerText = '➕ Nuevo Producto';
      if (saveBtn) saveBtn.innerText = '💾 REGISTRAR PRODUCTO';

      this.removeSelectedPhoto();
      document.getElementById('prod-form-barcode').value = '';
      document.getElementById('prod-form-name').value = '';
      document.getElementById('prod-form-category').value = '';
      document.getElementById('prod-form-cost').value = '0.00';
      document.getElementById('prod-form-price').value = '';
      document.getElementById('prod-form-stock').value = '10';
      document.getElementById('prod-form-unit').value = 'pz';
      document.getElementById('prod-form-bulk').checked = false;
    }

    document.getElementById('product-form-modal').classList.add('active');
    setTimeout(() => document.getElementById('prod-form-name').focus(), 150);
  },

  async saveProduct() {
    const name = document.getElementById('prod-form-name').value.trim();
    const price = parseFloat(document.getElementById('prod-form-price').value);

    if (!name || isNaN(price)) {
      App.showToast('Nombre y precio de venta son obligatorios', 'error');
      return;
    }

    const payload = {
      barcode: document.getElementById('prod-form-barcode').value.trim() || null,
      name: name,
      category_id: parseInt(document.getElementById('prod-form-category').value) || null,
      cost_price: parseFloat(document.getElementById('prod-form-cost').value) || 0,
      sale_price: price,
      stock: parseFloat(document.getElementById('prod-form-stock').value) || 0,
      min_stock: 5,
      unit: document.getElementById('prod-form-unit').value,
      allow_fractions: document.getElementById('prod-form-bulk').checked ? 1 : 0,
      image_url: document.getElementById('prod-form-image-url').value || null
    };

    const isEdit = !!this.editingProductId;
    const url = isEdit ? `/api/products/${this.editingProductId}` : '/api/products';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al guardar');

      App.showToast(isEdit ? '✅ Producto actualizado exitosamente' : '✅ Producto agregado al catálogo', 'success');
      App.closeModal('product-form-modal');

      const targetId = this.editingProductId || data.id;
      this.editingProductId = null;

      await this.loadProducts();
      if (targetId) {
        this.selectProductDetail(targetId);
      }
      if (window.PosModule) PosModule.loadProducts();
    } catch (e) {
      App.showToast(e.message, 'error');
    }
  },

  // =========================================================================
  // REORDEN INTELIGENTE Y EXPORTACIÓN / IMPORTACIÓN CSV
  // =========================================================================

  exportCatalogCSV() {
    window.open('/api/products/export/csv', '_blank');
  },

  openImportCsvModal() {
    const fileInput = document.getElementById('csv-file-input');
    if (fileInput) fileInput.value = '';
    const preview = document.getElementById('csv-import-preview');
    if (preview) preview.innerHTML = '';
    const modal = document.getElementById('modal-import-csv');
    if (modal) modal.classList.add('active');
  },

  async processCsvImport() {
    const fileInput = document.getElementById('csv-file-input');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      App.showToast('Seleccione un archivo CSV para importar', 'warning');
      return;
    }

    const file = fileInput.files[0];
    const text = await file.text();
    const btn = document.getElementById('btn-confirm-csv-import');
    if (btn) {
      btn.disabled = true;
      btn.innerText = '⏳ Procesando catálogo...';
    }

    try {
      const res = await fetch('/api/products/import/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_text: text })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al importar CSV');

      App.showToast(`✅ ${data.message}`, 'success');
      App.closeModal('modal-import-csv');
      await this.loadProducts();
      if (window.PosModule) PosModule.loadProducts();
    } catch (err) {
      App.showToast(`Error importando CSV: ${err.message}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = '📥 Iniciar Importación';
      }
    }
  },

  async openReorderSuggestionsModal() {
    const modal = document.getElementById('modal-reorder-suggestions');
    const tbody = document.getElementById('reorder-table-body');
    if (modal) modal.classList.add('active');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:#64748b;">⏳ Analizando rotación de ventas históricas y existencias...</td></tr>';
    }

    try {
      const res = await fetch('/api/products/reorder-suggestions?days_projection=15&limit=100');
      const items = await res.json();
      this.renderReorderTable(items);
    } catch (err) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#dc2626; padding:1.5rem;">Error cargando sugerencias: ${err.message}</td></tr>`;
      }
    }
  },

  renderReorderTable(items) {
    const tbody = document.getElementById('reorder-table-body');
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:#16a34a; font-weight:700;">🎉 ¡Excelente! No hay productos con riesgo de agotarse en los próximos 15 días.</td></tr>';
      return;
    }

    tbody.innerHTML = items.map(it => {
      const isOut = it.stock <= 0;
      const isCritical = it.stock <= it.min_stock;
      const statusColor = isOut ? '#dc2626' : (isCritical ? '#ea580c' : '#ca8a04');
      const statusBg = isOut ? '#fee2e2' : (isCritical ? '#ffedd5' : '#fef9c3');
      const statusTxt = isOut ? 'AGOTADO' : (isCritical ? 'CRÍTICO' : 'REORDEN');

      return `
        <tr>
          <td>
            <strong>${it.name}</strong>
            <div style="font-size:0.75rem; color:#64748b;">${it.barcode || 'SIN CODIGO'} • ${it.category_name || 'General'}</div>
          </td>
          <td style="font-family:monospace; font-weight:700; color:${statusColor}; font-size:0.95rem;">
            ${it.stock} ${it.unit}
          </td>
          <td style="font-family:monospace;">${it.min_stock} ${it.unit}</td>
          <td style="font-family:monospace; font-weight:600;">${it.daily_sales_rate} /día</td>
          <td style="font-family:monospace;">
            ${it.days_stock_remaining >= 900 ? '<span style="color:#94a3b8;">Sin ventas</span>' : `${it.days_stock_remaining} días`}
          </td>
          <td style="font-family:monospace; font-weight:800; font-size:1.05rem; color:#1d4ed8;">
            +${it.suggested_reorder} ${it.unit}
          </td>
          <td>
            <span style="display:inline-block; padding:0.2rem 0.55rem; border-radius:999px; font-size:0.72rem; font-weight:800; background:${statusBg}; color:${statusColor};">
              ${statusTxt}
            </span>
          </td>
        </tr>
      `;
    }).join('');
  }
};

window.InventoryModule = InventoryModule;
