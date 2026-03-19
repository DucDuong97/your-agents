/**
 * Canvas LMS: get course content by fetching all modules, then items per module.
 * Canvas has no single "contents" endpoint; content is organized as modules and module items.
 */

const CanvasModuleItemType = Object.freeze({
  PAGE: 'Page',
  FILE: 'File',
  EXTERNAL_URL: 'ExternalUrl',
  EXTERNAL_TOOL: 'ExternalTool',
  ASSIGNMENT: 'Assignment',
  UNKNOWN: 'Unknown',
  SUB_HEADER: 'SubHeader',
  DISCUSSION: 'Discussion',
  QUIZ: 'Quiz',
} as const);

type CanvasModuleItemTypeValue = (typeof CanvasModuleItemType)[keyof typeof CanvasModuleItemType];

const PluginType = Object.freeze({
  ASSIGNMENT: 'ASSIGNMENT',
  EXTERNAL_URL: 'EXTERNAL_URL',
} as const);

const CANVAS_MATHGPT_PLUGIN_TYPE_MAPPING: Partial<Record<CanvasModuleItemTypeValue, (typeof PluginType)[keyof typeof PluginType] | null>> =
  Object.freeze({
    [CanvasModuleItemType.ASSIGNMENT]: PluginType.ASSIGNMENT,
    [CanvasModuleItemType.EXTERNAL_TOOL]: null,
    [CanvasModuleItemType.EXTERNAL_URL]: PluginType.EXTERNAL_URL,
  });

function isKnownCanvasModuleItemType(value: unknown): value is CanvasModuleItemTypeValue {
  return typeof value === 'string' && Object.values(CanvasModuleItemType).includes(value as CanvasModuleItemTypeValue);
}

function toOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function toOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function requireField(raw: unknown, key: string): unknown {
  if (!raw || typeof raw !== 'object') throw new Error('Expected raw object');
  if (!(key in raw)) throw new Error(`Missing required field: ${key}`);
  return (raw as Record<string, unknown>)[key];
}

function convertCanvasModuleItemToLmsSchema(raw: unknown) {
  const id = toOptionalString(requireField(raw, 'id'));
  const moduleId = toOptionalString(requireField(raw, 'module_id'));
  const title = toOptionalString(requireField(raw, 'title'));
  const position = Number(requireField(raw, 'position'));
  const published = Boolean(requireField(raw, 'published'));
  const type = toOptionalString(requireField(raw, 'type'));

  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const contentId = toOptionalInt(obj.content_id);
  const contentUrl = toOptionalString(obj.page_url);

  return {
    id,
    module_id: moduleId,
    title,
    position,
    type:
      type && Object.prototype.hasOwnProperty.call(CANVAS_MATHGPT_PLUGIN_TYPE_MAPPING, type)
        ? (CANVAS_MATHGPT_PLUGIN_TYPE_MAPPING as Record<string, unknown>)[type]
        : null,
    is_published: published,
    content_url: contentUrl,
    content_id: contentId,
    lms_type: isKnownCanvasModuleItemType(type) ? type : CanvasModuleItemType.UNKNOWN,
  };
}

/** Fetch all pages of a Canvas API list endpoint; Canvas returns the array as the top-level JSON. */
async function fetchCanvasPaginated<T>(
  baseUrl: string,
  headers: Record<string, string>
): Promise<T[]> {
  const sep = baseUrl.includes('?') ? '&' : '?';
  const perPage = 100;
  let page = 1;
  const all: T[] = [];
  for (;;) {
    const url = `${baseUrl}${sep}per_page=${perPage}&page=${page}`;
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Canvas API ${res.status}: ${text || res.statusText}`);
    }
    const chunk = (await res.json()) as T[];
    if (!Array.isArray(chunk)) return all;
    all.push(...chunk);
    if (chunk.length < perPage) break;
    page += 1;
  }
  return all;
}

export type GetCourseContentParams = {
  apiBaseUrl: string;
  importedId: string;
  headers: Record<string, string>;
};

/** Get Canvas course content: all modules with their items. */
export async function getCourseContent(params: GetCourseContentParams): Promise<unknown> {
  const { apiBaseUrl, importedId, headers } = params;
  const coursePath = `/api/v1/courses/${encodeURIComponent(importedId)}`;
  const modules = await fetchCanvasPaginated<{ id: number; name: string; [k: string]: unknown }>(
    `${apiBaseUrl}${coursePath}/modules`,
    headers
  );
  const modulesWithItems: { module: unknown; items: unknown[] }[] = [];
  for (const mod of modules) {
    const items = await fetchCanvasPaginated<{ id: number; [k: string]: unknown }>(
      `${apiBaseUrl}${coursePath}/modules/${mod.id}/items`,
      headers
    );
    modulesWithItems.push({ module: mod, items: items.map(convertCanvasModuleItemToLmsSchema) });
  }
  return { modules: modulesWithItems };
}

export type GetCourseStudentsParams = {
  apiBaseUrl: string;
  importedId: string;
  headers: Record<string, string>;
  /** When true, filter to Learner role only (LTI NRPS role param). */
  studentsOnly?: boolean;
};

const LTI_LEARNER_ROLE = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner';

/** Parse Link header and return the URL for rel="next", or null. */
function getNextLinkUrl(linkHeader: string | null): string | null {
  if (!linkHeader?.trim()) return null;
  const entries = linkHeader.split(',').map((s) => s.trim());
  for (const entry of entries) {
    const parts = entry.split(';').map((p) => p.trim());
    let url: string | null = null;
    let isNext = false;
    for (const p of parts) {
      if (p.startsWith('<') && p.endsWith('>')) {
        url = p.slice(1, -1).trim();
      } else if (p.toLowerCase() === 'rel="next"') {
        isNext = true;
      }
    }
    if (isNext && url) return url;
  }
  return null;
}

/** Get Canvas course students via LTI Names and Roles (NRPS). Follows pagination and returns all members. */
export async function getCourseStudents(params: GetCourseStudentsParams): Promise<unknown> {
  const { apiBaseUrl, importedId, headers, studentsOnly = false } = params;

  async function fetchPage(
    pageUrl: string,
    members: unknown[]
  ): Promise<unknown[]> {
    const res = await fetch(pageUrl, { method: 'GET', headers });
    const bodyText = await res.text();
    if (!res.ok) {
      throw new Error(`Canvas NRPS API ${res.status}: ${bodyText || res.statusText}`);
    }
    const data = (bodyText ? JSON.parse(bodyText) : null) as { members?: unknown[] } | null;
    const pageMembers = Array.isArray(data?.members) ? data.members : [];
    const accumulated = [...members, ...pageMembers];

    const nextUrl = getNextLinkUrl(res.headers.get('Link'));
    if (nextUrl) {
      return fetchPage(nextUrl, accumulated);
    }
    return accumulated;
  }

  let url = `${apiBaseUrl}/api/lti/courses/${encodeURIComponent(importedId)}/names_and_roles`;
  if (studentsOnly) {
    url += `?role=${encodeURIComponent(LTI_LEARNER_ROLE)}`;
  }

  const members = await fetchPage(url, []);
  return { members };
}
