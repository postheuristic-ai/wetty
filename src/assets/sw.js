const CACHE_NAME = 'wetty-v1';
const STATIC_ASSETS = [
  '/pidev',
  '/pidev/client/wetty.js',
  '/pidev/client/wetty.css',
  '/pidev/client/favicon.ico',
  '/pidev/client/NerdFontMono-Regular-IKVVEQQB.ttf',
  '/pidev/client/NerdFontMono-Bold-X6YIUVDQ.ttf',
  '/pidev/client/NerdFontMono-Italic-IOF2FTLS.ttf',
  '/pidev/client/NerdFontMono-BoldItalic-ZFP5X7TN.ttf'
];

// Install event - cache static assets
// eslint-disable-next-line no-restricted-globals
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // eslint-disable-next-line no-console
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => 
        // Skip waiting to activate immediately
        // eslint-disable-next-line no-restricted-globals
         self.skipWaiting()
      )
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to cache assets:', error);
      })
  );
});

// Activate event - clean up old caches
// eslint-disable-next-line no-restricted-globals
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            // eslint-disable-next-line no-console
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
          return undefined;
        })
      )).then(() => 
      // Take control of all clients
      // eslint-disable-next-line no-restricted-globals
       self.clients.claim()
    )
  );
});

// Fetch event - serve from cache, fallback to network
// eslint-disable-next-line no-restricted-globals
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and websocket upgrades
  if (event.request.method !== 'GET' ||
      event.request.headers.get('upgrade') === 'websocket') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => 
        // Return cached version or fetch from network
         response || fetch(event.request).then((fetchResponse) => {
          // Cache successful responses
          if (fetchResponse.status === 200) {
            const responseClone = fetchResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return fetchResponse;
        })
      )
      .catch(() => {
        // Fallback for offline - return cached main page for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/pidev');
        }
        return undefined;
      })
  );
});