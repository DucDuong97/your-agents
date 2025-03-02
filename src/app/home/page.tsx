'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AgentSelector from '@/components/chat/AgentSelector';
import { ChatAgent, agentDB } from '@/lib/db';
import GlobalSettingsModal from '@/components/chat/GlobalSettingsModal';
import { getGlobalConfig, saveGlobalConfig } from '@/lib/storage';

interface HomeState {
  showGlobalSettingsModal: boolean;
  neededProviders: {
    openai: boolean;
    openrouter: boolean;
  };
}

export default function HomePage() {
  const router = useRouter();

  const [state, setState] = useState<HomeState>({
    showGlobalSettingsModal: false,
    neededProviders: {
      openai: false,
      openrouter: false
    }
  });

  const [globalConfig, setGlobalConfig] = useState(getGlobalConfig());
  
  const handleGlobalSettingsSubmit = (config: { openrouterApiKey: string; openaiApiKey: string }) => {
    saveGlobalConfig(config);
    setGlobalConfig(config);
    setState(prevState => ({
      ...prevState,
      showGlobalSettingsModal: false,
    }));
  };
  
  // Check if API keys are configured and which providers are needed
  useEffect(() => {
    const checkApiKeysAndProviders = async () => {
      const config = getGlobalConfig();
      const agents = await agentDB.list();
      
      // Determine which providers are used by existing agents
      const neededProviders = {
        openai: agents.some(agent => agent.provider === 'openai'),
        openrouter: agents.some(agent => agent.provider === 'openrouter')
      };
      
      // Show settings modal if any needed provider is missing its API key
      const needsOpenAI = neededProviders.openai && !config.openaiApiKey;
      const needsOpenRouter = neededProviders.openrouter && !config.openrouterApiKey;
      
      // If no agents exist yet, we don't need to show the modal
      const shouldShowModal = agents.length > 0 && (needsOpenAI || needsOpenRouter);
      
      setState(prev => ({ 
        ...prev, 
        showGlobalSettingsModal: shouldShowModal,
        neededProviders
      }));
    };
    
    checkApiKeysAndProviders();
  }, []);
  
  const handleSelectAgent = (agent: ChatAgent) => {
    // Check if the agent's provider has an API key
    const config = getGlobalConfig();
    const needsApiKey = 
      (agent.provider === 'openai' && !config.openaiApiKey) ||
      (agent.provider === 'openrouter' && !config.openrouterApiKey);
    
    if (needsApiKey) {
      // Update needed providers and show settings modal
      setState(prev => ({
        ...prev,
        showGlobalSettingsModal: true,
        neededProviders: {
          ...prev.neededProviders,
          [agent.provider]: true
        }
      }));
      return;
    }
    
    // Navigate to the agent's chat sessions
    router.push(`/agents/${agent.id}`);
  };
  
  return (
    <main className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
              AI Chat Assistant
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Select an agent to start chatting or create a new one
            </p>
          </div>

          <div className="flex space-x-2">
            <button
              onClick={() => setState(prevState => ({ ...prevState, showGlobalSettingsModal: true }))}
              className="px-3 py-1 text-sm bg-purple-500 hover:bg-purple-600 text-white rounded"
            >
              API Keys
            </button>
          </div>
        </div>
      </header>
      
      <div className="flex-1 p-4 md:p-6">
        <div className="max-w-3xl mx-auto">
          <AgentSelector 
            onSelectAgent={handleSelectAgent}
          />
        </div>
      </div>

      {state.showGlobalSettingsModal && (
        <GlobalSettingsModal
          initialConfig={globalConfig}
          onSubmit={handleGlobalSettingsSubmit}
          onClose={() => setState(prevState => ({ ...prevState, showGlobalSettingsModal: false }))}
          neededProviders={state.neededProviders}
        />
      )}
    </main>
  );
} 