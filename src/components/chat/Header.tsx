import React from 'react';
import { ArrowLeft, Home, Edit } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ChatAgent, Chat } from '@/lib/db';

interface HeaderProps {
  selectedAgent: ChatAgent;
  currentChat: Chat;
  isTitleGenerating: boolean;
  handleEditAgent: () => void;
  handleClearChat: () => void;
}

export default function Header({ 
  selectedAgent,
  currentChat,
  isTitleGenerating,
  handleEditAgent,
  handleClearChat,
}: HeaderProps) {

  const router = useRouter();
  const handleNavigateToSessions = () => {
    router.push(`/agents/${selectedAgent?.id}`);
  };

  const handleNavigateToHome = () => {
    router.push('/');
  };

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-3 sm:p-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div className="flex items-center min-w-0 flex-1">
              <button
                onClick={handleNavigateToHome}
                className="p-1 sm:p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-lg touch-manipulation"
                aria-label="Home"
                title="Home"
              >
                <Home size={18} />
              </button>
            <div className="flex-shrink-0 flex space-x-1 mr-2">
              <button
                onClick={handleNavigateToSessions}
                className="p-1 sm:p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-lg touch-manipulation"
                aria-label="Back to sessions"
                title="Back to sessions"
              >
                <ArrowLeft size={18} />
              </button>
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <h1 className="text-base sm:text-lg font-bold text-gray-800 dark:text-white truncate">
                {currentChat?.title 
                  ? (currentChat.title.length > 30 
                    ? currentChat.title.substring(0, 30) + '...' 
                    : currentChat.title)
                  : 'AI Chat'}
                {isTitleGenerating && (
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 animate-pulse">
                    ...
                  </span>
                )}
              </h1>
              {selectedAgent?.name && (
                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                  <span className="truncate max-w-[150px] sm:max-w-[200px]">
                    {selectedAgent.name.length > 25 
                      ? selectedAgent.name.substring(0, 25) + '...' 
                      : selectedAgent.name}
                  </span>
                  <button
                    onClick={handleEditAgent}
                    className="p-1 ml-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded touch-manipulation"
                    aria-label="Edit agent"
                    title="Edit agent"
                  >
                    <Edit size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 ml-2">
            <button
              onClick={handleClearChat}
              className="px-2 py-1 sm:px-3 sm:py-2 text-xs sm:text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg touch-manipulation"
            >
              Clear
            </button>
          </div>
        </div>
      </header>
  );
} 