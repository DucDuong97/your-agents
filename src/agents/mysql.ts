'use client';
import { useCallback, useState } from 'react';

import type { ApiMessage } from '@/lib/openrouter-client';
import { generateChatCompletion } from '@/lib/openrouter-client';
import type { ChatAgent } from '@/lib/db';
import { SqlMcpClient } from '@/mcp/sql';

export type MysqlToolName = 'mysql_query' | 'mysql_list_tables' | 'mysql_describe_table';

export type MysqlPlannedCall = {
  name: MysqlToolName;
  arguments: Record<string, unknown>;
};

export type MysqlPlan =
  | { needed: false; tasks: []; reasoning: string }
  | { needed: true; tasks: string[]; reasoning: string };

export type MysqlToolResultContent = {
  type: string;
  text: string;
};

export type MysqlToolResult = {
  name: MysqlToolName;
  arguments: Record<string, unknown>;
  ok: boolean;
  result?: {
    content: MysqlToolResultContent[];
  };
  error?: string;
};

export type MysqlToolCallsByTask = {
  task: string;
  calls: MysqlPlannedCall[];
};

export type MysqlResultsByTask = {
  task: string;
  calls: MysqlPlannedCall[];
  results: MysqlToolResult[];
};

export function useMysqlMcp({isTesting = false}: {isTesting?: boolean} = {}) {
  const [isPlanning, setIsPlanning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState('');
  const [tasks, setTasks] = useState<string[]>([]);
  const [toolCallsByTask, setToolCallsByTask] = useState<MysqlToolCallsByTask[]>([]);
  const [resultsByTask, setResultsByTask] = useState<MysqlResultsByTask[]>([]);

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


  const mockRun = useCallback(async () => {
    setIsPlanning(true);
    reset();

    try {
      // Simulate a short planner phase
      await sleep(450);

      const demoReasoning =
        'The user is asking about database structure/data. Using MySQL MCP will help by inspecting schema and fetching relevant rows.';
      const demoTasks = [
        'List tables to find relevant entities',
        'Describe the most relevant table for the user’s request',
        'Query a small sample of rows needed to answer',
      ];

      setReasoning(demoReasoning);
      setTasks(demoTasks);

      // End planning, begin execution (what the sidebar uses as "running")
      setIsPlanning(false);
      setIsExecuting(true);

      const localResultsByTask: MysqlResultsByTask[] = [];

      // Task 1
      const t1Calls: MysqlPlannedCall[] = [{ name: 'mysql_list_tables', arguments: {} }];
      setToolCallsByTask((prev) => [...prev, { task: demoTasks[0], calls: t1Calls }]);
      await sleep(650);
      const t1Results: MysqlToolResult[] = [
        {
          name: 'mysql_list_tables',
          arguments: {},
          ok: true,
          result: { content: [
            { type: 'text', text: JSON.stringify({ tables: [{ tableName: 'users' }, { tableName: 'orders' }, { tableName: 'subscriptions' }] }, null, 2) },
          ] },
        },
      ];
      const t1Entry: MysqlResultsByTask = { task: demoTasks[0], calls: t1Calls, results: t1Results };
      localResultsByTask.push(t1Entry);
      setResultsByTask((prev) => [...prev, t1Entry]);

      // Task 2
      const t2Calls: MysqlPlannedCall[] = [{ name: 'mysql_describe_table', arguments: { table: 'subscriptions' } }];
      setToolCallsByTask((prev) => [...prev, { task: demoTasks[1], calls: t2Calls }]);
      await sleep(650);
      const t2Results: MysqlToolResult[] = [
        {
          name: 'mysql_describe_table',
          arguments: { table: 'subscriptions' },
          ok: true,
          result: { content: [
            { type: 'text', text: JSON.stringify({
              table: 'subscriptions',
              columns: [
                { columnName: 'id', columnType: 'bigint', isNullable: 'NO', columnKey: 'PRI' },
                { columnName: 'endpoint', columnType: 'text', isNullable: 'NO' },
                { columnName: 'created_at', columnType: 'datetime', isNullable: 'NO' },
              ],
            }, null, 2) },
          ] },
        },
      ];
      const t2Entry: MysqlResultsByTask = { task: demoTasks[1], calls: t2Calls, results: t2Results };
      localResultsByTask.push(t2Entry);
      setResultsByTask((prev) => [...prev, t2Entry]);

      // Task 3 (include one error to test UI)
      const t3Calls: MysqlPlannedCall[] = [
        { name: 'mysql_query', arguments: { sql: 'SELECT * FROM subscriptions LIMIT 3' } },
      ];
      setToolCallsByTask((prev) => [...prev, { task: demoTasks[2], calls: t3Calls }]);
      await sleep(650);
      const t3Results: MysqlToolResult[] = [
        {
          name: 'mysql_query',
          arguments: { sql: 'SELECT * FROM subscriptions LIMIT 3' },
          ok: false,
          error: 'Demo error: connection refused (testing mode)',
        },
      ];
      const t3Entry: MysqlResultsByTask = { task: demoTasks[2], calls: t3Calls, results: t3Results };
      localResultsByTask.push(t3Entry);
      setResultsByTask((prev) => [...prev, t3Entry]);

      const flatResults = localResultsByTask.flatMap((t) => t.results);
      const toolSystemMessage = buildMysqlToolSystemMessage({
        tasks: demoTasks,
        resultsByTask: localResultsByTask.map(({ task, results }) => ({ task, results })),
        flatResults,
      });

      return { toolSystemMessage, results: flatResults };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setIsPlanning(false);
      setIsExecuting(false);
    }
  }, [reset])

  const run = useCallback(async (args: {
    apiMessages: ApiMessage[];
    agent: ChatAgent;
    apiKey: string;
  }): Promise<{ toolSystemMessage: ApiMessage | null; results: MysqlToolResult[] }> => {
    if (isTesting) {
      return await mockRun();
    }

    setIsPlanning(true);
    reset();

    try {
      const plan = await planMysqlTasks(args);
      setReasoning(plan.reasoning);
      setTasks(plan.tasks);

      if (!plan.needed || !plan.tasks.length) {
        console.log("no plan needed, reason:", plan.reasoning);
        return { toolSystemMessage: null, results: [] };
      }

      // IMPORTANT: fetch the exact MCP tool schemas once and inject them into the tool-call generator context,
      // so the model doesn't hallucinate argument shapes.
      const toolSchemas = await fetchMysqlMcpToolSchemas();

      // From this point on, we consider "MySQL MCP running" (tool execution), excluding planner time.
      setIsExecuting(true);
      const localResultsByTask: MysqlResultsByTask[] = [];

      for (const task of plan.tasks) {
        const plannedCalls = await planMysqlToolCallsForTask({
          task,
          apiMessages: args.apiMessages,
          agent: args.agent,
          apiKey: args.apiKey,
          priorResults: localResultsByTask.map(({ task: t, results }) => ({ task: t, results })),
          toolSchemas,
        });

        setToolCallsByTask((prev) => [...prev, { task, calls: plannedCalls }]);

        const results = await runMysqlToolCallsDirect({ calls: plannedCalls });
        const entry: MysqlResultsByTask = { task, calls: plannedCalls, results };
        localResultsByTask.push(entry);
        setResultsByTask((prev) => [...prev, entry]);
      }

      const flatResults = localResultsByTask.flatMap((t) => t.results);
      const toolSystemMessage = buildMysqlToolSystemMessage({
        tasks: plan.tasks,
        resultsByTask: localResultsByTask.map(({ task: t, results }) => ({ task: t, results })),
        flatResults,
      });

      return { toolSystemMessage, results: flatResults };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setIsPlanning(false);
      setIsExecuting(false);
    }
  }, [isTesting, reset, mockRun]);

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Step 1: generate a plain-text task list describing what to do (no JSON tool calls here).
 * The tool calls are generated per task, taking prior results as input.
 */
export async function planMysqlTasks(args: {
  apiMessages: ApiMessage[];
  agent: ChatAgent;
  apiKey: string;
}): Promise<MysqlPlan> {
  const { apiMessages, agent, apiKey } = args;

  // Keep the planner context bounded to reduce cost/latency.
  const context = apiMessages.slice(-3);

  const plannerSystem: ApiMessage = {
    role: 'system',
    content: PLANNER_SYSTEM_PROMPT,
  };

  const plannerUser: ApiMessage = {
    role: 'user',
    content: JSON.stringify(
      {
        conversation: context,
        note: 'Plan tool calls (if any) to help answer the last user request.',
      },
      null,
      2
    ),
  };

  const plannerModel =
    agent.provider === 'openrouter' ? 'openai/gpt-4o-mini' : 'gpt-4o-mini';

  const resp = await generateChatCompletion({
    messages: [plannerSystem, plannerUser],
    model: plannerModel,
    apiKey,
    provider: agent.provider,
  });

  return parseMysqlTaskPlan(resp.content);
}

/**
 * Step 2..N: for each task, generate tool calls (JSON) using prior task results as context.
 */
export async function planMysqlToolCallsForTask(args: {
  task: string;
  apiMessages: ApiMessage[];
  agent: ChatAgent;
  apiKey: string;
  priorResults: Array<{ task: string; results: MysqlToolResult[] }>;
  toolSchemas: MysqlMcpToolSchema[] | null;
}): Promise<MysqlPlannedCall[]> {
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
        toolSchemas: toolSchemas ?? [],
      },
      null,
      2
    ),
  };

  const plannerModel =
    agent.provider === 'openrouter' ? 'openai/gpt-4o-mini' : 'gpt-4o-mini';

  const resp = await generateChatCompletion({
    messages: [sys, user],
    model: plannerModel,
    apiKey,
    provider: agent.provider,
  });

  const parsed = safeJsonParse(resp.content);
  return normalizeMysqlCalls(parsed);
}

export async function runMysqlToolCallsDirect(args: {
  calls: MysqlPlannedCall[];
}): Promise<MysqlToolResult[]> {
  const { calls } = args;
  if (!calls.length) return [];

  const client = new SqlMcpClient();
  await client.connect();
  try {
    const results: MysqlToolResult[] = [];
    for (const call of calls) {
      try {
        const result = await client.callTool(call.name, call.arguments);
        results.push({ name: call.name, arguments: call.arguments, ok: true, result: result as { content: MysqlToolResultContent[] } });
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
  } finally {
    await client.close();
  }
}

export function buildMysqlToolSystemMessage(args: {
  tasks: string[];
  resultsByTask: Array<{ task: string; results: MysqlToolResult[] }>;
  flatResults: MysqlToolResult[];
}): ApiMessage | null {
  const { tasks, resultsByTask, flatResults } = args;
  if (!flatResults.length) return null;

  return {
    role: 'system',
    content:
      'MySQL MCP task execution results (read-only). Use these results as ground truth and cite them when answering:\n' +
      JSON.stringify({ tasks, resultsByTask }, null, 2),
  };
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

function parseMysqlTaskPlan(text: string): MysqlPlan {
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

function normalizeMysqlCalls(input: unknown): MysqlPlannedCall[] {
  if (!input || typeof input !== 'object') return [];
  const obj = input as { calls?: unknown };
  const rawCalls = Array.isArray(obj.calls) ? obj.calls : [];
  const calls: MysqlPlannedCall[] = [];

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

type MysqlMcpToolSchema = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

async function fetchMysqlMcpToolSchemas(): Promise<MysqlMcpToolSchema[] | null> {
  const client = new SqlMcpClient();
  try {
    await client.connect();
    const res = (await client.listTools()) as unknown;
    const tools = (res as { tools?: unknown })?.tools;
    if (!Array.isArray(tools)) return null;

    const normalized: MysqlMcpToolSchema[] = [];
    for (const t of tools) {
      if (!t || typeof t !== 'object') continue;
      const tool = t as { name?: unknown; description?: unknown; inputSchema?: unknown };
      if (typeof tool.name !== 'string') continue;
      normalized.push({
        name: tool.name,
        description: typeof tool.description === 'string' ? tool.description : undefined,
        inputSchema: tool.inputSchema,
      });
    }

    // Keep only the MySQL tools we care about, in a stable order.
    const allow = new Set<MysqlToolName>(['mysql_query', 'mysql_list_tables', 'mysql_describe_table']);
    return normalized.filter((t) => allow.has(t.name as MysqlToolName));
  } catch {
    return null;
  } finally {
    await client.close();
  }
}


const PLANNER_SYSTEM_PROMPT = `
You are a task planner for using MySQL MCP tools.
Your job: decide whether MySQL MCP is needed, and if yes, produce a short plain-text task list.
Output MUST be plain text (no JSON, no markdown fences) in exactly this format:
NEEDED: YES|NO
REASONING:
<brief why/why not; mention what info is missing if any>
TASKS:
1. <task>
2. <task>
...
Rules:
- Only say NEEDED: YES if the user is asking about database data/schema.
- Keep tasks <= 10.
- Tasks should be concrete and actionable (e.g. "List tables", "Describe users table", "Query last 10 rows from orders").
`;

const TOOL_GENERATOR_SYSTEM_PROMPT = `
You are a tool generator for using MySQL MCP tools.
Your job: generate MySQL MCP tool calls for ONE task.
Return ONLY strict JSON of the form:
{ "calls": Array<{ "name": "tool_name", "arguments": object }> }
Rules:
- Keep calls <= 3.
- You will be given the tool schemas (from MCP tools/list). The call.arguments MUST match the tool inputSchema exactly:
  - Do not invent argument names.
  - Do not include extra keys (additionalProperties is false).
  - Only include optional keys when needed.
- Use mysql_list_tables/mysql_describe_table to discover schema.
- Use mysql_query only for read-only queries.
- If no tool calls are needed for this task, return {"calls":[]}.
`;