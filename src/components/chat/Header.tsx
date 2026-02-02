import React, { useState, useEffect } from 'react';
import { ArrowLeft, Home, Edit, Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ChatAgent, Chat } from '@/lib/db';

interface HeaderProps {
  selectedAgent: ChatAgent;
  currentChat: Chat;
  isTitleGenerating: boolean;
  handleEditAgent: () => void;
  handleClearChat: () => void;
  handleUpdateChatTitle?: (newTitle: string) => void;
}

export default function Header({ 
  selectedAgent,
  currentChat,
  isTitleGenerating,
  handleEditAgent,
  handleClearChat,
  handleUpdateChatTitle,
}: HeaderProps) {

  const router = useRouter();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(currentChat?.title || '');

  // Update editedTitle when currentChat.title changes
  useEffect(() => {
    if (currentChat?.title) {
      setEditedTitle(currentChat.title);
    }
  }, [currentChat?.title]);

  const handleStartEdit = () => {
    setEditedTitle(currentChat?.title || '');
    setIsEditingTitle(true);
  };

  const handleSaveTitle = () => {
    if (handleUpdateChatTitle && editedTitle.trim()) {
      handleUpdateChatTitle(editedTitle.trim());
    }
    setIsEditingTitle(false);
  };

  const handleCancelEdit = () => {
    setEditedTitle(currentChat?.title || '');
    setIsEditingTitle(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };
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
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 text-base sm:text-lg font-bold text-gray-800 dark:text-white bg-transparent border-b-2 border-blue-500 focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveTitle}
                    className="p-1 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 rounded touch-manipulation"
                    aria-label="Save title"
                    title="Save title"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="p-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded touch-manipulation"
                    aria-label="Cancel editing"
                    title="Cancel editing"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-bold text-gray-800 dark:text-white truncate max-w-[calc(100%-2rem)]">
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
                  {handleUpdateChatTitle && !isTitleGenerating && (
                    <button
                      onClick={handleStartEdit}
                      className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded touch-manipulation flex-shrink-0"
                      aria-label="Edit title"
                      title="Edit title"
                    >
                      <Edit size={14} />
                    </button>
                  )}
                </div>
              )}
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