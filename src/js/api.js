/**
 * =========================================================================
 * Módulo de API: Comunicación con Spring Boot (Render) y Supabase
 * =========================================================================
 * 
 * Centraliza las llamadas HTTP al backend de Spring Boot.
 * Utiliza 'secureFetch' del módulo auth.js para transmitir de forma transparente
 * el token JWT del usuario si está autenticado, permitiendo el modelo híbrido:
 * - Si hay sesión: el servidor resuelve preferencias y compras del usuario.
 * - Si no hay sesión (invitado): el servidor opera con el catálogo maestro global.
 */

import { secureFetch, isAdmin } from './auth.js';

// Obtenemos la URL base desde las variables de entorno de Vite (.env)
// Si no existe, usamos la URL por defecto en producción en Render.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://mercat-backend-6mxo.onrender.com/api/v1';

// =========================================================================
// 1. AUTENTICACIÓN (LOGIN Y REGISTRO) Y RESILENCIA ANTE ARRANQUE EN FRÍO
// =========================================================================

/**
 * Wrapper de red resiliente diseñado para el arranque en frío (Cold Start) de Render.
 * En el plan gratuito de Render, el servidor se suspende tras 15 minutos sin uso.
 * Si el primer intento falla por socket timeout o 'Failed to fetch', realiza un segundo
 * intento automático tras 1,5 segundos, ya que para entonces el servidor habrá levantado.
 * 
 * @param {string} url URL del endpoint
 * @param {RequestInit} options Opciones de fetch (método, cabeceras, body)
 * @param {Function|null} onNotice Callback para notificar cambios de estado en la UI
 * @returns {Promise<Response>}
 */
async function fetchWithColdStartRetry(url, options, onNotice = null) {
  try {
    return await fetch(url, options);
  } catch (firstError) {
    const isNetworkError = firstError.name === 'TypeError' ||
      (firstError.message && (firstError.message.includes('fetch') || firstError.message.includes('network')));

    if (!isNetworkError) {
      throw firstError;
    }

    console.warn('[API] Primer intento falló por suspensión del servidor en Render. Reintentando...');
    if (typeof onNotice === 'function') {
      onNotice('El servidor estaba en reposo. Conectando de nuevo...');
    }

    // Pausa breve de 1.5s antes de reintentar
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
      return await fetch(url, options);
    } catch (secondError) {
      throw new Error('El servidor en la nube estaba suspendido por inactividad y tardó en responder. Ya se ha reactivado; por favor, vuelve a pulsar para continuar.');
    }
  }
}

/**
 * Inicia sesión con correo electrónico y contraseña.
 * 
 * @param {string} email Correo electrónico
 * @param {string} password Contraseña en texto plano
 * @param {Function|null} onNotice Callback para avisos de progreso (opcional)
 * @returns {Promise<{ token: string, email: string, role: string }>}
 */
export async function loginUser(email, password, onNotice = null) {
  try {
    const response = await fetchWithColdStartRetry(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ email: email.trim(), password })
    }, onNotice);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Credenciales incorrectas');
    }

    return await response.json();
  } catch (error) {
    console.error('[API] Error al iniciar sesión:', error);
    throw error;
  }
}

/**
 * Registra un nuevo usuario en el sistema.
 * 
 * @param {string} email Correo electrónico único
 * @param {string} password Contraseña deseada (mínimo 6 caracteres)
 * @param {Function|null} onNotice Callback para avisos de progreso (opcional)
 * @returns {Promise<{ token: string, email: string, role: string }>}
 */
export async function registerUser(email, password, onNotice = null) {
  try {
    const response = await fetchWithColdStartRetry(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ email: email.trim(), password })
    }, onNotice);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'No se pudo crear la cuenta');
    }

    return await response.json();
  } catch (error) {
    console.error('[API] Error al registrar usuario:', error);
    throw error;
  }
}

// =========================================================================
// 2. SALUD Y COMPROBACIÓN DEL SERVIDOR
// =========================================================================

/**
 * Despierta la instancia de Render en segundo plano al abrir la aplicación.
 * El plan gratuito de Render pone en reposo el servidor tras 15 minutos sin uso.
 * Con esta llamada silenciosa a un endpoint público y ligero conseguimos que esté listo antes de que el usuario escanee.
 * 
 * @param {number} timeoutMs Tiempo máximo de espera antes de abortar el intento
 * @returns {Promise<boolean>} Devuelve true si el backend respondió con éxito (código 200)
 */
export async function pingBackend(timeoutMs = 6000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Usamos el endpoint público de búsqueda que retorna 200 OK sin requerir token JWT
    const response = await fetch(`${API_BASE_URL}/products/search?q=ping`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (response.ok || response.status === 200) {
      return true;
    }
  } catch (error) {
    // Si la llamada fue abortada por timeout o falló por estar en frío, no emitimos error crítico
  } finally {
    clearTimeout(timeoutId);
  }
  return false;
}

// =========================================================================
// 3. PRODUCTOS Y CATÁLOGO HÍBRIDO
// =========================================================================

/**
 * Consulta un producto por su código de barras.
 * Si el usuario tiene sesión activa, el backend prioriza su versión personalizada.
 * Si no existe o está en modo invitado, retorna el producto maestro global.
 * 
 * @param {string} barcode Código EAN-13 leído por la cámara o escrito por el usuario.
 * @returns {Promise<Object|null>} Devuelve el objeto del producto ({ id, barcode, name, price })
 *                                  o 'null' si no existe (código HTTP 404).
 */
export async function getProductByBarcode(barcode) {
  try {
    const cleanBarcode = barcode.trim();
    const response = await secureFetch(`${API_BASE_URL}/products/by-barcode/${cleanBarcode}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Error en el servidor: Código ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`[API] Error al consultar el código ${barcode}:`, error);
    throw error;
  }
}

/**
 * Consulta sugerencias de productos predictivas por texto o código en el backend.
 * Con token: combina catálogo personal y global sin duplicar.
 * Sin token: busca solo en el catálogo global maestro.
 * 
 * @param {string} query Término de búsqueda (ej: "nuez", "pan", "8480")
 * @returns {Promise<Array>} Lista de hasta 6 productos [{ id, barcode, name, price }, ...]
 */
export async function searchSuggestions(query) {
  if (!query || query.trim().length < 2) {
    return [];
  }
  try {
    const cleanQuery = encodeURIComponent(query.trim());
    const response = await secureFetch(`${API_BASE_URL}/products/search?q=${cleanQuery}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return [];
    }

    return await response.json();
  } catch (error) {
    console.warn('[API] Error al buscar sugerencias:', error);
    return [];
  }
}

/**
 * Da de alta un nuevo producto en la base de datos (Supabase a través de Spring Boot).
 * - Si es ROLE_ADMIN: se crea como producto global maestro si makeGlobal es true.
 * - Si es ROLE_USER: se crea automáticamente como producto personal vinculado a su user_id.
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
      price: parseFloat(price),
      makeGlobal: isAdmin() // Los administradores crean maestros; usuarios estándar crean personales
    };

    const response = await secureFetch(`${API_BASE_URL}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `No se pudo crear el producto. Código: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[API] Error al crear nuevo producto:', error);
    throw error;
  }
}

/**
 * Obtiene la lista completa de productos registrados en la base de datos.
 * 
 * @returns {Promise<Array>} Lista de productos [{ id, barcode, name, price }, ...]
 */
export async function getAllProducts() {
  try {
    const response = await secureFetch(`${API_BASE_URL}/products`, {
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

// =========================================================================
// 4. COMPRAS Y TICKETS (MULTIUSUARIO)
// =========================================================================

/**
 * Guarda la compra finalizada en el backend asociada al usuario autenticado.
 * 
 * @param {Array<{productId: number, quantity: number}>} items Lista de artículos con su ID y cantidad
 * @returns {Promise<Object>} Objeto de la compra guardada (incluye fecha y total calculado)
 */
export async function savePurchase(items) {
  try {
    const payload = { items };

    const response = await secureFetch(`${API_BASE_URL}/purchases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err || `Error al guardar la compra: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[API] Error al registrar la compra:', error);
    throw error;
  }
}

/**
 * Obtiene el historial de compras remoto del usuario autenticado desde Supabase.
 * 
 * @returns {Promise<Array>} Lista de compras del usuario [{ id, purchasedAt, total, items: [...] }]
 */
export async function getMyPurchases() {
  try {
    const response = await secureFetch(`${API_BASE_URL}/purchases`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      return [];
    }

    return await response.json();
  } catch (error) {
    console.warn('[API] Error al obtener compras remotas:', error);
    return [];
  }
}
