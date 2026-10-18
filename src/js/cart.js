/**
 * =========================================================================
 * Módulo de Cesta de la Compra (Gestión de Estado y Cálculos)
 * =========================================================================
 * 
 * Este módulo maneja:
 * 1. La lista de productos en el carrito actual.
 * 2. El incremento y decremento de unidades.
 * 3. El cálculo de subtotales por producto y el total global.
 * 4. La persistencia en 'localStorage' para no perder la compra si se recarga la PWA.
 */

const STORAGE_KEY = 'mercat_active_cart';

// Array en memoria que contendrá los productos de la cesta activa
let cart = [];

/**
 * Convierte un número decimal al formato de moneda europeo (ej: 3.50 -> "3,50 €").
 * 
 * @param {number} amount Importe numérico
 * @returns {string} Texto formateado
 */
export function formatEur(amount) {
  const safeNumber = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return safeNumber.toFixed(2).replace('.', ',') + ' €';
}

/**
 * Carga el carrito guardado en el navegador (si existe).
 */
export function loadCart() {
  try {
    const rawData = localStorage.getItem(STORAGE_KEY);
    if (rawData) {
      cart = JSON.parse(rawData);
    } else {
      cart = [];
    }
  } catch (e) {
    console.warn('[Cart] Error al leer la cesta de localStorage, reiniciando:', e);
    cart = [];
  }
  return [...cart];
}

/**
 * Guarda el estado actual del carrito en el almacenamiento local del teléfono.
 */
function persistCart() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch (e) {
    console.error('[Cart] Error al guardar en localStorage:', e);
  }
}

/**
 * Devuelve una copia de los productos actuales en la cesta.
 */
export function getCartItems() {
  return [...cart];
}

/**
 * Añade un producto a la cesta.
 * Si el producto ya estaba en el carrito, simplemente incrementa su cantidad en +1.
 * Si es nuevo, lo inserta al principio con cantidad = 1.
 * 
 * @param {Object} product Objeto con { id, barcode, name, price }
 * @returns {Object} El artículo resultante en la cesta
 */
export function addProductToCart(product) {
  // Buscamos si ya existe por su ID o por su código de barras
  const existingIndex = cart.findIndex(item => 
    (product.id && item.id === product.id) || 
    (product.barcode && item.barcode === product.barcode)
  );

  if (existingIndex >= 0) {
    cart[existingIndex].quantity += 1;
    persistCart();
    return cart[existingIndex];
  } else {
    const newItem = {
      id: product.id,
      barcode: product.barcode,
      name: product.name,
      price: parseFloat(product.price) || 0,
      quantity: 1
    };
    cart.unshift(newItem); // Lo colocamos al principio de la lista
    persistCart();
    return newItem;
  }
}

/**
 * Incrementa en 1 unidad la cantidad de un producto.
 */
export function incrementQuantity(productId) {
  const item = cart.find(i => i.id === productId);
  if (item) {
    item.quantity += 1;
    persistCart();
  }
  return item;
}

/**
 * Reduce en 1 unidad la cantidad de un producto.
 * Si llega a 0, se elimina automáticamente del carrito.
 */
export function decrementQuantity(productId) {
  const index = cart.findIndex(i => i.id === productId);
  if (index >= 0) {
    if (cart[index].quantity > 1) {
      cart[index].quantity -= 1;
      persistCart();
      return { item: cart[index], removed: false };
    } else {
      const removed = cart.splice(index, 1)[0];
      persistCart();
      return { item: removed, removed: true };
    }
  }
  return null;
}

/**
 * Elimina directamente un producto de la cesta sin importar su cantidad.
 */
export function removeProduct(productId) {
  const index = cart.findIndex(i => i.id === productId);
  if (index >= 0) {
    const removedItem = cart.splice(index, 1)[0];
    persistCart();
    return removedItem;
  }
  return null;
}

/**
 * Vacía por completo la cesta (al completar una compra).
 */
export function clearCart() {
  cart = [];
  persistCart();
}

/**
 * Calcula el importe total sumando (precio * cantidad) de cada producto.
 * 
 * @returns {number} Suma total en euros
 */
export function calculateTotal() {
  return cart.reduce((total, item) => {
    return total + (item.price * item.quantity);
  }, 0);
}
