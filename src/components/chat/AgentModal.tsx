import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ChatAgent } from '@/lib/db';
import { getModels } from '@/lib/modelUtils';
import { generateExamplePrompts, generateExamplePromptsSync } from '@/lib/promptUtils';
import ModelSelect from './ModelSelect';

interface AgentModalProps {
  initialAgent?: Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'> | ChatAgent;
  onSubmit: (agent: Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}

export default function AgentModal({ initialAgent, onSubmit, onClose }: AgentModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, setValue, watch } = useForm<Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>>({
    defaultValues: initialAgent ? {
      name: initialAgent.name,
      systemPrompt: initialAgent.systemPrompt,
      modelName: initialAgent.modelName,
      provider: initialAgent.provider,
      examplePrompts: initialAgent.examplePrompts || [],
    } : {
      name: '',
      systemPrompt: 'You are a helpful assistant.',
      modelName: 'openai/gpt-3.5-turbo',
      provider: 'openrouter',
      examplePrompts: [],
    },
  });

  const currentProvider = watch('provider') as 'openrouter' | 'openai';
  const currentModelName = watch('modelName');
  
  // Get models for the current provider
  const models = getModels(currentProvider);

  // Ensure the selected model is valid for the current provider
  if (currentModelName && !models.some(model => model.id === currentModelName)) {
    // Set a default model for the selected provider
    const defaultModel = currentProvider === 'openrouter' ? 'openai/gpt-3.5-turbo' : 'gpt-3.5-turbo';
    setValue('modelName', defaultModel);
  }

  const handleFormSubmit = async (data: Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      // Show loading state
      setIsSubmitting(true);
      
      // Generate example prompts based on agent configuration
      let examplePrompts: string[];
      try {
        examplePrompts = await generateExamplePrompts(
          data.name,
          data.systemPrompt,
          data.provider
        );
      } catch (error) {
        console.error('Error generating example prompts:', error);
        // Fallback to sync version if API call fails
        examplePrompts = generateExamplePromptsSync(
          data.name,
          data.systemPrompt,
          data.provider
        );
      }
      
      // Submit the agent data with generated example prompts
      onSubmit({
        ...data,
        examplePrompts,
      });
    } catch (error) {
      console.error('Error in form submission:', error);
      alert('An error occurred while saving the agent. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle model change from the custom select
  const handleModelChange = (modelId: string) => {
    setValue('modelName', modelId);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
            {initialAgent ? 'Edit Agent' : 'Create New Agent'}
          </h2>
            
          <div className="mb-4">
          </div>
          
          <form onSubmit={handleSubmit(handleFormSubmit)}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Agent Name
              </label>
              <input
                {...register('name', { required: true })}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="My Assistant"
              />
            </div>

            <div className="mb-4 flex gap-4">
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Provider
                </label>
                <select
                  {...register('provider')}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                >
                  <option value="openrouter">OpenRouter</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>

              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Model
                </label>
                
                {models && models.length > 0 && (
                  <ModelSelect
                    models={models}
                    value={currentModelName}
                    onChange={handleModelChange}
                  />
                )}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                System Prompt
              </label>
              <textarea
                {...register('systemPrompt', { required: true })}
                className="text-sm w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                rows={15}
                placeholder="You are a helpful assistant."
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                This prompt defines the agent&apos;s personality and capabilities.
              </p>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save Agent'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 