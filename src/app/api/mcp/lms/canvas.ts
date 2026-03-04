/**
 * Canvas LMS: get course content by fetching all modules, then items per module.
 * Canvas has no single "contents" endpoint; content is organized as modules and module items.
 */

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
    modulesWithItems.push({ module: mod, items });
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
