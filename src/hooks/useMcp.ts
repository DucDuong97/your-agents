'use client';
import { useCallback, useState } from 'react';

import type { ApiMessage } from '@/lib/openrouter';
import { generateChatCompletion } from '@/lib/openrouter';
import type { ChatAgent, Message } from '@/lib/db';

export type McpToolName = 'mysql_query' | 'mysql_list_tables' | 'mysql_describe_table';

export type McpPlannedCall = {
  name: McpToolName;
  arguments: Record<string, unknown>;
};

export type McpPlan =
  | { needed: false; tasks: []; reasoning: string }
  | { needed: true; tasks: string[]; reasoning: string };

export type McpToolResultContent = {
  type: string;
  text: string;
};

export type McpToolResult = {
  name: McpToolName;
  arguments: Record<string, unknown>;
  ok: boolean;
  result?: {
    content: McpToolResultContent[];
  };
  error?: string;
};

export type McpToolCallsByTask = {
  task: string;
  calls: McpPlannedCall[];
};

export type McpResultsByTask = {
  task: string;
  calls: McpPlannedCall[];
  results: McpToolResult[];
};

export type AgentRunSnapshot = {
  version: 1;
  createdAt: string;
  reasoning: string;
  tasks: string[];
  toolCallsByTask: McpToolCallsByTask[];
  resultsByTask: McpResultsByTask[];
  error: string | null;
};

export function useMcp({isTesting = false}: {isTesting?: boolean} = {}) {
  const [isPlanning, setIsPlanning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState('');
  const [tasks, setTasks] = useState<string[]>([]);
  const [toolCallsByTask, setToolCallsByTask] = useState<McpToolCallsByTask[]>([]);
  const [resultsByTask, setResultsByTask] = useState<McpResultsByTask[]>([]);

  if (isTesting) {}

  // console.log("reasoning", reasoning);
  // console.log("tasks", tasks);
  // console.log("toolCallsByTask", toolCallsByTask);
  // console.log("resultsByTask", resultsByTask);

  const reset = useCallback(() => {
    setError(null);
    setReasoning('');
    setTasks([]);
    setToolCallsByTask([]);
    setResultsByTask([]);
  }, []);

  const run = useCallback(async (args: {
    apiMessages: ApiMessage[];
    agent: ChatAgent;
    apiKey: string;
  }): Promise<{
    toolSystemMessage: Message | null;
    runSnapshot: AgentRunSnapshot | null;
  }> => {
    setIsPlanning(true);
    reset();

    // IMPORTANT: fetch the exact MCP tool schemas once and inject them into the tool-call generator context,
    // so the model doesn't hallucinate argument shapes.
    const toolSchemas = await fetchMcpToolSchemas();

    const localResultsByTask: McpResultsByTask[] = [];
    const plan = await planMcpTasks({
      apiMessages: args.apiMessages,
      agent: args.agent,
      apiKey: args.apiKey,
      toolSchemas,
    });
    setReasoning(plan.reasoning);
    setTasks(plan.tasks);

    if (!plan.needed || !plan.tasks.length) {
      console.log("no plan needed, reason:", plan.reasoning);
      return { toolSystemMessage: null, runSnapshot: null };
    }
    const currentTasks = plan.tasks;
    let currentReasoning = plan.reasoning;

    try {
      for (let i = 0; i < 3; i++) {
        // From this point on, we consider "MySQL MCP running" (tool execution), excluding planner time.
        setIsExecuting(true);

        for (const task of currentTasks) {
          const plannedCalls = await planMcpToolCallsForTask({
            task,
            apiMessages: args.apiMessages,
            agent: args.agent,
            apiKey: args.apiKey,
            priorResults: localResultsByTask.map(({ task: t, results }) => ({ task: t, results })),
            toolSchemas,
          });

          setToolCallsByTask((prev) => [...prev, { task, calls: plannedCalls }]);

          const results = await runToolCallsDirect({ 
            calls: plannedCalls,
            env: args.agent.mysqlMcpEnv || 'local'
          });
          const entry: McpResultsByTask = { task, calls: plannedCalls, results };
          localResultsByTask.push(entry);
          setResultsByTask((prev) => [...prev, entry]);
        }

        const resultEvaluation = await evaluateResult({
          resultsByTask: localResultsByTask,
          agent: args.agent,
          apiKey: args.apiKey,
          apiMessages : args.apiMessages,
        });

        console.log('resultEvaluation', resultEvaluation);

        if (resultEvaluation.solved) {
          break;
        }

        currentReasoning = `${currentReasoning}\n-----EVALUATION ${i + 1}-----\n${resultEvaluation.reasoning}`;
        setReasoning(currentReasoning);

        // If no new tasks and not solved, break to avoid infinite loop
        if (resultEvaluation.tasks.length === 0) {
          break;
        }
        
        currentTasks.push(...resultEvaluation.tasks);
        setTasks([...currentTasks]);
      }

      const toolSystemMessage = buildMcpToolSystemMessage({
        resultsByTask: localResultsByTask.map(({ task: t, results }) => ({ task: t, results })),
      });

      const runSnapshot: AgentRunSnapshot = {
        version: 1,
        createdAt: new Date().toISOString(),
        reasoning: currentReasoning,
        tasks: plan.tasks,
        toolCallsByTask: localResultsByTask.map((t) => ({ task: t.task, calls: t.calls })),
        resultsByTask: localResultsByTask,
        error: null,
      };

      return { toolSystemMessage, runSnapshot };
    } catch (e) {
      console.error('MySQL MCP orchestration failed; continuing without tools:', e);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setIsPlanning(false);
      setIsExecuting(false);
    }
  }, [reset]);

  return {
    run, 
    reset,
    isPlanning,
    isExecuting,
    error,
    reasoning,
    tasks,
    toolCallsByTask,
    resultsByTask,
  };
}

/**
 * Step 1: generate a plain-text task list describing what to do (no JSON tool calls here).
 * The tool calls are generated per task, taking prior results as input.
 */
async function planMcpTasks(args: {
  apiMessages: ApiMessage[];
  agent: ChatAgent;
  apiKey: string;
  toolSchemas: McpMcpToolSchema[] | null;
}): Promise<McpPlan> {
  const { apiMessages, agent, apiKey, toolSchemas } = args;

  // Keep the planner context bounded to reduce cost/latency.
  const context = apiMessages.slice(-3);
  const toolNames = toolSchemas?.map((tool) => tool.name) ?? [];

  const plannerSystem: ApiMessage = {
    role: 'system',
    content: PLANNER_SYSTEM_PROMPT,
  };

  const plannerUser: ApiMessage = {
    role: 'user',
    content: PLANNER_USER_MESSAGE
      .replace('{{conversation}}', JSON.stringify(context, null, 2))
      .replace('{{tools}}', toolNames.join(', ')),
  };

  const plannerModel =
    agent.provider === 'openrouter' ? 'openai/o3' : 'o3';

  const resp = await generateChatCompletion({
    title: 'MySQL MCP Task Planner',
    messages: [plannerSystem, plannerUser],
    model: plannerModel,
    apiKey,
    provider: agent.provider,
  });

  return parseMcpTaskPlan(resp.content);
}

/**
 * Step 2..N: for each task, generate tool calls (JSON) using prior task results as context.
 */
async function planMcpToolCallsForTask(args: {
  task: string;
  apiMessages: ApiMessage[];
  agent: ChatAgent;
  apiKey: string;
  priorResults: Array<{ task: string; results: McpToolResult[] }>;
  toolSchemas: McpMcpToolSchema[] | null;
}): Promise<McpPlannedCall[]> {
  const { task, apiMessages, agent, apiKey, priorResults, toolSchemas } = args;

  const context = apiMessages.slice(-3);

  const sys: ApiMessage = {
    role: 'system',
    content:
      TOOL_GENERATOR_SYSTEM_PROMPT +
      '\n\n' +
      'Tool schemas (verbatim from MCP tools/list):\n' +
      JSON.stringify({ tools: toolSchemas ?? [] }, null, 2),
  };

  const user: ApiMessage = {
    role: 'user',
    content: JSON.stringify(
      {
        task,
        conversation: context,
        priorResults,
      },
      null,
      2
    ),
  };

  const plannerModel =
    agent.provider === 'openrouter' ? 'openai/gpt-4o-mini' : 'gpt-4o-mini';

  const resp = await generateChatCompletion({
    title: 'MySQL MCP Tool Generator',
    messages: [sys, user],
    model: plannerModel,
    apiKey,
    provider: agent.provider,
  });

  const parsed = safeJsonParse(resp.content);
  return normalizeMcpCalls(parsed);
}

async function evaluateResult(args: {
  resultsByTask: McpResultsByTask[];
  agent: ChatAgent;
  apiKey: string;
  apiMessages: ApiMessage[];
}): Promise<{
  solved: boolean;
  reasoning: string;
  tasks: string[];
}> {
  const { resultsByTask, agent, apiKey, apiMessages } = args;

  const context = JSON.stringify(apiMessages.slice(-3), null, 2);

  const sys: ApiMessage = {
    role: 'system',
    content: RESULT_EVALUATION_SYSTEM_PROMPT,
  };

  const user: ApiMessage = {
    role: 'user',
    content: RESULT_EVALUATION_USER_MESSAGE
      .replace('{{conversation}}', context)
      .replace('{{task_execution_results}}', JSON.stringify(resultsByTask)),
  };

  const plannerModel =
    agent.provider === 'openrouter' ? 'openai/o3' : 'o3';

  const resp = await generateChatCompletion({
    title: 'MySQL MCP Result Evaluator',
    messages: [sys, user],
    model: plannerModel,
    apiKey,
    provider: agent.provider,
  });

  return parseMcpResultEvaluation(resp.content);
}

function parseMcpResultEvaluation(text: string): {
  solved: boolean;
  reasoning: string;
  tasks: string[];
} {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const solvedLine = lines.find((l) => l.toUpperCase().startsWith('SOLVED:'));
  const solved = solvedLine?.toUpperCase().includes('YES') ?? false;
  const reasoningLine = lines.find((l) => l.toUpperCase().startsWith('REASONING:'));
  const reasoning = reasoningLine?.slice('REASONING:'.length).trim() ?? '';
  
  // Find tasks section - handle both "TASKS:" header and numbered lists
  const tasksLineIndex = lines.findIndex((l) => l.toUpperCase().startsWith('TASKS:'));
  const newTasks: string[] = [];
  
  if (tasksLineIndex !== -1) {
    // Get tasks after TASKS: line
    const taskLines = lines.slice(tasksLineIndex + 1);
    for (const line of taskLines) {
      // Stop if we hit another section header
      if (/^(REASONING|SOLVED):/i.test(line)) break;
      
      // Handle numbered lists (e.g., "1. task" or "1) task")
      const numberedMatch = line.match(/^\d+[.)]\s*(.+)$/);
      if (numberedMatch) {
        newTasks.push(numberedMatch[1].trim());
      } else if (line.length > 0) {
        // Also accept non-numbered lines as tasks
        newTasks.push(line);
      }
    }
  }
  
  return { solved, reasoning, tasks: newTasks };
}

async function runToolCallsDirect(args: {
  calls: McpPlannedCall[];
  env?: 'local' | 'dev' | 'hotfix' | 'lab' | 'prod';
}): Promise<McpToolResult[]> {
  const { calls, env = 'local' } = args;
  if (!calls.length) return [];

  const TOOL_CALL_TIMEOUT_MS = 10_000;
  const results: McpToolResult[] = [];
  for (const call of calls) {
    try {
      const result = await withTimeout(
        mcpHttpCallTool(call.name, call.arguments, env),
        TOOL_CALL_TIMEOUT_MS,
        `Tool call timed out after ${TOOL_CALL_TIMEOUT_MS / 1000}s: ${call.name}`
      );
      results.push({ name: call.name, arguments: call.arguments, ok: true, result });
    } catch (e) {
      results.push({
        name: call.name,
        arguments: call.arguments,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function buildMcpToolSystemMessage(args: {
  resultsByTask: Array<{ task: string; results: McpToolResult[] }>;
}): Message | null {
  const { resultsByTask } = args;

  return {
    role: 'system',
    id: `${Date.now()}-tool`,
    createdAt: new Date().toISOString(),
    content: 'MCP task execution.',
    rawContent: [
      '[MCP]',
      'MCP task execution results. Use these results as ground truth and cite them when answering:',
      JSON.stringify({ resultsByTask }, null, 2),
    ].join('\n'),
  };
}

type McpHttpToolSchema = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

function getMcpHttpBaseUrl(): string {
  // Client-side: call same-origin Next route.
  return '/api/mcp/sql';
}

async function mcplHttpListTools(): Promise<McpHttpToolSchema[] | null> {
  try {
    const res = await fetch(`${getMcpHttpBaseUrl()}?tool=list`, { method: 'GET' });
    if (!res.ok) return null;
    const json = (await res.json()) as { tools?: unknown };
    if (!Array.isArray(json.tools)) return null;

    const normalized: McpHttpToolSchema[] = [];
    for (const t of json.tools) {
      if (!t || typeof t !== 'object') continue;
      const tool = t as { name?: unknown; description?: unknown; inputSchema?: unknown };
      if (typeof tool.name !== 'string') continue;
      normalized.push({
        name: tool.name,
        description: typeof tool.description === 'string' ? tool.description : undefined,
        inputSchema: tool.inputSchema,
      });
    }

    const allow = new Set<McpToolName>(['mysql_query', 'mysql_list_tables', 'mysql_describe_table']);
    return normalized.filter((t) => allow.has(t.name as McpToolName));
  } catch {
    return null;
  }
}

async function mcpHttpCallTool(
  name: McpToolName,
  args: Record<string, unknown>,
  env: 'local' | 'dev' | 'hotfix' | 'lab' | 'prod' = 'local'
): Promise<{ content: McpToolResultContent[] }> {
  const baseUrl = getMcpHttpBaseUrl();
  const separator = baseUrl.includes('?') ? '&' : '?';
  const url = `${baseUrl}${separator}env=${env}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });

  const data = (await res.json().catch(() => null)) as
    | { content?: McpToolResultContent[]; isError?: boolean }
    | null;

  if (!res.ok || !data || !Array.isArray(data.content) || data.isError) {
    const msg =
      (data?.content?.[0]?.text && String(data.content[0].text)) ||
      `HTTP error calling ${name}: ${res.status}`;
    throw new Error(msg);
  }

  return { content: data.content };
}

function safeJsonParse(s: string): unknown {
  const trimmed = s.trim();
  // Some models wrap JSON in markdown fences; strip if present.
  const unfenced = trimmed
    .replace(/^```json\s*/iu, '')
    .replace(/^```\s*/iu, '')
    .replace(/```$/u, '')
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    return null;
  }
}

function parseMcpTaskPlan(text: string): McpPlan {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const neededLine = lines.find((l) => l.toUpperCase().startsWith('NEEDED:'));
  const needed = neededLine?.toUpperCase().includes('YES') ?? false;

  const reasoningLines: string[] = [];
  let inReasoning = false;
  let inTasks = false;
  for (const l of lines) {
    const upper = l.toUpperCase();
    if (upper.startsWith('REASONING:')) {
      inReasoning = true;
      inTasks = false;
      const rest = l.slice('REASONING:'.length).trim();
      if (rest) reasoningLines.push(rest);
      continue;
    }
    if (upper === 'TASKS:' || upper.startsWith('TASKS:')) {
      inTasks = true;
      inReasoning = false;
      const rest = l.slice('TASKS:'.length).trim();
      if (rest) reasoningLines.push(rest);
      continue;
    }
    if (upper.startsWith('NEEDED:')) {
      inReasoning = false;
      inTasks = false;
      continue;
    }
    if (inReasoning && !inTasks) {
      // Stop reasoning collection if we hit a numbered task list.
      if (/^\d+\.\s+/u.test(l)) continue;
      reasoningLines.push(l);
    }
  }

  const reasoning = reasoningLines.join('\n').trim();
  if (!needed) return { needed: false, tasks: [], reasoning: reasoning || 'Not needed.' };

  const tasks: string[] = [];
  for (const l of lines) {
    const m = l.match(/^\d+\.\s+(.*)$/u);
    if (m?.[1]) tasks.push(m[1].trim());
  }

  const deduped = Array.from(new Set(tasks)).filter(Boolean);
  if (deduped.length === 0) {
    return { needed: false, tasks: [], reasoning: reasoning || 'No actionable tasks found.' };
  }
  return { needed: true, tasks: deduped, reasoning: reasoning || 'Needed.' };
}

function normalizeMcpCalls(input: unknown): McpPlannedCall[] {
  if (!input || typeof input !== 'object') return [];
  const obj = input as { calls?: unknown };
  const rawCalls = Array.isArray(obj.calls) ? obj.calls : [];
  const calls: McpPlannedCall[] = [];

  for (const c of rawCalls.slice(0, 3)) {
    if (!c || typeof c !== 'object') continue;
    const call = c as { name?: unknown; arguments?: unknown };
    if (
      call.name !== 'mysql_query' &&
      call.name !== 'mysql_list_tables' &&
      call.name !== 'mysql_describe_table'
    ) {
      continue;
    }
    if (!call.arguments || typeof call.arguments !== 'object') continue;
    calls.push({ name: call.name, arguments: call.arguments as Record<string, unknown> });
  }

  return calls;
}

type McpMcpToolSchema = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

async function fetchMcpToolSchemas(): Promise<McpMcpToolSchema[] | null> {
  // Backwards-compatible name, now sourced from the HTTP tool endpoint.
  return await mcplHttpListTools();
}


const PLANNER_SYSTEM_PROMPT = `
You are a task planner for using MCP tools.
Your job: decide whether MCP tools are needed, and if yes, produce a short plain-text task list.

# Rules:
- Only say NEEDED: YES if the user is asking about database data/schema.
- Keep tasks <= 10.
- Tasks should be concrete and actionable (e.g. "List tables", "Describe users table", "Query last 10 rows from orders").

# Notes:
- You will be given the conversation history and the list of tools available to understand the requirement(s) and know what is possible to be executed.
- Think step by step.
- The task description should be concise and actionable.

# Output: MUST be plain text (no JSON, no markdown fences) in exactly this format:
REASONING:
<brief why/why not; mention what info is missing if any>
NEEDED: YES|NO
TASKS:
1. <task>
2. <task>
...
`;

const PLANNER_USER_MESSAGE = `
<Conversation>
{{conversation}}
</Conversation>

<Tools>
{{tools}}
</Tools>

Notes: Plan tool calls (if any) to help answer the last user request.
`;

const TOOL_GENERATOR_SYSTEM_PROMPT = `
You are a tool generator for using MCP tools.
Your job: generate MCP tool calls for ONE task.

# Return ONLY strict JSON of the form:
{ "calls": Array<{ "name": "tool_name", "arguments": object }> }

# Rules:
- Keep calls <= 3.
- Do not repeat tool calls from previous tasks.
- You will be given the tool schemas (from MCP tools/list). The call.arguments MUST match the tool inputSchema exactly:
  - Do not invent argument names.
  - Do not include extra keys (additionalProperties is false).
  - Only include optional keys when needed.
- If no tool calls are needed for this task, return {"calls":[]}.
- Do not assume any data for the arguments, try to retrieve necessary data first if possible.
`;

const RESULT_EVALUATION_SYSTEM_PROMPT = `
You are a result evaluator.

You will be given the task execution results of the task execution and the user's request. Your job is to evaluate the results of the task execution.

# Rules:
- Evaluate the results of the task execution.
- Think step by step, give the reasoning for the evaluation.
- If the task execution is successful, return the evaluation text "SOLVED: YES".
- If the task execution is failed, return the evaluation text "SOLVED: NO".
- Give the list of tasks that are still needed to be executed to answer the user's request.

# Notes:
- Please do not make up tasks that are not possible to be executed by the given tools.
- The results needn't be the final answer to the requirement, but should be complete and contain all the information needed to answer the user's request.

# Output MUST be plain text (no JSON, no markdown fences) in exactly this format:
REASONING: <brief reasoning for the evaluation>
SOLVED: YES | NO
TASKS:
1. <task>
2. <task>
...
`;

const RESULT_EVALUATION_USER_MESSAGE = `
<Conversation>
{{conversation}}
</Conversation>

<TaskExecutionResults>
{{task_execution_results}}
</TaskExecutionResults>
`;