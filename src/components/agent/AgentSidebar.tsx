'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { MysqlPlannedCall, MysqlResultsByTask, MysqlToolCallsByTask, MysqlToolResult, MysqlToolResultContent } from '@/agents/mysql';

type Props = {
  open: boolean;
  onClose: () => void;

  // Execution state
  isExecuting: boolean;
  error: string | null;

  // Planner output
  reasoning: string;
  tasks: string[];

  // Tool execution
  toolCallsByTask: MysqlToolCallsByTask[];
  resultsByTask: MysqlResultsByTask[];
};

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `[unserializable: ${msg}]`;
  }
}

function formatMaybeJson(value: unknown): { formatted: string; isJson: boolean } {
  // If MCP returns non-string, stringify it safely.
  if (typeof value !== 'string') return { formatted: safeStringify(value), isJson: true };

  const s = value.trim();
  // Fast-path: not JSON-ish.
  if (
    !(s.startsWith('{') && s.endsWith('}')) &&
    !(s.startsWith('[') && s.endsWith(']'))
  ) {
    return { formatted: value, isJson: false };
  }

  try {
    const parsed = JSON.parse(s) as unknown;
    return { formatted: JSON.stringify(parsed, null, 2), isJson: true };
  } catch {
    return { formatted: value, isJson: false };
  }
}

function getTaskStatus(task: string, resultsByTask: MysqlResultsByTask[], toolCallsByTask: MysqlToolCallsByTask[]) {
  const hasResults = resultsByTask.some((t) => t.task === task);
  if (hasResults) return 'done';
  const hasCalls = toolCallsByTask.some((t) => t.task === task && t.calls.length > 0);
  if (hasCalls) return 'running';
  return 'pending';
}

export default function AgentSidebar(props: Props) {
  const { open, onClose, isExecuting, error, reasoning, tasks, toolCallsByTask, resultsByTask } = props;

  const [expandedCallKeys, setExpandedCallKeys] = useState<Record<string, boolean>>({});

  const finishedTasks = useMemo(() => {
    if (!open) return new Set<string>();
    const finished = new Set<string>();
    for (const task of tasks) {
      const calls = toolCallsByTask.find((t) => t.task === task)?.calls ?? [];
      const results = resultsByTask.find((t) => t.task === task)?.results ?? [];
      if (calls.length > 0 && results.length >= calls.length) finished.add(task);
    }
    return finished;
  }, [open, tasks, toolCallsByTask, resultsByTask]);

  // Default newly-created tool blocks to expanded
  useEffect(() => {
    if (!open) return;
    setExpandedCallKeys((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const task of tasks) {
        const calls = toolCallsByTask.find((t) => t.task === task)?.calls ?? [];
        for (let i = 0; i < calls.length; i += 1) {
          const key = `${task}::${i}`;
          if (next[key] === undefined) {
            next[key] = true;
            changed = true;
          }
        }
      }

      return changed ? next : prev;
    });
  }, [open, tasks, toolCallsByTask]);

  // When a task finishes, auto-collapse its tool blocks.
  useEffect(() => {
    if (!open) return;
    setExpandedCallKeys((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const task of finishedTasks) {
        const calls = toolCallsByTask.find((t) => t.task === task)?.calls ?? [];
        for (let i = 0; i < calls.length; i += 1) {
          const key = `${task}::${i}`;
          if (next[key] !== false) {
            next[key] = false;
            changed = true;
          }
        }
      }

      return changed ? next : prev;
    });
  }, [open, finishedTasks, toolCallsByTask]);

  if (!open) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={[
          'z-50',
          // Mobile drawer
          'fixed top-0 right-0 h-full w-[92vw] max-w-sm md:static md:h-full md:w-[380px]',
          'bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800',
          'shadow-xl md:shadow-none',
          'flex flex-col min-h-0',
        ].join(' ')}
        aria-label="Agent execution sidebar"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              Agent execution
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {isExecuting ? 'Running MySQL tools…' : 'Completed'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            aria-label="Close agent sidebar"
          >
            Close
          </button>
        </div>

        {/* Scroll area */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Sticky planning section */}
          <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
            <div className="px-4 py-3 space-y-3">
              <div>
                <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Reasoning
                </div>
                <div className="mt-1 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {reasoning || (isExecuting ? 'Planning…' : '—')}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Plan
                </div>
                <div className="mt-2 space-y-1">
                  {tasks.length === 0 ? (
                    <div className="text-xs text-gray-500 dark:text-gray-400">No tasks.</div>
                  ) : (
                    tasks.map((task, idx) => {
                      const status = getTaskStatus(task, resultsByTask, toolCallsByTask);
                      const done = status === 'done';
                      return (
                        <div key={`${idx}-${task}`} className="flex items-start gap-2">
                          <div className="mt-[2px] h-4 w-4 flex items-center justify-center rounded border border-gray-300 dark:border-gray-700 text-[10px]">
                            {done ? '✓' : ''}
                          </div>
                          <div
                            className={[
                              'text-xs',
                              done
                                ? 'text-gray-400 dark:text-gray-500 line-through'
                                : status === 'running'
                                  ? 'text-gray-900 dark:text-white'
                                  : 'text-gray-700 dark:text-gray-300',
                            ].join(' ')}
                          >
                            {task}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {error && (
                <div className="text-xs rounded bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 px-3 py-2 text-red-700 dark:text-red-200">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Execution feed */}
          <div className="px-4 py-3 space-y-4">
            {tasks.map((task, idx) => {
              const calls = toolCallsByTask.find((t) => t.task === task)?.calls ?? [];
              const results = resultsByTask.find((t) => t.task === task)?.results ?? [];
              const currentRunningIndex =
                isExecuting && calls.length > 0 ? Math.min(results.length, calls.length - 1) : -1;

              return (
                <div
                  key={`${idx}-${task}`}
                  className={[
                    'py-3',
                    idx < tasks.length - 1 ? 'border-b border-gray-200 dark:border-gray-800' : '',
                  ].join(' ')}
                >
                  <div className="text-xs font-semibold text-gray-900 dark:text-white">Task {idx + 1}</div>
                  <div className="mt-1 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{task}</div>

                  <div className="mt-3 space-y-2">
                    {calls.length === 0 ? (
                      <div className="text-xs text-gray-500 dark:text-gray-400">No tool calls.</div>
                    ) : (
                      calls.map((c: MysqlPlannedCall, i: number) => {
                        const r: MysqlToolResult = results[i];
                        const isCallExecuting = isExecuting && !r && i === currentRunningIndex;
                        const isCallError = Boolean(r && !r.ok);
                        const callKey = `${task}::${i}`;
                        const isExpanded = expandedCallKeys[callKey] ?? true;

                        return (
                          <div
                            key={i}
                            className={[
                              'rounded border',
                              isCallExecuting
                                ? 'border-blue-300 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30'
                                : isCallError
                                  ? 'border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/30'
                                  : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900',
                            ].join(' ')}
                          >
                            <button
                              type="button"
                              className="w-full flex items-center justify-between gap-2 px-2 py-2 text-left"
                              aria-expanded={isExpanded}
                              onClick={() => {
                                setExpandedCallKeys((prev) => ({ ...prev, [callKey]: !(prev[callKey] ?? true) }));
                              }}
                            >
                              <div className="min-w-0 flex items-center gap-2">
                                <div
                                  className={[
                                    'h-1.5 w-1.5 rounded-full flex-shrink-0',
                                    isCallExecuting
                                      ? 'bg-blue-500 animate-pulse'
                                      : isCallError
                                        ? 'bg-red-500'
                                        : r
                                          ? 'bg-gray-400 dark:bg-gray-500'
                                          : 'bg-gray-300 dark:bg-gray-700',
                                  ].join(' ')}
                                  aria-hidden="true"
                                />
                                <div className="text-[11px] font-semibold text-gray-900 dark:text-white truncate">
                                  {c.name}
                                </div>
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                                {isExpanded ? '▾' : '▸'}
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="px-2 pb-2 space-y-2">
                                <div>
                                  <div className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">
                                    Arguments
                                  </div>
                                  {Object.entries(c.arguments).map(([key, value], idx: number) => (
                                    <pre key={idx} className="mt-1 text-[11px] bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded p-2 overflow-x-auto">
                                      {key}: {JSON.stringify(value, null, 2)}
                                    </pre>
                                  ))}
                                </div>

                                <div>
                                  <div className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">
                                    Result
                                  </div>
                                  {!r && (
                                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                      {isCallExecuting ? 'Running…' : '—'}
                                    </div>
                                  )}
                                  {r && !r.ok && (
                                    <div className="mt-1 text-xs text-red-500 dark:text-red-400">
                                      {r.error}
                                    </div>
                                  )}
                                  {r && r.ok && (
                                    r.result?.content.map((r: MysqlToolResultContent, idx: number) => (
                                      <pre key={idx} className="mt-1 text-[11px] bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded p-2 overflow-x-auto">
                                        {formatMaybeJson(r.text).formatted}
                                      </pre>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}


