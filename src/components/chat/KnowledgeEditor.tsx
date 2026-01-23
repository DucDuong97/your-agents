import React, { useEffect, useMemo, useState } from 'react';

export type KnowledgeMap = Record<string, string[]>;

interface KnowledgeEditorProps {
  open: boolean;
  knowledge: KnowledgeMap | undefined;
  onClose: () => void;
  onSave: (knowledge: KnowledgeMap) => void;
}

function normalizeKnowledgeMap(input: unknown): KnowledgeMap | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;
  const out: KnowledgeMap = {};

  for (const [k, v] of Object.entries(obj)) {
    const key = k.trim();
    if (!key) continue;
    if (!Array.isArray(v)) return null;
    const list = (v as unknown[])
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
    out[key] = list;
  }

  return out;
}

export default function KnowledgeEditor({ open, knowledge, onClose, onSave }: KnowledgeEditorProps) {
  const normalizedKnowledge = useMemo(() => {
    return normalizeKnowledgeMap(knowledge) ?? {};
  }, [knowledge]);

  const [editedKnowledge, setEditedKnowledge] = useState<KnowledgeMap>(normalizedKnowledge);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const normalized = normalizeKnowledgeMap(knowledge) ?? {};
    setEditedKnowledge(normalized);
    setError(null);
  }, [open, knowledge]);

  if (!open) return null;

  const handleValueChange = (key: string, index: number, newValue: string) => {
    setEditedKnowledge((prev) => {
      const updated = { ...prev };
      if (!updated[key]) {
        updated[key] = [];
      }
      const newArray = [...updated[key]];
      newArray[index] = newValue.trim();
      updated[key] = newArray;
      return updated;
    });
    setError(null);
  };

  const handleRemoveItem = (key: string, index: number) => {
    setEditedKnowledge((prev) => {
      const updated = { ...prev };
      if (!updated[key]) return updated;
      const newArray = [...updated[key]];
      newArray.splice(index, 1);
      if (newArray.length === 0) {
        // Remove the field if no items left
        return Object.fromEntries(Object.entries(updated).filter(([k]) => k !== key));
      }
      updated[key] = newArray;
      return updated;
    });
    setError(null);
  };

  const handleRemoveField = (key: string) => {
    setEditedKnowledge((prev) => {
      return Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key));
    });
    setError(null);
  };

  const handleSave = () => {
    const normalized = normalizeKnowledgeMap(editedKnowledge);
    if (!normalized) {
      setError('Invalid format. Expected an object: { "key": ["value1", "value2"] }.');
      return;
    }
    onSave(normalized);
    onClose();
  };

  const entries = Object.entries(editedKnowledge);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Edit Knowledge Map</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Close knowledge editor"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 rounded">
              {error}
            </div>
          )}

          {entries.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p>No knowledge entries to edit.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {entries.map(([key, values]) => (
                <div key={key} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-semibold text-gray-900 dark:text-white">
                      {key}
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRemoveField(key)}
                      className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                      aria-label={`Remove field ${key}`}
                      title="Remove field"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  <div className="space-y-2">
                    {values.map((value, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <textarea
                          rows={3}
                          value={value}
                          onChange={(e) => handleValueChange(key, index, e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                          placeholder={`Enter value ${index + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(key, index)}
                          className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 mt-1"
                          aria-label={`Remove item ${index + 1}`}
                          title="Remove item"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:text-gray-200 dark:hover:bg-gray-600 rounded-md"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md"
          >
            Save Knowledge
          </button>
        </div>
      </div>
    </div>
  );
}


