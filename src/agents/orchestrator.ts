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
  | { needed: false; calls: [] }
  | { needed: true; calls: MysqlPlannedCall[] };

export type MysqlToolResult = {
  name: MysqlToolName;
  arguments: Record<string, unknown>;
  ok: boolean;
  result?: unknown;
  error?: string;
};

export async function orchestratorAgent(args: {
  apiMessages: ApiMessage[];
  agent: ChatAgent;
  apiKey: string;
}): Promise<{ toolSystemMessage: ApiMessage | null; results: MysqlToolResult[] }> {
  const plan = await planMysqlToolCalls(args);
  if (!plan.needed || !plan.calls.length) return { toolSystemMessage: null, results: [] };

  const results = await runMysqlToolCallsDirect({ calls: plan.calls });
  const toolSystemMessage = buildMysqlToolSystemMessage({ results });
  return { toolSystemMessage, results };
}

export async function planMysqlToolCalls(args: {
  apiMessages: ApiMessage[];
  agent: ChatAgent;
  apiKey: string;
}): Promise<MysqlPlan> {
  const { apiMessages, agent, apiKey } = args;

  // If the agent isn't allowed to use MySQL MCP, don't plan.
  if (!agent.useMysqlMcp) return { needed: false, calls: [] };

  // Keep the planner context bounded to reduce cost/latency.
  const context = apiMessages.slice(-3);

  const plannerSystem: ApiMessage = {
    role: 'system',
    content:
      'You are a tool-use planner. Decide if calling the local MySQL MCP tools would help answer the user.\n' +
      'Return ONLY strict JSON, with this exact shape:\n' +
      '{ "needed": boolean, "calls": Array<{ "name": "mysql_query"|"mysql_list_tables"|"mysql_describe_table", "arguments": object }> }\n' +
      'Rules:\n' +
      '- Only set needed=true if the user is asking about database data/schema.\n' +
      '- Prefer mysql_list_tables + mysql_describe_table for schema discovery.\n' +
      '- Use mysql_query only for read-only queries.\n' +
      '- Keep calls <= 3.\n' +
      '- If not needed, return {"needed":false,"calls":[]}.\n',
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

  const parsed = safeJsonParse(resp.content);
  const normalized = normalizeMysqlPlan(parsed);
  return normalized;
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
  } finally {
    await client.close();
  }
}

export function buildMysqlToolSystemMessage(args: {
  results: MysqlToolResult[];
}): ApiMessage | null {
  const { results } = args;
  if (!results.length) return null;

  return {
    role: 'system',
    content:
      'MySQL MCP tool results (read-only). Use these results as ground truth and cite them when answering:\n' +
      JSON.stringify({ results }, null, 2),
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

function normalizeMysqlPlan(input: unknown): MysqlPlan {
  if (!input || typeof input !== 'object') return { needed: false, calls: [] };
  const obj = input as { needed?: unknown; calls?: unknown };
  const needed = obj.needed === true;
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

  if (!needed || calls.length === 0) return { needed: false, calls: [] };
  return { needed: true, calls };
}
