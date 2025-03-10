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
}

export interface ChatAgent {
  id: string;
  name: string;
  systemPrompt: string;
  modelName: string;
  provider: 'openrouter' | 'openai';
  examplePrompts: string[];
  oneShotExample?: string; // Optional one-shot example for prompt engineering
  createdAt: string;
  updatedAt: string;
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
    
    const chats = await this.list();
    chats.unshift(chat);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('chats', JSON.stringify(chats));
    }
    
    return chat;
  },
  
  async get(id: string): Promise<Chat | null> {
    const chats = await this.list();
    const chat = chats.find(c => c.id === id);
    return chat || null;
  },
  
  async update(id: string, data: Partial<Omit<Chat, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Chat | null> {
    const chats = await this.list();
    const index = chats.findIndex(c => c.id === id);
    
    if (index === -1) return null;
    
    const updatedChat: Chat = {
      ...chats[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    
    chats[index] = updatedChat;
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('chats', JSON.stringify(chats));
    }
    
    return updatedChat;
  },
  
  async delete(id: string): Promise<boolean> {
    const chats = await this.list();
    const filteredChats = chats.filter(c => c.id !== id);
    
    if (filteredChats.length === chats.length) return false;
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('chats', JSON.stringify(filteredChats));
    }
    
    return true;
  },
  
  async list(): Promise<Chat[]> {
    if (typeof window === 'undefined') return [];
    
    const chatsJson = localStorage.getItem('chats');
    let chats = [];
    
    try {
      const parsedData = chatsJson ? JSON.parse(chatsJson) : [];
      chats = Array.isArray(parsedData) ? parsedData : [];
    } catch (error) {
      console.error('Error parsing chats from localStorage:', error);
      // Return empty array if parsing fails
      return [];
    }
    
    return chats.sort((a: Chat, b: Chat) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
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
    
    const agents = await this.list();
    agents.unshift(agent);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('agents', JSON.stringify(agents));
    }
    
    return agent;
  },
  
  async get(id: string): Promise<ChatAgent | null> {
    const agents = await this.list();
    const agent = agents.find(a => a.id === id);
    return agent || null;
  },
  
  async update(id: string, data: Partial<Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ChatAgent | null> {
    const agents = await this.list();
    const index = agents.findIndex(a => a.id === id);
    
    if (index === -1) return null;
    
    const updatedAgent: ChatAgent = {
      ...agents[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    
    agents[index] = updatedAgent;
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('agents', JSON.stringify(agents));
    }
    
    return updatedAgent;
  },
  
  async delete(id: string): Promise<boolean> {
    const agents = await this.list();
    const filteredAgents = agents.filter(a => a.id !== id);
    
    if (filteredAgents.length === agents.length) return false;
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('agents', JSON.stringify(filteredAgents));
    }
    
    return true;
  },
  
  async list(): Promise<ChatAgent[]> {
    if (typeof window === 'undefined') return [];
    
    const agentsJson = localStorage.getItem('agents');
    let agents = [];
    
    try {
      const parsedData = agentsJson ? JSON.parse(agentsJson) : [];
      agents = Array.isArray(parsedData) ? parsedData : [];
    } catch (error) {
      console.error('Error parsing agents from localStorage:', error);
      // Return empty array if parsing fails
      return [];
    }
    
    return agents.sort((a: ChatAgent, b: ChatAgent) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }
}; 