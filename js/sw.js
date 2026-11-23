const CACHE_NAME = 'social-water-v2';
const ASSETS_TO_CACHE = [
    '../css/estilo.css',
    '../geojson/comunidades.json',
    '../geojson/ecuador.geojson',
    '../geojson/capitales.geojson',
    '../geojson/rios_corregidos.geojson',
    './leaflet/leaflet.css',
    './leaflet/leaflet.js'
];

// Instala el Service Worker y precacha los archivos core locales
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
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
        }).then(() => self.clients.claim())
    );
});

// Intercepta peticiones de red (La magia del mapa offline de Esri)
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = event.request.url;

    // 1. Estrategia Cache-First para imágenes y teselas de mapas (Esri, fotos, iconos)
    if (url.includes('arcgisonline.com') || url.includes('.png') || url.includes('.jpg') || url.includes('.jpeg')) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) return cachedResponse;

                    return fetch(event.request).then((networkResponse) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    }).catch(() => {
                        return new Response('');
                    });
                });
            })
        );
    } else {
        // 2. Estrategia Network-First para código y datos (HTML, CSS, JS, JSON):
        // Siempre intenta traer lo último de GitHub Pages; si no hay conexión, usa la caché.
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match(event.request);
                })
        );
    }
});
