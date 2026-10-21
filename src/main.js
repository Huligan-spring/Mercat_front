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
import { pingBackend, getProductByBarcode, createProduct, savePurchase, searchSuggestions } from './js/api.js';
import { startScanner, stopScanner, pauseScanner, resumeScanner, toggleTorch, isScannerRunning, isCameraPaused, resetLastScannedCode } from './js/scanner.js';
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
const searchSuggestionsEl = document.getElementById('search-suggestions');

// Botón de Guardar Compra y Modal de Confirmación
const savePurchaseBtn = document.getElementById('save-purchase-btn');
const saveBtnIconEl = document.getElementById('save-btn-icon');
const saveBtnTextEl = document.getElementById('save-btn-text');
const closeConfirmModalBtn = document.getElementById('close-confirm-modal');
const confirmItemsCountEl = document.getElementById('confirm-purchase-items-count');
const confirmTotalEl = document.getElementById('confirm-purchase-total');
const btnDoSavePurchase = document.getElementById('btn-do-save-purchase');
const btnCancelSavePurchase = document.getElementById('btn-cancel-save-purchase');

// Sub-elementos del overlay de cámara (reposo y apagado)
const camPausedIconEl = document.getElementById('camera-paused-icon');
const camPausedTitleEl = document.getElementById('camera-paused-title');
const camPausedSubtitleEl = document.getElementById('camera-paused-subtitle');

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
  if (typeof resetInactivityTimer === 'function') resetInactivityTimer();

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
// 7. EVENTOS DE BÚSQUEDA MANUAL PREDICTIVA (POR NOMBRE O CÓDIGO)
// =========================================================================
let searchDebounceTimer = null;

/**
 * Oculta y vacía el contenedor flotante de sugerencias.
 */
function hideSearchSuggestions() {
  if (searchSuggestionsEl) {
    searchSuggestionsEl.classList.add('hidden');
    searchSuggestionsEl.innerHTML = '';
  }
}

/**
 * Renderiza la lista flotante de sugerencias predictivas.
 * 
 * @param {Array<Object>} suggestions Lista de productos devuelta por la API
 */
function renderSearchSuggestions(suggestions) {
  if (!searchSuggestionsEl) return;

  if (!suggestions || suggestions.length === 0) {
    searchSuggestionsEl.innerHTML = `
      <li class="px-4 py-3 text-center text-on-surface-variant text-[13px] flex items-center justify-center gap-2 select-none">
        <span class="material-symbols-outlined text-[18px]">inventory_2</span>
        <span>Producto no catalogado</span>
      </li>
    `;
    searchSuggestionsEl.classList.remove('hidden');
    return;
  }

  searchSuggestionsEl.innerHTML = suggestions.map(item => `
    <li class="suggestion-item px-4 py-2.5 flex items-center justify-between hover:bg-surface-container cursor-pointer transition-colors active:bg-surface-container-high"
        data-barcode="${item.barcode}">
      <div class="flex flex-col min-w-0 pr-3">
        <span class="font-bold text-on-surface text-[14px] leading-tight truncate">${item.name}</span>
        <span class="text-[11px] text-on-surface-variant flex items-center gap-1 mt-0.5 font-mono">
          <span class="material-symbols-outlined text-[13px]">barcode</span>
          ${item.barcode}
        </span>
      </div>
      <span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[13px] font-bold shrink-0">
        ${formatEur(item.price)}
      </span>
    </li>
  `).join('');

  searchSuggestionsEl.classList.remove('hidden');
}

// 1. Entrada de texto en vivo (Live Search con Debounce)
searchInputEl?.addEventListener('input', () => {
  const val = searchInputEl.value.trim();
  clearSearchBtnEl.classList.toggle('hidden', val.length === 0);

  // A. Si detecta exactamente 13 números continuos (código EAN-13), procesarlo de inmediato
  if (/^\d{13}$/.test(val)) {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    hideSearchSuggestions();
    const barcodeToProcess = val;
    searchInputEl.value = '';
    clearSearchBtnEl.classList.add('hidden');
    handleBarcodeDetected(barcodeToProcess);
    return;
  }

  // B. Si hay menos de 2 caracteres, no consultar el backend y ocultar el menú
  if (val.length < 2) {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    hideSearchSuggestions();
    return;
  }

  // C. Debounce de 250ms para evitar saturar el servidor en cada pulsación
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(async () => {
    try {
      const suggestions = await searchSuggestions(val);
      // Verificar que el input continúe teniendo el mismo valor al llegar la respuesta
      if (searchInputEl.value.trim() === val) {
        renderSearchSuggestions(suggestions);
      }
    } catch (err) {
      console.warn('[Search] Error consultando sugerencias:', err);
    }
  }, 250);
});

// 2. Selección con un clic sobre un producto sugerido
searchSuggestionsEl?.addEventListener('click', (e) => {
  const li = e.target.closest('.suggestion-item');
  if (li && li.dataset.barcode) {
    const barcode = li.dataset.barcode;
    hideSearchSuggestions();
    searchInputEl.value = '';
    clearSearchBtnEl.classList.add('hidden');
    handleBarcodeDetected(barcode);
  }
});

// 3. Envío del formulario (Enter o botón Buscar)
searchFormEl?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = searchInputEl.value.trim();
  if (!query) return;

  hideSearchSuggestions();

  // Si son dígitos continuos (ej: EAN-13 o EAN-8), procesar directamente como código
  if (/^\d{6,14}$/.test(query)) {
    await handleBarcodeDetected(query);
    searchInputEl.value = '';
    clearSearchBtnEl.classList.add('hidden');
  } else {
    // Si es texto, consultamos el backend y tomamos la primera coincidencia
    const suggestions = await searchSuggestions(query);
    if (suggestions && suggestions.length > 0) {
      const bestMatch = suggestions[0];
      searchInputEl.value = '';
      clearSearchBtnEl.classList.add('hidden');
      await handleBarcodeDetected(bestMatch.barcode);
    } else {
      showToast(`No se encontró "${query}" en el catálogo`, 'search_off');
    }
  }
});

// 4. Botón de limpiar campo de búsqueda
clearSearchBtnEl?.addEventListener('click', () => {
  searchInputEl.value = '';
  clearSearchBtnEl.classList.add('hidden');
  hideSearchSuggestions();
  searchInputEl.focus();
});

// 5. Cierre automático del menú al pulsar fuera de él
document.addEventListener('click', (e) => {
  if (searchSuggestionsEl && !searchSuggestionsEl.contains(e.target) && !searchInputEl?.contains(e.target)) {
    hideSearchSuggestions();
  }
});

// =========================================================================
// 8. EVENTOS: GUARDAR COMPRA (CON MODAL DE CONFIRMACIÓN Y PREVENCIÓN DE ACCIDENTES)
// =========================================================================

// Paso 1: Pulsar el botón inferior "Guardar compra" -> Abre el modal de confirmación
savePurchaseBtn?.addEventListener('click', () => {
  const items = getCartItems();

  if (items.length === 0) {
    showToast('Tu cesta está vacía. Escanea productos primero.', 'shopping_cart');
    return;
  }

  // Actualizar datos del modal con el resumen en tiempo real
  const totalUnits = items.reduce((acc, i) => acc + i.quantity, 0);
  const totalAmount = calculateTotal();

  if (confirmItemsCountEl) {
    confirmItemsCountEl.textContent = `${items.length} ${items.length === 1 ? 'producto' : 'productos'} (${totalUnits} uds)`;
  }
  if (confirmTotalEl) {
    confirmTotalEl.textContent = formatEur(totalAmount);
  }

  // Abrir modal de confirmación seguro
  openModal('panel-confirm-purchase');
});

// Paso 2: Botones para cancelar o cerrar el modal de confirmación sin tocar la cesta
closeConfirmModalBtn?.addEventListener('click', closeAllModals);
btnCancelSavePurchase?.addEventListener('click', closeAllModals);

// Paso 3: Confirmación consciente del usuario -> Ejecutar guardado en backend y Supabase
btnDoSavePurchase?.addEventListener('click', async () => {
  const items = getCartItems();
  if (items.length === 0) {
    closeAllModals();
    return;
  }

  closeAllModals();

  savePurchaseBtn.disabled = true;
  btnDoSavePurchase.disabled = true;
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

    // Vaciar el carrito tras confirmación
    clearCart();
    renderCart();

    saveBtnIconEl.classList.remove('animate-spin');
    saveBtnIconEl.textContent = 'task_alt';
    saveBtnTextEl.textContent = '¡Compra guardada!';

    showToast('¡Compra registrada con éxito en Supabase!', 'task_alt');

    setTimeout(() => {
      savePurchaseBtn.disabled = false;
      btnDoSavePurchase.disabled = false;
      saveBtnIconEl.textContent = 'check_circle';
      saveBtnTextEl.textContent = 'Guardar compra';
    }, 2000);
  } catch (error) {
    showToast(`Error al guardar la compra: ${error.message}`, 'error');
    savePurchaseBtn.disabled = false;
    btnDoSavePurchase.disabled = false;
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
function resetCameraOverlayToOff() {
  if (camPausedIconEl) camPausedIconEl.textContent = 'videocam_off';
  if (camPausedTitleEl) camPausedTitleEl.textContent = 'Cámara apagada';
  if (camPausedSubtitleEl) camPausedSubtitleEl.classList.add('hidden');
}

btnToggleCamera?.addEventListener('click', async () => {
  if (isScannerRunning()) {
    // Detiene por completo la cámara y libera el hardware para que otras apps (ej. lector nativo) puedan usarla
    await stopScanner();
    if (inactivityTimer) clearTimeout(inactivityTimer);
    isScannerInSleepMode = false;
    resetCameraOverlayToOff();

    camIconEl.textContent = 'videocam_off';
    camIconEl.className = 'material-symbols-outlined text-[18px] text-on-surface-variant';
    camTextEl.textContent = 'Off';
    camDotEl.className = 'w-2 h-2 rounded-full bg-outline-variant';
    camOverlayEl.classList.remove('opacity-0', 'pointer-events-none');
    camOverlayEl.classList.add('opacity-100', 'pointer-events-auto');
    if (laserBeamEl) laserBeamEl.style.display = 'none';

    // Apagar linterna si estaba activa
    if (torchIconEl && torchTextEl && torchDotEl) {
      torchIconEl.textContent = 'flashlight_off';
      torchIconEl.className = 'material-symbols-outlined text-[18px] text-on-surface-variant';
      torchTextEl.textContent = 'Off';
      torchDotEl.className = 'w-2 h-2 rounded-full bg-outline-variant';
      if (torchAmbientEl) torchAmbientEl.classList.add('opacity-0');
    }

    showToast('Cámara apagada y liberada', 'videocam_off');
  } else {
    // Inicia la cámara y el visor de escaneo
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
      resetCameraOverlayToOff();
      camIconEl.textContent = 'videocam';
      camIconEl.className = 'material-symbols-outlined text-[18px] text-primary';
      camTextEl.textContent = 'On';
      camDotEl.className = 'w-2 h-2 rounded-full bg-primary animate-pulse';
      camOverlayEl.classList.add('opacity-0', 'pointer-events-none');
      camOverlayEl.classList.remove('opacity-100', 'pointer-events-auto');
      if (laserBeamEl) laserBeamEl.style.display = 'flex';
      resetInactivityTimer();
      showToast('Cámara activada (On)', 'videocam');
    }
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
// 12. GESTIÓN EFICIENTE DE BATERÍA (SUSPENSIÓN EN SEGUNDO PLANO E INACTIVIDAD)
// =========================================================================
let wasScannerActiveBeforeHide = false;
let inactivityTimer = null;
let isScannerInSleepMode = false;
const INACTIVITY_TIMEOUT_MS = 120000; // 2 minutos sin actividad

/**
 * Pone la cámara en modo reposo para ahorrar batería tras inactividad prolongada.
 */
function enterCameraSleepMode() {
  if (isScannerRunning() && !isCameraPaused()) {
    isScannerInSleepMode = true;
    pauseScanner();

    if (camPausedIconEl) camPausedIconEl.textContent = 'bedtime';
    if (camPausedTitleEl) camPausedTitleEl.textContent = 'Cámara en reposo';
    if (camPausedSubtitleEl) {
      camPausedSubtitleEl.textContent = 'Ahorro de batería • Toca para reactivar';
      camPausedSubtitleEl.classList.remove('hidden');
    }
    camOverlayEl.classList.remove('opacity-0', 'pointer-events-none');
    camOverlayEl.classList.add('opacity-100', 'pointer-events-auto');

    if (camIconEl) {
      camIconEl.textContent = 'bedtime';
      camIconEl.className = 'material-symbols-outlined text-[18px] text-amber-500';
    }
    if (camTextEl) camTextEl.textContent = 'Reposo';
    if (camDotEl) camDotEl.className = 'w-2 h-2 rounded-full bg-amber-400';
    if (laserBeamEl) laserBeamEl.style.display = 'none';

    showToast('Cámara en reposo para ahorrar batería', 'bedtime');
  }
}

/**
 * Despierta la cámara del modo reposo de batería.
 */
function wakeUpCameraFromSleep() {
  if (!isScannerInSleepMode) return;
  isScannerInSleepMode = false;
  resumeScanner();

  resetCameraOverlayToOff();
  camOverlayEl.classList.add('opacity-0', 'pointer-events-none');
  camOverlayEl.classList.remove('opacity-100', 'pointer-events-auto');

  if (camIconEl) {
    camIconEl.textContent = 'videocam';
    camIconEl.className = 'material-symbols-outlined text-[18px] text-primary';
  }
  if (camTextEl) camTextEl.textContent = 'On';
  if (camDotEl) camDotEl.className = 'w-2 h-2 rounded-full bg-primary animate-pulse';
  if (laserBeamEl) laserBeamEl.style.display = 'flex';

  resetInactivityTimer();
  showToast('Cámara reactivada', 'videocam');
}

/**
 * Reinicia el temporizador de inactividad ante cualquier toque o escaneo.
 */
function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  if (isScannerRunning() && !isCameraPaused()) {
    inactivityTimer = setTimeout(enterCameraSleepMode, INACTIVITY_TIMEOUT_MS);
  }
}

// Reactivar la cámara si el usuario toca la capa oscura de reposo
camOverlayEl?.addEventListener('click', () => {
  if (isScannerInSleepMode) {
    wakeUpCameraFromSleep();
  }
});

// Registrar interacciones en la app para reiniciar el tiempo de reposo
['click', 'touchstart', 'scroll'].forEach(evt => {
  window.addEventListener(evt, () => {
    if (isScannerInSleepMode) {
      wakeUpCameraFromSleep();
    } else {
      resetInactivityTimer();
    }
  }, { passive: true });
});

// Page Visibility API: apagar inmediatamente la cámara si la pantalla se bloquea o la app pasa a segundo plano
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Si la pantalla se apagó o el usuario cambió de app -> pausar cámara inmediatamente
    if (isScannerRunning() && !isCameraPaused()) {
      wasScannerActiveBeforeHide = true;
      pauseScanner();
    }
    if (inactivityTimer) clearTimeout(inactivityTimer);
  } else {
    // Si el usuario regresa a la app y la cámara estaba activa -> reanudar
    if (wasScannerActiveBeforeHide) {
      wasScannerActiveBeforeHide = false;
      resumeScanner();
    }
    resetInactivityTimer();
  }
});

// =========================================================================
// 13. APERTURA DE MODALES DESDE EL HEADER
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
  ).then((ok) => {
    if (ok) {
      resetInactivityTimer();
    }
  });
}

// Arrancamos en cuanto el DOM esté listo
document.addEventListener('DOMContentLoaded', initApp);
