/**
 * Brightspace (D2L) LMS: get course content via Learn API contents endpoint (client-prefixed path).
 * Supports pagination via Next / nextPage and optional Items/Results arrays.
 * Returns only topic items (Type === 1), transformed to a consistent shape.
 */

/** D2L CONTENT_T: Module = 0, Topic = 1. We filter to topics only. */
const D2L_CONTENT_TYPE_TOPIC = 1;

export type GetCourseContentParams = {
  apiBaseUrl: string;
  importedId: string;
  headers: Record<string, string>;
};

type PaginatedContentResponse = {
  Next?: string | null;
  nextPage?: string | null;
  paging?: { nextPage?: string };
  Items?: unknown[];
  Results?: unknown[];
  [key: string]: unknown;
};

type D2LContentObject = {
  Type?: number;
  Id?: number;
  Title?: string;
  ShortTitle?: string;
  ParentModuleId?: number | null;
  Structure?: D2LContentObject[];
  TopicType?: number;
  Url?: string | null;
  ActivityId?: string | null;
  ActivityType?: number;
  [key: string]: unknown;
};

/** Extracted topic shape returned to callers. */
export type D2LTopicData = {
  Id: number | undefined;
  Title: string | undefined;
  ShortTitle: string | undefined;
  Type: number;
  ParentModuleId: number | null | undefined;
  TopicType: number | undefined;
  Url: string | null | undefined;
  ActivityId: string | null | undefined;
  ActivityType: number | undefined;
  [key: string]: unknown;
};

function isD2lTopic(content: unknown): content is D2LContentObject {
  if (!content || typeof content !== 'object') return false;
  const c = content as D2LContentObject;
  return c.Type === D2L_CONTENT_TYPE_TOPIC;
}

function extractD2lTopicData(content: D2LContentObject): D2LTopicData {
  return {
    Id: content.Id,
    Title: content.Title,
    ShortTitle: content.ShortTitle,
    Type: content.Type ?? D2L_CONTENT_TYPE_TOPIC,
    ParentModuleId: content.ParentModuleId,
    TopicType: content.TopicType,
    Url: content.Url,
    ActivityId: content.ActivityId,
    ActivityType: content.ActivityType,
  };
}

/** Flatten nested content tree (recursive=true) into a single list. */
function flattenContentList(items: unknown[]): D2LContentObject[] {
  const out: D2LContentObject[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const node = item as D2LContentObject;
    out.push(node);
    if (Array.isArray(node.Structure) && node.Structure.length > 0) {
      out.push(...flattenContentList(node.Structure));
    }
  }
  return out;
}

/** Filter to D2L topics only and transform to D2LTopicData. */
function filterAndTransformToTopics(items: unknown[]): D2LTopicData[] {
  const flat = flattenContentList(items);
  const topics: D2LTopicData[] = [];
  for (const content of flat) {
    if (isD2lTopic(content)) topics.push(extractD2lTopicData(content));
  }
  return topics;
}

async function fetchContentPage(
  url: string,
  headers: Record<string, string>
): Promise<{ body: unknown; nextUrl: string | undefined }> {
  const res = await fetch(url, { method: 'GET', headers });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Brightspace API ${res.status}: ${bodyText || res.statusText}`);
  }
  const body = bodyText ? (JSON.parse(bodyText) as PaginatedContentResponse) : null;
  const nextUrl =
    body && typeof body === 'object'
      ? body.Next ?? body.nextPage ?? body.paging?.nextPage ?? undefined
      : undefined;
  const next = typeof nextUrl === 'string' && nextUrl.trim() ? nextUrl.trim() : undefined;
  return { body, nextUrl: next };
}

function resolveNextUrl(next: string, apiBaseUrl: string): string {
  return next.startsWith('http')
    ? next
    : `${apiBaseUrl.replace(/\/$/, '')}${next.startsWith('/') ? '' : '/'}${next}`;
}

function getContentItemsFromResponse(body: unknown): unknown[] | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as PaginatedContentResponse;
  if (Array.isArray(b.Items)) return b.Items;
  if (Array.isArray(b.Results)) return b.Results;
  if (Array.isArray(body)) return body as unknown[];
  const node = body as D2LContentObject;
  if (Array.isArray(node.Structure)) return node.Structure;
  return null;
}

/** Get Brightspace course content (syllabus/contents) with recursive=true. Follows Next/nextPage until all pages are fetched. Returns only topic items (Type === 1) transformed to D2LTopicData. */
export async function getCourseContent(params: GetCourseContentParams): Promise<unknown> {
  const { apiBaseUrl, importedId, headers } = params;
  const url = `${apiBaseUrl}/client/learn/api/public/v1/courses/${encodeURIComponent(importedId)}/contents?recursive=true`;
  const { body, nextUrl: firstNext } = await fetchContentPage(url, headers);
  if (!body || typeof body !== 'object') return body;
  const paginated = body as PaginatedContentResponse;
  const itemsKey = Array.isArray(paginated.Items)
    ? 'Items'
    : Array.isArray(paginated.Results)
      ? 'Results'
      : null;
  let allItems: unknown[];
  if (itemsKey && firstNext) {
    allItems = [...(paginated[itemsKey] as unknown[])];
    let nextUrl: string | undefined = resolveNextUrl(firstNext, apiBaseUrl);
    while (nextUrl) {
      const { body: pageBody, nextUrl: next } = await fetchContentPage(nextUrl, headers);
      if (pageBody && typeof pageBody === 'object') {
        const page = pageBody as PaginatedContentResponse;
        const pageItems = Array.isArray(page.Items) ? page.Items : Array.isArray(page.Results) ? page.Results : [];
        allItems.push(...pageItems);
      }
      nextUrl = next ? resolveNextUrl(next, apiBaseUrl) : undefined;
    }
    const topics = filterAndTransformToTopics(allItems);
    return { ...paginated, [itemsKey]: topics, topics, Next: null, nextPage: null, paging: {} };
  }
  const singleItems = getContentItemsFromResponse(body);
  if (singleItems) {
    const topics = filterAndTransformToTopics(singleItems);
    if (Array.isArray(body)) return { topics };
    const b = body as Record<string, unknown>;
    if (Array.isArray(b.Items)) return { ...b, Items: topics, topics };
    if (Array.isArray(b.Results)) return { ...b, Results: topics, topics };
    return { ...b, topics };
  }
  return body;
}

export type GetCourseStudentsParams = {
  apiBaseUrl: string;
  importedId: string;
  headers: Record<string, string>;
  /** When true, exclude members with Instructor role (matches Python students_only). */
  studentsOnly?: boolean;
};

type NRPSMember = {
  user_id?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  roles?: (string | unknown)[];
  [key: string]: unknown;
};

/** Convert NRPS member to a consistent LMS user shape. */
function convertToLmsUser(member: NRPSMember): Record<string, unknown> | null {
  if (!member || typeof member !== 'object') return null;
  const roles = member.roles ?? [];
  const roleStrings = roles
    .filter((r): r is string => typeof r === 'string')
    .filter(Boolean);
  return {
    user_id: member.user_id ?? member.userId ?? null,
    name: (member.name ?? [member.given_name, member.family_name].filter(Boolean).join(' ')) || null,
    given_name: member.given_name ?? null,
    family_name: member.family_name ?? null,
    email: member.email ?? null,
    roles: roleStrings,
  };
}

/** True if member has Instructor role (exact or URI ending with #Instructor). */
function hasInstructorRole(member: NRPSMember): boolean {
  const roles = member.roles ?? [];
  return roles.some(
    (role) =>
      typeof role === 'string' &&
      (role === 'Instructor' || role.endsWith('#Instructor'))
  );
}

/** Get Brightspace course students (LTI Names & Roles / NRPS). Fetches members, optionally filters to students only (excludes Instructor), and returns a list of converted LMS users. */
export async function getCourseStudents(params: GetCourseStudentsParams): Promise<unknown> {
  const { apiBaseUrl, importedId, headers, studentsOnly = true } = params;
  const url = `${apiBaseUrl}/learn/api/v1/lti/external/namesandroles/${encodeURIComponent(importedId)}`;
  const res = await fetch(url, { method: 'GET', headers });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Brightspace NRPS API ${res.status}: ${bodyText || res.statusText}`);
  }
  const data = bodyText ? (JSON.parse(bodyText) as { members?: unknown[] }) : null;
  let members: NRPSMember[] = Array.isArray(data?.members) ? (data.members as NRPSMember[]) : [];
  if (!Array.isArray(members)) {
    members = [];
  }
  if (studentsOnly) {
    members = members.filter((m) => !hasInstructorRole(m));
  }
  const converted: Record<string, unknown>[] = [];
  for (const member of members) {
    const user = convertToLmsUser(member);
    if (user) converted.push(user);
  }
  return { members: converted };
}
