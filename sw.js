const CACHE = 'macrocam-v1';

// activate — delete old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// fetch — cache first for static, network only for API calls
self.addEventListener('fetch', e => {
  const url = e.request.url;

  if (url.includes('generativelanguage.googleapis.com') ||
      url.includes('openfoodfacts.org') ||
      url.includes('fdc.nal.usda.gov') ||
      url.includes('cdnjs.cloudflare.com') ||
      url.includes('cdn.jsdelivr.net') ||
      url.includes('fonts.googleapis.com')) {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      });
    }).catch(() => {
      if (e.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    })
  );
});