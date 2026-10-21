const CACHE_NAME = 'social-water-v1';
const ASSETS_TO_CACHE = [
    '/css/estilo.css',
    '/geojson/comunidades.json',
    '/geojson/ecuador.geojson',
    '/geojson/capitales.geojson',
    '/geojson/rios_corregidos.geojson',
    '/js/leaflet/leaflet.css',
    '/js/leaflet/leaflet.js'
];

// Instala el Service Worker y precacha los archivos core locales
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Limpia cachés antiguas en caso de actualización de software
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

// Intercepta peticiones de red (La magia del mapa offline de Esri)
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Estrategia de caché para las imágenes de mapas (Esri, etc.)
    if (url.includes('arcgisonline.com') || url.includes('.png') || url.includes('.jpg')) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((cachedResponse) => {
                    // Si el tile satelital ya existe en caché, lo sirve al instante sin internet
                    if (cachedResponse) return cachedResponse;

                    // Si no existe, lo descarga de internet, lo guarda en caché y lo muestra
                    return fetch(event.request).then((networkResponse) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    }).catch(() => {
                        // Devuelve un cuadro vacío si falla internet y no está en caché
                        return new Response('');
                    });
                });
            })
        );
    } else {
        // Estrategia por defecto para archivos locales del código: primero caché, si falla, red
        event.respondWith(
            caches.match(event.request).then((response) => {
                return response || fetch(event.request);
            })
        );
    }
});
