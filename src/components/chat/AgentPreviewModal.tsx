import React from 'react';
import { ChatAgent } from '@/lib/db';

interface AgentPreviewModalProps {
  template: Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>;
  onSave: (template: Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}

export default function AgentPreviewModal({ template, onSave, onClose }: AgentPreviewModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Preview Template
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
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name
              </label>
              <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-md text-gray-900 dark:text-white">
                {template.name}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Provider
              </label>
              <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-md text-gray-900 dark:text-white">
                {template.provider}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Model
              </label>
              <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-md text-gray-900 dark:text-white">
                {template.modelName}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                System Prompt
              </label>
              <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-md text-gray-900 dark:text-white whitespace-pre-wrap">
                {template.systemPrompt}
              </div>
            </div>

            {template.oneShotExample && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  One-Shot Example
                </label>
                <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-md text-gray-900 dark:text-white whitespace-pre-wrap">
                  {template.oneShotExample}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-md"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(template)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md"
            >
              Use Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 