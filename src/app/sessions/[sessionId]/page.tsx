'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { chatDB, agentDB, Chat as ChatType, ChatAgent, Message } from '@/lib/db';
import MessageList from '@/components/chat/MessageList';
import MessageInput from '@/components/chat/MessageInput';
import EmptyState from '@/components/chat/EmptyState';
import { useForm } from 'react-hook-form';
import { generateChatCompletion, ApiMessage } from '@/lib/openrouter-client';
import { getGlobalConfig, trackMessageSent } from '@/lib/storage';
import { generateChatTitle } from '@/lib/promptUtils';
import AgentModal from '@/components/chat/AgentModal';
import { convertImageToBase64, supportsImages } from '@/lib/imageUtils';
import { useApiKey } from '@/hooks/useApiKey';
import { calculateChatCompletionPrice } from '@/lib/costUtils';
import { AgentRunSnapshot, useMysqlMcp } from '@/agents/mysql';
import AgentSidebar from '@/components/agent/AgentSidebar';
import Header from '@/components/chat/Header';

async function buildUserMessage(data: { message: string; image?: File }): Promise<Message> {
  let contentForDisplay = data.message;
  let rawContent: string | undefined;

  if (data.image) {
    const base64Image = await convertImageToBase64(data.image);

    // For display in the UI, we'll use markdown format
    contentForDisplay = `${data.message}\n\n![Uploaded Image](${base64Image})`;

    // For the API, store the structured content format in a special field
    rawContent = JSON.stringify([
      {
        type: 'text',
        text: data.message,
      },
      {
        type: 'image_url',
        image_url: {
          url: `data:${data.image.type};base64,${base64Image.split(',')[1]}`,
        },
      },
    ]);
  }

  return {
    id: Date.now().toString(),
    role: 'user',
    content: contentForDisplay,
    createdAt: new Date().toISOString(),
    rawContent,
  };
}

export default function SessionPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;
  const titleGeneratedForChatRef = useRef<string | null>(null);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<ChatAgent | null>(null);
  const [currentChat, setCurrentChat] = useState<ChatType | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTitleGenerating, setIsTitleGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  
  const { register, handleSubmit, reset, setValue } = useForm<{ message: string; image?: File }>();
  const [loading, setLoading] = useState(true);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const mysqlMcp = useMysqlMcp({isTesting: false});
  const [isAgentSidebarOpen, setIsAgentSidebarOpen] = useState(false);
  const [selectedRun, setSelectedAgentRun] = useState<{
    messageId: string;
    run: AgentRunSnapshot;
  } | null>(null);

  // Open sidebar after planning succeeds (i.e. tasks exist). Exclude planning time by not opening until tasks are set.
  useEffect(() => {
    if (selectedAgent?.useMysqlMcp && mysqlMcp.tasks.length > 0) {
      setIsAgentSidebarOpen(true);
    }
  }, [selectedAgent?.useMysqlMcp, mysqlMcp.tasks.length]);

  // Prevent reopening older runs while executing; keep sidebar locked to the live run.
  useEffect(() => {
    if (mysqlMcp.isExecuting) {
      setSelectedAgentRun(null);
      setIsAgentSidebarOpen(true);
    }
  }, [mysqlMcp.isExecuting]);

  const handleAssistantMessageClick = useCallback((message: Message) => {
    if (mysqlMcp.isExecuting) return; // don't reopen historical runs during execution
    const run = message.agentRunSnapshot as AgentRunSnapshot | undefined;
    if (!run || run.version !== 1) return;
    setSelectedAgentRun({ messageId: message.id, run });
    setIsAgentSidebarOpen(true);
  }, [mysqlMcp.isExecuting]);

  // Check if API key is available for the selected provider
  const { getApiKeyForAgentOrRedirect } = useApiKey();
  const apiKey = getApiKeyForAgentOrRedirect(selectedAgent);

  const buildApiMessages = useCallback((messagesForApi: Message[]): ApiMessage[] => {
    if (!selectedAgent) return [];

    const apiMessages: ApiMessage[] = [];

    // Get user information from global config
    const { userNickname, userJobTitle } = getGlobalConfig();

    // Add the system prompt first
    const systemPrompt = selectedAgent.oneShotExample
      ? `${selectedAgent.systemPrompt}\n\n${selectedAgent.oneShotExample}`
      : selectedAgent.systemPrompt;
    let enhancedSystemPrompt = systemPrompt;

    // Add user information to the system prompt if available
    if (userNickname && userJobTitle) {
      const userInfoPrompt = `\n\nYou are chatting with ${userNickname}, who works as a ${userJobTitle}.`;
      enhancedSystemPrompt = `${systemPrompt}${userInfoPrompt}`;
    }

    apiMessages.push({
      role: 'system',
      content: enhancedSystemPrompt,
    });

    // Add the chat history
    for (const msg of messagesForApi) {
      // Skip system messages as we already added our enhanced system prompt
      if (msg.role === 'system') continue;

      // Handle messages with images
      if (msg.rawContent && msg.role === 'user') {
        // If the message has structured content (for images), use it
        apiMessages.push({
          role: msg.role,
          content: JSON.parse(msg.rawContent),
        });
      } else {
        // Otherwise use the regular content
        apiMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    return apiMessages;
  }, [selectedAgent]);
  
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
        
        // Mark the chat as read if it's unread
        if (chat.unread) {
          const updatedChat = await chatDB.markAsRead(chat.id);
          if (updatedChat) {
            // Use the updated chat
            setCurrentChat(updatedChat);
            setMessages(updatedChat.messages);
            setSelectedAgent(agent);
          } else {
            setCurrentChat(chat);
            setMessages(chat.messages);
            setSelectedAgent(agent);
          }
        } else {
          setCurrentChat(chat);
          setMessages(chat.messages);
          setSelectedAgent(agent);
        }
      } catch (error) {
        console.error('Failed to load chat data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadChatData();
  }, [sessionId, router]);

  // Generate a title for the chat if it doesn't have one
  useEffect(() => {
    const maybeGenerateTitle = async () => {
      if (!currentChat || !selectedAgent) return;
      if (isTitleGenerating) return;

      const placeholderTitle = `New chat with ${selectedAgent.name}`;
      if (currentChat.title !== placeholderTitle) return;

      const userMessages = messages.filter(msg => msg.role === 'user');
      const assistantMessages = messages.filter(msg => msg.role === 'assistant');
      if (userMessages.length !== 1) return;
      if (assistantMessages.length > 0) return;

      if (titleGeneratedForChatRef.current === currentChat.id) return;

      // Mark as attempted so we don't spam title generation on re-renders
      titleGeneratedForChatRef.current = currentChat.id;

      const firstUserMessage = userMessages[0];
      const firstMessageText = (() => {
        if (firstUserMessage.rawContent) {
          try {
            const parsed: unknown = JSON.parse(firstUserMessage.rawContent);
            if (Array.isArray(parsed)) {
              const textParts = parsed
                .map((item: unknown) => {
                  if (!item || typeof item !== 'object') return '';
                  const maybeType = (item as { type?: unknown }).type;
                  if (maybeType !== 'text') return '';
                  const maybeText = (item as { text?: unknown }).text;
                  return typeof maybeText === 'string' ? maybeText : '';
                })
                .join(' ')
                .trim();
              if (textParts) return textParts;
            }
          } catch {
            // Fall back below
          }
        }

        // Avoid including giant image data URLs from markdown embeds
        return firstUserMessage.content.replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
      })();

      try {
        setIsTitleGenerating(true);

        const title = await generateChatTitle(
          firstMessageText,
          selectedAgent.provider,
          apiKey!
        );

        await chatDB.update(currentChat.id, { title });

        // Update local state immediately so header reflects new title without reload
        setCurrentChat(prev => (prev ? { ...prev, title } : prev));
      } catch (error) {
        console.error('Error generating chat title:', error);
      } finally {
        setIsTitleGenerating(false);
      }
    };

    void maybeGenerateTitle();
  }, [
    currentChat,
    selectedAgent,
    messages,
    isTitleGenerating,
    apiKey,
  ]);
  
  const onSendMessage = async (data: { message: string; image?: File }) => {
    if ((!data.message.trim() && !data.image) || isGenerating) return;
    
    // Check if agent is selected
    if (!selectedAgent || !currentChat) {
      router.push('/home');
      return;
    }
    
    // Reset the form after sending
    reset();
    
    // Track this message for streak counting
    trackMessageSent();
    
    let userMessage: Message;
    try {
      userMessage = await buildUserMessage(data);
    } catch (error) {
      console.error('Error processing image:', error);
      alert('Failed to process the image. Please try again.');
      return;
    }
    
    // Add message to current chat
    const updatedMessages = [...messages, userMessage];
    
    setMessages(updatedMessages);
    
    // Update the chat in the database
    await chatDB.update(currentChat.id, { 
      messages: updatedMessages,
    });

    setIsGenerating(true);
    setStreamingContent('');
    
    try {
      let apiMessages = buildApiMessages(updatedMessages);
      let agentRunSnapshot: AgentRunSnapshot | null = null;

      // Optional: orchestrate MySQL MCP tool calls and inject results as a synthetic system message
      if (selectedAgent.useMysqlMcp) {
        try {
          const { toolSystemMessage, runSnapshot } = await mysqlMcp.run({
            apiMessages,
            agent: selectedAgent,
            apiKey: apiKey!,
          });
          agentRunSnapshot = runSnapshot;

          if (toolSystemMessage) {
            apiMessages = [apiMessages[0], toolSystemMessage, ...apiMessages.slice(1)];
          }
        } catch (e) {
          console.warn('MySQL MCP orchestration failed; continuing without tools:', e);
        }
      }
      
      const response = await generateChatCompletion({
        messages: apiMessages,
        model: selectedAgent.modelName,
        apiKey: apiKey!,
        provider: selectedAgent.provider,
        isStreaming: true,
        onUpdate: (content) => {
          setStreamingContent(content);
        }
      });

      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: response.content,
        createdAt: new Date().toISOString(),
        agentRunSnapshot: agentRunSnapshot ?? undefined,
        price: calculateChatCompletionPrice({
          apiMessages,
          response,
          modelId: selectedAgent.modelName,
        }),
      };
      
      const finalMessages = [...updatedMessages, assistantMessage];
      
      setMessages(finalMessages);
      
      // Update the chat in the database
      await chatDB.update(currentChat.id, { 
        messages: finalMessages,
      });

      setIsGenerating(false);
      setStreamingContent(null);
    } catch (error) {
      console.error('Error generating response:', error);
      
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to generate response. Please check your API key and try again.'}`,
        createdAt: new Date().toISOString(),
      };
      
      const finalMessages = [...updatedMessages, errorMessage];
      
      setMessages(finalMessages);
      // Update the chat in the database
      await chatDB.update(currentChat.id, { 
        messages: finalMessages,
      });

      setIsGenerating(false);
      setStreamingContent(null);
    }
  };
  
  const handleClearChat = () => {
    if (!currentChat) return;
    
    if (confirm('Are you sure you want to clear this chat?')) {
      const clearedChat = {
        ...currentChat,
        messages: [],
      };
      
      chatDB.update(currentChat.id, { messages: [] });
      
      setCurrentChat(clearedChat);
      setMessages([]);
    }
  };

  const handleEditAgent = () => {
    if (selectedAgent) {
      setShowAgentModal(true);
    }
  };
  
  const handleAgentUpdate = async (agentData: Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      if (selectedAgent) {
        const updatedAgent = await agentDB.update(selectedAgent.id, agentData);
        setSelectedAgent(updatedAgent);
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
      <Header
        selectedAgent={selectedAgent!}
        currentChat={currentChat!}
        isTitleGenerating={isTitleGenerating}
        handleEditAgent={handleEditAgent}
        handleClearChat={handleClearChat}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Main chat column */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6">
            <div className="max-w-3xl mx-auto">
              {messages.length === 0 ? (
                <EmptyState 
                  onSendMessage={(content) => {
                    onSendMessage({ message: content });
                  }} 
                  agent={selectedAgent}
                />
              ) : (
                <MessageList 
                  messages={messages}
                  isGenerating={isGenerating}
                  streamingContent={streamingContent}
                  onAssistantMessageClick={handleAssistantMessageClick}
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
                isSubmitting={isGenerating}
                supportsImages={supportsImages(selectedAgent)}
              />
            </div>
          </div>
        </div>

        {/* Right sidebar (desktop) + drawer (mobile) */}
        {selectedAgent?.useMysqlMcp && (mysqlMcp.reasoning.length > 0 || selectedRun) && (
          <div className="hidden md:block">
            <AgentSidebar
              open={isAgentSidebarOpen}
              onClose={() => setIsAgentSidebarOpen(false)}
              isExecuting={mysqlMcp.isExecuting}
              error={selectedRun ? selectedRun.run.error : mysqlMcp.error}
              reasoning={selectedRun ? selectedRun.run.reasoning : mysqlMcp.reasoning}
              tasks={selectedRun ? selectedRun.run.tasks : mysqlMcp.tasks}
              toolCallsByTask={selectedRun ? selectedRun.run.toolCallsByTask : mysqlMcp.toolCallsByTask}
              resultsByTask={selectedRun ? selectedRun.run.resultsByTask : mysqlMcp.resultsByTask}
            />
          </div>
        )}
      </div>
      
      {/* Agent Modal */}
      {showAgentModal && selectedAgent && (
        <AgentModal
          initialAgent={selectedAgent}
          onSubmit={handleAgentUpdate}
          onClose={() => setShowAgentModal(false)}
        />
      )}
    </div>
  );
} 