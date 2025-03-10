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
import { ArrowLeft, Home, Edit } from 'lucide-react';
import AgentModal from '@/components/chat/AgentModal';
import { getModels, getModelById } from '@/lib/modelUtils';

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
  
  const { register, handleSubmit, reset, setValue } = useForm<{ message: string; image?: File }>();
  const [loading, setLoading] = useState(true);
  const [showAgentModal, setShowAgentModal] = useState(false);
  
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
  
  const onSendMessage = async (data: { message: string; image?: File }) => {
    if ((!data.message.trim() && !data.image) || state.isGenerating) return;
    
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
    
    let messageContent = data.message;
    let contentForDisplay = data.message;
    
    // If there's an image, convert it to base64 and prepare it for display and API
    if (data.image) {
      try {
        const base64Image = await convertImageToBase64(data.image);
        
        // For display in the UI, we'll use markdown format
        contentForDisplay = `${data.message}\n\n![Uploaded Image](${base64Image})`;
        
        // For the API, we'll store the structured content format in a special field
        // This will be processed when sending to the API
        messageContent = JSON.stringify([
          {
            "type": "text",
            "text": data.message
          },
          {
            "type": "image_url",
            "image_url": {
              "url": `data:${data.image.type};base64,${base64Image.split(',')[1]}`
            }
          }
        ]);
      } catch (error) {
        console.error('Error processing image:', error);
        alert('Failed to process the image. Please try again.');
        return;
      }
    }
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: contentForDisplay, // Use the display-friendly content for UI
      createdAt: new Date().toISOString(),
      rawContent: data.image ? messageContent : undefined // Store structured content if there's an image
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
      ];
      
      // Add user and assistant messages with proper format
      for (const msg of updatedMessages) {
        if (msg.rawContent && msg.role === 'user') {
          // If the message has structured content (for images), use it
          apiMessages.push({
            role: msg.role,
            content: JSON.parse(msg.rawContent)
          });
        } else {
          // Otherwise use the regular content
          apiMessages.push({
            role: msg.role,
            content: msg.content
          });
        }
      }
      
      const response = await generateChatCompletion({
        messages: apiMessages,
        model: state.selectedAgent.modelName,
        apiKey,
        provider: state.selectedAgent.provider,
      });
      
      // Calculate price based on token usage and model pricing
      const modelInfo = getModelById(state.selectedAgent.modelName);
      const pricing = modelInfo?.pricing || { prompt: 0, completion: 0, image: 0 };
      
      // Use actual token counts from API response if available, otherwise estimate
      let promptTokens, completionTokens;
      
      if (response.usage) {
        // Use actual token counts from API
        promptTokens = response.usage.prompt_tokens;
        completionTokens = response.usage.completion_tokens;
      } else {
        // Estimate token count (rough approximation)
        const promptText = apiMessages.map(msg => 
          typeof msg.content === 'string' ? msg.content : 
          Array.isArray(msg.content) ? 
            msg.content.filter(item => item.type === 'text').map(item => item.text).join(' ') : 
            ''
        ).join(' ');
        const completionText = response.content;
        
        // Rough estimate: ~4 chars per token
        promptTokens = Math.ceil(promptText.length / 4);
        completionTokens = Math.ceil(completionText.length / 4);
      }
      
      // Count images in the conversation
      const imageCount = apiMessages.reduce((count, msg) => {
        if (Array.isArray(msg.content)) {
          return count + msg.content.filter(item => item.type === 'image_url').length;
        }
        return count;
      }, 0);
      
      // Calculate total cost in USD (convert from price per million tokens)
      const promptCost = (promptTokens / 1000000) * (pricing.prompt || 0);
      const completionCost = (completionTokens / 1000000) * (pricing.completion || 0);
      const imageCost = imageCount * (pricing.image || 0);
      const totalCost = promptCost + completionCost + imageCost;
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.content,
        createdAt: new Date().toISOString(),
        price: {
          promptTokens,
          completionTokens,
          imageCount,
          totalCost,
          promptCost,
          completionCost,
          imageCost
        }
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
  
  // Helper function to convert an image file to base64
  const convertImageToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert image to base64'));
        }
      };
      reader.onerror = () => {
        reject(new Error('Failed to read image file'));
      };
      reader.readAsDataURL(file);
    });
  };
  
  // Check if the selected model supports images
  const supportsImages = (): boolean => {
    if (!state.selectedAgent) return false;
    
    const models = getModels(state.selectedAgent.provider);
    const selectedModel = models.find(model => model.id === state.selectedAgent?.modelName);
    
    return selectedModel?.inputModalities?.includes('images') || false;
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
  
  const handleNavigateToSessions = () => {
    router.push(`/agents/${state.selectedAgent?.id}`);
  };

  const handleNavigateToHome = () => {
    router.push('/');
  };

  const handleEditAgent = () => {
    if (state.selectedAgent) {
      setShowAgentModal(true);
    }
  };
  
  const handleAgentUpdate = async (agentData: Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      if (state.selectedAgent) {
        const updatedAgent = await agentDB.update(state.selectedAgent.id, agentData);
        setState(prevState => ({
          ...prevState,
          selectedAgent: updatedAgent
        }));
        setShowAgentModal(false);
      }
    } catch (error) {
      console.error('Failed to update agent:', error);
      alert('Failed to update agent. Please try again.');
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
          <div className="flex items-center">
            <div className="flex space-x-2 mr-3">
              <button
                onClick={handleNavigateToSessions}
                className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-lg touch-manipulation"
                aria-label="Back to sessions"
                title="Back to sessions"
              >
                <ArrowLeft size={20} />
              </button>
              <button
                onClick={handleNavigateToHome}
                className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-lg touch-manipulation"
                aria-label="Home"
                title="Home"
              >
                <Home size={20} />
              </button>
            </div>
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
                <div className="flex items-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  <span className="truncate mr-1">{state.selectedAgent.name}</span>
                  {state.selectedAgent && (
                    <button
                      onClick={handleEditAgent}
                      className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded touch-manipulation"
                      aria-label="Edit agent"
                      title="Edit agent"
                    >
                      <Edit size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
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
            setValue={setValue}
            isSubmitting={state.isGenerating}
            supportsImages={supportsImages()}
          />
        </div>
      </div>
      
      {/* Agent Modal */}
      {showAgentModal && state.selectedAgent && (
        <AgentModal
          initialAgent={state.selectedAgent}
          onSubmit={handleAgentUpdate}
          onClose={() => setShowAgentModal(false)}
        />
      )}
    </div>
  );
} 