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

let backdropEl = null;
let currentOpenPanel = null;

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
