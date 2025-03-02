import React, { useState } from 'react';
import { agentDB } from '@/lib/db';

interface AgentImportProps {
  onClose: () => void;
  onImportSuccess?: () => void;
}

export default function AgentImport({ onClose, onImportSuccess }: AgentImportProps) {
  const [importText, setImportText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleImportAgents = async () => {
    try {
      setIsImporting(true);
      setError(null);
      setSuccess(null);
      
      if (!importText.trim()) {
        setError('Please paste the agent configuration to import.');
        return;
      }
      
      let importData;
      try {
        importData = JSON.parse(importText);
      } catch {
        setError('Invalid JSON format. Please check your input.');
        return;
      }
      
      // Handle both single agent and array of agents
      const agentsToImport = Array.isArray(importData) ? importData : [importData];
      
      let importedCount = 0;
      
      for (const agentData of agentsToImport) {
        // Validate required fields
        if (!agentData.name || !agentData.systemPrompt || !agentData.modelName || !agentData.provider) {
          console.warn('Skipping invalid agent data:', agentData);
          continue;
        }
        
        try {
          // Generate example prompts if not provided
          let examplePrompts = [];
          if (agentData.examplePrompts && Array.isArray(agentData.examplePrompts) && agentData.examplePrompts.length > 0) {
            examplePrompts = agentData.examplePrompts;
          }
          
          // Create the agent
          await agentDB.create({
            name: agentData.name,
            systemPrompt: agentData.systemPrompt,
            modelName: agentData.modelName,
            provider: agentData.provider as 'openrouter' | 'openai',
            examplePrompts
          });
          
          importedCount++;
        } catch (error) {
          console.error('Error importing agent:', agentData.name, error);
        }
      }
      
      if (importedCount > 0) {
        setSuccess(`Successfully imported ${importedCount} agent${importedCount > 1 ? 's' : ''}.`);
        setError(null);
        setImportText('');
        
        if (onImportSuccess) {
          onImportSuccess();
        }
      } else {
        setError('No valid agents found in the import data.');
        setSuccess(null);
      }
    } catch (error) {
      console.error('Failed to import agents:', error);
      setError('Failed to import agents. Please check the format and try again.');
      setSuccess(null);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Import Agent</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 120px)' }}>
          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 rounded">
              {error}
            </div>
          )}
          
          {success && (
            <div className="mb-4 p-3 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200 rounded">
              {success}
            </div>
          )}
          
          <div>
            <p className="mb-4 text-gray-700 dark:text-gray-300">
              Paste the agent configuration JSON below to import.
            </p>
            <textarea
              className="w-full h-64 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='{"name":"Example Agent","systemPrompt":"You are a helpful assistant","modelName":"gpt-3.5-turbo","provider":"openai","examplePrompts":["What can you help me with?"]}'
            />
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleImportAgents}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                disabled={isImporting}
              >
                {isImporting ? (
                  <span className="flex items-center">
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                    Importing...
                  </span>
                ) : 'Import Agent'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 