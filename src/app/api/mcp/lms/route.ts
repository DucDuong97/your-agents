import { NextRequest, NextResponse } from 'next/server';
import { err, ok } from '@/lib/server/mcp-response';
import { getPool } from '@/lib/server/db';
import {
  getCourseContent as getBlackboardCourseContent,
  getCourseStudents as getBlackboardCourseStudents,
} from './blackboard';
import {
  getCourseContent as getBrightspaceCourseContent,
  getCourseStudents as getBrightspaceCourseStudents,
} from './brightspace';
import {
  getCourseContent as getCanvasCourseContent,
  getCourseStudents as getCanvasCourseStudents,
} from './canvas';

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

const TOOL_REGISTRY: ToolDefinition[] = [
  {
    name: 'lms_get_course_content',
    description: 'Get the LMS-integrated content of a MathGPT course.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        course_id: {
          type: 'number',
          description: 'The ID of the MathGPT course to get the content for.',
        },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'lms_get_course_students',
    description: 'Get the LMS-integrated students of a MathGPT course.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        course_id: {
          type: 'number',
          description: 'The ID of the MathGPT course to get the students for.',
        },
      },
      required: ['course_id'],
    },
  },
];

function getEnvFromRequest(request: NextRequest): string {
  const env = new URL(request.url).searchParams.get('env') || 'local';
  return env.trim();
}

async function handleLmsGetCourseContent(args: ToolArgs, request: NextRequest): Promise<NextResponse> {
  const env = getEnvFromRequest(request);
  const rawId = args.course_id;
  const courseId =
    typeof rawId === 'number' && Number.isFinite(rawId)
      ? rawId
      : typeof rawId === 'string'
        ? Number.parseInt(String(rawId).trim(), 10)
        : NaN;
  if (!Number.isInteger(courseId) || courseId < 1) {
    return err('Missing or invalid required argument: course_id (positive integer)', 400);
  }

  try {
    // (1) Get Blackboard/LMS course imported_id and lms_name
    const [importedRowsRaw] = await getPool(env).execute(
      `SELECT lms_name, imported_id FROM lms_imported_resources
       WHERE course_id = ? AND resource_type = 'course'
       ORDER BY COALESCE(updated, created) DESC LIMIT 1`,
      [courseId]
    );
    const importedRows = importedRowsRaw as { lms_name: string; imported_id: string }[];
    if (!importedRows?.length) {
      return err(`No LMS-imported course found for course_id=${courseId}`, 404);
    }
    const { lms_name: lmsName, imported_id: importedId } = importedRows[0];
    if (!importedId) {
      return err(`LMS imported_id is missing for course_id=${courseId}`, 404);
    }

    // (2) Get institution base API URL
    const [apiRowsRaw] = await getPool(env).execute(
      `SELECT i.api_base_url
       FROM courses c
       JOIN lms_imported_resources r ON r.course_id = c.id AND r.resource_type = 'course'
       JOIN lms_institution_educators ie ON ie.uid = c.owner_id
       JOIN lms_institutions i ON i.id = ie.institution_id AND i.lms_name = r.lms_name
       WHERE c.id = ?
       ORDER BY COALESCE(r.updated, r.created) DESC
       LIMIT 1`,
      [courseId]
    );
    const apiRows = apiRowsRaw as { api_base_url: string }[];
    if (!apiRows?.length || !apiRows[0].api_base_url) {
      return err(`No institution API base URL found for course_id=${courseId}`, 404);
    }
    const apiBaseUrl = String(apiRows[0].api_base_url).trim().replace(/\/+$/, '');

    // (3) Get course owner's latest OAuth access token for this lms_name
    const [tokenRowsRaw] = await getPool(env).execute(
      `SELECT t.access_token
       FROM courses c
       JOIN lms_imported_resources r ON r.course_id = c.id AND r.resource_type = 'course'
       JOIN lms_oauth_tokens t ON t.uid = c.owner_id AND t.lms_name = r.lms_name
       WHERE c.id = ?
       ORDER BY COALESCE(t.updated, t.created) DESC
       LIMIT 1`,
      [courseId]
    );
    const tokenRows = tokenRowsRaw as { access_token: string }[];
    if (!tokenRows?.length || !tokenRows[0].access_token) {
      return err(`No OAuth access token found for course_id=${courseId} and lms_name=${lmsName}`, 404);
    }
    const accessToken = String(tokenRows[0].access_token);

    const lmsLower = lmsName.toLowerCase();
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
    const params = { apiBaseUrl, importedId, headers };

    let getContent: (p: typeof params) => Promise<unknown>;
    if (lmsLower === 'canvas') {
      getContent = getCanvasCourseContent;
    } else if (lmsLower === 'brightspace') {
      getContent = getBrightspaceCourseContent;
    } else {
      getContent = getBlackboardCourseContent;
    }

    const parsed = await getContent(params);

    const summary = `course_id=${courseId} lms_name=${lmsName} imported_id=${importedId}\n\nResponse:\n${JSON.stringify(parsed, null, 2)}`;
    return ok(summary);
  } catch (e) {
    return err(
      `lms_get_course_content failed: ${e instanceof Error ? e.message : String(e)}`,
      500
    );
  }
}

async function handleLmsGetCourseStudents(args: ToolArgs, request: NextRequest): Promise<NextResponse> {
  const env = getEnvFromRequest(request);
  const rawId = args.course_id;
  const courseId =
    typeof rawId === 'number' && Number.isFinite(rawId)
      ? rawId
      : typeof rawId === 'string'
        ? Number.parseInt(String(rawId).trim(), 10)
        : NaN;
  if (!Number.isInteger(courseId) || courseId < 1) {
    return err('Missing or invalid required argument: course_id (positive integer)', 400);
  }

  try {
    // (1) Get course's LMS and Blackboard course identifier from lms_imported_resources
    const [importedRowsRaw] = await getPool(env).execute(
      `SELECT r.lms_name, r.imported_id FROM lms_imported_resources r
       WHERE r.course_id = ? AND r.resource_type = 'course'
       ORDER BY COALESCE(r.updated, r.created) DESC LIMIT 1`,
      [courseId]
    );
    const importedRows = importedRowsRaw as { lms_name: string; imported_id: string }[];
    if (!importedRows?.length) {
      return err(`No LMS-imported course found for course_id=${courseId}`, 404);
    }
    const { lms_name: lmsName, imported_id: importedId } = importedRows[0];
    if (!importedId) {
      return err(`LMS imported_id is missing for course_id=${courseId}`, 404);
    }

    // (2) Resolve institution base API URL (and institution_id) for that course
    const [apiRowsRaw] = await getPool(env).execute(
      `SELECT i.api_base_url, i.id AS institution_id
       FROM courses c
       JOIN lms_imported_resources r ON r.course_id = c.id AND r.resource_type = 'course'
       JOIN lms_institution_educators ie ON ie.uid = c.owner_id
       JOIN lms_institutions i ON i.id = ie.institution_id AND i.lms_name = r.lms_name
       WHERE c.id = ?
       ORDER BY COALESCE(r.updated, r.created) DESC
       LIMIT 1`,
      [courseId]
    );
    const apiRows = apiRowsRaw as { api_base_url: string; institution_id: number }[];
    if (!apiRows?.length || !apiRows[0].api_base_url) {
      return err(`No institution API base URL found for course_id=${courseId}`, 404);
    }
    const apiBaseUrl = String(apiRows[0].api_base_url).trim().replace(/\/+$/, '');
    const institutionId = apiRows[0].institution_id;

    // (3) Fetch latest non-expired institution LTI access token from lms_lti_tokens
    const [tokenRowsRaw] = await getPool(env).execute(
      `SELECT lt.access_token
       FROM lms_lti_tokens lt
       WHERE lt.institution_id = ? AND lt.status <> 'expired'
       ORDER BY COALESCE(lt.updated, lt.created) DESC
       LIMIT 1`,
      [institutionId]
    );
    const tokenRows = tokenRowsRaw as { access_token: string }[];
    if (!tokenRows?.length || !tokenRows[0].access_token) {
      return err(
        `No non-expired LTI access token found for course_id=${courseId} (institution_id=${institutionId})`,
        404
      );
    }
    const accessToken = String(tokenRows[0].access_token);
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
    const params = { apiBaseUrl, importedId, headers };

    let getStudents: (p: typeof params) => Promise<unknown>;
    const lmsLower = lmsName.toLowerCase();
    if (lmsLower === 'canvas') {
      getStudents = getCanvasCourseStudents;
    } else if (lmsLower === 'brightspace') {
      getStudents = getBrightspaceCourseStudents;
    } else {
      getStudents = getBlackboardCourseStudents;
    }

    const parsed = await getStudents(params);
    const summary = `course_id=${courseId} lms_name=${lmsName} imported_id=${importedId} (NRPS)\n\nResponse:\n${JSON.stringify(parsed, null, 2)}`;
    return ok(summary);
  } catch (e) {
    return err(
      `lms_get_course_students failed: ${e instanceof Error ? e.message : String(e)}`,
      500
    );
  }
}

const handlers: Record<string, ToolHandler> = {
  lms_get_course_content: (args, request) => handleLmsGetCourseContent(args, request),
  lms_get_course_students: (args, request) => handleLmsGetCourseStudents(args, request),
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
