'use client';

// Function to register the service worker
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('Service Worker registered with scope:', registration.scope);
        })
        .catch(error => {
          console.error('Service Worker registration failed:', error);
        });
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