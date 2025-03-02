'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AgentSelector from '@/components/chat/AgentSelector';
import { ChatAgent } from '@/lib/db';
import GlobalSettingsModal from '@/components/chat/GlobalSettingsModal';
import { getGlobalConfig, saveGlobalConfig } from '@/lib/storage';

interface HomeState {
  showGlobalSettingsModal: boolean;
}

export default function HomePage() {
  const router = useRouter();

  const [state, setState] = useState<HomeState>({
    showGlobalSettingsModal: false,
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
  
  // Check if API keys are configured
  useEffect(() => {
    const config = getGlobalConfig();
    if (!config.openrouterApiKey && !config.openaiApiKey) {
      setState(prev => ({ ...prev, showGlobalSettingsModal: true }));
    }
  }, []);
  
  const handleSelectAgent = (agent: ChatAgent) => {
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
        />
      )}
    </main>
  );
} 