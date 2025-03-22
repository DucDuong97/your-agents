export async function requestNotificationPermission(): Promise<boolean> {
  try {
    // Check if service workers are supported
    if (!('serviceWorker' in navigator)) {
      console.error('Service workers are not supported');
      return false;
    }

    // Check if push notifications are supported
    if (!('PushManager' in window)) {
      console.error('Push notifications are not supported');
      return false;
    }

    // Check if notifications are supported
    if (!('Notification' in window)) {
      console.error('Notifications are not supported');
      return false;
    }

    // Check if notifications are blocked in system settings
    const permission = await Notification.requestPermission();
    console.log('Notification permission:', permission);

    if (permission === 'granted') {
      // Check if service worker is registered
      const registration = await navigator.serviceWorker.ready;
      console.log('Service Worker status:', registration.active ? 'active' : 'inactive');
      
      // Check if push subscription exists
      const subscription = await registration.pushManager.getSubscription();
      console.log('Push subscription status:', subscription ? 'exists' : 'none');
      
      if (!subscription) {
        await subscribeToPushNotifications();
      }
    }

    return permission === 'granted';
  } catch (error) {
    console.error('Error checking notification support:', error);
    return false;
  }
}

export async function subscribeToPushNotifications() {
  console.log('Subscribing to push notifications');
  try {
    // Check if service worker is already registered
    let registration = await navigator.serviceWorker.getRegistration();
    
    if (!registration) {
      console.log('Registering new service worker');
      registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
    }
    
    console.log('Service Worker registered:', registration);

    // Wait for the service worker to be ready
    if (registration.active) {
      console.log('Service Worker is already active');
    } else {
      console.log('Waiting for Service Worker to activate...');
      await new Promise<void>((resolve) => {
        registration.addEventListener('activate', () => {
          console.log('Service Worker activated');
          resolve();
        });
      });
    }

    // Now that the service worker is active, we can subscribe
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    });
    console.log('Push subscription:', subscription);

    // Send the subscription to the server
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(subscription),
    });

    return subscription;
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    throw error;
  }
}

export async function unsubscribeFromPushNotifications() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      await subscription.unsubscribe();
      // You might want to notify the server that the user has unsubscribed
      // await fetch('/api/push/unsubscribe', { method: 'POST' });
    }
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    throw error;
  }
} 