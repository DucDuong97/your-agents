import { NextRequest, NextResponse } from 'next/server';

/**
 * Sample MCP-style route template (HTTP tool server pattern).
 *
 * Copy this file to create new MCP routes quickly:
 * 1) Rename route directory (e.g. /api/mcp/your_domain)
 * 2) Update TOOL_REGISTRY entries
 * 3) Implement each handler
 */

type ToolTextResult = { type: 'text'; text: string };
type ToolResponse = { content: ToolTextResult[]; isError?: boolean };

type ToolSchema = {
  type: 'object';
  additionalProperties: false;
  properties: Record<string, unknown>;
  required?: string[];
};

type ToolDef = {
  name: string;
  description: string;
  inputSchema: ToolSchema;
};

type ToolArgs = Record<string, unknown>;
type ToolHandler = (args: ToolArgs, request: NextRequest) => Promise<NextResponse>;
type UnsplashSearchPhoto = {
  id?: string;
  alt_description?: string | null;
  description?: string | null;
  user?: { name?: string; username?: string };
  urls?: { raw?: string; full?: string; regular?: string; small?: string };
  links?: { html?: string };
};

function ok(text: string): NextResponse {
  const body: ToolResponse = { content: [{ type: 'text', text }] };
  return NextResponse.json(body);
}

function err(text: string, status = 400): NextResponse {
  const body: ToolResponse = { content: [{ type: 'text', text }], isError: true };
  return NextResponse.json(body, { status });
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function intArg(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

const TOOL_REGISTRY: ToolDef[] = [
  {
    name: 'search_image',
    description: 'Search Unsplash images using subject/style keywords and return top image links.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        subject: { type: 'string', description: 'Main subject to describe.' },
        style: { type: 'string', description: 'Visual style (optional).' },
        perPage: {
          type: 'number',
          description: 'Number of results (1-30). Default is 5.',
        },
        orientation: {
          type: 'string',
          description: 'Optional: landscape, portrait, or squarish.',
        },
      },
      required: ['subject'],
    },
  },
];

async function handleImagePing(args: ToolArgs): Promise<NextResponse> {
  const message = typeof args.message === 'string' && args.message.trim() ? args.message.trim() : 'pong';
  return ok(`image_ping: ${message}`);
}

async function handleImageGeneratePrompt(args: ToolArgs): Promise<NextResponse> {
  const subject = typeof args.subject === 'string' ? args.subject.trim() : '';
  const style = typeof args.style === 'string' ? args.style.trim() : '';
  const orientation =
    typeof args.orientation === 'string' && ['landscape', 'portrait', 'squarish'].includes(args.orientation)
      ? args.orientation
      : undefined;
  const perPage = Math.min(30, Math.max(1, intArg(args.perPage, 5)));

  if (!subject) return err('Missing required argument: subject', 400);

  const query = style ? `${subject} ${style}` : subject;

  let accessKey: string;
  try {
    accessKey = requiredEnv('UNSPLASH_ACCESS_KEY');
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Missing UNSPLASH_ACCESS_KEY', 500);
  }

  const params = new URLSearchParams({
    query,
    per_page: String(perPage),
  });
  if (orientation) params.set('orientation', orientation);

  const endpoint = `https://api.unsplash.com/search/photos?${params.toString()}`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const details = await response.text();
      return err(
        `Unsplash API error (${response.status}): ${details || 'Request failed'}`,
        response.status >= 500 ? 502 : 400
      );
    }

    const payload = (await response.json()) as {
      total?: number;
      total_pages?: number;
      results?: UnsplashSearchPhoto[];
    };

    const results = Array.isArray(payload.results) ? payload.results : [];
    if (results.length === 0) {
      return ok(`No Unsplash images found for query: ${query}`);
    }

    const lines: string[] = [];
    lines.push(`Unsplash results for: ${query}`);
    lines.push(`total: ${payload.total ?? 'unknown'}, returned: ${results.length}`);
    lines.push('');

    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      const title = item.alt_description || item.description || 'Untitled';
      const author = item.user?.name || item.user?.username || 'unknown';
      lines.push(`${i + 1}. ${title}`);
      lines.push(`   author: ${author}`);
      if (item.links?.html) lines.push(`   page: ${item.links.html}`);
      if (item.urls?.regular) lines.push(`   image: ${item.urls.regular}`);
      lines.push(`   id: ${item.id ?? 'unknown'}`);
      lines.push('');
    }

    return ok(lines.join('\n').trim());
  } catch (e) {
    return err(`Unsplash request failed: ${e instanceof Error ? e.message : String(e)}`, 502);
  }
}

const handlers: Record<string, ToolHandler> = {
  image_ping: async (args) => handleImagePing(args),
  image_generate_prompt: async (args) => handleImageGeneratePrompt(args),
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

  if (tool === 'list') return NextResponse.json({ tools: TOOL_REGISTRY });

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
