import React, { useState, useEffect } from 'react';
import { ChatAgent, agentDB } from '@/lib/db';
import AgentModal from './AgentModal';
import AgentImport from './AgentImport';

interface AgentSelectorProps {
  onSelectAgent: (agent: ChatAgent) => void;
}

export default function AgentSelector({ onSelectAgent }: AgentSelectorProps) {
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const agentList = await agentDB.list();
      setAgents(agentList);
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAgent = async (agentData: Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newAgent = await agentDB.create(agentData);
      setAgents(prev => [newAgent, ...prev]);
      setShowCreateModal(false);
    } catch (error) {
      console.error('Failed to create agent:', error);
      alert('Failed to create agent. Please try again.');
    }
  };

  const handleDeleteAgent = async (agentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this agent?')) return;

    try {
      const success = await agentDB.delete(agentId);
      if (success) {
        setAgents(prev => prev.filter(agent => agent.id !== agentId));
      }
    } catch (error) {
      console.error('Failed to delete agent:', error);
      alert('Failed to delete agent. Please try again.');
    }
  };

  const handleExportAgent = (agent: ChatAgent, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Create export data without internal IDs and timestamps
    const exportData = {
      name: agent.name,
      systemPrompt: agent.systemPrompt,
      modelName: agent.modelName,
      provider: agent.provider,
      examplePrompts: agent.examplePrompts
    };
    
    // Convert to JSON string with pretty formatting
    const jsonString = JSON.stringify(exportData, null, 2);
    
    // Copy to clipboard
    navigator.clipboard.writeText(jsonString)
      .then(() => {
        alert('Agent configuration copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy:', err);
        
        // Fallback: Create a temporary textarea element to copy the text
        const textarea = document.createElement('textarea');
        textarea.value = jsonString;
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
          document.execCommand('copy');
          alert('Agent configuration copied to clipboard!');
        } catch (err) {
          console.error('Fallback copy failed:', err);
          alert('Failed to copy to clipboard. Please select and copy the following text manually:\n\n' + jsonString);
        }
        
        document.body.removeChild(textarea);
      });
  };

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Select an Agent</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-3 py-1 text-sm bg-purple-500 hover:bg-purple-600 text-white rounded"
          >
            Import Agent
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded"
          >
            Create Agent
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">
          Loading agents...
        </div>
      ) : agents.length === 0 ? (
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">
          <p className="mb-4">No agents found</p>
          <p className="text-sm">Create a new agent to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map(agent => (
            <div
              key={agent.id}
              onClick={() => onSelectAgent(agent)}
              className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">{agent.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Model: {agent.modelName}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Provider: {agent.provider}
                  </p>
                </div>
                <div className="flex space-x-1">
                  <button
                    onClick={(e) => handleExportAgent(agent, e)}
                    className="p-1 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    title="Export agent"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => handleDeleteAgent(agent.id, e)}
                    className="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    title="Delete agent"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <AgentModal
          onSubmit={handleCreateAgent}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {showImportModal && (
        <AgentImport
          onClose={() => setShowImportModal(false)}
          onImportSuccess={loadAgents}
        />
      )}
    </div>
  );
} 