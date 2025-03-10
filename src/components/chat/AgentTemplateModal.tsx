import React from 'react';
import agentTemplates from '@/assets/agentTemplates.json';
import { ChatAgent } from '@/lib/db';

interface AgentTemplateModalProps {
  onSelect: (template: Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}

export default function AgentTemplateModal({ onSelect, onClose }: AgentTemplateModalProps) {
  const handleTemplateSelect = (template: typeof agentTemplates[0]) => {
    onSelect({
      name: template.name,
      systemPrompt: template.systemPrompt,
      modelName: template.modelName || 'openai/gpt-3.5-turbo',
      provider: template.provider as 'openrouter' | 'openai',
      examplePrompts: [],
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Select Template
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            {agentTemplates.map((template, index) => (
              <div
                key={index}
                onClick={() => handleTemplateSelect(template)}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              >
                <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                  {template.name}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3">
                  {template.systemPrompt}
                </p>
                <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                  Provider: {template.provider}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 