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
  const initialText = useMemo(() => JSON.stringify(knowledge ?? {}, null, 2), [knowledge]);
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setText(initialText);
    setError(null);
  }, [open, initialText]);

  if (!open) return null;

  const handleSave = () => {
    try {
      const parsed = text.trim().length ? JSON.parse(text) : {};
      const normalized = normalizeKnowledgeMap(parsed);
      if (!normalized) {
        setError('Invalid format. Expected an object: { "key": ["value1", "value2"] }.');
        return;
      }
      onSave(normalized);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
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

        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            JSON format: <span className="font-mono">{`{ "key": ["value1", "value2"] }`}</span>
          </p>
          {error && (
            <div className="p-3 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 rounded">
              {error}
            </div>
          )}
          <textarea
            className="w-full h-80 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='{\n  "user_preferences": ["Likes concise answers"],\n  "projects": ["Working on your-agents app"]\n}'
          />
          <div className="flex justify-end gap-2">
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
    </div>
  );
}


