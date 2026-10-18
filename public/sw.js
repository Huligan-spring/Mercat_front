/**
 * =========================================================================
 * Service Worker: Mercat Asistent PWA
 * =========================================================================
 * 
 * ¿QUÉ HACE ESTE ARCHIVO?
 * Un Service Worker es un script en segundo plano que actúa como un "servidor proxy"
 * entre el navegador del usuario y la red. Permite que la aplicación funcione
 * incluso si en el supermercado no hay cobertura de datos (modo offline).
 * 
 * ESTRATEGIA:
 * 1. Para archivos estáticos (HTML, JS, CSS, iconos): Cache First (Caché primero).
 * 2. Para llamadas a la API REST (Spring Boot): Network First (Red primero),
 *    porque los precios y productos deben ser siempre los más recientes.
 */

const CACHE_NAME = 'mercat-asistent-v1';

// Recursos esenciales que se guardan en el caché durante la instalación
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg'
];

// Evento 'install': Se ejecuta cuando el Service Worker se registra por primera vez
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Guardamos los recursos iniciales
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Fuerza al Service Worker a activarse inmediatamente
  self.skipWaiting();
});

// Evento 'activate': Limpia cachés antiguos si hemos actualizado la versión
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Evento 'fetch': Intercepta las solicitudes que hace la aplicación
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Si la petición es a nuestra API externa (Render), no la cacheamos por defecto
  // para tener siempre el stock y precios reales
  if (url.origin.includes('onrender.com')) {
    return;
  }

  // Para el resto de peticiones (interfaz gráfica), usamos estrategia de caché con fallback a red
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Si la respuesta es válida, la guardamos dinámicamente en el caché
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    }).catch(() => {
      // Si falla la red y no está en caché, devolvemos index.html como fallback
      if (event.request.headers.get('accept')?.includes('text/html')) {
        return caches.match('./index.html');
      }
    })
  );
});
