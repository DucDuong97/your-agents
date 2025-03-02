import React from 'react';

interface HeaderProps {
  agentName?: string;
  onOpenSettings: () => void;
  onOpenGlobalSettings: () => void;
  onOpenAgentSelector: () => void;
  onClearChat: () => void;
}

export default function Header({ 
  agentName, 
  onOpenSettings, 
  onOpenGlobalSettings,
  onOpenAgentSelector, 
  onClearChat 
}: HeaderProps) {
  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
      <div className="max-w-3xl mx-auto flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">
            AI Chat
          </h1>
          {agentName && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Agent: {agentName}
            </p>
          )}
        </div>
        <div className="flex space-x-2">
          <button
            onClick={onOpenAgentSelector}
            className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded"
          >
            Change Agent
          </button>
          <button
            onClick={onClearChat}
            className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded"
          >
            Clear Chat
          </button>
          <button
            onClick={onOpenSettings}
            className="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded"
          >
            Agent Settings
          </button>
          <button
            onClick={onOpenGlobalSettings}
            className="px-3 py-1 text-sm bg-purple-500 hover:bg-purple-600 text-white rounded"
          >
            API Keys
          </button>
        </div>
      </div>
    </header>
  );
} 