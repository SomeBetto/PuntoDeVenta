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
    const list = this.products.filter(p => !q || p.name.toLowerCase().includes(q));

    let sinDiffCount = 0;
    let posCount = 0;
    let posAmount = 0;
    let negCount = 0;
    let negAmount = 0;

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
        <tr style="cursor: pointer;" onclick="InventoryModule.openAdjustModal(${p.id})">
          <td style="text-align: center; color: var(--primary-blue);">☑</td>
          <td>
            <div class="product-cell-group">
              <div class="product-thumb">${thumbHtml}</div>
              <div class="product-cell-info">
                <span class="product-cell-code">${p.unit} • ${p.barcode || '00' + p.id}</span>
                <span class="product-cell-name">${p.name}</span>
              </div>
            </div>
          </td>
          <td><span style="font-family: var(--font-mono); color: var(--text-secondary);">A-${(i % 5) + 1}</span></td>
          <td style="text-align: right; font-family: var(--font-mono);">$${p.sale_price.toFixed(2)}</td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 600;">${p.stock}</td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 800; color: ${diff > 0 ? 'var(--accent-green-dark)' : (diff < 0 ? 'var(--accent-red)' : 'var(--text-muted)')};">
            ${diff > 0 ? '+' + diff : diff}
            ${diff !== 0 ? `<div style="font-size:0.7rem; font-weight: normal;">$${(diff * p.sale_price).toFixed(2)}</div>` : ''}
          </td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 900; font-size: 1rem; color: var(--primary-blue);">
            ${adj.counted}
          </td>
        </tr>
      `;
    }).join('');

    // Actualizar barra inferior de conteo
    document.getElementById('adj-stat-sindiff').innerText = `Sin diferencia (${sinDiffCount})`;
    document.getElementById('adj-stat-pos').innerText = `D. positiva (${posCount}) +$${posAmount.toFixed(2)}`;
    document.getElementById('adj-stat-neg').innerText = `D. negativa (${negCount}) -$${negAmount.toFixed(2)}`;
    const totalDiff = posAmount - negAmount;
    document.getElementById('adj-stat-total').innerText = `Total diferencia: ${totalDiff >= 0 ? '+' : ''}$${totalDiff.toFixed(2)}`;
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
