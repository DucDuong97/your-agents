import { nanoid } from 'nanoid';

// Define types for our data
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  rawContent?: string; // For storing structured content (like image data) in JSON format
  price?: {
    promptTokens?: number;
    completionTokens?: number;
    imageCount?: number;
    totalCost?: number;
    promptCost?: number;
    completionCost?: number;
    imageCost?: number;
  };
}

export interface Chat {
  id: string;
  title: string;
  agentId: string; // Reference to the agent used for this chat
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  unread?: boolean; // Flag to indicate unread chat sessions
}

export interface ChatAgent {
  id: string;
  name: string;
  systemPrompt: string;
  modelName: string;
  provider: 'openrouter' | 'openai';
  examplePrompts: string[];
  oneShotExample?: string; // Optional one-shot example for prompt engineering
  scheduledNotifications?: {
    enabled: boolean;
    time: string; // Format: "HH:mm" (24-hour)
    taskPrompt?: string; // Custom prompt for scheduled notifications
    lastSent?: string; // ISO date string
  };
  createdAt: string;
  updatedAt: string;
}

// Initialize and open IndexedDB
const DB_NAME = 'chatbotDB';
const DB_VERSION = 1;
const STORES = {
  CHATS: 'chats',
  AGENTS: 'agents'
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

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

// Helper functions for IndexedDB operations
async function getAllItems<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    
    request.onsuccess = () => {
      resolve(request.result);
    };
    
    request.onerror = () => {
      console.error(`Error getting all items from ${storeName}:`, request.error);
      reject(request.error);
    };
  });
}

async function getItem<T>(storeName: string, id: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);
    
    request.onsuccess = () => {
      resolve(request.result || null);
    };
    
    request.onerror = () => {
      console.error(`Error getting item from ${storeName}:`, request.error);
      reject(request.error);
    };
  });
}

async function addItem<T>(storeName: string, item: T): Promise<T> {
  const db = await openDB();
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
}

async function deleteItem(storeName: string, id: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);
    
    request.onsuccess = () => {
      resolve(true);
    };
    
    request.onerror = () => {
      console.error(`Error deleting item from ${storeName}:`, request.error);
      reject(request.error);
    };
  });
}

// Client-side storage operations for chats
export const chatDB = {
  async create(data: Omit<Chat, 'id' | 'createdAt' | 'updatedAt'>): Promise<Chat> {
    const now = new Date().toISOString();
    const chat: Chat = {
      id: nanoid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    
    await addItem(STORES.CHATS, chat);
    return chat;
  },
  
  async get(id: string): Promise<Chat | null> {
    return getItem<Chat>(STORES.CHATS, id);
  },
  
  async update(id: string, data: Partial<Omit<Chat, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Chat | null> {
    const chat = await this.get(id);
    if (!chat) return null;
    
    const updatedChat: Chat = {
      ...chat,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    
    await addItem(STORES.CHATS, updatedChat);
    return updatedChat;
  },
  
  async delete(id: string): Promise<boolean> {
    return deleteItem(STORES.CHATS, id);
  },
  
  async list(): Promise<Chat[]> {
    try {
      const chats = await getAllItems<Chat>(STORES.CHATS);
      return chats.sort((a: Chat, b: Chat) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      console.error('Error listing chats from IndexedDB:', error);
      return [];
    }
  },
  
  async listByAgentId(agentId: string): Promise<Chat[]> {
    const chats = await this.list();
    return chats.filter(chat => chat.agentId === agentId);
  },
  
  async addMessage(chatId: string, message: Omit<Message, 'id' | 'createdAt'>): Promise<Chat | null> {
    const chat = await this.get(chatId);
    if (!chat) return null;
    
    const newMessage: Message = {
      id: nanoid(),
      ...message,
      createdAt: new Date().toISOString(),
    };
    
    const messages = [...chat.messages, newMessage];
    return this.update(chatId, { messages });
  },

  async markAsRead(chatId: string): Promise<Chat | null> {
    const chat = await this.get(chatId);
    if (!chat || !chat.unread) return chat; // No change needed if chat is null or already read
    
    return this.update(chatId, { unread: false });
  }
};

// Client-side storage operations for chat agents
export const agentDB = {
  async create(data: Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>): Promise<ChatAgent> {
    const now = new Date().toISOString();
    const agent: ChatAgent = {
      id: nanoid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    
    await addItem(STORES.AGENTS, agent);
    return agent;
  },
  
  async get(id: string): Promise<ChatAgent | null> {
    return getItem<ChatAgent>(STORES.AGENTS, id);
  },
  
  async update(id: string, data: Partial<Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ChatAgent | null> {
    const agent = await this.get(id);
    if (!agent) return null;
    
    const updatedAgent: ChatAgent = {
      ...agent,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    
    await addItem(STORES.AGENTS, updatedAgent);
    return updatedAgent;
  },
  
  async delete(id: string): Promise<boolean> {
    return deleteItem(STORES.AGENTS, id);
  },
  
  async list(): Promise<ChatAgent[]> {
    try {
      const agents = await getAllItems<ChatAgent>(STORES.AGENTS);
      return agents.sort((a: ChatAgent, b: ChatAgent) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      console.error('Error listing agents from IndexedDB:', error);
      return [];
    }
  }
}; 