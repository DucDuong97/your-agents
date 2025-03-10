import React, { useState, useEffect } from 'react';
import { Chat, chatDB, Message } from '@/lib/db';
import { format } from 'date-fns';

interface ChatSessionListProps {
  agentId: string;
  onSelectChat: (chat: Chat) => void;
  onNewChat: () => void;
}

// Helper function to calculate total cost of a chat session
const calculateTotalCost = (messages: Message[]): number => {
  return messages
    .filter(message => message.role === 'assistant' && message.price?.totalCost)
    .reduce((total, message) => total + (message.price?.totalCost || 0), 0);
};

// Helper function to count AI messages
const countAIMessages = (messages: Message[]): number => {
  return messages.filter(message => message.role === 'assistant').length;
};

// Helper function to count tokens
const countTokens = (messages: Message[]): { promptTokens: number, completionTokens: number } => {
  return messages
    .filter(message => message.role === 'assistant' && message.price)
    .reduce(
      (total, message) => ({
        promptTokens: total.promptTokens + (message.price?.promptTokens || 0),
        completionTokens: total.completionTokens + (message.price?.completionTokens || 0),
      }),
      { promptTokens: 0, completionTokens: 0 }
    );
};

// Helper function to get cost badge color based on cost amount
const getCostBadgeColor = (cost: number): string => {
  if (cost >= 0.1) {
    return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
  } else if (cost >= 0.05) {
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
  } else if (cost >= 0.01) {
    return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
  } else {
    return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
  }
};

export default function ChatSessionList({ agentId, onSelectChat, onNewChat }: ChatSessionListProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadChats = async () => {
      try {
        const agentChats = await chatDB.listByAgentId(agentId);
        setChats(agentChats);
      } catch (error) {
        console.error('Failed to load chats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadChats();
  }, [agentId]);

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat?')) return;

    try {
      const success = await chatDB.delete(chatId);
      if (success) {
        setChats(prev => prev.filter(chat => chat.id !== chatId));
      }
    } catch (error) {
      console.error('Failed to delete chat:', error);
      alert('Failed to delete chat. Please try again.');
    }
  };

  // Calculate total cost across all sessions
  const totalCostAllSessions = chats.reduce(
    (total, chat) => total + calculateTotalCost(chat.messages),
    0
  );

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Chat Sessions</h2>
          {totalCostAllSessions > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Total spent: <span className="font-medium">${totalCostAllSessions.toFixed(6)} USD</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onNewChat}
            className="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded"
          >
            New Chat
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">
          Loading chats...
        </div>
      ) : chats.length === 0 ? (
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">
          <p className="mb-4">No chat sessions found</p>
          <p className="text-sm">Start a new chat to begin the conversation</p>
        </div>
      ) : (
        <div className="space-y-3">
          {chats.map(chat => (
            <div
              key={chat.id}
              onClick={() => onSelectChat(chat)}
              className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 dark:text-white">{chat.title}</h3>
                  <div className="flex justify-start items-center gap-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {format(new Date(chat.updatedAt), 'MMM d, yyyy h:mm a')}
                    </p>
                    {calculateTotalCost(chat.messages) > 0 && (
                      <div className="relative group">
                        <span className={`text-xs ${getCostBadgeColor(calculateTotalCost(chat.messages))} px-2 py-0.5 rounded-full`}>
                          ${calculateTotalCost(chat.messages).toFixed(6)}
                        </span>
                        <div className="absolute right-0 mt-1 w-60 bg-gray-800 text-white text-xs rounded py-2 px-3 z-10 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                          <div className="font-semibold mb-1">Session Cost Breakdown:</div>
                          <div className="grid grid-cols-2 gap-1">
                            <span>AI Messages:</span>
                            <span className="text-right">{countAIMessages(chat.messages)}</span>
                            <span>Prompt Tokens:</span>
                            <span className="text-right">{countTokens(chat.messages).promptTokens.toLocaleString()}</span>
                            <span>Completion Tokens:</span>
                            <span className="text-right">{countTokens(chat.messages).completionTokens.toLocaleString()}</span>
                            <span className="border-t border-gray-600 col-span-2 mt-1 pt-1"></span>
                            <span className="font-semibold">Total Cost:</span>
                            <span className="text-right font-semibold">${calculateTotalCost(chat.messages).toFixed(6)} USD</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {chat.messages.length > 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                      {chat.messages[chat.messages.length - 1].content}
                    </p>
                  )}
                </div>
                <button
                  onClick={(e) => handleDeleteChat(chat.id, e)}
                  className="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 