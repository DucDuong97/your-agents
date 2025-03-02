import React from 'react';
import { ChatAgent } from '@/lib/db';

interface EmptyStateProps {
  onSendMessage: (content: string) => void;
  agent?: ChatAgent | null;
}

export default function EmptyState({ onSendMessage, agent }: EmptyStateProps) {
  
  // Default example prompts if no agent is provided or agent has no example prompts
  const defaultExamplePrompts = [
    "Explain quantum computing in simple terms",
    "Write a short story about a robot learning to love",
    "What are the best practices for React development?",
    "How do I improve my productivity as a developer?"
  ];
  
  // Use agent's example prompts if available, otherwise use defaults
  const examplePrompts = agent?.examplePrompts?.length ? agent.examplePrompts : defaultExamplePrompts;
  
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
          {agent ? `Chat with ${agent.name}` : 'Welcome to AI Chat'}
        </h2>
        <p className="text-gray-600 dark:text-gray-400 max-w-md">
          {agent 
            ? `This agent is powered by ${agent.provider === 'openai' ? 'OpenAI' : 'OpenRouter'}'s ${agent.modelName} model.`
            : 'Start a conversation with an AI assistant. You can ask questions, get creative content, or just chat.'}
        </p>
      </div>
      
      <div className="w-full max-w-md mb-8">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Try an example:
        </h3>
        <div className="grid grid-cols-1 gap-2">
          {examplePrompts.map((prompt, index) => (
            <button
              key={index}
              onClick={() => onSendMessage(prompt)}
              className="text-left p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
} 