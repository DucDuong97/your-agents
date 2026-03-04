/**
 * Blackboard LMS: get course content via single Learn REST API contents endpoint.
 */

/** Content handler IDs that we pull from Blackboard (documents, files, links, assignments, etc.). */
const SUPPORTED_PULL_FROM_BLACKBOARD_CONTENT_TYPES = new Set([
  'resource/x-bb-document',
  'resource/x-bb-file',
  'resource/x-bb-externallink',
  'resource/x-bb-assignment',
  'resource/x-bb-asmt-test-link',
  'resource/x-bb-blti-link',
  'resource/x-bb-courselink',
  'resource/x-bb-forumlink',
]);

type BlackboardContentItem = {
  contentHandler?: { id?: string };
  [key: string]: unknown;
};

function isBlackboardModule(content: BlackboardContentItem): boolean {
  const handlerId = content?.contentHandler?.id ?? '';
  return handlerId === 'resource/x-bb-folder';
}

function filterCourseContentResults(results: unknown[]): unknown[] {
  return results.filter((item): item is BlackboardContentItem => {
    if (!item || typeof item !== 'object') return false;
    const content = item as BlackboardContentItem;
    if (isBlackboardModule(content)) return false;
    const handlerId = content.contentHandler?.id;
    return typeof handlerId === 'string' && SUPPORTED_PULL_FROM_BLACKBOARD_CONTENT_TYPES.has(handlerId);
  });
}

export type GetCourseContentParams = {
  apiBaseUrl: string;
  importedId: string;
  headers: Record<string, string>;
};

type PaginatedResponse = {
  results?: unknown[];
  paging?: { nextPage?: string };
};

async function fetchPage(
  url: string,
  headers: Record<string, string>
): Promise<{ body: unknown; nextPage: string | undefined }> {
  const res = await fetch(url, { method: 'GET', headers });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Blackboard API ${res.status}: ${bodyText || res.statusText}`);
  }
  const body = bodyText ? (JSON.parse(bodyText) as PaginatedResponse) : null;
  const nextPage = body && typeof body === 'object' && body.paging?.nextPage ? body.paging.nextPage : undefined;
  return { body, nextPage };
}

async function fetchAllPages(
  apiBaseUrl: string,
  initialUrl: string,
  headers: Record<string, string>
): Promise<unknown> {
  const { body, nextPage: firstNext } = await fetchPage(initialUrl, headers);
  if (!body || typeof body !== 'object') return body;
  const paginated = body as PaginatedResponse;
  if (!Array.isArray(paginated.results) || !firstNext) {
    return body;
  }
  const combined = [...paginated.results];
  const resolveUrl = (pathOrUrl: string) =>
    pathOrUrl.startsWith('http') ? pathOrUrl : `${apiBaseUrl.replace(/\/$/, '')}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
  let nextUrl: string = resolveUrl(firstNext);
  while (nextUrl) {
    const { body: pageBody, nextPage: next } = await fetchPage(nextUrl, headers);
    if (pageBody && typeof pageBody === 'object' && Array.isArray((pageBody as PaginatedResponse).results)) {
      combined.push(...(pageBody as PaginatedResponse).results!);
    }
    nextUrl = next ? resolveUrl(next) : '';
  }
  return { ...paginated, results: combined, paging: {} };
}

/** Get Blackboard course content (syllabus/contents) with recursive=true. Follows paging until all results are fetched. Returns only items that are not folder modules and whose contentHandler.id is in the supported pull types. */
export async function getCourseContent(params: GetCourseContentParams): Promise<unknown> {
  const { apiBaseUrl, importedId, headers } = params;
  const url = `${apiBaseUrl}/learn/api/public/v1/courses/${encodeURIComponent(importedId)}/contents?recursive=true`;
  const out = await fetchAllPages(apiBaseUrl, url, headers);
  if (out && typeof out === 'object' && Array.isArray((out as PaginatedResponse).results)) {
    const paginated = out as PaginatedResponse;
    return { ...paginated, results: filterCourseContentResults(paginated.results!) };
  }
  return out;
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
  userId?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  roles?: (string | unknown)[];
  [key: string]: unknown;
};

/** Convert NRPS member to a consistent LMS user shape (matches Python _convert_data_to_lms_user). */
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

/** Get Blackboard course students (LTI Names & Roles / NRPS). Fetches members, optionally filters to students only (excludes Instructor), and returns a list of converted LMS users (matches Python get_course_users). */
export async function getCourseStudents(params: GetCourseStudentsParams): Promise<unknown> {
  const { apiBaseUrl, importedId, headers, studentsOnly = false } = params;
  const url = `${apiBaseUrl}/learn/api/v1/lti/external/namesandroles/${encodeURIComponent(importedId)}`;
  const res = await fetch(url, { method: 'GET', headers });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Blackboard NRPS API ${res.status}: ${bodyText || res.statusText}`);
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
