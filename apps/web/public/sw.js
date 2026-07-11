const CACHE = 'excise-v2';

// CDN assets pre-cached on install — app runs fully offline after first load
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/daisyui@5.6.3/daisyui.css',
  'https://cdn.jsdelivr.net/npm/notyf@3.10.0/notyf.min.css',
  'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4',
  'https://cdn.jsdelivr.net/npm/dexie@4.0.10/dist/dexie.min.js',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11.14.5/dist/sweetalert2.all.min.js',
  'https://cdn.jsdelivr.net/npm/notyf@3.10.0/notyf.min.js',
  'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CDN_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  // Cache-first for CDN assets; network-first for app routes
  if (CDN_ASSETS.includes(url) || url.includes('cdn.jsdelivr.net') || url.includes('cdn.tailwindcss.com')) {
    e.respondWith(caches.match(e.request).then((hit) => hit ?? fetch(e.request)));
    return;
  }
  // Network-first with cache fallback for app shell
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit ?? Response.error()))
  );
});

// Background Sync — retries failed upload chunks on reconnect
self.addEventListener('sync', (e) => {
  if (e.tag === 'upload-queue') {
    e.waitUntil(processUploadQueue());
  }
});

async function processUploadQueue() {
  // Queue stored in IndexedDB by the frontend; SW reads and retries
  const clients = await self.clients.matchAll();
  clients.forEach((c) => c.postMessage({ type: 'sync-upload-queue' }));
}

// Relay connectivity changes to the active page
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
