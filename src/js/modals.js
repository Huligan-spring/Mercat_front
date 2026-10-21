/**
 * =========================================================================
 * Módulo de Paneles Desplegables (Drawers / Modales)
 * =========================================================================
 * 
 * Gestiona la apertura y cierre de las diferentes pantallas secundarias:
 * 1. Lista de la compra previa
 * 2. Historial de compras
 * 3. Guía didáctica de uso rápido
 * 4. Configuración del presupuesto
 * 5. Alta de nuevo producto (cuando un código no existe en Supabase - 404)
 */

import { formatEur } from './cart.js';

let backdropEl = null;
let currentOpenPanel = null;
let scannedModalTimer = null;

/**
 * Inicializa las referencias de los modales en el DOM.
 */
export function initModals() {
  backdropEl = document.getElementById('header-modals-backdrop');

  // Cerrar al pulsar sobre el fondo oscuro
  backdropEl?.addEventListener('click', (e) => {
    if (e.target === backdropEl) {
      closeAllModals();
    }
  });

  // Cerrar con la tecla Escape (buena práctica de accesibilidad web)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
      closeScannedProductModal();
    }
  });
}

/**
 * Abre un panel deslizándolo desde la parte inferior de la pantalla.
 * 
 * @param {HTMLElement|string} panel Elemento o ID del panel que se desea abrir
 */
export function openModal(panel) {
  const panelEl = typeof panel === 'string' ? document.getElementById(panel) : panel;
  if (!panelEl || !backdropEl) return;

  // Si ya había otro abierto, lo cerramos primero
  closeAllModals();

  // Mostramos el telón de fondo oscuro con desenfoque
  backdropEl.classList.remove('opacity-0', 'pointer-events-none');
  backdropEl.classList.add('opacity-100', 'pointer-events-auto');

  // Deslizamos el panel hacia arriba
  panelEl.classList.remove('translate-y-full');
  panelEl.classList.add('translate-y-0');

  currentOpenPanel = panelEl;
}

/**
 * Cierra todos los paneles activos y oculta el fondo.
 */
export function closeAllModals() {
  if (!backdropEl) return;

  // Ocultamos el telón
  backdropEl.classList.add('opacity-0', 'pointer-events-none');
  backdropEl.classList.remove('opacity-100', 'pointer-events-auto');

  // Devolvemos todos los paneles a su posición oculta bajo la pantalla
  const allPanels = document.querySelectorAll('[data-drawer-panel]');
  allPanels.forEach(p => {
    p.classList.add('translate-y-full');
    p.classList.remove('translate-y-0');
  });

  currentOpenPanel = null;
}

/**
 * Muestra una notificación emergente ("Toast") temporal en la parte superior.
 * 
 * @param {string} message Texto del aviso
 * @param {string} iconName Nombre del icono de Material Symbols (ej: 'check_circle', 'error')
 */
let toastTimer = null;
export function showToast(message, iconName = 'check_circle') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  const toastIcon = document.getElementById('toast-icon');

  if (!toast || !toastMsg || !toastIcon) return;

  toastMsg.textContent = message;
  toastIcon.textContent = iconName;

  clearTimeout(toastTimer);
  toast.classList.remove('opacity-0', 'pointer-events-none', '-translate-y-2.5');
  toast.classList.add('opacity-100', 'translate-y-0');

  toastTimer = setTimeout(() => {
    toast.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2.5');
    toast.classList.remove('opacity-100', 'translate-y-0');
  }, 2600);
}

/**
 * Muestra la ventana emergente centrada cuando un producto es reconocido y añadido con éxito.
 * Muestra el nombre, precio en grande, icono de confirmación y temporizador visual.
 * 
 * @param {Object} product Objeto con datos del producto ({ name, price, ... })
 * @param {Function} onClose Callback que se ejecuta cuando se cierra la ventana (reanuda la cámara)
 */
export function showScannedProductModal(product, onClose) {
  const modal = document.getElementById('product-scanned-modal');
  const card = document.getElementById('product-scanned-card');
  const nameEl = document.getElementById('product-scanned-name');
  const priceEl = document.getElementById('product-scanned-price');
  const progressEl = document.getElementById('product-scanned-progress');

  if (!modal || !nameEl || !priceEl) return;

  nameEl.textContent = product.name || 'Producto';
  priceEl.textContent = formatEur(product.price);

  // Reiniciar barra de progreso temporal
  if (progressEl) {
    progressEl.style.transition = 'none';
    progressEl.style.width = '100%';
    void progressEl.offsetWidth; // Forzar reflow en el navegador
    progressEl.style.transition = 'width 1800ms linear';
    progressEl.style.width = '0%';
  }

  // Mostrar modal y animar tarjeta al centro
  clearTimeout(scannedModalTimer);
  modal.classList.remove('opacity-0', 'pointer-events-none');
  modal.classList.add('opacity-100', 'pointer-events-auto');
  if (card) {
    card.classList.remove('scale-90');
    card.classList.add('scale-100');
  }

  let isClosed = false;
  const dismissModal = () => {
    if (isClosed) return;
    isClosed = true;
    clearTimeout(scannedModalTimer);
    modal.classList.add('opacity-0', 'pointer-events-none');
    modal.classList.remove('opacity-100', 'pointer-events-auto');
    if (card) {
      card.classList.add('scale-90');
      card.classList.remove('scale-100');
    }
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  // Cierre inmediato al tocar la pantalla
  modal.onclick = dismissModal;

  // Auto-cierre tras 1.8 segundos
  scannedModalTimer = setTimeout(dismissModal, 1800);
}

/**
 * Cierra inmediatamente la ventana de producto reconocido si estuviera abierta.
 */
export function closeScannedProductModal() {
  const modal = document.getElementById('product-scanned-modal');
  const card = document.getElementById('product-scanned-card');
  clearTimeout(scannedModalTimer);
  if (modal) {
    modal.classList.add('opacity-0', 'pointer-events-none');
    modal.classList.remove('opacity-100', 'pointer-events-auto');
  }
  if (card) {
    card.classList.add('scale-90');
    card.classList.remove('scale-100');
  }
}
