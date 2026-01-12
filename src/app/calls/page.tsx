'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { ApiMessage, LlmCallRecord } from '@/lib/openrouter';

const STORAGE_KEY = 'llm_calls';

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readCalls(): LlmCallRecord[] {
  if (typeof window === 'undefined') return [];
  const parsed = safeParseJson<unknown>(window.localStorage.getItem(STORAGE_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed as LlmCallRecord[];
}

function clearCalls() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function LlmCallModal({
  call,
  onClose,
}: {
  call: LlmCallRecord;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start gap-4 mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {call.title || '(untitled)'}
              </h2>
              <div className="mt-1 text-sm text-gray-600 dark:text-gray-300 space-y-1">
                <div>
                  <span className="font-medium">Created:</span> {formatDate(call.createdAt)}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    <span className="font-medium">Provider:</span> {call.provider}
                  </span>
                  <span>
                    <span className="font-medium">Model:</span> {call.model}
                  </span>
                  <span>
                    <span className="font-medium">Streaming:</span> {call.isStreaming ? 'Yes' : 'No'}
                  </span>
                  {typeof call.durationMs === 'number' && (
                    <span>
                      <span className="font-medium">Duration:</span> {call.durationMs}ms
                    </span>
                  )}
                  <span>
                    <span className="font-medium">Status:</span>{' '}
                    <span className={call.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}>
                      {call.status}
                    </span>
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {call.error && (
            <div className="mb-4 p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm whitespace-pre-wrap">
              {call.error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                Request
              </h3>
              {call?.requestBody?.messages.map((m: ApiMessage, i: number) => (
                <div key={i} className="mb-4">
                  <div className="font-semibold text-gray-800 dark:text-gray-200 mb-1">{m.role}</div>
                  <pre className="text-xs p-3 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-auto whitespace-pre-wrap">
                    {m.content as string}
                  </pre>
                </div>
              ))}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                Response
              </h3>
              <pre className="text-xs p-3 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-auto max-h-[50vh] whitespace-pre-wrap">
                {call.response ? call.response.content : '(no response)'}
              </pre>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-md"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CallsPage() {
  const [calls, setCalls] = useState<LlmCallRecord[]>([]);
  const [selected, setSelected] = useState<LlmCallRecord | null>(null);

  const sortedCalls = useMemo(() => {
    // Stored as a queue (oldest -> newest). Show newest first.
    return [...calls].reverse();
  }, [calls]);

  const refresh = () => setCalls(readCalls());

  useEffect(() => {
    refresh();
  }, []);

  return (
    <main className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="max-w-5xl mx-auto flex justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
              LLM Calls
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Stored locally in <span className="font-mono">localStorage</span> key <span className="font-mono">&quot;{STORAGE_KEY}&quot;</span> (max 20)
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={refresh}
              className="px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded"
            >
              Refresh
            </button>
            <button
              onClick={() => {
                if (confirm('Clear all stored LLM calls?')) {
                  clearCalls();
                  refresh();
                  setSelected(null);
                }
              }}
              className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded"
            >
              Clear
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 p-4 md:p-6">
        <div className="max-w-5xl mx-auto">
          {sortedCalls.length === 0 ? (
            <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm text-gray-700 dark:text-gray-200">
              No calls recorded yet.
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
                {sortedCalls.length} call{sortedCalls.length === 1 ? '' : 's'}
              </div>
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {sortedCalls.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelected(c)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 dark:text-white truncate">
                            {c.title || '(untitled)'}
                          </div>
                          <div className="mt-1 text-xs text-gray-600 dark:text-gray-300 flex flex-wrap gap-x-3 gap-y-1">
                            <span>{formatDate(c.createdAt)}</span>
                            <span className="font-mono">{c.provider}</span>
                            <span className="font-mono">{c.model}</span>
                            <span>{c.isStreaming ? 'stream' : 'non-stream'}</span>
                            <span className={c.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}>
                              {c.status}
                            </span>
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                          View
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <LlmCallModal
          call={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}


