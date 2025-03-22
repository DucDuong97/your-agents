'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/app/pwa';

export default function PWARegister() {
  useEffect(() => {
    // Register the service worker
    registerServiceWorker();
  }, []);
  
  // This component doesn't render anything
  return null;
} 