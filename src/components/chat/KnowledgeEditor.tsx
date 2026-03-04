import React, { useEffect, useMemo, useRef, useState } from 'react';

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
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingKeyValue, setEditingKeyValue] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const prevOpenRef = useRef(false);

  const sortedKeys = useMemo(
    () => Object.keys(editedKnowledge).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    [editedKnowledge]
  );

  useEffect(() => {
    const isOpening = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) return;
    if (isOpening) {
      const normalized = normalizeKnowledgeMap(knowledge) ?? {};
      setEditedKnowledge(normalized);
      setError(null);
      setEditingKey(null);
      setSelectedKey(null);
    }
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
    if (selectedKey === key) setSelectedKey(null);
    setError(null);
  };

  const handleAddField = () => {
    const newKey = `new_key_${Date.now()}`;
    setEditedKnowledge((prev) => {
      return { ...prev, [newKey]: [''] };
    });
    setSelectedKey(newKey);
    setError(null);
  };

  const handleAddItem = (key: string) => {
    setEditedKnowledge((prev) => {
      const updated = { ...prev };
      if (!updated[key]) {
        updated[key] = [];
      }
      updated[key] = [...updated[key], ''];
      return updated;
    });
    setError(null);
  };

  const handleKeyBlur = (oldKey: string, newKey: string) => {
    const trimmedKey = newKey.trim();
    setEditingKey(null);
    if (!trimmedKey || trimmedKey === oldKey) return;

    if (editedKnowledge[trimmedKey]) {
      setError(`Key "${trimmedKey}" already exists.`);
      return;
    }

    setEditedKnowledge((prev) => {
      const entries = Object.entries(prev);
      const newEntries = entries.map(([k, v]) =>
        k === oldKey ? [trimmedKey, v] : [k, v]
      );
      return Object.fromEntries(newEntries);
    });
    if (selectedKey === oldKey) setSelectedKey(trimmedKey);
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

        <div className="p-4 space-y-4 overflow-y-auto flex-1 flex flex-col min-h-0">
          {error && (
            <div className="p-3 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 rounded flex-shrink-0">
              {error}
            </div>
          )}

          <div className="flex gap-4 flex-1 min-h-0">
            {/* Key list (sorted ascending) */}
            <div className="flex-shrink-0 w-48 flex flex-col">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Keys</span>
              <ul className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-y-auto flex-1 min-h-0 bg-gray-50 dark:bg-gray-900/50">
                {sortedKeys.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No keys</li>
                ) : (
                  sortedKeys.map((key) => (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(key)}
                        className={`w-full text-left px-3 py-2 text-sm truncate border-b border-gray-200 dark:border-gray-700 last:border-b-0 ${
                          selectedKey === key
                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 font-medium'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        {key}
                      </button>
                    </li>
                  ))
                )}
              </ul>
              <button
                type="button"
                onClick={handleAddField}
                className="mt-2 w-full px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md border border-dashed border-blue-300 dark:border-blue-700 flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add key
              </button>
            </div>

            {/* Edit view for selected key */}
            <div className="flex-1 min-w-0 flex flex-col">
              {!selectedKey ? (
                <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm border border-gray-200 dark:border-gray-700 rounded-lg">
                  {sortedKeys.length === 0 ? 'Add a key to get started.' : 'Click a key to edit.'}
                </div>
              ) : (
                (() => {
                  const key = selectedKey;
                  const values = editedKnowledge[key] ?? [];
                  return (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex flex-col min-h-0">
                      <div className="flex items-center justify-between mb-3 flex-shrink-0">
                        <input
                          type="text"
                          value={editingKey === key ? editingKeyValue : key}
                          onChange={(e) => {
                            setEditingKey(key);
                            setEditingKeyValue(e.target.value);
                          }}
                          onFocus={() => {
                            setEditingKey(key);
                            setEditingKeyValue(key);
                          }}
                          onBlur={() => handleKeyBlur(key, editingKey === key ? editingKeyValue : key)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          className="flex-1 px-3 py-1 border border-blue-400 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Enter key name"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveField(key)}
                          className="ml-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                          aria-label={`Remove field ${key}`}
                          title="Remove field"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
                        {values.map((value, index) => (
                          <div key={index} className="flex items-start flex-shrink-0">
                            <textarea
                              rows={3}
                              value={value}
                              onChange={(e) => handleValueChange(key, index, e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y min-w-0"
                              placeholder={`Enter value ${index + 1}`}
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(key, index)}
                              className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 mt-1 flex-shrink-0"
                              aria-label={`Remove item ${index + 1}`}
                              title="Remove item"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => handleAddItem(key)}
                          className="w-full px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-dashed border-blue-300 dark:border-blue-700 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center justify-center gap-2 flex-shrink-0"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Add Item
                        </button>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
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


interface AddKnowledgeConfirmationModalProps {
  open: boolean;
  initialKey: string;
  initialValue: string;
  onCancel: () => void;
  onConfirm: (key: string, value: string) => void;
}

export function AddKnowledgeConfirmationModal({
  open,
  initialKey,
  initialValue,
  onCancel,
  onConfirm,
}: AddKnowledgeConfirmationModalProps) {
  const [key, setKey] = useState(initialKey);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (!open) return;
    setKey(initialKey);
    setValue(initialValue);
  }, [open, initialKey, initialValue]);

  if (!open) return null;

  const handleConfirm = () => {
    const trimmedKey = key.trim();
    const trimmedValue = value.trim();
    if (!trimmedKey || !trimmedValue) {
      return;
    }
    onConfirm(trimmedKey, trimmedValue);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-xl w-full max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            New Knowledge Generated
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Close add knowledge confirmation"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            A new knowledge entry was generated from your recent conversation. You can review and
            edit the key and value before it&apos;s saved.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Knowledge Key
              </label>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter a short, descriptive key"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Knowledge Value
              </label>
              <textarea
                rows={6}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                placeholder="Enter the detailed knowledge value"
              />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:text-gray-200 dark:hover:bg-gray-600 rounded-md"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md disabled:opacity-50"
            disabled={!key.trim() || !value.trim()}
          >
            Save Knowledge
          </button>
        </div>
      </div>
    </div>
  );
}


