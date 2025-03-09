'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { chatDB, agentDB, Chat as ChatType, ChatAgent, Message } from '@/lib/db';
import MessageList from '@/components/chat/MessageList';
import MessageInput from '@/components/chat/MessageInput';
import EmptyState from '@/components/chat/EmptyState';
import { useForm } from 'react-hook-form';
import { generateChatCompletion, ApiMessage } from '@/lib/openrouter-client';
import { getGlobalConfig } from '@/lib/storage';
import { generateChatTitle } from '@/lib/promptUtils';

interface ChatState {
  messages: Message[];
  selectedAgent: ChatAgent | null;
  currentChat: ChatType | null;
  isGenerating: boolean;
  isTitleGenerating: boolean;
}

export default function SessionPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;
  
  const [state, setState] = useState<ChatState>({
    messages: [],
    selectedAgent: null,
    currentChat: null,
    isGenerating: false,
    isTitleGenerating: false,
  });
  
  const { register, handleSubmit, reset } = useForm<{ message: string }>();
  const [loading, setLoading] = useState(true);
  
  // Load chat and agent data
  useEffect(() => {
    const loadChatData = async () => {
      try {
        const chat = await chatDB.get(sessionId);
        if (!chat) {
          // Chat not found, redirect to home
          router.push('/home');
          return;
        }
        
        const agent = await agentDB.get(chat.agentId);
        if (!agent) {
          // Agent not found, redirect to home
          router.push('/home');
          return;
        }
        
        setState(prev => ({
          ...prev,
          currentChat: chat,
          messages: chat.messages,
          selectedAgent: agent,
        }));
      } catch (error) {
        console.error('Failed to load chat data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadChatData();
  }, [sessionId, router]);
  
  const onSendMessage = async (data: { message: string }) => {
    if (!data.message.trim() || state.isGenerating) return;
    
    // Check if agent is selected
    if (!state.selectedAgent || !state.currentChat) {
      router.push('/home');
      return;
    }
    
    // Check if API key is available for the selected provider
    const config = getGlobalConfig();
    const apiKey = state.selectedAgent.provider === 'openrouter' 
      ? config.openrouterApiKey 
      : config.openaiApiKey;
      
    if (!apiKey) {
      router.push('/home');
      return;
    }
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: data.message,
      createdAt: new Date().toISOString(),
    };
    
    // Add message to current chat
    const updatedMessages = [...state.messages, userMessage];
    
    setState(prevState => ({
      ...prevState,
      messages: updatedMessages,
      isGenerating: true,
    }));
    
    // Update the chat in the database
    await chatDB.update(state.currentChat.id, { 
      messages: updatedMessages,
    });
    
    // Check if this is the first user message and generate a title if needed
    const isFirstUserMessage = state.messages.filter(msg => msg.role === 'user').length === 0;
    
    if (isFirstUserMessage) {
      setState(prevState => ({
        ...prevState,
        isTitleGenerating: true,
      }));
      
      // Generate title in the background
      generateChatTitle(
        data.message,
        state.selectedAgent.provider,
        apiKey
      ).then(title => {
        // Update chat title in the database
        chatDB.update(state.currentChat!.id, { title });
      }).catch(error => {
        console.error('Error generating chat title:', error);
      }).finally(() => {
        setState(prevState => ({
          ...prevState,
          isTitleGenerating: false,
        }));
      });
    }
    
    // Reset the form after sending
    reset();
    
    try {
      // Convert messages to API format
      const apiMessages: ApiMessage[] = [
        { role: 'system', content: state.selectedAgent.systemPrompt },
        ...updatedMessages.map(msg => ({ role: msg.role, content: msg.content })),
      ];
      
      const response = await generateChatCompletion({
        messages: apiMessages,
        model: state.selectedAgent.modelName,
        apiKey,
        provider: state.selectedAgent.provider,
      });
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.content,
        createdAt: new Date().toISOString(),
      };
      
      const finalMessages = [...updatedMessages, assistantMessage];
      
      setState(prevState => ({
        ...prevState,
        messages: finalMessages,
        isGenerating: false,
      }));
      
      // Update the chat in the database
      await chatDB.update(state.currentChat.id, { 
        messages: finalMessages,
      });
    } catch (error) {
      console.error('Error generating response:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to generate response. Please check your API key and try again.'}`,
        createdAt: new Date().toISOString(),
      };
      
      const finalMessages = [...updatedMessages, errorMessage];
      
      setState(prevState => ({
        ...prevState,
        messages: finalMessages,
        isGenerating: false,
      }));
      
      // Update the chat in the database
      await chatDB.update(state.currentChat.id, { 
        messages: finalMessages,
      });
    }
  };
  
  const handleClearChat = () => {
    if (!state.currentChat) return;
    
    if (confirm('Are you sure you want to clear this chat?')) {
      const clearedChat = {
        ...state.currentChat,
        messages: [],
      };
      
      chatDB.update(state.currentChat.id, { messages: [] });
      
      setState(prevState => ({
        ...prevState,
        currentChat: clearedChat,
        messages: [],
      }));
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-3 sm:p-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-white truncate">
              {state.currentChat?.title || 'AI Chat'}
              {state.isTitleGenerating && (
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 animate-pulse">
                  Generating title...
                </span>
              )}
            </h1>
            {state.selectedAgent?.name && (
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
                Agent: {state.selectedAgent.name}
              </p>
            )}
          </div>

          <div className="flex space-x-2 ml-2">
            <button
              onClick={handleClearChat}
              className="px-2 sm:px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg touch-manipulation"
            >
              Clear
            </button>
          </div>
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6">
        <div className="max-w-3xl mx-auto">
          {state.messages.length === 0 ? (
            <EmptyState 
              onSendMessage={(content) => {
                onSendMessage({ message: content });
              }} 
              agent={state.selectedAgent}
            />
          ) : (
            <MessageList 
              messages={state.messages} 
              isGenerating={state.isGenerating}
            />
          )}
        </div>
      </div>
      
      <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 sm:p-4 sticky bottom-0">
        <div className="max-w-3xl mx-auto">
          <MessageInput 
            onSubmit={handleSubmit(onSendMessage)}
            register={register}
            isSubmitting={state.isGenerating}
          />
        </div>
      </div>
    </div>
  );
} 