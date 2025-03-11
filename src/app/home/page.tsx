'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AgentSelector from '@/components/chat/AgentSelector';
import { ChatAgent, agentDB } from '@/lib/db';
import GlobalSettingsModal from '@/components/chat/GlobalSettingsModal';
import { getGlobalConfig, saveGlobalConfig, getUserActivity } from '@/lib/storage';
import UserInfoModal from '@/components/UserInfoModal';
import ActivityHeatmap from '@/components/ActivityHeatmap';
import { GlobalConfig, UserActivity } from '@/lib/types';

interface HomeState {
  showGlobalSettingsModal: boolean;
  showUserInfoModal: boolean;
  neededProviders: {
    openai: boolean;
    openrouter: boolean;
  };
}

export default function HomePage() {
  const router = useRouter();

  const [state, setState] = useState<HomeState>({
    showGlobalSettingsModal: false,
    showUserInfoModal: false,
    neededProviders: {
      openai: false,
      openrouter: false
    }
  });

  // Initialize with empty values to avoid hydration mismatch
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>({
    openrouterApiKey: '',
    openaiApiKey: '',
    userNickname: '',
    userJobTitle: ''
  });
  const [userActivity, setUserActivity] = useState<UserActivity>({
    dailyMessageCounts: {},
    currentStreak: 0,
    longestStreak: 0
  });
  
  // Load the config and activity data after component mounts
  useEffect(() => {
    setGlobalConfig(getGlobalConfig());
    setUserActivity(getUserActivity());
  }, []);
  
  const handleGlobalSettingsSubmit = (config: { openrouterApiKey: string; openaiApiKey: string }) => {
    const newConfig = { ...globalConfig, ...config };
    saveGlobalConfig(newConfig);
    setGlobalConfig(newConfig);
    setState(prevState => ({
      ...prevState,
      showGlobalSettingsModal: false,
    }));
  };

  const handleUserInfoSubmit = (data: { userNickname: string; userJobTitle: string }) => {
    const newConfig = { ...globalConfig, ...data };
    saveGlobalConfig(newConfig);
    setGlobalConfig(newConfig);
    setState(prevState => ({ ...prevState, showUserInfoModal: false }));
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

    // Check if user info is set
    const checkUserInfo = () => {
      const { userNickname, userJobTitle } = getGlobalConfig();
      if (!userNickname || !userJobTitle) {
        setState(prevState => ({ ...prevState, showUserInfoModal: true }));
      }
    };

    checkUserInfo();

    // Load latest user activity data
    setUserActivity(getUserActivity());
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
          {globalConfig.userNickname && (
            <div className="mb-6 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Welcome back, {globalConfig.userNickname}!
              </h2>
            </div>
          )}
          
          <div className="mb-6">
            <ActivityHeatmap activity={userActivity} />
          </div>
          
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

      {state.showUserInfoModal && (
        <UserInfoModal
          initialValues={globalConfig}
          onSubmit={handleUserInfoSubmit}
        />
      )}
    </main>
  );
} 