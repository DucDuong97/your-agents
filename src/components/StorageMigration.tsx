'use client';

import { useEffect } from 'react';
import { initStorage, isIndexedDBSupported } from '@/utils/storage-migration';

export default function StorageMigration() {
  useEffect(() => {
    const runMigration = async () => {
      // Check if IndexedDB is supported by the browser
      if (!isIndexedDBSupported()) {
        console.warn('IndexedDB is not supported in this browser, continuing with localStorage');
        return;
      }

      try {
        await initStorage();
        console.log('Storage migration completed successfully');
      } catch (error) {
        console.error('Error initializing storage:', error);
      }
    };

    runMigration();
  }, []);

  // This component doesn't render anything visible
  return null;
} 