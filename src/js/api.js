/**
 * =========================================================================
 * Módulo de API: Comunicación con Spring Boot (Render)
 * =========================================================================
 * 
 * Este módulo centraliza todas las llamadas HTTP a nuestro backend.
 * Utiliza la API nativa de JavaScript 'fetch', que es estándar en todos los navegadores modernos.
 */

// Obtenemos la URL base desde las variables de entorno de Vite (.env)
// Si no existe, usamos la URL por defecto en producción en Render.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://mercat-backend-6mxo.onrender.com/api/v1';

/**
 * Despierta la instancia de Render en segundo plano al abrir la aplicación.
 * El plan gratuito de Render pone en reposo el servidor tras 15 minutos sin uso.
 * Con esta llamada silenciosa conseguimos que esté listo antes de que el usuario escanee.
 * 
 * @param {number} timeoutMs Tiempo máximo de espera antes de abortar el intento
 * @returns {Promise<boolean>} Devuelve true si el backend respondió con éxito (código 200)
 */
export async function pingBackend(timeoutMs = 6000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}/products`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (response.ok) {
      return true;
    }
  } catch (error) {
    // Si la llamada fue abortada por timeout o falló por estar en frío, no emitimos error crítico
  } finally {
    clearTimeout(timeoutId);
  }
  return false;
}

/**
 * Consulta un producto por su código de barras.
 * 
 * @param {string} barcode Código EAN-13 leído por la cámara o escrito por el usuario.
 * @returns {Promise<Object|null>} Devuelve el objeto del producto ({ id, barcode, name, price })
 *                                  o 'null' si no existe (código HTTP 404).
 */
export async function getProductByBarcode(barcode) {
  try {
    const cleanBarcode = barcode.trim();
    const response = await fetch(`${API_BASE_URL}/products/by-barcode/${cleanBarcode}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    // Si el servidor responde 404 Not Found, significa que el producto aún no está en Supabase
    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Error en el servidor: Código ${response.status}`);
    }

    // Convertimos la respuesta en JSON a un objeto JavaScript
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`[API] Error al consultar el código ${barcode}:`, error);
    throw error;
  }
}

/**
 * Da de alta un nuevo producto en la base de datos (Supabase a través de Spring Boot).
 * 
 * @param {Object} productData Datos del nuevo producto
 * @param {string} productData.barcode Código de barras único
 * @param {string} productData.name Nombre descriptivo (ej: "Leche Semidesnatada 1L")
 * @param {number} productData.price Precio en euros (ej: 1.25)
 * @returns {Promise<Object>} El producto creado con su ID generado por la base de datos.
 */
export async function createProduct({ barcode, name, price }) {
  try {
    const payload = {
      barcode: barcode.trim(),
      name: name.trim(),
      price: parseFloat(price)
    };

    const response = await fetch(`${API_BASE_URL}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`No se pudo crear el producto. Código: ${response.status}`);
    }

    const createdProduct = await response.json();
    return createdProduct;
  } catch (error) {
    console.error('[API] Error al crear nuevo producto:', error);
    throw error;
  }
}

/**
 * Obtiene la lista completa de productos registrados en la base de datos.
 * Es útil para autocompletar búsquedas por nombre o alimentar la lista sin escanear.
 * 
 * @returns {Promise<Array>} Lista de productos [{ id, barcode, name, price }, ...]
 */
export async function getAllProducts() {
  try {
    const response = await fetch(`${API_BASE_URL}/products`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Error al listar productos: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[API] Error al obtener catálogo de productos:', error);
    return [];
  }
}

/**
 * Guarda la compra finalizada en el backend.
 * 
 * Estructura esperada por Spring Boot:
 * {
 *   "items": [
 *     { "productId": 3, "quantity": 2 },
 *     { "productId": 4, "quantity": 1 }
 *   ]
 * }
 * 
 * @param {Array<{productId: number, quantity: number}>} items Lista de artículos con su ID y cantidad
 * @returns {Promise<Object>} Objeto de la compra guardada (incluye fecha y total calculado)
 */
export async function savePurchase(items) {
  try {
    const payload = { items };

    const response = await fetch(`${API_BASE_URL}/purchases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Error al guardar la compra: ${response.status}`);
    }

    const purchaseResult = await response.json();
    return purchaseResult;
  } catch (error) {
    console.error('[API] Error al registrar la compra:', error);
    throw error;
  }
}
