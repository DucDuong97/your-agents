'use client';

// Function to register the service worker
export function registerServiceWorker() {
  console.log('[PWA] Registering service worker:', 'serviceWorker' in navigator);
  if ('serviceWorker' in navigator) {
    console.log('[PWA] Loading service worker');
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('[PWA] Service Worker registered with scope:', registration.scope);
      })
      .catch(error => {
        console.error('[PWA] Service Worker registration failed:', error);
      });
  }
}

// Function to check if the app is in standalone mode (installed as PWA)
export function isInStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari on iOS has a property 'standalone' on navigator
    ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true) ||
    document.referrer.includes('android-app://')
  );
} 