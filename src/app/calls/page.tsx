'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { ApiMessage, LlmCallRecord } from '@/lib/openrouter';
import { generateChatCompletion } from '@/lib/openrouter';
import { getGlobalConfig } from '@/lib/storage';

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

function LlmCallModal({
  call,
  onClose,
}: {
  call: LlmCallRecord;
  onClose: () => void;
}) {
  const requestBody = call.requestBody as { messages?: ApiMessage[]; model?: string; max_tokens?: number; max_completion_tokens?: number };
  const messages = requestBody?.messages || [];
  const systemMessageIndex = messages.findIndex((m) => m.role === 'system');
  const systemMessage = systemMessageIndex >= 0 ? messages[systemMessageIndex] : null;
  const systemContent = systemMessage ? (typeof systemMessage.content === 'string' ? systemMessage.content : '') : '';

  const [isEditingSystemPrompt, setIsEditingSystemPrompt] = useState(false);
  const [editedSystemPrompt, setEditedSystemPrompt] = useState(systemContent);
  const [isResending, setIsResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [newResponse, setNewResponse] = useState<string | null>(null);

  useEffect(() => {
    setEditedSystemPrompt(systemContent);
    setIsEditingSystemPrompt(false);
    setResendError(null);
    setNewResponse(null);
  }, [call.id, systemContent]);

  const handleResend = async () => {
    if (!systemMessage) {
      setResendError('No system message found to edit');
      return;
    }

    const config = getGlobalConfig();
    const apiKey = call.provider === 'openrouter' ? config.openrouterApiKey : config.openaiApiKey;

    if (!apiKey) {
      setResendError(`No API key found for ${call.provider}. Please configure it in settings.`);
      return;
    }

    setIsResending(true);
    setResendError(null);

    try {
      // Create updated messages array with edited system prompt
      const updatedMessages: ApiMessage[] = messages.map((msg, idx) => {
        if (idx === systemMessageIndex) {
          return {
            ...msg,
            content: editedSystemPrompt,
          };
        }
        return msg;
      });

      const maxTokens = requestBody?.max_tokens || requestBody?.max_completion_tokens || 5000;

      const response = await generateChatCompletion({
        title: call.title,
        messages: updatedMessages,
        model: requestBody?.model || call.model,
        apiKey,
        provider: call.provider,
        isStreaming: call.isStreaming,
        maxTokens,
      });

      setNewResponse(response.content);
      setIsEditingSystemPrompt(false);
      
    } catch (error) {
      setResendError(error instanceof Error ? error.message : 'Failed to resend API call');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
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

          {resendError && (
            <div className="mb-4 p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm whitespace-pre-wrap">
              {resendError}
            </div>
          )}

          <div className="flex flex-col gap-6">
            {systemMessage && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    System Prompt
                  </h2>
                  <div className="flex gap-2">
                    {isEditingSystemPrompt ? (
                      <>
                        <button
                          onClick={() => {
                            setEditedSystemPrompt(systemContent);
                            setIsEditingSystemPrompt(false);
                            setNewResponse(null);
                          }}
                          className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded"
                          disabled={isResending}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleResend}
                          disabled={isResending}
                          className="px-3 py-1 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isResending ? 'Resending...' : 'Resend'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setIsEditingSystemPrompt(true)}
                        className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded"
                      >
                        Edit & Resend
                      </button>
                    )}
                  </div>
                </div>
                {isEditingSystemPrompt ? (
                  <>
                    <textarea
                      value={editedSystemPrompt}
                      onChange={(e) => setEditedSystemPrompt(e.target.value)}
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y font-mono"
                      placeholder="Enter system prompt..."
                    />
                    {newResponse && (
                      <div className="mt-4">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                          New Response
                        </h3>
                        <pre className="text-xs p-3 rounded-md bg-green-50 dark:bg-green-900/20 text-gray-900 dark:text-gray-100 overflow-auto max-h-[50vh] whitespace-pre-wrap border border-green-200 dark:border-green-800">
                          {newResponse}
                        </pre>
                      </div>
                    )}
                  </>
                ) : (
                  <pre className="text-xs p-3 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-auto whitespace-pre-wrap">
                    {systemContent || '(no system prompt)'}
                  </pre>
                )}
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
                Response
              </h2>
              <pre className="text-xs p-3 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-auto max-h-[50vh] whitespace-pre-wrap">
                {call.response ? call.response.content : '(no response)'}
              </pre>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
                Request
              </h2>
              {messages.map((m: ApiMessage, i: number) => (
                <div key={i} className="mb-4 flex gap-4">
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-1 w-20">{m.role}</div>
                  <pre className="text-xs p-3 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-auto whitespace-pre-wrap">
                    {typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 2)}
                  </pre>
                </div>
              ))}
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
  const [titleFilter, setTitleFilter] = useState<string>('');

  const uniqueTitles = useMemo(() => {
    const titles = new Set<string>();
    calls.forEach((call) => {
      const title = call.title || '(untitled)';
      titles.add(title);
    });
    return Array.from(titles).sort();
  }, [calls]);

  const sortedCalls = useMemo(() => {
    // Stored as a queue (oldest -> newest). Show newest first.
    let filtered = [...calls].reverse();
    if (titleFilter) {
      filtered = filtered.filter((call) => {
        const title = call.title || '(untitled)';
        return title === titleFilter;
      });
    }
    return filtered;
  }, [calls, titleFilter]);

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
          <div className="flex gap-2 items-center">
            {uniqueTitles.length > 0 && (
              <select
                value={titleFilter}
                onChange={(e) => setTitleFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Titles</option>
                {uniqueTitles.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
            )}
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


