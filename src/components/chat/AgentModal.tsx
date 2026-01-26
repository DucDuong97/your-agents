import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ChatAgent } from '@/lib/db';
import { getModels } from '@/lib/modelUtils';
import { generateExamplePrompts, generateExamplePromptsSync } from '@/lib/promptUtils';
import ModelSelect from './ModelSelect';
import SystemPromptEditor from './SystemPromptEditor';
import KnowledgeEditor from './KnowledgeEditor';
import { requestNotificationPermission } from '../../utils/pushNotifications';

interface AgentModalProps {
  initialAgent?: Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'> | ChatAgent;
  onSubmit: (agent: Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}

export default function AgentModal({ initialAgent, onSubmit, onClose }: AgentModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSystemPromptEditor, setShowSystemPromptEditor] = useState(false);
  const [showKnowledgeEditor, setShowKnowledgeEditor] = useState(false);
  const [oneShotEnabled, setOneShotEnabled] = useState(!!initialAgent?.oneShotExample);

  const { register, handleSubmit, setValue, watch } = useForm<Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>>({
    defaultValues: initialAgent ? {
      name: initialAgent.name,
      systemPrompt: initialAgent.systemPrompt,
      knowledgeGenerationPrompt: initialAgent.knowledgeGenerationPrompt ?? '',
      knowledge: initialAgent.knowledge ?? {},
      modelName: initialAgent.modelName,
      provider: initialAgent.provider,
      examplePrompts: initialAgent.examplePrompts || [],
      oneShotExample: initialAgent.oneShotExample || '',
      scheduledNotifications: initialAgent.scheduledNotifications || {
        enabled: false,
        time: '07:00',
        taskPrompt: '',
        lastSent: undefined
      },
      useMysqlMcp: initialAgent.useMysqlMcp ?? false,
      mysqlMcpEnv: initialAgent.mysqlMcpEnv ?? 'local',
    } : {
      name: '',
      systemPrompt: 'You are a helpful assistant.',
      knowledgeGenerationPrompt: '',
      knowledge: {},
      modelName: 'openai/gpt-3.5-turbo',
      provider: 'openrouter',
      examplePrompts: [],
      oneShotExample: '',
      scheduledNotifications: {
        enabled: false,
        time: '07:00',
        taskPrompt: '',
        lastSent: undefined
      },
      useMysqlMcp: false,
      mysqlMcpEnv: 'local',
    },
  });

  const currentProvider = watch('provider') as 'openrouter' | 'openai';
  const currentModelName = watch('modelName');
  const currentSystemPrompt = watch('systemPrompt');
  const currentKnowledge = watch('knowledge');
  const useMysqlMcp = watch('useMysqlMcp');
  
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
      
      // Handle push notification subscription if enabled
      if (data.scheduledNotifications?.enabled) {
        const permissionGranted = await requestNotificationPermission();
        if (!permissionGranted) {
          alert('Please enable notifications to receive scheduled messages');
          setIsSubmitting(false);
          return;
        }
      }
      
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

  // Handle system prompt change from the editor
  const handleSystemPromptChange = (newPrompt: string) => {
    setValue('systemPrompt', newPrompt);
  };

  const openKnowledgeEditor = () => setShowKnowledgeEditor(true);

  // Handle one-shot example toggle
  const handleOneShotToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOneShotEnabled(e.target.checked);
    if (!e.target.checked) {
      setValue('oneShotExample', '');
    }
  };

  // Combine input and output examples into the one-shot example format
  const handleExampleChange = (input: string, output: string) => {
    const formattedExample = `# Example\nUser: ${input}\nAssistant: ${output}`;
    setValue('oneShotExample', formattedExample);
  };

  // Extract input and output from one-shot example
  const extractExampleParts = () => {
    const example = watch('oneShotExample') || '';
    const userMatch = example.match(/User:\s*([\s\S]*?)(?=\nAssistant:|$)/);
    const assistantMatch = example.match(/Assistant:\s*([\s\S]*?)$/);
    
    return {
      input: userMatch ? userMatch[1].trim() : '',
      output: assistantMatch ? assistantMatch[1].trim() : ''
    };
  };

  const { input: exampleInput, output: exampleOutput } = extractExampleParts();

  const handleScheduledNotificationsToggle = (enabled: boolean) => {
    const currentSettings = watch('scheduledNotifications') || {
      enabled: false,
      time: '07:00',
      taskPrompt: '',
      lastSent: undefined
    };
    setValue('scheduledNotifications', {
      ...currentSettings,
      enabled,
      time: currentSettings.time || '07:00'
    });
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
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  System Prompt
                </label>
                <button
                  type="button"
                  onClick={() => setShowSystemPromptEditor(true)}
                  className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Open in Editor
                </button>
              </div>
              <textarea
                {...register('systemPrompt', { required: true })}
                className="text-sm w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white font-mono"
                rows={8}
                placeholder="You are a helpful assistant."
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                This prompt defines the agent&apos;s personality and capabilities.
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Knowledge Generation Prompt
              </label>
              <textarea
                {...register('knowledgeGenerationPrompt')}
                className="text-sm w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white font-mono"
                rows={4}
                placeholder="Optional: instructions for how this agent should generate/maintain its knowledge."
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Used when generating or updating the agent&apos;s stored knowledge (optional).
              </p>
            </div>

            {currentKnowledge && Object.keys(currentKnowledge).length > 0 && (
              <div className="mb-6">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Knowledge Map
                </label>
                <button
                  type="button"
                  onClick={openKnowledgeEditor}
                  className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Edit Knowledge
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {Object.keys(currentKnowledge).length} key{Object.keys(currentKnowledge).length === 1 ? '' : 's'} stored
              </p>
              </div>
            )}

            <div className="mb-6">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="useMysqlMcpToggle"
                  {...register('useMysqlMcp')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label
                  htmlFor="useMysqlMcpToggle"
                  className="ml-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Allow this agent to use MySQL MCP
                </label>
              </div>
              {useMysqlMcp && (
                <div className="mt-3 ml-6">
                  <label
                    htmlFor="mysqlMcpEnv"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Database Environment
                  </label>
                  <select
                    id="mysqlMcpEnv"
                    {...register('mysqlMcpEnv')}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="local">Local</option>
                    <option value="dev">Dev</option>
                    <option value="hotfix">Hotfix</option>
                    <option value="lab">Lab</option>
                    <option value="prod">Prod</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Select the database environment to connect to.
                  </p>
                </div>
              )}
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Enables access to the MySQL MCP server tools (query/tables/describe) for this agent.
              </p>
            </div>
            
            <div className="mb-6">
              <div className="flex items-center mb-2">
                <input
                  type="checkbox"
                  id="oneShotToggle"
                  checked={oneShotEnabled}
                  onChange={handleOneShotToggle}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="oneShotToggle" className="ml-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Enable One-Shot Prompting
                </label>
              </div>
              
              {oneShotEnabled && (
                <div className="mt-3 space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800">
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    One-shot prompting provides an example conversation to guide the model&apos;s responses.
                  </p>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Example User Input
                    </label>
                    <textarea
                      value={exampleInput}
                      onChange={(e) => handleExampleChange(e.target.value, exampleOutput)}
                      className="text-sm w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white font-mono"
                      rows={3}
                      placeholder="Enter an example user message"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Example Assistant Response
                    </label>
                    <textarea
                      value={exampleOutput}
                      onChange={(e) => handleExampleChange(exampleInput, e.target.value)}
                      className="text-sm w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white font-mono"
                      rows={4}
                      placeholder="Enter an example assistant response"
                    />
                  </div>
                </div>
              )}
            </div>
            
            <div className="mb-6">
              <div className="space-y-4">
                <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="scheduledNotificationsToggle"
                      checked={watch('scheduledNotifications.enabled')}
                      onChange={(e) => handleScheduledNotificationsToggle(e.target.checked)}
                      className="h-4 w-4 text-hsl(240, 100%, 50%)-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="scheduledNotificationsToggle" className="ml-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Enable Daily Messages at 7 AM
                    </label>
                  </div>

                  {watch('scheduledNotifications.enabled') && (
                    <div className="ml-6 mt-2 space-y-2">
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        You will receive a message from {watch('name')} every day at 7 AM.
                      </div>
                      
                      <div className="mt-2">
                        <label htmlFor="taskPrompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Task Description
                        </label>
                        <textarea
                          {...register('scheduledNotifications.taskPrompt')}
                          id="taskPrompt"
                          className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                          placeholder="Describe what this agent should remind you about (e.g., 'Remind me to exercise' or 'Help me plan my day')"
                          rows={3}
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          This description will be used to personalize the daily notifications.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
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
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* System Prompt Editor Modal */}
      {showSystemPromptEditor && (
        <SystemPromptEditor
          value={currentSystemPrompt}
          onChange={handleSystemPromptChange}
          onClose={() => setShowSystemPromptEditor(false)}
        />
      )}

      {/* Knowledge Map Editor Modal */}
      {showKnowledgeEditor && (
        <KnowledgeEditor
          open={showKnowledgeEditor}
          knowledge={currentKnowledge ?? {}}
          onClose={() => setShowKnowledgeEditor(false)}
          onSave={(knowledge) => setValue('knowledge', knowledge)}
        />
      )}
    </div>
  );
} 