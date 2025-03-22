import { migrateFromLocalStorage } from '@/lib/db';

// Initialize migration on app start
export async function initStorage(): Promise<void> {
  if (typeof window === 'undefined') return;
  
  // Check if migration is already completed
  const migrationCompleted = localStorage.getItem('indexedDBMigrationCompleted');
  
  if (migrationCompleted !== 'true') {
    try {
      console.log('Migrating data from localStorage to IndexedDB...');
      await migrateFromLocalStorage();
      
      // After successful migration, we can optionally clean up localStorage
      // But we keep the migration flag to prevent re-migration
      // Uncomment if you want to clean up localStorage after migration
      /*
      const keysToKeep = ['indexedDBMigrationCompleted'];
      const allKeys = Object.keys(localStorage);
      
      for (const key of allKeys) {
        if (!keysToKeep.includes(key)) {
          localStorage.removeItem(key);
        }
      }
      */
    } catch (error) {
      console.error('Failed to migrate data from localStorage to IndexedDB:', error);
      // Keep using localStorage if migration fails
    }
  } else {
    console.log('Using IndexedDB storage (migration already completed)');
  }
}

// Function to check if a browser supports IndexedDB
export function isIndexedDBSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.indexedDB;
}

// Function to check the storage usage
export async function getStorageEstimate(): Promise<{ usage?: number; quota?: number }> {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
    return {};
  }
  
  try {
    return await navigator.storage.estimate();
  } catch (error) {
    console.error('Error estimating storage usage:', error);
    return {};
  }
} 