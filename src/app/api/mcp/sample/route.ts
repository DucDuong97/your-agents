import { NextRequest, NextResponse } from 'next/server';

/**
 * Generic MCP-style route template (HTTP tool server pattern).
 *
 * Copy this file to create new MCP routes quickly:
 * 1) Rename folder: /api/mcp/<your-domain>
 * 2) Rename tool names from sample_* to your domain names
 * 3) Update TOOL_REGISTRY schemas
 * 4) Implement handlers
 *
 * Endpoints:
 * - GET  /api/mcp/sample?tool=list
 * - GET  /api/mcp/sample?tool=<tool_name>&arg1=value...
 * - POST /api/mcp/sample { "name": "<tool_name>", "arguments": { ... } }
 */

type ToolTextResult = { type: 'text'; text: string };
type ToolResponse = { content: ToolTextResult[]; isError?: boolean };

type ToolSchema = {
  type: 'object';
  additionalProperties: false;
  properties: Record<string, unknown>;
  required?: string[];
};

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: ToolSchema;
};

type ToolArgs = Record<string, unknown>;
type ToolHandler = (args: ToolArgs, request: NextRequest) => Promise<NextResponse>;

function ok(text: string): NextResponse {
  const body: ToolResponse = { content: [{ type: 'text', text }] };
  return NextResponse.json(body);
}

function err(text: string, status = 400): NextResponse {
  const body: ToolResponse = { content: [{ type: 'text', text }], isError: true };
  return NextResponse.json(body, { status });
}

const TOOL_REGISTRY: ToolDefinition[] = [
  {
    name: 'sample_ping',
    description: 'Health-check tool used to verify this MCP route is reachable.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        message: {
          type: 'string',
          description: 'Optional message to echo back.',
        },
      },
    },
  },
  {
    name: 'sample_action',
    description: 'Generic example action. Replace with your real domain logic.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        input: {
          type: 'string',
          description: 'Required input for the action.',
        },
        verbose: {
          type: 'boolean',
          description: 'Optional flag to include extra details in output.',
        },
      },
      required: ['input'],
    },
  },
];

async function handleSamplePing(args: ToolArgs): Promise<NextResponse> {
  const message =
    typeof args.message === 'string' && args.message.trim() ? args.message.trim() : 'pong';
  return ok(`sample_ping: ${message}`);
}

async function handleSampleAction(args: ToolArgs): Promise<NextResponse> {
  const input = typeof args.input === 'string' ? args.input.trim() : '';
  const verbose = Boolean(args.verbose);

  if (!input) return err('Missing required argument: input', 400);

  // TODO: Replace this block with real business logic for your MCP domain.
  const details = verbose ? `\nmode: verbose` : '';
  return ok(`sample_action result for input: ${input}${details}`);
}

const handlers: Record<string, ToolHandler> = {
  sample_ping: async (args) => handleSamplePing(args),
  sample_action: async (args) => handleSampleAction(args),
};

function parseGetArgs(searchParams: URLSearchParams): ToolArgs {
  const args: ToolArgs = {};
  for (const [key, value] of searchParams.entries()) {
    if (key !== 'tool') args[key] = value;
  }
  return args;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tool = (searchParams.get('tool') || 'list').trim();

  if (tool === 'list') {
    return NextResponse.json({ tools: TOOL_REGISTRY });
  }

  const handler = handlers[tool];
  if (!handler) return err(`Unknown tool: ${tool}`, 400);

  return handler(parseGetArgs(searchParams), request);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err('Invalid JSON body', 400);
  }

  const { name, arguments: args } = (body ?? {}) as {
    name?: unknown;
    arguments?: unknown;
  };

  if (typeof name !== 'string' || !name.trim()) return err('Missing tool name', 400);
  const toolName = name.trim();

  const handler = handlers[toolName];
  if (!handler) return err(`Unknown tool: ${toolName}`, 400);

  const safeArgs = args && typeof args === 'object' ? (args as ToolArgs) : {};
  return handler(safeArgs, request);
}
