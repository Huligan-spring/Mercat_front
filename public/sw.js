/**
 * =========================================================================
 * Service Worker: Mercat Asistent PWA (Versión 2)
 * =========================================================================
 * 
 * ESTRATEGIA DIDÁCTICA Y EFICIENTE:
 * 1. Para la página principal (HTML / navegación): NETWORK FIRST con fallback a caché.
 *    Esto garantiza que si hay conexión, el usuario SIEMPRE vea la última versión desplegada.
 *    Si no hay cobertura en el supermercado, entonces carga la versión guardada en caché.
 * 2. Para archivos con hash (JS/CSS en assets): CACHE FIRST (ya que cambian de nombre en cada build).
 * 3. Para la API externa (Render): NETWORK ONLY (precios y datos en tiempo real).
 */

const CACHE_NAME = 'mercat-asistent-v2';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg'
];

// Instalación: Guardar recursos básicos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Fuerza al Service Worker nuevo a activarse sin esperar a cerrar pestañas
  self.skipWaiting();
});

// Activación: Borrar cachés viejos (v1, etc.)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Eliminando caché antiguo:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Intercepción de peticiones
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Ignorar llamadas a la API de Render
  if (url.origin.includes('onrender.com')) {
    return;
  }

  // 2. Estrategia NETWORK-FIRST para el documento principal (index.html / navegación)
  if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // 3. Estrategia CACHE-FIRST para el resto de recursos estáticos (iconos, fuentes, bundle)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      });
    })
  );
});
