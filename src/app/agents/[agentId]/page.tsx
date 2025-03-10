'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ChatSessionList from '@/components/chat/ChatSessionList';
import { agentDB, Chat, ChatAgent, chatDB } from '@/lib/db';
import AgentModal from '@/components/chat/AgentModal';
import { ArrowLeft } from 'lucide-react';

interface AgentState {
  showAgentSettingsModal: boolean;
}

export default function AgentPage() {
  const router = useRouter();
  const params = useParams();
  const agentId = params.agentId as string;

  const [state, setState] = useState<AgentState>({
    showAgentSettingsModal: false,
  });
  
  const [agentName, setAgentName] = useState<string>('');
  const [selectedAgent, setSelectedAgent] = useState<ChatAgent | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const loadAgent = async () => {
      try {
        const agent = await agentDB.get(agentId);
        if (agent) {
          setAgentName(agent.name);
          setSelectedAgent(agent);
        } else {
          // Agent not found, redirect to home
          router.push('/home');
        }
      } catch (error) {
        console.error('Failed to load agent:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadAgent();
  }, [agentId, router]);

  const handleAgentSettingsSubmit = async (agentData: Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>) => {
    // Update the selected agent with new settings
    if (selectedAgent) {
      const updatedAgent: ChatAgent = {
        ...selectedAgent,
        ...agentData,
        updatedAt: new Date().toISOString(),
      };
      
      try {
        // Save the updated agent to the database
        await agentDB.update(updatedAgent.id, {
          name: updatedAgent.name,
          systemPrompt: updatedAgent.systemPrompt,
          modelName: updatedAgent.modelName,
          provider: updatedAgent.provider,
          examplePrompts: updatedAgent.examplePrompts,
          oneShotExample: updatedAgent.oneShotExample,
        });
        
        // Update both the selectedAgent state and the agentName
        setSelectedAgent(updatedAgent);
        setAgentName(updatedAgent.name);
        
        // Close the modal
        setState(prevState => ({
          ...prevState,
          showAgentSettingsModal: false,
        }));
      } catch (error) {
        console.error('Failed to update agent:', error);
        alert('Failed to update agent. Please try again.');
      }
    }
  };
  
  const handleSelectChat = (chat: Chat) => {
    // Navigate to the chat session
    router.push(`/sessions/${chat.id}`);
  };
  
  const handleNewChat = async () => {
    try {
      // Create a new chat
      const newChat = await chatDB.create({
        title: `New chat with ${agentName}`,
        agentId: agentId,
        messages: [],
      });
      
      // Navigate to the new chat session
      router.push(`/sessions/${newChat.id}`);
    } catch (error) {
      console.error('Failed to create new chat:', error);
      alert('Failed to create new chat. Please try again.');
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
    <main className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <button
              onClick={() => router.push('/home')}
              className="p-2 mr-3 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-lg touch-manipulation"
              aria-label="Back to home"
              title="Back to home"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
                {agentName}
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Select a chat session or create a new one
              </p>
            </div>
          </div>

          <div className="flex space-x-2">
            <button
              onClick={() => setState(prevState => ({ ...prevState, showAgentSettingsModal: true }))}
              className="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded"
            >
              Agent Settings
            </button>
          </div>
        </div>
      </header>
      
      <div className="flex-1 p-4 md:p-6">
        <div className="max-w-3xl mx-auto">
          <ChatSessionList 
            agentId={agentId} 
            onSelectChat={handleSelectChat} 
            onNewChat={handleNewChat} 
          />
        </div>
      </div>


      {state.showAgentSettingsModal && selectedAgent && (
        <AgentModal
          initialAgent={selectedAgent}
          onSubmit={handleAgentSettingsSubmit}
          onClose={() => setState(prevState => ({ ...prevState, showAgentSettingsModal: false }))}
        />
      )}

    </main>
  );
} 