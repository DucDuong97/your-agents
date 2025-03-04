import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { ChatAgent } from '@/lib/db';
import { getOpenRouterModels, getOpenAIModels, ModelInfo } from '@/lib/openrouter-client';
import { getGlobalConfig } from '@/lib/storage';
import { generateExamplePrompts, generateExamplePromptsSync } from '@/lib/promptUtils';
import agentTemplates from '@/app/assets/agentTemplates.json';

interface AgentTemplate {
  name: string;
  systemPrompt: string;
  modelName: string;
  provider: string;
}

interface AgentModalProps {
  initialAgent?: Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'> | ChatAgent;
  onSubmit: (agent: Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}

export default function AgentModal({ initialAgent, onSubmit, onClose }: AgentModalProps) {
  const [openRouterModels, setOpenRouterModels] = useState<ModelInfo[]>([]);
  const [openAIModels, setOpenAIModels] = useState<ModelInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<'openrouter' | 'openai'>(
    initialAgent?.provider || 'openrouter'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, setValue, watch, reset } = useForm<Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>>({
    defaultValues: initialAgent ? {
      name: initialAgent.name,
      systemPrompt: initialAgent.systemPrompt,
      modelName: initialAgent.modelName,
      provider: initialAgent.provider,
      examplePrompts: initialAgent.examplePrompts || [],
    } : {
      name: '',
      systemPrompt: 'You are a helpful assistant.',
      modelName: selectedProvider === 'openrouter' ? 'openai/gpt-3.5-turbo' : 'gpt-3.5-turbo',
      provider: 'openrouter',
      examplePrompts: [],
    },
  });

  const watchProvider = watch('provider');

  const handleTemplateSelect = (template: AgentTemplate) => {
    reset({
      name: template.name,
      systemPrompt: template.systemPrompt,
      modelName: template.modelName,
      provider: template.provider as 'openrouter' | 'openai',
      examplePrompts: [],
    });
    setSelectedProvider(template.provider as 'openrouter' | 'openai');
  };

  useEffect(() => {
    // Load available models
    const loadModels = async () => {
      try {
        const config = getGlobalConfig();
        const orModels = await getOpenRouterModels(config.openrouterApiKey);
        setOpenRouterModels(orModels);
        
        const oaiModels = await getOpenAIModels(config.openaiApiKey);
        setOpenAIModels(oaiModels);
      } catch (error) {
        console.error('Failed to load models:', error);
        // Fallback models will be provided by the API functions
      }
    };
    
    loadModels();
  }, []);

  useEffect(() => {
    if (watchProvider !== selectedProvider) {
      setSelectedProvider(watchProvider as 'openrouter' | 'openai');
      
      // Set default model for the selected provider
      if (watchProvider === 'openrouter') {
        setValue('modelName', 'openai/gpt-3.5-turbo');
      } else {
        setValue('modelName', 'gpt-3.5-turbo');
      }
    }
  }, [watchProvider, selectedProvider, setValue]);

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
            {initialAgent ? 'Edit Agent' : 'Create New Agent'}
          </h2>
          
          <form onSubmit={handleSubmit(handleFormSubmit)}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Template (Optional)
              </label>
              <select
                onChange={(e) => {
                  const template = agentTemplates.find(t => t.name === e.target.value);
                  if (template) {
                    handleTemplateSelect(template);
                  }
                }}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white mb-4"
              >
                <option value="">Select a template...</option>
                {agentTemplates.map((template, index) => (
                  <option key={index} value={template.name}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
            
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
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                System Prompt
              </label>
              <textarea
                {...register('systemPrompt', { required: true })}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                rows={4}
                placeholder="You are a helpful assistant."
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                This prompt defines the agent&apos;s personality and capabilities.
              </p>
            </div>
            
            <div className="mb-4">
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
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Model
              </label>
              <select
                {...register('modelName', { required: true })}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              >
                {selectedProvider === 'openrouter' ? (
                  openRouterModels.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))
                ) : (
                  openAIModels.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))
                )}
              </select>
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