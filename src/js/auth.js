/**
 * =========================================================================
 * Módulo de Autenticación y Control de Sesión JWT (Mercat v2.0)
 * =========================================================================
 * 
 * Gestiona el token JWT emitido por Spring Boot y la información del usuario autenticado.
 * Proporciona un cliente HTTP seguro ('secureFetch') que inyecta automáticamente
 * la cabecera 'Authorization: Bearer <token>' en las peticiones a la API.
 */

const TOKEN_KEY = 'mercat_jwt_token';
const USER_KEY = 'mercat_user_data';

/**
 * Obtiene el token JWT almacenado en el dispositivo.
 * 
 * @returns {string|null} Token JWT o null si no hay sesión activa.
 */
export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Obtiene los datos del usuario actual almacenados en memoria local.
 * 
 * @returns {{ email: string, role: string }|null} Objeto con email y rol o null.
 */
export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch (e) {
    return null;
  }
}

/**
 * Comprueba si existe una sesión activa válida.
 * 
 * @returns {boolean} True si el usuario tiene un token JWT guardado.
 */
export function isAuthenticated() {
  return !!getAuthToken();
}

/**
 * Comprueba si el usuario autenticado tiene rol de Administrador.
 * 
 * @returns {boolean} True si el rol es 'ROLE_ADMIN'.
 */
export function isAdmin() {
  const user = getCurrentUser();
  return user && user.role === 'ROLE_ADMIN';
}

/**
 * Guarda los datos de la sesión recibidos desde el backend tras Login o Registro.
 * 
 * @param {{ token: string, email: string, role: string }} data Respuesta del backend.
 */
export function setSession(data) {
  if (!data || !data.token) return;
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify({
    email: data.email,
    role: data.role || 'ROLE_USER'
  }));
  window.dispatchEvent(new CustomEvent('mercat:auth-changed', { detail: data }));
}

/**
 * Cierra la sesión activa eliminando el token y datos del usuario de localStorage.
 * No borra la cesta actual de la compra para no perjudicar la experiencia del usuario.
 */
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new CustomEvent('mercat:auth-changed', { detail: null }));
}

/**
 * Reemplazo inteligente de fetch() nativo.
 * Inyecta automáticamente la cabecera 'Authorization: Bearer <token>' si el usuario está autenticado.
 * Si el servidor responde con 401 Unauthorized (token expirado), limpia la sesión y notifica.
 * 
 * @param {string} url Endpoint a consultar
 * @param {RequestInit} options Opciones estándar de fetch
 * @returns {Promise<Response>} Respuesta de la petición HTTP
 */
export async function secureFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getAuthToken();

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

  // Si el servidor rechaza el token por estar caducado o ser inválido
  if (response.status === 401 && token) {
    console.warn('[Auth] Token JWT expirado o rechazado por el servidor. Limpiando sesión...');
    clearSession();
    window.dispatchEvent(new CustomEvent('mercat:session-expired'));
  }

  return response;
}
