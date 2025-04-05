// This is the service worker with the combined offline experience (Offline page + Offline copy of pages)

const CACHE = "pwabuilder-offline-page";

// Include this line for next-pwa to inject the precache manifest
const precacheManifest = self.__WB_MANIFEST || [];

// TODO: replace the following with the correct offline fallback page i.e.: const offlineFallbackPage = "offline.html";
const offlineFallbackPage = "offline.html";

// IndexedDB configuration
const DB_NAME = 'chatbotDB';
const DB_VERSION = 1;
const STORES = {
  CHATS: 'chats',
  AGENTS: 'agents'
};

// Log when the service worker is installed
self.addEventListener('install', (event) => {
  console.log('Service Worker installed');
  self.skipWaiting(); // Activate immediately

  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      console.log("[PWA Builder] Cached offline page during install");
      
      // Combine both the manifest and our additional URLs
      const urlsToCache = [
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
      ];
      
      // Add the precacheManifest URLs to our urlsToCache
      const allUrlsToCache = [...precacheManifest.map(item => item.url), ...urlsToCache];
      
      return Promise.allSettled(
        allUrlsToCache.map(url => {
          return fetch(url)
            .then(response => {
              // Only cache successful responses
              if (!response.ok) {
                throw new Error(`Failed to cache ${url}: ${response.status} ${response.statusText}`);
              }
              return cache.put(url, response);
            })
            .catch(error => {
              console.warn(`[PWA Builder] Couldn't cache ${url}: ${error.message}`);
              // Continue with other cache operations without failing
              return Promise.resolve();
            });
        })
      );
    })
  );
});

// Helper function to check if a URL should be cacheable
function isCacheableURL(url) {
  const urlObj = new URL(url);
  
  // Don't cache chrome-extension:// URLs
  if (urlObj.protocol === 'chrome-extension:') {
    return false;
  }
  
  // Don't cache other browser-specific URLs
  if (urlObj.protocol === 'chrome:' || urlObj.protocol === 'edge:' || 
      urlObj.protocol === 'brave:' || urlObj.protocol === 'firefox:') {
    return false;
  }
  
  // Only cache same-origin or whitelisted URLs
  // Add any other specific exclusions here
  return true;
}

// If any fetch fails, it will look for the request in the cache and serve it from there first
self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        // If request was success, add or update it in the cache
        // Only cache if the URL is cacheable and the response is valid (2xx status)
        if (isCacheableURL(event.request.url) && response.ok) {
          event.waitUntil(updateCache(event.request, response.clone()));
        }

        return response;
      })
      .catch(function (error) {
        console.log("[PWA Builder] Network request Failed. Serving content from cache: " + error);
        return fromCache(event.request)
          .catch(() => {
            // If the resource is not in the cache, return the offline page
            return caches.open(CACHE).then(function (cache) {
              return cache.match(offlineFallbackPage);
            });
          });
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
  // Check if the URL should be cached before attempting to cache it
  if (!isCacheableURL(request.url)) {
    console.log("[PWA Builder] Skipping cache for: " + request.url);
    return Promise.resolve(); // Return a resolved promise to avoid errors
  }
  
  // Don't cache error responses
  if (!response.ok) {
    console.log(`[PWA Builder] Not caching error response (${response.status}) for: ${request.url}`);
    return Promise.resolve();
  }
  
  return caches.open(CACHE).then(function (cache) {
    return cache.put(request, response).catch(err => {
      console.error(`[PWA Builder] Error caching ${request.url}: ${err}`);
      return Promise.resolve(); // Prevent the error from propagating
    });
  });
}

// Log when the service worker is activated
self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
  event.waitUntil(clients.claim()); // Take control of all clients immediately
});

// Helper function to generate a random ID
function generateId() {
  return Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
}

// IndexedDB Helper Functions
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = self.indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error('Error opening IndexedDB:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      resolve(request.result);
    };
    
    request.onupgradeneeded = () => {
      const db = request.result;
      
      // Create object stores if they don't exist
      if (!db.objectStoreNames.contains(STORES.CHATS)) {
        db.createObjectStore(STORES.CHATS, { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains(STORES.AGENTS)) {
        db.createObjectStore(STORES.AGENTS, { keyPath: 'id' });
      }
    };
  });
}

async function getAllFromStore(storeName) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      
      request.onerror = () => {
        console.error(`Error getting items from ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error(`Error in getAllFromStore for ${storeName}:`, error);
    return [];
  }
}

async function addToStore(storeName, item) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(item);
      
      request.onsuccess = () => {
        resolve(item);
      };
      
      request.onerror = () => {
        console.error(`Error adding item to ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error(`Error in addToStore for ${storeName}:`, error);
    return null;
  }
}

// Helper function to get agents from IndexedDB
async function getAgentsFromIndexedDB() {
  try {
    const agents = await getAllFromStore(STORES.AGENTS);
    return agents.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch (error) {
    console.error('Error accessing agents from IndexedDB:', error);
    return [];
  }
}

// Helper function to create a new chat session for the agent using IndexedDB
async function createChatSession(agent, message) {
  try {
    // Get current time
    const now = new Date().toISOString();
    
    // Create a new chat with an initial message
    const chat = {
      id: generateId(),
      title: `Scheduled Chat - ${new Date().toLocaleDateString()}`,
      agentId: agent.id,
      unread: true, // Mark the chat as unread
      messages: [
        {
          id: generateId(),
          role: 'assistant',
          content: message,
          createdAt: now
        }
      ],
      createdAt: now,
      updatedAt: now
    };
    
    // Add to IndexedDB
    const result = await addToStore(STORES.CHATS, chat);
    
    console.log('Created chat with initial message:', result);
    return result;
  } catch (error) {
    console.error('Error creating chat with message:', error);
    return null;
  }
}

// Helper function to update the lastSent time for an agent using IndexedDB
async function updateAgentLastSent(agentId) {
  try {
    // Get all agents from IndexedDB
    const agents = await getAllFromStore(STORES.AGENTS);
    
    // Find the agent to update
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return false;
    
    // Update the agent's lastSent time
    const updatedAgent = {
      ...agent,
      scheduledNotifications: {
        enabled: agent.scheduledNotifications?.enabled || true,
        time: agent.scheduledNotifications?.time || '09:00',
        taskPrompt: agent.scheduledNotifications?.taskPrompt || '',
        lastSent: new Date().toISOString()
      },
      updatedAt: new Date().toISOString()
    };
    
    // Save back to IndexedDB
    await addToStore(STORES.AGENTS, updatedAgent);
    
    return true;
  } catch (error) {
    console.error('Error updating agent last sent time:', error);
    return false;
  }
}

// Helper function to request API keys from the main application
async function requestApiKeys() {
  console.log('[Service Worker] Requesting API keys');

  try {
    // Get all clients controlled by this service worker
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: false });
    
    if (clientList.length === 0) {
      console.error('No active clients to request API keys from');
      return null;
    }
    
    // Create a message channel for the response
    const messageChannel = new MessageChannel();
    
    // Create a promise that will be resolved when we get a response
    const keysPromise = new Promise((resolve) => {
      messageChannel.port1.onmessage = (event) => {
        if (event.data && event.data.type === 'API_KEYS_RESPONSE') {
          resolve(event.data);
        } else {
          resolve(null);
        }
      };
    });
    
    // Send the request to the first client
    clientList[0].postMessage({
      type: 'API_KEYS_REQUEST'
    }, [messageChannel.port2]);
    
    // Wait for the response with a timeout
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve(null), 3000);
    });
    
    // Return either the keys or null if timeout
    return Promise.race([keysPromise, timeoutPromise]);
  } catch (error) {
    console.error('Error requesting API keys:', error);
    return null;
  }
}

// Helper function to generate a reminder message
async function generateReminderMessage(agent) {
  try {
    // Request API key from main application
    const apiKeys = await requestApiKeys();
    const OPENAI_API_KEY = apiKeys?.openaiKey || '';
    
    // If we couldn't get an API key, use a fallback message
    if (!OPENAI_API_KEY) {
      console.error('OpenAI API key not available');
      return `Hello! ${agent.name} here. I'd like to help you today but I'm having trouble with my connection. Please check your API settings.`;
    }
    
    const currentHour = new Date().getHours();
    let timeContext = '';
    
    if (currentHour >= 5 && currentHour < 12) {
      timeContext = 'morning';
    } else if (currentHour >= 12 && currentHour < 17) {
      timeContext = 'afternoon';
    } else if (currentHour >= 17 && currentHour < 22) {
      timeContext = 'evening';
    } else {
      timeContext = 'night';
    }
    
    // Get the task prompt if available
    const taskPrompt = agent.scheduledNotifications?.taskPrompt || '';
    
    // Craft a prompt for OpenAI that will generate an action-oriented reminder
    const prompt = `
      You are a ${agent.name}.
      
      ${taskPrompt ? `# Task description: ${taskPrompt}` : ''}

      First, kindly greet the user related to the time of day: ${timeContext}.
      
      Then, create a brief, engaging reminder message that:
      1. Contains a specific call-to-action based on the agent's role and the # Task description
      2. Mentions a practical next step the user could take
      3. The call-to-action should be broken down into feasible steps
    `;
    
    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You create brief, engaging reminder messages from AI assistants to their users.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 150,
        temperature: 0.7
      })
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    const data = await response.json();
    const generatedMessage = data.choices[0].message.content.trim();
    
    // Return the generated message
    return generatedMessage;
  } catch (error) {
    console.error('Error generating reminder message with OpenAI:', error);
    
    // Fallback message if API call fails
    return error.message;
  }
}

// Handle push events
self.addEventListener('push', function(event) {
  console.log('[Service Worker] Push event received:', event);
  
  if (!event.data) {
    console.log('[Service Worker] No data received in push event');
    return;
  }

  event.waitUntil(async function() {
    try {
      // Check if this is a custom notification with data
      const data = event.data.json();
      console.log('[Service Worker] Push data:', data);
      
      // Get agents from IndexedDB
      const agents = await getAgentsFromIndexedDB();
      console.log('[Service Worker] Fetched agents from IndexedDB:', agents);
      
      // Filter agents with scheduled notifications enabled
      const agentsWithScheduledNotifications = agents.filter(agent => 
        agent.scheduledNotifications && agent.scheduledNotifications.enabled
      );
      
      if (agentsWithScheduledNotifications.length === 0) {
        console.log('[Service Worker] No agents with scheduled notifications');
        return;
      }
      
      console.log('[Service Worker] Agents with scheduled notifications:', agentsWithScheduledNotifications);
      
      for (const agent of agentsWithScheduledNotifications) {
        // Check if scheduled time matches current time
        console.log(`[Service Worker] It's time to send a notification for agent: ${agent.name}`);
          
        // Generate a custom reminder message - now properly awaited
        const reminderMessage = await generateReminderMessage(agent);
        
        // Create a new chat session with the reminder message in IndexedDB
        const chatSession = await createChatSession(agent, reminderMessage);
        
        if (chatSession) {
          // Show notification for this agent
          const notificationPayload = {
            title: `Reminder from ${agent.name}`,
            body: reminderMessage,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            data: {
              url: `/sessions/${chatSession.id}`,
              type: 'scheduled',
              agentId: agent.id
            }
          };
          
          await self.registration.showNotification(notificationPayload.title, {
            body: notificationPayload.body,
            icon: notificationPayload.icon,
            badge: notificationPayload.badge,
            data: notificationPayload.data,
          });
          
          // Update lastSent time in IndexedDB
          await updateAgentLastSent(agent.id);
        }
      }
      
      return;
    } catch (error) {
      console.error('Error processing push event:', error);
      return;
    }
  }());
});

// Handle notification clicks
self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] Notification clicked:', event);
  
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    console.log('[Service Worker] Opening URL:', event.notification.data.url);
    
    // If this is a chat notification with a session ID, mark it as read
    if (event.notification.data && event.notification.data.url) {
      const urlParts = event.notification.data.url.split('/');
      const chatId = urlParts[urlParts.length - 1];
      
      if (chatId) {
        // Note: Not marking as read here, session page will handle it
        console.log(`[Service Worker] Opening chat session: ${chatId}`);
      }
    }
    
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
}); 