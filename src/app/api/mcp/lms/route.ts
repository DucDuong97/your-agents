import { NextRequest, NextResponse } from 'next/server';

/**
 * HTTP "tool server" equivalent for LMS MCP, but as a Next.js API route (no MCP protocol).
 *
 * Endpoints:
 * - GET  /api/mcp/lms?tool=list
 * - POST /api/mcp/lms  { name: 'get_content'|'get_course_users', arguments: {...} }
 *
 * Env:
 * - (LMS-specific environment variables to be configured)
 */

type ToolTextResult = { type: 'text'; text: string };
type ToolResponse = { content: ToolTextResult[]; isError?: boolean };

function ok(text: string): NextResponse {
  const body: ToolResponse = { content: [{ type: 'text', text }] };
  return NextResponse.json(body);
}

function err(text: string, status = 400): NextResponse {
  const body: ToolResponse = { content: [{ type: 'text', text }], isError: true };
  return NextResponse.json(body, { status });
}

async function handleGetContent(args: { courseId?: unknown; contentId?: unknown }): Promise<NextResponse> {
  // TODO: Implement get_content handler
  // This will fetch content from the LMS system
  const courseId = typeof args.courseId === 'string' ? args.courseId : undefined;
  const contentId = typeof args.contentId === 'string' ? args.contentId : undefined;
  
  return ok(`get_content placeholder - courseId: ${courseId ?? 'not provided'}, contentId: ${contentId ?? 'not provided'}`);
}

async function handleGetCourseUsers(args: { courseId?: unknown }): Promise<NextResponse> {
  // TODO: Implement get_course_users handler
  // This will fetch users enrolled in a course from the LMS system
  const courseId = typeof args.courseId === 'string' ? args.courseId : undefined;
  
  if (!courseId) {
    return err('Missing required argument: courseId', 400);
  }
  
  return ok(`get_course_users placeholder - courseId: ${courseId}`);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tool = (searchParams.get('tool') || 'list').trim();

  if (tool === 'list') {
    return NextResponse.json({
      tools: [
        {
          name: 'get_content',
          description: 'Get content from the LMS system. Can fetch by courseId or contentId.',
          inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              courseId: {
                type: 'string',
                description: 'Optional course ID to filter content by course.',
              },
              contentId: {
                type: 'string',
                description: 'Optional content ID to fetch specific content.',
              },
            },
          },
        },
        {
          name: 'get_course_users',
          description: 'Get all users enrolled in a specific course from the LMS system.',
          inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              courseId: {
                type: 'string',
                description: 'Course ID to get users for.',
              },
            },
            required: ['courseId'],
          },
        },
      ],
    });
  }

  // Convenience GETs (optional)
  if (tool === 'get_content') {
    return await handleGetContent({
      courseId: searchParams.get('courseId') || undefined,
      contentId: searchParams.get('contentId') || undefined,
    });
  }
  if (tool === 'get_course_users') {
    return await handleGetCourseUsers({
      courseId: searchParams.get('courseId') || undefined,
    });
  }

  return err(`Unknown tool: ${tool}`, 400);
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

  if (toolName === 'get_content') {
    const argsObj = (args as { courseId?: unknown; contentId?: unknown } | null) ?? {};
    return await handleGetContent(argsObj);
  }

  if (toolName === 'get_course_users') {
    const argsObj = (args as { courseId?: unknown } | null) ?? {};
    return await handleGetCourseUsers(argsObj);
  }

  return err(`Unknown tool: ${toolName}`, 400);
}

