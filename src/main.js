/**
 * =========================================================================
 * Mercat Asistent - Archivo Principal (Orquestador de la Aplicación)
 * =========================================================================
 * 
 * Este archivo actúa como el punto de entrada ('main') de nuestra PWA.
 * Conecta los diferentes módulos:
 * - api.js     -> Peticiones HTTP a Spring Boot y Supabase en Render.
 * - scanner.js -> Acceso a la cámara y decodificación de códigos de barras.
 * - cart.js    -> Gestión de la cesta, cantidades y cálculos de subtotales.
 * - budget.js  -> Control del límite de presupuesto y semáforos de advertencia.
 * - modals.js  -> Paneles deslizables y notificaciones emergentes (Toasts).
 */

import './css/style.css';
import { pingBackend, getProductByBarcode, createProduct, savePurchase } from './js/api.js';
import { startScanner, pauseScanner, resumeScanner, toggleTorch, isScannerRunning, isCameraPaused, resetLastScannedCode } from './js/scanner.js';
import { loadCart, getCartItems, addProductToCart, incrementQuantity, decrementQuantity, removeProduct, clearCart, calculateTotal, formatEur } from './js/cart.js';
import { getStoredBudget, saveBudget, evaluateBudget } from './js/budget.js';
import { initModals, openModal, closeAllModals, showToast, showScannedProductModal } from './js/modals.js';

// =========================================================================
// 1. REGISTRO DEL SERVICE WORKER (PWA)
// =========================================================================
/**
 * Registra el Service Worker para permitir la instalación de la app
 * y el funcionamiento offline en zonas con mala cobertura.
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Usamos ruta relativa para que sea compatible con GitHub Pages
      navigator.serviceWorker.register('./sw.js')
        .then((registration) => {
          console.log('[PWA] Service Worker registrado con éxito en el ámbito:', registration.scope);
          // Comprueba si hay una nueva versión del Service Worker en el servidor
          registration.update();
        })
        .catch((error) => {
          console.warn('[PWA] Error al registrar el Service Worker:', error.message);
        });
    });
  }
}

// =========================================================================
// 2. ELEMENTOS DEL DOM
// =========================================================================
const cartListEl = document.getElementById('cart-list');
const emptyCartStateEl = document.getElementById('empty-cart-state');
const summaryTotalEl = document.getElementById('summary-total');

// Barra de Presupuesto
const budgetBarEl = document.getElementById('budget-progress-bar');
const budgetTextEl = document.getElementById('budget-progress-text');
const budgetIconEl = document.getElementById('budget-progress-icon');
const budgetSliderEl = document.getElementById('budget-range-slider');
const budgetNumericInputEl = document.getElementById('budget-numeric-input');
const sliderHintEl = document.getElementById('slider-val-hint');

// Controles de Cámara y Linterna
const btnToggleCamera = document.getElementById('btn-toggle-camera');
const camIconEl = document.getElementById('camera-status-icon');
const camTextEl = document.getElementById('camera-status-text');
const camDotEl = document.getElementById('camera-status-dot');
const camOverlayEl = document.getElementById('camera-paused-overlay');
const laserBeamEl = document.getElementById('scanner-laser-beam');
const btnToggleTorch = document.getElementById('btn-toggle-torch-bar');
const torchIconEl = document.getElementById('torch-bar-icon');
const torchTextEl = document.getElementById('torch-bar-text');
const torchDotEl = document.getElementById('torch-bar-dot');
const torchAmbientEl = document.getElementById('torch-ambient');

// Formulario de Búsqueda Manual
const searchFormEl = document.getElementById('search-form');
const searchInputEl = document.getElementById('search-product-input');
const clearSearchBtnEl = document.getElementById('clear-search-btn');

// Botón de Guardar Compra
const savePurchaseBtn = document.getElementById('save-purchase-btn');
const saveBtnIconEl = document.getElementById('save-btn-icon');
const saveBtnTextEl = document.getElementById('save-btn-text');

// Formulario de Alta de Nuevo Producto (404)
const formAddProductEl = document.getElementById('form-add-product');
const newBarcodeEl = document.getElementById('new-product-barcode');
const newNameEl = document.getElementById('new-product-name');
const newPriceEl = document.getElementById('new-product-price');
const cancelAddProductBtn = document.getElementById('cancel-add-product-btn');
const closeAddProductBtn = document.getElementById('close-add-product-modal');

// Banner de arranque en Render
const backendBannerEl = document.getElementById('backend-status-banner');
const backendStatusTextEl = document.getElementById('backend-status-text');
const backendStatusDotEl = document.getElementById('backend-status-dot');
const closeBackendBannerBtn = document.getElementById('close-backend-banner');

function hideBackendBanner() {
  if (backendBannerEl && !backendBannerEl.classList.contains('hidden')) {
    backendBannerEl.classList.add('hidden');
  }
}
closeBackendBannerBtn?.addEventListener('click', hideBackendBanner);

// =========================================================================
// 3. RENDERIZADO VISUAL DEL CARRITO Y TOTALES
// =========================================================================
/**
 * Dibuja la lista de productos en el carrito y actualiza los totales.
 */
function renderCart() {
  const items = getCartItems();
  const total = calculateTotal();
  const budgetLimit = getStoredBudget();

  // 1. Mostrar u ocultar el estado vacío
  if (items.length === 0) {
    cartListEl.innerHTML = '';
    emptyCartStateEl.classList.remove('hidden');
  } else {
    emptyCartStateEl.classList.add('hidden');
    
    // Generamos las tarjetas HTML con Tailwind
    cartListEl.innerHTML = items.map((item, index) => `
      <div class="cart-item stagger-item w-full p-space-md rounded-2xl bg-surface-container-lowest shadow-sm flex flex-col gap-2.5 border border-surface-container-high/60 hover:shadow-md transition-all duration-200" 
           data-id="${item.id}" 
           style="animation-delay: ${index * 0.04}s;">
        
        <!-- Fila superior: Nombre del producto -->
        <div class="flex items-center justify-between w-full">
          <span class="product-title font-headline-sm text-headline-sm text-on-surface font-bold truncate leading-tight">
            ${item.name}
          </span>
        </div>

        <!-- Fila inferior: Precio unitario, selector de cantidad y subtotal -->
        <div class="flex items-center justify-between w-full gap-2">
          <span class="font-body-sm text-body-sm text-on-surface-variant shrink-0">
            ${formatEur(item.price)}/ud
          </span>

          <!-- Controles de cantidad didácticos (+ / - / borrar) -->
          <div class="flex items-center gap-1.5 bg-surface-container-low p-1 rounded-full">
            <button type="button" aria-label="Eliminar ${item.name}" class="btn-delete btn-tactile w-7 h-7 rounded-full flex items-center justify-center text-error hover:bg-error-container hover:text-on-error-container transition-all">
              <span class="material-symbols-outlined text-[16px]">delete_outline</span>
            </button>
            <button type="button" aria-label="Restar una unidad" class="btn-qty-minus btn-tactile w-7 h-7 rounded-full flex items-center justify-center bg-surface-container text-on-surface hover:bg-surface-container-highest transition-all">
              <span class="material-symbols-outlined text-[16px]">remove</span>
            </button>
            <span class="item-qty font-label-md text-label-md font-semibold text-on-surface px-1 min-w-[18px] text-center inline-block">
              ${item.quantity}
            </span>
            <button type="button" aria-label="Sumar una unidad" class="btn-qty-plus btn-tactile w-7 h-7 rounded-full flex items-center justify-center bg-surface-container text-on-surface hover:bg-surface-container-highest transition-all">
              <span class="material-symbols-outlined text-[16px]">add</span>
            </button>
          </div>

          <!-- Subtotal de esta línea (precio * cantidad) -->
          <span class="font-headline-sm text-headline-sm text-on-surface font-bold text-right shrink-0">
            ${formatEur(item.price * item.quantity)}
          </span>
        </div>

      </div>
    `).join('');
  }

  // 2. Actualizar el importe total con animación de pulso
  const formattedTotal = formatEur(total);
  if (summaryTotalEl.textContent !== formattedTotal) {
    summaryTotalEl.textContent = formattedTotal;
    summaryTotalEl.classList.remove('price-bump');
    void summaryTotalEl.offsetWidth; // Forzar reflow para reiniciar la animación CSS
    summaryTotalEl.classList.add('price-bump');
  }

  // 3. Evaluar el estado del presupuesto y actualizar la barra didáctica
  const budgetStatus = evaluateBudget(total, budgetLimit);
  budgetBarEl.style.width = `${budgetStatus.barWidth}%`;
  budgetBarEl.className = `h-full rounded-full transition-all duration-300 ease-out ${budgetStatus.barColorClass}`;
  
  budgetTextEl.textContent = `${formatEur(total)} / ${formatEur(budgetLimit)} (${budgetStatus.percent}%)`;
  budgetTextEl.className = `font-semibold transition-colors ${budgetStatus.textColorClass}`;

  budgetIconEl.textContent = budgetStatus.iconName;
  budgetIconEl.className = `material-symbols-outlined text-[14px] transition-colors ${budgetStatus.textColorClass}`;
}

// =========================================================================
// 4. LÓGICA DE PROCESAMIENTO DE UN CÓDIGO DE BARRAS
// =========================================================================
/**
 * Se ejecuta cada vez que el escáner de cámara o el buscador reciben un código.
 * 
 * @param {string} barcode Código de barras (ej: "8480000861900")
 * @param {number|null} detectedPrice Precio detectado en código GS1 Digital Link
 */
async function handleBarcodeDetected(barcode, detectedPrice = null) {
  if (!barcode) return;

  showToast(`Buscando código ${barcode}...`, 'search');

  try {
    // 1. Consultamos la API en Spring Boot
    const product = await getProductByBarcode(barcode);
    hideBackendBanner();

    if (product) {
      // Caso de éxito: El producto ya está en Supabase
      const itemToAdd = (detectedPrice !== null && !isNaN(detectedPrice))
        ? { ...product, price: detectedPrice }
        : product;

      addProductToCart(itemToAdd);
      renderCart();

      // Ventanita emergente destacada con nombre, precio y progreso de reanudación
      showScannedProductModal(itemToAdd, () => {
        resumeScanner();
      });
    } else {
      // Caso 404: El producto no existe aún en la base de datos
      // Pausamos la cámara mientras se completa el formulario
      pauseScanner();

      // Abrimos el modal para darlo de alta
      newBarcodeEl.value = barcode;
      newNameEl.value = '';
      newPriceEl.value = (detectedPrice !== null && !isNaN(detectedPrice)) ? detectedPrice : '';

      openModal('panel-add-product');
      newNameEl.focus();

      showToast(`Código ${barcode} no registrado. ¡Añádelo ahora!`, 'info');
    }
  } catch (error) {
    showToast(`Error al consultar el producto: ${error.message}`, 'error');
    // En caso de error, reanudar tras 2 segundos para no bloquear la cámara
    setTimeout(() => {
      resumeScanner();
    }, 2000);
  }
}

// =========================================================================
// 5. EVENTOS: FORMULARIO DE ALTA DE PRODUCTO NUEVO (404)
// =========================================================================
formAddProductEl?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const barcode = newBarcodeEl.value.trim();
  const name = newNameEl.value.trim();
  const price = parseFloat(newPriceEl.value);

  if (!barcode || !name || isNaN(price) || price <= 0) {
    showToast('Por favor, introduce un nombre y precio válidos', 'warning');
    return;
  }

  try {
    showToast('Guardando producto en la base de datos...', 'cloud_upload');
    
    // Llamada POST a Spring Boot
    const created = await createProduct({ barcode, name, price });

    // Cerramos el modal de alta
    closeAllModals();

    // Añadimos el producto recién creado a la cesta activa
    addProductToCart(created);
    renderCart();

    // Ventanita emergente destacada y reanudación automática de la cámara
    showScannedProductModal(created, () => {
      resumeScanner();
    });
  } catch (err) {
    showToast(`Error al crear producto: ${err.message}`, 'error');
  }
});

// Botones de cancelar en el modal de alta de producto
function cancelNewProduct() {
  closeAllModals();
  resetLastScannedCode();
  resumeScanner();
}
cancelAddProductBtn?.addEventListener('click', cancelNewProduct);
closeAddProductBtn?.addEventListener('click', cancelNewProduct);

// =========================================================================
// 6. EVENTOS DE LA CESTA (+ / - / ELIMINAR) CON DELEGACIÓN
// =========================================================================
cartListEl?.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  const card = btn.closest('.cart-item');
  if (!card) return;

  const productId = parseInt(card.getAttribute('data-id'), 10);
  if (!productId) return;

  if (btn.classList.contains('btn-qty-plus')) {
    incrementQuantity(productId);
    renderCart();
  } else if (btn.classList.contains('btn-qty-minus')) {
    const result = decrementQuantity(productId);
    if (result && result.removed) {
      // Efecto suave de colapso antes de re-renderizar
      card.classList.add('cart-item-collapsing');
      setTimeout(renderCart, 280);
      showToast(`${result.item.name} eliminado`, 'delete_outline');
    } else {
      renderCart();
    }
  } else if (btn.classList.contains('btn-delete')) {
    const removed = removeProduct(productId);
    card.classList.add('cart-item-collapsing');
    setTimeout(renderCart, 280);
    if (removed) {
      showToast(`${removed.name} eliminado`, 'delete_outline');
    }
  }
});

// =========================================================================
// 7. EVENTOS DE BÚSQUEDA MANUAL O POR CÓDIGO
// =========================================================================
searchFormEl?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = searchInputEl.value.trim();
  if (!query) return;

  // Si son dígitos continuos (ej: EAN-13 o EAN-8), lo procesamos directamente como código
  if (/^\d{6,14}$/.test(query)) {
    await handleBarcodeDetected(query);
    searchInputEl.value = '';
    clearSearchBtnEl.classList.add('hidden');
  } else {
    // Si es texto, buscamos si ya está en la cesta
    const items = getCartItems();
    const found = items.find(i => i.name.toLowerCase().includes(query.toLowerCase()));
    if (found) {
      showToast(`"${found.name}" ya está en tu cesta (${found.quantity} uds)`, 'info');
    } else {
      showToast(`Escribe el código numérico o enfócalo con la cámara`, 'barcode_scanner');
    }
  }
});

searchInputEl?.addEventListener('input', async () => {
  const val = searchInputEl.value.trim();
  clearSearchBtnEl.classList.toggle('hidden', val.length === 0);

  // Si detecta exactamente 13 números continuos (código EAN-13), lo procesa automáticamente
  if (/^\d{13}$/.test(val)) {
    const barcodeToProcess = val;
    searchInputEl.value = '';
    clearSearchBtnEl.classList.add('hidden');
    await handleBarcodeDetected(barcodeToProcess);
  }
});

clearSearchBtnEl?.addEventListener('click', () => {
  searchInputEl.value = '';
  clearSearchBtnEl.classList.add('hidden');
  searchInputEl.focus();
});

// =========================================================================
// 8. EVENTOS: GUARDAR COMPRA (FINALIZAR EN CAJA)
// =========================================================================
savePurchaseBtn?.addEventListener('click', async () => {
  const items = getCartItems();

  if (items.length === 0) {
    showToast('Tu cesta está vacía. Escanea productos primero.', 'shopping_cart');
    return;
  }

  savePurchaseBtn.disabled = true;
  saveBtnIconEl.textContent = 'sync';
  saveBtnIconEl.classList.add('animate-spin');
  saveBtnTextEl.textContent = 'Guardando compra...';

  try {
    // Formateamos los datos para Spring Boot: [{ productId, quantity }]
    const payloadItems = items.map(i => ({
      productId: i.id,
      quantity: i.quantity
    }));

    const result = await savePurchase(payloadItems);

    // Guardar en el historial local con desglose de productos para consulta del tiquet
    saveToLocalHistory({
      id: result.id || Date.now(),
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      total: calculateTotal(),
      itemCount: items.reduce((acc, i) => acc + i.quantity, 0),
      items: items.map(i => ({
        id: i.id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        barcode: i.barcode
      }))
    });

    // Vaciar el carrito
    clearCart();
    renderCart();

    saveBtnIconEl.classList.remove('animate-spin');
    saveBtnIconEl.textContent = 'task_alt';
    saveBtnTextEl.textContent = '¡Compra guardada!';

    showToast('¡Compra registrada con éxito en Supabase!', 'task_alt');

    setTimeout(() => {
      savePurchaseBtn.disabled = false;
      saveBtnIconEl.textContent = 'check_circle';
      saveBtnTextEl.textContent = 'Guardar compra';
    }, 2000);
  } catch (error) {
    showToast(`Error al guardar la compra: ${error.message}`, 'error');
    savePurchaseBtn.disabled = false;
    saveBtnIconEl.classList.remove('animate-spin');
    saveBtnIconEl.textContent = 'check_circle';
    saveBtnTextEl.textContent = 'Guardar compra';
  }
});

// =========================================================================
// 9. CONFIGURACIÓN DEL PRESUPUESTO
// =========================================================================
function syncBudget(newVal) {
  const saved = saveBudget(newVal);
  if (budgetSliderEl) budgetSliderEl.value = Math.min(200, Math.max(1, Math.round(saved)));
  if (budgetNumericInputEl) budgetNumericInputEl.value = saved;
  if (sliderHintEl) sliderHintEl.textContent = `Límite: ${formatEur(saved)}`;
  renderCart();
  return saved;
}

// 1. Cuando se mueve la barra deslizadora (de 5 en 5 €)
budgetSliderEl?.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  const saved = saveBudget(val);
  if (budgetNumericInputEl) budgetNumericInputEl.value = saved;
  if (sliderHintEl) sliderHintEl.textContent = `Límite: ${formatEur(saved)}`;
  renderCart();
});

// 2. Cuando el usuario teclea en el campo numérico (permite escribir cualquier número y céntimos)
budgetNumericInputEl?.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  // No sobreescribimos budgetNumericInputEl.value mientras el usuario está escribiendo
  if (!isNaN(val) && val >= 1 && val <= 200) {
    saveBudget(val);
    if (budgetSliderEl) budgetSliderEl.value = Math.min(200, Math.max(1, Math.round(val)));
    if (sliderHintEl) sliderHintEl.textContent = `Límite: ${formatEur(val)}`;
    renderCart();
  }
});

// 3. Al confirmar o salir del campo numérico (change)
budgetNumericInputEl?.addEventListener('change', (e) => {
  const val = parseFloat(e.target.value);
  const current = isNaN(val) ? getStoredBudget() : val;
  const saved = saveBudget(current);
  budgetNumericInputEl.value = saved;
  if (budgetSliderEl) budgetSliderEl.value = Math.min(200, Math.max(1, Math.round(saved)));
  if (sliderHintEl) sliderHintEl.textContent = `Límite: ${formatEur(saved)}`;
  renderCart();
});

// =========================================================================
// 10. HISTORIAL LOCAL Y LISTA DE LA COMPRA PREVIA
// =========================================================================
const HISTORY_KEY = 'mercat_purchase_history';
const historyItemsContainer = document.getElementById('history-items-container');

function saveToLocalHistory(entry) {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    list.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 20))); // Máximo 20 compras
    renderHistoryDrawer();
  } catch (e) {}
}

function deletePurchaseFromHistory(purchaseId) {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const filtered = list.filter(item => item.id !== purchaseId);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
    renderHistoryDrawer();
    showToast('Compra eliminada del historial', 'delete_outline');
  } catch (e) {}
}

function reloadPurchaseToCart(purchaseId) {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const found = list.find(item => item.id === purchaseId);
    if (found && Array.isArray(found.items) && found.items.length > 0) {
      found.items.forEach(prod => {
        addProductToCart(prod);
      });
      renderCart();
      closeAllModals();
      showToast(`¡${found.items.length} productos cargados en tu cesta!`, 'shopping_cart');
    }
  } catch (e) {}
}

function renderHistoryDrawer() {
  if (!historyItemsContainer) return;

  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (list.length === 0) {
      historyItemsContainer.innerHTML = `
        <div class="text-center py-8 text-on-surface-variant flex flex-col items-center gap-2">
          <span class="material-symbols-outlined text-[36px] text-outline-variant">receipt_long</span>
          <span class="text-body-sm font-medium">Aún no has guardado ninguna compra.</span>
        </div>
      `;
      return;
    }

    historyItemsContainer.innerHTML = list.map((item, index) => {
      const itemsList = Array.isArray(item.items) ? item.items : [];
      const hasItems = itemsList.length > 0;
      const ticketIdFormatted = (item.id || '').toString().slice(-4) || (index + 1);

      return `
        <div class="purchase-card rounded-2xl bg-surface-container-lowest border border-surface-container-high shadow-sm overflow-hidden transition-all duration-200" data-purchase-id="${item.id}">
          
          <!-- Encabezado de la compra (Tocar para expandir/colapsar detalles) -->
          <button type="button" class="btn-toggle-ticket w-full p-3.5 flex items-center justify-between text-left hover:bg-surface-container-low transition-colors select-none" data-id="${item.id}">
            <div class="flex flex-col gap-0.5 min-w-0 pr-2">
              <div class="flex items-center gap-1.5">
                <span class="font-headline-sm text-[15px] text-on-surface font-bold">Compra #${ticketIdFormatted}</span>
                <span class="material-symbols-outlined text-[18px] text-primary transition-transform duration-200 ticket-chevron">expand_more</span>
              </div>
              <span class="font-body-sm text-on-surface-variant text-[12px] truncate">${item.date} • ${item.itemCount || itemsList.reduce((acc, i) => acc + i.quantity, 0)} productos</span>
            </div>
            <div class="text-right flex flex-col items-end shrink-0">
              <span class="font-headline-sm text-[16px] text-primary font-bold">${formatEur(item.total)}</span>
              <span class="text-[11px] text-primary font-medium flex items-center gap-0.5">
                <span>Ver tiquet</span>
              </span>
            </div>
          </button>

          <!-- Tíquet detallado desplegable -->
          <div class="ticket-details hidden border-t border-dashed border-surface-container-high bg-surface-container-low/30 p-3.5 flex flex-col gap-2.5 font-sans">
            
            <div class="flex items-center justify-between text-on-surface-variant text-[11px] font-mono uppercase tracking-wider pb-1 border-b border-surface-container-high">
              <span>Artículo</span>
              <span>Uds x Precio • Subtotal</span>
            </div>

            <!-- Listado de productos comprados -->
            <div class="flex flex-col gap-2">
              ${hasItems ? itemsList.map(prod => `
                <div class="flex items-center justify-between gap-2 text-body-sm">
                  <div class="flex flex-col min-w-0">
                    <span class="font-semibold text-on-surface text-[13px] truncate">${prod.name}</span>
                    <span class="text-on-surface-variant text-[11px]">${prod.quantity} ud${prod.quantity > 1 ? 's' : ''} x ${formatEur(prod.price)}</span>
                  </div>
                  <span class="font-bold text-on-surface text-[13px] shrink-0 text-right">
                    ${formatEur(prod.price * prod.quantity)}
                  </span>
                </div>
              `).join('') : `
                <div class="text-on-surface-variant text-[12px] italic text-center py-1">
                  Desglose de artículos no disponible en este registro anterior.
                </div>
              `}
            </div>

            <!-- Total del Tíquet -->
            <div class="border-t border-dashed border-outline-variant/60 pt-2.5 mt-1 flex items-center justify-between">
              <div class="flex flex-col">
                <span class="text-[11px] uppercase font-mono text-on-surface-variant font-bold">Total Compra</span>
                <span class="text-[11px] text-on-surface-variant">${item.date}</span>
              </div>
              <span class="font-headline-sm text-[17px] text-primary font-extrabold">${formatEur(item.total)}</span>
            </div>

            <!-- Acciones del Tíquet: Cargar de nuevo o Borrar -->
            <div class="flex items-center justify-between pt-2 border-t border-surface-container-high/60 gap-2">
              ${hasItems ? `
                <button type="button" class="btn-reload-cart btn-tactile text-primary hover:bg-primary/10 text-[12px] font-semibold py-1.5 px-3 rounded-lg flex items-center gap-1 transition-colors" data-id="${item.id}">
                  <span class="material-symbols-outlined text-[16px]">restart_alt</span>
                  <span>Repetir cesta</span>
                </button>
              ` : '<div></div>'}
              <button type="button" class="btn-delete-purchase btn-tactile text-error hover:bg-error/10 text-[12px] font-medium py-1.5 px-2.5 rounded-lg flex items-center gap-1 transition-colors" data-id="${item.id}">
                <span class="material-symbols-outlined text-[16px]">delete</span>
                <span>Eliminar</span>
              </button>
            </div>

          </div>

        </div>
      `;
    }).join('');
  } catch (e) {
    console.warn('[History] Error renderizando historial:', e);
  }
}

// Delegación de eventos para el historial: desplegar tiquet, repetir cesta y eliminar
historyItemsContainer?.addEventListener('click', (e) => {
  const toggleBtn = e.target.closest('.btn-toggle-ticket');
  const deleteBtn = e.target.closest('.btn-delete-purchase');
  const reloadBtn = e.target.closest('.btn-reload-cart');

  if (deleteBtn) {
    e.stopPropagation();
    const purchaseId = parseInt(deleteBtn.getAttribute('data-id'), 10);
    deletePurchaseFromHistory(purchaseId);
    return;
  }

  if (reloadBtn) {
    e.stopPropagation();
    const purchaseId = parseInt(reloadBtn.getAttribute('data-id'), 10);
    reloadPurchaseToCart(purchaseId);
    return;
  }

  if (toggleBtn) {
    const card = toggleBtn.closest('.purchase-card');
    if (!card) return;
    const details = card.querySelector('.ticket-details');
    const chevron = card.querySelector('.ticket-chevron');
    if (details) {
      const isHidden = details.classList.contains('hidden');
      details.classList.toggle('hidden', !isHidden);
      if (chevron) {
        chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    }
  }
});

// Lista previa de tareas (Checklist)
const SHOPPING_LIST_KEY = 'mercat_pending_list';
const addListItemBtn = document.getElementById('add-list-item-btn');
const newListItemInput = document.getElementById('new-list-item-input');
const shoppingItemsContainer = document.getElementById('shopping-items-container');

function loadShoppingList() {
  try {
    return JSON.parse(localStorage.getItem(SHOPPING_LIST_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function saveShoppingList(items) {
  try {
    localStorage.setItem(SHOPPING_LIST_KEY, JSON.stringify(items));
    renderShoppingListDrawer();
  } catch (e) {}
}

function renderShoppingListDrawer() {
  if (!shoppingItemsContainer) return;
  const items = loadShoppingList();

  if (items.length === 0) {
    shoppingItemsContainer.innerHTML = `
      <div class="text-center py-6 text-on-surface-variant text-body-sm">
        Tu lista previa está vacía. Añade lo que necesitas antes de ir a la tienda.
      </div>
    `;
    return;
  }

  shoppingItemsContainer.innerHTML = items.map((item, index) => `
    <div class="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-lowest border border-surface-container-high shadow-sm">
      <button type="button" class="toggle-list-item flex items-center gap-2 flex-1 text-left" data-index="${index}">
        <span class="material-symbols-outlined text-[18px] ${item.done ? 'text-primary' : 'text-outline'}">
          ${item.done ? 'check_circle' : 'radio_button_unchecked'}
        </span>
        <span class="font-body-md ${item.done ? 'line-through text-outline' : 'text-on-surface'}">
          ${item.text}
        </span>
      </button>
      <button type="button" class="delete-list-item text-error/70 hover:text-error p-1" data-index="${index}">
        <span class="material-symbols-outlined text-[16px]">delete</span>
      </button>
    </div>
  `).join('');
}

addListItemBtn?.addEventListener('click', () => {
  const val = newListItemInput.value.trim();
  if (!val) return;
  const items = loadShoppingList();
  items.unshift({ text: val, done: false });
  saveShoppingList(items);
  newListItemInput.value = '';
  showToast(`"${val}" añadido a la lista previa`, 'playlist_add_check');
});

shoppingItemsContainer?.addEventListener('click', (e) => {
  const toggleBtn = e.target.closest('.toggle-list-item');
  const deleteBtn = e.target.closest('.delete-list-item');

  if (toggleBtn) {
    const idx = parseInt(toggleBtn.getAttribute('data-index'), 10);
    const items = loadShoppingList();
    if (items[idx]) {
      items[idx].done = !items[idx].done;
      saveShoppingList(items);
    }
  } else if (deleteBtn) {
    const idx = parseInt(deleteBtn.getAttribute('data-index'), 10);
    const items = loadShoppingList();
    items.splice(idx, 1);
    saveShoppingList(items);
  }
});

// =========================================================================
// 11. CONTROLES DE LA CÁMARA Y LINTERNA
// =========================================================================
btnToggleCamera?.addEventListener('click', async () => {
  if (!isScannerRunning()) {
    const ok = await startScanner(
      'interactive-scanner',
      (detectedBarcode, detectedPrice) => {
        handleBarcodeDetected(detectedBarcode, detectedPrice);
      },
      (err) => {
        showToast('No se pudo acceder a la cámara', 'error');
      }
    );
    if (ok) {
      camIconEl.textContent = 'videocam';
      camIconEl.className = 'material-symbols-outlined text-[18px] text-primary';
      camTextEl.textContent = 'On';
      camDotEl.className = 'w-2 h-2 rounded-full bg-primary animate-pulse';
      camOverlayEl.classList.add('opacity-0', 'pointer-events-none');
      camOverlayEl.classList.remove('opacity-100', 'pointer-events-auto');
      if (laserBeamEl) laserBeamEl.style.display = 'flex';
      showToast('Cámara activada (On)', 'videocam');
    }
    return;
  }

  const isPaused = isCameraPaused();
  if (!isPaused) {
    pauseScanner();
    camIconEl.textContent = 'videocam_off';
    camIconEl.className = 'material-symbols-outlined text-[18px] text-on-surface-variant';
    camTextEl.textContent = 'Off';
    camDotEl.className = 'w-2 h-2 rounded-full bg-outline-variant';
    camOverlayEl.classList.remove('opacity-0', 'pointer-events-none');
    camOverlayEl.classList.add('opacity-100', 'pointer-events-auto');
    if (laserBeamEl) laserBeamEl.style.display = 'none';
    showToast('Cámara desactivada (Off)', 'videocam_off');
  } else {
    resumeScanner();
    camIconEl.textContent = 'videocam';
    camIconEl.className = 'material-symbols-outlined text-[18px] text-primary';
    camTextEl.textContent = 'On';
    camDotEl.className = 'w-2 h-2 rounded-full bg-primary animate-pulse';
    camOverlayEl.classList.add('opacity-0', 'pointer-events-none');
    camOverlayEl.classList.remove('opacity-100', 'pointer-events-auto');
    if (laserBeamEl) laserBeamEl.style.display = 'flex';
    showToast('Cámara activada (On)', 'videocam');
  }
});

btnToggleTorch?.addEventListener('click', async () => {
  const newState = await toggleTorch();
  if (newState) {
    torchIconEl.textContent = 'flashlight_on';
    torchIconEl.className = 'material-symbols-outlined text-[18px] text-amber-500';
    torchTextEl.textContent = 'On';
    torchDotEl.className = 'w-2 h-2 rounded-full bg-amber-400';
    torchAmbientEl.style.opacity = '1';
    showToast('Linterna encendida (On)', 'flashlight_on');
  } else {
    torchIconEl.textContent = 'flashlight_off';
    torchIconEl.className = 'material-symbols-outlined text-[18px] text-on-surface-variant';
    torchTextEl.textContent = 'Off';
    torchDotEl.className = 'w-2 h-2 rounded-full bg-outline-variant';
    torchAmbientEl.style.opacity = '0';
    showToast('Linterna apagada (Off)', 'flashlight_off');
  }
});

// =========================================================================
// 12. APERTURA DE MODALES DESDE EL HEADER
// =========================================================================
document.getElementById('header-btn-list')?.addEventListener('click', () => {
  renderShoppingListDrawer();
  openModal('panel-shopping-list');
});
document.getElementById('header-btn-history')?.addEventListener('click', () => {
  renderHistoryDrawer();
  openModal('panel-history');
});
document.getElementById('header-btn-guide')?.addEventListener('click', () => openModal('panel-guide'));
document.getElementById('header-btn-profile')?.addEventListener('click', () => openModal('panel-profile'));

// Botones de cierre
document.getElementById('close-list-modal')?.addEventListener('click', closeAllModals);
document.getElementById('close-history-modal')?.addEventListener('click', closeAllModals);
document.getElementById('close-guide-modal')?.addEventListener('click', closeAllModals);
document.getElementById('close-profile-modal')?.addEventListener('click', closeAllModals);

// =========================================================================
// 13. INICIALIZACIÓN DE LA APLICACIÓN (BOOTSTRAP)
// =========================================================================
async function initApp() {
  console.log('[Mercat] Inicializando Mercat Asistent...');

  // 1. Inicializar modales
  initModals();

  // 2. Cargar presupuesto inicial
  const initialBudget = getStoredBudget();
  syncBudget(initialBudget);

  // 3. Cargar carrito persistido
  loadCart();
  renderCart();

  // 4. Registrar Service Worker
  registerServiceWorker();

  // 5. Ping en segundo plano a Render con control inteligente de aviso
  let isConnected = false;

  // Solo mostramos el aviso si tras 1.5s el servidor aún no ha respondido.
  // Si la instancia de Render ya estaba despierta, responderá en ~300ms y el banner NUNCA aparecerá.
  const bannerDelayTimer = setTimeout(() => {
    if (!isConnected && backendBannerEl) {
      backendBannerEl.classList.remove('hidden');
    }
  }, 1500);

  const checkServerConnection = async () => {
    const ready = await pingBackend(5000);
    if (ready) {
      isConnected = true;
      clearTimeout(bannerDelayTimer);
      if (backendBannerEl && !backendBannerEl.classList.contains('hidden')) {
        if (backendStatusDotEl) {
          backendStatusDotEl.className = 'w-2 h-2 rounded-full bg-primary shrink-0';
        }
        if (backendStatusTextEl) {
          backendStatusTextEl.textContent = 'Servidor conectado';
        }
        setTimeout(hideBackendBanner, 1200);
      }
      return true;
    }
    return false;
  };

  // Comprobación inicial y reintentos automáticos si el backend está frío
  checkServerConnection().then((ready) => {
    if (!ready) {
      let attempts = 0;
      const retryInterval = setInterval(async () => {
        attempts++;
        const ok = await checkServerConnection();
        if (ok || attempts >= 6) {
          clearInterval(retryInterval);
          if (!ok) hideBackendBanner();
        }
      }, 4000);
    }
  });

  // 6. Arrancar la cámara del escáner
  const scannerContainer = 'interactive-scanner';
  startScanner(
    scannerContainer,
    (detectedBarcode, detectedPrice) => {
      handleBarcodeDetected(detectedBarcode, detectedPrice);
    },
    (err) => {
      console.warn('[Scanner] Aviso de cámara:', err.message);
      showToast('Cámara en modo manual. Puedes escribir el código arriba.', 'info');
    }
  );
}

// Arrancamos en cuanto el DOM esté listo
document.addEventListener('DOMContentLoaded', initApp);
