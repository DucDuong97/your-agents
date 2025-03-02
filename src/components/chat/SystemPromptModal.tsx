import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { getOpenRouterModels, getOpenAIModels, ModelInfo } from '@/lib/openrouter-client';

interface SystemPromptModalProps {
  initialSystemPrompt?: string;
  initialModelName?: string;
  initialProvider?: 'openrouter' | 'openai';
  onSubmit: (data: { 
    systemPrompt: string; 
    modelName: string; 
    apiKey: string;
    provider: 'openrouter' | 'openai';
  }) => void;
  onClose: () => void;
}

interface FormData {
  systemPrompt: string;
  modelName: string;
  apiKey: string;
  provider: 'openrouter' | 'openai';
}

export default function SystemPromptModal({
  initialSystemPrompt = 'You are a helpful assistant.',
  initialModelName = 'openai/gpt-3.5-turbo',
  initialProvider = 'openrouter',
  onSubmit,
  onClose,
}: SystemPromptModalProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Get the initial API keys from localStorage if available
  const getInitialApiKey = (provider: 'openrouter' | 'openai') => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`${provider}_api_key`) || '';
    }
    return '';
  };
  
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      systemPrompt: initialSystemPrompt,
      modelName: initialModelName,
      apiKey: getInitialApiKey(initialProvider),
      provider: initialProvider,
    },
  });
  
  // Watch the API key and provider to fetch models when they change
  const apiKey = watch('apiKey');
  const provider = watch('provider');

  // Update API key when provider changes
  useEffect(() => {
    setValue('apiKey', getInitialApiKey(provider));
    // Clear model selection when provider changes
    setValue('modelName', '');
  }, [provider, setValue]);

  // Fetch models when API key and provider are available
  useEffect(() => {
    const fetchModels = async () => {
      if (!apiKey) {
        // Set default models based on provider
        if (provider === 'openrouter') {
          setModels([
            { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', provider: 'openrouter' },
            { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', provider: 'openrouter' },
            { id: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'openrouter' },
            { id: 'google/gemini-pro', name: 'Gemini Pro', provider: 'openrouter' },
            { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openrouter' },
            { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openrouter' },
            { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'openrouter' },
            { id: 'meta-llama/llama-3-70b-instruct', name: 'Llama 3 70B', provider: 'openrouter' },
          ]);
        } else {
          setModels([
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' },
            { id: 'gpt-4', name: 'GPT-4', provider: 'openai' },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
            { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
          ]);
        }
        return;
      }
      
      try {
        let fetchedModels: ModelInfo[] = [];
        
        if (provider === 'openrouter') {
          fetchedModels = await getOpenRouterModels(apiKey);
        } else {
          fetchedModels = await getOpenAIModels(apiKey);
        }
        
        setModels(fetchedModels);
        
        // Set a default model if none is selected
        if (!watch('modelName') && fetchedModels.length > 0) {
          setValue('modelName', fetchedModels[0].id);
        }
      } catch (error) {
        console.error(`Error fetching ${provider} models:`, error);
        // Fallback models are provided by the get*Models functions
      }
    };

    // Debounce the API key changes to avoid too many requests
    const timeoutId = setTimeout(() => {
      fetchModels();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [apiKey, provider, setValue, watch]);

  const handleFormSubmit = (data: FormData) => {
    setLoading(true);
    
    // Save API key to localStorage
    if (typeof window !== 'undefined' && data.apiKey) {
      localStorage.setItem(`${data.provider}_api_key`, data.apiKey);
    }
    
    onSubmit(data);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
          Chat Settings
        </h2>
        
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              System Prompt
            </label>
            <textarea
              {...register('systemPrompt', { required: 'System prompt is required' })}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
              rows={4}
              placeholder="You are a helpful assistant."
            />
            {errors.systemPrompt && (
              <p className="mt-1 text-sm text-red-600">{errors.systemPrompt.message}</p>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              API Provider
            </label>
            <div className="flex space-x-4 mb-2">
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  {...register('provider')}
                  value="openrouter"
                  className="form-radio h-4 w-4 text-blue-600"
                />
                <span className="ml-2 text-gray-700 dark:text-gray-300">OpenRouter</span>
              </label>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  {...register('provider')}
                  value="openai"
                  className="form-radio h-4 w-4 text-blue-600"
                />
                <span className="ml-2 text-gray-700 dark:text-gray-300">OpenAI</span>
              </label>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {provider === 'openrouter' ? 'OpenRouter API Key' : 'OpenAI API Key'}
            </label>
            <input
              type="password"
              {...register('apiKey', { required: 'API key is required' })}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              placeholder={`Enter your ${provider === 'openrouter' ? 'OpenRouter' : 'OpenAI'} API key`}
            />
            {errors.apiKey && (
              <p className="mt-1 text-sm text-red-600">{errors.apiKey.message}</p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Your API key is stored locally in your browser and never sent to our servers.
            </p>
          </div>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              AI Model
            </label>
            <select
              {...register('modelName', { required: 'Model selection is required' })}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            >
              <option value="">Select a model</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
            {errors.modelName && (
              <p className="mt-1 text-sm text-red-600">{errors.modelName.message}</p>
            )}
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 