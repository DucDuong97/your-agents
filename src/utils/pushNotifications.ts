// Push Notification Utilities

// Function to request permission for push notifications
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    // Check if push notifications are supported
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.error('Push notifications are not supported');
      return false;
    }
    
    // Check if we already have permission
    if (Notification.permission === 'granted') {
      return true;
    }
    
    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.error('Notification permission denied');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
}

// Subscribe to push notifications
export async function subscribeToPushNotifications(registration: ServiceWorkerRegistration): Promise<boolean> {
  try {
    // Get the server's public key
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    
    if (!publicKey) {
      console.error('Missing VAPID public key');
      return false;
    }
    
    // Convert the public key to Uint8Array
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    
    console.log('Subscribing to push notifications');
    
    // Check for existing subscription first
    let subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      console.log('[PWA] Push notification subscription already exists');
      return true;
    }

    // Create a new subscription
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    });
    
    // Send the subscription to the server
    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(subscription),
    });
    
    if (!response.ok) {
      console.error('[PWA] Failed to register push subscription on server');
      return false;
    }
    
    console.log('[PWA] Push notification subscription successful');
    return true;
  } catch (error) {
    console.error('[PWA] Error subscribing to push notifications:', error);
    return false;
  }
}

// Unsubscribe from push notifications
export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      return true; // Already unsubscribed
    }
    
    // Unsubscribe locally
    await subscription.unsubscribe();
    
    // Notify the server
    const response = await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    
    if (!response.ok) {
      console.error('Failed to unsubscribe on server');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    return false;
  }
}

// Helper: Convert base64 string to Uint8Array for VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  
  return outputArray;
}
