'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { chatDB, agentDB, Chat as ChatType, ChatAgent, Message } from '@/lib/db';
import MessageList from '@/components/chat/MessageList';
import MessageInput from '@/components/chat/MessageInput';
import EmptyState from '@/components/chat/EmptyState';
import { useForm } from 'react-hook-form';
import { generateChatCompletion, type ApiMessage, toApiMessage } from '@/lib/openrouter';
import { trackMessageSent } from '@/lib/storage';
import AgentModal from '@/components/chat/AgentModal';
import { convertImageToBase64, supportsImages } from '@/lib/imageUtils';
import { useApiKey } from '@/hooks/useApiKey';
import { calculateChatCompletionPrice } from '@/lib/costUtils';
import { AgentRunSnapshot, useMcp } from '@/hooks/useMcp';
import AgentSidebar from '@/components/agent/AgentSidebar';
import Header from '@/components/chat/Header';
import { useTitleGenerator } from '@/hooks/useTitleGenerator';
import { useAiMessagesBuilder } from '@/hooks/useAiMessagesBuilder';
import { useKnowledgeManager } from '@/hooks/useKnowledgeManager';

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
    role: 'user',
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    content: contentForDisplay,
    rawContent,
  };
}

export default function SessionPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<ChatAgent | null>(null);
  const [currentChat, setCurrentChat] = useState<ChatType | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  
  const { register, handleSubmit, reset, setValue } = useForm<{ message: string; image?: File }>();
  const [loading, setLoading] = useState(true);
  const [showAgentModal, setShowAgentModal] = useState(false);

  const mysqlMcp = useMcp({isTesting: false});
  const [isAgentSidebarOpen, setIsAgentSidebarOpen] = useState(false);
  const [selectedRun, setSelectedAgentRun] = useState<{
    messageId: string;
    run: AgentRunSnapshot;
  } | null>(null);

  const { generateKnowledge, buildKnowledgeSystemMessage } = useKnowledgeManager(selectedAgent);

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

  const { isTitleGenerating } = useTitleGenerator({
    currentChat,
    selectedAgent,
    messages,
    setCurrentChat,
  });

  const buildApiMessages = useAiMessagesBuilder(selectedAgent);
  
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

  const saveMessages = useCallback(async (messages: Message[]) => {
    setMessages(messages);
    await chatDB.update(currentChat!.id, {
      messages: messages,
    });
  }, [currentChat]);

  const onSendMessage = async (data: { message: string; image?: File }) => {
    if (
      (!data.message.trim() && !data.image) 
      || isGenerating 
      || !selectedAgent 
      || !currentChat
    ) return;
    
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
    let updatedMessages = [...messages, userMessage];
    await saveMessages(updatedMessages);

    setIsGenerating(true);
    setStreamingContent('');
    
    try {
      let apiMessages: ApiMessage[] = await buildApiMessages(updatedMessages);
      let agentRunSnapshot: AgentRunSnapshot | null = null;
      
      // Optional: inject relevant stored knowledge as a system message
      if (selectedAgent.knowledgeGenerationPrompt && selectedAgent.knowledge?.length) {
        const { knowledgeSystemMessage } = await buildKnowledgeSystemMessage(apiMessages);

        if (knowledgeSystemMessage) {
          updatedMessages = [...updatedMessages, knowledgeSystemMessage];
          apiMessages = [...apiMessages, toApiMessage(knowledgeSystemMessage)];

          await saveMessages(updatedMessages);

        }
      }

      // Optional: orchestrate MySQL MCP tool calls and inject results as a synthetic system message
      if (selectedAgent.useMysqlMcp) {
        const { toolSystemMessage, runSnapshot } = await mysqlMcp.run({
          apiMessages, agent: selectedAgent, apiKey: apiKey!,
        });
        agentRunSnapshot = runSnapshot;

        if (toolSystemMessage) {
          updatedMessages = [...updatedMessages, toolSystemMessage];
          apiMessages = [...apiMessages, toApiMessage(toolSystemMessage)];

          await saveMessages(updatedMessages);

        }
      }
      
      const response = await generateChatCompletion({
        title: 'Assistant Response',
        messages: apiMessages,
        model: selectedAgent.modelName,
        apiKey: apiKey!,
        provider: selectedAgent.provider,
        isStreaming: true,
        maxTokens: 2000,
        onUpdate: (content) => {
          setStreamingContent(content);
        }
      });

      const assistantMessage: Message = {
        role: 'assistant',
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        content: response.content,
        agentRunSnapshot: agentRunSnapshot ?? undefined,
        price: calculateChatCompletionPrice({
          apiMessages,
          response,
          modelId: selectedAgent.modelName,
        }),
      };
      
      const finalMessages = [...updatedMessages, assistantMessage];
      await saveMessages(finalMessages);

      setIsGenerating(false);
      setStreamingContent(null);

      if (selectedAgent.knowledgeGenerationPrompt) {
        await generateKnowledge(finalMessages);
      }
    } catch (error) {
      console.error('Error generating response:', error);
      
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to generate response. Please check your API key and try again.'}`,
        createdAt: new Date().toISOString(),
      };
      
      const finalMessages = [...updatedMessages, errorMessage];
      
      await saveMessages(finalMessages);

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