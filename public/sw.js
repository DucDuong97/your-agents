// This is the service worker with the combined offline experience (Offline page + Offline copy of pages)

const CACHE = "pwabuilder-offline-page";

// TODO: replace the following with the correct offline fallback page i.e.: const offlineFallbackPage = "offline.html";
const offlineFallbackPage = "offline.html";

// Log when the service worker is installed
self.addEventListener('install', (event) => {
  console.log('Service Worker installed');
  self.skipWaiting(); // Activate immediately

  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      console.log("[PWA Builder] Cached offline page during install");
      
      return cache.addAll([
        offlineFallbackPage,
        '/',
        '/home',
        '/manifest.json',
        '/icons/icon-72x72.png',
        '/icons/icon-96x96.png',
        '/icons/icon-128x128.png',
        '/icons/icon-144x144.png',
        '/icons/icon-152x152.png',
        '/icons/icon-192x192.png',
        '/icons/icon-384x384.png',
        '/icons/icon-512x512.png'
      ]);
    })
  );
});

// If any fetch fails, it will look for the request in the cache and serve it from there first
self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        console.log("[PWA Builder] add page to offline cache: " + response.url);

        // If request was success, add or update it in the cache
        event.waitUntil(updateCache(event.request, response.clone()));

        return response;
      })
      .catch(function (error) {
        console.log("[PWA Builder] Network request Failed. Serving content from cache: " + error);
        return fromCache(event.request);
      })
  );
});

function fromCache(request) {
  // Check to see if you have it in the cache
  // Return response
  // If not in the cache, then return error page
  return caches.open(CACHE).then(function (cache) {
    return cache.match(request).then(function (matching) {
      if (!matching || matching.status === 404) {
        return Promise.reject("no-match");
      }

      return matching;
    });
  });
}

function updateCache(request, response) {
  return caches.open(CACHE).then(function (cache) {
    return cache.put(request, response);
  });
}

// Log when the service worker is activated
self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
  event.waitUntil(clients.claim()); // Take control of all clients immediately
});

// Handle push events
self.addEventListener('push', function(event) {
  console.log('Push event received:', event);
  
  if (!event.data) {
    console.log('No data received in push event');
    return;
  }

  try {
    const data = event.data.json();
    console.log('Push data:', data);
    
    // Ensure we have all required fields
    const title = data.title || 'Chat Bot Message';
    const body = data.body || 'New message received';
    const icon = data.icon || '/icons/icon-192x192.png';
    const badge = data.badge || '/icons/icon-72x72.png';
    const url = data.data?.url || '/';

    console.log('Notification details:', { title, body, icon, badge, url });
    
    const options = {
      body,
      icon,
      badge,
      data: { url },
      vibrate: [100, 50, 100],
      requireInteraction: true, // Notification stays until user interacts
      actions: [
        {
          action: 'open',
          title: 'Open'
        }
      ]
    };

    console.log('Showing notification with options:', options);
    
    event.waitUntil(
      self.registration.showNotification(title, options)
        .then(() => console.log('Notification shown successfully'))
        .catch(error => console.error('Error showing notification:', error))
    );
  } catch (error) {
    console.error('Error handling push event:', error);
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', function(event) {
  console.log('Notification clicked:', event);
  
  event.notification.close();

  if (event.action === 'open') {
    console.log('Opening URL:', event.notification.data.url);
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
}); 